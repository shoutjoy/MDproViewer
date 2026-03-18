/**
 * sidebarAI - ScholarAI & SSPAI Core Logic (Portable Module)
 * Extracted from viewer-standalone.js
 *
 * Host app provides callbacks via window.SidebarAIConfig:
 *   callGemini, generateImage, getApiKey, getScholarAISystemInstruction,
 *   setScholarAISystemInstruction, getScholarAIModelId, setScholarAIModelId,
 *   getImageModelId, abortCurrentTask, setViewerContent, getViewerRenderedContent
 *
 * @example
 *   window.SidebarAIConfig = {
 *     host: window.opener,  // or null to use callbacks only
 *     callbacks: { callGemini, generateImage, ... }
 *   };
 */
(function () {
  'use strict';
  if (typeof window.__sidebarAILoaded !== 'undefined') return;
  window.__sidebarAILoaded = true;

  var __scholarAISelStart = null, __scholarAISelEnd = null, __scholarAICursorPos = null, __scholarAIResultFontSize = 13;
  var __scholarAIHistory = [];
  var __viewerSSPSeedImage = null, __viewerSSPResultImage = null, __viewerSSPRatio = '1:1';
  var __viewerSSPImgHistory = [];
  var LS_SSP_IMG_HISTORY = 'ss_viewer_ssp_img_history';
  var SSP_IMG_HISTORY_MAX = 10;
  var __viewerFsScale = 1, __viewerFsTx = 0, __viewerFsTy = 0;
  var __viewerFsStartX = 0, __viewerFsStartY = 0, __viewerFsStartTx = 0, __viewerFsStartTy = 0, __viewerFsDragging = false;
  var __viewerFsOnMove = null, __viewerFsOnUp = null;

  function getConfig() { return window.SidebarAIConfig || {}; }
  function getHost() { var c = getConfig(); return c.host || (typeof window.opener !== 'undefined' ? window.opener : null); }
  function invoke(name) {
    var c = getConfig();
    var args = Array.prototype.slice.call(arguments, 1);
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name].apply(null, args);
    var h = getHost();
    if (h && typeof h[name] === 'function') return h[name].apply(h, args);
    return undefined;
  }
  /** 콜백/호스트에서 함수 참조만 가져옴 (호출하지 않음). async API·setter 등에 필수 */
  function getCallback(name) {
    var c = getConfig();
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name];
    var h = getHost();
    if (h && typeof h[name] === 'function') return function () { return h[name].apply(h, arguments); };
    return undefined;
  }
  function invokeSync(name) {
    var c = getConfig();
    var args = Array.prototype.slice.call(arguments, 1);
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name].apply(null, args);
    var h = getHost();
    if (h && typeof h[name] === 'function') return h[name].apply(h, args);
    return undefined;
  }

  function getViewerMarkdownRoot() {
    return document.getElementById('viewer') || document.getElementById('page-content');
  }

  var __aiDocSelTimer = null;
  /** 보기(#viewer) 또는 편집(textarea)에서 선택한 텍스트 → ScholarAI 지문 + SSP 프롬프트 */
  function syncAiPanelsFromDocumentSelection() {
    var viewer = getViewerMarkdownRoot();
    var editTa = document.getElementById('viewer-edit-ta');
    var vp = document.getElementById('content-viewport');
    var isEdit = vp && vp.classList.contains('viewer-edit-active') && !vp.classList.contains('hidden');
    var taPassage = document.getElementById('scholar-ai-selected');
    var sspPrompt = document.getElementById('ssp-prompt');
    if (!taPassage && !sspPrompt) return;
    var text = '';
    var edStart, edEnd, fromEditor = false;
    if (isEdit && editTa) {
      var s = editTa.selectionStart, e = editTa.selectionEnd;
      if (s !== e) {
        text = editTa.value.slice(s, e).trim();
        if (text) {
          fromEditor = true;
          edStart = s;
          edEnd = e;
        }
      }
    }
    if (!text && viewer) {
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && viewer.contains(sel.anchorNode)) {
        var schBar = document.getElementById('scholar-ai-sidebar');
        var sspBar = document.getElementById('ssp-ai-sidebar');
        if (schBar && schBar.contains(sel.anchorNode)) return;
        if (sspBar && sspBar.contains(sel.anchorNode)) return;
        text = sel.toString().trim();
      }
    }
    if (!text) {
      if (taPassage && (window.__contentType || '') === 'summary' && (!taPassage.value || !String(taPassage.value).trim())) {
        taPassage.value = '텍스트를 선택하시면 자동입력됩니다(from 제작자 박중희 교수).';
      }
      return;
    }
    if (fromEditor) {
      __scholarAISelStart = edStart;
      __scholarAISelEnd = edEnd;
    } else {
      __scholarAISelStart = __scholarAISelEnd = null;
    }
    if (taPassage) taPassage.value = text;
    if (sspPrompt) sspPrompt.value = text;
  }

  function onAiGlobalSelectionChange() {
    clearTimeout(__aiDocSelTimer);
    __aiDocSelTimer = setTimeout(syncAiPanelsFromDocumentSelection, 90);
  }

  function toggleScholarAI() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      syncAiPanelsFromDocumentSelection();
      scholarAIInitResize();
      scholarAILoadPrePrompt();
      scholarAIInitModelSelect();
    } else {
      el.classList.remove('fullscreen');
      try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
    }
  }
  function scholarAIInitResize() {
    var handle = document.getElementById('scholar-ai-resize-handle');
    var sidebar = document.getElementById('scholar-ai-sidebar');
    if (!handle || !sidebar || !sidebar.classList.contains('open')) return;
    var minW = 280, maxW = Math.min(800, window.innerWidth - 200);
    var startX = 0, startW = 0;
    function onMove(e) {
      var w = startW + (startX - e.clientX);
      w = Math.max(minW, Math.min(maxW, w));
      sidebar.style.width = w + 'px';
      sidebar.style.minWidth = w + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.onmousedown = function (e) {
      if (sidebar.classList.contains('fullscreen')) return;
      e.preventDefault();
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };
  }
  function scholarAIShrink() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (el) {
      el.classList.remove('open');
      el.classList.remove('fullscreen');
    }
    try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
  }
  function toggleScholarAIPrePrompt() {
    var p = document.getElementById('scholar-ai-pre-prompt-panel');
    var btn = document.getElementById('sa-pre-prompt-btn');
    if (p) {
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', p.style.display !== 'none');
      scholarAILoadPrePrompt();
    }
  }
  function toggleScholarAIModelSelect() {
    var p = document.getElementById('scholar-ai-model-panel');
    var btn = document.getElementById('sa-model-btn');
    if (p) {
      var open = p.style.display === 'none' || !p.style.display;
      p.style.display = open ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', p.style.display !== 'none');
      scholarAIInitModelSelect();
      if (open && p.scrollIntoView) {
        requestAnimationFrame(function () {
          try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { p.scrollIntoView(true); }
        });
      }
    }
  }
  function scholarAILoadPrePrompt() {
    var el = document.getElementById('scholar-ai-pre-prompt-text');
    if (!el) return;
    var txt = invokeSync('getScholarAISystemInstruction') || '';
    el.value = txt || '';
    if (!el._scholarAISaveOnBlur) {
      el._scholarAISaveOnBlur = true;
      el.addEventListener('blur', function () {
        var setter = getCallback('setScholarAISystemInstruction');
        if (typeof setter === 'function') setter(el.value || '');
      });
    }
  }
  function scholarAIInitModelSelect() {
    var sel = document.getElementById('scholar-ai-model-select');
    var getter = getCallback('getScholarAIModelId');
    if (!sel) return;
    try {
      sel.value = (getter && typeof getter === 'function' ? getter() : null) || 'gemini-2.5-pro';
    } catch (e) {
      sel.value = 'gemini-2.5-pro';
    }
    sel.onchange = function () {
      var setter = getCallback('setScholarAIModelId');
      if (typeof setter === 'function') setter(sel.value);
    };
  }
  function scholarAIFullscreen() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (el) el.classList.toggle('fullscreen');
  }
  function scholarAISyncSelection() {
    syncAiPanelsFromDocumentSelection();
  }
  function scholarAIHistorySave() {
    try { localStorage.setItem('ss_viewer_scholar_ai_history', JSON.stringify(__scholarAIHistory)); } catch (e) {}
  }
  function scholarAIHistoryAdd(promptSnippet, resultText) {
    __scholarAIHistory.unshift({ id: Date.now(), prompt: promptSnippet || '', result: resultText || '', at: new Date().toISOString() });
    scholarAIHistorySave();
  }
  function scholarAIHistoryRender() {
    var list = document.getElementById('scholar-ai-history-list');
    var search = document.getElementById('scholar-ai-history-search');
    var q = (search && search.value) || '';
    q = q.trim().toLowerCase();
    var items = q ? __scholarAIHistory.filter(function (h) { return (h.prompt + ' ' + h.result).toLowerCase().indexOf(q) >= 0; }) : __scholarAIHistory;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var idx = __scholarAIHistory.indexOf(items[i]);
      var raw = items[i].prompt || items[i].result || '(빈 항목)';
      var lbl = raw.replace(/</g, '&lt;').substring(0, 36) + (raw.length > 36 ? '…' : '');
      html += '<div class="scholar-ai-history-item" data-idx="' + idx + '"><span class="sa-h-label" onclick="scholarAIHistoryShowResult(' + idx + ')" title="결과창에 표시">' + lbl.replace(/'/g, "\\'") + '</span><button type="button" class="sa-h-save" onclick="scholarAIHistorySaveMd(' + idx + ')" title="MD 저장">저장</button><button type="button" class="sa-h-del" onclick="scholarAIHistoryDelete(' + idx + ')" title="삭제">×</button></div>';
    }
    if (list) list.innerHTML = html || '<span style="font-size:11px;color:#94a3b8">실행한 결과가 여기 쌓입니다.</span>';
  }
  function scholarAIHistoryShowResult(idx) {
    var h = __scholarAIHistory[idx];
    if (!h) return;
    var el = document.getElementById('scholar-ai-result');
    if (el) el.value = h.result;
  }
  function scholarAIHistoryDelete(idx) {
    __scholarAIHistory.splice(idx, 1);
    scholarAIHistorySave();
    scholarAIHistoryRender();
  }
  function scholarAIHistorySaveMd(idx) {
    var h = __scholarAIHistory[idx];
    if (!h || !h.result) { alert('저장할 내용이 없습니다.'); return; }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(h.result);
    a.download = 'ScholarAI_' + (h.at || '').slice(0, 10) + '_' + idx + '.md';
    a.click();
  }
  function scholarAIHistorySaveAll() {
    if (__scholarAIHistory.length === 0) { alert('저장할 히스토리가 없습니다.'); return; }
    var parts = [];
    for (var i = 0; i < __scholarAIHistory.length; i++) {
      var h = __scholarAIHistory[i];
      parts.push('## ' + (i + 1) + '. ' + (h.at || '').slice(0, 19) + '\n\n' + (h.prompt ? '**질문/지시:** ' + h.prompt + '\n\n' : '') + h.result);
    }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(parts.join('\n\n---\n\n'));
    a.download = 'ScholarAI_히스토리_전체_' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    alert('전체 ' + __scholarAIHistory.length + '건이 하나의 MD 파일로 저장되었습니다.');
  }
  async function scholarAIRun() {
    var sel = document.getElementById('scholar-ai-selected');
    var promptEl = document.getElementById('scholar-ai-prompt');
    var resultEl = document.getElementById('scholar-ai-result');
    var passage = (sel && sel.value) ? sel.value.trim() : '';
    var userQ = (promptEl && promptEl.value) ? promptEl.value.trim() : '';
    if (!passage) { alert('문서에서 텍스트를 선택한 뒤 실행하세요.'); return; }
    var callGemini = getCallback('callGemini');
    if (typeof callGemini !== 'function') { alert('메인 창을 찾을 수 없거나 API를 사용할 수 없습니다.'); return; }
    if (resultEl) resultEl.value = '처리 중...';
    try {
      var fullPrompt = passage + '\n\n사용자 질문 또는 지시: ' + (userQ || '위 지문을 요약하거나 핵심을 설명해 주세요.');
      var sys = invokeSync('getScholarAISystemInstruction') || 'You are a scholarly assistant. Answer concisely in Korean based on the given passage. If the user asks a question, answer it; otherwise summarize or explain the passage. 인용정보는 연구자의 연구의 인용정보, 연구자(연도)를 표시해주고 APA형식의 reference를 줘';
      var modelId = invokeSync('getScholarAIModelId') || null;
      var res = await callGemini(fullPrompt, sys, false, modelId);
      var text = res && res.text ? res.text : (res || '');
      if (resultEl) resultEl.value = typeof text === 'string' ? text : JSON.stringify(text);
      scholarAIHistoryAdd(userQ || passage.substring(0, 80), resultEl ? resultEl.value : '');
      scholarAIHistoryRender();
    } catch (e) {
      if (resultEl) resultEl.value = '오류: ' + (e.message || e);
    }
  }
  function scholarAICopyResult() {
    var el = document.getElementById('scholar-ai-result');
    if (el && el.value) {
      navigator.clipboard.writeText(el.value).then(function () { alert('결과가 복사되었습니다.'); }).catch(function () { alert('복사 실패'); });
    } else {
      alert('복사할 결과가 없습니다.');
    }
  }
  function scholarAIClearResult() {
    var el = document.getElementById('scholar-ai-result');
    if (el) el.value = '';
  }
  function scholarAIResultFont(delta) {
    var el = document.getElementById('scholar-ai-result');
    if (!el) return;
    __scholarAIResultFontSize = Math.max(10, Math.min(24, __scholarAIResultFontSize + delta));
    el.style.fontSize = __scholarAIResultFontSize + 'px';
  }
  function scholarAIResultZoomOpen() {
    var resultEl = document.getElementById('scholar-ai-result');
    var overlay = document.getElementById('scholar-ai-result-zoom-overlay');
    var zoomTa = document.getElementById('scholar-ai-result-zoom-ta');
    if (!resultEl || !overlay || !zoomTa) return;
    zoomTa.value = resultEl.value || '';
    overlay.classList.add('open');
    zoomTa.focus();
    function onEsc(e) {
      if (e.key === 'Escape') {
        scholarAIResultZoomClose();
        document.removeEventListener('keydown', onEsc);
      }
    }
    document.addEventListener('keydown', onEsc);
    overlay._zoomEsc = onEsc;
  }
  function scholarAIResultZoomClose() {
    var overlay = document.getElementById('scholar-ai-result-zoom-overlay');
    if (overlay && overlay._zoomEsc) {
      document.removeEventListener('keydown', overlay._zoomEsc);
      overlay._zoomEsc = null;
    }
    var resultEl = document.getElementById('scholar-ai-result');
    var zoomTa = document.getElementById('scholar-ai-result-zoom-ta');
    if (resultEl && zoomTa) resultEl.value = zoomTa.value;
    if (overlay) overlay.classList.remove('open');
  }
  function scholarAIPromptWrapInitResize() {
    var handle = document.getElementById('scholar-ai-prompt-resize-handle');
    var wrap = document.getElementById('scholar-ai-prompt-wrap');
    if (!handle || !wrap) return;
    var minH = 80;
    var maxH = 300;
    var startY = 0;
    var startH = 0;
    function onMove(e) {
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function scholarAIResultWrapInitResize() {
    var handle = document.getElementById('scholar-ai-result-resize-handle');
    var wrap = document.getElementById('scholar-ai-result-wrap');
    if (!handle || !wrap) return;
    var minH = 160;
    var maxH = 600;
    var startY = 0;
    var startH = 0;
    function onMove(e) {
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function handleScholarAIInsertClick() {
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    if (!isEdit) { alert('편집창으로 전환합니다'); if (viewerSwitchToEdit) viewerSwitchToEdit(); return; }
    var ta = document.getElementById('viewer-edit-ta');
    if (ta) __scholarAICursorPos = ta.selectionStart;
    toggleScholarAIInsertMenu();
  }
  function toggleScholarAIInsertMenu() {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m) m.classList.toggle('open');
  }
  function closeScholarAIInsertMenu() {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m) m.classList.remove('open');
  }
  function scholarAIInsertDoc(mode) {
    var resultEl = document.getElementById('scholar-ai-result');
    var resultText = resultEl && resultEl.value ? resultEl.value.trim() : '';
    if (!resultText) { alert('삽입할 결과가 없습니다.'); return; }
    var ta = document.getElementById('viewer-edit-ta');
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};
    if (!isEdit || !ta) {
      var vp = document.getElementById('content-viewport');
      var wrap = document.getElementById('viewer-edit-wrap');
      if (vp) vp.classList.add('viewer-edit-active');
      if (wrap) wrap.style.display = 'flex';
      ta = document.getElementById('viewer-edit-ta');
      if (ta) { ta.value = window.__rawText || ''; ta.style.display = 'block'; }
      var eb = document.getElementById('viewer-btn-edit');
      var vb = document.getElementById('viewer-btn-view');
      if (eb) eb.style.display = 'none';
      if (vb) vb.style.display = 'inline-block';
      if (viewerBuildNav) viewerBuildNav();
    }
    ta = document.getElementById('viewer-edit-ta');
    if (!ta) return;
    var start, end, raw = ta.value;
    if (mode === 0) {
      start = end = (__scholarAICursorPos != null ? __scholarAICursorPos : ta.selectionStart);
    } else if (__scholarAISelStart != null && __scholarAISelEnd != null) {
      start = __scholarAISelStart;
      end = __scholarAISelEnd;
    } else {
      var selTa = document.getElementById('scholar-ai-selected');
      var selText = (selTa && selTa.value) ? selTa.value.trim() : '';
      var idx = selText ? raw.indexOf(selText) : -1;
      if (idx >= 0) { start = idx; end = idx + selText.length; } else { start = ta.selectionStart; end = ta.selectionEnd; }
    }
    var before = raw.slice(0, start);
    var after = raw.slice(end);
    var newVal = mode === 1 ? before + raw.slice(start, end) + '\n\n' + resultText + after : before + resultText + after;
    ta.value = newVal;
    window.__rawText = newVal;
    var insertEnd = mode === 1 ? start + (end - start) + 2 + resultText.length : start + resultText.length;
    __scholarAICursorPos = insertEnd;
    ta.focus();
    ta.setSelectionRange(insertEnd, insertEnd);
    var lines = (ta.value.substring(0, insertEnd).match(/\n/g) || []).length;
    var lineHeight = parseInt(getComputedStyle(ta).lineHeight, 10) || 20;
    ta.scrollTop = Math.max(0, lines * lineHeight - ta.clientHeight / 2);
  }

  function toggleViewerSSP() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      syncAiPanelsFromDocumentSelection();
      viewerSSPInit();
    } else {
      try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
    }
  }
  function sspAIShrink() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (el) el.classList.remove('open');
    try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
  }
  function viewerSSPSyncSelection() {
    syncAiPanelsFromDocumentSelection();
  }
  function viewerSSPSetUploadZoneContent(dataURL) {
    var uploadZone = document.getElementById('ssp-upload-zone');
    if (!uploadZone) return;
    if (dataURL) {
      uploadZone.innerHTML = '<div class="ssp-seed-loaded"><img src="' + dataURL.replace(/"/g, '&quot;') + '" onclick="viewerSSPOpenFullscreen(this.src); event.stopPropagation()" title="클릭하면 크게 보기"><div class="ssp-seed-actions"><button type="button" class="sa-btn ghost" onclick="viewerSSPClearSeed(); event.stopPropagation()">시드이미지 지우기</button></div><small style="display:block;margin-top:4px;color:#94a3b8">클릭하여 변경</small></div>';
    } else {
      uploadZone.innerHTML = '이미지 업로드 (JPG, PNG, GIF, WebP)<br><small>또는 Ctrl+V 붙여넣기</small>';
    }
  }
  function viewerSSPClearSeed() {
    __viewerSSPSeedImage = null;
    viewerSSPSetUploadZoneContent(null);
  }
  function viewerSSPFsApply() {
    var wrap = document.getElementById('viewer-fs-wrap');
    var val = document.getElementById('viewer-fs-zoom-val');
    if (wrap) wrap.style.transform = 'translate(' + __viewerFsTx + 'px,' + __viewerFsTy + 'px) scale(' + __viewerFsScale + ')';
    if (val) val.textContent = Math.round(__viewerFsScale * 100) + '%';
  }
  function viewerSSPFsZoom(d) {
    __viewerFsScale = Math.max(0.25, Math.min(4, __viewerFsScale + d));
    viewerSSPFsApply();
  }
  function viewerSSPFsDownload() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var dataURL = img.src;
    if (dataURL.indexOf('data:') === 0) {
      try {
        var arr = dataURL.split(',');
        var mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
        var bstr = atob(arr[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        var blob = new Blob([u8arr], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'image_' + Date.now() + '.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 200);
      } catch (e) {
        var a = document.createElement('a');
        a.href = dataURL;
        a.download = 'image_' + Date.now() + '.png';
        a.click();
      }
    } else {
      var a = document.createElement('a');
      a.href = dataURL;
      a.download = 'image_' + Date.now() + '.png';
      a.click();
    }
  }
  function viewerSSPFsInsert() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var h = getHost();
    if (h) try { h.postMessage({ type: 'imgViewerInsert', dataURL: img.src }, '*'); } catch (e) {}
  }
  function viewerSSPFsCrop() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var c = getConfig();
    var base = (c.cropEditorBase != null) ? c.cropEditorBase : (function () {
      try {
        var href = (getHost() && getHost().location && getHost().location.href) ? getHost().location.href : window.location.href;
        if (href && href.indexOf('http') === 0) {
          var i = href.lastIndexOf('/');
          return i >= 0 ? href.substring(0, i + 1) : href + '/';
        }
      } catch (e) {}
      return './';
    })();
    var cropWin = window.open(base + 'crop-editor.html', '_blank', 'width=920,height=720,resizable=yes,scrollbars=yes');
    if (!cropWin) return;
    viewerSSPCloseFullscreen();
    var sendImage = function () {
      try {
        if (cropWin && !cropWin.closed && cropWin.postMessage) {
          cropWin.postMessage({ type: 'cropEditorSetImage', dataURL: img.src }, '*');
        }
      } catch (e) {}
    };
    window.addEventListener('message', function onCropReady(ev) {
      if (ev.data && ev.data.type === 'cropEditorReady' && ev.source === cropWin) {
        window.removeEventListener('message', onCropReady);
        sendImage();
      }
    });
    setTimeout(sendImage, 300);
  }
  function viewerSSPCloseFullscreen() {
    var overlay = document.getElementById('viewer-fs-overlay');
    if (overlay) overlay.classList.remove('open');
    if (__viewerFsOnMove) document.removeEventListener('mousemove', __viewerFsOnMove);
    if (__viewerFsOnUp) document.removeEventListener('mouseup', __viewerFsOnUp);
  }
  function viewerSSPOpenFullscreen(dataURL) {
    if (!dataURL) return;
    var overlay = document.getElementById('viewer-fs-overlay');
    var img = document.getElementById('viewer-fs-img');
    if (!overlay || !img) return;
    img.src = dataURL;
    __viewerFsScale = 1;
    __viewerFsTx = 0;
    __viewerFsTy = 0;
    viewerSSPFsApply();
    overlay.classList.add('open');
    var area = document.getElementById('viewer-fs-area');
    __viewerFsOnMove = function (e) {
      if (!__viewerFsDragging) return;
      __viewerFsTx = __viewerFsStartTx + e.clientX - __viewerFsStartX;
      __viewerFsTy = __viewerFsStartTy + e.clientY - __viewerFsStartY;
      viewerSSPFsApply();
    };
    __viewerFsOnUp = function () {
      __viewerFsDragging = false;
      document.removeEventListener('mousemove', __viewerFsOnMove);
      document.removeEventListener('mouseup', __viewerFsOnUp);
    };
    if (area) {
      area.onmousedown = function (e) {
        if (e.button !== 0) return;
        __viewerFsDragging = true;
        __viewerFsStartX = e.clientX;
        __viewerFsStartY = e.clientY;
        __viewerFsStartTx = __viewerFsTx;
        __viewerFsStartTy = __viewerFsTy;
        document.addEventListener('mousemove', __viewerFsOnMove);
        document.addEventListener('mouseup', __viewerFsOnUp);
      };
    }
  }
  function viewerSSPAbort() {
    var fn = getCallback('abortCurrentTask');
    if (typeof fn === 'function') try { fn(); } catch (e) {}
  }
  function viewerSSPInit() {
    var fileInput = document.getElementById('ssp-file-input');
    var uploadZone = document.getElementById('ssp-upload-zone');
    if (fileInput) {
      fileInput.onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) {
          var r = new FileReader();
          r.onload = function () {
            __viewerSSPSeedImage = r.result;
            viewerSSPSetUploadZoneContent(r.result);
          };
          r.readAsDataURL(f);
        }
        fileInput.value = '';
      };
    }
    if (uploadZone) {
      uploadZone.ondragover = function (e) { e.preventDefault(); uploadZone.style.borderColor = '#f59e0b'; };
      uploadZone.ondragleave = function () { uploadZone.style.borderColor = ''; };
      uploadZone.ondrop = function (e) {
        e.preventDefault();
        uploadZone.style.borderColor = '';
        var f = e.dataTransfer.files[0];
        if (f && f.type.indexOf('image') >= 0) {
          var r = new FileReader();
          r.onload = function () {
            __viewerSSPSeedImage = r.result;
            viewerSSPSetUploadZoneContent(r.result);
          };
          r.readAsDataURL(f);
        }
      };
    }
    if (!window.__viewerSSPPasteInit) {
      window.__viewerSSPPasteInit = true;
      document.addEventListener('paste', function (e) {
        var sb = document.getElementById('ssp-ai-sidebar');
        if (!sb || !sb.classList.contains('open')) return;
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') >= 0) {
            var f = items[i].getAsFile();
            if (f) {
              var r = new FileReader();
              r.onload = function () {
                __viewerSSPSeedImage = r.result;
                viewerSSPSetUploadZoneContent(r.result);
              };
              r.readAsDataURL(f);
              e.preventDefault();
              break;
            }
          }
        }
      });
    }
    document.querySelectorAll('.ssp-ratio-btn').forEach(function (b) {
      b.onclick = function () {
        __viewerSSPRatio = this.getAttribute('data-ratio') || '1:1';
        document.querySelectorAll('.ssp-ratio-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      };
    });
    var modelSel = document.getElementById('ssp-model');
    var getImgModel = getCallback('getImageModelId');
    if (modelSel && typeof getImgModel === 'function') {
      try { modelSel.value = getImgModel() || 'gemini-3.1-flash-image-preview'; } catch (e) {}
    }
    viewerSSPImgHistoryLoad();
    viewerSSPImgHistoryRender();
  }
  async function viewerSSPGenerate() {
    var promptEl = document.getElementById('ssp-prompt');
    var promptEl2 = document.getElementById('ssp-prompt-2');
    var p1 = promptEl && promptEl.value ? promptEl.value.trim() : '';
    var p2 = promptEl2 && promptEl2.value ? promptEl2.value.trim() : '';
    var prompt = [p1, p2].filter(Boolean).join('\n\n');
    var seedImage = __viewerSSPSeedImage;
    var hasSeed = seedImage && typeof seedImage === 'string' && seedImage.indexOf('data:image') === 0;
    if (!hasSeed && !prompt) { alert('이미지를 올리거나 프롬프트를 입력하세요.'); return; }
    var generateImage = getCallback('generateImage');
    if (typeof generateImage !== 'function') { alert('메인 창을 찾을 수 없거나 이미지 API를 사용할 수 없습니다.'); return; }
    var statusEl = document.getElementById('ssp-status');
    var resultImg = document.getElementById('ssp-result-img');
    var downloadBtn = document.getElementById('ssp-download-btn');
    var progressWrap = document.getElementById('ssp-progress-wrap');
    var progressFill = document.getElementById('ssp-progress-fill');
    var progressPct = document.getElementById('ssp-progress-pct');
    var modelSel = document.getElementById('ssp-model');
    var modelId = modelSel ? modelSel.value : 'gemini-3.1-flash-image-preview';
    var noText = document.getElementById('ssp-no-text') && document.getElementById('ssp-no-text').checked;
    var h = getHost();
    if (h && h._aiTaskCancelled !== undefined) h._aiTaskCancelled = false;
    if (progressWrap) { progressWrap.classList.add('visible'); progressWrap.style.display = 'flex'; }
    if (progressFill) progressFill.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (statusEl) statusEl.textContent = 'AI 이미지 생성 중...';
    var progressInterval = null;
    var progressVal = 0;
    var progressMax = 95;
    var progressStep = 2;
    var progressMs = 800;
    progressInterval = setInterval(function () {
      progressVal = Math.min(progressMax, progressVal + progressStep);
      if (progressFill) progressFill.style.width = progressVal + '%';
      if (progressPct) progressPct.textContent = progressVal + '%';
      if (progressVal >= progressMax) clearInterval(progressInterval);
    }, progressMs);
    try {
      var dataURL = await generateImage(prompt, { seedImage: hasSeed ? seedImage : null, modelId: modelId, aspectRatio: __viewerSSPRatio, noText: noText });
      clearInterval(progressInterval);
      if (progressFill) progressFill.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      if (progressWrap) setTimeout(function () { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }, 500);
      if (dataURL) {
        __viewerSSPResultImage = dataURL;
        if (resultImg) { resultImg.src = dataURL; resultImg.style.display = 'block'; resultImg.title = '클릭하면 크게 보기'; }
        if (downloadBtn) downloadBtn.disabled = false;
        if (statusEl) statusEl.textContent = '✅ 생성 완료!';
        viewerSSPImgHistoryAdd(dataURL, prompt);
      } else {
        if (statusEl) statusEl.textContent = '❌ 생성 실패';
      }
    } catch (e) {
      clearInterval(progressInterval);
      if (progressWrap) { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }
      if (statusEl) statusEl.textContent = (e && e.name === 'AbortError') ? '⏹ 생성 중지됨' : '❌ 오류: ' + (e.message || e);
    }
  }
  function viewerSSPDownload() {
    if (!__viewerSSPResultImage) { alert('다운로드할 이미지가 없습니다.'); return; }
    var a = document.createElement('a');
    a.href = __viewerSSPResultImage;
    a.download = 'ssp_image_' + Date.now() + '.png';
    a.click();
  }
  function viewerSSPImgHistoryLoad() {
    try {
      var raw = localStorage.getItem(LS_SSP_IMG_HISTORY);
      if (raw) __viewerSSPImgHistory = JSON.parse(raw);
      else __viewerSSPImgHistory = [];
    } catch (e) { __viewerSSPImgHistory = []; }
  }
  function viewerSSPImgHistorySave() {
    try { localStorage.setItem(LS_SSP_IMG_HISTORY, JSON.stringify(__viewerSSPImgHistory)); } catch (e) {}
  }
  function viewerSSPImgHistoryAdd(dataURL, prompt) {
    if (!dataURL) return;
    var entry = { id: 'sspih_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9), dataURL: dataURL, prompt: (prompt || '').substring(0, 80), createdAt: new Date().toISOString() };
    __viewerSSPImgHistory.unshift(entry);
    if (__viewerSSPImgHistory.length > SSP_IMG_HISTORY_MAX) __viewerSSPImgHistory = __viewerSSPImgHistory.slice(0, SSP_IMG_HISTORY_MAX);
    viewerSSPImgHistorySave();
    viewerSSPImgHistoryRender();
  }
  function viewerSSPImgHistoryRemove(id) {
    __viewerSSPImgHistory = __viewerSSPImgHistory.filter(function (h) { return h.id !== id; });
    viewerSSPImgHistorySave();
    viewerSSPImgHistoryRender();
  }
  function viewerSSPImgHistoryRender() {
    var list = document.getElementById('ssp-img-history-list');
    if (!list) return;
    if (__viewerSSPImgHistory.length === 0) { list.innerHTML = '<span style="font-size:10px;color:#94a3b8">생성된 이미지가 여기 쌓입니다.</span>'; return; }
    var html = '';
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      var h = __viewerSSPImgHistory[i];
      var lbl = (h.prompt || '(프롬프트 없음)').replace(/</g, '&lt;').substring(0, 30) + ((h.prompt || '').length > 30 ? '…' : '');
      html += '<div class="ssp-img-history-item" data-id="' + h.id + '">';
      html += '<img src="' + (h.dataURL || '').replace(/"/g, '&quot;') + '" onclick="viewerSSPOpenFullscreen(this.src); event.stopPropagation()" title="클릭하면 크게 보기">';
      html += '<span class="ssp-h-label">' + lbl + '</span>';
      html += '<button type="button" class="ssp-h-del" onclick="viewerSSPImgHistoryRemove(\'' + h.id + '\'); event.stopPropagation()" title="삭제">×</button>';
      html += '</div>';
    }
    list.innerHTML = html;
  }

  window.toggleScholarAI = toggleScholarAI;
  window.scholarAIInitResize = scholarAIInitResize;
  window.scholarAIShrink = scholarAIShrink;
  window.toggleScholarAIPrePrompt = toggleScholarAIPrePrompt;
  window.toggleScholarAIModelSelect = toggleScholarAIModelSelect;
  window.scholarAIFullscreen = scholarAIFullscreen;
  window.scholarAISyncSelection = scholarAISyncSelection;
  window.scholarAIHistoryAdd = scholarAIHistoryAdd;
  window.scholarAIHistoryRender = scholarAIHistoryRender;
  window.scholarAIHistoryShowResult = scholarAIHistoryShowResult;
  window.scholarAIHistoryDelete = scholarAIHistoryDelete;
  window.scholarAIHistorySaveMd = scholarAIHistorySaveMd;
  window.scholarAIHistorySaveAll = scholarAIHistorySaveAll;
  window.scholarAIRun = scholarAIRun;
  window.scholarAICopyResult = scholarAICopyResult;
  window.scholarAIClearResult = scholarAIClearResult;
  window.scholarAIResultFont = scholarAIResultFont;
  window.scholarAIResultZoomOpen = scholarAIResultZoomOpen;
  window.scholarAIResultZoomClose = scholarAIResultZoomClose;
  window.handleScholarAIInsertClick = handleScholarAIInsertClick;
  window.toggleScholarAIInsertMenu = toggleScholarAIInsertMenu;
  window.closeScholarAIInsertMenu = closeScholarAIInsertMenu;
  window.scholarAIInsertDoc = scholarAIInsertDoc;
  window.toggleViewerSSP = toggleViewerSSP;
  window.sspAIShrink = sspAIShrink;
  window.viewerSSPSyncSelection = viewerSSPSyncSelection;
  window.viewerSSPInit = viewerSSPInit;
  window.viewerSSPGenerate = viewerSSPGenerate;
  window.viewerSSPDownload = viewerSSPDownload;
  window.viewerSSPClearSeed = viewerSSPClearSeed;
  window.viewerSSPOpenFullscreen = viewerSSPOpenFullscreen;
  window.viewerSSPCloseFullscreen = viewerSSPCloseFullscreen;
  window.viewerSSPImgHistoryRemove = viewerSSPImgHistoryRemove;
  window.viewerSSPAbort = viewerSSPAbort;
  window.viewerSSPFsZoom = viewerSSPFsZoom;
  window.viewerSSPFsDownload = viewerSSPFsDownload;
  window.viewerSSPFsInsert = viewerSSPFsInsert;
  window.viewerSSPFsCrop = viewerSSPFsCrop;

  window.sidebarAIInit = function () {
    scholarAIPromptWrapInitResize();
    scholarAIResultWrapInitResize();
    scholarAIHistoryRender();
    var resTa = document.getElementById('scholar-ai-result');
    if (resTa) resTa.style.fontSize = __scholarAIResultFontSize + 'px';
    var histSearch = document.getElementById('scholar-ai-history-search');
    if (histSearch) histSearch.addEventListener('input', scholarAIHistoryRender);
    /* 기존 앱에서 가져온 ScholarAI 히스토리 캐시 삭제 (한 번만 실행) */
    try {
      var SA_CLEAR_FLAG = 'ss_viewer_scholar_ai_history_cleared_v1';
      if (!localStorage.getItem(SA_CLEAR_FLAG)) {
        localStorage.removeItem('ss_viewer_scholar_ai_history');
        __scholarAIHistory = [];
        localStorage.setItem(SA_CLEAR_FLAG, '1');
      } else {
        var saved = localStorage.getItem('ss_viewer_scholar_ai_history');
        if (saved) {
          var arr = JSON.parse(saved);
          if (Array.isArray(arr) && arr.length) __scholarAIHistory = arr;
        }
      }
    } catch (e) {}
    if (!window.__aiDocSelectionBound) {
      window.__aiDocSelectionBound = true;
      document.addEventListener('selectionchange', onAiGlobalSelectionChange);
    }
    var vc = document.getElementById('viewer-container');
    if (vc && !vc.__aiMouseupSel) {
      vc.__aiMouseupSel = true;
      vc.addEventListener('mouseup', function () { setTimeout(syncAiPanelsFromDocumentSelection, 50); });
    }
    var editTa = document.getElementById('viewer-edit-ta');
    if (editTa && !editTa.__aiSelUp) {
      editTa.__aiSelUp = true;
      editTa.addEventListener('mouseup', function () { setTimeout(syncAiPanelsFromDocumentSelection, 50); });
      editTa.addEventListener('keyup', function (e) {
        if (e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') setTimeout(syncAiPanelsFromDocumentSelection, 50);
      });
    }
  };

  document.addEventListener('click', function (e) {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m && m.classList.contains('open') && !m.contains(e.target) && !e.target.onclick) {
      var wrap = document.querySelector('.scholar-ai-insert-wrap');
      if (wrap && !wrap.contains(e.target)) m.classList.remove('open');
    }
  });
})();

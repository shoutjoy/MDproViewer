(function (global) {
  'use strict';

  var refs = [];
  var selectedIds = new Set();
  var inputMode = 'blank';
  var initialized = false;
  var deps = { dbGetter: null, getEditor: null, showToast: null };

  function toast(msg) {
    if (typeof deps.showToast === 'function') deps.showToast(msg);
  }

  function q(id) { return document.getElementById(id); }

  function getDb() {
    return typeof deps.dbGetter === 'function' ? deps.dbGetter() : null;
  }

  function nowIso() { return new Date().toISOString(); }

  function safeText(v) { return String(v || '').trim(); }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripHtmlTags(v) {
    return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeRefText(v) {
    return safeText(v).replace(/\s+/g, ' ').toLowerCase();
  }

  function anchorFromRefText(text) {
    var raw = safeText(text).toLowerCase();
    var slug = raw.replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    if (!slug) slug = 'ref';
    var hash = 0;
    for (var i = 0; i < raw.length; i++) hash = ((hash * 31) + raw.charCodeAt(i)) >>> 0;
    return 'schref-' + slug + '-' + hash.toString(16);
  }

  function parseAuthorYear(text) {
    var raw = safeText(text);
    var yearMatch = raw.match(/(19|20)\d{2}/);
    var year = yearMatch ? yearMatch[0] : 'n.d.';
    var firstPart = raw.split(/[.]/)[0] || raw;
    firstPart = firstPart.replace(/\([^)]*\)/g, '').trim();
    if (!firstPart) firstPart = 'Unknown';
    return { author: firstPart, year: year };
  }

  function buildLabel(item) {
    var ay = parseAuthorYear(item.text);
    return ay.author + ', ' + ay.year;
  }

  async function readAllRefs() {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) return [];
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readonly');
        var req = tx.objectStore('scholar_refs').getAll();
        req.onsuccess = function () {
          var out = Array.isArray(req.result) ? req.result : [];
          out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
          resolve(out);
        };
        req.onerror = function () { reject(req.error || new Error('Failed to load references')); };
      } catch (e) { reject(e); }
    });
  }

  async function addRefs(items) {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) throw new Error('DB is not ready');
    if (!Array.isArray(items) || !items.length) return 0;
    var current = await readAllRefs();
    var dedupe = new Set(current.map(function (x) { return safeText(x.text).toLowerCase(); }));
    var toAdd = items.filter(function (t) {
      var key = safeText(t).toLowerCase();
      if (!key) return false;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });
    if (!toAdd.length) return 0;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        var store = tx.objectStore('scholar_refs');
        toAdd.forEach(function (text) {
          var ay = parseAuthorYear(text);
          store.add({
            id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            author: ay.author,
            year: ay.year,
            text: safeText(text),
            createdAt: nowIso()
          });
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Failed to save references')); };
      } catch (e) { reject(e); }
    });
    return toAdd.length;
  }

  async function removeRef(id) {
    var db = getDb();
    if (!db || !id || !db.objectStoreNames.contains('scholar_refs')) return;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        tx.objectStore('scholar_refs').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Delete failed')); };
      } catch (e) { reject(e); }
    });
  }

  async function clearRefs() {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) return;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        tx.objectStore('scholar_refs').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Clear failed')); };
      } catch (e) { reject(e); }
    });
  }

  function splitInputText(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n');
    if (inputMode === 'line') return text.split('\n').map(safeText).filter(Boolean);
    return text.split(/\n\s*\n+/).map(safeText).filter(Boolean);
  }

  function extractReferencesSectionFromMarkdown(mdText) {
    var src = String(mdText || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return '';

    var headingRe = /^##\s*(References|참고문헌)\s*$/im;
    var m = headingRe.exec(src);
    if (!m) return '';

    var start = m.index + m[0].length;
    var tail = src.slice(start);
    var nextHeadingRe = /\n##\s+/g;
    nextHeadingRe.lastIndex = 0;
    var n = nextHeadingRe.exec(tail);
    var section = n ? tail.slice(0, n.index) : tail;
    return section.trim();
  }

  function getSelectedRefs() {
    return refs.filter(function (r) { return selectedIds.has(String(r.id)); });
  }

  function setCountText() {
    var c = q('scholarref-selected-count');
    if (c) c.textContent = selectedIds.size + '개 선택됨';
    var t = q('scholarref-total-count');
    if (t) t.textContent = refs.length + '건';
  }

  function renderSavedList() {
    var box = q('scholarref-saved-list');
    if (!box) return;
    if (!refs.length) {
      box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">저장된 참고문헌이 없습니다.</div></div>';
      setCountText();
      return;
    }
    var html = '';
    refs.forEach(function (r) {
      html += '<div class="scholarref-item">';
      html += '<div><div class="scholarref-item-title">' + escapeHtml(buildLabel(r)) + '</div>';
      html += '<div class="scholarref-item-text">' + escapeHtml(r.text) + '</div></div>';
      html += '<div class="scholarref-item-actions"><button type="button" class="scholarref-danger" onclick="deleteScholarRefItem(\'' + String(r.id).replace(/'/g, "\\'") + '\')">삭제</button></div>';
      html += '</div>';
    });
    box.innerHTML = html;
    setCountText();
  }

  function renderSelectionList() {
    var box = q('scholarref-select-list');
    if (!box) return;
    var keyword = safeText((q('scholarref-search') || {}).value).toLowerCase();
    var filtered = refs.filter(function (r) {
      if (!keyword) return true;
      var blob = (r.author + ' ' + r.year + ' ' + r.text).toLowerCase();
      return blob.indexOf(keyword) >= 0;
    });
    if (!filtered.length) {
      box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">표시할 참고문헌이 없습니다.</div></div>';
      setCountText();
      return;
    }
    var html = '';
    filtered.forEach(function (r) {
      var checked = selectedIds.has(String(r.id)) ? ' checked' : '';
      html += '<label class="scholarref-item">';
      html += '<input type="checkbox" ' + checked + ' onchange="toggleScholarRefPick(\'' + String(r.id).replace(/'/g, "\\'") + '\', this.checked)">';
      html += '<div><div class="scholarref-item-title">' + escapeHtml(buildLabel(r)) + '</div>';
      html += '<div class="scholarref-item-text">' + escapeHtml(r.text) + '</div></div>';
      html += '</label>';
    });
    box.innerHTML = html;
    setCountText();
  }

  function buildReferencesSectionFromTexts(texts, opts) {
    if (!texts.length) return '';
    var withAnchors = !!(opts && opts.withAnchors);
    var blocks = texts.map(function (t) {
      var clean = safeText(t);
      if (!withAnchors) return clean;
      var anchor = anchorFromRefText(clean);
      return '<div id="' + anchor + '"></div>\n' + clean;
    }).join('\n\n');
    return '\n\n## References\n\n' + blocks + '\n';
  }

  function extractReferenceTexts(rawSection) {
    var out = [];
    var seen = new Set();

    function pushUnique(text) {
      var clean = safeText(text);
      if (!clean) return;
      var key = normalizeRefText(clean);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    }

    var liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    var m;
    while ((m = liRe.exec(rawSection)) !== null) {
      pushUnique(stripHtmlTags(m[1]));
    }

    var anchorBlockRe = /<div\b[^>]*id=["']schref-[^"']+["'][^>]*>\s*<\/div>\s*([\s\S]*?)(?=\n\s*<div\b[^>]*id=["']schref-|$)/gi;
    while ((m = anchorBlockRe.exec(rawSection)) !== null) {
      var firstLine = String(m[1] || '').split('\n').map(safeText).filter(Boolean)[0] || '';
      pushUnique(stripHtmlTags(firstLine));
    }

    var numberedRe = /^\s*\d+\.\s+(.+)$/gm;
    while ((m = numberedRe.exec(rawSection)) !== null) {
      pushUnique(stripHtmlTags(m[1]));
    }

    var plainBlocks = String(rawSection || '')
      .replace(/<div\b[^>]*id=["']schref-[^"']+["'][^>]*>\s*<\/div>/gi, '')
      .split(/\n\s*\n+/)
      .map(function (s) { return stripHtmlTags(s); })
      .map(safeText)
      .filter(Boolean);
    plainBlocks.forEach(pushUnique);

    return out;
  }

  function mergeReferencesIntoDocument(docText, pickedRefs, opts) {
    var source = String(docText || '');
    var headingRe = /^##\s*References\s*$/im;
    var headingMatch = headingRe.exec(source);
    var body = source;
    var existingRefRaw = '';
    if (headingMatch) {
      body = source.slice(0, headingMatch.index).trimEnd();
      existingRefRaw = source.slice(headingMatch.index + headingMatch[0].length);
    }

    var merged = [];
    var seen = new Set();
    function addText(text) {
      var clean = safeText(text);
      if (!clean) return;
      var key = normalizeRefText(clean);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    extractReferenceTexts(existingRefRaw).forEach(addText);
    (pickedRefs || []).forEach(function (r) { addText(r && r.text); });

    if (!merged.length) return body;
    return body + buildReferencesSectionFromTexts(merged, opts);
  }

  function replaceEditorAllText(nextText) {
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) return false;
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    document.execCommand('insertText', false, String(nextText || ''));
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    return true;
  }

  function insertTextAtCursor(text) {
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) return false;
    ta.focus();
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    ta.setSelectionRange(s, e);
    document.execCommand('insertText', false, text);
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    return true;
  }

  async function reloadRefsAndRender() {
    refs = await readAllRefs();
    var known = new Set(refs.map(function (r) { return String(r.id); }));
    Array.from(selectedIds).forEach(function (id) { if (!known.has(id)) selectedIds.delete(id); });
    renderSelectionList();
    renderSavedList();
  }

  async function init(opts) {
    deps.dbGetter = opts && opts.dbGetter;
    deps.getEditor = opts && opts.getEditor;
    deps.showToast = opts && opts.showToast;
    if (initialized) return;
    initialized = true;
    await reloadRefsAndRender();
  }

  function togglePanel() {
    var panel = q('scholarref-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) reloadRefsAndRender().catch(function () {});
  }

  function switchTab(i) {
    var tabs = document.querySelectorAll('.scholarref-tab');
    var contents = document.querySelectorAll('.scholarref-tab-content');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    contents.forEach(function (c) { c.classList.remove('active'); });
    var tab = document.querySelector('.scholarref-tab[data-tab="' + i + '"]');
    var content = q('scholarref-tab-' + i);
    if (tab) tab.classList.add('active');
    if (content) content.classList.add('active');
  }

  function setInputMode(mode) {
    inputMode = mode === 'line' ? 'line' : 'blank';
    var b = q('scholarref-method-blank');
    var l = q('scholarref-method-line');
    if (b) b.classList.toggle('active', inputMode === 'blank');
    if (l) l.classList.toggle('active', inputMode === 'line');
    var s = q('scholarref-status');
    if (s) s.textContent = inputMode === 'blank'
      ? '현재: 빈 줄 구분 — 항목 사이에 빈 줄 하나를 넣어 구분하세요.'
      : '현재: 엔터 구분 — 각 줄을 하나의 참고문헌으로 처리합니다.';
  }

  async function applyInput() {
    var ta = q('scholarref-input');
    if (!ta) return;
    var items = splitInputText(ta.value);
    if (!items.length) {
      toast('붙여넣은 참고문헌이 없습니다.');
      return;
    }
    try {
      var count = await addRefs(items);
      await reloadRefsAndRender();
      toast(count > 0 ? (count + '건 저장했습니다.') : '중복을 제외하고 저장할 항목이 없습니다.');
    } catch (e) {
      toast('참고문헌 저장 실패: ' + (e && e.message ? e.message : e));
    }
  }

  function clearInput() {
    var ta = q('scholarref-input');
    if (ta) ta.value = '';
  }

  function openTxtImport() {
    var file = q('scholarref-txt-file');
    if (file) file.click();
  }

  function openMdImport() {
    var file = q('scholarref-md-file');
    if (file) file.click();
  }

  async function importTxt(ev) {
    var file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;
    try {
      var text = await file.text();
      var ta = q('scholarref-input');
      if (ta) ta.value = text;
      toast('TXT 불러오기 완료');
    } catch (e) {
      toast('TXT 불러오기 실패');
    } finally {
      if (ev && ev.target) ev.target.value = '';
    }
  }

  async function importMd(ev) {
    var file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;
    try {
      var text = await file.text();
      var extracted = extractReferencesSectionFromMarkdown(text);
      var ta = q('scholarref-input');
      if (ta) {
        ta.value = extracted || text;
      }
      if (extracted) {
        var approxCount = splitInputText(extracted).length;
        toast('MD에서 References 섹션을 불러왔습니다. (' + approxCount + '개)');
      } else {
        toast('References 섹션이 없어 문서 전체를 불러왔습니다.');
      }
    } catch (e) {
      toast('MD 불러오기 실패');
    } finally {
      if (ev && ev.target) ev.target.value = '';
    }
  }

  function togglePick(id, checked) {
    var key = String(id);
    if (checked) selectedIds.add(key);
    else selectedIds.delete(key);
    setCountText();
  }

  function selectAllFiltered() {
    var keyword = safeText((q('scholarref-search') || {}).value).toLowerCase();
    refs.forEach(function (r) {
      var blob = (r.author + ' ' + r.year + ' ' + r.text).toLowerCase();
      if (!keyword || blob.indexOf(keyword) >= 0) selectedIds.add(String(r.id));
    });
    renderSelectionList();
  }

  function clearSelection() {
    selectedIds.clear();
    renderSelectionList();
  }

  function buildCitationText(items, opts) {
    if (!items.length) return '';
    if (opts.numberLink) {
      return items.map(function (r, i) {
        var anchorId = anchorFromRefText(r.text);
        return '[\\[' + (i + 1) + '\\]](#' + anchorId + ')';
      }).join(' ');
    }
    if (opts.format === 'narrative') {
      return items.map(function (r) {
        var ay = parseAuthorYear(r.text);
        return ay.author + ' (' + ay.year + ')';
      }).join('; ');
    }
    return '(' + items.map(function (r) {
      var ay = parseAuthorYear(r.text);
      return ay.author + ', ' + ay.year;
    }).join('; ') + ')';
  }

  function insertSelected() {
    var picked = getSelectedRefs();
    if (!picked.length) {
      toast('삽입할 참고문헌을 선택해 주세요.');
      return;
    }
    var format = ((q('scholarref-insert-format') || {}).value) || 'inline';
    var appendSection = !!((q('scholarref-append-section') || {}).checked);
    var numberLink = !!((q('scholarref-number-link') || {}).checked);
    if (numberLink && !appendSection) {
      toast('번호(링크) 삽입은 "문서 끝 References(APA) 추가"와 함께 사용해 주세요.');
      return;
    }
    var citationText = buildCitationText(picked, { format: format, numberLink: numberLink });
    if (!insertTextAtCursor(citationText)) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    if (appendSection) {
      var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
      if (!ta) {
        toast('References 섹션을 문서 끝에 추가하지 못했습니다.');
        return;
      }
      var mergedDoc = mergeReferencesIntoDocument(String(ta.value || ''), picked, { withAnchors: numberLink });
      if (!replaceEditorAllText(mergedDoc)) {
        toast('References 섹션을 문서 끝에 추가하지 못했습니다.');
        return;
      }
    }
    toast('선택한 인용을 삽입했습니다.');
  }

  function insertAllSection() {
    if (!refs.length) {
      toast('저장된 참고문헌이 없습니다.');
      return;
    }
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    var mergedDoc = mergeReferencesIntoDocument(String(ta.value || ''), refs, { withAnchors: false });
    if (!replaceEditorAllText(mergedDoc)) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    toast('참고문헌 섹션을 삽입했습니다.');
  }

  function download(name, body, mime) {
    var blob = new Blob([body], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 300);
  }

  function downloadTxt() {
    var body = refs.map(function (r) { return r.text; }).join('\n\n');
    download('scholar_references.txt', body, 'text/plain;charset=utf-8');
  }

  function downloadMd() {
    var onlyTexts = refs.map(function (r) { return r.text; });
    var body = buildReferencesSectionFromTexts(onlyTexts, { withAnchors: false }).replace(/^\n+/, '');
    download('scholar_references.md', body, 'text/markdown;charset=utf-8');
  }

  function openListWindow() {
    if (!refs.length) {
      toast('저장된 참고문헌이 없습니다.');
      return;
    }
    var win = null;
    try {
      win = window.open('', 'scholarref_list_window', 'width=980,height=820,scrollbars=yes,resizable=yes');
    } catch (e) {}
    if (!win) {
      toast('팝업 차단으로 새창을 열지 못했습니다.');
      return;
    }
    var itemsHtml = refs.map(function (r) {
      var label = escapeHtml(buildLabel(r));
      var text = escapeHtml(r.text);
      return '<div class="item"><div class="label">' + label + '</div><div class="txt">' + text + '</div></div>';
    }).join('');
    var html = ''
      + '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>참고문헌 목록</title>'
      + '<style>'
      + 'body{margin:0;font-family:Segoe UI,Pretendard,sans-serif;background:#0f172a;color:#e2e8f0;}'
      + '.top{position:sticky;top:0;background:#111827;border-bottom:1px solid #334155;padding:10px 12px;display:flex;gap:8px;align-items:center;}'
      + '.top h1{font-size:15px;margin:0 8px 0 0;font-weight:700;}'
      + '.top button{border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;}'
      + '.wrap{max-width:860px;margin:18px auto;padding:0 14px;}'
      + '.item{border-bottom:1px solid #233044;padding:10px 0;}'
      + '.label{color:#a5b4fc;font-size:12px;font-weight:700;margin-bottom:4px;}'
      + '.txt{color:#d1d5db;font-size:14px;line-height:1.55;}'
      + '</style></head><body>'
      + '<div class="top"><h1>References (' + refs.length + ')</h1>'
      + '<button onclick="window.print()">인쇄</button>'
      + '<button onclick="window.close()">닫기</button></div>'
      + '<div class="wrap">' + itemsHtml + '</div>'
      + '</body></html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
    try { win.focus(); } catch (e2) {}
  }

  async function deleteOne(id) {
    try {
      await removeRef(id);
      selectedIds.delete(String(id));
      await reloadRefsAndRender();
      toast('삭제했습니다.');
    } catch (e) {
      toast('삭제 실패');
    }
  }

  async function clearAll() {
    if (!refs.length) return;
    if (!window.confirm('저장된 참고문헌을 모두 삭제할까요?')) return;
    try {
      await clearRefs();
      selectedIds.clear();
      await reloadRefsAndRender();
      toast('전체 삭제했습니다.');
    } catch (e) {
      toast('전체 삭제 실패');
    }
  }

  global.ScholarRef = {
    init: init,
    togglePanel: togglePanel,
    switchTab: switchTab,
    setInputMode: setInputMode,
    applyInput: applyInput,
    clearInput: clearInput,
    openTxtImport: openTxtImport,
    openMdImport: openMdImport,
    importTxt: importTxt,
    importMd: importMd,
    renderSelectionList: renderSelectionList,
    togglePick: togglePick,
    selectAllFiltered: selectAllFiltered,
    clearSelection: clearSelection,
    insertSelected: insertSelected,
    insertAllSection: insertAllSection,
    downloadTxt: downloadTxt,
    downloadMd: downloadMd,
    openListWindow: openListWindow,
    deleteOne: deleteOne,
    clearAll: clearAll
  };
})(window);

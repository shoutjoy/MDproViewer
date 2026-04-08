(function () {
  'use strict';
  if (window.SidebarAIInsert && window.SidebarAIInsert.__ready) return;

  function deps() {
    return window.SidebarAIInsertDeps || {};
  }

  function getSelectionState() {
    var d = deps();
    if (typeof d.getSelectionState === 'function') return d.getSelectionState();
    return {
      selStart: null,
      selEnd: null,
      cursorPos: null,
      lastSelectionTarget: null
    };
  }

  function setSelectionState(next) {
    var d = deps();
    if (typeof d.setSelectionState === 'function') d.setSelectionState(next || {});
  }

  function isTextSelectionControl(el) {
    var d = deps();
    if (typeof d.isTextSelectionControl === 'function') return !!d.isTextSelectionControl(el);
    return false;
  }

  function isAiPanelElement(node) {
    var d = deps();
    if (typeof d.isAiPanelElement === 'function') return !!d.isAiPanelElement(node);
    return false;
  }

  function getInsertResultText() {
    var d = deps();
    if (typeof d.getInsertResultText === 'function') return String(d.getInsertResultText() || '');
    return '';
  }

  function setResultTabInsert() {
    var d = deps();
    if (typeof d.setResultTab === 'function') d.setResultTab('insert');
  }

  function toggleScholarAIInsertMenu() {
    var menu = document.getElementById('scholar-ai-insert-menu');
    if (menu) menu.classList.toggle('open');
  }

  function closeScholarAIInsertMenu() {
    var menu = document.getElementById('scholar-ai-insert-menu');
    if (menu) menu.classList.remove('open');
  }

  function handleScholarAIInsertClick() {
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    if (!isEdit) {
      alert('Switching to edit mode first.');
      viewerSwitchToEdit();
      return;
    }
    var ta = document.getElementById('viewer-edit-ta');
    if (ta) {
      setSelectionState({ cursorPos: ta.selectionStart });
    }
    setResultTabInsert();
    toggleScholarAIInsertMenu();
  }

  function findDocFromFrames(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var frame = document.querySelector(selectors[i]);
      if (!frame) continue;
      try {
        var d = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (d) return d;
      } catch (e) {}
    }
    return null;
  }

  function findWritableControlInDoc(docRef, preferredId) {
    if (!docRef) return null;
    if (preferredId) {
      var preferred = docRef.getElementById(preferredId);
      if (isTextSelectionControl(preferred) && !preferred.disabled && !preferred.readOnly) return preferred;
    }
    var active = docRef.activeElement;
    if (isTextSelectionControl(active) && !active.disabled && !active.readOnly) return active;
    var first = docRef.querySelector('textarea:not([disabled]):not([readonly]),input[type="text"]:not([disabled]):not([readonly])');
    if (isTextSelectionControl(first)) return first;
    return null;
  }

  function insertIntoTextControl(target, text, appendMode) {
    if (!target) return false;
    var raw = String(target.value || '');
    var s = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
    var e = isFinite(target.selectionEnd) ? target.selectionEnd : s;
    s = Math.max(0, Math.min(s, raw.length));
    e = Math.max(0, Math.min(e, raw.length));
    var before = raw.slice(0, s);
    var selected = raw.slice(s, e);
    var after = raw.slice(e);
    var next = appendMode ? (before + selected + '\n\n' + text + after) : (before + text + after);
    target.value = next;
    var caret = appendMode ? (s + selected.length + 2 + text.length) : (s + text.length);
    if (typeof target.focus === 'function') target.focus();
    if (typeof target.setSelectionRange === 'function') target.setSelectionRange(caret, caret);
    try {
      var evCtor = (target.ownerDocument && target.ownerDocument.defaultView && target.ownerDocument.defaultView.Event) || Event;
      target.dispatchEvent(new evCtor('input', { bubbles: true }));
      target.dispatchEvent(new evCtor('change', { bubbles: true }));
    } catch (e2) {}
    return true;
  }

  function scholarAIInsertDoc(mode) {
    var resultText = getInsertResultText();
    if (!resultText) {
      alert('There is no ScholarAI result to insert.');
      return;
    }

    if (mode === 3) {
      var gsDoc = findDocFromFrames([
        '#html2ppt-frame',
        'iframe[title="GenSlide"]',
        'iframe[src*="Html2pptx/jenaEditor"]'
      ]);
      var gsTarget = findWritableControlInDoc(gsDoc, 'code');
      if (!gsTarget) {
        alert('GenSlide HTMLCode 입력창을 찾지 못했습니다. GenSlide를 먼저 열어주세요.');
        return;
      }
      insertIntoTextControl(gsTarget, resultText, false);
      setSelectionState({
        selStart: null,
        selEnd: null,
        cursorPos: isFinite(gsTarget.selectionStart) ? gsTarget.selectionStart : String(gsTarget.value || '').length,
        lastSelectionTarget: gsTarget
      });
      return;
    }

    if (mode === 4) {
      var mmDoc = findDocFromFrames([
        '#mermaid-editor-frame',
        'iframe[title="Mermaid Editor"]',
        'iframe[src*="mermaid-editor/index.html"]'
      ]);
      var mmTarget = findWritableControlInDoc(mmDoc, 'raw-code-editor');
      if (!mmTarget) {
        alert('Mermaid 코드 입력창을 찾지 못했습니다. Mermaid Editor를 먼저 열어주세요.');
        return;
      }
      insertIntoTextControl(mmTarget, resultText, false);
      setSelectionState({
        selStart: null,
        selEnd: null,
        cursorPos: isFinite(mmTarget.selectionStart) ? mmTarget.selectionStart : String(mmTarget.value || '').length,
        lastSelectionTarget: mmTarget
      });
      return;
    }

    var state = getSelectionState();
    var ta = document.getElementById('viewer-edit-ta');
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};

    var target = (isEdit && ta) ? ta : null;

    if (!target && state.lastSelectionTarget && state.lastSelectionTarget.isConnected && isTextSelectionControl(state.lastSelectionTarget)) {
      target = state.lastSelectionTarget;
    }
    if (!target && isTextSelectionControl(document.activeElement) && !isAiPanelElement(document.activeElement)) {
      target = document.activeElement;
    }

    if (!target) {
      var gsFrame = document.getElementById('html2ppt-frame');
      try {
        var gsDoc2 = gsFrame && (gsFrame.contentDocument || (gsFrame.contentWindow && gsFrame.contentWindow.document));
        if (gsDoc2) {
          var gsActive = gsDoc2.activeElement;
          if (isTextSelectionControl(gsActive) && !gsActive.disabled && !gsActive.readOnly) target = gsActive;
          if (!target) {
            var gsCode = gsDoc2.getElementById('code');
            if (isTextSelectionControl(gsCode) && !gsCode.disabled && !gsCode.readOnly) target = gsCode;
          }
          if (!target) {
            var gsAny = gsDoc2.querySelector('textarea:not([disabled]):not([readonly]),input[type="text"]:not([disabled]):not([readonly])');
            if (isTextSelectionControl(gsAny)) target = gsAny;
          }
        }
      } catch (e) {}
    }

    if (!target) {
      var vp = document.getElementById('content-viewport');
      var wrap = document.getElementById('viewer-edit-wrap');
      if (vp) vp.classList.add('viewer-edit-active');
      if (wrap) wrap.style.display = 'flex';
      ta = document.getElementById('viewer-edit-ta');
      if (ta) {
        ta.value = window.__rawText || '';
        ta.style.display = 'block';
      }
      var eb = document.getElementById('viewer-btn-edit');
      var vb = document.getElementById('viewer-btn-view');
      if (eb) eb.style.display = 'none';
      if (vb) vb.style.display = 'inline-block';
      viewerBuildNav();
      target = document.getElementById('viewer-edit-ta');
    }
    if (!target) return;

    var start;
    var end;
    var raw = String(target.value || '');
    if (mode === 0) {
      var fallbackPos = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
      start = end = (state.cursorPos != null ? state.cursorPos : fallbackPos);
    } else if (state.selStart != null && state.selEnd != null && state.lastSelectionTarget === target) {
      start = state.selStart;
      end = state.selEnd;
    } else {
      var selTa = document.getElementById('scholar-ai-selected');
      var selText = (selTa && selTa.value) ? selTa.value.trim() : '';
      var idx = selText ? raw.indexOf(selText) : -1;
      if (idx >= 0) {
        start = idx;
        end = idx + selText.length;
      } else {
        start = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
        end = isFinite(target.selectionEnd) ? target.selectionEnd : start;
      }
    }
    start = Math.max(0, Math.min(start, raw.length));
    end = Math.max(0, Math.min(end, raw.length));
    var before = raw.slice(0, start);
    var after = raw.slice(end);
    var newVal = mode === 1 ? before + raw.slice(start, end) + '\n\n' + resultText + after : before + resultText + after;
    target.value = newVal;
    if (target === document.getElementById('viewer-edit-ta')) window.__rawText = newVal;
    var insertEnd = mode === 1 ? start + (end - start) + 2 + resultText.length : start + resultText.length;
    setSelectionState({
      cursorPos: insertEnd,
      selStart: null,
      selEnd: null,
      lastSelectionTarget: target
    });
    target.focus();
    if (typeof target.setSelectionRange === 'function') target.setSelectionRange(insertEnd, insertEnd);
    var lines = (target.value.substring(0, insertEnd).match(/\n/g) || []).length;
    var lineHeight = parseInt(getComputedStyle(target).lineHeight, 10) || 20;
    if (isFinite(target.scrollTop)) target.scrollTop = Math.max(0, lines * lineHeight - target.clientHeight / 2);
    try {
      var evCtor = (target.ownerDocument && target.ownerDocument.defaultView && target.ownerDocument.defaultView.Event) || Event;
      target.dispatchEvent(new evCtor('input', { bubbles: true }));
      target.dispatchEvent(new evCtor('change', { bubbles: true }));
    } catch (e) {}
  }

  window.SidebarAIInsert = {
    __ready: true,
    handleScholarAIInsertClick: handleScholarAIInsertClick,
    toggleScholarAIInsertMenu: toggleScholarAIInsertMenu,
    closeScholarAIInsertMenu: closeScholarAIInsertMenu,
    scholarAIInsertDoc: scholarAIInsertDoc
  };

  window.handleScholarAIInsertClick = handleScholarAIInsertClick;
  window.toggleScholarAIInsertMenu = toggleScholarAIInsertMenu;
  window.closeScholarAIInsertMenu = closeScholarAIInsertMenu;
  window.scholarAIInsertDoc = scholarAIInsertDoc;
})();

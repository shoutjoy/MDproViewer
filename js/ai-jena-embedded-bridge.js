(function (root) {
  'use strict';

  function trustedParent(origin) {
    try {
      var url = new URL(String(origin || ''));
      return url.protocol === 'http:'
        && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
        && url.port === '8765';
    } catch (_) {
      return false;
    }
  }

  function insertMarkdown(payload) {
    payload = payload || {};
    var editor = document.getElementById('viewer-edit-ta');
    if (!editor) throw new Error('MD Pro Viewer 편집기를 찾지 못했습니다.');
    var cmView = editor.__mdCm6View;
    var value = cmView && cmView.state && cmView.state.doc
      ? String(cmView.state.doc.toString())
      : String(editor.value || '');
    var selection = cmView && cmView.state && cmView.state.selection
      ? cmView.state.selection.main
      : null;
    var start = selection ? Number(selection.from) : Number(editor.selectionStart);
    var end = selection ? Number(selection.to) : Number(editor.selectionEnd);
    // Switching from the rendered view to edit mode can reposition the editor
    // caret from the preview scroll ratio. Capture the user's real caret or
    // selection first, then restore/use it for the requested insertion mode.
    if (typeof root.viewerSwitchToEdit === 'function') root.viewerSwitchToEdit();
    if (!Number.isFinite(start)) start = value.length;
    if (!Number.isFinite(end)) end = start;
    start = Math.max(0, Math.min(value.length, start));
    end = Math.max(start, Math.min(value.length, end));
    var mode = String(payload.mode || 'cursor');
    var text = String(payload.markdown || payload.text || payload.plainText || '');
    if (mode === 'document-end') {
      start = end = value.length;
      if (value && !/\n\s*$/.test(value)) text = '\n\n' + text;
    } else if (mode === 'line-below') {
      var lineEnd = value.indexOf('\n', end);
      start = end = lineEnd < 0 ? value.length : lineEnd;
      text = '\n' + text;
    } else if (mode !== 'replace') {
      end = start;
    }
    var next = value.slice(0, start) + text + value.slice(end);
    var cursor = start + text.length;
    if (cmView && typeof cmView.dispatch === 'function') {
      cmView.dispatch({
        changes: { from: 0, to: cmView.state.doc.length, insert: next },
        selection: { anchor: cursor },
        userEvent: 'input.aiJena'
      });
    }
    editor.value = next;
    editor.focus();
    if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(cursor, cursor);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof root.renderMarkdown === 'function') root.renderMarkdown({ force: true });
    if (typeof root.showToast === 'function') root.showToast('AI Jena 답변을 문서에 삽입했습니다.');
    return { ok: true, cursor: cursor };
  }

  root.addEventListener('message', function (event) {
    var message = event.data;
    if (!event.source || !trustedParent(event.origin)
      || !message || message.source !== 'ai-jena-mdpro-parent'
      || message.action !== 'insert' || !message.requestId) return;
    var result;
    try {
      result = insertMarkdown(message.payload);
    } catch (error) {
      result = { ok: false, reason: String(error && error.message || error) };
    }
    event.source.postMessage({
      source: 'ai-jena-mdpro-frame',
      requestId: message.requestId,
      ok: !!result.ok,
      result: result,
      error: result.reason || ''
    }, event.origin);
  }, false);
})(window);

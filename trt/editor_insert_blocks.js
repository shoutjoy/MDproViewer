(function (global) {
    'use strict';

    function getEditor() {
        return document.getElementById('viewer-edit-ta');
    }

    function ensureEditMode() {
        var ta = getEditor();
        if (!ta) return null;
        var viewport = document.getElementById('content-viewport');
        var inEditMode = !!(viewport && viewport.classList.contains('viewer-edit-active'));
        if (!inEditMode && typeof global.toggleMode === 'function') {
            try { global.toggleMode('edit'); } catch (e) {}
        }
        return getEditor();
    }

    function replaceSelection(ta, replacement, caretPos) {
        if (!ta) return false;
        var start = Math.max(0, Number(ta.selectionStart) || 0);
        var end = Math.max(start, Number(ta.selectionEnd) || start);
        ta.focus();
        if (typeof ta.setRangeText === 'function') {
            ta.setRangeText(replacement, start, end, 'end');
        } else {
            ta.setSelectionRange(start, end);
            document.execCommand('insertText', false, replacement);
        }
        var pos = Number.isFinite(caretPos) ? caretPos : (start + replacement.length);
        ta.setSelectionRange(pos, pos);
        try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        return true;
    }

    function normalizeLanguage(lang) {
        var s = String(lang || '').trim().toLowerCase();
        if (!s) return 'r';
        return s.replace(/[^a-z0-9_+-]/g, '');
    }

    function insertCodeBlockPrompt() {
        var ta = ensureEditMode();
        if (!ta) return false;
        var langInput = global.prompt('Code block language (e.g., r, python, js):', 'r');
        if (langInput == null) return false;
        var lang = normalizeLanguage(langInput);
        var selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
        var body = selected || '';
        var block = '```' + lang + '\n' + body + '\n```';
        var start = Math.max(0, Number(ta.selectionStart) || 0);
        var caret = selected ? (start + block.length) : (start + ('```' + lang + '\n').length);
        return replaceSelection(ta, block, caret);
    }

    function insertMermaidBlock() {
        var ta = ensureEditMode();
        if (!ta) return false;
        var selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
        var defaultBody = [
            '%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}}}%%',
            'flowchart LR',
            '    A[Start] --> B[End]'
        ].join('\n');
        var body = selected || defaultBody;
        var block = '```mermaid\n' + body + '\n```';
        var start = Math.max(0, Number(ta.selectionStart) || 0);
        var caret = selected ? (start + block.length) : (start + '```mermaid\n'.length + defaultBody.length);
        return replaceSelection(ta, block, caret);
    }

    global.EditorInsertBlocksTRT = {
        insertCodeBlockPrompt: insertCodeBlockPrompt,
        insertMermaidBlock: insertMermaidBlock
    };
})(window);

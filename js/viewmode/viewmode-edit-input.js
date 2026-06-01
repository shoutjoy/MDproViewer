(function () {
    'use strict';

    var viewer = null;
    var viewerContainer = null;
    var editorTextarea = null;
    var caretPos = 0;

    function getCurrentMarkdown() {
        return String(editorTextarea && typeof editorTextarea.value === 'string' ? editorTextarea.value : '');
    }

    function isViewMode() {
        var viewport = document.getElementById('content-viewport');
        return !!(viewport && viewport.classList.contains('hidden'));
    }

    function isViewModeEditEnabled() {
        var check = document.getElementById('view-mode-edit-enabled');
        if (check) return !!check.checked;
        try {
            if (typeof window.viewModeEditEnabled === 'boolean') return !!window.viewModeEditEnabled;
        } catch (_) {}
        try {
            return localStorage.getItem('md_viewer_view_mode_edit_enabled') === '1';
        } catch (_) {}
        return false;
    }

    function shouldHandleViewInput() {
        return isViewMode() && isViewModeEditEnabled();
    }

    function isTypingTarget(target) {
        if (!target || !target.tagName) return false;
        var tag = String(target.tagName).toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return !!target.isContentEditable;
    }

    function clampPos(pos, text) {
        return Math.max(0, Math.min(Number(pos) || 0, text.length));
    }

    function charPosFromRatio(ratio) {
        var text = getCurrentMarkdown();
        if (!text) return 0;
        var lines = text.split('\n');
        if (lines.length <= 1) return 0;
        var lineIdx = Math.max(0, Math.min(lines.length - 1, Math.round((lines.length - 1) * ratio)));
        var pos = 0;
        for (var i = 0; i < lineIdx; i += 1) pos += lines[i].length + 1;
        return clampPos(pos, text);
    }

    function setCaretFromViewerPoint(clientY) {
        if (!viewer || !viewerContainer) return;
        var rect = viewer.getBoundingClientRect();
        var y = (clientY - rect.top) + viewerContainer.scrollTop;
        var ratio = y / Math.max(1, viewer.scrollHeight);
        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;
        caretPos = charPosFromRatio(ratio);
    }

    function applyMarkdown(nextText, nextCaretPos) {
        if (typeof window.updateContent === 'function') {
            window.updateContent(nextText);
        } else if (editorTextarea) {
            editorTextarea.value = nextText;
        }
        if (editorTextarea) {
            var safe = clampPos(nextCaretPos, nextText);
            editorTextarea.setSelectionRange(safe, safe);
        }
        caretPos = clampPos(nextCaretPos, nextText);
        if (typeof window.performAutoSave === 'function') window.performAutoSave();
    }

    function replaceBySelectionWrap(prefix, suffix) {
        var selection = (typeof window.getSelection === 'function') ? window.getSelection() : null;
        var selectedText = String(selection && selection.toString ? selection.toString() : '');
        if (!selectedText || !selectedText.trim()) {
            if (typeof window.showToast === 'function') window.showToast('보기모드에서 텍스트를 먼저 선택하세요.');
            return;
        }
        var source = getCurrentMarkdown();
        if (!source) return;
        var idx = source.indexOf(selectedText);
        if (idx < 0) {
            if (typeof window.showToast === 'function') window.showToast('선택 텍스트를 원문에서 찾지 못했습니다.');
            return;
        }
        var replacement = prefix + selectedText + suffix;
        var next = source.slice(0, idx) + replacement + source.slice(idx + selectedText.length);
        applyMarkdown(next, idx + replacement.length);
        if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
    }

    function applyHeading(level) {
        var text = getCurrentMarkdown();
        if (!text) return;
        var cursor = clampPos(caretPos, text);
        var lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
        var lineEnd = text.indexOf('\n', cursor);
        if (lineEnd < 0) lineEnd = text.length;
        var lineText = text.slice(lineStart, lineEnd).replace(/^#+\s*/, '');
        var prefix = Array(level + 1).join('#') + ' ';
        var replacement = prefix + lineText;
        var next = text.slice(0, lineStart) + replacement + text.slice(lineEnd);
        applyMarkdown(next, lineStart + replacement.length);
    }

    function insertTextAtCaret(insertText) {
        var text = getCurrentMarkdown();
        var cursor = clampPos(caretPos, text);
        var next = text.slice(0, cursor) + insertText + text.slice(cursor);
        applyMarkdown(next, cursor + insertText.length);
    }

    function deleteBackwardAtCaret() {
        var text = getCurrentMarkdown();
        var cursor = clampPos(caretPos, text);
        if (cursor <= 0) return;
        var next = text.slice(0, cursor - 1) + text.slice(cursor);
        applyMarkdown(next, cursor - 1);
    }

    function deleteForwardAtCaret() {
        var text = getCurrentMarkdown();
        var cursor = clampPos(caretPos, text);
        if (cursor >= text.length) return;
        var next = text.slice(0, cursor) + text.slice(cursor + 1);
        applyMarkdown(next, cursor);
    }

    function handleToolbarClickCapture(e) {
        if (!shouldHandleViewInput()) return;
        var button = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!button) return;
        var label = String(button.textContent || '').trim().toUpperCase();

        if (label === 'B') {
            e.preventDefault();
            e.stopPropagation();
            replaceBySelectionWrap('**', '**');
            return;
        }
        if (label === 'I') {
            e.preventDefault();
            e.stopPropagation();
            replaceBySelectionWrap('*', '*');
            return;
        }
        if (label === 'H1') {
            e.preventDefault();
            e.stopPropagation();
            applyHeading(1);
            return;
        }
        if (label === 'H2') {
            e.preventDefault();
            e.stopPropagation();
            applyHeading(2);
            return;
        }
        if (label === 'H3') {
            e.preventDefault();
            e.stopPropagation();
            applyHeading(3);
            return;
        }
    }

    function handleBeforeInput(e) {
        if (!shouldHandleViewInput()) return;
        if (isTypingTarget(e.target)) return;

        var it = String(e.inputType || '');
        if (!it) return;

        if (it === 'insertText') {
            e.preventDefault();
            insertTextAtCaret(String(e.data || ''));
            return;
        }
        if (it === 'insertParagraph' || it === 'insertLineBreak') {
            e.preventDefault();
            insertTextAtCaret('\n');
            return;
        }
        if (it === 'deleteContentBackward') {
            e.preventDefault();
            deleteBackwardAtCaret();
            return;
        }
        if (it === 'deleteContentForward') {
            e.preventDefault();
            deleteForwardAtCaret();
            return;
        }
        if (it === 'insertFromPaste') {
            e.preventDefault();
            var text = '';
            if (e.clipboardData && typeof e.clipboardData.getData === 'function') {
                text = String(e.clipboardData.getData('text/plain') || '');
            }
            insertTextAtCaret(text);
        }
    }

    function handleKeydownFallback(e) {
        if (!shouldHandleViewInput()) return;
        if (isTypingTarget(e.target)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            insertTextAtCaret('  ');
            return;
        }
        if (e.key === 'Backspace') {
            e.preventDefault();
            deleteBackwardAtCaret();
            return;
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            deleteForwardAtCaret();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            insertTextAtCaret('\n');
            return;
        }
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            insertTextAtCaret(' ');
            return;
        }
        if (e.key && e.key.length === 1) {
            e.preventDefault();
            insertTextAtCaret(e.key);
            return;
        }
    }

    function init() {
        viewer = document.getElementById('viewer');
        viewerContainer = document.getElementById('viewer-container');
        editorTextarea = document.getElementById('viewer-edit-ta');
        if (!viewer || !viewerContainer || !editorTextarea) return;

        viewer.addEventListener('mousedown', function (e) {
            if (!shouldHandleViewInput()) return;
            setCaretFromViewerPoint(e.clientY);
        });
        viewer.addEventListener('mouseup', function () {
            if (!shouldHandleViewInput()) return;
            var text = getCurrentMarkdown();
            caretPos = clampPos(caretPos, text);
        });

        document.addEventListener('click', handleToolbarClickCapture, true);
        document.addEventListener('beforeinput', handleBeforeInput, true);
        document.addEventListener('keydown', handleKeydownFallback, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

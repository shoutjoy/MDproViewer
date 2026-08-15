(function () {
    'use strict';

    var viewer = null;
    var viewerContainer = null;
    var editorTextarea = null;
    var inputSink = null;
    var caretPos = 0;
    var composing = false;

    function getCurrentMarkdown() {
        return String(editorTextarea && typeof editorTextarea.value === 'string' ? editorTextarea.value : '');
    }

    function isViewMode() {
        var viewport = document.getElementById('content-viewport');
        return !!(viewport && viewport.classList.contains('hidden'));
    }

    function isEnabled() {
        var check = document.getElementById('view-mode-edit-enabled');
        if (check) return !!check.checked;
        try {
            return localStorage.getItem('md_viewer_view_mode_edit_enabled') === '1';
        } catch (_) {
            return false;
        }
    }

    function shouldHandleInput() {
        return isViewMode() && isEnabled();
    }

    function clampPos(pos, text) {
        return Math.max(0, Math.min(Number(pos) || 0, text.length));
    }

    function markdownPosFromRenderedRatio(ratio) {
        var text = getCurrentMarkdown();
        return clampPos(Math.round(text.length * Math.max(0, Math.min(1, ratio))), text);
    }

    function getCaretRangeFromPoint(clientX, clientY) {
        if (typeof document.caretPositionFromPoint === 'function') {
            var position = document.caretPositionFromPoint(clientX, clientY);
            if (position && position.offsetNode) {
                var range = document.createRange();
                range.setStart(position.offsetNode, position.offset);
                range.collapse(true);
                return range;
            }
        }
        if (typeof document.caretRangeFromPoint === 'function') {
            return document.caretRangeFromPoint(clientX, clientY);
        }
        return null;
    }

    function setCaretFromViewerPoint(clientX, clientY) {
        if (!viewer) return;
        var range = getCaretRangeFromPoint(clientX, clientY);
        if (range && viewer.contains(range.startContainer)) {
            var prefix = document.createRange();
            prefix.selectNodeContents(viewer);
            prefix.setEnd(range.startContainer, range.startOffset);
            var beforeLength = String(prefix.toString() || '').length;
            var renderedLength = Math.max(1, String(viewer.innerText || viewer.textContent || '').length);
            caretPos = markdownPosFromRenderedRatio(beforeLength / renderedLength);
            return;
        }
        if (!viewerContainer) return;
        var rect = viewer.getBoundingClientRect();
        var y = (clientY - rect.top) + viewerContainer.scrollTop;
        caretPos = markdownPosFromRenderedRatio(y / Math.max(1, viewer.scrollHeight));
    }

    function applyMarkdown(nextText, nextCaretPos) {
        var safe = clampPos(nextCaretPos, nextText);
        if (typeof window.updateContent === 'function') {
            window.updateContent(nextText);
        } else if (editorTextarea) {
            editorTextarea.value = nextText;
        }
        if (editorTextarea) editorTextarea.setSelectionRange(safe, safe);
        caretPos = safe;
        if (typeof window.performAutoSave === 'function') window.performAutoSave();
        window.requestAnimationFrame(function () {
            if (shouldHandleInput() && inputSink) inputSink.focus({ preventScroll: true });
        });
    }

    function insertTextAtCaret(insertText) {
        var value = String(insertText == null ? '' : insertText);
        if (!value) return;
        var text = getCurrentMarkdown();
        var cursor = clampPos(caretPos, text);
        applyMarkdown(text.slice(0, cursor) + value + text.slice(cursor), cursor + value.length);
    }

    function deleteAtCaret(backward) {
        var text = getCurrentMarkdown();
        var cursor = clampPos(caretPos, text);
        if (backward) {
            if (cursor <= 0) return;
            applyMarkdown(text.slice(0, cursor - 1) + text.slice(cursor), cursor - 1);
            return;
        }
        if (cursor >= text.length) return;
        applyMarkdown(text.slice(0, cursor) + text.slice(cursor + 1), cursor);
    }

    function positionInputSink(clientX, clientY) {
        if (!inputSink) return;
        inputSink.style.left = Math.max(0, Math.min(window.innerWidth - 4, clientX)) + 'px';
        inputSink.style.top = Math.max(0, Math.min(window.innerHeight - 24, clientY)) + 'px';
    }

    function commitSinkValue() {
        if (!inputSink || composing) return;
        var value = inputSink.value;
        inputSink.value = '';
        if (value) insertTextAtCaret(value);
    }

    function createInputSink() {
        inputSink = document.createElement('textarea');
        inputSink.id = 'view-mode-text-input-sink';
        inputSink.setAttribute('aria-label', '보기모드 텍스트 입력');
        inputSink.setAttribute('autocomplete', 'off');
        inputSink.setAttribute('autocapitalize', 'off');
        inputSink.setAttribute('spellcheck', 'false');
        inputSink.style.cssText = 'position:fixed;width:2px;height:22px;padding:0;border:0;outline:0;resize:none;overflow:hidden;background:transparent;color:transparent;caret-color:#4f46e5;z-index:70;opacity:.85;';
        document.body.appendChild(inputSink);

        inputSink.addEventListener('compositionstart', function () { composing = true; });
        inputSink.addEventListener('compositionend', function () {
            composing = false;
            window.setTimeout(commitSinkValue, 0);
        });
        inputSink.addEventListener('input', function (event) {
            if (!event.isComposing) commitSinkValue();
        });
        inputSink.addEventListener('keydown', function (event) {
            if (event.isComposing || composing) return;
            if (event.key === 'Backspace' && !inputSink.value) {
                event.preventDefault();
                deleteAtCaret(true);
            } else if (event.key === 'Delete' && !inputSink.value) {
                event.preventDefault();
                deleteAtCaret(false);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                insertTextAtCaret('\n');
            } else if (event.key === 'Tab') {
                event.preventDefault();
                insertTextAtCaret('  ');
            } else if (event.key === 'Escape') {
                inputSink.blur();
            }
        });
    }

    function updateInteractionState() {
        if (!viewer) return;
        var active = shouldHandleInput();
        viewer.classList.toggle('view-mode-text-input-enabled', active);
        viewer.setAttribute('aria-readonly', active ? 'false' : 'true');
        if (!active && inputSink) inputSink.blur();
    }

    function isInteractiveTarget(target) {
        return !!(target && target.closest && target.closest('a,button,input,textarea,select,[contenteditable],img,video,audio,pre,code,table,svg,.mermaid,.katex,.note-cover,[data-note-cover]'));
    }

    function init() {
        viewer = document.getElementById('viewer');
        viewerContainer = document.getElementById('viewer-container');
        editorTextarea = document.getElementById('viewer-edit-ta');
        if (!viewer || !viewerContainer || !editorTextarea || !document.body) return;

        var style = document.createElement('style');
        style.textContent = '#viewer.view-mode-text-input-enabled{cursor:text;outline:2px solid rgba(99,102,241,.38);outline-offset:4px;}#viewer.view-mode-text-input-enabled:hover{outline-color:rgba(79,70,229,.72);}';
        document.head.appendChild(style);
        createInputSink();
        updateInteractionState();

        viewer.addEventListener('mousedown', function (event) {
            updateInteractionState();
            if (!shouldHandleInput() || isInteractiveTarget(event.target)) return;
            setCaretFromViewerPoint(event.clientX, event.clientY);
            positionInputSink(event.clientX, event.clientY);
            window.setTimeout(function () {
                if (inputSink) inputSink.focus({ preventScroll: true });
            }, 0);
        });
        document.addEventListener('md-viewer-view-mode-text-input-change', updateInteractionState);
        document.addEventListener('visibilitychange', updateInteractionState);
        var modeViewport = document.getElementById('content-viewport');
        if (modeViewport && typeof MutationObserver === 'function') {
            new MutationObserver(updateInteractionState).observe(modeViewport, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    window.ViewModeTextInput = {
        isEnabled: isEnabled,
        insertTextAtCaret: insertTextAtCaret,
        deleteAtCaret: deleteAtCaret,
        updateInteractionState: updateInteractionState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

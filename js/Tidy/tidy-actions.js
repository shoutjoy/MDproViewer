(function (global) {
    'use strict';

    var menuBound = false;

    function closeMenu() {
        var panel = document.getElementById('tidy-quick-panel');
        if (panel) panel.classList.add('hidden');
    }

    function toggleMenu(forceOpen) {
        var panel = document.getElementById('tidy-quick-panel');
        var btn = document.getElementById('btn-tidy-quick');
        if (!panel || !btn) return;
        bindDismiss();
        var shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !shouldOpen);
    }

    function bindDismiss() {
        if (menuBound || !document.body) return;
        menuBound = true;
        document.body.addEventListener('click', function (event) {
            var panel = document.getElementById('tidy-quick-panel');
            var btn = document.getElementById('btn-tidy-quick');
            if (!panel || !btn) return;
            var target = event.target;
            if (panel.contains(target) || btn.contains(target)) return;
            panel.classList.add('hidden');
        });
    }

    function getEditorState(deps) {
        deps = deps || {};
        var ta = deps.editorTextarea || document.getElementById('viewer-edit-ta');
        return {
            isEditMode: !!deps.isEditMode,
            editorTextarea: ta
        };
    }

    function applyResultToEditor(result, sourceText, deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        var editorTextarea = state.editorTextarea;
        if (!editorTextarea) return false;

        var start = editorTextarea.selectionStart;
        var end = editorTextarea.selectionEnd;
        var scrollTop = editorTextarea.scrollTop;
        var scrollLeft = editorTextarea.scrollLeft;
        var selectionDirection = editorTextarea.selectionDirection || 'none';
        var hasSelection = start !== end;

        if (hasSelection) {
            var fullText = editorTextarea.value;
            editorTextarea.value = fullText.substring(0, start) + result.value + fullText.substring(end);
        } else {
            editorTextarea.value = result.value;
        }
        if (typeof deps.setCurrentMarkdown === 'function') deps.setCurrentMarkdown(editorTextarea.value);

        editorTextarea.focus();
        if (hasSelection) editorTextarea.setSelectionRange(start, start + result.value.length, selectionDirection);
        else editorTextarea.setSelectionRange(start, end, selectionDirection);
        editorTextarea.scrollTop = scrollTop;
        editorTextarea.scrollLeft = scrollLeft;
        requestAnimationFrame(function () {
            if (!editorTextarea) return;
            editorTextarea.scrollTop = scrollTop;
            editorTextarea.scrollLeft = scrollLeft;
        });
        if (typeof deps.renderMarkdown === 'function') deps.renderMarkdown();
        if (deps.activeSidebarTab === 'toc' && typeof deps.renderTOC === 'function') deps.renderTOC();
        if (typeof deps.performAutoSave === 'function') deps.performAutoSave();
        return true;
    }

    function applyEnter(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('Use this in edit mode.');
            return;
        }
        closeMenu();

        var ta = state.editorTextarea;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var hasSelection = start !== end;
        var sourceText = hasSelection ? ta.value.substring(start, end) : ta.value;
        var tidyFn = deps.tidySeparatorSpacing || global.tidySeparatorSpacing;
        if (typeof tidyFn !== 'function') {
            if (typeof deps.showToast === 'function') deps.showToast('Tidy function is not available.');
            return;
        }
        var result = tidyFn(sourceText);

        if (!result || !result.changed) {
            if (typeof deps.showToast === 'function') deps.showToast('No spacing changes were needed.');
            return;
        }
        applyResultToEditor(result, sourceText, deps);
        var tidyChanges = Array.isArray(result.changes) ? result.changes.filter(Boolean) : [];
        if (typeof deps.showToast === 'function') {
            deps.showToast(tidyChanges.length ? ('엔터정리 적용: ' + tidyChanges.join(', ')) : '엔터정리 적용');
        }
    }

    function applyMath(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('Use this in edit mode.');
            return;
        }
        closeMenu();

        var ta = state.editorTextarea;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var hasSelection = start !== end;
        var sourceText = hasSelection ? ta.value.substring(start, end) : ta.value;
        var trt = deps.specialTRT || global.specialTRT;
        var result = (trt && typeof trt.analyzeMathTidyChanges === 'function')
            ? trt.analyzeMathTidyChanges(sourceText)
            : { value: sourceText, changes: [] };

        if (!result || result.value === sourceText) {
            if (typeof deps.showToast === 'function') deps.showToast('수식정리에서 바꿀 내용이 없습니다.');
            return;
        }
        applyResultToEditor(result, sourceText, deps);
        if (typeof deps.showToast === 'function') deps.showToast('수식정리 적용: \\[→$, \\]→$, \\(→, \\)→');
    }

    global.TidyActions = {
        closeMenu: closeMenu,
        toggleMenu: toggleMenu,
        applyEnter: applyEnter,
        applyMath: applyMath
    };
})(window);

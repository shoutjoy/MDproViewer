(function (global) {
    'use strict';

    var menuBound = false;
    var base64ConversionBusy = false;

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

    function formatHtml(source) {
        var value = String(source == null ? '' : source).trim();
        if (!value || !/<\/?[a-z][^>]*>/i.test(value)) return value;

        var blockTags = 'address|article|aside|blockquote|body|caption|colgroup|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|legend|li|main|menu|nav|ol|optgroup|option|p|pre|section|summary|table|tbody|td|tfoot|th|thead|title|tr|ul';
        var blockToken = new RegExp('(<\\/?(?:' + blockTags + ')(?:\\s[^>]*)?\\s*\\/?>)', 'gi');
        var openingBlock = new RegExp('^<(?:' + blockTags + ')(?:\\s[^>]*)?>$', 'i');
        var closingBlock = new RegExp('^<\\/(?:' + blockTags + ')\\s*>$', 'i');
        var selfClosingBlock = new RegExp('^<(?:hr|col)(?:\\s[^>]*)?\\s*\\/?>$', 'i');

        var lines = value
            .replace(/\r\n?/g, '\n')
            .replace(/>\s+</g, '><')
            .replace(blockToken, '\n$1\n')
            .split('\n')
            .map(function (line) { return line.trim(); })
            .filter(Boolean);
        var indent = 0;
        var output = [];
        lines.forEach(function (line) {
            if (closingBlock.test(line)) indent = Math.max(0, indent - 1);
            output.push('  '.repeat(indent) + line);
            if (openingBlock.test(line) && !selfClosingBlock.test(line) && !/\/$/.test(line.replace(/>$/, ''))) {
                indent += 1;
            }
        });
        return output.join('\n');
    }

    function applyHtml(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('편집 모드에서 사용하세요.');
            return;
        }
        closeMenu();

        var ta = state.editorTextarea;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var sourceText = start !== end ? ta.value.substring(start, end) : ta.value;
        var formatted = formatHtml(sourceText);
        if (!formatted || formatted === sourceText) {
            if (typeof deps.showToast === 'function') deps.showToast('HTML정리에서 바꿀 내용이 없습니다.');
            return;
        }
        applyResultToEditor({ value: formatted }, sourceText, deps);
        if (typeof deps.showToast === 'function') deps.showToast('HTML 문서의 줄바꿈과 들여쓰기를 정리했습니다.');
    }

    async function applyBase64ToUrl(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('편집 모드에서 사용하세요.');
            return;
        }
        if (base64ConversionBusy) {
            if (typeof deps.showToast === 'function') deps.showToast('Base64 이미지를 변환하고 있습니다.');
            return;
        }

        var imageDb = deps.imageDb || global.ImageDB;
        var db = deps.db;
        if (!db || !imageDb || typeof imageDb.convertBase64ImagesInMarkdown !== 'function') {
            if (typeof deps.showToast === 'function') deps.showToast('IndexedDB 이미지 저장소가 아직 준비되지 않았습니다.');
            return;
        }

        closeMenu();
        var ta = state.editorTextarea;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var hasSelection = start !== end;
        var originalText = ta.value;
        var sourceText = hasSelection ? originalText.substring(start, end) : originalText;

        base64ConversionBusy = true;
        try {
            var result = await imageDb.convertBase64ImagesInMarkdown(db, sourceText);
            if (!result || !result.convertedCount) {
                if (typeof deps.showToast === 'function') deps.showToast('변환할 Base64 Markdown 이미지가 없습니다.');
                return;
            }
            if (ta.value !== originalText) {
                if (typeof deps.showToast === 'function') deps.showToast('변환 중 문서가 변경되었습니다. 다시 실행하세요.');
                return;
            }

            if (hasSelection) {
                ta.value = originalText.substring(0, start) + result.markdown + originalText.substring(end);
            } else {
                ta.value = result.markdown;
            }
            if (typeof deps.setCurrentMarkdown === 'function') deps.setCurrentMarkdown(ta.value);
            ta.focus();
            if (hasSelection) ta.setSelectionRange(start, start + result.markdown.length, ta.selectionDirection || 'none');
            else ta.setSelectionRange(Math.min(start, ta.value.length), Math.min(start, ta.value.length));
            if (typeof deps.renderMarkdown === 'function') deps.renderMarkdown();
            if (deps.activeSidebarTab === 'toc' && typeof deps.renderTOC === 'function') deps.renderTOC();
            if (typeof deps.performAutoSave === 'function') deps.performAutoSave();

            if (typeof deps.showToast === 'function') {
                var scope = hasSelection ? '선택 영역' : '문서 전체';
                var stored = Number(result.storedCount || result.convertedCount);
                deps.showToast(scope + ' Base64 이미지 ' + result.convertedCount + '개를 internal:// 링크로 변환했습니다. (IndexedDB ' + stored + '개 저장, MDD 저장 가능)');
            }
        } catch (error) {
            if (typeof deps.showToast === 'function') {
                deps.showToast('Base64 이미지 변환 실패: ' + (error && error.message ? error.message : error));
            }
        } finally {
            base64ConversionBusy = false;
        }
    }

    global.TidyActions = {
        closeMenu: closeMenu,
        toggleMenu: toggleMenu,
        applyEnter: applyEnter,
        applyMath: applyMath,
        applyHtml: applyHtml,
        applyBase64ToUrl: applyBase64ToUrl,
        formatHtml: formatHtml
    };
})(window);

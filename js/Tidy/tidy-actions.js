(function (global) {
    'use strict';

    var menuBound = false;
    function formatNoteCoverBlocks(source) {
        var input = String(source == null ? '' : source);
        var formattedCount = 0;
        var invalidCount = 0;
        var foundCount = 0;
        var value = input.replace(/<!--\s*note-cover\b([\s\S]*?)-->/gi, function (whole, jsonText) {
            foundCount += 1;
            try {
                var config = JSON.parse(String(jsonText || '').trim());
                var next = '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
                if (next !== whole) formattedCount += 1;
                return next;
            } catch (_) {
                invalidCount += 1;
                return whole;
            }
        });
        return {
            value: value,
            changed: value !== input,
            foundCount: foundCount,
            formattedCount: formattedCount,
            invalidCount: invalidCount
        };
    }

    function closeMenu() {
        var panel = document.getElementById('tidy-quick-panel');
        if (panel) panel.classList.add('hidden');
    }

    function positionMenu(panel, btn) {
        if (!panel || !btn || !document.body) return;
        if (typeof document.body.appendChild === 'function' && panel.parentNode !== document.body) {
            document.body.appendChild(panel);
        }
        panel.classList.add('tidy-menu-portal');
        var viewportWidth = Math.max(240, Number(global.innerWidth) || 1024);
        var viewportHeight = Math.max(240, Number(global.innerHeight) || 768);
        var buttonRect = btn.getBoundingClientRect();
        var panelWidth = Math.min(280, Math.max(224, viewportWidth - 16));
        var left = buttonRect.left;
        if (left + panelWidth > viewportWidth - 8) left = buttonRect.right - panelWidth;
        left = Math.max(8, Math.min(left, viewportWidth - panelWidth - 8));
        panel.style.setProperty('--tidy-menu-left', left + 'px');
        panel.style.setProperty('--tidy-menu-width', panelWidth + 'px');

        var panelHeight = Math.max(0, panel.getBoundingClientRect().height);
        var top = buttonRect.bottom + 6;
        if (top + panelHeight > viewportHeight - 8 && buttonRect.top - panelHeight - 6 >= 8) {
            top = buttonRect.top - panelHeight - 6;
        }
        panel.style.setProperty('--tidy-menu-top', Math.max(8, top) + 'px');
    }

    function repositionOpenMenu() {
        var panel = document.getElementById('tidy-quick-panel');
        var btn = document.getElementById('btn-tidy-quick');
        if (!panel || !btn || panel.classList.contains('hidden')) return;
        positionMenu(panel, btn);
    }

    function toggleMenu(forceOpen) {
        var panel = document.getElementById('tidy-quick-panel');
        var btn = document.getElementById('btn-tidy-quick');
        if (!panel || !btn) return;
        bindDismiss();
        var shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !shouldOpen);
        if (shouldOpen) positionMenu(panel, btn);
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
        if (typeof global.addEventListener === 'function') {
            global.addEventListener('resize', repositionOpenMenu);
            global.addEventListener('scroll', repositionOpenMenu, true);
        }
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

        var hasExplicitRange = result && Number.isInteger(result.selectionStart) && Number.isInteger(result.selectionEnd);
        var start = hasExplicitRange ? result.selectionStart : editorTextarea.selectionStart;
        var end = hasExplicitRange ? result.selectionEnd : editorTextarea.selectionEnd;
        var scrollTop = editorTextarea.scrollTop;
        var scrollLeft = editorTextarea.scrollLeft;
        var selectionDirection = editorTextarea.selectionDirection || 'none';
        var hasSelection = hasExplicitRange ? !!result.replaceSelection : start !== end;

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

    function applyHtmlToMarkdown(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('편집 모드에서 사용하세요.');
            return false;
        }
        closeMenu();

        var converter = global.TidyHtmlToMarkdown;
        if (!converter || typeof converter.convert !== 'function') {
            if (typeof deps.showToast === 'function') deps.showToast('HTML2MD 변환 모듈을 불러오지 못했습니다.');
            return false;
        }
        var ta = state.editorTextarea;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var hasSelection = start !== end;
        var sourceText = hasSelection ? ta.value.substring(start, end) : ta.value;
        var result = converter.convert(sourceText);
        if (!result.foundHtml) {
            if (typeof deps.showToast === 'function') deps.showToast('변환할 HTML 태그가 없습니다.');
            return false;
        }
        if (result.error) {
            if (typeof deps.showToast === 'function') deps.showToast(result.issues[0].reason);
            return false;
        }
        if (!result.changed) {
            if (typeof deps.showToast === 'function') deps.showToast('HTML2MD에서 바꿀 내용이 없습니다.');
            return false;
        }

        applyResultToEditor(result, sourceText, deps);
        var scope = hasSelection ? '선택 영역' : '문서 전체';
        if (result.issues.length && typeof converter.showReport === 'function') {
            converter.showReport(result, scope);
            if (typeof deps.showToast === 'function') deps.showToast(scope + ' HTML2MD 변환 완료 · 제한 항목 ' + result.issues.length + '종');
        } else if (typeof deps.showToast === 'function') {
            deps.showToast(scope + ' HTML을 Markdown으로 변환했습니다.');
        }
        return result;
    }

    function applyNoteCover(deps) {
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
        var hasSelection = start !== end;
        var sourceText = hasSelection ? ta.value.substring(start, end) : ta.value;
        var result = formatNoteCoverBlocks(sourceText);
        if (!result.foundCount) {
            if (typeof deps.showToast === 'function') deps.showToast('정리할 note-cover 블록이 없습니다.');
            return;
        }
        if (result.invalidCount) {
            if (!result.changed) {
                if (typeof deps.showToast === 'function') {
                    deps.showToast('note-cover JSON 오류 ' + result.invalidCount + '개가 있어 정리하지 못했습니다.');
                }
                return;
            }
        }
        if (!result.changed) {
            if (typeof deps.showToast === 'function') deps.showToast('note-cover가 이미 보기 좋게 정리되어 있습니다.');
            return;
        }
        applyResultToEditor(result, sourceText, deps);
        if (typeof deps.showToast === 'function') {
            var scope = hasSelection ? '선택 영역' : '문서 전체';
            var skipped = result.invalidCount ? (' (JSON 오류 ' + result.invalidCount + '개 제외)') : '';
            deps.showToast(scope + ' note-cover ' + result.formattedCount + '개를 JSON 들여쓰기로 정리했습니다.' + skipped);
        }
    }

    function applyInlineToRef(deps, mode) {
        deps = deps || {};
        var state = getEditorState(deps);
        if (!state.isEditMode || !state.editorTextarea) {
            if (typeof deps.showToast === 'function') deps.showToast('편집 모드에서 사용하세요.');
            return false;
        }
        closeMenu();

        var converter = global.TidyInlineToRef;
        if (!converter || typeof converter.convert !== 'function') {
            if (typeof deps.showToast === 'function') deps.showToast('Inline2Ref 변환 모듈을 불러오지 못했습니다.');
            return false;
        }
        var ta = state.editorTextarea;
        var sourceText = ta.value;
        var outputMode = mode === 'footnote' ? 'footnote' : 'reference';
        var result = converter.convert(sourceText, { mode: outputMode });
        if (!result.changed) {
            if (typeof deps.showToast === 'function') deps.showToast('참고문헌으로 옮길 인라인 URL 링크가 없습니다.');
            return false;
        }

        result.selectionStart = 0;
        result.selectionEnd = sourceText.length;
        result.replaceSelection = true;
        applyResultToEditor(result, sourceText, deps);
        if (typeof deps.showToast === 'function') {
            var modeLabel = outputMode === 'footnote' ? '주석링크' : '인라인링크';
            deps.showToast('Inline2Ref ' + modeLabel + ' 완료: 전체 번호 재정렬 · 인용 ' + result.convertedCount + '개 · 참고문헌 ' + result.referenceCount + '개');
        }
        return result;
    }

    function applyBase64ToUrl(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        closeMenu();
        if (state.isEditMode && state.editorTextarea && global.TidyImageRecovery && typeof global.TidyImageRecovery.applyBase64ToUrl === 'function') {
            return global.TidyImageRecovery.applyBase64ToUrl(deps, function (result, sourceText) {
                return applyResultToEditor(result, sourceText, deps);
            });
        }
        if (typeof deps.showToast === 'function') {
            var isEditMode = !!state.isEditMode && !!state.editorTextarea;
            deps.showToast(isEditMode
                ? 'Base64 이미지 변환 모듈을 불러오지 못했습니다.'
                : '편집 모드에서 사용하세요.');
        }
    }

    function applyUrl2base64(deps) {
        deps = deps || {};
        var state = getEditorState(deps);
        closeMenu();
        if (state.isEditMode && state.editorTextarea && global.TidyImageRecovery && typeof global.TidyImageRecovery.applyUrl2base64 === 'function') {
            return global.TidyImageRecovery.applyUrl2base64(deps, function (result, sourceText) {
                return applyResultToEditor(result, sourceText, deps);
            });
        }
        if (typeof deps.showToast === 'function') {
            deps.showToast(state.isEditMode && state.editorTextarea
                ? '내부 이미지 Base64 변환 모듈을 불러오지 못했습니다.'
                : '편집 모드에서 사용하세요.');
        }
    }

    global.TidyActions = {
        closeMenu: closeMenu,
        toggleMenu: toggleMenu,
        applyEnter: applyEnter,
        applyMath: applyMath,
        applyHtml: applyHtml,
        applyHtmlToMarkdown: applyHtmlToMarkdown,
        applyNoteCover: applyNoteCover,
        applyInlineToRef: applyInlineToRef,
        applyBase64ToUrl: applyBase64ToUrl,
        applyUrl2base64: applyUrl2base64,
        formatHtml: formatHtml,
        formatNoteCoverBlocks: formatNoteCoverBlocks,
        applyResultToEditor: applyResultToEditor
    };
})(window);

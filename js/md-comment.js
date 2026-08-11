(function (root, factory) {
    const api = factory(root);

    if (!root && typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (!root) return;

    root.MDComment = api;
    if (!root.document) return;

    const start = function () {
        api.initEditor(root.document);
    };
    if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})(typeof window !== 'undefined' ? window : null, function (root) {
    const OPEN = '<!--';
    const CLOSE = '-->';
    const DEFAULT_HIGHLIGHT_OPTIONS = Object.freeze({
        largeDocumentThreshold: 200000,
        plainTextThreshold: 300000,
        largeDocumentDelayMs: 48
    });
    const DEFAULT_EDITOR_COMMENT_COLORS = Object.freeze({
        light: '#f59e0b',
        dark: '#facc15'
    });
    let activeEditorDebugState = null;

    function normalizePositiveNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }

    function normalizeEditorCommentColor(value, fallback) {
        const candidate = String(value == null ? '' : value).trim();
        return /^#[0-9a-f]{6}$/i.test(candidate)
            ? candidate.toLowerCase()
            : String(fallback || '#facc15').toLowerCase();
    }

    function getHighlightOptions() {
        const configured = root && root.MD_COMMENT_HIGHLIGHT_OPTIONS
            ? root.MD_COMMENT_HIGHLIGHT_OPTIONS
            : {};
        const largeDocumentThreshold = normalizePositiveNumber(
            configured.largeDocumentThreshold,
            DEFAULT_HIGHLIGHT_OPTIONS.largeDocumentThreshold
        );
        return {
            largeDocumentThreshold: largeDocumentThreshold,
            plainTextThreshold: Math.max(
                largeDocumentThreshold,
                normalizePositiveNumber(configured.plainTextThreshold, DEFAULT_HIGHLIGHT_OPTIONS.plainTextThreshold)
            ),
            largeDocumentDelayMs: normalizePositiveNumber(
                configured.largeDocumentDelayMs,
                DEFAULT_HIGHLIGHT_OPTIONS.largeDocumentDelayMs
            )
        };
    }

    function getHighlightMode(value, options) {
        const source = String(value == null ? '' : value);
        const settings = options || DEFAULT_HIGHLIGHT_OPTIONS;
        if (source.indexOf(OPEN) < 0) return 'native';
        if (source.length >= settings.plainTextThreshold) return 'plain-large';
        if (source.length >= settings.largeDocumentThreshold) return 'mirror-large';
        return 'mirror';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function stripForRender(value) {
        return String(value == null ? '' : value).replace(/<!--[\s\S]*?-->/g, function (comment) {
            // note-cover is application metadata that must reach NoteCoverRenderer.
            if (/^<!--\s*note-cover\b/i.test(comment)) return comment;
            return comment.replace(/[^\r\n]/g, '');
        });
    }

    function createHighlightMarkup(value) {
        const source = String(value == null ? '' : value);
        const parts = [];
        let cursor = 0;

        while (cursor < source.length) {
            const openAt = source.indexOf(OPEN, cursor);
            if (openAt < 0) {
                parts.push(escapeHtml(source.slice(cursor)));
                break;
            }
            parts.push(escapeHtml(source.slice(cursor, openAt)));
            const closeAt = source.indexOf(CLOSE, openAt + OPEN.length);
            const commentEnd = closeAt < 0 ? source.length : closeAt + CLOSE.length;
            parts.push('<span class="md-editor-comment">' + escapeHtml(source.slice(openAt, commentEnd)) + '</span>');
            cursor = commentEnd;
        }

        if (source.endsWith('\n')) parts.push('\u200b');
        return parts.join('');
    }

    function getToggleReplacement(selectedText) {
        const selected = String(selectedText == null ? '' : selectedText);
        if (selected.startsWith(OPEN) && selected.endsWith(CLOSE)) {
            let inner = selected.slice(OPEN.length, selected.length - CLOSE.length);
            if (inner.startsWith(' ') && inner.endsWith(' ') && inner.length >= 2) {
                inner = inner.slice(1, -1);
            }
            return { replacement: inner, commented: false };
        }
        return { replacement: OPEN + ' ' + selected + ' ' + CLOSE, commented: true };
    }

    function initEditor(doc) {
        const textarea = doc.getElementById('viewer-edit-ta');
        const mirror = doc.getElementById('viewer-edit-highlight');
        const wrapper = doc.getElementById('editor-doc-wrap');
        if (!textarea || !mirror || !wrapper || textarea.__mdCommentEditorBound) return false;

        textarea.__mdCommentEditorBound = true;
        wrapper.classList.add('md-comment-editor-wrap');
        const highlightOptions = getHighlightOptions();
        let highlightFrameId = null;
        let highlightTimerId = null;
        let pendingForce = false;
        let geometryDirty = true;
        let isComposing = false;
        let lastRenderedValue = null;
        let lastRenderedMarkup = null;
        let lastMode = '';
        let lastGeometrySignature = '';
        let largeModeNoticeShown = false;
        const debugState = {
            scheduleRequests: 0,
            refreshCount: 0,
            rafRuns: 0,
            timerRuns: 0,
            geometrySyncs: 0,
            markupWrites: 0,
            skippedUnchanged: 0,
            nativeFastPathRuns: 0,
            largePlainPathRuns: 0,
            lastDurationMs: 0,
            maxDurationMs: 0,
            lastMode: '',
            lastChars: 0
        };
        activeEditorDebugState = debugState;

        const typographyProperties = [
            'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontVariant',
            'fontStretch', 'lineHeight', 'letterSpacing', 'wordSpacing',
            'textAlign', 'textIndent', 'textTransform', 'tabSize',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
        ];

        function getNow() {
            return root.performance && typeof root.performance.now === 'function'
                ? root.performance.now()
                : Date.now();
        }

        function syncGeometry() {
            const computed = root.getComputedStyle(textarea);
            const values = typographyProperties.map(function (property) {
                return computed[property];
            });
            const width = textarea.clientWidth;
            const height = textarea.clientHeight;
            const signature = values.join('\u0001') + '\u0002' + width + '\u0002' + height;
            geometryDirty = false;
            if (signature === lastGeometrySignature) return false;

            typographyProperties.forEach(function (property, index) {
                mirror.style[property] = values[index];
            });
            mirror.style.width = width + 'px';
            mirror.style.height = height + 'px';
            lastGeometrySignature = signature;
            debugState.geometrySyncs += 1;
            return true;
        }

        function syncScroll() {
            mirror.scrollTop = textarea.scrollTop;
            mirror.scrollLeft = textarea.scrollLeft;
        }

        function applyHighlightMode(mode) {
            const mirrorEnabled = mode === 'mirror' || mode === 'mirror-large';
            wrapper.dataset.mdCommentHighlightMode = mode;
            textarea.dataset.mdCommentHighlightMode = mode;
            textarea.classList.toggle('md-comment-editor-input', mirrorEnabled);
            mirror.hidden = !mirrorEnabled;
            if (!mirrorEnabled && mirror.innerHTML) {
                mirror.innerHTML = '';
                lastRenderedMarkup = '';
                debugState.markupWrites += 1;
            }
            if (mode === 'plain-large' && !largeModeNoticeShown) {
                largeModeNoticeShown = true;
                if (typeof root.showToast === 'function') {
                    root.showToast('대용량 문서에서는 입력 속도를 위해 주석 색상 표시를 단순화합니다.');
                }
            }
        }

        function refresh(force) {
            if (isComposing && !force) return false;
            const startedAt = getNow();
            const source = textarea.value;
            const mode = getHighlightMode(source, highlightOptions);
            debugState.refreshCount += 1;
            debugState.lastChars = source.length;
            debugState.lastMode = mode;

            if (geometryDirty) syncGeometry();
            if (!force && source === lastRenderedValue && mode === lastMode) {
                debugState.skippedUnchanged += 1;
                syncScroll();
                return false;
            }

            applyHighlightMode(mode);
            if (mode === 'mirror' || mode === 'mirror-large') {
                const nextMarkup = createHighlightMarkup(source);
                if (nextMarkup !== lastRenderedMarkup) {
                    mirror.innerHTML = nextMarkup;
                    lastRenderedMarkup = nextMarkup;
                    debugState.markupWrites += 1;
                }
            } else if (mode === 'native') {
                debugState.nativeFastPathRuns += 1;
            } else if (mode === 'plain-large') {
                debugState.largePlainPathRuns += 1;
            }

            lastRenderedValue = source;
            lastMode = mode;
            syncScroll();
            const duration = getNow() - startedAt;
            debugState.lastDurationMs = duration;
            debugState.maxDurationMs = Math.max(debugState.maxDurationMs, duration);
            return true;
        }

        function requestHighlightFrame() {
            if (highlightFrameId !== null) return;
            highlightFrameId = root.requestAnimationFrame(function () {
                highlightFrameId = null;
                debugState.rafRuns += 1;
                const force = pendingForce;
                pendingForce = false;
                refresh(force);
            });
        }

        function scheduleHighlightRefresh(request) {
            const options = request || {};
            debugState.scheduleRequests += 1;
            if (options.geometry) geometryDirty = true;
            if (options.force) pendingForce = true;
            if (isComposing && !options.force) return;

            const useDelay = !options.force
                && textarea.value.length >= highlightOptions.largeDocumentThreshold
                && highlightOptions.largeDocumentDelayMs > 0;
            if (useDelay) {
                if (highlightTimerId !== null) root.clearTimeout(highlightTimerId);
                highlightTimerId = root.setTimeout(function () {
                    highlightTimerId = null;
                    debugState.timerRuns += 1;
                    requestHighlightFrame();
                }, highlightOptions.largeDocumentDelayMs);
                return;
            }
            if (highlightTimerId !== null) {
                root.clearTimeout(highlightTimerId);
                highlightTimerId = null;
            }
            requestHighlightFrame();
        }

        function toggleSelectedComment(event) {
            if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return false;
            if (event.code !== 'Slash' && event.key !== '/') return false;
            if (doc.activeElement !== textarea && event.target !== textarea) return false;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start === end) {
                if (typeof root.showToast === 'function') root.showToast('주석 처리할 영역을 먼저 선택하세요.');
                return true;
            }

            const selected = textarea.value.slice(start, end);
            const result = getToggleReplacement(selected);
            textarea.focus();
            textarea.setSelectionRange(start, end);

            let inserted = false;
            try {
                inserted = !!doc.execCommand('insertText', false, result.replacement);
            } catch (_) {}
            if (!inserted) {
                textarea.setRangeText(result.replacement, start, end, 'select');
                textarea.dispatchEvent(new root.Event('input', { bubbles: true }));
            }
            textarea.setSelectionRange(start, start + result.replacement.length);
            scheduleHighlightRefresh({ force: true });

            if (typeof root.showToast === 'function') {
                root.showToast(result.commented ? '선택 영역을 주석 처리했습니다.' : '선택 영역의 주석을 해제했습니다.');
            }
            return true;
        }

        textarea.addEventListener('input', function () {
            scheduleHighlightRefresh();
        });
        textarea.addEventListener('scroll', syncScroll, { passive: true });
        textarea.addEventListener('compositionstart', function () {
            isComposing = true;
        });
        textarea.addEventListener('compositionend', function () {
            isComposing = false;
            scheduleHighlightRefresh({ force: true });
        });
        root.addEventListener('resize', function () {
            scheduleHighlightRefresh({ geometry: true });
        });
        root.addEventListener('keydown', toggleSelectedComment, true);

        const valueDescriptor = Object.getOwnPropertyDescriptor(root.HTMLTextAreaElement.prototype, 'value');
        if (valueDescriptor && valueDescriptor.get && valueDescriptor.set) {
            Object.defineProperty(textarea, 'value', {
                configurable: true,
                get: function () { return valueDescriptor.get.call(this); },
                set: function (nextValue) {
                    valueDescriptor.set.call(this, nextValue);
                    scheduleHighlightRefresh();
                }
            });
        }

        if (typeof root.ResizeObserver === 'function') {
            const resizeObserver = new root.ResizeObserver(function () {
                scheduleHighlightRefresh({ geometry: true });
            });
            resizeObserver.observe(textarea);
        }
        if (typeof root.MutationObserver === 'function') {
            const styleObserver = new root.MutationObserver(function () {
                scheduleHighlightRefresh({ geometry: true });
            });
            styleObserver.observe(textarea, { attributes: true, attributeFilter: ['class', 'style'] });
            const viewport = doc.getElementById('content-viewport');
            if (viewport) styleObserver.observe(viewport, { attributes: true, attributeFilter: ['class', 'style'] });
        }

        root.refreshMarkdownCommentHighlight = function (options) {
            scheduleHighlightRefresh(options || { force: true, geometry: true });
        };
        root.getMarkdownCommentPerformanceState = function () {
            return Object.assign({}, debugState);
        };
        scheduleHighlightRefresh({ force: true, geometry: true });
        return true;
    }

    return {
        stripForRender: stripForRender,
        createHighlightMarkup: createHighlightMarkup,
        getToggleReplacement: getToggleReplacement,
        getHighlightMode: getHighlightMode,
        normalizeEditorCommentColor: normalizeEditorCommentColor,
        getEditorDebugState: function () {
            return activeEditorDebugState ? Object.assign({}, activeEditorDebugState) : null;
        },
        DEFAULT_HIGHLIGHT_OPTIONS: DEFAULT_HIGHLIGHT_OPTIONS,
        DEFAULT_EDITOR_COMMENT_COLORS: DEFAULT_EDITOR_COMMENT_COLORS,
        initEditor: initEditor
    };
});

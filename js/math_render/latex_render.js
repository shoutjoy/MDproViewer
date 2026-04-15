(function (global) {
    'use strict';

    var DEFAULT_ENGINE = 'auto';
    var DEFAULT_KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    var DEFAULT_KATEX_JS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function isWrapped(text, left, right) {
        var s = String(text || '').trim();
        return s.slice(0, left.length) === left && s.slice(-right.length) === right;
    }

    function unwrapLatexSource(text) {
        var s = String(text || '').trim();
        if (isWrapped(s, '\\[', '\\]')) return { body: s.slice(2, -2).trim(), mode: 'display' };
        if (isWrapped(s, '\\(', '\\)')) return { body: s.slice(2, -2).trim(), mode: 'inline' };
        if (isWrapped(s, '$$', '$$')) return { body: s.slice(2, -2).trim(), mode: 'display' };
        if (isWrapped(s, '$', '$')) return { body: s.slice(1, -1).trim(), mode: 'inline' };
        return null;
    }

    function normalizeLatexSource(source, options) {
        var opts = options || {};
        var mode = opts.mode === 'inline' ? 'inline' : 'display';
        var text = String(source == null ? '' : source).trim();
        if (!text) return mode === 'inline' ? '\\(\\)' : '\\[\\]';

        if (
            isWrapped(text, '\\[', '\\]') ||
            isWrapped(text, '\\(', '\\)') ||
            isWrapped(text, '$$', '$$') ||
            isWrapped(text, '$', '$')
        ) {
            return text;
        }

        return mode === 'inline'
            ? '\\(' + text + '\\)'
            : '\\[' + text + '\\]';
    }

    function getTargetWindow(target, options) {
        if (options && options.targetWindow) return options.targetWindow;
        try {
            if (target && target.ownerDocument && target.ownerDocument.defaultView) {
                return target.ownerDocument.defaultView;
            }
        } catch (_) {}
        return global;
    }

    function getEngine(options) {
        var engine = String((options && options.engine) || DEFAULT_ENGINE || 'auto').toLowerCase();
        if (engine === 'katex' || engine === 'mathjax' || engine === 'auto') return engine;
        return 'auto';
    }

    function canUseKatex(targetWindow) {
        return !!(targetWindow && targetWindow.katex && typeof targetWindow.katex.render === 'function');
    }

    function renderWithKatex(target, normalized, options) {
        var opts = options || {};
        var targetWindow = getTargetWindow(target, opts);
        if (!canUseKatex(targetWindow)) return false;

        var unwrapped = unwrapLatexSource(normalized) || {
            body: String(normalized || ''),
            mode: opts.mode === 'inline' ? 'inline' : 'display'
        };

        try {
            if (opts.append === true) {
                var wrapper = target.ownerDocument.createElement(unwrapped.mode === 'inline' ? 'span' : 'div');
                target.appendChild(wrapper);
                targetWindow.katex.render(unwrapped.body, wrapper, {
                    displayMode: unwrapped.mode !== 'inline',
                    throwOnError: false,
                    strict: 'warn',
                    trust: false
                });
                return true;
            }

            targetWindow.katex.render(unwrapped.body, target, {
                displayMode: unwrapped.mode !== 'inline',
                throwOnError: false,
                strict: 'warn',
                trust: false
            });
            return true;
        } catch (err) {
            if (opts.silent !== true && targetWindow.console && typeof targetWindow.console.warn === 'function') {
                targetWindow.console.warn('[LatexRender] KaTeX render failed, falling back to MathJax:', err);
            }
            return false;
        }
    }

    function renderWithMathJax(target, normalized, options) {
        var opts = options || {};

        if (opts.append === true) {
            var wrapper = target.ownerDocument.createElement(opts.mode === 'inline' ? 'span' : 'div');
            wrapper.textContent = normalized;
            target.appendChild(wrapper);
        } else {
            target.textContent = normalized;
        }

        if (typeof global.MathRender === 'undefined' || !global.MathRender || typeof global.MathRender.typesetWhenReady !== 'function') {
            return Promise.resolve(false);
        }

        return global.MathRender.typesetWhenReady(target, {
            silent: opts.silent !== false,
            targetWindow: getTargetWindow(target, opts)
        });
    }

    var LatexRender = {
        defaultEngine: DEFAULT_ENGINE,
        katexCssUrl: DEFAULT_KATEX_CSS_URL,
        katexJsUrl: DEFAULT_KATEX_JS_URL,
        setDefaultEngine: function (engine) {
            DEFAULT_ENGINE = getEngine({ engine: engine });
            this.defaultEngine = DEFAULT_ENGINE;
        },
        normalizeSource: function (source, options) {
            return normalizeLatexSource(source, options);
        },
        toHtml: function (source, options) {
            return escapeHtml(normalizeLatexSource(source, options));
        },
        getHeadTags: function (options) {
            var opts = options || {};
            var engine = getEngine(opts);
            var html = '';
            var katexCssUrl = opts.katexCssUrl || this.katexCssUrl;
            var katexJsUrl = opts.katexJsUrl || this.katexJsUrl;

            if (engine === 'auto' || engine === 'katex') {
                html += '<link rel="stylesheet" href="' + escapeHtml(katexCssUrl) + '">';
                html += '<script src="' + escapeHtml(katexJsUrl) + '"><\/script>';
            }
            if (engine === 'auto' || engine === 'mathjax') {
                if (typeof global.MathRender !== 'undefined' && global.MathRender && typeof global.MathRender.getHeadTags === 'function') {
                    html += global.MathRender.getHeadTags({
                        scriptUrl: opts.mathRenderScriptUrl || 'js/math_render/math_render.js',
                        mathJaxUrl: opts.mathJaxUrl
                    });
                }
            }
            return html;
        },
        renderToElement: function (target, source, options) {
            if (!target) return Promise.resolve(false);
            var opts = options || {};
            var normalized = normalizeLatexSource(source, opts);
            var engine = getEngine(opts);

            if ((engine === 'auto' || engine === 'katex') && renderWithKatex(target, normalized, opts)) {
                return Promise.resolve(true);
            }

            if (engine === 'katex') {
                return Promise.resolve(false);
            }

            return renderWithMathJax(target, normalized, opts);
        },
        buildDocumentHtml: function (title, bodyLatex, options) {
            var opts = options || {};
            var head = this.getHeadTags(opts);
            var normalized = normalizeLatexSource(bodyLatex, opts);
            return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>'
                + escapeHtml(title || 'LaTeX Render')
                + '</title>'
                + head
                + '</head><body><div id="latex-root">'
                + escapeHtml(normalized)
                + '</div><script>if(window.LatexRender){LatexRender.renderToElement(document.getElementById("latex-root"),'
                + JSON.stringify(normalized)
                + ',{mode:'
                + JSON.stringify(opts.mode === 'inline' ? 'inline' : 'display')
                + ',engine:'
                + JSON.stringify(getEngine(opts))
                + ',silent:true});}<\/script></body></html>';
        }
    };

    global.LatexRender = LatexRender;
})(window);

(function (global) {
    'use strict';

    var DEFAULT_CONFIG = {
        tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']]
        }
    };

    var DEFAULT_SCRIPT_URL = 'js/math_render/math_render.js';
    var DEFAULT_MATHJAX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js';

    function clone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function mergeDeep(base, extra) {
        var out = clone(base) || {};
        if (!extra || typeof extra !== 'object') return out;
        Object.keys(extra).forEach(function (key) {
            var next = extra[key];
            if (next && typeof next === 'object' && !Array.isArray(next)) {
                out[key] = mergeDeep(out[key] || {}, next);
            } else {
                out[key] = clone(next);
            }
        });
        return out;
    }

    function escAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function looksLikeMathText(text) {
        var s = String(text || '').trim();
        if (!s) return false;
        if (/[가-힣]{2,}/.test(s)) return false;
        if (/^[A-Za-z]{2,}$/.test(s)) return false;
        return /\\[A-Za-z]+|[_^=]|[+\-*/]|[{}]|[<>]|(?:^|[^A-Za-z])(?:Q|I|Y|v|w|k|n|p|x|y|z|mu|tau|sigma)(?:[^A-Za-z]|$)|\d/.test(s);
    }

    function looksLikeCitationText(text) {
        var s = String(text || '').trim();
        if (!s) return false;
        if (!/[A-Za-z]/.test(s)) return false;
        if (!/\d{3,4}/.test(s)) return false;
        if (!/[,&;]/.test(s)) return false;
        return true;
    }

    function normalizeLegacyMathDelimiters(raw) {
        var src = String(raw || '');
        var chunks = src.split(/(```[\s\S]*?```)/g);
        return chunks.map(function (chunk) {
            if (/^```[\s\S]*```$/.test(chunk)) return chunk;
            var normalized = String(chunk || '');
            var lines = normalized.split('\n');
            var rebuilt = [];
            var i = 0;

            while (i < lines.length) {
                var current = String(lines[i] || '');
                if (/^\s*\\\[\s*$/.test(current)) {
                    var mathLines = [];
                    var j = i + 1;
                    while (j < lines.length && !/^\s*\\\]\s*$/.test(String(lines[j] || ''))) {
                        mathLines.push(String(lines[j] || ''));
                        j += 1;
                    }
                    if (j < lines.length) {
                        rebuilt.push('$$\n' + mathLines.join('\n').trim() + '\n$$');
                        i = j + 1;
                        continue;
                    }
                }
                rebuilt.push(current);
                i += 1;
            }

            normalized = rebuilt.join('\n')
                .replace(/\\\s*\[([\s\S]*?)\\\s*\]/g, function (_, inner) {
                    return '$$\n' + String(inner || '').trim() + '\n$$';
                })
                .replace(/\\\s*\(([\s\S]*?)\\\s*\)/g, function (_, inner) {
                    return '$' + String(inner || '').trim() + '$';
                });

            lines = normalized.split('\n').map(function (line) {
                var m = line.match(/^(\s*)\[(.+?)\](\s*)$/);
                if (!m) return line;
                var inner = String(m[2] || '').trim();
                if (!looksLikeMathText(inner)) return line;
                return String(m[1] || '') + '\\[' + inner + '\\]' + String(m[3] || '');
            });

            return lines.join('\n').replace(/(^|[^\]\\\w])\(([^()\n]{1,120})\)(?=\s*[:.,;]|$)/g, function (match, prefix, inner) {
                var body = String(inner || '').trim();
                if (!looksLikeMathText(body)) return match;
                if (looksLikeCitationText(body)) return match;
                if (/[&;,]/.test(body) && /[A-Za-z]/.test(body)) return match;
                return String(prefix || '') + '\\(' + body + '\\)';
            });
        }).join('');
    }

    function getMarkdownParser(markdownParser) {
        if (typeof markdownParser === 'function') return markdownParser;
        if (markdownParser && typeof markdownParser.parse === 'function') {
            return function (input) {
                return markdownParser.parse(input);
            };
        }
        return null;
    }

    var MathRender = {
        scriptUrl: DEFAULT_SCRIPT_URL,
        mathJaxUrl: DEFAULT_MATHJAX_URL,
        createMathJaxConfig: function (overrides) {
            return mergeDeep(DEFAULT_CONFIG, overrides);
        },
        ensureWindowConfig: function (targetWindow, overrides) {
            var win = targetWindow || global;
            var current = (win && win.MathJax && typeof win.MathJax === 'object') ? win.MathJax : {};
            var merged = mergeDeep(this.createMathJaxConfig(), current);
            if (overrides && typeof overrides === 'object') merged = mergeDeep(merged, overrides);
            if (win) win.MathJax = merged;
            return merged;
        },
        getConfigScriptTag: function (overrides) {
            return '<script>window.MathJax=' + JSON.stringify(this.createMathJaxConfig(overrides)) + ';<\/script>';
        },
        getHeadTags: function (options) {
            var opts = options || {};
            var includeSelf = opts.includeSelf !== false;
            var scriptUrl = opts.scriptUrl || this.scriptUrl;
            var mathJaxUrl = opts.mathJaxUrl || this.mathJaxUrl;
            var html = '';
            if (includeSelf) html += '<script src="' + escAttr(scriptUrl) + '"><\/script>';
            html += this.getConfigScriptTag(opts.configOverrides);
            html += '<script src="' + escAttr(mathJaxUrl) + '"><\/script>';
            return html;
        },
        prepareMarkdown: function (raw) {
            return normalizeLegacyMathDelimiters(raw);
        },
        createMarkedInput: function (raw) {
            return this.protectMathSegments(this.prepareMarkdown(raw));
        },
        renderMarkdown: function (markdownParser, raw) {
            var parse = getMarkdownParser(markdownParser);
            var prepared = this.createMarkedInput(raw);
            if (!parse) return Promise.resolve(prepared.restoreHtml(prepared.text));
            try {
                return Promise.resolve(parse(prepared.text)).then(function (html) {
                    return prepared.restoreHtml(html || '');
                });
            } catch (err) {
                return Promise.reject(err);
            }
        },
        renderMarkdownSync: function (markdownParser, raw) {
            var parse = getMarkdownParser(markdownParser);
            var prepared = this.createMarkedInput(raw);
            if (!parse) return prepared.restoreHtml(prepared.text);
            var html = parse(prepared.text);
            if (html != null && typeof html.then === 'function') {
                throw new Error('MathRender.renderMarkdownSync does not support async markdown parsers.');
            }
            return prepared.restoreHtml(html || '');
        },
        renderMarkdownSafe: function (markdownParser, raw, options) {
            var opts = options || {};
            var fallbackText = opts.fallbackText != null ? opts.fallbackText : raw;
            var fallbackHtml = opts.fallbackHtml;
            if (fallbackHtml == null) {
                fallbackHtml = '<p>' + escapeHtml(fallbackText).replace(/\n/g, '<br>') + '</p>';
            }
            if (!markdownParser) return Promise.resolve(fallbackHtml);
            return this.renderMarkdown(markdownParser, raw).catch(function () {
                return fallbackHtml;
            });
        },
        renderMarkdownSafeSync: function (markdownParser, raw, options) {
            var opts = options || {};
            var fallbackText = opts.fallbackText != null ? opts.fallbackText : raw;
            var fallbackHtml = opts.fallbackHtml;
            if (fallbackHtml == null) {
                fallbackHtml = escapeHtml(fallbackText).replace(/\n/g, '<br>');
            }
            if (!markdownParser) return fallbackHtml;
            try {
                return this.renderMarkdownSync(markdownParser, raw);
            } catch (_) {
                return fallbackHtml;
            }
        },
        setElementHtml: function (target, html) {
            if (!target) return '';
            var next = String(html || '');
            target.innerHTML = next;
            return next;
        },
        renderIntoElement: function (target, markdownParser, raw, options) {
            var self = this;
            var opts = options || {};
            return this.renderMarkdownSafe(markdownParser, raw, opts).then(function (html) {
                self.setElementHtml(target, html);
                return self.typesetElement(target, opts).then(function () {
                    return html;
                });
            });
        },
        typesetElement: function (target, options) {
            return this.renderElement(target, options || {});
        },
        renderElement: function (target, options) {
            return this.typesetWhenReady(target, options || {});
        },
        typeset: function (target, options) {
            var opts = options || {};
            var win = opts.targetWindow || global;
            var root = target || (win.document && win.document.body);
            var mj = win && win.MathJax;
            if (!root || !mj || typeof mj.typesetPromise !== 'function') {
                return Promise.resolve(false);
            }
            try {
                if (opts.clear !== false && typeof mj.typesetClear === 'function') {
                    mj.typesetClear([root]);
                }
                return mj.typesetPromise([root]).then(function () {
                    return true;
                }).catch(function (err) {
                    if (opts.silent !== true && win.console && typeof win.console.warn === 'function') {
                        win.console.warn('[MathRender] typeset failed:', err);
                    }
                    return false;
                });
            } catch (err) {
                if (opts.silent !== true && win.console && typeof win.console.warn === 'function') {
                    win.console.warn('[MathRender] typeset failed:', err);
                }
                return Promise.resolve(false);
            }
        },
        typesetWhenReady: function (target, options) {
            var opts = options || {};
            var win = opts.targetWindow || global;
            var retries = typeof opts.retries === 'number' ? opts.retries : 30;
            var delay = typeof opts.delay === 'number' ? opts.delay : 100;
            var self = this;
            return new Promise(function (resolve) {
                var tries = 0;
                function run() {
                    var mj = win && win.MathJax;
                    if (mj && typeof mj.typesetPromise === 'function') {
                        self.typeset(target, opts).then(resolve);
                        return;
                    }
                    tries += 1;
                    if (tries >= retries) {
                        resolve(false);
                        return;
                    }
                    setTimeout(run, delay);
                }
                run();
            });
        },
        protectMathSegments: function (md) {
            var src = String(md || '');
            var chunks = src.split(/(```[\s\S]*?```)/g);
            var slots = [];

            function escapeHtml(value) {
                return String(value || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            function pushSlot(out, seg) {
                var token = '@@MATHSEG_' + slots.length + '@@';
                slots.push(String(seg || ''));
                out.push(token);
            }

            function protectChunk(text) {
                var s = String(text || '');
                var out = [];
                var i = 0;
                var end = -1;

                while (i < s.length) {
                    if (s[i] === '\\' && s[i + 1] === '[') {
                        end = s.indexOf('\\]', i + 2);
                        if (end >= 0) {
                            pushSlot(out, s.slice(i, end + 2));
                            i = end + 2;
                            continue;
                        }
                    }

                    if (s[i] === '\\' && s[i + 1] === '(') {
                        end = s.indexOf('\\)', i + 2);
                        if (end >= 0) {
                            pushSlot(out, s.slice(i, end + 2));
                            i = end + 2;
                            continue;
                        }
                    }

                    if (s[i] === '$' && s[i + 1] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                        end = -1;
                        for (var k = i + 2; k < s.length - 1; k += 1) {
                            if (s[k] === '$' && s[k + 1] === '$' && s[k - 1] !== '\\') {
                                end = k;
                                break;
                            }
                        }
                        if (end >= 0) {
                            pushSlot(out, s.slice(i, end + 2));
                            i = end + 2;
                            continue;
                        }
                    }

                    if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                        end = -1;
                        for (var j = i + 1; j < s.length; j += 1) {
                            if (s[j] === '$' && s[j - 1] !== '\\') {
                                end = j;
                                break;
                            }
                        }
                        if (end >= 0) {
                            pushSlot(out, s.slice(i, end + 1));
                            i = end + 1;
                            continue;
                        }
                    }

                    out.push(s[i]);
                    i += 1;
                }

                return out.join('');
            }

            var protectedText = chunks.map(function (chunk) {
                return /^```[\s\S]*```$/.test(chunk) ? chunk : protectChunk(chunk);
            }).join('');

            return {
                text: protectedText,
                restoreHtml: function (html) {
                    var out = String(html || '');
                    for (var i = 0; i < slots.length; i += 1) {
                        out = out.split('@@MATHSEG_' + i + '@@').join(escapeHtml(slots[i]));
                    }
                    return out;
                }
            };
        }
    };

    global.MathRender = MathRender;
    MathRender.ensureWindowConfig(global);
    global.renderMathInMarkdownViewer = function (element, options) {
        var opts = options || {};
        var targetWindow = opts.targetWindow;
        if (!targetWindow) {
            try {
                targetWindow = element && element.ownerDocument && element.ownerDocument.defaultView
                    ? element.ownerDocument.defaultView
                    : global;
            } catch (_) {
                targetWindow = global;
            }
        }
        return MathRender.typesetElement(element, {
            silent: opts.silent !== false,
            clear: opts.clear,
            retries: opts.retries,
            delay: opts.delay,
            targetWindow: targetWindow
        });
    };
})(window);

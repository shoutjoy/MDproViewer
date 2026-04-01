(function (global) {
    'use strict';

    const MERMAID_SOURCES = [
        'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11.14.0/dist/mermaid.min.js',
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11/dist/mermaid.min.js'
    ];
    const CODE_SELECTOR = 'pre > code.language-mermaid, pre > code.lang-mermaid, pre > code.mermaid';
    let mermaidLoadPromise = null;
    let mermaidReady = false;

    function loadMermaidFromSource(src) {
        return new Promise(function (resolve, reject) {
            var stale = document.querySelectorAll('script[data-trt-mermaid="1"]');
            for (var i = 0; i < stale.length; i++) {
                try { stale[i].parentNode && stale[i].parentNode.removeChild(stale[i]); } catch (e) {}
            }
            var script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.setAttribute('data-trt-mermaid', '1');
            script.onload = function () {
                if (!global.mermaid) {
                    reject(new Error('Mermaid global not found after load.'));
                    return;
                }
                resolve(global.mermaid);
            };
            script.onerror = function () {
                reject(new Error('Failed to load mermaid library from ' + src));
            };
            document.head.appendChild(script);
        });
    }

    function loadMermaid() {
        if (mermaidReady && global.mermaid) return Promise.resolve(global.mermaid);
        if (mermaidLoadPromise) return mermaidLoadPromise;
        mermaidLoadPromise = (async function () {
            var lastErr = null;
            for (var i = 0; i < MERMAID_SOURCES.length; i++) {
                try {
                    await loadMermaidFromSource(MERMAID_SOURCES[i]);
                    if (!global.mermaid) throw new Error('Mermaid global not found.');
                    try {
                        global.mermaid.initialize({
                            startOnLoad: false,
                            suppressErrorRendering: true,
                            securityLevel: 'loose',
                            theme: 'default',
                            flowchart: {
                                useMaxWidth: true,
                                htmlLabels: true
                            },
                            themeVariables: {
                                fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif'
                            }
                        });
                    } catch (e) {}
                    mermaidReady = true;
                    return global.mermaid;
                } catch (err) {
                    lastErr = err;
                }
            }
            throw (lastErr || new Error('Failed to load mermaid library.'));
        })().catch(function (err) {
            mermaidLoadPromise = null;
            return Promise.reject(err);
        });
        return mermaidLoadPromise;
    }

    function buildMermaidNodeFromCode(codeEl) {
        if (!codeEl) return null;
        const pre = codeEl.parentElement;
        if (!pre || pre.tagName !== 'PRE') return null;
        const prepared = preprocessMermaidSource(String(codeEl.textContent || '').trim());
        const source = prepared && prepared.source ? prepared.source : '';
        if (!source) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'trt-mermaid-wrapper my-3 overflow-x-auto';
        wrapper.setAttribute('data-mermaid-source', source);
        if (prepared && prepared.labelMap && Object.keys(prepared.labelMap).length) {
            wrapper.setAttribute('data-sankey-label-map', JSON.stringify(prepared.labelMap));
        }

        const block = document.createElement('div');
        block.className = 'mermaid';
        block.textContent = source;
        wrapper.appendChild(block);

        pre.replaceWith(wrapper);
        return block;
    }

    function isQuotedField(value) {
        var v = String(value || '').trim();
        return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
    }

    function quoteMermaidFieldIfNeeded(value) {
        var v = String(value || '').trim();
        if (!v) return '""';
        if (isQuotedField(v)) return v;
        // Quote non-ASCII (e.g. Korean) or whitespace/special-label values for robust Sankey parsing.
        if (/[^\x00-\x7F]/.test(v) || /\s/.test(v) || /[,:;]/.test(v)) {
            return '"' + v.replace(/"/g, '\\"') + '"';
        }
        return v;
    }

    function unquoteField(value) {
        var v = String(value || '').trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            return v.slice(1, -1);
        }
        return v;
    }

    function preprocessSankeyBetaSource(source) {
        var lines = String(source || '').split(/\r?\n/);
        if (!lines.length) return { source: source, labelMap: null };
        var out = [];
        var started = false;
        var labelMap = {};
        var reverseMap = {};
        var aliasSeq = 0;

        function toAlias(label) {
            var key = String(label || '');
            if (reverseMap[key]) return reverseMap[key];
            var alias = 'kr_node_' + aliasSeq++;
            reverseMap[key] = alias;
            labelMap[alias] = key;
            return alias;
        }

        for (var i = 0; i < lines.length; i++) {
            var raw = lines[i];
            var trimmed = String(raw || '').trim();
            if (!started) {
                out.push(raw);
                if (/^sankey-beta\b/i.test(trimmed)) started = true;
                continue;
            }
            if (!trimmed) {
                out.push(raw);
                continue;
            }
            if (/^%%/.test(trimmed)) {
                out.push(raw);
                continue;
            }

            var noSemi = trimmed.replace(/;+\s*$/, '');
            var m = noSemi.match(/^(.*?),(.*?),(.*)$/);
            if (!m) {
                out.push(raw);
                continue;
            }
            var fromRaw = unquoteField(m[1]);
            var toRaw = unquoteField(m[2]);
            var from = /[^\x00-\x7F]/.test(fromRaw) ? toAlias(fromRaw) : quoteMermaidFieldIfNeeded(m[1]);
            var to = /[^\x00-\x7F]/.test(toRaw) ? toAlias(toRaw) : quoteMermaidFieldIfNeeded(m[2]);
            var value = String(m[3] || '').trim();
            out.push(from + ', ' + to + ', ' + value);
        }
        return {
            source: out.join('\n'),
            labelMap: Object.keys(labelMap).length ? labelMap : null
        };
    }

    function normalizeMermaidDiagramType(source) {
        var src = String(source || '');
        // Accept both "treeView" and "treeview" and normalize to the beta keyword.
        return src.replace(/(^\s*)(treeview|treeView)(?!-beta)(?=\s|$)/im, '$1treeView-beta');
    }

    function preprocessMermaidSource(source) {
        var src = normalizeMermaidDiagramType(source).trim();
        if (!src) return { source: src, labelMap: null };
        if (/^sankey-beta\b/i.test(src)) return preprocessSankeyBetaSource(src);
        return { source: src, labelMap: null };
    }

    function restoreSankeyKoreanLabels(node) {
        var parent = node && node.parentElement;
        if (!parent) return;
        var mapText = parent.getAttribute('data-sankey-label-map');
        if (!mapText) return;
        var labelMap = null;
        try { labelMap = JSON.parse(mapText); } catch (e) { labelMap = null; }
        if (!labelMap) return;
        var svg = parent.querySelector('svg');
        if (!svg) return;
        var textNodes = svg.querySelectorAll('text, tspan');
        function escapeRegExp(text) {
            return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        for (var i = 0; i < textNodes.length; i++) {
            var el = textNodes[i];
            var raw = String(el.textContent || '');
            var next = raw;
            for (var alias in labelMap) {
                if (!Object.prototype.hasOwnProperty.call(labelMap, alias)) continue;
                var label = String(labelMap[alias] || '');
                if (!label) continue;
                var re = new RegExp('\\b' + escapeRegExp(alias) + '\\b', 'g');
                next = next.replace(re, label);
            }
            if (next !== raw) el.textContent = next;
        }
    }

    async function renderIn(root) {
        const target = root || document;
        const codeNodes = target.querySelectorAll ? target.querySelectorAll(CODE_SELECTOR) : [];
        const mermaidNodes = [];

        for (let i = 0; i < codeNodes.length; i++) {
            const node = buildMermaidNodeFromCode(codeNodes[i]);
            if (node) mermaidNodes.push(node);
        }

        if (!mermaidNodes.length) return { changed: false };
        await loadMermaid();
        let changedCount = 0;
        let errorCount = 0;
        let firstError = null;

        for (let i = 0; i < mermaidNodes.length; i++) {
            const n = mermaidNodes[i];
            try {
                await global.mermaid.run({ nodes: [n] });
                restoreSankeyKoreanLabels(n);
                changedCount += 1;
            } catch (e) {
                errorCount += 1;
                if (!firstError) firstError = e;
                const parent = n && n.parentElement;
                if (!parent) continue;
                const src = String(parent.getAttribute('data-mermaid-source') || n.textContent || '');
                parent.innerHTML = '';
                const pre = document.createElement('pre');
                pre.className = 'trt-mermaid-error';
                pre.textContent = src;
                parent.appendChild(pre);
            }
        }

        return {
            changed: changedCount > 0,
            partial: errorCount > 0 && changedCount > 0,
            error: firstError,
            errorCount: errorCount
        };
    }

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(fn, wait);
        };
    }


    function observeViewer() {
        const viewer = document.getElementById('viewer');
        if (!viewer || viewer.__trtMermaidObserved) return;
        viewer.__trtMermaidObserved = true;

        const run = debounce(function () {
            renderIn(viewer).catch(function () {});
        }, 80);

        const observer = new MutationObserver(function () {
            run();
        });
        observer.observe(viewer, { childList: true, subtree: true });
        run();
    }

    function init() {
        observeViewer();
        const retry = setInterval(function () {
            observeViewer();
            const viewer = document.getElementById('viewer');
            if (viewer && viewer.__trtMermaidObserved) clearInterval(retry);
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    global.MermaidTRT = {
        renderIn: renderIn,
        loadMermaid: loadMermaid
    };
})(window);

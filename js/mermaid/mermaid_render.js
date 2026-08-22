(function (global) {
    'use strict';

    const MERMAID_SOURCES = [
        'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11.14.0/dist/mermaid.min.js',
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11/dist/mermaid.min.js'
    ];
    const CODE_SELECTOR = 'pre > code';
    const MERMAID_DISPLAY_MODE_KEY = 'md_viewer_mermaid_display_mode';
    const MERMAID_LIGHT_THEME_VARIABLES = {
        fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif',
        fontSize: '15px',
        primaryColor: '#ffffff',
        primaryTextColor: '#172033',
        primaryBorderColor: '#cbd5e1',
        lineColor: '#64748b',
        secondaryColor: '#f8fafc',
        tertiaryColor: '#eef6ff',
        background: '#ffffff',
        mainBkg: '#ffffff',
        secondBkg: '#f8fafc',
        tertiaryBkg: '#eef6ff',
        nodeBorder: '#cbd5e1',
        clusterBkg: '#f8fafc',
        clusterBorder: '#d7dee8',
        edgeLabelBackground: '#ffffff',
        textColor: '#172033',
        titleColor: '#0f172a',
        labelTextColor: '#172033',
        actorBkg: '#ffffff',
        actorBorder: '#cbd5e1',
        actorTextColor: '#172033',
        noteBkgColor: '#fff7ed',
        noteTextColor: '#3b2f20',
        noteBorderColor: '#fed7aa'
    };
    const MERMAID_DARK_THEME_VARIABLES = {
        fontFamily: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif',
        fontSize: '15px',
        primaryColor: '#1e293b',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#64748b',
        lineColor: '#94a3b8',
        secondaryColor: '#172033',
        tertiaryColor: '#273449',
        background: '#0f172a',
        mainBkg: '#1e293b',
        secondBkg: '#172033',
        tertiaryBkg: '#273449',
        nodeBorder: '#64748b',
        clusterBkg: '#172033',
        clusterBorder: '#475569',
        edgeLabelBackground: '#0f172a',
        textColor: '#e2e8f0',
        titleColor: '#f8fafc',
        labelTextColor: '#e2e8f0',
        actorBkg: '#1e293b',
        actorBorder: '#64748b',
        actorTextColor: '#e2e8f0',
        noteBkgColor: '#422006',
        noteTextColor: '#ffedd5',
        noteBorderColor: '#c2410c'
    };
    let mermaidLoadPromise = null;
    let mermaidReady = false;
    let mermaidControlStyleInjected = false;
    const mermaidSvgCache = new Map();
    const MERMAID_SVG_CACHE_LIMIT = 40;
    const mermaidCacheStats = { hits: 0, misses: 0, writes: 0, evictions: 0 };

    function hashMermaidSource(source) {
        const value = String(source || '');
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function getMermaidCacheKey(source) {
        const value = String(source || '');
        return (isDarkTheme() ? 'dark:' : 'light:') + value.length + ':' + hashMermaidSource(value);
    }

    function readMermaidSvgCache(source) {
        const key = getMermaidCacheKey(source);
        const cached = mermaidSvgCache.get(key);
        if (!cached || cached.source !== source) {
            mermaidCacheStats.misses += 1;
            return null;
        }
        mermaidSvgCache.delete(key);
        mermaidSvgCache.set(key, cached);
        mermaidCacheStats.hits += 1;
        return cached.html;
    }

    function writeMermaidSvgCache(source, html) {
        const key = getMermaidCacheKey(source);
        mermaidSvgCache.delete(key);
        mermaidSvgCache.set(key, { source: source, html: String(html || '') });
        mermaidCacheStats.writes += 1;
        while (mermaidSvgCache.size > MERMAID_SVG_CACHE_LIMIT) {
            const oldestKey = mermaidSvgCache.keys().next().value;
            mermaidSvgCache.delete(oldestKey);
            mermaidCacheStats.evictions += 1;
        }
    }

    function injectMermaidControlsStyle(doc) {
        const d = doc || document;
        if (mermaidControlStyleInjected || d.getElementById('mdv-mermaid-controls-style')) return;
        const style = d.createElement('style');
        style.id = 'mdv-mermaid-controls-style';
        style.textContent = [
            '.trt-mermaid-wrapper{position:relative;display:block;box-sizing:border-box;overflow:hidden;border:1px solid rgba(148,163,184,.35);border-radius:8px;background:#fff;min-width:180px;min-height:140px;height:450px;padding-right:118px;}',
            '.dark .trt-mermaid-wrapper{background:#0f172a;border-color:#475569;}',
            '.trt-mermaid-viewport{position:relative;overflow:hidden;min-height:0;cursor:grab;touch-action:none;height:100%;}',
            '.trt-mermaid-viewport.dragging{cursor:grabbing;}',
            '.trt-mermaid-canvas{transform-origin:0 0;padding:24px;min-width:max-content;min-height:160px;overflow:visible;}',
            '.trt-mermaid-canvas svg{max-width:none !important;overflow:visible;text-rendering:geometricPrecision;shape-rendering:geometricPrecision;image-rendering:auto;}',
            '.trt-mermaid-wrapper[data-mermaid-mode="fixed"]{height:auto;min-height:0;padding:54px 18px 18px;overflow:hidden;}',
            '.trt-mermaid-wrapper[data-mermaid-mode="fixed"] .trt-mermaid-viewport{height:auto;min-height:0;overflow:auto;cursor:default;touch-action:auto;}',
            '.trt-mermaid-wrapper[data-mermaid-mode="fixed"] .trt-mermaid-canvas{width:100%;min-width:0;min-height:0;padding:0;}',
            '.trt-mermaid-wrapper[data-mermaid-mode="fixed"] .trt-mermaid-canvas svg{height:auto !important;max-width:none !important;transform:none !important;}',
            '.trt-mermaid-fixed-controls{position:absolute;top:10px;right:12px;z-index:22;display:flex;align-items:center;gap:5px;}',
            '.trt-mermaid-fixed-controls .trt-mermaid-btn{width:30px;height:30px;border-radius:6px;}',
            '.trt-mermaid-fixed-controls .trt-mermaid-fixed-fit{width:auto;min-width:42px;padding:0 8px;font-size:12px;}',
            '.trt-mermaid-fixed-scale{min-width:46px;text-align:center;color:#475569;font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;}',
            '.dark .trt-mermaid-fixed-scale{color:#cbd5e1;}',
            '.trt-mermaid-control-top,.trt-mermaid-control-pad{position:absolute;right:12px;display:grid;gap:5px;z-index:20;}',
            '.trt-mermaid-control-top{top:12px;grid-template-columns:repeat(2,34px);}',
            '.trt-mermaid-control-pad{top:62px;grid-template-columns:repeat(3,34px);}',
            '.trt-mermaid-btn{width:34px;height:34px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;color:#334155;font-size:14px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.08);font-family:Arial,sans-serif;}',
            '.trt-mermaid-btn:hover{background:#eef2ff;border-color:#a5b4fc;color:#3730a3;}',
            '.dark .trt-mermaid-btn{background:#1e293b;border-color:#64748b;color:#e2e8f0;box-shadow:0 1px 2px rgba(0,0,0,.35);}',
            '.dark .trt-mermaid-btn:hover{background:#312e81;border-color:#818cf8;color:#eef2ff;}',
            '.trt-mermaid-pad-spacer{visibility:hidden;}',
            '.trt-mermaid-controls-toggle{position:absolute;top:12px;right:90px;z-index:22;width:auto;min-width:48px;padding:0 7px;font-size:11px;}',
            '.trt-mermaid-controls-collapsed{padding-right:18px;}',
            '.trt-mermaid-controls-collapsed .trt-mermaid-control-top,.trt-mermaid-controls-collapsed .trt-mermaid-control-pad{display:none;}',
            '.trt-mermaid-controls-collapsed .trt-mermaid-controls-toggle{right:12px;}',
            '.trt-mermaid-resize-handle{position:absolute;z-index:21;touch-action:none;}',
            '.trt-mermaid-resize-w{top:0;left:0;bottom:0;width:10px;cursor:ew-resize;}',
            '.trt-mermaid-resize-e{top:0;right:0;bottom:0;width:10px;cursor:ew-resize;}',
            '.trt-mermaid-resize-s{left:0;right:0;bottom:0;height:10px;cursor:ns-resize;}',
            '.trt-mermaid-resize-w::after,.trt-mermaid-resize-e::after{content:"";position:absolute;top:50%;width:3px;height:42px;border-radius:3px;background:#64748b;opacity:.42;transform:translateY(-50%);}',
            '.trt-mermaid-resize-w::after{left:2px;}',
            '.trt-mermaid-resize-e::after{right:2px;}',
            '.trt-mermaid-resize-s::after{content:"";position:absolute;left:50%;bottom:2px;width:42px;height:3px;border-radius:3px;background:#64748b;opacity:.42;transform:translateX(-50%);}',
            '.trt-mermaid-resize-w:hover::after,.trt-mermaid-resize-e:hover::after,.trt-mermaid-resize-s:hover::after{opacity:1;background:#6366f1;}',
            '.trt-mermaid-resize-sw{left:0;bottom:0;width:18px;height:18px;cursor:nesw-resize;background:linear-gradient(225deg,transparent 45%, #94a3b8 46%, #94a3b8 54%, transparent 55%);opacity:.75;}',
            '.trt-mermaid-resize-se{right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%, #94a3b8 46%, #94a3b8 54%, transparent 55%);opacity:0.7;}',
            '.trt-mermaid-resize-sw:hover,.trt-mermaid-resize-se:hover{opacity:1;}'
        ].join('\n');
        d.head.appendChild(style);
        mermaidControlStyleInjected = true;
    }

    function getMermaidDisplayMode() {
        try {
            return localStorage.getItem(MERMAID_DISPLAY_MODE_KEY) === 'interactive' ? 'interactive' : 'fixed';
        } catch (e) {
            return 'fixed';
        }
    }

    function isDarkTheme() {
        return document.documentElement.classList.contains('dark');
    }

    function configureMermaid() {
        if (!global.mermaid || typeof global.mermaid.initialize !== 'function') return;
        const dark = isDarkTheme();
        global.mermaid.initialize({
            startOnLoad: false,
            suppressErrorRendering: true,
            securityLevel: 'loose',
            theme: 'base',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                padding: 20,
                nodeSpacing: 50,
                rankSpacing: 50
            },
            themeVariables: dark ? MERMAID_DARK_THEME_VARIABLES : MERMAID_LIGHT_THEME_VARIABLES
        });
    }

    function waitForMermaidFonts() {
        if (!document.fonts || !document.fonts.ready) return Promise.resolve();
        return Promise.race([
            document.fonts.ready.catch(function () {}),
            new Promise(function (resolve) { setTimeout(resolve, 800); })
        ]);
    }

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
                    try { configureMermaid(); } catch (e) {}
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
        const rawText = String(codeEl.textContent || '').trim();
        const className = String(codeEl.className || '').toLowerCase();
        const looksTagged = className.includes('mermaid') || className.includes('language-mermaid') || className.includes('lang-mermaid');
        const looksLikeMermaid = /^(%%\{[\s\S]*?\}%%\s*)?(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|treeView-beta|treeview)\b/i.test(rawText);
        if (!looksTagged && !looksLikeMermaid) return null;
        const prepared = preprocessMermaidSource(rawText);
        const source = prepared && prepared.source ? prepared.source : '';
        if (!source) return null;

        injectMermaidControlsStyle(document);
        const wrapper = document.createElement('div');
        wrapper.className = 'trt-mermaid-wrapper my-3';
        wrapper.setAttribute('data-mermaid-source', source);
        wrapper.setAttribute('data-mermaid-original-source', rawText);
        wrapper.setAttribute('data-mermaid-mode', getMermaidDisplayMode());
        if (prepared && prepared.labelMap && Object.keys(prepared.labelMap).length) {
            wrapper.setAttribute('data-sankey-label-map', JSON.stringify(prepared.labelMap));
        }

        const viewport = document.createElement('div');
        viewport.className = 'trt-mermaid-viewport';
        const block = document.createElement('div');
        block.className = 'mermaid trt-mermaid-canvas';
        const cachedHtml = readMermaidSvgCache(source);
        if (cachedHtml) {
            block.innerHTML = cachedHtml;
            block.setAttribute('data-mermaid-cache-hit', '1');
        } else {
            block.textContent = source;
        }
        viewport.appendChild(block);
        wrapper.appendChild(viewport);

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
        return src
            .replace(/(^\s*)(treeview|treeView)(?!-beta)(?=\s|$)/im, '$1treeView-beta')
            .replace(/[—–−]\s*>/g, '-->')
            .replace(/<\s*[—–−]/g, '<--')
            .replace(/[—–−]{2,}\s*>/g, '-->');
    }

    function preprocessMermaidSource(source) {
        var src = normalizeMermaidDiagramType(source).trim();
        if (!src) return { source: src, labelMap: null };
        if (/^sankey-beta\b/i.test(src)) return preprocessSankeyBetaSource(src);
        if (global.MermaidLabelSanitizer && typeof global.MermaidLabelSanitizer.preprocess === 'function') {
            src = global.MermaidLabelSanitizer.preprocess(src);
        }
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

    function expandMermaidSvgBounds(svg) {
        if (!svg || svg.getAttribute('data-mdv-bounds-expanded') === '1') return;
        svg.setAttribute('data-mdv-bounds-expanded', '1');
        svg.style.overflow = 'visible';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        const rawViewBox = String(svg.getAttribute('viewBox') || '').trim();
        const viewBox = rawViewBox.split(/[\s,]+/).map(Number);
        if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
            const padX = Math.max(14, Math.min(30, viewBox[2] * 0.025));
            const padY = Math.max(14, Math.min(30, viewBox[3] * 0.025));
            svg.setAttribute('viewBox', [
                viewBox[0] - padX,
                viewBox[1] - padY,
                viewBox[2] + (padX * 2),
                viewBox[3] + (padY * 2)
            ].join(' '));
        }

        const foreignObjects = svg.querySelectorAll('foreignObject');
        for (let i = 0; i < foreignObjects.length; i++) {
            const foreignObject = foreignObjects[i];
            const x = Number(foreignObject.getAttribute('x'));
            const y = Number(foreignObject.getAttribute('y'));
            const width = Number(foreignObject.getAttribute('width'));
            const height = Number(foreignObject.getAttribute('height'));
            if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
                foreignObject.setAttribute('x', String(x - 7));
                foreignObject.setAttribute('y', String(y - 4));
                foreignObject.setAttribute('width', String(width + 14));
                foreignObject.setAttribute('height', String(height + 8));
            }
            foreignObject.style.overflow = 'visible';
        }
    }

    function polishMermaidSvg(node) {
        var svg = node && node.querySelector ? node.querySelector('svg') : null;
        if (!svg) return;
        expandMermaidSvgBounds(svg);
        if (svg.querySelector('style[data-mdv-mermaid-polish="1"]')) return;
        var dark = isDarkTheme();
        var lineColor = dark ? '#94a3b8' : '#64748b';
        var textColor = dark ? '#e2e8f0' : '#334155';
        var shadowColor = dark ? 'rgba(0,0,0,.28)' : 'rgba(15,23,42,.10)';
        svg.style.display = 'block';
        svg.style.marginLeft = 'auto';
        svg.style.marginRight = 'auto';
        var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.setAttribute('data-mdv-mermaid-polish', '1');
        style.textContent = [
            '.node rect,.node polygon,.node circle,.node ellipse{filter:drop-shadow(0 8px 18px ' + shadowColor + ');stroke-width:1.4px;}',
            '.node .label,.nodeLabel,.edgeLabel,.label{font-weight:600;letter-spacing:0;overflow:visible!important;}',
            'foreignObject,foreignObject>div{overflow:visible!important;}',
            '.nodeLabel p,.edgeLabel p,.label p{margin:0!important;overflow:visible!important;}',
            'text,tspan{overflow:visible;}',
            '.edgeLabel{border-radius:8px;color:' + textColor + ';}',
            '.flowchart-link{stroke:' + lineColor + ' !important;stroke-width:1.9px;}',
            'marker path,path.arrowMarkerPath{fill:' + lineColor + ' !important;stroke:' + lineColor + ' !important;}',
            '.cluster rect{stroke-dasharray:0;}'
        ].join('\n');
        svg.insertBefore(style, svg.firstChild);
    }

    function getMermaidPanState(wrapper) {
        if (!wrapper.__mdvMermaidPanState) {
            wrapper.__mdvMermaidPanState = { scale: 1, x: 0, y: 0 };
        }
        return wrapper.__mdvMermaidPanState;
    }

    function applyMermaidTransform(wrapper) {
        const canvas = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-canvas') : null;
        if (!canvas) return;
        const s = getMermaidPanState(wrapper);
        const svg = canvas.querySelector('svg');
        if (svg) {
            svg.style.transformOrigin = '0 0';
            svg.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) scale(' + s.scale + ')';
            canvas.style.transform = 'none';
        } else {
            canvas.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) scale(' + s.scale + ')';
        }
    }

    function adjustMermaidView(wrapper, dx, dy, scaleDelta) {
        const s = getMermaidPanState(wrapper);
        if (scaleDelta) s.scale = Math.max(0.1, Math.min(4, Math.round((s.scale + scaleDelta) * 100) / 100));
        s.x += dx || 0;
        s.y += dy || 0;
        applyMermaidTransform(wrapper);
    }

    function resetMermaidView(wrapper) {
        const s = getMermaidPanState(wrapper);
        s.scale = 1;
        s.x = 0;
        s.y = 0;
        applyMermaidTransform(wrapper);
    }

    function fitMermaidView(wrapper) {
        const viewport = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-viewport') : null;
        const canvas = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-canvas') : null;
        if (!viewport || !canvas) return;
        const svg = canvas.querySelector('svg');
        
        // Measure sizes with scale reset to ensure getBoundingClientRect returns correct original size
        const oldSvgTransform = svg ? svg.style.transform : '';
        const oldCanvasTransform = canvas.style.transform;
        if (svg) svg.style.transform = 'none';
        canvas.style.transform = 'none';

        const target = svg || canvas;
        const vw = Math.max(1, viewport.clientWidth - 84);
        const vh = Math.max(1, viewport.clientHeight - 40);
        const w = Math.max(1, target.scrollWidth || target.getBoundingClientRect().width);
        const h = Math.max(1, target.scrollHeight || target.getBoundingClientRect().height);

        // Restore transforms
        if (svg) svg.style.transform = oldSvgTransform;
        canvas.style.transform = oldCanvasTransform;

        const scale = Math.max(0.1, Math.min(2, Math.min(vw / w, vh / h)));
        const s = getMermaidPanState(wrapper);
        s.scale = Math.round(scale * 100) / 100;
        s.x = Math.max(0, (viewport.clientWidth - (w * s.scale)) / 2);
        s.y = Math.max(0, (viewport.clientHeight - (h * s.scale)) / 2);
        applyMermaidTransform(wrapper);
    }

    function getFixedMermaidSizeState(wrapper) {
        if (!wrapper.__mdvFixedMermaidSizeState) {
            wrapper.__mdvFixedMermaidSizeState = { factor: 1 };
        }
        return wrapper.__mdvFixedMermaidSizeState;
    }

    function getMermaidSvgNaturalWidth(svg) {
        if (!svg) return 0;
        const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0) return viewBox[2];
        const width = Number.parseFloat(svg.getAttribute('width'));
        return Number.isFinite(width) && width > 0 ? width : 0;
    }

    function applyFixedMermaidSize(wrapper, nextFactor) {
        const viewport = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-viewport') : null;
        const svg = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-canvas svg') : null;
        if (!viewport || !svg) return;
        const state = getFixedMermaidSizeState(wrapper);
        if (Number.isFinite(nextFactor)) {
            state.factor = Math.max(0.2, Math.min(1.6, Math.round(nextFactor * 10) / 10));
        }
        const availableWidth = Math.max(160, viewport.clientWidth || wrapper.clientWidth - 36 || 760);
        const naturalWidth = getMermaidSvgNaturalWidth(svg) || availableWidth;
        const fittedBaseWidth = Math.min(naturalWidth, availableWidth * 0.86);
        const displayWidth = Math.max(80, Math.min(availableWidth * 1.6, fittedBaseWidth * state.factor));
        svg.style.setProperty('width', Math.round(displayWidth) + 'px', 'important');
        svg.style.setProperty('height', 'auto', 'important');
        svg.style.setProperty('max-width', 'none', 'important');
        svg.style.setProperty('transform', 'none', 'important');
        wrapper.setAttribute('data-mermaid-fixed-scale', String(state.factor));
        const label = wrapper.querySelector('.trt-mermaid-fixed-scale');
        if (label) label.textContent = Math.round(state.factor * 100) + '%';
    }

    function bindFixedMermaidResize(wrapper) {
        if (!wrapper || wrapper.__mdvFixedResizeBound || typeof ResizeObserver === 'undefined') return;
        const viewport = wrapper.querySelector('.trt-mermaid-viewport');
        if (!viewport) return;
        wrapper.__mdvFixedResizeBound = true;
        let frame = 0;
        let lastWidth = Math.round(viewport.getBoundingClientRect().width * 10) / 10;
        const observer = new ResizeObserver(function (entries) {
            const entry = entries && entries[0];
            const width = entry && entry.contentRect
                ? Math.round(entry.contentRect.width * 10) / 10
                : Math.round(viewport.getBoundingClientRect().width * 10) / 10;
            if (Math.abs(width - lastWidth) < 0.5) return;
            lastWidth = width;
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(function () {
                frame = 0;
                applyFixedMermaidSize(wrapper);
            });
        });
        observer.observe(viewport);
        wrapper.__mdvFixedResizeObserver = observer;
    }

    function addFixedMermaidControls(node) {
        const wrapper = node && node.closest ? node.closest('.trt-mermaid-wrapper') : null;
        if (!wrapper || wrapper.getAttribute('data-mermaid-mode') !== 'fixed') return;
        if (!wrapper.__mdvFixedMermaidControlsReady) {
            wrapper.__mdvFixedMermaidControlsReady = true;
            const controls = document.createElement('div');
            controls.className = 'trt-mermaid-fixed-controls';

            function button(label, title, action, extraClass) {
                const element = document.createElement('button');
                element.type = 'button';
                element.className = 'trt-mermaid-btn' + (extraClass ? (' ' + extraClass) : '');
                element.textContent = label;
                element.title = title;
                element.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    action();
                });
                return element;
            }

            controls.appendChild(button('−', '고정형 다이어그램 축소', function () {
                const state = getFixedMermaidSizeState(wrapper);
                applyFixedMermaidSize(wrapper, state.factor - 0.1);
            }));
            const scale = document.createElement('span');
            scale.className = 'trt-mermaid-fixed-scale';
            scale.textContent = '100%';
            controls.appendChild(scale);
            controls.appendChild(button('+', '고정형 다이어그램 확대', function () {
                const state = getFixedMermaidSizeState(wrapper);
                applyFixedMermaidSize(wrapper, state.factor + 0.1);
            }));
            controls.appendChild(button('맞춤', '문서 너비에 맞는 기본 크기', function () {
                applyFixedMermaidSize(wrapper, 1);
            }, 'trt-mermaid-fixed-fit'));
            wrapper.appendChild(controls);
        }
        bindFixedMermaidResize(wrapper);
        setTimeout(function () { applyFixedMermaidSize(wrapper); }, 0);
    }

    function copyMermaidSource(wrapper) {
        const source = String(wrapper && wrapper.getAttribute ? wrapper.getAttribute('data-mermaid-source') : '');
        if (!source) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(source).catch(function () {});
        }
    }

    function bindMermaidPan(wrapper) {
        const viewport = wrapper && wrapper.querySelector ? wrapper.querySelector('.trt-mermaid-viewport') : null;
        if (!viewport || viewport.__mdvMermaidPanBound) return;
        viewport.__mdvMermaidPanBound = true;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        viewport.addEventListener('pointerdown', function (ev) {
            if (ev.target && ev.target.closest && ev.target.closest('.trt-mermaid-btn')) return;
            dragging = true;
            lastX = ev.clientX;
            lastY = ev.clientY;
            viewport.classList.add('dragging');
            try { viewport.setPointerCapture(ev.pointerId); } catch (e) {}
        });
        viewport.addEventListener('pointermove', function (ev) {
            if (!dragging) return;
            const dx = ev.clientX - lastX;
            const dy = ev.clientY - lastY;
            lastX = ev.clientX;
            lastY = ev.clientY;
            adjustMermaidView(wrapper, dx, dy, 0);
        });
        function stop(ev) {
            dragging = false;
            viewport.classList.remove('dragging');
            try { viewport.releasePointerCapture(ev.pointerId); } catch (e) {}
        }
        viewport.addEventListener('pointerup', stop);
        viewport.addEventListener('pointercancel', stop);
        viewport.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            adjustMermaidView(wrapper, 0, 0, ev.deltaY < 0 ? 0.1 : -0.1);
        }, { passive: false });
    }

    function bindMermaidResize(wrapper) {
        if (!wrapper || wrapper.__mdvMermaidResizeBound) return;
        wrapper.__mdvMermaidResizeBound = true;

        const handleW = wrapper.querySelector('.trt-mermaid-resize-w');
        const handleE = wrapper.querySelector('.trt-mermaid-resize-e');
        const handleS = wrapper.querySelector('.trt-mermaid-resize-s');
        const handleSW = wrapper.querySelector('.trt-mermaid-resize-sw');
        const handleSE = wrapper.querySelector('.trt-mermaid-resize-se');

        let startX, startY, startWidth, startHeight, startMarginLeft;
        let activeHandle = null;

        function onPointerDown(ev) {
            if (ev.target.classList.contains('trt-mermaid-resize-w')) activeHandle = 'w';
            else if (ev.target.classList.contains('trt-mermaid-resize-e')) activeHandle = 'e';
            else if (ev.target.classList.contains('trt-mermaid-resize-s')) activeHandle = 's';
            else if (ev.target.classList.contains('trt-mermaid-resize-sw')) activeHandle = 'sw';
            else if (ev.target.classList.contains('trt-mermaid-resize-se')) activeHandle = 'se';
            else return;

            ev.preventDefault();
            ev.stopPropagation();

            startX = ev.clientX;
            startY = ev.clientY;
            const rect = wrapper.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startMarginLeft = Number.parseFloat(getComputedStyle(wrapper).marginLeft) || 0;

            document.documentElement.addEventListener('pointermove', onPointerMove);
            document.documentElement.addEventListener('pointerup', onPointerUp, { once: true });

            document.body.style.userSelect = 'none';

            try {
                ev.target.setPointerCapture(ev.pointerId);
            } catch(e) {}
        }

        function onPointerMove(ev) {
            if (!activeHandle) return;

            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;

            if (activeHandle === 'w' || activeHandle === 'sw') {
                let newWidth = Math.max(180, startWidth - dx);
                let newMarginLeft = startMarginLeft + (startWidth - newWidth);
                if (newMarginLeft < 0) {
                    newWidth = startWidth + startMarginLeft;
                    newMarginLeft = 0;
                }
                wrapper.style.width = newWidth + 'px';
                wrapper.style.marginLeft = newMarginLeft + 'px';
            }
            if (activeHandle === 'e' || activeHandle === 'se') {
                const newWidth = Math.max(180, startWidth + dx);
                wrapper.style.width = newWidth + 'px';
            }
            if (activeHandle === 's' || activeHandle === 'sw' || activeHandle === 'se') {
                const newHeight = Math.max(140, startHeight + dy);
                wrapper.style.height = newHeight + 'px';
            }
        }

        function onPointerUp(ev) {
            if(ev.target.releasePointerCapture) {
                try { ev.target.releasePointerCapture(ev.pointerId); } catch(e) {}
            }
            document.documentElement.removeEventListener('pointermove', onPointerMove);
            document.body.style.userSelect = '';
            activeHandle = null;
        }

        [handleW, handleE, handleS, handleSW, handleSE].forEach(function (handle) {
            if (handle) handle.addEventListener('pointerdown', onPointerDown);
        });
    }

    function addMermaidControls(node) {
        const wrapper = node && node.closest ? node.closest('.trt-mermaid-wrapper') : null;
        if (!wrapper || wrapper.__mdvMermaidControlsReady) return;
        if (wrapper.getAttribute('data-mermaid-mode') === 'fixed') return;
        wrapper.__mdvMermaidControlsReady = true;
        wrapper.setAttribute('data-mermaid-controls', 'ready');
        const top = document.createElement('div');
        top.className = 'trt-mermaid-control-top';
        const pad = document.createElement('div');
        pad.className = 'trt-mermaid-control-pad';

        function btn(label, title, action, extraClass) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'trt-mermaid-btn' + (extraClass ? (' ' + extraClass) : '');
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                action();
            });
            return b;
        }

        top.appendChild(btn('<>', '가로 맞춤', function () { fitMermaidView(wrapper); }));
        top.appendChild(btn('[]', 'Mermaid 코드 복사', function () { copyMermaidSource(wrapper); }));
        pad.appendChild(document.createElement('span')).className = 'trt-mermaid-pad-spacer';
        pad.appendChild(btn('^', '위로 이동', function () { adjustMermaidView(wrapper, 0, -28, 0); }));
        pad.appendChild(btn('+', '확대', function () { adjustMermaidView(wrapper, 0, 0, 0.1); }));
        pad.appendChild(btn('<', '왼쪽 이동', function () { adjustMermaidView(wrapper, -28, 0, 0); }));
        pad.appendChild(btn('R', '위치 초기화', function () { resetMermaidView(wrapper); }));
        pad.appendChild(btn('>', '오른쪽 이동', function () { adjustMermaidView(wrapper, 28, 0, 0); }));
        pad.appendChild(document.createElement('span')).className = 'trt-mermaid-pad-spacer';
        pad.appendChild(btn('v', '아래로 이동', function () { adjustMermaidView(wrapper, 0, 28, 0); }));
        pad.appendChild(btn('-', '축소', function () { adjustMermaidView(wrapper, 0, 0, -0.1); }));

        const toggle = btn('접기', 'Mermaid 조작기 접기', function () {
            const collapsed = wrapper.classList.toggle('trt-mermaid-controls-collapsed');
            toggle.textContent = collapsed ? '펼치기' : '접기';
            toggle.title = collapsed ? 'Mermaid 조작기 펼치기' : 'Mermaid 조작기 접기';
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }, 'trt-mermaid-controls-toggle');
        toggle.setAttribute('aria-expanded', 'true');
        wrapper.appendChild(top);
        wrapper.appendChild(pad);
        wrapper.appendChild(toggle);

        const resizeW = document.createElement('div');
        resizeW.className = 'trt-mermaid-resize-handle trt-mermaid-resize-w';
        resizeW.title = '왼쪽 너비 조절';
        wrapper.appendChild(resizeW);

        const resizeE = document.createElement('div');
        resizeE.className = 'trt-mermaid-resize-handle trt-mermaid-resize-e';
        resizeE.title = '오른쪽 너비 조절';
        wrapper.appendChild(resizeE);

        const resizeS = document.createElement('div');
        resizeS.className = 'trt-mermaid-resize-handle trt-mermaid-resize-s';
        resizeS.title = '아래 높이 조절';
        wrapper.appendChild(resizeS);

        const resizeSW = document.createElement('div');
        resizeSW.className = 'trt-mermaid-resize-handle trt-mermaid-resize-sw';
        resizeSW.title = '왼쪽 아래 크기 조절';
        wrapper.appendChild(resizeSW);

        const resizeSE = document.createElement('div');
        resizeSE.className = 'trt-mermaid-resize-handle trt-mermaid-resize-se';
        resizeSE.title = '오른쪽 아래 크기 조절';
        wrapper.appendChild(resizeSE);

        bindMermaidPan(wrapper);
        bindMermaidResize(wrapper);
        setTimeout(function () { fitMermaidView(wrapper); }, 0);
    }

    function upgradeExistingMermaidWrapper(wrapper) {
        if (!wrapper || !wrapper.querySelector || !wrapper.querySelector('svg')) return null;
        injectMermaidControlsStyle(document);
        wrapper.setAttribute('data-mermaid-mode', getMermaidDisplayMode());
        let viewport = wrapper.querySelector('.trt-mermaid-viewport');
        let canvas = wrapper.querySelector('.trt-mermaid-canvas');
        if (!viewport) {
            viewport = document.createElement('div');
            viewport.className = 'trt-mermaid-viewport';
            const mermaidBlock = wrapper.querySelector('.mermaid');
            if (mermaidBlock) {
                mermaidBlock.classList.add('trt-mermaid-canvas');
                wrapper.insertBefore(viewport, mermaidBlock);
                viewport.appendChild(mermaidBlock);
                canvas = mermaidBlock;
            } else {
                canvas = document.createElement('div');
                canvas.className = 'trt-mermaid-canvas';
                while (wrapper.firstChild) canvas.appendChild(wrapper.firstChild);
                viewport.appendChild(canvas);
                wrapper.appendChild(viewport);
            }
        } else if (!canvas) {
            const mermaidBlock = viewport.querySelector('.mermaid') || viewport.firstElementChild;
            if (mermaidBlock) {
                mermaidBlock.classList.add('trt-mermaid-canvas');
                canvas = mermaidBlock;
            }
        }
        const node = canvas || wrapper.querySelector('.mermaid') || wrapper;
        if (wrapper.getAttribute('data-mermaid-mode') === 'fixed') addFixedMermaidControls(node);
        else addMermaidControls(node);
        return node;
    }

    function enhanceExistingMermaidWrappers(root) {
        const target = root || document;
        const wrappers = target.querySelectorAll ? target.querySelectorAll('.trt-mermaid-wrapper') : [];
        for (let i = 0; i < wrappers.length; i++) {
            upgradeExistingMermaidWrapper(wrappers[i]);
        }
    }

    async function renderIn(root) {
        const target = root || document;
        const codeNodes = target.querySelectorAll ? target.querySelectorAll(CODE_SELECTOR) : [];
        const mermaidNodes = [];
        const cachedNodes = [];

        for (let i = 0; i < codeNodes.length; i++) {
            const node = buildMermaidNodeFromCode(codeNodes[i]);
            if (!node) continue;
            if (node.getAttribute('data-mermaid-cache-hit') === '1') cachedNodes.push(node);
            else mermaidNodes.push(node);
        }

        if (!mermaidNodes.length) {
            enhanceExistingMermaidWrappers(target);
            return { changed: cachedNodes.length > 0, cachedCount: cachedNodes.length };
        }
        await loadMermaid();
        await waitForMermaidFonts();
        configureMermaid();
        let changedCount = 0;
        let errorCount = 0;
        let firstError = null;

        for (let i = 0; i < mermaidNodes.length; i++) {
            const n = mermaidNodes[i];
            try {
                await global.mermaid.run({ nodes: [n] });
                restoreSankeyKoreanLabels(n);
                polishMermaidSvg(n);
                const wrapper = n && n.closest ? n.closest('.trt-mermaid-wrapper') : null;
                const renderedSource = wrapper
                    ? String(wrapper.getAttribute('data-mermaid-source') || '')
                    : '';
                if (renderedSource && n.innerHTML) writeMermaidSvgCache(renderedSource, n.innerHTML);
                if (wrapper && wrapper.getAttribute('data-mermaid-mode') === 'fixed') addFixedMermaidControls(n);
                else addMermaidControls(n);
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

        enhanceExistingMermaidWrappers(target);

        return {
            changed: changedCount > 0,
            cachedCount: cachedNodes.length,
            partial: errorCount > 0 && changedCount > 0,
            error: firstError,
            errorCount: errorCount
        };
    }

    function restoreMermaidCodeBlocks(root) {
        const target = root || document;
        const wrappers = target.querySelectorAll ? Array.from(target.querySelectorAll('.trt-mermaid-wrapper')) : [];
        for (let i = 0; i < wrappers.length; i++) {
            const wrapper = wrappers[i];
            const source = String(
                wrapper.getAttribute('data-mermaid-original-source')
                || wrapper.getAttribute('data-mermaid-source')
                || ''
            ).trim();
            if (!source || !wrapper.parentNode) continue;
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = 'language-mermaid';
            code.textContent = source;
            pre.appendChild(code);
            wrapper.replaceWith(pre);
        }
        return wrappers.length;
    }

    async function refresh(root) {
        const target = root || document;
        restoreMermaidCodeBlocks(target);
        return renderIn(target);
    }

    function setDisplayMode(mode) {
        const nextMode = mode === 'fixed' ? 'fixed' : 'interactive';
        try { localStorage.setItem(MERMAID_DISPLAY_MODE_KEY, nextMode); } catch (e) {}
        return refresh(document);
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
        loadMermaid: loadMermaid,
        refresh: refresh,
        setDisplayMode: setDisplayMode,
        getDisplayMode: getMermaidDisplayMode,
        getCacheStats: function () {
            return Object.assign({}, mermaidCacheStats, { size: mermaidSvgCache.size });
        },
        clearCache: function () { mermaidSvgCache.clear(); }
    };
})(window);

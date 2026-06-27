(function (global) {
    'use strict';

    const MERMAID_SOURCES = [
        'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11.14.0/dist/mermaid.min.js',
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11/dist/mermaid.min.js'
    ];
    const CODE_SELECTOR = 'pre > code';
    const MERMAID_THEME_VARIABLES = {
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
    let mermaidLoadPromise = null;
    let mermaidReady = false;
    let mermaidControlStyleInjected = false;

    function injectMermaidControlsStyle(doc) {
        const d = doc || document;
        if (mermaidControlStyleInjected || d.getElementById('mdv-mermaid-controls-style')) return;
        const style = d.createElement('style');
        style.id = 'mdv-mermaid-controls-style';
        style.textContent = [
            '.trt-mermaid-wrapper{position:relative;display:block;overflow:hidden;border:1px solid rgba(148,163,184,.35);border-radius:8px;background:#fff;min-height:300px;height:450px;padding-right:118px;}',
            '.dark .trt-mermaid-wrapper{background:#0f172a;border-color:rgba(51,65,85,.9);}',
            '.trt-mermaid-viewport{position:relative;overflow:hidden;min-height:300px;cursor:grab;touch-action:none;height:100%;}',
            '.trt-mermaid-viewport.dragging{cursor:grabbing;}',
            '.trt-mermaid-canvas{transform-origin:0 0;padding:24px;min-width:max-content;min-height:160px;}',
            '.trt-mermaid-canvas svg{max-width:none !important; text-rendering: geometricPrecision; shape-rendering: geometricPrecision; image-rendering: auto;}',
            '.trt-mermaid-control-top,.trt-mermaid-control-pad{position:absolute;right:12px;display:grid;gap:5px;z-index:20;}',
            '.trt-mermaid-control-top{top:12px;grid-template-columns:repeat(2,34px);}',
            '.trt-mermaid-control-pad{top:62px;grid-template-columns:repeat(3,34px);}',
            '.trt-mermaid-btn{width:34px;height:34px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;color:#334155;font-size:14px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.08);font-family:Arial,sans-serif;}',
            '.trt-mermaid-btn:hover{background:#eef2ff;border-color:#a5b4fc;color:#3730a3;}',
            '.dark .trt-mermaid-btn{background:#172033;border-color:#475569;color:#e2e8f0;}',
            '.dark .trt-mermaid-btn:hover{background:#1e293b;border-color:#818cf8;color:#c7d2fe;}',
            '.trt-mermaid-pad-spacer{visibility:hidden;}',
            '.trt-mermaid-resize-handle{position:absolute;z-index:21;}',
            '.trt-mermaid-resize-e{top:0;right:0;bottom:0;width:10px;cursor:ew-resize;}',
            '.trt-mermaid-resize-s{left:0;right:0;bottom:0;height:10px;cursor:ns-resize;}',
            '.trt-mermaid-resize-se{right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%, #94a3b8 46%, #94a3b8 54%, transparent 55%);opacity:0.7;}',
            '.trt-mermaid-resize-se:hover{opacity:1;}'
        ].join('\n');
        d.head.appendChild(style);
        mermaidControlStyleInjected = true;
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
                            themeVariables: MERMAID_THEME_VARIABLES
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
        if (prepared && prepared.labelMap && Object.keys(prepared.labelMap).length) {
            wrapper.setAttribute('data-sankey-label-map', JSON.stringify(prepared.labelMap));
        }

        const viewport = document.createElement('div');
        viewport.className = 'trt-mermaid-viewport';
        const block = document.createElement('div');
        block.className = 'mermaid trt-mermaid-canvas';
        block.textContent = source;
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

    function polishMermaidSvg(node) {
        var svg = node && node.querySelector ? node.querySelector('svg') : null;
        if (!svg || svg.querySelector('style[data-mdv-mermaid-polish="1"]')) return;
        var isDark = !!(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('dark'));
        var lineColor = isDark ? '#cbd5e1' : '#64748b';
        var textColor = isDark ? '#e5edf7' : '#334155';
        svg.style.display = 'block';
        svg.style.marginLeft = 'auto';
        svg.style.marginRight = 'auto';
        var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.setAttribute('data-mdv-mermaid-polish', '1');
        style.textContent = [
            '.node rect,.node polygon,.node circle,.node ellipse{filter:drop-shadow(0 8px 18px rgba(15,23,42,.10));stroke-width:1.4px;}',
            '.node .label,.nodeLabel,.edgeLabel,.label{font-weight:600;letter-spacing:0;}',
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
        if (scaleDelta) s.scale = Math.max(0.25, Math.min(4, Math.round((s.scale + scaleDelta) * 100) / 100));
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

        const scale = Math.max(0.25, Math.min(2, Math.min(vw / w, vh / h)));
        const s = getMermaidPanState(wrapper);
        s.scale = Math.round(scale * 100) / 100;
        s.x = Math.max(0, (viewport.clientWidth - (w * s.scale)) / 2);
        s.y = Math.max(0, (viewport.clientHeight - (h * s.scale)) / 2);
        applyMermaidTransform(wrapper);
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
    
        const handleE = wrapper.querySelector('.trt-mermaid-resize-e');
        const handleS = wrapper.querySelector('.trt-mermaid-resize-s');
        const handleSE = wrapper.querySelector('.trt-mermaid-resize-se');
    
        let startX, startY, startWidth, startHeight;
        let activeHandle = null;
    
        function onPointerDown(ev) {
            if (ev.target.classList.contains('trt-mermaid-resize-e')) activeHandle = 'e';
            else if (ev.target.classList.contains('trt-mermaid-resize-s')) activeHandle = 's';
            else if (ev.target.classList.contains('trt-mermaid-resize-se')) activeHandle = 'se';
            else return;
    
            ev.preventDefault();
            ev.stopPropagation();
    
            startX = ev.clientX;
            startY = ev.clientY;
            const rect = wrapper.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
    
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
    
            if (activeHandle === 'e' || activeHandle === 'se') {
                const newWidth = Math.max(320, startWidth + dx);
                wrapper.style.width = newWidth + 'px';
            }
            if (activeHandle === 's' || activeHandle === 'se') {
                const newHeight = Math.max(240, startHeight + dy);
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
    
        handleE.addEventListener('pointerdown', onPointerDown);
        handleS.addEventListener('pointerdown', onPointerDown);
        handleSE.addEventListener('pointerdown', onPointerDown);
    }

    function addMermaidControls(node) {
        const wrapper = node && node.closest ? node.closest('.trt-mermaid-wrapper') : null;
        if (!wrapper || wrapper.__mdvMermaidControlsReady) return;
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
        wrapper.appendChild(top);
        wrapper.appendChild(pad);

        const resizeE = document.createElement('div');
        resizeE.className = 'trt-mermaid-resize-handle trt-mermaid-resize-e';
        resizeE.title = '너비 조절';
        wrapper.appendChild(resizeE);

        const resizeS = document.createElement('div');
        resizeS.className = 'trt-mermaid-resize-handle trt-mermaid-resize-s';
        resizeS.title = '높이 조절';
        wrapper.appendChild(resizeS);

        const resizeSE = document.createElement('div');
        resizeSE.className = 'trt-mermaid-resize-handle trt-mermaid-resize-se';
        resizeSE.title = '크기 조절';
        wrapper.appendChild(resizeSE);

        bindMermaidPan(wrapper);
        bindMermaidResize(wrapper);
        setTimeout(function () { fitMermaidView(wrapper); }, 0);
    }

    function upgradeExistingMermaidWrapper(wrapper) {
        if (!wrapper || !wrapper.querySelector || !wrapper.querySelector('svg')) return null;
        injectMermaidControlsStyle(document);
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
        addMermaidControls(node);
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

        for (let i = 0; i < codeNodes.length; i++) {
            const node = buildMermaidNodeFromCode(codeNodes[i]);
            if (node) mermaidNodes.push(node);
        }

        if (!mermaidNodes.length) {
            enhanceExistingMermaidWrappers(target);
            return { changed: false };
        }
        await loadMermaid();
        let changedCount = 0;
        let errorCount = 0;
        let firstError = null;

        for (let i = 0; i < mermaidNodes.length; i++) {
            const n = mermaidNodes[i];
            try {
                await global.mermaid.run({ nodes: [n] });
                restoreSankeyKoreanLabels(n);
                polishMermaidSvg(n);
                addMermaidControls(n);
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

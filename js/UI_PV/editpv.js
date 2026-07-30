const PREVIEW_MERMAID_THEME_VARIABLES = {
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

let previewPopupFileMode = false;
let previewPopupFileObjectUrl = '';

function revokePreviewPopupFileObjectUrl() {
    if (!previewPopupFileObjectUrl) return;
    try { URL.revokeObjectURL(previewPopupFileObjectUrl); } catch (_) {}
    previewPopupFileObjectUrl = '';
}

function isPreviewPopupAlive() {
    return !!(previewPopupWindow && !previewPopupWindow.closed);
}

function onPreviewPopupClosed() {
    previewPopupWindow = null;
    previewPopupFileMode = false;
    revokePreviewPopupFileObjectUrl();
    resetPreviewPopupMermaidLoader();
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function closePreviewPopupWindow() {
    if (!isPreviewPopupAlive()) {
        previewPopupWindow = null;
        previewPopupFileMode = false;
        revokePreviewPopupFileObjectUrl();
        resetPreviewPopupMermaidLoader();
        revokeObjectUrls(previewInternalImageObjectUrls);
        return;
    }
    previewPopupWindow.close();
    previewPopupWindow = null;
    previewPopupFileMode = false;
    revokePreviewPopupFileObjectUrl();
    resetPreviewPopupMermaidLoader();
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function ensurePreviewPopupForFile() {
    if (isPreviewPopupAlive()) return true;
    openPreviewPopupWindow();
    return isPreviewPopupAlive();
}

function choosePreviewPopupFile(kind) {
    if (!isPreviewPopupAlive()) return false;
    const type = String(kind || '').toLowerCase();
    const input = previewPopupWindow.document.createElement('input');
    input.type = 'file';
    input.accept = type === 'pdf'
        ? '.pdf,application/pdf'
        : '.pptx,.ppsx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    input.style.display = 'none';
    input.addEventListener('change', function () {
        const file = input.files && input.files[0];
        if (file) openSelectedFileInPreviewPopup(file);
        input.remove();
    }, { once: true });
    previewPopupWindow.document.body.appendChild(input);
    input.click();
    return true;
}

function openSelectedFileInPreviewPopup(file) {
    if (!file || !isPreviewPopupAlive()) return false;
    const name = String(file.name || 'Document');
    const lowerName = name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf');
    const isPresentation = /\.(pptx|ppsx)$/.test(lowerName);
    if (!isPdf && !isPresentation) {
        showToast('PDF 또는 PPTX 파일을 선택하세요.');
        return false;
    }
    revokePreviewPopupFileObjectUrl();
    previewPopupFileObjectUrl = URL.createObjectURL(file);
    if (isPdf) {
        return openFileViewerInPreviewPopup(previewPopupFileObjectUrl, name);
    }
    const viewerUrl = new URL('./pptx-viewer.html', window.location.href);
    viewerUrl.searchParams.set('title', name);
    const bufferPromise = file.arrayBuffer();
    return openFileViewerInPreviewPopup(viewerUrl.href, name, function (frame) {
        bufferPromise.then(function (buffer) {
            frame.contentWindow.postMessage({
                type: 'mdv-open-pptx-buffer',
                fileName: name,
                buffer: buffer
            }, window.location.origin, [buffer]);
        }).catch(function (error) {
            showToast('PPTX 파일을 읽을 수 없습니다: ' + (error && error.message ? error.message : error));
        });
    });
}

function openFileViewerInPreviewPopup(viewerUrl, fileName, onReady) {
    if (!isPreviewPopupAlive()) return false;
    const doc = previewPopupWindow.document;
    const root = doc.getElementById('pv-root');
    if (!root) return false;

    previewPopupFileMode = true;
    doc.title = 'MDproViewer Preview - ' + String(fileName || 'Document');
    root.innerHTML = '';
    const frame = doc.createElement('iframe');
    if (typeof onReady === 'function') {
        frame.addEventListener('load', function () { onReady(frame); }, { once: true });
    }
    frame.src = String(viewerUrl || '');
    frame.title = String(fileName || 'Document');
    frame.style.display = 'block';
    frame.style.width = '100%';
    frame.style.height = '100vh';
    frame.style.border = '0';
    frame.setAttribute('allow', 'fullscreen');
    root.appendChild(frame);
    try { previewPopupWindow.focus(); } catch (_) {}
    return true;
}

function escapeHtmlForPreview(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getPreviewPopupDocumentHtml() {
    const mathHead = (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.getHeadTags === 'function')
        ? MathRender.getHeadTags({
            scriptUrl: new URL('./js/math_render/math_render.js?v=20260725-stable-math-1', window.location.href).href
        })
        : '';
    return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MDproViewer Preview</title>'
        + mathHead
        + '<style>'
        + 'html,body{margin:0;padding:0;height:100%;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;}'
        + '#pv-root{height:100%;}'
        + '#pv-toolbar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#e2e8f0;border-bottom:1px solid #cbd5e1;position:fixed;top:0;left:0;right:0;z-index:9999;box-sizing:border-box;overflow-x:auto;white-space:nowrap;}'
        + '#pv-toolbar button{padding:4px 10px;border:1px solid #94a3b8;background:#fff;border-radius:6px;font-weight:700;color:#1e293b;cursor:pointer;}'
        + '#pv-toolbar .label{font-size:12px;color:#334155;min-width:48px;text-align:center;font-weight:700;}'
        + '#pv-viewport{height:100%;overflow:auto;padding:20px;padding-top:72px;box-sizing:border-box;}'
        + '#pv-content{line-height:1.6;word-wrap:break-word;transform-origin:top left;margin:0 auto;width:100%;max-width:56rem;}'
        + '#pv-content .trt-mermaid-wrapper{position:relative;display:block;box-sizing:border-box;width:100%;min-height:240px;padding:52px 14px 14px;margin:1rem 0;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;background:#fff;}'
        + '#pv-content .trt-pv-mermaid-viewport{width:100%;overflow:auto;background:#fff;}'
        + '#pv-content .trt-pv-mermaid-canvas{display:block;width:100%;min-width:0;}'
        + '#pv-content .trt-pv-mermaid-canvas svg{display:block;margin:0 auto;max-width:none!important;height:auto!important;transform-origin:top center;}'
        + '#pv-content .trt-pv-mermaid-controls{position:absolute;top:10px;right:10px;z-index:20;display:flex;align-items:center;gap:5px;}'
        + '#pv-content .trt-pv-mermaid-btn{min-width:32px;height:30px;padding:0 7px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#334155;font:700 13px/1 Arial,sans-serif;cursor:pointer;}'
        + '#pv-content .trt-pv-mermaid-btn:hover{background:#eef2ff;border-color:#a5b4fc;color:#3730a3;}'
        + '#pv-content .trt-pv-mermaid-scale{min-width:46px;text-align:center;color:#334155;font-size:12px;font-weight:700;}'
        + '#pv-content h1{font-size:2.25rem;font-weight:800;margin-top:1.5rem;margin-bottom:1rem;border-bottom:1px solid #e2e8f0;padding-bottom:.5rem;}'
        + '#pv-content h2{font-size:1.875rem;font-weight:700;margin-top:1.25rem;margin-bottom:.75rem;border-bottom:1px solid #e2e8f0;padding-bottom:.3rem;}'
        + '#pv-content h3{font-size:1.5rem;font-weight:600;margin-top:1rem;margin-bottom:.5rem;}'
        + '#pv-content p{margin-bottom:1rem;}#pv-content ul,#pv-content ol{margin-bottom:1rem;padding-left:1.5rem;}'
        + '#pv-content code{padding:.2rem .4rem;border-radius:.25rem;background:#e2e8f0;color:#1e293b;font-family:Consolas,monospace;}'
        + '#pv-content pre{background:#e2e8f0;color:#1e293b;padding:1rem;border-radius:.5rem;overflow:auto;margin-bottom:1rem;}'
        + '#pv-content pre code{background:transparent;padding:0;color:inherit;}'
        + '#pv-content table{border-collapse:collapse;width:100%;margin-bottom:1rem;border:2px solid #94a3b8;}'
        + '#pv-content th,#pv-content td{border:1px solid #94a3b8;padding:.45rem .65rem;text-align:left;vertical-align:top;}'
        + '#pv-content th[align=\"left\"],#pv-content td[align=\"left\"]{text-align:left;}'
        + '#pv-content th[align=\"center\"],#pv-content td[align=\"center\"]{text-align:center;}'
        + '#pv-content th[align=\"right\"],#pv-content td[align=\"right\"]{text-align:right;}'
        + '#pv-content thead th{background:#e2e8f0;font-weight:700;}'
        + '#pv-content .md-footnotes{margin-top:1.25rem;font-size:.92em;color:#334155;}'
        + '#pv-content .md-footnotes ol{margin:.5rem 0 0;padding-left:1.25rem;}'
        + '#pv-content .md-footnote-ref a,#pv-content .md-footnote-backref{color:#2563eb;text-decoration:none;font-weight:700;}'
        + '#pv-content .md-footnote-ref a:hover,#pv-content .md-footnote-backref:hover{text-decoration:underline;}'
        + '</style></head><body><div id=\"pv-root\"><div id=\"pv-toolbar\">'
        + '<strong style=\"margin-right:6px\">Preview</strong>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pdf\')\">PDF 열기</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pptx\')\">PPTX 열기</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(-0.1)\">Zoom Out</button>'
        + '<span id=\"pv-scale-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(0.1)\">Zoom In</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(-0.1)\">Width -</button>'
        + '<span id=\"pv-width-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(0.1)\">Width +</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(-1)\">Font -</button>'
        + '<span id=\"pv-font-label\" class=\"label\">21px</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(1)\">Font +</button>'
        + '<button type=\"button\" style=\"margin-left:auto\" onclick=\"window.close()\">Close</button>'
        + '</div><div id=\"pv-viewport\"><div id=\"pv-content\"></div></div></div>'
        + '<script>window.addEventListener(\"beforeunload\",function(){try{if(window.opener&&typeof window.opener.onPreviewPopupClosed===\"function\"){window.opener.onPreviewPopupClosed();}}catch(e){}});<\/script>'
        + '</body></html>';
}

function resetPreviewPopupMermaidLoader() {
    previewPopupMermaidLoadPromise = null;
}

function isQuotedFieldForPv(value) {
    const v = String(value || '').trim();
    return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
}

function unquoteFieldForPv(value) {
    const v = String(value || '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
    return v;
}

function quoteMermaidFieldForPv(value) {
    const v = String(value || '').trim();
    if (!v) return '""';
    if (isQuotedFieldForPv(v)) return v;
    if (/[^\x00-\x7F]/.test(v) || /\s/.test(v) || /[,:;]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
    return v;
}

function normalizePreviewPopupMermaidDiagramType(source) {
    const src = String(source || '');
    // Accept both "treeView" and "treeview" and normalize to the beta keyword.
    return src.replace(/(^\s*)(treeview|treeView)(?!-beta)(?=\s|$)/im, '$1treeView-beta');
}

function preprocessPreviewPopupMermaidSource(source) {
    let src = normalizePreviewPopupMermaidDiagramType(source).trim();
    if (!/^sankey-beta\b/i.test(src) &&
        window.MermaidLabelSanitizer &&
        typeof window.MermaidLabelSanitizer.preprocess === 'function') {
        src = window.MermaidLabelSanitizer.preprocess(src);
    }
    if (!/^sankey-beta\b/i.test(src)) return { source: src, labelMap: null };

    const lines = src.split(/\r?\n/);
    const out = [];
    const labelMap = {};
    const reverseMap = {};
    let aliasSeq = 0;
    let started = false;

    function toAlias(label) {
        const key = String(label || '');
        if (reverseMap[key]) return reverseMap[key];
        const alias = 'kr_node_' + (aliasSeq++);
        reverseMap[key] = alias;
        labelMap[alias] = key;
        return alias;
    }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = String(raw || '').trim();
        if (!started) {
            out.push(raw);
            if (/^sankey-beta\b/i.test(trimmed)) started = true;
            continue;
        }
        if (!trimmed || /^%%/.test(trimmed)) {
            out.push(raw);
            continue;
        }
        const noSemi = trimmed.replace(/;+\s*$/, '');
        const m = noSemi.match(/^(.*?),(.*?),(.*)$/);
        if (!m) {
            out.push(raw);
            continue;
        }
        const fromRaw = unquoteFieldForPv(m[1]);
        const toRaw = unquoteFieldForPv(m[2]);
        const from = /[^\x00-\x7F]/.test(fromRaw) ? toAlias(fromRaw) : quoteMermaidFieldForPv(m[1]);
        const to = /[^\x00-\x7F]/.test(toRaw) ? toAlias(toRaw) : quoteMermaidFieldForPv(m[2]);
        const value = String(m[3] || '').trim();
        out.push(from + ', ' + to + ', ' + value);
    }
    return { source: out.join('\n'), labelMap: Object.keys(labelMap).length ? labelMap : null };
}

function restorePreviewPopupSankeyLabels(wrapper) {
    if (!wrapper) return;
    let labelMap = null;
    try { labelMap = JSON.parse(wrapper.getAttribute('data-sankey-label-map') || 'null'); } catch (e) { labelMap = null; }
    if (!labelMap) return;
    const svg = wrapper.querySelector('svg');
    if (!svg) return;
    const textNodes = svg.querySelectorAll('text, tspan');
    function escapeRegExp(text) { return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    for (let i = 0; i < textNodes.length; i++) {
        const el = textNodes[i];
        let next = String(el.textContent || '');
        for (const alias in labelMap) {
            if (!Object.prototype.hasOwnProperty.call(labelMap, alias)) continue;
            const re = new RegExp('\\b' + escapeRegExp(alias) + '\\b', 'g');
            next = next.replace(re, String(labelMap[alias] || ''));
        }
        el.textContent = next;
    }
}

async function loadMermaidInPreviewPopup() {
    if (!isPreviewPopupAlive()) return null;
    const win = previewPopupWindow;
    if (win.mermaid && win.__mdvMermaidReady) return win.mermaid;
    if (previewPopupMermaidLoadPromise) return previewPopupMermaidLoadPromise;

    previewPopupMermaidLoadPromise = new Promise(function (resolve, reject) {
        const doc = win.document;
        const existing = doc.querySelector('script[data-pv-mermaid="1"]');
        const done = function () {
            try {
                if (!win.mermaid) throw new Error('Mermaid was not loaded in PV window.');
                win.mermaid.initialize({
                    startOnLoad: false,
                    suppressErrorRendering: true,
                    securityLevel: 'loose',
                    theme: 'default',
                    flowchart: { useMaxWidth: true, htmlLabels: true },
                    themeVariables: PREVIEW_MERMAID_THEME_VARIABLES
                });
                win.__mdvMermaidReady = true;
                resolve(win.mermaid);
            } catch (e) {
                reject(e);
            }
        };

        if (existing && win.mermaid) {
            done();
            return;
        }

        const script = doc.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-pv-mermaid', '1');
        script.onload = done;
        script.onerror = function () { reject(new Error('Failed to load Mermaid in PV window.')); };
        doc.head.appendChild(script);
    }).catch(function (err) {
        previewPopupMermaidLoadPromise = null;
        throw err;
    });

    return previewPopupMermaidLoadPromise;
}

function polishPreviewPopupMermaidSvg(wrapper) {
    const doc = previewPopupWindow && previewPopupWindow.document;
    const svg = wrapper && wrapper.querySelector ? wrapper.querySelector('svg') : null;
    if (!doc || !svg || svg.querySelector('style[data-mdv-mermaid-polish="1"]')) return;
    svg.style.display = 'block';
    svg.style.marginLeft = 'auto';
    svg.style.marginRight = 'auto';
    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.setAttribute('data-mdv-mermaid-polish', '1');
    style.textContent = [
        '.node rect,.node polygon,.node circle,.node ellipse{filter:drop-shadow(0 8px 18px rgba(15,23,42,.10));stroke-width:1.4px;}',
        '.node .label,.nodeLabel,.edgeLabel,.label{font-weight:600;letter-spacing:0;}',
        '.edgeLabel{border-radius:8px;color:#334155;}',
        '.flowchart-link{stroke:#64748b !important;stroke-width:1.9px;}',
        'marker path,path.arrowMarkerPath{fill:#64748b !important;stroke:#64748b !important;}',
        '.cluster rect{stroke-dasharray:0;}'
    ].join('\n');
    svg.insertBefore(style, svg.firstChild);
}

function getPreviewPopupMermaidScale(wrapper) {
    const current = Number(wrapper && wrapper.getAttribute('data-pv-mermaid-scale'));
    return Number.isFinite(current) && current > 0 ? current : 1;
}

function applyPreviewPopupMermaidScale(wrapper, nextScale) {
    if (!wrapper || !wrapper.querySelector) return;
    const svg = wrapper.querySelector('svg');
    if (!svg) return;
    const scale = Math.max(0.25, Math.min(3, Math.round((Number(nextScale) || 1) * 100) / 100));
    wrapper.setAttribute('data-pv-mermaid-scale', String(scale));
    svg.style.setProperty('width', Math.round(scale * 100) + '%', 'important');
    svg.style.setProperty('height', 'auto', 'important');
    svg.style.setProperty('max-width', 'none', 'important');
    const label = wrapper.querySelector('.trt-pv-mermaid-scale');
    if (label) label.textContent = Math.round(scale * 100) + '%';
}

function addPreviewPopupMermaidControls(wrapper) {
    const doc = previewPopupWindow && previewPopupWindow.document;
    if (!doc || !wrapper || wrapper.querySelector('.trt-pv-mermaid-controls')) return;
    const controls = doc.createElement('div');
    controls.className = 'trt-pv-mermaid-controls';

    function addButton(text, title, action) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'trt-pv-mermaid-btn';
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            action();
        });
        controls.appendChild(button);
    }

    addButton('↔', 'PV 너비에 맞춤', function () {
        applyPreviewPopupMermaidScale(wrapper, 1);
    });
    addButton('R', '도표 크기 초기화', function () {
        applyPreviewPopupMermaidScale(wrapper, 1);
    });
    addButton('−', '도표 축소', function () {
        applyPreviewPopupMermaidScale(wrapper, getPreviewPopupMermaidScale(wrapper) - 0.1);
    });

    const scaleLabel = doc.createElement('span');
    scaleLabel.className = 'trt-pv-mermaid-scale';
    scaleLabel.textContent = '100%';
    controls.appendChild(scaleLabel);

    addButton('+', '도표 확대', function () {
        applyPreviewPopupMermaidScale(wrapper, getPreviewPopupMermaidScale(wrapper) + 0.1);
    });

    wrapper.appendChild(controls);
    applyPreviewPopupMermaidScale(wrapper, 1);
}

async function renderMermaidInPreviewPopup(root) {
    if (!isPreviewPopupAlive() || !root) return;
    const win = previewPopupWindow;
    const doc = win.document;
    const codeNodes = root.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid, pre > code.mermaid');
    if (!codeNodes.length) return;

    const targets = [];
    for (let i = 0; i < codeNodes.length; i++) {
        const codeEl = codeNodes[i];
        const pre = codeEl.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;
        const prep = preprocessPreviewPopupMermaidSource(String(codeEl.textContent || '').trim());
        const source = String(prep && prep.source ? prep.source : '').trim();
        if (!source) continue;

        const wrapper = doc.createElement('div');
        wrapper.className = 'trt-mermaid-wrapper my-3';
        wrapper.setAttribute('data-mermaid-source', source);
        if (prep && prep.labelMap) wrapper.setAttribute('data-sankey-label-map', JSON.stringify(prep.labelMap));
        const viewport = doc.createElement('div');
        viewport.className = 'trt-pv-mermaid-viewport';
        const block = doc.createElement('div');
        block.className = 'mermaid trt-pv-mermaid-canvas';
        block.textContent = source;
        viewport.appendChild(block);
        wrapper.appendChild(viewport);
        pre.replaceWith(wrapper);
        targets.push({ block, wrapper, source });
    }

    if (!targets.length) return;
    await loadMermaidInPreviewPopup();

    for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        try {
            await win.mermaid.run({ nodes: [item.block] });
            restorePreviewPopupSankeyLabels(item.wrapper);
            polishPreviewPopupMermaidSvg(item.wrapper);
            addPreviewPopupMermaidControls(item.wrapper);
        } catch (e) {
            item.wrapper.innerHTML = '';
            const errPre = doc.createElement('pre');
            errPre.className = 'trt-mermaid-error';
            errPre.textContent = item.source;
            item.wrapper.appendChild(errPre);
        }
    }
}

function applyPreviewPopupViewport() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const content = doc.getElementById('pv-content');
    const scaleLabel = doc.getElementById('pv-scale-label');
    const widthLabel = doc.getElementById('pv-width-label');
    const fontLabel = doc.getElementById('pv-font-label');
    if (!content) return;

    const scale = Math.max(0.1, Math.min(3, Number(previewPopupScale) || 1));
    const widthScale = Math.max(0.5, Math.min(2.5, Number(previewPopupWidthScale) || 1));
    const fs = Math.max(8, Math.min(72, Number(previewPopupFontSize) || 21));
    previewPopupScale = scale;
    previewPopupWidthScale = widthScale;
    previewPopupFontSize = fs;

    const baseMaxWidthRem = 56;
    const widthRem = Math.max(28, baseMaxWidthRem * widthScale);
    content.style.zoom = String(scale);
    content.style.transform = 'none';
    content.style.width = '';
    content.style.maxWidth = widthRem + 'rem';
    content.style.marginLeft = 'auto';
    content.style.marginRight = 'auto';
    content.style.fontSize = fs + 'px';
    if (scaleLabel) scaleLabel.textContent = Math.round(scale * 100) + '%';
    if (widthLabel) widthLabel.textContent = Math.round(widthScale * 100) + '%';
    if (fontLabel) fontLabel.textContent = fs + 'px';
}

function previewPopupAdjustScale(delta) {
    previewPopupScale = (Number(previewPopupScale) || 1) + Number(delta || 0);
    applyPreviewPopupViewport();
}

function previewPopupAdjustWidth(delta) {
    previewPopupWidthScale = (Number(previewPopupWidthScale) || 1) + Number(delta || 0);
    applyPreviewPopupViewport();
}

function previewPopupAdjustFontSize(delta) {
    previewPopupFontSize = (Number(previewPopupFontSize) || 21) + Number(delta || 0);
    applyPreviewPopupViewport();
}

function getPreviewPopupSourceMarkdown() {
    try {
        if (typeof editorTextarea !== 'undefined' && editorTextarea && typeof editorTextarea.value === 'string') {
            return String(editorTextarea.value || '');
        }
    } catch (_) {}
    try {
        const ta = document.getElementById('viewer-edit-ta');
        if (ta && typeof ta.value === 'string') return String(ta.value || '');
    } catch (_) {}
    try {
        if (typeof currentMarkdown !== 'undefined') return String(currentMarkdown || '');
    } catch (_) {}
    return '';
}

async function updatePreviewPopupContent() {
    if (!isPreviewPopupAlive()) return;
    const token = ++previewPopupRenderToken;
    const raw = getPreviewPopupSourceMarkdown();
    const htmlDocument = (typeof getRenderableHtmlDocument === 'function')
        ? getRenderableHtmlDocument(raw)
        : null;
    let html = '';

    try {
        revokeObjectUrls(previewInternalImageObjectUrls);
        if (htmlDocument === null) {
            const resolvedRaw = await resolveInternalMarkdownImagesForPreview(raw);
            const preprocessed = preprocessMarkdownForView(resolvedRaw);
            if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.renderMarkdownSafe === 'function') {
                html = await MathRender.renderMarkdownSafe(
                    (typeof marked !== 'undefined' && marked.parse) ? marked : null,
                    preprocessed,
                    { fallbackText: resolvedRaw }
                );
            } else if (typeof marked === 'undefined' || !marked.parse) {
                html = '<p>' + escapeHtmlForPreview(resolvedRaw).replace(/\n/g, '<br>') + '</p>';
            } else {
                html = marked.parse(preprocessed);
            }
        }
    } catch (e) {
        html = '<p>' + escapeHtmlForPreview(raw).replace(/\n/g, '<br>') + '</p>';
    }

    if (token !== previewPopupRenderToken || !isPreviewPopupAlive()) return;
    const target = previewPopupWindow.document.getElementById('pv-content');
    if (!target) {
        setTimeout(function () {
            if (isPreviewPopupAlive()) updatePreviewPopupContent();
        }, 60);
        return;
    }
    if (htmlDocument !== null && typeof renderHtmlDocumentFrame === 'function') {
        applyPreviewPopupViewport();
        target.style.width = '100%';
        target.style.maxWidth = 'none';
        target.style.height = 'calc(100vh - 112px)';
        renderHtmlDocumentFrame(target, htmlDocument, {
            title: (typeof currentFileName !== 'undefined' && currentFileName) || 'HTML preview'
        });
        return;
    }
    target.style.height = '';
    if (typeof setHtmlDocumentMode === 'function') setHtmlDocumentMode(target, false);
    target.innerHTML = html;
    try {
        if (typeof applyDoiLinkTargets === 'function') applyDoiLinkTargets(target);
    } catch (_) {}
    try { await hydrateInternalImagesInElement(target, registerPreviewInternalObjectUrl); } catch (e) {}
    if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.typesetElement === 'function') {
        try { await MathRender.typesetElement(target); } catch (e) {}
    }
    try { await renderMermaidInPreviewPopup(target); } catch (e) {}
    applyPreviewPopupViewport();
}

function openPreviewPopupWindow() {
    if (isPreviewPopupAlive()) {
        if (previewPopupFileMode) {
            try {
                revokePreviewPopupFileObjectUrl();
                previewPopupWindow.document.open();
                previewPopupWindow.document.write(getPreviewPopupDocumentHtml());
                previewPopupWindow.document.close();
                previewPopupFileMode = false;
            } catch (_) {}
        }
        previewPopupWindow.focus();
        updatePreviewPopupContent();
        return;
    }

    const features = 'popup=yes,width=1100,height=820,left=120,top=80,resizable=yes,scrollbars=yes';
    previewPopupWindow = window.open('', 'mdproviewer_preview_popup', features);
    if (!previewPopupWindow) {
        showToast('Popup blocked. Please allow popups for this site.');
        return;
    }

    try {
        previewPopupWindow.document.open();
        previewPopupWindow.document.write(getPreviewPopupDocumentHtml());
        previewPopupWindow.document.close();
    } catch (e) {
        showToast('Failed to open preview window.');
        return;
    }

    if (previewPopupWindow) previewPopupWindow.focus();
    const renderNow = function () {
        if (!isPreviewPopupAlive()) return;
        updatePreviewPopupContent();
    };
    renderNow();
    setTimeout(renderNow, 40);
    setTimeout(renderNow, 140);
    try {
        previewPopupWindow.addEventListener('load', renderNow, { once: true });
    } catch (_) {}
}

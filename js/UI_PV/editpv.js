const PREVIEW_MERMAID_LIGHT_THEME_VARIABLES = {
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
const PREVIEW_MERMAID_DARK_THEME_VARIABLES = {
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

function isPreviewPopupDarkTheme() {
    // PV is a print preview. Keep its paper and Mermaid output in the light
    // print palette even when the editor itself is using the dark theme.
    return false;
}

function getPreviewPopupMermaidDisplayMode() {
    try {
        return localStorage.getItem('md_viewer_mermaid_display_mode') === 'fixed' ? 'fixed' : 'interactive';
    } catch (_) {
        return 'interactive';
    }
}

function syncPreviewPopupTheme() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    if (doc && doc.documentElement) {
        doc.documentElement.classList.remove('dark');
        doc.documentElement.classList.add('pv-print-preview');
    }
}

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
    input.accept = type === 'image'
        ? 'image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico,.avif'
        : type === 'pdf'
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
    const isImage = String(file.type || '').toLowerCase().startsWith('image/')
        || /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/.test(lowerName);
    if (!isImage && !isPdf && !isPresentation) {
        showToast('이미지, PDF 또는 PPTX 파일을 선택하세요.');
        return false;
    }
    revokePreviewPopupFileObjectUrl();
    previewPopupFileObjectUrl = URL.createObjectURL(file);
    if (isImage) {
        return openImageInPreviewPopup(previewPopupFileObjectUrl, name);
    }
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

function openImageInPreviewPopup(imageUrl, fileName) {
    if (!isPreviewPopupAlive()) return false;
    const doc = previewPopupWindow.document;
    let content = doc.getElementById('pv-content');
    if (!content) {
        try {
            doc.open();
            doc.write(getPreviewPopupDocumentHtml());
            doc.close();
            content = doc.getElementById('pv-content');
        } catch (error) {
            showToast('PV 이미지 화면을 준비하지 못했습니다.');
            return false;
        }
    }
    if (!content) return false;

    previewPopupFileMode = true;
    previewPopupScale = 1;
    previewPopupWidthScale = 1.5;
    doc.title = 'MDproViewer Preview - ' + String(fileName || 'Image');
    content.innerHTML = '';
    content.classList.add('pv-image-content');

    const heading = doc.createElement('div');
    heading.className = 'pv-image-title';
    heading.textContent = String(fileName || 'Image');
    const stage = doc.createElement('div');
    stage.className = 'pv-image-stage';
    const image = doc.createElement('img');
    image.className = 'pv-open-image';
    image.src = String(imageUrl || '');
    image.alt = String(fileName || 'Preview image');
    stage.appendChild(image);
    content.appendChild(heading);
    content.appendChild(stage);
    applyPreviewPopupViewport();
    try { previewPopupWindow.focus(); } catch (_) {}
    return true;
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

function escapePreviewAttribute(text) {
    return escapeHtmlForPreview(text)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPreviewPopupStylesheetLinks() {
    const wanted = /(?:tailwind-static\.css|\/css\/style\.css|katex(?:\.min)?\.css)/i;
    const seen = new Set();
    return Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'))
        .map(function (link) { return String(link.href || ''); })
        .filter(function (href) {
            if (!href || !wanted.test(href) || seen.has(href)) return false;
            seen.add(href);
            return true;
        })
        .map(function (href) {
            return '<link rel="stylesheet" href="' + escapePreviewAttribute(href) + '">';
        })
        .join('');
}

function getPreviewPopupDocumentHtml() {
    const mathHead = (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.getHeadTags === 'function')
        ? MathRender.getHeadTags({
            scriptUrl: new URL('./js/math_render/math_render.js?v=20260725-stable-math-1', window.location.href).href
        })
        : '';
    const baseHref = escapePreviewAttribute(document.baseURI || window.location.href);
    return '<!doctype html><html lang="ko" class="pv-print-preview"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><base href="' + baseHref + '"><title>MDproViewer Print Preview</title>'
        + getPreviewPopupStylesheetLinks()
        + mathHead
        + '<style>'
        + 'html,body{margin:0;padding:0;height:100%;font-family:Inter,"Noto Sans KR","Malgun Gothic",system-ui,-apple-system,"Segoe UI",sans-serif;background:#475569;color:#1e293b;}'
        + '#pv-root{height:100%;}'
        + '#pv-toolbar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0f172a;border-bottom:1px solid #334155;color:#e2e8f0;position:fixed;top:0;left:0;right:0;z-index:9999;box-sizing:border-box;overflow-x:auto;white-space:nowrap;}'
        + '#pv-toolbar button{padding:4px 10px;border:1px solid #94a3b8;background:#fff;border-radius:6px;font-weight:700;color:#1e293b;cursor:pointer;}'
        + '#pv-toolbar .label{font-size:12px;color:#cbd5e1;min-width:48px;text-align:center;font-weight:700;}'
        + '#pv-viewport{height:100%;overflow:auto;padding:72px 24px 32px;box-sizing:border-box;background:#475569;}'
        + '#pv-content{box-sizing:border-box;line-height:1.6;overflow-wrap:break-word;transform-origin:top center;margin:0 auto;width:210mm;max-width:210mm;min-height:297mm;padding:12mm 14mm;background:#fff;color:#1e293b;box-shadow:0 18px 48px rgba(15,23,42,.38);}'
        + '#pv-content>.note-cover-page{left:50%;max-width:none!important;margin-left:0!important;margin-right:0!important;transform:translateX(-50%);}'
        + '#pv-content>.note-cover-size-a3{width:297mm!important;}'
        + '#pv-content>.note-cover-size-a4{width:210mm!important;}'
        + '#pv-content>.note-cover-size-a5{width:148mm!important;}'
        + '#pv-content>.note-cover-size-letter,#pv-content>.note-cover-size-legal{width:216mm!important;}'
        + '#pv-content>.note-cover-page:first-child{margin-top:-12mm!important;}'
        + '#pv-content img,#pv-content svg,#pv-content canvas,#pv-content video{max-width:100%;}'
        + '#pv-content iframe,#pv-content embed,#pv-content object{display:block;max-width:100%;}'
        + '#pv-content .no-print,#pv-content .note-cover-transform-handle,#pv-content .note-cover-image-replace{display:none!important;}'
        + '#pv-content .note-cover-text[contenteditable]{outline:none!important;background:transparent!important;cursor:default!important;}'
        + '#pv-content .trt-mermaid-wrapper{position:relative;display:block;box-sizing:border-box;width:100%;min-width:180px;min-height:140px;padding:52px 14px 14px;margin:1rem 0;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;background:#fff;}'
        + '#pv-content .trt-mermaid-wrapper[data-mermaid-mode="fixed"]{min-height:140px;}'
        + '#pv-content .trt-pv-mermaid-viewport{width:100%;height:100%;min-height:0;box-sizing:border-box;overflow:auto;background:transparent;}'
        + '#pv-content .trt-pv-mermaid-canvas{display:block;width:100%;min-width:0;overflow:visible;}'
        + '#pv-content .trt-pv-mermaid-canvas svg{display:block;margin:0 auto;max-width:none!important;height:auto!important;overflow:visible;transform-origin:top center;}'
        + '#pv-content .trt-pv-mermaid-controls{position:absolute;top:10px;right:10px;z-index:20;display:flex;align-items:center;gap:5px;}'
        + '#pv-content .trt-pv-mermaid-btn{min-width:32px;height:30px;padding:0 7px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#334155;font:700 13px/1 Arial,sans-serif;cursor:pointer;}'
        + '#pv-content .trt-pv-mermaid-btn:hover{background:#eef2ff;border-color:#a5b4fc;color:#3730a3;}'
        + '#pv-content .trt-pv-mermaid-scale{min-width:46px;text-align:center;color:#334155;font-size:12px;font-weight:700;}'
        + '#pv-content .trt-pv-mermaid-resize-handle{position:absolute;z-index:21;touch-action:none;}'
        + '#pv-content .trt-pv-mermaid-resize-w{top:0;left:0;bottom:0;width:10px;cursor:ew-resize;}'
        + '#pv-content .trt-pv-mermaid-resize-e{top:0;right:0;bottom:0;width:10px;cursor:ew-resize;}'
        + '#pv-content .trt-pv-mermaid-resize-s{left:0;right:0;bottom:0;height:10px;cursor:ns-resize;}'
        + '#pv-content .trt-pv-mermaid-resize-w::after,#pv-content .trt-pv-mermaid-resize-e::after{content:"";position:absolute;top:50%;width:3px;height:42px;border-radius:3px;background:#64748b;opacity:.42;transform:translateY(-50%);}'
        + '#pv-content .trt-pv-mermaid-resize-w::after{left:2px;}'
        + '#pv-content .trt-pv-mermaid-resize-e::after{right:2px;}'
        + '#pv-content .trt-pv-mermaid-resize-s::after{content:"";position:absolute;left:50%;bottom:2px;width:42px;height:3px;border-radius:3px;background:#64748b;opacity:.42;transform:translateX(-50%);}'
        + '#pv-content .trt-pv-mermaid-resize-w:hover::after,#pv-content .trt-pv-mermaid-resize-e:hover::after,#pv-content .trt-pv-mermaid-resize-s:hover::after{opacity:1;background:#6366f1;}'
        + '#pv-content .trt-pv-mermaid-resize-sw{left:0;bottom:0;width:18px;height:18px;cursor:nesw-resize;background:linear-gradient(225deg,transparent 45%,#94a3b8 46%,#94a3b8 54%,transparent 55%);opacity:.75;}'
        + '#pv-content .trt-pv-mermaid-resize-se{right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,#94a3b8 46%,#94a3b8 54%,transparent 55%);opacity:.75;}'
        + '#pv-content .trt-pv-mermaid-resize-sw:hover,#pv-content .trt-pv-mermaid-resize-se:hover{opacity:1;}'
        + '#pv-content.pv-image-content{box-sizing:border-box;}'
        + '#pv-content .pv-image-title{margin:0 0 10px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-size:14px;font-weight:800;color:#334155;}'
        + '#pv-content .pv-image-stage{display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 150px);padding:18px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;background-color:#eef2f7;background-image:linear-gradient(45deg,#dbe2ea 25%,transparent 25%),linear-gradient(-45deg,#dbe2ea 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dbe2ea 75%),linear-gradient(-45deg,transparent 75%,#dbe2ea 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;}'
        + '#pv-content .pv-open-image{display:block;max-width:100%;height:auto;max-height:calc(100vh - 190px);object-fit:contain;box-shadow:0 12px 32px rgba(15,23,42,.18);}'
        + '</style></head><body><div id=\"pv-root\"><div id=\"pv-toolbar\">'
        + '<strong style=\"margin-right:6px\">Preview</strong>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'image\')\">이미지 열기</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pdf\')\">PDF 열기</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pptx\')\">PPTX 열기</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(-0.1)\">Zoom Out</button>'
        + '<span id=\"pv-scale-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(0.1)\">Zoom In</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(-0.1)\">Width -</button>'
        + '<span id=\"pv-width-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(0.1)\">Width +</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(-1)\">Font -</button>'
        + '<span id=\"pv-font-label\" class=\"label\">16px</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(1)\">Font +</button>'
        + '<button type=\"button\" style=\"margin-left:auto\" onclick=\"window.close()\">Close</button>'
        + '</div><div id=\"pv-viewport\"><div id=\"pv-content\" class=\"markdown-body print-area\"></div></div></div>'
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

function configurePreviewPopupMermaid(win) {
    if (!win || !win.mermaid || typeof win.mermaid.initialize !== 'function') return;
    const dark = isPreviewPopupDarkTheme();
    win.mermaid.initialize({
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
        themeVariables: dark ? PREVIEW_MERMAID_DARK_THEME_VARIABLES : PREVIEW_MERMAID_LIGHT_THEME_VARIABLES
    });
}

function waitForPreviewPopupMermaidFonts() {
    if (!isPreviewPopupAlive()) return Promise.resolve();
    const fonts = previewPopupWindow.document.fonts;
    if (!fonts || !fonts.ready) return Promise.resolve();
    return Promise.race([
        fonts.ready.catch(function () {}),
        new Promise(function (resolve) { setTimeout(resolve, 800); })
    ]);
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
                configurePreviewPopupMermaid(win);
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

function expandPreviewPopupMermaidSvgBounds(svg) {
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

function polishPreviewPopupMermaidSvg(wrapper) {
    const doc = previewPopupWindow && previewPopupWindow.document;
    const svg = wrapper && wrapper.querySelector ? wrapper.querySelector('svg') : null;
    if (!doc || !svg) return;
    expandPreviewPopupMermaidSvgBounds(svg);
    if (svg.querySelector('style[data-mdv-mermaid-polish="1"]')) return;
    const dark = isPreviewPopupDarkTheme();
    const lineColor = dark ? '#94a3b8' : '#64748b';
    const textColor = dark ? '#e2e8f0' : '#334155';
    const shadowColor = dark ? 'rgba(0,0,0,.28)' : 'rgba(15,23,42,.10)';
    svg.style.display = 'block';
    svg.style.marginLeft = 'auto';
    svg.style.marginRight = 'auto';
    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
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

function getPreviewPopupMermaidScale(wrapper) {
    const current = Number(wrapper && wrapper.getAttribute('data-pv-mermaid-scale'));
    return Number.isFinite(current) && current > 0 ? current : 1;
}

function getPreviewPopupMermaidNaturalWidth(svg) {
    if (!svg) return 0;
    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0) return viewBox[2];
    const width = Number.parseFloat(svg.getAttribute('width'));
    return Number.isFinite(width) && width > 0 ? width : 0;
}

function applyPreviewPopupMermaidScale(wrapper, nextScale) {
    if (!wrapper || !wrapper.querySelector) return;
    const svg = wrapper.querySelector('svg');
    const viewport = wrapper.querySelector('.trt-pv-mermaid-viewport');
    if (!svg || !viewport) return;
    const scale = Math.max(0.2, Math.min(1.6, Math.round((Number(nextScale) || 1) * 10) / 10));
    const availableWidth = Math.max(160, viewport.clientWidth || wrapper.clientWidth - 28 || 760);
    const naturalWidth = getPreviewPopupMermaidNaturalWidth(svg) || availableWidth;
    const fittedBaseWidth = Math.min(naturalWidth, availableWidth * 0.86);
    const displayWidth = Math.max(80, Math.min(availableWidth * 1.6, fittedBaseWidth * scale));
    wrapper.setAttribute('data-pv-mermaid-scale', String(scale));
    svg.style.setProperty('width', Math.round(displayWidth) + 'px', 'important');
    svg.style.setProperty('height', 'auto', 'important');
    svg.style.setProperty('max-width', 'none', 'important');
    svg.style.setProperty('transform', 'none', 'important');
    const label = wrapper.querySelector('.trt-pv-mermaid-scale');
    if (label) label.textContent = Math.round(scale * 100) + '%';
}

function bindPreviewPopupMermaidResize(wrapper) {
    const win = previewPopupWindow;
    if (!win || !wrapper || wrapper.__mdvPvResizeBound || typeof win.ResizeObserver === 'undefined') return;
    const viewport = wrapper.querySelector('.trt-pv-mermaid-viewport');
    if (!viewport) return;
    wrapper.__mdvPvResizeBound = true;
    let frame = 0;
    let lastWidth = Math.round(viewport.getBoundingClientRect().width * 10) / 10;
    const observer = new win.ResizeObserver(function (entries) {
        const entry = entries && entries[0];
        const width = entry && entry.contentRect
            ? Math.round(entry.contentRect.width * 10) / 10
            : Math.round(viewport.getBoundingClientRect().width * 10) / 10;
        if (Math.abs(width - lastWidth) < 0.5) return;
        lastWidth = width;
        if (frame) win.cancelAnimationFrame(frame);
        frame = win.requestAnimationFrame(function () {
            frame = 0;
            applyPreviewPopupMermaidScale(wrapper, getPreviewPopupMermaidScale(wrapper));
        });
    });
    observer.observe(viewport);
    wrapper.__mdvPvResizeObserver = observer;
}

function bindPreviewPopupMermaidBoxResize(wrapper) {
    const win = previewPopupWindow;
    const doc = win && win.document;
    if (!win || !doc || !wrapper || wrapper.__mdvPvBoxResizeBound) return;
    wrapper.__mdvPvBoxResizeBound = true;

    const handles = Array.from(wrapper.querySelectorAll('.trt-pv-mermaid-resize-handle'));
    let activeHandle = '';
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startMarginLeft = 0;

    function stopResize(event) {
        doc.documentElement.removeEventListener('pointermove', moveResize);
        doc.documentElement.removeEventListener('pointerup', stopResize);
        doc.documentElement.removeEventListener('pointercancel', stopResize);
        doc.body.style.userSelect = '';
        if (event && event.target && event.target.releasePointerCapture) {
            try { event.target.releasePointerCapture(event.pointerId); } catch (e) {}
        }
        activeHandle = '';
        applyPreviewPopupMermaidScale(wrapper, getPreviewPopupMermaidScale(wrapper));
    }

    function moveResize(event) {
        if (!activeHandle) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        if (activeHandle === 'w' || activeHandle === 'sw') {
            let nextWidth = Math.max(180, startWidth - dx);
            let nextMarginLeft = startMarginLeft + (startWidth - nextWidth);
            if (nextMarginLeft < 0) {
                nextWidth = startWidth + startMarginLeft;
                nextMarginLeft = 0;
            }
            wrapper.style.width = nextWidth + 'px';
            wrapper.style.marginLeft = nextMarginLeft + 'px';
            wrapper.style.marginRight = '0';
        }
        if (activeHandle === 'e' || activeHandle === 'se') {
            wrapper.style.width = Math.max(180, startWidth + dx) + 'px';
            wrapper.style.marginRight = '0';
        }
        if (activeHandle === 's' || activeHandle === 'sw' || activeHandle === 'se') {
            wrapper.style.height = Math.max(140, startHeight + dy) + 'px';
        }
    }

    function startResize(event) {
        const handle = event.currentTarget;
        activeHandle = handle.getAttribute('data-pv-resize-direction') || '';
        if (!activeHandle) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = wrapper.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startWidth = rect.width;
        startHeight = rect.height;
        startMarginLeft = Number.parseFloat(win.getComputedStyle(wrapper).marginLeft) || 0;
        doc.body.style.userSelect = 'none';
        doc.documentElement.addEventListener('pointermove', moveResize);
        doc.documentElement.addEventListener('pointerup', stopResize);
        doc.documentElement.addEventListener('pointercancel', stopResize);
        try { handle.setPointerCapture(event.pointerId); } catch (e) {}
    }

    handles.forEach(function (handle) {
        handle.addEventListener('pointerdown', startResize);
    });
}

function addPreviewPopupMermaidResizeHandles(wrapper) {
    const doc = previewPopupWindow && previewPopupWindow.document;
    if (!doc || !wrapper || wrapper.querySelector('.trt-pv-mermaid-resize-handle')) return;
    [
        { direction: 'w', title: '왼쪽 너비 조절' },
        { direction: 'e', title: '오른쪽 너비 조절' },
        { direction: 's', title: '아래 높이 조절' },
        { direction: 'sw', title: '왼쪽 아래 크기 조절' },
        { direction: 'se', title: '오른쪽 아래 크기 조절' }
    ].forEach(function (item) {
        const handle = doc.createElement('div');
        handle.className = 'trt-pv-mermaid-resize-handle trt-pv-mermaid-resize-' + item.direction;
        handle.setAttribute('data-pv-resize-direction', item.direction);
        handle.title = item.title;
        wrapper.appendChild(handle);
    });
    bindPreviewPopupMermaidBoxResize(wrapper);
}

function addPreviewPopupMermaidControls(wrapper) {
    const doc = previewPopupWindow && previewPopupWindow.document;
    if (!doc || !wrapper || wrapper.querySelector('.trt-pv-mermaid-controls')) return;
    const controls = doc.createElement('div');
    controls.className = 'trt-pv-mermaid-controls';

    function addButton(text, title, action, extraClass) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'trt-pv-mermaid-btn' + (extraClass ? (' ' + extraClass) : '');
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            action();
        });
        controls.appendChild(button);
    }

    const fixed = wrapper.getAttribute('data-mermaid-mode') === 'fixed';
    if (!fixed) {
        addButton('↔', 'PV 너비에 맞춤', function () {
            applyPreviewPopupMermaidScale(wrapper, 1);
        });
        addButton('R', '도표 크기 초기화', function () {
            applyPreviewPopupMermaidScale(wrapper, 1);
        });
    }
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
    if (fixed) {
        addButton('맞춤', '문서 너비에 맞는 기본 크기', function () {
            applyPreviewPopupMermaidScale(wrapper, 1);
        }, 'trt-pv-mermaid-fit');
    }

    wrapper.appendChild(controls);
    addPreviewPopupMermaidResizeHandles(wrapper);
    bindPreviewPopupMermaidResize(wrapper);
    applyPreviewPopupMermaidScale(wrapper, 1);
}

async function renderMermaidInPreviewPopup(root) {
    if (!isPreviewPopupAlive() || !root) return;
    const win = previewPopupWindow;
    const doc = win.document;
    syncPreviewPopupTheme();
    const displayMode = getPreviewPopupMermaidDisplayMode();
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
        wrapper.setAttribute('data-mermaid-original-source', String(codeEl.textContent || '').trim());
        wrapper.setAttribute('data-mermaid-mode', displayMode);
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
    await waitForPreviewPopupMermaidFonts();
    configurePreviewPopupMermaid(win);

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

    const basePageWidthMm = 210;
    const widthMm = Math.max(148, basePageWidthMm * widthScale);
    content.style.zoom = String(scale);
    content.style.transform = 'none';
    content.style.width = widthMm + 'mm';
    content.style.maxWidth = 'none';
    content.style.marginLeft = 'auto';
    content.style.marginRight = 'auto';
    content.style.fontSize = fs + 'px';
    content.style.setProperty('--md-app-font-size', fs + 'px');
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
    if (previewPopupFileMode) return;
    syncPreviewPopupTheme();
    const token = ++previewPopupRenderToken;
    const raw = getPreviewPopupSourceMarkdown();
    const snapshot = prepareMarkdownRenderSnapshot(raw);
    const renderRaw = snapshot.renderSource;
    const htmlDocument = (typeof getRenderableHtmlDocument === 'function')
        ? getRenderableHtmlDocument(renderRaw)
        : null;
    let html = '';

    try {
        revokeObjectUrls(previewInternalImageObjectUrls);
        if (htmlDocument === null) {
            html = await renderMarkdownSnapshotToHtml(snapshot);
        }
    } catch (e) {
        html = '<p>' + escapeHtmlForPreview(renderRaw).replace(/\n/g, '<br>') + '</p>';
    }

    if (token !== previewPopupRenderToken
        || !isPreviewPopupAlive()
        || !isMarkdownRenderSnapshotCurrent(snapshot)) return;
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
        if (typeof applyMarkdownImageSizeHints === 'function') {
            applyMarkdownImageSizeHints(target);
        }
    } catch (_) {}
    try {
        if (snapshot.features.hasNoteCover
            && window.NoteCoverRenderer
            && typeof window.NoteCoverRenderer.hydrate === 'function') {
            window.NoteCoverRenderer.hydrate(target, {});
            target.querySelectorAll('.note-cover-text[contenteditable]').forEach(function (element) {
                element.setAttribute('contenteditable', 'false');
                element.removeAttribute('tabindex');
            });
        }
    } catch (_) {}
    try {
        if (snapshot.features.hasDoiLinks && typeof applyDoiLinkTargets === 'function') {
            applyDoiLinkTargets(target);
        }
    } catch (_) {}
    try {
        if (snapshot.features.hasInternalImages) {
            await hydrateInternalImagesInElement(target, registerPreviewInternalObjectUrl);
        }
    } catch (e) {}
    if (snapshot.features.hasMath
        && typeof MathRender !== 'undefined'
        && MathRender
        && typeof MathRender.typesetElement === 'function') {
        try {
            if (typeof window.ensureMdMathEngineLoaded === 'function') await window.ensureMdMathEngineLoaded();
            await MathRender.typesetElement(target);
        } catch (e) {}
    }
    if (snapshot.features.hasMermaid) {
        try { await renderMermaidInPreviewPopup(target); } catch (e) {}
    }
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

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
const PREVIEW_PV_THEME_STORAGE_KEY = 'md_viewer_pv_theme_v1';
const PREVIEW_PV_HEADER_SCALE_STORAGE_KEY = 'md_viewer_pv_header_scale_v1';
const PREVIEW_PV_HEADER_BACKGROUND_REMOVED_STORAGE_KEY = 'md_viewer_pv_header_background_removed_v1';

function getPreviewPopupHeaderScaleFromLocal() {
    try {
        const value = Number(localStorage.getItem(PREVIEW_PV_HEADER_SCALE_STORAGE_KEY));
        if (Number.isFinite(value) && value >= 0.5 && value <= 2.5) return value;
    } catch (_) {}
    return 1;
}

function getPreviewPopupHeaderBackgroundRemovedFromLocal() {
    try {
        return localStorage.getItem(PREVIEW_PV_HEADER_BACKGROUND_REMOVED_STORAGE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function getPreviewPopupTheme() {
    try {
        return localStorage.getItem(PREVIEW_PV_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (_) {
        return 'light';
    }
}

function isPreviewPopupDarkTheme() {
    if (typeof previewPopupWindow !== 'undefined' && isPreviewPopupAlive()) {
        const root = previewPopupWindow.document && previewPopupWindow.document.documentElement;
        if (root) return root.classList.contains('dark');
    }
    return getPreviewPopupTheme() === 'dark';
}

function getPreviewPopupMermaidDisplayMode() {
    try {
        return localStorage.getItem('md_viewer_mermaid_display_mode') === 'interactive' ? 'interactive' : 'fixed';
    } catch (_) {
        return 'fixed';
    }
}

function syncPreviewPopupTheme() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    if (doc && doc.documentElement) {
        const dark = getPreviewPopupTheme() === 'dark';
        doc.documentElement.classList.toggle('dark', dark);
        doc.documentElement.classList.add('pv-print-preview');
        const button = doc.getElementById('pv-theme-toggle');
        if (button) {
            button.textContent = dark ? '라이트' : '다크';
            button.title = dark ? 'PV를 라이트 모드로 전환' : 'PV를 다크 모드로 전환';
            button.setAttribute('aria-pressed', dark ? 'true' : 'false');
        }
    }
}

function previewPopupToggleTheme() {
    if (!isPreviewPopupAlive()) return false;
    const nextTheme = isPreviewPopupDarkTheme() ? 'light' : 'dark';
    try { localStorage.setItem(PREVIEW_PV_THEME_STORAGE_KEY, nextTheme); } catch (_) {}
    syncPreviewPopupTheme();
    resetPreviewPopupMermaidLoader();
    if (!previewPopupFileMode && !previewPopupEditMode) updatePreviewPopupContent();
    return true;
}

let previewPopupFileMode = false;
let previewPopupFileObjectUrl = '';
let previewPopupEditMode = false;
let previewPopupDraftMarkdown = '';
let previewPopupDraftBaseMarkdown = '';
let previewPopupDraftDirty = false;
let previewPopupRenderedSelectionRange = null;
let previewPopupRenderedDomChanged = false;
let previewPopupTablePickerOpen = false;
let previewPopupTablePickerBound = false;
let previewPopupTablePickerCloseHandler = null;
let previewPopupMarginDialogOpen = false;
let previewPopupMarginDialogBound = false;
let previewPopupMarginDialogCloseHandler = null;
let previewPopupHeaderScale = getPreviewPopupHeaderScaleFromLocal();
let previewPopupHeaderBackgroundRemoved = getPreviewPopupHeaderBackgroundRemovedFromLocal();
let previewPopupHeaderRelayoutTimer = null;
let previewPopupImageResizeRetryTimer = null;
let previewPopupEditPageGuideTimer = null;
let previewPopupEditPageGuideObserver = null;

function cancelPreviewPopupImageResize() {
    if (!isPreviewPopupAlive()) return false;
    const resize = previewPopupWindow.ViewModeImageResize;
    if (!resize || typeof resize.cancel !== 'function') return false;
    try {
        resize.cancel();
    } catch (_) {
        return false;
    }
    return true;
}

const PREVIEW_PV_TABLE_ROWS_MAX = 10;
const PREVIEW_PV_TABLE_COLS_MAX = 10;
const PREVIEW_PV_TABLE_PICKER_ROWS = 10;
const PREVIEW_PV_TABLE_PICKER_COLS = 10;
const PREVIEW_PV_A4_WIDTH_MM = 210;
const PREVIEW_PV_A4_HEIGHT_MM = 297;
const PREVIEW_PV_MARGIN_STORAGE_KEY = 'md_viewer_pv_margin_mm_v1';
const PREVIEW_PV_MARGIN_AXIS = Object.freeze(['top', 'right', 'bottom', 'left']);
const PREVIEW_PV_DEFAULT_MARGINS = Object.freeze({
    top: 14,
    right: 12,
    bottom: 14,
    left: 12
});

function revokePreviewPopupFileObjectUrl() {
    if (!previewPopupFileObjectUrl) return;
    try { URL.revokeObjectURL(previewPopupFileObjectUrl); } catch (_) {}
    previewPopupFileObjectUrl = '';
}

function isPreviewPopupAlive() {
    return !!(previewPopupWindow && !previewPopupWindow.closed);
}

function getPreviewPopupImageResizeSourceMarkdown() {
    if (previewPopupDraftDirty) return String(previewPopupDraftMarkdown || '');
    return getPreviewPopupSourceMarkdown();
}

function applyPreviewPopupImageResizeResult(nextMarkdown) {
    const base = String(previewPopupDraftBaseMarkdown || getPreviewPopupSourceMarkdown());
    previewPopupDraftMarkdown = String(nextMarkdown || '');
    previewPopupDraftDirty = previewPopupDraftMarkdown !== base;
    previewPopupRenderedDomChanged = true;
    syncPreviewPopupEditorUi();
    syncPreviewPopupImageResize();
    return true;
}

function syncPreviewPopupImageResize() {
    if (!isPreviewPopupAlive() || !previewPopupEditMode) return false;
    const editor = getPreviewPopupEditorElement();
    const resize = previewPopupWindow.ViewModeImageResize;
    if (!editor || !resize || typeof resize.hydrate !== 'function') return false;
    const source = getPreviewPopupImageResizeSourceMarkdown();
    const count = resize.hydrate(editor, {
        sourceMarkdown: source,
        onConfirm: applyPreviewPopupImageResizeResult,
        imageSelector: '#viewer img'
    });
    Array.prototype.slice.call(editor.querySelectorAll('img.md-view-resizable-image')).forEach(function (image) {
        if (!image.getAttribute('title')) image.setAttribute('title', '클릭하여 이미지 크기 조절');
    });
    if (editor.querySelectorAll('img').length > 0 && count === 0) return false;
    return count;
}

function schedulePreviewPopupImageResize(attempt) {
    const retry = Math.max(0, Number(attempt) || 0);
    if (previewPopupImageResizeRetryTimer) {
        clearTimeout(previewPopupImageResizeRetryTimer);
        previewPopupImageResizeRetryTimer = null;
    }
    const count = syncPreviewPopupImageResize();
    if (count !== false || retry >= 5 || !isPreviewPopupAlive() || !previewPopupEditMode) return count;
    previewPopupImageResizeRetryTimer = setTimeout(function () {
        previewPopupImageResizeRetryTimer = null;
        schedulePreviewPopupImageResize(retry + 1);
    }, retry < 2 ? 80 : 180);
    return false;
}

function onPreviewPopupClosed() {
    previewPopupDisposeEditPageGuides();
    if (previewPopupImageResizeRetryTimer) clearTimeout(previewPopupImageResizeRetryTimer);
    previewPopupImageResizeRetryTimer = null;
    cancelPreviewPopupImageResize();
    previewPopupWindow = null;
    previewPopupFileMode = false;
    previewPopupEditMode = false;
    previewPopupDraftMarkdown = '';
    previewPopupDraftBaseMarkdown = '';
    previewPopupDraftDirty = false;
    previewPopupRenderedSelectionRange = null;
    previewPopupRenderedDomChanged = false;
    previewPopupTablePickerOpen = false;
    previewPopupTablePickerBound = false;
    previewPopupTablePickerCloseHandler = null;
    previewPopupMarginDialogOpen = false;
    previewPopupMarginDialogBound = false;
    previewPopupMarginDialogCloseHandler = null;
    revokePreviewPopupFileObjectUrl();
    resetPreviewPopupMermaidLoader();
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function closePreviewPopupWindow() {
    previewPopupDisposeEditPageGuides();
    if (!isPreviewPopupAlive()) {
        previewPopupWindow = null;
        previewPopupFileMode = false;
        previewPopupEditMode = false;
        previewPopupDraftMarkdown = '';
        previewPopupDraftBaseMarkdown = '';
        previewPopupDraftDirty = false;
        previewPopupRenderedSelectionRange = null;
        previewPopupRenderedDomChanged = false;
        previewPopupTablePickerOpen = false;
        previewPopupTablePickerBound = false;
        previewPopupTablePickerCloseHandler = null;
        previewPopupMarginDialogOpen = false;
        previewPopupMarginDialogBound = false;
        previewPopupMarginDialogCloseHandler = null;
        revokePreviewPopupFileObjectUrl();
        resetPreviewPopupMermaidLoader();
        cancelPreviewPopupImageResize();
        revokeObjectUrls(previewInternalImageObjectUrls);
        return;
    }
    cancelPreviewPopupImageResize();
    previewPopupWindow.close();
    previewPopupWindow = null;
    previewPopupFileMode = false;
    previewPopupEditMode = false;
    previewPopupDraftMarkdown = '';
    previewPopupDraftBaseMarkdown = '';
    previewPopupDraftDirty = false;
    previewPopupTablePickerOpen = false;
    previewPopupTablePickerBound = false;
    previewPopupTablePickerCloseHandler = null;
    previewPopupRenderedSelectionRange = null;
    previewPopupRenderedDomChanged = false;
    previewPopupMarginDialogOpen = false;
    previewPopupMarginDialogBound = false;
    previewPopupMarginDialogCloseHandler = null;
    revokePreviewPopupFileObjectUrl();
    resetPreviewPopupMermaidLoader();
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function previewPopupDisposeEditPageGuides() {
    if (previewPopupEditPageGuideTimer) clearTimeout(previewPopupEditPageGuideTimer);
    previewPopupEditPageGuideTimer = null;
    if (previewPopupEditPageGuideObserver) {
        try { previewPopupEditPageGuideObserver.disconnect(); } catch (_) {}
        previewPopupEditPageGuideObserver = null;
    }
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

function openMergedPdfInPreviewPopup(blob, fileName) {
    if (!blob || typeof blob.arrayBuffer !== 'function') {
        showToast('PV로 보낼 병합 PDF 데이터가 없습니다.');
        return false;
    }
    if (!ensurePreviewPopupForFile()) return false;
    revokePreviewPopupFileObjectUrl();
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    const name = String(fileName || 'merged.pdf').toLowerCase().endsWith('.pdf')
        ? String(fileName || 'merged.pdf')
        : String(fileName || 'merged') + '.pdf';
    previewPopupFileObjectUrl = URL.createObjectURL(pdfBlob);
    const opened = openFileViewerInPreviewPopup(previewPopupFileObjectUrl, name);
    if (!opened) {
        revokePreviewPopupFileObjectUrl();
        return false;
    }
    showToast('병합 PDF를 PV에서 열었습니다.');
    return true;
}

function openRemotePdfInPreviewPopup(pdfUrl, fileName) {
    let url;
    try {
        url = new URL(String(pdfUrl || ''), window.location.href);
    } catch (_) {
        showToast('PDF 주소가 올바르지 않습니다.');
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'blob:') {
        showToast('지원하지 않는 PDF 주소입니다.');
        return false;
    }
    if (!ensurePreviewPopupForFile()) return false;
    const name = String(fileName || decodeURIComponent(url.pathname.split('/').pop() || '') || 'search-result.pdf');
    const opened = openFileViewerInPreviewPopup(url.href, /\.pdf$/i.test(name) ? name : name + '.pdf');
    if (opened) showToast('검색 결과 PDF를 PV에서 열었습니다.');
    return opened;
}

window.openRemotePdfInPreviewPopup = openRemotePdfInPreviewPopup;

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
    previewPopupEditMode = false;
    previewPopupScale = 1;
    previewPopupWidthScale = 1.5;
    previewPopupClearPagedContent();
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
    syncPreviewPopupEditorUi();
    try { previewPopupWindow.focus(); } catch (_) {}
    return true;
}

function openFileViewerInPreviewPopup(viewerUrl, fileName, onReady) {
    if (!isPreviewPopupAlive()) return false;
    const doc = previewPopupWindow.document;
    const viewport = doc.getElementById('pv-viewport');
    if (!viewport) return false;
    previewPopupClearPagedContent();

    previewPopupFileMode = true;
    previewPopupEditMode = false;
    doc.title = 'MDproViewer Preview - ' + String(fileName || 'Document');
    viewport.innerHTML = '';
    const frame = doc.createElement('iframe');
    if (typeof onReady === 'function') {
        frame.addEventListener('load', function () { onReady(frame); }, { once: true });
    }
    frame.src = String(viewerUrl || '');
    frame.title = String(fileName || 'Document');
    frame.style.display = 'block';
    frame.style.width = '100%';
    frame.style.height = 'calc(100vh - 42px)';
    frame.style.border = '0';
    frame.setAttribute('allow', 'fullscreen');
    viewport.appendChild(frame);
    syncPreviewPopupEditorUi();
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
    const imageResizeHead = '<script src="' + escapePreviewAttribute(new URL('./js/viewmode/image-resize.js?v=20260815-pv-restore-1', window.location.href).href) + '"></script>';
    const pvImageInsertScript = escapePreviewAttribute(new URL('./js/UI_PV/pv-image-insert.js?v=20260815-child-3-resize', window.location.href).href);
    const baseHref = escapePreviewAttribute(document.baseURI || window.location.href);
    return '<!doctype html><html lang="ko" class="pv-print-preview"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><base href="' + baseHref + '"><title>MDproViewer Print Preview</title>'
        + getPreviewPopupStylesheetLinks()
        + mathHead
        + imageResizeHead
        + '<style>'
        + 'html,body{margin:0;padding:0;height:100%;font-family:Inter,"Noto Sans KR","Malgun Gothic",system-ui,-apple-system,"Segoe UI",sans-serif;background:#e2e8f0;color:#1e293b;color-scheme:light;}'
        + 'html.dark,html.dark body{background:#0b1220;color:#e2e8f0;color-scheme:dark;}'
        + '#pv-root{height:100%;}'
        + '#pv-toolbar{display:flex;align-items:center;gap:5px;padding:6px 8px;background:#0f172a;border-bottom:1px solid #334155;color:#e2e8f0;position:fixed;top:0;left:0;right:0;z-index:9999;box-sizing:border-box;overflow-x:auto;white-space:nowrap;min-height:42px;}'
        + '#pv-toolbar button{height:28px;padding:2px 8px;border:1px solid #94a3b8;background:#fff;border-radius:5px;font-size:12px;font-weight:750;color:#1e293b;cursor:pointer;line-height:1;}'
        + '#pv-toolbar button:hover{background:#e2e8f0;}#pv-toolbar button:disabled{opacity:.45;cursor:not-allowed;}'
        + '#pv-toolbar .pv-file-button{height:24px;padding:1px 6px;font-size:10px;border-color:#64748b;background:#f8fafc;}'
        + '#pv-toolbar .pv-format-button{min-width:29px;padding:2px 6px;}#pv-toolbar .pv-primary-button{border-color:#818cf8;background:#eef2ff;color:#3730a3;}#pv-toolbar .pv-send-button{border-color:#34d399;background:#ecfdf5;color:#047857;}#pv-toolbar .pv-export-button{border-color:#fbbf24;background:#fffbeb;color:#92400e;}'
        + '#pv-toolbar .pv-table-action{min-width:48px;}#pv-toolbar .pv-theme-button{margin-left:auto;min-width:48px;background:#e0f2fe;border-color:#38bdf8;color:#075985;}html.dark #pv-toolbar .pv-theme-button{background:#1e293b;border-color:#64748b;color:#f8fafc;}'
        + '#pv-toolbar .pv-divider{width:1px;height:20px;background:#475569;margin:0 2px;flex:0 0 auto;}#pv-draft-status{font-size:10px;font-weight:700;color:#a7f3d0;margin-left:2px;}#pv-draft-status.is-dirty{color:#fde68a;}'
        + '#pv-viewport{height:100%;overflow:auto;padding:58px 24px 48px;box-sizing:border-box;background:#e2e8f0;}html.dark #pv-viewport{background:#0b1220;}'
        + '#viewer{position:relative;margin:0 auto;}body.pv-editor-mode #viewer{width:max-content;min-width:210mm;min-height:297mm;}'
        + '#pv-content{box-sizing:border-box;line-height:1.6;overflow-wrap:break-word;transform-origin:top center;width:auto;max-width:none;padding:0;color:#1e293b;}'
        + 'body.pv-editor-mode #pv-content{min-height:297mm;padding:14mm 12mm;background:#fff;color:#1e293b;box-shadow:0 18px 48px rgba(15,23,42,.28);}html.dark body.pv-editor-mode #pv-content{background:#111827;color:#e2e8f0;box-shadow:0 18px 48px rgba(0,0,0,.52);}'
        + '#pv-edit-page-guides{display:none;position:absolute;z-index:60;pointer-events:none;overflow:visible;box-sizing:border-box;}body.pv-editor-mode #pv-edit-page-guides{display:block;}.pv-edit-page-guide{position:absolute;left:0;right:0;height:0;border-top:2px dashed #ef4444;box-sizing:border-box;}.pv-edit-page-guide-label{position:absolute;right:8px;bottom:6px;padding:2px 7px;border:1px solid #ef4444;border-radius:999px;background:rgba(255,255,255,.94);color:#b91c1c;font:800 10px/1.35 Inter,"Noto Sans KR","Malgun Gothic",sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(127,29,29,.16);}html.dark .pv-edit-page-guide-label{background:rgba(15,23,42,.94);color:#fca5a5;border-color:#f87171;}'
        + '#pv-content[contenteditable=\"true\"]{cursor:text;outline:3px solid #818cf8;outline-offset:4px;caret-color:#1d4ed8;}#pv-content[contenteditable=\"true\"]:focus{outline-color:#4f46e5;box-shadow:0 18px 48px rgba(15,23,42,.38),0 0 0 6px rgba(99,102,241,.16);}#pv-content[contenteditable=\"true\"] .pv-render-locked{cursor:not-allowed;user-select:none;}body.pv-editor-mode #pv-pages{display:none;}body.pv-editor-mode #pv-content{display:block;}body:not(.pv-editor-mode):not(.pv-file-mode) #pv-content{display:none;}body:not(.pv-editor-mode):not(.pv-file-mode) #pv-pages{display:flex;}body.pv-file-mode #pv-pages{display:none;}body.pv-file-mode #pv-content{display:block;}'
        + 'body.pv-file-mode #pv-view-controls{display:none;}body.pv-file-mode .pv-edit-action{display:none;}'
        + '#pv-toolbar .pv-margin-controls{display:flex;align-items:center;gap:4px;margin-left:6px;font-size:9px;color:#cbd5e1;white-space:nowrap;}'
        + '#pv-toolbar .pv-margin-button{height:20px;padding:0 5px;font-size:8px;font-weight:800;min-width:22px;max-width:22px;color:#1e293b;background:#f8fafc;border-radius:4px;}'
        + '#pv-toolbar .pv-margin-button:hover{background:#e2e8f0;}'
        + '#pv-margin-popover{position:fixed;top:46px;right:8px;min-width:196px;padding:8px 9px;background:#0f172a;border:1px solid #64748b;border-radius:8px;box-shadow:0 18px 36px rgba(15,23,42,.45);color:#e2e8f0;z-index:10001;display:none;box-sizing:border-box;}'
        + '#pv-margin-popover h4{margin:0 0 5px;font-size:11px;font-weight:800;line-height:1.2;color:#cbd5e1;}'
        + '#pv-margin-popover .pv-margin-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;}'
        + '#pv-margin-popover .pv-margin-control{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10px;font-weight:700;color:#94a3b8;}'
        + '#pv-margin-popover .pv-margin-control input{width:52px;height:22px;padding:0 3px;border:1px solid #64748b;border-radius:5px;background:#f8fafc;color:#1e293b;font-size:10px;font-weight:800;box-sizing:border-box;}'
        + '#pv-margin-popover .pv-margin-actions{display:flex;justify-content:flex-end;gap:5px;}'
        + '#pv-margin-popover .pv-margin-actions button{height:22px;padding:0 8px;font-size:10px;font-weight:800;min-width:48px;}'
        + '#pv-pages{display:none;flex-direction:column;align-items:center;gap:14px;padding:12px 12px 28px;box-sizing:border-box;min-height:100%;background:linear-gradient(180deg,#cbd5e1 0,#e2e8f0 70px,#e2e8f0);}html.dark #pv-pages{background:linear-gradient(180deg,#020617 0,#0b1220 70px,#0b1220);}'
        + '.pv-page{position:relative;width:' + PREVIEW_PV_A4_WIDTH_MM + 'mm;height:' + PREVIEW_PV_A4_HEIGHT_MM + 'mm;max-width:none;flex:0 0 auto;overflow:hidden;background:#fff;color:#1e293b;box-shadow:0 18px 40px rgba(15,23,42,.32);box-sizing:border-box;transform-origin:top center;transform:scale(var(--pv-page-scale, 1));border:1px solid #94a3b8;border-radius:2px;margin:0 0 4px 0;}'
        + '.pv-page[data-pv-page-state]{border-radius:2px;}'
        + '.pv-page-content{box-sizing:border-box;width:100%;height:100%;margin:0!important;padding:0!important;overflow:hidden;background:#fff!important;color:#1e293b!important;--md-header-scale:1;}'
        + '.pv-page-content h1,.pv-page-content h2,.pv-page-content h3,.pv-page-content h4{color:#0f172a!important;}'
        + '.pv-page-content h1,#pv-content h1{font-size:calc(var(--md-app-font-size,21px) * 2.8 * var(--pv-header-scale,1))!important;line-height:1.24!important;font-weight:800!important;margin-top:1.5rem!important;margin-bottom:1rem!important;border-bottom:1px solid #bfdbfe!important;padding-bottom:.5rem!important;background:linear-gradient(90deg,rgba(219,234,254,.75),rgba(255,255,255,0))!important;}'
        + '.pv-page-content h2,#pv-content h2{font-size:calc(var(--md-app-font-size,21px) * 2.1 * var(--pv-header-scale,1))!important;line-height:1.28!important;font-weight:700!important;margin-top:1.25rem!important;margin-bottom:.75rem!important;border-bottom:1px solid #dbeafe!important;padding-bottom:.3rem!important;background:linear-gradient(90deg,rgba(219,234,254,.6),rgba(255,255,255,0))!important;}'
        + '.pv-page-content h3,#pv-content h3{font-size:calc(var(--md-app-font-size,21px) * 1.8 * var(--pv-header-scale,1))!important;line-height:1.35!important;font-weight:650!important;margin-top:1rem!important;margin-bottom:.5rem!important;}'
        + '.pv-page-content h4,#pv-content h4{font-size:calc(var(--md-app-font-size,21px) * 1.45 * var(--pv-header-scale,1))!important;line-height:1.4!important;font-weight:650!important;}'
        + 'html.pv-header-background-removed .pv-page-content h1,html.pv-header-background-removed .pv-page-content h2,html.pv-header-background-removed .pv-page-content h3,html.pv-header-background-removed .pv-page-content h4,html.pv-header-background-removed #pv-content h1,html.pv-header-background-removed #pv-content h2,html.pv-header-background-removed #pv-content h3,html.pv-header-background-removed #pv-content h4{background:none!important;}'
        + '.pv-page-content pre{background:#f8fafc!important;color:#0f172a!important;direction:ltr!important;unicode-bidi:plaintext!important;white-space:pre!important;'
        + 'text-align:left!important;padding:8px 10px!important;border:1px solid #cbd5e1!important;border-radius:6px!important;overflow-x:auto!important;overflow-y:auto!important;}'
        + '.pv-page-content pre code{font-family:Consolas,Monaco,Menlo,"SFMono-Regular","Source Code Pro","Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",monospace!important;'
        + 'direction:ltr!important;unicode-bidi:plaintext!important;white-space:pre!important;display:block!important;}'
        + 'html.dark .pv-page{background:#111827;color:#e2e8f0;border-color:#475569;box-shadow:0 18px 40px rgba(0,0,0,.55);}html.dark .pv-page-content{background:#111827!important;color:#e2e8f0!important;}html.dark .pv-page-content h1,html.dark .pv-page-content h2,html.dark .pv-page-content h3,html.dark .pv-page-content h4{color:#e0f2fe!important;}html.dark .pv-page-content h1{border-bottom-color:#2563eb!important;background:linear-gradient(90deg,rgba(30,64,175,.28),rgba(17,24,39,0))!important;}html.dark .pv-page-content h2{border-bottom-color:#3b82f6!important;background:linear-gradient(90deg,rgba(59,130,246,.18),rgba(17,24,39,0))!important;}html.dark .pv-page-content pre{background:#1e293b!important;color:#f8fafc!important;border-color:#475569!important;}'
        + '.pv-forced-fit{max-height:100%!important;overflow:hidden!important}.pv-forced-fit>img,.pv-forced-fit>svg,.pv-forced-fit>canvas{max-height:100%!important;object-fit:contain!important}'
        + '.pv-page-content pre{max-height:none!important;height:auto!important;overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:normal!important;break-inside:auto!important;page-break-inside:auto!important;}'
        + '.pv-page-content pre code{display:block!important;max-height:none!important;overflow:visible!important;white-space:inherit!important;overflow-wrap:inherit!important;word-break:inherit!important;}'
        + '.pv-page-number{position:absolute;left:8mm;bottom:6mm;font-size:10px;line-height:1.15;color:#334155;font-weight:700;pointer-events:none;background:#ffffffcc;padding:1px 6px;border-radius:999px;box-shadow:0 0 0 1px #cbd5e1 inset;transform:translateZ(0);}'
        + '.pv-cover-page{padding:0!important;}'
        + '.pv-cover-page .pv-page-content{width:210mm!important;height:297mm!important;overflow:hidden!important;}'
        + '.pv-cover-page .note-cover-page{width:210mm!important;height:297mm!important;max-width:none!important;min-width:210mm!important;min-height:297mm!important;aspect-ratio:210/297!important;margin:0!important;box-shadow:none!important;overflow:hidden!important;}'
        + '.pv-cover-page .pv-page-number{display:none!important;}'
        + '#pv-pages .pv-page-break{display:none!important;}'
        + '.page-break{display:none!important;}'
        + '@media print{#pv-toolbar,#pv-view-controls,#pv-table-picker,#pv-edit-page-guides{display:none!important;}@page{size:A4 portrait;margin:0;}html,html.dark,body,html.dark body{background:#fff!important;color:#1e293b!important;color-scheme:light;}#pv-viewport,#pv-pages{padding:0!important;display:block!important;background:#fff!important;}#pv-pages{gap:0!important;align-items:stretch;transform:none!important;}.pv-page,html.dark .pv-page{background:#fff!important;color:#1e293b!important;box-shadow:none!important;width:210mm;height:297mm;page-break-after:always;page-break-inside:avoid;overflow:hidden;margin:0 auto!important;transform:none!important;}.pv-page-content,html.dark .pv-page-content{background:#fff!important;color:#1e293b!important;}.pv-page:last-child{page-break-after:auto;}.pv-page-number{font-size:10px;color:#666;}}'
        + '#pv-table-picker{position:fixed;top:46px;left:8px;width:216px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;box-shadow:0 16px 32px rgba(15,23,42,.32);z-index:10000;display:none;box-sizing:border-box;}html.dark #pv-table-picker{border-color:#475569;background:#0f172a;color:#e2e8f0;}'
        + '#pv-table-picker .pv-table-picker-label{font-size:11px;font-weight:700;line-height:1.2;margin-bottom:8px;color:#334155;white-space:nowrap;}html.dark #pv-table-picker .pv-table-picker-label{color:#e2e8f0;}'
        + '#pv-table-picker .pv-table-picker-grid{display:grid;grid-template-columns:repeat(' + PREVIEW_PV_TABLE_PICKER_COLS + ',16px);gap:4px;}'
        + '#pv-table-picker .pv-table-picker-cell{width:16px;height:16px;border:1px solid #cbd5e1;border-radius:2px;background:#f1f5f9;cursor:pointer;display:block;padding:0;box-sizing:border-box;}html.dark #pv-table-picker .pv-table-picker-cell{border-color:#475569;background:#1e293b;}'
        + '#pv-table-picker .pv-table-picker-cell:hover,#pv-table-picker .pv-table-picker-cell.pv-table-picker-cell-active,html.dark #pv-table-picker .pv-table-picker-cell.pv-table-picker-cell-active{background:#fcd34d;border-color:#f59e0b;box-shadow:none;}'
        + '#pv-view-controls{position:fixed;right:10px;bottom:10px;z-index:9999;display:flex;align-items:center;gap:4px;padding:4px 5px;border:1px solid #64748b;border-radius:7px;background:rgba(15,23,42,.94);box-shadow:0 6px 18px rgba(15,23,42,.28);color:#e2e8f0;}'
        + '#pv-view-controls .pv-control-group{display:flex;align-items:center;gap:2px;}#pv-view-controls .pv-control-name{font-size:9px;font-weight:800;color:#94a3b8;margin-right:1px;}#pv-view-controls button{width:22px;height:22px;padding:0;border:1px solid #64748b;border-radius:4px;background:#f8fafc;color:#1e293b;font-size:13px;font-weight:800;line-height:1;cursor:pointer;}#pv-view-controls .label{min-width:34px;font-size:9px;text-align:center;font-weight:800;color:#e2e8f0;}#pv-view-controls .pv-control-divider{width:1px;height:18px;background:#475569;margin:0 2px;}#pv-view-controls .pv-header-background-toggle{display:flex;align-items:center;gap:3px;font-size:9px;font-weight:750;color:#e2e8f0;cursor:pointer;white-space:nowrap;}#pv-view-controls .pv-header-background-toggle input{width:13px;height:13px;margin:0;accent-color:#f59e0b;cursor:pointer;}'
        + '#pv-view-controls{right:auto;bottom:auto;left:10px;top:52px;flex-direction:column;align-items:stretch;touch-action:none;user-select:none;}#pv-view-controls.pv-controls-horizontal{flex-direction:row;align-items:center;}#pv-view-controls .pv-controls-actions{display:flex;align-items:center;gap:3px;}#pv-view-controls .pv-drag-handle{cursor:move;background:#334155;color:#f8fafc;}#pv-view-controls .pv-orientation-toggle{background:#e0e7ff;color:#3730a3;border-color:#818cf8;}#pv-view-controls:not(.pv-controls-horizontal) .pv-control-group{justify-content:space-between;}#pv-view-controls:not(.pv-controls-horizontal) .pv-control-name{width:38px;}#pv-view-controls:not(.pv-controls-horizontal) .pv-control-divider{width:100%;height:1px;margin:1px 0;}'
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
        + '#pv-image-insert-modal[hidden]{display:none!important;}#pv-image-insert-modal{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.28);box-sizing:border-box;}#pv-image-panel{width:min(660px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:auto;padding:20px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#334155;box-shadow:0 24px 60px rgba(15,23,42,.38);box-sizing:border-box;}html.dark #pv-image-panel{border-color:#475569;background:#1e293b;color:#e2e8f0;}#pv-image-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}#pv-image-head h3{margin:0;font-size:16px;}#pv-image-head button,#pv-image-actions button,#pv-image-output button{height:32px;padding:0 12px;border:1px solid #94a3b8;border-radius:5px;background:#fff;color:#334155;font-weight:750;cursor:pointer;}#pv-image-zones{display:grid;grid-template-columns:1fr 1fr;margin-bottom:14px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;}#pv-image-zones button{min-height:112px;padding:14px;border:0;border-right:1px dashed #cbd5e1;background:#f8fafc;color:#4f46e5;font-size:14px;font-weight:800;cursor:pointer;}#pv-image-zones button:last-child{border-right:0;color:#475569;}#pv-image-zones button.is-dragging{background:#e0e7ff;}html.dark #pv-image-zones,html.dark #pv-image-zones button{border-color:#475569;}html.dark #pv-image-zones button{background:#172033;color:#a5b4fc;}html.dark #pv-image-zones button:last-child{color:#cbd5e1;}#pv-image-zones small{display:block;margin-top:7px;color:#64748b;font-size:10px;font-weight:600;}#pv-image-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}#pv-image-actions .imgbb{background:#0f766e;color:#fff;border-color:#115e59;}#pv-image-actions .internal{background:#0369a1;color:#fff;border-color:#075985;}#pv-image-url-wrap{padding:12px;border-radius:6px;background:#e2e8f0;}html.dark #pv-image-url-wrap{background:#334155;}#pv-image-url-wrap label{display:block;margin-bottom:7px;font-size:12px;font-weight:800;color:#64748b;}html.dark #pv-image-url-wrap label{color:#cbd5e1;}#pv-image-url{width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:#0f172a;box-sizing:border-box;}#pv-image-output{display:flex;gap:28px;margin-top:8px;}#pv-image-output button{height:26px;padding:0;border:0;background:transparent;color:#334155;font-size:12px;}html.dark #pv-image-output button{color:#e2e8f0;}#pv-image-status{min-height:17px;margin-top:10px;color:#64748b;font-size:11px;}#pv-image-status.is-error{color:#dc2626;}#pv-image-preview{display:block;max-width:100%;max-height:170px;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;object-fit:contain;}@media(max-width:560px){#pv-image-zones{grid-template-columns:1fr;}#pv-image-zones button{border-right:0;border-bottom:1px dashed #cbd5e1;}#pv-image-zones button:last-child{border-bottom:0;}}'
        + '</style></head><body><div id=\"pv-root\"><div id=\"pv-toolbar\">'
        + '<strong style=\"margin-right:3px;font-size:12px\">PV</strong>'
        + '<button class=\"pv-file-button\" type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'image\')\">이미지 열기</button>'
        + '<button class=\"pv-file-button\" type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pdf\')\">PDF 열기</button>'
        + '<button class=\"pv-file-button\" type=\"button\" onclick=\"window.opener&&window.opener.choosePreviewPopupFile(\'pptx\')\">PPTX 열기</button>'
        + '<span class=\"pv-divider pv-edit-action\"></span>'
        + '<button id=\"pv-mode-toggle\" class=\"pv-primary-button pv-edit-action\" type=\"button\" onclick=\"window.opener&&window.opener.previewPopupToggleEditor()\">렌더 편집</button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"굵게\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'bold\')\"><b>B</b></button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"기울임\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'italic\')\"><i>I</i></button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"글머리 기호\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'bullet\')\">•</button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"번호 목록\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'ordered\')\">1.</button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"제목 1\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'h1\')\">H1</button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"제목 2\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'h2\')\">H2</button>'
        + '<button class=\"pv-format-button pv-edit-action\" type=\"button\" title=\"제목 3\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupFormat(\'h3\')\">H3</button>'
        + '<button id=\"pv-table-picker-button\" class=\"pv-edit-action\" type=\"button\" title=\"표 삽입\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupOpenTablePicker()\">표</button>'
        + '<button class=\"pv-table-action pv-edit-action\" type=\"button\" title=\"표 행 추가\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupAddTableRow()\">행추가</button>'
        + '<button class=\"pv-table-action pv-edit-action\" type=\"button\" title=\"표 열 추가\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupAddTableColumn()\">열추가</button>'
        + '<button class=\"pv-edit-action\" type=\"button\" title=\"PV 이미지 삽입 도구 열기\" onmousedown=\"event.preventDefault()\" onclick=\"pvOpenImageInsert()\">[img]</button>'
        + '<span class=\"pv-margin-controls\"><button id=\"pv-margin-button\" type=\"button\" class=\"pv-margin-button pv-edit-action\" title=\"페이지 여백 설정\" onmousedown=\"event.preventDefault()\" onclick=\"window.opener&&window.opener.previewPopupOpenMarginDialog()\">여백</button></span>'
        + '<button class=\"pv-send-button pv-edit-action\" type=\"button\" onclick=\"window.opener&&window.opener.applyPreviewPopupEditsToOriginal()\">원본 노트에 반영</button>'
        + '<button class=\"pv-export-button pv-edit-action\" type=\"button\" onclick=\"window.opener&&window.opener.previewPopupExport()\">내보내기</button>'
        + '<span id=\"pv-draft-status\" class=\"pv-edit-action\">원본과 동기화</span>'
        + '<button id=\"pv-theme-toggle\" class=\"pv-theme-button\" type=\"button\" aria-pressed=\"false\" onclick=\"window.opener&&window.opener.previewPopupToggleTheme()\">다크</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupPrint()\">인쇄</button>'
        + '<button type=\"button\" onclick=\"window.close()\">닫기</button>'
        + '</div>'
        + '<div id=\"pv-table-picker\" class=\"pv-table-picker\" role=\"dialog\" aria-hidden=\"true\" aria-label=\"표 크기 선택\">'
        + '<div id=\"pv-table-picker-size-label\" class=\"pv-table-picker-label\">표 크기 선택</div>'
        + '<div id=\"pv-table-picker-grid\" class=\"pv-table-picker-grid\"></div>'
        + '</div>'
        + '<div id=\"pv-margin-popover\" role=\"dialog\" aria-hidden=\"true\" aria-label=\"페이지 여백 설정\">'
        + '<h4>페이지 여백 설정</h4>'
        + '<div class=\"pv-margin-row\">'
        + '<label class=\"pv-margin-control\" title=\"상단 여백(mm)\">상 <input id=\"pv-margin-top\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" value=\"14\" data-pv-margin-axis=\"top\" oninput=\"window.opener&&window.opener.previewPopupSetMargin(this)\" onblur=\"window.opener&&window.opener.previewPopupSetMargin(this)\"/></label>'
        + '<label class=\"pv-margin-control\" title=\"우측 여백(mm)\">우 <input id=\"pv-margin-right\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" value=\"12\" data-pv-margin-axis=\"right\" oninput=\"window.opener&&window.opener.previewPopupSetMargin(this)\" onblur=\"window.opener&&window.opener.previewPopupSetMargin(this)\"/></label>'
        + '<label class=\"pv-margin-control\" title=\"하단 여백(mm)\">하 <input id=\"pv-margin-bottom\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" value=\"14\" data-pv-margin-axis=\"bottom\" oninput=\"window.opener&&window.opener.previewPopupSetMargin(this)\" onblur=\"window.opener&&window.opener.previewPopupSetMargin(this)\"/></label>'
        + '<label class=\"pv-margin-control\" title=\"좌측 여백(mm)\">좌 <input id=\"pv-margin-left\" type=\"number\" min=\"0\" max=\"60\" step=\"1\" value=\"12\" data-pv-margin-axis=\"left\" oninput=\"window.opener&&window.opener.previewPopupSetMargin(this)\" onblur=\"window.opener&&window.opener.previewPopupSetMargin(this)\"/></label>'
        + '</div>'
        + '<div class=\"pv-margin-actions\"><button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupCloseMarginDialog()\">닫기</button></div>'
        + '</div>'
        + '<div id=\"pv-viewport\"><div id=\"viewer\"><div id=\"pv-content\" class=\"markdown-body print-area\" spellcheck=\"true\" oninput=\"window.opener&&window.opener.previewPopupHandleEditorInput(true)\" onkeydown=\"window.opener&&window.opener.previewPopupHandleEditorKeydown(event)\" onkeyup=\"window.opener&&window.opener.rememberPreviewPopupRenderedSelection()\" onmouseup=\"window.opener&&window.opener.rememberPreviewPopupRenderedSelection()\" onclick=\"window.opener&&window.opener.previewPopupHandleRenderedClick(event)\"></div><div id=\"pv-edit-page-guides\" aria-hidden=\"true\"></div></div><div id=\"pv-pages\"></div></div>'
        + '<div id=\"pv-view-controls\"><div class=\"pv-control-group\"><span class=\"pv-control-name\">Zoom</span><button type=\"button\" title=\"축소\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(-0.1)\">−</button><span id=\"pv-scale-label\" class=\"label\">100%</span><button type=\"button\" title=\"확대\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(0.1)\">+</button></div><span class=\"pv-control-divider\"></span><div class=\"pv-control-group\"><span class=\"pv-control-name\">Width</span><button type=\"button\" title=\"너비 축소\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(-0.1)\">−</button><span id=\"pv-width-label\" class=\"label\">100%</span><button type=\"button\" title=\"너비 확대\" onclick=\"window.opener&&window.opener.previewPopupAdjustWidth(0.1)\">+</button></div><span class=\"pv-control-divider\"></span><div class=\"pv-control-group\"><span class=\"pv-control-name\">Font</span><button type=\"button\" title=\"글자 축소\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(-1)\">−</button><span id=\"pv-font-label\" class=\"label\">16px</span><button type=\"button\" title=\"글자 확대\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(1)\">+</button></div><span class=\"pv-control-divider\"></span><div class=\"pv-control-group\"><span class=\"pv-control-name\">Header</span><button type=\"button\" title=\"헤더 축소\" onclick=\"window.opener&&window.opener.previewPopupAdjustHeaderScale(-0.1)\">−</button><span id=\"pv-header-label\" class=\"label\">100%</span><button type=\"button\" title=\"헤더 확대\" onclick=\"window.opener&&window.opener.previewPopupAdjustHeaderScale(0.1)\">+</button></div><span class=\"pv-control-divider\"></span><label class=\"pv-header-background-toggle\" title=\"체크하면 헤더의 색상 배경을 제거합니다\"><input id=\"pv-header-background-remove\" type=\"checkbox\" onchange=\"window.opener&&window.opener.previewPopupSetHeaderBackgroundRemoved(this.checked)\">배경 제거</label></div></div>'
        + '<div id=\"pv-image-insert-modal\" role=\"dialog\" aria-modal=\"true\" aria-hidden=\"true\" aria-label=\"PV 이미지 삽입\" hidden><div id=\"pv-image-panel\"><div id=\"pv-image-head\"><h3>PV 이미지 삽입</h3><button type=\"button\" onclick=\"pvCloseImageInsert()\">닫기</button></div><input id=\"pv-image-file\" type=\"file\" accept=\"image/*\" hidden><div id=\"pv-image-zones\"><button id=\"pv-image-upload-zone\" type=\"button\">이미지 업로드<small>JPG, PNG, GIF, WebP · 드래그 앤 드롭</small></button><button id=\"pv-image-paste-zone\" type=\"button\">이 공간 클릭 후 Ctrl+V<small>클립보드 이미지를 PV 창으로 붙여넣기</small></button></div><div id=\"pv-image-actions\"><button class=\"imgbb\" type=\"button\" onclick=\"pvUploadImageToImgbb()\">[imgBB] Upload</button><button class=\"internal\" type=\"button\" onclick=\"pvSaveImageInternal()\">문서내부저장</button></div><div id=\"pv-image-url-wrap\"><label for=\"pv-image-url\">Image URL → PV에 삽입 (Markdown / HTML)</label><input id=\"pv-image-url\" type=\"url\" placeholder=\"https://i.ibb.co/... 또는 internal://...\"><div id=\"pv-image-output\"><button type=\"button\" onclick=\"pvInsertImage(\'markdown\')\">Markdown</button><button type=\"button\" onclick=\"pvInsertImage(\'html\')\">HTML</button></div></div><div id=\"pv-image-status\" aria-live=\"polite\"></div><img id=\"pv-image-preview\" alt=\"PV image preview\" hidden></div></div>'
        + '<script src=\"' + pvImageInsertScript + '\"><\/script>'
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

function getPreviewPopupPageMargins() {
    const source = {};
    PREVIEW_PV_MARGIN_AXIS.forEach(function (axis) {
        source[axis] = PREVIEW_PV_DEFAULT_MARGINS[axis];
    });
    try {
        const raw = localStorage.getItem(PREVIEW_PV_MARGIN_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            PREVIEW_PV_MARGIN_AXIS.forEach(function (axis) {
                const value = Number(parsed[axis]);
                if (Number.isFinite(value)) {
                    source[axis] = Math.max(0, Math.min(60, Math.round(value)));
                }
            });
        }
    } catch (_) {}
    return source;
}

function previewPopupSetPageMargins(nextMargins) {
    const next = {};
    PREVIEW_PV_MARGIN_AXIS.forEach(function (axis) {
        const sourceValue = Number(nextMargins && nextMargins[axis]);
        const value = Number.isFinite(sourceValue) ? Math.max(0, Math.min(60, Math.round(sourceValue))) : PREVIEW_PV_DEFAULT_MARGINS[axis];
        next[axis] = value;
    });
    try { localStorage.setItem(PREVIEW_PV_MARGIN_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
}

function previewPopupRefreshMarginControls() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    if (!doc) return;
    const margins = getPreviewPopupPageMargins();
    PREVIEW_PV_MARGIN_AXIS.forEach(function (axis) {
        const input = doc.getElementById('pv-margin-' + axis);
        if (!input) return;
        input.value = String(margins[axis]);
    });
}

function previewPopupOpenMarginDialog() {
    if (!isPreviewPopupAlive()) return false;
    const doc = previewPopupWindow.document;
    const popover = doc.getElementById('pv-margin-popover');
    if (!popover) return false;
    previewPopupCloseTablePicker();
    previewPopupRefreshMarginControls();
    previewPopupPositionPopover(popover, doc.getElementById('pv-margin-button'), true);
    popover.style.display = 'block';
    popover.setAttribute('aria-hidden', 'false');
    previewPopupMarginDialogOpen = true;
    if (previewPopupMarginDialogBound) return true;
    const onDismiss = function (event) {
        if (!previewPopupMarginDialogOpen) return;
        const target = event && event.target ? event.target : null;
        if (target) {
            if (target.closest && target.closest('#pv-margin-popover')) return;
            if (target.closest && target.closest('.pv-margin-button')) return;
        }
        if (event.type === 'keydown' && event.key !== 'Escape') return;
        previewPopupCloseMarginDialog();
    };
    previewPopupWindow.addEventListener('mousedown', onDismiss);
    previewPopupWindow.addEventListener('keydown', onDismiss);
    previewPopupMarginDialogCloseHandler = onDismiss;
    previewPopupMarginDialogBound = true;
    return true;
}

function previewPopupCloseMarginDialog() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const popover = doc.getElementById('pv-margin-popover');
    if (popover) {
        popover.style.display = 'none';
        popover.setAttribute('aria-hidden', 'true');
    }
    previewPopupMarginDialogOpen = false;
    if (typeof previewPopupMarginDialogCloseHandler === 'function') {
        previewPopupWindow.removeEventListener('mousedown', previewPopupMarginDialogCloseHandler);
        previewPopupWindow.removeEventListener('keydown', previewPopupMarginDialogCloseHandler);
        previewPopupMarginDialogCloseHandler = null;
        previewPopupMarginDialogBound = false;
    }
}

function previewPopupSetMargin(input) {
    if (!isPreviewPopupAlive() || !input || !input.dataset) return false;
    const axis = String(input.dataset.pvMarginAxis || '').toLowerCase();
    if (PREVIEW_PV_MARGIN_AXIS.indexOf(axis) < 0) return false;
    const margins = previewPopupSetPageMargins(Object.assign({}, getPreviewPopupPageMargins(), {
        [axis]: Number(input.value)
    }));
    previewPopupRefreshMarginControls();
    previewPopupApplyPageMarginState(margins);
    applyPreviewPopupViewport();
    if (!previewPopupFileMode && !previewPopupEditMode) {
        updatePreviewPopupContent();
    }
    return true;
}

function previewPopupApplyPageMarginState(margins) {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const pages = doc.getElementById('pv-pages');
    if (!pages) return;
    Array.from(pages.querySelectorAll('.pv-page')).forEach(function (page) {
        page.style.paddingTop = String(margins.top) + 'mm';
        page.style.paddingRight = String(margins.right) + 'mm';
        page.style.paddingBottom = String(margins.bottom) + 'mm';
        page.style.paddingLeft = String(margins.left) + 'mm';
    });
}

function previewPopupClearPagedContent() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const pages = doc.getElementById('pv-pages');
    if (pages) pages.innerHTML = '';
}

function previewPopupFindWordBoundary(text, limit) {
    const source = String(text || '');
    const max = Math.max(1, Math.min(source.length - 1, Number(limit) || 1));
    const minimum = Math.max(1, Math.floor(max * 0.62));
    for (let index = max; index >= minimum; index -= 1) {
        if (/\s|[.,;:!?\u3002\u3001)]/.test(source.charAt(index - 1))) return index;
    }
    return max;
}

function previewPopupFits(content) {
    return content.scrollHeight <= content.clientHeight + 2;
}

function previewPopupMeasureCandidate(content, node) {
    content.appendChild(node);
    const fit = previewPopupFits(content);
    content.removeChild(node);
    return fit;
}

function previewPopupCloneTextSlice(element, start, end) {
    let cursor = 0;
    function visit(node) {
        if (node.nodeType === 3) {
            const text = String(node.nodeValue || '');
            const nodeStart = cursor;
            const nodeEnd = cursor + text.length;
            cursor = nodeEnd;
            const from = Math.max(start, nodeStart);
            const to = Math.min(end, nodeEnd);
            if (to > from) return node.ownerDocument.createTextNode(text.slice(from - nodeStart, to - nodeStart));
            return null;
        }
        if (node.nodeType !== 1) return null;
        const clone = node.cloneNode(false);
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
            const childClone = visit(child);
            if (childClone) clone.appendChild(childClone);
        });
        return clone.childNodes.length ? clone : null;
    }
    return visit(element);
}

function previewPopupSplitTextElement(element, content) {
    if (!element || element.querySelector('img,svg,canvas,video,iframe,table')) return null;
    const text = String(element.textContent || '');
    if (text.length < 2) return null;
    let low = 1;
    let high = text.length - 1;
    let best = 0;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const trial = previewPopupCloneTextSlice(element, 0, middle);
        if (trial && previewPopupMeasureCandidate(content, trial)) {
            best = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    if (!best || best >= text.length) return null;
    const boundary = previewPopupFindWordBoundary(text, best);
    const first = previewPopupCloneTextSlice(element, 0, boundary);
    const second = previewPopupCloneTextSlice(element, boundary, text.length);
    return first && second ? [first, second] : null;
}

function previewPopupSplitContainerChildren(element, content) {
    const tag = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|blockquote|ul|ol|dl)$/.test(tag)) return null;
    const children = Array.prototype.slice.call(element.children);
    if (children.length < 2) return null;
    const fragments = [];
    let current = element.cloneNode(false);
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index].cloneNode(true);
        current.appendChild(child);
        if (!previewPopupMeasureCandidate(content, current.cloneNode(true)) && current.children.length > 1) {
            current.removeChild(child);
            fragments.push(current);
            current = element.cloneNode(false);
            current.appendChild(child);
        }
    }
    if (current.children.length) fragments.push(current);
    return fragments.length > 1 ? fragments : null;
}

function previewPopupSplitTableRows(table, content) {
    if (String(table.tagName || '').toLowerCase() !== 'table') return null;
    const rows = Array.prototype.slice.call(table.querySelectorAll('tbody > tr'));
    if (rows.length < 2) return null;
    const fragments = [];
    const makeTable = function () {
        const clone = table.cloneNode(false);
        Array.prototype.slice.call(table.children).forEach(function (child) {
            const tag = String(child.tagName || '').toLowerCase();
            if (tag === 'tbody' || tag === 'tfoot') return;
            clone.appendChild(child.cloneNode(true));
        });
        clone.appendChild(table.ownerDocument.createElement('tbody'));
        return clone;
    };
    let current = makeTable();
    for (let index = 0; index < rows.length; index += 1) {
        const body = current.querySelector('tbody');
        const row = rows[index].cloneNode(true);
        body.appendChild(row);
        if (!previewPopupMeasureCandidate(content, current.cloneNode(true)) && body.children.length > 1) {
            body.removeChild(row);
            fragments.push(current);
            current = makeTable();
            current.querySelector('tbody').appendChild(row);
        }
    }
    if (current.querySelector('tbody').children.length) fragments.push(current);
    return fragments.length > 1 ? fragments : null;
}

function previewPopupSplitPreformatted(element, content) {
    if (String(element && element.tagName || '').toLowerCase() !== 'pre') return null;
    const text = String(element.textContent || '');
    if (text.length < 2 || text.indexOf('\n') < 0) return null;

    const lineEnds = [];
    for (let index = 0; index < text.length; index += 1) {
        if (text.charAt(index) === '\n') lineEnds.push(index + 1);
    }
    if (!lineEnds.length || lineEnds[lineEnds.length - 1] < text.length) lineEnds.push(text.length);

    let low = 0;
    let high = lineEnds.length - 1;
    let fittingLineIndex = -1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = previewPopupCloneTextSlice(element, 0, lineEnds[middle]);
        if (candidate && previewPopupMeasureCandidate(content, candidate)) {
            fittingLineIndex = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    if (fittingLineIndex < 0 || fittingLineIndex >= lineEnds.length - 1) return null;
    const splitAt = lineEnds[fittingLineIndex];
    const first = previewPopupCloneTextSlice(element, 0, splitAt);
    const rest = previewPopupCloneTextSlice(element, splitAt, text.length);
    return first && rest ? [first, rest] : null;
}

function previewPopupSplitOversized(element, content) {
    return previewPopupSplitPreformatted(element, content)
        || previewPopupSplitTableRows(element, content)
        || previewPopupSplitContainerChildren(element, content)
        || previewPopupSplitTextElement(element, content);
}

function previewPopupAddPage(pagesRoot, margins, options) {
    const pageOptions = options || {};
    const page = previewPopupWindow.document.createElement('section');
    page.className = 'pv-page' + (pageOptions.cover ? ' pv-cover-page' : '');
    if (!pageOptions.cover) {
        page.style.paddingTop = String(margins.top) + 'mm';
        page.style.paddingRight = String(margins.right) + 'mm';
        page.style.paddingBottom = String(margins.bottom) + 'mm';
        page.style.paddingLeft = String(margins.left) + 'mm';
    }
    const content = previewPopupWindow.document.createElement('div');
    content.className = 'pv-page-content markdown-body';
    page.appendChild(content);
    const number = previewPopupWindow.document.createElement('div');
    number.className = 'pv-page-number';
    page.appendChild(number);
    pagesRoot.appendChild(page);
    return { page, content, number };
}

function previewPopupPageIsEmpty(page) {
    if (!page) return true;
    return !page.content.children.length && !String(page.content.textContent || '').trim();
}

function previewPopupIsExplicitBreak(element) {
    return !!(element && element.nodeType === 1 && element.classList && element.classList.contains('page-break'));
}

function previewPopupIsCoverPage(element) {
    return !!(element && element.nodeType === 1 && element.classList && element.classList.contains('note-cover-page'));
}

function previewPopupRenderPaginatedPages(sourceRoot) {
    if (!isPreviewPopupAlive() || !sourceRoot) return;
    const doc = previewPopupWindow.document;
    const pagesRoot = doc.getElementById('pv-pages');
    if (!pagesRoot) return;

    const prepared = doc.createElement('div');
    prepared.innerHTML = String(sourceRoot.innerHTML || '');

    try {
        Array.prototype.slice.call(prepared.querySelectorAll('script, button, .no-print, .note-cover-transform-handle, .note-cover-image-replace'))
            .forEach(function (node) {
                if (node.parentNode) node.parentNode.removeChild(node);
            });
        Array.prototype.slice.call(prepared.querySelectorAll('[contenteditable]')).forEach(function (node) {
            node.removeAttribute('contenteditable');
            node.removeAttribute('aria-label');
        });
    } catch (_) {}

    const units = Array.prototype.slice.call(prepared.childNodes).reduce(function (acc, node) {
        if (node.nodeType === 1) {
            acc.push(node);
            return acc;
        }
        if (node.nodeType === 3 && String(node.textContent || '').trim()) {
            const paragraph = doc.createElement('p');
            paragraph.textContent = String(node.textContent || '');
            acc.push(paragraph);
        }
        return acc;
    }, []);

    const margins = getPreviewPopupPageMargins();
    previewPopupApplyPageMarginState(margins);
    pagesRoot.innerHTML = '';
    pagesRoot.style.setProperty('--pv-page-scale', '1');
    const state = { pages: [] };
    let current = previewPopupAddPage(pagesRoot, margins);
    state.pages.push(current);

    function place(element, depth) {
        if (!element || depth > 24) {
            if (element && element.nodeType === 1) current.content.appendChild(element);
            return;
        }

        if (previewPopupIsCoverPage(element)) {
            if (previewPopupPageIsEmpty(current)) {
                if (current.page && current.page.parentNode === pagesRoot) pagesRoot.removeChild(current.page);
                if (state.pages[state.pages.length - 1] === current) state.pages.pop();
            }
            current = previewPopupAddPage(pagesRoot, margins, { cover: true });
            current.content.appendChild(element.cloneNode(true));
            state.pages.push(current);
            current = previewPopupAddPage(pagesRoot, margins);
            state.pages.push(current);
            return;
        }

        if (previewPopupIsExplicitBreak(element)) {
            if (!previewPopupPageIsEmpty(current)) current = previewPopupAddPage(pagesRoot, margins);
            state.pages.push(current);
            return;
        }

        const normal = element.cloneNode(true);
        current.content.appendChild(normal);
        if (previewPopupFits(current.content)) return;
        current.content.removeChild(normal);

        const split = previewPopupSplitOversized(element, current.content);
        if (split && split.length > 1) {
            split.forEach(function (fragment) {
                place(fragment, depth + 1);
            });
            return;
        }

        if (!previewPopupPageIsEmpty(current)) {
            current = previewPopupAddPage(pagesRoot, margins);
            state.pages.push(current);
        }

        const retry = element.cloneNode(true);
        current.content.appendChild(retry);
        if (previewPopupFits(current.content)) return;
        current.content.removeChild(retry);

        const splitAgain = previewPopupSplitOversized(element, current.content);
        if (splitAgain && splitAgain.length > 1) {
            splitAgain.forEach(function (fragment) {
                place(fragment, depth + 1);
            });
            return;
        }

        if (retry.classList) retry.classList.add('pv-forced-fit');
        current.content.appendChild(retry);
        if (!previewPopupFits(current.content)) {
            retry.style.maxHeight = current.content.clientHeight + 'px';
            retry.style.overflow = 'hidden';
        }
    }

    units.forEach(function (unit) {
        place(unit, 0);
    });

    if (state.pages.length > 1 && previewPopupPageIsEmpty(state.pages[state.pages.length - 1])) {
        pagesRoot.removeChild(state.pages.pop().page);
    }
    state.pages.forEach(function (pageState, index) {
        if (pageState.number) {
            pageState.number.textContent = (index + 1) + ' / ' + state.pages.length;
        }
    });
}

function applyPreviewPopupViewport() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const content = doc.getElementById('pv-content');
    const pages = doc.getElementById('pv-pages');
    const scaleLabel = doc.getElementById('pv-scale-label');
    const widthLabel = doc.getElementById('pv-width-label');
    const fontLabel = doc.getElementById('pv-font-label');
    const headerLabel = doc.getElementById('pv-header-label');
    if (!content) return;

    const scale = Math.max(0.1, Math.min(3, Number(previewPopupScale) || 1));
    const widthScale = Math.max(0.5, Math.min(2.5, Number(previewPopupWidthScale) || 1));
    const fs = Math.max(8, Math.min(72, Number(previewPopupFontSize) || 21));
    const headerScale = Math.max(0.5, Math.min(2.5, Number(previewPopupHeaderScale) || 1));
    previewPopupScale = scale;
    previewPopupWidthScale = widthScale;
    previewPopupFontSize = fs;
    previewPopupHeaderScale = headerScale;

    if (doc.documentElement) {
        doc.documentElement.style.setProperty('--pv-header-scale', String(headerScale));
        doc.documentElement.classList.toggle('pv-header-background-removed', !!previewPopupHeaderBackgroundRemoved);
    }

    const widthMm = Math.max(148, PREVIEW_PV_A4_WIDTH_MM * widthScale);
    content.style.zoom = String(scale);
    content.style.transform = 'none';
    content.style.width = previewPopupEditMode ? (widthMm + 'mm') : '100%';
    content.style.maxWidth = 'none';
    content.style.marginLeft = 'auto';
    content.style.marginRight = 'auto';
    content.style.fontSize = fs + 'px';
    content.style.setProperty('--md-app-font-size', fs + 'px');
    content.style.setProperty('--pv-header-scale', String(headerScale));
    if (pages) {
        pages.style.setProperty('--md-app-font-size', fs + 'px');
        pages.style.setProperty('--pv-header-scale', String(headerScale));
    }
    previewPopupApplyHeaderScaleToElements(doc, fs, headerScale);

    if (pages && !previewPopupFileMode) {
        pages.style.setProperty('--pv-page-scale', String(scale));
    }

    if (scaleLabel) scaleLabel.textContent = Math.round(scale * 100) + '%';
    if (widthLabel) widthLabel.textContent = Math.round(widthScale * 100) + '%';
    if (fontLabel) fontLabel.textContent = fs + 'px';
    if (headerLabel) headerLabel.textContent = Math.round(headerScale * 100) + '%';
    const backgroundCheckbox = doc.getElementById('pv-header-background-remove');
    if (backgroundCheckbox) backgroundCheckbox.checked = !!previewPopupHeaderBackgroundRemoved;
    previewPopupRefreshMarginControls();
    syncPreviewPopupHeaderSettingsUi();
    previewPopupScheduleEditPageGuides();
}

function previewPopupApplyHeaderScaleToElements(doc, fontSize, scale) {
    if (!doc || !doc.querySelectorAll) return;
    const sizes = {
        h1: Number(fontSize) * 2.8 * Number(scale),
        h2: Number(fontSize) * 2.1 * Number(scale),
        h3: Number(fontSize) * 1.8 * Number(scale),
        h4: Number(fontSize) * 1.45 * Number(scale)
    };
    Object.keys(sizes).forEach(function (tag) {
        const value = sizes[tag];
        doc.querySelectorAll('#pv-content ' + tag + ',#pv-pages .pv-page-content ' + tag).forEach(function (heading) {
            heading.style.setProperty('font-size', value + 'px', 'important');
        });
    });
}

function previewPopupPrint() {
    if (!isPreviewPopupAlive()) return false;
    try {
        const doc = previewPopupWindow.document;
        if (doc && doc.body) {
            applyPreviewPopupViewport();
            previewPopupApplyPageMarginState(getPreviewPopupPageMargins());
            previewPopupRenderPaginatedPages(doc.getElementById('pv-content'));
            previewPopupRefreshMarginControls();
            doc.body.classList.add('pv-printing');
            setTimeout(function () {
                try { doc.body.classList.remove('pv-printing'); } catch (_) {}
            }, 1);
            previewPopupWindow.print();
        }
        return true;
    } catch (_) {
        return false;
    }
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

function previewPopupAdjustHeaderScale(delta) {
    return previewPopupSetHeaderScale(
        (Number(previewPopupHeaderScale) || 1) + Number(delta || 0)
    );
}

function previewPopupScheduleHeaderRelayout() {
    if (previewPopupHeaderRelayoutTimer) clearTimeout(previewPopupHeaderRelayoutTimer);
    previewPopupHeaderRelayoutTimer = setTimeout(function () {
        previewPopupHeaderRelayoutTimer = null;
        if (!isPreviewPopupAlive() || previewPopupFileMode || previewPopupEditMode) return;
        const source = previewPopupWindow.document.getElementById('pv-content');
        if (source) previewPopupRenderPaginatedPages(source);
        applyPreviewPopupViewport();
    }, 50);
}

function previewPopupSetHeaderScale(value) {
    const next = Math.max(0.5, Math.min(2.5,
        Math.round((Number(value) || 1) * 100) / 100));
    previewPopupHeaderScale = next;
    try { localStorage.setItem(PREVIEW_PV_HEADER_SCALE_STORAGE_KEY, String(next)); } catch (_) {}
    if (isPreviewPopupAlive()) {
        applyPreviewPopupViewport();
        previewPopupScheduleHeaderRelayout();
    } else {
        syncPreviewPopupHeaderSettingsUi();
    }
    return next;
}

function previewPopupSetHeaderScalePercent(value) {
    return previewPopupSetHeaderScale((Number(value) || 100) / 100);
}

function previewPopupSetHeaderBackgroundRemoved(removed) {
    previewPopupHeaderBackgroundRemoved = removed === true;
    try {
        localStorage.setItem(
            PREVIEW_PV_HEADER_BACKGROUND_REMOVED_STORAGE_KEY,
            previewPopupHeaderBackgroundRemoved ? '1' : '0'
        );
    } catch (_) {}
    applyPreviewPopupViewport();
    syncPreviewPopupHeaderSettingsUi();
    return previewPopupHeaderBackgroundRemoved;
}

function syncPreviewPopupHeaderSettingsUi() {
    const percent = Math.round((Number(previewPopupHeaderScale) || 1) * 100);
    const range = document.getElementById('pv-header-scale-setting');
    const value = document.getElementById('pv-header-scale-setting-value');
    const checkbox = document.getElementById('pv-header-background-remove-setting');
    if (range) previewPopupSetInputValue(range, String(percent));
    if (value) value.textContent = percent + '%';
    if (checkbox) checkbox.checked = !!previewPopupHeaderBackgroundRemoved;
    if (isPreviewPopupAlive()) {
        const popupCheckbox = previewPopupWindow.document.getElementById('pv-header-background-remove');
        if (popupCheckbox) popupCheckbox.checked = !!previewPopupHeaderBackgroundRemoved;
    }
}

function previewPopupSetInputValue(input, value) {
    if (input && input.value !== value) input.value = value;
}

function previewPopupResetHeaderSettings() {
    previewPopupHeaderBackgroundRemoved = false;
    try { localStorage.setItem(PREVIEW_PV_HEADER_BACKGROUND_REMOVED_STORAGE_KEY, '0'); } catch (_) {}
    previewPopupSetHeaderScale(1);
    if (isPreviewPopupAlive()) applyPreviewPopupViewport();
    syncPreviewPopupHeaderSettingsUi();
    return true;
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

function getPreviewPopupEditorElement() {
    if (!isPreviewPopupAlive()) return null;
    return previewPopupWindow.document.getElementById('pv-content');
}

function previewPopupMarkdownText(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\t\r\n ]+/g, ' ')
        .replace(/([\\`*_[\]~])/g, '\\$1');
}

function previewPopupMathToMarkdown(node) {
    if (!node || node.nodeType !== 1) return '';
    const annotation = node.querySelector && node.querySelector('annotation[encoding="application/x-tex"]');
    const source = String(annotation ? annotation.textContent : node.getAttribute('data-math-source') || '').trim();
    if (!source) return '';
    const display = node.getAttribute('display') === 'true'
        || node.classList.contains('katex-display')
        || !!node.closest('.katex-display');
    return display ? '$$\n' + source + '\n$$' : '$' + source + '$';
}

function previewPopupInlineHtmlToMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === 3) return previewPopupMarkdownText(node.nodeValue || '');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'mjx-container' || node.classList.contains('katex') || node.classList.contains('katex-display')) {
        return previewPopupMathToMarkdown(node);
    }
    if (tag === 'img') {
        const internalId = String(node.getAttribute('data-internal-id') || '').trim();
        const src = internalId ? 'internal://' + internalId : String(node.getAttribute('src') || '').trim();
        const alt = String(node.getAttribute('alt') || 'image').replace(/[\[\]]/g, '');
        const title = String(node.getAttribute('title') || '').trim();
        const styleText = String(node.getAttribute('style') || '');
        const styleWidth = styleText.match(/(?:^|;)\s*width\s*:\s*([0-9]+)(?:px)?/i);
        const styleHeight = styleText.match(/(?:^|;)\s*height\s*:\s*([0-9]+)(?:px)?/i);
        const width = Number(node.getAttribute('width')) || (styleWidth ? Number(styleWidth[1]) : 0);
        const height = Number(node.getAttribute('height')) || (styleHeight ? Number(styleHeight[1]) : 0);
        if (src && (width || height || node.getAttribute('data-pv-image-output') === 'html')) {
            let html = '<img src="' + escapePreviewAttribute(src) + '" alt="' + escapePreviewAttribute(alt) + '"';
            if (title) html += ' title="' + escapePreviewAttribute(title) + '"';
            if (width) html += ' width="' + width + '"';
            if (height) html += ' height="' + height + '"';
            html += '>';
            return html;
        }
        return src ? '![' + alt + '](' + src + (title ? ' "' + title.replace(/"/g, '\\"') + '"' : '') + ')' : '';
    }
    const content = Array.prototype.map.call(node.childNodes, previewPopupInlineHtmlToMarkdown).join('');
    if (tag === 'strong' || tag === 'b') return content.trim() ? '**' + content.trim() + '**' : '';
    if (tag === 'em' || tag === 'i') return content.trim() ? '*' + content.trim() + '*' : '';
    if (tag === 'del' || tag === 's' || tag === 'strike') return content.trim() ? '~~' + content.trim() + '~~' : '';
    if (tag === 'code' && (!node.parentElement || node.parentElement.tagName !== 'PRE')) {
        return '`' + String(node.textContent || '').replace(/`/g, '\\`') + '`';
    }
    if (tag === 'a') {
        const href = String(node.getAttribute('href') || '').trim();
        const label = content.trim() || href;
        return !href || label === href ? label : '[' + label + '](' + href + ')';
    }
    if (tag === 'sup' || tag === 'sub' || tag === 'mark') return '<' + tag + '>' + content + '</' + tag + '>';
    if (tag === 'span' && node.hasAttribute('style')) {
        return '<span style="' + escapePreviewAttribute(node.getAttribute('style') || '') + '">' + content + '</span>';
    }
    return content;
}

function previewPopupListHtmlToMarkdown(node, depth) {
    const ordered = node.tagName.toLowerCase() === 'ol';
    let number = Number.parseInt(node.getAttribute('start'), 10) || 1;
    return Array.prototype.map.call(node.children, function (item) {
        if (!item || item.tagName.toLowerCase() !== 'li') return '';
        const checkbox = item.querySelector(':scope > input[type="checkbox"]');
        const body = Array.prototype.map.call(item.childNodes, function (child) {
            if (child.nodeType === 1 && /^(ul|ol)$/i.test(child.tagName)) return '';
            if (checkbox && child === checkbox) return '';
            return previewPopupInlineHtmlToMarkdown(child);
        }).join('').trim();
        const task = checkbox ? (checkbox.checked ? '[x] ' : '[ ] ') : '';
        const prefix = ordered ? number++ + '. ' : '- ';
        const line = '  '.repeat(Math.max(0, depth || 0)) + prefix + task + body;
        const nested = Array.prototype.map.call(item.children, function (child) {
            return /^(ul|ol)$/i.test(child.tagName) ? previewPopupListHtmlToMarkdown(child, (depth || 0) + 1) : '';
        }).filter(Boolean).join('\n');
        return nested ? line + '\n' + nested : line;
    }).filter(Boolean).join('\n');
}

function previewPopupBlockHtmlToMarkdown(node, depth) {
    if (!node) return '';
    if (node.nodeType === 3) return previewPopupMarkdownText(node.nodeValue || '').trim();
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const level = Math.max(0, Number(depth) || 0);
    if (node.classList.contains('note-cover-page')) return '';
    if (node.classList.contains('trt-mermaid-wrapper')) {
        const source = String(node.getAttribute('data-mermaid-original-source') || node.getAttribute('data-mermaid-source') || '').trim();
        return source ? '```mermaid\n' + source + '\n```' : '';
    }
    if (/^h[1-6]$/.test(tag)) return '#'.repeat(Number(tag.slice(1))) + ' ' + previewPopupInlineHtmlToMarkdown(node).trim();
    if (tag === 'p') return previewPopupInlineHtmlToMarkdown(node).trim();
    if (tag === 'pre') {
        const code = node.querySelector(':scope > code');
        const match = code && String(code.className || '').match(/(?:language|lang)-([^\s]+)/i);
        const language = match ? match[1] : '';
        return '```' + language + '\n' + String(code ? code.textContent : node.textContent || '').replace(/\s+$/, '') + '\n```';
    }
    if (tag === 'blockquote') {
        const body = Array.prototype.map.call(node.childNodes, function (child) {
            return previewPopupBlockHtmlToMarkdown(child, level + 1);
        }).filter(Boolean).join('\n\n');
        return body.split('\n').map(function (line) { return line ? '> ' + line : '>'; }).join('\n');
    }
    if (tag === 'hr') return '---';
    if (tag === 'ul' || tag === 'ol') return previewPopupListHtmlToMarkdown(node, level);
    if (tag === 'table') {
        const rows = Array.prototype.map.call(node.querySelectorAll('tr'), function (row) {
            return Array.prototype.map.call(row.querySelectorAll(':scope > th, :scope > td'), function (cell) {
                return previewPopupInlineHtmlToMarkdown(cell).trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            });
        }).filter(function (row) { return row.length; });
        if (!rows.length) return '';
        const width = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
        const normalized = rows.map(function (row) {
            return row.concat(Array(Math.max(0, width - row.length)).fill(''));
        });
        const output = ['| ' + normalized[0].join(' | ') + ' |'];
        output.push('| ' + normalized[0].map(function () { return '---'; }).join(' | ') + ' |');
        normalized.slice(1).forEach(function (row) { output.push('| ' + row.join(' | ') + ' |'); });
        return output.join('\n');
    }
    if (tag === 'div' && node.classList.contains('page-break')) return '<div class="page-break"></div>';
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'figure') {
        return Array.prototype.map.call(node.childNodes, function (child) {
            return previewPopupBlockHtmlToMarkdown(child, level + 1);
        }).filter(Boolean).join('\n\n');
    }
    return previewPopupInlineHtmlToMarkdown(node).trim();
}

function previewPopupRenderedHtmlToMarkdown(root, previousMarkdown) {
    if (!root) return '';
    const body = Array.prototype.map.call(root.childNodes, function (node) {
        return previewPopupBlockHtmlToMarkdown(node, 0);
    }).filter(Boolean).join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const previous = String(previousMarkdown || '');
    const frontmatterMatch = previous.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    const frontmatter = frontmatterMatch && /(^|\n)\s*[\w-]+\s*:/.test(frontmatterMatch[1]) ? frontmatterMatch[0].trim() : '';
    const coverComments = previous.match(/<!--\s*note-cover\b[\s\S]*?-->/gi) || [];
    return [frontmatter].concat(coverComments).concat(body ? [body] : []).filter(Boolean).join('\n\n') + (body || frontmatter || coverComments.length ? '\n' : '');
}

function getPreviewPopupSourceSyntax(source) {
    const name = String(typeof currentFileName !== 'undefined' ? currentFileName || '' : '').trim().toLowerCase();
    if (/\.(?:docx|html?)$/.test(name)) return 'html';

    const trimmed = String(source || '').replace(/^\uFEFF/, '').trim();
    if (/^(?:<!doctype\s+html\b|<html\b)/i.test(trimmed)) return 'html';
    if (/\.(?:md|markdown|mdown|mdd)$/.test(name)) return 'markdown';
    return 'markdown';
}

function previewPopupRenderedHtmlToHtml(root, previousHtml) {
    if (!root) return '';
    const clone = root.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('.pv-render-locked'), function (node) {
        node.classList.remove('pv-render-locked');
        if (!node.className) node.removeAttribute('class');
        node.removeAttribute('contenteditable');
    });
    Array.prototype.forEach.call(clone.querySelectorAll(
        '.trt-pv-mermaid-controls,.trt-pv-mermaid-resize-handle,.md-image-resize-overlay,.no-print'
    ), function (node) {
        node.remove();
    });

    const body = String(clone.innerHTML || '').trim();
    const previous = String(previousHtml || '').replace(/^\uFEFF/, '');
    if (/^(?:\s*<!doctype\s+html\b|\s*<html\b)/i.test(previous)) {
        const bodyMatch = previous.match(/^(.*?<body\b[^>]*>)[\s\S]*?(<\/body>[\s\S]*)$/i);
        if (bodyMatch && !clone.querySelector('iframe.html-document-frame')) {
            return bodyMatch[1] + '\n' + body + '\n' + bodyMatch[2];
        }
        return previous;
    }
    return body + (body ? '\n' : '');
}

function previewPopupRenderedDomToSource(root, previousSource) {
    return getPreviewPopupSourceSyntax(previousSource) === 'html'
        ? previewPopupRenderedHtmlToHtml(root, previousSource)
        : previewPopupRenderedHtmlToMarkdown(root, previousSource);
}

function protectPreviewPopupRenderedWidgets() {
    const editor = getPreviewPopupEditorElement();
    if (!editor) return;
    editor.querySelectorAll('.note-cover-page,.trt-mermaid-wrapper,mjx-container,.katex,.katex-display,iframe,object,embed,video,audio,canvas').forEach(function (node) {
        node.setAttribute('contenteditable', 'false');
        node.classList.add('pv-render-locked');
    });
}

function rememberPreviewPopupRenderedSelection() {
    if (!previewPopupEditMode || !isPreviewPopupAlive()) return false;
    const editor = getPreviewPopupEditorElement();
    const selection = previewPopupWindow.getSelection && previewPopupWindow.getSelection();
    if (!editor || !selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return false;
    previewPopupRenderedSelectionRange = range.cloneRange();
    return true;
}

function restorePreviewPopupRenderedSelection() {
    if (!previewPopupRenderedSelectionRange || !isPreviewPopupAlive()) return false;
    const selection = previewPopupWindow.getSelection && previewPopupWindow.getSelection();
    if (!selection) return false;
    try {
        selection.removeAllRanges();
        selection.addRange(previewPopupRenderedSelectionRange);
        return true;
    } catch (_) {
        previewPopupRenderedSelectionRange = null;
        return false;
    }
}

function previewPopupHandleRenderedClick(event) {
    if (!previewPopupEditMode || !event || !event.target) return;
    const link = event.target.closest && event.target.closest('a[href]');
    if (link) event.preventDefault();
    rememberPreviewPopupRenderedSelection();
    syncPreviewPopupEditorUi();
}

function previewPopupGetA4EditPageCount(contentHeightPx, pageHeightPx) {
    const height = Math.max(0, Number(contentHeightPx) || 0);
    const pageHeight = Math.max(1, Number(pageHeightPx) || 1);
    return Math.max(1, Math.ceil(Math.max(0, height - 0.5) / pageHeight));
}

function previewPopupClearEditPageGuides() {
    if (previewPopupEditPageGuideTimer) {
        clearTimeout(previewPopupEditPageGuideTimer);
        previewPopupEditPageGuideTimer = null;
    }
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const layer = doc.getElementById('pv-edit-page-guides');
    const content = doc.getElementById('pv-content');
    if (layer) {
        layer.innerHTML = '';
        layer.style.width = '';
        layer.style.height = '';
    }
    if (content && (!previewPopupEditMode || previewPopupFileMode)) {
        content.style.minHeight = '';
    }
}

function previewPopupUpdateEditPageGuides() {
    previewPopupEditPageGuideTimer = null;
    if (!isPreviewPopupAlive() || !previewPopupEditMode || previewPopupFileMode) {
        previewPopupClearEditPageGuides();
        return false;
    }
    const doc = previewPopupWindow.document;
    const viewer = doc.getElementById('viewer');
    const content = doc.getElementById('pv-content');
    const layer = doc.getElementById('pv-edit-page-guides');
    if (!viewer || !content || !layer) return false;

    const widthScale = Math.max(0.5, Math.min(2.5, Number(previewPopupWidthScale) || 1));
    const widthMm = Math.max(148, PREVIEW_PV_A4_WIDTH_MM * widthScale);
    content.style.minHeight = '0';
    const cssWidthPx = Math.max(1, Number(content.offsetWidth) || 1);
    const cssPageHeightPx = cssWidthPx / widthMm * PREVIEW_PV_A4_HEIGHT_MM;
    const naturalHeightPx = Math.max(Number(content.scrollHeight) || 0, cssPageHeightPx);
    const pageCount = previewPopupGetA4EditPageCount(naturalHeightPx, cssPageHeightPx);
    content.style.minHeight = (PREVIEW_PV_A4_HEIGHT_MM * pageCount) + 'mm';

    const contentRect = content.getBoundingClientRect();
    const viewerRect = viewer.getBoundingClientRect();
    const visiblePageHeight = contentRect.width / widthMm * PREVIEW_PV_A4_HEIGHT_MM;
    layer.style.left = (contentRect.left - viewerRect.left) + 'px';
    layer.style.top = (contentRect.top - viewerRect.top) + 'px';
    layer.style.width = contentRect.width + 'px';
    layer.style.height = contentRect.height + 'px';
    layer.innerHTML = '';

    for (let page = 1; page <= pageCount; page += 1) {
        const guide = doc.createElement('div');
        guide.className = 'pv-edit-page-guide';
        guide.style.top = Math.min(contentRect.height, visiblePageHeight * page) + 'px';
        const label = doc.createElement('span');
        label.className = 'pv-edit-page-guide-label';
        label.textContent = '페이지 ' + page + ' / ' + pageCount;
        guide.appendChild(label);
        layer.appendChild(guide);
    }
    return true;
}

function previewPopupScheduleEditPageGuides() {
    if (previewPopupEditPageGuideTimer) clearTimeout(previewPopupEditPageGuideTimer);
    if (!previewPopupEditMode || previewPopupFileMode || !isPreviewPopupAlive()) {
        previewPopupClearEditPageGuides();
        return false;
    }
    previewPopupEditPageGuideTimer = setTimeout(previewPopupUpdateEditPageGuides, 30);
    return true;
}

function previewPopupSyncEditPageGuideObserver() {
    if (previewPopupEditPageGuideObserver) {
        try { previewPopupEditPageGuideObserver.disconnect(); } catch (_) {}
        previewPopupEditPageGuideObserver = null;
    }
    if (!isPreviewPopupAlive() || !previewPopupEditMode || previewPopupFileMode) return;
    const content = getPreviewPopupEditorElement();
    const ResizeObserverClass = previewPopupWindow.ResizeObserver;
    if (!content || typeof ResizeObserverClass !== 'function') return;
    previewPopupEditPageGuideObserver = new ResizeObserverClass(function () {
        previewPopupScheduleEditPageGuides();
    });
    previewPopupEditPageGuideObserver.observe(content);
}

const PREVIEW_PV_CONTROLS_LAYOUT_KEY = 'mdpro_pv_view_controls_layout_v1';

function savePreviewPopupViewControlsLayout(panel) {
    if (!panel) return;
    try {
        localStorage.setItem(PREVIEW_PV_CONTROLS_LAYOUT_KEY, JSON.stringify({
            orientation: panel.classList.contains('pv-controls-horizontal') ? 'horizontal' : 'vertical',
            left: parseFloat(panel.style.left) || 10,
            top: parseFloat(panel.style.top) || 52
        }));
    } catch (_) {}
}

function clampPreviewPopupViewControls(panel) {
    const win = previewPopupWindow;
    if (!win || !panel) return;
    const gap = 8;
    const maxLeft = Math.max(gap, win.innerWidth - panel.offsetWidth - gap);
    const maxTop = Math.max(46, win.innerHeight - panel.offsetHeight - gap);
    panel.style.left = Math.max(gap, Math.min(maxLeft, parseFloat(panel.style.left) || 10)) + 'px';
    panel.style.top = Math.max(46, Math.min(maxTop, parseFloat(panel.style.top) || 52)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function previewPopupToggleViewControlsOrientation() {
    if (!isPreviewPopupAlive()) return;
    const panel = previewPopupWindow.document.getElementById('pv-view-controls');
    if (!panel) return;
    panel.classList.toggle('pv-controls-horizontal');
    const button = panel.querySelector('.pv-orientation-toggle');
    if (button) button.textContent = panel.classList.contains('pv-controls-horizontal') ? '↕' : '↔';
    previewPopupWindow.requestAnimationFrame(function () {
        clampPreviewPopupViewControls(panel);
        savePreviewPopupViewControlsLayout(panel);
    });
}

function bindPreviewPopupViewControls() {
    if (!isPreviewPopupAlive()) return;
    const win = previewPopupWindow;
    const doc = win.document;
    const panel = doc.getElementById('pv-view-controls');
    if (!panel || panel.dataset.floatingBound === '1') return;
    panel.dataset.floatingBound = '1';

    const actions = doc.createElement('div');
    actions.className = 'pv-controls-actions';
    const drag = doc.createElement('button');
    drag.type = 'button';
    drag.className = 'pv-drag-handle';
    drag.textContent = '✥';
    drag.title = '끌어서 확대·축소 메뉴 이동';
    drag.setAttribute('aria-label', '확대 축소 메뉴 이동');
    const orientation = doc.createElement('button');
    orientation.type = 'button';
    orientation.className = 'pv-orientation-toggle';
    orientation.textContent = '↔';
    orientation.title = '가로/세로 전환';
    orientation.setAttribute('aria-label', '확대 축소 메뉴 방향 전환');
    orientation.addEventListener('click', previewPopupToggleViewControlsOrientation);
    actions.appendChild(drag);
    actions.appendChild(orientation);
    panel.insertBefore(actions, panel.firstChild);

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PREVIEW_PV_CONTROLS_LAYOUT_KEY) || 'null'); } catch (_) {}
    if (saved && saved.orientation === 'horizontal') panel.classList.add('pv-controls-horizontal');
    panel.style.left = (saved && Number.isFinite(Number(saved.left)) ? Number(saved.left) : 10) + 'px';
    panel.style.top = (saved && Number.isFinite(Number(saved.top)) ? Number(saved.top) : 52) + 'px';
    orientation.textContent = panel.classList.contains('pv-controls-horizontal') ? '↕' : '↔';
    clampPreviewPopupViewControls(panel);

    let offsetX = 0;
    let offsetY = 0;
    function move(event) {
        panel.style.left = event.clientX - offsetX + 'px';
        panel.style.top = event.clientY - offsetY + 'px';
        clampPreviewPopupViewControls(panel);
    }
    function stop() {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', stop);
        doc.removeEventListener('pointercancel', stop);
        savePreviewPopupViewControlsLayout(panel);
    }
    drag.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        const rect = panel.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        event.preventDefault();
        doc.addEventListener('pointermove', move);
        doc.addEventListener('pointerup', stop);
        doc.addEventListener('pointercancel', stop);
    });
    win.addEventListener('resize', function () { clampPreviewPopupViewControls(panel); });
}

function syncPreviewPopupEditorUi() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    if (!doc || !doc.body) return;
    bindPreviewPopupViewControls();
    doc.body.classList.toggle('pv-editor-mode', !!previewPopupEditMode && !previewPopupFileMode);
    doc.body.classList.toggle('pv-file-mode', !!previewPopupFileMode);
    const toggle = doc.getElementById('pv-mode-toggle');
    const status = doc.getElementById('pv-draft-status');
    const editor = getPreviewPopupEditorElement();
    if (editor) {
        if (previewPopupEditMode && !previewPopupFileMode) {
            editor.setAttribute('contenteditable', 'true');
            editor.setAttribute('aria-label', 'PV 렌더링 문서 편집기');
            protectPreviewPopupRenderedWidgets();
        } else {
            editor.removeAttribute('contenteditable');
            editor.removeAttribute('aria-label');
        }
    }
    if (toggle) {
        toggle.textContent = previewPopupEditMode ? '편집 종료' : '렌더 편집';
        toggle.title = previewPopupEditMode ? '렌더 편집을 마치고 결과 확인' : '렌더링된 문서를 직접 편집';
    }
    if (status) {
        status.textContent = previewPopupDraftDirty ? '렌더 초안 편집 중' : '원본과 동기화';
        status.classList.toggle('is-dirty', !!previewPopupDraftDirty);
    }
    const editOnlyButtons = doc.querySelectorAll(
        '.pv-format-button,' +
        '#pv-toolbar button[title="표 삽입"],' +
        '#pv-toolbar button[title="표 행 추가"],' +
        '#pv-toolbar button[title="표 열 추가"],' +
        '#pv-toolbar button[title="메인 이미지 삽입 도구 열기"]'
    );
    const tableContext = previewPopupGetCurrentTableContext();
    editOnlyButtons.forEach(function (button) {
        button.disabled = !previewPopupEditMode || previewPopupFileMode;
    });
    const tableButtonTitles = [
        '표 행 추가',
        '표 열 추가'
    ];
    tableButtonTitles.forEach(function (title) {
        const button = doc.querySelector('#pv-toolbar button[title="' + title + '"]');
        if (!button) return;
        button.disabled = !previewPopupEditMode || previewPopupFileMode || !tableContext;
    });
    if (previewPopupEditMode && !previewPopupFileMode) {
        schedulePreviewPopupImageResize();
        previewPopupSyncEditPageGuideObserver();
        previewPopupScheduleEditPageGuides();
    } else {
        cancelPreviewPopupImageResize();
        previewPopupSyncEditPageGuideObserver();
        previewPopupClearEditPageGuides();
    }
}

async function previewPopupToggleEditor() {
    if (!isPreviewPopupAlive() || previewPopupFileMode) return false;
    const editor = getPreviewPopupEditorElement();
    if (!editor) return false;
    if (!previewPopupEditMode) {
        const source = getPreviewPopupSourceMarkdown();
        if (!previewPopupDraftDirty) {
            previewPopupDraftMarkdown = source;
            previewPopupDraftBaseMarkdown = source;
        }
        previewPopupRenderedDomChanged = false;
        previewPopupEditMode = true;
        applyPreviewPopupViewport();
        syncPreviewPopupEditorUi();
        try {
            editor.focus();
            const selection = previewPopupWindow.getSelection();
            const range = previewPopupWindow.document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            previewPopupRenderedSelectionRange = range.cloneRange();
        } catch (_) {}
        return true;
    }
    previewPopupHandleEditorInput();
    const confirmWindow = isPreviewPopupAlive() ? previewPopupWindow : window;
    const shouldApply = confirmWindow.confirm('렌더 편집 내용을 원본 노트에 반영할까요?');
    if (shouldApply) {
        const applied = await applyPreviewPopupEditsToOriginal({ silent: true });
        if (!applied) return false;
    }
    previewPopupEditMode = false;
    previewPopupRenderedDomChanged = false;
    syncPreviewPopupEditorUi();
    updatePreviewPopupContent();
    return true;
}

function previewPopupHandleEditorInput(domChanged) {
    const editor = getPreviewPopupEditorElement();
    if (!editor) return false;
    if (domChanged === true) previewPopupRenderedDomChanged = true;
    if (!previewPopupRenderedDomChanged) {
        syncPreviewPopupEditorUi();
        return true;
    }
    const previous = previewPopupDraftMarkdown || previewPopupDraftBaseMarkdown || getPreviewPopupSourceMarkdown();
    previewPopupDraftMarkdown = previewPopupRenderedDomToSource(editor, previous);
    previewPopupDraftDirty = previewPopupDraftMarkdown !== previewPopupDraftBaseMarkdown;
    rememberPreviewPopupRenderedSelection();
    syncPreviewPopupEditorUi();
    previewPopupScheduleEditPageGuides();
    return true;
}

function replacePreviewPopupEditorSelection(replacement, selectionStartOffset, selectionEndOffset) {
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const editor = getPreviewPopupEditorElement();
    if (!editor) return false;
    editor.focus();
    restorePreviewPopupRenderedSelection();
    previewPopupWindow.document.execCommand('insertText', false, String(replacement == null ? '' : replacement));
    rememberPreviewPopupRenderedSelection();
    previewPopupHandleEditorInput(true);
    return true;
}

function previewPopupFormat(type) {
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const editor = getPreviewPopupEditorElement();
    if (!editor) return false;
    const action = String(type || '');
    let command = '';
    let value = null;
    if (action === 'bold') command = 'bold';
    else if (action === 'italic') command = 'italic';
    else if (action === 'bullet') command = 'insertUnorderedList';
    else if (action === 'ordered') command = 'insertOrderedList';
    else if (action === 'h1' || action === 'h2' || action === 'h3') {
        command = 'formatBlock';
        value = action.toUpperCase();
    } else {
        return false;
    }
    editor.focus();
    restorePreviewPopupRenderedSelection();
    const changed = previewPopupWindow.document.execCommand(command, false, value);
    previewPopupHandleEditorInput(true);
    return !!changed;
}

function previewPopupGetCurrentTableContext() {
    if (!isPreviewPopupAlive()) return null;
    const editor = getPreviewPopupEditorElement();
    if (!editor || !previewPopupEditMode) return null;
    const selection = previewPopupWindow.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!range) return null;
    let node = range.startContainer;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || node.nodeType !== 1 || !editor.contains(node)) return null;
    const table = node.closest ? node.closest('table') : null;
    if (!table || !editor.contains(table)) return null;
    const row = node.closest ? node.closest('tr') : null;
    const cell = node.closest ? (node.closest('th') || node.closest('td')) : null;
    return {
        table,
        row,
        cell,
        section: row ? row.parentElement : null
    };
}

function previewPopupGetTableColumnCount(table) {
    if (!table || !table.rows) return 1;
    let count = 1;
    for (let i = 0; i < table.rows.length; i += 1) {
        const row = table.rows[i];
        if (!row || !row.cells) continue;
        const len = row.cells.length;
        if (len > count) count = len;
    }
    return count;
}

function previewPopupEnsureTablePicker() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const panel = doc.getElementById('pv-table-picker');
    const grid = doc.getElementById('pv-table-picker-grid');
    const label = doc.getElementById('pv-table-picker-size-label');
    if (!panel || !grid || !label) return;

    const existing = grid.children && grid.children.length;
    if (existing) return;

    for (let r = 1; r <= PREVIEW_PV_TABLE_PICKER_ROWS; r += 1) {
        for (let c = 1; c <= PREVIEW_PV_TABLE_PICKER_COLS; c += 1) {
            const cell = doc.createElement('button');
            cell.type = 'button';
            cell.className = 'pv-table-picker-cell';
            cell.dataset.rows = String(r);
            cell.dataset.cols = String(c);
            cell.title = r + 'x' + c + ' 표';
            cell.addEventListener('mouseenter', function () {
                previewPopupRenderTablePickerSelection(r, c);
            });
            cell.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });
            cell.addEventListener('click', function () {
                previewPopupInsertTableAtRowsCols(r, c);
            });
            grid.appendChild(cell);
        }
    }

    grid.addEventListener('mouseleave', function () {
        previewPopupRenderTablePickerSelection(0, 0);
    });
}

function previewPopupPositionPopover(popover, anchor, alignRight) {
    if (!popover || !anchor || !isPreviewPopupAlive()) return false;
    const win = previewPopupWindow;
    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(0, Number(win.innerWidth) || 0);
    const fallbackWidth = popover.id === 'pv-table-picker' ? 216 : 196;
    const popoverWidth = Math.max(1, Number(popover.offsetWidth) || fallbackWidth);
    let left = alignRight ? anchorRect.right - popoverWidth : anchorRect.left;
    left = Math.max(8, Math.min(left, Math.max(8, viewportWidth - popoverWidth - 8)));
    popover.style.left = Math.round(left) + 'px';
    popover.style.right = 'auto';
    popover.style.top = Math.max(46, Math.round(anchorRect.bottom + 6)) + 'px';
    return true;
}

function previewPopupRenderTablePickerSelection(rows, cols) {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const label = doc.getElementById('pv-table-picker-size-label');
    const grid = doc.getElementById('pv-table-picker-grid');
    if (!label || !grid) return;
    const safeRows = Number(rows) || 0;
    const safeCols = Number(cols) || 0;
    label.textContent = (safeRows > 0 && safeCols > 0)
        ? (safeRows + 'x' + safeCols + ' 표')
        : '표 크기 선택';
    const cells = grid.querySelectorAll('.pv-table-picker-cell[data-rows][data-cols]');
    for (let i = 0; i < cells.length; i += 1) {
        const item = cells[i];
        const r = Number(item.dataset.rows || 0);
        const c = Number(item.dataset.cols || 0);
        const on = safeRows > 0 && safeCols > 0 && r <= safeRows && c <= safeCols;
        item.classList.toggle('pv-table-picker-cell-active', on);
    }
}

function previewPopupOpenTablePicker() {
    if (!isPreviewPopupAlive()) return false;
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const doc = previewPopupWindow.document;
    const panel = doc.getElementById('pv-table-picker');
    if (!panel) return false;
    previewPopupCloseMarginDialog();
    previewPopupEnsureTablePicker();
    previewPopupPositionPopover(panel, doc.getElementById('pv-table-picker-button'), false);
    if (!previewPopupTablePickerBound) {
        const onDismiss = function (event) {
            const target = event && event.target ? event.target : null;
            if (!previewPopupTablePickerOpen) return;
            if (target && (target.closest && target.closest('#pv-table-picker') || panel.contains(target))) return;
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            previewPopupCloseTablePicker();
        };
        previewPopupWindow.addEventListener('mousedown', onDismiss);
        previewPopupWindow.addEventListener('keydown', onDismiss);
        previewPopupTablePickerCloseHandler = onDismiss;
        previewPopupTablePickerBound = true;
    }
    previewPopupTablePickerOpen = true;
    panel.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    previewPopupRenderTablePickerSelection(0, 0);
    return true;
}

function previewPopupCloseTablePicker() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const panel = doc.getElementById('pv-table-picker');
    if (panel) {
        panel.style.display = 'none';
        panel.setAttribute('aria-hidden', 'true');
    }
    if (typeof previewPopupTablePickerCloseHandler === 'function') {
        previewPopupWindow.removeEventListener('mousedown', previewPopupTablePickerCloseHandler);
        previewPopupWindow.removeEventListener('keydown', previewPopupTablePickerCloseHandler);
        previewPopupTablePickerCloseHandler = null;
        previewPopupTablePickerBound = false;
    }
    previewPopupTablePickerOpen = false;
    previewPopupRenderTablePickerSelection(0, 0);
}

function previewPopupInsertHtmlAtSelection(html) {
    if (!isPreviewPopupAlive() || !html) return false;
    const editor = getPreviewPopupEditorElement();
    if (!editor) return false;
    try {
        editor.focus();
        const doc = previewPopupWindow.document;
        restorePreviewPopupRenderedSelection();
        const selection = previewPopupWindow.getSelection && previewPopupWindow.getSelection();
        let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = doc.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            if (selection && selection.removeAllRanges && selection.addRange) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        if (range) {
            if (selection && selection.removeAllRanges) {
                range.deleteContents();
            }
            if (typeof doc.execCommand === 'function') {
                const inserted = doc.execCommand('insertHTML', false, html);
                if (inserted) {
                    if (selection && selection.collapseToEnd && selection.rangeCount) selection.collapseToEnd();
                    return true;
                }
            }
            const wrapper = doc.createElement('div');
            wrapper.innerHTML = String(html);
            const fragment = doc.createDocumentFragment();
            while (wrapper.firstChild) {
                fragment.appendChild(wrapper.firstChild);
            }
            range.deleteContents();
            if (selection && selection.removeAllRanges) {
                selection.removeAllRanges();
            }
            range.insertNode(fragment);
            if (selection && selection.addRange) {
                range.collapse(false);
                selection.addRange(range);
            }
            return true;
        }
    } catch (_) {}
    return false;
}

function previewPopupInsertTableAtRowsCols(rowsInput, colsInput) {
    if (!isPreviewPopupAlive()) return false;
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const rows = Math.max(1, Math.min(PREVIEW_PV_TABLE_ROWS_MAX, Number(rowsInput) || 1));
    const cols = Math.max(1, Math.min(PREVIEW_PV_TABLE_COLS_MAX, Number(colsInput) || 1));
    const headerCells = [];
    for (let index = 1; index <= cols; index += 1) {
        headerCells.push('<th>Header ' + index + '</th>');
    }
    const bodyRows = [];
    for (let rowIndex = 1; rowIndex < rows; rowIndex += 1) {
        bodyRows.push('<tr>' + Array(cols).fill('<td><br></td>').join('') + '</tr>');
    }
    const tableHtml = '<table><thead><tr>' + headerCells.join('') + '</tr></thead>'
        + (bodyRows.length ? '<tbody>' + bodyRows.join('') + '</tbody>' : '')
        + '</table><p><br></p>';
    previewPopupCloseTablePicker();
    const inserted = previewPopupInsertHtmlAtSelection(tableHtml);
    if (!inserted) {
        showToast('표 삽입을 수행하지 못했습니다. 편집 모드에서 다시 시도해 주세요.');
        return false;
    }
    rememberPreviewPopupRenderedSelection();
    previewPopupHandleEditorInput(true);
    syncPreviewPopupEditorUi();
    return true;
}

function previewPopupAddTableRow() {
    const context = previewPopupGetCurrentTableContext();
    if (!context || !context.table) {
        showToast('표 안에 커서를 두고 행 추가를 눌러주세요.');
        return false;
    }
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const doc = previewPopupWindow.document;
    const table = context.table;
    const docFragment = doc;
    const cols = previewPopupGetTableColumnCount(table);
    let section = context.section;
    if (!section || section.tagName.toLowerCase() === 'table') {
        section = table.tBodies[0];
        if (!section) {
            section = docFragment.createElement('tbody');
            table.appendChild(section);
        }
    }
    const row = docFragment.createElement('tr');
    for (let i = 0; i < cols; i += 1) {
        row.appendChild(docFragment.createElement('td')).innerHTML = '<br>';
    }
    if (context.section && context.section === table.tBodies[0] && context.row && context.row.nextSibling) {
        section.insertBefore(row, context.row.nextSibling);
    } else {
        section.appendChild(row);
    }
    previewPopupHandleEditorInput(true);
    return true;
}

function previewPopupAddTableColumn() {
    const context = previewPopupGetCurrentTableContext();
    if (!context || !context.table) {
        showToast('표 셀 안에 커서를 두고 열 추가를 눌러주세요.');
        return false;
    }
    if (!previewPopupEditMode) previewPopupToggleEditor();
    const table = context.table;
    const doc = previewPopupWindow.document;
    const targetIndex = context.cell ? (context.cell.cellIndex + 1) : previewPopupGetTableColumnCount(table);
    const rows = table.rows;
    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const ref = row.cells[targetIndex];
        const isHeader = String(row.parentElement && row.parentElement.tagName || '').toLowerCase() === 'thead';
        const cell = doc.createElement(isHeader ? 'th' : 'td');
        cell.innerHTML = '<br>';
        if (row.cells.length === 0) row.appendChild(cell);
        else row.insertBefore(cell, ref || null);
    }
    previewPopupHandleEditorInput(true);
    return true;
}


function previewPopupHandleEditorKeydown(event) {
    if (!event) return;
    const key = String(event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'b' || key === 'i')) {
        event.preventDefault();
        previewPopupFormat(key === 'b' ? 'bold' : 'italic');
        return;
    }
    if (key === 'tab') {
        event.preventDefault();
        replacePreviewPopupEditorSelection('    ', 4, 4);
    }
}

async function applyPreviewPopupEditsToOriginal(options) {
    const opts = options || {};
    if (!isPreviewPopupAlive() || previewPopupFileMode) return false;
    if (previewPopupEditMode) previewPopupHandleEditorInput();
    const currentSource = getPreviewPopupSourceMarkdown();
    if (!previewPopupDraftDirty) {
        previewPopupDraftMarkdown = currentSource;
        previewPopupDraftBaseMarkdown = currentSource;
        previewPopupRenderedDomChanged = false;
        syncPreviewPopupEditorUi();
        if (!opts.silent) showToast('PV 초안과 원본 노트가 이미 같습니다.');
        return true;
    }
    const draft = String(previewPopupDraftMarkdown || '');
    if (previewPopupDraftDirty && currentSource !== previewPopupDraftBaseMarkdown && !opts.skipConflictConfirm) {
        const proceed = window.confirm('PV 편집을 시작한 뒤 원본 노트가 변경되었습니다.\nPV 초안으로 원본 노트를 바꿀까요?');
        if (!proceed) return false;
    }
    if (draft === currentSource) {
        previewPopupDraftBaseMarkdown = draft;
        previewPopupDraftDirty = false;
        previewPopupRenderedDomChanged = false;
        syncPreviewPopupEditorUi();
        if (!opts.silent) showToast('PV 초안과 원본 노트가 이미 같습니다.');
        return true;
    }
    previewPopupDraftBaseMarkdown = draft;
    previewPopupDraftDirty = false;
    previewPopupRenderedDomChanged = false;
    updateContent(draft);
    if (typeof syncRenderSourceRevision === 'function') syncRenderSourceRevision(draft);
    if (typeof performAutoSave === 'function') performAutoSave({ force: true });
    syncPreviewPopupEditorUi();
    if (!opts.silent) showToast('PV 편집 내용을 원본 노트에 반영했습니다.');
    return true;
}

async function previewPopupExport() {
    if (previewPopupEditMode) previewPopupHandleEditorInput();
    if (previewPopupDraftDirty) {
        const confirmWindow = isPreviewPopupAlive() ? previewPopupWindow : window;
        const proceed = confirmWindow.confirm('PV 편집 내용이 아직 원본 노트에 반영되지 않았습니다.\n원본 노트에 반영한 뒤 내보낼까요?');
        if (!proceed) return false;
        const applied = await applyPreviewPopupEditsToOriginal({ silent: true });
        if (!applied) return false;
    }

    const choice = await choosePreviewPopupExportType();
    if (!choice || choice === 'cancel') return false;

    // The format picker belongs to the PV document. Once the user has chosen a
    // format, bring the owner window forward for exports (such as PDF preview)
    // whose editor is intentionally hosted in the main document.
    try { window.focus(); } catch (_) {}
    if (typeof exportCurrentDocumentByChoice === 'function') return await exportCurrentDocumentByChoice(choice);
    showToast('메인 내보내기 기능을 불러오지 못했습니다.');
    return false;
}

function choosePreviewPopupExportType() {
    if (!isPreviewPopupAlive()) return Promise.resolve('cancel');

    return new Promise(function (resolve) {
        const doc = previewPopupWindow.document;
        const previous = doc.getElementById('pv-export-choice-overlay');
        if (previous && previous.parentNode) previous.parentNode.removeChild(previous);

        const choices = [
            { key: 'md', label: 'MD file', background: '#be185d', border: '#ec4899' },
            { key: 'docx', label: 'MS Word (.docx)', background: '#1d4ed8', border: '#3b82f6' },
            { key: 'mdd', label: 'MDD file (bundle)', background: '#6d28d9', border: '#8b5cf6' },
            { key: 'zip', label: 'ZIP file', background: '#b45309', border: '#f59e0b' },
            { key: 'html', label: 'HTML file', background: '#0f766e', border: '#14b8a6' },
            { key: 'pdf', label: 'PDF file', background: '#a16207', border: '#eab308' }
        ];
        try {
            if (typeof isGithubExportEnabled === 'function' && isGithubExportEnabled()) {
                choices.push({ key: 'github', label: 'GitHub (push)', background: '#15803d', border: '#22c55e' });
            }
        } catch (_) {}
        choices.push({ key: 'cancel', label: 'Cancel', background: '#b91c1c', border: '#ef4444' });

        const overlay = doc.createElement('div');
        overlay.id = 'pv-export-choice-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pv-export-choice-title');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.62);display:flex;align-items:flex-start;justify-content:center;padding:72px 16px 16px;box-sizing:border-box;';

        const card = doc.createElement('div');
        card.style.cssText = 'width:min(620px,96vw);background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:16px;box-sizing:border-box;';

        const title = doc.createElement('h3');
        title.id = 'pv-export-choice-title';
        title.textContent = '내보내기 형식';
        title.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:800;color:#f8fafc;';
        card.appendChild(title);

        const desc = doc.createElement('p');
        desc.textContent = '형식을 선택하세요. 선택 메뉴는 PV 창 위에 표시되며, PDF 편집 화면은 선택 후 메인 창에서 열립니다.';
        desc.style.cssText = 'margin:0 0 14px;font-size:12px;line-height:1.5;color:#cbd5e1;';
        card.appendChild(desc);

        const row = doc.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        let settled = false;

        function done(key) {
            if (settled) return;
            settled = true;
            doc.removeEventListener('keydown', onKeyDown, true);
            try { previewPopupWindow.removeEventListener('pagehide', onPageHide); } catch (_) {}
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(key || 'cancel');
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                done('cancel');
            }
        }

        function onPageHide() {
            done('cancel');
        }

        choices.forEach(function (choice) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = choice.label;
            button.dataset.exportChoice = choice.key;
            button.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid ' + choice.border + ';background:' + choice.background + ';color:#fff;font-size:13px;font-weight:750;cursor:pointer;';
            button.addEventListener('click', function () { done(choice.key); });
            row.appendChild(button);
        });

        card.appendChild(row);
        overlay.appendChild(card);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) done('cancel');
        });
        doc.addEventListener('keydown', onKeyDown, true);
        try { previewPopupWindow.addEventListener('pagehide', onPageHide, { once: true }); } catch (_) {}
        doc.body.appendChild(overlay);
        const firstButton = row.querySelector('button');
        if (firstButton) firstButton.focus();
    });
}

async function updatePreviewPopupContent() {
    if (!isPreviewPopupAlive()) return;
    if (previewPopupFileMode) return;
    if (previewPopupEditMode) {
        syncPreviewPopupEditorUi();
        return;
    }
    syncPreviewPopupTheme();
    const token = ++previewPopupRenderToken;
    const sourceMarkdown = getPreviewPopupSourceMarkdown();
    if (!previewPopupDraftDirty) {
        previewPopupDraftMarkdown = sourceMarkdown;
        previewPopupDraftBaseMarkdown = sourceMarkdown;
    }
    const raw = previewPopupDraftDirty ? previewPopupDraftMarkdown : sourceMarkdown;
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
        previewPopupClearPagedContent();
        applyPreviewPopupViewport();
        target.style.width = '100%';
        target.style.maxWidth = 'none';
        target.style.height = 'calc(100vh - 112px)';
        renderHtmlDocumentFrame(target, htmlDocument, {
            title: (typeof currentFileName !== 'undefined' && currentFileName) || 'HTML preview'
        });
        previewPopupRefreshMarginControls();
        syncPreviewPopupEditorUi();
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
    previewPopupRenderPaginatedPages(target);
    previewPopupApplyPageMarginState(getPreviewPopupPageMargins());
    applyPreviewPopupViewport();
    previewPopupRefreshMarginControls();
    syncPreviewPopupEditorUi();
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
        previewPopupRefreshMarginControls();
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
    previewPopupRefreshMarginControls();
    previewPopupApplyPageMarginState(getPreviewPopupPageMargins());
    syncPreviewPopupTheme();

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

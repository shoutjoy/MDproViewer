const MINI_PREVIEW_KEY = 'md_viewer_minipv_enabled';
const MINI_PREVIEW_LAYOUT_KEY = 'md_viewer_minipv_layout';
const MINI_PREVIEW_HTML = ''
    + '<div id="mini-preview-panel" class="hidden absolute top-2 right-2 w-[340px] max-w-[42vw] h-[68%] min-h-[220px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xl overflow-hidden no-print z-20">'
    + '<div id="mini-preview-header" class="flex items-center justify-between px-2 py-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-move touch-none select-none">'
    + '<span class="text-xs font-bold text-slate-700 dark:text-slate-200">miniPV</span>'
    + '<div class="flex items-center gap-1">'
    + '<button type="button" id="btn-mini-preview-zoom-out" onclick="miniPreviewAdjustZoom(-0.1)" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">-</button>'
    + '<span id="mini-preview-zoom-label" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900">100%</span>'
    + '<button type="button" id="btn-mini-preview-zoom-in" onclick="miniPreviewAdjustZoom(0.1)" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">+</button>'
    + '<button type="button" id="btn-mini-preview-fullscreen" onclick="toggleMiniPreviewFullscreen()" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">전체</button>'
    + '<button type="button" id="btn-mini-preview-close" onclick="toggleMiniPreview()" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">닫기</button>'
    + '</div></div>'
    + '<div id="mini-preview-content" class="markdown-body mini-preview-content h-[calc(100%-34px)] overflow-auto p-3 text-[13px] leading-6 bg-white dark:bg-slate-900"></div>'
    + '<div id="mini-preview-resize-handle" class="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize bg-indigo-500/70 rounded-tl"></div>'
    + '</div>';

let miniPreviewPanel = null;
let miniPreviewContent = null;
let miniPreviewHeader = null;
let miniPreviewResizeHandle = null;
let miniPreviewEnabled = false;
let miniPreviewDragBound = false;
let miniPreviewDragging = false;
let miniPreviewResizing = false;
let miniPreviewFullscreen = false;
let miniPreviewZoom = 1;
let miniPreviewDragOffsetX = 0;
let miniPreviewDragOffsetY = 0;
let miniPreviewStartX = 0;
let miniPreviewStartY = 0;
let miniPreviewStartW = 0;
let miniPreviewStartH = 0;
let miniPreviewLayoutBeforeFullscreen = null;
let miniPreviewRenderToken = 0;
let miniPreviewActivePointerId = null;

window.MiniPreviewUI = window.MiniPreviewUI || {};
window.MiniPreviewUI.ready = loadMiniPreviewHtml();

function bindMiniPreviewElements() {
    miniPreviewPanel = document.getElementById('mini-preview-panel');
    miniPreviewContent = document.getElementById('mini-preview-content');
    miniPreviewHeader = document.getElementById('mini-preview-header');
    miniPreviewResizeHandle = document.getElementById('mini-preview-resize-handle');
    if (miniPreviewHeader) {
        miniPreviewHeader.style.touchAction = 'none';
        miniPreviewHeader.style.userSelect = 'none';
        miniPreviewHeader.style.webkitUserSelect = 'none';
    }
    if (miniPreviewPanel) updateMiniPreviewFullscreenUi();
}

function ensureMiniPreviewHtml() {
    const host = document.getElementById('mini-preview-host') || document.getElementById('content-viewport');
    if (!host || document.getElementById('mini-preview-panel')) {
        bindMiniPreviewElements();
        return;
    }
    host.insertAdjacentHTML('beforeend', MINI_PREVIEW_HTML);
    bindMiniPreviewElements();
}

function loadMiniPreviewHtml() {
    return fetch('./js/UI_PV/minipv.html?v=20260603-1', { cache: 'no-cache' })
        .then(function (res) {
            if (!res.ok) throw new Error('Failed to load miniPV HTML.');
            return res.text();
        })
        .then(function (html) {
            const host = document.getElementById('mini-preview-host') || document.getElementById('content-viewport');
            if (!host || document.getElementById('mini-preview-panel')) {
                bindMiniPreviewElements();
                return;
            }
            host.insertAdjacentHTML('beforeend', html);
            bindMiniPreviewElements();
        })
        .catch(function () {
            ensureMiniPreviewHtml();
        });
}

function getMiniPreviewEnabledFromLocal() {
    try {
        return localStorage.getItem(MINI_PREVIEW_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function setMiniPreviewEnabledToLocal(enabled) {
    try {
        localStorage.setItem(MINI_PREVIEW_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

function getMiniPreviewLayoutFromLocal() {
    try {
        const raw = localStorage.getItem(MINI_PREVIEW_LAYOUT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            left: Number(parsed.left),
            top: Number(parsed.top),
            width: Number(parsed.width),
            height: Number(parsed.height)
        };
    } catch (_) {
        return null;
    }
}

function setMiniPreviewLayoutToLocal(layout) {
    try {
        localStorage.setItem(MINI_PREVIEW_LAYOUT_KEY, JSON.stringify(layout || {}));
    } catch (_) {}
}

function getMiniPreviewContainerRect() {
    const container = editorContainer || document.getElementById('content-viewport');
    if (!container) return null;
    return container.getBoundingClientRect();
}

function clampMiniPreviewLayout(layoutInput) {
    const layout = layoutInput || {};
    const rect = getMiniPreviewContainerRect();
    if (!rect) return { left: 8, top: 8, width: 340, height: 380 };
    const minW = 240;
    const minH = 180;
    const maxW = Math.max(minW, Math.floor(rect.width - 16));
    const maxH = Math.max(minH, Math.floor(rect.height - 16));
    const width = Math.max(minW, Math.min(Number(layout.width) || 340, maxW));
    const height = Math.max(minH, Math.min(Number(layout.height) || Math.floor(rect.height * 0.68), maxH));
    const left = Math.max(8, Math.min(Number(layout.left), Math.max(8, Math.floor(rect.width - width - 8))));
    const top = Math.max(8, Math.min(Number(layout.top), Math.max(8, Math.floor(rect.height - height - 8))));
    return {
        left: Number.isFinite(left) ? left : Math.max(8, Math.floor(rect.width - width - 8)),
        top: Number.isFinite(top) ? top : 8,
        width: width,
        height: height
    };
}

function applyMiniPreviewLayout(layoutInput) {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    if (!miniPreviewPanel) return;
    if (miniPreviewFullscreen) {
        const rect = getMiniPreviewContainerRect();
        if (rect) {
            const width = Math.max(320, Math.min(Math.floor(rect.width * 0.9), Math.floor(rect.width - 16)));
            const height = Math.max(220, Math.min(Math.floor(rect.height * 0.94), Math.floor(rect.height - 16)));
            const left = Math.max(8, Math.floor((rect.width - width) / 2));
            const top = Math.max(8, Math.floor((rect.height - height) / 2));
            miniPreviewPanel.style.left = left + 'px';
            miniPreviewPanel.style.top = top + 'px';
            miniPreviewPanel.style.width = width + 'px';
            miniPreviewPanel.style.height = height + 'px';
        } else {
            miniPreviewPanel.style.left = '8px';
            miniPreviewPanel.style.top = '8px';
            miniPreviewPanel.style.width = 'calc(100% - 16px)';
            miniPreviewPanel.style.height = 'calc(100% - 16px)';
        }
        miniPreviewPanel.style.right = 'auto';
        miniPreviewPanel.style.maxWidth = 'none';
        return;
    }
    const layout = clampMiniPreviewLayout(layoutInput || getMiniPreviewLayoutFromLocal() || {});
    miniPreviewPanel.style.left = layout.left + 'px';
    miniPreviewPanel.style.top = layout.top + 'px';
    miniPreviewPanel.style.width = layout.width + 'px';
    miniPreviewPanel.style.height = layout.height + 'px';
    miniPreviewPanel.style.right = 'auto';
    miniPreviewPanel.style.maxWidth = '';
    setMiniPreviewLayoutToLocal(layout);
}

function updateMiniPreviewButton() {
    const btn = document.getElementById('btn-mini-pv');
    if (!btn) return;
    const on = !!miniPreviewEnabled;
    btn.classList.toggle('border-indigo-500', on);
    btn.classList.toggle('text-indigo-600', on);
    btn.classList.toggle('dark:text-indigo-300', on);
}

function applyMiniPreviewZoom() {
    if (!miniPreviewContent) bindMiniPreviewElements();
    if (!miniPreviewContent) return;
    const z = Math.max(0.5, Math.min(2.5, Number(miniPreviewZoom) || 1));
    miniPreviewZoom = z;
    miniPreviewContent.style.zoom = String(z);
    const zoomLabel = document.getElementById('mini-preview-zoom-label');
    if (zoomLabel) zoomLabel.textContent = Math.round(z * 100) + '%';
}

function miniPreviewAdjustZoom(delta) {
    miniPreviewZoom = (Number(miniPreviewZoom) || 1) + Number(delta || 0);
    applyMiniPreviewZoom();
}

function updateMiniPreviewFullscreenUi() {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    const btn = document.getElementById('btn-mini-preview-fullscreen');
    const closeBtn = document.getElementById('btn-mini-preview-close');
    if (btn) btn.textContent = miniPreviewFullscreen ? '축소' : '전체';
    if (closeBtn) closeBtn.textContent = '닫기';
    if (miniPreviewResizeHandle) miniPreviewResizeHandle.style.display = miniPreviewFullscreen ? 'none' : '';
    if (miniPreviewHeader) miniPreviewHeader.classList.toggle('cursor-move', !miniPreviewFullscreen);
}

function toggleMiniPreviewFullscreen(force) {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    if (!miniPreviewPanel || !miniPreviewEnabled) return;
    const next = (typeof force === 'boolean') ? !!force : !miniPreviewFullscreen;
    if (next === miniPreviewFullscreen) return;
    if (next) {
        miniPreviewLayoutBeforeFullscreen = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
        miniPreviewFullscreen = true;
        applyMiniPreviewLayout(null);
        updateMiniPreviewFullscreenUi();
        return;
    }
    miniPreviewFullscreen = false;
    applyMiniPreviewLayout(miniPreviewLayoutBeforeFullscreen || getMiniPreviewLayoutFromLocal() || {});
    miniPreviewLayoutBeforeFullscreen = null;
    updateMiniPreviewFullscreenUi();
}

function renderMiniPreviewContent() {
    if (!miniPreviewContent) bindMiniPreviewElements();
    if (!miniPreviewContent) return;
    if (!miniPreviewEnabled || !isEditMode) {
        miniPreviewRenderToken += 1;
        revokeObjectUrls(previewInternalImageObjectUrls);
        miniPreviewContent.innerHTML = '';
        return;
    }
    const token = ++miniPreviewRenderToken;
    const raw = String(currentMarkdown ?? '');
    revokeObjectUrls(previewInternalImageObjectUrls);
    resolveInternalMarkdownImagesForViewer(raw).then(function (resolvedRaw) {
        if (token !== miniPreviewRenderToken || !miniPreviewEnabled || !isEditMode || !miniPreviewContent) return;

        function finalizeMini(html) {
            if (token !== miniPreviewRenderToken || !miniPreviewEnabled || !isEditMode || !miniPreviewContent) return;
            miniPreviewContent.innerHTML = String(html || '');
            applyMiniPreviewZoom();
            try { hydrateInternalImagesInElement(miniPreviewContent, registerPreviewInternalObjectUrl); } catch (_) {}
            try {
                if (window.MermaidTRT && typeof window.MermaidTRT.renderIn === 'function') {
                    window.MermaidTRT.renderIn(miniPreviewContent).catch(function () {});
                }
            } catch (_) {}
        }

        try {
            const preprocessed = preprocessMarkdownForView(resolvedRaw);
            if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.renderMarkdownSafe === 'function') {
                MathRender.renderMarkdownSafe(
                    (typeof marked !== 'undefined' && marked.parse) ? marked : null,
                    preprocessed,
                    { fallbackText: resolvedRaw }
                ).then(function (html) {
                    finalizeMini(html || '');
                    try { if (MathRender && typeof MathRender.typesetElement === 'function') MathRender.typesetElement(miniPreviewContent); } catch (_) {}
                });
                return;
            }
            if (typeof marked === 'undefined' || !marked.parse) {
                finalizeMini('<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>');
                return;
            }
            finalizeMini(String(marked.parse(preprocessed) || ''));
        } catch (_) {
            finalizeMini('<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>');
        }
    }).catch(function () {
        if (token !== miniPreviewRenderToken || !miniPreviewEnabled || !isEditMode || !miniPreviewContent) return;
        miniPreviewContent.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
    });
}

function bindMiniPreviewInteractions() {
    if (miniPreviewDragBound) return;
    miniPreviewDragBound = true;
    if (!miniPreviewPanel) bindMiniPreviewElements();
    if (!miniPreviewPanel) return;

    if (miniPreviewHeader) {
        miniPreviewHeader.addEventListener('pointerdown', function (e) {
            if (miniPreviewFullscreen) return;
            const target = e.target;
            if (target && (target.closest('button') || target.closest('a') || target.closest('input'))) return;
            miniPreviewActivePointerId = e.pointerId;
            startMiniPreviewDrag(e.clientX, e.clientY);
            try { miniPreviewHeader.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });
        miniPreviewHeader.addEventListener('contextmenu', function (e) {
            if (miniPreviewDragging) e.preventDefault();
        });
    }

    if (miniPreviewResizeHandle) {
        miniPreviewResizeHandle.addEventListener('pointerdown', function (e) {
            if (miniPreviewFullscreen) return;
            const layout = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            miniPreviewActivePointerId = e.pointerId;
            miniPreviewResizing = true;
            miniPreviewStartX = e.clientX;
            miniPreviewStartY = e.clientY;
            miniPreviewStartW = layout.width;
            miniPreviewStartH = layout.height;
            try { miniPreviewResizeHandle.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
            e.stopPropagation();
        });
    }

    document.addEventListener('pointermove', function (e) {
        if (!miniPreviewEnabled || !miniPreviewPanel || miniPreviewPanel.classList.contains('hidden')) return;
        if (miniPreviewActivePointerId !== null && e.pointerId !== miniPreviewActivePointerId) return;
        if (miniPreviewDragging) {
            moveMiniPreviewDrag(e.clientX, e.clientY);
            e.preventDefault();
            return;
        }

        const hostRect = getMiniPreviewContainerRect();
        if (!hostRect) return;
        if (miniPreviewResizing) {
            const cur = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            const next = clampMiniPreviewLayout({
                left: cur.left,
                top: cur.top,
                width: miniPreviewStartW + (e.clientX - miniPreviewStartX),
                height: miniPreviewStartH + (e.clientY - miniPreviewStartY)
            });
            applyMiniPreviewLayout(next);
            e.preventDefault();
        }
    });

    function stopMiniPreviewPointer(e) {
        if (e && miniPreviewActivePointerId !== null && e.pointerId !== miniPreviewActivePointerId) return;
        if (miniPreviewHeader && e && miniPreviewDragging) {
            try { miniPreviewHeader.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        if (miniPreviewResizeHandle && e && miniPreviewResizing) {
            try { miniPreviewResizeHandle.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        miniPreviewDragging = false;
        miniPreviewResizing = false;
        miniPreviewActivePointerId = null;
    }

    document.addEventListener('pointerup', stopMiniPreviewPointer);
    document.addEventListener('pointercancel', stopMiniPreviewPointer);

    window.addEventListener('resize', function () {
        if (miniPreviewEnabled) applyMiniPreviewLayout(miniPreviewLayoutBeforeFullscreen || getMiniPreviewLayoutFromLocal() || {});
    });
}

function startMiniPreviewDrag(clientX, clientY) {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    if (!miniPreviewPanel) return;
    const panelRect = miniPreviewPanel.getBoundingClientRect();
    const hostRect = getMiniPreviewContainerRect();
    if (!hostRect) return;
    miniPreviewDragging = true;
    miniPreviewDragOffsetX = clientX - panelRect.left;
    miniPreviewDragOffsetY = clientY - panelRect.top;
}

function moveMiniPreviewDrag(clientX, clientY) {
    const hostRect = getMiniPreviewContainerRect();
    if (!hostRect) return;
    const cur = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
    const next = clampMiniPreviewLayout({
        left: clientX - hostRect.left - miniPreviewDragOffsetX,
        top: clientY - hostRect.top - miniPreviewDragOffsetY,
        width: cur.width,
        height: cur.height
    });
    applyMiniPreviewLayout(next);
}

function applyMiniPreviewVisibility() {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    if (!miniPreviewPanel) {
        updateMiniPreviewButton();
        return;
    }
    const show = !!(miniPreviewEnabled && isEditMode);
    miniPreviewPanel.classList.toggle('hidden', !show);
    if (show) {
        bindMiniPreviewInteractions();
        applyMiniPreviewLayout(miniPreviewLayoutBeforeFullscreen || getMiniPreviewLayoutFromLocal() || {});
        updateMiniPreviewFullscreenUi();
        applyMiniPreviewZoom();
        renderMiniPreviewContent();
    } else {
        updateMiniPreviewFullscreenUi();
        applyMiniPreviewZoom();
    }
    updateMiniPreviewButton();
}

function toggleMiniPreview() {
    if (!miniPreviewPanel) ensureMiniPreviewHtml();
    miniPreviewEnabled = !miniPreviewEnabled;
    setMiniPreviewEnabledToLocal(miniPreviewEnabled);
    applyMiniPreviewVisibility();
    if (miniPreviewEnabled) {
        mainRenderDirty = true;
        renderMiniPreviewContent();
    }
}

window.toggleMiniPreview = toggleMiniPreview;
window.toggleMiniPreviewFullscreen = toggleMiniPreviewFullscreen;
window.miniPreviewAdjustZoom = miniPreviewAdjustZoom;
window.MiniPreviewUI.ensure = ensureMiniPreviewHtml;

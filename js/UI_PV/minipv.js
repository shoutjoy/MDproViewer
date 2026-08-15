const MINI_PREVIEW_KEY = 'md_viewer_minipv_enabled';
const MINI_PREVIEW_LAYOUT_KEY = 'md_viewer_minipv_layout';
const MINI_PREVIEW_EDITOR_SYNC_KEY = 'md_viewer_minipv_editor_sync_enabled';
const MINI_PREVIEW_HTML = ''
    + '<div id="mini-preview-panel" class="hidden absolute top-2 right-2 w-[340px] max-w-[42vw] h-[68%] min-h-[220px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xl overflow-hidden no-print z-20">'
    + '<div id="mini-preview-header" class="flex items-center justify-between px-2 py-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-move touch-none select-none">'
    + '<span class="text-xs font-bold text-slate-700 dark:text-slate-200">miniPV</span>'
    + '<div id="mini-preview-actions" class="flex items-center gap-1">'
    + '<button type="button" id="btn-mini-preview-zoom-out" onclick="miniPreviewAdjustZoom(-0.1)" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">-</button>'
    + '<span id="mini-preview-zoom-label" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900">100%</span>'
    + '<button type="button" id="btn-mini-preview-zoom-in" onclick="miniPreviewAdjustZoom(0.1)" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">+</button>'
    + '<button type="button" id="btn-mini-preview-view-mode" onclick="toggleMiniPreviewViewMode()" aria-pressed="false" title="ToC 보기" class="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">ToC</button>'
    + '<button type="button" id="btn-mini-preview-sync-editor" onclick="toggleMiniPreviewEditorSync()" aria-pressed="true" title="ED → PV 연속 동기화: ON" class="text-[11px] px-1.5 py-0.5 rounded border border-indigo-500 bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white hover:bg-indigo-700 dark:hover:bg-indigo-600">ED</button>'
    + '<button type="button" id="btn-mini-preview-sync-pv" onclick="syncEditorScrollToMiniPreview()" title="PV → ED: miniPV 현재 위치로 에디터 이동" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-indigo-100 dark:active:bg-indigo-900">PV</button>'
    + '<button type="button" id="btn-mini-preview-fullscreen" data-compact-label="⛶" onclick="toggleMiniPreviewFullscreen()" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">전체</button>'
    + '<button type="button" id="btn-mini-preview-close" data-compact-label="×" onclick="toggleMiniPreview()" class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">닫기</button>'
    + '</div></div>'
    + '<div id="mini-preview-content" class="markdown-body mini-preview-content h-[calc(100%-34px)] overflow-auto p-3 text-[13px] leading-6 bg-white dark:bg-slate-900"></div>'
    + '<div id="mini-preview-resize-handle-left" title="왼쪽에서 너비 조절" class="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize bg-indigo-500/70 rounded-r z-10 touch-none"></div>'
    + '<div id="mini-preview-resize-handle" class="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize bg-indigo-500/70 rounded-tl"></div>'
    + '</div>';

let miniPreviewPanel = null;
let miniPreviewContent = null;
let miniPreviewHeader = null;
let miniPreviewResizeHandle = null;
let miniPreviewResizeHandleLeft = null;
let miniPreviewEnabled = false;
let miniPreviewDragBound = false;
let miniPreviewDragging = false;
let miniPreviewResizing = false;
let miniPreviewFullscreen = false;
let miniPreviewZoom = 1;
let miniPreviewViewMode = 'preview';
let miniPreviewEditorSyncEnabled = getMiniPreviewEditorSyncEnabledFromLocal();
let miniPreviewSyncTimer = null;
let miniPreviewDragOffsetX = 0;
let miniPreviewDragOffsetY = 0;
let miniPreviewStartX = 0;
let miniPreviewStartY = 0;
let miniPreviewStartW = 0;
let miniPreviewStartH = 0;
let miniPreviewStartLeft = 0;
let miniPreviewResizeMode = '';
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
    miniPreviewResizeHandleLeft = document.getElementById('mini-preview-resize-handle-left');
    if (miniPreviewHeader) {
        miniPreviewHeader.style.touchAction = 'none';
        miniPreviewHeader.style.userSelect = 'none';
        miniPreviewHeader.style.webkitUserSelect = 'none';
    }
    if (miniPreviewPanel) {
        updateMiniPreviewFullscreenUi();
        updateMiniPreviewSyncUi();
        updateMiniPreviewViewModeUi();
    }
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
    return fetch('./js/UI_PV/minipv.html?v=20260815-responsive-1', { cache: 'no-cache' })
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

function getMiniPreviewEditorSyncEnabledFromLocal() {
    try {
        const stored = localStorage.getItem(MINI_PREVIEW_EDITOR_SYNC_KEY);
        return stored === null ? true : stored === '1';
    } catch (_) {
        return true;
    }
}

function setMiniPreviewEditorSyncEnabledToLocal(enabled) {
    try {
        localStorage.setItem(MINI_PREVIEW_EDITOR_SYNC_KEY, enabled ? '1' : '0');
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
    scheduleMiniPreviewScrollSync(0);
}

function miniPreviewAdjustZoom(delta) {
    miniPreviewZoom = (Number(miniPreviewZoom) || 1) + Number(delta || 0);
    applyMiniPreviewZoom();
}

function updateMiniPreviewViewModeUi() {
    const button = document.getElementById('btn-mini-preview-view-mode');
    const editorSyncButton = document.getElementById('btn-mini-preview-sync-editor');
    const pvSyncButton = document.getElementById('btn-mini-preview-sync-pv');
    const tocMode = miniPreviewViewMode === 'toc';
    if (button) {
        button.textContent = tocMode ? '본문' : 'ToC';
        button.title = tocMode ? '내용 렌더링 미리보기로 전환' : 'ToC 보기로 전환';
        button.setAttribute('aria-pressed', tocMode ? 'true' : 'false');
        button.classList.toggle('is-active', tocMode);
    }
    [editorSyncButton, pvSyncButton].forEach(function (syncButton) {
        if (!syncButton) return;
        syncButton.disabled = tocMode;
        syncButton.setAttribute('aria-disabled', tocMode ? 'true' : 'false');
    });
    if (editorSyncButton && tocMode) editorSyncButton.title = '목차 보기에서는 스크롤 동기화를 사용하지 않습니다.';
    if (pvSyncButton && tocMode) pvSyncButton.title = '목차 보기에서는 스크롤 동기화를 사용하지 않습니다.';
    if (!tocMode) updateMiniPreviewSyncUi();
}

function toggleMiniPreviewViewMode(forceMode) {
    const requested = forceMode === 'toc' || forceMode === 'preview' ? forceMode : '';
    miniPreviewViewMode = requested || (miniPreviewViewMode === 'toc' ? 'preview' : 'toc');
    updateMiniPreviewViewModeUi();
    renderMiniPreviewContent();
}

function updateMiniPreviewSyncUi() {
    const btn = document.getElementById('btn-mini-preview-sync-editor');
    if (!btn) return;
    const on = !!miniPreviewEditorSyncEnabled;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'ED → PV 연속 동기화: ON' : 'ED → PV 연속 동기화: OFF';
    btn.classList.toggle('border-indigo-500', on);
    btn.classList.toggle('bg-indigo-600', on);
    btn.classList.toggle('text-white', on);
    btn.classList.toggle('dark:bg-indigo-500', on);
    btn.classList.toggle('dark:text-white', on);
    btn.classList.toggle('text-slate-600', !on);
    btn.classList.toggle('dark:text-slate-300', !on);
}

function syncMiniPreviewScrollToEditor() {
    if (miniPreviewViewMode !== 'preview') return;
    if (!miniPreviewEditorSyncEnabled || !miniPreviewEnabled || !isEditMode) return;
    if (!editorTextarea || !miniPreviewContent || !miniPreviewPanel || miniPreviewPanel.classList.contains('hidden')) return;
    const editorMax = Math.max(0, editorTextarea.scrollHeight - editorTextarea.clientHeight);
    const miniMax = Math.max(0, miniPreviewContent.scrollHeight - miniPreviewContent.clientHeight);
    const ratio = editorMax > 0 ? editorTextarea.scrollTop / editorMax : 0;
    miniPreviewContent.scrollTop = Math.round(miniMax * Math.max(0, Math.min(1, ratio)));
}

function scheduleMiniPreviewScrollSync(delayMs) {
    if (miniPreviewViewMode !== 'preview') return;
    if (!miniPreviewEditorSyncEnabled) return;
    if (miniPreviewSyncTimer !== null) {
        clearTimeout(miniPreviewSyncTimer);
        miniPreviewSyncTimer = null;
    }
    const delay = Math.max(0, Number(delayMs) || 0);
    if (delay > 0) {
        miniPreviewSyncTimer = setTimeout(function () {
            miniPreviewSyncTimer = null;
            syncMiniPreviewScrollToEditor();
        }, delay);
        return;
    }
    syncMiniPreviewScrollToEditor();
}

function toggleMiniPreviewEditorSync(force) {
    miniPreviewEditorSyncEnabled = typeof force === 'boolean' ? !!force : !miniPreviewEditorSyncEnabled;
    setMiniPreviewEditorSyncEnabledToLocal(miniPreviewEditorSyncEnabled);
    updateMiniPreviewSyncUi();
    if (miniPreviewEditorSyncEnabled) scheduleMiniPreviewScrollSync(0);
}

function syncEditorScrollToMiniPreview() {
    if (miniPreviewViewMode !== 'preview') return;
    if (!miniPreviewEnabled || !isEditMode) return;
    if (!editorTextarea || !miniPreviewContent || !miniPreviewPanel || miniPreviewPanel.classList.contains('hidden')) return;
    const miniMax = Math.max(0, miniPreviewContent.scrollHeight - miniPreviewContent.clientHeight);
    const editorMax = Math.max(0, editorTextarea.scrollHeight - editorTextarea.clientHeight);
    const ratio = miniMax > 0 ? miniPreviewContent.scrollTop / miniMax : 0;
    editorTextarea.scrollTop = Math.round(editorMax * Math.max(0, Math.min(1, ratio)));
}

function updateMiniPreviewFullscreenUi() {
    if (!miniPreviewPanel) bindMiniPreviewElements();
    const btn = document.getElementById('btn-mini-preview-fullscreen');
    const closeBtn = document.getElementById('btn-mini-preview-close');
    if (btn) btn.textContent = miniPreviewFullscreen ? '축소' : '전체';
    if (closeBtn) closeBtn.textContent = '닫기';
    if (miniPreviewResizeHandle) miniPreviewResizeHandle.style.display = miniPreviewFullscreen ? 'none' : '';
    if (miniPreviewResizeHandleLeft) miniPreviewResizeHandleLeft.style.display = miniPreviewFullscreen ? 'none' : '';
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

function prepareMiniPreviewResponsiveTables(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('table').forEach(function (table) {
        const headerRow = table.tHead && table.tHead.rows && table.tHead.rows[0];
        const headers = headerRow
            ? Array.prototype.map.call(headerRow.cells, function (cell) {
                return String(cell.textContent || '').trim();
            })
            : [];
        table.classList.toggle('mini-preview-responsive-table', headers.length > 0);
        Array.prototype.forEach.call(table.tBodies || [], function (body) {
            Array.prototype.forEach.call(body.rows || [], function (row) {
                let columnIndex = 0;
                Array.prototype.forEach.call(row.cells || [], function (cell) {
                    const label = headers[columnIndex] || ('열 ' + (columnIndex + 1));
                    cell.setAttribute('data-mini-table-label', label);
                    columnIndex += Math.max(1, Number(cell.colSpan) || 1);
                });
            });
        });
    });
}

function renderMiniPreviewToc(markdownText) {
    if (!miniPreviewContent) return;
    miniPreviewRenderToken += 1;
    revokeObjectUrls(previewInternalImageObjectUrls);
    if (typeof setHtmlDocumentMode === 'function') setHtmlDocumentMode(miniPreviewContent, false);
    miniPreviewContent.classList.add('mini-preview-toc-mode');
    miniPreviewContent.replaceChildren();

    const items = window.SidebarLeft && typeof window.SidebarLeft.parseTocItemsFromMarkdown === 'function'
        ? window.SidebarLeft.parseTocItemsFromMarkdown(String(markdownText || ''))
        : [];
    const nav = document.createElement('nav');
    nav.className = 'mini-preview-toc';
    nav.setAttribute('aria-label', '문서 목차');

    const heading = document.createElement('div');
    heading.className = 'mini-preview-toc-heading';
    heading.textContent = '문서 목차' + (items.length ? ' · ' + items.length : '');
    nav.appendChild(heading);

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'mini-preview-toc-empty';
        empty.textContent = '제목이 없습니다. Markdown 제목(# 제목)을 추가하면 여기에 표시됩니다.';
        nav.appendChild(empty);
        miniPreviewContent.appendChild(nav);
        applyMiniPreviewZoom();
        return;
    }

    items.forEach(function (item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mini-preview-toc-item mini-preview-toc-level-' + Math.max(1, Math.min(6, Number(item.level) || 1));
        button.style.setProperty('--mini-toc-indent', Math.max(0, (Number(item.level) - 1) * 14) + 'px');
        button.textContent = String(item.text || '');
        button.title = String(item.text || '');
        button.addEventListener('click', function () {
            if (typeof window.scrollToLine === 'function') window.scrollToLine(item.lineIndex);
        });
        nav.appendChild(button);
    });
    miniPreviewContent.appendChild(nav);
    applyMiniPreviewZoom();
}

function renderMiniPreviewContent() {
    if (!miniPreviewContent) bindMiniPreviewElements();
    if (!miniPreviewContent) return;
    if (!miniPreviewEnabled || !isEditMode) {
        miniPreviewRenderToken += 1;
        revokeObjectUrls(previewInternalImageObjectUrls);
        if (typeof setHtmlDocumentMode === 'function') setHtmlDocumentMode(miniPreviewContent, false);
        miniPreviewContent.classList.remove('mini-preview-toc-mode');
        miniPreviewContent.innerHTML = '';
        return;
    }
    if (miniPreviewViewMode === 'toc') {
        renderMiniPreviewToc(String(currentMarkdown ?? ''));
        return;
    }
    miniPreviewContent.classList.remove('mini-preview-toc-mode');
    const token = ++miniPreviewRenderToken;
    const raw = String(currentMarkdown ?? '');
    const snapshot = prepareMarkdownRenderSnapshot(raw);
    const renderRaw = snapshot.renderSource;
    const isCurrentMiniRender = function () {
        return token === miniPreviewRenderToken
            && miniPreviewEnabled
            && isEditMode
            && !!miniPreviewContent
            && isMarkdownRenderSnapshotCurrent(snapshot);
    };
    revokeObjectUrls(previewInternalImageObjectUrls);
    const htmlDocument = (typeof getRenderableHtmlDocument === 'function')
        ? getRenderableHtmlDocument(renderRaw)
        : null;
    if (htmlDocument !== null && typeof renderHtmlDocumentFrame === 'function') {
        renderHtmlDocumentFrame(miniPreviewContent, htmlDocument, {
            title: (typeof currentFileName !== 'undefined' && currentFileName) || 'HTML preview'
        });
        applyMiniPreviewZoom();
        scheduleMiniPreviewScrollSync(80);
        return;
    }

    function finalizeMini(html) {
        if (!isCurrentMiniRender()) return false;
        if (typeof setHtmlDocumentMode === 'function') setHtmlDocumentMode(miniPreviewContent, false);
        miniPreviewContent.innerHTML = String(html || '');
        prepareMiniPreviewResponsiveTables(miniPreviewContent);
        try {
            if (typeof applyMarkdownImageSizeHints === 'function') {
                applyMarkdownImageSizeHints(miniPreviewContent);
            }
        } catch (_) {}
        try {
            if (snapshot.features.hasDoiLinks && typeof applyDoiLinkTargets === 'function') {
                applyDoiLinkTargets(miniPreviewContent);
            }
        } catch (_) {}
        applyMiniPreviewZoom();
        try {
            if (snapshot.features.hasInternalImages) {
                hydrateInternalImagesInElement(miniPreviewContent, registerPreviewInternalObjectUrl);
            }
        } catch (_) {}
        try {
            if (snapshot.features.hasMermaid && window.MermaidTRT && typeof window.MermaidTRT.renderIn === 'function') {
                window.MermaidTRT.renderIn(miniPreviewContent)
                    .then(function () { scheduleMiniPreviewScrollSync(0); })
                    .catch(function () {});
            }
        } catch (_) {}
        scheduleMiniPreviewScrollSync(0);
        return true;
    }

    renderMarkdownSnapshotToHtml(snapshot).then(async function (html) {
        if (!finalizeMini(html || '')) return;
        try {
            if (snapshot.features.hasMath && MathRender && typeof MathRender.typesetElement === 'function') {
                if (typeof window.ensureMdMathEngineLoaded === 'function') await window.ensureMdMathEngineLoaded();
                if (!isCurrentMiniRender()) return;
                await MathRender.typesetElement(miniPreviewContent, {
                    silent: true,
                    retries: 20,
                    delay: 80
                });
                scheduleMiniPreviewScrollSync(0);
            }
        } catch (_) {}
    }).catch(function () {
        if (!isCurrentMiniRender()) return;
        if (typeof setHtmlDocumentMode === 'function') setHtmlDocumentMode(miniPreviewContent, false);
        miniPreviewContent.innerHTML = '<p>' + renderRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        scheduleMiniPreviewScrollSync(0);
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
            miniPreviewStartLeft = layout.left;
            miniPreviewResizeMode = 'corner';
            try { miniPreviewResizeHandle.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
            e.stopPropagation();
        });
    }

    if (miniPreviewResizeHandleLeft) {
        miniPreviewResizeHandleLeft.addEventListener('pointerdown', function (e) {
            if (miniPreviewFullscreen) return;
            const layout = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            miniPreviewActivePointerId = e.pointerId;
            miniPreviewResizing = true;
            miniPreviewStartX = e.clientX;
            miniPreviewStartW = layout.width;
            miniPreviewStartH = layout.height;
            miniPreviewStartLeft = layout.left;
            miniPreviewResizeMode = 'left';
            try { miniPreviewResizeHandleLeft.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
            e.stopPropagation();
        });
    }

    if (editorTextarea) {
        editorTextarea.addEventListener('scroll', function () {
            scheduleMiniPreviewScrollSync(0);
        }, { passive: true });
    }

    if (miniPreviewContent) {
        miniPreviewContent.addEventListener('load', function () {
            scheduleMiniPreviewScrollSync(0);
        }, true);
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
            if (miniPreviewResizeMode === 'left') {
                const rightEdge = miniPreviewStartLeft + miniPreviewStartW;
                const maxWidth = Math.max(240, rightEdge - 8);
                const width = Math.max(240, Math.min(miniPreviewStartW - (e.clientX - miniPreviewStartX), maxWidth));
                const next = clampMiniPreviewLayout({
                    left: rightEdge - width,
                    top: cur.top,
                    width: width,
                    height: cur.height
                });
                applyMiniPreviewLayout(next);
                e.preventDefault();
                return;
            }
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
        if (miniPreviewResizeHandleLeft && e && miniPreviewResizing) {
            try { miniPreviewResizeHandleLeft.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        miniPreviewDragging = false;
        miniPreviewResizing = false;
        miniPreviewResizeMode = '';
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
        updateMiniPreviewSyncUi();
        applyMiniPreviewZoom();
        renderMiniPreviewContent();
    } else {
        updateMiniPreviewFullscreenUi();
        updateMiniPreviewSyncUi();
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
window.toggleMiniPreviewViewMode = toggleMiniPreviewViewMode;
window.toggleMiniPreviewEditorSync = toggleMiniPreviewEditorSync;
window.syncEditorScrollToMiniPreview = syncEditorScrollToMiniPreview;
window.MiniPreviewUI.ensure = ensureMiniPreviewHtml;

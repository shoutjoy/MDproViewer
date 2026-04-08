// IndexedDB Logic
﻿// IndexedDB Logic
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 4;
let db;

const AI_SETTINGS_KEY = 'ai_settings';
const AI_PASSWORD_HASH = 'dc98e82fcfb4b165f5fa390d5ca61a9245a5be6ea70a4f00020ddff029afefba';
const ENTER_BUTTON_BR_KEY = 'md_viewer_enter_button_br';
const SELECTION_WRAP_KEY = 'md_viewer_selection_wrap_enabled';
const VIEW_MODE_EDIT_KEY = 'md_viewer_view_mode_edit_enabled';
const SETTINGS_SHORTCUTS_FOLD_KEY = 'md_viewer_settings_shortcuts_folded';
const AI_USE_FOLD_KEY = 'md_viewer_ai_use_folded';
const SHARE_SETTINGS_FOLD_KEY = 'md_viewer_share_settings_folded';
const GITHUB_SETTINGS_FOLD_KEY = 'md_viewer_github_settings_folded';

// State
let currentMarkdown = "";
let currentFileName = "untitled.md";
let currentFilePath = null;
let currentDbDocId = null;
let isEditMode = true;
let pageScale = 1.0;
let fontSize = 16;
document.documentElement.style.setProperty('--md-app-font-size', `${fontSize}px`);
let modalMode = 'link';
let movingDocId = null;
let previewPopupWindow = null;
let previewPopupScale = 1.0;
let previewPopupWidthScale = 1.0;
let previewPopupFontSize = 21;
let previewPopupRenderToken = 0;
let previewPopupMermaidLoadPromise = null;
let imageInsertCurrentDataUrl = '';
let imageInsertCurrentFileName = '';
let imageInsertSavedInternalId = '';
let imageInsertSavedInternalUrl = '';
let imageInsertSavedFingerprint = '';
let imageInsertChangedByCrop = false;
let imageInsertCropWindow = null;
let imageInsertCropBound = false;
let imageInsertDockRight = false;
let imageInsertDragBound = false;
let imageInsertDragging = false;
let imageInsertDragOffsetX = 0;
let imageInsertDragOffsetY = 0;
let imageInsertGalleryOpen = false;
let imageInsertGalleryObjectUrls = [];
let imageInsertGalleryDataUrlCache = new Map();
let scholarSearchDockRight = true;
let scholarSearchShrink = false;
let scholarSearchDragBound = false;
let scholarSearchDragging = false;
let scholarSearchDragOffsetX = 0;
let scholarSearchDragOffsetY = 0;
let highlightPopupDockRight = true;
let highlightPopupShrink = false;
let highlightPopupDragBound = false;
let highlightPopupDragging = false;
let highlightPopupDragOffsetX = 0;
let highlightPopupDragOffsetY = 0;
let highlightPopupDockTop = 80;
let highlightSelectionSyncBound = false;
let highlightPopupMsgBound = false;
let enterButtonInsertBr = false;
let selectionWrapEnabled = true;
let viewModeEditEnabled = false;
let templatePanelOpen = false;
let templatePanelCompact = false;
let templatePanelDragBound = false;
let templatePanelDragging = false;
let templatePanelDragOffsetX = 0;
let templatePanelDragOffsetY = 0;
let templatePanelMoved = false;
let templatePanelResized = false;
let templatePanelResizeBound = false;
let templatePanelResizing = false;
let templatePanelSavedWidth = '';
let templatePanelSavedHeight = '';
let html2pptPanelOpen = false;
let html2pptDockRight = true;
let html2pptDragBound = false;
let html2pptDragging = false;
let html2pptDragOffsetX = 0;
let html2pptDragOffsetY = 0;
let html2pptMoved = false;
let html2pptResizeBound = false;
let html2pptResizing = false;
let html2pptSavedWidth = '';
let html2pptSavedHeight = '';
let html2pptFullscreen = false;
let html2pptRestoreState = null;
let templateCustomList = [];
let scholarRefBootPromise = null;
let scholarRefInitDone = false;
let aiSidebarBootPromise = null;
let aiSidebarLoadAttempts = 0;
let viewClickMappedCaretPos = null;
let lastEditCaretPos = 0;
let viewerInternalImageObjectUrls = [];
let previewInternalImageObjectUrls = [];
let lastPersistedContent = '';

// Sidebar states
let isSidebarHidden = true;
let isSidebarCollapsed = false;

// Theme
const THEME_KEY = 'md_viewer_theme';
const EDITOR_LIGHT_KEY = 'md_viewer_editor_light';
const MINI_PREVIEW_KEY = 'md_viewer_minipv_enabled';
const MINI_PREVIEW_LAYOUT_KEY = 'md_viewer_minipv_layout';

const sidebar = document.getElementById('sidebar');
const viewerContainer = document.getElementById('viewer-container');
const viewer = document.getElementById('viewer');
const editorContainer = document.getElementById('content-viewport');
const editorTextarea = document.getElementById('viewer-edit-ta');
const miniPreviewPanel = document.getElementById('mini-preview-panel');
const miniPreviewContent = document.getElementById('mini-preview-content');
const miniPreviewHeader = document.getElementById('mini-preview-header');
const miniPreviewResizeHandle = document.getElementById('mini-preview-resize-handle');
const fileNameDisplay = document.getElementById('file-name-display');
const dropZone = document.getElementById('drop-zone');
const inputModal = document.getElementById('input-modal');

if (editorTextarea) {
    editorTextarea.addEventListener('paste', function () {
        receivedExternalContent = true;
    }, true);
}

// Sites component 
let pendingExternalContent = null;
let receivedExternalContent = false;
let notebookLmEqualsHrPreprocess = false;
let lastExternalOpenSignature = '';
const EXTERNAL_LOAD_TYPES = ['mdViewerLoad', 'notebooklm', 'notebooklm-export', 'loadMarkdown'];
const NOTEBOOKLM_ORIGINS = ['https://notebooklm.google.com', 'https://aistudio.google.com'];
const ROOT_FOLDER_NAME = 'ROOT';
const LOCAL_BOOT_DELETE_TITLES = new Set([
    'shoutjoy/mdlivedata',
    'shoutjoy/mdlivedata.md'
]);
const FOLDER_COLLAPSE_STATE_KEY = 'md_viewer_folder_collapse_state';
const STORAGE_SOURCE_TAB_KEY = 'md_viewer_storage_source_tab';
const GITHUB_DOC_EXT_RE = /\.(md|markdown|txt)$/i;
let folderCollapseState = {};
let currentStorageSourceTab = 'indb';
let miniPreviewEnabled = false;
let miniPreviewDragBound = false;
let miniPreviewDragging = false;
let miniPreviewResizing = false;
let miniPreviewDragOffsetX = 0;
let miniPreviewDragOffsetY = 0;
let miniPreviewStartX = 0;
let miniPreviewStartY = 0;
let miniPreviewStartW = 0;
let miniPreviewStartH = 0;
let miniPreviewRenderToken = 0;
let tableInsertPickerBuilt = false;
let math99PopupBound = false;
let math99PopupDragging = false;
let math99PopupResizing = false;
let math99PopupDragOffsetX = 0;
let math99PopupDragOffsetY = 0;
let math99PopupStartX = 0;
let math99PopupStartY = 0;
let math99PopupStartW = 0;
let math99PopupStartH = 0;

function loadFolderCollapseState() {
    try {
        const raw = localStorage.getItem(FOLDER_COLLAPSE_STATE_KEY);
        if (!raw) {
            folderCollapseState = {};
            return;
        }
        const parsed = JSON.parse(raw);
        folderCollapseState = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        folderCollapseState = {};
    }
}

function saveFolderCollapseState() {
    try {
        localStorage.setItem(FOLDER_COLLAPSE_STATE_KEY, JSON.stringify(folderCollapseState || {}));
    } catch (_) {}
}

function isFolderCollapsed(folderId) {
    const key = String(folderId || '');
    if (!key) return false;
    return !!(folderCollapseState && folderCollapseState[key] === true);
}

function toggleFolderCollapse(folderId) {
    const key = String(folderId || '');
    if (!key) return;
    folderCollapseState[key] = !isFolderCollapsed(key);
    saveFolderCollapseState();
    renderDBList();
}

function getStorageSourceTabFromLocal() {
    try {
        const v = String(localStorage.getItem(STORAGE_SOURCE_TAB_KEY) || '').trim().toLowerCase();
        return v === 'github' ? 'github' : 'indb';
    } catch (_) {
        return 'indb';
    }
}

function setStorageSourceTabToLocal(tab) {
    try {
        localStorage.setItem(STORAGE_SOURCE_TAB_KEY, tab === 'github' ? 'github' : 'indb');
    } catch (_) {}
}

function escapeHtmlText(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseGithubRepoInput(repoInput) {
    const raw = String(repoInput || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    const basePath = parts.slice(2).join('/').replace(/^\/+|\/+$/g, '');
    return {
        owner: owner,
        repo: repo,
        full: owner + '/' + repo,
        basePath: basePath,
        fullWithPath: basePath ? (owner + '/' + repo + '/' + basePath) : (owner + '/' + repo)
    };
}

function getGithubConfigFromSettings(settings) {
    const s = settings || {};
    const parsed = parseGithubRepoInput(s.githubRepo || '');
    return {
        enabled: !!s.githubEnabled,
        token: String(s.githubToken || '').trim(),
        branch: String(s.githubBranch || 'main').trim() || 'main',
        repoInput: String(s.githubRepo || '').trim(),
        repo: parsed ? parsed.full : '',
        owner: parsed ? parsed.owner : '',
        name: parsed ? parsed.repo : '',
        basePath: parsed ? parsed.basePath : '',
        repoWithPath: parsed ? parsed.fullWithPath : '',
        cacheDocs: Array.isArray(s.githubCacheDocs) ? s.githubCacheDocs : [],
        lastPulledAt: s.githubLastPulledAt || ''
    };
}

function getGithubLinkPathFromConfig(cfg) {
    const rawInput = String(cfg && cfg.repoInput ? cfg.repoInput : '').trim();
    const normalized = rawInput
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
    if (normalized) return normalized;
    const fallback = String(cfg && cfg.repo ? cfg.repo : '').trim().replace(/^\/+|\/+$/g, '');
    return fallback;
}

function setGithubFeedback(message, kind) {
    const el = document.getElementById('github-settings-feedback');
    if (!el) return;
    el.textContent = String(message || '');
    const t = String(kind || '').toLowerCase();
    if (t === 'error') el.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
    else if (t === 'ok') el.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
    else el.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
}

function toggleGithubSettingsSection() {
    const checked = !!(document.getElementById('ai-github-enabled') && document.getElementById('ai-github-enabled').checked);
    const folded = getGithubSettingsFoldedFromLocal();
    const body = document.getElementById('github-settings-body');
    if (!body) return;
    body.classList.toggle('hidden', !checked || folded);
}

function updateStorageSourceTabsUI() {
    const indbBtn = document.getElementById('tab-storage-indb');
    const ghBtn = document.getElementById('tab-storage-github');
    if (!indbBtn || !ghBtn) return;
    const active = 'px-2 py-1 text-xs font-semibold border border-indigo-500 rounded bg-indigo-600 text-white';
    const inactive = 'px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200';
    indbBtn.className = currentStorageSourceTab === 'indb' ? active : inactive;
    ghBtn.className = currentStorageSourceTab === 'github' ? active : inactive;
}

async function applyGithubUiState(settingsInput) {
    const settings = settingsInput || await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    const tabsWrap = document.getElementById('storage-source-tabs');
    const repoLink = document.getElementById('tab-storage-github-link');
    const syncBtn = document.getElementById('btn-github-sync');
    const syncLabel = document.getElementById('github-sync-label');

    if (tabsWrap) {
        const showTabs = !!cfg.enabled;
        tabsWrap.classList.toggle('hidden', !showTabs);
        tabsWrap.classList.toggle('flex', showTabs);
    }
    if (syncBtn) {
        const showSync = !!cfg.enabled;
        syncBtn.classList.toggle('hidden', !showSync);
        syncBtn.classList.toggle('flex', showSync);
    }
    if (syncLabel) {
        const labelTarget = cfg.repoWithPath || cfg.repo;
        syncLabel.textContent = labelTarget ? ('sync ' + labelTarget) : 'sync';
    }
    if (repoLink) {
        const linkPath = getGithubLinkPathFromConfig(cfg);
        const hasRepo = !!linkPath;
        repoLink.classList.toggle('hidden', !(cfg.enabled && hasRepo));
        if (cfg.enabled && hasRepo) {
            const url = 'https://github.com/' + linkPath;
            repoLink.href = url;
            repoLink.title = 'GitHub 저장소 열기: ' + linkPath;
        } else {
            repoLink.href = '#';
            repoLink.title = 'GitHub 저장소 열기';
        }
    }

    if (!cfg.enabled && currentStorageSourceTab === 'github') {
        currentStorageSourceTab = 'indb';
        setStorageSourceTabToLocal('indb');
    }
    updateStorageSourceTabsUI();
    if (activeSidebarTab === 'files') renderDBList();
}

function switchStorageSourceTab(tab) {
    const next = String(tab || '').toLowerCase() === 'github' ? 'github' : 'indb';
    const githubEnabled = !!(document.getElementById('ai-github-enabled') && document.getElementById('ai-github-enabled').checked);
    if (next === 'github' && !githubEnabled) return;
    currentStorageSourceTab = next;
    setStorageSourceTabToLocal(next);
    updateStorageSourceTabsUI();
    renderDBList();
}

function getNameFromPath(pathValue) {
    const p = String(pathValue || '').trim();
    if (!p) return '';
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || '';
}

function normalizeExternalOpenPayload(raw) {
    if (!raw) return { path: '', text: '', hasText: false, fileName: '' };
    if (typeof raw === 'string') return { path: String(raw), text: '', hasText: false, fileName: '' };
    const path = String(raw.path || raw.filePath || '').trim();
    const textCandidate = raw.text ?? raw.content ?? raw.markdown;
    const hasText = textCandidate !== undefined && textCandidate !== null;
    const text = hasText ? String(textCandidate) : '';
    const fileName = String(raw.fileName || raw.name || '').trim();
    return { path, text, hasText, fileName };
}

function buildExternalOpenSignature(payload) {
    const p = normalizeExternalOpenPayload(payload);
    return [p.path, p.fileName, p.hasText ? p.text.length : -1, p.hasText ? p.text.slice(0, 64) : ''].join('|');
}

async function tryLoadFromElectronSessionStorage() {
    try {
        const p = sessionStorage.getItem('web2electronOpenPath') || '';
        const t = sessionStorage.getItem('web2electronOpenText');
        if (!p && (t == null || t === '')) return null;
        sessionStorage.removeItem('web2electronOpenPath');
        sessionStorage.removeItem('web2electronOpenText');
        return {
            path: p || '',
            text: t == null ? '' : String(t),
            hasText: t != null
        };
    } catch (e) {
        return null;
    }
}

async function tryGetOpenedFileViaElectronApi() {
    if (!(window.electron && window.electron.ipcRenderer && typeof window.electron.ipcRenderer.invoke === 'function')) return null;
    try {
        const r = await window.electron.ipcRenderer.invoke('web2electron:get-opened-file');
        if (!r) return null;
        return normalizeExternalOpenPayload(r);
    } catch (e) {
        return null;
    }
}

async function applyIncomingOpenedFile(rawPayload, options) {
    const opts = options || {};
    let payload = normalizeExternalOpenPayload(rawPayload);

    if (!payload.hasText) {
        const viaApi = await tryGetOpenedFileViaElectronApi();
        if (viaApi && viaApi.hasText) payload = viaApi;
    }

    if (!payload.hasText) {
        if (opts.showMissingTextToast) showToast('File path was received, but body text was missing, so it could not be opened.');
        return false;
    }

    const sig = buildExternalOpenSignature(payload);
    if (sig && sig === lastExternalOpenSignature) return true;

    if (opts.askBeforeReplace) {
        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('Open canceled.');
            return false;
        }
    }

    const fileName = payload.fileName || getNameFromPath(payload.path) || currentFileName || 'document.md';
    setCurrentDocumentInfo(fileName, payload.path || null);
    updateContent(payload.text);
    markPersistedState();
    lastExternalOpenSignature = sig;
    if (opts.toastMessage) showToast(opts.toastMessage);
    return true;
}

window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'highlight-insert-markdown') {
        const markdown = String(d.markdown || d.content || d.text || '');
        if (!markdown.trim()) return;
        const frame = document.getElementById('highlight-popup-frame');
        const fromHighlightFrame = !!(frame && ev.source === frame.contentWindow);
        const openerOk = !!(window.opener && ev.source === window.opener);
        if (!fromHighlightFrame && !openerOk) return;
        if (!isEditMode && typeof toggleMode === 'function') toggleMode('edit');
        if (typeof insertLiteralAtCursor === 'function') {
            insertLiteralAtCursor(markdown);
            if (typeof showToast === 'function') showToast('Inserted highlight content into the document.');
        }
        return;
    }

    if (d.type === 'scholarToMDPaste') {
        const scholarNotebookLm = d.notebookLm !== false;
        const hasContent = d.content != null && String(d.content).length > 0;
        if (hasContent) {
            notebookLmEqualsHrPreprocess = scholarNotebookLm;
            applyScholarPaste(String(d.content));
            return;
            return;
        }
        if ((d.readClipboard || d.useClipboard) && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            navigator.clipboard.readText().then(function (text) {
                if (text != null && String(text).length) {
                    notebookLmEqualsHrPreprocess = scholarNotebookLm;
                    applyScholarPaste(String(text));
                }
            }).catch(function () {});
            return;
        }
        return;
    }

    const content = d.content ?? d.text ?? d.markdown;
    if (content === undefined || content === null) return;
    const typeOk = d.type && EXTERNAL_LOAD_TYPES.includes(String(d.type));
    const originOk = ev.origin && NOTEBOOKLM_ORIGINS.some(o => ev.origin.startsWith(o));
    const openerOk = window.opener && ev.source === window.opener;
    if (!typeOk && !originOk && !openerOk) return;
    const notebookLmSeparators = originOk
        || String(d.type) === 'notebooklm'
        || String(d.type) === 'notebooklm-export';
    const payload = {
        content: String(content),
        title: d.title ?? d.fileName ?? d.name ?? null,
        notebookLmSeparators
    };
    pendingExternalContent = payload;
    receivedExternalContent = true;
    if (typeof loadFromExternalContent === 'function') {
        loadFromExternalContent(payload.content, payload.title, { notebookLmSeparators: payload.notebookLmSeparators });
        if (typeof showToast === 'function') showToast("Content loaded from external source.");
    }
});

// Init DB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("DB Open Error");
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('documents')) {
                db.createObjectStore('documents', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('folders')) {
                db.createObjectStore('folders', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('autosave')) {
                db.createObjectStore('autosave', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('ai_settings')) {
                db.createObjectStore('ai_settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('images')) {
                db.createObjectStore('images', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('scholar_refs')) {
                db.createObjectStore('scholar_refs', { keyPath: 'id' });
            }
        };
    });
}

function syncSidebarAiTheme() {
    document.body.classList.toggle('theme-light', !document.documentElement.classList.contains('dark'));
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    syncSidebarAiTheme();
    lucide.createIcons();
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = saved === 'dark' || (!saved && prefersDark);
    if (useDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    syncSidebarAiTheme();
    applyEditorLightPreference();
}

function toggleEditorLightMode() {
    const vp = document.getElementById('content-viewport');
    if (!vp) return;
    const isLight = vp.classList.toggle('editor-light-mode');
    localStorage.setItem(EDITOR_LIGHT_KEY, isLight ? '1' : '');
    updateEditorLightButton();
    lucide.createIcons();
}

function applyEditorLightPreference() {
    const vp = document.getElementById('content-viewport');
    if (!vp) return;
    const want = localStorage.getItem(EDITOR_LIGHT_KEY) === '1';
    if (want) vp.classList.add('editor-light-mode');
    else vp.classList.remove('editor-light-mode');
    updateEditorLightButton();
}

function updateEditorLightButton() {
    const vp = document.getElementById('content-viewport');
    const btn = document.getElementById('btn-editor-light');
    const sun = document.getElementById('editor-light-icon-sun');
    const moon = document.getElementById('editor-light-icon-moon');
    const label = document.getElementById('editor-light-label');
    if (!vp || !btn) return;
    const isLight = vp.classList.contains('editor-light-mode');
    if (sun) {
        sun.classList.toggle('hidden', !isLight);
        sun.style.display = isLight ? '' : 'none';
    }
    if (moon) {
        moon.classList.toggle('hidden', isLight);
        moon.style.display = isLight ? 'none' : '';
    }
    if (label) label.textContent = isLight ? 'Editor Dark' : 'Editor Light';
    if (btn) btn.title = isLight ? 'Switch editor to dark mode' : 'Switch editor to light mode';
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
    if (!miniPreviewPanel) return;
    const layout = clampMiniPreviewLayout(layoutInput || getMiniPreviewLayoutFromLocal() || {});
    miniPreviewPanel.style.left = layout.left + 'px';
    miniPreviewPanel.style.top = layout.top + 'px';
    miniPreviewPanel.style.width = layout.width + 'px';
    miniPreviewPanel.style.height = layout.height + 'px';
    miniPreviewPanel.style.right = 'auto';
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

function renderMiniPreviewContent() {
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
            try { hydrateInternalImagesInElement(miniPreviewContent, registerPreviewInternalObjectUrl); } catch (_) {}
            try { if (typeof renderMathInMarkdownViewer === 'function') renderMathInMarkdownViewer(miniPreviewContent); } catch (_) {}
            try {
                if (window.MermaidTRT && typeof window.MermaidTRT.renderIn === 'function') {
                    window.MermaidTRT.renderIn(miniPreviewContent).catch(function () {});
                }
            } catch (_) {}
        }

        try {
            const preprocessed = preprocessMarkdownForView(resolvedRaw);
            if (typeof marked === 'undefined' || !marked.parse) {
                finalizeMini('<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>');
                return;
            }
            const mathProtected = _protectMathSegments(preprocessed);
            const out = marked.parse(mathProtected.text);
            if (out != null && typeof out.then === 'function') {
                out.then(function (h) {
                    finalizeMini(mathProtected.restoreHtml(h || ''));
                }).catch(function () {
                    finalizeMini('<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>');
                });
                return;
            }
            finalizeMini(mathProtected.restoreHtml(out || ''));
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
    if (!miniPreviewPanel) return;

    if (miniPreviewHeader) {
        miniPreviewHeader.addEventListener('mousedown', function (e) {
            const target = e.target;
            if (target && (target.closest('button') || target.closest('a') || target.closest('input'))) return;
            const panelRect = miniPreviewPanel.getBoundingClientRect();
            const hostRect = getMiniPreviewContainerRect();
            if (!hostRect) return;
            miniPreviewDragging = true;
            miniPreviewDragOffsetX = e.clientX - panelRect.left;
            miniPreviewDragOffsetY = e.clientY - panelRect.top;
            e.preventDefault();
        });
    }

    if (miniPreviewResizeHandle) {
        miniPreviewResizeHandle.addEventListener('mousedown', function (e) {
            const layout = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            miniPreviewResizing = true;
            miniPreviewStartX = e.clientX;
            miniPreviewStartY = e.clientY;
            miniPreviewStartW = layout.width;
            miniPreviewStartH = layout.height;
            e.preventDefault();
            e.stopPropagation();
        });
    }

    document.addEventListener('mousemove', function (e) {
        if (!miniPreviewEnabled || !miniPreviewPanel || miniPreviewPanel.classList.contains('hidden')) return;
        const hostRect = getMiniPreviewContainerRect();
        if (!hostRect) return;

        if (miniPreviewDragging) {
            const cur = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            const next = clampMiniPreviewLayout({
                left: e.clientX - hostRect.left - miniPreviewDragOffsetX,
                top: e.clientY - hostRect.top - miniPreviewDragOffsetY,
                width: cur.width,
                height: cur.height
            });
            applyMiniPreviewLayout(next);
            return;
        }

        if (miniPreviewResizing) {
            const cur = clampMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
            const next = clampMiniPreviewLayout({
                left: cur.left,
                top: cur.top,
                width: miniPreviewStartW + (e.clientX - miniPreviewStartX),
                height: miniPreviewStartH + (e.clientY - miniPreviewStartY)
            });
            applyMiniPreviewLayout(next);
        }
    });

    document.addEventListener('mouseup', function () {
        miniPreviewDragging = false;
        miniPreviewResizing = false;
    });

    window.addEventListener('resize', function () {
        if (miniPreviewEnabled) applyMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
    });
}

function applyMiniPreviewVisibility() {
    if (!miniPreviewPanel) return;
    const show = !!(miniPreviewEnabled && isEditMode);
    miniPreviewPanel.classList.toggle('hidden', !show);
    if (show) {
        bindMiniPreviewInteractions();
        applyMiniPreviewLayout(getMiniPreviewLayoutFromLocal() || {});
        renderMiniPreviewContent();
    }
    updateMiniPreviewButton();
}

function toggleMiniPreview() {
    miniPreviewEnabled = !miniPreviewEnabled;
    setMiniPreviewEnabledToLocal(miniPreviewEnabled);
    applyMiniPreviewVisibility();
    if (miniPreviewEnabled) {
        renderMarkdown();
    }
}

function relocateAiIntegrationSettingsIntoAiUse() {
    const card = document.getElementById('ai-link-settings-block');
    const slot = document.getElementById('ai-integration-settings-slot');
    if (!card || !slot) return;
    if (card.parentElement !== slot) slot.appendChild(card);
}

function initUserSettingsModule() {
    if (!window.UserSettingsModule || typeof window.UserSettingsModule.init !== 'function') return;
    window.UserSettingsModule.init({
        authRequestEmail: 'shoutjoy1@yonsei.ac.kr',
        getDb: function () { return db; },
        getAiSettings: getAiSettings,
        setAiSettings: setAiSettings,
        showToast: showToast,
        getIsEditMode: function () { return isEditMode; },
        getEditorTextarea: function () { return editorTextarea; },
        onEditorChanged: function () {
            currentMarkdown = editorTextarea.value;
            performAutoSave();
            if (activeSidebarTab === 'toc') renderTOC();
        }
    });
}

window.onload = async () => {
    try {
        initTheme();
        initSettings();
        miniPreviewEnabled = getMiniPreviewEnabledFromLocal();
        updateMiniPreviewButton();
        initMacroFeature();
        initUserSettingsModule();
        relocateAiIntegrationSettingsIntoAiUse();
        lucide.createIcons();
        toggleMode('edit');

        await initDB();
        loadFolderCollapseState();
        currentStorageSourceTab = getStorageSourceTabFromLocal();
        updateStorageSourceTabsUI();
        await ensureRootFolder();
        await cleanupBootBlockedDocuments();
        renderDBList();

        if (pendingExternalContent) {
            loadFromExternalContent(pendingExternalContent.content, pendingExternalContent.title, {
                notebookLmSeparators: !!pendingExternalContent.notebookLmSeparators
            });
            pendingExternalContent = null;
            if (typeof showToast === 'function') showToast("Content loaded from external source.");
        } else {
            const sessionOpened = await tryLoadFromElectronSessionStorage();
            if (sessionOpened && sessionOpened.hasText) {
                const loaded = await applyIncomingOpenedFile(sessionOpened, { askBeforeReplace: false, toastMessage: 'Opened external file.' });
                if (loaded) receivedExternalContent = true;
            }
        }

        if (!pendingExternalContent && !receivedExternalContent) {
            const viaElectronApi = await tryGetOpenedFileViaElectronApi();
            if (viaElectronApi && viaElectronApi.hasText) {
                await applyIncomingOpenedFile(viaElectronApi, { askBeforeReplace: false, toastMessage: 'Loaded initial file.' });
                receivedExternalContent = true;
            }
        }

        if (!receivedExternalContent) {
            const urlContent = tryLoadFromUrl();
            if (!urlContent) updateContent('');
        }

        if (editorTextarea && currentMarkdown !== editorTextarea.value) {
            editorTextarea.value = currentMarkdown;
        }
        renderMarkdown();
        renderTOC();
        markPersistedState();

        if (isEditMode && editorTextarea) editorTextarea.focus();

        if (sidebar) sidebar.style.display = 'none';

        await ensureScholarRefReady();

        initAiVisibility();

    window.addEventListener('electron-open-file', async function (ev) {
        const detail = ev && ev.detail ? ev.detail : null;
        await applyIncomingOpenedFile(detail, {
            askBeforeReplace: true,
            toastMessage: 'Opened external file.',
            showMissingTextToast: true
        });
    });

    if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.on('open-external-file', async (event, data) => {
            await applyIncomingOpenedFile(data, {
                askBeforeReplace: true,
                toastMessage: 'Opened external file.',
                showMissingTextToast: true
            });
        });
        window.electron.ipcRenderer.invoke('get-initial-file').then(function (data) {
            applyIncomingOpenedFile(data, { askBeforeReplace: false, toastMessage: 'Loaded initial file.' });
        }).catch(function () {});
    }

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.add('drag-over');
    });

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) await readFile(file);
    });

    if (editorTextarea) editorTextarea.addEventListener('input', () => {
        currentMarkdown = editorTextarea.value;
        performAutoSave();
        updatePreviewPopupContent();
        if (miniPreviewEnabled) renderMarkdown();
        if (activeSidebarTab === 'toc') renderTOC();
        if (window.GoogleDocs && typeof window.GoogleDocs.handleEditorChanged === 'function') {
            window.GoogleDocs.handleEditorChanged();
        }
    });
    if (editorTextarea) {
        editorTextarea.addEventListener('select', syncFindInputFromEditorSelectionIfNeeded);
        editorTextarea.addEventListener('keyup', syncFindInputFromEditorSelectionIfNeeded);
        editorTextarea.addEventListener('mouseup', syncFindInputFromEditorSelectionIfNeeded);
    }
    document.addEventListener('paste', function (e) {
        const modal = document.getElementById('image-insert-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') >= 0) {
                const file = items[i].getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = function () {
                    imageInsertCurrentDataUrl = String(reader.result || '');
                    imageInsertCurrentFileName = file.name || ('pasted_' + Date.now() + '.png');
                    clearImageInsertInternalSavedState();
                    imageInsertChangedByCrop = false;
                    setImageInsertPreview(imageInsertCurrentDataUrl);
                    renderImageInsertInternalInfo();
                    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
                };
                reader.readAsDataURL(file);
                e.preventDefault();
                break;
            }
        }
    });
    const findInput = document.getElementById('find-input');
    if (findInput) {
        findInput.addEventListener('input', function () {
            lastFindIndex = -1;
        });
    }
    const editToolsEl = document.getElementById('edit-tools');
    if (editToolsEl) {
        editToolsEl.addEventListener('click', function (e) {
            if (isEditMode || !viewModeEditEnabled) return;
            const target = e && e.target && e.target.closest ? e.target.closest('button') : null;
            if (!target) return;
            const vm = window.ViewModeEditTRT;
            if (!vm || typeof vm.parseToolbarAction !== 'function') return;
            const action = vm.parseToolbarAction(target);
            if (!action || !action.mutate) return;
            if (e) {
                if (typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof e.stopPropagation === 'function') e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            }
            const selectedInView = typeof vm.getViewerSelectedText === 'function'
                ? vm.getViewerSelectedText({
                    viewer: viewer,
                    isEditMode: isEditMode,
                    enabled: viewModeEditEnabled
                })
                : '';
            if (typeof vm.applyToolbarAction === 'function' && editorTextarea) {
                const text = String(editorTextarea.value || currentMarkdown || '');
                const hintPos = (function () {
                    const fromClick = Number(viewClickMappedCaretPos);
                    if (Number.isFinite(fromClick) && fromClick >= 0) return Math.max(0, Math.min(fromClick, text.length));
                    if (viewerContainer) {
                        const ratio = getScrollRatio(viewerContainer);
                        return Math.max(0, Math.min(getMarkdownPositionFromRatio(ratio), text.length));
                    }
                    return Math.max(0, Math.min(Number(lastEditCaretPos) || 0, text.length));
                })();
                const applied = vm.applyToolbarAction({
                    action: action,
                    selectedText: selectedInView,
                    sourceText: text,
                    hintPos: hintPos,
                    enterButtonInsertBr: enterButtonInsertBr,
                    tidySeparatorSpacing: tidySeparatorSpacing
                });
                if (applied && applied.changed && typeof applied.text === 'string') {
                    editorTextarea.value = applied.text;
                    currentMarkdown = applied.text;
                    lastEditCaretPos = Math.max(0, Math.min(Number(applied.caretPos) || 0, applied.text.length));
                    performAutoSave();
                    if (activeSidebarTab === 'toc') renderTOC();
                    renderMarkdown();
                    requestAnimationFrame(function () {
                        if (isEditMode || !viewerContainer) return;
                        const ratio = getMarkdownRatioFromCharPos(lastEditCaretPos);
                        setScrollRatio(viewerContainer, ratio);
                    });
                    return;
                }
            }
            viewClickMappedCaretPos = Math.max(0, Number(lastEditCaretPos) || 0);
            toggleMode('edit');
            if (editorTextarea && selectedInView) {
                const text = String(editorTextarea.value || '');
                const hintPos = Math.max(0, Math.min(Number(editorTextarea.selectionStart) || 0, text.length));
                const found = vm.findNearestOccurrence(text, selectedInView, hintPos);
                if (found >= 0) {
                    editorTextarea.focus();
                    editorTextarea.setSelectionRange(found, found + selectedInView.length);
                    lastEditCaretPos = found;
                }
            }
            if (typeof vm.executeParsedAction === 'function') vm.executeParsedAction(action);
            if (editorTextarea) lastEditCaretPos = Math.max(0, Number(editorTextarea.selectionStart) || 0);
            requestAnimationFrame(function () {
                if (!isEditMode || !editorTextarea) return;
                try { editorTextarea.focus(); } catch (err) {}
            });
        }, true);
    }
    if (viewer) {
        viewer.addEventListener('mousedown', function (e) {
            if (isEditMode || !viewerContainer) return;
            const rect = viewer.getBoundingClientRect();
            const y = (e.clientY - rect.top) + viewerContainer.scrollTop;
            const ratio = clamp01(y / Math.max(1, viewer.scrollHeight));
            viewClickMappedCaretPos = getMarkdownPositionFromRatio(ratio);
        });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        const isAltGraph = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
        if (window.EditorRule && typeof window.EditorRule.handleSelectionWrapByTypedPair === 'function') {
            const wrapped = window.EditorRule.handleSelectionWrapByTypedPair(e, {
                selectionWrapEnabled: selectionWrapEnabled,
                isEditMode: isEditMode,
                editorTextarea: editorTextarea,
                onAfterApply: function () {
                    currentMarkdown = editorTextarea.value;
                    performAutoSave();
                    if (activeSidebarTab === 'toc') renderTOC();
                }
            });
            if (wrapped) return;
        }
        // Ctrl + Alt + 1, 2, 3, 4, 5 for Headings
        if (e.ctrlKey && e.altKey && (e.code === 'Digit1' || e.key === '1')) { e.preventDefault(); applyHeading(1); return; }
        if (e.ctrlKey && e.altKey && (e.code === 'Digit2' || e.key === '2')) { e.preventDefault(); applyHeading(2); return; }
        if (e.ctrlKey && e.altKey && (e.code === 'Digit3' || e.key === '3')) { e.preventDefault(); applyHeading(3); return; }
        if (e.ctrlKey && e.altKey && (e.code === 'Digit4' || e.key === '4')) { e.preventDefault(); applyHeading(4); return; }
        if (e.ctrlKey && e.altKey && (e.code === 'Digit5' || e.key === '5')) { e.preventDefault(); applyHeading(5); return; }
        // Alt + 1 for Edit mode
        if (e.altKey && !e.ctrlKey && !isAltGraph && (e.code === 'Digit1' || e.key === '1')) {
            e.preventDefault();
            if (!isEditMode) toggleMode('edit');
            return;
        }
        // Alt + 2 for View mode
        if (e.altKey && !e.ctrlKey && !isAltGraph && (e.code === 'Digit2' || e.key === '2')) {
            e.preventDefault();
            if (isEditMode) toggleMode('view');
            return;
        }
        // Alt + 4 for toggling dark/light mode
        if (e.altKey && !e.ctrlKey && !isAltGraph && (e.code === 'Digit4' || e.key === '4')) {
            e.preventDefault();
            toggleTheme();
            showToast("Theme changed.");
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'KeyL' || e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            openTextStyleModal();
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            openScholarSearchModal();
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'Digit5' || e.key === '5')) {
            e.preventDefault();
            insertListAtSelection('bullet');
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'Digit6' || e.key === '6')) {
            e.preventDefault();
            insertListAtSelection('number');
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            insertAtCursor('code');
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && !isAltGraph && (e.code === 'KeyM' || e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            insertAtCursor('mermaid');
            return;
        }
        if (e.shiftKey && e.altKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            if (typeof window.insertUserInfoAtCursor === 'function') window.insertUserInfoAtCursor();
            return;
        }
        if (e.shiftKey && e.altKey && !e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
            e.preventDefault();
            convertSelectionMarkdownToHtml();
            return;
        }
        if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            tidySeparatorSpacingInEditor();
            return;
        }
        if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === 'e' || e.key === 'E')) {
            e.preventDefault();
            insertFootnoteTemplate();
            return;
        }
        if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'Enter' || e.key === 'Enter')) {
            e.preventDefault();
            insertLiteralAtCursor('<br>');
            return;
        }
        if (e.ctrlKey && e.shiftKey && !e.altKey && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
            e.preventDefault();
            insertLiteralAtCursor('&nbsp;');
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.code === 'Digit7' || e.key === '7')) {
            e.preventDefault();
            convertSelectionPatternToTable();
            return;
        }
        if (e.ctrlKey && e.key === '7') {
            e.preventDefault();
            adjustPageScale(-0.1);
            return;
        }
        if (e.ctrlKey && e.key === '8') {
            e.preventDefault();
            adjustPageScale(0.1);
            return;
        }
        if (e.ctrlKey && e.key === '9') {
            e.preventDefault();
            adjustFontSize(-1);
            return;
        }
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            adjustFontSize(1);
            return;
        }
        // Ctrl + H for Find/Replace
        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            const bar = document.getElementById('find-replace-bar');
            if (bar && bar.classList.contains('hidden')) {
                openFindReplace();
            } else if (bar) {
                closeFindReplace();
            }
            return;
        }
        if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            if (isEditMode && editorTextarea) {
                insertAtCursor('bold');
            } else {
                applyInlineFormatFromViewerSelection('bold');
            }
            return;
        }
        if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            if (isEditMode && editorTextarea) {
                insertAtCursor('italic');
            } else {
                applyInlineFormatFromViewerSelection('italic');
            }
            return;
        }
        const isSaveModifier = e.ctrlKey || e.metaKey;
        if (isSaveModifier && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (e.shiftKey) saveFileAs();
            else saveCurrentFile();
            return;
        }
        if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            let handledBySnapshot = false;
            if (e.shiftKey) {
                const redone = document.execCommand('redo');
                if (!redone) handledBySnapshot = redoFromReplaceStack();
            } else {
                const undone = document.execCommand('undo');
                if (!undone) handledBySnapshot = undoFromReplaceStack();
            }
            if (handledBySnapshot) return;
            setTimeout(() => {
                currentMarkdown = editorTextarea.value;
                renderMarkdown();
                if (activeSidebarTab === 'toc') renderTOC();
                performAutoSave();
            }, 10);
            return;
        }
        if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            const redone = document.execCommand('redo');
            if (!redone && redoFromReplaceStack()) return;
            setTimeout(() => {
                currentMarkdown = editorTextarea.value;
                renderMarkdown();
                if (activeSidebarTab === 'toc') renderTOC();
                performAutoSave();
            }, 10);
            return;
        }
        // Line Navigation & Modification
        if (isEditMode && e.altKey) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveLineUp();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.shiftKey) {
                    copyLineDown();
                } else {
                    moveLineDown();
                }
            }
        }
    });
    window.addEventListener('beforeunload', closePreviewPopupWindow);
    window.addEventListener('beforeunload', function (e) {
        if (!isDocumentDirty()) return;
        e.preventDefault();
        e.returnValue = '';
    });
    } catch (e) {
        console.error('Initialization failed.', e);
        if (typeof showToast === 'function') showToast('Initialization failed. Please refresh and try again.');
    }
};

// --- Core Functions ---
function updateContent(md) {
    notebookLmEqualsHrPreprocess = false;
    currentMarkdown = md;
    if (editorTextarea) editorTextarea.value = md;
    renderMarkdown();
    renderTOC();
    updatePreviewPopupContent();
    if (window.GoogleDocs && typeof window.GoogleDocs.handleEditorChanged === 'function') {
        window.GoogleDocs.handleEditorChanged();
    }
}

function syncCurrentMarkdownFromEditor() {
    if (editorTextarea && typeof editorTextarea.value === 'string') {
        currentMarkdown = editorTextarea.value;
    }
}

function markPersistedState() {
    syncCurrentMarkdownFromEditor();
    lastPersistedContent = String(currentMarkdown ?? '');
}

function isDocumentDirty() {
    syncCurrentMarkdownFromEditor();
    return String(currentMarkdown ?? '') !== String(lastPersistedContent ?? '');
}

async function confirmSaveBeforeOpeningAnotherFile() {
    const hasOpenedDocument = !!(
        (currentFilePath && String(currentFilePath).trim())
        || (currentFileName && String(currentFileName).trim().toLowerCase() !== 'untitled.md')
        || (currentMarkdown && String(currentMarkdown).trim().length > 0)
    );
    if (!hasOpenedDocument) return true;
    let action = 'cancel';
    if (window.ExtendFiles && typeof window.ExtendFiles.showCloseActionDialog === 'function') {
        action = await window.ExtendFiles.showCloseActionDialog();
    } else {
        const shouldSave = window.confirm('A document is currently open. Press OK to export before opening another file, or Cancel to stop.');
        action = shouldSave ? 'export' : 'cancel';
    }
    if (action === 'cancel') return false;
    if (action === 'pass') return true;
    if (action === 'indb') return await saveCurrentToInDbAuto();
    if (action === 'export') return await saveCurrentFile();
    return false;
}

async function saveCurrentToInDbAuto() {
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return false;
    }
    syncCurrentMarkdownFromEditor();
    const baseTitle = String((currentFileName || 'Untitled').replace(/\.md$/i, '')).trim() || 'Untitled';
    const docs = await new Promise(function (resolve) {
        const req = db.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
        req.onerror = function () { resolve([]); };
    });
    const title = typeof getNextIndexedDbTitle === 'function'
        ? getNextIndexedDbTitle(baseTitle, docs)
        : baseTitle;
    const doc = {
        id: 'doc_' + Date.now(),
        title: title,
        content: String(currentMarkdown || ''),
        folderId: 'root',
        updatedAt: new Date()
    };
    await new Promise(function (resolve, reject) {
        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put(doc);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error('Failed to save to inDB.')); };
    });
    renderDBList();
    if (isSidebarHidden) toggleSidebarVisibility();
    markPersistedState();
    showToast('Saved to inDB.');
    return true;
}

function preprocessStandaloneHrAfterHardBreak(raw) {
    const lines = String(raw ?? '').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isStandaloneHr = /^([-*_])(?:\s*\1){2,}$/.test(trimmed);
        if (!isStandaloneHr) {
            out.push(line);
            continue;
        }
        const prevLine = out.length ? out[out.length - 1] : '';
        const prevTrimmed = prevLine.trim();
        const prevHasHardBreak = /(?: {2,}|\\)$/.test(prevLine);
        if (prevHasHardBreak && prevTrimmed) {
            out.push('');
        }
        out.push(line);
        const nextLine = lines[i + 1] ?? '';
        if (prevHasHardBreak && nextLine.trim()) {
            out.push('');
        }
    }
    return out.join('\n');
}

function normalizeMatrixRowBreaksInMath(inner) {
    const text = String(inner ?? '');
    const hasMatrixEnv = /\\begin\{(?:[pbvBV]?matrix|matrix|array|aligned|cases)\}/.test(text);
    if (!hasMatrixEnv) return text;
    return text.replace(/(^|[^\\])\\\\([ \t]*\n)/g, function (_, prefix, tail) {
        return String(prefix || '') + '\\\\\\\\' + String(tail || '\n');
    });
}

function preprocessMultilineInlineMathToDisplay(raw) {
    const src = String(raw ?? '');
    if (!src.includes('$')) return src;
    let out = '';
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch !== '$') {
            out += ch;
            i += 1;
            continue;
        }
        const prev = i > 0 ? src[i - 1] : '';
        const next = i + 1 < src.length ? src[i + 1] : '';
        if (prev === '\\' || next === '$') {
            out += ch;
            i += 1;
            continue;
        }
        let j = i + 1;
        let close = -1;
        while (j < src.length) {
            if (src[j] === '$' && src[j - 1] !== '\\' && src[j + 1] !== '$') {
                close = j;
                break;
            }
            j += 1;
        }
        if (close === -1) {
            out += ch;
            i += 1;
            continue;
        }
        const inner = normalizeMatrixRowBreaksInMath(src.slice(i + 1, close));
        const shouldDisplay = inner.includes('\n');
        if (shouldDisplay) out += '$$' + inner + '$$';
        else out += '$' + inner + '$';
        i = close + 1;
    }
    return out;
}

function preprocessDisplayMathMatrixRowBreaks(raw) {
    let src = String(raw ?? '');
    src = src.replace(/\$\$([\s\S]*?)\$\$/g, function (_, inner) {
        return '$$' + normalizeMatrixRowBreaksInMath(inner) + '$$';
    });
    src = src.replace(/\\\[([\s\S]*?)\\\]/g, function (_, inner) {
        return '\\[' + normalizeMatrixRowBreaksInMath(inner) + '\\]';
    });
    return src;
}

function _escapeHtmlForMathSegment(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _protectMathSegments(md) {
    const src = String(md || '');
    const chunks = src.split(/(```[\s\S]*?```)/g);
    const slots = [];

    function protectChunk(text) {
        const s = String(text || '');
        const out = [];
        let i = 0;

        function pushSlot(seg) {
            const token = '@@MATHSEG_' + slots.length + '@@';
            slots.push(seg);
            out.push(token);
        }

        while (i < s.length) {
            if (s[i] === '$' && s[i + 1] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                let k = i + 2;
                let end = -1;
                while (k < s.length - 1) {
                    if (s[k] === '$' && s[k + 1] === '$' && s[k - 1] !== '\\') { end = k; break; }
                    k += 1;
                }
                if (end >= 0) {
                    pushSlot(s.slice(i, end + 2));
                    i = end + 2;
                    continue;
                }
            }
            if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                let k = i + 1;
                let end = -1;
                while (k < s.length) {
                    if (s[k] === '$' && s[k - 1] !== '\\') { end = k; break; }
                    k += 1;
                }
                if (end >= 0) {
                    pushSlot(s.slice(i, end + 1));
                    i = end + 1;
                    continue;
                }
            }
            if (s.slice(i, i + 2) === '\\[') {
                const end = s.indexOf('\\]', i + 2);
                if (end >= 0) {
                    pushSlot(s.slice(i, end + 2));
                    i = end + 2;
                    continue;
                }
            }
            if (s.slice(i, i + 2) === '\\(') {
                const end = s.indexOf('\\)', i + 2);
                if (end >= 0) {
                    pushSlot(s.slice(i, end + 2));
                    i = end + 2;
                    continue;
                }
            }
            out.push(s[i]);
            i += 1;
        }

        return out.join('');
    }

    const protectedText = chunks.map(function (c) {
        return /^```[\s\S]*```$/.test(c) ? c : protectChunk(c);
    }).join('');

    return {
        text: protectedText,
        restoreHtml: function (html) {
            let out = String(html || '');
            for (let i = 0; i < slots.length; i += 1) {
                const token = '@@MATHSEG_' + i + '@@';
                out = out.split(token).join(_escapeHtmlForMathSegment(slots[i]));
            }
            return out;
        }
    };
}

function normalizeFootnoteId(label) {
    const base = String(label ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^\\w\\-\\uAC00-\\uD7A3]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || 'fn';
}

function preprocessFootnotesForView(raw) {
    const source = String(raw ?? '')
        .replace(/\n*<div class="md-footnotes">[\s\S]*?<\/div>\s*/gi, '\n')
        .replace(/<sup class="md-footnote-ref">\s*<a[^>]*>\[[^\]]+\]<\/a>\s*<\/sup>/gi, '');
    if (!source.includes('[^')) return source;

    const lines = source.split('\n');
    const defs = [];
    const body = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
        if (!m) {
            body.push(line);
            continue;
        }

        const label = String(m[1] || '').trim();
        const contentLines = [String(m[2] || '')];
        let j = i + 1;
        while (j < lines.length && /^(?:\t| {2,}).+/.test(lines[j])) {
            contentLines.push(lines[j].replace(/^(?:\t| {2,})/, ''));
            j += 1;
        }
        i = j - 1;
        defs.push({
            label: label,
            id: normalizeFootnoteId(label),
            content: contentLines.join('\n').trim()
        });
    }

    if (defs.length === 0) return source;

    const byLabel = new Map();
    for (let i = 0; i < defs.length; i++) {
        if (!byLabel.has(defs[i].label)) byLabel.set(defs[i].label, defs[i]);
    }

    const bodyText = body.join('\n').replace(/\[\^([^\]]+)\]/g, function (full, label) {
        const key = String(label || '').trim();
        const hit = byLabel.get(key);
        if (!hit) return full;
        const id = hit.id;
        return '<sup class="md-footnote-ref"><a href="#md-footnote-' + id + '" id="md-footnote-ref-' + id + '">[' + key + ']</a></sup>';
    });

    const items = defs.map(function (d) {
        const content = (d.content || 'Footnote content.')
            .replace(/^<span\b[^>]*>/i, '')
            .replace(/<\/span>\s*$/i, '')
            .replace(/\s*<a class="md-footnote-backref"[^>]*>[\s\S]*?<\/a>\s*$/i, '')
            .trim() || 'Footnote content.';
        return '<li id="md-footnote-' + d.id + '">' + content + ' <a class="md-footnote-backref" href="#md-footnote-ref-' + d.id + '">[back]</a></li>';
    }).join('\n');

    const footnotes = '\n\n<div class="md-footnotes">\n<hr>\n<ol>\n' + items + '\n</ol>\n</div>\n';
    return bodyText + footnotes;
}
function preprocessMarkdownForView(raw) {
    let s = String(raw ?? '');
    s = preprocessMultilineInlineMathToDisplay(s);
    s = preprocessDisplayMathMatrixRowBreaks(s);
    s = preprocessFootnotesForView(s);
    if (typeof specialTRT !== 'undefined' && typeof specialTRT.prepareForRender === 'function') {
        s = specialTRT.prepareForRender(s);
    }
    s = preprocessStandaloneHrAfterHardBreak(s);
    if (typeof preprocessNumericRangeTilde === 'function') {
        s = preprocessNumericRangeTilde(s);
    }
    if (typeof preprocessLongEqualsLineBreaks === 'function') {
        s = preprocessLongEqualsLineBreaks(s);
    }
    if (notebookLmEqualsHrPreprocess && typeof preprocessNotebookLmEqualsToHr === 'function') {
        s = preprocessNotebookLmEqualsToHr(s);
    }
    if (typeof MarkdownBold !== 'undefined' && MarkdownBold.preprocessBold) {
        s = MarkdownBold.preprocessBold(s) || s;
    }
    return s;
}

function bindFootnoteLinkNavigation() {
    if (!viewer || viewer.__footnoteLinkBound) return;
    viewer.__footnoteLinkBound = true;
    viewer.addEventListener('click', function (event) {
        const target = event.target && event.target.closest
            ? event.target.closest('a[href^="#md-footnote-"], a[href^="#md-footnote-ref-"], a[href^="#schref-"]')
            : null;
        if (!target) return;
        const href = target.getAttribute('href') || '';
        if (!href || href.charAt(0) !== '#') return;
        const id = href.slice(1);
        const node = document.getElementById(id);
        if (!node) return;
        event.preventDefault();
        try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { node.scrollIntoView(); }
        try { if (history && typeof history.replaceState === 'function') history.replaceState(null, '', '#'); } catch (e) {}
    });
}

function renderMarkdown() {
    if (!viewer) return;
    const raw = String(currentMarkdown ?? '');
    let preprocessed = raw;
    function runPostRenderHooks() {
        try { if (typeof bindFootnoteLinkNavigation === 'function') bindFootnoteLinkNavigation(); } catch (e) {}
        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
        try { hydrateInternalImagesInElement(viewer, registerViewerInternalObjectUrl); } catch (e) {}
        try { if (typeof renderMathInMarkdownViewer === 'function') renderMathInMarkdownViewer(viewer); } catch (e) {}
        try {
            if (window.MermaidTRT && typeof window.MermaidTRT.renderIn === 'function') {
                window.MermaidTRT.renderIn(viewer).catch(function () {});
            }
        } catch (e) {}
        try { updatePreviewPopupContent(); } catch (e) {}
        try { renderMiniPreviewContent(); } catch (e) {}
    }
    revokeObjectUrls(viewerInternalImageObjectUrls);
    resolveInternalMarkdownImagesForViewer(raw).then(function (resolvedRaw) {
    try {
        preprocessed = preprocessMarkdownForView(resolvedRaw);
        if (typeof marked === 'undefined' || !marked.parse) {
            viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
            return;
        }
        const mathProtected = _protectMathSegments(preprocessed);
        const out = marked.parse(mathProtected.text);
        if (out != null && typeof out.then === 'function') {
            out.then(function (h) {
                viewer.innerHTML = mathProtected.restoreHtml(h || '');
                runPostRenderHooks();
            }).catch(function () {
                try {
                    const fallbackProtected = _protectMathSegments(preprocessMarkdownForView(resolvedRaw));
                    const fallback = marked.parse(fallbackProtected.text);
                    viewer.innerHTML = (fallback && typeof fallback.then === 'function') ? '' : (fallback || '');
                    if (fallback && typeof fallback.then === 'function') {
                        fallback.then(function (html) {
                            viewer.innerHTML = fallbackProtected.restoreHtml(html || '');
                            runPostRenderHooks();
                        }).catch(function () {
                            viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                            runPostRenderHooks();
                        });
                        return;
                    }
                    viewer.innerHTML = fallbackProtected.restoreHtml(viewer.innerHTML || '');
                    runPostRenderHooks();
                } catch (e) {
                    viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                    runPostRenderHooks();
                }
            });
            return;
        }
        viewer.innerHTML = mathProtected.restoreHtml(out || '');
        runPostRenderHooks();
    } catch (e) {
        try {
            if (typeof marked !== 'undefined' && marked.parse) {
                const fallbackProtected = _protectMathSegments(preprocessMarkdownForView(resolvedRaw));
                const fallback = marked.parse(fallbackProtected.text);
                if (fallback != null && typeof fallback.then === 'function') {
                    fallback.then(function (h) {
                        viewer.innerHTML = fallbackProtected.restoreHtml(h || '');
                        runPostRenderHooks();
                    }).catch(function () {
                        viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                        runPostRenderHooks();
                    });
                    return;
                }
                viewer.innerHTML = fallbackProtected.restoreHtml(fallback || '');
                runPostRenderHooks();
                return;
            }
        } catch (innerErr) {}
        viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        runPostRenderHooks();
    }
    }).catch(function () {
        viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
    });
}

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function getScrollRatio(el) {
    if (!el) return 0;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    return clamp01(el.scrollTop / max);
}

function setScrollRatio(el, ratio) {
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.round(max * clamp01(ratio));
}

function getMarkdownPositionFromRatio(ratio) {
    const text = String(editorTextarea ? editorTextarea.value : currentMarkdown ?? '');
    if (!text) return 0;
    const lines = text.split('\n');
    if (lines.length <= 1) return 0;
    const targetLine = Math.round((lines.length - 1) * clamp01(ratio));
    let pos = 0;
    for (let i = 0; i < targetLine; i++) pos += lines[i].length + 1;
    return pos;
}

function getLineIndexFromCharPos(text, pos) {
    const safePos = Math.max(0, Math.min(Number(pos) || 0, text.length));
    let count = 0;
    for (let i = 0; i < safePos; i++) if (text.charCodeAt(i) === 10) count += 1;
    return count;
}

function getMarkdownRatioFromCharPos(pos) {
    const text = String(currentMarkdown ?? '');
    if (!text) return 0;
    const lines = text.split('\n');
    if (lines.length <= 1) return 0;
    const lineIdx = getLineIndexFromCharPos(text, pos);
    return clamp01(lineIdx / (lines.length - 1));
}

function toggleMode(mode) {
    const vc = document.getElementById('viewer-container');
    const ec = document.getElementById('content-viewport');
    const btnView = document.getElementById('btn-view');
    const btnEdit = document.getElementById('btn-edit');
    const editTools = document.getElementById('edit-tools');
    const btnCopyViewRich = document.getElementById('btn-copy-view-rich');
    const btnExportGdocs = document.getElementById('btn-export-gdocs');
    const btnDocSync = document.getElementById('btn-docsync');
    const activeClasses = ['bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400'];
    if (!vc || !ec) {
        console.warn('toggleMode: viewer-container or content-viewport not found.', { vc: !!vc, ec: !!ec });
        return;
    }

    if (mode === 'edit') {
        const viewRatio = getScrollRatio(vc);
        const mappedPos = viewClickMappedCaretPos == null ? getMarkdownPositionFromRatio(viewRatio) : viewClickMappedCaretPos;
        isEditMode = true;
        vc.classList.add('hidden');
        ec.classList.remove('hidden');
        ec.classList.add('viewer-edit-active');
        applyEditToolsVisibilityByMode();
        if (btnCopyViewRich) btnCopyViewRich.classList.add('hidden');
        if (btnExportGdocs) btnExportGdocs.classList.add('hidden');
        if (btnDocSync) btnDocSync.classList.add('hidden');
        if (btnEdit) btnEdit.classList.add(...activeClasses);
        if (btnView) btnView.classList.remove(...activeClasses);
        applyEditorLightPreference();
        lucide.createIcons();
        if (editorTextarea) {
            const text = String(editorTextarea.value ?? '');
            const safePos = Math.max(0, Math.min(mappedPos, text.length));
            editorTextarea.focus();
            editorTextarea.setSelectionRange(safePos, safePos);
            const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight, 10) || 28;
            const lineIndex = getLineIndexFromCharPos(text, safePos);
            editorTextarea.scrollTop = Math.max(0, lineIndex * lineHeight - editorTextarea.clientHeight * 0.35);
            lastEditCaretPos = safePos;
        }
        viewClickMappedCaretPos = null;
        applyMiniPreviewVisibility();
    } else {
        if (editorTextarea) {
            lastEditCaretPos = Math.max(0, editorTextarea.selectionStart || 0);
        }
        isEditMode = false;
        if (editorTextarea) {
            editorTextarea.blur();
            currentMarkdown = String(editorTextarea.value ?? '');
        }
        ec.classList.remove('viewer-edit-active');
        ec.classList.add('hidden');
        applyEditToolsVisibilityByMode();
        if (btnCopyViewRich) btnCopyViewRich.classList.remove('hidden');
        if (btnExportGdocs) {
            const showFromGoogleDocs = !!(window.GoogleDocs && typeof window.GoogleDocs.shouldShowInViewMode === 'function' && window.GoogleDocs.shouldShowInViewMode());
            const toDocsCheck = document.getElementById('todocs-visible');
            const showFromCheck = !!(toDocsCheck && toDocsCheck.checked);
            const showToDocs = showFromGoogleDocs || showFromCheck;
            if (showToDocs) btnExportGdocs.classList.remove('hidden');
            else btnExportGdocs.classList.add('hidden');
        }
        if (btnDocSync) {
            const showDocSync = !!(window.GoogleDocs && typeof window.GoogleDocs.shouldShowDocSyncInViewMode === 'function' && window.GoogleDocs.shouldShowDocSyncInViewMode());
            if (showDocSync) btnDocSync.classList.remove('hidden');
            else btnDocSync.classList.add('hidden');
        }
        if (btnView) btnView.classList.add(...activeClasses);
        if (btnEdit) btnEdit.classList.remove(...activeClasses);
        vc.classList.remove('hidden');
        renderMarkdown();
        requestAnimationFrame(function () {
            if (isEditMode) return;
            if (editorTextarea) {
                const v = String(editorTextarea.value ?? '');
                if (v !== currentMarkdown) {
                    currentMarkdown = v;
                    renderMarkdown();
                }
            }
            if (currentMarkdown.trim() && viewer && !viewer.textContent.trim()) {
                renderMarkdown();
            }
            const ratioFromCaret = getMarkdownRatioFromCharPos(lastEditCaretPos);
            requestAnimationFrame(function () {
                if (isEditMode) return;
                setScrollRatio(vc, ratioFromCaret);
            });
        });
        applyMiniPreviewVisibility();
    }
}

async function handleFileSelect(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files ? input.files[0] : null;
    if (file) await readFile(file);
    if (input) input.value = '';
}

function createNewFile() {
    currentMarkdown = "";
    setCurrentDocumentInfo("untitled.md", null);
    currentDbDocId = null;
    updateContent("");
    markPersistedState();
    performAutoSave();
    showToast("New document created.");
    if (isEditMode) editorTextarea.focus();
}

const MPV_FORMAT = 'mdviewer/mpv';
const MPV_VERSION = 1;

function setCurrentDocumentInfo(fileName, filePath = null) {
    currentFileName = fileName;
    currentFilePath = filePath || null;
    currentDbDocId = null;
    fileNameDisplay.textContent = currentFileName;
    if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
        window.GoogleDocs.handleActiveDocumentChanged();
    }
}

function getCurrentDbDocumentId() {
    return currentDbDocId ? String(currentDbDocId) : '';
}

async function getCurrentFileGoogleDocId() {
    const docId = getCurrentDbDocumentId();
    if (!docId || !db) return '';
    return new Promise((resolve) => {
        const tx = db.transaction('documents', 'readonly');
        const req = tx.objectStore('documents').get(docId);
        req.onsuccess = () => {
            const doc = req.result || null;
            resolve(doc && doc.googleDocId ? String(doc.googleDocId) : '');
        };
        req.onerror = () => resolve('');
    });
}

async function setCurrentFileGoogleDocId(googleDocId) {
    const docId = getCurrentDbDocumentId();
    if (!docId || !db) return false;
    const nextId = String(googleDocId || '').trim();
    return new Promise((resolve) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const getReq = store.get(docId);
        getReq.onsuccess = () => {
            const doc = getReq.result || null;
            if (!doc) {
                resolve(false);
                return;
            }
            if (nextId) doc.googleDocId = nextId;
            else delete doc.googleDocId;
            doc.updatedAt = new Date();
            store.put(doc);
        };
        getReq.onerror = () => resolve(false);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
    });
}

function getSaveCandidateFileName() {
    return currentFileName && String(currentFileName).trim()
        ? currentFileName
        : "document.md";
}

function downloadMarkdownFile(markdown, fileName) {
    const content = markdown == null ? currentMarkdown : String(markdown);
    const name = String(fileName || currentFileName || 'document.md');
    const bom = '\uFEFF';
    const blob = new Blob([bom, content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.md') ? name : name + ".md";
    a.click();
    URL.revokeObjectURL(url);
}

function downloadBlobFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(fileName || 'download.bin');
    a.click();
    URL.revokeObjectURL(url);
}

function getZipSaveFileName() {
    const base = String(getSaveCandidateFileName() || 'document.md').replace(/\.md$/i, '');
    return base + '.zip';
}

function getMddSaveFileName() {
    const base = String(getSaveCandidateFileName() || 'document.md').replace(/\.md$/i, '');
    return base + '.mdd';
}

async function exportCurrentDocumentAsZipWithInternalImages() {
    if (!db || !window.ImageDB || typeof window.ImageDB.exportMarkdownToZip !== 'function') {
        throw new Error('ImageDB ZIP export is not available.');
    }
    const out = await window.ImageDB.exportMarkdownToZip(db, String(currentMarkdown || ''), 'doc.md');
    downloadBlobFile(out.blob, getZipSaveFileName());
}

async function exportCurrentDocumentAsMdd() {
    if (!db || !window.ExtendFiles || typeof window.ExtendFiles.exportMdd !== 'function') {
        throw new Error('MDD export is not available.');
    }
    const out = await window.ExtendFiles.exportMdd(db, String(currentMarkdown || ''), getMddSaveFileName());
    downloadBlobFile(out.blob, out.fileName || getMddSaveFileName());
}

async function chooseExportType() {
    if (window.ExtendFiles && typeof window.ExtendFiles.showExportTypeDialog === 'function') {
        return await window.ExtendFiles.showExportTypeDialog();
    }
    const pick = String(window.prompt('Export type: md / mdd / zip / html / github (cancel = empty)', 'md') || '').trim().toLowerCase();
    if (!pick) return 'cancel';
    if (pick === 'md' || pick === 'mdd' || pick === 'zip' || pick === 'html' || pick === 'github') return pick;
    return 'cancel';
}

async function exportCurrentDocumentByChoice() {
    const choice = await chooseExportType();
    if (choice === 'cancel') return false;
    if (choice === 'github') {
        const ok = await pushCurrentContentToGithub();
        if (ok) markPersistedState();
        return !!ok;
    }
    if (choice === 'zip') {
        await exportCurrentDocumentAsZipWithInternalImages();
        showToast('ZIP exported. Document + images folder saved.');
        markPersistedState();
        return true;
    }
    if (choice === 'mdd') {
        await exportCurrentDocumentAsMdd();
        showToast('MDD exported. Document + images saved in one bundle.');
        markPersistedState();
        return true;
    }
        if (choice === 'html') {
            if (typeof HtmlExport !== 'undefined' && HtmlExport.exportToHTML) await HtmlExport.exportToHTML();
            markPersistedState();
            return true;
        }
    const hasInternalImages = !!(window.ImageDB
        && typeof window.ImageDB.hasInternalImages === 'function'
        && window.ImageDB.hasInternalImages(String(currentMarkdown || '')));
    if (hasInternalImages) {
        if (window.ExtendFiles && typeof window.ExtendFiles.showMdImageLossWarningDialog === 'function') {
            const confirmMd = await window.ExtendFiles.showMdImageLossWarningDialog();
            if (confirmMd !== 'continue_md') return false;
        } else {
            const ok = window.confirm('MD exports text only. Internal images (IndexedDB) are not included.\nMDD exports document + images together, and ZIP exports a document + images folder.\nDo you want to continue with MD export?');
            if (!ok) return false;
        }
    }
    downloadMarkdownFile();
    if (hasInternalImages) {
        showToast('MD exported (text only). Internal images are not included.');
    } else {
        showToast('MD exported.');
    }
    markPersistedState();
    return true;
}

async function readFile(file, options) {
    const opts = options || {};
    if (!opts.skipSavePrompt) {
        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('Open canceled.');
            return;
        }
    }
    const name = (file && file.name ? file.name : '').toLowerCase();
    if (name.endsWith('.mdd')) {
        importMddDocumentFile(file).catch(function (e) {
            showToast('Failed to import MDD: ' + (e && e.message ? e.message : e));
        });
        return;
    }
    if (name.endsWith('.zip')) {
        importZipDocumentFile(file).catch(function (e) {
            showToast('Failed to import ZIP: ' + (e && e.message ? e.message : e));
        });
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const raw = e.target.result;
        if (name.endsWith('.mpv') || name.endsWith('.json')) {
            currentFilePath = null;
            try {
                const data = JSON.parse(raw);
                if (data && data.format === MPV_FORMAT && Array.isArray(data.folders) && Array.isArray(data.documents)) {
                    restoreFromMpv(data);
                    return;
                }
            } catch (_) {}
        }
        setCurrentDocumentInfo(file.name, file.path || null);
        updateContent(raw);
        markPersistedState();
        showToast("File loaded successfully.");
    };
    reader.readAsText(file, 'UTF-8');
}

async function importMddDocumentFile(file) {
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return;
    }
    if (!window.ExtendFiles || typeof window.ExtendFiles.importMddToIndexedDb !== 'function') {
        showToast('MDD import is not available.');
        return;
    }
    const text = await file.text();
    const imported = await window.ExtendFiles.importMddToIndexedDb(db, text);
    const md = imported && typeof imported.markdown === 'string' ? imported.markdown : '';
    const title = imported && imported.fileName ? imported.fileName : ((file.name || 'document').replace(/\.mdd$/i, '.md'));
    setCurrentDocumentInfo(title, null);
    updateContent(md);
    markPersistedState();
    performAutoSave();
    showToast('MDD imported. Internal images restored.');
}

async function importZipDocumentFile(file) {
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return;
    }
    if (!window.ImageDB || typeof window.ImageDB.importZipToIndexedDb !== 'function') {
        showToast('ImageDB ZIP import is not available.');
        return;
    }
    const buf = await file.arrayBuffer();
    const imported = await window.ImageDB.importZipToIndexedDb(db, buf);
    const md = imported && typeof imported.markdown === 'string' ? imported.markdown : '';
    const title = imported && imported.docName ? imported.docName : ((file.name || 'document').replace(/\.zip$/i, '.md'));
    setCurrentDocumentInfo(title, null);
    updateContent(md);
    markPersistedState();
    performAutoSave();
    showToast('ZIP imported. Internal images restored.');
}

async function restoreFromMpv(data) {
    if (!db) return;
    const tx = db.transaction(['folders', 'documents'], 'readwrite');
    const storeFolders = tx.objectStore('folders');
    const storeDocs = tx.objectStore('documents');
    storeFolders.clear();
    storeDocs.clear();
    for (const f of data.folders || []) {
        storeFolders.add({ id: f.id, name: f.name });
    }
    for (const d of data.documents || []) {
        storeDocs.add({
            id: d.id,
            title: d.title,
            content: d.content || '',
            folderId: d.folderId || 'root',
            updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date()
        });
    }
    await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
    });
    renderDBList();
    showToast("Backup data imported and restored successfully.");
}

function openBackupModal() {
    document.getElementById('backup-modal').classList.remove('hidden');
    document.getElementById('backup-modal').classList.add('flex');
    lucide.createIcons();
}

function closeBackupModal() {
    document.getElementById('backup-modal').classList.add('hidden');
    document.getElementById('backup-modal').classList.remove('flex');
}

function callSidebarLeftMergeApi(method, args) {
    const api = window.__sidebarLeftMergeApi;
    if (!api || typeof api[method] !== 'function') {
        showToast('Merge module is loading. Please try again.');
        return;
    }
    return api[method].apply(null, Array.isArray(args) ? args : []);
}

function openMergeModal() { return callSidebarLeftMergeApi('openMergeModal'); }
function filterMergeList(query) { return callSidebarLeftMergeApi('filterMergeList', [query]); }
function selectAllMergeItems() { return callSidebarLeftMergeApi('selectAllMergeItems'); }
function deselectAllMergeItems() { return callSidebarLeftMergeApi('deselectAllMergeItems'); }
function toggleMergeItem(idx, checked) { return callSidebarLeftMergeApi('toggleMergeItem', [idx, checked]); }
function moveMergeItem(idx, dir) { return callSidebarLeftMergeApi('moveMergeItem', [idx, dir]); }
function toggleSelectedOnlyMergeView() { return callSidebarLeftMergeApi('toggleSelectedOnlyMergeView'); }
function closeMergeModal() { return callSidebarLeftMergeApi('closeMergeModal'); }
function bindMerge() { return callSidebarLeftMergeApi('bindMerge'); }

async function exportZip() {
    if (!db || typeof JSZip === 'undefined') {
        showToast("ZIP export is not available.");
        return;
    }
    const folders = await new Promise(r => {
        const req = db.transaction('folders', 'readonly').objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });
    const documents = await new Promise(r => {
        const req = db.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = () => r(req.result);
    });
    const zip = new JSZip();
    const folderMap = new Map((folders || []).map(f => [f.id, f.name]));
    for (const doc of documents || []) {
        const folderName = folderMap.get(doc.folderId) || 'root';
        const safeDir = folderName.replace(/[/\\?*:|"]/g, '_');
        const path = safeDir + '/' + (doc.title || 'untitled').replace(/[/\\?*:|\"]/g, '_') + '.md';
        zip.file(path, doc.content || '');
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdviewer_backup_' + new Date().toISOString().slice(0, 10) + '.zip';
    a.click();
    URL.revokeObjectURL(url);
    closeBackupModal();
    showToast("ZIP backup exported.");
}

async function exportMpv() {
    if (!db) return;
    const folders = await new Promise(r => {
        const req = db.transaction('folders', 'readonly').objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });
    const documents = await new Promise(r => {
        const req = db.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = () => r(req.result);
    });
    const payload = {
        format: MPV_FORMAT,
        version: MPV_VERSION,
        exportedAt: new Date().toISOString(),
        folders: folders || [],
        documents: (documents || []).map(d => ({
            id: d.id,
            title: d.title,
            content: d.content,
            folderId: d.folderId,
            updatedAt: d.updatedAt ? (d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt) : null
        }))
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdviewer_backup_' + new Date().toISOString().slice(0, 10) + '.mpv';
    a.click();
    URL.revokeObjectURL(url);
    closeBackupModal();
    showToast("MPV backup exported as JSON.");
}

async function saveCurrentFile() {
    if (!(window.electron && window.electron.ipcRenderer)) {
        try {
            return await exportCurrentDocumentByChoice();
        } catch (e) {
            showToast('Export failed: ' + (e && e.message ? e.message : e));
            return false;
        }
    }
    const result = await window.electron.ipcRenderer.invoke('save-current-file', {
        filePath: currentFilePath,
        fileName: getSaveCandidateFileName(),
        content: currentMarkdown
    });
    if (!result || result.canceled) return false;
    if (result.error) {
        showToast(`Failed to save file: ${result.error}`);
        return false;
    }
    setCurrentDocumentInfo(result.fileName, result.filePath);
    showToast("File saved.");
    markPersistedState();
    return true;
}

async function saveFileAs() {
    if (!(window.electron && window.electron.ipcRenderer)) {
        try {
            return await exportCurrentDocumentByChoice();
        } catch (e) {
            showToast('Export failed: ' + (e && e.message ? e.message : e));
            return false;
        }
    }
    const result = await window.electron.ipcRenderer.invoke('save-file-as', {
        filePath: currentFilePath,
        fileName: getSaveCandidateFileName(),
        content: currentMarkdown
    });
    if (!result || result.canceled) return false;
    if (result.error) {
        showToast(`Failed to save file as: ${result.error}`);
        return false;
    }
    setCurrentDocumentInfo(result.fileName, result.filePath);
    showToast("File saved as new file.");
    markPersistedState();
    return true;
}

function saveFile() {
    return saveCurrentFile();
}

function ensurePrintRootElement() {
    let root = document.getElementById('print-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
    return root;
}

function syncPrintRootFromViewer() {
    const printRoot = ensurePrintRootElement();
    const viewerEl = document.getElementById('viewer') || viewer;
    if (!printRoot || !viewerEl) return false;
    printRoot.innerHTML = '';
    const printable = document.createElement('div');
    printable.className = 'markdown-body print-area';
    printable.innerHTML = String(viewerEl.innerHTML || '').trim();
    if (!printable.innerHTML.trim()) {
        const raw = String(currentMarkdown || '');
        if (!raw.trim()) return false;
        printable.innerHTML = '<p>' + raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>') + '</p>';
    }
    printRoot.appendChild(printable);
    const hasRenderedNodes = printable.querySelector('*') !== null || printable.textContent.trim().length > 0;
    return hasRenderedNodes;
}

function clearPrintRoot() {
    const printRoot = ensurePrintRootElement();
    if (!printRoot) return;
    printRoot.innerHTML = '';
}

function printPage() {
    if (isEditMode) toggleMode('view');
    setTimeout(() => {
        if (!syncPrintRootFromViewer()) {
            showToast('Nothing to print. Rendered content is empty.');
            return;
        }
        document.body.classList.add('printing-active');
        const cleanup = function () {
            document.body.classList.remove('printing-active');
            clearPrintRoot();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
        setTimeout(cleanup, 1000);
    }, 120);
}

function revokeObjectUrls(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    while (list.length > 0) {
        const url = list.pop();
        try { URL.revokeObjectURL(url); } catch (e) {}
    }
}

function registerViewerInternalObjectUrl(url) {
    if (!url) return;
    viewerInternalImageObjectUrls.push(url);
}

function registerPreviewInternalObjectUrl(url) {
    if (!url) return;
    previewInternalImageObjectUrls.push(url);
}

function getImageInsertFingerprint(dataUrl) {
    const s = String(dataUrl || '');
    if (!s) return '';
    return String(s.length) + ':' + s.slice(0, 48) + ':' + s.slice(-48);
}

function clearImageInsertInternalSavedState() {
    imageInsertSavedInternalId = '';
    imageInsertSavedInternalUrl = '';
    imageInsertSavedFingerprint = '';
}

function renderImageInsertInternalInfo() {
    const box = document.getElementById('img-insert-internal-box');
    const linkEl = document.getElementById('img-insert-internal-link');
    const delBtn = document.getElementById('img-insert-internal-delete');
    if (!box || !linkEl || !delBtn) return;
    if (!imageInsertSavedInternalUrl) {
        box.classList.add('hidden');
        linkEl.textContent = '';
        return;
    }
    box.classList.remove('hidden');
    linkEl.textContent = imageInsertSavedInternalUrl;
    delBtn.disabled = false;
}

function resetImageInsertForNewImage(isCropChanged) {
    imageInsertChangedByCrop = !!isCropChanged;
    if (isCropChanged) {
        clearImageInsertInternalSavedState();
        const urlInput = document.getElementById('img-insert-url');
        if (urlInput && String(urlInput.value || '').trim().startsWith('internal://')) urlInput.value = '';
    }
    renderImageInsertInternalInfo();
}

async function resolveInternalMarkdownImagesForViewer(raw) {
    const source = String(raw ?? '');
    if (!source.includes('internal://') || !window.ImageDB || !db) return source;
    try {
        const resolved = await window.ImageDB.resolveInternalUrlsInMarkdown(db, source, registerViewerInternalObjectUrl);
        return resolved && typeof resolved.markdown === 'string' ? resolved.markdown : source;
    } catch (e) {
        return source;
    }
}

async function resolveInternalMarkdownImagesForPreview(raw) {
    const source = String(raw ?? '');
    if (!source.includes('internal://') || !window.ImageDB || !db) return source;
    try {
        const resolved = await window.ImageDB.resolveInternalUrlsInMarkdown(db, source, registerPreviewInternalObjectUrl);
        return resolved && typeof resolved.markdown === 'string' ? resolved.markdown : source;
    } catch (e) {
        return source;
    }
}

async function hydrateInternalImagesInElement(rootEl, collector) {
    if (!rootEl || !db || !window.ImageDB || typeof window.ImageDB.getImage !== 'function') return;
    const nodes = rootEl.querySelectorAll('img[src^="internal://"]');
    for (let i = 0; i < nodes.length; i++) {
        const img = nodes[i];
        const src = String(img.getAttribute('src') || '');
        const id = window.ImageDB.parseInternalUrl ? window.ImageDB.parseInternalUrl(src) : src.replace(/^internal:\/\//, '');
        if (!id) continue;
        try {
            const rec = await window.ImageDB.getImage(db, id);
            if (!rec || !rec.blob) continue;
            const objectUrl = URL.createObjectURL(rec.blob);
            if (typeof collector === 'function') collector(objectUrl);
            img.src = objectUrl;
            img.setAttribute('data-internal-id', id);
        } catch (e) {}
    }
}

function fallbackCopyHtmlFromViewer(html) {
    if (!document.body) return false;
    const sandbox = document.createElement('div');
    sandbox.setAttribute('contenteditable', 'true');
    sandbox.style.position = 'fixed';
    sandbox.style.left = '-99999px';
    sandbox.style.top = '0';
    sandbox.style.opacity = '0';
    sandbox.innerHTML = String(html || '');
    document.body.appendChild(sandbox);

    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel) {
        document.body.removeChild(sandbox);
        return false;
    }
    const range = document.createRange();
    range.selectNodeContents(sandbox);
    sel.removeAllRanges();
    sel.addRange(range);

    let ok = false;
    try { ok = !!document.execCommand('copy'); } catch (e) { ok = false; }

    sel.removeAllRanges();
    document.body.removeChild(sandbox);
    return ok;
}

async function copyViewFormattedToClipboard() {
    if (isEditMode) toggleMode('view');
    if (!viewer) {
        showToast('Viewer is not ready.');
        return;
    }

    const html = String(viewer.innerHTML || '').trim();
    const text = String(viewer.innerText || viewer.textContent || '').trim();
    if (!html && !text) {
        showToast('Nothing to copy.');
        return;
    }

    try {
        if (navigator.clipboard && window.ClipboardItem && typeof navigator.clipboard.write === 'function') {
            const item = new ClipboardItem({
                'text/html': new Blob([html || '<p></p>'], { type: 'text/html' }),
                'text/plain': new Blob([text || ''], { type: 'text/plain' })
            });
            await navigator.clipboard.write([item]);
            showToast('Copied formatted content.');
            return true;
        }
    } catch (e) {}

    const fallbackOk = fallbackCopyHtmlFromViewer(html || text);
    if (fallbackOk) showToast('Copied formatted content.');
    else showToast('Copy failed. Please allow clipboard access.');
    return fallbackOk;
}

// --- Sidebar Visibility & Collapse Logic ---
function toggleSidebarVisibility() {
    isSidebarHidden = !isSidebarHidden;
    sidebar.style.display = isSidebarHidden ? 'none' : 'flex';
}

function toggleSidebarCollapse() {
    isSidebarCollapsed = !isSidebarCollapsed;
    const collapseIcon = document.getElementById('collapse-icon');

    if (isSidebarCollapsed) {
        sidebar.classList.add('sidebar-collapsed');
        collapseIcon.setAttribute('data-lucide', 'chevron-right');
    } else {
        sidebar.classList.remove('sidebar-collapsed');
        collapseIcon.setAttribute('data-lucide', 'chevron-left');
    }
    lucide.createIcons();
    renderDBList();
    if (activeSidebarTab === 'toc') renderTOC();
}

// --- TOC & Sidebar Tabs ---
let activeSidebarTab = 'files';
let lastRenderedTocItems = [];

function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    const btnFiles = document.getElementById('tab-files');
    const btnToc = document.getElementById('tab-toc');
    const dbList = document.getElementById('db-list');
    const tocList = document.getElementById('toc-list');
    const searchContainer = document.getElementById('search-container');
    const btnNewFolder = document.getElementById('btn-new-folder');

    if (tab === 'files') {
        btnFiles.className = "flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors";
        btnToc.className = "flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors";
        dbList.classList.remove('hidden');
        tocList.classList.add('hidden');
        searchContainer.classList.remove('hidden');
        if (btnNewFolder) btnNewFolder.classList.remove('hidden');
        renderDBList();
    } else {
        btnToc.className = "flex-1 text-xs font-bold py-1 bg-white dark:bg-slate-700 rounded shadow-sm text-slate-800 dark:text-white transition-colors";
        btnFiles.className = "flex-1 text-xs font-bold py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors";
        dbList.classList.add('hidden');
        tocList.classList.remove('hidden');
        searchContainer.classList.add('hidden');
        if (btnNewFolder) btnNewFolder.classList.add('hidden');
        renderTOC();
    }
}

function parseTocItemsFromMarkdown(markdownText) {
    const lines = String(markdownText || '').split('\n');
    const items = [];
    let inFence = false;
    let fenceChar = '';

    lines.forEach((line, index) => {
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
        if (fenceMatch) {
            const currentFenceChar = fenceMatch[1].charAt(0);
            if (!inFence) {
                inFence = true;
                fenceChar = currentFenceChar;
            } else if (fenceChar === currentFenceChar) {
                inFence = false;
                fenceChar = '';
            }
            return;
        }
        if (inFence) return;

        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (!match) return;

        const level = match[1].length;
        const rawText = String(match[2] || '').trim();
        if (!rawText) return;
        const text = rawText.replace(/\s+#+\s*$/, '').trim();
        if (!text) return;

        items.push({
            level,
            text,
            lineIndex: index
        });
    });

    return items;
}

function renderTOC() {
    const tocList = document.getElementById('toc-list');
    if (!tocList) return;
    tocList.innerHTML = '';
    const esc = (v) => String(v || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const levelToneClass = (level) => {
        if (level === 1) return 'border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-900/25 hover:bg-indigo-100/90 dark:hover:bg-indigo-900/35';
        if (level === 2) return 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-900/25 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/35';
        if (level === 3) return 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-900/25 hover:bg-amber-100/90 dark:hover:bg-amber-900/35';
        if (level === 4) return 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-sky-50/80 dark:bg-sky-900/25 hover:bg-sky-100/90 dark:hover:bg-sky-900/35';
        if (level === 5) return 'border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50/80 dark:bg-fuchsia-900/25 hover:bg-fuchsia-100/90 dark:hover:bg-fuchsia-900/35';
        return 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100/90 dark:hover:bg-slate-700/60';
    };
    const shortText = (text, n) => Array.from(String(text || '').trim()).slice(0, n).join('');

    const tocItems = parseTocItemsFromMarkdown(currentMarkdown);
    lastRenderedTocItems = tocItems.slice();

    if (isSidebarCollapsed) {
        if (!tocItems.length) {
            tocList.innerHTML = `
                <div class="p-2 flex justify-center">
                    <button type="button"
                        class="w-12 h-6 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600 text-[10px] font-bold cursor-not-allowed flex items-center justify-center"
                        disabled
                        aria-label="No headings found">-</button>
                </div>`;
            return;
        }

        let compactHtml = '<div class="space-y-1 p-1 flex flex-col items-center">';
        tocItems.forEach((item) => {
            const toneClass = levelToneClass(item.level);
            const label = shortText(item.text, 3) || '#';
            compactHtml += `
                <button type="button"
                    class="w-12 h-6 rounded-md border text-[10px] font-bold transition-colors flex items-center justify-center ${toneClass}"
                    title="${esc(item.text)}"
                    aria-label="${esc(item.text)}"
                    onclick="scrollToLine(${item.lineIndex})"><span class="truncate" style="max-width:2.4rem;display:inline-block">${esc(label)}</span></button>`;
        });
        compactHtml += '</div>';
        tocList.innerHTML = compactHtml;
        return;
    }

    let tocHtml = '<div class="space-y-1 p-2">';
    tocItems.forEach((item) => {
        const padding = (item.level - 1) * 12;
        const sizeClasses = item.level === 1 ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400';
        tocHtml += `<div class="text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-2 rounded truncate transition-colors ${sizeClasses}" style="margin-left: ${padding}px" onclick="scrollToLine(${item.lineIndex})">${esc(item.text)}</div>`;
    });

    tocHtml += '</div>';

    if (!tocItems.length) {
        tocHtml = '<div class="p-4 text-xs text-slate-400 text-center">No headings found. Add Markdown headings like <code># Title</code> to build a TOC.</div>';
    }
    tocList.innerHTML = tocHtml;
    try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
}

function getTextareaCaretTopOffset(textarea, position) {
    if (!textarea) return 0;
    const value = String(textarea.value || '');
    const safePos = Math.max(0, Math.min(Number(position) || 0, value.length));
    const before = value.slice(0, safePos) + (safePos > 0 && value.charAt(safePos - 1) === '\n' ? ' ' : '');
    const mirror = document.createElement('div');
    const marker = document.createElement('span');
    const style = window.getComputedStyle(textarea);
    const props = [
        'boxSizing',
        'width',
        'height',
        'overflowX',
        'overflowY',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'fontStyle',
        'fontVariant',
        'fontWeight',
        'fontStretch',
        'fontSize',
        'fontSizeAdjust',
        'lineHeight',
        'fontFamily',
        'textAlign',
        'textTransform',
        'textIndent',
        'textDecoration',
        'letterSpacing',
        'wordSpacing',
        'tabSize',
        'MozTabSize'
    ];

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.pointerEvents = 'none';

    props.forEach((prop) => {
        mirror.style[prop] = style[prop];
    });

    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.textContent = before;
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const paddingTop = parseFloat(style.paddingTop) || 0;
    const top = Math.max(0, marker.offsetTop - paddingTop);
    document.body.removeChild(mirror);
    return top;
}

function scrollToLine(lineIndex) {
    if (isEditMode) {
        if (!editorTextarea) return;
        const text = String(editorTextarea.value || '');
        const lines = text.split('\n');
        const safeLineIndex = Math.max(0, Math.min(Number(lineIndex) || 0, Math.max(0, lines.length - 1)));
        let charPos = 0;
        for (let i = 0; i < safeLineIndex; i++) {
            charPos += lines[i].length + 1;
        }
        editorTextarea.focus();
        editorTextarea.setSelectionRange(charPos, charPos);
        const top = getTextareaCaretTopOffset(editorTextarea, charPos);
        const lineHeight = parseFloat(getComputedStyle(editorTextarea).lineHeight) || 24;
        // Show three lines above the heading when syncing from TOC.
        const offsetTop = Math.max(0, top - (lineHeight * 3));
        editorTextarea.scrollTo({ top: offsetTop, behavior: 'smooth' });
    } else {
        const tocItems = (Array.isArray(lastRenderedTocItems) && lastRenderedTocItems.length)
            ? lastRenderedTocItems
            : parseTocItemsFromMarkdown(currentMarkdown);

        const targetIdx = tocItems.findIndex((item) => item.lineIndex === lineIndex);
        const targetItem = targetIdx >= 0 ? tocItems[targetIdx] : null;

        const headers = Array.from(viewer.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        if (!headers.length) return;

        if (targetItem) {
            const normalizedTargetText = String(targetItem.text || '').trim();
            const sameKeyBefore = tocItems
                .slice(0, targetIdx + 1)
                .filter((item) => item.level === targetItem.level && String(item.text || '').trim() === normalizedTargetText)
                .length - 1;

            const matchingHeaders = headers.filter((h) => {
                if (!h || !h.tagName) return false;
                const level = Number(String(h.tagName).replace(/^H/i, ''));
                return level === targetItem.level && String(h.textContent || '').trim() === normalizedTargetText;
            });

            if (matchingHeaders[sameKeyBefore]) {
                matchingHeaders[sameKeyBefore].scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }

        const fallbackIndex = Math.max(0, Math.min(Number(targetIdx >= 0 ? targetIdx : 0), headers.length - 1));
        headers[fallbackIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// --- IndexedDB Actions ---
async function ensureRootFolder() {
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    return new Promise((res) => {
        const req = store.get('root');
        req.onsuccess = () => {
            const current = req.result;
            if (!current) {
                store.add({ id: 'root', name: ROOT_FOLDER_NAME });
                res();
                return;
            }
            const currentName = String(current.name || '').trim();
            const looksBroken = !currentName || currentName.includes('?') || currentName.includes('\uFFFD');
            if (looksBroken || currentName.toUpperCase() !== ROOT_FOLDER_NAME) {
                store.put({ ...current, name: ROOT_FOLDER_NAME });
            }
            res();
        };
    });
}

async function cleanupBootBlockedDocuments() {
    if (!db) return 0;
    const docs = await new Promise((resolve) => {
        const tx = db.transaction('documents', 'readonly');
        const req = tx.objectStore('documents').getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
    });
    const targets = docs.filter((doc) => {
        const title = String((doc && doc.title) || '').trim().toLowerCase();
        return LOCAL_BOOT_DELETE_TITLES.has(title);
    });
    if (!targets.length) return 0;

    await new Promise((resolve) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        targets.forEach((doc) => {
            if (doc && doc.id) store.delete(doc.id);
        });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
    return targets.length;
}

let currentActionCallback = null;

function createNewFolder() {
    const modal = document.getElementById('save-modal');
    document.querySelector('#save-modal h3').textContent = 'Create Folder';
    document.querySelector('#save-modal label').textContent = 'Folder name';
    const input = document.getElementById('save-title-input');
    input.value = '';

    currentActionCallback = (name) => {
        if (!name) return;
        const tx = db.transaction('folders', 'readwrite');
        const id = 'folder_' + Date.now();
        tx.objectStore('folders').add({ id, name });
        tx.oncomplete = () => renderDBList();
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

async function deleteFolderFromDB(folderId) {
    const id = String(folderId || '').trim();
    if (!id) return;
    if (id === 'root') {
        showToast('ROOT folder cannot be deleted.');
        return;
    }
    if (!db) return;

    const docsInFolder = await new Promise(function (resolve) {
        const tx = db.transaction('documents', 'readonly');
        const req = tx.objectStore('documents').getAll();
        req.onsuccess = function () {
            const all = Array.isArray(req.result) ? req.result : [];
            resolve(all.filter(function (d) { return String(d.folderId || '') === id; }));
        };
        req.onerror = function () { resolve([]); };
    });

    const count = docsInFolder.length;
    const ok = window.confirm(
        count > 0
            ? 'Delete this folder?\n' + count + ' document(s) will be moved to ROOT.'
            : 'Delete this empty folder?'
    );
    if (!ok) return;

    await new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(['folders', 'documents'], 'readwrite');
            const foldersStore = tx.objectStore('folders');
            const docsStore = tx.objectStore('documents');

            docsInFolder.forEach(function (doc) {
                docsStore.put({ ...(doc || {}), folderId: 'root' });
            });
            foldersStore.delete(id);

            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('Delete folder failed.')); };
        } catch (e) {
            reject(e);
        }
    }).catch(function (e) {
        showToast('Delete folder failed: ' + (e && e.message ? e.message : e));
    });

    if (folderCollapseState && Object.prototype.hasOwnProperty.call(folderCollapseState, id)) {
        delete folderCollapseState[id];
        saveFolderCollapseState();
    }
    await ensureRootFolder();
    renderDBList();
    showToast('Folder deleted.');
}

function getSelectedTextForSave() {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.toString && sel.toString().trim()) {
        return sel.toString().trim().replace(/\s+/g, ' ').slice(0, 200);
    }
    if (editorTextarea && document.activeElement === editorTextarea) {
        const start = editorTextarea.selectionStart;
        const end = editorTextarea.selectionEnd;
        if (start !== end) {
            const selected = editorTextarea.value.substring(start, end).trim().replace(/\s+/g, ' ').slice(0, 200);
            if (selected) return selected;
        }
    }
    return null;
}

function saveToDB() {
    const modal = document.getElementById('save-modal');
    document.querySelector('#save-modal h3').textContent = 'Create Folder';
    document.querySelector('#save-modal label').textContent = 'Folder name';
    const input = document.getElementById('save-title-input');
    let defaultTitle = currentFileName.replace(/\.md$/i, '');
    const selected = getSelectedTextForSave();
    if (selected) defaultTitle = selected;
    input.value = defaultTitle || 'Untitled';

    currentActionCallback = (title) => {
        if (!title) return;
        const doc = {
            id: 'doc_' + Date.now(),
            title: title,
            content: currentMarkdown,
            folderId: 'root',
            updatedAt: new Date()
        };

        const tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').add(doc);
        tx.oncomplete = () => {
            showToast("Saved to inDB.");
            renderDBList();
            if (isSidebarHidden) toggleSidebarVisibility();
        };
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

function closeSaveModal() {
    document.getElementById('save-modal').classList.add('hidden');
    document.getElementById('save-modal').classList.remove('flex');
    currentActionCallback = null;
}

function confirmSaveModal() {
    const val = document.getElementById('save-title-input').value;
    if (currentActionCallback) currentActionCallback(val);
    closeSaveModal();
}


function githubApiHeaders(token) {
    return {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'token ' + String(token || '').trim(),
        'X-GitHub-Api-Version': '2022-11-28'
    };
}

async function githubApiRequest(url, options, token) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = { ...(opts.headers || {}), ...githubApiHeaders(token) };
    if (opts.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...opts, method, headers });
    if (!res.ok) {
        let msg = 'GitHub API error: ' + res.status;
        try {
            const j = await res.json();
            if (j && j.message) msg = j.message;
        } catch (_) {}
        const err = new Error(msg);
        err.status = res.status;
        err.url = url;
        throw err;
    }
    if (res.status === 204) return null;
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
}

function decodeGithubBase64ToText(encoded) {
    const clean = String(encoded || '').replace(/\n/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function encodeTextToGithubBase64(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function getGithubDocTitleFromPath(path) {
    const p = String(path || '');
    const parts = p.split('/');
    const file = parts[parts.length - 1] || 'untitled.md';
    return file.replace(/\.(md|markdown|txt)$/i, '');
}

async function pullGithubRepo() {
    const settings = await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    if (!cfg.enabled) {
        showToast('Enable github first in Settings.');
        return;
    }
    if (!cfg.token || !cfg.repo || !cfg.branch) {
        showToast('Enter PAT, repository, and branch first.');
        setGithubFeedback('PAT / 저장소 / 브랜치를 입력하세요.', 'error');
        return;
    }
    setGithubFeedback('Pulling from GitHub...', 'info');
    try {
        const treeUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1';
        const treeData = await githubApiRequest(treeUrl, {}, cfg.token);
        const treeItems = Array.isArray(treeData && treeData.tree) ? treeData.tree : [];
        const basePrefix = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/') : '';
        const files = treeItems.filter(function (it) {
            if (!(it && it.type === 'blob' && GITHUB_DOC_EXT_RE.test(String(it.path || '')))) return false;
            if (!basePrefix) return true;
            const p = String(it.path || '');
            return p.startsWith(basePrefix);
        });
        const docs = [];
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const remotePath = String(f.path || '').trim();
            if (!remotePath) continue;
            const relPath = basePrefix && remotePath.startsWith(basePrefix)
                ? remotePath.slice(basePrefix.length)
                : remotePath;
            if (!relPath) continue;
            const contentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);
            const contentData = await githubApiRequest(contentUrl, {}, cfg.token);
            const text = decodeGithubBase64ToText(contentData && contentData.content ? contentData.content : '');
            const folderPath = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : 'root';
            docs.push({
                id: 'gh:' + relPath,
                path: relPath,
                remotePath: remotePath,
                title: getGithubDocTitleFromPath(relPath),
                folderPath: folderPath || 'root',
                content: text,
                sha: String(contentData && contentData.sha ? contentData.sha : ''),
                updatedAt: new Date().toISOString()
            });
        }
        await setAiSettings({
            githubEnabled: true,
            githubToken: cfg.token,
            githubRepo: cfg.repo,
            githubBranch: cfg.branch,
            githubCacheDocs: docs,
            githubLastPulledAt: new Date().toISOString()
        });
        setGithubFeedback('Pulled ' + docs.length + ' files from GitHub.', 'ok');
        showToast('GitHub pull complete: ' + docs.length + ' files');
        if (currentStorageSourceTab === 'github' || activeSidebarTab === 'files') renderDBList();
    } catch (e) {
        setGithubFeedback(String(e && e.message ? e.message : e), 'error');
        showToast('GitHub pull failed.');
    }
}

async function createGithubRepository() {
    const tokenInput = document.getElementById('github-token-input');
    const branchInput = document.getElementById('github-branch-input');
    const newRepoInput = document.getElementById('github-new-repo-name-input');
    const token = String(tokenInput && tokenInput.value ? tokenInput.value : '').trim();
    const branch = String(branchInput && branchInput.value ? branchInput.value : 'main').trim() || 'main';
    const newRepo = String(newRepoInput && newRepoInput.value ? newRepoInput.value : '').trim();
    if (!token || !newRepo) {
        setGithubFeedback('PAT와 새 저장소명을 입력하세요.', 'error');
        showToast('PAT and new repository name are required.');
        return;
    }
    setGithubFeedback('Creating repository...', 'info');
    try {
        const created = await githubApiRequest('https://api.github.com/user/repos', {
            method: 'POST',
            body: JSON.stringify({ name: newRepo, private: false, auto_init: true })
        }, token);
        const fullName = String(created && created.full_name ? created.full_name : '');
        const repoInput = document.getElementById('github-repo-input');
        if (repoInput && fullName) repoInput.value = fullName;
        await setAiSettings({
            githubEnabled: true,
            githubToken: token,
            githubRepo: fullName || (repoInput && repoInput.value ? repoInput.value.trim() : ''),
            githubBranch: branch
        });
        await applyGithubUiState();
        setGithubFeedback('Repository created: ' + fullName, 'ok');
        showToast('GitHub repository created.');
    } catch (e) {
        setGithubFeedback(String(e && e.message ? e.message : e), 'error');
        showToast('GitHub repository creation failed.');
    }
}

async function saveGithubSettingsFromModal() {
    const enabledEl = document.getElementById('ai-github-enabled');
    const tokenEl = document.getElementById('github-token-input');
    const repoEl = document.getElementById('github-repo-input');
    const branchEl = document.getElementById('github-branch-input');
    const enabled = !!(enabledEl && enabledEl.checked);
    const token = String(tokenEl && tokenEl.value ? tokenEl.value : '').trim();
    const repo = String(repoEl && repoEl.value ? repoEl.value : '').trim();
    const branch = String(branchEl && branchEl.value ? branchEl.value : 'main').trim() || 'main';
    await setAiSettings({
        githubEnabled: enabled,
        githubToken: token,
        githubRepo: repo,
        githubBranch: branch
    });
    await applyGithubUiState();
    setGithubFeedback('GitHub settings saved.', 'ok');
    showToast('GitHub settings saved.');
}

async function loadFromGithubCache(path) {
    const target = String(path || '').trim();
    if (!target) return;
    const canProceed = await confirmSaveBeforeOpeningAnotherFile();
    if (!canProceed) {
        showToast('Open canceled.');
        return;
    }
    const settings = await getAiSettings() || {};
    const docs = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs : [];
    const doc = docs.find(function (d) { return String(d.path || '') === target; });
    if (!doc) {
        showToast('File not found in local GitHub cache. Pull first.');
        return;
    }
    currentDbDocId = null;
    setCurrentDocumentInfo((doc.title || 'github-doc') + '.md', doc.path || null);
    updateContent(doc.content || '');
    markPersistedState();
    showToast('Loaded from GitHub cache.');
    if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
}

async function pushDocToGithub(docId) {
    const id = String(docId || '').trim();
    if (!id) return;
    const settings = await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        showToast('Set GitHub token/repo/branch first.');
        return;
    }

    const tx = db.transaction(['documents', 'folders'], 'readonly');
    const docsStore = tx.objectStore('documents');
    const foldersStore = tx.objectStore('folders');
    const doc = await new Promise(function (resolve) {
        const req = docsStore.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
    });
    if (!doc) {
        showToast('Document not found.');
        return;
    }

    const folder = await new Promise(function (resolve) {
        const req = foldersStore.get(String(doc.folderId || 'root'));
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
    });
    const folderName = folder && String(folder.id || '') !== 'root'
        ? String(folder.name || '').trim().replace(/[\\/:*?"<>|]+/g, '_')
        : '';
    const docName = String(doc.title || 'untitled').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'untitled';
    const path = folderName ? (folderName + '/' + docName + '.md') : (docName + '.md');
    const remotePath = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path;
    const getContentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);

    try {
        let existingSha = '';
        try {
            const existing = await githubApiRequest(getContentUrl, {}, cfg.token);
            existingSha = String(existing && existing.sha ? existing.sha : '');
        } catch (e) {
            const status = Number(e && e.status ? e.status : 0);
            const msg = String(e && e.message ? e.message : '').toLowerCase();
            const notFound = status === 404 || msg.includes('404') || msg.includes('not found');
            if (!notFound) throw e;
        }

        const body = {
            message: 'push: ' + docName + ' (' + new Date().toISOString() + ')',
            content: encodeTextToGithubBase64(doc.content || ''),
            branch: cfg.branch
        };
        if (existingSha) body.sha = existingSha;

        const putUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/');
        const pushed = await githubApiRequest(putUrl, {
            method: 'PUT',
            body: JSON.stringify(body)
        }, cfg.token);

        const nextCache = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
        const idx = nextCache.findIndex(function (d) { return String(d.path || '') === path; });
        const entry = {
            id: 'gh:' + path,
            path: path,
            remotePath: remotePath,
            title: getGithubDocTitleFromPath(path),
            folderPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'root',
            content: String(doc.content || ''),
            sha: String(pushed && pushed.content && pushed.content.sha ? pushed.content.sha : ''),
            updatedAt: new Date().toISOString()
        };
        if (idx >= 0) nextCache[idx] = entry;
        else nextCache.push(entry);

        await setAiSettings({ githubCacheDocs: nextCache });
        showToast('Pushed to GitHub: ' + remotePath);
        if (currentStorageSourceTab === 'github') renderDBList();
    } catch (e) {
        showToast('GitHub push failed: ' + String(e && e.message ? e.message : e));
    }
}

function isGithubExportEnabled() {
    const enabledEl = document.getElementById('ai-github-enabled');
    const tokenEl = document.getElementById('github-token-input');
    const repoEl = document.getElementById('github-repo-input');
    const branchEl = document.getElementById('github-branch-input');
    const enabled = !!(enabledEl && enabledEl.checked);
    const token = String(tokenEl && tokenEl.value ? tokenEl.value : '').trim();
    const repo = String(repoEl && repoEl.value ? repoEl.value : '').trim();
    const branch = String(branchEl && branchEl.value ? branchEl.value : '').trim();
    return !!(enabled && token && repo && branch);
}

async function pushCurrentContentToGithub() {
    const settings = await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        showToast('Set GitHub token/repo/branch first.');
        return false;
    }
    if (currentDbDocId) {
        await pushDocToGithub(currentDbDocId);
        return true;
    }

    let fileName = String(currentFileName || 'untitled.md').trim().replace(/[/\\:*?"<>|]+/g, '_');
    if (!fileName) fileName = 'untitled.md';
    if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += '.md';
    const path = fileName;
    const remotePath = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path;
    const getContentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);

    try {
        let existingSha = '';
        try {
            const existing = await githubApiRequest(getContentUrl, {}, cfg.token);
            existingSha = String(existing && existing.sha ? existing.sha : '');
        } catch (e) {
            const status = Number(e && e.status ? e.status : 0);
            const msg = String(e && e.message ? e.message : '').toLowerCase();
            const notFound = status === 404 || msg.includes('404') || msg.includes('not found');
            if (!notFound) throw e;
        }

        const body = {
            message: 'export push: ' + fileName + ' (' + new Date().toISOString() + ')',
            content: encodeTextToGithubBase64(currentMarkdown || ''),
            branch: cfg.branch
        };
        if (existingSha) body.sha = existingSha;

        const putUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/');
        const pushed = await githubApiRequest(putUrl, {
            method: 'PUT',
            body: JSON.stringify(body)
        }, cfg.token);

        const nextCache = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
        const idx = nextCache.findIndex(function (d) { return String(d.path || '') === path; });
        const entry = {
            id: 'gh:' + path,
            path: path,
            remotePath: remotePath,
            title: getGithubDocTitleFromPath(path),
            folderPath: 'root',
            content: String(currentMarkdown || ''),
            sha: String(pushed && pushed.content && pushed.content.sha ? pushed.content.sha : ''),
            updatedAt: new Date().toISOString()
        };
        if (idx >= 0) nextCache[idx] = entry;
        else nextCache.push(entry);
        await setAiSettings({ githubCacheDocs: nextCache });
        showToast('Pushed to GitHub: ' + remotePath);
        return true;
    } catch (e) {
        showToast('GitHub push failed: ' + String(e && e.message ? e.message : e));
        return false;
    }
}

function renderInDbList(listEl, searchTerm, githubReady) {
    const txFolders = db.transaction('folders', 'readonly');
    return new Promise(function (resolve) {
        const folderReq = txFolders.objectStore('folders').getAll();
        folderReq.onsuccess = async function () {
            const folders = Array.isArray(folderReq.result) ? folderReq.result : [];
            const txDocs = db.transaction('documents', 'readonly');
            const docs = await new Promise(function (r) {
                const req = txDocs.objectStore('documents').getAll();
                req.onsuccess = function () { r(Array.isArray(req.result) ? req.result : []); };
                req.onerror = function () { r([]); };
            });
            const shortText = function (text, n) { return Array.from(String(text || '').trim()).slice(0, n).join(''); };

            folders.forEach(function (folder) {
                const folderDocs = docs.filter(function (d) {
                    return d.folderId === folder.id && String(d.title || '').toLowerCase().includes(searchTerm);
                });
                const folderDisplayName = folder.id === 'root' ? ROOT_FOLDER_NAME : String(folder.name || 'Folder');
                const collapsedByState = isFolderCollapsed(folder.id);
                const isCollapsedFolder = !searchTerm && collapsedByState;

                const folderDiv = document.createElement('div');
                folderDiv.className = 'mb-2';
                const folderHeader = document.createElement('div');
                folderHeader.className = 'flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded ' + (isSidebarCollapsed ? 'justify-center' : '');
                const folderDeleteBtn = folder.id === 'root'
                    ? ''
                    : '<button onclick="event.stopPropagation(); deleteFolderFromDB(\'' + escapeHtmlText(folder.id) + '\')" class="ml-auto text-[10px] px-1 py-0.5 rounded border border-red-200 dark:border-red-700 text-red-500 dark:text-red-400 hover:bg-red-600 hover:text-white" title="폴더 삭제">x</button>';
                folderHeader.innerHTML = ''
                    + '<i data-lucide="' + (isCollapsedFolder ? 'chevron-right' : 'chevron-down') + '" class="w-3 h-3"></i>'
                    + '<i data-lucide="folder" class="w-3 h-3"></i>'
                    + '<span class="sidebar-text">' + escapeHtmlText(folderDisplayName) + '</span>'
                    + folderDeleteBtn;
                folderHeader.addEventListener('click', function () { toggleFolderCollapse(folder.id); });
                folderDiv.appendChild(folderHeader);

                const docContainer = document.createElement('div');
                docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'pl-2 space-y-1') + (isCollapsedFolder ? ' hidden' : '');

                folderDocs.forEach(function (doc) {
                    const docItem = document.createElement('div');
                    docItem.className = isSidebarCollapsed
                        ? 'group w-12 h-6 mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center'
                        : 'group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer';
                    docItem.title = String(doc.title || '');
                    docItem.onclick = function () { loadFromDB(doc.id); };

                    const pushBtn = githubReady
                        ? '<button onclick="event.stopPropagation(); pushDocToGithub(\'' + escapeHtmlText(doc.id) + '\')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">github</button>'
                        : '';

                    docItem.innerHTML = ''
                        + '<div class="flex flex-col gap-1 doc-item-inner">'
                        + '<div class="flex items-center gap-2">'
                        + '<i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i>'
                        + '<span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ' + (isSidebarCollapsed ? '' : 'sidebar-text') + '">'
                        + escapeHtmlText(isSidebarCollapsed ? shortText(doc.title, 3) : doc.title)
                        + '</span>'
                        + '</div>'
                        + '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns">'
                        + '<button onclick="event.stopPropagation(); loadFromDB(\'' + escapeHtmlText(doc.id) + '\')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">열기</button>'
                        + '<button onclick="event.stopPropagation(); openMoveModal(\'' + escapeHtmlText(doc.id) + '\')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">이동</button>'
                        + pushBtn
                        + '<button onclick="event.stopPropagation(); deleteFromDB(\'' + escapeHtmlText(doc.id) + '\')" class="text-[10px] bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold hover:bg-red-600 hover:text-white ml-auto">X</button>'
                        + '</div>'
                        + '</div>';
                    docContainer.appendChild(docItem);
                });

                if (folderDocs.length > 0 || searchTerm === '') {
                    folderDiv.appendChild(docContainer);
                    listEl.appendChild(folderDiv);
                }
            });
            resolve();
        };
        folderReq.onerror = function () { resolve(); };
    });
}

async function renderGithubCachedList(listEl, searchTerm) {
    const settings = await getAiSettings() || {};
    const docs = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
    const filtered = docs.filter(function (d) {
        const title = String(d && d.title ? d.title : '').toLowerCase();
        const path = String(d && d.path ? d.path : '').toLowerCase();
        return !searchTerm || title.includes(searchTerm) || path.includes(searchTerm);
    });
    const groups = new Map();
    filtered.forEach(function (doc) {
        const key = String(doc && doc.folderPath ? doc.folderPath : 'root') || 'root';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(doc);
    });
    const keys = Array.from(groups.keys()).sort(function (a, b) { return a.localeCompare(b); });
    keys.forEach(function (folderPath) {
        const items = groups.get(folderPath) || [];
        const folderId = 'gh-folder:' + folderPath;
        const isCollapsedFolder = !searchTerm && isFolderCollapsed(folderId);

        const folderDiv = document.createElement('div');
        folderDiv.className = 'mb-2';
        const folderHeader = document.createElement('div');
        folderHeader.className = 'flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded ' + (isSidebarCollapsed ? 'justify-center' : '');
        folderHeader.innerHTML = ''
            + '<i data-lucide="' + (isCollapsedFolder ? 'chevron-right' : 'chevron-down') + '" class="w-3 h-3"></i>'
            + '<i data-lucide="folder-git-2" class="w-3 h-3"></i>'
            + '<span class="sidebar-text">' + escapeHtmlText(folderPath === 'root' ? 'ROOT' : folderPath) + '</span>';
        folderHeader.addEventListener('click', function () { toggleFolderCollapse(folderId); });
        folderDiv.appendChild(folderHeader);

        const docContainer = document.createElement('div');
        docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'pl-2 space-y-1') + (isCollapsedFolder ? ' hidden' : '');
        items.forEach(function (doc) {
            const path = String(doc && doc.path ? doc.path : '');
            const title = String(doc && doc.title ? doc.title : getGithubDocTitleFromPath(path));
            const shortTitle = Array.from(title).slice(0, 3).join('');
            const docItem = document.createElement('div');
            docItem.className = isSidebarCollapsed
                ? 'group w-12 h-6 mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center'
                : 'group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer';
            docItem.title = path || title;
            docItem.onclick = function () { loadFromGithubCache(path); };
            docItem.innerHTML = ''
                + '<div class="flex flex-col gap-1 doc-item-inner">'
                + '<div class="flex items-center gap-2">'
                + '<i data-lucide="file-code-2" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i>'
                + '<span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ' + (isSidebarCollapsed ? '' : 'sidebar-text') + '">'
                + escapeHtmlText(isSidebarCollapsed ? shortTitle : title)
                + '</span>'
                + '</div>'
                + '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns">'
                + '<button onclick="event.stopPropagation(); loadFromGithubCache(\'' + escapeHtmlText(path) + '\')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">열기</button>'
                + '</div>'
                + '</div>';
            docContainer.appendChild(docItem);
        });

        folderDiv.appendChild(docContainer);
        listEl.appendChild(folderDiv);
    });

    if (!keys.length) {
        const empty = document.createElement('div');
        empty.className = 'px-2 py-4 text-xs text-slate-500 dark:text-slate-400';
        empty.textContent = 'GitHub 목록이 비어 있습니다. sync 버튼으로 pull 하세요.';
        listEl.appendChild(empty);
    }
}

async function renderDBList() {
    const listEl = document.getElementById('db-list');
    if (!listEl) return;
    const searchInput = document.getElementById('db-search');
    const searchTerm = String(searchInput && searchInput.value ? searchInput.value : '').toLowerCase();
    listEl.innerHTML = '';

    const settings = await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    const githubReady = !!cfg.enabled;

    if (currentStorageSourceTab === 'github' && cfg.enabled) {
        await renderGithubCachedList(listEl, searchTerm);
    } else {
        await renderInDbList(listEl, searchTerm, githubReady);
    }
    lucide.createIcons();
}

async function loadFromDB(id) {
    const canProceed = await confirmSaveBeforeOpeningAnotherFile();
    if (!canProceed) {
        showToast('Open canceled.');
        return;
    }
    const tx = db.transaction('documents', 'readonly');
    const doc = await new Promise(r => {
        const req = tx.objectStore('documents').get(id);
        req.onsuccess = () => r(req.result);
    });
    if (doc) {
        currentDbDocId = String(id || '');
        if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
            window.GoogleDocs.handleActiveDocumentChanged();
        }
        currentFileName = doc.title + ".md";
        fileNameDisplay.textContent = currentFileName;
        updateContent(doc.content);
        markPersistedState();
        showToast("Loaded from inDB.");
        if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
    }
}

let deleteTargetId = null;

function deleteFromDB(id) {
    deleteTargetId = id;
    const modal = document.getElementById('delete-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    deleteTargetId = null;
}

function confirmDeleteModal() {
    if (!deleteTargetId) return;
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').delete(deleteTargetId);
    tx.oncomplete = () => {
        showToast("Deleted.");
        renderDBList();
        closeDeleteModal();
    };
}

// --- Move Folder Logic ---
async function openMoveModal(docId) {
    movingDocId = docId;
    const tx = db.transaction('folders', 'readonly');
    const folders = await new Promise(r => {
        const req = tx.objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });

    const list = document.getElementById('folder-choice-list');
    list.innerHTML = "";
    folders.forEach(f => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-md transition-colors flex items-center gap-2";
        btn.innerHTML = `<i data-lucide="folder" class="w-4 h-4 text-slate-400 dark:text-slate-500"></i> ${f.name}`;
        btn.onclick = () => moveDocToFolder(docId, f.id);
        list.appendChild(btn);
    });

    document.getElementById('move-modal').classList.remove('hidden');
    document.getElementById('move-modal').classList.add('flex');
    lucide.createIcons();
}

function closeMoveModal() {
    document.getElementById('move-modal').classList.add('hidden');
    document.getElementById('move-modal').classList.remove('flex');
    movingDocId = null;
}

async function moveDocToFolder(docId, folderId) {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const doc = await new Promise(r => {
        const req = store.get(docId);
        req.onsuccess = () => r(req.result);
    });
    if (doc) {
        doc.folderId = folderId;
        store.put(doc);
    }
    tx.oncomplete = () => {
        showToast("Moved document to selected folder.");
        closeMoveModal();
        renderDBList();
    };
}

// --- AutoSave & Recovery ---
function performAutoSave() {
    if (!db) return;
    const tx = db.transaction('autosave', 'readwrite');
    tx.objectStore('autosave').put({
        id: 'last_work',
        content: currentMarkdown,
        title: currentFileName,
        timestamp: Date.now()
    });
}

async function clearUnusedCache() {
    const ok = window.confirm('Clear temporary cache now?\nDocuments/folders/settings will not be deleted.');
    if (!ok) return;

    let removedCaches = 0;
    let removedAutosave = false;

    try {
        if (db) {
            const tx = db.transaction('autosave', 'readwrite');
            tx.objectStore('autosave').delete('last_work');
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            removedAutosave = true;
        }
    } catch (e) {}

    try {
        if (typeof caches !== 'undefined' && caches.keys) {
            const names = await caches.keys();
            for (let i = 0; i < names.length; i++) {
                try {
                    const deleted = await caches.delete(names[i]);
                    if (deleted) removedCaches += 1;
                } catch (e) {}
            }
        }
    } catch (e) {}

    try { revokeObjectUrls(viewerInternalImageObjectUrls); } catch (e) {}
    try { revokeObjectUrls(previewInternalImageObjectUrls); } catch (e) {}
    try {
        const preview = document.getElementById('img-insert-preview');
        if (preview) {
            preview.removeAttribute('src');
            preview.classList.add('hidden');
        }
    } catch (e) {}
    try { clearImageInsertInternalSavedState(); } catch (e) {}
    try { setImageInsertStatus('Temporary cache cleared.', false); } catch (e) {}

    const parts = [];
    if (removedAutosave) parts.push('autosave');
    if (removedCaches > 0) parts.push('browser cache ' + removedCaches + ' entries');
    if (parts.length === 0) parts.push('temporary object cache');
    showToast('Cache cleared: ' + parts.join(', '));
}

function applyScholarPaste(content) {
    if (content === undefined || content === null) return;
    const s = String(content);
    receivedExternalContent = true;
    currentMarkdown = s;
    if (editorTextarea) {
        editorTextarea.value = s;
        editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    renderMarkdown();
    renderTOC();
    performAutoSave();
    if (typeof showToast === 'function') showToast("Content pasted successfully.");
}

window.acceptScholarPaste = function (content, notebookLm) {
    notebookLmEqualsHrPreprocess = notebookLm !== false;
    applyScholarPaste(content);
};

function loadFromExternalContent(content, title, opts) {
    if (opts && typeof opts === 'object' && Object.prototype.hasOwnProperty.call(opts, 'notebookLmSeparators')) {
        notebookLmEqualsHrPreprocess = !!opts.notebookLmSeparators;
    } else {
        notebookLmEqualsHrPreprocess = false;
    }
    if (content !== undefined && content !== null) {
        currentMarkdown = String(content);
        if (editorTextarea) editorTextarea.value = currentMarkdown;
        renderMarkdown();
        renderTOC();
    }
    if (title) {
        currentFileName = String(title);
        if (fileNameDisplay) fileNameDisplay.textContent = currentFileName;
    }
    if (db) {
        const tx = db.transaction('autosave', 'readwrite');
        tx.objectStore('autosave').delete('last_work');
    }
    markPersistedState();
}

function tryLoadFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        let content = params.get('content');
        const encoded = params.get('encoded');
        const title = params.get('title') || params.get('name');
        if (content) {
            const decoded = (encoded === 'base64')
                ? (typeof atob === 'function' ? atob(content) : content)
                : decodeURIComponent(content);
            loadFromExternalContent(decoded, title || null, { notebookLmSeparators: false });
            if (typeof showToast === 'function') showToast('Content loaded from URL.');
            return true;
        }
    } catch (e) {}
    return false;
}

async function checkAutoSave() {
    const tx = db.transaction('autosave', 'readonly');
    const saved = await new Promise(r => {
        const req = tx.objectStore('autosave').get('last_work');
        req.onsuccess = () => r(req.result);
    });
    if (saved && saved.content.length > 50) {
        document.getElementById('recovery-modal').classList.remove('hidden');
        document.getElementById('recovery-modal').classList.add('flex');
    }
}

function applyRecovery() {
    const tx = db.transaction('autosave', 'readonly');
    tx.objectStore('autosave').get('last_work').onsuccess = (e) => {
        const data = e.target.result;
        if (data) {
            currentFileName = data.title;
            fileNameDisplay.textContent = currentFileName;
            updateContent(data.content);
            markPersistedState();
            showToast("Recovered unsaved work from the previous session.");
        }
        dismissRecovery();
    };
}

function dismissRecovery() {
    document.getElementById('recovery-modal').classList.add('hidden');
    document.getElementById('recovery-modal').classList.remove('flex');
    const tx = db.transaction('autosave', 'readwrite');
    tx.objectStore('autosave').delete('last_work');
}

function pasteFromClipboardAndDismiss() {
    document.getElementById('recovery-modal').classList.add('hidden');
    document.getElementById('recovery-modal').classList.remove('flex');
    const tx = db.transaction('autosave', 'readwrite');
    tx.objectStore('autosave').delete('last_work');

    updateContent('');
    if (!isEditMode) toggleMode('edit');
    showToast("Press Ctrl+V to paste your clipboard content.");

    requestAnimationFrame(() => {
        if (editorTextarea) editorTextarea.focus();
    });
}

function tidySeparatorSpacing(source) {
    const expandedLines = [];
    const sourceLines = String(source ?? '').split('\n');
    let inFencedCodeBlock = false;

    for (const sourceLine of sourceLines) {
        const trimmedSourceLine = sourceLine.trim();
        if (/^```/.test(trimmedSourceLine)) {
            inFencedCodeBlock = !inFencedCodeBlock;
            expandedLines.push(sourceLine);
            continue;
        }
        if (inFencedCodeBlock || !trimmedSourceLine.startsWith('- ')) {
            expandedLines.push(sourceLine);
            continue;
        }

        const normalizedLine = sourceLine
            .replace(/([:.;])\s+- (?=\S)/g, '$1\n- ')
            .replace(/\s{2,}- (?=\S)/g, '\n- ');
        expandedLines.push(...normalizedLine.split('\n'));
    }

    const lines = expandedLines;
    let changed = false;
    inFencedCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (/^```/.test(trimmed)) {
            inFencedCodeBlock = !inFencedCodeBlock;
            continue;
        }
        if (inFencedCodeBlock || !trimmed) continue;

        const normalizedLine = lines[i].replace(/\s+$/, '') + '  ';
        if (lines[i] !== normalizedLine) {
            lines[i] = normalizedLine;
            changed = true;
        }

        if (!/^-{20,}$/.test(trimmed)) continue;

        for (const neighborIndex of [i - 1, i + 1]) {
            if (neighborIndex < 0 || neighborIndex >= lines.length) continue;
            const neighborTrimmed = lines[neighborIndex].trim();
            if (!neighborTrimmed || /^```/.test(neighborTrimmed)) continue;
            const normalizedNeighbor = lines[neighborIndex].replace(/\s+$/, '') + '  ';
            if (lines[neighborIndex] !== normalizedNeighbor) {
                lines[neighborIndex] = normalizedNeighbor;
                changed = true;
            }
        }
    }

    for (let i = 1; i < lines.length; i++) {
        const curTrimmed = lines[i].trim();
        if (/^```/.test(curTrimmed)) {
            inFencedCodeBlock = !inFencedCodeBlock;
            continue;
        }
        if (inFencedCodeBlock) continue;
        if (!/^=+$/.test(curTrimmed)) continue;

                const prevTrimmed = lines[i - 1].trim();
        const prev2Trimmed = i >= 2 ? lines[i - 2].trim() : '';
        if (!prevTrimmed) continue;
        if (prev2Trimmed) {
            lines.splice(i, 0, '');
            changed = true;
            i += 1;
        }
    }

    let value = lines.join('\n');
    if (typeof specialTRT !== 'undefined' && typeof specialTRT.prepareForTidy === 'function') {
        const trtValue = specialTRT.prepareForTidy(value);
        if (trtValue !== value) changed = true;
        value = trtValue;
    }

    return {
        value,
        changed
    };
}

function tidySeparatorSpacingInEditor() {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const scrollTop = editorTextarea.scrollTop;
    const scrollLeft = editorTextarea.scrollLeft;
    const selectionDirection = editorTextarea.selectionDirection || 'none';
    const hasSelection = start !== end;
    const sourceText = hasSelection
        ? editorTextarea.value.substring(start, end)
        : editorTextarea.value;
    const result = tidySeparatorSpacing(sourceText);

    if (!result.changed) {
        showToast('No spacing changes were needed.');
        return;
    }

    if (hasSelection) {
        const fullText = editorTextarea.value;
        editorTextarea.value = fullText.substring(0, start) + result.value + fullText.substring(end);
        currentMarkdown = editorTextarea.value;
    } else {
        editorTextarea.value = result.value;
        currentMarkdown = result.value;
    }
    editorTextarea.focus();
    if (hasSelection) {
        editorTextarea.setSelectionRange(start, start + result.value.length, selectionDirection);
    } else {
        editorTextarea.setSelectionRange(start, end, selectionDirection);
    }
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.scrollLeft = scrollLeft;
    requestAnimationFrame(function () {
        if (!editorTextarea) return;
        editorTextarea.scrollTop = scrollTop;
        editorTextarea.scrollLeft = scrollLeft;
    });
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    showToast('Normalized separator spacing and hard-break formatting.');
}

// --- Helper Insertion (Modal) ---
function insertAtCursor(type) {
    if (!isEditMode || !editorTextarea) return;
    if (type === 'code') {
        insertFencedCodeBlock('');
        return;
    }
    if (type === 'mermaid') {
        insertFencedCodeBlock('mermaid');
        return;
    }
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);
    const currentScrollTop = editorTextarea.scrollTop;

    let before = '';
    let after = '';
    let placeholder = '';

    switch (type) {
        case 'bold':
            before = '**';
            after = '**';
            placeholder = 'bold text';
            break;
        case 'italic':
            before = '*';
            after = '*';
            placeholder = 'italic text';
            break;
        case 'quote':
            before = '\n> ';
            placeholder = 'quote';
            break;
        case 'br':
            before = enterButtonInsertBr ? '<br>' : '  \n';
            break;
        default:
            return;
    }

    const content = selectedText || placeholder;
    const replacement = before + content + after;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = currentScrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    if (!selectedText && placeholder) {
        editorTextarea.setSelectionRange(start + before.length, start + before.length + content.length);
    } else {
        editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }
}
function applyInlineFormatFromViewerSelection(type) {
    const selection = (typeof window.getSelection === 'function') ? window.getSelection() : null;
    const selectedText = String(selection && selection.toString ? selection.toString() : '');
    if (!selectedText || !selectedText.trim()) {
        showToast('보기 모드에서 먼저 텍스트를 선택하세요.');
        return false;
    }

    const source = String(currentMarkdown || (editorTextarea ? editorTextarea.value : ''));
    if (!source) {
        showToast('현재 문서 내용이 비어 있습니다.');
        return false;
    }

    const idx = source.indexOf(selectedText);
    if (idx < 0) {
        showToast('선택 텍스트를 원문에서 찾지 못했습니다.');
        return false;
    }

    const isBold = type === 'bold';
    const before = isBold ? '**' : '*';
    const after = before;
    const replacement = before + selectedText + after;
    const nextText = source.substring(0, idx) + replacement + source.substring(idx + selectedText.length);

    currentMarkdown = nextText;
    if (editorTextarea) editorTextarea.value = nextText;
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    if (selection && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
    showToast(isBold ? 'Bold 적용 완료' : 'Italic 적용 완료');
    return true;
}
function insertFencedCodeBlock(language) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);
    const currentScrollTop = editorTextarea.scrollTop;
    const currentScrollLeft = editorTextarea.scrollLeft;
    const lang = String(language || '').trim();
    const fenceOpen = '```' + lang + '\n';
    const placeholder = lang === 'mermaid'
        ? 'graph TD\n  A[Start] --> B[End]'
        : 'code';
    const content = selectedText || placeholder;
    const replacement = fenceOpen + content + '\n```';

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = currentScrollTop;
    editorTextarea.scrollLeft = currentScrollLeft;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    if (selectedText) {
        editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    } else {
        const selectStart = start + fenceOpen.length;
        editorTextarea.setSelectionRange(selectStart, selectStart + content.length);
    }
}
function applyHeading(level) {
    if (!isEditMode) return;
    const text = editorTextarea.value;
    const cursor = editorTextarea.selectionStart;

    let lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = text.indexOf('\n', cursor);
    if (lineEnd === -1) lineEnd = text.length;

    let lineText = text.substring(lineStart, lineEnd);
    lineText = lineText.replace(/^#+\s*/, '');

    const prefix = '#'.repeat(level) + ' ';
    const replacement = prefix + lineText;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(lineStart, lineEnd);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;

    const newCursor = lineStart + prefix.length + lineText.length;
    editorTextarea.setSelectionRange(newCursor, newCursor);

    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function handleTableInsertion() {
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);
    const scrollTop = editorTextarea.scrollTop;

    let replacement = "";

    if (selectedText) {
        const lines = selectedText.trim().split('\n');

        const processRow = (line) => {
            let sep = '\t';
            if (line.includes('\t')) sep = '\t';
            else if (line.includes(',')) sep = ',';
            else if (line.includes(';')) sep = ';';

            if (sep === '\t' && !line.includes('\t')) {
                return `| ${line.trim()} |`;
            }

            const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
            return `| ${cols.join(' | ')} |`;
        };

        const generateDivider = (line) => {
            let sep = '\t';
            if (line.includes('\t')) sep = '\t';
            else if (line.includes(',')) sep = ',';
            else if (line.includes(';')) sep = ';';
            if (sep === '\t' && !line.includes('\t')) return `|---|`;

            const cols = line.split(sep);
            return `|${cols.map(() => '---').join('|')}|`;
        };

        if (lines.length > 0) {
            replacement += processRow(lines[0]) + '\n';
            replacement += generateDivider(lines[0]) + '\n';
            for (let i = 1; i < lines.length; i++) {
                replacement += processRow(lines[i]) + '\n';
            }
        }
    } else {
        replacement = `\n| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n| Row 1 | Row 2 | Row 3 |\n| Row 4 | Row 5 | Row 6 |\n`;
    }

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function insertListAtSelection(kind) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const scrollTop = editorTextarea.scrollTop;
    const scrollLeft = editorTextarea.scrollLeft;
    const isNumbered = kind === 'number';
    const bulletRe = /^(\s*)-\s+/;
    const numberRe = /^(\s*)\d+\.\s+/;
    const listPrefixRe = /^(\s*)(?:-\s+|\d+\.\s+)/;

    if (start === end) {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = text.indexOf('\n', start);
        if (lineEnd === -1) lineEnd = text.length;
        const lineText = text.substring(lineStart, lineEnd);
        let replacement = lineText;
        const isApplied = isNumbered ? numberRe.test(lineText) : bulletRe.test(lineText);
        if (isApplied) {
            replacement = lineText.replace(isNumbered ? numberRe : bulletRe, '$1');
        } else {
            const cleaned = lineText.replace(listPrefixRe, '$1');
            replacement = (isNumbered ? '1. ' : '- ') + cleaned;
        }

        editorTextarea.focus();
        editorTextarea.setSelectionRange(lineStart, lineEnd);
        document.execCommand('insertText', false, replacement);
        currentMarkdown = editorTextarea.value;
        editorTextarea.scrollTop = scrollTop;
        editorTextarea.scrollLeft = scrollLeft;
        const cursorOffset = Math.max(0, start - lineStart);
        const nextPos = lineStart + Math.min(cursorOffset + (replacement.length - lineText.length), replacement.length);
        editorTextarea.setSelectionRange(nextPos, nextPos);
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        return;
    }

    const blockStart = text.lastIndexOf('\n', start - 1) + 1;
    let blockEnd = text.indexOf('\n', end);
    if (blockEnd === -1) blockEnd = text.length;

    const blockText = text.substring(blockStart, blockEnd);
    const lines = blockText.split('\n');
    const nonEmptyLines = lines.filter(function (line) { return line.trim().length > 0; });
    const allApplied = nonEmptyLines.length > 0 && nonEmptyLines.every(function (line) {
        return isNumbered ? numberRe.test(line) : bulletRe.test(line);
    });

    let numberIndex = 1;
    const mapped = lines.map(function (line) {
        if (line.trim().length === 0) return line;
        if (allApplied) {
            return line.replace(isNumbered ? numberRe : bulletRe, '$1');
        }
        const cleaned = line.replace(listPrefixRe, '$1');
        if (isNumbered) {
            const value = numberIndex + '. ' + cleaned;
            numberIndex += 1;
            return value;
        }
        return '- ' + cleaned;
    });
    const replacement = mapped.join('\n');
    const next = text.substring(0, blockStart) + replacement + text.substring(blockEnd);

    editorTextarea.value = next;
    currentMarkdown = next;
    editorTextarea.focus();
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.scrollLeft = scrollLeft;
    editorTextarea.setSelectionRange(blockStart, blockStart + replacement.length);
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
}

function insertLiteralAtCursor(literal) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const currentScrollTop = editorTextarea.scrollTop;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, literal);
    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = currentScrollTop;
    editorTextarea.setSelectionRange(start + literal.length, start + literal.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function insertFootnoteTemplate() {
    if (!isEditMode || !editorTextarea) {
        showToast('Edit mode only.');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const numberRegex = /\[\^(\d+)\]/g;
    let maxNumber = 0;
    let m;
    while ((m = numberRegex.exec(text)) !== null) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
    }
    const nextNumber = maxNumber + 1;
    const marker = '[^' + nextNumber + ']';
    const footnoteDef = marker + ': Footnote content.';

    const defRegex = new RegExp('^\\[\\^' + nextNumber + '\\]:', 'm');
    editorTextarea.focus();

    // Insert marker at current selection via undo-friendly path.
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, marker);
    let workingText = editorTextarea.value;

    // Append definition only when missing.
    if (!defRegex.test(workingText)) {
        const appendText = (workingText.endsWith('\n') ? '' : '\n') + '\n' + footnoteDef;
        const tail = editorTextarea.value.length;
        editorTextarea.setSelectionRange(tail, tail);
        document.execCommand('insertText', false, appendText);
        workingText = editorTextarea.value;
    }

    currentMarkdown = workingText;
    const newPos = start + marker.length;
    editorTextarea.setSelectionRange(newPos, newPos);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('Footnote inserted.');
}
function convertSelectionPatternToTable() {
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const selectedText = text.substring(start, end);

    if (!selectedText || !selectedText.trim()) {
        showToast('Select text first, then convert it to a table.');
        return;
    }

    const lines = selectedText
        .split('\n')
        .map(function (line) { return line.trim(); })
        .filter(function (line) { return line.length > 0; });

    if (lines.length === 0) {
        showToast('No valid lines found in selection.');
        return;
    }

    function detectSeparator(rows) {
        const hasPipe = rows.every(function (r) { return (r.match(/\|/g) || []).length >= 1; });
        if (hasPipe) return 'pipe';
        const hasTab = rows.every(function (r) { return r.includes('\t'); });
        if (hasTab) return 'tab';
        const hasComma = rows.every(function (r) { return r.includes(','); });
        if (hasComma) return 'comma';
        const hasSemicolon = rows.every(function (r) { return r.includes(';'); });
        if (hasSemicolon) return 'semicolon';
        const hasMultiSpace = rows.every(function (r) { return /\s{2,}/.test(r); });
        if (hasMultiSpace) return 'multispace';
        return 'space';
    }

    function splitCells(line, sep) {
        let cells = [];
        if (sep === 'pipe') {
            const trimmed = line.replace(/^\|+/, '').replace(/\|+$/, '');
            cells = trimmed.split('|');
        } else if (sep === 'tab') {
            cells = line.split('\t');
        } else if (sep === 'comma') {
            cells = line.split(',');
        } else if (sep === 'semicolon') {
            cells = line.split(';');
        } else if (sep === 'multispace') {
            cells = line.split(/\s{2,}/);
        } else {
            cells = line.split(/\s+/);
        }

        return cells
            .map(function (c) { return c.trim().replace(/^["']|["']$/g, ''); })
            .filter(function (c, idx, arr) { return c.length > 0 || idx < arr.length - 1; });
    }

    function isDividerRow(cells) {
        if (!cells || cells.length === 0) return false;
        return cells.every(function (cell) {
            const t = cell.replace(/\s+/g, '');
            return /^:?-{3,}:?$/.test(t);
        });
    }

    const sep = detectSeparator(lines);
    let rows = lines.map(function (line) { return splitCells(line, sep); }).filter(function (cells) { return cells.length > 0; });
    if (rows.length === 0) {
        showToast('Could not parse table-like data from selection.');
        return;
    }

    if (rows.length >= 2 && isDividerRow(rows[1])) {
        rows.splice(1, 1);
    }

    const maxCols = rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
    if (maxCols < 2) {
        showToast('At least 2 columns are required. Try tab/comma/semicolon/pipe separated text.');
        return;
    }

    rows = rows.map(function (row) {
        const padded = row.slice(0, maxCols);
        while (padded.length < maxCols) padded.push('');
        return padded;
    });

    const header = rows[0];
    const bodyRows = rows.slice(1);
    const divider = '| ' + new Array(maxCols).fill('---').join(' | ') + ' |';
    let replacement = '| ' + header.join(' | ') + ' |\n' + divider;
    if (bodyRows.length > 0) {
        replacement += '\n' + bodyRows.map(function (row) { return '| ' + row.join(' | ') + ' |'; }).join('\n');
    }

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function convertSelectionMarkdownToHtml() {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
        showToast('Markdown parser is not available.');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    if (start === end) {
        showToast('Select markdown text first to convert it to HTML.');
        return;
    }

    const selectedText = editorTextarea.value.substring(start, end);
    const convertedHtml = String(marked.parse(selectedText)).trim();
    if (!convertedHtml) {
        showToast('Failed to generate HTML from selection.');
        return;
    }

    const scrollTop = editorTextarea.scrollTop;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, convertedHtml);

    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.setSelectionRange(start, start + convertedHtml.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('Converted selected markdown to HTML.');
}

function openTextStyleModal() {
    const modal = document.getElementById('text-style-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeTextStyleModal() {
    const modal = document.getElementById('text-style-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function openMermaidEditorModal() {
    const modal = document.getElementById('mermaid-editor-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    bindMermaidEditorModalDrag();
}

function closeMermaidEditorModal() {
    const modal = document.getElementById('mermaid-editor-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

let mermaidEditorModalDragBound = false;
let mermaidEditorModalFullscreen = false;
let mermaidEditorModalDockRight = false;

function applyMermaidEditorDockRight(docked) {
    const panel = document.getElementById('mermaid-editor-modal-panel');
    const dockBtn = document.getElementById('mermaid-editor-dock-right-btn');
    if (!panel) return;
    mermaidEditorModalDockRight = !!docked;
    if (dockBtn) dockBtn.textContent = mermaidEditorModalDockRight ? '<<' : '>>';
    if (mermaidEditorModalDockRight) {
        mermaidEditorModalFullscreen = false;
        panel.style.transform = 'none';
        panel.style.left = 'auto';
        panel.style.top = '8px';
        panel.style.right = '8px';
        panel.style.bottom = '8px';
        panel.style.width = 'min(960px, 48vw)';
        panel.style.height = 'calc(100vh - 16px)';
        panel.style.maxWidth = '98vw';
        panel.style.maxHeight = 'calc(100vh - 16px)';
        panel.style.resize = 'both';
        return;
    }
    panel.style.left = '50%';
    panel.style.top = '64px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = 'min(1200px, 96vw)';
    panel.style.height = 'min(860px, 92vh)';
    panel.style.transform = 'translateX(-50%)';
    panel.style.maxWidth = '98vw';
    panel.style.maxHeight = '95vh';
    panel.style.resize = 'both';
}

function toggleMermaidEditorDockRight() {
    applyMermaidEditorDockRight(!mermaidEditorModalDockRight);
}

function bindMermaidEditorModalDrag() {
    if (mermaidEditorModalDragBound) return;
    const panel = document.getElementById('mermaid-editor-modal-panel');
    const header = document.getElementById('mermaid-editor-modal-header');
    if (!panel || !header) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener('mousedown', function (event) {
        if (event.button !== 0 || mermaidEditorModalFullscreen || mermaidEditorModalDockRight) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.left = startLeft + 'px';
        panel.style.top = startTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
        event.preventDefault();
    });

    window.addEventListener('mousemove', function (event) {
        if (!dragging) return;
        const nextLeft = Math.max(4, startLeft + (event.clientX - startX));
        const nextTop = Math.max(4, startTop + (event.clientY - startY));
        panel.style.left = nextLeft + 'px';
        panel.style.top = nextTop + 'px';
    });

    window.addEventListener('mouseup', function () {
        dragging = false;
    });

    mermaidEditorModalDragBound = true;
}

function toggleMermaidEditorFullscreen() {
    const panel = document.getElementById('mermaid-editor-modal-panel');
    if (!panel) return;
    if (mermaidEditorModalDockRight) applyMermaidEditorDockRight(false);
    mermaidEditorModalFullscreen = !mermaidEditorModalFullscreen;
    if (mermaidEditorModalFullscreen) {
        panel.style.resize = 'none';
        panel.style.left = '8px';
        panel.style.top = '8px';
        panel.style.right = '8px';
        panel.style.bottom = '8px';
        panel.style.width = 'auto';
        panel.style.height = 'auto';
        panel.style.transform = 'none';
        return;
    }
    panel.style.left = '50%';
    panel.style.top = '64px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = 'min(1200px, 96vw)';
    panel.style.height = 'min(860px, 92vh)';
    panel.style.transform = 'translateX(-50%)';
    panel.style.resize = 'both';
}

function insertMermaidBlockFromExternal(codeText) {
    const raw = String(codeText || '').trim();
    if (!raw) {
        showToast('삽입할 Mermaid 코드가 비어 있습니다.');
        return;
    }
    if (!isEditMode) toggleMode('edit');
    if (!editorTextarea) return;

    const start = typeof editorTextarea.selectionStart === 'number' ? editorTextarea.selectionStart : editorTextarea.value.length;
    const end = typeof editorTextarea.selectionEnd === 'number' ? editorTextarea.selectionEnd : start;
    const replacement = '```mermaid\n' + raw + '\n```\n';

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('Mermaid 코드가 문서에 삽입되었습니다.');
}

window.addEventListener('message', function (event) {
    const data = event && event.data ? event.data : null;
    if (!data || data.type !== 'mdv-insert-mermaid') return;
    insertMermaidBlockFromExternal(data.code || '');
});

function applyTextStyleToSelection() {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    if (start === end) {
        showToast('Select text first to apply style.');
        return;
    }

    const fontSizeEnabled = !!document.getElementById('style-enable-font-size')?.checked;
    const fontSizeValue = document.getElementById('style-font-size')?.value || '';
    const textColorEnabled = !!document.getElementById('style-enable-text-color')?.checked;
    const textColorValue = document.getElementById('style-text-color')?.value || '#000000';
    const bgColorEnabled = !!document.getElementById('style-enable-highlight')?.checked;
    const bgColorValue = document.getElementById('style-highlight-color')?.value || '#fff59d';
    const boldEnabled = !!document.getElementById('style-enable-bold')?.checked;
    const italicEnabled = !!document.getElementById('style-enable-italic')?.checked;

    const selected = editorTextarea.value.substring(start, end);
    const escaped = selected
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    let html = escaped;
    const styleParts = [];
    if (fontSizeEnabled && fontSizeValue) styleParts.push('font-size:' + fontSizeValue);
    if (textColorEnabled) styleParts.push('color:' + textColorValue);
    if (bgColorEnabled) styleParts.push('background-color:' + bgColorValue);

    if (styleParts.length > 0) {
        html = '<span style="' + styleParts.join(';') + ';">' + html + '</span>';
    }
    if (boldEnabled) html = '<strong>' + html + '</strong>';
    if (italicEnabled) html = '<em>' + html + '</em>';

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, html);
    currentMarkdown = editorTextarea.value;
    editorTextarea.setSelectionRange(start, start + html.length);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    closeTextStyleModal();
    showToast('Applied text style using HTML tags.');
}

function openLinkModal(mode) {
    modalMode = mode;
    const isLink = mode === 'link';
    const isImage = mode === 'image';
    const isId = mode === 'id';
    document.getElementById('modal-title').textContent = isLink ? 'Insert Link' : (isImage ? 'Insert Image' : 'Insert ID Anchor');
    document.getElementById('label-text').textContent = isLink ? 'Display text' : (isImage ? 'Image description' : 'ID');
    const shortcuts = document.getElementById('image-link-shortcuts');
    const urlWrap = document.getElementById('input-url-wrap');
    if (shortcuts) {
        if (isImage) {
            shortcuts.classList.remove('hidden');
            shortcuts.classList.add('flex');
        } else {
            shortcuts.classList.add('hidden');
            shortcuts.classList.remove('flex');
        }
    }
    if (urlWrap) {
        urlWrap.classList.toggle('hidden', isId);
    }
    document.getElementById('input-display-text').value = editorTextarea.value.substring(editorTextarea.selectionStart, editorTextarea.selectionEnd).trim();
    document.getElementById('input-url').value = isId ? '' : '';
    inputModal.classList.remove('hidden');
    inputModal.classList.add('flex');
    document.getElementById('input-display-text').focus();
}
function closeModal() {
    inputModal.classList.add('hidden');
    inputModal.classList.remove('flex');
    editorTextarea.focus();
}

function confirmModalInsert() {
    const isId = modalMode === 'id';
    const displayText = document.getElementById('input-display-text').value || (modalMode === 'link' ? 'link text' : 'image');
    const url = document.getElementById('input-url').value || 'https://';
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const currentScrollTop = editorTextarea.scrollTop;

    let replacement = '';
    if (isId) {
        const idValue = String(displayText || '').trim();
        if (!idValue) {
            showToast('\u0049\u0044\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.');
            return;
        }
        replacement = `<div id ="${idValue}"></div>\n[${idValue}]\n\n[${idValue}](#${idValue})`;
    } else {
        replacement = modalMode === 'link' ? `[${displayText}](${url})` : `![${displayText}](${url})`;
    }

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    closeModal();
    editorTextarea.scrollTop = currentScrollTop;
    editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    performAutoSave();
}

// --- Utility ---
function adjustPageScale(delta) {
    const zoomDelta = Number(delta || 0);
    const zoomTarget = (!isEditMode && viewerContainer)
        ? viewerContainer
        : (document.getElementById('content-viewport') || editorTextarea || null);
    const prevMetrics = zoomTarget ? {
        scrollWidth: zoomTarget.scrollWidth || 0,
        scrollHeight: zoomTarget.scrollHeight || 0,
        scrollLeft: zoomTarget.scrollLeft || 0,
        scrollTop: zoomTarget.scrollTop || 0,
        clientWidth: zoomTarget.clientWidth || 0,
        clientHeight: zoomTarget.clientHeight || 0
    } : null;

    pageScale = Math.max(0.1, Math.min(3, pageScale + zoomDelta));
    applyDocumentWidthScale();
    document.getElementById('scale-display').textContent = `${Math.round(pageScale * 100)}%`;

    if (!zoomTarget || !prevMetrics) return;
    requestAnimationFrame(() => {
        const nextScrollWidth = zoomTarget.scrollWidth || 0;
        const nextScrollHeight = zoomTarget.scrollHeight || 0;
        const nextClientWidth = zoomTarget.clientWidth || prevMetrics.clientWidth || 0;
        const nextClientHeight = zoomTarget.clientHeight || prevMetrics.clientHeight || 0;

        const prevCenterX = prevMetrics.scrollLeft + (prevMetrics.clientWidth / 2);
        const prevCenterY = prevMetrics.scrollTop + (prevMetrics.clientHeight / 2);
        const ratioX = prevMetrics.scrollWidth > 0 ? (prevCenterX / prevMetrics.scrollWidth) : 0.5;
        const ratioY = prevMetrics.scrollHeight > 0 ? (prevCenterY / prevMetrics.scrollHeight) : 0.5;

        const targetCenterX = ratioX * nextScrollWidth;
        const targetCenterY = ratioY * nextScrollHeight;
        const nextLeft = Math.max(0, targetCenterX - (nextClientWidth / 2));
        const nextTop = Math.max(0, targetCenterY - (nextClientHeight / 2));
        zoomTarget.scrollLeft = Number.isFinite(nextLeft) ? nextLeft : 0;
        zoomTarget.scrollTop = Number.isFinite(nextTop) ? nextTop : 0;
    });
}

function applyDocumentWidthScale() {
    const baseMaxWidthRem = 56; // Tailwind max-w-4xl
    const widthRem = Math.max(28, baseMaxWidthRem * pageScale);
    const widthValue = widthRem + 'rem';
    if (viewer) viewer.style.maxWidth = widthValue;
    const editorDocWrap = document.getElementById('editor-doc-wrap');
    if (editorDocWrap) editorDocWrap.style.maxWidth = widthValue;
    if (editorTextarea) editorTextarea.style.maxWidth = widthValue;
}

function adjustFontSize(delta) {
    fontSize = Math.max(10, Math.min(48, fontSize + delta));
    viewer.style.fontSize = `${fontSize}px`;
    editorTextarea.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--md-app-font-size', `${fontSize}px`);
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
}

function sanitizeUiMessage(msg) {
    const text = String(msg == null ? '' : msg);
    if (!text) return '';
    const qCount = (text.match(/\?/g) || []).length;
    const bad = text.includes('\uFFFD') || text.includes('???') || (text.length >= 12 && (qCount / text.length) > 0.2);
    return bad ? 'Message unavailable due to encoding issue.' : text;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = sanitizeUiMessage(msg);
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}

function getActiveScrollTarget() {
    if (isEditMode && editorTextarea) return editorTextarea;
    if (viewerContainer) return viewerContainer;
    return null;
}

function scrollToDocumentTop() {
    const target = getActiveScrollTarget();
    if (!target) return;
    target.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToDocumentBottom() {
    const target = getActiveScrollTarget();
    if (!target) return;
    target.scrollTo({ top: target.scrollHeight, behavior: 'smooth' });
}

// --- Settings ---
function initSettings() {
    const savedBg = localStorage.getItem('md_viewer_code_bg');
    const savedText = localStorage.getItem('md_viewer_code_text');
    const bgEl = document.getElementById('code-bg-color');
    const textEl = document.getElementById('code-text-color');
    if (savedBg) {
        document.documentElement.style.setProperty('--code-bg-color', savedBg);
        if (bgEl) bgEl.value = savedBg;
    }
    if (savedText) {
        document.documentElement.style.setProperty('--code-text-color', savedText);
        if (textEl) textEl.value = savedText;
    }
    applyDocumentWidthScale();
}

async function getAiSettings() {
    if (!db) return null;
    return new Promise((res) => {
        const tx = db.transaction('ai_settings', 'readonly');
        const req = tx.objectStore('ai_settings').get(AI_SETTINGS_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
    });
}

async function setAiSettings(data) {
    if (!db) return;
    const existing = await getAiSettings();
    const payload = { id: AI_SETTINGS_KEY, ...(existing || {}), ...data };
    return new Promise((res, rej) => {
        const tx = db.transaction('ai_settings', 'readwrite');
        const req = tx.objectStore('ai_settings').put(payload);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
    });
}

function hashPassword(plain) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain))
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

function isValidGoogleAiApiKey(key) {
    const k = (key || '').trim();
    if (!k) return false;
    return /^AIza[0-9A-Za-z_-]{35,120}$/.test(k);
}

function validateApiKeyInputUI() {
    const input = document.getElementById('ai-api-key');
    const fb = document.getElementById('ai-api-key-feedback');
    if (!input) return;
    const key = (input.value || '').trim();
    const base = 'w-full px-3 py-1.5 border rounded-md focus:outline-none text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors';
    const neutral = base + ' border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500';
    const ok = base + ' border-green-500 dark:border-green-500 ring-2 ring-green-500/40';
    const bad = base + ' border-red-500 dark:border-red-500 ring-2 ring-red-500/40';
    if (!key) {
        input.className = neutral + ' ai-api-key-input';
        if (fb) { fb.textContent = ''; fb.className = 'text-xs mt-1 min-h-[1.25rem]'; }
        return;
    }
    if (isValidGoogleAiApiKey(key)) {
        input.className = ok + ' ai-api-key-input';
        if (fb) {
            fb.textContent = 'Valid API key format.';
            fb.className = 'text-xs mt-1 text-green-600 dark:text-green-400 min-h-[1.25rem]';
        }
    } else {
        input.className = bad + ' ai-api-key-input';
        if (fb) {
            fb.textContent = 'Invalid key format. It should usually start with AIza...';
            fb.className = 'text-xs mt-1 text-red-600 dark:text-red-400 min-h-[1.25rem]';
        }
    }
}

async function saveApiKey() {
    const input = document.getElementById('ai-api-key');
    const key = (input && input.value) ? input.value.trim() : '';
    if (key && !isValidGoogleAiApiKey(key)) {
        validateApiKeyInputUI();
        showToast("Invalid API key format.");
        return;
    }
    await setAiSettings({ apiKey: key });
    if (key) localStorage.setItem('ss_gemini_api_key', key);
    else localStorage.removeItem('ss_gemini_api_key');
    showToast("API key saved.");
}

function getImgbbApiKey() {
    return localStorage.getItem('ss_imgbb_api_key') || '';
}

function getEnterButtonInsertBrFromLocal() {
    return localStorage.getItem(ENTER_BUTTON_BR_KEY) === '1';
}

function setEnterButtonInsertBrToLocal(enabled) {
    if (enabled) localStorage.setItem(ENTER_BUTTON_BR_KEY, '1');
    else localStorage.removeItem(ENTER_BUTTON_BR_KEY);
}

async function toggleEnterButtonInsertBrSetting(enabled) {
    const on = !!enabled;
    enterButtonInsertBr = on;
    setEnterButtonInsertBrToLocal(on);
    try { await setAiSettings({ enterButtonInsertBr: on }); } catch (e) {}
}

function getSelectionWrapEnabledFromLocal() {
    if (localStorage.getItem(SELECTION_WRAP_KEY) == null) return true;
    return localStorage.getItem(SELECTION_WRAP_KEY) === '1';
}

function setSelectionWrapEnabledToLocal(enabled) {
    if (enabled) localStorage.setItem(SELECTION_WRAP_KEY, '1');
    else localStorage.setItem(SELECTION_WRAP_KEY, '0');
}

async function toggleSelectionWrapSetting(enabled) {
    const on = !!enabled;
    selectionWrapEnabled = on;
    setSelectionWrapEnabledToLocal(on);
    try { await setAiSettings({ selectionWrapEnabled: on }); } catch (e) {}
}

function getViewModeEditEnabledFromLocal() {
    return localStorage.getItem(VIEW_MODE_EDIT_KEY) === '1';
}

function setViewModeEditEnabledToLocal(enabled) {
    if (enabled) localStorage.setItem(VIEW_MODE_EDIT_KEY, '1');
    else localStorage.removeItem(VIEW_MODE_EDIT_KEY);
}

function getSettingsShortcutsFoldedFromLocal() {
    const v = localStorage.getItem(SETTINGS_SHORTCUTS_FOLD_KEY);
    return v == null ? true : v === '1';
}

function setSettingsShortcutsFoldedToLocal(folded) {
    localStorage.setItem(SETTINGS_SHORTCUTS_FOLD_KEY, folded ? '1' : '0');
}

function applySettingsShortcutsFold(folded) {
    const body = document.getElementById('settings-shortcuts-body');
    const btn = document.getElementById('settings-shortcuts-toggle-btn');
    const isFolded = !!folded;
    if (body) body.classList.toggle('hidden', isFolded);
    if (btn) btn.textContent = isFolded ? '펼치기' : '접기';
}

function toggleSettingsShortcutsFold() {
    const next = !getSettingsShortcutsFoldedFromLocal();
    setSettingsShortcutsFoldedToLocal(next);
    applySettingsShortcutsFold(next);
}

function getAiUseFoldedFromLocal() {
    const v = localStorage.getItem(AI_USE_FOLD_KEY);
    return v == null ? true : v === '1';
}

function setAiUseFoldedToLocal(folded) {
    localStorage.setItem(AI_USE_FOLD_KEY, folded ? '1' : '0');
}

function applyAiUseFold(folded) {
    const btn = document.getElementById('ai-use-fold-btn');
    if (btn) btn.textContent = folded ? '펼치기' : '접기';
    const check = document.getElementById('ai-use-checkbox');
    const section = document.getElementById('ai-password-section');
    if (section) section.classList.toggle('hidden', !!folded || !(check && check.checked));
}

function toggleAiUseFold() {
    const next = !getAiUseFoldedFromLocal();
    setAiUseFoldedToLocal(next);
    applyAiUseFold(next);
}

function getShareSettingsFoldedFromLocal() {
    const v = localStorage.getItem(SHARE_SETTINGS_FOLD_KEY);
    return v == null ? true : v === '1';
}

function setShareSettingsFoldedToLocal(folded) {
    localStorage.setItem(SHARE_SETTINGS_FOLD_KEY, folded ? '1' : '0');
}

function applyShareSettingsFold(folded) {
    const btn = document.getElementById('share-settings-fold-btn');
    const body = document.getElementById('share-destinations-settings-body');
    if (btn) btn.textContent = folded ? '펼치기' : '접기';
    if (body) body.classList.toggle('hidden', !!folded);
}

function toggleShareSettingsFold() {
    const next = !getShareSettingsFoldedFromLocal();
    setShareSettingsFoldedToLocal(next);
    applyShareSettingsFold(next);
}

function getGithubSettingsFoldedFromLocal() {
    const v = localStorage.getItem(GITHUB_SETTINGS_FOLD_KEY);
    return v == null ? false : v === '1';
}

function setGithubSettingsFoldedToLocal(folded) {
    localStorage.setItem(GITHUB_SETTINGS_FOLD_KEY, folded ? '1' : '0');
}

function applyGithubSettingsFold(folded) {
    const btn = document.getElementById('github-settings-fold-btn');
    if (btn) btn.textContent = folded ? '펼치기' : '접기';
    toggleGithubSettingsSection();
}

function toggleGithubSettingsFold() {
    const next = !getGithubSettingsFoldedFromLocal();
    setGithubSettingsFoldedToLocal(next);
    applyGithubSettingsFold(next);
}

function applyEditToolsVisibilityByMode() {
    const editTools = document.getElementById('edit-tools');
    const toolbar = document.getElementById('toolbar');
    if (!editTools) return;
    const show = !!(isEditMode || viewModeEditEnabled);
    editTools.classList.toggle('hidden', !show);
    editTools.classList.toggle('invisible', false);
    editTools.classList.toggle('pointer-events-none', !show);
    if (toolbar) toolbar.classList.toggle('toolbar-view-compact', !show);
}

function bindMathQuickMenuDismiss() {
    if (document.body && document.body.__mathQuickMenuBound) return;
    if (document.body) document.body.__mathQuickMenuBound = true;
    document.addEventListener('click', function (e) {
        const panel = document.getElementById('math-quick-panel');
        const btn = document.getElementById('btn-math-quick');
        if (!panel || panel.classList.contains('hidden')) return;
        const target = e.target;
        if (panel.contains(target) || (btn && btn.contains(target))) return;
        panel.classList.add('hidden');
    });
}

function toggleMathQuickMenu() {
    const panel = document.getElementById('math-quick-panel');
    if (!panel) return;
    bindMathQuickMenuDismiss();
    panel.classList.toggle('hidden');
}

function wrapSelectionWithDelimiters(left, right, placeholder) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const selectedText = editorTextarea.value.substring(start, end);
    const content = selectedText || String(placeholder || '');
    const replacement = String(left || '') + content + String(right || '');
    const scrollTop = editorTextarea.scrollTop;
    const scrollLeft = editorTextarea.scrollLeft;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.scrollLeft = scrollLeft;

    if (selectedText) {
        editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
    } else {
        const posStart = start + String(left || '').length;
        editorTextarea.setSelectionRange(posStart, posStart + content.length);
    }
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function bindMath99PopupInteractions() {
    if (math99PopupBound) return;
    const panel = document.getElementById('math99-popup-panel');
    const header = document.getElementById('math99-popup-header');
    const resize = document.getElementById('math99-popup-resize-handle');
    const wrap = document.getElementById('math99-popup');
    if (!panel || !header || !resize || !wrap) return;
    math99PopupBound = true;

    wrap.addEventListener('mousedown', function (e) {
        if (e.target === wrap) closeMath99Popup();
    });

    header.addEventListener('mousedown', function (e) {
        const t = e.target;
        if (t && t.closest && t.closest('button,input,textarea,select,a')) return;
        const rect = panel.getBoundingClientRect();
        math99PopupDragging = true;
        math99PopupDragOffsetX = e.clientX - rect.left;
        math99PopupDragOffsetY = e.clientY - rect.top;
        panel.style.right = 'auto';
        e.preventDefault();
    });

    resize.addEventListener('mousedown', function (e) {
        const rect = panel.getBoundingClientRect();
        math99PopupResizing = true;
        math99PopupStartX = e.clientX;
        math99PopupStartY = e.clientY;
        math99PopupStartW = rect.width;
        math99PopupStartH = rect.height;
        panel.style.right = 'auto';
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', function (e) {
        if (math99PopupDragging) {
            const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - math99PopupDragOffsetX));
            const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - math99PopupDragOffsetY));
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            return;
        }
        if (math99PopupResizing) {
            const rect = panel.getBoundingClientRect();
            const minW = 360;
            const minH = 260;
            const maxW = Math.max(minW, window.innerWidth - rect.left - 8);
            const maxH = Math.max(minH, window.innerHeight - rect.top - 8);
            const w = Math.max(minW, Math.min(maxW, math99PopupStartW + (e.clientX - math99PopupStartX)));
            const h = Math.max(minH, Math.min(maxH, math99PopupStartH + (e.clientY - math99PopupStartY)));
            panel.style.width = Math.round(w) + 'px';
            panel.style.height = Math.round(h) + 'px';
        }
    });

    document.addEventListener('mouseup', function () {
        math99PopupDragging = false;
        math99PopupResizing = false;
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMath99Popup();
    });
}

function openMath99Popup() {
    const wrap = document.getElementById('math99-popup');
    const panel = document.getElementById('math99-popup-panel');
    if (!wrap || !panel) return;
    bindMath99PopupInteractions();
    wrap.classList.remove('hidden');
    if (!panel.style.left) {
        panel.style.left = Math.max(8, window.innerWidth - panel.offsetWidth - 16) + 'px';
        panel.style.top = '80px';
        panel.style.right = 'auto';
    }
}

function closeMath99Popup() {
    const wrap = document.getElementById('math99-popup');
    if (!wrap) return;
    wrap.classList.add('hidden');
}

function ensureTableInsertPickerBuilt() {
    if (tableInsertPickerBuilt) return;
    const grid = document.getElementById('table-insert-grid');
    if (!grid) return;
    tableInsertPickerBuilt = true;
    const maxRows = 10;
    const maxCols = 10;
    for (let r = 1; r <= maxRows; r += 1) {
        for (let c = 1; c <= maxCols; c += 1) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'w-4 h-4 rounded-[2px] border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 hover:border-indigo-500';
            cell.dataset.rows = String(r);
            cell.dataset.cols = String(c);
            cell.onmouseenter = function () { previewTableInsertSize(r, c); };
            cell.onclick = function () { selectTableInsertSize(r, c); };
            grid.appendChild(cell);
        }
    }
    grid.addEventListener('mouseleave', function () {
        previewTableInsertSize(0, 0);
    });
}

function previewTableInsertSize(rows, cols) {
    const label = document.getElementById('table-insert-size-label');
    if (label) {
        label.textContent = (rows > 0 && cols > 0) ? (rows + 'x' + cols + ' 표') : '표 삽입';
    }
    const grid = document.getElementById('table-insert-grid');
    if (!grid) return;
    const cells = grid.querySelectorAll('button[data-rows][data-cols]');
    for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        const r = Number(cell.dataset.rows || 0);
        const c = Number(cell.dataset.cols || 0);
        const on = rows > 0 && cols > 0 && r <= rows && c <= cols;
        cell.classList.toggle('bg-amber-300', on);
        cell.classList.toggle('border-amber-500', on);
        cell.classList.toggle('bg-slate-100', !on);
        cell.classList.toggle('dark:bg-slate-800', !on);
    }
}

function closeTableInsertPicker() {
    const panel = document.getElementById('table-insert-picker');
    if (!panel) return;
    panel.classList.add('hidden');
    previewTableInsertSize(0, 0);
}

function bindTableInsertPickerDismiss() {
    if (document.body && document.body.__tableInsertPickerBound) return;
    if (document.body) document.body.__tableInsertPickerBound = true;
    document.addEventListener('click', function (e) {
        const panel = document.getElementById('table-insert-picker');
        const btn = document.getElementById('btn-table-insert-picker');
        if (!panel || panel.classList.contains('hidden')) return;
        const target = e.target;
        if (panel.contains(target) || (btn && btn.contains(target))) return;
        closeTableInsertPicker();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeTableInsertPicker();
    });
}

function toggleTableInsertPicker() {
    ensureTableInsertPickerBuilt();
    bindTableInsertPickerDismiss();
    const panel = document.getElementById('table-insert-picker');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) previewTableInsertSize(0, 0);
}

function insertMarkdownTableBySize(rowsInput, colsInput) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return;
    }
    const rows = Math.max(1, Math.min(10, Number(rowsInput) || 0));
    const cols = Math.max(1, Math.min(10, Number(colsInput) || 0));
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const scrollTop = editorTextarea.scrollTop;
    const headers = [];
    for (let c = 1; c <= cols; c += 1) headers.push('Header ' + c);
    const lines = [];
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('|' + Array(cols).fill(' --- ').join('|') + '|');
    const bodyRows = Math.max(0, rows - 1);
    for (let r = 0; r < bodyRows; r += 1) {
        lines.push('| ' + Array(cols).fill(' ').join(' | ') + ' |');
    }
    const prefix = (start > 0 && text[start - 1] !== '\n') ? '\n' : '';
    const suffix = '\n';
    const replacement = prefix + lines.join('\n') + suffix;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    const pos = start + replacement.length;
    editorTextarea.setSelectionRange(pos, pos);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
}

function selectTableInsertSize(rows, cols) {
    insertMarkdownTableBySize(rows, cols);
    closeTableInsertPicker();
}

function insertInlineMathTemplate() {
    wrapSelectionWithDelimiters('$', '$', 'x');
}

function insertDisplayMathTemplate() {
    wrapSelectionWithDelimiters('$$', '$$', '\\frac{x}{y}');
}

function insertMathRefTemplate() {
    insertLiteralAtCursor('$x = \\frac{-b \\pm \\sqrt{D}}{2a}$');
}

function macroApi(name) {
    if (!window.TRTMacro) return null;
    const fn = window.TRTMacro[name];
    return (typeof fn === 'function') ? fn : null;
}

function toggleMacroMenu() {
    const fn = macroApi('toggleMacroMenu');
    if (fn) fn();
}

function toggleMacroRecord(on) {
    const fn = macroApi('toggleMacroRecord');
    if (fn) fn(!!on);
}

async function runCheckedMacroActions() {
    const fn = macroApi('runCheckedMacroActions');
    if (fn) await fn();
}

function runMacroEntry(entryId) {
    const fn = macroApi('runMacroEntry');
    if (fn) fn(entryId);
}

function toggleMacroEntryEnabled(entryId, enabled) {
    const fn = macroApi('toggleMacroEntryEnabled');
    if (fn) fn(entryId, !!enabled);
}

function clearMacroEntries() {
    const fn = macroApi('clearMacroEntries');
    if (fn) fn();
}

function registerMacroEntryShortcut(entryId) {
    const fn = macroApi('registerMacroEntryShortcut');
    if (fn) fn(entryId);
}

function clearMacroEntryShortcut(entryId) {
    const fn = macroApi('clearMacroEntryShortcut');
    if (fn) fn(entryId);
}

function dockMacroMenuRight() {
    const fn = macroApi('dockMacroMenuRight');
    if (fn) fn();
}

function initMacroFeature() {
    const fn = macroApi('init');
    if (fn) fn();
}
async function toggleViewModeEditSetting(enabled) {
    const on = !!enabled;
    viewModeEditEnabled = on;
    setViewModeEditEnabledToLocal(on);
    applyEditToolsVisibilityByMode();
    try { await setAiSettings({ viewModeEditEnabled: on }); } catch (e) {}
}

async function saveImgbbApiKey(key) {
    const value = String(key || '').trim();
    await setAiSettings({ imgbbApiKey: value });
    if (value) localStorage.setItem('ss_imgbb_api_key', value);
    else localStorage.removeItem('ss_imgbb_api_key');
    syncImgbbApiKeyInputs(value);
    return value;
}

function getImageUploadEnabledFromSettings(settings) {
    if (!settings) return false;
    return settings.imageUploadEnabled === true;
}

function getScholarSearchVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.scholarSearchVisible === true;
}

function getHighlightVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.highlightVisible === true;
}

function getTemplateVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.templateVisible === true;
}

function getHtml2pptVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.html2pptVisible === true;
}

function getMacroVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.macroVisible === true;
}

function applyMacroVisibility(settings) {
    const enabled = getMacroVisibleFromSettings(settings || {});
    const wrap = document.getElementById('macro-toolbar-wrap');
    if (wrap) {
        wrap.classList.toggle('hidden', !enabled);
        wrap.classList.toggle('inline-flex', enabled);
    }
    const panel = document.getElementById('macro-menu-panel');
    if (!enabled && panel && !panel.classList.contains('hidden')) {
        toggleMacroMenu();
    }
}

async function toggleMacroVisibilitySection() {
    const check = document.getElementById('macro-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ macroVisible: enabled });
    const s = await getAiSettings();
    applyMacroVisibility(s || { macroVisible: enabled });
}

function syncHeaderScholarSearchWrapVisibility() {
    const wrap = document.getElementById('header-scholar-search-wrap');
    if (!wrap) return;
    const scholarBtn = document.getElementById('btn-scholar-search');
    const sitesBtn = document.getElementById('btn-sites-panel');
    const templateBtn = document.getElementById('btn-template-panel');
    const scholarEnabled = !!(scholarBtn && !scholarBtn.classList.contains('hidden'));
    const sitesEnabled = !!(sitesBtn && !sitesBtn.classList.contains('hidden'));
    const templateEnabled = !!(templateBtn && !templateBtn.classList.contains('hidden'));
    if (scholarEnabled || sitesEnabled || templateEnabled) {
        wrap.classList.remove('hidden');
        wrap.classList.add('flex');
        wrap.style.display = 'flex';
    } else {
        wrap.classList.add('hidden');
        wrap.classList.remove('flex');
        wrap.style.display = 'none';
    }
}

function applyScholarSearchVisibility(settings) {
    const enabled = getScholarSearchVisibleFromSettings(settings || {});
    const scholarBtn = document.getElementById('btn-scholar-search');
    if (scholarBtn) scholarBtn.classList.toggle('hidden', !enabled);
    syncHeaderScholarSearchWrapVisibility();
}

function applyHighlightVisibility(settings) {
    const enabled = getHighlightVisibleFromSettings(settings || {});
    const btn = document.getElementById('btn-highlight-popup');
    if (btn) {
        btn.style.display = enabled ? '' : 'none';
    }
    if (!enabled && typeof closeHighlightPopup === 'function') {
        closeHighlightPopup();
    }
}


async function toggleScholarSearchSection() {
    const check = document.getElementById('scholar-search-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ scholarSearchVisible: enabled });
    const s = await getAiSettings();
    applyScholarSearchVisibility(s || { scholarSearchVisible: enabled });
}

async function toggleHighlightSection() {
    const check = document.getElementById('highlight-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ highlightVisible: enabled });
    const s = await getAiSettings();
    applyHighlightVisibility(s || { highlightVisible: enabled });
}

function getTemplateLibrary() {
    const base = (typeof TMPLS !== 'undefined' && Array.isArray(TMPLS) ? TMPLS : [])
        .map(function (item, idx) {
            const name = String(item && item.name ? item.name : '').trim() || ('Template ' + (idx + 1));
            const desc = String(item && item.desc ? item.desc : '').trim();
            const content = String(item && item.content ? item.content : '');
            return { id: 'builtin_' + idx, name: name, desc: desc, content: content, isCustom: false };
        })
        .filter(function (item) { return item.content.trim().length > 0; });
    const custom = normalizeTemplateCustomList(templateCustomList);
    return base.concat(custom);
}

function normalizeTemplateCustomList(rawList) {
    const src = Array.isArray(rawList) ? rawList : [];
    return src
        .map(function (item, idx) {
            const name = String(item && item.name ? item.name : '').trim() || ('Custom Template ' + (idx + 1));
            const desc = String(item && item.desc ? item.desc : '').trim();
            const content = String(item && item.content ? item.content : '');
            const id = String(item && item.id ? item.id : ('custom_' + Date.now() + '_' + idx));
            return { id: id, name: name, desc: desc, content: content, isCustom: true };
        })
        .filter(function (item) { return item.content.trim().length > 0; });
}

async function saveTemplateCustomListToSettings() {
    templateCustomList = normalizeTemplateCustomList(templateCustomList);
    await setAiSettings({
        templateCustomList: templateCustomList.map(function (item) {
            return { id: item.id, name: item.name, desc: item.desc, content: item.content };
        })
    });
}

function getTemplateExportPayload() {
    const selected = getSelectedTemplateItem();
    const draft = getTemplateEditorDraft();
    if (!selected && !draft.name && !draft.content) return null;
    const content = String(draft.content || '').trim() ? String(draft.content || '') : String(selected && selected.content ? selected.content : '');
    return {
        name: draft.name || (selected && selected.name ? selected.name : 'template'),
        desc: draft.desc || (selected && selected.desc ? selected.desc : ''),
        content: content
    };
}

function sanitizeTemplateFileName(name) {
    const base = String(name || 'template').trim() || 'template';
    return base
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'template';
}

function downloadTemplateMdFile(fileName, content) {
    const blob = new Blob([String(content || '')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function addTemplateFromCurrentContent() {
    const defaultName = (currentFileName || '새 양식').replace(/\.md$/i, '').trim() || '새 양식';
    const name = window.prompt('양식 이름을 입력하세요.', defaultName);
    if (name == null) return;
    const title = String(name || '').trim();
    if (!title) {
        showToast('양식 이름을 입력하세요.');
        return;
    }
    const descInput = window.prompt('양식 설명(선택)', '사용자 양식');
    if (descInput == null) return;
    const desc = String(descInput || '').trim();
    const previewEl = document.getElementById('template-preview');
    const candidate = String(previewEl && previewEl.value ? previewEl.value : '').trim();
    const docContent = String(editorTextarea && editorTextarea.value ? editorTextarea.value : '').trim();
    const content = docContent || candidate;
    if (!content) {
        showToast('저장할 양식 내용이 없습니다.');
        return;
    }
    const entry = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: title,
        desc: desc || '사용자 양식',
        content: content,
        isCustom: true
    };
    templateCustomList = normalizeTemplateCustomList(templateCustomList.concat([entry]));
    await saveTemplateCustomListToSettings();
    renderTemplatePanel();
    const select = document.getElementById('template-select');
    const all = getTemplateLibrary();
    const idx = all.findIndex(function (item) { return item.id === entry.id; });
    if (select && idx >= 0) {
        select.value = String(idx);
        onTemplateSelectChange();
    }
    showToast('양식을 추가했습니다.');
}

async function saveEditedTemplate() {
    const draft = getTemplateEditorDraft();
    const targetName = String(draft.name || '').trim();
    if (!targetName) {
        showToast('양식 이름을 입력하세요.');
        return;
    }
    if (!String(draft.content || '').trim()) {
        showToast('양식 내용이 비어 있습니다.');
        return;
    }

    const normalizedName = targetName.toLowerCase();
    const existingIndex = templateCustomList.findIndex(function (item) {
        return String(item && item.name ? item.name : '').trim().toLowerCase() === normalizedName;
    });

    if (existingIndex >= 0) {
        const prev = templateCustomList[existingIndex] || {};
        templateCustomList[existingIndex] = {
            id: String(prev.id || ('custom_' + Date.now() + '_r')),
            name: targetName,
            desc: draft.desc || '사용자 양식',
            content: draft.content,
            isCustom: true
        };
        await saveTemplateCustomListToSettings();
        renderTemplatePanel();
        const select = document.getElementById('template-select');
        const all = getTemplateLibrary();
        const idx = all.findIndex(function (item) {
            return item.isCustom && String(item.name || '').trim().toLowerCase() === normalizedName;
        });
        if (select && idx >= 0) {
            select.value = String(idx);
            onTemplateSelectChange();
        }
        showToast('같은 이름 양식을 덮어써서 저장했습니다.');
        return;
    }

    const created = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: targetName,
        desc: draft.desc || '사용자 양식',
        content: draft.content,
        isCustom: true
    };
    templateCustomList = normalizeTemplateCustomList(templateCustomList.concat([created]));
    await saveTemplateCustomListToSettings();
    renderTemplatePanel();
    const select = document.getElementById('template-select');
    const all = getTemplateLibrary();
    const idx = all.findIndex(function (item) { return item.id === created.id; });
    if (select && idx >= 0) {
        select.value = String(idx);
        onTemplateSelectChange();
    }
    showToast('이름이 달라 새 양식으로 저장했습니다.');
}

function exportSelectedTemplateMd() {
    const payload = getTemplateExportPayload();
    if (!payload || !payload.content.trim()) {
        showToast('내보낼 양식이 없습니다.');
        return;
    }
    const fileName = sanitizeTemplateFileName(payload.name) + '.md';
    downloadTemplateMdFile(fileName, payload.content);
    showToast('양식을 .md 파일로 내보냈습니다.');
}

function triggerTemplateImportMd() {
    const input = document.getElementById('template-import-file');
    if (!input) return;
    input.value = '';
    input.click();
}

async function importTemplateMdFile(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;
    const fileName = String(file.name || '').trim() || 'imported-template.md';
    let text = '';
    try {
        text = await file.text();
    } catch (_) {
        showToast('양식 파일을 읽지 못했습니다.');
        if (input) input.value = '';
        return;
    }
    const content = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!content) {
        showToast('비어 있는 md 파일입니다.');
        if (input) input.value = '';
        return;
    }
    const firstLine = content.split('\n').find(function (line) { return String(line || '').trim(); }) || '';
    const heading = firstLine.replace(/^#+\s*/, '').trim();
    const guessedName = heading || fileName.replace(/\.md$/i, '').trim() || '가져온 양식';
    const entry = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: guessedName,
        desc: '가져온 양식',
        content: content,
        isCustom: true
    };
    templateCustomList = normalizeTemplateCustomList(templateCustomList.concat([entry]));
    await saveTemplateCustomListToSettings();
    renderTemplatePanel();
    const select = document.getElementById('template-select');
    const all = getTemplateLibrary();
    const idx = all.findIndex(function (item) { return item.id === entry.id; });
    if (select && idx >= 0) {
        select.value = String(idx);
        onTemplateSelectChange();
    }
    showToast('md 양식을 가져왔습니다.');
    if (input) input.value = '';
}

function getSelectedTemplateItem() {
    const templates = getTemplateLibrary();
    if (!templates.length) return null;
    const select = document.getElementById('template-select');
    const idx = Math.max(0, Math.min(
        templates.length - 1,
        Number(select && select.value ? select.value : 0) || 0
    ));
    return templates[idx] || null;
}

function getTemplateEditorDraft() {
    const nameEl = document.getElementById('template-name-input');
    const descEl = document.getElementById('template-desc-input');
    const previewEl = document.getElementById('template-preview');
    return {
        name: String(nameEl && nameEl.value ? nameEl.value : '').trim(),
        desc: String(descEl && descEl.value ? descEl.value : '').trim(),
        content: String(previewEl && previewEl.value ? previewEl.value : '')
    };
}

function applyTemplateEditorFields(item) {
    const nameEl = document.getElementById('template-name-input');
    const descEl = document.getElementById('template-desc-input');
    const previewEl = document.getElementById('template-preview');
    if (nameEl) nameEl.value = item && item.name ? item.name : '';
    if (descEl) descEl.value = item && item.desc ? item.desc : '';
    if (previewEl) previewEl.value = item && item.content ? item.content : '';
}

function renderTemplatePanel() {
    const select = document.getElementById('template-select');
    const nameEl = document.getElementById('template-name-input');
    const descInputEl = document.getElementById('template-desc-input');
    const previewEl = document.getElementById('template-preview');
    if (!select || !nameEl || !descInputEl || !previewEl) return;

    const templates = getTemplateLibrary();
    const previous = Number(select.value || 0) || 0;
    select.innerHTML = '';
    templates.forEach(function (item, idx) {
        const option = document.createElement('option');
        option.value = String(idx);
        option.textContent = item.name;
        select.appendChild(option);
    });
    if (!templates.length) {
        applyTemplateEditorFields({ name: '', desc: '', content: '' });
        return;
    }
    const safeIdx = Math.max(0, Math.min(templates.length - 1, previous));
    select.value = String(safeIdx);
    const item = templates[safeIdx];
    applyTemplateEditorFields(item);
}

function onTemplateSelectChange() {
    const item = getSelectedTemplateItem();
    const nameEl = document.getElementById('template-name-input');
    const descInputEl = document.getElementById('template-desc-input');
    const previewEl = document.getElementById('template-preview');
    if (!nameEl || !descInputEl || !previewEl) return;
    if (!item) {
        applyTemplateEditorFields({ name: '', desc: '', content: '' });
        return;
    }
    applyTemplateEditorFields(item);
}

function applyTemplatePanelMode() {
    const panel = document.getElementById('template-panel');
    const body = document.getElementById('template-panel-body');
    const compactBtn = document.getElementById('template-panel-compact-btn');
    const resizer = document.getElementById('template-panel-resizer');
    if (!panel || !body) return;

    if (templatePanelCompact) {
        if (panel.style.width) templatePanelSavedWidth = panel.style.width;
        if (panel.style.height) templatePanelSavedHeight = panel.style.height;
        panel.style.left = 'auto';
        panel.style.right = '12px';
        panel.style.bottom = '12px';
        panel.style.top = 'auto';
        panel.style.width = 'auto';
        panel.style.height = 'auto';
        panel.style.maxWidth = 'none';
        body.classList.add('hidden');
        if (compactBtn) compactBtn.textContent = '<<';
        if (resizer) resizer.style.display = 'none';
    } else {
        if (templatePanelResized) {
            panel.style.width = templatePanelSavedWidth || panel.style.width || '640px';
            panel.style.height = templatePanelSavedHeight || panel.style.height || '';
            panel.style.maxWidth = 'none';
        } else {
            panel.style.width = '';
            panel.style.height = '';
            panel.style.maxWidth = '';
        }
        if (!templatePanelMoved) {
            panel.style.left = '';
            panel.style.top = '';
            panel.style.right = '12px';
            panel.style.bottom = '12px';
        }
        body.classList.remove('hidden');
        if (compactBtn) compactBtn.textContent = '>>';
        if (resizer) resizer.style.display = '';
    }
}

function toggleTemplateCompactMode() {
    templatePanelCompact = !templatePanelCompact;
    applyTemplatePanelMode();
}

function bindTemplatePanelDrag() {
    if (templatePanelDragBound) return;
    templatePanelDragBound = true;
    const panel = document.getElementById('template-panel');
    const header = document.getElementById('template-panel-header');
    if (!panel || !header) return;

    header.addEventListener('mousedown', function (e) {
        if (templatePanelResizing) return;
        const target = e.target;
        if (target && target.closest && target.closest('button,input,textarea,select,a')) return;
        if (templatePanelCompact) return;
        const rect = panel.getBoundingClientRect();
        templatePanelDragging = true;
        templatePanelDragOffsetX = e.clientX - rect.left;
        templatePanelDragOffsetY = e.clientY - rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
    document.addEventListener('mousemove', function (e) {
        if (templatePanelResizing) return;
        if (!templatePanelDragging || templatePanelCompact) return;
        const x = Math.max(0, e.clientX - templatePanelDragOffsetX);
        const y = Math.max(0, e.clientY - templatePanelDragOffsetY);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        templatePanelMoved = true;
    });
    document.addEventListener('mouseup', function () {
        templatePanelDragging = false;
    });
}

function bindTemplatePanelResize() {
    if (templatePanelResizeBound) return;
    templatePanelResizeBound = true;
    const panel = document.getElementById('template-panel');
    const handle = document.getElementById('template-panel-resizer');
    if (!panel || !handle) return;

    handle.addEventListener('mousedown', function (e) {
        if (templatePanelCompact) return;
        e.preventDefault();
        e.stopPropagation();
        templatePanelResizing = true;
    });
    document.addEventListener('mousemove', function (e) {
        if (!templatePanelResizing || templatePanelCompact) return;
        const rect = panel.getBoundingClientRect();
        const minW = 420;
        const minH = 260;
        const maxW = Math.max(minW, window.innerWidth - rect.left - 8);
        const maxH = Math.max(minH, window.innerHeight - rect.top - 8);
        const nextW = Math.max(minW, Math.min(maxW, e.clientX - rect.left));
        const nextH = Math.max(minH, Math.min(maxH, e.clientY - rect.top));
        panel.style.width = Math.round(nextW) + 'px';
        panel.style.height = Math.round(nextH) + 'px';
        panel.style.maxWidth = 'none';
        templatePanelSavedWidth = panel.style.width;
        templatePanelSavedHeight = panel.style.height;
        templatePanelResized = true;
    });
    document.addEventListener('mouseup', function () {
        templatePanelResizing = false;
    });
}

function applyTemplateVisibility(settings) {
    const enabled = getTemplateVisibleFromSettings(settings || {});
    const btn = document.getElementById('btn-template-panel');
    if (btn) btn.classList.toggle('hidden', !enabled);
    syncHeaderScholarSearchWrapVisibility();
    if (!enabled) closeTemplatePanel();
}

function openTemplatePanel() {
    const panel = document.getElementById('template-panel');
    if (!panel) return;
    bindTemplatePanelDrag();
    bindTemplatePanelResize();
    applyTemplatePanelMode();
    renderTemplatePanel();
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    templatePanelOpen = true;
}

function closeTemplatePanel() {
    const panel = document.getElementById('template-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    templatePanelOpen = false;
}

function toggleTemplatePanel() {
    if (templatePanelOpen) closeTemplatePanel();
    else openTemplatePanel();
}

function insertTemplateTextAtCursor(templateText) {
    const text = String(templateText || '');
    if (!text.trim()) {
        showToast('양식 내용이 비어 있습니다.');
        return false;
    }
    if (!isEditMode) toggleMode('edit');
    if (!editorTextarea) return false;

    const start = typeof editorTextarea.selectionStart === 'number' ? editorTextarea.selectionStart : editorTextarea.value.length;
    const end = typeof editorTextarea.selectionEnd === 'number' ? editorTextarea.selectionEnd : start;
    const before = start > 0 && editorTextarea.value.charAt(start - 1) !== '\n' ? '\n\n' : '';
    const after = end < editorTextarea.value.length && editorTextarea.value.charAt(end) !== '\n' ? '\n\n' : '\n';
    const replacement = before + text + after;

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    renderMarkdown();
    renderTOC();
    updatePreviewPopupContent();
    performAutoSave();
    return true;
}

function insertSelectedTemplateToDocument() {
    const item = getSelectedTemplateItem();
    if (!item) {
        showToast('사용 가능한 양식이 없습니다.');
        return;
    }
    const ok = insertTemplateTextAtCursor(item.content);
    if (ok) showToast('양식을 문서에 삽입했습니다.');
}

function insertSelectedTemplateAsNewFile() {
    const item = getSelectedTemplateItem();
    if (!item) {
        showToast('사용 가능한 양식이 없습니다.');
        return;
    }
    createNewFile();
    updateContent(item.content);
    currentMarkdown = editorTextarea ? editorTextarea.value : item.content;
    performAutoSave();
    if (isEditMode && editorTextarea) editorTextarea.focus();
    showToast('새 파일에 양식을 삽입했습니다.');
}

async function toggleTemplateSection() {
    const check = document.getElementById('template-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ templateVisible: enabled });
    const s = await getAiSettings();
    applyTemplateVisibility(s || { templateVisible: enabled });
}

function applyHtml2pptPanelLayout() {
    const panel = document.getElementById('html2ppt-panel');
    const dockBtn = document.getElementById('html2ppt-panel-dock-btn');
    const fullBtn = document.getElementById('html2ppt-panel-full-btn');
    const resizeHandle = document.getElementById('html2ppt-panel-resizer');
    if (!panel) return;

    if (html2pptFullscreen) {
        panel.style.left = '8px';
        panel.style.top = '56px';
        panel.style.right = '8px';
        panel.style.bottom = '8px';
        panel.style.width = 'auto';
        panel.style.height = 'auto';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = 'none';
        if (dockBtn) dockBtn.disabled = true;
        if (resizeHandle) resizeHandle.style.display = 'none';
    } else if (html2pptDockRight) {
        panel.style.left = 'auto';
        panel.style.top = '80px';
        panel.style.right = '12px';
        panel.style.bottom = '12px';
        panel.style.width = html2pptSavedWidth || 'min(980px,96vw)';
        panel.style.height = html2pptSavedHeight || 'min(760px,86vh)';
        html2pptMoved = false;
    } else if (!html2pptMoved) {
        panel.style.left = '';
        panel.style.top = '80px';
        panel.style.right = '12px';
        panel.style.bottom = '12px';
    }

    if (!html2pptFullscreen) {
        if (dockBtn) dockBtn.disabled = false;
        if (resizeHandle) resizeHandle.style.display = '';
    }

    if (dockBtn) dockBtn.textContent = html2pptDockRight ? '<<' : '>>';
    if (fullBtn) fullBtn.textContent = html2pptFullscreen ? '복원' : '전체';
}

function toggleHtml2pptDockRight() {
    if (html2pptFullscreen) return;
    html2pptDockRight = !html2pptDockRight;
    applyHtml2pptPanelLayout();
}

function toggleHtml2pptPanelFullscreen() {
    const panel = document.getElementById('html2ppt-panel');
    if (panel && !html2pptFullscreen) {
        html2pptRestoreState = {
            left: panel.style.left,
            top: panel.style.top,
            right: panel.style.right,
            bottom: panel.style.bottom,
            width: panel.style.width,
            height: panel.style.height,
            maxWidth: panel.style.maxWidth,
            maxHeight: panel.style.maxHeight,
            dockRight: html2pptDockRight,
            moved: html2pptMoved
        };
    }
    html2pptFullscreen = !html2pptFullscreen;
    if (panel && !html2pptFullscreen && html2pptRestoreState) {
        panel.style.left = html2pptRestoreState.left;
        panel.style.top = html2pptRestoreState.top;
        panel.style.right = html2pptRestoreState.right;
        panel.style.bottom = html2pptRestoreState.bottom;
        panel.style.width = html2pptRestoreState.width;
        panel.style.height = html2pptRestoreState.height;
        panel.style.maxWidth = html2pptRestoreState.maxWidth;
        panel.style.maxHeight = html2pptRestoreState.maxHeight;
        html2pptDockRight = !!html2pptRestoreState.dockRight;
        html2pptMoved = !!html2pptRestoreState.moved;
    }
    applyHtml2pptPanelLayout();
}

function bindHtml2pptPanelDrag() {
    if (html2pptDragBound) return;
    html2pptDragBound = true;
    const panel = document.getElementById('html2ppt-panel');
    const header = document.getElementById('html2ppt-panel-header');
    if (!panel || !header) return;

    header.addEventListener('mousedown', function (e) {
        if (html2pptResizing || html2pptFullscreen) return;
        const target = e.target;
        if (target && target.closest && target.closest('button,input,textarea,select,a,iframe')) return;
        const rect = panel.getBoundingClientRect();
        html2pptDragging = true;
        html2pptDragOffsetX = e.clientX - rect.left;
        html2pptDragOffsetY = e.clientY - rect.top;
        html2pptDockRight = false;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        applyHtml2pptPanelLayout();
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!html2pptDragging || html2pptResizing || html2pptFullscreen) return;
        const panelEl = document.getElementById('html2ppt-panel');
        if (!panelEl) return;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - html2pptDragOffsetX));
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - html2pptDragOffsetY));
        panelEl.style.left = nextLeft + 'px';
        panelEl.style.top = nextTop + 'px';
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        html2pptMoved = true;
    });

    document.addEventListener('mouseup', function () {
        html2pptDragging = false;
    });
}

function bindHtml2pptPanelResize() {
    if (html2pptResizeBound) return;
    html2pptResizeBound = true;
    const panel = document.getElementById('html2ppt-panel');
    const handle = document.getElementById('html2ppt-panel-resizer');
    if (!panel || !handle) return;

    handle.addEventListener('mousedown', function (e) {
        if (html2pptFullscreen) return;
        e.preventDefault();
        e.stopPropagation();
        html2pptResizing = true;
    });

    document.addEventListener('mousemove', function (e) {
        if (!html2pptResizing || html2pptFullscreen) return;
        const rect = panel.getBoundingClientRect();
        const minW = 520;
        const minH = 360;
        const maxW = Math.max(minW, window.innerWidth - rect.left - 8);
        const maxH = Math.max(minH, window.innerHeight - rect.top - 8);
        const nextW = Math.max(minW, Math.min(maxW, e.clientX - rect.left));
        const nextH = Math.max(minH, Math.min(maxH, e.clientY - rect.top));
        panel.style.width = Math.round(nextW) + 'px';
        panel.style.height = Math.round(nextH) + 'px';
        panel.style.maxWidth = 'none';
        html2pptSavedWidth = panel.style.width;
        html2pptSavedHeight = panel.style.height;
        html2pptDockRight = false;
        applyHtml2pptPanelLayout();
    });

    document.addEventListener('mouseup', function () {
        html2pptResizing = false;
    });
}

function openHtml2pptPanel() {
    const panel = document.getElementById('html2ppt-panel');
    if (!panel) return;
    bindHtml2pptPanelDrag();
    bindHtml2pptPanelResize();
    applyHtml2pptPanelLayout();
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    html2pptPanelOpen = true;
}

function closeHtml2pptPanel() {
    const panel = document.getElementById('html2ppt-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    html2pptPanelOpen = false;
    html2pptFullscreen = false;
}

function toggleHtml2pptPanel() {
    if (html2pptPanelOpen) closeHtml2pptPanel();
    else openHtml2pptPanel();
}

function applyHtml2pptVisibility(settings) {
    const enabled = getHtml2pptVisibleFromSettings(settings || {});
    const btn = document.getElementById('btn-html2ppt-panel');
    if (btn) btn.classList.toggle('hidden', !enabled);
    if (!enabled) closeHtml2pptPanel();
}

async function toggleHtml2pptSection() {
    const check = document.getElementById('html2ppt-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ html2pptVisible: enabled });
    const s = await getAiSettings();
    applyHtml2pptVisibility(s || { html2pptVisible: enabled });
}

window.addEventListener('message', function (event) {
    const data = event && event.data ? event.data : null;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'html2ppt-toggle-panel-fullscreen') return;
    const frame = document.getElementById('html2ppt-frame');
    if (!frame || event.source !== frame.contentWindow) return;
    if (!html2pptPanelOpen) openHtml2pptPanel();
    toggleHtml2pptPanelFullscreen();
});

function openScholarSearchWindow(query) {
    const q = String(query || '').trim();
    if (!q) {
        showToast('Enter a search query first.');
        return;
    }
    const options = (arguments.length > 1 && arguments[1]) ? arguments[1] : {};
    const lang = String(options.lang || 'ko');
    const period = String(options.period || '');
    const reviewOnly = options.reviewOnly === true;
    const finalQuery = reviewOnly ? (q + ' (review OR survey)') : q;
    const params = new URLSearchParams();
    params.set('q', finalQuery);
    params.set('hl', lang === 'en' ? 'en' : 'ko');
    if (lang === 'ko') params.set('lr', 'lang_ko');
    if (lang === 'en') params.set('lr', 'lang_en');
    if (period) {
        const years = parseInt(period, 10);
        if (Number.isFinite(years) && years > 0) {
            const now = new Date().getFullYear();
            params.set('as_ylo', String(now - years + 1));
        }
    }
    params.set('as_vis', '1');
    const url = 'https://scholar.google.com/scholar?' + params.toString();
    const win = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) showToast('Popup blocked. Please allow popups for this site.');
}

function getScholarSearchSeedText() {
    const active = document.activeElement;
    if (active === editorTextarea) {
        const selected = getEditorSelectedText();
        if (selected && selected.trim()) return selected.trim();
    }
    const sel = window.getSelection ? window.getSelection() : null;
    const t = sel && sel.toString ? String(sel.toString()) : '';
    if (t.trim()) return t.trim();
    return '';
}

function openScholarSearchModal() {
    const modal = document.getElementById('scholar-search-modal');
    const input = document.getElementById('scholar-search-query');
    if (!modal || !input) return;
    bindScholarSearchModalDrag();
    applyScholarSearchPanelLayout();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const seed = getScholarSearchSeedText();
    if (seed) input.value = seed;
    requestAnimationFrame(function () {
        input.focus();
        input.select();
    });
}

function closeScholarSearchModal() {
    const modal = document.getElementById('scholar-search-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function runScholarSearchFromModal() {
    const input = document.getElementById('scholar-search-query');
    const langEl = document.getElementById('scholar-search-lang');
    const periodEl = document.getElementById('scholar-search-period');
    const reviewEl = document.getElementById('scholar-search-review');
    const q = input ? input.value : '';
    const lang = langEl ? langEl.value : 'ko';
    const period = periodEl ? periodEl.value : '';
    const reviewOnly = !!(reviewEl && reviewEl.checked);
    openScholarSearchWindow(q, { lang: lang, period: period, reviewOnly: reviewOnly });
}

function quickScholarSearchFromSelection() {
    const seed = getScholarSearchSeedText();
    if (!seed) {
        openScholarSearchModal();
        return;
    }
    openScholarSearchWindow(seed);
}

function applyScholarSearchPanelLayout() {
    const modal = document.getElementById('scholar-search-modal');
    const panel = document.getElementById('scholar-search-panel');
    const body = document.getElementById('scholar-search-body');
    const title = document.getElementById('scholar-search-title');
    const queryLabel = document.getElementById('scholar-search-query-label');
    const inputRow = document.getElementById('scholar-search-input-row');
    const options = document.getElementById('scholar-search-options');
    const help = document.getElementById('scholar-search-help');
    const runBtn = document.getElementById('scholar-search-run-btn');
    const queryInput = document.getElementById('scholar-search-query');
    const dockBtn = document.getElementById('scholar-search-dock-btn');
    const shrinkBtn = document.getElementById('scholar-search-shrink-btn');
    if (!modal || !panel) return;

    if (scholarSearchDockRight) {
        modal.classList.remove('items-center', 'justify-center');
        modal.classList.add('items-start', 'justify-end');
        panel.style.position = 'fixed';
        panel.style.top = '80px';
        panel.style.right = '12px';
        panel.style.left = 'auto';
        panel.style.margin = '0';
        panel.style.marginTop = '0';
        panel.style.marginRight = '0';
        panel.style.maxWidth = scholarSearchShrink ? '320px' : '760px';
    } else {
        modal.classList.remove('items-start', 'justify-end');
        modal.classList.add('items-center', 'justify-center');
        panel.style.position = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.left = '';
        panel.style.margin = '';
        panel.style.marginTop = '0';
        panel.style.marginRight = '0';
        panel.style.maxWidth = '760px';
    }

    if (title) title.classList.toggle('text-sm', scholarSearchShrink);
    if (title) title.classList.toggle('text-base', !scholarSearchShrink);
    if (title) title.style.whiteSpace = 'nowrap';
    if (title) title.style.wordBreak = 'keep-all';

    if (body) body.classList.remove('hidden');
    const canShrink = scholarSearchDockRight;
    const isShrinked = canShrink && scholarSearchShrink;
    if (queryLabel) queryLabel.classList.toggle('hidden', isShrinked);
    if (options) options.classList.toggle('hidden', isShrinked);
    if (help) help.classList.toggle('hidden', isShrinked);

    if (inputRow) {
        inputRow.style.display = 'flex';
        inputRow.style.gap = '8px';
        inputRow.style.flexDirection = isShrinked ? 'column' : 'row';
        inputRow.style.alignItems = isShrinked ? 'stretch' : 'center';
    }
    if (queryInput) queryInput.style.width = '100%';
    if (runBtn) {
        runBtn.style.width = isShrinked ? '100%' : '';
        runBtn.textContent = 'Search';
    }

    if (shrinkBtn) {
        shrinkBtn.textContent = isShrinked ? '[<<]' : '[>>]';
        shrinkBtn.disabled = !canShrink;
        shrinkBtn.classList.toggle('opacity-40', !canShrink);
        shrinkBtn.classList.toggle('cursor-not-allowed', !canShrink);
    }
    if (dockBtn) dockBtn.textContent = scholarSearchDockRight ? 'Undock' : 'Dock Right';
}

function bindScholarSearchModalDrag() {
    if (scholarSearchDragBound) return;
    scholarSearchDragBound = true;
    const header = document.getElementById('scholar-search-header');
    const panel = document.getElementById('scholar-search-panel');
    if (!header || !panel) return;

    header.addEventListener('mousedown', function (e) {
        const target = e.target;
        if (!target) return;
        if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;
        scholarSearchDragging = true;
        const rect = panel.getBoundingClientRect();
        scholarSearchDragOffsetX = e.clientX - rect.left;
        scholarSearchDragOffsetY = e.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.margin = '0';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!scholarSearchDragging) return;
        const panelEl = document.getElementById('scholar-search-panel');
        if (!panelEl) return;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - scholarSearchDragOffsetX));
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - scholarSearchDragOffsetY));
        panelEl.style.left = nextLeft + 'px';
        panelEl.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
        scholarSearchDragging = false;
    });
}

function initScholarRefIfAvailable() {
    if (!window.ScholarRef || typeof window.ScholarRef.init !== 'function') return Promise.resolve(false);
    if (scholarRefInitDone) return Promise.resolve(true);
    return Promise.resolve(window.ScholarRef.init({
        dbGetter: function () { return db; },
        getEditor: function () { return editorTextarea; },
        showToast: showToast
    })).then(function () {
        scholarRefInitDone = true;
        return true;
    }).catch(function () {
        return false;
    });
}

function ensureScholarRefReady() {
    if (window.ScholarRef && typeof window.ScholarRef.init === 'function') {
        return initScholarRefIfAvailable();
    }
    if (scholarRefBootPromise) return scholarRefBootPromise;

    const base = getDocumentBaseUrl();
    const version = '20260402-1';
    const candidates = [];
    try {
        const u1 = new URL('./js/Scholarref/scholarref.js', base);
        u1.searchParams.set('v', version);
        candidates.push(u1.href);
    } catch (_) {}
    candidates.push('./js/Scholarref/scholarref.js?v=' + version);
    try {
        const u2 = new URL('./Scholarref/scholarref.js', base);
        u2.searchParams.set('v', version);
        candidates.push(u2.href);
    } catch (_) {}
    candidates.push('./Scholarref/scholarref.js?v=' + version);

    scholarRefBootPromise = new Promise(function (resolve) {
        let idx = 0;
        function tryNext() {
            if (window.ScholarRef && typeof window.ScholarRef.init === 'function') {
                initScholarRefIfAvailable().then(function () { resolve(true); });
                return;
            }
            if (idx >= candidates.length) {
                resolve(false);
                return;
            }
            const src = candidates[idx++];
            const script = document.createElement('script');
            script.charset = 'utf-8';
            script.async = false;
            script.src = src;
            script.onload = function () {
                initScholarRefIfAvailable().then(function (ok) {
                    if (ok) resolve(true);
                    else tryNext();
                });
            };
            script.onerror = function () {
                tryNext();
            };
            document.body.appendChild(script);
        }
        tryNext();
    }).finally(function () {
        scholarRefBootPromise = null;
    });

    return scholarRefBootPromise;
}

function toggleScholarRefPanel() {
    if (window.ScholarRef && typeof window.ScholarRef.togglePanel === 'function') {
        window.ScholarRef.togglePanel();
        return;
    }
    ensureScholarRefReady().then(function (ok) {
        if (!ok) {
            showToast('Reference management module failed to load.');
            return;
        }
        if (window.ScholarRef && typeof window.ScholarRef.togglePanel === 'function') {
            window.ScholarRef.togglePanel();
        }
    });
}

function invokeScholarRef(methodName) {
    const args = Array.prototype.slice.call(arguments, 1);
    const run = function () {
        const mod = window.ScholarRef;
        if (!mod || typeof mod[methodName] !== 'function') return false;
        mod[methodName].apply(mod, args);
        return true;
    };
    if (run()) return;
    ensureScholarRefReady().then(function (ok) {
        if (!ok || !run()) showToast('Reference management module failed to load.');
    });
}

function switchScholarRefTab(index) {
    invokeScholarRef('switchTab', index);
}

function setScholarRefInputMode(mode) {
    invokeScholarRef('setInputMode', mode);
}

function scholarRefApplyInput() {
    invokeScholarRef('applyInput');
}

function scholarRefClearInput() {
    invokeScholarRef('clearInput');
}

function openScholarRefTxtImport() {
    invokeScholarRef('openTxtImport');
}

function openScholarRefMdImport() {
    invokeScholarRef('openMdImport');
}

function importScholarRefTxt(event) {
    invokeScholarRef('importTxt', event);
}

function importScholarRefMd(event) {
    invokeScholarRef('importMd', event);
}

function renderScholarRefSelectionList() {
    invokeScholarRef('renderSelectionList');
}

function toggleScholarRefPick(id, checked) {
    invokeScholarRef('togglePick', id, checked);
}

function selectAllScholarRefs() {
    invokeScholarRef('selectAllFiltered');
}

function clearScholarRefSelection() {
    invokeScholarRef('clearSelection');
}

function insertSelectedScholarRefs() {
    invokeScholarRef('insertSelected');
}

function insertAllScholarRefSection() {
    invokeScholarRef('insertAllSection');
}

function downloadScholarRefTxt() {
    invokeScholarRef('downloadTxt');
}

function downloadScholarRefMd() {
    invokeScholarRef('downloadMd');
}

function openScholarRefListWindow() {
    invokeScholarRef('openListWindow');
}

function deleteScholarRefItem(id) {
    invokeScholarRef('deleteOne', id);
}

function clearAllScholarRefs() {
    invokeScholarRef('clearAll');
}

function toggleScholarSearchDockRight() {
    scholarSearchDockRight = !scholarSearchDockRight;
    if (!scholarSearchDockRight) scholarSearchShrink = false;
    applyScholarSearchPanelLayout();
}

function toggleScholarSearchShrink() {
    if (!scholarSearchDockRight) return;
    scholarSearchShrink = !scholarSearchShrink;
    applyScholarSearchPanelLayout();
}

function openHighlightPopup() {
    const modal = document.getElementById('highlight-popup-modal');
    if (!modal) return;
    bindHighlightPopupDrag();
    // Ensure selection sync is always active even if iframe onload happened
    // before this script finished wiring global handlers.
    bindHighlightSelectionSync();
    applyHighlightPopupLayout();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(syncHighlightSelectionToPopup, 0);
    setTimeout(syncHighlightSelectionToPopup, 80);
}

function closeHighlightPopup() {
    const modal = document.getElementById('highlight-popup-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function applyHighlightPopupLayout() {
    const modal = document.getElementById('highlight-popup-modal');
    const panel = document.getElementById('highlight-popup-panel');
    const body = document.getElementById('highlight-popup-body');
    const openBtn = document.getElementById('highlight-popup-open-btn');
    const saveBtn = document.getElementById('highlight-popup-save-btn');
    const dataBtn = document.getElementById('highlight-popup-data-btn');
    const dockBtn = document.getElementById('highlight-popup-dock-btn');
    const shrinkBtn = document.getElementById('highlight-popup-shrink-btn');
    const closeBtn = document.getElementById('highlight-popup-close-btn');
    if (!modal || !panel) return;

    if (highlightPopupDockRight) {
        modal.classList.remove('items-center', 'justify-center');
        modal.classList.add('items-start', 'justify-start');
        panel.style.position = 'fixed';
        panel.style.top = `${highlightPopupDockTop}px`;
        panel.style.left = '12px';
        panel.style.right = 'auto';
        panel.style.margin = '0';
    } else {
        modal.classList.remove('items-start', 'justify-start');
        modal.classList.add('items-center', 'justify-center');
        panel.style.position = 'relative';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.left = '';
        panel.style.margin = '0';
        panel.style.width = '';
        panel.style.height = '';
    }

    const canShrink = highlightPopupDockRight;
    const isShrinked = canShrink && highlightPopupShrink;
    // Compact mode: keep content visible (do not hide body), only narrow the width.
    if (body) body.classList.remove('hidden');
    const sidebarEl = document.getElementById('sidebar');
    const sidebarWidth = sidebarEl ? Math.round(sidebarEl.getBoundingClientRect().width) : 0;
    const compactWidth = sidebarWidth > 0 ? sidebarWidth : 320;
    // Keep a clearly visible difference between compact and expanded widths.
    const expandedWidth = Math.min(
        Math.max(compactWidth + 140, 420),
        Math.floor(window.innerWidth * 0.58)
    );
    panel.style.width = canShrink ? `${isShrinked ? compactWidth : expandedWidth}px` : '';
    panel.style.minWidth = canShrink ? `${isShrinked ? compactWidth : 360}px` : '';
    panel.style.height = '';
    panel.style.minHeight = '';
    panel.style.resize = 'both';

    if (shrinkBtn) {
        // Expanded -> show shrink arrow, Shrunk -> show expand arrow
        shrinkBtn.textContent = isShrinked ? '>>' : '[<<]';
        shrinkBtn.disabled = !canShrink;
        shrinkBtn.classList.toggle('opacity-40', !canShrink);
        shrinkBtn.classList.toggle('cursor-not-allowed', !canShrink);
    }
    if (openBtn) openBtn.textContent = isShrinked ? 'O' : 'Open';
    if (saveBtn) saveBtn.textContent = isShrinked ? 'S' : 'Save';
    if (dataBtn) dataBtn.textContent = isShrinked ? 'D' : 'Data';
    if (dockBtn) dockBtn.textContent = isShrinked ? 'DOCK' : (highlightPopupDockRight ? 'Undock' : 'Dock Left');
    if (closeBtn) closeBtn.textContent = isShrinked ? 'X' : 'Close';
}

function bindHighlightPopupDrag() {
    if (highlightPopupDragBound) return;
    highlightPopupDragBound = true;
    const header = document.getElementById('highlight-popup-header');
    const panel = document.getElementById('highlight-popup-panel');
    if (!header || !panel) return;

    header.addEventListener('mousedown', function (e) {
        const target = e.target;
        if (!target) return;
        if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;
        highlightPopupDragging = true;
        const rect = panel.getBoundingClientRect();
        if (!highlightPopupDockRight) {
            highlightPopupDragOffsetX = e.clientX - rect.left;
        }
        highlightPopupDragOffsetY = e.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.margin = '0';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!highlightPopupDragging) return;
        const panelEl = document.getElementById('highlight-popup-panel');
        if (!panelEl) return;
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - highlightPopupDragOffsetY));
        if (!highlightPopupDockRight) {
            const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - highlightPopupDragOffsetX));
            panelEl.style.left = nextLeft + 'px';
        } else {
            highlightPopupDockTop = nextTop;
            panelEl.style.left = '12px';
        }
        panelEl.style.top = nextTop + 'px';
        panelEl.style.right = 'auto';
    });

    document.addEventListener('mouseup', function () {
        highlightPopupDragging = false;
    });
}

function toggleHighlightPopupDockRight() {
    highlightPopupDockRight = !highlightPopupDockRight;
    if (!highlightPopupDockRight) highlightPopupShrink = false;
    applyHighlightPopupLayout();
}

function toggleHighlightPopupShrink() {
    if (!highlightPopupDockRight) return;
    highlightPopupShrink = !highlightPopupShrink;
    applyHighlightPopupLayout();
}

function getHighlightFrameWindow() {
    const frame = document.getElementById('highlight-popup-frame');
    if (!frame) return null;
    return frame.contentWindow || null;
}

function sendHighlightPopupCommand(type) {
    const win = getHighlightFrameWindow();
    if (!win || !type) return false;
    try {
        win.postMessage({ type: type }, '*');
        return true;
    } catch (_) {
        return false;
    }
}

function handleHighlightFrameLoad() {
    // Flatten inner frame UI so the outer popup behaves like Scholar Search (single shell).
    const frame = document.getElementById('highlight-popup-frame');
    if (frame) {
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            if (doc && doc.head && !doc.getElementById('highlight-embed-style')) {
                const style = doc.createElement('style');
                style.id = 'highlight-embed-style';
                style.textContent = '.modal-header{display:none!important;} body{padding:0!important;min-height:100%!important;} .modal{width:100%!important;height:100%!important;border:0!important;border-radius:0!important;box-shadow:none!important;} .modal-body{min-height:0!important;height:calc(100% - 72px)!important;}';
                doc.head.appendChild(style);
            }
        } catch (_) {}
    }
    bindHighlightSelectionSync();
    syncHighlightSelectionToPopup();
}

function bindHighlightSelectionSync() {
    if (highlightSelectionSyncBound) return;
    highlightSelectionSyncBound = true;
    document.addEventListener('selectionchange', function () {
        syncHighlightSelectionToPopup();
    });
    // Some browsers/areas emit selection updates more reliably on mouseup/keyup.
    document.addEventListener('mouseup', function () {
        setTimeout(syncHighlightSelectionToPopup, 0);
    });
    document.addEventListener('keyup', function () {
        setTimeout(syncHighlightSelectionToPopup, 0);
    });
    const viewerEl = document.getElementById('viewer');
    if (viewerEl) {
        viewerEl.addEventListener('mouseup', function () {
            setTimeout(syncHighlightSelectionToPopup, 0);
        });
    }
}

function getHighlightSelectionText() {
    const active = document.activeElement;
    if (active === editorTextarea) {
        const selected = getEditorSelectedText();
        if (selected && selected.trim()) return selected.trim();
    }
    const sel = window.getSelection ? window.getSelection() : null;
    const t = sel && sel.toString ? String(sel.toString()) : '';
    return t.trim();
}

function syncHighlightSelectionToPopup() {
    const modal = document.getElementById('highlight-popup-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const win = getHighlightFrameWindow();
    if (!win) return;
    const text = getHighlightSelectionText();
    if (!text) return;
    try {
        if (typeof win.setSelectedText === 'function') {
            win.setSelectedText(text);
        }
    } catch (_) {}
    try {
        if (win.document) {
            const ta = win.document.getElementById('tag-data');
            if (ta) ta.value = text;
        }
    } catch (_) {}
    try {
        win.postMessage({ type: 'highlight-selection', text: text, autoFill: true }, '*');
    } catch (_) {}
}

function openHighlightFile() {
    const win = getHighlightFrameWindow();
    if (!win) return;
    let handled = false;
    try {
        if (win.document) {
            const input = win.document.getElementById('file-input');
            if (input) {
                input.click();
                handled = true;
            }
        }
    } catch (_) {}
    if (!handled) sendHighlightPopupCommand('highlight-open-file');
}

function exportHighlightData() {
    const win = getHighlightFrameWindow();
    if (!win) return;
    let handled = false;
    try {
        if (typeof win.handleExport === 'function') {
            win.handleExport();
            handled = true;
        }
    } catch (_) {}
    if (!handled) sendHighlightPopupCommand('highlight-save-data');
}

function openHighlightDataWindow() {
    const win = getHighlightFrameWindow();
    if (!win) return;
    let handled = false;
    try {
        if (typeof win.openDataInNewWindow === 'function') {
            win.openDataInNewWindow();
            handled = true;
        }
    } catch (_) {}
    if (!handled) sendHighlightPopupCommand('highlight-open-data-window');
}

function applyImageUploadFeatureVisibility(settings) {
    const enabled = getImageUploadEnabledFromSettings(settings || {});
    const imgBtn = document.getElementById('btn-image-insert');
    if (imgBtn) imgBtn.style.display = enabled ? '' : 'none';
    const imgUpBtn = document.getElementById('btn-image-upload-tool');
    if (imgUpBtn) imgUpBtn.style.display = enabled ? '' : 'none';

    const section = document.getElementById('image-upload-settings');
    const check = document.getElementById('image-upload-enabled');
    if (section && check) section.classList.toggle('hidden', !check.checked);
}

async function toggleImageUploadSection() {
    const check = document.getElementById('image-upload-enabled');
    const enabled = !!(check && check.checked);
    await setAiSettings({ imageUploadEnabled: enabled });
    const s = await getAiSettings();
    applyImageUploadFeatureVisibility(s || { imageUploadEnabled: enabled });
}

async function saveImgbbApiKeyFromModal() {
    const input = document.getElementById('ai-imgbb-api-key');
    const feedback = document.getElementById('ai-imgbb-feedback');
    const value = (input && input.value) ? input.value.trim() : '';
    await saveImgbbApiKey(value);
    if (feedback) feedback.textContent = value ? 'imgBB API key saved.' : 'imgBB API key is empty.';
    showToast(value ? 'imgBB API key saved.' : 'imgBB API key cleared.');
}

function syncImgbbApiKeyInputs(value) {
    const v = String(value || '');
    const settingsInput = document.getElementById('ai-imgbb-api-key');
    if (settingsInput && settingsInput.value !== v) settingsInput.value = v;
    const sspInput = document.getElementById('ssp-imgbb-api-key');
    if (sspInput && sspInput.value !== v) sspInput.value = v;
}

function setAiPasswordVerifiedUI(state) {
    const input = document.getElementById('ai-password-input');
    const fb = document.getElementById('ai-password-feedback');
    const base = 'flex-1 min-w-[120px] px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors';
    if (!input) return;
    if (state === 'ok') {
        input.className = base + ' border-green-500 dark:border-green-500 ring-2 ring-green-500/40';
        if (fb) {
            fb.textContent = 'Verification saved. You can now choose AI features below.';
            fb.className = 'text-xs text-green-600 dark:text-green-400 min-h-[1.25rem]';
        }
    } else if (state === 'bad') {
        input.className = base + ' border-red-500 dark:border-red-500 ring-2 ring-red-500/40';
        if (fb) {
            fb.textContent = 'Verification code is invalid. Please try again.';
            fb.className = 'text-xs text-red-600 dark:text-red-400 min-h-[1.25rem]';
        }
    } else {
        input.className = base + ' border-slate-200 dark:border-slate-600';
        if (fb) { fb.textContent = ''; fb.className = 'text-xs min-h-[1.25rem]'; }
    }
}

function toggleAiPasswordSection() {
    const check = document.getElementById('ai-use-checkbox');
    const section = document.getElementById('ai-password-section');
    applyAiUseFold(getAiUseFoldedFromLocal());
    if (check && check.checked) {
        setAiSettings({ aiMasterEnabled: true }).then(() => applyAiFeatureVisibility());
    } else if (check && !check.checked) {
        setAiSettings({ aiMasterEnabled: false }).then(() => applyAiFeatureVisibility());
    }
    if (check && check.checked && section && !getAiUseFoldedFromLocal()) {
        getAiSettings().then(s => updateAiScholarSspimgAvailability(!!(s && s.verified)));
        requestAnimationFrame(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const pwd = document.getElementById('ai-password-input');
            if (pwd) pwd.focus();
        });
    }
    if (check && !check.checked) {
        updateAiScholarSspimgAvailability(false);
    }
}

let _lastVerifiedSaveAt = 0;

async function saveAiPassword() {
    const input = document.getElementById('ai-password-input');
    const pwd = (input && input.value) ? input.value : '';
    if (!pwd) {
        showToast("Enter verification code.");
        const cur = await getAiSettings();
        if (!(cur && cur.verified)) setAiPasswordVerifiedUI('neutral');
        return;
    }
    const hash = await hashPassword(pwd);
    if (hash !== AI_PASSWORD_HASH) {
        setAiPasswordVerifiedUI('bad');
        showToast("Verification code does not match.");
        return;
    }
    await setAiSettings({ passwordHash: hash, verified: true, aiMasterEnabled: true });
    _lastVerifiedSaveAt = Date.now();
    if (input) input.value = '';
    setAiPasswordVerifiedUI('ok');
    updateAiScholarSspimgAvailability(true);
    showToast("Verification complete. ScholarAI / sspimgAI are now available.");
    await applyAiFeatureVisibility();
}

function updateAiScholarSspimgAvailability(verified) {
    if (!verified && Date.now() - _lastVerifiedSaveAt < 300) return;
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const hint = document.getElementById('ai-scholar-sspimg-hint');
    if (scholarEl) {
        scholarEl.disabled = !verified;
        scholarEl.classList.toggle('opacity-50', !verified);
        scholarEl.classList.toggle('cursor-not-allowed', !verified);
    }
    if (sspimgEl) {
        sspimgEl.disabled = !verified;
        sspimgEl.classList.toggle('opacity-50', !verified);
        sspimgEl.classList.toggle('cursor-not-allowed', !verified);
    }
    document.querySelectorAll('.ai-scholar-sspimg-label').forEach(function (lb) {
        lb.classList.toggle('pointer-events-none', !verified);
        lb.classList.toggle('opacity-50', !verified);
    });
    if (hint) {
        if (verified) {
            hint.textContent = 'Verified. ScholarAI and sspimgAI are available.';
            hint.className = 'text-xs text-green-600 dark:text-green-400';
        } else {
            hint.textContent = 'Save verification first to enable ScholarAI / sspimgAI.';
            hint.className = 'text-xs text-amber-600 dark:text-amber-400';
        }
    }
}

async function onAiFeatureCheckboxChange() {
    const settings = await getAiSettings();
    if (!settings || !settings.verified) return;
    await applyAiFeatureVisibility();
}

async function persistAiSettingsFromModal() {
    const enterBrEl = document.getElementById('enter-button-insert-br');
    const enterButtonInsertBrEnabled = !!(enterBrEl && enterBrEl.checked);
    enterButtonInsertBr = enterButtonInsertBrEnabled;
    setEnterButtonInsertBrToLocal(enterButtonInsertBrEnabled);
    const wrapEl = document.getElementById('selection-wrap-enabled');
    const selectionWrapEnabledValue = !(wrapEl && wrapEl.checked === false);
    selectionWrapEnabled = selectionWrapEnabledValue;
    setSelectionWrapEnabledToLocal(selectionWrapEnabledValue);
    const viewModeEditEl = document.getElementById('view-mode-edit-enabled');
    const viewModeEditEnabledValue = !!(viewModeEditEl && viewModeEditEl.checked);
    viewModeEditEnabled = viewModeEditEnabledValue;
    setViewModeEditEnabledToLocal(viewModeEditEnabledValue);
    applyEditToolsVisibilityByMode();
    if (!db) return;
    const s = await getAiSettings();
    const verified = !!(s && s.verified);
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const githubEl = document.getElementById('ai-github-enabled');
    const scholarOn = verified && scholarEl && scholarEl.checked;
    const sspimgOn = verified && sspimgEl && sspimgEl.checked;
    const imageUploadEl = document.getElementById('image-upload-enabled');
    const imageUploadEnabled = !!(imageUploadEl && imageUploadEl.checked);
    const scholarSearchVisibleEl = document.getElementById('scholar-search-visible');
    const scholarSearchVisible = !!(scholarSearchVisibleEl && scholarSearchVisibleEl.checked);
    const highlightVisibleEl = document.getElementById('highlight-visible');
    const highlightVisible = !!(highlightVisibleEl && highlightVisibleEl.checked);
    const sitesVisibleEl = document.getElementById('sites-visible');
    const sitesVisible = !!(sitesVisibleEl && sitesVisibleEl.checked);
    const macroVisibleEl = document.getElementById('macro-visible');
    const macroVisible = !!(macroVisibleEl && macroVisibleEl.checked);
    const templateVisibleEl = document.getElementById('template-visible');
    const templateVisible = !!(templateVisibleEl && templateVisibleEl.checked);
    const githubTokenEl = document.getElementById('github-token-input');
    const githubRepoEl = document.getElementById('github-repo-input');
    const githubBranchEl = document.getElementById('github-branch-input');
    const githubToken = String(githubTokenEl && githubTokenEl.value ? githubTokenEl.value : '').trim();
    const githubRepo = String(githubRepoEl && githubRepoEl.value ? githubRepoEl.value : '').trim();
    const githubBranch = String(githubBranchEl && githubBranchEl.value ? githubBranchEl.value : 'main').trim() || 'main';
    const imgbbKeyInput = document.getElementById('ai-imgbb-api-key');
    const imgbbKey = (imgbbKeyInput && imgbbKeyInput.value) ? imgbbKeyInput.value.trim() : '';
    await setAiSettings({
        scholarAI: !!scholarOn,
        sspimgAI: !!sspimgOn,
        githubEnabled: !!(githubEl && githubEl.checked),
        githubToken: githubToken,
        githubRepo: githubRepo,
        githubBranch: githubBranch,
        scholarSearchVisible: scholarSearchVisible,
        highlightVisible: highlightVisible,
        sitesVisible: sitesVisible,
        macroVisible: macroVisible,
        templateVisible: templateVisible,
        sitesList: sitesList.slice(),
        imageUploadEnabled: imageUploadEnabled,
        enterButtonInsertBr: enterButtonInsertBrEnabled,
        selectionWrapEnabled: selectionWrapEnabledValue,
        viewModeEditEnabled: viewModeEditEnabledValue,
        imgbbApiKey: imgbbKey
    });
    if (imgbbKey) localStorage.setItem('ss_imgbb_api_key', imgbbKey);
    else localStorage.removeItem('ss_imgbb_api_key');
    await applyGithubUiState();
}

async function closeSettingsModal() {
    await persistAiSettingsFromModal();
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
    await applyAiFeatureVisibility();
}

const INDB_STATUS_STORE_ORDER = ['documents', 'folders', 'images', 'autosave', 'ai_settings', 'scholar_refs'];

function escapeInDbStatusHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInDbStatusStores() {
    if (!db || !db.objectStoreNames) return [];
    const existing = Array.from(db.objectStoreNames || []);
    const ordered = [];
    INDB_STATUS_STORE_ORDER.forEach(function (name) {
        if (existing.includes(name)) ordered.push(name);
    });
    existing.forEach(function (name) {
        if (!ordered.includes(name)) ordered.push(name);
    });
    return ordered;
}

function getInDbStatusPrimaryText(storeName, item) {
    const rec = item || {};
    if (storeName === 'documents') return String(rec.title || rec.id || '(untitled)');
    if (storeName === 'folders') return String(rec.name || rec.id || '(folder)');
    if (storeName === 'images') return String(rec.name || rec.id || '(image)');
    if (storeName === 'autosave') return String(rec.title || rec.id || '(autosave)');
    if (storeName === 'scholar_refs') return String(rec.title || rec.id || '(scholar ref)');
    if (storeName === 'ai_settings') return String(rec.id || 'ai_settings');
    return String(rec.id || '(item)');
}

function getInDbStatusSecondaryText(storeName, item) {
    const rec = item || {};
    if (storeName === 'documents') {
        const len = String(rec.content || '').length;
        return 'id=' + String(rec.id || '') + ' | chars=' + len;
    }
    if (storeName === 'images') {
        const size = rec.blob && typeof rec.blob.size === 'number' ? rec.blob.size : 0;
        return 'id=' + String(rec.id || '') + ' | bytes=' + size;
    }
    return 'id=' + String(rec.id || '');
}

async function readAllInDbStoreItems(storeName) {
    return await new Promise(function (resolve) {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { resolve([]); };
        } catch (e) {
            resolve([]);
        }
    });
}

async function renderInDbStatusModal() {
    const listEl = document.getElementById('indb-status-list');
    if (!listEl) return;
    if (!db) {
        listEl.innerHTML = '<div class="text-sm text-red-600 dark:text-red-400">IndexedDB is not ready.</div>';
        return;
    }

    const stores = getInDbStatusStores();
    if (!stores.length) {
        listEl.innerHTML = '<div class="text-sm text-slate-500 dark:text-slate-400">No object stores found.</div>';
        return;
    }

    const sections = [];
    for (let si = 0; si < stores.length; si++) {
        const storeName = stores[si];
        const items = await readAllInDbStoreItems(storeName);
        const rows = [];
        for (let i = 0; i < items.length; i++) {
            const rec = items[i] || {};
            const id = String(rec.id || '').trim();
            if (!id) continue;
            const lockedRoot = storeName === 'folders' && id === 'root';
            const title = escapeInDbStatusHtml(getInDbStatusPrimaryText(storeName, rec));
            const sub = escapeInDbStatusHtml(getInDbStatusSecondaryText(storeName, rec));
            const btn = lockedRoot
                ? '<span class="text-xs text-slate-400 dark:text-slate-500">root</span>'
                : '<button type="button" class="text-red-600 hover:text-red-700 font-bold text-lg leading-none" onclick="deleteInDbStatusItem(\'' + escapeInDbStatusHtml(storeName) + '\', \'' + escapeInDbStatusHtml(id) + '\')">x</button>';
            rows.push(
                '<div class="flex items-start gap-3 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">' +
                '<div class="min-w-[88px] text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-300 mt-0.5">' + escapeInDbStatusHtml(storeName) + '</div>' +
                '<div class="flex-1 min-w-0">' +
                '<div class="text-sm font-semibold text-slate-800 dark:text-slate-100 break-all">' + title + '</div>' +
                '<div class="text-[11px] text-slate-500 dark:text-slate-400 break-all">' + sub + '</div>' +
                '</div>' +
                '<div class="shrink-0 pt-1">' + btn + '</div>' +
                '</div>'
            );
        }

        const body = rows.length
            ? rows.join('')
            : '<div class="text-xs text-slate-400 dark:text-slate-500 px-2 py-1">No records</div>';
        sections.push(
            '<div class="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">' +
            '<div class="px-3 py-1.5 text-xs font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200">' +
            escapeInDbStatusHtml(storeName) + ' (' + items.length + ')' +
            '</div>' +
            '<div class="p-2 space-y-1">' + body + '</div>' +
            '</div>'
        );
    }

    listEl.innerHTML = sections.join('');
}

async function openInDbStatusModal() {
    const modal = document.getElementById('indb-status-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await renderInDbStatusModal();
}

function closeInDbStatusModal() {
    const modal = document.getElementById('indb-status-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function deleteInDbStatusItem(storeName, id) {
    const store = String(storeName || '').trim();
    const itemId = String(id || '').trim();
    if (!db || !store || !itemId) return;
    if (store === 'folders' && itemId === 'root') {
        showToast('ROOT folder cannot be deleted.');
        return;
    }

    const first = window.confirm('Delete this item?\n[' + store + '] ' + itemId);
    if (!first) return;
    const second = window.confirm('Are you sure again?\nThis action cannot be undone.');
    if (!second) return;

    await new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(itemId);
            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete item.')); };
        } catch (e) {
            reject(e);
        }
    }).catch(function (e) {
        showToast('Delete failed: ' + (e && e.message ? e.message : e));
    });

    if (store === 'documents' && String(currentDbDocId || '') === itemId) {
        currentDbDocId = null;
        setCurrentDocumentInfo('untitled.md', null);
        updateContent('');
        markPersistedState();
    }

    await ensureRootFolder();
    renderDBList();
    await renderInDbStatusModal();
    showToast('Deleted: [' + store + '] ' + itemId);
}

async function deleteAllInDbStatusItems() {
    if (!db) return;
    const first = window.confirm('Delete all inDB items?');
    if (!first) return;
    const second = window.confirm('Are you sure again?\nAll records will be removed (ROOT folder is kept).');
    if (!second) return;

    const stores = getInDbStatusStores();
    for (let i = 0; i < stores.length; i++) {
        const storeName = stores[i];
        if (storeName === 'folders') {
            const folders = await readAllInDbStoreItems('folders');
            await new Promise(function (resolve) {
                try {
                    const tx = db.transaction('folders', 'readwrite');
                    const os = tx.objectStore('folders');
                    folders.forEach(function (f) {
                        const id = String((f && f.id) || '').trim();
                        if (id && id !== 'root') os.delete(id);
                    });
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch (e) {
                    resolve();
                }
            });
        } else {
            await new Promise(function (resolve) {
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).clear();
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch (e) {
                    resolve();
                }
            });
        }
    }

    currentDbDocId = null;
    setCurrentDocumentInfo('untitled.md', null);
    updateContent('');
    markPersistedState();
    await ensureRootFolder();
    renderDBList();
    await renderInDbStatusModal();
    showToast('All inDB items deleted.');
}

function isAiMasterEnabled(settings) {
    const check = document.getElementById('ai-use-checkbox');
    if (check) return !!check.checked;
    if (settings && settings.aiMasterEnabled === false) return false;
    return true;
}

async function applyAiFeatureVisibility() {
    if (!db) return;
    const settings = await getAiSettings();
    const verified = settings && settings.verified === true;
    const useMaster = isAiMasterEnabled(settings);
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const modal = document.getElementById('settings-modal');
    const modalVisible = modal && !modal.classList.contains('hidden');
    const scholarOn = modalVisible && scholarEl ? !!scholarEl.checked : !!(settings && settings.scholarAI === true);
    const sspimgOn = modalVisible && sspimgEl ? !!sspimgEl.checked : !!(settings && settings.sspimgAI === true);
    await setAiSettings({ scholarAI: scholarOn, sspimgAI: sspimgOn });
    const showAi = !!(useMaster && verified && (scholarOn || sspimgOn));
    const headerBtns = document.getElementById('header-ai-btns');
    const wrap = document.getElementById('ai-right-sidebar-wrap');
    const btnScholar = document.getElementById('btn-scholar-ai');
    const btnSsp = document.getElementById('btn-sspimg-ai');
    if (headerBtns) {
        if (showAi) {
            headerBtns.classList.remove('hidden');
            headerBtns.classList.add('flex');
            headerBtns.style.display = 'flex';
            if (btnScholar) {
                btnScholar.classList.toggle('hidden', !scholarOn);
                btnScholar.style.display = scholarOn ? '' : 'none';
            }
            if (btnSsp) {
                btnSsp.classList.toggle('hidden', !sspimgOn);
                btnSsp.style.display = sspimgOn ? '' : 'none';
            }
        } else {
            headerBtns.classList.add('hidden');
            headerBtns.style.display = 'none';
            if (btnScholar) btnScholar.style.display = '';
            if (btnSsp) btnSsp.style.display = '';
        }
    }
    if (wrap) {
        if (!showAi) {
            if (typeof window.scholarAIShrink === 'function') window.scholarAIShrink();
            if (typeof window.sspAIShrink === 'function') window.sspAIShrink();
            wrap.classList.add('hidden');
            wrap.style.width = '0';
            wrap.style.display = 'none';
        } else {
            const sch = document.getElementById('scholar-ai-sidebar');
            const ssp = document.getElementById('ssp-ai-sidebar');
            const schDockOpen = sch && sch.classList.contains('open') && !sch.classList.contains('popup') && !sch.classList.contains('fullscreen');
            const sspDockOpen = ssp && ssp.classList.contains('open') && !ssp.classList.contains('popup');
            const anyDockOpen = !!(schDockOpen || sspDockOpen);
            if (!anyDockOpen) {
                wrap.classList.add('hidden');
                wrap.style.width = '0';
                wrap.style.display = 'none';
            }
        }
    }
    if (showAi) ensureSidebarAILoadedSafe();
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    applyScholarSearchVisibility(settings || { scholarSearchVisible: false });
    applyToDocsVisibility(settings || { toDocsVisible: false });
    applyTemplateVisibility(settings || { templateVisible: false });
}

function setAiSidebarWrapVisible(w, isLoading) {
    const wrap = document.getElementById('ai-right-sidebar-wrap');
    const inner = document.getElementById('ai-right-sidebar-inner');
    if (!wrap) return;
    var width = typeof w === 'number' ? w : 380;
    width = Math.min(width, Math.floor(window.innerWidth * 0.92));
    var sb = document.getElementById('sidebar');
    width = Math.min(width, Math.max(300, window.innerWidth - (sb ? sb.offsetWidth : 0) - 260));
    const isDark = document.documentElement.classList.contains('dark');
    const header = document.querySelector('header.app-header');
    const topOffset = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    const overlayZ = 2147483200;
    wrap.classList.remove('hidden');
    wrap.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'position:fixed',
        'top:' + topOffset + 'px',
        'right:0',
        'bottom:0',
        'z-index:' + overlayZ,
        'pointer-events:auto',
        'flex-shrink:0',
        'width:' + width + 'px',
        'min-width:0',
        'max-width:min(96vw, calc(100vw - 120px))',
        'min-height:0',
        'height:calc(100vh - ' + topOffset + 'px)',
        'overflow:hidden',
        'box-shadow:-4px 0 16px rgba(0,0,0,0.08)',
        'border-left:1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
        'background:' + (isDark ? '#0f172a' : '#f8fafc')
    ].join(';');
    if (inner) {
        inner.style.flex = '1';
        inner.style.minHeight = '0';
        inner.style.overflow = 'auto';
        inner.style.width = '100%';
        if (isLoading && !inner.querySelector('#scholar-ai-sidebar') && !inner.querySelector('#ssp-ai-sidebar')) {
            inner.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm p-4">Loading AI sidebar...</div>';
        }
    }
}

function refreshAiRightSidebarWrap() {
    const wrap = document.getElementById('ai-right-sidebar-wrap');
    const inner = document.getElementById('ai-right-sidebar-inner');
    if (!wrap) return;
    const sch = document.getElementById('scholar-ai-sidebar');
    const ssp = document.getElementById('ssp-ai-sidebar');
    const schOpen = sch && sch.classList.contains('open');
    const sspOpen = ssp && ssp.classList.contains('open');
    const schDockOpen = schOpen && !sch.classList.contains('popup') && !sch.classList.contains('fullscreen');
    const sspDockOpen = sspOpen && !ssp.classList.contains('popup');
    if (!schDockOpen && !sspDockOpen) {
        wrap.classList.add('hidden');
        wrap.style.cssText = 'width:0!important;min-width:0!important;max-width:0!important;display:none!important;flex:0!important;overflow:hidden!important;border:none!important;box-shadow:none!important;padding:0!important;margin:0!important;';
        updateHeaderAiButtonsActive();
        return;
    }
    var w = 400;
    if (schDockOpen && sspDockOpen) {
        var sw = (sch && sch.offsetWidth > 80) ? sch.offsetWidth : 380;
        var pw = (ssp && ssp.offsetWidth > 80) ? ssp.offsetWidth : 400;
        w = Math.min(Math.max(sw + pw, 720), Math.floor(window.innerWidth * 0.96));
    } else if (schDockOpen) w = Math.max(360, Math.min((sch && sch.offsetWidth) || 380, 520));
    else if (sspDockOpen) w = Math.max(360, Math.min((ssp && ssp.offsetWidth) || 400, 520));
    w = Math.min(w, Math.floor(window.innerWidth * 0.96));
    var sidebarLeft = document.getElementById('sidebar');
    var leftW = sidebarLeft ? sidebarLeft.offsetWidth : 0;
    var minMain = 260;
    var maxAi = Math.max(300, window.innerWidth - leftW - minMain);
    w = Math.min(w, maxAi);
    const isDark = document.documentElement.classList.contains('dark');
    const header = document.querySelector('header.app-header');
    const topOffset = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    const overlayZ = 2147483200;
    wrap.classList.remove('hidden');
    wrap.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'position:fixed',
        'top:' + topOffset + 'px',
        'right:0',
        'bottom:0',
        'z-index:' + overlayZ,
        'pointer-events:auto',
        'flex-shrink:0',
        'width:' + w + 'px',
        'min-width:0',
        'max-width:min(96vw, calc(100vw - 120px))',
        'min-height:0',
        'height:calc(100vh - ' + topOffset + 'px)',
        'overflow:hidden',
        'box-shadow:-4px 0 16px rgba(0,0,0,0.08)',
        'border-left:1px solid ' + (isDark ? '#334155' : '#e2e8f0'),
        'background:' + (isDark ? '#0f172a' : '#f8fafc')
    ].join(';');
    if (inner) {
        inner.style.flex = '1';
        inner.style.minHeight = '0';
        inner.style.display = 'flex';
        inner.style.flexDirection = 'row';
        inner.style.alignItems = 'stretch';
        inner.style.overflowX = schDockOpen && sspDockOpen ? 'auto' : 'hidden';
        inner.style.overflowY = 'hidden';
        inner.style.width = '100%';
    }
    updateHeaderAiButtonsActive();
}

function updateHeaderAiButtonsActive() {
    const sch = document.getElementById('scholar-ai-sidebar');
    const ssp = document.getElementById('ssp-ai-sidebar');
    const bSch = document.getElementById('btn-scholar-ai');
    const bSsp = document.getElementById('btn-sspimg-ai');
    const schOn = sch && sch.classList.contains('open');
    const sspOn = ssp && ssp.classList.contains('open');
    const base = 'px-3 py-1.5 rounded-md text-xs font-medium transition-shadow';
    function vis(btn) {
        return btn && btn.style.display !== 'none' && !btn.classList.contains('hidden');
    }
    if (vis(bSch)) {
        bSch.className = base + ' ' + (schOn
            ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-500 dark:ring-indigo-400'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600');
    }
    if (vis(bSsp)) {
        bSsp.className = base + ' ' + (sspOn
            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500 dark:ring-amber-400'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600');
    }
}

function ensureSidebarAILoadedThen(cb) {
    ensureSidebarAILoadedSafe().then(function (ok) {
        if (!ok) {
            showToast('Failed to load AI sidebar module.');
            return;
        }
        if (typeof cb === 'function') cb();
    });
}

function withAiSidebarReady(runFn) {
    return ensureSidebarAILoadedSafe().then(function (ok) {
        if (ok) {
            try {
                runFn();
                return true;
            } catch (_) {}
        }
        return ensureSidebarAILoadedSafe(true).then(function (ok2) {
            if (!ok2) {
                showToast('Failed to recover AI sidebar module.');
                return false;
            }
            try {
                runFn();
                return true;
            } catch (e) {
                showToast('AI sidebar action failed: ' + (e && e.message ? e.message : e));
                return false;
            }
        });
    });
}

function openScholarAIFromHeader() {
    getAiSettings().then(function (s) {
        if (!s || !s.verified) {
            showToast('Verification is required first. Open Settings and complete verification.');
            return;
        }
        setAiSidebarWrapVisible(380, true);
        withAiSidebarReady(function () {
            var scholar = document.getElementById('scholar-ai-sidebar');
            if (!scholar) throw new Error('ScholarAI panel not found');
            if (scholar.classList.contains('open')) {
                if (typeof window.scholarAIShrink === 'function') window.scholarAIShrink();
                else scholar.classList.remove('open');
                refreshAiRightSidebarWrap();
                return;
            }
            if (!scholar.classList.contains('open') && typeof window.toggleScholarAI === 'function') window.toggleScholarAI();
            refreshAiRightSidebarWrap();
            requestAnimationFrame(function () {
                requestAnimationFrame(refreshAiRightSidebarWrap);
            });
        });
    });
}

function openSspimgAIFromHeader() {
    getAiSettings().then(function (s) {
        if (!s || !s.verified) {
            showToast('Verification is required first. Open Settings and complete verification.');
            return;
        }
        setAiSidebarWrapVisible(400, true);
        withAiSidebarReady(function () {
            var ssp = document.getElementById('ssp-ai-sidebar');
            if (!ssp) throw new Error('sspimgAI panel not found');
            if (ssp.classList.contains('open')) {
                if (typeof window.sspAIShrink === 'function') window.sspAIShrink();
                else ssp.classList.remove('open');
                refreshAiRightSidebarWrap();
                return;
            }
            if (!ssp.classList.contains('open') && typeof window.toggleViewerSSP === 'function') window.toggleViewerSSP();
            refreshAiRightSidebarWrap();
            requestAnimationFrame(function () {
                requestAnimationFrame(refreshAiRightSidebarWrap);
            });
        });
    });
}

function openImageUploadTool() {
    setAiSidebarWrapVisible(400, true);
    withAiSidebarReady(function () {
        var ssp = document.getElementById('ssp-ai-sidebar');
        if (!ssp) throw new Error('sspimgAI panel not found');
        if (!ssp.classList.contains('open') && typeof window.toggleViewerSSP === 'function') window.toggleViewerSSP();
        refreshAiRightSidebarWrap();
        requestAnimationFrame(function () {
            var uploadZone = document.getElementById('ssp-upload-zone');
            if (uploadZone && typeof uploadZone.scrollIntoView === 'function') {
                uploadZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}

function viewerSSPCropFromPanel() {
    const resultImg = document.getElementById('ssp-result-img');
    const src = resultImg && resultImg.src ? resultImg.src : '';
    if (!src) {
        showToast('Generate an image first, then open the crop tool.');
        return;
    }
    if (typeof window.viewerSSPOpenFullscreen === 'function') window.viewerSSPOpenFullscreen(src);
    if (typeof window.viewerSSPFsCrop === 'function') window.viewerSSPFsCrop();
}

window.__onAiSidebarPanelClosed = refreshAiRightSidebarWrap;
window.openScholarAIFromHeader = openScholarAIFromHeader;
window.openSspimgAIFromHeader = openSspimgAIFromHeader;
window.openImageUploadTool = openImageUploadTool;
window.viewerSSPCropFromPanel = viewerSSPCropFromPanel;
window.refreshAiRightSidebarWrap = refreshAiRightSidebarWrap;
if (!window.__aiSidebarResizeBound) {
    window.__aiSidebarResizeBound = true;
    window.addEventListener('resize', function () {
        var sch = document.getElementById('scholar-ai-sidebar');
        var ssp = document.getElementById('ssp-ai-sidebar');
        if ((sch && sch.classList.contains('open')) || (ssp && ssp.classList.contains('open'))) refreshAiRightSidebarWrap();
    });
}

let sidebarAILoaded = false;

function getDocumentBaseUrl() {
    return document.baseURI || window.location.href;
}

function ensureSidebarAILoaded() {
    if (sidebarAILoaded) return;
    sidebarAILoaded = true;
    getAiSettings().then(s => {
        if (s && s.apiKey) localStorage.setItem('ss_gemini_api_key', s.apiKey);
        if (s && s.imgbbApiKey) localStorage.setItem('ss_imgbb_api_key', s.imgbbApiKey);
    });
    window.SidebarAIConfig = {
        host: null,
        cropEditorBase: './js/crop/',
        callbacks: {
            getApiKey: function () { return localStorage.getItem('ss_gemini_api_key') || ''; },
            getImgbbApiKey: function () { return getImgbbApiKey(); },
            setImgbbApiKey: async function (key) { return saveImgbbApiKey(key); },
            getImageUploadEnabled: function () { return true; },
            callGemini: async function (prompt, systemInstruction, useSearch, modelOverride) {
                const key = localStorage.getItem('ss_gemini_api_key') || '';
                const modelId = modelOverride || 'gemini-2.5-flash';
                const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + key;
                const payload = { contents: [{ parts: [{ text: prompt }] }] };
                if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
                if (useSearch) payload.tools = [{ googleSearch: {} }];
                const ctrl = new AbortController();
                window._abortController = ctrl;
                let res;
                try {
                    res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: ctrl.signal
                    });
                } finally {
                    if (window._abortController === ctrl) window._abortController = null;
                }
                if (!res.ok) throw new Error('API Error: ' + res.status);
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return { text: text };
            },
            /**
             */
            generateImage: async function (prompt, options) {
                const key = localStorage.getItem('ss_gemini_api_key') || '';
                if (!key || !String(key).trim()) throw new Error('API key is missing. Save your Gemini API key in Settings.');
                const ctrl = new AbortController();
                window._abortController = ctrl;
                try {
                let modelId = (options && options.modelId) || 'gemini-2.5-flash-image';
                const aspectRatio = (options && options.aspectRatio) || '1:1';
                const simpleNoText = !!(options && options.noText);
                const seedImage = options && options.seedImage;
                const hasSeed = seedImage && typeof seedImage === 'string' && seedImage.indexOf('data:image') === 0;
                const ACADEMIC_STYLE = '[Scholarly figure mode] For research papers, lectures, or textbooks: professional conceptual diagram or clean illustration, publication-appropriate layout and colors. Short labels, axis titles, or brief Korean/English annotations are encouraged when they clarify the content. Avoid decorative clutter.';
                const SIMPLE_STYLE = '[Simple image mode] Purely visual output only: absolutely no text, letters, numbers, captions, watermarks, or typography.';

                if (modelId.indexOf('imagen-') === 0) {
                    if (hasSeed) {
                        modelId = 'gemini-2.5-flash-image';
                    } else {
                        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':predict?key=' + encodeURIComponent(key);
                        let p = (prompt || '').trim() || 'A clear, high-quality image.';
                        p += simpleNoText ? ' ' + SIMPLE_STYLE.replace('[Simple image mode] ', '') : ' Scholarly academic figure style; clear diagram quality; text labels allowed when helpful.';
                        const body = {
                            instances: [{ prompt: p }],
                            parameters: {
                                sampleCount: 1,
                                aspectRatio: aspectRatio,
                                personGeneration: 'allow_adult'
                            }
                        };
                        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
                        if (!res.ok) {
                            let msg = String(res.status);
                            try { const err = await res.json(); msg = err.error?.message || msg; } catch (e) {}
                            throw new Error(msg);
                        }
                        const data = await res.json();
                        const gi = data.generatedImages && data.generatedImages[0];
                        const bytes = gi && gi.image && gi.image.imageBytes;
                        return bytes ? 'data:image/png;base64,' + bytes : null;
                    }
                }

                const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + encodeURIComponent(key);
                let textPrompt = (prompt || '').trim();
                if (simpleNoText) {
                    textPrompt = (textPrompt ? textPrompt + '\n\n' : '') + SIMPLE_STYLE;
                } else {
                    textPrompt = (textPrompt ? textPrompt + '\n\n' : '') + ACADEMIC_STYLE;
                }
                if (!((prompt || '').trim()) && hasSeed) {
                    textPrompt = simpleNoText
                        ? 'Edit or transform this image based on the reference.\n\n' + SIMPLE_STYLE
                        : 'Adapt this image into a scholarly figure suitable for academic use (diagrams, clear structure, optional short labels).\n\n' + ACADEMIC_STYLE;
                }
                if (!textPrompt.trim()) {
                    textPrompt = simpleNoText
                        ? 'Generate a clean illustrative image.\n\n' + SIMPLE_STYLE
                        : 'Generate an academic-style conceptual diagram or scholarly illustration.\n\n' + ACADEMIC_STYLE;
                }

                const parts = [];
                if (hasSeed) {
                    const comma = seedImage.indexOf(',');
                    const b64 = comma >= 0 ? seedImage.slice(comma + 1) : seedImage;
                    const mimeMatch = seedImage.match(/^data:([^;]+);/);
                    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
                    parts.push({ inlineData: { mimeType: mime, data: b64 } });
                }
                parts.push({ text: textPrompt });

                const genFull = {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: { aspectRatio: aspectRatio }
                };
                const genLite = { imageConfig: { aspectRatio: aspectRatio } };
                let payload = { contents: [{ role: 'user', parts }], generationConfig: genFull };
                let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
                if (!res.ok && res.status === 400) {
                    payload.generationConfig = genLite;
                    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
                }
                if (!res.ok) {
                    let msg = String(res.status);
                    try { const err = await res.json(); msg = err.error?.message || msg; } catch (e) {}
                    throw new Error(msg);
                }
                const data = await res.json();
                const errObj = data.error;
                if (errObj) throw new Error(errObj.message || 'API error');

                const cand = data.candidates && data.candidates[0];
                if (!cand) throw new Error('No image response received from the model. Please retry.');
                const cparts = cand.content && cand.content.parts;
                if (cparts) {
                    for (let i = 0; i < cparts.length; i++) {
                        const id = cparts[i].inlineData;
                        if (id && id.data) {
                            const mt = id.mimeType || 'image/png';
                            return 'data:' + mt + ';base64,' + id.data;
                        }
                    }
                    const t = cparts.find(function (x) { return x.text; });
                    if (t && t.text) throw new Error(t.text.slice(0, 200));
                }
                if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error('Image generation stopped unexpectedly: ' + cand.finishReason);
                throw new Error('Failed to extract generated image data from API response.');
                } finally {
                    if (window._abortController === ctrl) window._abortController = null;
                }
            },
            getScholarAISystemInstruction: function () {
                const saved = (localStorage.getItem('ss_scholar_ai_system') || '').trim();
                if (saved) return saved;
                if (typeof window.getDefaultScholarAIPrompt === 'function') {
                    try { return window.getDefaultScholarAIPrompt() || ''; } catch (e) {}
                }
                return '';
            },
            setScholarAISystemInstruction: function (text) {
                const next = String(text || '').trim();
                if (!next) localStorage.removeItem('ss_scholar_ai_system');
                else localStorage.setItem('ss_scholar_ai_system', next);
            },
            getScholarAIModelId: function () { return localStorage.getItem('ss_scholar_ai_model') || 'gemini-2.5-pro'; },
            setScholarAIModelId: function (id) { localStorage.setItem('ss_scholar_ai_model', id || ''); },
            getImageModelId: function () { return localStorage.getItem('ss_image_model') || 'gemini-2.5-flash-image'; },
            abortCurrentTask: function () { if (window._abortController) window._abortController.abort(); },
            setViewerContent: function (text) { if (typeof updateContent === 'function') updateContent(text || ''); },
            getViewerRenderedContent: function (text) {
                var t = text || '';
                if (typeof marked !== 'undefined' && marked.parse) {
                    try {
                        return marked.parse(preprocessMarkdownForView(t));
                    } catch (e) {
                        return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                    }
                }
                return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }
        }
    };
    const script = document.createElement('script');
    const base = getDocumentBaseUrl();
    const aiSidebarScriptVersion = '20260402-2';
    try {
        const u = new URL('./sidebarAI/sidebar-ai.js', base);
        u.searchParams.set('v', aiSidebarScriptVersion);
        script.src = u.href;
    } catch (e) {
        script.src = './sidebarAI/sidebar-ai.js?v=' + aiSidebarScriptVersion;
    }
    script.charset = 'utf-8';
    script.onerror = function () {
        showToast('Failed to load sidebar-ai.js');
    };
    script.onload = () => {
        injectSidebarAIHtml().then(function (ok) {
            if (ok !== false && typeof window.sidebarAIInit === 'function') window.sidebarAIInit();
        });
    };
    window.viewerSwitchToEdit = function () { toggleMode('edit'); };
    window.viewerBuildNav = function () {};
    document.body.appendChild(script);
}

function isAiSidebarRuntimeReady() {
    return typeof window.toggleScholarAI === 'function'
        && typeof window.toggleViewerSSP === 'function'
        && !!document.getElementById('ai-right-sidebar-inner');
}

function clearAiSidebarRuntimeForReload() {
    try { delete window.__sidebarAILoaded; } catch (_) { window.__sidebarAILoaded = undefined; }
    [
        'toggleScholarAI',
        'toggleViewerSSP',
        'scholarAIShrink',
        'sspAIShrink',
        'scholarAIRun',
        'viewerSSPGenerate',
        'sidebarAIInit'
    ].forEach(function (key) {
        try { delete window[key]; } catch (_) { window[key] = undefined; }
    });
    const inner = document.getElementById('ai-right-sidebar-inner');
    if (inner) inner.innerHTML = '';
}

function waitForAiSidebarRuntimeReady(timeoutMs) {
    const timeout = Math.max(300, Number(timeoutMs || 2400));
    return new Promise(function (resolve) {
        const start = Date.now();
        const t = setInterval(function () {
            if (isAiSidebarRuntimeReady()) {
                clearInterval(t);
                resolve(true);
                return;
            }
            if (Date.now() - start >= timeout) {
                clearInterval(t);
                resolve(false);
            }
        }, 50);
    });
}

function ensureSidebarAILoadedSafe(forceReload) {
    const force = forceReload === true;
    if (aiSidebarBootPromise && !force) return aiSidebarBootPromise;

    aiSidebarBootPromise = (async function () {
        aiSidebarLoadAttempts += 1;
        if (force) {
            clearAiSidebarRuntimeForReload();
            sidebarAILoaded = false;
        }

        ensureSidebarAILoaded();
        let ok = await waitForAiSidebarRuntimeReady(2600);
        if (!ok) {
            await injectSidebarAIHtml().catch(function () {});
            try {
                if (typeof window.sidebarAIInit === 'function') window.sidebarAIInit();
            } catch (_) {}
            ok = await waitForAiSidebarRuntimeReady(1800);
        }

        if (!ok && !force) {
            clearAiSidebarRuntimeForReload();
            sidebarAILoaded = false;
            ensureSidebarAILoaded();
            ok = await waitForAiSidebarRuntimeReady(2600);
            if (!ok) {
                await injectSidebarAIHtml().catch(function () {});
                try {
                    if (typeof window.sidebarAIInit === 'function') window.sidebarAIInit();
                } catch (_) {}
                ok = await waitForAiSidebarRuntimeReady(1800);
            }
        }
        return !!ok;
    })().finally(function () {
        aiSidebarBootPromise = null;
    });

    return aiSidebarBootPromise;
}

function injectSidebarAIHtml() {
    const inner = document.getElementById('ai-right-sidebar-inner');
    if (!inner || inner.querySelector('#scholar-ai-sidebar')) return Promise.resolve(true);
    const applyHtml = function (html) {
        if (!html || !String(html).trim()) return false;
        inner.style.display = 'flex';
        inner.style.flexDirection = 'row';
        inner.style.alignItems = 'stretch';
        inner.style.height = '100%';
        inner.style.overflow = 'hidden';
        inner.className = 'h-full flex flex-row items-stretch overflow-hidden min-w-0';
        inner.innerHTML = html;
        getAiSettings().then(function (s) {
            applyImageUploadFeatureVisibility(s || { imageUploadEnabled: false });
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return true;
    };
    const tryFetch = function (u) {
        return fetch(u, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            return r.text();
        });
    };
    const tryIframeLoad = function (u) {
        return new Promise(function (resolve, reject) {
            const iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.tabIndex = -1;
            iframe.style.position = 'absolute';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const cleanup = function () {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            };

            iframe.onload = function () {
                try {
                    const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                    const html = doc && doc.body ? doc.body.innerHTML : '';
                    cleanup();
                    if (html && html.trim()) resolve(html);
                    else reject(new Error('empty sidebar html'));
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };
            iframe.onerror = function () {
                cleanup();
                reject(new Error('iframe load failed'));
            };

            iframe.src = u;
            document.body.appendChild(iframe);
        });
    };
    var base = '';
    const baseUrl = getDocumentBaseUrl();
    try {
        base = new URL('./sidebarAI/sidebar-ai.html', baseUrl).href;
    } catch (e2) {
        base = './sidebarAI/sidebar-ai.html';
    }
    return tryFetch(base)
        .catch(function () { return tryFetch('./sidebarAI/sidebar-ai.html'); })
        .catch(function () { return tryIframeLoad(base); })
        .catch(function () { return tryIframeLoad('./sidebarAI/sidebar-ai.html'); })
        .then(function (html) {
            return applyHtml(html);
        })
        .catch(function () {
            try {
                if (typeof window.getSidebarAIHtml === 'function') return applyHtml(window.getSidebarAIHtml());
            } catch (e) {}
            return false;
        });
}

async function loadAiSettingsToUI() {
    const settings = await getAiSettings();
    if (!settings) {
        const imageCheckEmpty = document.getElementById('image-upload-enabled');
        if (imageCheckEmpty) imageCheckEmpty.checked = false;
        const scholarSearchCheckEmpty = document.getElementById('scholar-search-visible');
        if (scholarSearchCheckEmpty) scholarSearchCheckEmpty.checked = false;
        const highlightCheckEmpty = document.getElementById('highlight-visible');
        if (highlightCheckEmpty) highlightCheckEmpty.checked = false;
        const sitesCheckEmpty = document.getElementById('sites-visible');
        if (sitesCheckEmpty) sitesCheckEmpty.checked = false;
        const macroCheckEmpty = document.getElementById('macro-visible');
        if (macroCheckEmpty) macroCheckEmpty.checked = false;
        const templateCheckEmpty = document.getElementById('template-visible');
        if (templateCheckEmpty) templateCheckEmpty.checked = false;
        const html2pptCheckEmpty = document.getElementById('html2ppt-visible');
        if (html2pptCheckEmpty) html2pptCheckEmpty.checked = false;
        const enterBrCheckEmpty = document.getElementById('enter-button-insert-br');
        const localEnterBr = getEnterButtonInsertBrFromLocal();
        if (enterBrCheckEmpty) enterBrCheckEmpty.checked = localEnterBr;
        enterButtonInsertBr = localEnterBr;
        const wrapCheckEmpty = document.getElementById('selection-wrap-enabled');
        const localWrapEnabled = getSelectionWrapEnabledFromLocal();
        if (wrapCheckEmpty) wrapCheckEmpty.checked = localWrapEnabled;
        selectionWrapEnabled = localWrapEnabled;
        const viewModeEditCheckEmpty = document.getElementById('view-mode-edit-enabled');
        const localViewModeEditEnabled = getViewModeEditEnabledFromLocal();
        if (viewModeEditCheckEmpty) viewModeEditCheckEmpty.checked = localViewModeEditEnabled;
        viewModeEditEnabled = localViewModeEditEnabled;
        const imageInputEmpty = document.getElementById('ai-imgbb-api-key');
        if (imageInputEmpty) imageInputEmpty.value = '';
        const githubEnabledEmpty = document.getElementById('ai-github-enabled');
        if (githubEnabledEmpty) githubEnabledEmpty.checked = false;
        const githubTokenEmpty = document.getElementById('github-token-input');
        if (githubTokenEmpty) githubTokenEmpty.value = '';
        const githubRepoEmpty = document.getElementById('github-repo-input');
        if (githubRepoEmpty) githubRepoEmpty.value = '';
        const githubBranchEmpty = document.getElementById('github-branch-input');
        if (githubBranchEmpty) githubBranchEmpty.value = 'main';
        toggleGithubSettingsSection();
        setGithubFeedback('', 'info');
        if (window.GoogleDocs && typeof window.GoogleDocs.resetGoogleDocsSettingsUI === 'function') {
            window.GoogleDocs.resetGoogleDocsSettingsUI();
        }
        syncImgbbApiKeyInputs('');
        updateAiScholarSspimgAvailability(false);
        sitesList = DEFAULT_SITES_LIST.slice();
        templateCustomList = [];
        renderSitesPanel();
        renderTemplatePanel();
        applyImageUploadFeatureVisibility({ imageUploadEnabled: false });
        applyScholarSearchVisibility({ scholarSearchVisible: false });
        applyHighlightVisibility({ highlightVisible: false });
        applySitesVisibility({ sitesVisible: false });
        applyMacroVisibility({ macroVisible: false });
        applyTemplateVisibility({ templateVisible: false });
        applyHtml2pptVisibility({ html2pptVisible: false });
        applyAiUseFold(getAiUseFoldedFromLocal());
        applyShareSettingsFold(getShareSettingsFoldedFromLocal());
        applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
        applyEditToolsVisibilityByMode();
        await applyGithubUiState({
            githubEnabled: false,
            githubToken: '',
            githubRepo: '',
            githubBranch: 'main',
            githubCacheDocs: []
        });
        return;
    }
    const apiInput = document.getElementById('ai-api-key');
    if (apiInput && settings.apiKey) apiInput.value = settings.apiKey;
    if (settings.imgbbApiKey) localStorage.setItem('ss_imgbb_api_key', settings.imgbbApiKey);
    else localStorage.removeItem('ss_imgbb_api_key');
    const imageCheck = document.getElementById('image-upload-enabled');
    if (imageCheck) imageCheck.checked = settings.imageUploadEnabled === true;
    const scholarSearchCheck = document.getElementById('scholar-search-visible');
    if (scholarSearchCheck) scholarSearchCheck.checked = settings.scholarSearchVisible === true;
    const highlightCheck = document.getElementById('highlight-visible');
    if (highlightCheck) highlightCheck.checked = settings.highlightVisible === true;
    const sitesCheck = document.getElementById('sites-visible');
    if (sitesCheck) sitesCheck.checked = settings.sitesVisible === true;
    const macroCheck = document.getElementById('macro-visible');
    if (macroCheck) macroCheck.checked = settings.macroVisible === true;
    const templateCheck = document.getElementById('template-visible');
    if (templateCheck) templateCheck.checked = settings.templateVisible === true;
    const html2pptCheck = document.getElementById('html2ppt-visible');
    if (html2pptCheck) html2pptCheck.checked = settings.html2pptVisible === true;
    const enterBrCheck = document.getElementById('enter-button-insert-br');
    const enterBrEnabled = settings.enterButtonInsertBr === true || getEnterButtonInsertBrFromLocal();
    if (enterBrCheck) enterBrCheck.checked = enterBrEnabled;
    enterButtonInsertBr = enterBrEnabled;
    const wrapCheck = document.getElementById('selection-wrap-enabled');
    const wrapEnabled = typeof settings.selectionWrapEnabled === 'boolean'
        ? settings.selectionWrapEnabled
        : getSelectionWrapEnabledFromLocal();
    if (wrapCheck) wrapCheck.checked = wrapEnabled;
    selectionWrapEnabled = wrapEnabled;
    setSelectionWrapEnabledToLocal(wrapEnabled);
    const viewModeEditCheck = document.getElementById('view-mode-edit-enabled');
    const viewModeEditValue = typeof settings.viewModeEditEnabled === 'boolean'
        ? settings.viewModeEditEnabled
        : getViewModeEditEnabledFromLocal();
    if (viewModeEditCheck) viewModeEditCheck.checked = viewModeEditValue;
    viewModeEditEnabled = viewModeEditValue;
    setViewModeEditEnabledToLocal(viewModeEditValue);
    const imageKeyInput = document.getElementById('ai-imgbb-api-key');
    if (imageKeyInput) imageKeyInput.value = settings.imgbbApiKey || '';
    if (window.GoogleDocs && typeof window.GoogleDocs.loadGoogleDocsSettingsUI === 'function') {
        window.GoogleDocs.loadGoogleDocsSettingsUI(settings);
    }
    syncImgbbApiKeyInputs(settings.imgbbApiKey || '');
    if (typeof validateApiKeyInputUI === 'function') validateApiKeyInputUI();
    const useCheck = document.getElementById('ai-use-checkbox');
    const section = document.getElementById('ai-password-section');
    if (useCheck) {
        if (settings.aiMasterEnabled === false) useCheck.checked = false;
        else useCheck.checked = !!(settings.verified || settings.passwordHash);
    }
    if (section) section.classList.toggle('hidden', !useCheck || !useCheck.checked);
    const verified = !!settings.verified;
    setAiPasswordVerifiedUI('neutral');
    const pwdInput = document.getElementById('ai-password-input');
    if (pwdInput) pwdInput.value = '';
    const fb = document.getElementById('ai-password-feedback');
    if (fb) {
        if (verified) {
            fb.textContent = 'Already verified. You can use AI features below.';
            fb.className = 'text-xs text-emerald-700 dark:text-emerald-400 min-h-[1.25rem]';
        } else {
            fb.textContent = '';
            fb.className = 'text-xs min-h-[1.25rem]';
        }
    }
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const githubEl = document.getElementById('ai-github-enabled');
    const githubTokenEl = document.getElementById('github-token-input');
    const githubRepoEl = document.getElementById('github-repo-input');
    const githubBranchEl = document.getElementById('github-branch-input');
    if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
    if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
    if (githubEl) githubEl.checked = !!settings.githubEnabled;
    if (githubTokenEl) githubTokenEl.value = settings.githubToken || '';
    if (githubRepoEl) githubRepoEl.value = settings.githubRepo || '';
    if (githubBranchEl) githubBranchEl.value = settings.githubBranch || 'main';
    toggleGithubSettingsSection();
    updateAiScholarSspimgAvailability(verified);
    if (window.UserSettingsModule && typeof window.UserSettingsModule.applyUserInfoToModalFields === 'function') {
        window.UserSettingsModule.applyUserInfoToModalFields(settings && settings.userInfo ? settings.userInfo : null);
    }
    sitesList = normalizeSitesList(settings.sitesList);
    templateCustomList = normalizeTemplateCustomList(settings.templateCustomList);
    renderSitesPanel();
    renderTemplatePanel();
    applyImageUploadFeatureVisibility(settings);
    applyScholarSearchVisibility(settings);
    applyToDocsVisibility(settings);
    applySitesVisibility(settings);
    applyMacroVisibility(settings);
    applyTemplateVisibility(settings);
    applyHtml2pptVisibility(settings);
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    applyEditToolsVisibilityByMode();
    await applyGithubUiState(settings);
}

async function initAiVisibility() {
    const settings = await getAiSettings();
    const useCheck = document.getElementById('ai-use-checkbox');
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const githubEl = document.getElementById('ai-github-enabled');
    const verified = !!(settings && settings.verified);
    if (settings) {
        if (useCheck) {
            if (settings.aiMasterEnabled === false) useCheck.checked = false;
            else useCheck.checked = !!(settings.verified || settings.passwordHash);
        }
        if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
        if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
        if (githubEl) githubEl.checked = !!settings.githubEnabled;
    } else {
        if (scholarEl) scholarEl.checked = false;
        if (sspimgEl) sspimgEl.checked = false;
        if (githubEl) githubEl.checked = false;
    }
    enterButtonInsertBr = !!((settings && settings.enterButtonInsertBr === true) || getEnterButtonInsertBrFromLocal());
    selectionWrapEnabled = settings && typeof settings.selectionWrapEnabled === 'boolean'
        ? settings.selectionWrapEnabled
        : getSelectionWrapEnabledFromLocal();
    setSelectionWrapEnabledToLocal(selectionWrapEnabled);
    viewModeEditEnabled = settings && typeof settings.viewModeEditEnabled === 'boolean'
        ? settings.viewModeEditEnabled
        : getViewModeEditEnabledFromLocal();
    setViewModeEditEnabledToLocal(viewModeEditEnabled);
    sitesList = normalizeSitesList(settings && settings.sitesList);
    templateCustomList = normalizeTemplateCustomList(settings && settings.templateCustomList);
    renderSitesPanel();
    renderTemplatePanel();
    updateAiScholarSspimgAvailability(verified);
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    applyScholarSearchVisibility(settings || { scholarSearchVisible: false });
    applyHighlightVisibility(settings || { highlightVisible: false });
    applyToDocsVisibility(settings || { toDocsVisible: false });
    applySitesVisibility(settings || { sitesVisible: false });
    applyMacroVisibility(settings || { macroVisible: false });
    applyTemplateVisibility(settings || { templateVisible: false });
    applyHtml2pptVisibility(settings || { html2pptVisible: false });
    applyEditToolsVisibilityByMode();
    await applyGithubUiState(settings || { githubEnabled: false, githubCacheDocs: [] });
    await applyAiFeatureVisibility();
}

function openSettingsModal() {
    ensureInDbStatusUi();
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
    applySettingsShortcutsFold(getSettingsShortcutsFoldedFromLocal());
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    loadAiSettingsToUI();
}

function ensureInDbStatusUi() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        let openBtn = document.getElementById('btn-open-indb-status');
        if (!openBtn) {
            const closeRow = settingsModal.querySelector('button[onclick="closeSettingsModal()"]')?.parentElement;
            if (closeRow && closeRow.parentElement) {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-start mb-2';
                row.innerHTML = ''
                    + '<button type="button" id="btn-open-indb-status" onclick="openInDbStatusModal()"'
                    + ' class="px-3 py-1.5 border-2 border-slate-700 rounded-lg text-sm font-medium text-slate-800 bg-white hover:bg-slate-50">inDB보기</button>';
                closeRow.parentElement.insertBefore(row, closeRow);
                openBtn = row.querySelector('#btn-open-indb-status');
            }
        }
    }

    if (!document.getElementById('indb-status-modal')) {
        const modal = document.createElement('div');
        modal.id = 'indb-status-modal';
        modal.className = 'fixed inset-0 bg-black/30 hidden items-center justify-center z-[70] no-print';
        modal.setAttribute('onclick', "if(event.target===this) closeInDbStatusModal()");
        modal.innerHTML = ''
            + '<div class="w-[min(680px,92vw)] h-[min(680px,86vh)] bg-white dark:bg-slate-900 border-2 border-slate-800 shadow-2xl flex flex-col">'
            + '<div class="px-4 py-2 bg-indigo-600 text-white text-2xl text-center tracking-wide">inDB Status</div>'
            + '<div id="indb-status-list" class="flex-1 overflow-auto p-4 space-y-3 bg-slate-100 dark:bg-slate-800"></div>'
            + '<div class="border-t-2 border-slate-700 p-2 flex items-center justify-center gap-2 bg-white dark:bg-slate-900">'
            + '<button type="button" onclick="deleteAllInDbStatusItems()" class="px-4 py-1.5 bg-red-600 text-white font-bold rounded hover:bg-red-700">전체지우기</button>'
            + '<button type="button" onclick="closeInDbStatusModal()" class="px-4 py-1.5 border border-slate-400 rounded text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800">닫기</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(modal);
    }
}

function applyCodeColorSettings() {
    const bg = document.getElementById('code-bg-color').value;
    const text = document.getElementById('code-text-color').value;
    document.documentElement.style.setProperty('--code-bg-color', bg);
    document.documentElement.style.setProperty('--code-text-color', text);

    // Save to local storage
    localStorage.setItem('md_viewer_code_bg', bg);
    localStorage.setItem('md_viewer_code_text', text);
}

function resetCodeColorSettings() {
    const defaultBg = '#1e293b';
    const defaultText = '#f8fafc';
    document.getElementById('code-bg-color').value = defaultBg;
    document.getElementById('code-text-color').value = defaultText;
    applyCodeColorSettings();
    showToast('Code color settings reset to default.');
}



function getNextIndexedDbTitle(baseTitle, docs) {
    const trimmedBase = String(baseTitle || '').trim() || 'Untitled';
    const titles = new Set((Array.isArray(docs) ? docs : []).map(doc => String(doc.title || '').trim()));
    if (!titles.has(trimmedBase)) return trimmedBase;

    const baseWithoutSuffix = trimmedBase.replace(/\s*\(\d+\)$/, '').trim() || trimmedBase;
    let index = 1;
    let candidate = '';
    do {
        candidate = `${baseWithoutSuffix} (${index})`;
        index += 1;
    } while (titles.has(candidate));
    return candidate;
}

function saveToDB() {
    const modal = document.getElementById('save-modal');
    const titleEl = document.querySelector('#save-modal h3');
    const labelEl = document.querySelector('#save-modal label');
    const input = document.getElementById('save-title-input');
    if (!modal || !input) return;

    if (titleEl) titleEl.textContent = 'Save to inDB';
    if (labelEl) labelEl.textContent = 'Enter a title for the inDB document.';

    let defaultTitle = currentFileName.replace(/\.md$/i, '');
    const selected = getSelectedTextForSave();
    if (selected) defaultTitle = selected;
    input.value = defaultTitle || 'Untitled';

    currentActionCallback = (title) => {
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle || !db) return;

        const readTx = db.transaction('documents', 'readonly');
        const readReq = readTx.objectStore('documents').getAll();
        readReq.onsuccess = () => {
            const docs = Array.isArray(readReq.result) ? readReq.result : [];
            const exactMatches = docs.filter(doc => String(doc.title || '').trim() === normalizedTitle);
            let resolvedTitle = normalizedTitle;
            let targetDoc = null;

            if (exactMatches.length > 0) {
                targetDoc = exactMatches
                    .slice()
                    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];

                const overwrite = window.confirm(
                    'A document with the same title already exists.\n\n' +
                    'Press OK to overwrite it.\n' +
                    'Press Cancel to save as a new document with a numbered title.'
                );

                if (!overwrite) {
                    resolvedTitle = getNextIndexedDbTitle(normalizedTitle, docs);
                    targetDoc = null;
                }
            }

            const doc = {
                id: targetDoc ? targetDoc.id : 'doc_' + Date.now(),
                title: resolvedTitle,
                content: currentMarkdown,
                folderId: targetDoc && targetDoc.folderId ? targetDoc.folderId : 'root',
                googleDocId: targetDoc && targetDoc.googleDocId ? targetDoc.googleDocId : '',
                updatedAt: new Date()
            };

            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put(doc);
            tx.oncomplete = () => {
                currentDbDocId = String(doc.id || '');
                if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
                    window.GoogleDocs.handleActiveDocumentChanged();
                }
                currentFileName = resolvedTitle + '.md';
                if (fileNameDisplay) fileNameDisplay.textContent = currentFileName;
                showToast(targetDoc ? 'Existing inDB document overwritten.' : `Saved to inDB as "${resolvedTitle}".`);
                renderDBList();
                if (isSidebarHidden) toggleSidebarVisibility();
            };
        };
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

// Global exports for inline HTML handlers
window.toggleTheme = toggleTheme;
window.toggleEditorLightMode = toggleEditorLightMode;
window.toggleMiniPreview = toggleMiniPreview;
window.updateContent = updateContent;
window.renderMarkdown = renderMarkdown;
window.toggleMode = toggleMode;
window.handleFileSelect = handleFileSelect;
window.readFile = readFile;
window.saveFile = saveFile;
window.saveCurrentFile = saveCurrentFile;
window.saveFileAs = saveFileAs;
window.printPage = printPage;
window.copyViewFormattedToClipboard = copyViewFormattedToClipboard;
window.getCurrentDbDocumentId = getCurrentDbDocumentId;
window.getCurrentFileGoogleDocId = getCurrentFileGoogleDocId;
window.setCurrentFileGoogleDocId = setCurrentFileGoogleDocId;
window.toggleSidebarVisibility = toggleSidebarVisibility;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.ensureRootFolder = ensureRootFolder;
window.createNewFolder = createNewFolder;
window.deleteFolderFromDB = deleteFolderFromDB;
window.saveToDB = saveToDB;
window.renderDBList = renderDBList;
window.loadFromDB = loadFromDB;
window.deleteFromDB = deleteFromDB;
window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.moveDocToFolder = moveDocToFolder;
window.performAutoSave = performAutoSave;
window.checkAutoSave = checkAutoSave;
window.applyRecovery = applyRecovery;
window.dismissRecovery = dismissRecovery;
window.loadFromExternalContent = loadFromExternalContent;
window.pasteFromClipboardAndDismiss = pasteFromClipboardAndDismiss;
window.insertAtCursor = insertAtCursor;
window.toggleEnterButtonInsertBrSetting = toggleEnterButtonInsertBrSetting;
window.toggleViewModeEditSetting = toggleViewModeEditSetting;
if (typeof insertMarkdownImageAtCursor === 'function') window.insertMarkdownImageAtCursor = insertMarkdownImageAtCursor;
if (typeof insertHtmlImageAtCursor === 'function') window.insertHtmlImageAtCursor = insertHtmlImageAtCursor;
if (typeof openImageInsertModal === 'function') window.openImageInsertModal = openImageInsertModal;
if (typeof closeImageInsertModal === 'function') window.closeImageInsertModal = closeImageInsertModal;
if (typeof toggleImageInsertDockRight === 'function') window.toggleImageInsertDockRight = toggleImageInsertDockRight;
if (typeof openImageInsertExternalLink === 'function') window.openImageInsertExternalLink = openImageInsertExternalLink;
if (typeof focusImageInsertPasteZone === 'function') window.focusImageInsertPasteZone = focusImageInsertPasteZone;
if (typeof handleImageInsertFile === 'function') window.handleImageInsertFile = handleImageInsertFile;
if (typeof onImageInsertUploadDragOver === 'function') window.onImageInsertUploadDragOver = onImageInsertUploadDragOver;
if (typeof onImageInsertUploadDragLeave === 'function') window.onImageInsertUploadDragLeave = onImageInsertUploadDragLeave;
if (typeof onImageInsertUploadDrop === 'function') window.onImageInsertUploadDrop = onImageInsertUploadDrop;
if (typeof cropImageInsertCurrent === 'function') window.cropImageInsertCurrent = cropImageInsertCurrent;
if (typeof uploadImageInsertToImgbb === 'function') window.uploadImageInsertToImgbb = uploadImageInsertToImgbb;
if (typeof saveImageInsertToInternalDb === 'function') window.saveImageInsertToInternalDb = saveImageInsertToInternalDb;
if (typeof toggleImageInsertGallery === 'function') window.toggleImageInsertGallery = toggleImageInsertGallery;
if (typeof refreshImageInsertGallery === 'function') window.refreshImageInsertGallery = refreshImageInsertGallery;
if (typeof downloadImageInsertGalleryZip === 'function') window.downloadImageInsertGalleryZip = downloadImageInsertGalleryZip;
if (typeof insertImageFromModal === 'function') window.insertImageFromModal = insertImageFromModal;
window.openLinkModal = openLinkModal;
window.closeModal = closeModal;
window.confirmModalInsert = confirmModalInsert;
window.adjustPageScale = adjustPageScale;
window.adjustFontSize = adjustFontSize;
window.openScholarSearchModal = openScholarSearchModal;
window.closeScholarSearchModal = closeScholarSearchModal;
window.runScholarSearchFromModal = runScholarSearchFromModal;
window.quickScholarSearchFromSelection = quickScholarSearchFromSelection;
window.toggleScholarRefPanel = toggleScholarRefPanel;
window.switchScholarRefTab = switchScholarRefTab;
window.setScholarRefInputMode = setScholarRefInputMode;
window.scholarRefApplyInput = scholarRefApplyInput;
window.scholarRefClearInput = scholarRefClearInput;
window.openScholarRefTxtImport = openScholarRefTxtImport;
window.openScholarRefMdImport = openScholarRefMdImport;
window.importScholarRefTxt = importScholarRefTxt;
window.importScholarRefMd = importScholarRefMd;
window.renderScholarRefSelectionList = renderScholarRefSelectionList;
window.toggleScholarRefPick = toggleScholarRefPick;
window.selectAllScholarRefs = selectAllScholarRefs;
window.clearScholarRefSelection = clearScholarRefSelection;
window.insertSelectedScholarRefs = insertSelectedScholarRefs;
window.insertAllScholarRefSection = insertAllScholarRefSection;
window.downloadScholarRefTxt = downloadScholarRefTxt;
window.downloadScholarRefMd = downloadScholarRefMd;
window.openScholarRefListWindow = openScholarRefListWindow;
window.deleteScholarRefItem = deleteScholarRefItem;
window.clearAllScholarRefs = clearAllScholarRefs;
window.toggleScholarSearchDockRight = toggleScholarSearchDockRight;
window.toggleScholarSearchShrink = toggleScholarSearchShrink;
window.toggleTemplatePanel = toggleTemplatePanel;
window.closeTemplatePanel = closeTemplatePanel;
window.toggleTemplateCompactMode = toggleTemplateCompactMode;
window.onTemplateSelectChange = onTemplateSelectChange;
window.saveEditedTemplate = saveEditedTemplate;
window.addTemplateFromCurrentContent = addTemplateFromCurrentContent;
window.exportSelectedTemplateMd = exportSelectedTemplateMd;
window.triggerTemplateImportMd = triggerTemplateImportMd;
window.importTemplateMdFile = importTemplateMdFile;
window.insertSelectedTemplateToDocument = insertSelectedTemplateToDocument;
window.insertSelectedTemplateAsNewFile = insertSelectedTemplateAsNewFile;
window.toggleTemplateSection = toggleTemplateSection;
window.toggleHtml2pptPanel = toggleHtml2pptPanel;
window.openHtml2pptPanel = openHtml2pptPanel;
window.closeHtml2pptPanel = closeHtml2pptPanel;
window.toggleHtml2pptDockRight = toggleHtml2pptDockRight;
window.toggleHtml2pptPanelFullscreen = toggleHtml2pptPanelFullscreen;
window.toggleHtml2pptSection = toggleHtml2pptSection;
window.openHighlightPopup = openHighlightPopup;
window.closeHighlightPopup = closeHighlightPopup;
window.toggleHighlightPopupDockRight = toggleHighlightPopupDockRight;
window.toggleHighlightPopupShrink = toggleHighlightPopupShrink;
window.handleHighlightFrameLoad = handleHighlightFrameLoad;
window.openHighlightFile = openHighlightFile;
window.exportHighlightData = exportHighlightData;
window.openHighlightDataWindow = openHighlightDataWindow;
window.toggleScholarSearchSection = toggleScholarSearchSection;
window.showToast = showToast;
window.scrollToDocumentTop = scrollToDocumentTop;
window.scrollToDocumentBottom = scrollToDocumentBottom;
window.closeSaveModal = closeSaveModal;
window.confirmSaveModal = confirmSaveModal;
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.openMergeModal = openMergeModal;
window.closeMergeModal = closeMergeModal;
window.bindMerge = bindMerge;
window.toggleMergeItem = toggleMergeItem;
window.moveMergeItem = moveMergeItem;
window.filterMergeList = filterMergeList;
window.selectAllMergeItems = selectAllMergeItems;
window.deselectAllMergeItems = deselectAllMergeItems;
window.toggleSelectedOnlyMergeView = toggleSelectedOnlyMergeView;
window.exportZip = exportZip;
window.exportMpv = exportMpv;
window.saveApiKey = saveApiKey;
window.toggleAiPasswordSection = toggleAiPasswordSection;
window.toggleAiUseFold = toggleAiUseFold;
window.toggleShareSettingsFold = toggleShareSettingsFold;
window.toggleGithubSettingsFold = toggleGithubSettingsFold;
window.toggleMacroMenu = toggleMacroMenu;
window.toggleMacroRecord = toggleMacroRecord;
window.runCheckedMacroActions = runCheckedMacroActions;
window.runMacroEntry = runMacroEntry;
window.toggleMacroEntryEnabled = toggleMacroEntryEnabled;
window.clearMacroEntries = clearMacroEntries;
window.registerMacroEntryShortcut = registerMacroEntryShortcut;
window.clearMacroEntryShortcut = clearMacroEntryShortcut;
window.dockMacroMenuRight = dockMacroMenuRight;
window.toggleMacroVisibilitySection = toggleMacroVisibilitySection;
window.toggleMathQuickMenu = toggleMathQuickMenu;
window.insertInlineMathTemplate = insertInlineMathTemplate;
window.insertDisplayMathTemplate = insertDisplayMathTemplate;
window.insertMathRefTemplate = insertMathRefTemplate;
window.openMath99Popup = openMath99Popup;
window.closeMath99Popup = closeMath99Popup;
window.validateApiKeyInputUI = validateApiKeyInputUI;
window.saveAiPassword = saveAiPassword;
window.applyAiFeatureVisibility = applyAiFeatureVisibility;
window.onAiFeatureCheckboxChange = onAiFeatureCheckboxChange;
window.toggleSettingsShortcutsFold = toggleSettingsShortcutsFold;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteModal = confirmDeleteModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.openInDbStatusModal = openInDbStatusModal;
window.closeInDbStatusModal = closeInDbStatusModal;
window.deleteInDbStatusItem = deleteInDbStatusItem;
window.deleteAllInDbStatusItems = deleteAllInDbStatusItems;
window.applyCodeColorSettings = applyCodeColorSettings;
window.resetCodeColorSettings = resetCodeColorSettings;
window.clearUnusedCache = clearUnusedCache;
window.switchSidebarTab = switchSidebarTab;
window.switchStorageSourceTab = switchStorageSourceTab;
window.toggleGithubSettingsSection = toggleGithubSettingsSection;
window.saveGithubSettingsFromModal = saveGithubSettingsFromModal;
window.createGithubRepository = createGithubRepository;
window.pullGithubRepo = pullGithubRepo;
window.pushDocToGithub = pushDocToGithub;
window.pushCurrentContentToGithub = pushCurrentContentToGithub;
window.isGithubExportEnabled = isGithubExportEnabled;
window.loadFromGithubCache = loadFromGithubCache;
window.renderTOC = renderTOC;
window.scrollToLine = scrollToLine;
window.applyHeading = applyHeading;
window.insertListAtSelection = insertListAtSelection;
window.handleTableInsertion = handleTableInsertion;
window.toggleTableInsertPicker = toggleTableInsertPicker;
window.convertSelectionPatternToTable = convertSelectionPatternToTable;
window.convertSelectionMarkdownToHtml = convertSelectionMarkdownToHtml;
window.insertLiteralAtCursor = insertLiteralAtCursor;
window.insertFootnoteTemplate = insertFootnoteTemplate;
window.openTextStyleModal = openTextStyleModal;
window.closeTextStyleModal = closeTextStyleModal;
window.openMermaidEditorModal = openMermaidEditorModal;
window.closeMermaidEditorModal = closeMermaidEditorModal;
window.toggleMermaidEditorFullscreen = toggleMermaidEditorFullscreen;
window.toggleMermaidEditorDockRight = toggleMermaidEditorDockRight;
window.applyTextStyleToSelection = applyTextStyleToSelection;

// --- Advanced Edit Functions ---
function openFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar) return;
    bar.classList.remove('hidden');
    if (!isEditMode) toggleMode('edit');
    const findInput = document.getElementById('find-input');
    updateFindInputFromValue(getEditorSelectedText());
    if (findInput) {
        findInput.focus();
        findInput.select();
    }
}

function closeFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (bar) bar.classList.add('hidden');
    editorTextarea.focus();
}

let lastFindIndex = -1;
const replaceUndoStack = [];
const replaceRedoStack = [];
const REPLACE_UNDO_LIMIT = 80;

function captureEditorSnapshot() {
    if (!editorTextarea) return null;
    return {
        value: String(editorTextarea.value || ''),
        selectionStart: Number(editorTextarea.selectionStart) || 0,
        selectionEnd: Number(editorTextarea.selectionEnd) || 0,
        scrollTop: Number(editorTextarea.scrollTop) || 0,
        scrollLeft: Number(editorTextarea.scrollLeft) || 0
    };
}

function applyEditorSnapshot(snapshot) {
    if (!editorTextarea || !snapshot) return false;
    editorTextarea.value = String(snapshot.value || '');
    const max = editorTextarea.value.length;
    const start = Math.max(0, Math.min(Number(snapshot.selectionStart) || 0, max));
    const end = Math.max(0, Math.min(Number(snapshot.selectionEnd) || 0, max));
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    editorTextarea.scrollTop = Number(snapshot.scrollTop) || 0;
    editorTextarea.scrollLeft = Number(snapshot.scrollLeft) || 0;
    currentMarkdown = editorTextarea.value;
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    return true;
}

function pushReplaceUndoSnapshot() {
    const snap = captureEditorSnapshot();
    if (!snap) return;
    replaceUndoStack.push(snap);
    if (replaceUndoStack.length > REPLACE_UNDO_LIMIT) replaceUndoStack.shift();
    replaceRedoStack.length = 0;
}

function undoFromReplaceStack() {
    if (!replaceUndoStack.length) return false;
    const prev = replaceUndoStack.pop();
    const current = captureEditorSnapshot();
    if (current) {
        replaceRedoStack.push(current);
        if (replaceRedoStack.length > REPLACE_UNDO_LIMIT) replaceRedoStack.shift();
    }
    return applyEditorSnapshot(prev);
}

function redoFromReplaceStack() {
    if (!replaceRedoStack.length) return false;
    const next = replaceRedoStack.pop();
    const current = captureEditorSnapshot();
    if (current) {
        replaceUndoStack.push(current);
        if (replaceUndoStack.length > REPLACE_UNDO_LIMIT) replaceUndoStack.shift();
    }
    return applyEditorSnapshot(next);
}

function swapFindReplaceValues() {
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    if (!findInput || !replaceInput) return;

    const nextFindValue = replaceInput.value;
    replaceInput.value = '';
    findInput.value = nextFindValue;
    lastFindIndex = -1;
    findInput.focus();
    findInput.select();
}

function getEditorSelectedText() {
    if (!editorTextarea) return '';
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number' || start === end) return '';
    return editorTextarea.value.substring(start, end);
}

function updateFindInputFromValue(value) {
    const findInput = document.getElementById('find-input');
    if (!findInput) return false;
    if (!value) return false;
    if (findInput.value === value) return false;
    findInput.value = value;
    lastFindIndex = -1;
    return true;
}

function syncFindInputFromEditorSelectionIfNeeded() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar || bar.classList.contains('hidden')) return false;
    return updateFindInputFromValue(getEditorSelectedText());
}

const KOREAN_PARTICLE_RULES = [];

function isParticleAutoCorrectionEnabled() {
    const checkbox = document.getElementById('particle-auto-correct');
    return !!(checkbox && checkbox.checked);
}

function getFindDirectionMode() {
    const checked = document.querySelector('input[name="find-direction"]:checked');
    return checked ? checked.value : 'down';
}

function isHangulSyllable(ch) {
    if (!ch) return false;
    const code = ch.charCodeAt(0);
    return code >= 0xAC00 && code <= 0xD7A3;
}

function getLastHangulSyllable(text) {
    for (let i = text.length - 1; i >= 0; i--) {
        if (isHangulSyllable(text[i])) return text[i];
    }
    return '';
}

function getHangulBatchimIndex(ch) {
    if (!isHangulSyllable(ch)) return -1;
    return (ch.charCodeAt(0) - 0xAC00) % 28;
}

function chooseKoreanParticle(rule, lastChar) {
    const batchimIndex = getHangulBatchimIndex(lastChar);
    if (batchimIndex < 0) return rule.forms[1];
    if (rule.kind === 'ro') {
        return batchimIndex === 0 || batchimIndex === 8 ? rule.forms[1] : rule.forms[0];
    }
    return batchimIndex === 0 ? rule.forms[1] : rule.forms[0];
}

function isParticleBoundaryChar(ch) {
    if (!ch) return true;
    if (/\s/.test(ch)) return true;
    return '.,!?;:)]}"\'`>}/'.includes(ch);
}

function autoCorrectKoreanParticleAfter(text, anchorIndex) {
    if (!isParticleAutoCorrectionEnabled()) {
        return { text, changed: false };
    }

    const lastChar = getLastHangulSyllable(text.slice(0, anchorIndex));
    if (!lastChar) {
        return { text, changed: false };
    }

    const suffix = text.slice(anchorIndex);
    for (const rule of KOREAN_PARTICLE_RULES) {
        for (const form of rule.forms) {
            if (!suffix.startsWith(form)) continue;
            const boundaryChar = suffix[form.length] || '';
            if (!isParticleBoundaryChar(boundaryChar)) continue;
            const adjusted = chooseKoreanParticle(rule, lastChar);
            if (adjusted === form) {
                return { text, changed: false };
            }
            return {
                text: text.slice(0, anchorIndex) + adjusted + text.slice(anchorIndex + form.length),
                changed: true
            };
        }
    }

    return { text, changed: false };
}

function replaceRangeWithOptions(text, start, end, replacement) {
    const replaced = text.slice(0, start) + replacement + text.slice(end);
    const adjusted = autoCorrectKoreanParticleAfter(replaced, start + replacement.length);
    return {
        text: adjusted.text,
        replacementStart: start,
        replacementEnd: start + replacement.length
    };
}

function replaceTextareaContentWithUndo(nextText, selectionStart, selectionEnd) {
    if (!editorTextarea) return;
    const normalizedText = String(nextText || '');
    if (normalizedText !== String(editorTextarea.value || '')) pushReplaceUndoSnapshot();
    editorTextarea.focus();
    editorTextarea.setSelectionRange(0, editorTextarea.value.length);
    const applied = document.execCommand('insertText', false, normalizedText);
    if (!applied) editorTextarea.value = normalizedText;
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        const max = editorTextarea.value.length;
        const safeStart = Math.max(0, Math.min(selectionStart, max));
        const safeEnd = Math.max(0, Math.min(selectionEnd, max));
        editorTextarea.setSelectionRange(safeStart, safeEnd);
    }
}

function getReplaceSearchBounds(text) {
    const direction = getFindDirectionMode();
    if (direction === 'up') {
        return {
            start: 0,
            end: Math.max(0, editorTextarea.selectionStart)
        };
    }
    if (direction === 'all') {
        return {
            start: 0,
            end: text.length
        };
    }
    return {
        start: Math.max(0, editorTextarea.selectionEnd),
        end: text.length
    };
}

function findNext() {
    const term = document.getElementById('find-input').value;
    if (!term) return;
    const text = editorTextarea.value;
    let idx = text.toLowerCase().indexOf(term.toLowerCase(), lastFindIndex + 1);
    if (idx === -1) idx = text.toLowerCase().indexOf(term.toLowerCase(), 0);

    if (idx !== -1) {
        lastFindIndex = idx;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(idx, idx + term.length);
        const textUpToIdx = text.substring(0, idx);
        const lineCount = textUpToIdx.split('\n').length;
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = (lineCount - 1) * lineHeight - editorTextarea.clientHeight / 2;
    } else {
        showToast('No matches found.');
    }
}

function findPrev() {
    const term = document.getElementById('find-input').value;
    if (!term) return;
    const text = editorTextarea.value;
    let idx = text.toLowerCase().lastIndexOf(term.toLowerCase(), Math.max(0, lastFindIndex - 1));
    if (idx === -1) idx = text.toLowerCase().lastIndexOf(term.toLowerCase());

    if (idx !== -1) {
        lastFindIndex = idx;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(idx, idx + term.length);
        const lineCount = text.substring(0, idx).split('\n').length;
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = (lineCount - 1) * lineHeight - editorTextarea.clientHeight / 2;
    } else {
        showToast('No matches found.');
    }
}

function replaceCurrent() {
    const term = document.getElementById('find-input').value;
    const replacement = document.getElementById('replace-input').value;
    if (!term) return;
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const selectedText = editorTextarea.value.substring(start, end);

    if (selectedText.toLowerCase() === term.toLowerCase()) {
        const scrollTop = editorTextarea.scrollTop;
        const replaced = replaceRangeWithOptions(editorTextarea.value, start, end, replacement);
        replaceTextareaContentWithUndo(replaced.text, replaced.replacementStart, replaced.replacementEnd);
        currentMarkdown = editorTextarea.value;
        editorTextarea.scrollTop = scrollTop;
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        if (getFindDirectionMode() === 'up') {
            lastFindIndex = replaced.replacementStart;
            findPrev();
        } else {
            lastFindIndex = Math.max(-1, replaced.replacementEnd - 1);
            findNext();
        }
    } else {
        if (getFindDirectionMode() === 'up') findPrev();
        else findNext();
    }
}

function replaceAll() {
    const term = document.getElementById('find-input').value;
    const replacement = document.getElementById('replace-input').value;
    if (!term) return;

    const originalSelectionStart = editorTextarea.selectionStart;
    const originalSelectionEnd = editorTextarea.selectionEnd;
    const originalScrollTop = editorTextarea.scrollTop;
    const originalScrollLeft = editorTextarea.scrollLeft;
    const bounds = getReplaceSearchBounds(editorTextarea.value);
    let count = 0;
    let workingText = editorTextarea.value;
    let searchIndex = bounds.start;
    let searchLimit = bounds.end;

    while (searchIndex <= searchLimit) {
        const idx = workingText.toLowerCase().indexOf(term.toLowerCase(), searchIndex);
        if (idx === -1 || idx >= searchLimit) break;

        const replaced = replaceRangeWithOptions(workingText, idx, idx + term.length, replacement);
        const delta = replaced.text.length - workingText.length;
        workingText = replaced.text;
        searchIndex = replaced.replacementEnd;
        searchLimit += delta;
        count++;
    }

    if (count > 0) {
        replaceTextareaContentWithUndo(workingText, originalSelectionStart, originalSelectionEnd);
        currentMarkdown = editorTextarea.value;
        editorTextarea.scrollTop = originalScrollTop;
        editorTextarea.scrollLeft = originalScrollLeft;
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        showToast(`${count} replacement(s) completed.`);
    } else {
        showToast('No matches found.');
    }
}

function moveLineUp() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    if (lineStart === 0) return;

    let prevLineStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    let prevLineText = text.substring(prevLineStart, lineStart);
    let currentLineText = text.substring(lineStart, lineEnd);

    editorTextarea.setSelectionRange(prevLineStart, lineEnd);
    const replacement = currentLineText + '\n' + prevLineText.replace(/\n$/, '');
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    editorTextarea.setSelectionRange(prevLineStart, prevLineStart + currentLineText.length);
}

function moveLineDown() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    if (lineEnd === text.length) return;

    let nextLineEnd = text.indexOf('\n', lineEnd + 1);
    if (nextLineEnd === -1) nextLineEnd = text.length;

    let currentLineText = text.substring(lineStart, lineEnd);
    let nextLineText = text.substring(lineEnd + 1, nextLineEnd);

    editorTextarea.setSelectionRange(lineStart, nextLineEnd);
    const replacement = nextLineText + '\n' + currentLineText;
    document.execCommand('insertText', false, replacement);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    const newStart = lineStart + nextLineText.length + 1;
    editorTextarea.setSelectionRange(newStart, newStart + currentLineText.length);
}

function copyLineDown() {
    const start = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', editorTextarea.selectionEnd);
    if (lineEnd === -1) lineEnd = text.length;

    let currentLineText = text.substring(lineStart, lineEnd);

    editorTextarea.setSelectionRange(lineEnd, lineEnd);
    document.execCommand('insertText', false, '\n' + currentLineText);

    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    const newStart = lineEnd + 1;
    editorTextarea.setSelectionRange(newStart, newStart + currentLineText.length);
}

window.openFindReplace = openFindReplace;
window.closeFindReplace = closeFindReplace;
window.findNext = findNext;
window.findPrev = findPrev;
window.replaceCurrent = replaceCurrent;
window.replaceAll = replaceAll;
window.swapFindReplaceValues = swapFindReplaceValues;


// IndexedDB Logic
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 5;
let db;

const FEATURE_DATA_STORE_NAMES = ['ai_chat', 'scholar_ai', 'ssp_image_ai', 'highlights', 'genslides'];
const AI_SETTINGS_KEY = 'ai_settings';
const AI_SETTINGS_FALLBACK_KEY = 'md_viewer_ai_settings_fallback';
const AI_PASSWORD_HASH = 'dc98e82fcfb4b165f5fa390d5ca61a9245a5be6ea70a4f00020ddff029afefba';
const ENTER_BUTTON_BR_KEY = 'md_viewer_enter_button_br';
const SELECTION_WRAP_KEY = 'md_viewer_selection_wrap_enabled';
const VIEW_MODE_EDIT_KEY = 'md_viewer_view_mode_edit_enabled';
const SETTINGS_SHORTCUTS_FOLD_KEY = 'md_viewer_settings_shortcuts_folded';
const AI_USE_FOLD_KEY = 'md_viewer_ai_use_folded';
const SHARE_SETTINGS_FOLD_KEY = 'md_viewer_share_settings_folded';
const GOOGLE_CALENDAR_ENABLED_KEY = 'md_viewer_google_calendar_enabled';
const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';

function enableTouchModalDrag(panel, handle, options) {
    const opts = options || {};
    if (!panel || !handle || handle.__touchModalDragBound) return false;
    handle.__touchModalDragBound = true;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
        const target = e.target;
        if (target && target.closest && target.closest(opts.ignoreSelector || 'button,input,textarea,select,a,iframe,.no-drag')) return;
        if (typeof opts.canStart === 'function' && !opts.canStart(e, panel, handle)) return;
        const rect = panel.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = rect.left;
        const startTop = rect.top;
        if (typeof opts.onStart === 'function') opts.onStart(e, panel, rect);
        panel.style.position = opts.position || panel.style.position || 'fixed';
        panel.style.transform = 'none';
        panel.style.margin = '0';
        panel.style.left = startLeft + 'px';
        panel.style.top = startTop + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        document.body.style.userSelect = 'none';
        e.preventDefault();

        const onMove = function (ev) {
            const vw = Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280);
            const vh = Math.max(240, window.innerHeight || document.documentElement.clientHeight || 720);
            const maxLeft = Math.max(8, vw - panel.offsetWidth - 8);
            const maxTop = Math.max(8, vh - panel.offsetHeight - 8);
            let nextLeft = startLeft + (ev.clientX - startX);
            let nextTop = startTop + (ev.clientY - startY);
            nextLeft = Math.max(8, Math.min(maxLeft, nextLeft));
            nextTop = Math.max(8, Math.min(maxTop, nextTop));
            panel.style.left = Math.round(nextLeft) + 'px';
            panel.style.top = Math.round(nextTop) + 'px';
            if (typeof opts.onMove === 'function') opts.onMove(ev, panel, nextLeft, nextTop);
            ev.preventDefault();
        };
        const onUp = function (ev) {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            document.body.style.userSelect = '';
            try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
            if (typeof opts.onEnd === 'function') opts.onEnd(ev, panel);
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp, { passive: false });
        document.addEventListener('pointercancel', onUp, { passive: false });
    }, { passive: false });
    return true;
}
const GITHUB_SETTINGS_FOLD_KEY = 'md_viewer_github_settings_folded';
const EDITOR_HORIZONTAL_SHIFT_KEY = 'md_viewer_editor_horizontal_shift_px';

// State
let currentMarkdown = "";
let currentFileName = "untitled.md";
let currentFilePath = null;
let currentDbDocId = null;
let isEditMode = true;
let pageScale = 1.0;
let fontSize = 16;
document.documentElement.style.setProperty('--md-app-font-size', `${fontSize}px`);
let headerScale = 1.0;
document.documentElement.style.setProperty('--md-header-scale', `${headerScale}`);
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
let mermaidQuickMenuBound = false;
let footnoteQuickMenuBound = false;
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
let settingsModalDragBound = false;
let settingsModalDragging = false;
let settingsModalDragOffsetX = 0;
let settingsModalDragOffsetY = 0;
let settingsModalCompact = false;
let settingsModalFullscreen = false;
let settingsModalResizeBound = false;
let settingsModalResizing = false;
let settingsModalResizeStartX = 0;
let settingsModalResizeStartY = 0;
let settingsModalResizeStartW = 0;
let settingsModalResizeStartH = 0;
let settingsModalRestoreRect = null;
let aiSidebarBootPromise = null;
let aiSidebarLoadAttempts = 0;
let viewClickMappedCaretPos = null;
let lastEditCaretPos = 0;
let viewerInternalImageObjectUrls = [];
let previewInternalImageObjectUrls = [];
let lastPersistedContent = '';
let autoSaveDebounceTimer = null;
let tocDebounceTimer = null;
let miniPreviewDebounceTimer = null;
let previewPopupDebounceTimer = null;
let lastAutoSavedContent = '';
let lastAutoSavedTitle = '';
let pauseMainRenderWhileEditing = true;
let mainRenderDirty = true;
let mainRenderToken = 0;

// Sidebar states
let isSidebarHidden = false;
let isSidebarCollapsed = true;

// Theme
const THEME_KEY = 'md_viewer_theme';
const EDITOR_LIGHT_KEY = 'md_viewer_editor_light';

const sidebar = document.getElementById('sidebar');
const viewerContainer = document.getElementById('viewer-container');
const viewer = document.getElementById('viewer');
const editorContainer = document.getElementById('content-viewport');
const editorTextarea = document.getElementById('viewer-edit-ta');
const fileNameDisplay = document.getElementById('file-name-display');
const fileTitleDisplay = document.getElementById('file-title-display');
const filePathDisplay = document.getElementById('file-path-display');
const filePathSeparator = document.getElementById('file-path-separator');
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
let renderDBListGeneration = 0;
let editorHorizontalShiftPx = 0;
let editorShiftResizeBound = false;
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
            FEATURE_DATA_STORE_NAMES.forEach(function (storeName) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
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

function relocateAiIntegrationSettingsIntoAiUse() {
    const card = document.getElementById('ai-link-settings-block');
    const slot = document.getElementById('ai-integration-settings-slot');
    if (!card || !slot) return;
    const deepseek = document.getElementById('deepseek-settings-card');
    if (deepseek && deepseek.parentElement === card) card.appendChild(deepseek);
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
            const baseDelay = getEditorInputDebounceMs();
            scheduleRenderTOC(baseDelay + 20);
        }
    });
}

window.onload = async () => {
    try {
        if (window.MiniPreviewUI && window.MiniPreviewUI.ready && typeof window.MiniPreviewUI.ready.then === 'function') {
            await window.MiniPreviewUI.ready;
        }
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
        await syncKnownFeatureDataToInDb().catch(function (error) {
            console.warn('Feature data startup sync failed:', error);
        });
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

        if (sidebar) {
            sidebar.style.display = isSidebarHidden ? 'none' : 'flex';
            const collapseIcon = document.getElementById('collapse-icon');
            if (isSidebarCollapsed) {
                sidebar.classList.add('sidebar-collapsed');
                if (collapseIcon) collapseIcon.setAttribute('data-lucide', 'chevron-right');
            } else {
                sidebar.classList.remove('sidebar-collapsed');
                if (collapseIcon) collapseIcon.setAttribute('data-lucide', 'chevron-left');
            }
            lucide.createIcons();
        }

        if (window.ScholarSearchShell && typeof window.ScholarSearchShell.ensureScholarRefReady === 'function') {
            await window.ScholarSearchShell.ensureScholarRefReady();
        }

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
        const baseDelay = getEditorInputDebounceMs();
        scheduleUpdatePreviewPopupContent(baseDelay + 40);
        scheduleMiniPreviewRender(baseDelay + 40);
        scheduleRenderTOC(baseDelay + 20);
        mainRenderDirty = true;
        if (window.GoogleDocs && typeof window.GoogleDocs.handleEditorChanged === 'function') {
            window.GoogleDocs.handleEditorChanged();
        }
    });
    if (editorTextarea) {
        editorTextarea.addEventListener('select', syncFindInputFromEditorSelectionIfNeeded);
        editorTextarea.addEventListener('keyup', syncFindInputFromEditorSelectionIfNeeded);
        editorTextarea.addEventListener('mouseup', syncFindInputFromEditorSelectionIfNeeded);
        bindEditorListKeyBehavior();
    }
    bindWheelZoomShortcuts();
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
            if (typeof window.openScholarSearchModal === 'function') window.openScholarSearchModal();
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
    mainRenderDirty = true;
    renderMarkdown({ force: !isEditMode });
    renderTOC();
    scheduleUpdatePreviewPopupContent(80);
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

function escapeMarkdownNumberLineHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderExplicitNumberLine(indent, marker, body) {
    const depth = Math.max(0, Math.floor(String(indent || '').replace(/\t/g, '    ').length / 2));
    const margin = Math.min(48, depth * 18);
    return '<div class="md-explicit-number-line" style="margin-left:' + margin + 'px">'
        + '<span class="md-explicit-number-marker">' + escapeMarkdownNumberLineHtml(marker) + '</span>'
        + '<span class="md-explicit-number-text">' + escapeMarkdownNumberLineHtml(body) + '</span>'
        + '</div>';
}

function preprocessRestartedNumberedParagraphs(raw) {
    const lines = String(raw ?? '').split('\n');
    const out = [];

    function flush(block) {
        if (!block || !block.length) return;
        const numbers = block.map(function (item) { return item.num; });
        let restarted = false;
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] <= numbers[i - 1]) {
                restarted = true;
                break;
            }
        }
        if (!restarted) {
            block.forEach(function (item) { out.push(item.raw); });
            return;
        }
        block.forEach(function (item) {
            out.push(renderExplicitNumberLine(item.indent, item.marker, item.body));
        });
    }

    let block = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^(\s*)(\d+\.)\s+(.+)$/);
        if (!m) {
            flush(block);
            block = [];
            out.push(line);
            continue;
        }
        block.push({
            raw: line,
            indent: m[1] || '',
            marker: m[2] || '',
            num: parseInt(m[2], 10) || 0,
            body: m[3] || ''
        });
    }
    flush(block);
    return out.join('\n');
}

function preprocessMarkdownForView(raw) {
    let s = String(raw ?? '');
    s = preprocessFootnotesForView(s);
    s = preprocessRestartedNumberedParagraphs(s);
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

function escapeMarkdownRenderFallback(value) {
    return '<p>' + String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>') + '</p>';
}

async function renderMarkdown(options) {
    if (!viewer) return;
    const renderToken = ++mainRenderToken;
    const opts = options || {};
    const force = !!opts.force;
    const popupAlive = !!(typeof isPreviewPopupAlive === 'function' && isPreviewPopupAlive());
    if (isEditMode && pauseMainRenderWhileEditing && !force && !miniPreviewEnabled && !popupAlive) {
        mainRenderDirty = true;
        return;
    }
    mainRenderDirty = false;
    const raw = String(currentMarkdown ?? '');
    const isCurrentRender = function () {
        return renderToken === mainRenderToken && !!viewer;
    };
    function runPostRenderHooks() {
        if (!isCurrentRender()) return;
        try { if (typeof bindFootnoteLinkNavigation === 'function') bindFootnoteLinkNavigation(); } catch (e) {}
        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch (e) {}
        try { hydrateInternalImagesInElement(viewer, registerViewerInternalObjectUrl); } catch (e) {}
        try {
            if (window.MermaidTRT && typeof window.MermaidTRT.renderIn === 'function') {
                window.MermaidTRT.renderIn(viewer).catch(function () {});
            }
        } catch (e) {}
        try { scheduleUpdatePreviewPopupContent(120); } catch (e) {}
        try { scheduleMiniPreviewRender(120); } catch (e) {}
    }
    revokeObjectUrls(viewerInternalImageObjectUrls);

    try {
        const resolvedRaw = await resolveInternalMarkdownImagesForViewer(raw);
        if (!isCurrentRender()) return;
        const preprocessed = preprocessMarkdownForView(resolvedRaw);
        let html = '';
        if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.renderMarkdownSafe === 'function') {
            html = await MathRender.renderMarkdownSafe(
                (typeof marked !== 'undefined' && marked.parse) ? marked : null,
                preprocessed,
                { fallbackText: resolvedRaw }
            );
        } else if (typeof marked !== 'undefined' && marked.parse) {
            html = String(marked.parse(preprocessed) || '');
        } else {
            html = escapeMarkdownRenderFallback(resolvedRaw);
        }
        if (!isCurrentRender()) return;
        viewer.innerHTML = String(html || '');
        if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.typesetElement === 'function') {
            await MathRender.typesetElement(viewer, {
                silent: true,
                retries: 20,
                delay: 80
            });
        }
        runPostRenderHooks();
    } catch (error) {
        if (!isCurrentRender()) return;
        viewer.innerHTML = escapeMarkdownRenderFallback(raw);
        try {
            if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.typesetElement === 'function') {
                await MathRender.typesetElement(viewer, {
                    silent: true,
                    retries: 10,
                    delay: 80
                });
            }
        } catch (_) {}
        runPostRenderHooks();
    }
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
        renderMarkdown({ force: true });
        requestAnimationFrame(function () {
            if (isEditMode) return;
            if (editorTextarea) {
                const v = String(editorTextarea.value ?? '');
                if (v !== currentMarkdown) {
                    currentMarkdown = v;
                    renderMarkdown({ force: true });
                }
            }
            if (currentMarkdown.trim() && viewer && !viewer.textContent.trim()) {
                renderMarkdown({ force: true });
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

const DEDICATED_LOCAL_VIEWER_EXTENSIONS = new Set([
    '.pdf',
    '.doc', '.docx',
    '.hwp', '.hwpx',
    '.xls', '.xlsx',
    '.ppt', '.pptx', '.pps', '.ppsx',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'
]);
const LOCAL_IMAGE_VIEWER_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'
]);

function getSelectedFileExtension(file) {
    const match = String(file && file.name || '').toLowerCase().match(/(\.[^.\\/]+)$/);
    return match ? match[1] : '';
}

function openSelectedFileInBrowserViewer(file, extension) {
    if (LOCAL_IMAGE_VIEWER_EXTENSIONS.has(extension)) {
        if (!window.InternalImageApp || typeof window.InternalImageApp.openFiles !== 'function') {
            showToast('내부 이미지 앱을 불러오지 못했습니다.');
            return true;
        }
        window.InternalImageApp.openFiles([file], file.name || '이미지');
        return true;
    }
    if (extension === '.pdf') {
        if (!window.InternalImageApp || typeof window.InternalImageApp.openFrame !== 'function') {
            showToast('내부 PDF 뷰어를 불러오지 못했습니다.');
            return true;
        }
        const objectUrl = URL.createObjectURL(file);
        const viewerUrl = new URL('./pdf-viewer.html', window.location.href);
        viewerUrl.searchParams.set('file', objectUrl);
        viewerUrl.searchParams.set('title', file.name || 'PDF Preview');
        window.InternalImageApp.openFrame(viewerUrl.toString(), file.name || 'PDF Preview', {
            objectUrls: [objectUrl]
        });
        return true;
    }
    return false;
}

async function openDocxInEditor(file) {
    if (!file) return false;
    if (!window.mammoth || typeof window.mammoth.convertToHtml !== 'function') {
        showToast('DOCX 가져오기 모듈을 불러오지 못했습니다.');
        return false;
    }
    const canProceed = await confirmSaveBeforeOpeningAnotherFile();
    if (!canProceed) {
        showToast('Open canceled.');
        return true;
    }
    showToast('DOCX 문서를 변환하는 중입니다...');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const options = {};
        if (window.mammoth.images && typeof window.mammoth.images.imgElement === 'function') {
            options.convertImage = window.mammoth.images.imgElement(async function (image) {
                const base64 = await image.read('base64');
                return { src: 'data:' + (image.contentType || 'image/png') + ';base64,' + base64 };
            });
        }
        const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
        const html = String(result && result.value || '').trim();
        setCurrentDocumentInfo(file.name || 'document.docx', null);
        updateContent(html || '<p></p>');
        markPersistedState();
        const warnings = Array.isArray(result && result.messages) ? result.messages.length : 0;
        showToast(warnings
            ? 'DOCX를 열었습니다. 변환 경고 ' + warnings + '건이 있습니다.'
            : 'DOCX를 문서 내부에서 열었습니다.');
        return true;
    } catch (error) {
        showToast('DOCX를 열 수 없습니다: ' + (error && error.message ? error.message : error));
        return true;
    }
}

function handleImageFolderSelect(event) {
    const input = event && event.target ? event.target : null;
    const files = Array.from(input && input.files ? input.files : []);
    const images = files.filter(function (file) {
        return LOCAL_IMAGE_VIEWER_EXTENSIONS.has(getSelectedFileExtension(file))
            || String(file && file.type || '').toLowerCase().startsWith('image/');
    });
    if (!images.length) {
        showToast('선택한 폴더에 지원되는 이미지가 없습니다.');
        if (input) input.value = '';
        return;
    }
    if (!window.InternalImageApp || typeof window.InternalImageApp.openFiles !== 'function') {
        showToast('내부 이미지 앱을 불러오지 못했습니다.');
        if (input) input.value = '';
        return;
    }
    const relativePath = String(images[0].webkitRelativePath || '');
    const folderName = relativePath.split('/').filter(Boolean)[0] || '이미지 폴더';
    window.InternalImageApp.openFiles(images, folderName);
    if (input) input.value = '';
}

function setOpenSourceMenuVisible(visible) {
    const menu = document.getElementById('open-source-menu');
    const button = document.getElementById('open-source-menu-button');
    if (!menu || !button) return;
    const shouldShow = !!visible;
    menu.classList.toggle('hidden', !shouldShow);
    button.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
}

function toggleOpenSourceMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('open-source-menu');
    if (!menu) return;
    setOpenSourceMenuVisible(menu.classList.contains('hidden'));
}

function openFilePickerFromMenu(event) {
    if (event) event.stopPropagation();
    setOpenSourceMenuVisible(false);
    const input = document.getElementById('file-input');
    if (input) input.click();
}

function openImageFolderPickerFromMenu(event) {
    if (event) event.stopPropagation();
    setOpenSourceMenuVisible(false);
    const input = document.getElementById('image-folder-input');
    if (input) input.click();
}

function openFmaViewer() {
    if (!window.InternalImageApp || typeof window.InternalImageApp.openFrame !== 'function') {
        showToast('내부 FMA Viewer를 불러오지 못했습니다.');
        return false;
    }
    const viewerUrl = new URL('./Apps/fmaviewer/index.html', document.baseURI || window.location.href);
    viewerUrl.searchParams.set('embedded', '1');
    viewerUrl.searchParams.set('v', '20260725-fma-viewer-1');
    window.InternalImageApp.openFrame(viewerUrl.href, 'FMA Viewer');
    return true;
}

function openFmaViewerFromMenu(event) {
    if (event) event.stopPropagation();
    setOpenSourceMenuVisible(false);
    openFmaViewer();
}

document.addEventListener('click', function (event) {
    const wrap = document.getElementById('open-source-menu-wrap');
    if (wrap && !wrap.contains(event.target)) setOpenSourceMenuVisible(false);
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpenSourceMenuVisible(false);
});

async function handleFileSelect(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files ? input.files[0] : null;
    if (file) {
        const extension = getSelectedFileExtension(file);
        let nativePath = String(file.path || '').trim();
        if (!nativePath
            && window.web2electron
            && typeof window.web2electron.getPathForFile === 'function') {
            try { nativePath = String(window.web2electron.getPathForFile(file) || '').trim(); } catch (_) {}
        }
        if (DEDICATED_LOCAL_VIEWER_EXTENSIONS.has(extension)
            && nativePath
            && window.web2electron
            && typeof window.web2electron.openLocalFile === 'function') {
            const result = await window.web2electron.openLocalFile({ filePath: nativePath });
            if (result && result.error) showToast('파일을 열 수 없습니다: ' + result.error);
        } else if (extension === '.docx') {
            await openDocxInEditor(file);
        } else if (!DEDICATED_LOCAL_VIEWER_EXTENSIONS.has(extension)
            || !openSelectedFileInBrowserViewer(file, extension)) {
            await readFile(file);
        }
    }
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

const MPV_FORMAT = (window.MdViewerFileFormat && typeof window.MdViewerFileFormat.getFormatId === 'function'
    ? window.MdViewerFileFormat.getFormatId('mpv')
    : 'mdviewer/mpv');
const MPV_VERSION = (window.MdViewerFileFormat && typeof window.MdViewerFileFormat.getFormatVersion === 'function'
    ? window.MdViewerFileFormat.getFormatVersion('mpv')
    : 1);

function setCurrentDocumentInfo(fileName, filePath = null) {
    currentFileName = fileName;
    currentFilePath = filePath || null;
    currentDbDocId = null;
    updateCurrentDocumentDisplay();
    if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
        window.GoogleDocs.handleActiveDocumentChanged();
    }
}

function updateCurrentDocumentDisplay() {
    const fileName = currentFileName || 'untitled.md';
    const filePath = currentFilePath ? String(currentFilePath) : '';
    if (fileTitleDisplay && filePathDisplay) {
        fileTitleDisplay.textContent = fileName;
        filePathDisplay.textContent = filePath || '로컬 경로 없음';
        if (filePathSeparator) filePathSeparator.classList.toggle('hidden', !filePath);
        filePathDisplay.classList.toggle('text-slate-400', !filePath);
        filePathDisplay.classList.toggle('dark:text-slate-500', !filePath);
        if (fileNameDisplay) fileNameDisplay.title = filePath ? fileName + '\n' + filePath : fileName;
        return;
    }
    if (fileNameDisplay) {
        fileNameDisplay.textContent = filePath ? fileName + ' | ' + filePath : fileName;
        fileNameDisplay.title = filePath ? fileName + '\n' + filePath : fileName;
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

async function resolveCurrentFilePathForSave() {
    if (currentFilePath && String(currentFilePath).trim()) return currentFilePath;

    const opened = await tryGetOpenedFileViaElectronApi();
    if (!opened || !opened.path) return null;

    const openedName = opened.fileName || getNameFromPath(opened.path);
    if (openedName && (!currentFileName || currentFileName === 'untitled.md')) {
        currentFileName = openedName;
    }
    currentFilePath = opened.path;
    updateCurrentDocumentDisplay();
    return currentFilePath;
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
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);
}

function getZipSaveFileName() {
    const base = String(getSaveCandidateFileName() || 'document.md').replace(/\.md$/i, '');
    return base + '.zip';
}

function getMddSaveFileName() {
    const base = String(getSaveCandidateFileName() || 'document.md').replace(/\.md$/i, '');
    return base + '.mdd';
}

function getDocxSaveFileName() {
    const base = String(getSaveCandidateFileName() || 'document.md').replace(/\.(md|markdown|mdown|txt|html|htm|json|mdd|mpv|docx)$/i, '');
    return base + '.docx';
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

function getRenderedHtmlForDocxExport() {
    try {
        if (!viewer) return '';
        return String(viewer.innerHTML || '');
    } catch (_) {
        return '';
    }
}

async function exportCurrentDocumentAsDocx() {
    syncCurrentMarkdownFromEditor();
    if (!window.DocxExport || typeof window.DocxExport.createBlob !== 'function') {
        throw new Error('DOCX export is not available.');
    }
    const blob = await window.DocxExport.createBlob({
        content: String(currentMarkdown || ''),
        html: getRenderedHtmlForDocxExport()
    });
    downloadBlobFile(blob, getDocxSaveFileName());
    return true;
}

function showExportTypeDialogFallback() {
    return new Promise(function (resolve) {
        const choices = [
            { key: 'md', label: 'MD file' },
            { key: 'docx', label: 'MS Word (.docx)' },
            { key: 'mdd', label: 'MDD file (bundle)' },
            { key: 'zip', label: 'ZIP file' },
            { key: 'html', label: 'HTML file' }
        ];
        try {
            if (typeof isGithubExportEnabled === 'function' && isGithubExportEnabled()) {
                choices.push({ key: 'github', label: 'GitHub (push)' });
            }
        } catch (_) {}
        choices.push({ key: 'cancel', label: 'Cancel' });

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;';

        const card = document.createElement('div');
        card.style.cssText = 'width:min(560px,96vw);background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.35);padding:16px;';

        const title = document.createElement('h3');
        title.textContent = 'Export Format';
        title.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:700;';
        card.appendChild(title);

        const desc = document.createElement('p');
        desc.textContent = 'MD: text only / DOCX: Microsoft Word / MDD: document + images / ZIP: markdown + images folder / HTML: single HTML document';
        desc.style.cssText = 'margin:0 0 14px;font-size:13px;line-height:1.5;color:#cbd5e1;';
        card.appendChild(desc);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

        function done(key) {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(key || 'cancel');
        }

        choices.forEach(function (choice) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = choice.label;
            btn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:13px;font-weight:600;cursor:pointer;';
            btn.addEventListener('click', function () { done(choice.key); });
            row.appendChild(btn);
        });

        card.appendChild(row);
        overlay.appendChild(card);
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) done('cancel');
        });
        document.body.appendChild(overlay);
    });
}

async function chooseExportType() {
    if (window.ExtendFiles && typeof window.ExtendFiles.showExportTypeDialog === 'function') {
        return await window.ExtendFiles.showExportTypeDialog();
    }
    return await showExportTypeDialogFallback();
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
    if (choice === 'docx') {
        const ok = await exportCurrentDocumentAsDocx();
        if (ok) {
            showToast('DOCX exported.');
            markPersistedState();
        }
        return !!ok;
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
    const formatApi = window.MdViewerFileFormat || null;
    const name = (file && file.name ? file.name : '').toLowerCase();
    const kindByName = (formatApi && typeof formatApi.detectKindFromFileName === 'function')
        ? formatApi.detectKindFromFileName(name)
        : '';
    if (kindByName === 'mdd' || name.endsWith('.mdd')) {
        importMddDocumentFile(file).catch(function (e) {
            showToast('Failed to import MDD: ' + (e && e.message ? e.message : e));
        });
        return;
    }
    if (kindByName === 'zip' || name.endsWith('.zip')) {
        importZipDocumentFile(file).catch(function (e) {
            showToast('Failed to import ZIP: ' + (e && e.message ? e.message : e));
        });
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const raw = decodeOpenedTextBytes(e.target.result).text;
        const parsed = (formatApi && typeof formatApi.parseFileText === 'function')
            ? formatApi.parseFileText(name, raw)
            : null;
        const kind = parsed && parsed.kind ? parsed.kind : kindByName;

        if (kind === 'mdd') {
            importMddDocumentFile(file, { rawText: raw, payload: parsed && parsed.payload ? parsed.payload : null }).catch(function (err) {
                showToast('Failed to import MDD: ' + (err && err.message ? err.message : err));
            });
            return;
        }
        if (kind === 'mpv' || name.endsWith('.mpv') || name.endsWith('.json')) {
            currentFilePath = null;
            try {
                const parser = window.MdViewerFileFormat;
                const data = parsed && parsed.payload
                    ? parsed.payload
                    : (parser && typeof parser.parseJsonText === 'function'
                    ? parser.parseJsonText(raw)
                    : JSON.parse(raw));
                const kind = parser && typeof parser.detectPayloadKind === 'function'
                    ? parser.detectPayloadKind(data)
                    : '';
                if (kind === 'mpv' || (data && data.format === MPV_FORMAT && Array.isArray(data.folders) && Array.isArray(data.documents))) {
                    restoreFromMpv(data);
                    return;
                }
                if (kind === 'mpp') {
                    showToast('MPP file detected. Open it in GenSlide editor.');
                    return;
                }
            } catch (_) {}
        }
        if (kind === 'mpp') {
            showToast('MPP file detected. Open it in GenSlide editor.');
            return;
        }
        if (kind === 'csv') {
            showToast('CSV loaded as text.');
        }
        if (kind === 'html') {
            showToast('HTML loaded as text.');
        }
        setCurrentDocumentInfo(file.name, file.path || null);
        updateContent(parsed && typeof parsed.text === 'string' ? parsed.text : raw);
        markPersistedState();
        showToast("File loaded successfully.");
    };
    reader.readAsArrayBuffer(file);
}

function decodeOpenedTextBytes(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    }
    const sampleLength = Math.min(bytes.length, 4096);
    let evenNuls = 0;
    let oddNuls = 0;
    for (let i = 0; i < sampleLength; i++) {
        if (bytes[i] === 0) {
            if (i % 2) oddNuls++;
            else evenNuls++;
        }
    }
    if (sampleLength >= 4 && oddNuls > sampleLength / 8 && evenNuls < sampleLength / 32) {
        return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
    }
    if (sampleLength >= 4 && evenNuls > sampleLength / 8 && oddNuls < sampleLength / 32) {
        return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
    }
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
    } catch (_) {
        return { text: new TextDecoder('windows-949').decode(bytes), encoding: 'cp949' };
    }
}

async function importMddDocumentFile(file, options) {
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return;
    }
    if (!window.ExtendFiles || typeof window.ExtendFiles.importMddToIndexedDb !== 'function') {
        showToast('MDD import is not available.');
        return;
    }
    const opts = options || {};
    const inputPayload = opts.payload || opts.rawText || await file.text();
    const imported = await window.ExtendFiles.importMddToIndexedDb(db, inputPayload);
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
    const savePath = await resolveCurrentFilePathForSave();
    const result = await window.electron.ipcRenderer.invoke('save-current-file', {
        filePath: savePath,
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
    const savePath = await resolveCurrentFilePathForSave();
    const result = await window.electron.ipcRenderer.invoke('save-file-as', {
        filePath: savePath,
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
    const options = arguments[0] || {};
    if (isEditMode) toggleMode('view');
    if (!viewer) {
        showToast('Viewer is not ready.');
        return;
    }

    let html = String(viewer.innerHTML || '').trim();
    let text = String(viewer.innerText || viewer.textContent || '').trim();
    const sourceMarkdown = String(currentMarkdown ?? '');
    if (options && typeof options.htmlTransform === 'function') {
        try { html = String(options.htmlTransform(html, viewer, sourceMarkdown) || html).trim(); } catch (_) {}
    }
    if (options && typeof options.textTransform === 'function') {
        try { text = String(options.textTransform(text, viewer, html, sourceMarkdown) || text).trim(); } catch (_) {}
    }
    if (!html && !text) {
        showToast('Nothing to copy.');
        return;
    }

    const successMessage = String(options && options.successMessage ? options.successMessage : 'Copied formatted content.');
    const failureMessage = String(options && options.failureMessage ? options.failureMessage : 'Copy failed. Please allow clipboard access.');

    try {
        if (navigator.clipboard && window.ClipboardItem && typeof navigator.clipboard.write === 'function') {
            const item = new ClipboardItem({
                'text/html': new Blob([html || '<p></p>'], { type: 'text/html' }),
                'text/plain': new Blob([text || ''], { type: 'text/plain' })
            });
            await navigator.clipboard.write([item]);
            showToast(successMessage);
            return true;
        }
    } catch (e) {}

    const fallbackOk = fallbackCopyHtmlFromViewer(html || text);
    if (fallbackOk) showToast(successMessage);
    else showToast(failureMessage);
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
    try {
        const githubEnabled = !!(document.getElementById('ai-github-enabled') && document.getElementById('ai-github-enabled').checked);
        const githubToken = String(document.getElementById('github-token-input') && document.getElementById('github-token-input').value ? document.getElementById('github-token-input').value : '').trim();
        syncStorageSourceTabsVisibility(githubEnabled && !!githubToken);
    } catch (_) {}
    lucide.createIcons();
    renderDBList();
    if (activeSidebarTab === 'toc') renderTOC();
}

// --- TOC & Sidebar Tabs ---
let activeSidebarTab = 'files';
let lastRenderedTocItems = [];

function switchSidebarTab(tab) {
    if (window.SidebarLeft && typeof window.SidebarLeft.switchSidebarTab === 'function') {
        activeSidebarTab = window.SidebarLeft.switchSidebarTab(tab, { renderDBList, renderTOC });
        return;
    }
    activeSidebarTab = tab;
}

function parseTocItemsFromMarkdown(markdownText) {
    if (window.SidebarLeft && typeof window.SidebarLeft.parseTocItemsFromMarkdown === 'function') {
        return window.SidebarLeft.parseTocItemsFromMarkdown(markdownText);
    }
    return [];
}

function renderTOC() {
    if (window.SidebarLeft && typeof window.SidebarLeft.renderTOC === 'function') {
        lastRenderedTocItems = window.SidebarLeft.renderTOC({
            getMarkdown: function () { return currentMarkdown; },
            isCollapsed: function () { return isSidebarCollapsed; }
        }) || [];
    }
}

function scrollToLine(lineIndex) {
    if (window.SidebarLeft && typeof window.SidebarLeft.scrollToLine === 'function') {
        window.SidebarLeft.scrollToLine(lineIndex, {
            getEditor: function () { return editorTextarea; },
            getViewer: function () { return viewer; },
            getMarkdown: function () { return currentMarkdown; },
            isEditMode: function () { return isEditMode; }
        });
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


function renderInDbList(listEl, searchTerm, githubReady) {
    if (window.SidebarLeft && typeof window.SidebarLeft.renderInDbList === 'function') {
        return window.SidebarLeft.renderInDbList({
            listEl,
            db,
            searchTerm,
            githubReady,
            rootFolderName: ROOT_FOLDER_NAME,
            isSidebarCollapsed,
            isFolderCollapsed,
            toggleFolderCollapse
        });
    }
    return Promise.resolve();
}

async function renderDBList() {
    const listEl = document.getElementById('db-list');
    if (!listEl) return;
    const generation = ++renderDBListGeneration;
    const searchInput = document.getElementById('db-search');
    const searchTerm = String(searchInput && searchInput.value ? searchInput.value : '').toLowerCase();
    const nextList = document.createElement('div');

    const settings = await getAiSettings() || {};
    const cfg = getGithubConfigFromSettings(settings);
    const githubReady = !!(cfg.enabled && cfg.token);

    if (currentStorageSourceTab === 'github' && githubReady) {
        await renderGithubCachedList(nextList, searchTerm);
    } else {
        await renderInDbList(nextList, searchTerm, githubReady);
    }
    if (generation !== renderDBListGeneration) return;
    listEl.replaceChildren(...Array.from(nextList.childNodes));
    lucide.createIcons();
}

async function revealSavedInDbDocument(doc) {
    const savedDoc = doc || {};
    const folderId = String(savedDoc.folderId || 'root');
    currentStorageSourceTab = 'indb';
    setStorageSourceTabToLocal('indb');
    if (typeof updateStorageSourceTabsUI === 'function') updateStorageSourceTabsUI();

    const searchInput = document.getElementById('db-search');
    if (searchInput) searchInput.value = '';
    if (isFolderCollapsed(folderId)) {
        folderCollapseState[folderId] = false;
        saveFolderCollapseState();
    }
    if (activeSidebarTab !== 'files') switchSidebarTab('files');
    if (isSidebarHidden) toggleSidebarVisibility();
    if (isSidebarCollapsed) toggleSidebarCollapse();

    await renderDBList();
    const savedItem = Array.from(document.querySelectorAll('[data-indb-doc-id]')).find(function (item) {
        return String(item.dataset.indbDocId || '') === String(savedDoc.id || '');
    });
    if (!savedItem) return;
    savedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    savedItem.style.boxShadow = '0 0 0 2px rgba(99,102,241,.9), 0 0 18px rgba(99,102,241,.38)';
    setTimeout(function () {
        savedItem.style.boxShadow = '';
    }, 2200);
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
        currentFilePath = null;
        updateCurrentDocumentDisplay();
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

function getEditorInputDebounceMs() {
    const len = String(currentMarkdown || '').length;
    if (len >= 300000) return 520;
    if (len >= 180000) return 380;
    if (len >= 90000) return 260;
    return 120;
}

function schedulePerformAutoSave(delayMs) {
    clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = setTimeout(function () {
        autoSaveDebounceTimer = null;
        performAutoSave();
    }, Math.max(40, Number(delayMs) || 0));
}

function scheduleRenderTOC(delayMs) {
    if (activeSidebarTab !== 'toc') return;
    clearTimeout(tocDebounceTimer);
    tocDebounceTimer = setTimeout(function () {
        tocDebounceTimer = null;
        if (activeSidebarTab === 'toc') renderTOC();
    }, Math.max(60, Number(delayMs) || 0));
}

function scheduleMiniPreviewRender(delayMs) {
    if (!miniPreviewEnabled || !isEditMode) return;
    clearTimeout(miniPreviewDebounceTimer);
    miniPreviewDebounceTimer = setTimeout(function () {
        miniPreviewDebounceTimer = null;
        if (miniPreviewEnabled && isEditMode) renderMiniPreviewContent();
    }, Math.max(80, Number(delayMs) || 0));
}

function scheduleUpdatePreviewPopupContent(delayMs) {
    if (!(typeof isPreviewPopupAlive === 'function' && isPreviewPopupAlive())) return;
    clearTimeout(previewPopupDebounceTimer);
    previewPopupDebounceTimer = setTimeout(function () {
        previewPopupDebounceTimer = null;
        if (typeof updatePreviewPopupContent === 'function') updatePreviewPopupContent();
    }, Math.max(80, Number(delayMs) || 0));
}

async function saveCurrentDocumentToInDbQuietly() {
    if (!db) return false;
    if (!currentDbDocId) return false;
    syncCurrentMarkdownFromEditor();
    const content = String(currentMarkdown || '');
    const title = String((currentFileName || 'Untitled').replace(/\.md$/i, '')).trim() || 'Untitled';
    return await new Promise((resolve) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const req = store.get(String(currentDbDocId));
        req.onsuccess = function () {
            const doc = req.result;
            if (!doc) {
                resolve(false);
                return;
            }
            doc.title = title;
            doc.content = content;
            doc.updatedAt = new Date();
            store.put(doc);
        };
        req.onerror = function () { resolve(false); };
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
    });
}

// --- AutoSave & Recovery ---
function performAutoSave(options) {
    if (!db) return;
    const opts = options || {};
    const force = !!opts.force;
    const content = String(currentMarkdown || '');
    const title = String(currentFileName || 'untitled.md');
    if (!force && content === lastAutoSavedContent && title === lastAutoSavedTitle) return;
    lastAutoSavedContent = content;
    lastAutoSavedTitle = title;
    saveCurrentDocumentToInDbQuietly().catch(function () {});
}

function setLiveRenderInEditMode(enabled) {
    pauseMainRenderWhileEditing = !enabled;
    if (!pauseMainRenderWhileEditing && mainRenderDirty) {
        renderMarkdown({ force: true });
    }
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
        currentFilePath = null;
        updateCurrentDocumentDisplay();
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
    return;
}

function applyRecovery() {
    dismissRecovery();
}

function dismissRecovery() {
    const modal = document.getElementById('recovery-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function pasteFromClipboardAndDismiss() {
    dismissRecovery();

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
    const changeLabels = [];
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
        if (typeof specialTRT.analyzeTidyChanges === 'function') {
            const trtResult = specialTRT.analyzeTidyChanges(value);
            if (trtResult && trtResult.value !== value) changed = true;
            if (trtResult && Array.isArray(trtResult.changes)) {
                for (let i = 0; i < trtResult.changes.length; i += 1) {
                    if (!changeLabels.includes(trtResult.changes[i])) changeLabels.push(trtResult.changes[i]);
                }
            }
            value = trtResult && typeof trtResult.value === 'string' ? trtResult.value : value;
        } else {
            const trtValue = specialTRT.prepareForTidy(value);
            if (trtValue !== value) changed = true;
            if (trtValue !== value) changeLabels.push('TRT ?뺣━');
            value = trtValue;
        }
    }

    return {
        value,
        changed,
        changes: changeLabels
    };
}

function tidySeparatorSpacingInEditor() {
    toggleTidyQuickMenu(true);
}

function getTidyActionDeps() {
    return {
        isEditMode: isEditMode,
        editorTextarea: editorTextarea,
        activeSidebarTab: activeSidebarTab,
        specialTRT: (typeof specialTRT !== 'undefined') ? specialTRT : null,
        tidySeparatorSpacing: tidySeparatorSpacing,
        setCurrentMarkdown: function (value) { currentMarkdown = value; },
        renderMarkdown: renderMarkdown,
        renderTOC: renderTOC,
        performAutoSave: performAutoSave,
        showToast: showToast
    };
}

function applyEnterTidyInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyEnter === 'function') {
        window.TidyActions.applyEnter(getTidyActionDeps());
    }
}

function applyMathTidyInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyMath === 'function') {
        window.TidyActions.applyMath(getTidyActionDeps());
    }
}

function applyHtmlTidyInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyHtml === 'function') {
        window.TidyActions.applyHtml(getTidyActionDeps());
    }
}

function closeTidyQuickMenu() {
    if (window.TidyActions && typeof window.TidyActions.closeMenu === 'function') {
        window.TidyActions.closeMenu();
    }
}

function toggleTidyQuickMenu(forceOpen) {
    if (window.TidyActions && typeof window.TidyActions.toggleMenu === 'function') {
        window.TidyActions.toggleMenu(forceOpen);
    }
}

function closeMermaidQuickMenu() {
    const panel = document.getElementById('mermaid-quick-panel');
    if (panel) panel.classList.add('hidden');
}

function toggleMermaidQuickMenu(forceOpen) {
    const panel = document.getElementById('mermaid-quick-panel');
    const btn = document.getElementById('btn-mermaid-quick');
    if (!panel || !btn) return;
    bindMermaidQuickMenuDismiss();
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
}

function bindMermaidQuickMenuDismiss() {
    if (mermaidQuickMenuBound || !document.body) return;
    mermaidQuickMenuBound = true;
    document.body.addEventListener('click', function (event) {
        const panel = document.getElementById('mermaid-quick-panel');
        const btn = document.getElementById('btn-mermaid-quick');
        if (!panel || !btn) return;
        const target = event.target;
        if (panel.contains(target) || btn.contains(target)) return;
        panel.classList.add('hidden');
    });
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
        showToast('蹂닿린 紐⑤뱶?먯꽌 癒쇱? ?띿뒪?몃? ?좏깮?섏꽭??');
        return false;
    }

    const source = String(currentMarkdown || (editorTextarea ? editorTextarea.value : ''));
    if (!source) {
        showToast('?꾩옱 臾몄꽌 ?댁슜??鍮꾩뼱 ?덉뒿?덈떎.');
        return false;
    }

    const idx = source.indexOf(selectedText);
    if (idx < 0) {
        showToast('?좏깮 ?띿뒪?몃? ?먮Ц?먯꽌 李얠? 紐삵뻽?듬땲??');
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
    showToast(isBold ? 'Bold ?곸슜 ?꾨즺' : 'Italic ?곸슜 ?꾨즺');
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
        ? '%%{init: {"flowchart": {"useMaxWidth": true, "htmlLabels": true}}}%%\ngraph LR\n  A[Start] --> B[End]'
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

const captionInsertState = {
    mode: 'table',
    format: 'angle'
};

function getCaptionFormats(mode) {
    if (mode === 'figure') {
        return [
            { id: 'bracket', label: '[그림 N]', build: function (n) { return '[그림 ' + n + ']'; } },
            { id: 'plain-ko', label: '그림 N.', build: function (n) { return '그림 ' + n + '.'; } },
            { id: 'bracket-fig', label: '[Fig N]', build: function (n) { return '[Fig ' + n + ']'; } },
            { id: 'fig', label: 'Fig N.', build: function (n) { return 'Fig ' + n + '.'; } },
            { id: 'bracket-figure', label: '[Figure N]', build: function (n) { return '[Figure ' + n + ']'; } },
            { id: 'figure', label: 'Figure N.', build: function (n) { return 'Figure ' + n + '.'; } }
        ];
    }
    return [
        { id: 'angle', label: '<표 N>', build: function (n) { return '<표 ' + n + '>'; } },
        { id: 'plain-ko', label: '표 N.', build: function (n) { return '표 ' + n + '.'; } },
        { id: 'table', label: 'Table N.', build: function (n) { return 'Table ' + n + '.'; } }
    ];
}

function escapeCaptionHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildCaptionText(mode, formatId, number, title) {
    const formats = getCaptionFormats(mode);
    const format = formats.find(function (item) { return item.id === formatId; }) || formats[0];
    const n = Math.max(1, parseInt(number, 10) || 1);
    const body = String(title || '').trim() || '내용';
    return format.build(n) + ' ' + body;
}

function buildCaptionHtml(mode, formatId, number, title) {
    const formats = getCaptionFormats(mode);
    const format = formats.find(function (item) { return item.id === formatId; }) || formats[0];
    const n = Math.max(1, parseInt(number, 10) || 1);
    const body = String(title || '').trim() || '내용';
    return '<span class="tbl-caption">' + format.build(n) + ' ' + escapeCaptionHtml(body) + '</span>';
}

function getCaptionUi(mode) {
    const normalized = mode === 'figure' ? 'figure' : 'table';
    return {
        mode: normalized,
        panel: document.getElementById(normalized + '-caption-panel'),
        formatButtons: document.getElementById(normalized + '-caption-format-buttons'),
        numberInput: document.getElementById(normalized + '-caption-number-input'),
        textInput: document.getElementById(normalized + '-caption-text-input'),
        preview: document.getElementById(normalized + '-caption-preview')
    };
}

function updateCaptionInsertPreview(mode) {
    const ui = getCaptionUi(mode || captionInsertState.mode);
    const numberInput = ui.numberInput;
    const textInput = ui.textInput;
    const preview = ui.preview;
    if (!preview) return;
    preview.textContent = buildCaptionText(
        ui.mode,
        captionInsertState[ui.mode + 'Format'] || captionInsertState.format,
        numberInput ? numberInput.value : 1,
        textInput ? textInput.value : ''
    );
}

function renderCaptionFormatButtons(mode) {
    const ui = getCaptionUi(mode || captionInsertState.mode);
    const wrap = ui.formatButtons;
    if (!wrap) return;
    const formats = getCaptionFormats(ui.mode);
    const currentFormat = captionInsertState[ui.mode + 'Format'] || (ui.mode === 'figure' ? 'bracket' : 'angle');
    wrap.innerHTML = '';
    formats.forEach(function (format) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = format.label;
        btn.className = 'px-2.5 py-1.5 rounded-md border text-xs font-semibold ' + (format.id === currentFormat
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
            : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700');
        btn.addEventListener('click', function () {
            captionInsertState[ui.mode + 'Format'] = format.id;
            captionInsertState.mode = ui.mode;
            captionInsertState.format = format.id;
            renderCaptionFormatButtons(ui.mode);
            updateCaptionInsertPreview(ui.mode);
        });
        wrap.appendChild(btn);
    });
}

function guessNextCaptionNumber(mode) {
    const text = String(editorTextarea ? editorTextarea.value : currentMarkdown || '');
    const prefix = mode === 'figure' ? '(?:그림|Fig(?:ure)?)' : '(?:표|Table)';
    const re = new RegExp(prefix + '\\s+(\\d+)', 'gi');
    let max = 0;
    let m;
    while ((m = re.exec(text))) {
        max = Math.max(max, parseInt(m[1], 10) || 0);
    }
    return max + 1;
}

function prepareCaptionPanel(mode) {
    if (!isEditMode || !editorTextarea) {
        showToast('Use this in edit mode.');
        return false;
    }
    const ui = getCaptionUi(mode);
    captionInsertState.mode = ui.mode;
    if (!captionInsertState[ui.mode + 'Format']) {
        captionInsertState[ui.mode + 'Format'] = ui.mode === 'figure' ? 'bracket' : 'angle';
    }
    captionInsertState.format = captionInsertState[ui.mode + 'Format'];
    const numberInput = ui.numberInput;
    const textInput = ui.textInput;
    if (numberInput) {
        numberInput.value = String(guessNextCaptionNumber(ui.mode));
        numberInput.oninput = function () { updateCaptionInsertPreview(ui.mode); };
    }
    if (textInput) {
        textInput.value = '';
        textInput.oninput = function () { updateCaptionInsertPreview(ui.mode); };
    }
    renderCaptionFormatButtons(ui.mode);
    updateCaptionInsertPreview(ui.mode);
    return true;
}

function toggleCaptionInsertPanel(mode, forceOpen) {
    const ui = getCaptionUi(mode);
    if (!ui.panel) return;
    const shouldOpen = forceOpen === true ? true : forceOpen === false ? false : ui.panel.classList.contains('hidden');
    if (shouldOpen && !prepareCaptionPanel(ui.mode)) return;
    ui.panel.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen && ui.textInput) {
        setTimeout(function () { ui.textInput.focus(); }, 0);
    } else if (!shouldOpen && editorTextarea) {
        editorTextarea.focus();
    }
}

function openCaptionInsertModal(mode) {
    toggleCaptionInsertPanel(mode, true);
}

function closeCaptionInsertModal() {
    toggleCaptionInsertPanel(captionInsertState.mode || 'table', false);
}

function insertCaptionHtmlAtCursor(html) {
    if (!isEditMode || !editorTextarea) return false;
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const value = editorTextarea.value;
    const scrollTop = editorTextarea.scrollTop;
    const scrollLeft = editorTextarea.scrollLeft;
    const before = start > 0 && value.charAt(start - 1) !== '\n' ? '\n\n' : '';
    const after = end < value.length && value.charAt(end) !== '\n' ? '\n\n' : '\n';
    const replacement = before + html + after;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.scrollLeft = scrollLeft;
    const pos = start + replacement.length;
    editorTextarea.setSelectionRange(pos, pos);
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    return true;
}

function confirmCaptionInsert(mode) {
    const ui = getCaptionUi(mode || captionInsertState.mode);
    const numberInput = ui.numberInput;
    const textInput = ui.textInput;
    const format = captionInsertState[ui.mode + 'Format'] || (ui.mode === 'figure' ? 'bracket' : 'angle');
    const html = buildCaptionHtml(
        ui.mode,
        format,
        numberInput ? numberInput.value : 1,
        textInput ? textInput.value : ''
    );
    if (insertCaptionHtmlAtCursor(html)) {
        if (ui.mode === 'table') toggleCaptionInsertPanel('table', false);
        showToast(ui.mode === 'figure' ? '그림 캡션을 삽입했습니다.' : '표 캡션을 삽입했습니다.');
    }
}

function getBulletMarkerByIndent(indentSpaces) {
    const depth = Math.max(0, Math.floor((Number(indentSpaces) || 0) / 2));
    const markers = ['-', '*', '+'];
    return markers[depth % markers.length];
}

function handleEditorListEnterKey(event) {
    if (!editorTextarea || !isEditMode) return false;
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
    if (editorTextarea.selectionStart !== editorTextarea.selectionEnd) return false;

    const cursor = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = text.indexOf('\n', cursor);
    if (lineEnd < 0) lineEnd = text.length;
    const line = text.substring(lineStart, lineEnd);
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!listMatch) return false;

    const indent = listMatch[1] || '';
    const token = listMatch[2] || '-';
    const content = listMatch[3] || '';
    event.preventDefault();

    if (!content.trim()) {
        editorTextarea.setSelectionRange(lineStart, lineEnd);
        document.execCommand('insertText', false, '');
        currentMarkdown = editorTextarea.value;
        renderMarkdown();
        if (activeSidebarTab === 'toc') renderTOC();
        performAutoSave();
        return true;
    }

    let nextToken = token;
    if (/^\d+\.$/.test(token)) {
        nextToken = (parseInt(token, 10) + 1) + '.';
    }
    const insertion = '\n' + indent + nextToken + ' ';
    editorTextarea.setSelectionRange(cursor, cursor);
    document.execCommand('insertText', false, insertion);
    currentMarkdown = editorTextarea.value;
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    return true;
}

function handleEditorListTabKey(event) {
    if (!editorTextarea || !isEditMode) return false;
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return false;
    if (editorTextarea.selectionStart !== editorTextarea.selectionEnd) return false;

    const cursor = editorTextarea.selectionStart;
    const text = editorTextarea.value;
    const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = text.indexOf('\n', cursor);
    if (lineEnd < 0) lineEnd = text.length;
    const line = text.substring(lineStart, lineEnd);
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!listMatch) return false;

    event.preventDefault();
    const oldIndent = listMatch[1] || '';
    const oldIndentLen = oldIndent.length;
    const token = listMatch[2] || '-';
    const content = listMatch[3] || '';
    const nextIndentLen = event.shiftKey
        ? Math.max(0, oldIndentLen - 2)
        : oldIndentLen + 2;
    const nextIndent = ' '.repeat(nextIndentLen);
    let nextToken = getBulletMarkerByIndent(nextIndentLen);
    if (/^\d+\.$/.test(token)) {
        // Numbered list: when indenting with Tab, start a nested list from 1.
        if (!event.shiftKey && nextIndentLen > oldIndentLen) {
            nextToken = '1.';
        } else {
            nextToken = token;
        }
    }
    const nextLine = nextIndent + nextToken + ' ' + content;

    editorTextarea.setSelectionRange(lineStart, lineEnd);
    document.execCommand('insertText', false, nextLine);

    const cursorOffset = Math.max(0, cursor - lineStart);
    const safeOffset = Math.min(cursorOffset + (nextLine.length - line.length), nextLine.length);
    const nextCursor = lineStart + safeOffset;
    editorTextarea.setSelectionRange(nextCursor, nextCursor);
    currentMarkdown = editorTextarea.value;
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    return true;
}

function bindEditorListKeyBehavior() {
    if (!editorTextarea || editorTextarea.__listKeyBehaviorBound) return;
    editorTextarea.__listKeyBehaviorBound = true;
    editorTextarea.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === 'Enter' || event.code === 'Enter')) {
            event.preventDefault();
            insertLiteralAtCursor('\n\n<div class="page-break"></div>\n\n');
            return;
        }
        if (handleEditorListEnterKey(event)) return;
        if (handleEditorListTabKey(event)) return;
    });
}

function bindWheelZoomShortcuts() {
    if (window.__mdWheelZoomShortcutsBound) return;
    window.__mdWheelZoomShortcutsBound = true;

    function handleWheelZoomShortcut(event) {
        if (!event) return;
        if (event.ctrlKey || event.metaKey) return;
        const dy = Number(event.deltaY || 0);
        if (dy === 0) return;

        if (event.shiftKey) {
            event.preventDefault();
            adjustPageScale(dy < 0 ? 0.05 : -0.05);
            return;
        }
        if (event.altKey) {
            event.preventDefault();
            adjustFontSize(dy < 0 ? 1 : -1);
        }
    }

    document.addEventListener('wheel', handleWheelZoomShortcut, { passive: false, capture: true });
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
    closeFootnoteQuickMenu();

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

function renumberAllFootnotes() {
    if (!isEditMode || !editorTextarea) {
        showToast('Edit mode only.');
        return;
    }
    closeFootnoteQuickMenu();

    const text = String(editorTextarea.value || '');
    if (!text.includes('[^')) {
        showToast('No footnotes found.');
        return;
    }

    const definitionOrder = [];
    const seenDefs = new Set();
    const defRegex = /^\[\^([^\]]+)\]:/gm;
    let m;
    while ((m = defRegex.exec(text)) !== null) {
        const label = String(m[1] || '').trim();
        if (!label || seenDefs.has(label)) continue;
        seenDefs.add(label);
        definitionOrder.push(label);
    }

    const referenceOrder = [];
    const seenRefs = new Set();
    const refRegex = /\[\^([^\]]+)\]/g;
    while ((m = refRegex.exec(text)) !== null) {
        const label = String(m[1] || '').trim();
        if (!label) continue;
        const tokenStart = m.index;
        const tokenLength = m[0].length;
        const isLineStart = tokenStart === 0 || text[tokenStart - 1] === '\n';
        const isDefinitionMarker = isLineStart && text[tokenStart + tokenLength] === ':';
        if (isDefinitionMarker) continue;
        if (seenRefs.has(label)) continue;
        seenRefs.add(label);
        referenceOrder.push(label);
    }

    const orderedLabels = referenceOrder.slice();
    for (let i = 0; i < definitionOrder.length; i++) {
        const label = definitionOrder[i];
        if (!seenRefs.has(label)) orderedLabels.push(label);
    }

    if (!orderedLabels.length) {
        showToast('No footnotes found.');
        return;
    }

    const labelToNumber = new Map();
    for (let i = 0; i < orderedLabels.length; i++) {
        labelToNumber.set(orderedLabels[i], String(i + 1));
    }

    const nextLines = text.split('\n').map(function (line) {
        const defMatch = line.match(/^\[\^([^\]]+)\]:(.*)$/);
        if (defMatch) {
            const oldLabel = String(defMatch[1] || '').trim();
            const newLabel = labelToNumber.get(oldLabel);
            if (!newLabel) return line;
            return '[^' + newLabel + ']:' + String(defMatch[2] || '');
        }
        return line.replace(/\[\^([^\]]+)\]/g, function (full, rawLabel) {
            const oldLabel = String(rawLabel || '').trim();
            const newLabel = labelToNumber.get(oldLabel);
            return newLabel ? ('[^' + newLabel + ']') : full;
        });
    });

    const nextText = nextLines.join('\n');
    if (nextText === text) {
        showToast('Footnote numbers are already in order.');
        return;
    }

    const scrollTop = editorTextarea.scrollTop;
    const scrollLeft = editorTextarea.scrollLeft;
    const selectionStart = Number(editorTextarea.selectionStart) || 0;
    const selectionEnd = Number(editorTextarea.selectionEnd) || 0;

    editorTextarea.value = nextText;
    currentMarkdown = nextText;
    editorTextarea.focus();
    editorTextarea.scrollTop = scrollTop;
    editorTextarea.scrollLeft = scrollLeft;
    editorTextarea.setSelectionRange(
        Math.min(selectionStart, nextText.length),
        Math.min(selectionEnd, nextText.length)
    );
    renderMarkdown();
    if (activeSidebarTab === 'toc') renderTOC();
    performAutoSave();
    showToast('Footnotes renumbered: ' + orderedLabels.length);
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
    enableTouchModalDrag(panel, header, {
        canStart: function () { return !mermaidEditorModalFullscreen && !mermaidEditorModalDockRight; },
        onStart: function () { panel.style.transform = 'none'; }
    });

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
        // 한글 복원: "입력된 Mermaid 코드가 비어 있습니다."
        showToast('입력된 Mermaid 코드가 비어 있습니다.');
        return;
    }
    if (!isEditMode) toggleMode('edit');
    if (!editorTextarea) return;

    const start =
        typeof editorTextarea.selectionStart === 'number'
            ? editorTextarea.selectionStart
            : editorTextarea.value.length;
    const end =
        typeof editorTextarea.selectionEnd === 'number'
            ? editorTextarea.selectionEnd
            : start;
    const replacement = '```mermaid\n' + raw + '\n```\n';

    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();

    // 한글 복원: "Mermaid 코드가 문서에 삽입되었습니다."
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

function setInputModalImagePanelToggleState() {
    if (window.LinkImageModal && typeof window.LinkImageModal.setImagePanelToggleState === 'function') {
        window.LinkImageModal.setImagePanelToggleState();
    }
}

function toggleInputModalImagePanel() {
    if (window.LinkImageModal && typeof window.LinkImageModal.toggleImagePanel === 'function') {
        window.LinkImageModal.toggleImagePanel();
    }
}

function openLinkModal(mode) {
    modalMode = mode;
    if (window.LinkImageModal && typeof window.LinkImageModal.open === 'function') {
        window.LinkImageModal.open(mode, { inputModal: inputModal, editorTextarea: editorTextarea });
    }
}
function closeModal() {
    if (window.LinkImageModal && typeof window.LinkImageModal.close === 'function') {
        window.LinkImageModal.close({ inputModal: inputModal, editorTextarea: editorTextarea });
        return;
    }
    if (inputModal) {
        inputModal.classList.add('hidden');
        inputModal.classList.remove('flex');
    }
    if (editorTextarea) editorTextarea.focus();
}

function confirmModalInsert() {
    if (window.LinkImageModal && typeof window.LinkImageModal.confirm === 'function') {
        const inserted = window.LinkImageModal.confirm({
            inputModal: inputModal,
            editorTextarea: editorTextarea,
            getMode: function () { return modalMode; },
            showToast: showToast,
            onInserted: function (value) { currentMarkdown = value; }
        });
        if (!inserted) return;
    }
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
    applyEditorHorizontalShift();
}

function adjustFontSize(delta) {
    fontSize = Math.max(10, Math.min(48, fontSize + delta));
    viewer.style.fontSize = `${fontSize}px`;
    editorTextarea.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--md-app-font-size', `${fontSize}px`);
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
}

function adjustHeaderScale(delta) {
    headerScale = Math.max(0.55, Math.min(1.5, Math.round((headerScale + Number(delta || 0)) * 100) / 100));
    document.documentElement.style.setProperty('--md-header-scale', `${headerScale}`);
    const display = document.getElementById('header-scale-display');
    if (display) display.textContent = `${Math.round(headerScale * 100)}%`;
}

function applyEditorHorizontalShift() {
    const editorDocWrap = document.getElementById('editor-doc-wrap');
    const display = document.getElementById('editor-shift-display');
    const viewport = document.getElementById('content-viewport');
    if (!editorDocWrap || !viewport) {
        if (display) display.textContent = '0px';
        return;
    }

    const viewportWidth = Number(viewport.clientWidth) || 0;
    const wrapWidth = Number(editorDocWrap.offsetWidth) || 0;
    const maxShift = Math.max(0, Math.floor((viewportWidth - wrapWidth) / 2) - 8);
    const clamped = Math.max(-maxShift, Math.min(maxShift, Number(editorHorizontalShiftPx) || 0));
    editorHorizontalShiftPx = clamped;

    editorDocWrap.style.transform = `translateX(${editorHorizontalShiftPx}px)`;
    editorDocWrap.style.transition = 'transform 120ms ease';
    if (display) display.textContent = `${editorHorizontalShiftPx}px`;
}

function adjustEditorHorizontalShift(delta) {
    const step = Number(delta || 0);
    editorHorizontalShiftPx = (Number(editorHorizontalShiftPx) || 0) + step;
    applyEditorHorizontalShift();
    localStorage.setItem(EDITOR_HORIZONTAL_SHIFT_KEY, String(editorHorizontalShiftPx));
}

function resetEditorHorizontalShift() {
    editorHorizontalShiftPx = 0;
    applyEditorHorizontalShift();
    localStorage.setItem(EDITOR_HORIZONTAL_SHIFT_KEY, '0');
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
    const savedShift = Number(localStorage.getItem(EDITOR_HORIZONTAL_SHIFT_KEY));
    editorHorizontalShiftPx = Number.isFinite(savedShift) ? Math.round(savedShift) : 0;
    applyDocumentWidthScale();
    applyEditorHorizontalShift();
    if (!editorShiftResizeBound) {
        editorShiftResizeBound = true;
        window.addEventListener('resize', applyEditorHorizontalShift);
    }
    const calendarEnabled = getGoogleCalendarEnabledFromLocal();
    const calendarCheck = document.getElementById('google-calendar-enabled');
    if (calendarCheck) calendarCheck.checked = calendarEnabled;
    applyGoogleCalendarVisibility(calendarEnabled);
}

function getGoogleCalendarEnabledFromLocal() {
    try {
        return localStorage.getItem(GOOGLE_CALENDAR_ENABLED_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function setGoogleCalendarEnabledToLocal(enabled) {
    try {
        if (enabled) localStorage.setItem(GOOGLE_CALENDAR_ENABLED_KEY, '1');
        else localStorage.removeItem(GOOGLE_CALENDAR_ENABLED_KEY);
    } catch (_) {}
}

function applyGoogleCalendarVisibility(enabled) {
    const button = document.getElementById('btn-google-calendar');
    if (button) button.classList.toggle('hidden', !enabled);
}

async function toggleGoogleCalendarSetting(enabled) {
    const value = !!enabled;
    setGoogleCalendarEnabledToLocal(value);
    applyGoogleCalendarVisibility(value);
    try {
        await setAiSettings({ googleCalendarEnabled: value });
    } catch (e) {
        console.error('Failed to save Google Calendar setting:', e);
    }
    showToast(value ? 'Google 캘린더 버튼을 표시합니다.' : 'Google 캘린더 버튼을 숨겼습니다.');
}

function openGoogleCalendarWindow() {
    if (!getGoogleCalendarEnabledFromLocal()) {
        showToast('설정에서 Google 캘린더 사용을 먼저 켜 주세요.');
        openSettingsModal();
        setTimeout(focusGoogleCalendarSettings, 80);
        return false;
    }
    const opened = window.open(GOOGLE_CALENDAR_URL, '_blank');
    if (!opened) {
        showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
        return false;
    }
    try { opened.opener = null; } catch (_) {}
    return true;
}

async function getAiSettings() {
    function readFallback() {
        try {
            const raw = localStorage.getItem(AI_SETTINGS_FALLBACK_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    if (!db) return readFallback();
    try {
        return await new Promise((res) => {
            const tx = db.transaction('ai_settings', 'readonly');
            const req = tx.objectStore('ai_settings').get(AI_SETTINGS_KEY);
            req.onsuccess = () => res(req.result || null);
            req.onerror = () => res(readFallback());
            tx.onabort = () => res(readFallback());
        });
    } catch (_) {
        return readFallback();
    }
}

async function setAiSettings(data) {
    function readFallback() {
        try {
            const raw = localStorage.getItem(AI_SETTINGS_FALLBACK_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    function writeFallback(payload) {
        try { localStorage.setItem(AI_SETTINGS_FALLBACK_KEY, JSON.stringify(payload || {})); } catch (_) {}
    }
    const existing = await getAiSettings();
    const payload = { id: AI_SETTINGS_KEY, ...(existing || {}), ...data };
    writeFallback(payload);
    if (!db) return;
    try {
        return await new Promise((res, rej) => {
            const tx = db.transaction('ai_settings', 'readwrite');
            const req = tx.objectStore('ai_settings').put(payload);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
            tx.onabort = () => rej(tx.error || new Error('ai_settings transaction aborted'));
        });
    } catch (e) {
        const fb = readFallback() || {};
        writeFallback({ ...fb, ...payload, id: AI_SETTINGS_KEY });
        return;
    }
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

function isValidDeepseekAiKey(key) {
    const k = (key || '').trim();
    return /^sk-[0-9A-Za-z_-]{16,}$/.test(k);
}

function normalizeDeepseekBaseUrl(value) {
    const raw = String(value || '').trim() || 'https://api.deepseek.com';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_) {
        throw new Error('DeepSeek Base URL 형식이 올바르지 않습니다.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('DeepSeek Base URL은 http:// 또는 https:// 주소여야 합니다.');
    }
    parsed.hash = '';
    parsed.search = '';
    let normalized = parsed.toString().replace(/\/+$/, '');
    if (/\/v1$/i.test(normalized)) normalized = normalized.slice(0, -3);
    return normalized || 'https://api.deepseek.com';
}

function getDeepseekVerifiedToken(key, baseUrl) {
    return credentialFingerprint(key) + '@' + normalizeDeepseekBaseUrl(baseUrl);
}

function validateDeepseekBaseUrlInputUI() {
    const input = document.getElementById('deepseek-base-url');
    const feedback = document.getElementById('deepseek-base-url-feedback');
    if (!input || !feedback) return false;
    try {
        const normalized = normalizeDeepseekBaseUrl(input.value);
        feedback.textContent = normalized === String(input.value || '').trim().replace(/\/+$/, '')
            ? '공식 OpenAI 호환 API 주소입니다.'
            : '저장 시 ' + normalized + ' 주소로 정규화됩니다.';
        feedback.className = 'text-xs mt-1 min-h-[1.25rem] text-slate-500 dark:text-slate-400';
        return true;
    } catch (error) {
        feedback.textContent = error.message;
        feedback.className = 'text-xs mt-1 min-h-[1.25rem] text-red-600 dark:text-red-400';
        return false;
    }
}

function validateDeepseekApiKeyInputUI() {
    const input = document.getElementById('deepseek-api-key');
    const key = String(input && input.value || '').trim();
    if (!input) return false;
    if (!key) {
        setCredentialConnectionVisual('deepseek-api-key', 'deepseek-api-key-feedback', 'neutral', '');
        return false;
    }
    if (!isValidDeepseekAiKey(key)) {
        setCredentialConnectionVisual('deepseek-api-key', 'deepseek-api-key-feedback', 'error', 'DeepSeek 키는 sk-로 시작해야 합니다.');
        return false;
    }
    let baseUrl = 'https://api.deepseek.com';
    try {
        const baseInput = document.getElementById('deepseek-base-url');
        baseUrl = normalizeDeepseekBaseUrl(baseInput && baseInput.value);
    } catch (_) {}
    const verified = localStorage.getItem('ss_deepseek_api_key') === key
        && localStorage.getItem('ss_deepseek_api_key_verified') === getDeepseekVerifiedToken(key, baseUrl);
    setCredentialConnectionVisual(
        'deepseek-api-key',
        'deepseek-api-key-feedback',
        verified ? 'connected' : 'neutral',
        verified ? '연결됨: DeepSeek API Key 확인 완료' : '키 형식이 올바릅니다. DeepSeek 키 저장을 눌러 연결을 확인하세요.'
    );
    return true;
}

function credentialFingerprint(value) {
    const text = String(value || '').trim();
    return text ? text.length + ':' + text.slice(-10) : '';
}

function toggleCredentialVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return false;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    const control = button || document.querySelector('[onclick*="' + inputId + '"]');
    if (control) {
        control.setAttribute('aria-pressed', visible ? 'true' : 'false');
        control.setAttribute('aria-label', visible ? 'API 키 숨기기' : 'API 키 보기');
        control.title = visible ? 'API 키 숨기기' : 'API 키 보기';
    }
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
    return visible;
}

function setCredentialConnectionVisual(inputId, statusId, state, message) {
    const input = inputId ? document.getElementById(inputId) : null;
    const status = statusId ? document.getElementById(statusId) : null;
    const normalized = String(state || 'neutral').toLowerCase();
    if (input) {
        input.classList.remove('settings-credential-connected', 'settings-credential-checking', 'settings-credential-error');
        if (normalized === 'connected' && String(input.value || '').trim()) input.classList.add('settings-credential-connected');
        else if (normalized === 'checking') input.classList.add('settings-credential-checking');
        else if (normalized === 'error') input.classList.add('settings-credential-error');
    }
    if (status) {
        status.classList.remove('settings-credential-connected-status', 'settings-credential-checking-status', 'settings-credential-error-status');
        if (normalized === 'connected') status.classList.add('settings-credential-connected-status');
        else if (normalized === 'checking') status.classList.add('settings-credential-checking-status');
        else if (normalized === 'error') status.classList.add('settings-credential-error-status');
        if (message != null) status.textContent = String(message);
    }
}

window.setCredentialConnectionVisual = setCredentialConnectionVisual;

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
        setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'neutral');
        return;
    }
    if (isValidGoogleAiApiKey(key)) {
        input.className = ok + ' ai-api-key-input';
        const verified = localStorage.getItem('ss_gemini_api_key_verified') === credentialFingerprint(key)
            && localStorage.getItem('ss_gemini_api_key') === key;
        if (fb && !verified) {
            fb.textContent = 'API key 형식이 올바릅니다. 저장하면 연결을 확인합니다.';
            fb.className = 'text-xs mt-1 text-green-600 dark:text-green-400 min-h-[1.25rem]';
        }
        setCredentialConnectionVisual(
            'ai-api-key',
            'ai-api-key-feedback',
            verified ? 'connected' : 'neutral',
            verified ? '연결됨: AI Studio API Key 확인 완료' : null
        );
    } else {
        input.className = bad + ' ai-api-key-input';
        if (fb) {
            fb.textContent = 'Invalid key format. It should usually start with AIza...';
            fb.className = 'text-xs mt-1 text-red-600 dark:text-red-400 min-h-[1.25rem]';
        }
        setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'error');
    }
}

let aiStudioConnectionCheckKey = '';
let aiStudioConnectionCheckPromise = null;
let deepseekApiKeyCheckKey = '';
let deepseekApiKeyCheckPromise = null;

async function verifyAIStudioApiKeyConnection(apiKey) {
    const key = String(apiKey || '').trim();
    if (!isValidGoogleAiApiKey(key)) throw new Error('AI Studio API Key 형식이 올바르지 않습니다.');
    if (aiStudioConnectionCheckPromise && aiStudioConnectionCheckKey === key) return aiStudioConnectionCheckPromise;
    setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'checking', 'AI Studio 연결을 확인하는 중...');
    const request = (async function () {
        try {
            const models = await listAIStudioTextModels(key);
            saveStoredModelList(SCHOLAR_AI_GEMINI_MODELS_KEY, models);
            localStorage.setItem('ss_gemini_api_key', key);
            localStorage.setItem('ss_gemini_api_key_verified', credentialFingerprint(key));
            const currentInput = document.getElementById('ai-api-key');
            if (!currentInput || String(currentInput.value || '').trim() === key) {
                setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'connected', '연결됨: AI Studio · Gemini 모델 ' + models.length + '개 확인');
            } else {
                validateApiKeyInputUI();
            }
            return models;
        } catch (error) {
            localStorage.removeItem('ss_gemini_api_key_verified');
            const currentInput = document.getElementById('ai-api-key');
            if (!currentInput || String(currentInput.value || '').trim() === key) {
                setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'error', '저장됨 · 연결 확인 실패: ' + (error && error.message ? error.message : error));
            } else {
                validateApiKeyInputUI();
            }
            throw error;
        }
    })();
    aiStudioConnectionCheckKey = key;
    aiStudioConnectionCheckPromise = request;
    try {
        return await request;
    } finally {
        if (aiStudioConnectionCheckPromise === request) {
            aiStudioConnectionCheckKey = '';
            aiStudioConnectionCheckPromise = null;
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
    else {
        localStorage.removeItem('ss_gemini_api_key');
        localStorage.removeItem('ss_gemini_api_key_verified');
        validateApiKeyInputUI();
        showToast('AI Studio API key를 비웠습니다.');
        return;
    }
    try {
        await verifyAIStudioApiKeyConnection(key);
        showToast('AI Studio API key가 저장되고 연결되었습니다.');
    } catch (error) {
        showToast('API key는 저장했지만 AI Studio 연결을 확인하지 못했습니다.');
    }
}

async function saveDeepseekApiKey() {
    const input = document.getElementById('deepseek-api-key');
    const baseInput = document.getElementById('deepseek-base-url');
    const key = (input && input.value) ? input.value.trim() : '';
    let baseUrl = 'https://api.deepseek.com';
    try {
        baseUrl = normalizeDeepseekBaseUrl(baseInput && baseInput.value);
        if (baseInput) baseInput.value = baseUrl;
        validateDeepseekBaseUrlInputUI();
    } catch (error) {
        validateDeepseekBaseUrlInputUI();
        showToast(error.message);
        return;
    }
    if (key && !isValidDeepseekAiKey(key)) {
        setCredentialConnectionVisual('deepseek-api-key', 'deepseek-api-key-feedback', 'error', '저장되지 않음: DeepSeek 키는 sk-로 시작해야 합니다.');
        showToast('Invalid DeepSeek API key format.');
        return;
    }
    await setAiSettings({ deepseekApiKey: key, deepseekBaseUrl: baseUrl });
    if (key) {
        localStorage.setItem('ss_deepseek_api_key', key);
        localStorage.setItem('ss_deepseek_base_url', baseUrl);
    } else {
        localStorage.removeItem('ss_deepseek_api_key');
        localStorage.removeItem('ss_deepseek_api_key_verified');
        localStorage.removeItem('ss_deepseek_base_url');
        localStorage.removeItem('ss_deepseek_balance_available');
        localStorage.removeItem('ss_deepseek_balance_summary');
        setCredentialConnectionVisual('deepseek-api-key', 'deepseek-api-key-feedback', 'neutral', 'DeepSeek API key가 비워졌습니다.');
        return;
    }
    try {
        setCredentialConnectionVisual('deepseek-api-key', 'deepseek-api-key-feedback', 'checking', 'DeepSeek 연결을 확인하는 중...');
        const verification = await verifyDeepseekApiKeyConnection(key, baseUrl);
        const models = verification.models || [];
        const balance = verification.balance;
        const hasBalance = !balance || balance.isAvailable !== false;
        const balanceText = balance && balance.summary ? ' · 잔액 ' + balance.summary : '';
        setCredentialConnectionVisual(
            'deepseek-api-key',
            'deepseek-api-key-feedback',
            'connected',
            hasBalance
                ? '연결됨: DeepSeek 모델 ' + models.length + '개 확인' + balanceText
                : '연결됨 · 잔액 부족: 모델 ' + models.length + '개 확인 · 충전 후 생성할 수 있습니다.'
        );
        showToast(hasBalance
            ? 'DeepSeek API key가 저장되고 연결되었습니다.'
            : 'DeepSeek API는 연결되었지만 잔액이 부족합니다.');
    } catch (error) {
        setCredentialConnectionVisual(
            'deepseek-api-key',
            'deepseek-api-key-feedback',
            'error',
            '저장됨 · 연결 확인 실패: ' + (error && error.message ? error.message : error)
        );
        showToast('DeepSeek API key는 저장했지만 연결을 확인하지 못했습니다.');
    }
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
    if (btn) btn.textContent = isFolded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
}

function toggleSettingsShortcutsFold() {
    const next = !getSettingsShortcutsFoldedFromLocal();
    setSettingsShortcutsFoldedToLocal(next);
    applySettingsShortcutsFold(next);
}

function getAiUseFoldedFromLocal() {
    const v = localStorage.getItem(AI_USE_FOLD_KEY);
    return v == null ? false : v === '1';
}

function setAiUseFoldedToLocal(folded) {
    localStorage.setItem(AI_USE_FOLD_KEY, folded ? '1' : '0');
}

function applyAiUseFold(folded) {
    const btn = document.getElementById('ai-use-fold-btn');
    if (btn) btn.textContent = folded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
    const section = document.getElementById('ai-password-section');
    if (section) section.classList.toggle('hidden', !!folded);
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
    if (btn) btn.textContent = folded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
    if (body) body.classList.toggle('hidden', !!folded);
}

function toggleShareSettingsFold() {
    const next = !getShareSettingsFoldedFromLocal();
    setShareSettingsFoldedToLocal(next);
    applyShareSettingsFold(next);
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

function closeFootnoteQuickMenu() {
    const panel = document.getElementById('footnote-quick-panel');
    if (panel) panel.classList.add('hidden');
}

function bindFootnoteQuickMenuDismiss() {
    if (footnoteQuickMenuBound || !document.body) return;
    footnoteQuickMenuBound = true;
    document.body.addEventListener('click', function (event) {
        const panel = document.getElementById('footnote-quick-panel');
        const btn = document.getElementById('btn-footnote-quick');
        if (!panel || !btn) return;
        const target = event.target;
        if (panel.contains(target) || btn.contains(target)) return;
        closeFootnoteQuickMenu();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeFootnoteQuickMenu();
    });
}

function toggleFootnoteQuickMenu(forceOpen) {
    const panel = document.getElementById('footnote-quick-panel');
    const btn = document.getElementById('btn-footnote-quick');
    if (!panel || !btn) return;
    bindFootnoteQuickMenuDismiss();
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
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
    enableTouchModalDrag(panel, header, {
        onStart: function () { panel.style.right = 'auto'; }
    });

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
        label.textContent = (rows > 0 && cols > 0)
            ? (rows + 'x' + cols + ' \uD14C\uC774\uBE14')
            : '\uD06C\uAE30 \uC120\uD0DD';
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
    const previous = String(localStorage.getItem('ss_imgbb_api_key') || '').trim();
    await setAiSettings({ imgbbApiKey: value });
    if (value) localStorage.setItem('ss_imgbb_api_key', value);
    else localStorage.removeItem('ss_imgbb_api_key');
    if (!value || value !== previous) localStorage.removeItem('ss_imgbb_api_key_verified');
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

function getDeepseekApiState() {
    let baseUrl = 'https://api.deepseek.com';
    try {
        baseUrl = normalizeDeepseekBaseUrl(localStorage.getItem('ss_deepseek_base_url'));
    } catch (_) {}
    return {
        key: String(localStorage.getItem('ss_deepseek_api_key') || '').trim(),
        baseUrl: baseUrl,
        verifiedFingerprint: String(localStorage.getItem('ss_deepseek_api_key_verified') || '')
    };
}

async function verifyDeepseekApiKeyConnection(apiKey, baseUrl) {
    const key = String(apiKey || '').trim();
    const base = normalizeDeepseekBaseUrl(baseUrl);
    if (!isValidDeepseekAiKey(key)) throw new Error('DeepSeek API Key 형식이 올바르지 않습니다.');
    const token = key + '|' + base;
    if (deepseekApiKeyCheckPromise && deepseekApiKeyCheckKey === token) return deepseekApiKeyCheckPromise;
    deepseekApiKeyCheckKey = token;
    const request = (async function () {
        try {
            const models = await listDeepseekChatModels(key, base);
            let balance = null;
            try {
                balance = await getDeepseekUserBalance(key, base);
            } catch (balanceError) {
                console.warn('DeepSeek balance check failed:', balanceError);
            }
            saveStoredModelList('ss_scholar_ai_deepseek_models_v1', models);
            localStorage.setItem('ss_deepseek_api_key', key);
            localStorage.setItem('ss_deepseek_base_url', base);
            localStorage.setItem('ss_deepseek_api_key_verified', getDeepseekVerifiedToken(key, base));
            if (balance) {
                localStorage.setItem('ss_deepseek_balance_available', balance.isAvailable ? '1' : '0');
                localStorage.setItem('ss_deepseek_balance_summary', balance.summary || '');
            } else {
                localStorage.removeItem('ss_deepseek_balance_available');
                localStorage.removeItem('ss_deepseek_balance_summary');
            }
            return { models: models, balance: balance };
        } catch (error) {
            localStorage.removeItem('ss_deepseek_api_key_verified');
            localStorage.removeItem('ss_deepseek_balance_available');
            localStorage.removeItem('ss_deepseek_balance_summary');
            throw error;
        }
    })();
    deepseekApiKeyCheckPromise = request;
    try {
        return await request;
    } finally {
        if (deepseekApiKeyCheckPromise === request) {
            deepseekApiKeyCheckKey = '';
            deepseekApiKeyCheckPromise = null;
        }
    }
}

function getFmaViewerVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.fmaViewerVisible === true;
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
    applyMacroVisibility({ macroVisible: enabled });
    try { await setAiSettings({ macroVisible: enabled }); } catch (e) { console.error(e); }
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
    applyScholarSearchVisibility({ scholarSearchVisible: enabled });
    try { await setAiSettings({ scholarSearchVisible: enabled }); } catch (e) { console.error(e); }
}

async function toggleHighlightSection() {
    const check = document.getElementById('highlight-visible');
    const enabled = !!(check && check.checked);
    applyHighlightVisibility({ highlightVisible: enabled });
    try { await setAiSettings({ highlightVisible: enabled }); } catch (e) { console.error(e); }
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
    const defaultName = (currentFileName || '???묒떇').replace(/\.md$/i, '').trim() || '???묒떇';
    const name = window.prompt('?묒떇 ?대쫫???낅젰?섏꽭??', defaultName);
    if (name == null) return;
    const title = String(name || '').trim();
    if (!title) {
        showToast('?묒떇 ?대쫫???낅젰?섏꽭??');
        return;
    }
    const descInput = window.prompt('?묒떇 ?ㅻ챸(?좏깮)', '?ъ슜???묒떇');
    if (descInput == null) return;
    const desc = String(descInput || '').trim();
    const previewEl = document.getElementById('template-preview');
    const candidate = String(previewEl && previewEl.value ? previewEl.value : '').trim();
    const docContent = String(editorTextarea && editorTextarea.value ? editorTextarea.value : '').trim();
    const content = docContent || candidate;
    if (!content) {
        showToast('??ν븷 ?묒떇 ?댁슜???놁뒿?덈떎.');
        return;
    }
    const entry = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: title,
        desc: desc || '?ъ슜???묒떇',
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
    showToast('?묒떇??異붽??덉뒿?덈떎.');
}

async function saveEditedTemplate() {
    const draft = getTemplateEditorDraft();
    const targetName = String(draft.name || '').trim();
    if (!targetName) {
        showToast('?묒떇 ?대쫫???낅젰?섏꽭??');
        return;
    }
    if (!String(draft.content || '').trim()) {
        showToast('?묒떇 ?댁슜??鍮꾩뼱 ?덉뒿?덈떎.');
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
            desc: draft.desc || '?ъ슜???묒떇',
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
        showToast('媛숈? ?대쫫 ?묒떇????뼱?⑥꽌 ??ν뻽?듬땲??');
        return;
    }

    const created = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: targetName,
        desc: draft.desc || '?ъ슜???묒떇',
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
    showToast('?대쫫???щ씪 ???묒떇?쇰줈 ??ν뻽?듬땲??');
}

function exportSelectedTemplateMd() {
    const payload = getTemplateExportPayload();
    if (!payload || !payload.content.trim()) {
        showToast('?대낫???묒떇???놁뒿?덈떎.');
        return;
    }
    const fileName = sanitizeTemplateFileName(payload.name) + '.md';
    downloadTemplateMdFile(fileName, payload.content);
    showToast('?묒떇??.md ?뚯씪濡??대낫?덉뒿?덈떎.');
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
        showToast('?묒떇 ?뚯씪???쎌? 紐삵뻽?듬땲??');
        if (input) input.value = '';
        return;
    }
    const content = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!content) {
        showToast('鍮꾩뼱 ?덈뒗 md ?뚯씪?낅땲??');
        if (input) input.value = '';
        return;
    }
    const firstLine = content.split('\n').find(function (line) { return String(line || '').trim(); }) || '';
    const heading = firstLine.replace(/^#+\s*/, '').trim();
    const guessedName = heading || fileName.replace(/\.md$/i, '').trim() || '媛?몄삩 ?묒떇';
    const entry = {
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: guessedName,
        desc: '媛?몄삩 ?묒떇',
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
    showToast('md ?묒떇??媛?몄솕?듬땲??');
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
    enableTouchModalDrag(panel, header, {
        canStart: function () { return !templatePanelCompact && !templatePanelResizing; },
        onStart: function () {
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        },
        onMove: function () { templatePanelMoved = true; }
    });

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
        showToast('?묒떇 ?댁슜??鍮꾩뼱 ?덉뒿?덈떎.');
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
        showToast('?ъ슜 媛?ν븳 ?묒떇???놁뒿?덈떎.');
        return;
    }
    const ok = insertTemplateTextAtCursor(item.content);
    if (ok) showToast('?묒떇??臾몄꽌???쎌엯?덉뒿?덈떎.');
}

function insertSelectedTemplateAsNewFile() {
    const item = getSelectedTemplateItem();
    if (!item) {
        showToast('?ъ슜 媛?ν븳 ?묒떇???놁뒿?덈떎.');
        return;
    }
    createNewFile();
    updateContent(item.content);
    currentMarkdown = editorTextarea ? editorTextarea.value : item.content;
    performAutoSave();
    if (isEditMode && editorTextarea) editorTextarea.focus();
    showToast('???뚯씪???묒떇???쎌엯?덉뒿?덈떎.');
}

async function toggleTemplateSection() {
    const check = document.getElementById('template-visible');
    const enabled = !!(check && check.checked);
    applyTemplateVisibility({ templateVisible: enabled });
    try { await setAiSettings({ templateVisible: enabled }); } catch (e) { console.error(e); }
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
    enableTouchModalDrag(panel, header, {
        canStart: function () { return !html2pptResizing && !html2pptFullscreen; },
        onStart: function () {
            html2pptDockRight = false;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            applyHtml2pptPanelLayout();
        },
        onMove: function () { html2pptMoved = true; }
    });

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
    applyHtml2pptVisibility({ html2pptVisible: enabled });
    try { await setAiSettings({ html2pptVisible: enabled }); } catch (e) { console.error(e); }
}

function applyFmaViewerVisibility(settings) {
    const enabled = getFmaViewerVisibleFromSettings(settings || {});
    const btn = document.getElementById('btn-fma-viewer');
    if (!btn) return;
    btn.classList.toggle('hidden', !enabled);
    btn.classList.toggle('flex', enabled);
}

async function toggleFmaViewerSection() {
    const check = document.getElementById('fma-viewer-visible');
    const enabled = !!(check && check.checked);
    applyFmaViewerVisibility({ fmaViewerVisible: enabled });
    try { await setAiSettings({ fmaViewerVisible: enabled }); } catch (e) { console.error(e); }
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

window.addEventListener('message', function (event) {
    const data = event && event.data ? event.data : null;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'mdv-genslide-open-scholar') {
        try {
            if (typeof window.openScholarAIForExternalContext === 'function') {
                window.openScholarAIForExternalContext();
                return;
            }
        } catch (_) {}
        try {
            if (typeof window.toggleScholarAI === 'function') {
                window.toggleScholarAI();
                return;
            }
        } catch (_) {}
        return;
    }

    if (data.type === 'mdv-genslide-selection-changed') {
        const selected = String(data.text || '');
        const forceOpen = !!data.forceOpen;
        try {
            if (typeof window.LiveAISetSelectedText === 'function') {
                window.LiveAISetSelectedText(selected, { source: 'genslide', forceOpen: forceOpen });
                return;
            }
        } catch (_) {}
        if (forceOpen) {
            try {
                if (typeof window.openScholarAIForExternalContext === 'function') window.openScholarAIForExternalContext();
                else if (typeof window.toggleScholarAI === 'function') window.toggleScholarAI();
            } catch (_) {}
        }
    }
});

function configureScholarSearchShellBridge() {
    const shell = window.ScholarSearchShell;
    if (!shell || typeof shell.init !== 'function') return;
    shell.init({
        dbGetter: function () { return db; },
        getEditor: function () { return editorTextarea; },
        showToast: function (msg) { showToast(msg); },
        getEditorSelectedText: getEditorSelectedText,
        getDocumentBaseUrl: getDocumentBaseUrl
    });
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
    enableTouchModalDrag(panel, header, {
        onStart: function (e, panelEl, rect) {
            if (!highlightPopupDockRight) highlightPopupDragOffsetX = e.clientX - rect.left;
            highlightPopupDragOffsetY = e.clientY - rect.top;
        },
        onMove: function (e, panelEl, nextLeft, nextTop) {
            if (highlightPopupDockRight) {
                highlightPopupDockTop = nextTop;
                panelEl.style.left = '12px';
            }
        }
    });

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
    applyImageUploadFeatureVisibility({ imageUploadEnabled: enabled });
    try { await setAiSettings({ imageUploadEnabled: enabled }); } catch (e) { console.error(e); }
}

async function saveImgbbApiKeyFromModal() {
    const input = document.getElementById('ai-imgbb-api-key');
    const value = (input && input.value) ? input.value.trim() : '';
    await saveImgbbApiKey(value);
    showToast(value ? 'imgBB API key가 저장되어 연결 준비가 완료되었습니다.' : 'imgBB API key를 비웠습니다.');
}

function syncImgbbApiKeyInputs(value) {
    const v = String(value || '');
    const settingsInput = document.getElementById('ai-imgbb-api-key');
    if (settingsInput && settingsInput.value !== v) settingsInput.value = v;
    const sspInput = document.getElementById('ssp-imgbb-api-key');
    if (sspInput && sspInput.value !== v) sspInput.value = v;
    const uploadVerified = !!v && localStorage.getItem('ss_imgbb_api_key_verified') === credentialFingerprint(v);
    setCredentialConnectionVisual(
        'ai-imgbb-api-key',
        'ai-imgbb-feedback',
        v ? 'connected' : 'neutral',
        v ? (uploadVerified ? '연결됨: imgBB 업로드 확인 완료' : '연결됨: imgBB API Key 저장 완료') : 'imgBB API Key가 저장되지 않았습니다.'
    );
}

function updateImgbbApiKeyConnectionUI() {
    const input = document.getElementById('ai-imgbb-api-key');
    const value = String(input && input.value || '').trim();
    const saved = String(getImgbbApiKey() || '').trim();
    const unchanged = !!value && value === saved;
    const uploadVerified = unchanged && localStorage.getItem('ss_imgbb_api_key_verified') === credentialFingerprint(value);
    setCredentialConnectionVisual(
        'ai-imgbb-api-key',
        'ai-imgbb-feedback',
        unchanged ? 'connected' : 'neutral',
        unchanged ? (uploadVerified ? '연결됨: imgBB 업로드 확인 완료' : '연결됨: imgBB API Key 저장 완료') : (value ? '변경된 API Key를 저장해 주세요.' : 'imgBB API Key가 저장되지 않았습니다.')
    );
}

function setAiPasswordVerifiedUI(state) {
    const input = document.getElementById('ai-password-input');
    const fb = document.getElementById('ai-password-feedback');
    const base = 'flex-1 min-w-[120px] px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-colors';
    if (!input) return;
    if (state === 'ok') {
        input.className = base + ' border-green-500 dark:border-green-500 ring-2 ring-green-500/40';
        if (fb) {
            fb.textContent = '연결됨: AI 기능 인증 완료';
            fb.className = 'text-xs text-green-600 dark:text-green-400 min-h-[1.25rem]';
        }
        setCredentialConnectionVisual('ai-password-input', 'ai-password-feedback', 'connected');
    } else if (state === 'bad') {
        input.className = base + ' border-red-500 dark:border-red-500 ring-2 ring-red-500/40';
        if (fb) {
            fb.textContent = 'Verification code is invalid. Please try again.';
            fb.className = 'text-xs text-red-600 dark:text-red-400 min-h-[1.25rem]';
        }
        setCredentialConnectionVisual('ai-password-input', 'ai-password-feedback', 'error');
    } else {
        input.className = base + ' border-slate-200 dark:border-slate-600';
        if (fb) { fb.textContent = ''; fb.className = 'text-xs min-h-[1.25rem]'; }
        setCredentialConnectionVisual('ai-password-input', 'ai-password-feedback', 'neutral');
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
    const raw = (input && input.value) ? String(input.value) : '';
    const pwd = raw.trim();
    if (!pwd) {
        showToast("Enter verification code.");
        const cur = await getAiSettings();
        if (!(cur && cur.verified)) setAiPasswordVerifiedUI('neutral');
        return;
    }
    if (!db) {
        showToast("Database is not ready yet. Please try again.");
        return;
    }
    // Support both plain verification code and already-hashed input.
    const hash = (pwd === AI_PASSWORD_HASH) ? AI_PASSWORD_HASH : await hashPassword(pwd);
    if (hash !== AI_PASSWORD_HASH) {
        setAiPasswordVerifiedUI('bad');
        showToast("Verification code does not match.");
        return;
    }
    try {
        await setAiSettings({ passwordHash: hash, verified: true, aiMasterEnabled: true });
    } catch (e) {
        console.error('Failed to save verification settings:', e);
        showToast("Failed to save verification. Please try again.");
        return;
    }
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
    const googleCalendarEl = document.getElementById('google-calendar-enabled');
    const googleCalendarEnabled = !!(googleCalendarEl && googleCalendarEl.checked);
    setGoogleCalendarEnabledToLocal(googleCalendarEnabled);
    applyGoogleCalendarVisibility(googleCalendarEnabled);
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
    saveScholarAIProviderSettingsFromUI(false);
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
    const githubPullMaxEl = document.getElementById('github-pull-max-files-input');
    const githubDefaultPushPathEl = document.getElementById('github-default-push-path-input');
    const githubToken = String(githubTokenEl && githubTokenEl.value ? githubTokenEl.value : '').trim();
    const githubRepo = String(githubRepoEl && githubRepoEl.value ? githubRepoEl.value : '').trim();
    const githubBranch = String(githubBranchEl && githubBranchEl.value ? githubBranchEl.value : 'main').trim() || 'main';
    const githubDefaultPushPath = String(githubDefaultPushPathEl && githubDefaultPushPathEl.value ? githubDefaultPushPathEl.value : '').trim();
    const imgbbKeyInput = document.getElementById('ai-imgbb-api-key');
    const imgbbKey = (imgbbKeyInput && imgbbKeyInput.value) ? imgbbKeyInput.value.trim() : '';
    const sqliteEnabledEl = document.getElementById('sqlite-enabled');
    const sqliteEnabled = !!(sqliteEnabledEl && sqliteEnabledEl.checked);
    await setAiSettings({
        scholarAI: !!scholarOn,
        sspimgAI: !!sspimgOn,
        githubEnabled: !!(githubEl && githubEl.checked),
        githubToken: githubToken,
        githubRepo: githubRepo,
        githubBranch: githubBranch,
        githubDefaultPushPath: githubDefaultPushPath,
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
        googleCalendarEnabled: googleCalendarEnabled,
        imgbbApiKey: imgbbKey,
        sqliteEnabled: sqliteEnabled
    });
    if (imgbbKey) localStorage.setItem('ss_imgbb_api_key', imgbbKey);
    else localStorage.removeItem('ss_imgbb_api_key');
    await applyGithubUiState();
}

async function closeSettingsModal() {
    try {
        await persistAiSettingsFromModal();
    } catch (e) {
        console.error('Failed to persist settings before close:', e);
    } finally {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        if (settingsModalFullscreen) {
            settingsModalFullscreen = false;
            settingsModalRestoreRect = null;
            applySettingsModalFullscreenUI();
        }
        try { await applyAiFeatureVisibility(); } catch (_) {}
    }
}

const SETTINGS_EXPORT_LOCAL_KEYS = [
    ENTER_BUTTON_BR_KEY,
    SELECTION_WRAP_KEY,
    VIEW_MODE_EDIT_KEY,
    SETTINGS_SHORTCUTS_FOLD_KEY,
    AI_USE_FOLD_KEY,
    SHARE_SETTINGS_FOLD_KEY,
    GITHUB_SETTINGS_FOLD_KEY,
    EDITOR_HORIZONTAL_SHIFT_KEY,
    THEME_KEY,
    EDITOR_LIGHT_KEY,
    MINI_PREVIEW_KEY,
    MINI_PREVIEW_LAYOUT_KEY,
    FOLDER_COLLAPSE_STATE_KEY,
    STORAGE_SOURCE_TAB_KEY,
    GOOGLE_CALENDAR_ENABLED_KEY,
    'md_viewer_code_bg',
    'md_viewer_code_text',
    'ss_imgbb_api_key',
    'ss_ollama_base_url',
    'ss_ollama_models_v1',
    'ss_scholar_ai_ollama_model',
    'ss_ai_chat_ollama_model',
    'local_ai_lmstudio_settings_v1',
    'ss_scholar_ai_provider',
    'ss_scholar_ai_model',
    'ss_scholar_ai_gemini_models_v1',
    'ss_scholar_ai_lmstudio_models_v1',
    'ss_viewer_scholar_ai_ui_font_size',
    'ss_ai_chat_enabled',
    'ss_ai_chat_provider',
    'ss_ai_chat_gemini_model',
    'ss_ai_chat_writing_style',
    'ss_ai_chat_gemini_models_v1',
    'ss_ai_chat_response_mode',
    'ss_ai_chat_layout'
];

function buildSettingsExportPayload(aiSettings) {
    const local = {};
    SETTINGS_EXPORT_LOCAL_KEYS.forEach(function (k) {
        const v = localStorage.getItem(k);
        if (v != null) local[k] = v;
    });
    return {
        format: 'md_viewer_settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        aiSettings: aiSettings || {},
        localStorage: local
    };
}

function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

async function exportSettingsMset() {
    try {
        await persistAiSettingsFromModal();
        const aiSettings = await getAiSettings();
        const payload = buildSettingsExportPayload(aiSettings);
        const text = JSON.stringify(payload, null, 2);
        const date = new Date().toISOString().slice(0, 10);
        downloadTextFile('mdviewer_settings_' + date + '.mset', text, 'application/json;charset=utf-8');
        showToast('?섍꼍?ㅼ젙??.mset ?뚯씪濡??대낫?덉뒿?덈떎.');
    } catch (e) {
        console.error('Failed to export settings:', e);
        showToast('?섍꼍?ㅼ젙 ?대낫?닿린???ㅽ뙣?덉뒿?덈떎.');
    }
}

function triggerImportSettingsMset() {
    const input = document.getElementById('settings-import-file');
    if (!input) return;
    input.value = '';
    input.click();
}

async function applyImportedSettingsPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid settings payload');
    }
    const aiSettings = (payload.aiSettings && typeof payload.aiSettings === 'object') ? payload.aiSettings : {};
    const local = (payload.localStorage && typeof payload.localStorage === 'object') ? payload.localStorage : {};

    await setAiSettings(aiSettings);

    SETTINGS_EXPORT_LOCAL_KEYS.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(local, k)) {
            const v = local[k];
            if (v == null) localStorage.removeItem(k);
            else localStorage.setItem(k, String(v));
        }
    });

    if (typeof loadAiSettingsToUI === 'function') await loadAiSettingsToUI();
    if (typeof initAiVisibility === 'function') await initAiVisibility();
    if (typeof applyCodeColorSettings === 'function') applyCodeColorSettings();
    if (typeof applyTheme === 'function') applyTheme();
}

async function importSettingsMsetFile(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files && input.files[0] ? input.files[0] : null;
    if (!file) return;
    try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await applyImportedSettingsPayload(payload);
        showToast('?섍꼍?ㅼ젙??遺덈윭?붿뒿?덈떎.');
    } catch (e) {
        console.error('Failed to import settings:', e);
        showToast('?ㅼ젙 ?뚯씪 遺덈윭?ㅺ린???ㅽ뙣?덉뒿?덈떎.');
    } finally {
        if (input) input.value = '';
    }
}

const INDB_STATUS_STORE_ORDER = [
    'documents',
    'folders',
    'images',
    'autosave',
    'ai_settings',
    'scholar_refs',
    'ai_chat',
    'scholar_ai',
    'ssp_image_ai',
    'highlights',
    'genslides'
];
let featureDataSyncPromise = null;

function normalizeFeatureInDbRecord(storeName, record, index) {
    const source = record && typeof record === 'object' ? record : { value: record };
    const normalized = Object.assign({}, source);
    const rawId = source.id != null && String(source.id).trim()
        ? String(source.id)
        : storeName + '-' + String(index + 1);
    normalized.id = rawId;
    normalized.syncedAt = new Date().toISOString();
    return normalized;
}

function replaceFeatureStoreRecordsInDb(storeName, records) {
    const store = String(storeName || '').trim();
    if (!db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    const list = Array.isArray(records) ? records : [];
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            const objectStore = tx.objectStore(store);
            objectStore.clear();
            list.forEach(function (record, index) {
                objectStore.put(normalizeFeatureInDbRecord(store, record, index));
            });
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to synchronize ' + store)); };
            tx.onabort = function () { reject(tx.error || new Error('Synchronization was aborted: ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function saveFeatureRecordToInDb(storeName, record) {
    const store = String(storeName || '').trim();
    if (!db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(normalizeFeatureInDbRecord(store, record, 0));
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to save ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function upsertFeatureStoreRecordsInDb(storeName, records) {
    const store = String(storeName || '').trim();
    if (!db || !FEATURE_DATA_STORE_NAMES.includes(store) || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    const list = Array.isArray(records) ? records : [];
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            const objectStore = tx.objectStore(store);
            list.forEach(function (record, index) {
                objectStore.put(normalizeFeatureInDbRecord(store, record, index));
            });
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to update ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

function deleteFeatureRecordFromInDb(storeName, id) {
    const store = String(storeName || '').trim();
    const recordId = String(id == null ? '' : id).trim();
    if (!db || !FEATURE_DATA_STORE_NAMES.includes(store) || !recordId || !db.objectStoreNames.contains(store)) {
        return Promise.resolve(false);
    }
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(recordId);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete ' + store)); };
        } catch (error) {
            reject(error);
        }
    });
}

async function getExistingIndexedDbNames() {
    if (!window.indexedDB || typeof window.indexedDB.databases !== 'function') return null;
    try {
        const databases = await window.indexedDB.databases();
        return new Set((databases || []).map(function (item) { return String(item && item.name || ''); }));
    } catch (_) {
        return null;
    }
}

function readExternalIndexedDbStore(dbName, storeName, existingNames) {
    if (!window.indexedDB) return Promise.resolve({ available: false, records: [] });
    if (existingNames && !existingNames.has(dbName)) {
        return Promise.resolve({ available: false, records: [] });
    }
    return new Promise(function (resolve) {
        let settled = false;
        let externalDb = null;
        const finish = function (result) {
            if (settled) return;
            settled = true;
            try { if (externalDb) externalDb.close(); } catch (_) {}
            resolve(result);
        };
        try {
            const request = window.indexedDB.open(dbName);
            request.onerror = function () { finish({ available: false, records: [] }); };
            request.onblocked = function () { finish({ available: false, records: [] }); };
            request.onsuccess = function () {
                externalDb = request.result;
                if (!externalDb.objectStoreNames.contains(storeName)) {
                    finish({ available: false, records: [] });
                    return;
                }
                try {
                    const tx = externalDb.transaction(storeName, 'readonly');
                    const getAll = tx.objectStore(storeName).getAll();
                    getAll.onsuccess = function () {
                        finish({ available: true, records: Array.isArray(getAll.result) ? getAll.result : [] });
                    };
                    getAll.onerror = function () { finish({ available: false, records: [] }); };
                } catch (_) {
                    finish({ available: false, records: [] });
                }
            };
        } catch (_) {
            finish({ available: false, records: [] });
        }
    });
}

function readFeatureLocalStorageArray(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

async function syncKnownFeatureDataToInDb() {
    if (!db) return false;
    if (featureDataSyncPromise) return featureDataSyncPromise;
    featureDataSyncPromise = (async function () {
        const existingNames = await getExistingIndexedDbNames();

        const scholarHistory = readFeatureLocalStorageArray('ss_viewer_scholar_ai_history');
        await replaceFeatureStoreRecordsInDb('scholar_ai', scholarHistory);

        const sspHistory = readFeatureLocalStorageArray('ss_viewer_ssp_img_history');
        await upsertFeatureStoreRecordsInDb('ssp_image_ai', sspHistory);

        const aiChat = await readExternalIndexedDbStore('md_viewer_ai_chat', 'conversations', existingNames);
        if (aiChat.available) {
            await replaceFeatureStoreRecordsInDb('ai_chat', aiChat.records);
        }

        const highlightRecords = await readExternalIndexedDbStore('MDProViewer_Ultimate_DB', 'records', existingNames);
        const highlightTags = await readExternalIndexedDbStore('MDProViewer_Ultimate_DB', 'tags', existingNames);
        if (highlightRecords.available || highlightTags.available) {
            const records = (highlightRecords.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'record:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'highlight'
                });
            });
            const tags = (highlightTags.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'tag:' + String(record && record.name || index + 1),
                    recordType: 'tag'
                });
            });
            await replaceFeatureStoreRecordsInDb('highlights', records.concat(tags));
        }

        const genSlides = await readExternalIndexedDbStore('GenSlideDB', 'autosave', existingNames);
        const genSlideImages = await readExternalIndexedDbStore('GenSlideDB', 'images', existingNames);
        if (genSlides.available || genSlideImages.available) {
            const slides = (genSlides.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'slides:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'slides'
                });
            });
            const images = (genSlideImages.records || []).map(function (record, index) {
                return Object.assign({}, record, {
                    id: 'image:' + String(record && record.id != null ? record.id : index + 1),
                    sourceId: record && record.id,
                    recordType: 'image'
                });
            });
            await upsertFeatureStoreRecordsInDb('genslides', slides.concat(images));
        }
        return true;
    })();
    try {
        return await featureDataSyncPromise;
    } finally {
        featureDataSyncPromise = null;
    }
}

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
    if (storeName === 'ai_chat') return String(rec.title || rec.id || '(AI chat)');
    if (storeName === 'scholar_ai') return String(rec.prompt || rec.title || rec.id || '(ScholarAI)');
    if (storeName === 'ssp_image_ai') return String(rec.prompt || rec.name || rec.id || '(sspimgAI image)');
    if (storeName === 'highlights') {
        if (rec.recordType === 'tag') return '#' + String(rec.name || rec.id || 'tag');
        return String(rec.title || rec.contentData || rec.content || rec.id || '(highlight)').replace(/\s+/g, ' ').slice(0, 100);
    }
    if (storeName === 'genslides') return String(rec.name || rec.title || rec.sourceId || rec.id || '(GenSlide)');
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
    if (storeName === 'ai_chat') {
        return 'id=' + String(rec.id || '') + ' | messages=' + (Array.isArray(rec.messages) ? rec.messages.length : 0);
    }
    if (storeName === 'scholar_ai') {
        return 'id=' + String(rec.id || '') + ' | result chars=' + String(rec.result || '').length;
    }
    if (storeName === 'ssp_image_ai') {
        return 'id=' + String(rec.id || '') + ' | image bytes≈' + Math.round(String(rec.dataURL || '').length * 0.75);
    }
    if (storeName === 'highlights') {
        return 'id=' + String(rec.id || '') + ' | type=' + String(rec.recordType || 'highlight');
    }
    if (storeName === 'genslides') {
        const count = Array.isArray(rec.slides) ? rec.slides.length : 0;
        const size = rec.blob && typeof rec.blob.size === 'number' ? rec.blob.size : 0;
        return 'id=' + String(rec.id || '') + ' | type=' + String(rec.recordType || 'slides')
            + (count ? ' | slides=' + count : '')
            + (size ? ' | bytes=' + size : '');
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

function sanitizeInDbZipSegment(value, fallback) {
    const cleaned = String(value == null ? '' : value)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^\.+|\.+$/g, '')
        .trim();
    return (cleaned || fallback || 'item').slice(0, 120);
}

function getInDbMimeExtension(mimeType) {
    const mime = String(mimeType || '').toLowerCase().split(';')[0];
    const extensions = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
        'image/avif': '.avif',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico',
        'image/tiff': '.tif',
        'application/pdf': '.pdf',
        'application/zip': '.zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'text/markdown': '.md',
        'text/html': '.html',
        'text/csv': '.csv',
        'application/json': '.json'
    };
    return extensions[mime] || '.bin';
}

function getInDbBlobExtension(blob, originalName) {
    const nameMatch = String(originalName || '').match(/\.([a-z0-9]{1,10})$/i);
    if (nameMatch) return '.' + nameMatch[1].toLowerCase();
    return getInDbMimeExtension(blob && blob.type);
}

function makeUniqueInDbZipPath(path, usedPaths) {
    const originalPath = String(path || 'file.bin');
    if (!usedPaths) return originalPath;
    let candidate = originalPath;
    let suffix = 2;
    const dotIndex = originalPath.lastIndexOf('.');
    const base = dotIndex > originalPath.lastIndexOf('/') ? originalPath.slice(0, dotIndex) : originalPath;
    const extension = dotIndex > originalPath.lastIndexOf('/') ? originalPath.slice(dotIndex) : '';
    while (usedPaths.has(candidate.toLocaleLowerCase())) {
        candidate = base + '-' + String(suffix) + extension;
        suffix += 1;
    }
    usedPaths.add(candidate.toLocaleLowerCase());
    return candidate;
}

function getInDbAttachmentPath(context, extension) {
    const safeKeyPath = context.keyPath.map(function (part) {
        return sanitizeInDbZipSegment(part, 'value');
    }).join('-');
    const baseFolder = String(context.attachmentBasePath || (
        'inDB/_attachments/'
        + sanitizeInDbZipSegment(context.storeName, 'store') + '/'
        + sanitizeInDbZipSegment(context.recordToken, 'record')
    )).replace(/\/+$/g, '');
    return makeUniqueInDbZipPath(
        baseFolder + '/' + (safeKeyPath || 'value') + String(extension || '.bin'),
        context.usedPaths
    );
}

function decodeInDbDataUrl(value) {
    const text = String(value || '');
    if (!/^data:/i.test(text)) return null;
    const commaIndex = text.indexOf(',');
    if (commaIndex < 5) return null;
    const header = text.slice(5, commaIndex);
    const payload = text.slice(commaIndex + 1);
    const parts = header.split(';').filter(Boolean);
    const mime = parts.length && parts[0].includes('/') ? parts.shift() : 'application/octet-stream';
    const isBase64 = parts.some(function (part) { return part.toLowerCase() === 'base64'; });
    try {
        if (isBase64) {
            const binary = atob(payload.replace(/\s+/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { bytes: bytes, mime: mime };
        }
        return {
            bytes: new TextEncoder().encode(decodeURIComponent(payload)),
            mime: mime
        };
    } catch (_) {
        return null;
    }
}

async function serializeInDbValueForZip(value, context) {
    if (typeof value === 'string') {
        const decodedDataUrl = decodeInDbDataUrl(value);
        if (decodedDataUrl) {
            const path = getInDbAttachmentPath(context, getInDbMimeExtension(decodedDataUrl.mime));
            context.zip.file(path, decodedDataUrl.bytes);
            context.attachments.push({
                store: context.storeName,
                record: context.recordToken,
                field: context.keyPath.join('.'),
                path: path,
                type: decodedDataUrl.mime,
                size: decodedDataUrl.bytes.byteLength
            });
            return {
                __indbType: 'DataURL',
                path: path,
                type: decodedDataUrl.mime,
                size: decodedDataUrl.bytes.byteLength
            };
        }
        return value;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'undefined') return { __indbType: 'Undefined' };
    if (typeof value === 'bigint') return { __indbType: 'BigInt', value: String(value) };
    if (value instanceof Date) return { __indbType: 'Date', value: value.toISOString() };

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
        const extension = getInDbBlobExtension(value, value.name || context.originalName);
        const path = getInDbAttachmentPath(context, extension);
        const bytes = new Uint8Array(await value.arrayBuffer());
        context.zip.file(path, bytes);
        context.attachments.push({
            store: context.storeName,
            record: context.recordToken,
            field: context.keyPath.join('.'),
            path: path,
            type: value.type || 'application/octet-stream',
            size: value.size
        });
        return {
            __indbType: 'Blob',
            path: path,
            type: value.type || 'application/octet-stream',
            size: value.size
        };
    }

    if (value instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))) {
        const bytes = value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const path = getInDbAttachmentPath(context, '.bin');
        context.zip.file(path, bytes);
        context.attachments.push({
            store: context.storeName,
            record: context.recordToken,
            field: context.keyPath.join('.'),
            path: path,
            type: 'application/octet-stream',
            size: bytes.byteLength
        });
        return {
            __indbType: 'Binary',
            path: path,
            size: bytes.byteLength
        };
    }

    if (typeof value !== 'object') return String(value);
    if (context.seen.has(value)) return { __indbType: 'CircularReference' };
    context.seen.add(value);

    let serialized;
    if (Array.isArray(value)) {
        serialized = [];
        for (let i = 0; i < value.length; i++) {
            serialized.push(await serializeInDbValueForZip(value[i], Object.assign({}, context, {
                keyPath: context.keyPath.concat(String(i))
            })));
        }
    } else {
        serialized = {};
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            serialized[key] = await serializeInDbValueForZip(value[key], Object.assign({}, context, {
                keyPath: context.keyPath.concat(key),
                originalName: key === 'blob' && value.name ? value.name : context.originalName
            }));
        }
    }
    context.seen.delete(value);
    return serialized;
}

function getInDbBackupFileName() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, '0'); };
    return 'mdviewer-indb-folders-'
        + now.getFullYear()
        + pad(now.getMonth() + 1)
        + pad(now.getDate())
        + '-'
        + pad(now.getHours())
        + pad(now.getMinutes())
        + pad(now.getSeconds())
        + '.zip';
}

function getInDbExportStoreFolderName(storeName, storeIndex) {
    return String(storeIndex + 1).padStart(2, '0')
        + '_'
        + sanitizeInDbZipSegment(storeName, 'store');
}

function getInDbExportRecordFolderName(storeName, record, recordIndex, usedNames) {
    const number = String(recordIndex + 1).padStart(3, '0');
    const primary = sanitizeInDbZipSegment(
        getInDbStatusPrimaryText(storeName, record),
        'record-' + String(recordIndex + 1)
    ).slice(0, 72);
    const id = sanitizeInDbZipSegment(
        record && record.id != null ? record.id : '',
        'id-' + String(recordIndex + 1)
    ).slice(0, 36);
    let name = number + '_' + primary;
    let collisionIndex = 2;
    while (usedNames.has(name.toLocaleLowerCase())) {
        name = number + '_' + primary + '_' + id
            + (collisionIndex > 2 ? '_' + String(collisionIndex) : '');
        collisionIndex += 1;
    }
    usedNames.add(name.toLocaleLowerCase());
    return name;
}

function getInDbConversationMarkdown(record) {
    const item = record || {};
    const lines = ['# ' + String(item.title || 'AI Chat'), ''];
    const messages = Array.isArray(item.messages) ? item.messages : [];
    messages.forEach(function (message) {
        const role = String(message && message.role || 'message');
        const heading = role === 'user' ? 'User' : (role === 'assistant' ? 'Assistant' : role);
        const content = message && typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message && message.content != null ? message.content : '', null, 2);
        lines.push('## ' + heading, '', content, '');
    });
    return lines.join('\n');
}

function addInDbReadableFilesToRecordFolder(zip, storeName, record, folderPath) {
    const item = record || {};
    if (storeName === 'documents') {
        zip.file(folderPath + '/document.md', String(item.content == null ? '' : item.content));
        return;
    }
    if (storeName === 'autosave' && typeof item.content === 'string') {
        zip.file(folderPath + '/autosave.md', item.content);
        return;
    }
    if (storeName === 'ai_chat') {
        zip.file(folderPath + '/conversation.md', getInDbConversationMarkdown(item));
        return;
    }
    if (storeName === 'scholar_ai') {
        if (item.prompt != null) zip.file(folderPath + '/prompt.txt', String(item.prompt));
        if (item.result != null) zip.file(folderPath + '/result.md', String(item.result));
        return;
    }
    if (storeName === 'ssp_image_ai' && item.prompt != null) {
        zip.file(folderPath + '/prompt.txt', String(item.prompt));
        return;
    }
    if (storeName === 'highlights') {
        const highlightText = item.contentData != null ? item.contentData : item.content;
        if (typeof highlightText === 'string' && highlightText) {
            zip.file(folderPath + '/highlight.txt', highlightText);
        }
        return;
    }
    if (storeName === 'genslides' && Array.isArray(item.slides)) {
        item.slides.forEach(function (slide, index) {
            if (!slide || typeof slide.html !== 'string') return;
            zip.file(
                folderPath + '/slides/slide-' + String(index + 1).padStart(3, '0') + '.html',
                slide.html
            );
        });
    }
}

async function downloadAllInDbAsZip() {
    if (!db) {
        showToast('inDB가 아직 준비되지 않았습니다.');
        return;
    }
    if (typeof JSZip === 'undefined') {
        showToast('ZIP 모듈을 불러오지 못했습니다.');
        return;
    }

    const button = document.getElementById('btn-download-all-indb');
    const originalLabel = button ? button.textContent : '';
    if (button) {
        button.disabled = true;
        button.textContent = '폴더 정리 중...';
    }

    try {
        await syncKnownFeatureDataToInDb();
        const zip = new JSZip();
        const stores = getInDbStatusStores();
        const attachments = [];
        const usedPaths = new Set();
        const manifest = {
            format: 'md-viewer-indb-backup',
            version: 2,
            exportedAt: new Date().toISOString(),
            databaseName: db.name || '',
            databaseVersion: db.version || null,
            rootFolder: 'inDB',
            stores: {},
            attachments: attachments
        };

        for (let storeIndex = 0; storeIndex < stores.length; storeIndex++) {
            const storeName = stores[storeIndex];
            const records = await readAllInDbStoreItems(storeName);
            const storeFolderName = getInDbExportStoreFolderName(storeName, storeIndex);
            const storeFolderPath = 'inDB/' + storeFolderName;
            const recordFolderNames = new Set();
            const storeManifest = {
                folder: storeFolderPath,
                recordCount: records.length,
                records: []
            };
            zip.folder(storeFolderPath);
            if (!records.length) {
                zip.file(storeFolderPath + '/_EMPTY.txt', storeName + ' 저장소에 레코드가 없습니다.\n');
            }

            for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
                const record = records[recordIndex];
                const recordToken = sanitizeInDbZipSegment(
                    record && record.id != null ? record.id : String(recordIndex + 1),
                    'record-' + String(recordIndex + 1)
                );
                const recordFolderName = getInDbExportRecordFolderName(
                    storeName,
                    record,
                    recordIndex,
                    recordFolderNames
                );
                const recordFolderPath = storeFolderPath + '/' + recordFolderName;
                const attachmentStartIndex = attachments.length;
                zip.folder(recordFolderPath);
                const serializedRecord = await serializeInDbValueForZip(record, {
                    zip: zip,
                    storeName: storeName,
                    recordToken: recordToken,
                    keyPath: [],
                    originalName: record && record.name ? record.name : '',
                    attachmentBasePath: recordFolderPath + '/files',
                    attachments: attachments,
                    seen: new WeakSet(),
                    usedPaths: usedPaths
                });
                zip.file(recordFolderPath + '/record.json', JSON.stringify(serializedRecord, null, 2));
                addInDbReadableFilesToRecordFolder(zip, storeName, record, recordFolderPath);
                storeManifest.records.push({
                    id: String(record && record.id != null ? record.id : ''),
                    title: getInDbStatusPrimaryText(storeName, record),
                    folder: recordFolderPath,
                    recordFile: recordFolderPath + '/record.json',
                    attachmentCount: attachments.length - attachmentStartIndex
                });
            }
            zip.file(
                storeFolderPath + '/_index.json',
                JSON.stringify(storeManifest, null, 2)
            );
            manifest.stores[storeName] = storeManifest;
        }

        zip.file('inDB/_manifest.json', JSON.stringify(manifest, null, 2));
        zip.file(
            'inDB/README.txt',
            'md-viewer inDB 전체 폴더 백업\n\n'
            + '- 각 번호 폴더는 inDB Status 화면의 저장소입니다.\n'
            + '- 각 저장소 안에는 화면에 보이는 레코드별 폴더가 있습니다.\n'
            + '- record.json: 해당 레코드의 전체 데이터\n'
            + '- files/: 해당 레코드에 포함된 이미지·Blob·Data URL·바이너리 원본\n'
            + '- document.md, conversation.md, result.md 등: 바로 읽을 수 있는 보조 파일\n'
            + '- _index.json: 저장소 내 레코드 목록\n'
            + '- _manifest.json: 전체 백업 정보\n\n'
            + '주의: ai_settings 폴더에는 저장된 API 키 등 민감한 설정이 포함될 수 있습니다.\n'
        );

        const backupBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        const url = URL.createObjectURL(backupBlob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getInDbBackupFileName();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

        const totalRecords = Object.keys(manifest.stores).reduce(function (sum, name) {
            return sum + manifest.stores[name].recordCount;
        }, 0);
        showToast('inDB 폴더형 전체 백업을 다운로드했습니다. (' + totalRecords + '개 레코드)');
    } catch (error) {
        console.error('Failed to download the full inDB backup:', error);
        showToast('inDB 전체 다운로드에 실패했습니다: ' + (error && error.message ? error.message : error));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalLabel || '전체 다운로드';
        }
    }
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
    // Keep inDB modal above settings modal when opened from Settings.
    modal.style.zIndex = '2147483646';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    try {
        const panel = modal.firstElementChild;
        if (panel && typeof panel.focus === 'function') {
            panel.setAttribute('tabindex', '-1');
            panel.focus();
        }
    } catch (_) {}
    try {
        await syncKnownFeatureDataToInDb();
    } catch (error) {
        console.warn('Feature data status sync failed:', error);
        showToast('일부 앱 데이터 동기화에 실패했습니다.');
    }
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
    const modal = document.getElementById('settings-modal');
    const modalVisible = !!(modal && !modal.classList.contains('hidden'));
    const check = document.getElementById('ai-use-checkbox');
    if (modalVisible && check) return !!check.checked;
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
        if (inner) {
            if (sch && !schOpen && sch.parentNode !== inner) inner.insertBefore(sch, inner.firstChild);
            if (ssp && !sspOpen && ssp.parentNode !== inner) inner.appendChild(ssp);
        }
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

function setScholarAISelectedTextFromExternal(text, options) {
    const opts = options || {};
    const value = String(text || '').trim();
    const applyText = function () {
        const selected = document.getElementById('scholar-ai-selected');
        if (selected && value) selected.value = value;
        try {
            if (window.SidebarAIInsertDeps && typeof window.SidebarAIInsertDeps.setSelectionState === 'function') {
                window.SidebarAIInsertDeps.setSelectionState({
                    selStart: null,
                    selEnd: null,
                    cursorPos: null,
                    lastSelectionTarget: null,
                    lastSelectionDoc: null
                });
            }
        } catch (_) {}
    };
    if (opts.forceOpen) {
        openScholarAIForExternalContext(applyText);
    } else if (document.getElementById('scholar-ai-selected')) {
        applyText();
    } else {
        withAiSidebarReady(applyText);
    }
}

function openScholarAIForExternalContext(afterOpen) {
    getAiSettings().then(function (s) {
        if (!s || !s.verified) {
            showToast('Verification is required first. Open Settings and complete verification.');
            return;
        }
        setAiSidebarWrapVisible(380, true);
        withAiSidebarReady(function () {
            var scholar = document.getElementById('scholar-ai-sidebar');
            if (!scholar) throw new Error('ScholarAI panel not found');
            if (!scholar.classList.contains('open') && typeof window.toggleScholarAI === 'function') window.toggleScholarAI();
            refreshAiRightSidebarWrap();
            if (typeof afterOpen === 'function') afterOpen();
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
window.enableTouchModalDrag = enableTouchModalDrag;
window.openScholarAIFromHeader = openScholarAIFromHeader;
window.openScholarAIForExternalContext = openScholarAIForExternalContext;
window.LiveAISetSelectedText = setScholarAISelectedTextFromExternal;
window.LiveAI = Object.assign(window.LiveAI || {}, {
    openScholarAI: function () { openScholarAIForExternalContext(); },
    setSelectedText: setScholarAISelectedTextFromExternal
});
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
let scholarAIProviderRuntime = null;
const SCHOLAR_AI_GEMINI_MODELS_KEY = 'ss_scholar_ai_gemini_models_v1';
const SCHOLAR_AI_LM_MODELS_KEY = 'ss_scholar_ai_lmstudio_models_v1';

function readStoredModelList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch (_) { return []; }
}

function saveStoredModelList(key, models) {
    const values = Array.from(new Set((Array.isArray(models) ? models : []).map(String).filter(Boolean)));
    localStorage.setItem(key, JSON.stringify(values));
    return values;
}

function setSettingsScholarAIStatus(message, isError) {
    const status = document.getElementById('settings-scholar-ai-provider-status');
    if (!status) return;
    status.textContent = message || '';
    status.className = 'text-xs min-h-[1.25rem] ' + (isError
        ? 'text-red-600 dark:text-red-400'
        : 'text-emerald-600 dark:text-emerald-400');
}

function readScholarAIProviderSettingsForm() {
    const value = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    return {
        baseUrl: value('settings-lmstudio-base-url'),
        apiKey: value('settings-lmstudio-api-key'),
        temperature: Number(value('settings-lmstudio-temperature') || 0.4),
        maxTokens: Number(value('settings-lmstudio-max-tokens') || 8192),
        quickMaxTokens: Number(value('settings-aichat-quick-max-tokens') || 4096),
        reasoningMaxTokens: Number(value('settings-aichat-reasoning-max-tokens') || 8192),
        reasoningLevel: value('settings-aichat-reasoning-level') || 'auto',
        timeoutMs: Number(value('settings-lmstudio-timeout') || 90) * 1000,
        topP: value('settings-lmstudio-top-p') === '' ? null : Number(value('settings-lmstudio-top-p'))
    };
}

function normalizeLMStudioLoadedModels(models) {
    return (Array.isArray(models) ? models : []).map(function (item) {
        if (typeof item === 'string') return { id: item, displayName: item };
        return {
            id: String((item && (item.id || item.key)) || '').trim(),
            displayName: String((item && (item.displayName || item.display_name || item.id || item.key)) || '').trim()
        };
    }).filter(function (item) { return !!item.id; });
}

function renderSettingsLMStudioLoadedModels(models, errorMessage) {
    const current = document.getElementById('settings-lmstudio-loaded-model');
    const detail = document.getElementById('settings-lmstudio-loaded-models-detail');
    const state = document.getElementById('settings-lmstudio-loaded-state');
    if (!current || !detail) return;
    const loaded = normalizeLMStudioLoadedModels(models);
    if (errorMessage) {
        current.textContent = 'LM Studio 연결 또는 로드 모델 확인 필요';
        current.className = 'mt-2 px-2 py-2 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-sm font-semibold text-red-700 dark:text-red-300 break-all';
        current.classList.remove('settings-connection-glow');
        detail.textContent = errorMessage;
        if (state) {
            state.textContent = '확인 필요';
            state.className = 'px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px]';
            state.classList.remove('settings-connection-glow');
        }
        const lmKeyInput = document.getElementById('settings-lmstudio-api-key');
        setCredentialConnectionVisual('settings-lmstudio-api-key', 'settings-lmstudio-api-key-feedback', lmKeyInput && lmKeyInput.value.trim() ? 'error' : 'neutral', lmKeyInput && lmKeyInput.value.trim() ? 'API Key 연결 확인 실패' : '선택 항목 · API Key 미사용');
        return;
    }
    current.className = 'mt-2 px-2 py-2 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 break-all';
    if (!loaded.length) {
        current.textContent = '현재 로드된 LLM 없음';
        current.classList.remove('settings-connection-glow');
        detail.textContent = 'LM Studio의 Developer → Local Server에서 모델을 Load한 뒤 다시 확인하세요.';
        if (state) {
            state.textContent = '로드 없음';
            state.className = 'px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px]';
            state.classList.remove('settings-connection-glow');
        }
        const lmKeyInput = document.getElementById('settings-lmstudio-api-key');
        setCredentialConnectionVisual('settings-lmstudio-api-key', 'settings-lmstudio-api-key-feedback', 'neutral', lmKeyInput && lmKeyInput.value.trim() ? 'API Key 저장됨 · 모델 연결 확인 필요' : '선택 항목 · API Key 미사용');
        return;
    }
    const primary = loaded[0];
    current.textContent = primary.displayName && primary.displayName !== primary.id
        ? primary.displayName + '  ·  ' + primary.id
        : primary.id;
    detail.textContent = loaded.length === 1
        ? '이 모델을 ScholarAI 요청에 자동으로 사용합니다.'
        : '로드된 LLM ' + loaded.length + '개: ' + loaded.map(function (item) { return item.id; }).join(', ') + ' · 첫 번째 모델을 자동으로 사용합니다.';
    if (state) {
        state.textContent = '로드됨 · 자동 사용';
        state.className = 'px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px]';
        state.classList.add('settings-connection-glow');
    }
    current.classList.add('settings-connection-glow');
    const lmKeyInput = document.getElementById('settings-lmstudio-api-key');
    setCredentialConnectionVisual(
        'settings-lmstudio-api-key',
        'settings-lmstudio-api-key-feedback',
        'connected',
        lmKeyInput && lmKeyInput.value.trim() ? '연결됨: LM Studio API Key 확인 완료' : '연결됨: LM Studio · API Key 미사용'
    );
}

function migrateLegacyScholarAIProviderSettings(legacySettings) {
    if (!window.LocalAI || localStorage.getItem(window.LocalAI.storageKey)) return;
    let legacy = legacySettings || {};
    try {
        const key = window.LocalAI.compatibility && window.LocalAI.compatibility.mdlive
            ? window.LocalAI.compatibility.mdlive.providerSettingsKey
            : 'mdpro_ai_provider_settings_v1';
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        legacy = Object.assign({}, stored || {}, legacy || {});
    } catch (_) {}
    const baseUrl = legacy.lmStudioBaseUrl || legacy.baseUrl;
    const model = legacy.lmStudioModel || legacy.model;
    if (!baseUrl && !model && legacy.lmStudioConfigured !== true) return;
    window.LocalAI.saveConfig({
        baseUrl: baseUrl,
        model: model,
        apiKey: legacy.lmStudioApiKey || '',
        temperature: legacy.lmStudioTemperature == null ? legacy.temperature : legacy.lmStudioTemperature,
        maxTokens: legacy.lmStudioMaxTokens == null ? legacy.maxTokens : legacy.lmStudioMaxTokens,
        timeoutMs: legacy.lmStudioTimeoutMs == null ? legacy.timeoutMs : legacy.lmStudioTimeoutMs,
        topP: legacy.lmStudioTopP == null ? legacy.topP : legacy.lmStudioTopP
    }, localStorage);
    if (model) saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, [model]);
}

function loadScholarAIProviderSettingsUI(legacySettings) {
    if (!window.LocalAI) return;
    migrateLegacyScholarAIProviderSettings(legacySettings);
    let config;
    try { config = window.LocalAI.loadConfig(localStorage); } catch (_) { config = window.LocalAI.defaults || {}; }
    const setValue = function (id, value) { const el = document.getElementById(id); if (el) el.value = value == null ? '' : value; };
    setValue('settings-lmstudio-base-url', config.baseUrl || 'http://127.0.0.1:5678/v1');
    setValue('settings-lmstudio-api-key', config.apiKey || '');
    setValue('settings-lmstudio-temperature', config.temperature == null ? 0.4 : config.temperature);
    setValue('settings-lmstudio-max-tokens', config.maxTokens || 8192);
    setValue('settings-aichat-quick-max-tokens', config.quickMaxTokens || 4096);
    setValue('settings-aichat-reasoning-max-tokens', config.reasoningMaxTokens || 8192);
    setValue('settings-aichat-reasoning-level', config.reasoningLevel || 'auto');
    setValue('settings-lmstudio-timeout', Math.max(1, Math.round((config.timeoutMs || 90000) / 1000)));
    setValue('settings-lmstudio-top-p', config.topP == null ? '' : config.topP);
    renderSettingsLMStudioLoadedModels(readStoredModelList(SCHOLAR_AI_LM_MODELS_KEY));
    setTimeout(function () { loadSettingsLMStudioModels({ silent: true }); }, 0);
}

function saveScholarAIProviderSettingsFromUI(showStatus) {
    try {
        const config = getScholarAIProviderRuntime().saveLMStudioConfig(readScholarAIProviderSettingsForm());
        setCredentialConnectionVisual(
            'settings-lmstudio-api-key',
            'settings-lmstudio-api-key-feedback',
            'neutral',
            config.apiKey ? 'API Key 저장됨 · 연결 확인 필요' : '선택 항목 · API Key 미사용'
        );
        if (showStatus) setSettingsScholarAIStatus('LM Studio 설정을 저장했습니다.', false);
        return config;
    } catch (error) {
        setSettingsScholarAIStatus('저장 실패: ' + (error && error.message ? error.message : error), true);
        return null;
    }
}

async function loadSettingsLMStudioModels(options) {
    options = options || {};
    const config = saveScholarAIProviderSettingsFromUI(false);
    if (!config) return;
    if (!options.silent) setSettingsScholarAIStatus('LM Studio에서 현재 로드된 모델을 확인하는 중...', false);
    try {
        const result = await getScholarAIProviderRuntime().syncLMStudioLoadedModel(config);
        const ids = result.models.map(function (item) { return item.id; }).filter(Boolean);
        saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, ids);
        renderSettingsLMStudioLoadedModels(result.models);
        if (!options.silent) setSettingsScholarAIStatus('현재 로드 모델 확인 완료: ' + result.model, false);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, []);
        renderSettingsLMStudioLoadedModels([], message);
        if (!options.silent) setSettingsScholarAIStatus('LM Studio 로드 모델 확인 실패: ' + message, true);
    }
}

async function testSettingsLMStudioConnection() {
    const config = saveScholarAIProviderSettingsFromUI(false);
    if (!config) return;
    setSettingsScholarAIStatus('LM Studio 연결을 확인하는 중...', false);
    const result = await getScholarAIProviderRuntime().testLMStudio(config);
    if (!result.ok) {
        setSettingsScholarAIStatus('LM Studio 연결 실패: ' + (result.error || '알 수 없는 오류'), true);
        return;
    }
    const ids = (result.models || []).map(function (item) { return item.id; }).filter(Boolean);
    saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, ids);
    renderSettingsLMStudioLoadedModels(result.models || []);
    setSettingsScholarAIStatus('LM Studio 연결 성공 · 현재 모델 ' + result.model + ' · ' + result.latencyMs + 'ms', false);
}

async function loadSettingsGeminiModels() {
    const keyInput = document.getElementById('ai-api-key');
    const key = keyInput && keyInput.value ? keyInput.value.trim() : '';
    setSettingsScholarAIStatus('Gemini 모델을 불러오는 중...', false);
    setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'checking', 'AI Studio 연결을 확인하는 중...');
    try {
        const models = await listAIStudioTextModels(key);
        saveStoredModelList(SCHOLAR_AI_GEMINI_MODELS_KEY, models);
        localStorage.setItem('ss_gemini_api_key', key);
        localStorage.setItem('ss_gemini_api_key_verified', credentialFingerprint(key));
        setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'connected', '연결됨: AI Studio · Gemini 모델 ' + models.length + '개 확인');
        setSettingsScholarAIStatus('Gemini 텍스트 모델 ' + models.length + '개를 불러왔습니다.', false);
    } catch (error) {
        localStorage.removeItem('ss_gemini_api_key_verified');
        setCredentialConnectionVisual('ai-api-key', 'ai-api-key-feedback', 'error', '연결 확인 실패: ' + (error && error.message ? error.message : error));
        setSettingsScholarAIStatus('Gemini 모델 조회 실패: ' + (error && error.message ? error.message : error), true);
    }
}

function updateLMStudioApiKeyConnectionUI() {
    const input = document.getElementById('settings-lmstudio-api-key');
    const value = String(input && input.value || '').trim();
    let saved = '';
    try { saved = String(window.LocalAI && window.LocalAI.loadConfig(localStorage).apiKey || '').trim(); } catch (_) {}
    const loaded = readStoredModelList(SCHOLAR_AI_LM_MODELS_KEY).length > 0;
    const connected = value === saved && loaded;
    setCredentialConnectionVisual(
        'settings-lmstudio-api-key',
        'settings-lmstudio-api-key-feedback',
        connected ? 'connected' : 'neutral',
        connected
            ? (value ? '연결됨: LM Studio API Key 확인 완료' : '연결됨: LM Studio · API Key 미사용')
            : (value ? '변경된 API Key를 저장하고 연결을 확인해 주세요.' : '선택 항목 · API Key 미사용')
    );
}

async function callAIStudioText(prompt, systemInstruction, useSearch, modelOverride, signal) {
    const key = localStorage.getItem('ss_gemini_api_key') || '';
    if (!key.trim()) throw new Error('AI Studio API Key가 없습니다. 설정에서 API Key를 저장하거나 LM Studio를 선택하세요.');
    const modelId = modelOverride || 'gemini-2.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + encodeURIComponent(key);
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (useSearch) payload.tools = [{ googleSearch: {} }];
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: signal
    });
    if (!res.ok) {
        let message = 'AI Studio API Error: ' + res.status;
        try {
            const errorData = await res.json();
            if (errorData && errorData.error && errorData.error.message) message = errorData.error.message;
        } catch (_) {}
        throw new Error(message);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(function (part) { return part.text || ''; }).join('') || '';
    if (!text) throw new Error('AI Studio 응답이 비어 있습니다.');
    return { provider: 'aistudio', model: modelId, text: text };
}

async function listAIStudioTextModels(apiKeyOverride) {
    const key = String(apiKeyOverride || localStorage.getItem('ss_gemini_api_key') || '');
    if (!key.trim()) throw new Error('AI Studio API Key가 없습니다. 설정에서 API Key를 먼저 저장하세요.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(key);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        let message = 'Gemini 모델 조회 오류: ' + res.status;
        try {
            const errorData = await res.json();
            if (errorData && errorData.error && errorData.error.message) message = errorData.error.message;
        } catch (_) {}
        throw new Error(message);
    }
    const data = await res.json();
    const filtered = (Array.isArray(data.models) ? data.models : []).filter(function (model) {
        const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
        const id = String(model.name || '').replace(/^models\//, '');
        return /^gemini-/i.test(id)
            && methods.indexOf('generateContent') >= 0
            && !/(embedding|image)/i.test(id);
    }).map(function (model) {
        return String(model.name || '').replace(/^models\//, '');
    }).filter(Boolean);
    return Array.from(new Set(SCHOLAR_AI_TEXT_MODELS_FALLBACK.concat(filtered))).sort();
}

function getScholarAIProviderRuntime() {
    if (scholarAIProviderRuntime) return scholarAIProviderRuntime;
    if (!window.ScholarAIProvider || typeof window.ScholarAIProvider.create !== 'function') {
        throw new Error('ScholarAI 공급자 모듈이 로드되지 않았습니다.');
    }
    scholarAIProviderRuntime = window.ScholarAIProvider.create({
        storage: localStorage,
        callAIStudio: callAIStudioText,
        callOllama: function (prompt, systemInstruction, useSearch, modelOverride, signal) {
            return callOllamaChatText([{ role: 'user', content: String(prompt || '') }], systemInstruction, modelOverride, signal);
        },
        callDeepseek: function (prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride, baseUrlOverride) {
            return callDeepseekChatText(
                [{ role: 'user', content: String(prompt || '') }],
                systemInstruction,
                modelOverride,
                signal,
                keyOverride,
                baseUrlOverride
            );
        }
    });
    return scholarAIProviderRuntime;
}

let aiChatAbortController = null;
const AI_CHAT_GEMINI_MODELS_KEY = 'ss_ai_chat_gemini_models_v1';
const AI_CHAT_DEEPSEEK_MODELS_KEY = 'ss_ai_chat_deepseek_models_v1';
const OLLAMA_MODELS_KEY = 'ss_ollama_models_v1';
const OLLAMA_BASE_URL_KEY = 'ss_ollama_base_url';
const AI_CHAT_GEMINI_DEFAULT_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-deep-research-pro-preview',
    'gemini-2.5-flash-tts',
    'gemini-2.5-pro-tts',
    'gemini-2.5-flash-native-audio-dialog',
    'gemini-3-flash-live',
    'gemini-3.5-live-translate',
    'lyria-3-clip',
    'lyria-3-pro',
    'veo-3-fast-generate',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image'
];
const AI_CHAT_DEEPSEEK_DEFAULT_MODELS = [
    'deepseek-v4-flash',
    'deepseek-v4-pro'
];
const SCHOLAR_AI_TEXT_MODELS_FALLBACK = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-deep-research-pro-preview',
    'gemini-2.5-flash-tts',
    'gemini-2.5-pro-tts',
    'gemini-2.5-flash-native-audio-dialog',
    'gemini-3-flash-live',
    'gemini-3.5-live-translate',
    'lyria-3-clip',
    'lyria-3-pro',
    'veo-3-fast-generate',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-exp'
];

function mergeAIChatGeminiModels(models) {
    return Array.from(new Set(AI_CHAT_GEMINI_DEFAULT_MODELS.concat(Array.isArray(models) ? models : []).filter(Boolean)));
}

function mergeAIChatDeepseekModels(models) {
    return Array.from(new Set(AI_CHAT_DEEPSEEK_DEFAULT_MODELS.concat(Array.isArray(models) ? models : []).filter(Boolean)));
}

function getOllamaSettings() {
    const fallback = 'http://127.0.0.1:11434';
    let storedBaseUrl = String(localStorage.getItem(OLLAMA_BASE_URL_KEY) || fallback).trim().replace(/\/+$/, '');
    try {
        const parsed = new URL(storedBaseUrl);
        const localHost = /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(parsed.hostname);
        if (localHost && parsed.port === '8080') storedBaseUrl = fallback;
    } catch (_) {}
    localStorage.removeItem('ss_ollama_connection_mode');
    return { baseUrl: storedBaseUrl };
}

function normalizeOllamaBaseUrl(value) {
    const fallback = 'http://127.0.0.1:11434';
    let parsed;
    try {
        parsed = new URL(String(value || '').trim() || fallback);
    } catch (_) {
        throw new Error('Ollama Base URL 형식이 올바르지 않습니다.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Base URL은 http:// 또는 https:// 주소여야 합니다.');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString()
        .replace(/\/+$/, '')
        .replace(/\/api\/(?:tags|chat)$/i, '')
        .replace(/\/api$/i, '');
}

async function requestLocalAIJson(url, options) {
    const request = options || {};
    if (window.web2electron && typeof window.web2electron.localAIRequest === 'function') {
        const result = await window.web2electron.localAIRequest({
            url: String(url),
            method: String(request.method || 'GET'),
            headers: request.headers || {},
            body: request.body || ''
        });
        if (!result || result.error) throw new Error(result && result.error ? result.error : '로컬 AI IPC 요청에 실패했습니다.');
        if (!result.ok) {
            const detail = result.data && (result.data.error || result.data.detail)
                ? ((result.data.error && result.data.error.message) || result.data.error || result.data.detail)
                : (result.text || '요청 실패');
            const error = new Error('HTTP ' + result.status + ': ' + String(detail));
            error.status = Number(result.status) || 0;
            throw error;
        }
        return result.data || {};
    }
    let response;
    try {
        response = await fetch(url, request);
    } catch (error) {
        throw new Error('로컬 AI 서버에 연결할 수 없습니다. 서버 실행과 CORS 설정을 확인하세요. (' + (error && error.message ? error.message : error) + ')');
    }
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
        const detail = data && (data.error || data.detail)
            ? ((data.error && data.error.message) || data.error || data.detail)
            : (response.statusText || '요청 실패');
        const error = new Error('HTTP ' + response.status + ': ' + String(detail));
        error.status = response.status;
        throw error;
    }
    return data;
}

async function requestLocalAITextStream(url, options, onChunk) {
    const request = options || {};
    const handleChunk = typeof onChunk === 'function' ? onChunk : function () {};
    if (window.web2electron && typeof window.web2electron.localAIStreamRequest === 'function') {
        const requestId = 'ollama-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const abortHandler = function () {
            if (window.web2electron && typeof window.web2electron.cancelLocalAIStream === 'function') {
                window.web2electron.cancelLocalAIStream(requestId);
            }
        };
        if (request.signal) {
            if (request.signal.aborted) {
                const abortError = new Error('Ollama request aborted');
                abortError.name = 'AbortError';
                throw abortError;
            }
            request.signal.addEventListener('abort', abortHandler, { once: true });
        }
        try {
            const result = await window.web2electron.localAIStreamRequest({
                requestId: requestId,
                url: String(url),
                body: request.body || ''
            }, function (event) {
                if (event && event.type === 'chunk' && event.content) handleChunk(String(event.content));
            });
            if (!result || !result.ok) {
                const error = new Error(result && result.error ? result.error : 'Ollama 스트림 IPC 요청에 실패했습니다.');
                if (result && result.aborted) error.name = 'AbortError';
                error.status = Number(result && result.status) || 0;
                throw error;
            }
            return;
        } finally {
            if (request.signal) request.signal.removeEventListener('abort', abortHandler);
        }
    }
    let response;
    try {
        response = await fetch(url, request);
    } catch (error) {
        throw new Error('Ollama 스트림에 연결할 수 없습니다. 서버 실행과 CORS 설정을 확인하세요. (' + (error && error.message ? error.message : error) + ')');
    }
    if (!response.ok) {
        const detail = await response.text();
        const error = new Error('HTTP ' + response.status + ': ' + (detail || response.statusText || '요청 실패'));
        error.status = response.status;
        throw error;
    }
    if (!response.body) throw new Error('Ollama 스트림 응답 본문이 없습니다.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        if (text) handleChunk(text);
    }
    const tail = decoder.decode();
    if (tail) handleChunk(tail);
}

async function listOllamaModels(settingsOverride) {
    const settings = Object.assign({}, getOllamaSettings(), settingsOverride || {});
    settings.baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
    const data = await requestLocalAIJson(settings.baseUrl + '/api/tags', {
        method: 'GET',
        headers: { Accept: 'application/json' }
    });

    const rows = Array.isArray(data.models) ? data.models : [];
    const models = rows.filter(function (item) {
        const capabilities = item && Array.isArray(item.capabilities) ? item.capabilities : null;
        return !capabilities || capabilities.indexOf('completion') >= 0;
    }).map(function (item) {
        return String(item && (item.id || item.model || item.name) || '').trim();
    }).filter(Boolean);
    if (!models.length) throw new Error('Ollama에서 사용 가능한 모델을 찾지 못했습니다.');
    return Array.from(new Set(models));
}

async function callOllamaChatText(messages, systemInstruction, modelOverride, signal, responseMode, onStreamEvent, settingsOverride) {
    const settings = Object.assign({}, getOllamaSettings(), settingsOverride || {});
    settings.baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
    const model = String(modelOverride || localStorage.getItem('ss_ai_chat_ollama_model') || localStorage.getItem('ss_scholar_ai_ollama_model') || '').trim();
    if (!model) throw new Error('Ollama 모델을 먼저 선택하세요.');
    const normalized = normalizeAIChatMessages(messages);
    const payloadMessages = [];
    if (systemInstruction) payloadMessages.push({ role: 'system', content: String(systemInstruction) });
    normalized.forEach(function (item) {
        payloadMessages.push({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') });
    });
    const emit = typeof onStreamEvent === 'function' ? onStreamEvent : function () {};
    const reasoningMode = responseMode === 'reasoning';
    const estimatedInputTokens = payloadMessages.reduce(function (sum, item) {
        return sum + estimateAIChatTokens(item.content);
    }, 0);
    emit({
        type: 'request.start',
        provider: 'ollama',
        estimated_input_tokens: estimatedInputTokens,
        reasoning: reasoningMode ? 'on' : 'off'
    });
    emit({ type: 'transport.start', provider: 'ollama' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' };
    const body = { model: model, messages: payloadMessages, stream: true, think: reasoningMode };
    let lineBuffer = '';
    let text = '';
    let reasoning = '';
    let lastData = null;
    let streamError = null;
    let chatStarted = false;
    let reasoningStarted = false;
    let reasoningEnded = false;
    let messageStarted = false;
    function processOllamaLine(line) {
        const trimmed = String(line || '').trim();
        if (!trimmed || streamError) return;
        let data;
        try {
            data = JSON.parse(trimmed);
        } catch (error) {
            streamError = new Error('Ollama 스트림 JSON을 해석하지 못했습니다.');
            return;
        }
        if (data.error) {
            streamError = new Error(String(data.error));
            return;
        }
        lastData = data;
        if (!chatStarted) {
            chatStarted = true;
            emit({ type: 'chat.start', provider: 'ollama' });
            emit({ type: 'prompt_processing.start', provider: 'ollama' });
            emit({ type: 'prompt_processing.end', provider: 'ollama' });
        }
        const thinkingDelta = String(data && data.message && data.message.thinking || '');
        const answerDelta = String(data && data.message && data.message.content || '');
        if (thinkingDelta) {
            if (!reasoningStarted) {
                reasoningStarted = true;
                emit({ type: 'reasoning.start', provider: 'ollama' });
            }
            reasoning += thinkingDelta;
            emit({ type: 'reasoning.delta', provider: 'ollama', content: thinkingDelta });
        }
        if (answerDelta) {
            if (reasoningStarted && !reasoningEnded) {
                reasoningEnded = true;
                emit({ type: 'reasoning.end', provider: 'ollama' });
            }
            if (!messageStarted) {
                messageStarted = true;
                emit({ type: 'message.start', provider: 'ollama' });
            }
            text += answerDelta;
            emit({ type: 'message.delta', provider: 'ollama', content: answerDelta });
        }
    }
    await requestLocalAITextStream(settings.baseUrl + '/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: signal
    }, function (chunk) {
        lineBuffer += chunk;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        lines.forEach(processOllamaLine);
    });
    if (lineBuffer.trim()) processOllamaLine(lineBuffer);
    if (streamError) throw streamError;
    if (reasoningStarted && !reasoningEnded) emit({ type: 'reasoning.end', provider: 'ollama' });
    if (messageStarted) emit({ type: 'message.end', provider: 'ollama' });
    const promptTokens = Math.max(0, Number(lastData && lastData.prompt_eval_count) || 0);
    const outputTokens = Math.max(0, Number(lastData && lastData.eval_count) || 0);
    const estimatedReasoningTokens = Math.max(0, estimateAIChatTokens(reasoning) - 24);
    const evalDurationSeconds = Math.max(0, Number(lastData && lastData.eval_duration) || 0) / 1000000000;
    const tokensPerSecond = evalDurationSeconds > 0 ? outputTokens / evalDurationSeconds : 0;
    emit({
        type: 'chat.end',
        provider: 'ollama',
        result: {
            stats: {
                total_output_tokens: outputTokens,
                reasoning_output_tokens: Math.min(outputTokens, estimatedReasoningTokens),
                tokens_per_second: tokensPerSecond
            }
        }
    });
    if (!text.trim()) throw new Error('Ollama 응답이 비어 있습니다.');
    return {
        provider: 'ollama',
        model: String(lastData && lastData.model || model),
        text: text,
        reasoning: reasoning,
        finishReason: String(lastData && lastData.done_reason || ''),
        usage: {
            prompt_tokens: promptTokens,
            completion_tokens: outputTokens,
            total_tokens: promptTokens + outputTokens
        },
        raw: lastData
    };
}

function updateOllamaSettingsModeUI() {
    const baseEl = document.getElementById('settings-ollama-base-url');
    if (baseEl) {
        const current = String(baseEl.value || '');
        if (!current || /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):8080(?:\/api)?\/?$/i.test(current)) {
            baseEl.value = 'http://127.0.0.1:11434';
        }
    }
}

function loadOllamaSettingsToUI() {
    const settings = getOllamaSettings();
    const baseEl = document.getElementById('settings-ollama-base-url');
    if (baseEl) baseEl.value = settings.baseUrl;
    updateOllamaSettingsModeUI();
}

function saveOllamaSettings(showStatus) {
    const baseEl = document.getElementById('settings-ollama-base-url');
    const baseUrl = normalizeOllamaBaseUrl(baseEl && baseEl.value);
    localStorage.setItem(OLLAMA_BASE_URL_KEY, baseUrl);
    localStorage.removeItem('ss_ollama_connection_mode');
    if (baseEl) baseEl.value = baseUrl;
    if (showStatus) {
        const statusEl = document.getElementById('settings-ollama-status');
        if (statusEl) statusEl.textContent = 'Ollama 연결 설정을 저장했습니다.';
        showToast('Ollama 설정을 저장했습니다.');
    }
    return { baseUrl: baseUrl };
}

async function loadSettingsOllamaModels() {
    const status = document.getElementById('settings-ollama-status');
    const state = document.getElementById('settings-ollama-loaded-state');
    const list = document.getElementById('settings-ollama-loaded-models');
    try {
        if (status) status.textContent = 'Ollama 모델을 확인하는 중...';
        const settings = saveOllamaSettings(false);
        const models = await listOllamaModels(settings);
        saveStoredModelList(OLLAMA_MODELS_KEY, models);
        if (!localStorage.getItem('ss_scholar_ai_ollama_model')) localStorage.setItem('ss_scholar_ai_ollama_model', models[0]);
        if (!localStorage.getItem('ss_ai_chat_ollama_model')) localStorage.setItem('ss_ai_chat_ollama_model', models[0]);
        if (state) {
            state.textContent = '연결됨 · ' + models.length + '개';
            state.className = 'px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px]';
        }
        if (list) list.textContent = models.join(' · ');
        if (status) status.textContent = 'Ollama 연결 완료: ' + models[0];
        return models;
    } catch (error) {
        const msg = error && error.message ? String(error.message) : String(error);
        if (state) {
            state.textContent = '연결 실패';
            state.className = 'px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px]';
        }
        if (list) list.textContent = msg;
        try {
            if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /cors|access-control-allow-origin/i.test(msg)) {
                if (status) status.textContent = '연결 실패: 네트워크 또는 CORS 문제일 가능성이 높습니다. 브라우저 개발자 도구의 Network 탭에서 요청 URL과 응답 헤더(특히 Access-Control-Allow-Origin)를 확인하세요.';
            } else {
                if (status) status.textContent = '연결 실패: ' + msg;
            }
        } catch (_) {
            if (status) status.textContent = '연결 실패: ' + msg;
        }
        throw error;
    }
}

function isAIChatGeminiImageModel(model) {
    return /(?:^|-)image(?:-|$)/i.test(String(model || ''));
}

async function getAIStudioKeyForChat() {
    let key = String(localStorage.getItem('ss_gemini_api_key') || '').trim();
    if (key) return key;
    try {
        const settings = await getAiSettings();
        key = String((settings && settings.apiKey) || '').trim();
        if (key) localStorage.setItem('ss_gemini_api_key', key);
    } catch (_) {}
    return key;
}

function normalizeAIChatMessages(messages) {
    return (Array.isArray(messages) ? messages : []).filter(function (message) {
        return message && (message.role === 'user' || message.role === 'assistant') && String(message.content || '').trim();
    }).map(function (message) {
        return { role: message.role, content: String(message.content) };
    });
}

function getAIChatLMContextLength(synced) {
    const models = synced && Array.isArray(synced.models) ? synced.models : [];
    const selected = models.find(function (item) { return item && item.id === synced.model; }) || models[0];
    const instances = selected && Array.isArray(selected.instances) ? selected.instances : [];
    return Math.max(0, Number(instances[0] && instances[0].contextLength) || 0);
}

function estimateAIChatTokens(value) {
    const text = String(value || '');
    let ascii = 0;
    let nonAscii = 0;
    for (const character of text) {
        if (character.charCodeAt(0) < 128) ascii += 1;
        else nonAscii += 1;
    }
    return Math.ceil(ascii / 4 + nonAscii / 1.5 + 24);
}

function getAIChatHistoryOutputReserve(contextLength, requestedOutputTokens, reasoningMode) {
    if (!contextLength) return requestedOutputTokens;
    const minimumUsefulOutput = reasoningMode ? 1024 : 768;
    const contextShare = Math.floor(contextLength * (reasoningMode ? 0.4 : 0.32));
    return Math.min(requestedOutputTokens, Math.max(minimumUsefulOutput, contextShare));
}

function clipAIChatHistoryMessage(message, tokenBudget) {
    const original = String(message && message.content || '').trim();
    const label = message && message.role === 'assistant' ? 'AI: ' : '사용자: ';
    if (!original || tokenBudget < 48) return null;
    if (estimateAIChatTokens(label + original) <= tokenBudget) {
        return { role: message.role, content: original };
    }
    const suffix = '\n\n[이전 메시지의 나머지 내용은 컨텍스트 한도에 맞춰 생략됨]';
    let low = 1;
    let high = original.length;
    let best = '';
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = original.slice(0, middle).trimEnd() + suffix;
        if (estimateAIChatTokens(label + candidate) <= tokenBudget) {
            best = candidate;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return best ? { role: message.role, content: best } : null;
}

function retainAIChatHistory(messages, tokenBudget) {
    if (!Number.isFinite(tokenBudget)) return messages.slice();
    if (tokenBudget < 96 || !messages.length) return [];
    const turns = [];
    let currentTurn = [];
    messages.forEach(function (message) {
        if (message.role === 'user') {
            if (currentTurn.length) turns.push(currentTurn);
            currentTurn = [message];
        } else if (currentTurn.length) {
            currentTurn.push(message);
        }
    });
    if (currentTurn.length) turns.push(currentTurn);

    const retainedTurns = [];
    let retainedTokens = 0;
    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex--) {
        const turn = turns[turnIndex];
        const turnTokens = turn.reduce(function (sum, message) {
            return sum + estimateAIChatTokens((message.role === 'assistant' ? 'AI' : '사용자') + ': ' + message.content);
        }, 0);
        if (retainedTokens + turnTokens <= tokenBudget) {
            retainedTurns.unshift(turn);
            retainedTokens += turnTokens;
            continue;
        }
        if (retainedTurns.length) break;

        // Even a long immediately preceding turn is more useful than losing all
        // conversational memory. Keep its question and as much of its answer as fits.
        const clippedTurn = [];
        let remaining = tokenBudget;
        for (let messageIndex = 0; messageIndex < turn.length && remaining >= 48; messageIndex++) {
            const messagesLeft = turn.length - messageIndex;
            const messageBudget = messagesLeft > 1
                ? Math.max(48, Math.floor(remaining / messagesLeft))
                : remaining;
            const clipped = clipAIChatHistoryMessage(turn[messageIndex], messageBudget);
            if (!clipped) continue;
            clippedTurn.push(clipped);
            remaining -= estimateAIChatTokens((clipped.role === 'assistant' ? 'AI' : '사용자') + ': ' + clipped.content);
        }
        if (clippedTurn.length) retainedTurns.unshift(clippedTurn);
        break;
    }
    return retainedTurns.reduce(function (all, turn) { return all.concat(turn); }, []);
}

async function listAIStudioChatModels(apiKeyOverride) {
    const key = String(apiKeyOverride || await getAIStudioKeyForChat() || '').trim();
    if (!key) throw new Error('AI Studio API Key가 없습니다. 설정에서 API Key를 먼저 저장하세요.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(key);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        let message = 'Gemini 모델 조회 오류: ' + res.status;
        try {
            const errorData = await res.json();
            if (errorData && errorData.error && errorData.error.message) message = errorData.error.message;
        } catch (_) {}
        throw new Error(message);
    }
    const data = await res.json();
    const models = (Array.isArray(data.models) ? data.models : []).filter(function (model) {
        const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
        const id = String(model.name || '').replace(/^models\//, '');
        return /^gemini-/i.test(id)
            && methods.indexOf('generateContent') >= 0
            && !/(embedding|image)/i.test(id);
    }).map(function (model) {
        return String(model.name || '').replace(/^models\//, '');
    }).filter(Boolean);
    return mergeAIChatGeminiModels(models);
}

async function createDeepseekApiError(response, fallbackLabel) {
    const status = response ? Number(response.status || 0) : 0;
    let providerMessage = '';
    try {
        const errorData = await response.json();
        if (errorData && errorData.error && errorData.error.message) {
            providerMessage = String(errorData.error.message);
        }
    } catch (_) {}

    let message = providerMessage || String(fallbackLabel || 'DeepSeek API 오류') + (status ? ': ' + status : '');
    let code = 'DEEPSEEK_API_ERROR';
    if (status === 401) {
        code = 'DEEPSEEK_AUTH_FAILED';
        message = 'DeepSeek 인증에 실패했습니다. 설정에 저장한 API 키를 확인하세요.';
    } else if (status === 402 || /insufficient balance/i.test(providerMessage)) {
        code = 'DEEPSEEK_INSUFFICIENT_BALANCE';
        message = 'DeepSeek API는 연결되었지만 잔액이 부족합니다. DeepSeek 잔액을 충전한 뒤 다시 시도하세요.';
    } else if (status === 422) {
        code = 'DEEPSEEK_INVALID_PARAMETERS';
        message = 'DeepSeek 요청 매개변수가 올바르지 않습니다. 선택한 모델과 요청 내용을 확인하세요.';
    } else if (status === 429) {
        code = 'DEEPSEEK_RATE_LIMIT';
        message = 'DeepSeek 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    } else if (status === 500 || status === 503) {
        code = 'DEEPSEEK_SERVER_BUSY';
        message = 'DeepSeek 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하세요.';
    }
    const error = new Error(message);
    error.name = 'DeepseekApiError';
    error.code = code;
    error.status = status;
    error.providerMessage = providerMessage;
    return error;
}

async function getDeepseekUserBalance(keyOverride, baseUrlOverride) {
    const state = getDeepseekApiState();
    const key = String(keyOverride || state.key || '').trim();
    if (!key) throw new Error('DeepSeek API Key가 없습니다.');
    const baseUrl = normalizeDeepseekBaseUrl(baseUrlOverride || state.baseUrl);
    let response;
    try {
        response = await fetch(baseUrl + '/user/balance', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        throw new Error('DeepSeek 잔액 서버에 연결할 수 없습니다. (' + (error && error.message ? error.message : error) + ')');
    }
    if (!response.ok) throw await createDeepseekApiError(response, 'DeepSeek 잔액 조회 오류');
    const data = await response.json();
    const infos = Array.isArray(data.balance_infos) ? data.balance_infos.map(function (item) {
        return {
            currency: String(item && item.currency || '').trim(),
            totalBalance: String(item && item.total_balance || '').trim(),
            grantedBalance: String(item && item.granted_balance || '').trim(),
            toppedUpBalance: String(item && item.topped_up_balance || '').trim()
        };
    }).filter(function (item) { return item.currency || item.totalBalance; }) : [];
    const summary = infos.map(function (item) {
        return [item.currency, item.totalBalance].filter(Boolean).join(' ');
    }).join(', ');
    return {
        isAvailable: data.is_available === true,
        infos: infos,
        summary: summary,
        raw: data
    };
}

async function listDeepseekChatModels(keyOverride, baseUrlOverride) {
    const state = getDeepseekApiState();
    const key = String(keyOverride || state.key || '').trim();
    const baseUrl = normalizeDeepseekBaseUrl(baseUrlOverride || state.baseUrl);
    if (!key) throw new Error('DeepSeek API Key가 없습니다. 앱 설정에서 키를 저장하세요.');
    const url = baseUrl + '/models';
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        throw new Error('DeepSeek 서버에 연결할 수 없습니다. 네트워크와 Base URL을 확인하세요. (' + (error && error.message ? error.message : error) + ')');
    }
    if (!response.ok) {
        throw await createDeepseekApiError(response, 'DeepSeek 모델 조회 오류');
    }
    const data = await response.json();
    const models = (Array.isArray(data.data) ? data.data : []).map(function (model) {
        return String((model && (model.id || model.model)) || '').trim();
    }).filter(Boolean);
    return mergeAIChatDeepseekModels(models);
}

function isDeepseekModel(model) {
    return String(model || '').indexOf('deepseek-') === 0;
}

function isAIChatDeepseekModel(model) {
    return isDeepseekModel(model);
}

function parseDeepseekTextFromResponse(data) {
    if (!data) return '';
    const choice = (Array.isArray(data.choices) ? data.choices[0] : null);
    if (!choice) return '';
    if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
    if (typeof choice.text === 'string') return choice.text;
    if (typeof choice.delta?.content === 'string') return choice.delta.content;
    if (typeof data.result === 'string') return data.result;
    return '';
}

async function callDeepseekChatText(
    messages,
    systemInstruction,
    modelOverride,
    signal,
    keyOverride,
    baseUrlOverride
) {
    const state = getDeepseekApiState();
    const key = String(keyOverride || state.key || '').trim();
    if (!key) throw new Error('DeepSeek API Key가 없습니다. 앱 설정에서 키를 저장하세요.');
    const baseUrl = normalizeDeepseekBaseUrl(baseUrlOverride || state.baseUrl);
    const normalizedModel = String(modelOverride || 'deepseek-v4-flash').trim();
    const normalized = normalizeAIChatMessages(messages);
    if (!normalized.length) throw new Error('전송할 대화가 없습니다.');
    const payloadMessages = [];
    if (systemInstruction) payloadMessages.push({ role: 'system', content: String(systemInstruction) });
    normalized.forEach(function (item) {
        const role = item.role === 'assistant' ? 'assistant' : 'user';
        payloadMessages.push({ role: role, content: String(item.content) });
    });
    if (!payloadMessages.length) throw new Error('전송할 대화가 없습니다.');

    const url = baseUrl + '/chat/completions';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            model: normalizedModel,
            messages: payloadMessages,
            stream: false
        }),
        signal: signal
    });

    if (!response.ok) {
        throw await createDeepseekApiError(response, 'DeepSeek 생성 오류');
    }
    const data = await response.json();
    const text = parseDeepseekTextFromResponse(data);
    if (!text) throw new Error('DeepSeek 응답이 비어 있습니다.');
    return {
        provider: 'deepseek',
        model: normalizedModel,
        text: text,
        usage: data.usage || null,
        finishReason: data.choices && data.choices[0] ? data.choices[0].finish_reason : '',
        raw: data
    };
}

async function callDeepseekText(prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride, baseUrlOverride) {
    return callDeepseekChatText([{ role: 'user', content: String(prompt || '') }], systemInstruction, modelOverride, signal, keyOverride, baseUrlOverride);
}

async function callAIStudioChat(messages, systemInstruction, modelOverride, signal, responseMode, academicSearch, academicEvidenceCount) {
    const key = await getAIStudioKeyForChat();
    if (!key) throw new Error('AI Studio API Key가 없습니다. 앱 설정에서 API Key를 먼저 저장하세요.');
    const model = String(modelOverride || 'gemini-2.5-flash').trim();
    const normalized = normalizeAIChatMessages(messages);
    while (normalized.length && normalized[0].role !== 'user') normalized.shift();
    const contents = [];
    normalized.forEach(function (message) {
        const role = message.role === 'assistant' ? 'model' : 'user';
        const previous = contents[contents.length - 1];
        if (previous && previous.role === role) {
            previous.parts[0].text += '\n\n' + message.content;
        } else {
            contents.push({ role: role, parts: [{ text: message.content }] });
        }
    });
    if (!contents.length) throw new Error('전송할 대화가 없습니다.');
    const reasoningMode = responseMode === 'reasoning';
    const imageModel = isAIChatGeminiImageModel(model);
    const generationConfig = imageModel
        ? { responseModalities: ['TEXT', 'IMAGE'] }
        : { maxOutputTokens: reasoningMode ? 8192 : (academicSearch ? (Number(academicEvidenceCount) > 20 ? 4096 : 3072) : 1024) };
    if (!imageModel && /^gemini-3/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingLevel: reasoningMode ? 'high' : 'low' };
    } else if (!imageModel && /^gemini-2\.5/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingBudget: reasoningMode ? 4096 : 0 };
    }
    const payload = { contents: contents, generationConfig: generationConfig };
    if (systemInstruction && !imageModel) payload.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: signal
    });
    if (!response.ok && response.status === 400 && imageModel) {
        payload.generationConfig = {};
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: signal
        });
    }
    if (!response.ok) {
        let message = 'AI Studio API Error: ' + response.status;
        try {
            const data = await response.json();
            if (data && data.error && data.error.message) message = data.error.message;
        } catch (_) {}
        throw new Error(message);
    }
    const data = await response.json();
    const candidate = data.candidates?.[0] || {};
    const parts = candidate.content?.parts || [];
    const reasoningParts = [];
    const answerParts = [];
    const images = [];
    parts.forEach(function (part) {
        const inlineData = part && (part.inlineData || part.inline_data);
        if (inlineData && inlineData.data) {
            images.push({
                mimeType: String(inlineData.mimeType || inlineData.mime_type || 'image/png'),
                data: String(inlineData.data)
            });
        }
        const value = part && part.text ? String(part.text) : '';
        if (!value) return;
        if (part.thought === true) reasoningParts.push(value);
        else answerParts.push(value);
    });
    const candidateReasoning = candidate.reasoning_content || candidate.reasoningContent || candidate.reasoning || '';
    if (candidateReasoning) reasoningParts.unshift(String(candidateReasoning));
    let text = answerParts.join('');
    let reasoning = reasoningParts.join('\n\n');
    const taggedReasoning = [];
    text = text.replace(/<think>([\s\S]*?)<\/think>/gi, function (_, value) {
        if (String(value || '').trim()) taggedReasoning.push(String(value).trim());
        return '';
    }).trim();
    if (taggedReasoning.length) reasoning = [reasoning].concat(taggedReasoning).filter(Boolean).join('\n\n');
    if (!text && !reasoning && !images.length) throw new Error('AI Studio 응답이 비어 있습니다.');
    if (!text && images.length) text = '요청한 이미지를 생성했습니다.';
    else if (!text) text = '모델이 추론 내용만 반환하고 최종 답변을 생성하지 못했습니다. 출력 토큰 설정을 확인하세요.';
    return { provider: 'aistudio', model: model, text: text, reasoning: reasoning, images: images, finishReason: candidate.finishReason || '' };
}

function insertAIChatTextIntoDocument(text, mode) {
    const value = String(text || '').trim();
    if (!value) throw new Error('문서에 삽입할 질문과 답변이 없습니다.');
    if (!editorTextarea) throw new Error('문서 편집기를 찾지 못했습니다.');
    if (!isEditMode) toggleMode('edit');
    const insertMode = ['replace', 'cursor', 'line-below', 'document-end'].includes(mode) ? mode : 'cursor';
    const raw = String(editorTextarea.value || '');
    const rawSelectionStart = Number(editorTextarea.selectionStart);
    const rawSelectionEnd = Number(editorTextarea.selectionEnd);
    let start = Math.max(0, Math.min(Number.isFinite(rawSelectionStart) ? rawSelectionStart : raw.length, raw.length));
    let end = Math.max(start, Math.min(Number.isFinite(rawSelectionEnd) ? rawSelectionEnd : start, raw.length));
    if (insertMode === 'cursor') {
        end = start;
    } else if (insertMode === 'line-below') {
        const lineEnd = raw.indexOf('\n', start);
        start = end = lineEnd >= 0 ? lineEnd : raw.length;
    } else if (insertMode === 'document-end') {
        start = end = raw.length;
    }
    const before = raw.slice(0, start);
    const after = raw.slice(end);
    let prefix = '';
    let suffix = '';
    if (insertMode === 'cursor') {
        prefix = before && !/\n\s*\n$/.test(before) ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
        suffix = after && !/^\s*\n/.test(after) ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    } else if (insertMode === 'line-below') {
        prefix = before && !before.endsWith('\n') ? '\n' : '';
        suffix = after && !after.startsWith('\n') ? '\n' : '';
    } else if (insertMode === 'document-end') {
        prefix = before && !/\n\s*\n$/.test(before) ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    }
    const insertion = prefix + value + suffix;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(start, end);
    const applied = document.execCommand('insertText', false, insertion);
    if (!applied) {
        editorTextarea.value = before + insertion + after;
        editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const caret = start + prefix.length + value.length;
    editorTextarea.setSelectionRange(caret, caret);
    currentMarkdown = String(editorTextarea.value || '');
    lastEditCaretPos = caret;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    return true;
}

function getAIChatGeneratedImageDataUrl(image) {
    if (!image || !image.data) throw new Error('생성 이미지 데이터가 없습니다.');
    const mimeType = String(image.mimeType || 'image/png');
    return 'data:' + mimeType + ';base64,' + String(image.data);
}

function getAIChatGeneratedImageFileName(image, index) {
    const mimeType = String(image && image.mimeType || 'image/png');
    const extension = mimeType.includes('jpeg') ? 'jpg' : ((mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png');
    return 'ai-chat-image-' + Date.now() + '-' + (Number(index) + 1) + '.' + extension;
}

async function saveAIChatGeneratedImageForDocument(image, index) {
    if (!db) throw new Error('내부 이미지 데이터베이스가 준비되지 않았습니다.');
    if (!window.ImageDB || typeof window.ImageDB.saveDataUrl !== 'function') {
        throw new Error('내부 이미지 저장 모듈이 준비되지 않았습니다.');
    }
    const saved = await window.ImageDB.saveDataUrl(db, getAIChatGeneratedImageDataUrl(image), {
        name: getAIChatGeneratedImageFileName(image, index)
    });
    if (!saved || !saved.url) throw new Error('내부 이미지 주소를 만들지 못했습니다.');
    return String(saved.url);
}

async function uploadAIChatGeneratedImageToImgbb(image, index) {
    getAIChatGeneratedImageDataUrl(image);
    const apiKey = String(getImgbbApiKey() || '').trim();
    if (!apiKey) throw new Error('imgBB API key가 없습니다. 설정의 이미지 업로드에서 API key를 저장해 주세요.');
    const form = new FormData();
    form.append('image', String(image && image.data || ''));
    form.append('name', getAIChatGeneratedImageFileName(image, index).replace(/\.[^.]+$/, ''));
    const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        body: form
    });
    let payload = {};
    try { payload = await response.json(); } catch (e) {}
    if (!response.ok || !payload || payload.success === false) {
        const detail = payload && payload.error && payload.error.message
            ? payload.error.message
            : 'HTTP ' + response.status;
        throw new Error('imgBB 업로드 실패: ' + detail);
    }
    const data = payload.data || {};
    const directUrl = String(data.url || (data.image && data.image.url) || data.display_url || '').trim();
    if (!/^https?:\/\//i.test(directUrl)) throw new Error('imgBB가 유효한 이미지 주소를 반환하지 않았습니다.');
    localStorage.setItem('ss_imgbb_api_key_verified', credentialFingerprint(apiKey));
    setCredentialConnectionVisual('ai-imgbb-api-key', 'ai-imgbb-feedback', 'connected', '연결됨: imgBB 업로드 확인 완료');
    return directUrl;
}

window.AIChatBridge = Object.freeze({
    getSelectedDocumentText: function () {
        if (!editorTextarea) return '';
        const raw = String(editorTextarea.value || '');
        const start = Math.max(0, Math.min(Number(editorTextarea.selectionStart) || 0, raw.length));
        const end = Math.max(start, Math.min(Number(editorTextarea.selectionEnd) || start, raw.length));
        return raw.slice(start, end);
    },
    getCachedGeminiModels: function () {
        return mergeAIChatGeminiModels(readStoredModelList(AI_CHAT_GEMINI_MODELS_KEY));
    },
    refreshGeminiModels: async function () {
        const models = await listAIStudioChatModels();
        saveStoredModelList(AI_CHAT_GEMINI_MODELS_KEY, models);
        return models;
    },
    getCachedOllamaModels: function () {
        return readStoredModelList(OLLAMA_MODELS_KEY);
    },
    refreshOllamaModels: async function () {
        const models = await listOllamaModels();
        saveStoredModelList(OLLAMA_MODELS_KEY, models);
        return models;
    },
    getCachedDeepseekModels: function () {
        return mergeAIChatDeepseekModels(readStoredModelList(AI_CHAT_DEEPSEEK_MODELS_KEY));
    },
    refreshDeepseekModels: async function () {
        const models = await listDeepseekChatModels();
        saveStoredModelList(AI_CHAT_DEEPSEEK_MODELS_KEY, models);
        return models;
    },
    refreshLMStudioModels: async function () {
        const result = await getScholarAIProviderRuntime().syncLMStudioLoadedModel();
        const models = result.models.map(function (item) { return item.id; }).filter(Boolean);
        saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, models);
        return { model: result.model, models: models, contextLength: getAIChatLMContextLength(result) };
    },
    insertIntoDocument: function (text, mode) {
        return insertAIChatTextIntoDocument(text, mode);
    },
    saveImageForDocument: function (image, index) {
        return saveAIChatGeneratedImageForDocument(image, index);
    },
    uploadImageToImgbb: function (image, index) {
        return uploadAIChatGeneratedImageToImgbb(image, index);
    },
    complete: async function (request) {
        request = request || {};
        if (aiChatAbortController) aiChatAbortController.abort();
        const controller = new AbortController();
        aiChatAbortController = controller;
        try {
            if (request.provider === 'aistudio') {
                return await callAIStudioChat(request.messages, request.systemInstruction, request.model, controller.signal, request.academicSearch ? 'quick' : request.mode, request.academicSearch, request.academicEvidenceCount);
            }
            if (request.provider === 'ollama') {
                const result = await callOllamaChatText(
                    request.messages,
                    request.systemInstruction,
                    request.model,
                    controller.signal,
                    request.mode,
                    typeof request.onStreamEvent === 'function' ? request.onStreamEvent : undefined
                );
                return {
                    provider: 'ollama',
                    model: result.model || request.model || '',
                    text: result.text || '',
                    reasoning: result.reasoning || '',
                    finishReason: result.finishReason || '',
                    usage: result.usage || null,
                    contextLength: null,
                    maxOutputTokens: null,
                    responseId: null
                };
            }
            if (request.provider === 'deepseek') {
                const result = await callDeepseekChatText(
                    request.messages,
                    request.systemInstruction,
                    request.model,
                    controller.signal
                );
                return {
                    provider: result.provider || 'deepseek',
                    model: result.model || request.model || 'deepseek-v4-flash',
                    text: result.text || '',
                    reasoning: result.reasoning || '',
                    finishReason: result.finishReason || result.raw?.choices?.[0]?.finish_reason || '',
                    usage: result.usage || null,
                    contextLength: null,
                    maxOutputTokens: null,
                    responseId: result.responseId || null
                };
            }
            const synced = await getScholarAIProviderRuntime().syncLMStudioLoadedModel();
            if (controller.signal.aborted) {
                const abortError = new Error('AI Chat request aborted');
                abortError.name = 'AbortError';
                throw abortError;
            }
            const config = getScholarAIProviderRuntime().getLMStudioConfig();
            const client = window.LocalAI.createClient(Object.assign({}, config, { model: synced.model }));
            const contextLength = getAIChatLMContextLength(synced);
            const messages = normalizeAIChatMessages(request.messages);
            const lastUserIndex = messages.map(function (message) { return message.role; }).lastIndexOf('user');
            if (lastUserIndex < 0) throw new Error('전송할 사용자 질문이 없습니다.');
            const reasoningMode = request.mode === 'reasoning' && request.academicSearch !== true;
            const continuationMode = request.continuation === true;
            const splitAcademicMode = request.splitAcademicResponse === true;
            const modeInstruction = request.academicSearch
                ? ''
                : continuationMode
                ? '이전 응답에서 아직 작성하지 않은 본문만 이어서 작성하세요. 질문·체크리스트·계획·작업 지시·모델의 생각·이미 작성한 문장은 출력하지 마세요.'
                : splitAcademicMode
                ? '학술 답변은 작은 컨텍스트에 맞춰 여러 파트로 나눕니다. 시스템 지시가 지정한 현재 파트만 충분히 상세하게 작성하고, 이전·다음 파트나 체크리스트·추론·계획은 출력하지 마세요. 완성된 한국어 문장으로 끝내세요.'
                : request.academicSearch
                ? (reasoningMode
                    ? '제공된 학술 초록 근거를 충분히 비교·검토하되 필수 항목을 먼저 모두 완결하고 남은 범위에서 상세화하세요. 문장 중간에서 끝내지 마세요.'
                    : '제공된 학술 초록 근거에서 핵심 주장, 같은 결과, 다른 결과를 간결하게 모두 완결하세요. 세부 내용보다 전체 항목의 완성을 우선하고 문장 중간에서 끝내지 마세요.')
                : (reasoningMode
                    ? '설정된 추론 강도로 충분히 검토한 뒤 완성도 높은 최종 답변을 작성하세요. 사용자가 요청한 모든 항목·코드·설명을 누락하지 말고, 내부 계획이나 추론은 최종 답변에 섞지 마세요.'
                    : '핵심부터 바로 답하되 사용자가 요청한 코드, 설명, 형식과 분량을 완전하게 충족하세요. 인위적인 문장 수 제한을 두지 마세요.');
            const configuredMaxTokens = Math.max(1, Number(config.maxTokens) || 8192);
            const quickMaxTokens = Math.max(1, Number(config.quickMaxTokens) || 4096);
            const reasoningMaxTokens = Math.max(1, Number(config.reasoningMaxTokens) || 8192);
            const configuredReasoning = String(config.reasoningLevel || 'auto').toLowerCase();
            const academicMaxTokens = Math.min(Number(request.academicEvidenceCount) > 20 ? 4096 : 3072, configuredMaxTokens);
            const requestedOutputTokens = splitAcademicMode
                ? Math.min(2200, configuredMaxTokens)
                : continuationMode
                ? configuredMaxTokens
                : request.academicSearch
                ? academicMaxTokens
                : Math.min(reasoningMode ? reasoningMaxTokens : quickMaxTokens, configuredMaxTokens);
            const baseSystemPrompt = [request.systemInstruction || '', modeInstruction].filter(Boolean).join('\n\n');
            const fixedInputTokens = estimateAIChatTokens(baseSystemPrompt) + estimateAIChatTokens(messages[lastUserIndex].content);
            const historyOutputReserve = getAIChatHistoryOutputReserve(contextLength, requestedOutputTokens, reasoningMode);
            const historyTokenBudget = contextLength
                ? Math.max(0, contextLength - fixedInputTokens - historyOutputReserve - 256)
                : Number.POSITIVE_INFINITY;
            const historyCandidates = request.academicSearch ? [] : messages.slice(0, lastUserIndex);
            const historyMessages = retainAIChatHistory(historyCandidates, historyTokenBudget);
            const history = historyMessages.map(function (message) {
                return (message.role === 'assistant' ? 'AI' : '사용자') + ': ' + message.content;
            }).join('\n\n');
            const retainedHistoryTokens = history ? estimateAIChatTokens(history) : 0;
            const systemPrompt = [baseSystemPrompt, history ? '이전 대화:\n' + history : ''].filter(Boolean).join('\n\n');
            const estimatedInputTokens = estimateAIChatTokens(systemPrompt) + estimateAIChatTokens(messages[lastUserIndex].content);
            const contextOutputBudget = contextLength
                ? Math.max(1, contextLength - estimatedInputTokens - 256)
                : configuredMaxTokens;
            const normalOutputBudget = Math.max(1, Math.min(configuredMaxTokens, contextOutputBudget));
            const requestMaxTokens = splitAcademicMode
                ? Math.min(2200, normalOutputBudget)
                : continuationMode
                ? normalOutputBudget
                : reasoningMode
                ? (request.academicSearch
                    ? Math.min(academicMaxTokens, normalOutputBudget)
                    : Math.min(reasoningMaxTokens, normalOutputBudget))
                : (request.academicSearch ? Math.min(academicMaxTokens, normalOutputBudget) : Math.min(quickMaxTokens, normalOutputBudget));
            const streamEventHandler = typeof request.onStreamEvent === 'function'
                ? request.onStreamEvent
                : null;
            if (streamEventHandler) {
                streamEventHandler({
                    type: 'request.start',
                    context_length: contextLength || null,
                    max_output_tokens: requestMaxTokens,
                    estimated_input_tokens: estimatedInputTokens,
                    retained_history_tokens: retainedHistoryTokens,
                    reasoning: request.academicSearch || continuationMode || splitAcademicMode
                        ? 'off'
                        : (reasoningMode ? configuredReasoning : 'off')
                });
            }
            const chatOptions = {
                input: messages[lastUserIndex].content,
                systemInstruction: systemPrompt,
                model: synced.model,
                reasoning: request.academicSearch || continuationMode || splitAcademicMode
                    ? 'off'
                    : (reasoningMode ? (configuredReasoning === 'auto' ? undefined : configuredReasoning) : 'off'),
                contextLength: contextLength || undefined,
                maxTokens: requestMaxTokens,
                timeoutMs: continuationMode
                    ? Math.max(
                        600000,
                        Number(config.timeoutMs) || 0,
                        Math.ceil((requestMaxTokens / 8) * 1000 + 120000)
                    )
                    : reasoningMode
                    ? Math.max(300000, Number(config.timeoutMs) || 0)
                    : (request.academicSearch ? Math.max(240000, Number(config.timeoutMs) || 0) : Math.min(60000, Number(config.timeoutMs) || 60000)),
                store: splitAcademicMode ? false : (request.retainForContinuation === true || request.academicSearch === true || continuationMode),
                previousResponseId: request.previousResponseId || undefined,
                signal: controller.signal,
                onEvent: streamEventHandler || undefined
            };
            const result = streamEventHandler && typeof client.chatStream === 'function'
                ? await client.chatStream(chatOptions)
                : await client.chat(chatOptions);
            return {
                provider: 'lmstudio',
                model: result.model || synced.model,
                text: result.text || '',
                reasoning: result.reasoning || '',
                finishReason: result.finishReason || '',
                usage: result.usage || null,
                contextLength: contextLength || null,
                maxOutputTokens: requestMaxTokens,
                responseId: result.responseId || null
            };
        } finally {
            if (aiChatAbortController === controller) aiChatAbortController = null;
        }
    },
    abort: function () {
        if (aiChatAbortController) aiChatAbortController.abort();
    }
});

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
            // Kept for portable/older sidebar builds that still request Gemini directly.
            callGemini: async function (prompt, systemInstruction, useSearch, modelOverride) {
                const ctrl = new AbortController();
                window._abortController = ctrl;
                try {
                    return await callAIStudioText(prompt, systemInstruction, useSearch, modelOverride, ctrl.signal);
                } finally {
                    if (window._abortController === ctrl) window._abortController = null;
                }
            },
            callScholarAI: function (prompt, systemInstruction, useSearch, modelOverride) {
                return getScholarAIProviderRuntime().complete({
                    prompt: prompt,
                    systemInstruction: systemInstruction,
                    useSearch: useSearch,
                    model: modelOverride
                });
            },
            listScholarAIGeminiModels: function () { return listAIStudioTextModels(); },
            listScholarAIOllamaModels: function () { return listOllamaModels(); },
            listDeepseekModels: function () { return listDeepseekChatModels(); },
            getCachedScholarAIGeminiModels: function () { return readStoredModelList(SCHOLAR_AI_GEMINI_MODELS_KEY); },
            getCachedScholarAIOllamaModels: function () { return readStoredModelList(OLLAMA_MODELS_KEY); },
            getCachedScholarAIDeepseekModels: function () { return readStoredModelList(AI_CHAT_DEEPSEEK_MODELS_KEY); },
            getCachedScholarAILMStudioModels: function () { return readStoredModelList(SCHOLAR_AI_LM_MODELS_KEY); },
            refreshScholarAILMStudioModels: async function () {
                const result = await getScholarAIProviderRuntime().syncLMStudioLoadedModel();
                const ids = result.models.map(function (item) { return item.id; }).filter(Boolean);
                saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, ids);
                return ids;
            },
            refreshOllamaModels: async function () {
                const models = await listOllamaModels();
                saveStoredModelList(OLLAMA_MODELS_KEY, models);
                return models;
            },
            refreshDeepseekModels: async function () {
                const models = await listDeepseekChatModels();
                saveStoredModelList(AI_CHAT_DEEPSEEK_MODELS_KEY, models);
                return models;
            },
            setScholarAIDeepseekConfig: function (config) { return getScholarAIProviderRuntime().setDeepSeekConfig(config); },
            getScholarAIDeepseekConfig: function () { return getScholarAIProviderRuntime().getDeepSeekConfig(); },
            getScholarAIProvider: function () { return getScholarAIProviderRuntime().getProvider(); },
            setScholarAIProvider: function (provider) { return getScholarAIProviderRuntime().setProvider(provider); },
            getScholarAILMStudioConfig: function () { return getScholarAIProviderRuntime().getLMStudioConfig(); },
            saveScholarAILMStudioConfig: function (config) { return getScholarAIProviderRuntime().saveLMStudioConfig(config); },
            listScholarAILMStudioModels: function (config) { return getScholarAIProviderRuntime().listLMStudioModels(config); },
            testScholarAILMStudio: function (config) { return getScholarAIProviderRuntime().testLMStudio(config); },
            /**
             */
            generateImage: async function (prompt, options) {
                const key = localStorage.getItem('ss_gemini_api_key') || '';
                if (!key || !String(key).trim()) throw new Error('API key is missing. Save your Gemini API key in Settings.');
                const ctrl = new AbortController();
                window._abortController = ctrl;
                try {
                let modelId = (options && options.modelId) || 'gemini-3.1-flash-image';
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
            getScholarAIModelId: function (provider) { return getScholarAIProviderRuntime().getModel(provider); },
            setScholarAIModelId: function (id, provider) { return getScholarAIProviderRuntime().setModel(id, provider); },
            getImageModelId: function () {
                const saved = localStorage.getItem('ss_image_model') || 'gemini-3.1-flash-image';
                if (saved === 'gemini-3.1-flash-image-preview') return 'gemini-3.1-flash-image';
                if (saved === 'gemini-3-pro-image-preview') return 'gemini-3-pro-image';
                return saved;
            },
            abortCurrentTask: function () {
                if (scholarAIProviderRuntime) scholarAIProviderRuntime.abort();
                if (window._abortController) window._abortController.abort();
            },
            setViewerContent: function (text) { if (typeof updateContent === 'function') updateContent(text || ''); },
            getViewerRenderedContent: function (text) {
                var t = text || '';
                try {
                    var prepared = preprocessMarkdownForView(t);
                    if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.renderMarkdownSafeSync === 'function') {
                        return MathRender.renderMarkdownSafeSync(
                            (typeof marked !== 'undefined' && marked.parse) ? marked : null,
                            prepared,
                            { fallbackText: t }
                        );
                    }
                    if (typeof marked !== 'undefined' && marked.parse) {
                        return marked.parse(prepared);
                    }
                } catch (e) {
                    return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                }
                return t.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }
        }
    };
    const script = document.createElement('script');
    const base = getDocumentBaseUrl();
    const aiSidebarScriptVersion = '20260725-stable-math-1';
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
    if (window.GithubDataSettings && typeof window.GithubDataSettings.ensureUiReady === 'function') {
        await window.GithubDataSettings.ensureUiReady();
    }
    const settings = await getAiSettings();
    loadOllamaSettingsToUI();
    const googleCalendarEnabled = settings && typeof settings.googleCalendarEnabled === 'boolean'
        ? settings.googleCalendarEnabled
        : getGoogleCalendarEnabledFromLocal();
    setGoogleCalendarEnabledToLocal(googleCalendarEnabled);
    const googleCalendarCheck = document.getElementById('google-calendar-enabled');
    if (googleCalendarCheck) googleCalendarCheck.checked = googleCalendarEnabled;
    applyGoogleCalendarVisibility(googleCalendarEnabled);
    loadScholarAIProviderSettingsUI(settings);
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
        const fmaViewerCheckEmpty = document.getElementById('fma-viewer-visible');
        if (fmaViewerCheckEmpty) fmaViewerCheckEmpty.checked = false;
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
        const sqliteEnabledEmpty = document.getElementById('sqlite-enabled');
        if (sqliteEnabledEmpty) sqliteEnabledEmpty.checked = false;
        const githubEnabledEmpty = document.getElementById('ai-github-enabled');
        if (githubEnabledEmpty) githubEnabledEmpty.checked = false;
        const githubTokenEmpty = document.getElementById('github-token-input');
        if (githubTokenEmpty) githubTokenEmpty.value = '';
        const githubRepoEmpty = document.getElementById('github-repo-input');
        if (githubRepoEmpty) githubRepoEmpty.value = '';
        const githubBranchEmpty = document.getElementById('github-branch-input');
        if (githubBranchEmpty) githubBranchEmpty.value = 'main';
        const githubDefaultPushPathEmpty = document.getElementById('github-default-push-path-input');
        if (githubDefaultPushPathEmpty) githubDefaultPushPathEmpty.value = '';
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
        applyToDocsVisibility({ googleDocsUseEnabled: false, toDocsVisible: false, docSyncVisible: false });
        applySitesVisibility({ sitesVisible: false });
        applyMacroVisibility({ macroVisible: false });
        applyTemplateVisibility({ templateVisible: false });
        applyHtml2pptVisibility({ html2pptVisible: false });
        applyFmaViewerVisibility({ fmaViewerVisible: false });
        applyAiUseFold(getAiUseFoldedFromLocal());
        applyShareSettingsFold(getShareSettingsFoldedFromLocal());
        applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
        applyEditToolsVisibilityByMode();
        await applyGithubUiState({
            githubEnabled: false,
            githubToken: '',
            githubRepo: '',
            githubBranch: 'main',
            githubDefaultPushPath: '',
            githubCacheDocs: []
        });
        return;
    }
    const apiInput = document.getElementById('ai-api-key');
    if (apiInput && settings.apiKey) apiInput.value = settings.apiKey;
    if (settings.apiKey) localStorage.setItem('ss_gemini_api_key', settings.apiKey);
    if (settings.imgbbApiKey) localStorage.setItem('ss_imgbb_api_key', settings.imgbbApiKey);
    else localStorage.removeItem('ss_imgbb_api_key');
    const deepseekInput = document.getElementById('deepseek-api-key');
    const deepseekBaseInput = document.getElementById('deepseek-base-url');
    const deepseekState = getDeepseekApiState();
    if (deepseekInput) deepseekInput.value = settings.deepseekApiKey || deepseekState.key || '';
    if (deepseekBaseInput) deepseekBaseInput.value = settings.deepseekBaseUrl || deepseekState.baseUrl || 'https://api.deepseek.com';
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
    const fmaViewerCheck = document.getElementById('fma-viewer-visible');
    if (fmaViewerCheck) fmaViewerCheck.checked = settings.fmaViewerVisible === true;
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
    const sqliteEnabledCheck = document.getElementById('sqlite-enabled');
    if (sqliteEnabledCheck) sqliteEnabledCheck.checked = settings.sqliteEnabled === true;
    if (window.GoogleDocs && typeof window.GoogleDocs.loadGoogleDocsSettingsUI === 'function') {
        window.GoogleDocs.loadGoogleDocsSettingsUI(settings);
    }
    syncImgbbApiKeyInputs(settings.imgbbApiKey || '');
    if (typeof validateApiKeyInputUI === 'function') validateApiKeyInputUI();
    if (typeof validateDeepseekApiKeyInputUI === 'function') validateDeepseekApiKeyInputUI();
    if (typeof validateDeepseekBaseUrlInputUI === 'function') validateDeepseekBaseUrlInputUI();
    if (settings.apiKey && isValidGoogleAiApiKey(settings.apiKey)
        && localStorage.getItem('ss_gemini_api_key_verified') !== credentialFingerprint(settings.apiKey)) {
        verifyAIStudioApiKeyConnection(settings.apiKey).catch(function () {});
    }
    const deepseekKey = settings.deepseekApiKey || getDeepseekApiState().key;
    const deepseekBase = settings.deepseekBaseUrl || getDeepseekApiState().baseUrl;
    if (deepseekKey && isValidDeepseekAiKey(deepseekKey)
        && localStorage.getItem('ss_deepseek_api_key_verified') !== getDeepseekVerifiedToken(deepseekKey, deepseekBase)) {
        verifyDeepseekApiKeyConnection(deepseekKey, deepseekBase).catch(function () {});
    }
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
            fb.textContent = '연결됨: AI 기능 인증 완료';
            fb.className = 'text-xs text-emerald-700 dark:text-emerald-400 min-h-[1.25rem]';
            setCredentialConnectionVisual('ai-password-input', 'ai-password-feedback', 'connected');
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
    const githubPullMaxEl = document.getElementById('github-pull-max-files-input');
    const githubDefaultPushPathEl = document.getElementById('github-default-push-path-input');
    if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
    if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
    if (githubEl) githubEl.checked = !!settings.githubEnabled;
    if (githubTokenEl) githubTokenEl.value = settings.githubToken || '';
    if (githubRepoEl) githubRepoEl.value = settings.githubRepo || '';
    if (githubBranchEl) githubBranchEl.value = settings.githubBranch || 'main';
    if (githubDefaultPushPathEl) githubDefaultPushPathEl.value = settings.githubDefaultPushPath || '';
    if (githubPullMaxEl) {
        const rawMax = Number(settings.githubPullMaxFiles);
        const maxFiles = Number.isFinite(rawMax) ? Math.max(1, Math.min(10000, Math.floor(rawMax))) : 10000;
        githubPullMaxEl.value = String(maxFiles);
    }
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
    applyFmaViewerVisibility(settings);
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    applyEditToolsVisibilityByMode();
    await applyGithubUiState(settings);
}

async function initAiVisibility() {
    if (window.GithubDataSettings && typeof window.GithubDataSettings.ensureUiReady === 'function') {
        await window.GithubDataSettings.ensureUiReady();
    }
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
    applyFmaViewerVisibility(settings || { fmaViewerVisible: false });
    applyEditToolsVisibilityByMode();
    await applyGithubUiState(settings || { githubEnabled: false, githubCacheDocs: [] });
    await applyAiFeatureVisibility();
}

function openSettingsModal() {
    ensureInDbStatusUi();
    document.getElementById('settings-modal').classList.remove('hidden');
    const settingsBody = document.getElementById('settings-modal-body');
    if (settingsBody) settingsBody.scrollTop = 0;
    bindSettingsModalDrag();
    bindSettingsModalResize();
    applySettingsModalCompactUI();
    applySettingsModalFullscreenUI();
    updateSettingsModalResponsiveLayout();
    applySettingsShortcutsFold(getSettingsShortcutsFoldedFromLocal());
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    loadAiSettingsToUI();
    if (typeof window.ensureShareUiReady === 'function') {
        Promise.resolve(window.ensureShareUiReady()).then(function () {
            return loadAiSettingsToUI();
        }).catch(function () {});
    }
    if (typeof window.ensureSitesShowUiReady === 'function') {
        Promise.resolve(window.ensureSitesShowUiReady()).then(function () {
            return loadAiSettingsToUI();
        }).catch(function () {});
    }
}

function focusGoogleCalendarSettings() {
    const settingsBody = document.getElementById('settings-modal-body');
    const card = document.getElementById('google-calendar-settings-card');
    if (settingsBody) settingsBody.scrollTop = 0;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('ring-4', 'ring-indigo-300', 'dark:ring-indigo-700');
    void card.offsetWidth;
    card.classList.add('ring-4', 'ring-indigo-300', 'dark:ring-indigo-700');
    setTimeout(function () {
        card.classList.remove('ring-4', 'ring-indigo-300', 'dark:ring-indigo-700');
    }, 1400);
}
function applySettingsModalCompactUI() {
    const panel = document.getElementById('settings-modal-panel');
    const btn = document.getElementById('settings-modal-drag-handle');
    if (!panel) return;
    if (settingsModalFullscreen) {
        if (btn) btn.textContent = '\uCD95\uC18C';
        return;
    }
    if (settingsModalCompact) {
        panel.style.position = 'fixed';
        panel.style.left = 'auto';
        panel.style.top = '56px';
        panel.style.right = '12px';
        panel.style.margin = '0';
        panel.style.width = '360px';
        panel.style.height = '';
        panel.style.maxWidth = '92vw';
        panel.style.maxHeight = '68vh';
        if (btn) btn.textContent = '\uBCF5\uC6D0';
    } else {
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.margin = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.maxWidth = '';
        panel.style.maxHeight = '90vh';
        if (btn) btn.textContent = '\uCD95\uC18C';
    }
}
function toggleSettingsModalCompact() {
    if (settingsModalFullscreen) return;
    settingsModalCompact = !settingsModalCompact;
    applySettingsModalCompactUI();
    updateSettingsModalResponsiveLayout();
}
function applySettingsModalFullscreenUI() {
    const panel = document.getElementById('settings-modal-panel');
    const btn = document.getElementById('settings-modal-fullscreen-btn');
    const compactBtn = document.getElementById('settings-modal-drag-handle');
    if (!panel) return;
    panel.classList.toggle('settings-modal-fullscreen', settingsModalFullscreen);
    if (settingsModalFullscreen) {
        if (compactBtn) compactBtn.disabled = true;
        if (btn) {
            btn.textContent = '\uCD95\uC18C';
            btn.title = '\uC804\uCCB4\uD654\uBA74 \uC885\uB8CC';
        }
    } else {
        if (compactBtn) compactBtn.disabled = false;
        if (btn) {
            btn.textContent = '\uC804\uCCB4\uD654\uBA74';
            btn.title = '\uC804\uCCB4\uD654\uBA74 \uC804\uD658';
        }
    }
}
function toggleSettingsModalFullscreen() {
    const panel = document.getElementById('settings-modal-panel');
    if (!panel) return;
    if (!settingsModalFullscreen) {
        settingsModalRestoreRect = {
            left: panel.style.left,
            top: panel.style.top,
            right: panel.style.right,
            width: panel.style.width,
            height: panel.style.height,
            maxWidth: panel.style.maxWidth,
            maxHeight: panel.style.maxHeight,
            position: panel.style.position,
            margin: panel.style.margin,
            compact: settingsModalCompact
        };
        settingsModalCompact = false;
        settingsModalFullscreen = true;
    } else {
        settingsModalFullscreen = false;
        if (settingsModalRestoreRect) {
            const prev = settingsModalRestoreRect;
            panel.style.position = prev.position || '';
            panel.style.left = prev.left || '';
            panel.style.top = prev.top || '';
            panel.style.right = prev.right || '';
            panel.style.width = prev.width || '';
            panel.style.height = prev.height || '';
            panel.style.maxWidth = prev.maxWidth || '';
            panel.style.maxHeight = prev.maxHeight || '90vh';
            panel.style.margin = prev.margin || '';
            settingsModalCompact = !!prev.compact;
        }
        settingsModalRestoreRect = null;
    }
    applySettingsModalCompactUI();
    applySettingsModalFullscreenUI();
    updateSettingsModalResponsiveLayout();
}
function bindSettingsModalDrag() {
    if (settingsModalDragBound) return;
    settingsModalDragBound = true;
    const header = document.getElementById('settings-modal-header');
    const panel = document.getElementById('settings-modal-panel');
    if (!header || !panel) return;
    enableTouchModalDrag(panel, header, {
        ignoreSelector: 'button,input,textarea,select,a,label',
        canStart: function () { return !settingsModalFullscreen; },
        onStart: function () {
            panel.style.maxHeight = '90vh';
        }
    });

    header.addEventListener('mousedown', function (e) {
        const target = e.target;
        if (e.button !== 0) return;
        if (settingsModalFullscreen) return;
        if (target && target.closest && target.closest('button,input,textarea,select,a,label')) return;
        const rect = panel.getBoundingClientRect();
        settingsModalDragging = true;
        settingsModalDragOffsetX = e.clientX - rect.left;
        settingsModalDragOffsetY = e.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        panel.style.margin = '0';
        panel.style.maxHeight = '90vh';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!settingsModalDragging) return;
        const panelEl = document.getElementById('settings-modal-panel');
        if (!panelEl) return;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - settingsModalDragOffsetX));
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - settingsModalDragOffsetY));
        panelEl.style.left = nextLeft + 'px';
        panelEl.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
        settingsModalDragging = false;
    });
}

function updateSettingsModalResponsiveLayout() {
    const panel = document.getElementById('settings-modal-panel');
    if (!panel) return;
    const isWide = settingsModalFullscreen || panel.clientWidth >= 840;
    panel.classList.toggle('settings-modal-wide', isWide);
}

function bindSettingsModalResize() {
    if (settingsModalResizeBound) return;
    settingsModalResizeBound = true;
    const panel = document.getElementById('settings-modal-panel');
    const handle = document.getElementById('settings-modal-resize-handle');
    if (!panel || !handle) return;

    handle.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (settingsModalFullscreen) return;
        const rect = panel.getBoundingClientRect();
        settingsModalResizing = true;
        settingsModalResizeStartX = e.clientX;
        settingsModalResizeStartY = e.clientY;
        settingsModalResizeStartW = rect.width;
        settingsModalResizeStartH = rect.height;
        panel.style.right = 'auto';
        panel.style.maxWidth = '96vw';
        panel.style.maxHeight = '92vh';
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', function (e) {
        if (!settingsModalResizing) return;
        const panelEl = document.getElementById('settings-modal-panel');
        if (!panelEl) return;
        const rect = panelEl.getBoundingClientRect();
        const minW = 360;
        const minH = 420;
        const maxW = Math.max(minW, window.innerWidth - rect.left - 8);
        const maxH = Math.max(minH, window.innerHeight - rect.top - 8);
        const nextW = Math.max(minW, Math.min(maxW, settingsModalResizeStartW + (e.clientX - settingsModalResizeStartX)));
        const nextH = Math.max(minH, Math.min(maxH, settingsModalResizeStartH + (e.clientY - settingsModalResizeStartY)));
        panelEl.style.width = Math.round(nextW) + 'px';
        panelEl.style.height = Math.round(nextH) + 'px';
        updateSettingsModalResponsiveLayout();
    });

    document.addEventListener('mouseup', function () {
        settingsModalResizing = false;
    });
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
                    + ' class="px-3 py-1.5 border-2 border-slate-700 rounded-lg text-sm font-medium text-slate-800 bg-white hover:bg-slate-50">inDB蹂닿린</button>';
                closeRow.parentElement.insertBefore(row, closeRow);
                openBtn = row.querySelector('#btn-open-indb-status');
            }
        }
    }

    if (!document.getElementById('indb-status-modal')) {
        const modal = document.createElement('div');
        modal.id = 'indb-status-modal';
        modal.className = 'fixed inset-0 bg-black/30 hidden items-center justify-center z-[2147483646] no-print';
        modal.setAttribute('onclick', "if(event.target===this) closeInDbStatusModal()");
        modal.innerHTML = ''
            + '<div class="w-[min(680px,92vw)] h-[min(680px,86vh)] bg-white dark:bg-slate-900 border-2 border-slate-800 shadow-2xl flex flex-col">'
            + '<div class="px-4 py-2 bg-indigo-600 text-white text-2xl text-center tracking-wide">inDB Status</div>'
            + '<div id="indb-status-list" class="flex-1 overflow-auto p-4 space-y-3 bg-slate-100 dark:bg-slate-800"></div>'
            + '<div class="border-t-2 border-slate-700 p-2 flex items-center justify-center gap-2 bg-white dark:bg-slate-900">'
            + '<button type="button" id="btn-download-all-indb" onclick="downloadAllInDbAsZip()" class="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-wait">전체 다운로드</button>'
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
        syncCurrentMarkdownFromEditor();

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
            tx.oncomplete = async () => {
                currentDbDocId = String(doc.id || '');
                if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
                    window.GoogleDocs.handleActiveDocumentChanged();
                }
                currentFileName = resolvedTitle + '.md';
                currentFilePath = null;
                updateCurrentDocumentDisplay();
                markPersistedState();
                showToast(targetDoc ? 'Existing inDB document overwritten.' : `Saved to inDB as "${resolvedTitle}".`);
                await revealSavedInDbDocument(doc);
            };
            tx.onerror = () => {
                showToast('Failed to save to inDB: ' + (tx.error && tx.error.message ? tx.error.message : 'Unknown database error'));
            };
        };
        readReq.onerror = () => {
            showToast('Failed to read the inDB document list. Please try again.');
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
window.toggleMiniPreviewFullscreen = toggleMiniPreviewFullscreen;
window.miniPreviewAdjustZoom = miniPreviewAdjustZoom;
window.updateContent = updateContent;
window.renderMarkdown = renderMarkdown;
window.toggleMode = toggleMode;
window.handleFileSelect = handleFileSelect;
window.handleImageFolderSelect = handleImageFolderSelect;
window.toggleOpenSourceMenu = toggleOpenSourceMenu;
window.openFilePickerFromMenu = openFilePickerFromMenu;
window.openImageFolderPickerFromMenu = openImageFolderPickerFromMenu;
window.openFmaViewerFromMenu = openFmaViewerFromMenu;
window.openFmaViewer = openFmaViewer;
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
window.setLiveRenderInEditMode = setLiveRenderInEditMode;
window.checkAutoSave = checkAutoSave;
window.applyRecovery = applyRecovery;
window.dismissRecovery = dismissRecovery;
window.loadFromExternalContent = loadFromExternalContent;
window.pasteFromClipboardAndDismiss = pasteFromClipboardAndDismiss;
window.insertAtCursor = insertAtCursor;
window.toggleMermaidQuickMenu = toggleMermaidQuickMenu;
window.closeMermaidQuickMenu = closeMermaidQuickMenu;
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
window.toggleInputModalImagePanel = toggleInputModalImagePanel;
window.setInputModalImagePanelToggleState = setInputModalImagePanelToggleState;
window.adjustPageScale = adjustPageScale;
window.adjustFontSize = adjustFontSize;
window.adjustHeaderScale = adjustHeaderScale;
window.adjustEditorHorizontalShift = adjustEditorHorizontalShift;
window.resetEditorHorizontalShift = resetEditorHorizontalShift;
configureScholarSearchShellBridge();
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
window.toggleFmaViewerSection = toggleFmaViewerSection;
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
window.toggleCredentialVisibility = toggleCredentialVisibility;
window.toggleAiPasswordSection = toggleAiPasswordSection;
window.toggleAiUseFold = toggleAiUseFold;
window.toggleShareSettingsFold = toggleShareSettingsFold;
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
window.tidySeparatorSpacingInEditor = tidySeparatorSpacingInEditor;
window.applyEnterTidyInEditor = applyEnterTidyInEditor;
window.applyMathTidyInEditor = applyMathTidyInEditor;
window.applyHtmlTidyInEditor = applyHtmlTidyInEditor;
window.closeTidyQuickMenu = closeTidyQuickMenu;
window.toggleTidyQuickMenu = toggleTidyQuickMenu;
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
window.toggleSettingsModalCompact = toggleSettingsModalCompact;
window.toggleSettingsModalFullscreen = toggleSettingsModalFullscreen;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteModal = confirmDeleteModal;
window.openSettingsModal = openSettingsModal;
window.focusGoogleCalendarSettings = focusGoogleCalendarSettings;
window.toggleGoogleCalendarSetting = toggleGoogleCalendarSetting;
window.openGoogleCalendarWindow = openGoogleCalendarWindow;
window.getAtCommandTemplates = function () {
    return getTemplateLibrary().map(function (item) {
        return { id: item.id, name: item.name, desc: item.desc, isCustom: item.isCustom };
    });
};
window.insertTemplateByCommandId = function (templateId) {
    const item = getTemplateLibrary().find(function (template) {
        return template.id === templateId;
    });
    if (!item) {
        showToast('선택한 양식을 찾을 수 없습니다.');
        return false;
    }
    return insertTemplateTextAtCursor(item.content);
};
window.closeSettingsModal = closeSettingsModal;
window.exportSettingsMset = exportSettingsMset;
window.triggerImportSettingsMset = triggerImportSettingsMset;
window.importSettingsMsetFile = importSettingsMsetFile;
window.openInDbStatusModal = openInDbStatusModal;
window.closeInDbStatusModal = closeInDbStatusModal;
window.deleteInDbStatusItem = deleteInDbStatusItem;
window.deleteAllInDbStatusItems = deleteAllInDbStatusItems;
window.downloadAllInDbAsZip = downloadAllInDbAsZip;
window.saveFeatureRecordToInDb = saveFeatureRecordToInDb;
window.upsertFeatureStoreRecordsInDb = upsertFeatureStoreRecordsInDb;
window.replaceFeatureStoreRecordsInDb = replaceFeatureStoreRecordsInDb;
window.deleteFeatureRecordFromInDb = deleteFeatureRecordFromInDb;
window.syncKnownFeatureDataToInDb = syncKnownFeatureDataToInDb;
window.applyCodeColorSettings = applyCodeColorSettings;
window.resetCodeColorSettings = resetCodeColorSettings;
window.clearUnusedCache = clearUnusedCache;
window.switchSidebarTab = switchSidebarTab;
window.renderTOC = renderTOC;
window.scrollToLine = scrollToLine;
window.applyHeading = applyHeading;
window.insertListAtSelection = insertListAtSelection;
window.handleTableInsertion = handleTableInsertion;
window.toggleTableInsertPicker = toggleTableInsertPicker;
window.closeTableInsertPicker = closeTableInsertPicker;
window.prepareCaptionPanel = prepareCaptionPanel;
window.toggleCaptionInsertPanel = toggleCaptionInsertPanel;
window.openCaptionInsertModal = openCaptionInsertModal;
window.closeCaptionInsertModal = closeCaptionInsertModal;
window.confirmCaptionInsert = confirmCaptionInsert;
window.updateCaptionInsertPreview = updateCaptionInsertPreview;
window.convertSelectionPatternToTable = convertSelectionPatternToTable;
window.convertSelectionMarkdownToHtml = convertSelectionMarkdownToHtml;
window.insertLiteralAtCursor = insertLiteralAtCursor;
window.toggleFootnoteQuickMenu = toggleFootnoteQuickMenu;
window.insertFootnoteTemplate = insertFootnoteTemplate;
window.renumberAllFootnotes = renumberAllFootnotes;
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




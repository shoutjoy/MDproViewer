// IndexedDB Logic
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 4;
let db;

const AI_SETTINGS_KEY = 'ai_settings';
const AI_PASSWORD_HASH = 'dc98e82fcfb4b165f5fa390d5ca61a9245a5be6ea70a4f00020ddff029afefba';
const AUTH_REQUEST_EMAIL = 'shoutjoy1@yonsei.ac.kr';
const ENTER_BUTTON_BR_KEY = 'md_viewer_enter_button_br';

// State
let currentMarkdown = "";
let currentFileName = "untitled.md";
let currentFilePath = null;
let isEditMode = true;
let pageScale = 1.0;
let fontSize = 16;
let modalMode = 'link';
let movingDocId = null;
let previewPopupWindow = null;
let previewPopupScale = 1.0;
let previewPopupFontSize = 16;
let previewPopupRenderToken = 0;
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

const sidebar = document.getElementById('sidebar');
const viewerContainer = document.getElementById('viewer-container');
const viewer = document.getElementById('viewer');
const editorContainer = document.getElementById('content-viewport');
const editorTextarea = document.getElementById('viewer-edit-ta');
const fileNameDisplay = document.getElementById('file-name-display');
const dropZone = document.getElementById('drop-zone');
const inputModal = document.getElementById('input-modal');

if (editorTextarea) {
    editorTextarea.addEventListener('paste', function () {
        receivedExternalContent = true;
    }, true);
}

let pendingExternalContent = null;
let receivedExternalContent = false;
let notebookLmEqualsHrPreprocess = false;
let lastExternalOpenSignature = '';
const EXTERNAL_LOAD_TYPES = ['mdViewerLoad', 'notebooklm', 'notebooklm-export', 'loadMarkdown'];
const NOTEBOOKLM_ORIGINS = ['https://notebooklm.google.com', 'https://aistudio.google.com'];
const ROOT_FOLDER_NAME = 'ROOT';

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
        if (opts.showMissingTextToast) showToast('파일 경로는 전달되었지만 본문(text)이 없어 열지 못했습니다.');
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
            if (typeof showToast === 'function') showToast('Highlight 내용을 문서에 삽입했습니다.');
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

window.onload = async () => {
    try {
        initTheme();
        initSettings();
        lucide.createIcons();
        toggleMode('edit');

        await initDB();
        await ensureRootFolder();
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

        if (window.ScholarRef && typeof window.ScholarRef.init === 'function') {
            await window.ScholarRef.init({
                dbGetter: function () { return db; },
                getEditor: function () { return editorTextarea; },
                showToast: showToast
            });
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
        performAutoSave();
        updatePreviewPopupContent();
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
        if (e.shiftKey && e.altKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            insertUserInfoAtCursor();
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
            if (isEditMode && editorTextarea) insertAtCursor('bold');
            return;
        }
        if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            if (isEditMode && editorTextarea) insertAtCursor('italic');
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
            if (e.shiftKey) {
                document.execCommand('redo');
            } else {
                document.execCommand('undo');
            }
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
            document.execCommand('redo');
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
function preprocessMarkdownForView(raw) {
    let s = String(raw ?? '');
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
        try { updatePreviewPopupContent(); } catch (e) {}
    }
    revokeObjectUrls(viewerInternalImageObjectUrls);
    resolveInternalMarkdownImagesForViewer(raw).then(function (resolvedRaw) {
    try {
        preprocessed = preprocessMarkdownForView(resolvedRaw);
        if (typeof marked === 'undefined' || !marked.parse) {
            viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
            return;
        }
        const out = marked.parse(preprocessed);
        if (out != null && typeof out.then === 'function') {
            out.then(function (h) {
                viewer.innerHTML = h || '';
                runPostRenderHooks();
            }).catch(function () {
                try {
                    const fallback = marked.parse(resolvedRaw);
                    viewer.innerHTML = (fallback && typeof fallback.then === 'function') ? '' : (fallback || '');
                    if (fallback && typeof fallback.then === 'function') {
                        fallback.then(function (html) {
                            viewer.innerHTML = html || '';
                            runPostRenderHooks();
                        }).catch(function () {
                            viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                            runPostRenderHooks();
                        });
                        return;
                    }
                    runPostRenderHooks();
                } catch (e) {
                    viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                    runPostRenderHooks();
                }
            });
            return;
        }
        viewer.innerHTML = out || '';
        runPostRenderHooks();
    } catch (e) {
        try {
            if (typeof marked !== 'undefined' && marked.parse) {
                const fallback = marked.parse(resolvedRaw);
                if (fallback != null && typeof fallback.then === 'function') {
                    fallback.then(function (h) {
                        viewer.innerHTML = h || '';
                        runPostRenderHooks();
                    }).catch(function () {
                        viewer.innerHTML = '<p>' + resolvedRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                        runPostRenderHooks();
                    });
                    return;
                }
                viewer.innerHTML = fallback || '';
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

function isPreviewPopupAlive() {
    return !!(previewPopupWindow && !previewPopupWindow.closed);
}

function onPreviewPopupClosed() {
    previewPopupWindow = null;
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function closePreviewPopupWindow() {
    if (!isPreviewPopupAlive()) {
        previewPopupWindow = null;
        revokeObjectUrls(previewInternalImageObjectUrls);
        return;
    }
    previewPopupWindow.close();
    previewPopupWindow = null;
    revokeObjectUrls(previewInternalImageObjectUrls);
}

function escapeHtmlForPreview(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getPreviewPopupDocumentHtml() {
    return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MDproViewer Preview</title><style>'
        + 'html,body{margin:0;padding:0;height:100%;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;}'
        + '#pv-root{display:flex;flex-direction:column;height:100%;}'
        + '#pv-toolbar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#e2e8f0;border-bottom:1px solid #cbd5e1;position:sticky;top:0;z-index:10;}'
        + '#pv-toolbar button{padding:4px 10px;border:1px solid #94a3b8;background:#fff;border-radius:6px;font-weight:700;color:#1e293b;cursor:pointer;}'
        + '#pv-toolbar .label{font-size:12px;color:#334155;min-width:48px;text-align:center;font-weight:700;}'
        + '#pv-viewport{flex:1;overflow:auto;padding:20px;}'
        + '#pv-content{line-height:1.6;word-wrap:break-word;transform-origin:top left;}'
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
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(-0.1)\">Zoom Out</button>'
        + '<span id=\"pv-scale-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(0.1)\">Zoom In</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(-1)\">Font -</button>'
        + '<span id=\"pv-font-label\" class=\"label\">16px</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(1)\">Font +</button>'
        + '<button type=\"button\" style=\"margin-left:auto\" onclick=\"window.close()\">Close</button>'
        + '</div><div id=\"pv-viewport\"><div id=\"pv-content\"></div></div></div>'
        + '<script>window.addEventListener(\"beforeunload\",function(){try{if(window.opener&&typeof window.opener.onPreviewPopupClosed===\"function\"){window.opener.onPreviewPopupClosed();}}catch(e){}});<\/script>'
        + '</body></html>';
}

function applyPreviewPopupViewport() {
    if (!isPreviewPopupAlive()) return;
    const doc = previewPopupWindow.document;
    const content = doc.getElementById('pv-content');
    const scaleLabel = doc.getElementById('pv-scale-label');
    const fontLabel = doc.getElementById('pv-font-label');
    if (!content) return;

    const scale = Math.max(0.3, Math.min(3, Number(previewPopupScale) || 1));
    const fs = Math.max(8, Math.min(72, Number(previewPopupFontSize) || 16));
    previewPopupScale = scale;
    previewPopupFontSize = fs;

    content.style.transform = 'scale(' + scale + ')';
    content.style.width = (100 / scale) + '%';
    content.style.fontSize = fs + 'px';
    if (scaleLabel) scaleLabel.textContent = Math.round(scale * 100) + '%';
    if (fontLabel) fontLabel.textContent = fs + 'px';
}

function previewPopupAdjustScale(delta) {
    previewPopupScale = (Number(previewPopupScale) || 1) + Number(delta || 0);
    applyPreviewPopupViewport();
}

function previewPopupAdjustFontSize(delta) {
    previewPopupFontSize = (Number(previewPopupFontSize) || 16) + Number(delta || 0);
    applyPreviewPopupViewport();
}

async function updatePreviewPopupContent() {
    if (!isPreviewPopupAlive()) return;
    const token = ++previewPopupRenderToken;
    const raw = String(editorTextarea ? editorTextarea.value : currentMarkdown);
    let html = '';

    try {
        revokeObjectUrls(previewInternalImageObjectUrls);
        const resolvedRaw = await resolveInternalMarkdownImagesForPreview(raw);
        const preprocessed = preprocessMarkdownForView(resolvedRaw);
        if (typeof marked === 'undefined' || !marked.parse) {
            html = '<p>' + escapeHtmlForPreview(resolvedRaw).replace(/\n/g, '<br>') + '</p>';
        } else {
            const out = marked.parse(preprocessed);
            html = (out != null && typeof out.then === 'function') ? await out : out;
            html = html || '';
        }
    } catch (e) {
        html = '<p>' + escapeHtmlForPreview(raw).replace(/\n/g, '<br>') + '</p>';
    }

    if (token !== previewPopupRenderToken || !isPreviewPopupAlive()) return;
    const target = previewPopupWindow.document.getElementById('pv-content');
    if (!target) return;
    target.innerHTML = html;
    try { await hydrateInternalImagesInElement(target, registerPreviewInternalObjectUrl); } catch (e) {}
    if (typeof renderMathInMarkdownViewer === 'function') renderMathInMarkdownViewer(target);
    applyPreviewPopupViewport();
}

function openPreviewPopupWindow() {
    if (isPreviewPopupAlive()) {
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
    updatePreviewPopupContent();
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
        if (editTools) editTools.classList.remove('hidden');
        if (btnCopyViewRich) btnCopyViewRich.classList.add('hidden');
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
        if (editTools) editTools.classList.add('hidden');
        if (btnCopyViewRich) btnCopyViewRich.classList.remove('hidden');
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
    fileNameDisplay.textContent = currentFileName;
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
    const pick = String(window.prompt('Export type: md / mdd / zip (cancel = empty)', 'md') || '').trim().toLowerCase();
    if (!pick) return 'cancel';
    if (pick === 'md' || pick === 'mdd' || pick === 'zip') return pick;
    return 'cancel';
}

async function exportCurrentDocumentByChoice() {
    const choice = await chooseExportType();
    if (choice === 'cancel') return false;
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
    const hasInternalImages = !!(window.ImageDB
        && typeof window.ImageDB.hasInternalImages === 'function'
        && window.ImageDB.hasInternalImages(String(currentMarkdown || '')));
    if (hasInternalImages) {
        if (window.ExtendFiles && typeof window.ExtendFiles.showMdImageLossWarningDialog === 'function') {
            const confirmMd = await window.ExtendFiles.showMdImageLossWarningDialog();
            if (confirmMd !== 'continue_md') return false;
        } else {
            const ok = window.confirm('MD 파일은 문서 텍스트만 저장되며 내부 이미지(IndexedDB)는 포함되지 않습니다.\nMDD는 문서+이미지 통합 저장, ZIP은 문서+images 폴더 저장입니다.\nMD로 계속 저장하시겠습니까?');
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

let mergeListState = [];
let mergeListSearchQuery = '';
let mergeListSelectedOnly = false;

async function openMergeModal() {
    if (!db) return;
    const docs = await new Promise(r => {
        const req = db.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = () => r(req.result);
    });
    const rootDocs = (docs || []).filter(d => d.folderId === 'root');
    mergeListState = rootDocs.map(d => ({ id: d.id, title: d.title, checked: true }));
    mergeListSearchQuery = '';
    mergeListSelectedOnly = false;
    const searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    renderMergeList();
    document.getElementById('merge-bundle-name').value = '';
    document.getElementById('merge-modal').classList.remove('hidden');
    document.getElementById('merge-modal').classList.add('flex');
    lucide.createIcons();
}

function filterMergeList(query) {
    mergeListSearchQuery = String(query || '').trim().toLowerCase();
    renderMergeList();
}

function renderMergeList() {
    const listEl = document.getElementById('merge-list');
    const selectedOnlyBtn = document.getElementById('merge-selected-only-btn');
    if (!listEl) return;
    if (selectedOnlyBtn) {
        selectedOnlyBtn.textContent = mergeListSelectedOnly ? '전체보기' : '선택보기';
        selectedOnlyBtn.className = mergeListSelectedOnly
            ? 'flex-1 px-3 py-1.5 text-xs font-medium border border-indigo-600 dark:border-indigo-400 rounded-md text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
            : 'flex-1 px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700';
    }
    if (mergeListState.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">No documents found in the root folder.</p>';
        return;
    }
    const q = mergeListSearchQuery;
    const filtered = mergeListState
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => (!mergeListSelectedOnly || item.checked) && (!q || (item.title || '').toLowerCase().includes(q)));
    if (filtered.length === 0) {
        listEl.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">${mergeListSelectedOnly ? 'No selected documents found.' : 'No matching documents found.'}</p>`;
        lucide.createIcons();
        return;
    }
    listEl.innerHTML = filtered.map(({ item, idx }) => `
        <div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600" data-idx="${idx}">
            <i data-lucide="file-text" class="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0"></i>
            <span class="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate" title="${(item.title || '').replace(/"/g, '&quot;')}">${(item.title || '').replace(/</g, '&lt;')}</span>
            <label class="flex items-center shrink-0 cursor-pointer">
                <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleMergeItem(${idx}, this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600">
            </label>
            <div class="flex flex-col shrink-0">
                <button type="button" onclick="moveMergeItem(${idx},-1)" class="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400" title="위로 이동">▲</button>
                <button type="button" onclick="moveMergeItem(${idx},1)" class="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400" title="아래로 이동">▼</button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function selectAllMergeItems() {
    const q = mergeListSearchQuery;
    mergeListState.forEach((item, idx) => {
        const match = !q || (item.title || '').toLowerCase().includes(q);
        if (match) item.checked = true;
    });
    renderMergeList();
}

function deselectAllMergeItems() {
    const q = mergeListSearchQuery;
    mergeListState.forEach((item) => {
        const match = !q || (item.title || '').toLowerCase().includes(q);
        if (match) item.checked = false;
    });
    renderMergeList();
}

function toggleMergeItem(idx, checked) {
    if (mergeListState[idx]) mergeListState[idx].checked = !!checked;
    if (mergeListSelectedOnly) renderMergeList();
}

function moveMergeItem(idx, dir) {
    const next = idx + dir;
    if (next < 0 || next >= mergeListState.length) return;
    [mergeListState[idx], mergeListState[next]] = [mergeListState[next], mergeListState[idx]];
    renderMergeList();
}

function toggleSelectedOnlyMergeView() {
    mergeListSelectedOnly = !mergeListSelectedOnly;
    renderMergeList();
}

function closeMergeModal() {
    document.getElementById('merge-modal').classList.add('hidden');
    document.getElementById('merge-modal').classList.remove('flex');
}

async function bindMerge() {
    const nameInput = document.getElementById('merge-bundle-name');
    const bundleName = (nameInput && nameInput.value) ? String(nameInput.value).trim() : '';
    if (!bundleName) {
        showToast("Enter a bundle name first.");
        if (nameInput) nameInput.focus();
        return;
    }
    const selected = mergeListState.filter(x => x.checked);
    if (selected.length === 0) {
        showToast("Select at least one document to merge.");
        return;
    }
    const tx = db.transaction('documents', 'readonly');
    const contents = await Promise.all(selected.map(item => {
        return new Promise(r => {
            const req = tx.objectStore('documents').get(item.id);
            req.onsuccess = () => r(req.result ? req.result.content : '');
        });
    }));
    const mergedContent = contents.join('\n\n---\n\n');
    const newDoc = {
        id: 'doc_' + Date.now(),
        title: bundleName,
        content: mergedContent,
        folderId: 'root',
        updatedAt: new Date()
    };
    const writeTx = db.transaction('documents', 'readwrite');
    writeTx.objectStore('documents').add(newDoc);
    writeTx.oncomplete = () => {
        showToast("Merged document created.");
        renderDBList();
        closeMergeModal();
        if (isSidebarHidden) toggleSidebarVisibility();
    };
}

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
            return;
        }
    } catch (e) {}

    const fallbackOk = fallbackCopyHtmlFromViewer(html || text);
    if (fallbackOk) showToast('Copied formatted content.');
    else showToast('Copy failed. Please allow clipboard access.');
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

function renderTOC() {
    const tocList = document.getElementById('toc-list');
    if (!tocList) return;
    tocList.innerHTML = '';

    if (isSidebarCollapsed) {
        tocList.innerHTML = `<div class="p-2 text-center text-xs text-slate-400">Expand the sidebar to view the table of contents.</div>`;
        return;
    }

    const lines = currentMarkdown.split('\n');
    let tocHtml = '<div class="space-y-1 p-2">';
    let found = false;

    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.*)/);
        if (match) {
            found = true;
            const level = match[1].length;
            const text = match[2].trim();
            const padding = (level - 1) * 12;
            const sizeClasses = level === 1 ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400';
            tocHtml += `<div class="text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-2 rounded truncate transition-colors ${sizeClasses}" style="margin-left: ${padding}px" onclick="scrollToLine(${index})">${text}</div>`;
        }
    });

    tocHtml += '</div>';

    if (!found) {
        tocHtml = '<div class="p-4 text-xs text-slate-400 text-center">No headings found. Add Markdown headings like <code># Title</code> to build a TOC.</div>';
    }
    tocList.innerHTML = tocHtml;
}

function scrollToLine(lineIndex) {
    if (isEditMode) {
        const text = editorTextarea.value;
        const lines = text.split('\n');
        let charPos = 0;
        for (let i = 0; i < lineIndex; i++) {
            charPos += lines[i].length + 1;
        }
        editorTextarea.focus();
        editorTextarea.setSelectionRange(charPos, charPos);
        const lineHeight = parseInt(getComputedStyle(editorTextarea).lineHeight) || 28;
        editorTextarea.scrollTop = lineIndex * lineHeight;
    } else {
        const lines = currentMarkdown.split('\n');
        let headerIndex = 0;
        for (let i = 0; i <= lineIndex; i++) {
            if (/^(#{1,6})\s+(.*)/.test(lines[i])) {
                if (i === lineIndex) break;
                headerIndex++;
            }
        }
        const headers = viewer.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headers[headerIndex]) {
            headers[headerIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
            const looksBroken = !currentName || currentName.includes('?') || currentName.includes('�');
            if (looksBroken || currentName.toUpperCase() !== ROOT_FOLDER_NAME) {
                store.put({ ...current, name: ROOT_FOLDER_NAME });
            }
            res();
        };
    });
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


async function renderDBList() {
    const listEl = document.getElementById('db-list');
    const searchTerm = document.getElementById('db-search').value.toLowerCase();
    listEl.innerHTML = "";

    const txFolders = db.transaction('folders', 'readonly');
    const folders = await new Promise(r => {
        const req = txFolders.objectStore('folders').getAll();
        req.onsuccess = () => r(req.result);
    });

    const txDocs = db.transaction('documents', 'readonly');
    const docs = await new Promise(r => {
        const req = txDocs.objectStore('documents').getAll();
        req.onsuccess = () => r(req.result);
    });

    folders.forEach(folder => {
        const folderDocs = docs.filter(d => d.folderId === folder.id && d.title.toLowerCase().includes(searchTerm));
        const folderDisplayName = folder.id === 'root'
            ? ROOT_FOLDER_NAME
            : String(folder.name || 'Folder');

        const folderDiv = document.createElement('div');
        folderDiv.className = "mb-2";
        folderDiv.innerHTML = `
            <div class="flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter ${isSidebarCollapsed ? 'justify-center' : ''}">
                <i data-lucide="folder" class="w-3 h-3"></i> 
                <span class="sidebar-text">${folderDisplayName}</span>
            </div>
        `;

        const docContainer = document.createElement('div');
        docContainer.className = isSidebarCollapsed ? "space-y-1" : "pl-2 space-y-1";

        folderDocs.forEach(doc => {
            const docItem = document.createElement('div');
            docItem.className = "group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer";
            docItem.title = doc.title;
            docItem.onclick = () => loadFromDB(doc.id);

            docItem.innerHTML = `
                <div class="flex flex-col gap-1 doc-item-inner">
                    <div class="flex items-center gap-2">
                        <i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0"></i>
                        <span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ${isSidebarCollapsed ? '' : 'sidebar-text'}">
                            ${isSidebarCollapsed ? doc.title.substring(0, 1) : doc.title}
                        </span>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns">
                        <button onclick="event.stopPropagation(); loadFromDB('${doc.id}')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">열기</button>
                        <button onclick="event.stopPropagation(); openMoveModal('${doc.id}')" class="text-[10px] bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 font-bold hover:bg-slate-200 dark:hover:bg-slate-600">이동</button>
                        <button onclick="event.stopPropagation(); deleteFromDB('${doc.id}')" class="text-[10px] bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold hover:bg-red-600 hover:text-white ml-auto">X</button>
                    </div>
                </div>
            `;
            docContainer.appendChild(docItem);
        });

        if (folderDocs.length > 0 || searchTerm === "") {
            folderDiv.appendChild(docContainer);
            listEl.appendChild(folderDiv);
        }
    });
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
    if (removedCaches > 0) parts.push('browser cache ' + removedCaches + '개');
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

async function insertUserInfoAtCursor() {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    if (!db) {
        showToast('Database is not ready yet. Please try again.');
        return;
    }
    const s = await getAiSettings();
    const u = s && s.userInfo;
    if (!u || (!String(u.name || '').trim() && !String(u.id || '').trim() && !String(u.major || '').trim() && !String(u.contact || '').trim() && !String(u.email || '').trim())) {
        showToast('No user info found. Please save your profile first.');
        return;
    }
    const lines = [];
    if (String(u.name || '').trim()) lines.push('Name: ' + String(u.name).trim());
    if (String(u.id || '').trim()) lines.push('Student ID: ' + String(u.id).trim());
    if (String(u.major || '').trim()) lines.push('Major: ' + String(u.major).trim());
    if (String(u.contact || '').trim()) lines.push('Contact: ' + String(u.contact).trim());
    if (String(u.email || '').trim()) lines.push('Email: ' + String(u.email).trim());
    const block = lines.map(function (line) { return line + '  '; }).join('\n');
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, block);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('User info inserted.');
}

function insertMarkdownImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('Enter an image URL.');
        return;
    }
    const alt = String(altText || 'image').trim().replace(/[\[\]]/g, '') || 'image';
    const md = '![' + alt + '](' + u + ')';
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, md);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('Markdown image inserted.');
}

function insertHtmlImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('Enter an image URL.');
        return;
    }
    const alt = String(altText || 'image')
        .trim()
        .replace(/"/g, '&quot;')
        .replace(/[<>]/g, '') || 'image';
    const html = '<img src="' + u + '" alt="' + alt + '" border="0" />';
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, html);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('HTML image tag inserted.');
}

function getImageAltTextFromUrl(imageUrl) {
    const u = String(imageUrl || '').trim();
    if (!u) return 'image';
    try {
        const path = u.split('?')[0].split('#')[0];
        const name = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1) || 'image')
            .replace(/\.[^.]+$/, '')
            .trim();
        return name || 'image';
    } catch (e) {
        return 'image';
    }
}

function setImageInsertStatus(msg, isError) {
    const el = document.getElementById('img-insert-status');
    if (!el) return;
    el.textContent = String(msg || '');
    el.className = 'mt-3 text-xs ' + (isError ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400');
}

function setImageUploadProgress(pct, active) {
    const wrap = document.getElementById('img-insert-progress-wrap');
    const fill = document.getElementById('img-insert-progress-fill');
    const text = document.getElementById('img-insert-progress-text');
    if (!wrap || !fill || !text) return;
    const safe = Math.max(0, Math.min(100, Number(pct) || 0));
    fill.style.width = safe + '%';
    text.textContent = safe + '%';
    if (active) wrap.classList.remove('hidden');
    else if (safe >= 100 || safe <= 0) setTimeout(function () { wrap.classList.add('hidden'); }, 700);
}

function setImageInsertPreview(dataUrl) {
    const img = document.getElementById('img-insert-preview');
    if (!img) return;
    if (!dataUrl) {
        img.classList.add('hidden');
        img.removeAttribute('src');
        return;
    }
    img.src = dataUrl;
    img.classList.remove('hidden');
}

function revokeImageInsertGalleryObjectUrls() {
    if (!Array.isArray(imageInsertGalleryObjectUrls) || imageInsertGalleryObjectUrls.length === 0) return;
    imageInsertGalleryObjectUrls.forEach(function (u) {
        try { URL.revokeObjectURL(u); } catch (e) {}
    });
    imageInsertGalleryObjectUrls = [];
}

function setImageInsertGalleryToggleActive(active) {
    const btn = document.getElementById('img-insert-gallery-toggle');
    if (!btn) return;
    if (active) {
        btn.classList.add('ring-2', 'ring-fuchsia-300');
    } else {
        btn.classList.remove('ring-2', 'ring-fuchsia-300');
    }
}

function blobToDataUrlForImageInsert(blob) {
    return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(String(r.result || '')); };
        r.onerror = function () { reject(r.error || new Error('Failed to read blob')); };
        r.readAsDataURL(blob);
    });
}

async function ensureImageInsertDataUrlFromInternalSelection() {
    if (imageInsertCurrentDataUrl && imageInsertCurrentDataUrl.indexOf('data:image') === 0) return true;
    if (!db || !window.ImageDB || typeof window.ImageDB.getImage !== 'function') return false;
    const id = String(imageInsertSavedInternalId || '').trim();
    if (!id) return false;
    const rec = await window.ImageDB.getImage(db, id);
    if (!rec || !rec.blob) return false;
    const dataUrl = await blobToDataUrlForImageInsert(rec.blob);
    if (!dataUrl || dataUrl.indexOf('data:image') !== 0) return false;
    imageInsertCurrentDataUrl = dataUrl;
    imageInsertCurrentFileName = rec.name || ('gallery_' + id + '.png');
    setImageInsertPreview(dataUrl);
    return true;
}

async function getImageInsertGalleryDataUrl(id, blob) {
    const key = String(id || '').trim();
    if (!key || !blob) return '';
    if (imageInsertGalleryDataUrlCache.has(key)) return imageInsertGalleryDataUrlCache.get(key) || '';
    const dataUrl = await blobToDataUrlForImageInsert(blob);
    imageInsertGalleryDataUrlCache.set(key, dataUrl);
    return dataUrl;
}

async function syncImageInsertFullscreenGallery(items, currentId, currentDataUrl) {
    if (typeof window.viewerSSPSetFullscreenGallery !== 'function') return;
    const src = Array.isArray(items) ? items : [];
    const list = src
        .filter(function (it) { return it && it.blob && String(it.id || '').trim(); })
        .slice(0, 80);
    if (!list.length) {
        window.viewerSSPSetFullscreenGallery([], '');
        return;
    }
    const entries = [];
    for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const id = String(it.id || '').trim();
        let dataUrl = '';
        if (id === currentId && currentDataUrl && currentDataUrl.indexOf('data:image') === 0) dataUrl = currentDataUrl;
        else {
            try { dataUrl = await getImageInsertGalleryDataUrl(id, it.blob); } catch (e) { dataUrl = ''; }
        }
        if (!dataUrl || dataUrl.indexOf('data:image') !== 0) continue;
        entries.push({
            id: 'idb_' + encodeURIComponent(id),
            dataURL: dataUrl,
            prompt: String(it.name || id),
            createdAt: Number(it.createdAt || Date.now())
        });
    }
    window.viewerSSPSetFullscreenGallery(entries, currentDataUrl || '');
}

function openImageInsertGalleryFullscreen(src) {
    const safeSrc = String(src || '').trim();
    if (!safeSrc) return;
    if (typeof window.viewerSSPOpenFullscreen === 'function') {
        window.viewerSSPOpenFullscreen(safeSrc);
        return;
    }
    try {
        window.open(safeSrc, '_blank', 'noopener,noreferrer');
    } catch (e) {}
}

async function loadImageInsertGallery() {
    const panel = document.getElementById('img-insert-gallery-panel');
    const list = document.getElementById('img-insert-gallery-list');
    if (!panel || !list) return;
    if (!db) {
        list.innerHTML = '<div class="text-xs text-red-500">DB not ready.</div>';
        return;
    }

    revokeImageInsertGalleryObjectUrls();
    list.innerHTML = '<div class="text-xs text-slate-500">불러오는 중...</div>';

    try {
        const items = await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readonly');
            const req = tx.objectStore('images').getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { reject(req.error || new Error('Failed to load images')); };
        });

        items.sort(function (a, b) { return Number(b && b.createdAt || 0) - Number(a && a.createdAt || 0); });

        if (!items.length) {
            list.innerHTML = '<div class="text-xs text-slate-500">IndexedDB 이미지가 없습니다.</div>';
            return;
        }

        const html = [];
        items.forEach(function (it, idx) {
            const id = String(it && it.id || '').trim();
            if (!id || !it.blob) return;
            const objectUrl = URL.createObjectURL(it.blob);
            imageInsertGalleryObjectUrls.push(objectUrl);
            const title = String(it.name || id).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html.push(
                '<button type="button" class="img-gallery-item rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 p-1 text-left" data-idx="' + idx + '" data-id="' + encodeURIComponent(id) + '" title="' + title + '">' +
                '<img src="' + objectUrl + '" class="w-full h-20 object-contain rounded bg-slate-100 dark:bg-slate-900">' +
                '<div class="mt-1 text-[10px] text-slate-600 dark:text-slate-300 truncate">' + title + '</div>' +
                '</button>'
            );
        });
        list.innerHTML = html.join('');

        Array.from(list.querySelectorAll('.img-gallery-item')).forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const encId = String(btn.getAttribute('data-id') || '');
                const id = decodeURIComponent(encId);
                const target = items.find(function (x) { return String(x && x.id || '') === id; });
                if (!target) return;

                const internalUrl = (window.ImageDB && typeof window.ImageDB.internalUrlFromId === 'function')
                    ? window.ImageDB.internalUrlFromId(id)
                    : ('internal://' + encodeURIComponent(id));

                const input = document.getElementById('img-insert-url');
                if (input) input.value = internalUrl;
                imageInsertSavedInternalId = id;
                imageInsertSavedInternalUrl = internalUrl;
                imageInsertSavedFingerprint = '';
                renderImageInsertInternalInfo();

                try {
                    const dataUrl = await getImageInsertGalleryDataUrl(id, target.blob);
                    imageInsertCurrentDataUrl = dataUrl;
                    imageInsertCurrentFileName = target.name || ('gallery_' + id + '.png');
                    setImageInsertPreview(dataUrl);

                    if (typeof window.viewerSSPSetFullscreenGallery === 'function') {
                        window.viewerSSPSetFullscreenGallery([{
                            id: 'idb_' + encodeURIComponent(id),
                            dataURL: dataUrl,
                            prompt: String(target.name || id),
                            createdAt: Number(target.createdAt || Date.now())
                        }], dataUrl);
                    }
                    openImageInsertGalleryFullscreen(dataUrl);
                    syncImageInsertFullscreenGallery(items, id, dataUrl).catch(function () {});
                } catch (e) {
                    setImageInsertPreview('');
                }

                Array.from(list.querySelectorAll('.img-gallery-item')).forEach(function (el) {
                    el.classList.remove('ring-2', 'ring-indigo-400');
                });
                btn.classList.add('ring-2', 'ring-indigo-400');

                setImageInsertStatus('갤러리 이미지 선택됨: ' + internalUrl, false);
            });
        });
    } catch (e) {
        list.innerHTML = '<div class="text-xs text-red-500">갤러리 로드 실패</div>';
        setImageInsertStatus('IndexedDB 갤러리 로드 실패: ' + (e && e.message ? e.message : e), true);
    }
}

function refreshImageInsertGallery() {
    if (!imageInsertGalleryOpen) return;
    loadImageInsertGallery();
}

async function downloadImageInsertGalleryZip() {
    if (!db || typeof JSZip === 'undefined') {
        setImageInsertStatus('ZIP export is not available.', true);
        return;
    }
    setImageInsertStatus('Preparing gallery ZIP...', false);
    try {
        const items = await new Promise(function (resolve, reject) {
            const tx = db.transaction('images', 'readonly');
            const req = tx.objectStore('images').getAll();
            req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
            req.onerror = function () { reject(req.error || new Error('Failed to load images')); };
        });
        if (!items.length) {
            setImageInsertStatus('No IndexedDB images to export.', true);
            return;
        }

        const zip = new JSZip();
        const used = new Set();
        let added = 0;
        items.forEach(function (it, idx) {
            if (!it || !it.blob) return;
            const id = String(it.id || ('img_' + idx));
            const rawName = String(it.name || id || ('image_' + idx)).trim();
            const extFromMime = (String(it.mime || it.blob.type || '').split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '');
            const safeBase = rawName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || ('image_' + idx);
            const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(safeBase);
            const baseName = hasExt ? safeBase : (safeBase + '.' + extFromMime);
            let fileName = baseName;
            let seq = 2;
            while (used.has(fileName.toLowerCase())) {
                const dot = baseName.lastIndexOf('.');
                if (dot > 0) fileName = baseName.slice(0, dot) + '_' + seq + baseName.slice(dot);
                else fileName = baseName + '_' + seq;
                seq += 1;
            }
            used.add(fileName.toLowerCase());
            zip.file('images/' + fileName, it.blob);
            added += 1;
        });
        if (!added) {
            setImageInsertStatus('No valid images found for ZIP export.', true);
            return;
        }
        zip.file('manifest.json', JSON.stringify({
            format: 'mdviewer-indexeddb-gallery',
            createdAt: new Date().toISOString(),
            count: added
        }, null, 2));

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'indexeddb_gallery_' + new Date().toISOString().slice(0, 10) + '.zip';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 400);
        setImageInsertStatus('Gallery ZIP downloaded (' + added + ' images).', false);
    } catch (e) {
        setImageInsertStatus('Failed to export gallery ZIP: ' + (e && e.message ? e.message : e), true);
    }
}

function toggleImageInsertGallery() {
    const panel = document.getElementById('img-insert-gallery-panel');
    if (!panel) return;
    imageInsertGalleryOpen = !imageInsertGalleryOpen;
    panel.classList.toggle('hidden', !imageInsertGalleryOpen);
    setImageInsertGalleryToggleActive(imageInsertGalleryOpen);
    if (imageInsertGalleryOpen) loadImageInsertGallery();
    else revokeImageInsertGalleryObjectUrls();
}
function openImageInsertModal() {
    const modal = document.getElementById('image-insert-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    applyImageInsertPanelLayout();
    bindImageInsertModalDrag();
    if (!imageInsertCropBound) {
        imageInsertCropBound = true;
        window.addEventListener('message', function (ev) {
            if (!ev || !ev.data || !imageInsertCropWindow || ev.source !== imageInsertCropWindow) return;
            if (ev.data.type === 'crop-ready') {
                if (!imageInsertCurrentDataUrl) return;
                try { imageInsertCropWindow.postMessage({ type: 'crop', image: imageInsertCurrentDataUrl }, '*'); } catch (e) {}
                return;
            }
            if (ev.data.type === 'aiimg-cropped' && ev.data.dataUrl) {
                imageInsertCurrentDataUrl = String(ev.data.dataUrl);
                imageInsertCurrentFileName = 'cropped_' + Date.now() + '.png';
                resetImageInsertForNewImage(true);
                setImageInsertPreview(imageInsertCurrentDataUrl);
                setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
                try { imageInsertCropWindow.postMessage({ type: 'crop-applied' }, '*'); } catch (e) {}
            }
        });
    }

    const galleryPanel = document.getElementById('img-insert-gallery-panel');
    if (galleryPanel) {
        galleryPanel.classList.toggle('hidden', !imageInsertGalleryOpen);
    }
    setImageInsertGalleryToggleActive(imageInsertGalleryOpen);
    if (imageInsertGalleryOpen) {
        loadImageInsertGallery();
    }

    setImageUploadProgress(0, false);
    renderImageInsertInternalInfo();
    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
}

function closeImageInsertModal() {
    const modal = document.getElementById('image-insert-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const panel = document.getElementById('image-insert-panel');
    if (panel) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.margin = '';
    }

    const galleryPanel = document.getElementById('img-insert-gallery-panel');
    imageInsertGalleryOpen = false;
    if (galleryPanel) {
        galleryPanel.classList.add('hidden');
    }
    setImageInsertGalleryToggleActive(false);
    revokeImageInsertGalleryObjectUrls();
    imageInsertGalleryDataUrlCache.clear();

    imageInsertDragging = false;
    setImageUploadProgress(0, false);
}

function applyImageInsertPanelLayout() {
    const modal = document.getElementById('image-insert-modal');
    const panel = document.getElementById('image-insert-panel');
    if (!modal || !panel) return;
    if (imageInsertDockRight) {
        modal.classList.remove('justify-center');
        modal.classList.add('justify-end');
        panel.classList.remove('max-w-2xl');
        panel.classList.add('max-w-xl');
        panel.style.marginRight = '12px';
    } else {
        modal.classList.remove('justify-end');
        modal.classList.add('justify-center');
        panel.classList.remove('max-w-xl');
        panel.classList.add('max-w-2xl');
        panel.style.marginRight = '';
    }
}

function toggleImageInsertDockRight() {
    imageInsertDockRight = !imageInsertDockRight;
    applyImageInsertPanelLayout();
}

function openImageInsertExternalLink(type) {
    const targetUrl = type === 'imgbb'
        ? 'https://imgbb.com/'
        : 'https://www.google.co.kr/imghp';
    try {
        const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
        if (!win) {
            setImageInsertStatus('Popup blocked. Please allow popups in your browser settings.', true);
            return;
        }
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    } catch (e) {
        setImageInsertStatus('Could not open external link. Please try again.', true);
    }
}

function bindImageInsertModalDrag() {
    if (imageInsertDragBound) return;
    imageInsertDragBound = true;
    const header = document.getElementById('image-insert-header');
    const panel = document.getElementById('image-insert-panel');
    if (!header || !panel) return;

    header.addEventListener('mousedown', function (e) {
        const target = e.target;
        if (target && (target.closest('button') || target.tagName === 'BUTTON')) return;
        imageInsertDragging = true;
        const rect = panel.getBoundingClientRect();
        imageInsertDragOffsetX = e.clientX - rect.left;
        imageInsertDragOffsetY = e.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.margin = '0';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!imageInsertDragging) return;
        const panelEl = document.getElementById('image-insert-panel');
        if (!panelEl) return;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - imageInsertDragOffsetX));
        const nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - imageInsertDragOffsetY));
        panelEl.style.left = nextLeft + 'px';
        panelEl.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
        imageInsertDragging = false;
    });
}

function focusImageInsertPasteZone() {
    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
}

function handleImageInsertFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    readImageFileForInsertModal(file);
    if (event && event.target) event.target.value = '';
}

function readImageFileForInsertModal(file) {
    if (!file || String(file.type || '').indexOf('image') !== 0) {
        setImageInsertStatus('Please select an image file.', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = function () {
        imageInsertCurrentDataUrl = String(reader.result || '');
        imageInsertCurrentFileName = file.name || ('upload_' + Date.now() + '.png');
        clearImageInsertInternalSavedState();
        imageInsertChangedByCrop = false;
        setImageInsertPreview(imageInsertCurrentDataUrl);
        renderImageInsertInternalInfo();
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    };
    reader.readAsDataURL(file);
}

function onImageInsertUploadDragOver(event) {
    if (!event) return;
    event.preventDefault();
    const zone = document.getElementById('img-insert-upload-zone');
    if (zone) {
        zone.classList.add('bg-indigo-50');
        zone.classList.add('dark:bg-indigo-900/30');
    }
}

function onImageInsertUploadDragLeave(event) {
    if (event) event.preventDefault();
    const zone = document.getElementById('img-insert-upload-zone');
    if (zone) {
        zone.classList.remove('bg-indigo-50');
        zone.classList.remove('dark:bg-indigo-900/30');
    }
}

function onImageInsertUploadDrop(event) {
    if (!event) return;
    event.preventDefault();
    onImageInsertUploadDragLeave(event);
    const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    if (!file) {
        setImageInsertStatus('No file was dropped.', true);
        return;
    }
    readImageFileForInsertModal(file);
}

function getCropPageUrlForImageInsert() {
    try {
        return new URL('crop.html', document.baseURI || window.location.href).href;
    } catch (e) {
        return './crop.html';
    }
}

function cropImageInsertCurrent() {
    if (!imageInsertCurrentDataUrl) {
        setImageInsertStatus('Select or paste an image before cropping.', true);
        return;
    }
    imageInsertCropWindow = window.open(getCropPageUrlForImageInsert(), 'img_insert_crop', 'width=700,height=620,scrollbars=yes,resizable=yes');
    if (!imageInsertCropWindow) {
        setImageInsertStatus('Failed to open crop window. Please allow popups and try again.', true);
        return;
    }
    try { imageInsertCropWindow.focus(); } catch (e) {}
    try { imageInsertCropWindow.postMessage({ type: 'crop', image: imageInsertCurrentDataUrl }, '*'); } catch (e) {}
}

async function uploadImageInsertToImgbb() {
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        try { await ensureImageInsertDataUrlFromInternalSelection(); } catch (e) {}
    }
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        setImageInsertStatus('Select or paste an image before uploading.', true);
        return;
    }
    const apiKey = String(getImgbbApiKey() || '').trim();
    if (!apiKey) {
        setImageInsertStatus('imgBB API key is missing. Please save it in settings first.', true);
        return;
    }
    setImageInsertStatus('Uploading to imgBB...', false);
    setImageUploadProgress(0, true);
    try {
        const comma = imageInsertCurrentDataUrl.indexOf(',');
        const base64Data = comma >= 0 ? imageInsertCurrentDataUrl.slice(comma + 1) : imageInsertCurrentDataUrl;
        const form = new FormData();
        form.append('image', base64Data);
        form.append('name', 'img_insert_' + Date.now());

        const payload = await new Promise(function (resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), true);
            xhr.upload.onprogress = function (ev) {
                if (!ev || !ev.lengthComputable) return;
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setImageUploadProgress(pct, true);
                setImageInsertStatus('Uploading to imgBB... ' + pct + '%', false);
            };
            xhr.onload = function () {
                try {
                    const data = JSON.parse(xhr.responseText || '{}');
                    if (xhr.status >= 200 && xhr.status < 300 && data && data.success !== false) resolve(data);
                    else {
                        const msg = data && data.error && data.error.message ? data.error.message : ('imgBB upload failed (' + xhr.status + ')');
                        reject(new Error(msg));
                    }
                } catch (e) {
                    reject(e);
                }
            };
            xhr.onerror = function () { reject(new Error('Network error during imgBB upload.')); };
            xhr.send(form);
        });

        const data = payload.data || {};
        const directUrl = data.url || (data.image && data.image.url) || data.display_url || '';
        const input = document.getElementById('img-insert-url');
        if (input) input.value = directUrl || '';
        setImageUploadProgress(100, false);
        setImageInsertStatus(directUrl ? ('Upload complete: ' + directUrl) : 'Upload complete.', false);
    } catch (e) {
        setImageUploadProgress(0, false);
        setImageInsertStatus('imgBB upload failed: ' + (e && e.message ? e.message : e), true);
    }
}

async function saveImageInsertToInternalDb() {
    if (!db) {
        setImageInsertStatus('Database is not ready yet.', true);
        return;
    }
    if (!window.ImageDB || typeof window.ImageDB.saveDataUrl !== 'function') {
        setImageInsertStatus('ImageDB module is not available.', true);
        return;
    }
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        setImageInsertStatus('Select or paste an image before saving internally.', true);
        return;
    }
    const nowFingerprint = getImageInsertFingerprint(imageInsertCurrentDataUrl);
    if (imageInsertSavedInternalUrl) {
        if (imageInsertSavedFingerprint === nowFingerprint) {
            const inputEl = document.getElementById('img-insert-url');
            if (inputEl) inputEl.value = imageInsertSavedInternalUrl;
            setImageInsertStatus('Already saved internally. Reusing the existing internal link.', false);
            renderImageInsertInternalInfo();
            return;
        }
        if (!imageInsertChangedByCrop) {
            setImageInsertStatus('An internal link already exists. Delete the saved internal image first to save a new one.', true);
            return;
        }
    }
    try {
        const saved = await window.ImageDB.saveDataUrl(db, imageInsertCurrentDataUrl, {
            name: imageInsertCurrentFileName || ('internal_' + Date.now() + '.png')
        });
        const input = document.getElementById('img-insert-url');
        if (input) input.value = saved.url;
        imageInsertSavedInternalId = saved.id;
        imageInsertSavedInternalUrl = saved.url;
        imageInsertSavedFingerprint = nowFingerprint;
        imageInsertChangedByCrop = false;
        renderImageInsertInternalInfo();
        setImageInsertStatus('Saved to internal image DB. Insert with Markdown/HTML buttons.', false);
        if (imageInsertGalleryOpen) loadImageInsertGallery();
        showToast('Image saved to internal DB.');
    } catch (e) {
        setImageInsertStatus('Failed to save image internally: ' + (e && e.message ? e.message : e), true);
    }
}

async function deleteSavedInternalImage() {
    if (!db || !imageInsertSavedInternalId) return;
    try {
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').delete(imageInsertSavedInternalId);
        await new Promise(function (resolve, reject) {
            tx.oncomplete = resolve;
            tx.onerror = function () { reject(tx.error || new Error('Failed to delete image.')); };
        });
        clearImageInsertInternalSavedState();
        imageInsertChangedByCrop = false;
        const input = document.getElementById('img-insert-url');
        if (input && String(input.value || '').trim().startsWith('internal://')) input.value = '';
        renderImageInsertInternalInfo();
        if (imageInsertGalleryOpen) loadImageInsertGallery();
        setImageInsertStatus('Deleted saved internal image. You can save a new internal image now.', false);
    } catch (e) {
        setImageInsertStatus('Failed to delete saved internal image: ' + (e && e.message ? e.message : e), true);
    }
}

function insertImageFromModal(type) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const urlInput = document.getElementById('img-insert-url');
    const url = String(urlInput && urlInput.value ? urlInput.value : '').trim();
    const source = url || imageInsertCurrentDataUrl;
    if (!source) {
        setImageInsertStatus('Enter an image URL or upload an image first.', true);
        return;
    }
    const alt = getImageAltTextFromUrl(source);
    if (type === 'html') insertHtmlImageAtCursor(source, alt);
    else insertMarkdownImageAtCursor(source, alt);
    closeImageInsertModal();
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
            showToast('ID를 입력해 주세요.');
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
    pageScale = Math.max(0.5, Math.min(3.0, pageScale + delta));

    // Use zoom to correctly scale layout without clipping bugs
    viewer.style.zoom = pageScale;
    editorTextarea.style.zoom = pageScale;

    // Clear any previous transform styles
    viewer.style.transform = "none";

    document.getElementById('scale-display').textContent = `${Math.round(pageScale * 100)}%`;
}

function adjustFontSize(delta) {
    fontSize = Math.max(10, Math.min(48, fontSize + delta));
    viewer.style.fontSize = `${fontSize}px`;
    editorTextarea.style.fontSize = `${fontSize}px`;
    document.getElementById('font-size-display').textContent = `${fontSize}px`;
}

function sanitizeUiMessage(msg) {
    const text = String(msg == null ? '' : msg);
    if (!text) return '';
    const qCount = (text.match(/\?/g) || []).length;
    const bad = text.includes('�') || text.includes('???') || (text.length >= 12 && (qCount / text.length) > 0.2);
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

function applyScholarSearchVisibility(settings) {
    const enabled = getScholarSearchVisibleFromSettings(settings || {});
    const wrap = document.getElementById('header-scholar-search-wrap');
    if (wrap) {
        if (enabled) {
            wrap.classList.remove('hidden');
            wrap.classList.add('flex');
            wrap.style.display = 'flex';
        } else {
            wrap.classList.add('hidden');
            wrap.classList.remove('flex');
            wrap.style.display = 'none';
        }
    }
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

function toggleScholarRefPanel() {
    if (window.ScholarRef && typeof window.ScholarRef.togglePanel === 'function') {
        window.ScholarRef.togglePanel();
    }
}

function switchScholarRefTab(index) {
    if (window.ScholarRef && typeof window.ScholarRef.switchTab === 'function') {
        window.ScholarRef.switchTab(index);
    }
}

function setScholarRefInputMode(mode) {
    if (window.ScholarRef && typeof window.ScholarRef.setInputMode === 'function') {
        window.ScholarRef.setInputMode(mode);
    }
}

function scholarRefApplyInput() {
    if (window.ScholarRef && typeof window.ScholarRef.applyInput === 'function') {
        window.ScholarRef.applyInput();
    }
}

function scholarRefClearInput() {
    if (window.ScholarRef && typeof window.ScholarRef.clearInput === 'function') {
        window.ScholarRef.clearInput();
    }
}

function openScholarRefTxtImport() {
    if (window.ScholarRef && typeof window.ScholarRef.openTxtImport === 'function') {
        window.ScholarRef.openTxtImport();
    }
}

function openScholarRefMdImport() {
    if (window.ScholarRef && typeof window.ScholarRef.openMdImport === 'function') {
        window.ScholarRef.openMdImport();
    }
}

function importScholarRefTxt(event) {
    if (window.ScholarRef && typeof window.ScholarRef.importTxt === 'function') {
        window.ScholarRef.importTxt(event);
    }
}

function importScholarRefMd(event) {
    if (window.ScholarRef && typeof window.ScholarRef.importMd === 'function') {
        window.ScholarRef.importMd(event);
    }
}

function renderScholarRefSelectionList() {
    if (window.ScholarRef && typeof window.ScholarRef.renderSelectionList === 'function') {
        window.ScholarRef.renderSelectionList();
    }
}

function toggleScholarRefPick(id, checked) {
    if (window.ScholarRef && typeof window.ScholarRef.togglePick === 'function') {
        window.ScholarRef.togglePick(id, checked);
    }
}

function selectAllScholarRefs() {
    if (window.ScholarRef && typeof window.ScholarRef.selectAllFiltered === 'function') {
        window.ScholarRef.selectAllFiltered();
    }
}

function clearScholarRefSelection() {
    if (window.ScholarRef && typeof window.ScholarRef.clearSelection === 'function') {
        window.ScholarRef.clearSelection();
    }
}

function insertSelectedScholarRefs() {
    if (window.ScholarRef && typeof window.ScholarRef.insertSelected === 'function') {
        window.ScholarRef.insertSelected();
    }
}

function insertAllScholarRefSection() {
    if (window.ScholarRef && typeof window.ScholarRef.insertAllSection === 'function') {
        window.ScholarRef.insertAllSection();
    }
}

function downloadScholarRefTxt() {
    if (window.ScholarRef && typeof window.ScholarRef.downloadTxt === 'function') {
        window.ScholarRef.downloadTxt();
    }
}

function downloadScholarRefMd() {
    if (window.ScholarRef && typeof window.ScholarRef.downloadMd === 'function') {
        window.ScholarRef.downloadMd();
    }
}

function openScholarRefListWindow() {
    if (window.ScholarRef && typeof window.ScholarRef.openListWindow === 'function') {
        window.ScholarRef.openListWindow();
    }
}

function deleteScholarRefItem(id) {
    if (window.ScholarRef && typeof window.ScholarRef.deleteOne === 'function') {
        window.ScholarRef.deleteOne(id);
    }
}

function clearAllScholarRefs() {
    if (window.ScholarRef && typeof window.ScholarRef.clearAll === 'function') {
        window.ScholarRef.clearAll();
    }
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
    applyHighlightPopupLayout();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(syncHighlightSelectionToPopup, 0);
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
    if (check && section) section.classList.toggle('hidden', !check.checked);
    if (check && check.checked) {
        setAiSettings({ aiMasterEnabled: true }).then(() => applyAiFeatureVisibility());
    } else if (check && !check.checked) {
        setAiSettings({ aiMasterEnabled: false }).then(() => applyAiFeatureVisibility());
    }
    if (check && check.checked && section) {
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
    const imgbbKeyInput = document.getElementById('ai-imgbb-api-key');
    const imgbbKey = (imgbbKeyInput && imgbbKeyInput.value) ? imgbbKeyInput.value.trim() : '';
    await setAiSettings({
        scholarAI: !!scholarOn,
        sspimgAI: !!sspimgOn,
        githubEnabled: !!(githubEl && githubEl.checked),
        scholarSearchVisible: scholarSearchVisible,
        highlightVisible: highlightVisible,
        imageUploadEnabled: imageUploadEnabled,
        enterButtonInsertBr: enterButtonInsertBrEnabled,
        imgbbApiKey: imgbbKey
    });
    if (imgbbKey) localStorage.setItem('ss_imgbb_api_key', imgbbKey);
    else localStorage.removeItem('ss_imgbb_api_key');
}

async function closeSettingsModal() {
    await persistAiSettingsFromModal();
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
    await applyAiFeatureVisibility();
}

function readAiUserInfoFromModal() {
    const name = ((document.getElementById('ai-user-name') && document.getElementById('ai-user-name').value) || '').trim();
    const id = ((document.getElementById('ai-user-id') && document.getElementById('ai-user-id').value) || '').trim();
    const major = ((document.getElementById('ai-user-major') && document.getElementById('ai-user-major').value) || '').trim();
    const contact = ((document.getElementById('ai-user-contact') && document.getElementById('ai-user-contact').value) || '').trim();
    const email = ((document.getElementById('ai-user-email') && document.getElementById('ai-user-email').value) || '').trim();
    return { name, id, major, contact, email };
}

async function saveAiUserInfo() {
    const fb = document.getElementById('ai-user-info-feedback');
    if (fb) fb.textContent = '';
    if (!db) {
        showToast('Storage is not ready yet. Please try again.');
        return;
    }
    const userInfo = readAiUserInfoFromModal();
    if (!userInfo.name && !userInfo.id && !userInfo.major && !userInfo.contact && !userInfo.email) {
        if (fb) fb.textContent = 'Please enter at least one user info field.';
        showToast('No input provided.');
        return;
    }
    await setAiSettings({ userInfo });
    if (fb) fb.textContent = 'User info saved.';
    showToast('Saved user info.');
}

async function sendAuthRequestMail() {
    const { name, id, major, contact, email } = readAiUserInfoFromModal();
    const userInfo = { name, id, major, contact, email };
    await setAiSettings({ userInfo });
    const body = `Requesting verification code with user information.\n\nName: ${name}\nStudent ID: ${id}\nMajor: ${major}\nContact: ${contact}\nEmail: ${email}`;
    const subject = 'MDproViewer AI access verification request';
    const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
        '&to=' + encodeURIComponent(AUTH_REQUEST_EMAIL) +
        '&su=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    showToast("Opened Gmail compose window.");
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
            const anyOpen = (sch && sch.classList.contains('open')) || (ssp && ssp.classList.contains('open'));
            if (!anyOpen) {
                wrap.classList.add('hidden');
                wrap.style.width = '0';
                wrap.style.display = 'none';
            }
        }
    }
    if (showAi) ensureSidebarAILoaded();
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    applyScholarSearchVisibility(settings || { scholarSearchVisible: false });
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
    wrap.classList.remove('hidden');
    wrap.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'flex-shrink:0',
        'align-self:stretch',
        'width:' + width + 'px',
        'min-width:0',
        'max-width:96vw',
        'min-height:0',
        'height:auto',
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
    if (!schOpen && !sspOpen) {
        wrap.classList.add('hidden');
        wrap.style.cssText = 'width:0!important;min-width:0!important;max-width:0!important;display:none!important;flex:0!important;overflow:hidden!important;border:none!important;box-shadow:none!important;padding:0!important;margin:0!important;';
        updateHeaderAiButtonsActive();
        return;
    }
    var w = 400;
    if (schOpen && sspOpen) {
        var sw = (sch && sch.offsetWidth > 80) ? sch.offsetWidth : 380;
        var pw = (ssp && ssp.offsetWidth > 80) ? ssp.offsetWidth : 400;
        w = Math.min(Math.max(sw + pw, 720), Math.floor(window.innerWidth * 0.96));
    } else if (schOpen) w = Math.max(360, Math.min((sch && sch.offsetWidth) || 380, 520));
    else if (sspOpen) w = Math.max(360, Math.min((ssp && ssp.offsetWidth) || 400, 520));
    w = Math.min(w, Math.floor(window.innerWidth * 0.96));
    var sidebarLeft = document.getElementById('sidebar');
    var leftW = sidebarLeft ? sidebarLeft.offsetWidth : 0;
    var minMain = 260;
    var maxAi = Math.max(300, window.innerWidth - leftW - minMain);
    w = Math.min(w, maxAi);
    const isDark = document.documentElement.classList.contains('dark');
    wrap.classList.remove('hidden');
    wrap.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'flex-shrink:0',
        'align-self:stretch',
        'width:' + w + 'px',
        'min-width:0',
        'max-width:96vw',
        'min-height:0',
        'height:auto',
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
        inner.style.overflowX = schOpen && sspOpen ? 'auto' : 'hidden';
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
    function tryCb() {
        if (document.getElementById('scholar-ai-sidebar') && typeof window.toggleScholarAI === 'function') {
            cb();
            return true;
        }
        return false;
    }
    if (tryCb()) return;
    ensureSidebarAILoaded();
    if (tryCb()) return;
    var n = 0;
    var t = setInterval(function () {
        n++;
        if (n === 8 || n === 24) injectSidebarAIHtml();
        if (tryCb()) {
            clearInterval(t);
            return;
        }
        if (n > 100) {
            clearInterval(t);
            injectSidebarAIHtml().then(function (ok) {
                if (tryCb()) return;
                showToast(ok === false ? 'Failed to load AI sidebar HTML. Check file path and server context.' : 'AI sidebar initialized with fallback mode.');
            });
        }
    }, 50);
}

function openScholarAIFromHeader() {
    getAiSettings().then(function (s) {
        if (!s || !s.verified) {
            showToast('Verification is required first. Open Settings and complete verification.');
            return;
        }
        setAiSidebarWrapVisible(380, true);
        ensureSidebarAILoaded();
        ensureSidebarAILoadedThen(function () {
        var scholar = document.getElementById('scholar-ai-sidebar');
        var ssp = document.getElementById('ssp-ai-sidebar');
        if (!scholar) return;
        if (scholar.classList.contains('open')) {
            if (typeof scholarAIShrink === 'function') scholarAIShrink();
            else scholar.classList.remove('open');
            refreshAiRightSidebarWrap();
            return;
        }
        if (!scholar.classList.contains('open') && typeof toggleScholarAI === 'function') toggleScholarAI();
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
        ensureSidebarAILoaded();
        ensureSidebarAILoadedThen(function () {
        var ssp = document.getElementById('ssp-ai-sidebar');
        var scholar = document.getElementById('scholar-ai-sidebar');
        if (!ssp) return;
        if (ssp.classList.contains('open')) {
            if (typeof sspAIShrink === 'function') sspAIShrink();
            else ssp.classList.remove('open');
            refreshAiRightSidebarWrap();
            return;
        }
        if (!ssp.classList.contains('open') && typeof toggleViewerSSP === 'function') toggleViewerSSP();
        refreshAiRightSidebarWrap();
        requestAnimationFrame(function () {
            requestAnimationFrame(refreshAiRightSidebarWrap);
        });
        });
    });
}

function openImageUploadTool() {
    setAiSidebarWrapVisible(400, true);
    ensureSidebarAILoaded();
    ensureSidebarAILoadedThen(function () {
        var ssp = document.getElementById('ssp-ai-sidebar');
        if (!ssp) return;
        if (!ssp.classList.contains('open') && typeof toggleViewerSSP === 'function') toggleViewerSSP();
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
        cropEditorBase: './',
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
                        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
                let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!res.ok && res.status === 400) {
                    payload.generationConfig = genLite;
                    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
            },
            getScholarAISystemInstruction: function () { return localStorage.getItem('ss_scholar_ai_system') || ''; },
            setScholarAISystemInstruction: function (text) { localStorage.setItem('ss_scholar_ai_system', text || ''); },
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
    try {
        script.src = new URL('./sidebarAI/sidebar-ai.js', base).href;
    } catch (e) {
        script.src = './sidebarAI/sidebar-ai.js';
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
    try {
        if (typeof window.getSidebarAIHtml === 'function') {
            const inlineHtml = window.getSidebarAIHtml();
            if (applyHtml(inlineHtml)) return Promise.resolve(true);
        }
    } catch (e) {}
    const tryFetch = function (u) {
        return fetch(u).then(function (r) {
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
        const enterBrCheckEmpty = document.getElementById('enter-button-insert-br');
        const localEnterBr = getEnterButtonInsertBrFromLocal();
        if (enterBrCheckEmpty) enterBrCheckEmpty.checked = localEnterBr;
        enterButtonInsertBr = localEnterBr;
        const imageInputEmpty = document.getElementById('ai-imgbb-api-key');
        if (imageInputEmpty) imageInputEmpty.value = '';
        syncImgbbApiKeyInputs('');
        updateAiScholarSspimgAvailability(false);
        applyImageUploadFeatureVisibility({ imageUploadEnabled: false });
        applyScholarSearchVisibility({ scholarSearchVisible: false });
        applyHighlightVisibility({ highlightVisible: false });
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
    const enterBrCheck = document.getElementById('enter-button-insert-br');
    const enterBrEnabled = settings.enterButtonInsertBr === true || getEnterButtonInsertBrFromLocal();
    if (enterBrCheck) enterBrCheck.checked = enterBrEnabled;
    enterButtonInsertBr = enterBrEnabled;
    const imageKeyInput = document.getElementById('ai-imgbb-api-key');
    if (imageKeyInput) imageKeyInput.value = settings.imgbbApiKey || '';
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
    if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
    if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
    if (githubEl) githubEl.checked = !!settings.githubEnabled;
    updateAiScholarSspimgAvailability(verified);
    const nameEl = document.getElementById('ai-user-name');
    const idEl = document.getElementById('ai-user-id');
    const majorEl = document.getElementById('ai-user-major');
    const contactEl = document.getElementById('ai-user-contact');
    const emailEl = document.getElementById('ai-user-email');
    if (settings.userInfo) {
        if (nameEl) nameEl.value = settings.userInfo.name || '';
        if (idEl) idEl.value = settings.userInfo.id || '';
        if (majorEl) majorEl.value = settings.userInfo.major || '';
        if (contactEl) contactEl.value = settings.userInfo.contact || '';
        if (emailEl) emailEl.value = settings.userInfo.email || '';
    }
    applyImageUploadFeatureVisibility(settings);
    applyScholarSearchVisibility(settings);
}

async function initAiVisibility() {
    const settings = await getAiSettings();
    const useCheck = document.getElementById('ai-use-checkbox');
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const verified = !!(settings && settings.verified);
    if (settings) {
        if (useCheck) {
            if (settings.aiMasterEnabled === false) useCheck.checked = false;
            else useCheck.checked = !!(settings.verified || settings.passwordHash);
        }
        if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
        if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
    } else {
        if (scholarEl) scholarEl.checked = false;
        if (sspimgEl) sspimgEl.checked = false;
    }
    enterButtonInsertBr = !!((settings && settings.enterButtonInsertBr === true) || getEnterButtonInsertBrFromLocal());
    updateAiScholarSspimgAvailability(verified);
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    applyScholarSearchVisibility(settings || { scholarSearchVisible: false });
    applyHighlightVisibility(settings || { highlightVisible: false });
    await applyAiFeatureVisibility();
}

function openSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
    loadAiSettingsToUI();
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

function insertHtmlImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('Use this in edit mode.');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('Enter an image URL.');
        return;
    }
    const safeUrl = u.replace(/"/g, '&quot;').replace(/[<>]/g, '');
    const alt = String(altText || 'image')
        .trim()
        .replace(/"/g, '&quot;')
        .replace(/[<>]/g, '') || 'image';
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const prefix = before.length > 0 && !before.endsWith('\n\n')
        ? (before.endsWith('\n') ? '\n' : '\n\n')
        : '';
    const html = prefix + '<img src="' + safeUrl + '" alt="' + alt + '" border="0">' + '\n\n';
    ta.focus();
    if (typeof ta.setRangeText === 'function') {
        ta.setRangeText(html, start, end, 'end');
    } else {
        document.execCommand('insertText', false, html);
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('HTML image tag inserted.');
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
                updatedAt: new Date()
            };

            const tx = db.transaction('documents', 'readwrite');
            tx.objectStore('documents').put(doc);
            tx.oncomplete = () => {
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
window.toggleSidebarVisibility = toggleSidebarVisibility;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.ensureRootFolder = ensureRootFolder;
window.createNewFolder = createNewFolder;
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
window.insertUserInfoAtCursor = insertUserInfoAtCursor;
window.toggleEnterButtonInsertBrSetting = toggleEnterButtonInsertBrSetting;
window.insertMarkdownImageAtCursor = insertMarkdownImageAtCursor;
window.insertHtmlImageAtCursor = insertHtmlImageAtCursor;
window.openImageInsertModal = openImageInsertModal;
window.closeImageInsertModal = closeImageInsertModal;
window.toggleImageInsertDockRight = toggleImageInsertDockRight;
window.openImageInsertExternalLink = openImageInsertExternalLink;
window.focusImageInsertPasteZone = focusImageInsertPasteZone;
window.handleImageInsertFile = handleImageInsertFile;
window.onImageInsertUploadDragOver = onImageInsertUploadDragOver;
window.onImageInsertUploadDragLeave = onImageInsertUploadDragLeave;
window.onImageInsertUploadDrop = onImageInsertUploadDrop;
window.cropImageInsertCurrent = cropImageInsertCurrent;
window.uploadImageInsertToImgbb = uploadImageInsertToImgbb;
window.saveImageInsertToInternalDb = saveImageInsertToInternalDb;
window.toggleImageInsertGallery = toggleImageInsertGallery;
window.refreshImageInsertGallery = refreshImageInsertGallery;
window.downloadImageInsertGalleryZip = downloadImageInsertGalleryZip;
window.insertImageFromModal = insertImageFromModal;
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
window.validateApiKeyInputUI = validateApiKeyInputUI;
window.saveAiPassword = saveAiPassword;
window.sendAuthRequestMail = sendAuthRequestMail;
window.saveAiUserInfo = saveAiUserInfo;
window.applyAiFeatureVisibility = applyAiFeatureVisibility;
window.onAiFeatureCheckboxChange = onAiFeatureCheckboxChange;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteModal = confirmDeleteModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.applyCodeColorSettings = applyCodeColorSettings;
window.resetCodeColorSettings = resetCodeColorSettings;
window.clearUnusedCache = clearUnusedCache;
window.switchSidebarTab = switchSidebarTab;
window.renderTOC = renderTOC;
window.scrollToLine = scrollToLine;
window.applyHeading = applyHeading;
window.insertListAtSelection = insertListAtSelection;
window.handleTableInsertion = handleTableInsertion;
window.convertSelectionPatternToTable = convertSelectionPatternToTable;
window.convertSelectionMarkdownToHtml = convertSelectionMarkdownToHtml;
window.insertLiteralAtCursor = insertLiteralAtCursor;
window.insertFootnoteTemplate = insertFootnoteTemplate;
window.openTextStyleModal = openTextStyleModal;
window.closeTextStyleModal = closeTextStyleModal;
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

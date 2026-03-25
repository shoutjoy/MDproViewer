// IndexedDB Logic
const DB_NAME = "MarkdownProDB";
const DB_VERSION = 2;
let db;

const AI_SETTINGS_KEY = 'ai_settings';
/** ???????嫄?????????????釉랁닑??????????紐껊뭸?????????????????됰뼸?????????癲ル슢?싩땟?????????????椰????????????????傭?끆?????용벥???????SHA-256 ??????????濡?씀?濾????(????????????????????????????????????ㅼ뒧???嫄?????? ???????????롮쾸?椰???? */
const AI_PASSWORD_HASH = 'dc98e82fcfb4b165f5fa390d5ca61a9245a5be6ea70a4f00020ddff029afefba';
const AUTH_REQUEST_EMAIL = 'shoutjoy1@yonsei.ac.kr';

// State
let currentMarkdown = "";
let currentFileName = "??????????md";
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
let imageInsertCropWindow = null;
let imageInsertCropBound = false;
let imageInsertDockRight = false;
let imageInsertDragBound = false;
let imageInsertDragging = false;
let imageInsertDragOffsetX = 0;
let imageInsertDragOffsetY = 0;
let scholarSearchDockRight = true;
let scholarSearchShrink = false;
let viewClickMappedCaretPos = null;
let lastEditCaretPos = 0;

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

// initDB ??onload ????????????????????????釉먮폁????????????????????????밸븶筌믩끃??獄???????멥렑???????????????????耀붾굝????????????????????????? ????????遺얘턁????????
if (editorTextarea) {
    editorTextarea.addEventListener('paste', function () {
        receivedExternalContent = true;
    }, true);
}

/** NotebookLM ????? ?????????????????????????⑤벡???????????(onload ????????????諛몃마嶺뚮?????????????硫λ젒?????????癲ル슢?????? */
let pendingExternalContent = null;
let receivedExternalContent = false;
/** NotebookLM??????????????숈춻??????????嫄??????????????????????거?????????????????????諛몃마嶺뚮?????????????硫λ젒???????????????????댁뢿援???????????????⑤벡?????????'=' ?????????????????붺몭???????????????濚밸Ŧ????'-'????????饔낅떽?????怨뚮옩鴉??????*/
let notebookLmEqualsHrPreprocess = false;
const EXTERNAL_LOAD_TYPES = ['mdViewerLoad', 'notebooklm', 'notebooklm-export', 'loadMarkdown'];
const NOTEBOOKLM_ORIGINS = ['https://notebooklm.google.com', 'https://aistudio.google.com'];

window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;

    // 1?? scholarToMDPaste ?????????嫄??????????????postMessage ????????????????????????readClipboard/useClipboard)
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
    const openerOk = window.opener && ev.source === window.opener; // ???????????繹먮끍???????????????????????????
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
        if (typeof showToast === 'function') showToast("?????????????????꿔꺂??????????????????????????????????????????????살몝??");
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

        // ??????????거????????????????????????????⑤벡???????븐뼐???????????????袁⑸즴筌?씛彛??????????椰??????????????椰????????????? ???????????롮쾸?椰????(NotebookLM ????? ??????????????)
        if (pendingExternalContent) {
            loadFromExternalContent(pendingExternalContent.content, pendingExternalContent.title, {
                notebookLmSeparators: !!pendingExternalContent.notebookLmSeparators
            });
            pendingExternalContent = null;
            if (typeof showToast === 'function') showToast("?????????????????꿔꺂??????????????????????????????????????????????살몝??");
        } else if (!receivedExternalContent) {
            const urlContent = tryLoadFromUrl();
            if (!urlContent) updateContent('');
        }

        // ??? ??????????????????釉먮폁????????????????????? onload??????????⑤벡???????????????Β?щ엠?????饔낅떽?????? ????textarea??????????????????????????癲ル슢?싩땟???????????????????
        if (editorTextarea && currentMarkdown !== editorTextarea.value) {
            editorTextarea.value = currentMarkdown;
        }
        renderMarkdown();
        renderTOC();

        if (isEditMode && editorTextarea) editorTextarea.focus();

        if (sidebar) sidebar.style.display = 'none';

        initAiVisibility();

    if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.on('open-external-file', (event, data) => {
            setCurrentDocumentInfo(data.fileName, data.filePath);
            updateContent(data.content);
            showToast("??? ?????????????????꿔꺂???????????????");
        });
        // ???????????????????????????????????????ル??????????椰??????????????遺얘턁???????猷몄굣?????????????????????癲ル슢?싩땟?????????(????????????????????????????????????????ㅻ쑋???
        window.electron.ipcRenderer.invoke('get-initial-file').then(function (data) {
            if (data && data.fileName && data.content !== undefined) {
                setCurrentDocumentInfo(data.fileName, data.filePath);
                updateContent(data.content);
                showToast("?????????????????꿔꺂???????????????");
            }
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

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
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
                    setImageInsertPreview(imageInsertCurrentDataUrl);
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
            showToast("?????????????숈춻????????濡?씀?濾??꿔꺂??짰爾??????????????쎛 ??????????⑤벡?????????癲ル슢?싩땟???????????????????????????????살몝??");
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
    } catch (e) {
        console.error('???????耀붾굝??????????????????????嶺??', e);
        if (typeof showToast === 'function') showToast('???????耀붾굝????????????????????????嶺???????????? ?????????썹땟戮녹??諭?????⑸㎦?????????????????耀붾굝???????????????????????????????살몝?? ??????????밸븶筌믩끃??獄???????멥렑???????????嫄???????????????????거??????????????????ㅻ쑋????');
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

/** ??????????⑤벡???????? ?????????????????? ??= ????????????野껊챶??????????????? **??????????* ???????marked */
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
        const target = event.target && event.target.closest ? event.target.closest('a[href^="#md-footnote-"], a[href^="#md-footnote-ref-"]') : null;
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
        try { if (typeof renderMathInMarkdownViewer === 'function') renderMathInMarkdownViewer(viewer); } catch (e) {}
        try { updatePreviewPopupContent(); } catch (e) {}
    }
    try {
        preprocessed = preprocessMarkdownForView(raw);
        if (typeof marked === 'undefined' || !marked.parse) {
            viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
            return;
        }
        const out = marked.parse(preprocessed);
        if (out != null && typeof out.then === 'function') {
            out.then(function (h) {
                viewer.innerHTML = h || '';
                runPostRenderHooks();
            }).catch(function () {
                try {
                    const fallback = marked.parse(raw);
                    viewer.innerHTML = (fallback && typeof fallback.then === 'function') ? '' : (fallback || '');
                    if (fallback && typeof fallback.then === 'function') {
                        fallback.then(function (html) {
                            viewer.innerHTML = html || '';
                            runPostRenderHooks();
                        }).catch(function () {
                            viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                            runPostRenderHooks();
                        });
                        return;
                    }
                    runPostRenderHooks();
                } catch (e) {
                    viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
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
                const fallback = marked.parse(raw);
                if (fallback != null && typeof fallback.then === 'function') {
                    fallback.then(function (h) {
                        viewer.innerHTML = h || '';
                        runPostRenderHooks();
                    }).catch(function () {
                        viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
                        runPostRenderHooks();
                    });
                    return;
                }
                viewer.innerHTML = fallback || '';
                runPostRenderHooks();
                return;
            }
        } catch (innerErr) {}
        viewer.innerHTML = '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        runPostRenderHooks();
    }
}

function isPreviewPopupAlive() {
    return !!(previewPopupWindow && !previewPopupWindow.closed);
}

function onPreviewPopupClosed() {
    previewPopupWindow = null;
}

function closePreviewPopupWindow() {
    if (!isPreviewPopupAlive()) {
        previewPopupWindow = null;
        return;
    }
    previewPopupWindow.close();
    previewPopupWindow = null;
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
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(-0.1)\">?????????</button>'
        + '<span id=\"pv-scale-label\" class=\"label\">100%</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustScale(0.1)\">?????????</button>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(-1)\">??????????耀붾굝???????</button>'
        + '<span id=\"pv-font-label\" class=\"label\">16px</span>'
        + '<button type=\"button\" onclick=\"window.opener&&window.opener.previewPopupAdjustFontSize(1)\">??????????耀붾굝???????</button>'
        + '<button type=\"button\" style=\"margin-left:auto\" onclick=\"window.close()\">???????/button>'
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
        const preprocessed = preprocessMarkdownForView(raw);
        if (typeof marked === 'undefined' || !marked.parse) {
            html = '<p>' + escapeHtmlForPreview(raw).replace(/\n/g, '<br>') + '</p>';
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
        showToast('????????熬곣뫖利당춯??쎾퐲????????????????????????椰???????????⑤벡瑜??????????????嶺뚮씮??????????????? ????????熬곣뫖利당춯??쎾퐲????????????????????????????????????繹먮굞???????????????????덉떻???????????거????????????????거??????????????????ㅻ쑋????');
        return;
    }

    try {
        previewPopupWindow.document.open();
        previewPopupWindow.document.write(getPreviewPopupDocumentHtml());
        previewPopupWindow.document.close();
    } catch (e) {
        showToast('???????????雅?굛肄??????됰Ŋ?????????????????耀붾굝????????????????????????嶺???????????? ?????????썹땟戮녹??諭?????⑸㎦?????????????????耀붾굝???????????????????????????????살몝??');
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
    const activeClasses = ['bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400'];
    if (!vc || !ec) {
        console.warn('toggleMode: viewer-container ?????content-viewport????????椰??????????????????????濡?씀?濾?????????????????살몝??', { vc: !!vc, ec: !!ec });
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

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) readFile(file);
}

function createNewFile() {
    currentMarkdown = "";
    setCurrentDocumentInfo("??????????md", null);
    updateContent("");
    performAutoSave();
    showToast("????????????????熬곣뫖利당춯??쎾퐲????????????????????");
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

function downloadMarkdownFile() {
    const bom = '\uFEFF';
    const blob = new Blob([bom, currentMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName.endsWith('.md') ? currentFileName : currentFileName + ".md";
    a.click();
    URL.revokeObjectURL(url);
}

function readFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const name = (file.name || '').toLowerCase();
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
        showToast("???????????????????????????????????????????????살몝??");
    };
    reader.readAsText(file, 'UTF-8');
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
    showToast("?????????썹땟戮녹??諭?????⑸㎦?????????????????????????????????꿔꺂???????????????⑤벡???????븐뼐???????????????????????????살몝??");
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
    if (searchInput) searchinput.value = '';
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
        selectedOnlyBtn.textContent = mergeListSelectedOnly ? 'Selected only' : 'Show all';
        selectedOnlyBtn.className = mergeListSelectedOnly
            ? 'flex-1 px-3 py-1.5 text-xs font-medium border border-indigo-600 dark:border-indigo-400 rounded-md text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
            : 'flex-1 px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700';
    }
    if (mergeListState.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">??????????ROOT)????????????????????밸븶筌믩끃??獄???????멥렑? ??????????濡?씀?濾?????????????????살몝??</p>';
        return;
    }
    const q = mergeListSearchQuery;
    const filtered = mergeListState
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => (!mergeListSelectedOnly || item.checked) && (!q || (item.title || '').toLowerCase().includes(q)));
    if (filtered.length === 0) {
        listEl.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">${mergeListSelectedOnly ? '??????????????????????????????????밸븶筌믩끃??獄???????멥렑? ??????????濡?씀?濾?????????????????살몝??' : '?????癲ル슢?싩땟??????????????癲ル슢?싩땟??????????????釉먮폁???????? ??????????濡?씀?濾?????????????????살몝??'}</p>`;
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
        showToast("????????????????????????????????嶺?????????거??????????????????ㅻ쑋????");
        if (nameInput) nameInput.focus();
        return;
    }
    const selected = mergeListState.filter(x => x.checked);
    if (selected.length === 0) {
        showToast("?????????????????????????꿔꺂????????????꿔꺂???⑸븶??????遺얘턁?????????????????????????????????????거??????????????????ㅻ쑋????");
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
        showToast("??????????????????????熬곣뫖利당춯??쎾퐲????????????????????");
        renderDBList();
        closeMergeModal();
        if (isSidebarHidden) toggleSidebarVisibility();
    };
}

async function exportZip() {
    if (!db || typeof JSZip === 'undefined') {
        showToast("ZIP ???????????????????????濡?씀?濾?????????????????살몝??");
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
    showToast("ZIP??????????????????留⑶뜮??????癲????????????");
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
    showToast("MPV(JSON)????????????留⑶뜮??????癲???????????? ???????嫄???????????? .json?????????????????썹땟戮녹??諭?????⑸㎦???????????????????嫄??????????븐뼐??????????ш끽維????????????거??????????");
}

async function saveCurrentFile() {
    if (!(window.electron && window.electron.ipcRenderer)) {
        downloadMarkdownFile();
        showToast("????????????????留⑶뜮??????癲????????????");
        return;
    }
    const result = await window.electron.ipcRenderer.invoke('save-current-file', {
        filePath: currentFilePath,
        fileName: getSaveCandidateFileName(),
        content: currentMarkdown
    });
    if (!result || result.canceled) return;
    if (result.error) {
        showToast(`?????????????????????????????곕춴?????????????????????살몝?? ${result.error}`);
        return;
    }
    setCurrentDocumentInfo(result.fileName, result.filePath);
    showToast("????????????????留⑶뜮??????癲????????????");
}

async function saveFileAs() {
    if (!(window.electron && window.electron.ipcRenderer)) {
        downloadMarkdownFile();
        showToast("?????????????????繹먮끍??????????????????????????留⑶뜮??????癲????????????");
        return;
    }
    const result = await window.electron.ipcRenderer.invoke('save-file-as', {
        filePath: currentFilePath,
        fileName: getSaveCandidateFileName(),
        content: currentMarkdown
    });
    if (!result || result.canceled) return;
    if (result.error) {
        showToast(`???????????繹먮끍??????????????????????????????????????곕춴?????????????????????살몝?? ${result.error}`);
        return;
    }
    setCurrentDocumentInfo(result.fileName, result.filePath);
    showToast("?????????????????繹먮끍??????????????????????????留⑶뜮??????癲????????????");
}

function saveFile() {
    return saveCurrentFile();
}

function syncPrintRootFromViewer() {
    const printRoot = document.getElementById('print-root');
    if (!printRoot || !viewer) return false;
    printRoot.innerHTML = '';
    const printable = document.createElement('div');
    printable.className = 'markdown-body print-area';
    printable.innerHTML = viewer.innerHTML;
    printRoot.appendChild(printable);
    return true;
}

function clearPrintRoot() {
    const printRoot = document.getElementById('print-root');
    if (!printRoot) return;
    printRoot.innerHTML = '';
}

function printPage() {
    if (isEditMode) toggleMode('view');
    setTimeout(() => {
        if (!syncPrintRootFromViewer()) {
            showToast('???????嫄???????????????????????????꿔꺂???????????????野껊챶????????븐뼐??????????????????????? ??????椰????????????????????');
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
        tocList.innerHTML = `<div class="p-2 text-center text-xs text-slate-400">??????椰??????????????椰????????????????怨쀫엥?????????????????????????ㅻ쑋???/div>`;
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
        tocHtml = '<div class="p-4 text-xs text-slate-400 text-center">?????????????椰??????????????椰????????????????怨쀫엥?????猷멥늾揶?????潁??癲??됀????ㅼ뒧????ㅼ뒩??? ??????????濡?씀?濾?????????????????살몝??<br>(# ????????거????????????猷고?????????癲?鶯???</div>';
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
            if (!req.result) store.add({ id: 'root', name: '??????????(root)' });
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
    input.value = '';

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
            showToast("??????????????????밸븶筌믩끃??獄???????멥렑? inDB????????????ㅼ뒭?????????????????⑤즾??????????????????????살몝??");
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

        const folderDiv = document.createElement('div');
        folderDiv.className = "mb-2";
        folderDiv.innerHTML = `
            <div class="flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter ${isSidebarCollapsed ? 'justify-center' : ''}">
                <i data-lucide="folder" class="w-3 h-3"></i> 
                <span class="sidebar-text">${folder.name}</span>
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
    const tx = db.transaction('documents', 'readonly');
    const doc = await new Promise(r => {
        const req = tx.objectStore('documents').get(id);
        req.onsuccess = () => r(req.result);
    });
    if (doc) {
        currentFileName = doc.title + ".md";
        fileNameDisplay.textContent = currentFileName;
        updateContent(doc.content);
        showToast("?????????????????꿔꺂??????????????????????????????????????????????살몝??");
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
        showToast("?????????????");
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
        showToast("??????????????????밸븶筌믩끃??獄???????멥렑? ??????????????");
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

/** ???????嫄????????????????????諛몃마嶺뚮?????????????硫λ젒????????????????????????????????????????????????????????釉먮폁???????????(??????????⑤벡????????????????????????????????????. ???????耀붾굝???????????????????????????????????? ????????遺얘턁????????????????????????????????*/
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
    if (typeof showToast === 'function') showToast("????????????????????????썹땟戮녹??諭?????⑸㎦??????????????猷몄굣????????????");
}

/** 2?? ??????????諛몃마嶺뚮?????????????硫λ젒?????????content script??????????? window.acceptScholarPaste(content, notebookLm) ???????嫄?????????(notebookLm===false ?????'=' ??????饔낅떽?????怨뚮옩鴉???????????? */
window.acceptScholarPaste = function (content, notebookLm) {
    notebookLmEqualsHrPreprocess = notebookLm !== false;
    applyScholarPaste(content);
};

/** URL ?????postMessage????????????諛몃마嶺뚮?????????????硫λ젒??????? ???????????????썹땟戮녹??諭?????⑸㎦???????????????????????傭?끆???????(??????????⑤벡???????븐뼐???????????????袁⑸즴筌?씛彛??????????椰??????????????椰??????????????????? */
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
}

/** URL ???????????content/title ???????嫄?????????????????????????傭?끆??????? ???????????傭?끆?????????????????????癲됱빖???嶺??????⑥レ뿥?????true */
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
            if (typeof showToast === 'function') showToast("?????????????????꿔꺂??????????????????????????????????????????????살몝??");
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
            showToast("???????????????????????????????⑤벡???????븐뼐???????????????袁⑸즴筌?씛彛?????????????");
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
    showToast("Ctrl+V????????????????????????????썹땟戮녹??諭???????????");

    requestAnimationFrame(() => {
        if (editorTextarea) editorTextarea.focus();
    });
}

async function insertUserInfoAtCursor() {
    if (!isEditMode) {
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }
    if (!db) {
        showToast('?????????????????????????????????釉먮폁??????????????????野껊챶??????????????????????????????살몝??');
        return;
    }
    const s = await getAiSettings();
    const u = s && s.userInfo;
    if (!u || (!String(u.name || '').trim() && !String(u.id || '').trim() && !String(u.major || '').trim() && !String(u.contact || '').trim() && !String(u.email || '').trim())) {
        showToast('????????????????????????????????嫄??????????????????????????ㅼ뒧???嫄?????????????????거??????????????????ㅻ쑋????');
        return;
    }
    const lines = [];
    if (String(u.name || '').trim()) lines.push('????? ' + String(u.name).trim());
    if (String(u.id || '').trim()) lines.push('??????? ' + String(u.id).trim());
    if (String(u.major || '').trim()) lines.push('?????????????? ' + String(u.major).trim());
    if (String(u.contact || '').trim()) lines.push('????????????산뭐?????? ' + String(u.contact).trim());
    if (String(u.email || '').trim()) lines.push('?????? ' + String(u.email).trim());
    const block = lines.map(function (line) { return line + '  '; }).join('\n');
    const ta = editorTextarea;
    const scrollTop = ta.scrollTop;
    ta.focus();
    document.execCommand('insertText', false, block);
    currentMarkdown = ta.value;
    ta.scrollTop = scrollTop;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('????????????嫄????????????????????????????????????살몝??');
}

function insertMarkdownImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('??????????椰??????? URL???????????????嶺?????????거??????????????????ㅻ쑋????');
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
    showToast('??????????椰??????? ??????椰????????????????????????????????????????????????????살몝??');
}

function insertHtmlImageAtCursor(imageUrl, altText) {
    if (!isEditMode) {
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }
    const u = String(imageUrl || '').trim();
    if (!u) {
        showToast('??????????椰??????? URL???????????????嶺?????????거??????????????????ㅻ쑋????');
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
    showToast('??????????椰??????? HTML ???????????곕춴??????????????????롮쾸???????????????????????????????살몝??');
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
                setImageInsertPreview(imageInsertCurrentDataUrl);
                setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
                try { imageInsertCropWindow.postMessage({ type: 'crop-applied' }, '*'); } catch (e) {}
            }
        });
    }
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
    imageInsertDragging = false;
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
            setImageInsertStatus('????????????????????????? ???????????????????????????ㅻ쑋??????????椰???????????⑤벡瑜??????????????嶺뚮씮????????????????????????살몝??', true);
            return;
        }
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    } catch (e) {
        setImageInsertStatus('??????椰??????????????怨룐솲???????⑤베????댁쉨???夷???猷고у칰?????耀붾굝?????????怨뺤꽑???????? ??????椰????????????????????', true);
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
        setImageInsertStatus('??????????椰??????? ????????????濚밸Ŧ援?????????????????????????????????????살몝??', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = function () {
        imageInsertCurrentDataUrl = String(reader.result || '');
        setImageInsertPreview(imageInsertCurrentDataUrl);
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
        setImageInsertStatus('????????거???????????????????????????濡?씀?濾?????????????????살몝??', true);
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
        setImageInsertStatus('Crop????????????椰??????????????????Β?щ엠?????饔낅떽?????? ????????????????嫄?????????', true);
        return;
    }
    imageInsertCropWindow = window.open(getCropPageUrlForImageInsert(), 'img_insert_crop', 'width=700,height=620,scrollbars=yes,resizable=yes');
    if (!imageInsertCropWindow) {
        setImageInsertStatus('Crop ??????椰???????????????????????濡?씀?濾?????????????????살몝?? ????????熬곣뫖利당춯??쎾퐲???????????????????????椰???????????⑤벡瑜??????????????嶺뚮씮??????????????嫄???????????????????거??????????????????ㅻ쑋????', true);
        return;
    }
    try { imageInsertCropWindow.focus(); } catch (e) {}
    try { imageInsertCropWindow.postMessage({ type: 'crop', image: imageInsertCurrentDataUrl }, '*'); } catch (e) {}
}

async function uploadImageInsertToImgbb() {
    if (!imageInsertCurrentDataUrl || imageInsertCurrentDataUrl.indexOf('data:image') !== 0) {
        setImageInsertStatus('???????????????????????椰??????????????????Β?щ엠?????饔낅떽?????? ??????????野껊챶????????븐뼐???????????????????????????嫄?????????', true);
        return;
    }
    const apiKey = String(getImgbbApiKey() || '').trim();
    if (!apiKey) {
        setImageInsertStatus('imgBB API ??? ??????????濡?씀?濾?????????????????살몝?? ?????????????????????sspimgAI??????????????????嶺?????????거??????????????????ㅻ쑋????', true);
        return;
    }
    setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    try {
        const comma = imageInsertCurrentDataUrl.indexOf(',');
        const base64Data = comma >= 0 ? imageInsertCurrentDataUrl.slice(comma + 1) : imageInsertCurrentDataUrl;
        const form = new FormData();
        form.append('image', base64Data);
        form.append('name', 'img_insert_' + Date.now());
        const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
            method: 'POST',
            body: form
        });
        const payload = await response.json();
        if (!response.ok || !payload || payload.success === false) {
            const msg = payload && payload.error && payload.error.message ? payload.error.message : ('imgBB upload failed (' + response.status + ')');
            throw new Error(msg);
        }
        const data = payload.data || {};
        const directUrl = data.url || (data.image && data.image.url) || data.display_url || '';
        const input = document.getElementById('img-insert-url');
        if (input) input.value = '';
        setImageInsertStatus('Image pasted. Click [imgBB] Upload to continue.', false);
    } catch (e) {
        setImageInsertStatus('imgBB ????????????????????嶺?? ' + (e && e.message ? e.message : e), true);
    }
}

function insertImageFromModal(type) {
    if (!isEditMode) {
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }
    const urlInput = document.getElementById('img-insert-url');
    const url = String(urlInput && urlInput.value ? urlInput.value : '').trim();
    const source = url || imageInsertCurrentDataUrl;
    if (!source) {
        setImageInsertStatus('???????URL ???????????????椰?????????????????? ??????????濡?씀?濾?????????????????살몝??', true);
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

    // Setext underline(====) ???????꿔꺂???⑸븶???????????壤굿??????????1???????????? ????????????????????거????????????????????????????????    inFencedCodeBlock = false;
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
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰???????????????????????????????????????????????살몝??');
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
        showToast('???????嫄??????????????????????????嚥싲갭큔????????????????濡?씀?濾?????????????????살몝??');
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
    showToast('???????????????????嚥싲갭큔?????2?????????嫄????????????????????????????????????????????살몝??');
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
            before = '  \n';
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
        replacement = `\n| ??????饔낅떽?????怨뚮옩鴉??????1 | ??????饔낅떽?????怨뚮옩鴉??????2 | ??????饔낅떽?????怨뚮옩鴉??????3 |\n| --- | --- | --- |\n| ??????????????1 | ??????????????2 | ??????????????3 |\n| ??????????????4 | ??????????????5 | ??????????????6 |\n`;
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
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
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
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
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

    const withMarker = text.substring(0, start) + marker + text.substring(end);
    let finalText = withMarker;
    const defRegex = new RegExp('^\\[\\^' + nextNumber + '\\]:', 'm');
    if (!defRegex.test(withMarker)) {
        const suffix = withMarker.endsWith('\n') ? '' : '\n';
        finalText = withMarker + suffix + '\n' + footnoteDef;
    }

    editorTextarea.value = finalText;
    currentMarkdown = finalText;
    const newPos = start + marker.length;
    editorTextarea.focus();
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
        showToast('????????거??????????????嫄???????????????⑤벡???????????????????????????????????Β?щ엠?????饔낅떽?????? ??????????????????????????썹땟戮녹??諭???????????');
        return;
    }

    const lines = selectedText
        .split('\n')
        .map(function (line) { return line.trim(); })
        .filter(function (line) { return line.length > 0; });

    if (lines.length === 0) {
        showToast('???????????????????????????????????????????????????????????살몝??');
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
        showToast('????????거??????????????嫄???????????????⑤벡????????????????????????????????????椰????????? ??????椰????????????????????');
        return;
    }

    if (rows.length >= 2 && isDividerRow(rows[1])) {
        rows.splice(1, 1);
    }

    const maxCols = rows.reduce(function (max, row) { return Math.max(max, row.length); }, 0);
    if (maxCols < 2) {
        showToast('??????椰???????????2??????????????????????????諛몃마嶺뚮?????????????硫λ젒?????????거?????????? ?????????????????嚥싲갭큔???????,/;/|)?????????嫄???????????????????????썹땟戮녹??諭???????????');
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
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }
    if (typeof marked === 'undefined' || typeof marked.parse !== 'function') {
        showToast('Markdown parser????????椰??????????????????????濡?씀?濾?????????????????살몝??');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    if (start === end) {
        showToast('HTML????????????⑤벡???????????????????????????????????Β?щ엠?????饔낅떽?????? ??????????????????????????썹땟戮녹??諭???????????');
        return;
    }

    const selectedText = editorTextarea.value.substring(start, end);
    const convertedHtml = String(marked.parse(selectedText)).trim();
    if (!convertedHtml) {
        showToast('??????????⑤벡?????????????????????????????????????濡?씀?濾?????????????????살몝??');
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
    showToast('?????????????????????????????HTML ??????????밸븶筌믩끃??獄???????멥렑?????????????????⑤벡?????????????????');
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
        showToast('???????嫄?????????????獄쏅챶留덌┼?????????????????椰??????????????椰????????????????????거??????????????????ㅻ쑋????');
        return;
    }

    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    if (start === end) {
        showToast('?????????????????????????????釉먮폁??????????? ?????????Β?щ엠?????饔낅떽?????? ??????????????????????????썹땟戮녹??諭???????????');
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
    showToast('???????????????????????釉먮폁???????????????嫄?????????HTML ??????????????????????????????????????살몝??');
}

function openLinkModal(mode) {
    modalMode = mode;
    document.getElementById('modal-title').textContent = mode === 'link' ? 'Insert Link' : 'Insert Image';
    document.getElementById('label-text').textContent = mode === 'link' ? 'Display text' : 'Image description';
    const shortcuts = document.getElementById('image-link-shortcuts');
    if (shortcuts) {
        if (mode === 'image') {
            shortcuts.classList.remove('hidden');
            shortcuts.classList.add('flex');
        } else {
            shortcuts.classList.add('hidden');
            shortcuts.classList.remove('flex');
        }
    }
    document.getElementById('input-display-text').value = editorTextarea.value.substring(editorTextarea.selectionStart, editorTextarea.selectionEnd);
    document.getElementById('input-url').value = '';
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
    const displayText = document.getElementById('input-display-text').value || (modalMode === 'link' ? 'link text' : 'image');
    const url = document.getElementById('input-url').value || 'https://';
    const start = editorTextarea.selectionStart;
    const end = editorTextarea.selectionEnd;
    const text = editorTextarea.value;
    const currentScrollTop = editorTextarea.scrollTop;

    const replacement = modalMode === 'link' ? `[${displayText}](${url})` : `![${displayText}](${url})`;

    editorTextarea.value = text.substring(0, start) + replacement + text.substring(end);
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

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
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

// --- AI ????????????????(IndexedDB + ????????????????癲ル슢?싩땟????????? ---
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

/** Google AI Studio / Gemini API ?? ??????????⑤벡??????AIza??????????거???????????????? 39?????????*/
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

async function toggleScholarSearchSection() {
    const check = document.getElementById('scholar-search-visible');
    const enabled = !!(check && check.checked);
    await setAiSettings({ scholarSearchVisible: enabled });
    const s = await getAiSettings();
    applyScholarSearchVisibility(s || { scholarSearchVisible: enabled });
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
    const dockBtn = document.getElementById('scholar-search-dock-btn');
    const shrinkBtn = document.getElementById('scholar-search-shrink-btn');
    if (!modal || !panel) return;

    if (scholarSearchDockRight) {
        modal.classList.remove('items-center', 'justify-center');
        modal.classList.add('items-start', 'justify-end');
        panel.style.marginTop = '80px';
        panel.style.marginRight = '12px';
        panel.style.maxWidth = scholarSearchShrink ? '250px' : '760px';
    } else {
        modal.classList.remove('items-start', 'justify-end');
        modal.classList.add('items-center', 'justify-center');
        panel.style.marginTop = '0';
        panel.style.marginRight = '0';
        panel.style.maxWidth = scholarSearchShrink ? '250px' : '760px';
    }

    if (body) body.classList.toggle('hidden', scholarSearchShrink);
    if (shrinkBtn) shrinkBtn.textContent = scholarSearchShrink ? 'Expand' : 'Shrink';
    if (dockBtn) dockBtn.textContent = scholarSearchDockRight ? 'Undock' : 'Dock Right';
}

function toggleScholarSearchDockRight() {
    scholarSearchDockRight = !scholarSearchDockRight;
    applyScholarSearchPanelLayout();
}

function toggleScholarSearchShrink() {
    scholarSearchShrink = !scholarSearchShrink;
    applyScholarSearchPanelLayout();
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
    // Chrome: ???????嫄?????????????釉랁닑??????????紐껊뭸????????????椰?????????toggleAiPasswordSection??getAiSettings ??????????밸븶筌믩끃??獄???????멥렑???????????????????????????諛몃마嶺뚮?????????????硫λ젒?????????癲ル슢??????
    // verified=false??????????????????곕섯????????????????????????살몝??????????????썹땟戮녹??諭?????⑸㎦??????蹂㏓??????????????? (IndexedDB ????????????亦낃콛??????????????????椰???????????⑤벡瑜??????????????嶺뚮씮?????
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
    const imgbbKeyInput = document.getElementById('ai-imgbb-api-key');
    const imgbbKey = (imgbbKeyInput && imgbbKeyInput.value) ? imgbbKeyInput.value.trim() : '';
    await setAiSettings({
        scholarAI: !!scholarOn,
        sspimgAI: !!sspimgOn,
        githubEnabled: !!(githubEl && githubEl.checked),
        scholarSearchVisible: scholarSearchVisible,
        imageUploadEnabled: imageUploadEnabled,
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
    // ??????椰??????????????椰????????? ???????????????癲됱빖???嶺??????⑥レ뿥?????IndexedDB ????(Chrome ?????????????????????????????꿔꺂???癰?????DOM ??????椰??????????????????????轅붽틓??????六??????????釉먮폁?怨?땡?塋????????????????????????????????)
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
            inner.innerHTML = '<div class="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm p-4">AI ????????????????????븍툖?????????..</div>';
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
                showToast(ok === false ? 'AI ??????????????????????????????? ??????椰???????????????????? http ????????거?????????????????????????????????⑤벡?????????' : 'AI ????????????????????????????嶺???????????? ???????????????????살몝??');
            });
        }
    }, 50);
}

function openScholarAIFromHeader() {
    getAiSettings().then(function (s) {
        if (!s || !s.verified) {
            showToast('???????????????????????????嫄?????????????釉랁닑??????????紐껊뭸?????????????????됰뼸????????????????????嫄?????????????釉랁닑??????????紐껊뭸?????????????諛몃마嶺뚮?????????????硫λ젒???????????????????????????????살몝??');
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
            showToast('???????????????????????????嫄?????????????釉랁닑??????????紐껊뭸?????????????????됰뼸????????????????????嫄?????????????釉랁닑??????????紐껊뭸?????????????諛몃마嶺뚮?????????????硫λ젒???????????????????????????????살몝??');
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
        showToast('?????????Β?щ엠?????饔낅떽?????? ??????????椰?????????????????熬곣뫖利당춯??쎾퐲??????????????????????????????????????嫄?????????');
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
             * SSP ??????????椰??????? ??????????諛몃마嶺뚮?????????????硫λ젒?? Gemini ??????????椰??????? ??????椰??????????????椰?????? :generateContent, Imagen?? :predict (generateImages ??????????????????癲됱빖???嶺??亦껋꼷伊볡댚?쒗닧????
             */
            generateImage: async function (prompt, options) {
                const key = localStorage.getItem('ss_gemini_api_key') || '';
                if (!key || !String(key).trim()) throw new Error('API ??? ??????????濡?씀?濾?????????????????살몝?? ????????????????????Gemini API ??? ??????????????ㅼ뒧???嫄??????????嫄?????????');
                let modelId = (options && options.modelId) || 'gemini-2.5-flash-image';
                const aspectRatio = (options && options.aspectRatio) || '1:1';
                /** false(????????=??????????????⑤뜪輿????????????椰???????, true(??????椰????????????=???????????????椰????????????????釉먮폁????????????????????????*/
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
                if (!cand) throw new Error('??????????????????諛몃마嶺뚮?????????????硫λ젒????????????????????????쎛 ??????????濡?씀?濾?????????????????살몝?? ??????椰??????????????椰?????????????????諛몃마嶺뚮?????????????硫λ젒?????????????????????????????????嫄???????????????????거??????????????????ㅻ쑋????');
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
                if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error('????????熬곣뫖利당춯??쎾퐲?????????????????????野껊챶????????????????? ' + cand.finishReason);
                throw new Error('??????????椰??????? ?????????? ??????????????????濡?씀?濾?????????????????살몝?? ???????????繹먮끍??????????????椰??????? ??????椰??????????????椰????????????????????????????????⑤벡?????????');
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
        showToast('sidebar-ai.js??????????????????? ??????椰????????????????????');
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
        const imageInputEmpty = document.getElementById('ai-imgbb-api-key');
        if (imageInputEmpty) imageInputEmpty.value = '';
        syncImgbbApiKeyInputs('');
        updateAiScholarSspimgAvailability(false);
        applyImageUploadFeatureVisibility({ imageUploadEnabled: false });
        applyScholarSearchVisibility({ scholarSearchVisible: false });
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
    updateAiScholarSspimgAvailability(verified);
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    applyScholarSearchVisibility(settings || { scholarSearchVisible: false });
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
    showToast("??????????밸븶筌믩끃??獄???????멥렑??????????????????????????⑤벡瑜???饔낅떽???????멸괜??????????耀붾굝???????????????????");
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
    input.value = '';

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
window.toggleScholarSearchDockRight = toggleScholarSearchDockRight;
window.toggleScholarSearchShrink = toggleScholarSearchShrink;
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
    replaceinput.value = '';
    findinput.value = '';
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
        showToast("?????癲ル슢?싩땟??????????????癲ル슢?싩땟??????????????釉먮폁???????? ??????????濡?씀?濾?????????????????살몝??");
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
        showToast("?????癲ル슢?싩땟??????????????癲ル슢?싩땟??????????????釉먮폁???????? ??????????濡?씀?濾?????????????????살몝??");
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
        editorTextarea.value = replaced.text;
        currentMarkdown = replaced.text;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(replaced.replacementStart, replaced.replacementEnd);
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
        editorTextarea.value = workingText;
        currentMarkdown = workingText;
        editorTextarea.focus();
        editorTextarea.setSelectionRange(originalSelectionStart, originalSelectionEnd);
        editorTextarea.scrollTop = originalScrollTop;
        editorTextarea.scrollLeft = originalScrollLeft;
        performAutoSave();
        if (activeSidebarTab === 'toc') renderTOC();
        showToast(`${count}????????????????썹땟戮녹??諭?????⑸㎦????????????????????`);
    } else {
        showToast("?????癲ル슢?싩땟??????????????癲ル슢?싩땟??????????????釉먮폁???????? ??????????濡?씀?濾?????????????????살몝??");
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

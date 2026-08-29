// js/inDB/inDB.js opens MarkdownProDB; app.js keeps the shared connection for editor integrations.
let db;
const AI_SETTINGS_KEY = 'ai_settings';
const AI_SETTINGS_FALLBACK_KEY = 'md_viewer_ai_settings_fallback';
const AI_PASSWORD_HASH = 'dc98e82fcfb4b165f5fa390d5ca61a9245a5be6ea70a4f00020ddff029afefba';
// 인증 기능은 보존하되 현재 배포에서는 우회한다. 다시 사용할 때 true로 변경한다.
const AI_AUTHENTICATION_REQUIRED = false;
const ENTER_BUTTON_BR_KEY = 'md_viewer_enter_button_br';
const SELECTION_WRAP_KEY = 'md_viewer_selection_wrap_enabled';
const VIEW_MODE_EDIT_KEY = 'md_viewer_view_mode_edit_enabled';
const VIEW_PADDING_KEY = 'md_viewer_view_padding_v1';
const DEFAULT_VIEW_PADDING = 24;
const SETTINGS_SHORTCUTS_FOLD_KEY = 'md_viewer_settings_shortcuts_folded';
const SETTINGS_CONTAINER_FOLD_STATE_KEY = 'md_viewer_settings_container_fold_state_v1';
const FILE_DOWNLOAD_PREFIX_KEY = 'mdpro_file_download_prefix_v1';
const DEFAULT_FILE_DOWNLOAD_PREFIX = 'mdpro';
const MAIN_HEADER_BACKGROUND_REMOVED_KEY = 'md_viewer_main_header_background_removed_v1';
const HEADER_FILE_ACTION_STYLE_KEY = 'md_viewer_header_file_action_style_v1';
const DEFAULT_HEADER_FILE_ACTION_STYLE = 'button';
const HEADER_FEATURE_KEY_STYLE_KEY = 'md_viewer_header_feature_key_style_v1';
const HEADER_HEADING_DISPLAY_KEY = 'md_viewer_header_heading_display_v1';
const AI_USE_FOLD_KEY = 'md_viewer_ai_use_folded';
const AI_CHAT_SETTINGS_FOLD_KEY = 'md_viewer_ai_chat_settings_folded';
const SCHOLAR_LM_SETTINGS_FOLD_KEY = 'md_viewer_scholar_lm_settings_folded';
const SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY = 'md_viewer_scholar_ollama_settings_folded';
const AI_PROVIDER_FOLDS_DEFAULT_VERSION_KEY = 'md_viewer_ai_provider_folds_default_v1';
const SHARE_SETTINGS_FOLD_KEY = 'md_viewer_share_settings_folded';
const GOOGLE_CALENDAR_ENABLED_KEY = 'md_viewer_google_calendar_enabled';
const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const GOOGLE_CALENDAR_OPEN_MODE_KEY = 'md_viewer_google_calendar_open_mode';
const GOOGLE_CALENDAR_EMAIL_KEY = 'md_viewer_google_calendar_email';
const VIEW_COPY_FAB_POSITION_KEY = 'md_viewer_view_copy_fab_position_v2';
const VIEW_COPY_FAB_EDGE_GAP = 8;

function getHeaderFileActionStyle() {
    const stored = localStorage.getItem(HEADER_FILE_ACTION_STYLE_KEY);
    return stored === 'text' ? 'text' : DEFAULT_HEADER_FILE_ACTION_STYLE;
}

function applyHeaderFileActionStyle(style, persist) {
    const normalized = style === 'text' ? 'text' : 'button';
    document.documentElement.classList.toggle('header-file-actions-text', normalized === 'text');
    document.documentElement.classList.toggle('header-file-actions-button', normalized === 'button');
    document.querySelectorAll('input[name="header-file-action-style"]').forEach(function (input) {
        input.checked = input.value === normalized;
    });
    if (persist !== false) localStorage.setItem(HEADER_FILE_ACTION_STYLE_KEY, normalized);
}

function setHeaderFileActionStyle(style) {
    applyHeaderFileActionStyle(style, true);
    showToast(style === 'text' ? '파일 작업 메뉴를 글자형으로 표시합니다.' : '파일 작업 메뉴를 버튼형으로 표시합니다.');
}
window.setHeaderFileActionStyle = setHeaderFileActionStyle;
applyHeaderFileActionStyle(getHeaderFileActionStyle(), false);

function getHeaderFeatureKeyStyle() {
    const stored = localStorage.getItem(HEADER_FEATURE_KEY_STYLE_KEY);
    return stored === 'text' ? 'text' : 'button';
}

function applyHeaderFeatureKeyStyle(style, persist) {
    const normalized = style === 'text' ? 'text' : 'button';
    document.documentElement.classList.toggle('header-feature-keys-text', normalized === 'text');
    document.documentElement.classList.toggle('header-feature-keys-button', normalized === 'button');
    document.querySelectorAll('input[name="header-feature-key-style"]').forEach(function (input) {
        input.checked = input.value === normalized;
    });
    if (persist !== false) localStorage.setItem(HEADER_FEATURE_KEY_STYLE_KEY, normalized);
}

function setHeaderFeatureKeyStyle(style) {
    applyHeaderFeatureKeyStyle(style, true);
    showToast(style === 'text' ? '기능키를 글자형으로 표시합니다.' : '기능키를 버튼형으로 표시합니다.');
}
window.setHeaderFeatureKeyStyle = setHeaderFeatureKeyStyle;
applyHeaderFeatureKeyStyle(getHeaderFeatureKeyStyle(), false);

function getHeaderHeadingDisplay() {
    return localStorage.getItem(HEADER_HEADING_DISPLAY_KEY) === 'expanded' ? 'expanded' : 'collapsed';
}

function applyHeaderHeadingDisplay(display, persist) {
    const normalized = display === 'expanded' ? 'expanded' : 'collapsed';
    const expanded = document.getElementById('heading-tools-expanded');
    const collapsed = document.getElementById('heading-tools-collapsed');
    if (expanded) expanded.classList.toggle('hidden', normalized !== 'expanded');
    if (collapsed) collapsed.classList.toggle('hidden', normalized === 'expanded');
    document.querySelectorAll('input[name="header-heading-display"]').forEach(function (input) {
        input.checked = input.value === normalized;
    });
    if (normalized === 'expanded') closeHeadingQuickMenu();
    if (persist !== false) localStorage.setItem(HEADER_HEADING_DISPLAY_KEY, normalized);
}

function setHeaderHeadingDisplay(display) {
    applyHeaderHeadingDisplay(display, true);
    showToast(display === 'expanded' ? 'Header 제목 버튼을 펼쳤습니다.' : 'Header 제목 버튼을 접었습니다.');
}
window.setHeaderHeadingDisplay = setHeaderHeadingDisplay;
document.addEventListener('DOMContentLoaded', function () {
    applyHeaderHeadingDisplay(getHeaderHeadingDisplay(), false);
});
const OPTIONAL_SCRIPT_SOURCES = Object.freeze({
    mammoth: './vendor/mammoth/mammoth.browser.min.js?v=1.12.0',
    docxImport: './js/extendFiles/docx-import.js?v=20260817-dark-table-contrast-1',
    pdfJs: './js/extendFiles/pdfjs-loader.mjs?v=20260815-editable-2',
    pdfOpen: './js/extendFiles/pdf-open.js?v=20260815-editable-1',
    docxExport: './js/extendFiles/docx-export.js?v=20260816-merge-cover-toc-2',
    htmlExport: './js/export/html-export.js?v=20260805-image-1',
    pdfExport: './js/export/pdf-export.js?v=20260813-merge-tool-1',
    html2canvas: './vendor/html2canvas/html2canvas.min.js?v=1.4.1',
    jsPdf: './vendor/jspdf/jspdf.umd.min.js?v=4.2.1',
    aiAcademicSearch: './js/Scholarref/ai/academic-search.js?v=20260817-scholar-audit-1',
    aiWebSearch: './AI_App/aiChat/ai-jena-local-api.js?v=20260823-web-search-1',
    aiMarkdown: './AI_App/aiChat/ai-chat-markdown.js?v=20260825-table-pipes-1',
    aiChat: './AI_App/aiChat/ai-chat.js?v=20260828-aistudio-live-tokens-1',
    mathJax: 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js',
    inputPaintBenchmark: './js/performance/input-paint-benchmark.js?v=20260810-4',
    codeMirrorPrototype: './js/editor/codemirror-prototype.mjs?v=20260810-3'
});
const optionalScriptLoads = new Map();

function loadOptionalScript(key, isReady, options) {
    if (typeof isReady === 'function' && isReady()) return Promise.resolve(true);
    if (optionalScriptLoads.has(key)) return optionalScriptLoads.get(key);
    const source = OPTIONAL_SCRIPT_SOURCES[key];
    if (!source) return Promise.reject(new Error('Unknown optional script: ' + key));
    const promise = new Promise(function (resolve, reject) {
        const existing = Array.from(document.scripts).find(function (script) {
            return script.dataset.optionalScript === key;
        });
        const script = existing || document.createElement('script');
        const finish = function () {
            if (typeof isReady !== 'function' || isReady()) resolve(true);
            else reject(new Error('Optional script loaded without expected API: ' + key));
        };
        const fail = function () {
            optionalScriptLoads.delete(key);
            // A failed lazy script must not remain discoverable. Otherwise a
            // later recovery attempt finds the dead element, attaches another
            // load listener to it, and waits forever for an event that already
            // fired.
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error('Optional script failed to load: ' + source));
        };
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });
        if (!existing) {
            if (options && options.module) script.type = 'module';
            script.src = source;
            script.async = true;
            script.dataset.optionalScript = key;
            document.head.appendChild(script);
        }
    });
    optionalScriptLoads.set(key, promise);
    return promise;
}

function ensureLazyFrameLoaded(frameOrId) {
    const frame = typeof frameOrId === 'string' ? document.getElementById(frameOrId) : frameOrId;
    if (!frame) return null;
    const source = frame.dataset ? String(frame.dataset.src || '') : '';
    if (source && !frame.getAttribute('src')) frame.setAttribute('src', source);
    return frame;
}

function refreshLucideIcons(root) {
    if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
    try {
        if (root && root !== document) window.lucide.createIcons({ nodes: [root] });
        else window.lucide.createIcons();
    } catch (_) {
        window.lucide.createIcons();
    }
}

async function ensureAiChatLoaded() {
    if (window.AIChat && typeof window.AIChat.open === 'function') return true;
    // Search and Markdown helpers enhance AI JENA, but none of them is part of
    // the provider/model transport. Keep a removed or temporarily unavailable
    // helper from preventing the chat core (and every model provider) from
    // opening. Individual features already report their own unavailable state.
    await Promise.allSettled([
        loadOptionalScript('aiAcademicSearch', function () { return !!window.AIChatAcademicSearch; }),
        loadOptionalScript('aiWebSearch', function () { return !!window.AIJenaLocalAPI; }),
        loadOptionalScript('aiMarkdown', function () { return !!window.AIChatMarkdown; })
    ]);
    await loadOptionalScript('aiChat', function () { return !!window.AIChat; });
    return true;
}

async function openAiJenaChat(openAfterLoad) {
    try {
        await ensureAiChatLoaded();
        if (window.AIChat) {
            if (openAfterLoad !== false && typeof window.AIChat.open === 'function') window.AIChat.open();
            return true;
        }
    } catch (error) {
        showToast('AI Jena를 불러오지 못했습니다: ' + (error && error.message ? error.message : error));
    }
    return false;
}
window.openAiJenaChat = openAiJenaChat;

async function openAiJenaFromMenu() {
    try {
        await ensureAiChatLoaded();
        if (window.AIChat && typeof window.AIChat.openFromMenu === 'function') {
            window.AIChat.openFromMenu();
            return true;
        }
    } catch (error) {
        showToast('AI Jena를 불러오지 못했습니다: ' + (error && error.message ? error.message : error));
    }
    return false;
}
window.openAiJenaFromMenu = openAiJenaFromMenu;

async function ensureMdMathEngineLoaded() {
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') return true;
    await loadOptionalScript('mathJax', function () {
        return !!window.MathJax && typeof window.MathJax.typesetPromise === 'function';
    });
    return true;
}
window.ensureMdMathEngineLoaded = ensureMdMathEngineLoaded;

function initializeLazyAiChatEntry() {
    const enabledKey = 'ss_ai_chat_enabled';
    const menuEnabledKey = 'ss_ai_chat_menu_enabled';
    const launcherPositionKey = 'ss_ai_chat_launcher_position';
    const checkbox = document.getElementById('ai-chat-enabled');
    const menuCheckbox = document.getElementById('ai-chat-menu-enabled');
    const menuButton = document.getElementById('btn-ai-jena-menu');
    const syncMenuButton = function () {
        const enabled = localStorage.getItem(menuEnabledKey) === '1';
        if (menuCheckbox) menuCheckbox.checked = enabled;
        if (menuButton) {
            menuButton.classList.toggle('hidden', !enabled);
            menuButton.style.display = enabled ? 'inline-flex' : 'none';
        }
        const headerBtns = document.getElementById('header-ai-btns');
        if (headerBtns && enabled) {
            headerBtns.classList.remove('hidden');
            headerBtns.classList.add('flex');
            headerBtns.style.display = 'flex';
        }
    };
    let launcher = null;
    let cleanupLauncherLayout = null;
    const removeLauncher = function () {
        if (cleanupLauncherLayout) cleanupLauncherLayout();
        cleanupLauncherLayout = null;
        if (launcher && launcher.parentNode) launcher.parentNode.removeChild(launcher);
        launcher = null;
    };
    const loadChat = async function (openAfterLoad) {
        removeLauncher();
        const loaded = await openAiJenaChat(openAfterLoad);
        if (!loaded) {
            createLauncher();
        }
    };
    const createLauncher = function () {
        if (launcher || document.getElementById('ai-chat-launcher') || localStorage.getItem(enabledKey) !== '1') return;
        launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.id = 'ai-chat-lazy-launcher';
        launcher.className = 'ai-chat-launcher enabled';
        launcher.title = 'AI Jena 열기';
        launcher.setAttribute('aria-label', 'AI Jena 열기');
        launcher.innerHTML = '<span class="ai-chat-launcher-icon" aria-hidden="true">AI</span><span class="ai-chat-launcher-label">Jena</span>';
        document.body.appendChild(launcher);

        let suppressClick = false;
        const readSavedPosition = function () {
            try {
                const value = JSON.parse(localStorage.getItem(launcherPositionKey) || 'null');
                return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
            } catch (_) {
                return null;
            }
        };
        const getSafePosition = function (left, top) {
            const width = launcher.offsetWidth || 68;
            const height = launcher.offsetHeight || 42;
            let safeLeft = Math.max(6, Math.min(Number(left) || 6, window.innerWidth - width - 6));
            const safeTop = Math.max(6, Math.min(Number(top) || 6, window.innerHeight - height - 58));
            const toolbar = document.getElementById('toolbar');
            if (document.body.classList.contains('edit-toolbar-vertical')
                && toolbar && window.getComputedStyle(toolbar).display !== 'none') {
                const toolbarRect = toolbar.getBoundingClientRect();
                safeLeft = Math.min(safeLeft, Math.max(6, toolbarRect.left - width - 12));
            }
            return { left: safeLeft, top: safeTop };
        };
        const applySafePosition = function (preferred) {
            if (!launcher || !launcher.isConnected) return;
            const rect = launcher.getBoundingClientRect();
            const source = preferred || { left: rect.left, top: rect.top };
            const safe = getSafePosition(source.left, source.top);
            launcher.style.left = Math.round(safe.left) + 'px';
            launcher.style.top = Math.round(safe.top) + 'px';
            launcher.style.right = 'auto';
            launcher.style.bottom = 'auto';
            localStorage.setItem(launcherPositionKey, JSON.stringify({
                left: Math.round(safe.left),
                top: Math.round(safe.top)
            }));
        };
        const refreshPosition = function () { applySafePosition(readSavedPosition()); };
        const onPointerDown = function (event) {
            if (event.button !== 0) return;
            const rect = launcher.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            let moved = false;
            try { launcher.setPointerCapture(event.pointerId); } catch (_) {}
            const move = function (moveEvent) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (!moved && Math.hypot(dx, dy) < 4) return;
                moved = true;
                const safe = getSafePosition(rect.left + dx, rect.top + dy);
                launcher.style.left = Math.round(safe.left) + 'px';
                launcher.style.top = Math.round(safe.top) + 'px';
                launcher.style.right = 'auto';
                launcher.style.bottom = 'auto';
                launcher.classList.add('dragging');
            };
            const finish = function () {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', finish);
                document.removeEventListener('pointercancel', finish);
                launcher.classList.remove('dragging');
                if (!moved) return;
                suppressClick = true;
                applySafePosition();
                setTimeout(function () { suppressClick = false; }, 120);
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', finish);
            document.addEventListener('pointercancel', finish);
            event.preventDefault();
        };
        const onClick = function () {
            if (!suppressClick) loadChat(true);
        };
        launcher.addEventListener('pointerdown', onPointerDown);
        launcher.addEventListener('click', onClick);
        window.addEventListener('resize', refreshPosition);
        window.addEventListener('md-edit-toolbar-orientation-change', refreshPosition);
        cleanupLauncherLayout = function () {
            window.removeEventListener('resize', refreshPosition);
            window.removeEventListener('md-edit-toolbar-orientation-change', refreshPosition);
        };
        requestAnimationFrame(refreshPosition);
        setTimeout(refreshPosition, 80);
    };
    if (checkbox && !checkbox.dataset.lazyAiChatBound) {
        checkbox.dataset.lazyAiChatBound = '1';
        checkbox.checked = localStorage.getItem(enabledKey) === '1';
        checkbox.addEventListener('change', function () {
            localStorage.setItem(enabledKey, checkbox.checked ? '1' : '0');
            window.dispatchEvent(new CustomEvent('ai-jena-enabled-change', {
                detail: { enabled: checkbox.checked }
            }));
            if (checkbox.checked) loadChat(false);
            else removeLauncher();
        });
    }
    if (menuCheckbox && !menuCheckbox.dataset.aiChatMenuBound) {
        menuCheckbox.dataset.aiChatMenuBound = '1';
        menuCheckbox.addEventListener('change', function () {
            localStorage.setItem(menuEnabledKey, menuCheckbox.checked ? '1' : '0');
            syncMenuButton();
            if (!menuCheckbox.checked && typeof applyAiFeatureVisibility === 'function') applyAiFeatureVisibility();
        });
    }
    syncMenuButton();
    createLauncher();
}

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
let currentLocalFileRef = null;
let currentGithubFileRef = null;
let currentFileMetadata = { createdAt: null, dateLabel: '생성일' };
let currentDocumentVirtualPath = '';
let currentDocumentDisplayRequest = 0;
let currentDocumentMetadataTimer = null;
let currentDbDocId = null;
let currentDocumentRef = null;
let storageStatusUnsubscribe = null;
let sqlitePendingRetryTimer = null;
let recoveryCandidateDraft = null;
let sqliteConflictItems = [];
let sqliteConflictIndex = 0;
let sqliteConflictResolving = false;
let storageOnlineRetryBound = false;
let storageAutoSavePromise = Promise.resolve(false);
let pendingAutoSaveKey = '';
const autoSaveStats = {
    requested: 0,
    skippedDuplicate: 0,
    skippedStale: 0,
    completed: 0,
    failed: 0
};
let isEditMode = true;
let pageScale = 1.0;
let fontSize = 16;
document.documentElement.style.setProperty('--md-app-font-size', `${fontSize}px`);
let headerScale = 0.7;
document.documentElement.style.setProperty('--md-header-scale', `${headerScale}`);
let mainHeaderBackgroundRemoved = false;
try {
    mainHeaderBackgroundRemoved = localStorage.getItem(MAIN_HEADER_BACKGROUND_REMOVED_KEY) === '1';
} catch (_) {}
document.documentElement.classList.toggle('md-main-header-background-removed', mainHeaderBackgroundRemoved);
let modalMode = 'link';
let movingDocId = null;
let previewPopupWindow = null;
let previewPopupScale = 1.0;
let previewPopupWidthScale = 1.0;
let previewPopupFontSize = 16;
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
let imageInsertGalleryWindow = null;
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
let listQuickMenuBound = false;
let codeQuoteQuickMenuBound = false;
let textEmphasisQuickMenuBound = false;
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
let templatePanelFullscreen = false;
let templatePanelRestoreState = null;
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
let googleCalendarInternalMaximized = false;
let googleCalendarInternalRestoreStyle = '';
let googleCalendarInternalDragBound = false;
let aiSidebarBootPromise = null;
let aiSidebarLoadAttempts = 0;
let viewClickMappedCaretPos = null;
let lastEditCaretPos = 0;
let viewerInternalImageObjectUrls = [];
let previewInternalImageObjectUrls = [];
const internalImageObjectUrlCache = new Map();
let lastPersistedContent = '';
let lastAutoSavedContent = '';
let lastAutoSavedTitle = '';
let pauseMainRenderWhileEditing = true;
let mainRenderDirty = true;
let mainRenderToken = 0;
let renderSourceRevision = 0;
let renderSourceValue = currentMarkdown;
let renderPreparationSettingsRevision = 0;
let renderPreparationCache = [];
const RENDER_PREPARATION_CACHE_LIMIT = 2;
const renderPreparationStats = {
    sourceChanges: 0,
    snapshotHits: 0,
    snapshotMisses: 0,
    commentHideRuns: 0,
    preprocessRuns: 0,
    markdownParseRuns: 0,
    staleResults: 0
};
const renderCoordinator = window.MDRenderCoordinator
    && typeof window.MDRenderCoordinator.create === 'function'
    ? window.MDRenderCoordinator.create(window)
    : null;
let viewCopyFabInitialized = false;
let viewCopyFabHasCustomPosition = false;
let viewCopyFabAiJenaObserver = null;
let viewCopyFabAiJenaDockWidth = 0;

// Sidebar states
let isSidebarHidden = false;
let isSidebarCollapsed = false;

// Theme
const THEME_KEY = 'md_viewer_theme';
const EDITOR_LIGHT_KEY = 'md_viewer_editor_light';
const EDITOR_COMMENT_LIGHT_COLOR_KEY = 'md_viewer_comment_highlight_light';
const EDITOR_COMMENT_DARK_COLOR_KEY = 'md_viewer_comment_highlight_dark';
const DEFAULT_EDITOR_COMMENT_COLORS = window.MDComment && window.MDComment.DEFAULT_EDITOR_COMMENT_COLORS
    ? window.MDComment.DEFAULT_EDITOR_COMMENT_COLORS
    : Object.freeze({ light: '#f59e0b', dark: '#facc15' });
const MERMAID_DISPLAY_MODE_KEY = 'md_viewer_mermaid_display_mode';

const sidebar = document.getElementById('sidebar');
const viewerContainer = document.getElementById('viewer-container');
const viewer = document.getElementById('viewer');
const editorContainer = document.getElementById('content-viewport');
const editorTextarea = document.getElementById('viewer-edit-ta');
const fileNameDisplay = document.getElementById('file-name-display');
const fileTitleDisplay = document.getElementById('file-title-display');
const filePathDisplay = document.getElementById('file-path-display');
const filePathSeparator = document.getElementById('file-path-separator');
const fileSizeDisplay = document.getElementById('file-size-display');
const fileCreatedDisplay = document.getElementById('file-created-display');
const dropZone = document.getElementById('drop-zone');
const inputModal = document.getElementById('input-modal');
let documentFileDropHandlersInstalled = false;

function isDocumentFileDrag(event) {
    const transfer = event && event.dataTransfer ? event.dataTransfer : null;
    if (!transfer) return false;
    if (transfer.files && transfer.files.length > 0) return true;
    const types = Array.from(transfer.types || []);
    return types.includes('Files') || types.includes('application/x-moz-file');
}

async function openDroppedDocumentFile(file) {
    if (!file) return false;
    const extension = getSelectedFileExtension(file);
    if (extension === '.docx') return openDocxInEditor(file);
    if (extension === '.pdf') return openPdfInEditor(file);
    await readFile(file);
    return true;
}

function installDocumentFileDropHandlers() {
    if (documentFileDropHandlersInstalled) return;
    documentFileDropHandlersInstalled = true;

    document.addEventListener('dragover', function (event) {
        if (event.defaultPrevented || !isDocumentFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (dropZone) dropZone.classList.add('drag-over');
    });

    document.addEventListener('dragenter', function (event) {
        if (event.defaultPrevented || !isDocumentFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
    });

    document.addEventListener('dragleave', function (event) {
        if (event.defaultPrevented || !isDocumentFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (dropZone) dropZone.classList.remove('drag-over');
    });

    document.addEventListener('drop', async function (event) {
        if (event.defaultPrevented || !isDocumentFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (dropZone) dropZone.classList.remove('drag-over');
        const files = event.dataTransfer && event.dataTransfer.files;
        const file = files && files.length ? files[0] : null;
        if (file) await openDroppedDocumentFile(file);
    });
}

installDocumentFileDropHandlers();

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
let storageSearchDebounceTimer = null;
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
        return v === 'github' || v === 'sqlite' || v === 'local' ? v : 'indb';
    } catch (_) {
        return 'indb';
    }
}

function setStorageSourceTabToLocal(tab) {
    try {
        const normalized = tab === 'github' || tab === 'sqlite' || tab === 'local' ? tab : 'indb';
        localStorage.setItem(STORAGE_SOURCE_TAB_KEY, normalized);
    } catch (_) {}
}

function getActiveStorageMode() {
    const state = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
        ? window.MDPStorage.getStatus()
        : null;
    return state && state.activeMode === 'sqlite' ? 'sqlite' : 'indb';
}

function getStorageModeLabel(mode) {
    return mode === 'sqlite' ? 'SQLite' : 'inDB';
}

function getStorageSourceLabel(source) {
    if (source === 'local') return 'Local';
    if (source === 'sqlite') return 'SQLite';
    if (source === 'github') return 'GitHub';
    return 'inDB';
}

function getSelectedSaveStorageSource() {
    if (currentStorageSourceTab === 'local' || currentStorageSourceTab === 'github') {
        return currentStorageSourceTab;
    }
    return getActiveStorageMode();
}

function getCurrentDocumentStorageOrigin() {
    if (currentLocalFileRef) {
        return {
            source: 'local',
            location: String(currentLocalFileRef.path || currentFileName || '로컬 파일')
        };
    }
    if (currentGithubFileRef) {
        return {
            source: 'github',
            location: String(currentGithubFileRef.remotePath || currentGithubFileRef.path || currentFileName || 'GitHub 문서')
        };
    }
    if (currentDocumentRef && currentDocumentRef.storageMode) {
        return {
            source: currentDocumentRef.storageMode === 'sqlite' ? 'sqlite' : 'indb',
            location: String(currentDocumentVirtualPath || currentFileName || currentDocumentRef.title || '저장 문서')
        };
    }
    if (currentFilePath && window.electron && window.electron.ipcRenderer) {
        return { source: 'local', location: String(currentFilePath) };
    }
    return null;
}

function setStorageConnectionButtonGlow(buttonId, connectionType, connected) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.classList.remove('storage-connected-sqlite', 'storage-connected-github');
    if (connected) button.classList.add('storage-connected-' + connectionType);
    button.dataset.connectionState = connected ? 'connected' : 'disconnected';
    if (connected) {
        button.setAttribute('aria-label', (connectionType === 'sqlite' ? 'SQLite' : 'GitHub') + ' · 연결됨');
    } else {
        button.removeAttribute('aria-label');
    }
}

function updateStorageRecoveryStatusUI(stateInput) {
    const element = document.getElementById('storage-sync-status');
    if (!element) return;
    const state = stateInput || (window.MDPStorage && window.MDPStorage.getStatus
        ? window.MDPStorage.getStatus()
        : null);
    const recovery = state && state.recoveryStatus ? state.recoveryStatus : null;
    const mode = state && state.activeMode === 'sqlite' ? 'sqlite' : 'indb';
    const sqliteConnected = !!(state && state.sqliteHealth && state.sqliteHealth.available === true
        && state.sqliteHealth.capabilities
        && state.sqliteHealth.capabilities.documents === true
        && state.sqliteHealth.capabilities.folders === true);
    setStorageConnectionButtonGlow('tab-storage-sqlite', 'sqlite', sqliteConnected);
    const syncState = String(recovery && recovery.syncState || 'idle');
    const steadyConnectedState = sqliteConnected && syncState === 'idle'
        && !Number(recovery && recovery.pendingCount || 0)
        && !(recovery && recovery.lastError);
    if (!recovery || steadyConnectedState || (!recovery.pendingCount && mode !== 'sqlite')) {
        element.className = 'hidden text-[10px] px-2 py-1 rounded border';
        element.textContent = '';
        element.onclick = null;
        element.onkeydown = null;
        element.removeAttribute('role');
        element.removeAttribute('tabindex');
        element.removeAttribute('title');
        return;
    }
    const toneClasses = {
        conflict: 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
        pending: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
        draft: 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30',
        syncing: 'border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30',
        error: 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
    };
    const labels = {
        conflict: '충돌 · 복구 확인 필요',
        pending: '동기화 대기 ' + Number(recovery.pendingCount || 0) + '건',
        draft: '복구 버퍼 저장됨',
        syncing: 'SQLite 재동기화 중',
        error: '복구 버퍼 오류',
        synced: 'SQLite 저장 완료',
        idle: ''
    };
    element.className = 'text-[10px] px-2 py-1 rounded border ' + (
        toneClasses[syncState]
        || 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
    );
    element.textContent = labels[syncState] || labels.idle;
    element.onclick = null;
    element.onkeydown = null;
    element.removeAttribute('role');
    element.removeAttribute('tabindex');
    element.removeAttribute('title');
    if (syncState === 'conflict') {
        element.textContent = '충돌 · 클릭하여 비교';
        element.className += ' cursor-pointer hover:ring-2 hover:ring-red-300 dark:hover:ring-red-800';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('title', '서버 문서와 로컬 복구본 비교');
        element.onclick = function () { openSqliteConflictResolver(); };
        element.onkeydown = function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openSqliteConflictResolver();
            }
        };
    }
}

function formatSqliteConflictTime(value) {
    const timestamp = Number(value);
    if (!timestamp) return '-';
    try { return new Date(timestamp).toLocaleString(); } catch (_) { return '-'; }
}

function renderSqliteConflictModal() {
    const conflict = sqliteConflictItems[sqliteConflictIndex] || null;
    const modal = document.getElementById('sqlite-conflict-modal');
    if (!modal || !conflict) return false;
    const server = conflict.serverDocument || {};
    const local = conflict.localDocument || {};
    const setText = function (id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value == null ? '' : value);
    };
    setText('sqlite-conflict-count', (sqliteConflictIndex + 1) + ' / ' + sqliteConflictItems.length);
    setText('sqlite-conflict-document-id', conflict.documentId);
    setText('sqlite-conflict-server-title', server.title || '서버 문서를 읽을 수 없음');
    setText('sqlite-conflict-server-meta', 'version ' + (server.version || '-') + ' · 수정 ' + formatSqliteConflictTime(server.updatedAt));
    setText('sqlite-conflict-server-content', server.content || '');
    setText('sqlite-conflict-local-title', local.title || '로컬 복구본');
    setText('sqlite-conflict-local-meta', '기준 version ' + (local.baseVersion || '-') + ' · 임시 저장 ' + formatSqliteConflictTime(local.savedAt));
    setText('sqlite-conflict-local-content', local.content || '');
    const prev = document.getElementById('sqlite-conflict-prev');
    const next = document.getElementById('sqlite-conflict-next');
    if (prev) prev.disabled = sqliteConflictIndex <= 0 || sqliteConflictResolving;
    if (next) next.disabled = sqliteConflictIndex >= sqliteConflictItems.length - 1 || sqliteConflictResolving;
    modal.querySelectorAll('[data-conflict-resolution]').forEach(function (button) {
        button.disabled = sqliteConflictResolving;
    });
    return true;
}

async function openSqliteConflictResolver() {
    if (!window.MDPStorage || typeof window.MDPStorage.listDocumentConflicts !== 'function') {
        showToast('Conflict resolver is not ready.');
        return;
    }
    try {
        sqliteConflictItems = await window.MDPStorage.listDocumentConflicts();
        sqliteConflictIndex = 0;
        if (!sqliteConflictItems.length) {
            showToast('해결할 SQLite 충돌이 없습니다.');
            updateStorageRecoveryStatusUI();
            return;
        }
        const modal = document.getElementById('sqlite-conflict-modal');
        if (!modal) throw new Error('Conflict modal is missing.');
        renderSqliteConflictModal();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        refreshLucideIcons(modal);
    } catch (error) {
        showToast('충돌 목록을 읽을 수 없습니다: ' + (error && error.message ? error.message : error));
    }
}

function closeSqliteConflictResolver() {
    if (sqliteConflictResolving) return;
    const modal = document.getElementById('sqlite-conflict-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    sqliteConflictItems = [];
    sqliteConflictIndex = 0;
}

function moveSqliteConflict(offset) {
    if (sqliteConflictResolving || !sqliteConflictItems.length) return;
    sqliteConflictIndex = Math.max(0, Math.min(sqliteConflictItems.length - 1, sqliteConflictIndex + Number(offset || 0)));
    renderSqliteConflictModal();
}

async function resolveSqliteConflict(strategy) {
    if (sqliteConflictResolving) return;
    const conflict = sqliteConflictItems[sqliteConflictIndex];
    if (!conflict || !window.MDPStorage || typeof window.MDPStorage.resolveDocumentConflict !== 'function') return;
    sqliteConflictResolving = true;
    renderSqliteConflictModal();
    try {
        const result = await window.MDPStorage.resolveDocumentConflict(conflict.documentId, strategy);
        if (currentDocumentRef && currentDocumentRef.id === conflict.documentId && result && result.document) {
            setCurrentDocumentRef(result.document, 'sqlite');
            currentFileName = String(result.document.title || 'Untitled') + '.md';
            currentFilePath = null;
            updateCurrentDocumentDisplay();
            updateContent(result.document.content || '');
            markPersistedState();
        }
        const labels = { server: '서버본을 사용했습니다.', local: '로컬본을 새 버전으로 저장했습니다.', copy: '로컬본을 복구 문서로 만들었습니다.' };
        showToast(labels[strategy] || '충돌을 해결했습니다.');
        await renderDBList();
        sqliteConflictItems = await window.MDPStorage.listDocumentConflicts();
        if (!sqliteConflictItems.length) {
            sqliteConflictResolving = false;
            closeSqliteConflictResolver();
            return;
        }
        sqliteConflictIndex = Math.min(sqliteConflictIndex, sqliteConflictItems.length - 1);
    } catch (error) {
        showToast('충돌 해결 실패: ' + (error && error.message ? error.message : error));
    } finally {
        sqliteConflictResolving = false;
        renderSqliteConflictModal();
        updateStorageRecoveryStatusUI();
    }
}

async function retryPendingSqliteOperations() {
    if (!window.MDPStorage || getActiveStorageMode() !== 'sqlite') return;
    const status = window.MDPStorage.getStatus();
    if (!status.recoveryStatus || status.recoveryStatus.pendingCount < 1) return;
    try {
        const health = await window.MDPStorage.refreshSqliteHealth();
        if (health && health.available) {
            const result = await window.MDPStorage.flushPendingOperations();
            if (result && result.remaining === 0 && currentDocumentRef
                && currentDocumentRef.storageMode === 'sqlite') {
                const current = await window.MDPStorage.getDocument(currentDocumentRef.id);
                if (current) setCurrentDocumentRef(current, 'sqlite');
            }
        }
    } catch (_) {}
}

function syncSqlitePendingRetryTimer(stateInput) {
    const state = stateInput || (window.MDPStorage && window.MDPStorage.getStatus
        ? window.MDPStorage.getStatus()
        : null);
    const shouldRun = !!(state && state.activeMode === 'sqlite');
    if (!shouldRun && sqlitePendingRetryTimer) {
        clearInterval(sqlitePendingRetryTimer);
        sqlitePendingRetryTimer = null;
    }
    if (shouldRun && !sqlitePendingRetryTimer) {
        sqlitePendingRetryTimer = setInterval(retryPendingSqliteOperations, 5000);
    }
    if (!storageOnlineRetryBound) {
        window.addEventListener('online', retryPendingSqliteOperations);
        storageOnlineRetryBound = true;
    }
}

function setCurrentDocumentRef(documentRecord, storageMode) {
    const record = documentRecord || {};
    const id = String(record.id || '').trim();
    if (!id) {
        currentDbDocId = null;
        currentDocumentRef = null;
        return null;
    }
    const previousRef = currentDocumentRef;
    const normalizedStorageMode = storageMode === 'sqlite' ? 'sqlite' : 'indb';
    const folderId = String(record.folderId || 'root');
    const sameLocation = !!(previousRef
        && previousRef.id === id
        && previousRef.storageMode === normalizedStorageMode
        && previousRef.folderId === folderId);
    const numericVersion = Number(record.version);
    currentDbDocId = id;
    currentLocalFileRef = null;
    currentGithubFileRef = null;
    currentDocumentRef = {
        id: id,
        storageMode: normalizedStorageMode,
        version: Number.isInteger(numericVersion) && numericVersion > 0 ? numericVersion : null,
        folderId: folderId,
        title: String(record.title || (previousRef && previousRef.title) || ''),
        createdAt: record.createdAt || (sameLocation && previousRef && previousRef.createdAt) || record.updatedAt || null,
        updatedAt: record.updatedAt || null
    };
    currentFileMetadata = { createdAt: currentDocumentRef.createdAt, dateLabel: '생성일' };
    if (!sameLocation) currentDocumentVirtualPath = '';
    return currentDocumentRef;
}

function clearCurrentDocumentRef() {
    currentDbDocId = null;
    currentDocumentRef = null;
    currentDocumentVirtualPath = '';
    currentFileMetadata = { createdAt: null, dateLabel: '생성일' };
    currentDocumentDisplayRequest += 1;
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
    if (!raw) return { path: '', text: '', hasText: false, fileName: '', sizeBytes: null, createdAt: null, dateLabel: '생성일' };
    if (typeof raw === 'string') return { path: String(raw), text: '', hasText: false, fileName: '', sizeBytes: null, createdAt: null, dateLabel: '생성일' };
    const path = String(raw.path || raw.filePath || '').trim();
    const textCandidate = raw.text ?? raw.content ?? raw.markdown;
    const hasText = textCandidate !== undefined && textCandidate !== null;
    const text = hasText ? String(textCandidate) : '';
    const fileName = String(raw.fileName || raw.name || '').trim();
    const rawSize = raw.sizeBytes ?? raw.size;
    const sizeBytes = Number.isFinite(Number(rawSize)) ? Number(rawSize) : null;
    const trueCreatedAt = raw.createdAt ?? raw.birthtimeMs ?? raw.birthTime;
    const modifiedAt = raw.modifiedAt ?? raw.lastModified ?? raw.mtimeMs;
    return {
        path,
        text,
        hasText,
        fileName,
        sizeBytes,
        createdAt: trueCreatedAt ?? modifiedAt ?? null,
        dateLabel: trueCreatedAt != null ? '생성일' : (modifiedAt != null ? '수정일' : '생성일')
    };
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

async function tryGetInitialFileViaTauri() {
    const tauriInvoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (typeof tauriInvoke !== 'function') return null;
    try {
        const result = await tauriInvoke('get_initial_file');
        return result ? normalizeExternalOpenPayload(result) : null;
    } catch (error) {
        showToast('시작 파일을 열 수 없습니다: ' + (error && error.message ? error.message : error));
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
    setCurrentDocumentInfo(fileName, payload.path || null, {
        sizeBytes: payload.sizeBytes,
        createdAt: payload.createdAt,
        dateLabel: payload.dateLabel
    });
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

function syncSidebarAiTheme() {
    document.body.classList.toggle('theme-light', !document.documentElement.classList.contains('dark'));
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    // The header theme control is the global reset point: it always aligns the
    // document/editor with the newly selected application theme. The footer
    // control may still override the document independently until this button
    // is used again.
    localStorage.setItem(EDITOR_LIGHT_KEY, isDark ? '' : '1');
    applyEditorLightPreference();
    syncSidebarAiTheme();
    refreshMermaidDisplay();
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

function toggleDocumentLightMode() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;
    const isLight = !dropZone.classList.contains('document-light-mode');
    localStorage.setItem(EDITOR_LIGHT_KEY, isLight ? '1' : '');
    applyEditorLightPreference();
}

function toggleEditorLightMode() {
    toggleDocumentLightMode();
}
window.toggleDocumentLightMode = toggleDocumentLightMode;

function applyDocumentThemeClasses(isLight) {
    const dropZone = document.getElementById('drop-zone');
    const vp = document.getElementById('content-viewport');
    const viewerContainer = document.getElementById('viewer-container');
    if (dropZone) {
        dropZone.classList.toggle('document-light-mode', isLight);
        dropZone.classList.toggle('document-dark-mode', !isLight);
    }
    if (vp) vp.classList.toggle('editor-light-mode', isLight);
    if (viewerContainer) viewerContainer.classList.toggle('document-light-mode', isLight);
    updateEditorLightButton();
}

function applyEditorLightPreference() {
    const want = localStorage.getItem(EDITOR_LIGHT_KEY) === '1';
    applyDocumentThemeClasses(want);
}

function updateEditorLightButton() {
    const vp = document.getElementById('content-viewport');
    const btn = document.getElementById('btn-editor-light');
    const sun = document.getElementById('editor-light-icon-sun');
    const moon = document.getElementById('editor-light-icon-moon');
    const label = document.getElementById('editor-light-label');
    if (!vp || !btn) return;
    const dropZone = document.getElementById('drop-zone');
    const isLight = dropZone ? dropZone.classList.contains('document-light-mode') : vp.classList.contains('editor-light-mode');
    if (sun) {
        sun.classList.toggle('hidden', !isLight);
        sun.style.display = isLight ? '' : 'none';
    }
    if (moon) {
        moon.classList.toggle('hidden', isLight);
        moon.style.display = isLight ? 'none' : '';
    }
    if (label) label.textContent = isLight ? '문서 Dark' : '문서 Light';
    if (btn) {
        btn.title = isLight ? '문서를 다크 모드로 전환 (편집·보기 공통)' : '문서를 라이트 모드로 전환 (편집·보기 공통)';
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', String(isLight));
    }
}

function relocateAiIntegrationSettingsIntoAiUse() {
    const card = document.getElementById('ai-link-settings-block');
    const slot = document.getElementById('ai-integration-settings-slot');
    if (!card || !slot) return;
    const deepseek = document.getElementById('deepseek-settings-card');
    const openaiCompatible = document.getElementById('openai-compatible-settings-card');
    const aiStudio = document.getElementById('ai-studio-settings-card');
    const openai = document.getElementById('openai-settings-card');
    const aiChatSettings = document.getElementById('ai-chat-settings');
    const scholarLmSettings = document.getElementById('scholar-ai-provider-settings');
    const ollamaSettings = document.getElementById('ollama-provider-settings');
    const liteRTLMSettings = document.getElementById('litertlm-provider-settings');
    const aiDataCenterSettings = document.getElementById('ai-data-center-settings');
    ensureAiProviderFoldsDefault();
    initializeAiSettingsDetailsToggles();
    if (aiChatSettings) {
        aiChatSettings.className = 'pb-3 border-b border-slate-200 dark:border-slate-700';
        applyAiChatSettingsFold(getAiChatSettingsFoldedFromLocal());
    }
    if (scholarLmSettings) {
        let providerBody = document.getElementById('scholar-lm-settings-body');
        if (!providerBody) {
            providerBody = document.createElement('div');
            providerBody.id = 'scholar-lm-settings-body';
            providerBody.className = 'hidden mt-3 space-y-3';
            while (scholarLmSettings.firstChild) {
                providerBody.appendChild(scholarLmSettings.firstChild);
            }
            const header = document.createElement('div');
            header.className = 'flex items-center justify-between gap-2';
            header.innerHTML = '<p class="text-xs font-semibold text-slate-700 dark:text-slate-300">LM Studio 설정</p>'
                + '<button type="button" id="scholar-lm-settings-fold-btn" onclick="toggleScholarLmSettingsFold()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-expanded="false" aria-controls="scholar-lm-settings-body">펼치기</button>';
            scholarLmSettings.appendChild(header);
            scholarLmSettings.appendChild(providerBody);
        }
        applyScholarLmSettingsFold(getScholarLmSettingsFoldedFromLocal());
    }
    if (ollamaSettings) {
        let ollamaBody = document.getElementById('scholar-ollama-settings-body');
        if (!ollamaBody) {
            ollamaBody = document.createElement('div');
            ollamaBody.id = 'scholar-ollama-settings-body';
            ollamaBody.className = 'hidden mt-3 space-y-3';
            while (ollamaSettings.firstChild) {
                ollamaBody.appendChild(ollamaSettings.firstChild);
            }
            const header = document.createElement('div');
            header.className = 'flex items-center justify-between gap-2';
            header.innerHTML = '<p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Ollama 설정</p>'
                + '<button type="button" id="scholar-ollama-settings-fold-btn" onclick="toggleScholarOllamaSettingsFold()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-expanded="false" aria-controls="scholar-ollama-settings-body">펼치기</button>';
            ollamaSettings.appendChild(header);
            ollamaSettings.appendChild(ollamaBody);
        }
        applyScholarOllamaSettingsFold(getScholarOllamaSettingsFoldedFromLocal());
    }
    [
        [scholarLmSettings, 'ai-settings-rack--lmstudio'],
        [ollamaSettings, 'ai-settings-rack--ollama'],
        [liteRTLMSettings, 'ai-settings-rack--litertlm'],
        [openaiCompatible, 'ai-settings-rack--compatible'],
        [aiStudio, 'ai-settings-rack--aistudio'],
        [deepseek, 'ai-settings-rack--deepseek'],
        [openai, 'ai-settings-rack--openai']
    ].forEach(function (entry) {
        if (!entry[0]) return;
        entry[0].classList.add('ai-settings-rack', entry[1]);
    });
    // AI 설정은 사용 흐름대로 고정한다: AI Jena와 로컬 모델, 외부 호환 API,
    // API 키 기반 공급자, 데이터 센터 순서. 문체 프롬프트는 이 슬롯 다음에 배치된다.
    [
        aiChatSettings,
        scholarLmSettings,
        ollamaSettings,
        liteRTLMSettings,
        openaiCompatible,
        aiStudio,
        deepseek,
        openai,
        aiDataCenterSettings
    ].forEach(function (section) {
        if (section) card.appendChild(section);
    });
    if (card.parentElement !== slot) slot.appendChild(card);
}

function initializeAiSettingsDetailsToggles() {
    document.querySelectorAll('#ai-link-settings-block details').forEach(function (details) {
        const summary = details.querySelector(':scope > summary');
        const toggle = summary && summary.querySelector('[data-ai-details-toggle]');
        if (!summary || !toggle) return;
        const sync = function () {
            const expanded = details.open === true;
            toggle.textContent = expanded ? '접기' : '펼치기';
            summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };
        if (!details.__aiSettingsToggleBound) {
            details.__aiSettingsToggleBound = true;
            details.addEventListener('toggle', sync);
        }
        sync();
    });
}

const OPENAI_COMPATIBLE_DEFAULTS = Object.freeze({
    provider: 'openai-compatible',
    baseUrl: 'https://api.orcarouter.ai/v1',
    modelId: 'deepseek/deepseek-v4-flash-free'
});
const OPENAI_COMPATIBLE_PROVIDER_URLS = Object.freeze({
    'openai-compatible': 'https://api.orcarouter.ai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    mistral: 'https://api.mistral.ai/v1',
    xai: 'https://api.x.ai/v1',
    perplexity: 'https://api.perplexity.ai',
    cerebras: 'https://api.cerebras.ai/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1'
});
const OPENAI_COMPATIBLE_MODELS_KEY = 'ss_openai_compatible_models_v1';
const OPENAI_COMPATIBLE_FREE_ONLY_KEY = 'ss_openai_compatible_free_only';
let openAICompatibleModels = [];

function normalizeOpenAICompatibleBaseUrl(value) {
    const raw = String(value || '').trim() || OPENAI_COMPATIBLE_DEFAULTS.baseUrl;
    let parsed;
    try { parsed = new URL(raw); } catch (_) { throw new Error('Base URL 형식이 올바르지 않습니다.'); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Base URL은 http:// 또는 https:// 주소여야 합니다.');
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
}

function validateOpenAICompatibleBaseUrlUI() {
    const input = document.getElementById('openai-compatible-base-url');
    const feedback = document.getElementById('openai-compatible-base-url-feedback');
    if (!input || !feedback) return false;
    try {
        normalizeOpenAICompatibleBaseUrl(input.value);
        feedback.textContent = 'OpenAI 호환 API 주소를 사용할 수 있습니다.';
        feedback.className = 'text-[11px] min-h-[1rem] text-green-600 dark:text-green-400';
        return true;
    } catch (error) {
        feedback.textContent = error.message;
        feedback.className = 'text-[11px] min-h-[1rem] text-red-600 dark:text-red-400';
        return false;
    }
}

function applyOpenAICompatibleProviderPreset() {
    const provider = document.getElementById('openai-compatible-provider');
    const baseUrl = document.getElementById('openai-compatible-base-url');
    if (!provider || !baseUrl) return;
    baseUrl.value = OPENAI_COMPATIBLE_PROVIDER_URLS[provider.value] || OPENAI_COMPATIBLE_DEFAULTS.baseUrl;
    validateOpenAICompatibleBaseUrlUI();
}

function closeOpenAICompatibleModelMenu() {
    const menu = document.getElementById('openai-compatible-model-menu');
    const button = document.getElementById('openai-compatible-model-menu-button');
    if (menu) menu.classList.add('hidden');
    if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleOpenAICompatibleModelMenu() {
    const menu = document.getElementById('openai-compatible-model-menu');
    const button = document.getElementById('openai-compatible-model-menu-button');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    if (button) button.setAttribute('aria-expanded', String(willOpen));
}

function selectOpenAICompatibleModel(modelId) {
    const input = document.getElementById('openai-compatible-model-id');
    if (input) {
        input.value = String(modelId || '');
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
    }
    closeOpenAICompatibleModelMenu();
}

function isOpenAICompatibleFreeModel(model) {
    const item = model && typeof model === 'object' ? model : { id: model };
    const id = String(item.id || item.model || item.name || '').trim().toLowerCase();
    if (!id) return false;
    if (id === 'orcarouter/free' || /(?:^|[\/-])free(?:$|[\/-])/.test(id)) return true;
    const pricing = item.pricing || item.price || {};
    const inputPrice = Number(pricing.prompt == null ? pricing.input : pricing.prompt);
    const outputPrice = Number(pricing.completion == null ? pricing.output : pricing.completion);
    return Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && inputPrice === 0 && outputPrice === 0;
}

function normalizeOpenAICompatibleModels(payload) {
    const rows = Array.isArray(payload && payload.data) ? payload.data
        : (Array.isArray(payload && payload.models) ? payload.models : (Array.isArray(payload) ? payload : []));
    const byId = new Map();
    rows.forEach(function (item) {
        const source = item && typeof item === 'object' ? item : { id: item };
        const id = String(source.id || source.model || source.name || '').trim();
        if (id && !byId.has(id)) byId.set(id, Object.assign({}, source, { id: id }));
    });
    return Array.from(byId.values());
}

function readOpenAICompatibleModelsCache() {
    try { return normalizeOpenAICompatibleModels(JSON.parse(localStorage.getItem(OPENAI_COMPATIBLE_MODELS_KEY) || '[]')); }
    catch (_) { return []; }
}

function setOpenAICompatibleStatus(message, state) {
    const status = document.getElementById('openai-compatible-connection-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.className = 'text-[11px] min-h-[1rem] ' + (state === 'error'
        ? 'text-red-600 dark:text-red-400'
        : state === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400');
}

function renderOpenAICompatibleModelMenu(models) {
    const menu = document.getElementById('openai-compatible-model-menu');
    const freeOnly = document.getElementById('openai-compatible-free-models-only');
    if (!menu) return [];
    const source = normalizeOpenAICompatibleModels(models);
    const visible = freeOnly && freeOnly.checked ? source.filter(isOpenAICompatibleFreeModel) : source;
    menu.innerHTML = '';
    if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'px-3 py-2 text-xs text-slate-500 dark:text-slate-400';
        empty.textContent = source.length ? '조건에 맞는 무료 모델이 없습니다.' : '모델 확인을 실행하세요.';
        menu.appendChild(empty);
        return visible;
    }
    visible.forEach(function (item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.className = 'block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/40';
        button.textContent = item.id;
        button.addEventListener('click', function () { selectOpenAICompatibleModel(item.id); });
        menu.appendChild(button);
    });
    return visible;
}

function applyOpenAICompatibleModelFilter() {
    const checkbox = document.getElementById('openai-compatible-free-models-only');
    localStorage.setItem(OPENAI_COMPATIBLE_FREE_ONLY_KEY, !checkbox || checkbox.checked ? '1' : '0');
    const visible = renderOpenAICompatibleModelMenu(openAICompatibleModels);
    setOpenAICompatibleStatus((checkbox && checkbox.checked ? '무료 모델 ' : '전체 모델 ') + visible.length + '개 표시', visible.length ? 'ok' : '');
}

function getOpenAICompatibleFormConnection() {
    const baseUrl = document.getElementById('openai-compatible-base-url');
    const apiKey = document.getElementById('openai-compatible-api-key');
    const modelId = document.getElementById('openai-compatible-model-id');
    const key = String(apiKey && apiKey.value || '').trim();
    if (!key) throw new Error('OrcaRouter API Key를 먼저 입력하세요.');
    return {
        baseUrl: normalizeOpenAICompatibleBaseUrl(baseUrl && baseUrl.value),
        apiKey: key,
        modelId: String(modelId && modelId.value || '').trim()
    };
}

function getStoredOpenAICompatibleConnection() {
    const key = String(localStorage.getItem('ss_openai_compatible_api_key') || '').trim();
    if (!key) throw new Error('OrcaRouter / OpenAI 호환 API Key가 없습니다. 설정에서 API Key를 저장하세요.');
    return {
        baseUrl: normalizeOpenAICompatibleBaseUrl(localStorage.getItem('ss_openai_compatible_base_url') || OPENAI_COMPATIBLE_DEFAULTS.baseUrl),
        apiKey: key,
        modelId: String(localStorage.getItem('ss_ai_chat_openai_compatible_model') || localStorage.getItem('ss_openai_compatible_model_id') || OPENAI_COMPATIBLE_DEFAULTS.modelId).trim()
    };
}

async function fetchOpenAICompatibleModels(connection) {
    const active = connection || getStoredOpenAICompatibleConnection();
    const response = await fetch(active.baseUrl + '/models', {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + active.apiKey }
    });
    if (!response.ok) throw new Error(await readOpenAICompatibleError(response));
    const models = normalizeOpenAICompatibleModels(await response.json());
    openAICompatibleModels = models;
    localStorage.setItem(OPENAI_COMPATIBLE_MODELS_KEY, JSON.stringify(models));
    return models.map(function (item) { return item.id; });
}

async function readOpenAICompatibleError(response) {
    let message = 'HTTP ' + response.status;
    try {
        const data = await response.json();
        message = String(data && data.error && (data.error.message || data.error) || data && data.message || message);
    } catch (_) {
        try { message = String(await response.text() || message); } catch (_) {}
    }
    return message;
}

async function checkOpenAICompatibleModels() {
    const button = document.getElementById('openai-compatible-check-models-button');
    try {
        if (button) button.disabled = true;
        setOpenAICompatibleStatus('서버에서 모델 목록을 확인하는 중...', '');
        const connection = getOpenAICompatibleFormConnection();
        await fetchOpenAICompatibleModels(connection);
        const visible = renderOpenAICompatibleModelMenu(openAICompatibleModels);
        const checkbox = document.getElementById('openai-compatible-free-models-only');
        if (visible.length) {
            const current = document.getElementById('openai-compatible-model-id');
            if (current && !visible.some(function (item) { return item.id === current.value; })) current.value = visible[0].id;
        }
        setOpenAICompatibleStatus('연결됨 · 전체 ' + openAICompatibleModels.length + '개 · ' + (checkbox && checkbox.checked ? '무료 ' + visible.length + '개' : '현재 ' + visible.length + '개') + ' 확인', 'ok');
        const menu = document.getElementById('openai-compatible-model-menu');
        if (menu) menu.classList.remove('hidden');
        return visible;
    } catch (error) {
        setOpenAICompatibleStatus('모델 확인 실패: ' + (error && error.message ? error.message : error), 'error');
        return [];
    } finally {
        if (button) button.disabled = false;
    }
}

async function testOpenAICompatibleConnection() {
    const button = document.getElementById('openai-compatible-test-button');
    try {
        if (button) button.disabled = true;
        setOpenAICompatibleStatus('선택 모델에 실제 응답을 요청하는 중...', '');
        const connection = getOpenAICompatibleFormConnection();
        if (!connection.modelId) throw new Error('연결 테스트에 사용할 모델을 선택하세요.');
        const response = await fetch(connection.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + connection.apiKey },
            body: JSON.stringify({ model: connection.modelId, messages: [{ role: 'user', content: 'Reply with OK only.' }], max_tokens: 8, stream: false })
        });
        if (!response.ok) throw new Error(await readOpenAICompatibleError(response));
        const data = await response.json();
        const text = String(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
        setOpenAICompatibleStatus('연결 테스트 성공 · ' + connection.modelId + (text ? ' · 응답: ' + text.slice(0, 80) : ''), 'ok');
        return true;
    } catch (error) {
        setOpenAICompatibleStatus('연결 테스트 실패: ' + (error && error.message ? error.message : error), 'error');
        return false;
    } finally {
        if (button) button.disabled = false;
    }
}

document.addEventListener('click', function (event) {
    const menu = document.getElementById('openai-compatible-model-menu');
    const button = document.getElementById('openai-compatible-model-menu-button');
    if (menu && !menu.contains(event.target) && (!button || !button.contains(event.target))) {
        closeOpenAICompatibleModelMenu();
    }
});

function loadOpenAICompatibleSettingsUI(settings) {
    const source = settings || {};
    const provider = document.getElementById('openai-compatible-provider');
    const baseUrl = document.getElementById('openai-compatible-base-url');
    const apiKey = document.getElementById('openai-compatible-api-key');
    const modelId = document.getElementById('openai-compatible-model-id');
    if (provider) provider.value = source.openaiCompatibleProvider || localStorage.getItem('ss_openai_compatible_provider') || OPENAI_COMPATIBLE_DEFAULTS.provider;
    if (baseUrl) baseUrl.value = source.openaiCompatibleBaseUrl || localStorage.getItem('ss_openai_compatible_base_url') || OPENAI_COMPATIBLE_DEFAULTS.baseUrl;
    if (apiKey) apiKey.value = source.openaiCompatibleApiKey || localStorage.getItem('ss_openai_compatible_api_key') || '';
    if (modelId) modelId.value = source.openaiCompatibleModelId || localStorage.getItem('ss_openai_compatible_model_id') || OPENAI_COMPATIBLE_DEFAULTS.modelId;
    const freeOnly = document.getElementById('openai-compatible-free-models-only');
    if (freeOnly) freeOnly.checked = localStorage.getItem(OPENAI_COMPATIBLE_FREE_ONLY_KEY) !== '0';
    openAICompatibleModels = readOpenAICompatibleModelsCache();
    renderOpenAICompatibleModelMenu(openAICompatibleModels);
    validateOpenAICompatibleBaseUrlUI();
}

async function saveOpenAICompatibleSettings() {
    const provider = document.getElementById('openai-compatible-provider');
    const baseUrl = document.getElementById('openai-compatible-base-url');
    const apiKey = document.getElementById('openai-compatible-api-key');
    const modelId = document.getElementById('openai-compatible-model-id');
    const feedback = document.getElementById('openai-compatible-save-feedback');
    let normalizedBaseUrl;
    try { normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl && baseUrl.value); }
    catch (error) { validateOpenAICompatibleBaseUrlUI(); showToast(error.message); return; }
    const data = {
        openaiCompatibleProvider: String(provider && provider.value || OPENAI_COMPATIBLE_DEFAULTS.provider),
        openaiCompatibleBaseUrl: normalizedBaseUrl,
        openaiCompatibleApiKey: String(apiKey && apiKey.value || '').trim(),
        openaiCompatibleModelId: String(modelId && modelId.value || '').trim() || OPENAI_COMPATIBLE_DEFAULTS.modelId
    };
    await setAiSettings(data);
    localStorage.setItem('ss_openai_compatible_provider', data.openaiCompatibleProvider);
    localStorage.setItem('ss_openai_compatible_base_url', data.openaiCompatibleBaseUrl);
    localStorage.setItem('ss_openai_compatible_api_key', data.openaiCompatibleApiKey);
    localStorage.setItem('ss_openai_compatible_model_id', data.openaiCompatibleModelId);
    localStorage.setItem('ss_ai_chat_openai_compatible_model', data.openaiCompatibleModelId);
    if (baseUrl) baseUrl.value = data.openaiCompatibleBaseUrl;
    if (modelId) modelId.value = data.openaiCompatibleModelId;
    if (feedback) feedback.textContent = '저장되었습니다. 외부 AI 앱에서 이 구성을 사용할 수 있습니다.';
    if (window.AIChat && typeof window.AIChat.syncSettings === 'function') window.AIChat.syncSettings();
    showToast('OpenAI 호환 API 설정을 저장했습니다.');
}

async function resetOpenAICompatibleSettings() {
    const provider = document.getElementById('openai-compatible-provider');
    const baseUrl = document.getElementById('openai-compatible-base-url');
    const apiKey = document.getElementById('openai-compatible-api-key');
    const modelId = document.getElementById('openai-compatible-model-id');
    if (provider) provider.value = OPENAI_COMPATIBLE_DEFAULTS.provider;
    if (baseUrl) baseUrl.value = OPENAI_COMPATIBLE_DEFAULTS.baseUrl;
    if (apiKey) apiKey.value = '';
    if (modelId) modelId.value = OPENAI_COMPATIBLE_DEFAULTS.modelId;
    const freeOnly = document.getElementById('openai-compatible-free-models-only');
    if (freeOnly) freeOnly.checked = true;
    localStorage.setItem(OPENAI_COMPATIBLE_FREE_ONLY_KEY, '1');
    renderOpenAICompatibleModelMenu(openAICompatibleModels);
    await saveOpenAICompatibleSettings();
    showToast('OrcaRouter 기본 구성으로 초기화했습니다.');
}

function organizeSettingsDashboard() {
    const body = document.getElementById('settings-modal-body');
    if (!body || document.getElementById('settings-dashboard-general')) return;

    function createColumn(id, title, icon) {
        const column = document.createElement('section');
        column.id = id;
        column.className = 'settings-dashboard-column';
        column.setAttribute('aria-label', title);

        const heading = document.createElement('div');
        heading.className = 'settings-column-title';
        heading.innerHTML =
            '<i data-lucide="' + icon + '" class="w-4 h-4"></i>' +
            '<span>' + title + '</span>';
        const toggleButton = createSettingsContainerFoldButton(id, title + ' 설정');
        heading.appendChild(toggleButton);

        const content = document.createElement('div');
        content.id = id + '-body';
        content.className = 'settings-dashboard-column-body';
        column.appendChild(heading);
        column.appendChild(content);
        configureSettingsFoldContainer(column, content, toggleButton);
        body.appendChild(column);
        return column;
    }

    function appendToColumn(column, item) {
        if (!column || !item) return;
        const content = document.getElementById(column.id + '-body');
        (content || column).appendChild(item);
    }

    const generalColumn = createColumn(
        'settings-dashboard-general',
        '앱 세팅',
        'layout-dashboard'
    );
    const saveColumn = createColumn(
        'settings-dashboard-save',
        'STORAGE',
        'save'
    );
    const toolsColumn = createColumn(
        'settings-dashboard-tools',
        '기능 표시 · 사용 도구',
        'sliders-horizontal'
    );
    const aiColumn = createColumn(
        'settings-dashboard-ai',
        'AI 관련 설정',
        'sparkles'
    );

    const pwaSettings = document.getElementById('pwa-settings-card');
    const googleCalendar = document.getElementById('google-calendar-settings-card');
    const codeColors = document.getElementById('code-color-settings-card');
    const pvHeaderSettings = document.getElementById('pv-header-settings-card');
    const mermaidDisplay = document.getElementById('mermaid-display-settings-card');
    const shortcuts = document.getElementById('shortcuts-settings-card');
    const inDbBackupPrefix = document.getElementById('indb-backup-prefix-settings-card');
    const inDbStorageSettings = document.getElementById('indb-storage-settings-card');
    const aiUser = document.getElementById('ai-user-settings-card');
    const headerFileActionSettings = document.createElement('div');
    headerFileActionSettings.id = 'header-file-action-style-settings';
    headerFileActionSettings.className = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3';
    headerFileActionSettings.innerHTML = [
        '<div class="text-xs font-bold text-slate-700 dark:text-slate-200">앱 저장·열기 표시</div>',
        '<div class="mt-2 flex items-center gap-4" role="radiogroup" aria-label="앱 저장 및 열기 메뉴 표시 방식">',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-file-action-style" value="button" checked onchange="setHeaderFileActionStyle(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>버튼형</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-file-action-style" value="text" onchange="setHeaderFileActionStyle(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>글자형</span></label>',
        '</div>',
        '<p class="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">버튼형은 새파일·열기·내보내기·저장을 아이콘으로만 표시합니다.</p>'
    ].join('');
    // PWA는 독립 대시보드 컬럼이 아니라 앱 자체에 관한 설정이므로
    // 앱 세팅의 첫 항목으로 배치한다.
    if (pwaSettings) appendToColumn(generalColumn, pwaSettings);
    appendToColumn(generalColumn, headerFileActionSettings);
    applyHeaderFileActionStyle(getHeaderFileActionStyle(), false);
    const headerFeatureKeySettings = document.createElement('div');
    headerFeatureKeySettings.id = 'header-feature-key-style-settings';
    headerFeatureKeySettings.className = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3';
    headerFeatureKeySettings.innerHTML = [
        '<div class="text-xs font-bold text-slate-700 dark:text-slate-200">기능키 표시</div>',
        '<div class="mt-2 flex items-center gap-4" role="radiogroup" aria-label="상단 기능키 표시 방식">',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-feature-key-style" value="button" onchange="setHeaderFeatureKeyStyle(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>버튼형</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-feature-key-style" value="text" onchange="setHeaderFeatureKeyStyle(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>글자형</span></label>',
        '</div>',
        '<p class="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">학술검색·PDF 병합·Sites·양식·AI 기능키의 표시 방식을 바꿉니다.</p>'
    ].join('');
    appendToColumn(generalColumn, headerFeatureKeySettings);
    applyHeaderFeatureKeyStyle(getHeaderFeatureKeyStyle(), false);
    const headerHeadingSettings = document.createElement('div');
    headerHeadingSettings.id = 'header-heading-display-settings';
    headerHeadingSettings.className = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3';
    headerHeadingSettings.innerHTML = [
        '<div class="text-xs font-bold text-slate-700 dark:text-slate-200">Header 제목 버튼</div>',
        '<div class="mt-2 flex items-center gap-4" role="radiogroup" aria-label="Header 제목 버튼 접기 또는 펼치기">',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-heading-display" value="collapsed" onchange="setHeaderHeadingDisplay(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>접기</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="header-heading-display" value="expanded" onchange="setHeaderHeadingDisplay(this.value)" class="text-indigo-600 focus:ring-indigo-500"><span>펼치기</span></label>',
        '</div>',
        '<p class="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">접으면 H1~H3이 하나의 드롭다운 버튼으로 표시됩니다. 기본값은 접기입니다.</p>'
    ].join('');
    appendToColumn(generalColumn, headerHeadingSettings);
    applyHeaderHeadingDisplay(getHeaderHeadingDisplay(), false);
    if (aiUser) {
        aiUser.className = 'border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50 space-y-2';
        appendToColumn(generalColumn, aiUser);
    }
    if (googleCalendar) appendToColumn(generalColumn, googleCalendar);
    if (codeColors) appendToColumn(generalColumn, codeColors);
    if (pvHeaderSettings) appendToColumn(generalColumn, pvHeaderSettings);
    if (mermaidDisplay) appendToColumn(generalColumn, mermaidDisplay);
    if (shortcuts) appendToColumn(generalColumn, shortcuts);
    if (inDbBackupPrefix) appendToColumn(generalColumn, inDbBackupPrefix);

    const githubSettings = document.getElementById('github-settings-slot');

    const sidebarVisibilitySettings = document.createElement('div');
    sidebarVisibilitySettings.id = 'storage-sidebar-visibility-settings';
    sidebarVisibilitySettings.className = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3';
    sidebarVisibilitySettings.innerHTML = [
        '<div class="text-xs font-bold text-slate-700 dark:text-slate-200">SIDEBAR 보이기</div>',
        '<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="사이드바 저장소 항목 표시">',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" id="sidebar-storage-local-visible" data-storage-sidebar-visibility="local" onchange="onStorageSidebarVisibilityChange()" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"><span>Local</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" id="sidebar-storage-indb-visible" data-storage-sidebar-visibility="indb" onchange="onStorageSidebarVisibilityChange()" checked class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"><span>inDB</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" id="sidebar-storage-sqlite-visible" data-storage-sidebar-visibility="sqlite" onchange="onStorageSidebarVisibilityChange()" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"><span>SQLite</span></label>',
        '  <label class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" id="sidebar-storage-github-visible" data-storage-sidebar-visibility="github" onchange="onStorageSidebarVisibilityChange()" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"><span>Github</span></label>',
        '</div>',
        '<p class="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">기본은 inDB만 표시합니다. Local·SQLite·Github는 아래 사용 설정을 처음 켜면 자동으로 표시되며, 이후에는 여기서 직접 표시하거나 숨길 수 있습니다.</p>'
    ].join('');
    appendToColumn(saveColumn, sidebarVisibilitySettings);
    if (typeof window.syncStorageSidebarVisibilitySettingsUI === 'function') {
        window.syncStorageSidebarVisibilitySettingsUI();
    }
    const localSaveTools = document.createElement('div');
    localSaveTools.id = 'settings-local-save-tools';
    localSaveTools.className = 'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-3';
    localSaveTools.innerHTML = '<div class="text-xs font-bold text-slate-600 dark:text-slate-300">Local 저장소</div>';

    if (inDbStorageSettings) appendToColumn(saveColumn, inDbStorageSettings);

    const sqliteExplorerButton = document.getElementById('btn-open-sqlite-explorer');
    if (sqliteExplorerButton) {
        sqliteExplorerButton.className = 'w-full px-4 py-2 border-2 border-emerald-700 dark:border-emerald-600 rounded-md text-sm font-medium text-emerald-800 dark:text-emerald-300 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40 disabled:cursor-not-allowed';
    }

    const featureTools = document.getElementById('feature-tools-settings');
    const sqliteTool = document.getElementById('sqlite-settings-tool');
    const localStorageTool = document.getElementById('local-storage-settings-tool');
    if (featureTools) appendToColumn(toolsColumn, featureTools);
    if (localStorageTool) localSaveTools.appendChild(localStorageTool);
    if (localStorageTool) appendToColumn(saveColumn, localSaveTools);
    if (githubSettings) appendToColumn(saveColumn, githubSettings);
    if (sqliteTool) localSaveTools.appendChild(sqliteTool);
    if (sqliteExplorerButton) localSaveTools.appendChild(sqliteExplorerButton);
    if ((sqliteTool || sqliteExplorerButton) && !localStorageTool) appendToColumn(saveColumn, localSaveTools);

    const aiMaster = document.getElementById('ai-master-settings-card');
    const aiIntegration = document.getElementById('ai-integration-settings-slot');
    const aiWritingStylePrompt = document.getElementById('ai-writing-style-prompt-settings');
    if (aiMaster) appendToColumn(aiColumn, aiMaster);
    if (aiIntegration) appendToColumn(aiColumn, aiIntegration);
    // 문체 프롬프트는 기능 표시 영역이 아니라 AI 관련 설정의 마지막 항목으로 둔다.
    if (aiWritingStylePrompt) appendToColumn(aiColumn, aiWritingStylePrompt);

    const legacyCard = document.getElementById('legacy-ai-settings-card');
    if (legacyCard) legacyCard.classList.add('hidden');

    initializeSettingsContainerFolds();
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

function scheduleNonCriticalStartupTasks() {
    const run = function () {
        if (typeof window.isInDbStorageEnabled === 'function' && !window.isInDbStorageEnabled()) return;
        syncKnownFeatureDataToInDb().catch(function (error) {
            console.warn('Feature data background sync failed:', error);
        });
    };
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 2500 });
    } else {
        setTimeout(run, 250);
    }
}

function initializeOptionalPerformanceBenchmark() {
    if (new URLSearchParams(window.location.search).get('perfBench') !== '1') return;
    loadOptionalScript('inputPaintBenchmark', function () { return !!window.MDInputPaintBenchmark; })
        .then(function () { window.MDInputPaintBenchmark.mount(); })
        .catch(function (error) { console.warn('Performance benchmark could not be loaded:', error); });
}

function initializeOptionalCodeMirrorPrototype() {
    if (new URLSearchParams(window.location.search).get('editor') !== 'cm6') return;
    loadOptionalScript('codeMirrorPrototype', function () { return !!window.MDCm6Prototype; }, { module: true })
        .then(function () {
            if (editorTextarea) window.MDCm6Prototype.mount(editorTextarea, { syncDelayMs: 120 });
        })
        .catch(function (error) {
            console.warn('CodeMirror prototype could not be loaded; textarea fallback remains active:', error);
            showToast('CodeMirror 시험 모드를 불러오지 못해 기본 편집기를 사용합니다.');
        });
}

window.onload = async () => {
    try {
        if (window.MiniPreviewUI && window.MiniPreviewUI.ready && typeof window.MiniPreviewUI.ready.then === 'function') {
            await window.MiniPreviewUI.ready;
        }
        initTheme();
        setMainHeaderBackgroundRemoved(mainHeaderBackgroundRemoved, false);
        initSettings();
        miniPreviewEnabled = getMiniPreviewEnabledFromLocal();
        updateMiniPreviewButton();
        initMacroFeature();
        initUserSettingsModule();
        relocateAiIntegrationSettingsIntoAiUse();
        organizeSettingsDashboard();
        refreshLucideIcons(document);
        initViewCopyFab();
        initializeLazyAiChatEntry();
        initializeOptionalPerformanceBenchmark();
        initializeOptionalCodeMirrorPrototype();
        toggleMode('edit');

        await initDB();
        if (window.TextStyleTool && typeof window.TextStyleTool.setDatabase === 'function') {
            try {
                await window.TextStyleTool.setDatabase(db);
            } catch (error) {
                console.warn('Custom font inDB initialization failed:', error);
                showToast('사용자 폰트 저장소를 열지 못해 임시 저장 방식으로 동작합니다.');
            }
        }
        if (window.MDPStorage && typeof window.MDPStorage.initialize === 'function') {
            const storageState = await window.MDPStorage.initialize({ getIndexedDb: function () { return db; } });
            if (window.TextStyleTool && typeof window.TextStyleTool.setSqliteStorage === 'function') {
                const fontSync = await window.TextStyleTool.setSqliteStorage(window.MDPStorage);
                if (fontSync && fontSync.pending) {
                    console.info('Custom font SQLite mirror is pending:', fontSync.error || 'SQLite unavailable');
                }
            }
            if (storageStatusUnsubscribe) storageStatusUnsubscribe();
            storageStatusUnsubscribe = window.MDPStorage.subscribe(function (nextState) {
                if (nextState && nextState.sqliteHealth && nextState.sqliteHealth.available
                    && window.TextStyleTool && typeof window.TextStyleTool.syncToSqlite === 'function') {
                    window.TextStyleTool.syncToSqlite().catch(function (error) {
                        console.warn('Custom font SQLite mirror retry skipped:', error && error.message ? error.message : error);
                    });
                }
                if (currentStorageSourceTab === 'github' || currentStorageSourceTab === 'local') return;
                const nextMode = nextState && nextState.activeMode === 'sqlite' ? 'sqlite' : 'indb';
                const modeChanged = currentStorageSourceTab !== nextMode;
                if (currentStorageSourceTab !== nextMode) {
                    currentStorageSourceTab = nextMode;
                    setStorageSourceTabToLocal(nextMode);
                }
                if (typeof updateStorageSourceTabsUI === 'function') updateStorageSourceTabsUI();
                updateStorageRecoveryStatusUI(nextState);
                syncSqlitePendingRetryTimer(nextState);
                if (modeChanged && activeSidebarTab === 'files') renderDBList();
                if (modeChanged && nextMode === 'sqlite'
                    && window.MDPCredentialVault && typeof window.MDPCredentialVault.restoreCatalog === 'function') {
                    window.MDPCredentialVault.load()
                        .then(function () { return window.MDPCredentialVault.restoreCatalog(); })
                        .catch(function (error) {
                            console.warn('AI tool settings SQLite restore skipped:', error && error.message ? error.message : error);
                        });
                }
                if (modeChanged && nextMode === 'sqlite') {
                    syncShareAddressSettingsToSqlite().catch(function (error) {
                        console.warn('Share address SQLite sync skipped:', error && error.message ? error.message : error);
                    });
                }
            });
            if (window.SettingUI && typeof window.SettingUI.refreshSqliteStatus === 'function') {
                await window.SettingUI.refreshSqliteStatus();
            }
            if (storageState && storageState.activeMode === 'sqlite'
                && window.MDPCredentialVault && typeof window.MDPCredentialVault.load === 'function') {
                try {
                    await window.MDPCredentialVault.load();
                    if (typeof window.MDPCredentialVault.restoreCatalog === 'function') {
                        await window.MDPCredentialVault.restoreCatalog();
                    }
                } catch (vaultError) {
                    console.warn('Encrypted API key vault status load skipped:', vaultError && vaultError.message ? vaultError.message : vaultError);
                }
            }
            if (storageState && storageState.activeMode === 'sqlite') {
                await syncShareAddressSettingsToSqlite().catch(function (error) {
                    console.warn('Share address SQLite startup sync skipped:', error && error.message ? error.message : error);
                });
            }
            if (storageState && storageState.activeMode !== 'sqlite'
                && getStorageSourceTabFromLocal() === 'sqlite') {
                setStorageSourceTabToLocal('indb');
            }
            updateStorageRecoveryStatusUI(storageState);
            syncSqlitePendingRetryTimer(storageState);
        }
        if (window.TidyScriptManager && typeof window.TidyScriptManager.configure === 'function') {
            await window.TidyScriptManager.configure({
                getSettings: getAiSettings,
                setSettings: setAiSettings,
                isEditMode: function () { return isEditMode; },
                editorTextarea: editorTextarea,
                getActionDeps: getTidyActionDeps,
                showToast: showToast
            });
        }
        loadFolderCollapseState();
        currentStorageSourceTab = getStorageSourceTabFromLocal();
        updateStorageSourceTabsUI();
        await Promise.all([
            ensureRootFolder(),
            cleanupBootBlockedDocuments()
        ]);
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
        if (!receivedExternalContent) await checkAutoSave();

        if (isEditMode && editorTextarea) editorTextarea.focus();
        scheduleNonCriticalStartupTasks();

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
            refreshLucideIcons(sidebar);
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

    tryGetInitialFileViaTauri().then(function (data) {
        if (!data) return;
        applyIncomingOpenedFile(data, {
            askBeforeReplace: false,
            toastMessage: '시작 파일을 열었습니다.',
            showMissingTextToast: true
        });
    });

    if (editorTextarea) editorTextarea.addEventListener('input', () => {
        currentMarkdown = editorTextarea.value;
        scheduleCurrentDocumentMetadataDisplay();
        syncRenderSourceRevision(currentMarkdown);
        if (window.__mdPerformanceBenchmarkActive) return;
        const baseDelay = getEditorInputDebounceMs();
        scheduleUpdatePreviewPopupContent(baseDelay + 40);
        scheduleMiniPreviewRender(baseDelay + 40);
        scheduleRenderTOC(baseDelay + 20);
        schedulePerformAutoSave(baseDelay + 80);
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
        if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'KeyU' || e.key === 'U' || e.key === 'u')) {
            e.preventDefault();
            insertAtCursor('superscript');
            return;
        }
        if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'KeyY' || e.key === 'Y' || e.key === 'y')) {
            e.preventDefault();
            insertAtCursor('subscript');
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
    updateCurrentDocumentMetadataDisplay();
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
    if (!isDocumentDirty()) return true;
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
        let content = (d.content || 'Footnote content.')
            .replace(/^<span\b[^>]*>/i, '')
            .replace(/<\/span>\s*$/i, '')
            .replace(/\s*<a class="md-footnote-backref"[^>]*>[\s\S]*?<\/a>\s*$/i, '')
            .trim() || 'Footnote content.';
        const plainUrl = content.match(/^https?:\/\/[^\s<>]+$/i);
        if (plainUrl) {
            const safeUrl = plainUrl[0]
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            content = '<a class="md-footnote-url" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + safeUrl + '</a>';
        }
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

function preprocessMarkdownForView(raw, options) {
    const opts = options || {};
    let s = opts.commentsAlreadyHidden
        ? String(raw ?? '')
        : hideMarkdownCommentsForRender(raw);
    if (window.NoteCoverRenderer && typeof window.NoteCoverRenderer.replaceInMarkdown === 'function') {
        s = window.NoteCoverRenderer.replaceInMarkdown(s);
    }
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

/** 원본 Markdown을 변경하지 않고 화면 렌더용 주석 숨김 문자열을 반환한다. */
function hideMarkdownCommentsForRender(raw) {
    renderPreparationStats.commentHideRuns += 1;
    if (window.MDComment && typeof window.MDComment.stripForRender === 'function') {
        return window.MDComment.stripForRender(raw);
    }
    return String(raw ?? '').replace(/<!--[\s\S]*?-->/g, function (comment) {
        if (/^<!--\s*note-cover\b/i.test(comment)) return comment;
        return comment.replace(/[^\r\n]/g, '');
    });
}

function stripMarkdownCommentsForView(raw) {
    return hideMarkdownCommentsForRender(raw);
}

function syncRenderSourceRevision(raw) {
    const source = String(raw ?? '');
    if (source !== renderSourceValue) {
        renderSourceValue = source;
        renderSourceRevision += 1;
        renderPreparationStats.sourceChanges += 1;
    }
    return renderSourceRevision;
}

function getRenderPreparationSettingsKey() {
    return String(renderPreparationSettingsRevision) + ':' + (notebookLmEqualsHrPreprocess ? '1' : '0');
}

function invalidateRenderPreparationCache() {
    renderPreparationSettingsRevision += 1;
    renderPreparationCache = [];
}

function detectRenderFeatures(source) {
    const value = String(source ?? '');
    return {
        hasMath: /(?:\$\$|\\\(|\\\[|(^|[^\\])\$[^$\r\n]+\$)/m.test(value),
        hasMermaid: /```\s*mermaid\b/i.test(value),
        hasInternalImages: /internal:\/\//i.test(value),
        hasDoiLinks: /https?:\/\/(?:dx\.)?doi\.org\//i.test(value),
        hasNoteCover: /class="note-cover-page\b/i.test(value)
    };
}

function applyMarkdownImageSizeHints(rootElement) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return 0;
    let applied = 0;
    rootElement.querySelectorAll('img').forEach(function (image) {
        const hintNode = image.nextSibling;
        if (!hintNode || hintNode.nodeType !== 3) return;
        const text = String(hintNode.nodeValue || '');
        const match = text.match(/^\s*\{\s*(w(?:idth)?|h(?:eight)?)\s*=\s*(\d+(?:\.\d+)?)\s*(px|mm|cm|in|pt|%)?\s*\}/i);
        if (!match) return;
        const property = String(match[1] || '').toLowerCase().startsWith('h') ? 'height' : 'width';
        const unit = String(match[3] || 'px').toLowerCase();
        image.style[property] = match[2] + unit;
        image.style[property === 'height' ? 'width' : 'height'] = 'auto';
        image.style.maxWidth = '100%';
        image.style.objectFit = 'contain';
        const remainder = text.slice(match[0].length);
        if (remainder) hintNode.nodeValue = remainder;
        else hintNode.remove();
        applied += 1;
    });
    return applied;
}

window.applyMarkdownImageSizeHints = applyMarkdownImageSizeHints;

function prepareMarkdownRenderSnapshot(raw) {
    const sourceRaw = String(raw ?? '');
    const revision = syncRenderSourceRevision(sourceRaw);
    const settingsKey = getRenderPreparationSettingsKey();
    const cached = renderPreparationCache.find(function (candidate) {
        return candidate.revision === revision
            && candidate.settingsKey === settingsKey
            && candidate.sourceRaw === sourceRaw;
    });
    if (cached) {
        renderPreparationStats.snapshotHits += 1;
        return cached;
    }

    renderPreparationStats.snapshotMisses += 1;
    const renderSource = hideMarkdownCommentsForRender(sourceRaw);
    renderPreparationStats.preprocessRuns += 1;
    const preprocessed = preprocessMarkdownForView(renderSource, { commentsAlreadyHidden: true });
    const snapshot = {
        revision: revision,
        settingsKey: settingsKey,
        sourceRaw: sourceRaw,
        renderSource: renderSource,
        preprocessed: preprocessed,
        features: detectRenderFeatures(preprocessed),
        baseHtmlPromise: null
    };
    renderPreparationCache.unshift(snapshot);
    if (renderPreparationCache.length > RENDER_PREPARATION_CACHE_LIMIT) {
        renderPreparationCache.length = RENDER_PREPARATION_CACHE_LIMIT;
    }
    return snapshot;
}

function isMarkdownRenderSnapshotCurrent(snapshot, source) {
    if (!snapshot) return false;
    const currentSource = source == null
        ? String(editorTextarea && typeof editorTextarea.value === 'string' ? editorTextarea.value : currentMarkdown ?? '')
        : String(source);
    const currentRevision = syncRenderSourceRevision(currentSource);
    const current = snapshot.revision === currentRevision
        && snapshot.settingsKey === getRenderPreparationSettingsKey()
        && snapshot.sourceRaw === currentSource;
    if (!current) renderPreparationStats.staleResults += 1;
    return current;
}

async function renderMarkdownSnapshotToHtml(snapshot, options) {
    const opts = options || {};
    if (!snapshot) return '';
    let preprocessed = snapshot.preprocessed;
    let cacheable = true;

    if (snapshot.features.hasInternalImages && typeof opts.resolveInternalImages === 'function') {
        cacheable = false;
        const resolved = await opts.resolveInternalImages(snapshot.renderSource);
        renderPreparationStats.preprocessRuns += 1;
        preprocessed = preprocessMarkdownForView(resolved, { commentsAlreadyHidden: true });
    }

    const createHtml = async function () {
        renderPreparationStats.markdownParseRuns += 1;
        if (typeof MathRender !== 'undefined' && MathRender && typeof MathRender.renderMarkdownSafe === 'function') {
            return String(await MathRender.renderMarkdownSafe(
                (typeof marked !== 'undefined' && marked.parse) ? marked : null,
                preprocessed,
                { fallbackText: preprocessed }
            ) || '');
        }
        if (typeof marked !== 'undefined' && marked.parse) {
            return String(marked.parse(preprocessed) || '');
        }
        return escapeMarkdownRenderFallback(preprocessed);
    };

    if (!cacheable) return createHtml();
    if (!snapshot.baseHtmlPromise) {
        snapshot.baseHtmlPromise = Promise.resolve().then(createHtml).catch(function (error) {
            snapshot.baseHtmlPromise = null;
            throw error;
        });
    }
    return snapshot.baseHtmlPromise;
}

function getRenderPreparationDebugState() {
    return Object.assign({}, renderPreparationStats, {
        revision: renderSourceRevision,
        settingsRevision: renderPreparationSettingsRevision,
        cacheSize: renderPreparationCache.length
    });
}

window.hideMarkdownCommentsForRender = hideMarkdownCommentsForRender;
window.stripMarkdownCommentsForView = stripMarkdownCommentsForView;
window.syncRenderSourceRevision = syncRenderSourceRevision;
window.invalidateRenderPreparationCache = invalidateRenderPreparationCache;
window.prepareMarkdownRenderSnapshot = prepareMarkdownRenderSnapshot;
window.isMarkdownRenderSnapshotCurrent = isMarkdownRenderSnapshotCurrent;
window.renderMarkdownSnapshotToHtml = renderMarkdownSnapshotToHtml;
window.getRenderPreparationDebugState = getRenderPreparationDebugState;
window.getRenderCoordinatorDebugState = function () {
    return renderCoordinator ? renderCoordinator.getStats() : null;
};

const NOTE_COVER_HISTORY_LIMIT = 100;
let noteCoverUndoStack = [];
let noteCoverRedoStack = [];
let noteCoverHistoryApplying = false;

function getNoteCoverMarkdownSource() {
    let source = String(currentMarkdown ?? '');
    const cmView = editorTextarea && editorTextarea.__mdCm6View;
    if (cmView && cmView.state && cmView.state.doc) {
        source = String(cmView.state.doc.toString());
    } else if (editorTextarea && typeof editorTextarea.value === 'string') {
        source = String(editorTextarea.value);
    }
    return source;
}

function recordNoteCoverHistory(beforeMarkdown, afterMarkdown, historyKey, coalesce) {
    if (noteCoverHistoryApplying || beforeMarkdown === afterMarkdown) return;
    const key = String(historyKey || 'note-cover');
    const now = Date.now();
    const last = noteCoverUndoStack[noteCoverUndoStack.length - 1];
    if (coalesce && last && last.key === key && last.after === beforeMarkdown && now - last.time < 1200) {
        last.after = afterMarkdown;
        last.time = now;
    } else {
        noteCoverUndoStack.push({ before: beforeMarkdown, after: afterMarkdown, key: key, time: now });
        if (noteCoverUndoStack.length > NOTE_COVER_HISTORY_LIMIT) noteCoverUndoStack.shift();
    }
    noteCoverRedoStack = [];
}

function applyNoteCoverMarkdownUpdate(updated, userEvent, options) {
    if (!updated || updated.changed !== true || typeof updated.markdown !== 'string') return false;
    const opts = options || {};
    const beforeMarkdown = getNoteCoverMarkdownSource();
    const nextMarkdown = updated.markdown;
    if (nextMarkdown === beforeMarkdown) return false;
    if (opts.recordHistory !== false) {
        recordNoteCoverHistory(beforeMarkdown, nextMarkdown, opts.historyKey || userEvent, !!opts.coalesce);
    }
    if (window.NoteCoverRenderer && typeof window.NoteCoverRenderer.setPendingSelection === 'function') {
        if (opts.clearSelection) window.NoteCoverRenderer.setPendingSelection(opts.coverIndex, '');
        else if (opts.selectElementId) window.NoteCoverRenderer.setPendingSelection(opts.coverIndex, opts.selectElementId);
    }
    const cmView = editorTextarea && editorTextarea.__mdCm6View;
    if (cmView && cmView.state && typeof cmView.dispatch === 'function') {
        cmView.dispatch({
            changes: { from: 0, to: cmView.state.doc.length, insert: nextMarkdown },
            userEvent: userEvent || 'input.noteCover'
        });
    }
    if (editorTextarea) {
        editorTextarea.value = nextMarkdown;
        editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        currentMarkdown = nextMarkdown;
        syncRenderSourceRevision(currentMarkdown);
        mainRenderDirty = true;
        schedulePerformAutoSave(120);
    }
    if (opts.renderAfter) renderMarkdown({ force: true });
    return true;
}

function undoNoteCoverEdit() {
    const entry = noteCoverUndoStack[noteCoverUndoStack.length - 1];
    if (!entry) {
        showToast('되돌릴 표지 편집이 없습니다.');
        return false;
    }
    if (getNoteCoverMarkdownSource() !== entry.after) {
        noteCoverUndoStack = [];
        noteCoverRedoStack = [];
        showToast('문서가 다른 곳에서 변경되어 표지 Undo 기록을 초기화했습니다.');
        return false;
    }
    noteCoverUndoStack.pop();
    noteCoverRedoStack.push(entry);
    noteCoverHistoryApplying = true;
    try {
        applyNoteCoverMarkdownUpdate(
            { changed: true, markdown: entry.before },
            'input.noteCoverUndo',
            { recordHistory: false, renderAfter: true }
        );
    } finally {
        noteCoverHistoryApplying = false;
    }
    showToast('표지 편집을 되돌렸습니다.');
    return true;
}

function redoNoteCoverEdit() {
    const entry = noteCoverRedoStack[noteCoverRedoStack.length - 1];
    if (!entry) {
        showToast('다시 실행할 표지 편집이 없습니다.');
        return false;
    }
    if (getNoteCoverMarkdownSource() !== entry.before) {
        noteCoverUndoStack = [];
        noteCoverRedoStack = [];
        showToast('문서가 다른 곳에서 변경되어 표지 Redo 기록을 초기화했습니다.');
        return false;
    }
    noteCoverRedoStack.pop();
    noteCoverUndoStack.push(entry);
    noteCoverHistoryApplying = true;
    try {
        applyNoteCoverMarkdownUpdate(
            { changed: true, markdown: entry.after },
            'input.noteCoverRedo',
            { recordHistory: false, renderAfter: true }
        );
    } finally {
        noteCoverHistoryApplying = false;
    }
    showToast('표지 편집을 다시 실행했습니다.');
    return true;
}

function applyNoteCoverTextChange(change) {
    if (!change || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.updateTextElementInMarkdown !== 'function') return false;
    const coverIndex = Math.max(0, Number(change.coverIndex) || 0);
    const elementId = String(change.elementId || '');
    if (!elementId) return false;
    return applyNoteCoverMarkdownUpdate(window.NoteCoverRenderer.updateTextElementInMarkdown(
        getNoteCoverMarkdownSource(),
        coverIndex,
        elementId,
        String(change.text == null ? '' : change.text)
    ), 'input.noteCoverText', {
        historyKey: 'text:' + coverIndex + ':' + elementId,
        coalesce: change.phase !== 'commit'
    });
}

function applyNoteCoverGeometryChange(change) {
    if (!change || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.updateElementGeometryInMarkdown !== 'function') return false;
    const coverIndex = Math.max(0, Number(change.coverIndex) || 0);
    const elementId = String(change.elementId || '');
    if (!elementId) return false;
    return applyNoteCoverMarkdownUpdate(window.NoteCoverRenderer.updateElementGeometryInMarkdown(
        getNoteCoverMarkdownSource(),
        coverIndex,
        elementId,
        change.geometry || {}
    ), 'input.noteCoverGeometry', {
        historyKey: 'geometry:' + coverIndex + ':' + elementId
    });
}

function applyNoteCoverTextStyleChange(change) {
    if (!change || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.updateTextElementStyleInMarkdown !== 'function') return false;
    const coverIndex = Math.max(0, Number(change.coverIndex) || 0);
    const elementId = String(change.elementId || '');
    if (!elementId) return false;
    return applyNoteCoverMarkdownUpdate(window.NoteCoverRenderer.updateTextElementStyleInMarkdown(
        getNoteCoverMarkdownSource(),
        coverIndex,
        elementId,
        change.style || {}
    ), 'input.noteCoverStyle', {
        historyKey: 'style:' + coverIndex + ':' + elementId,
        coalesce: true
    });
}

function addNoteCoverTextElement(change) {
    if (!window.NoteCoverRenderer || typeof window.NoteCoverRenderer.addElementInMarkdown !== 'function') return false;
    const coverIndex = Math.max(0, Number(change && change.coverIndex) || 0);
    const updated = window.NoteCoverRenderer.addElementInMarkdown(
        getNoteCoverMarkdownSource(),
        coverIndex,
        {
            type: 'text', text: '새 텍스트', x: 12, y: 12, w: 38, h: 8,
            fontSize: 32, fontFamily: 'Arial', color: '#111111', fontWeight: 400,
            fontStyle: 'normal', textAlign: 'left'
        }
    );
    const applied = applyNoteCoverMarkdownUpdate(updated, 'input.noteCoverAddText', {
        historyKey: 'add-text:' + coverIndex,
        renderAfter: true,
        coverIndex: coverIndex,
        selectElementId: updated.elementId
    });
    if (applied) showToast('표지에 텍스트 상자를 추가했습니다.');
    return applied;
}

function deleteNoteCoverElement(change) {
    if (!change || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.removeElementInMarkdown !== 'function') return false;
    const coverIndex = Math.max(0, Number(change.coverIndex) || 0);
    const elementId = String(change.elementId || '');
    if (!elementId) return false;
    const updated = window.NoteCoverRenderer.removeElementInMarkdown(
        getNoteCoverMarkdownSource(),
        coverIndex,
        elementId
    );
    const applied = applyNoteCoverMarkdownUpdate(updated, 'input.noteCoverDelete', {
        historyKey: 'delete:' + coverIndex + ':' + elementId,
        renderAfter: true,
        coverIndex: coverIndex,
        clearSelection: true
    });
    if (applied) showToast(change.elementType === 'image' ? '표지 이미지를 삭제했습니다.' : '표지 텍스트 상자를 삭제했습니다.');
    return applied;
}

function requestNoteCoverImageRelink(change) {
    if (!change || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.updateImageElementPathInMarkdown !== 'function') return false;
    if (!db || !window.ImageDB || typeof window.ImageDB.saveBlob !== 'function') {
        showToast('이미지 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
        return false;
    }
    const coverIndex = Math.max(0, Number(change.coverIndex) || 0);
    const elementId = String(change.elementId || '');
    if (!elementId) return false;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const cleanup = function () {
        if (settled) return;
        settled = true;
        if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener('change', async function () {
        const file = input.files && input.files[0];
        if (!file) {
            cleanup();
            return;
        }
        try {
            const saved = await window.ImageDB.saveBlob(db, file, {
                name: file.name,
                mime: file.type || 'application/octet-stream'
            });
            const updated = window.NoteCoverRenderer.updateImageElementPathInMarkdown(
                getNoteCoverMarkdownSource(),
                coverIndex,
                elementId,
                saved && saved.url
            );
            if (!applyNoteCoverMarkdownUpdate(updated, 'input.noteCoverImage', {
                historyKey: 'image-path:' + coverIndex + ':' + elementId,
                renderAfter: true,
                coverIndex: coverIndex,
                selectElementId: elementId
            })) {
                throw new Error('표지 이미지 경로를 문서에 저장하지 못했습니다.');
            }
            showToast('표지 이미지를 내부 저장소에 연결했습니다. MDD 내보내기에 포함됩니다.');
        } catch (error) {
            showToast('표지 이미지를 연결하지 못했습니다: ' + (error && error.message ? error.message : error));
        } finally {
            cleanup();
        }
    }, { once: true });
    input.click();
    // 파일 선택 창을 오래 열어 두어도 입력 노드가 먼저 사라지지 않게 충분히 유지한다.
    window.setTimeout(cleanup, 300000);
    return true;
}

function requestNoteCoverImageAdd(change) {
    if (!window.NoteCoverRenderer || typeof window.NoteCoverRenderer.addElementInMarkdown !== 'function') return false;
    if (!db || !window.ImageDB || typeof window.ImageDB.saveBlob !== 'function') {
        showToast('이미지 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
        return false;
    }
    const coverIndex = Math.max(0, Number(change && change.coverIndex) || 0);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif';
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const cleanup = function () {
        if (settled) return;
        settled = true;
        if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.addEventListener('change', async function () {
        const file = input.files && input.files[0];
        if (!file) { cleanup(); return; }
        try {
            const saved = await window.ImageDB.saveBlob(db, file, {
                name: file.name,
                mime: file.type || 'application/octet-stream'
            });
            const updated = window.NoteCoverRenderer.addElementInMarkdown(
                getNoteCoverMarkdownSource(),
                coverIndex,
                {
                    type: 'image', path: saved && saved.url, name: file.name || '새 이미지',
                    x: 16, y: 16, w: 32, h: 24
                }
            );
            if (!applyNoteCoverMarkdownUpdate(updated, 'input.noteCoverAddImage', {
                historyKey: 'add-image:' + coverIndex,
                renderAfter: true,
                coverIndex: coverIndex,
                selectElementId: updated.elementId
            })) {
                throw new Error('새 표지 이미지를 문서에 저장하지 못했습니다.');
            }
            showToast('표지에 이미지를 추가했습니다. 이동·크기 조절이 가능합니다.');
        } catch (error) {
            showToast('표지 이미지를 추가하지 못했습니다: ' + (error && error.message ? error.message : error));
        } finally {
            cleanup();
        }
    }, { once: true });
    input.click();
    window.setTimeout(cleanup, 300000);
    return true;
}

window.applyNoteCoverTextChange = applyNoteCoverTextChange;
window.applyNoteCoverGeometryChange = applyNoteCoverGeometryChange;
window.applyNoteCoverTextStyleChange = applyNoteCoverTextStyleChange;
window.addNoteCoverTextElement = addNoteCoverTextElement;
window.deleteNoteCoverElement = deleteNoteCoverElement;
window.undoNoteCoverEdit = undoNoteCoverEdit;
window.redoNoteCoverEdit = redoNoteCoverEdit;
window.requestNoteCoverImageRelink = requestNoteCoverImageRelink;
window.requestNoteCoverImageAdd = requestNoteCoverImageAdd;

function applyDoiLinkTargets(root) {
    if (!root || !root.querySelectorAll) return;
    const doc = root.ownerDocument || document;
    const baseUrl = (doc && doc.baseURI) || window.location.href;
    root.querySelectorAll('a[href]').forEach(function (link) {
        const href = String(link.getAttribute('href') || '').trim();
        if (!href) return;
        let parsed;
        try {
            parsed = new URL(href, baseUrl);
        } catch (_) {
            return;
        }
        const host = String(parsed.hostname || '').toLowerCase();
        if (host !== 'doi.org' && host !== 'dx.doi.org') return;
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('title', 'DOI를 새 탭에서 열기');
    });
}

window.applyDoiLinkTargets = applyDoiLinkTargets;

function applyInline2RefLinkTargets(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('a[title="mdpro-inline2ref-new-window"]').forEach(function (link) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('title', '참고 링크를 새 탭에서 열기');
    });
}

window.applyInline2RefLinkTargets = applyInline2RefLinkTargets;

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

function getRenderableHtmlDocument(value, fileName) {
    const raw = String(value == null ? '' : value).replace(/^\uFEFF/, '');
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (/^(?:<!doctype\s+html\b|<html\b)/i.test(trimmed)) return trimmed;

    const fenced = trimmed.match(/^```(?:html?)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
    if (fenced && /^(?:<!doctype\s+html\b|<html\b)/i.test(fenced[1].trim())) {
        return fenced[1].trim();
    }

    const name = String(fileName == null
        ? (typeof currentFileName !== 'undefined' ? currentFileName : '')
        : fileName);
    if (/\.html?$/i.test(name.trim())) return trimmed;
    return null;
}

function setHtmlDocumentMode(container, enabled) {
    if (!container || !container.classList) return;
    container.classList.toggle('html-document-preview', !!enabled);
    if (container.id === 'viewer') {
        const viewerContainer = document.getElementById('viewer-container');
        if (viewerContainer) viewerContainer.classList.toggle('html-document-active', !!enabled);
    }
}

function renderHtmlDocumentFrame(container, html, options) {
    if (!container) return null;
    const opts = options || {};
    setHtmlDocumentMode(container, true);
    container.innerHTML = '';
    const doc = container.ownerDocument || document;
    const frame = doc.createElement('iframe');
    frame.className = 'html-document-frame';
    frame.title = String(opts.title || 'HTML preview');
    frame.setAttribute(
        'sandbox',
        'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads'
    );
    frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.style.display = 'block';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.minHeight = '100%';
    frame.style.border = '0';
    frame.style.background = '#fff';
    frame.srcdoc = String(html || '');
    container.appendChild(frame);
    return frame;
}

window.getRenderableHtmlDocument = getRenderableHtmlDocument;
window.renderHtmlDocumentFrame = renderHtmlDocumentFrame;
window.setHtmlDocumentMode = setHtmlDocumentMode;

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
    const snapshot = prepareMarkdownRenderSnapshot(raw);
    const renderRaw = snapshot.renderSource;
    const isCurrentRender = function () {
        return renderToken === mainRenderToken
            && !!viewer
            && isMarkdownRenderSnapshotCurrent(snapshot);
    };
    function runPostRenderHooks() {
        if (!isCurrentRender()) return;
        try { applyMarkdownImageSizeHints(viewer); } catch (e) {}
        try { if (snapshot.features.hasDoiLinks) applyDoiLinkTargets(viewer); } catch (e) {}
        try { applyInline2RefLinkTargets(viewer); } catch (e) {}
        try { if (typeof bindFootnoteLinkNavigation === 'function') bindFootnoteLinkNavigation(); } catch (e) {}
        try {
            if (snapshot.features.hasNoteCover
                && window.NoteCoverRenderer
                && typeof window.NoteCoverRenderer.hydrate === 'function') {
                window.NoteCoverRenderer.hydrate(viewer, {
                    onTextChange: applyNoteCoverTextChange,
                    onGeometryChange: applyNoteCoverGeometryChange,
                    onStyleChange: applyNoteCoverTextStyleChange,
                    onImageRelink: requestNoteCoverImageRelink,
                    onAddText: addNoteCoverTextElement,
                    onAddImage: requestNoteCoverImageAdd,
                    onDelete: deleteNoteCoverElement,
                    onUndo: undoNoteCoverEdit,
                    onRedo: redoNoteCoverEdit
                });
            }
        } catch (e) {}
        refreshLucideIcons(viewer);
        try {
            if (snapshot.features.hasInternalImages) {
                hydrateInternalImagesInElement(viewer, registerViewerInternalObjectUrl);
            }
        } catch (e) {}
        try {
            if (window.ViewModeImageResize
                && typeof window.ViewModeImageResize.hydrate === 'function') {
                window.ViewModeImageResize.hydrate(viewer, {
                    sourceMarkdown: snapshot.sourceRaw,
                    onConfirm: function (nextMarkdown, resizeResult) {
                        updateContent(String(nextMarkdown || ''));
                        if (resizeResult && Number.isFinite(Number(resizeResult.end))) {
                            lastEditCaretPos = Math.max(0, Number(resizeResult.end));
                        }
                        performAutoSave();
                        showToast('이미지 크기를 HTML width/height로 저장했습니다.');
                    }
                });
            }
        } catch (e) {}
        try {
            if (window.ViewModeTableResize
                && typeof window.ViewModeTableResize.hydrate === 'function') {
                window.ViewModeTableResize.hydrate(viewer, {
                    sourceHtml: snapshot.sourceRaw,
                    onConfirm: function (nextHtml, resizeResult) {
                        updateContent(String(nextHtml || ''));
                        if (resizeResult && Number.isFinite(Number(resizeResult.end))) {
                            lastEditCaretPos = Math.max(0, Number(resizeResult.end));
                        }
                        performAutoSave();
                        showToast('표·열·행 크기를 HTML style에 저장했습니다.');
                    }
                });
            }
        } catch (e) {}
        try {
            if (snapshot.features.hasMermaid
                && window.MermaidTRT
                && typeof window.MermaidTRT.renderIn === 'function') {
                window.MermaidTRT.renderIn(viewer).catch(function () {});
            }
        } catch (e) {}
        try { scheduleUpdatePreviewPopupContent(120); } catch (e) {}
        try { scheduleMiniPreviewRender(120); } catch (e) {}
    }
    revokeObjectUrls(viewerInternalImageObjectUrls);

    try {
        const htmlDocument = getRenderableHtmlDocument(renderRaw);
        if (htmlDocument !== null) {
            if (!isCurrentRender()) return;
            renderHtmlDocumentFrame(viewer, htmlDocument, { title: currentFileName || 'HTML preview' });
            runPostRenderHooks();
            return;
        }
        const html = await renderMarkdownSnapshotToHtml(snapshot);
        if (!isCurrentRender()) return;
        setHtmlDocumentMode(viewer, false);
        viewer.innerHTML = String(html || '');
        if (snapshot.features.hasMath
            && typeof MathRender !== 'undefined'
            && MathRender
            && typeof MathRender.typesetElement === 'function') {
            await ensureMdMathEngineLoaded();
            if (!isCurrentRender()) return;
            await MathRender.typesetElement(viewer, {
                silent: true,
                retries: 20,
                delay: 80
            });
        }
        runPostRenderHooks();
    } catch (error) {
        if (!isCurrentRender()) return;
        setHtmlDocumentMode(viewer, false);
        viewer.innerHTML = escapeMarkdownRenderFallback(renderRaw);
        try {
            if (snapshot.features.hasMath
                && typeof MathRender !== 'undefined'
                && MathRender
                && typeof MathRender.typesetElement === 'function') {
                await ensureMdMathEngineLoaded();
                if (!isCurrentRender()) return;
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

function clampViewCopyFabPosition(button, left, top) {
    const width = button.offsetWidth || 42;
    const height = button.offsetHeight || 42;
    const viewportWidth = Math.max(width + VIEW_COPY_FAB_EDGE_GAP * 2, window.innerWidth || document.documentElement.clientWidth || 1280);
    const viewportHeight = Math.max(height + VIEW_COPY_FAB_EDGE_GAP * 2, window.innerHeight || document.documentElement.clientHeight || 720);
    return {
        left: Math.max(VIEW_COPY_FAB_EDGE_GAP, Math.min(viewportWidth - width - VIEW_COPY_FAB_EDGE_GAP, Number(left) || 0)),
        top: Math.max(VIEW_COPY_FAB_EDGE_GAP, Math.min(viewportHeight - height - VIEW_COPY_FAB_EDGE_GAP, Number(top) || 0))
    };
}

function getDefaultViewCopyFabPosition(button) {
    const width = button.offsetWidth || 42;
    const height = button.offsetHeight || 42;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
    const footer = document.getElementById('app-status-footer');
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    const bottomBoundary = footerRect && footerRect.height > 0 ? footerRect.top : viewportHeight;
    return clampViewCopyFabPosition(
        button,
        viewportWidth - width - VIEW_COPY_FAB_EDGE_GAP,
        bottomBoundary - height - VIEW_COPY_FAB_EDGE_GAP
    );
}

function setViewCopyFabPosition(button, position) {
    const safePosition = clampViewCopyFabPosition(button, position.left, position.top);
    button.style.left = Math.round(safePosition.left) + 'px';
    button.style.top = Math.round(safePosition.top) + 'px';
    return safePosition;
}

function getAiJenaDockViewCopyFabPosition(button) {
    if (!(viewCopyFabAiJenaDockWidth > 0)) return null;
    const dockLeft = (window.innerWidth || document.documentElement.clientWidth || 1280) - viewCopyFabAiJenaDockWidth;
    if (dockLeft <= VIEW_COPY_FAB_EDGE_GAP) return null;
    const defaultPosition = getDefaultViewCopyFabPosition(button);
    return clampViewCopyFabPosition(
        button,
        dockLeft - (button.offsetWidth || 42) - VIEW_COPY_FAB_EDGE_GAP,
        defaultPosition.top
    );
}

function syncViewCopyFabAiJenaDockStateFromDom() {
    const panel = document.getElementById('ai-chat-panel');
    const dockSlot = document.getElementById('ai-chat-dock-slot');
    const dockOpen = !!(panel
        && dockSlot
        && panel.classList.contains('open')
        && panel.classList.contains('layout-dock')
        && dockSlot.classList.contains('active'));
    viewCopyFabAiJenaDockWidth = dockOpen ? Math.max(0, dockSlot.getBoundingClientRect().width) : 0;
}

function positionViewCopyFab() {
    const button = document.getElementById('btn-copy-view-rich');
    if (!button) return;
    const aiJenaDockPosition = getAiJenaDockViewCopyFabPosition(button);
    if (aiJenaDockPosition) {
        setViewCopyFabPosition(button, aiJenaDockPosition);
        return;
    }
    let savedPosition = null;
    if (viewCopyFabHasCustomPosition) {
        try {
            const parsed = JSON.parse(localStorage.getItem(VIEW_COPY_FAB_POSITION_KEY) || 'null');
            if (parsed && Number.isFinite(Number(parsed.left)) && Number.isFinite(Number(parsed.top))) {
                savedPosition = { left: Number(parsed.left), top: Number(parsed.top) };
            }
        } catch (_) {}
    }
    setViewCopyFabPosition(button, savedPosition || getDefaultViewCopyFabPosition(button));
}

function initViewCopyFab() {
    const button = document.getElementById('btn-copy-view-rich');
    if (!button || viewCopyFabInitialized) return;
    viewCopyFabInitialized = true;

    try {
        const parsed = JSON.parse(localStorage.getItem(VIEW_COPY_FAB_POSITION_KEY) || 'null');
        viewCopyFabHasCustomPosition = !!(parsed
            && Number.isFinite(Number(parsed.left))
            && Number.isFinite(Number(parsed.top)));
    } catch (_) {
        viewCopyFabHasCustomPosition = false;
    }
    syncViewCopyFabAiJenaDockStateFromDom();
    positionViewCopyFab();

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;
    let suppressClick = false;
    let previousUserSelect = '';

    button.addEventListener('pointerdown', function (event) {
        if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const rect = button.getBoundingClientRect();
        activePointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        dragging = false;
        try { button.setPointerCapture(event.pointerId); } catch (_) {}
    });

    button.addEventListener('pointermove', function (event) {
        if (event.pointerId !== activePointerId) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!dragging && Math.hypot(deltaX, deltaY) < 5) return;
        if (!dragging) {
            dragging = true;
            previousUserSelect = document.body.style.userSelect;
            document.body.style.userSelect = 'none';
            button.classList.add('is-dragging');
            button.setAttribute('aria-grabbed', 'true');
        }
        setViewCopyFabPosition(button, {
            left: startLeft + deltaX,
            top: startTop + deltaY
        });
        event.preventDefault();
    });

    function finishViewCopyFabPointer(event) {
        if (event.pointerId !== activePointerId) return;
        try { button.releasePointerCapture(event.pointerId); } catch (_) {}
        activePointerId = null;
        if (!dragging) return;

        dragging = false;
        suppressClick = true;
        button.classList.remove('is-dragging');
        button.removeAttribute('aria-grabbed');
        document.body.style.userSelect = previousUserSelect;
        const rect = button.getBoundingClientRect();
        const position = setViewCopyFabPosition(button, { left: rect.left, top: rect.top });
        viewCopyFabHasCustomPosition = true;
        try { localStorage.setItem(VIEW_COPY_FAB_POSITION_KEY, JSON.stringify(position)); } catch (_) {}
        window.setTimeout(function () { suppressClick = false; }, 0);
    }

    button.addEventListener('pointerup', finishViewCopyFabPointer);
    button.addEventListener('pointercancel', finishViewCopyFabPointer);
    button.addEventListener('click', function (event) {
        if (suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        copyViewFormattedToClipboard();
    });
    let positionFrame = null;
    const scheduleViewCopyFabPosition = function () {
        if (positionFrame !== null) return;
        positionFrame = requestAnimationFrame(function () {
            positionFrame = null;
            positionViewCopyFab();
        });
    };
    window.addEventListener('resize', function () {
        syncViewCopyFabAiJenaDockStateFromDom();
        scheduleViewCopyFabPosition();
    });
    window.addEventListener('ai-jena-layout-change', function (event) {
        const detail = event && event.detail ? event.detail : {};
        const dockOpen = detail.open === true && detail.enabled === true && detail.layout === 'dock';
        viewCopyFabAiJenaDockWidth = dockOpen ? Math.max(0, Number(detail.dockWidth) || 0) : 0;
        positionViewCopyFab();
        scheduleViewCopyFabPosition();
    });

    const aiJenaPanel = document.getElementById('ai-chat-panel');
    const aiJenaDockSlot = document.getElementById('ai-chat-dock-slot');
    if (typeof MutationObserver === 'function' && (aiJenaPanel || aiJenaDockSlot)) {
        viewCopyFabAiJenaObserver = new MutationObserver(function () {
            syncViewCopyFabAiJenaDockStateFromDom();
            scheduleViewCopyFabPosition();
        });
        if (aiJenaPanel) {
            viewCopyFabAiJenaObserver.observe(aiJenaPanel, {
                attributes: true,
                attributeFilter: ['class', 'aria-hidden']
            });
        }
        if (aiJenaDockSlot) {
            viewCopyFabAiJenaObserver.observe(aiJenaDockSlot, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }
    }
}

function toggleMode(mode) {
    const vc = document.getElementById('viewer-container');
    const ec = document.getElementById('content-viewport');
    const btnView = document.getElementById('btn-view');
    const btnEdit = document.getElementById('btn-edit');
    const editTools = document.getElementById('edit-tools');
    const btnCopyViewRich = document.getElementById('btn-copy-view-rich');
    const scrollJumpRail = document.getElementById('scroll-jump-rail');
    const btnExportGdocs = document.getElementById('btn-export-gdocs');
    const btnDocSync = document.getElementById('btn-docsync');
    const activeClasses = ['bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400'];
    if (!vc || !ec) {
        console.warn('toggleMode: viewer-container or content-viewport not found.', { vc: !!vc, ec: !!ec });
        return;
    }
    document.body.classList.toggle('viewer-view-mode', mode !== 'edit');

    if (mode === 'edit') {
        const viewRatio = getScrollRatio(vc);
        const mappedPos = viewClickMappedCaretPos == null ? getMarkdownPositionFromRatio(viewRatio) : viewClickMappedCaretPos;
        isEditMode = true;
        vc.classList.add('hidden');
        ec.classList.remove('hidden');
        ec.classList.add('viewer-edit-active');
        applyEditToolsVisibilityByMode();
        if (scrollJumpRail) scrollJumpRail.classList.remove('hidden');
        if (btnCopyViewRich) btnCopyViewRich.classList.add('hidden');
        if (btnExportGdocs) btnExportGdocs.classList.add('hidden');
        if (btnDocSync) btnDocSync.classList.add('hidden');
        if (btnEdit) btnEdit.classList.add(...activeClasses);
        if (btnView) btnView.classList.remove(...activeClasses);
        applyEditorLightPreference();
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
        if (scrollJumpRail) scrollJumpRail.classList.remove('hidden');
        if (btnCopyViewRich) {
            btnCopyViewRich.classList.remove('hidden');
            requestAnimationFrame(positionViewCopyFab);
        }
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
    if (window.ViewModeTextInput && typeof window.ViewModeTextInput.updateInteractionState === 'function') {
        requestAnimationFrame(window.ViewModeTextInput.updateInteractionState);
    }
    if (typeof window.refreshEditorFormatGutter === 'function') {
        requestAnimationFrame(window.refreshEditorFormatGutter);
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
let fmaViewerFeatureEnabled = false;

function getSelectedFileExtension(file) {
    const match = String(file && file.name || '').toLowerCase().match(/(\.[^.\\/]+)$/);
    return match ? match[1] : '';
}

function isSelectedImageFile(file, extension) {
    return LOCAL_IMAGE_VIEWER_EXTENSIONS.has(extension || getSelectedFileExtension(file))
        || String(file && file.type || '').toLowerCase().startsWith('image/');
}

function isFmaViewerFeatureEnabled() {
    return fmaViewerFeatureEnabled === true;
}

function openSelectedImageInPreviewPopup(file) {
    if (!file) return false;
    if (typeof ensurePreviewPopupForFile !== 'function'
        || typeof openSelectedFileInPreviewPopup !== 'function') {
        showToast('PV 이미지 미리보기를 불러오지 못했습니다.');
        return false;
    }
    if (!ensurePreviewPopupForFile()) return false;
    return openSelectedFileInPreviewPopup(file);
}

function openSelectedFileInBrowserViewer(file, extension) {
    if (isSelectedImageFile(file, extension)) {
        if (!isFmaViewerFeatureEnabled()) {
            openSelectedImageInPreviewPopup(file);
            return true;
        }
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
    const sourceOptions = arguments.length > 1 && arguments[1] ? arguments[1] : {};
    try {
        await loadOptionalScript('mammoth', function () {
            return !!window.mammoth && typeof window.mammoth.convertToHtml === 'function';
        });
        await loadOptionalScript('docxImport', function () {
            return !!window.DocxImport && typeof window.DocxImport.convert === 'function';
        });
    } catch (_) {
        showToast('DOCX 가져오기 모듈을 불러오지 못했습니다.');
        return false;
    }
    if (!sourceOptions.skipSavePrompt) {
        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('Open canceled.');
            return true;
        }
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
        const result = await window.DocxImport.convert(arrayBuffer, {
            mammoth: window.mammoth,
            mammothOptions: options
        });
        const html = String(result && result.value || '').trim();
        setCurrentDocumentInfo(file.name || 'document.docx', null, {
            source: sourceOptions.source || '',
            localFileHandle: sourceOptions.localFileHandle || null,
            localFolderPath: sourceOptions.localFolderPath || ''
        });
        updateContent(html || '<p></p>');
        markPersistedState();
        const warnings = Array.isArray(result && result.messages) ? result.messages.length : 0;
        const enhancementWarning = String(result && result.enhancementWarning || '');
        showToast(sourceOptions.successMessage || (warnings
            ? 'DOCX를 열었습니다. 변환 경고 ' + warnings + '건이 있습니다.'
            : enhancementWarning
                ? 'DOCX를 열었습니다. ' + enhancementWarning
                : 'DOCX를 표 서식과 함께 문서 내부에서 열었습니다.'));
        return true;
    } catch (error) {
        showToast('DOCX를 열 수 없습니다: ' + (error && error.message ? error.message : error));
        return true;
    }
}

async function openPdfInEditor(file) {
    if (!file) return false;
    try {
        await loadOptionalScript('pdfJs', function () {
            return !!window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function';
        }, { module: true });
        await loadOptionalScript('pdfOpen', function () {
            return !!window.PdfOpen && typeof window.PdfOpen.convert === 'function';
        });
    } catch (_) {
        showToast('PDF 편집 변환 모듈을 불러오지 못했습니다.');
        return false;
    }

    showToast('PDF 텍스트를 편집 문서로 변환하는 중입니다...');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.PdfOpen.convert(arrayBuffer, {
            pdfjsLib: window.pdfjsLib,
            standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', window.location.href).href,
            onProgress: function (page, total) {
                showToast('PDF를 변환하는 중입니다... ' + page + '/' + total);
            }
        });
        if (!result || !String(result.markdown || '').replace(/<!--[\s\S]*?-->/g, '').trim()) {
            showToast('이 PDF에서 편집 가능한 텍스트를 찾지 못했습니다. 스캔 PDF는 OCR 변환이 필요합니다.');
            return true;
        }
        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('Open canceled.');
            return true;
        }
        setCurrentDocumentInfo(file.name || 'document.pdf', null, {
            sizeBytes: file.size || null,
            createdAt: file.lastModified || null,
            dateLabel: file.lastModified ? '수정일' : '생성일'
        });
        updateContent(result.markdown);
        markPersistedState();
        const missing = Array.isArray(result.scannedPages) ? result.scannedPages.length : 0;
        showToast(missing
            ? 'PDF 텍스트를 편집 문서로 열었습니다. 텍스트가 없는 페이지 ' + missing + '쪽은 OCR이 필요합니다.'
            : 'PDF 텍스트를 편집 문서로 열었습니다. 이미지와 복잡한 배치는 원본과 다를 수 있습니다.');
        return true;
    } catch (error) {
        const message = error && error.name === 'PasswordException'
            ? '암호가 설정된 PDF는 현재 열 수 없습니다.'
            : 'PDF를 편집 문서로 변환할 수 없습니다: ' + (error && error.message ? error.message : error);
        showToast(message);
        return true;
    }
}

function handleImageFolderSelect(event) {
    const input = event && event.target ? event.target : null;
    if (!isFmaViewerFeatureEnabled()) {
        showToast("설정에서 '이미지전용 Viewer'를 먼저 활성화하세요.");
        if (input) input.value = '';
        return;
    }
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

function setNewFileMenuVisible(visible) {
    const menu = document.getElementById('new-file-menu');
    const toggle = document.getElementById('new-file-menu-toggle');
    if (!menu || !toggle) return;
    const shouldShow = !!visible && !toggle.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldShow);
    toggle.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
}

function toggleNewFileMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('new-file-menu');
    if (!menu) return;
    setNewFileMenuVisible(menu.classList.contains('hidden'));
}

function createBlankFileFromNewMenu(event) {
    if (event) event.stopPropagation();
    setNewFileMenuVisible(false);
    createNewFile();
}

function openTemplateForNewFile(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('new-file-menu');
    const menuRect = menu && !menu.classList.contains('hidden')
        ? menu.getBoundingClientRect()
        : null;
    setNewFileMenuVisible(false);
    openTemplatePanel(menuRect ? menuRect.bottom + 8 : null);
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
    if (!isFmaViewerFeatureEnabled()) {
        showToast("설정에서 '이미지전용 Viewer'를 먼저 활성화하세요.");
        return;
    }
    const input = document.getElementById('image-folder-input');
    if (input) input.click();
}

function openFmaViewer() {
    if (!isFmaViewerFeatureEnabled()) {
        showToast("설정에서 '이미지전용 Viewer'를 먼저 활성화하세요.");
        return false;
    }
    if (!window.InternalImageApp || typeof window.InternalImageApp.openFrame !== 'function') {
        showToast('내부 FMA Viewer를 불러오지 못했습니다.');
        return false;
    }
    const viewerUrl = new URL('./Apps/fmaviewer/index.html', document.baseURI || window.location.href);
    viewerUrl.searchParams.set('embedded', '1');
    viewerUrl.searchParams.set('v', '20260806-import-choice-2');
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
    const newFileWrap = document.getElementById('new-file-menu-wrap');
    if (newFileWrap && !newFileWrap.contains(event.target)) setNewFileMenuVisible(false);
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        setOpenSourceMenuVisible(false);
        setNewFileMenuVisible(false);
    }
});

async function handleFileSelect(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files ? input.files[0] : null;
    if (file) {
        const extension = getSelectedFileExtension(file);
        const imageFile = isSelectedImageFile(file, extension);
        let nativePath = String(file.path || '').trim();
        if (!nativePath
            && window.web2electron
            && typeof window.web2electron.getPathForFile === 'function') {
            try { nativePath = String(window.web2electron.getPathForFile(file) || '').trim(); } catch (_) {}
        }
        if (imageFile) {
            if (isFmaViewerFeatureEnabled()) {
                openSelectedFileInBrowserViewer(file, extension);
            } else if (!openSelectedImageInPreviewPopup(file)) {
                showToast('이미지를 PV 창에서 열지 못했습니다. 팝업 허용 설정을 확인하세요.');
            }
        } else if (extension === '.pdf') {
            await openPdfInEditor(file);
        } else if (DEDICATED_LOCAL_VIEWER_EXTENSIONS.has(extension)
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

async function openFileFromLocalFolderExplorer(file) {
    if (!file) return false;
    const localFolderPath = arguments.length > 1 ? arguments[1] : '';
    const fileHandle = arguments.length > 2 ? arguments[2] : null;
    const extension = getSelectedFileExtension(file);
    const imageFile = isSelectedImageFile(file, extension);
    let nativePath = String(file.path || '').trim();
    if (!nativePath && window.web2electron && typeof window.web2electron.getPathForFile === 'function') {
        try { nativePath = String(window.web2electron.getPathForFile(file) || '').trim(); } catch (_) {}
    }
    if (imageFile) {
        if (isFmaViewerFeatureEnabled()) openSelectedFileInBrowserViewer(file, extension);
        else if (!openSelectedImageInPreviewPopup(file)) showToast('이미지를 PV 창에서 열지 못했습니다.');
        return true;
    }
    if (extension === '.pdf') return openPdfInEditor(file);
    if (DEDICATED_LOCAL_VIEWER_EXTENSIONS.has(extension)
        && nativePath
        && window.web2electron
        && typeof window.web2electron.openLocalFile === 'function') {
        const result = await window.web2electron.openLocalFile({ filePath: nativePath });
        if (result && result.error) showToast('파일을 열 수 없습니다: ' + result.error);
        return !(result && result.error);
    }
    if (extension === '.docx') {
        return openDocxInEditor(file, {
            source: 'local-folder',
            localFileHandle: fileHandle || null,
            localFolderPath: localFolderPath || file.name || ''
        });
    }
    if (DEDICATED_LOCAL_VIEWER_EXTENSIONS.has(extension)) {
        if (openSelectedFileInBrowserViewer(file, extension)) return true;
        showToast('이 파일 형식은 데스크톱 앱에서 열 수 있습니다: ' + file.name);
        return false;
    }
    await readFile(file, {
        filePath: nativePath || null,
        localFileHandle: fileHandle || null,
        localFolderPath: localFolderPath || file.name || '',
        source: 'local-folder'
    });
    return true;
}

window.openFileFromLocalFolderExplorer = openFileFromLocalFolderExplorer;

async function refreshCurrentLocalFileFromDisk() {
    const localRef = currentLocalFileRef;
    const handle = localRef && localRef.handle;
    if (!localRef || !handle || typeof handle.getFile !== 'function') return false;

    try {
        if (typeof handle.queryPermission === 'function') {
            let permission = await handle.queryPermission({ mode: 'read' });
            if (permission === 'prompt' && typeof handle.requestPermission === 'function') {
                permission = await handle.requestPermission({ mode: 'read' });
            }
            if (permission !== 'granted') {
                showToast('파일을 새로고침하려면 로컬 폴더 읽기 권한이 필요합니다.');
                return false;
            }
        }

        const file = await handle.getFile();
        const successMessage = '파일을 새로고침했습니다: ' + (localRef.path || file.name || currentFileName);
        if (getSelectedFileExtension(file) === '.docx') {
            return openDocxInEditor(file, {
                source: 'local-folder',
                localFileHandle: handle,
                localFolderPath: localRef.path || file.name || '',
                skipSavePrompt: true,
                successMessage: successMessage
            });
        }

        await readFile(file, {
            filePath: String(file.path || '').trim() || null,
            localFileHandle: handle,
            localFolderPath: localRef.path || file.name || '',
            source: 'local-folder',
            skipSavePrompt: true,
            successMessage: successMessage
        });
        return true;
    } catch (error) {
        showToast('파일 새로고침 실패: ' + (error && error.message ? error.message : error));
        return false;
    }
}

window.refreshCurrentLocalFileFromDisk = refreshCurrentLocalFileFromDisk;

function createNewFile() {
    currentMarkdown = "";
    setCurrentDocumentInfo("untitled.md", null, { createdAt: new Date(), dateLabel: '생성일' });
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

function setCurrentDocumentInfo(fileName, filePath = null, metadata) {
    currentFileName = fileName;
    currentFilePath = filePath || null;
    clearCurrentDocumentRef();
    const inputMetadata = metadata || {};
    currentLocalFileRef = inputMetadata.source === 'local-folder'
        ? {
            handle: inputMetadata.localFileHandle || null,
            path: String(inputMetadata.localFolderPath || fileName || ''),
            source: 'local-folder'
        }
        : null;
    currentGithubFileRef = inputMetadata.source === 'github'
        ? {
            path: String(inputMetadata.githubPath || filePath || fileName || ''),
            remotePath: String(inputMetadata.githubRemotePath || ''),
            sha: String(inputMetadata.githubSha || ''),
            folderPath: String(inputMetadata.githubFolderPath || 'root'),
            source: 'github'
        }
        : null;
    currentFileMetadata = {
        createdAt: inputMetadata.createdAt || null,
        dateLabel: String(inputMetadata.dateLabel || '생성일')
    };
    updateCurrentDocumentDisplay();
    if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
        window.GoogleDocs.handleActiveDocumentChanged();
    }
}

function getUtf8ByteLength(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    try { return unescape(encodeURIComponent(text)).length; } catch (_) { return text.length; }
}

function formatDocumentBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}

function formatDocumentDate(value) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

function updateCurrentDocumentMetadataDisplay() {
    const sizeText = formatDocumentBytes(getUtf8ByteLength(currentMarkdown));
    const metadata = currentDocumentRef
        ? { createdAt: currentDocumentRef.createdAt, dateLabel: '생성일' }
        : (currentFileMetadata || {});
    const dateLabel = String(metadata.dateLabel || '생성일');
    const dateText = formatDocumentDate(metadata.createdAt);
    if (fileSizeDisplay) {
        fileSizeDisplay.textContent = sizeText;
        fileSizeDisplay.title = 'UTF-8 기준 문서 용량: ' + sizeText;
    }
    if (fileCreatedDisplay) {
        fileCreatedDisplay.textContent = dateLabel + ' ' + dateText;
        fileCreatedDisplay.title = dateLabel + ': ' + dateText;
    }
    return { sizeText, dateLabel, dateText };
}

function scheduleCurrentDocumentMetadataDisplay() {
    if (currentDocumentMetadataTimer) clearTimeout(currentDocumentMetadataTimer);
    const delay = String(currentMarkdown || '').length >= 180000 ? 420 : 140;
    currentDocumentMetadataTimer = setTimeout(function () {
        currentDocumentMetadataTimer = null;
        updateCurrentDocumentMetadataDisplay();
    }, delay);
}

async function refreshCurrentDocumentVirtualPath() {
    if (!currentDocumentRef || !window.MDPStorage || typeof window.MDPStorage.listFolders !== 'function') return;
    const requestId = ++currentDocumentDisplayRequest;
    const documentId = currentDocumentRef.id;
    const storageMode = currentDocumentRef.storageMode;
    const folderId = currentDocumentRef.folderId || 'root';
    try {
        const folders = await window.MDPStorage.listFolders();
        if (requestId !== currentDocumentDisplayRequest || !currentDocumentRef
            || currentDocumentRef.id !== documentId || currentDocumentRef.storageMode !== storageMode) return;
        const pathBuilder = window.SidebarLeft && typeof window.SidebarLeft.buildFolderPath === 'function'
            ? window.SidebarLeft.buildFolderPath
            : function () { return folderId === 'root' ? ROOT_FOLDER_NAME : folderId; };
        currentDocumentVirtualPath = getStorageModeLabel(storageMode) + ' / ' + pathBuilder(folders, folderId);
        updateCurrentDocumentDisplay({ skipVirtualPathRefresh: true });
    } catch (_) {}
}

function updateCurrentDocumentDisplay(options) {
    const opts = options || {};
    const fileName = currentFileName || 'untitled.md';
    const filePath = currentFilePath ? String(currentFilePath) : String(currentDocumentVirtualPath || '');
    const metadataText = updateCurrentDocumentMetadataDisplay();
    if (fileTitleDisplay && filePathDisplay) {
        fileTitleDisplay.textContent = fileName;
        filePathDisplay.textContent = filePath || '로컬 경로 없음';
        if (filePathSeparator) filePathSeparator.classList.toggle('hidden', !filePath);
        filePathDisplay.classList.toggle('text-slate-400', !filePath);
        filePathDisplay.classList.toggle('dark:text-slate-500', !filePath);
        if (fileNameDisplay) {
            fileNameDisplay.title = [fileName, filePath, metadataText.sizeText, metadataText.dateLabel + ' ' + metadataText.dateText]
                .filter(Boolean).join('\n');
        }
    } else if (fileNameDisplay) {
        fileNameDisplay.textContent = filePath ? fileName + ' | ' + filePath : fileName;
        fileNameDisplay.title = [fileName, filePath, metadataText.sizeText, metadataText.dateLabel + ' ' + metadataText.dateText]
            .filter(Boolean).join('\n');
    }
    if (currentDocumentRef && !currentFilePath && !currentDocumentVirtualPath && !opts.skipVirtualPathRefresh) {
        refreshCurrentDocumentVirtualPath();
    }
}

function getCurrentDbDocumentId() {
    return currentDbDocId ? String(currentDbDocId) : '';
}

async function getCurrentFileGoogleDocId() {
    const docId = getCurrentDbDocumentId();
    if (!docId || !db || (currentDocumentRef && currentDocumentRef.storageMode !== 'indb')) return '';
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
    if (!docId || !db || (currentDocumentRef && currentDocumentRef.storageMode !== 'indb')) return false;
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

function getPdfExportDocumentKey() {
    if (currentDocumentRef && currentDocumentRef.id) {
        return 'document:' + String(currentDocumentRef.storageMode || 'indb') + ':' + String(currentDocumentRef.id);
    }
    if (currentFilePath && String(currentFilePath).trim()) {
        return 'local-file:' + String(currentFilePath).replace(/\\/g, '/').toLowerCase();
    }
    return 'draft:' + getSaveCandidateFileName().toLowerCase();
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

async function resolveDocxExportImage(src) {
    const source = String(src || '').trim();
    if (!source.startsWith('internal://') || !db || !window.ImageDB ||
        typeof window.ImageDB.getImage !== 'function') return null;
    const id = typeof window.ImageDB.parseInternalUrl === 'function'
        ? window.ImageDB.parseInternalUrl(source)
        : decodeURIComponent(source.slice('internal://'.length));
    if (!id) return null;
    const record = await window.ImageDB.getImage(db, id);
    return record && record.blob ? { blob: record.blob } : null;
}

async function createCurrentDocumentDocxBlob() {
    syncCurrentMarkdownFromEditor();
    await loadOptionalScript('docxExport', function () {
        return !!window.DocxExport && typeof window.DocxExport.createBlob === 'function';
    });
    return window.DocxExport.createBlob({
        content: String(currentMarkdown || ''),
        html: getRenderedHtmlForDocxExport(),
        baseUrl: document.baseURI,
        resolveImage: resolveDocxExportImage
    });
}

async function exportCurrentDocumentAsDocx() {
    const blob = await createCurrentDocumentDocxBlob();
    downloadBlobFile(blob, getDocxSaveFileName());
    return true;
}

function showExportTypeDialogFallback() {
    return new Promise(function (resolve) {
        const choices = [
            { key: 'md', label: 'MD file', background: '#be185d', border: '#ec4899', hover: '#db2777', focus: 'rgba(236,72,153,.38)' },
            { key: 'docx', label: 'MS Word (.docx)', background: '#1d4ed8', border: '#3b82f6', hover: '#2563eb', focus: 'rgba(59,130,246,.38)' },
            { key: 'mdd', label: 'MDD file (bundle)', background: '#6d28d9', border: '#8b5cf6', hover: '#7c3aed', focus: 'rgba(139,92,246,.38)' },
            { key: 'zip', label: 'ZIP file', background: '#b45309', border: '#f59e0b', hover: '#d97706', focus: 'rgba(245,158,11,.38)' },
            { key: 'html', label: 'HTML file', background: '#0f766e', border: '#14b8a6', hover: '#0d9488', focus: 'rgba(20,184,166,.38)' },
            { key: 'pdf', label: 'PDF file', background: '#a16207', border: '#eab308', hover: '#ca8a04', focus: 'rgba(234,179,8,.42)' }
        ];
        try {
            if (typeof isGithubExportEnabled === 'function' && isGithubExportEnabled()) {
                choices.push({ key: 'github', label: 'GitHub (push)', background: '#15803d', border: '#22c55e', hover: '#16a34a', focus: 'rgba(34,197,94,.38)' });
            }
        } catch (_) {}
        choices.push({ key: 'cancel', label: 'Cancel', background: '#b91c1c', border: '#ef4444', hover: '#dc2626', focus: 'rgba(239,68,68,.38)' });

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;';

        const card = document.createElement('div');
        card.style.cssText = 'width:min(560px,96vw);background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.35);padding:16px;';

        const title = document.createElement('h3');
        title.textContent = 'Export Format';
        title.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:700;';
        card.appendChild(title);

        const desc = document.createElement('p');
        desc.textContent = 'MD: text only / DOCX: Microsoft Word / MDD: document + images / ZIP: markdown + images folder / HTML: single HTML document / PDF: editable A4 PDF';
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
            btn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid ' + choice.border + ';background:' + choice.background + ';color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:background-color .15s ease,transform .15s ease,box-shadow .15s ease;';
            btn.addEventListener('mouseenter', function () {
                btn.style.backgroundColor = choice.hover;
                btn.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', function () {
                btn.style.backgroundColor = choice.background;
                btn.style.transform = '';
            });
            btn.addEventListener('focus', function () {
                btn.style.outline = 'none';
                btn.style.boxShadow = '0 0 0 3px ' + choice.focus;
            });
            btn.addEventListener('blur', function () { btn.style.boxShadow = ''; });
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

function openPdfMergeWindow() {
    const mergeUrl = new URL('./js/export/pdf-merge-window.html', window.location.href);
    mergeUrl.searchParams.set('v', '20260815-pdfm-project-15-' + Date.now());
    const features = 'popup=yes,width=1380,height=900,left=80,top=50,resizable=yes,scrollbars=yes';
    const mergeWindow = window.open(mergeUrl.href, 'mdproviewer_pdf_merge', features);
    if (!mergeWindow) {
        showToast('PDF 병합 창을 열지 못했습니다. 팝업 허용 설정을 확인하세요.');
        return false;
    }
    try { mergeWindow.focus(); } catch (_) {}
    return true;
}

async function exportCurrentDocumentByChoice(requestedChoice) {
    const allowedChoices = new Set(['md', 'docx', 'mdd', 'zip', 'html', 'pdf', 'github', 'cancel']);
    const normalizedChoice = typeof requestedChoice === 'string' ? requestedChoice.trim() : '';
    const choice = allowedChoices.has(normalizedChoice) ? normalizedChoice : await chooseExportType();
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
        syncCurrentMarkdownFromEditor();
        await loadOptionalScript('htmlExport', function () {
            return !!window.HtmlExport && typeof window.HtmlExport.exportToHTML === 'function';
        });
        const result = await window.HtmlExport.exportToHTML({
            content: String(currentMarkdown || ''),
            fileName: getSaveCandidateFileName(),
            renderedElement: viewer,
            baseUrl: document.baseURI,
            resolveImage: resolveDocxExportImage
        });
        if (!result) return false;
        const externalCount = Number(result.externalImageCount || 0);
        showToast(externalCount > 0
            ? `HTML exported. ${externalCount} image(s) remain as external links.`
            : 'HTML exported as a self-contained file.');
        markPersistedState();
        return true;
    }
    if (choice === 'pdf') {
        syncCurrentMarkdownFromEditor();
        await loadOptionalScript('htmlExport', function () {
            return !!window.HtmlExport && typeof window.HtmlExport.buildExportHtml === 'function';
        });
        await loadOptionalScript('pdfExport', function () {
            return !!window.PdfExport && typeof window.PdfExport.openPreview === 'function';
        });
        await Promise.all([
            loadOptionalScript('html2canvas', function () {
                return typeof window.html2canvas === 'function';
            }),
            loadOptionalScript('jsPdf', function () {
                return !!window.jspdf && typeof window.jspdf.jsPDF === 'function';
            })
        ]);
        await renderMarkdown({ force: true });
        const htmlResult = await window.HtmlExport.buildExportHtml({
            content: String(currentMarkdown || ''),
            fileName: getSaveCandidateFileName(),
            renderedElement: viewer,
            baseUrl: document.baseURI,
            resolveImage: resolveDocxExportImage
        });
        return await window.PdfExport.openPreview({
            html: htmlResult.html,
            fileName: getSaveCandidateFileName(),
            documentKey: getPdfExportDocumentKey(),
            showMergeButton: getPdfMergeVisibleFromSettings(await getAiSettings()),
            onOpenMerge: openPdfMergeWindow
        });
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
            showToast('HTML loaded in rendered preview mode.');
        }
        setCurrentDocumentInfo(file.name, opts.filePath || file.path || null, {
            createdAt: file.lastModified || null,
            dateLabel: file.lastModified ? '수정일' : '생성일',
            source: opts.source || '',
            localFileHandle: opts.localFileHandle || null,
            localFolderPath: opts.localFolderPath || ''
        });
        updateContent(parsed && typeof parsed.text === 'string' ? parsed.text : raw);
        markPersistedState();
        showToast(opts.successMessage || "File loaded successfully.");
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
    a.download = getFileDownloadPrefixFromLocal() + '_backup_' + new Date().toISOString().slice(0, 10) + '.zip';
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
    a.download = getFileDownloadPrefixFromLocal() + '_backup_' + new Date().toISOString().slice(0, 10) + '.mpv';
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

function closeSaveDropdown() {
    const menu = document.getElementById('save-dropdown-menu');
    const toggle = document.getElementById('save-dropdown-toggle');
    if (menu) menu.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function bindSaveDropdownDismiss() {
    const wrap = document.getElementById('save-dropdown-wrap');
    if (!wrap || wrap.__saveDropdownBound) return;
    wrap.__saveDropdownBound = true;
    document.addEventListener('click', function (event) {
        if (!wrap.contains(event.target)) closeSaveDropdown();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeSaveDropdown();
    });
}

function toggleSaveDropdown(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    const menu = document.getElementById('save-dropdown-menu');
    const toggle = document.getElementById('save-dropdown-toggle');
    if (!menu || !toggle) return false;
    bindSaveDropdownDismiss();
    const shouldOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldOpen);
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    return shouldOpen;
}

async function saveCurrentDocumentAsNewFile() {
    closeSaveDropdown();
    try {
        await ensureDatabaseStorageMode('indb');
        return openDatabaseSaveModal('indb', { saveAs: true });
    } catch (error) {
        showToast('inDB Save As failed: ' + (error && error.message ? error.message : error));
        return false;
    }
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
        const raw = prepareMarkdownRenderSnapshot(currentMarkdown).renderSource;
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
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.registerInternalObjectUrl === 'function') {
        window.TidyImageRecovery.registerInternalObjectUrl(url, viewerInternalImageObjectUrls);
        return;
    }
    if (!url) return;
    viewerInternalImageObjectUrls.push(url);
}

async function saveCurrentLocalFile() {
    const localRef = currentLocalFileRef;
    const handle = localRef && localRef.handle;
    if (!localRef) return false;
    if (!handle || typeof handle.createWritable !== 'function') {
        showToast('이 브라우저에서는 선택한 로컬 폴더를 읽기만 할 수 있습니다. Chrome 또는 Edge에서 폴더를 다시 선택해 주세요.');
        return false;
    }

    try {
        if (typeof handle.queryPermission === 'function') {
            let permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'prompt' && typeof handle.requestPermission === 'function') {
                permission = await handle.requestPermission({ mode: 'readwrite' });
            }
            if (permission !== 'granted') {
                showToast('원본 로컬 파일에 저장하려면 폴더 쓰기 권한이 필요합니다.');
                return false;
            }
        }

        syncCurrentMarkdownFromEditor();
        const localFileName = String((handle && handle.name) || currentFileName || localRef.path || '').toLowerCase();
        const writeContent = localFileName.endsWith('.docx')
            ? await createCurrentDocumentDocxBlob()
            : String(currentMarkdown == null ? '' : currentMarkdown);
        const writable = await handle.createWritable();
        try {
            await writable.write(writeContent);
            await writable.close();
        } catch (writeError) {
            if (typeof writable.abort === 'function') {
                try { await writable.abort(); } catch (_) {}
            }
            throw writeError;
        }

        try {
            const savedFile = await handle.getFile();
            currentFileMetadata = {
                createdAt: savedFile.lastModified || new Date(),
                dateLabel: '수정일'
            };
            updateCurrentDocumentDisplay();
        } catch (_) {}
        markPersistedState();
        showToast('Local 원본 파일에 저장했습니다: ' + (localRef.path || currentFileName));
        return true;
    } catch (error) {
        showToast('Local 원본 파일 저장 실패: ' + (error && error.message ? error.message : error));
        return false;
    }
}

function registerPreviewInternalObjectUrl(url) {
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.registerInternalObjectUrl === 'function') {
        window.TidyImageRecovery.registerInternalObjectUrl(url, previewInternalImageObjectUrls);
        return;
    }
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
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.resolveInternalMarkdownImagesForViewer === 'function') {
        const resolved = await window.TidyImageRecovery.resolveInternalMarkdownImagesForViewer(source, {
            db: db,
            imageDb: window.ImageDB,
            onObjectUrl: registerViewerInternalObjectUrl
        });
        return resolved && typeof resolved.markdown === 'string' ? resolved.markdown : source;
    }
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
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.resolveInternalMarkdownImagesForPreview === 'function') {
        const resolved = await window.TidyImageRecovery.resolveInternalMarkdownImagesForPreview(source, {
            db: db,
            imageDb: window.ImageDB,
            onObjectUrl: registerPreviewInternalObjectUrl
        });
        return resolved && typeof resolved.markdown === 'string' ? resolved.markdown : source;
    }
    try {
        const resolved = await window.ImageDB.resolveInternalUrlsInMarkdown(db, source, registerPreviewInternalObjectUrl);
        return resolved && typeof resolved.markdown === 'string' ? resolved.markdown : source;
    } catch (e) {
        return source;
    }
}

async function hydrateInternalImagesInElement(rootEl, collector) {
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.hydrateInternalImagesInElement === 'function') {
        return window.TidyImageRecovery.hydrateInternalImagesInElement(rootEl, {
            db: db,
            imageDb: window.ImageDB,
            cache: internalImageObjectUrlCache,
            collector: collector
        });
    }
    if (!rootEl || !db || !window.ImageDB || typeof window.ImageDB.getImage !== 'function') return;
    const nodes = rootEl.querySelectorAll('img[src^="internal://"]');
    for (let i = 0; i < nodes.length; i++) {
        const img = nodes[i];
        const src = String(img.getAttribute('src') || '');
        const id = window.ImageDB.parseInternalUrl ? window.ImageDB.parseInternalUrl(src) : src.replace(/^internal:\/\//, '');
        if (!id) continue;
        try {
            let cached = internalImageObjectUrlCache.get(id);
            if (!cached) {
                const rec = await window.ImageDB.getImage(db, id);
                if (!rec || !rec.blob) continue;
                cached = {
                    url: URL.createObjectURL(rec.blob),
                    size: Number(rec.blob.size || 0),
                    type: String(rec.blob.type || rec.mime || '')
                };
                internalImageObjectUrlCache.set(id, cached);
                if (typeof collector === 'function') collector(cached);
            }
            const objectUrl = cached.url;
            img.src = objectUrl;
            img.setAttribute('data-internal-id', id);
        } catch (e) {}
    }
}

function clearInternalImageObjectUrlCache(id) {
    if (typeof window.TidyImageRecovery === 'object' && typeof window.TidyImageRecovery.clearInternalImageObjectUrlCache === 'function') {
        window.TidyImageRecovery.clearInternalImageObjectUrlCache(internalImageObjectUrlCache, id);
        return;
    }
    if (id != null) {
        const key = String(id);
        const cached = internalImageObjectUrlCache.get(key);
        if (cached && cached.url) {
            try { URL.revokeObjectURL(cached.url); } catch (_) {}
        }
        internalImageObjectUrlCache.delete(key);
        return;
    }
    internalImageObjectUrlCache.forEach(function (cached) {
        if (!cached || !cached.url) return;
        try { URL.revokeObjectURL(cached.url); } catch (_) {}
    });
    internalImageObjectUrlCache.clear();
}

window.clearInternalImageObjectUrlCache = clearInternalImageObjectUrlCache;
window.addEventListener('beforeunload', function () {
    clearInternalImageObjectUrlCache();
}, { once: true });

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
    requestAnimationFrame(syncEditorShiftFloatPosition);
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
    refreshLucideIcons(collapseIcon && collapseIcon.parentElement ? collapseIcon.parentElement : sidebar);
    renderDBList();
    if (activeSidebarTab === 'toc') renderTOC();
    requestAnimationFrame(syncEditorShiftFloatPosition);
}

// --- TOC & Sidebar Tabs ---
let activeSidebarTab = 'files';
let lastRenderedTocItems = [];

function switchSidebarTab(tab) {
    if (window.SidebarLeft && typeof window.SidebarLeft.switchSidebarTab === 'function') {
        activeSidebarTab = window.SidebarLeft.switchSidebarTab(tab, { renderDBList, renderTOC });
        if (typeof updateStorageSourceTabsUI === 'function') updateStorageSourceTabsUI();
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
            getMarkdown: function () { return prepareMarkdownRenderSnapshot(currentMarkdown).renderSource; },
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
                const now = new Date();
                store.add({ id: 'root', name: ROOT_FOLDER_NAME, parentId: null, createdAt: now, updatedAt: now });
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

function createNewFolder(parentFolderId, parentFolderName) {
    const targetParentId = String(parentFolderId || 'root').trim() || 'root';
    const targetParentName = String(parentFolderName || ROOT_FOLDER_NAME).trim() || ROOT_FOLDER_NAME;
    const modal = document.getElementById('save-modal');
    document.querySelector('#save-modal h3').textContent = targetParentId === 'root' ? '폴더 생성' : '하위 폴더 생성';
    document.querySelector('#save-modal label').textContent = targetParentName + ' 아래에 만들 폴더 이름';
    const input = document.getElementById('save-title-input');
    input.value = '';

    currentActionCallback = async (name) => {
        const normalizedName = String(name || '').trim();
        if (!normalizedName || !window.MDPStorage) return;
        try {
            const folders = await window.MDPStorage.listFolders();
            const folderRows = Array.isArray(folders) ? folders : [];
            if (!folderRows.some(function (folder) { return String(folder && folder.id || '') === targetParentId; })) {
                throw new Error('상위 폴더를 찾을 수 없습니다.');
            }
            const duplicate = folderRows.some(function (folder) {
                return String(folder && folder.parentId || 'root') === targetParentId
                    && String(folder && folder.name || '').trim().toLowerCase() === normalizedName.toLowerCase();
            });
            if (duplicate) throw new Error('같은 위치에 같은 이름의 폴더가 있습니다.');
            const now = new Date();
            await window.MDPStorage.createFolder({
                id: 'folder_' + Date.now(),
                name: normalizedName,
                parentId: targetParentId,
                createdAt: now,
                updatedAt: now
            });
            await renderDBList();
            showToast(targetParentName + ' 아래에 폴더를 만들었습니다: ' + normalizedName);
        } catch (error) {
            showToast('폴더 생성 실패: ' + (error && error.message ? error.message : error));
        }
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

async function createDocumentInFolder(folderId) {
    const targetFolderId = String(folderId || 'root').trim() || 'root';
    if (!window.MDPStorage || currentStorageSourceTab === 'github' || currentStorageSourceTab === 'local') return false;

    const canProceed = await confirmSaveBeforeOpeningAnotherFile();
    if (!canProceed) {
        showToast('Document creation canceled.');
        return false;
    }

    let folderName = ROOT_FOLDER_NAME;
    try {
        const folders = await window.MDPStorage.listFolders();
        const targetFolder = (Array.isArray(folders) ? folders : []).find(function (folder) {
            return String(folder && folder.id || '') === targetFolderId;
        });
        if (!targetFolder) {
            showToast('Folder not found.');
            return false;
        }
        folderName = String(targetFolder.name || ROOT_FOLDER_NAME);
    } catch (error) {
        showToast('Folder list failed: ' + (error && error.message ? error.message : error));
        return false;
    }

    const modal = document.getElementById('save-modal');
    const titleElement = document.querySelector('#save-modal h3');
    const labelElement = document.querySelector('#save-modal label');
    const input = document.getElementById('save-title-input');
    if (!modal || !input) return false;

    const storageMode = getActiveStorageMode();
    const storageLabel = getStorageModeLabel(storageMode);
    if (titleElement) titleElement.textContent = storageLabel + ' 문서 생성';
    if (labelElement) labelElement.textContent = folderName + ' 폴더에 만들 문서 이름';
    input.value = 'Untitled';

    currentActionCallback = async function (title) {
        const requestedTitle = String(title || '').trim().replace(/\.md$/i, '');
        if (!requestedTitle) {
            showToast('문서 이름을 입력하세요.');
            return;
        }

        try {
            const documents = await window.MDPStorage.listDocuments({ limit: 500 });
            const folderDocuments = (Array.isArray(documents) ? documents : []).filter(function (doc) {
                return String(doc && doc.folderId || 'root') === targetFolderId;
            });
            const resolvedTitle = getNextIndexedDbTitle(requestedTitle, folderDocuments);
            const savedDoc = await window.MDPStorage.createDocument({
                id: 'doc_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
                title: resolvedTitle,
                content: '',
                folderId: targetFolderId,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            setCurrentDocumentRef(savedDoc, storageMode);
            if (storageMode === 'sqlite' && savedDoc && savedDoc.id) {
                await window.MDPStorage.confirmDocumentSaved(savedDoc.id);
                await window.MDPStorage.deleteRecoveryDraft('unsaved_current');
            }
            currentFileName = resolvedTitle + '.md';
            currentFilePath = null;
            updateCurrentDocumentDisplay();
            updateContent('');
            markPersistedState();
            await revealSavedInDbDocument(savedDoc);
            if (editorTextarea) editorTextarea.focus();
            showToast(storageLabel + ' 문서를 만들었습니다: ' + folderName + '/' + resolvedTitle);
        } catch (error) {
            showToast(storageLabel + ' document creation failed: ' + (error && error.message ? error.message : error));
        }
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
    input.select();
    return true;
}

async function deleteFolderFromDB(folderId) {
    const id = String(folderId || '').trim();
    if (!id) return;
    if (id === 'root') {
        showToast('ROOT folder cannot be deleted.');
        return;
    }
    if (!window.MDPStorage) return;

    let docsInFolder = [];
    let childFolders = [];
    let folderRecord = null;
    try {
        const results = await Promise.all([
            window.MDPStorage.listDocuments({ limit: 500 }),
            window.MDPStorage.listFolders()
        ]);
        const allDocuments = Array.isArray(results[0]) ? results[0] : [];
        const allFolders = Array.isArray(results[1]) ? results[1] : [];
        docsInFolder = allDocuments.filter(function (d) { return String(d.folderId || '') === id; });
        folderRecord = allFolders.find(function (folder) { return String(folder && folder.id || '') === id; }) || null;
        childFolders = allFolders.filter(function (folder) { return String(folder && folder.parentId || 'root') === id; });
    } catch (error) {
        showToast('Read folder failed: ' + (error && error.message ? error.message : error));
        return;
    }

    const count = docsInFolder.length;
    const childCount = childFolders.length;
    const ok = window.confirm(
        '이 폴더를 삭제할까요?\n'
        + (count ? count + '개 문서는 ROOT로 이동합니다.\n' : '')
        + (childCount ? childCount + '개 하위 폴더는 한 단계 위로 이동합니다.' : '')
        + (!count && !childCount ? '빈 폴더입니다.' : '')
    );
    if (!ok) return;

    try {
        if (getActiveStorageMode() === 'sqlite') {
            await window.MDPStorage.deleteFolder(id);
        } else {
            for (let i = 0; i < docsInFolder.length; i++) {
                const doc = { ...(docsInFolder[i] || {}), folderId: 'root' };
                await window.MDPStorage.updateDocument(doc.id, doc);
            }
            const nextParentId = String(folderRecord && folderRecord.parentId || 'root');
            for (let i = 0; i < childFolders.length; i++) {
                const child = { ...(childFolders[i] || {}), parentId: nextParentId, updatedAt: new Date() };
                await window.MDPStorage.updateFolder(child.id, child);
            }
            await window.MDPStorage.deleteFolder(id);
        }
    } catch (error) {
        showToast('Delete folder failed: ' + (error && error.message ? error.message : error));
        return;
    }

    if (folderCollapseState && Object.prototype.hasOwnProperty.call(folderCollapseState, id)) {
        delete folderCollapseState[id];
        saveFolderCollapseState();
    }
    if (getActiveStorageMode() === 'indb') await ensureRootFolder();
    if (currentDocumentRef && currentDocumentRef.storageMode === getActiveStorageMode()
        && currentDocumentRef.folderId === id) {
        currentDocumentRef.folderId = 'root';
        currentDocumentVirtualPath = '';
        updateCurrentDocumentDisplay();
    }
    await renderDBList();
    showToast('폴더를 삭제했습니다.');
}

async function renameStoredDocument(documentId, requestedTitle) {
    const id = String(documentId || '').trim();
    const nextTitle = String(requestedTitle || '').trim().replace(/\.md$/i, '');
    if (!id || !nextTitle || !window.MDPStorage) throw new Error('올바른 문서명을 입력하세요.');
    const storageMode = getActiveStorageMode();
    const current = await window.MDPStorage.getDocument(id);
    if (!current) throw new Error('문서를 찾을 수 없습니다.');
    const documents = await window.MDPStorage.listDocuments({ limit: 500 });
    const duplicate = (Array.isArray(documents) ? documents : []).some(function (doc) {
        return String(doc && doc.id || '') !== id
            && String(doc && doc.folderId || 'root') === String(current.folderId || 'root')
            && String(doc && doc.title || '').trim().toLowerCase() === nextTitle.toLowerCase();
    });
    if (duplicate) throw new Error('같은 폴더에 같은 문서명이 있습니다.');

    const updatePayload = { ...current, title: nextTitle, updatedAt: new Date() };
    if (storageMode === 'sqlite') updatePayload.expectedVersion = current.version;
    const updated = await window.MDPStorage.updateDocument(id, updatePayload);
    const savedRecord = updated || updatePayload;
    if (currentDocumentRef && currentDocumentRef.id === id && currentDocumentRef.storageMode === storageMode) {
        setCurrentDocumentRef(savedRecord, storageMode);
        currentFileName = nextTitle + '.md';
        updateCurrentDocumentDisplay();
    }
    await renderDBList();
    showToast('문서명을 변경했습니다: ' + nextTitle);
    return savedRecord;
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


async function renderLocalStorageList(listEl, searchTerm, githubReady) {
    if (!window.MDPStorage || typeof window.MDPStorage.listDocuments !== 'function') {
        throw new Error('Storage service is not ready.');
    }
    const storageMode = getActiveStorageMode();
    const useSqliteSearch = storageMode === 'sqlite'
        && !!searchTerm
        && typeof window.MDPStorage.searchDocuments === 'function';
    const documentRequest = useSqliteSearch
        ? window.MDPStorage.searchDocuments(searchTerm, { types: 'document', limit: 200 })
        : window.MDPStorage.listDocuments({ query: searchTerm, limit: 500 });
    const results = await Promise.all([
        window.MDPStorage.listFolders(),
        documentRequest
    ]);
    if (window.SidebarLeft && typeof window.SidebarLeft.renderStorageList === 'function') {
        return window.SidebarLeft.renderStorageList({
            listEl,
            db,
            folders: results[0],
            documents: results[1],
            storageMode,
            searchTerm,
            documentsAlreadyFiltered: useSqliteSearch,
            githubReady,
            rootFolderName: ROOT_FOLDER_NAME,
            isSidebarCollapsed,
            isFolderCollapsed,
            toggleFolderCollapse,
            createDocument: createDocumentInFolder,
            createFolder: createNewFolder,
            deleteFolder: deleteFolderFromDB,
            renameDocument: renameStoredDocument
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

    if (currentStorageSourceTab === 'local') {
        try {
            if (!window.LocalFolderExplorer || typeof window.LocalFolderExplorer.render !== 'function') {
                throw new Error('로컬 폴더 탐색기를 불러오지 못했습니다.');
            }
            await window.LocalFolderExplorer.render(nextList, searchTerm);
        } catch (error) {
            const message = error && error.message ? error.message : '로컬 폴더를 읽을 수 없습니다.';
            nextList.innerHTML = '<div class="p-4 text-xs text-red-500 dark:text-red-400">' + escapeHtmlText(message) + '</div>';
        }
    } else {
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        const githubReady = !!(cfg.enabled && cfg.token);
        if (currentStorageSourceTab === 'github' && githubReady) {
            await renderGithubCachedList(nextList, searchTerm);
        } else {
            try {
                await renderLocalStorageList(nextList, searchTerm, githubReady);
            } catch (error) {
                const message = error && error.message ? error.message : '저장소 목록을 읽을 수 없습니다.';
                nextList.innerHTML = '<div class="p-4 text-xs text-red-500 dark:text-red-400">' + escapeHtmlText(message) + '</div>';
            }
        }
    }
    if (generation !== renderDBListGeneration) return;
    listEl.replaceChildren(...Array.from(nextList.childNodes));
    refreshLucideIcons(listEl);
}

function scheduleStorageSearch() {
    if (storageSearchDebounceTimer) clearTimeout(storageSearchDebounceTimer);
    storageSearchDebounceTimer = setTimeout(function () {
        storageSearchDebounceTimer = null;
        renderDBList();
    }, 250);
}

async function revealSavedInDbDocument(doc) {
    const savedDoc = doc || {};
    const folderId = String(savedDoc.folderId || 'root');
    const storageMode = getActiveStorageMode();
    currentStorageSourceTab = storageMode;
    setStorageSourceTabToLocal(storageMode);
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
    const savedItem = Array.from(document.querySelectorAll('[data-storage-doc-id]')).find(function (item) {
        return String(item.dataset.storageDocId || '') === String(savedDoc.id || '');
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
    let doc = null;
    try {
        doc = await window.MDPStorage.getDocument(id);
    } catch (error) {
        showToast('Open failed: ' + (error && error.message ? error.message : error));
        return;
    }
    if (doc) {
        const storageMode = getActiveStorageMode();
        setCurrentDocumentRef(doc, storageMode);
        if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
            window.GoogleDocs.handleActiveDocumentChanged();
        }
        currentFileName = doc.title + ".md";
        currentFilePath = null;
        updateCurrentDocumentDisplay();
        updateContent(doc.content);
        markPersistedState();
        await offerRecoveryForDocument(doc);
        showToast('Loaded from ' + getStorageModeLabel(storageMode) + '.');
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

async function confirmDeleteModal() {
    if (!deleteTargetId) return;
    const targetId = String(deleteTargetId);
    try {
        const documentRecord = await window.MDPStorage.getDocument(targetId);
        const expectedVersion = documentRecord && documentRecord.version;
        await window.MDPStorage.deleteDocument(targetId, expectedVersion);
        if (currentDocumentRef && currentDocumentRef.id === targetId
            && currentDocumentRef.storageMode === getActiveStorageMode()) {
            clearCurrentDocumentRef();
            updateCurrentDocumentDisplay();
        }
        showToast("Deleted.");
        await renderDBList();
        closeDeleteModal();
    } catch (error) {
        showToast('Delete failed: ' + (error && error.message ? error.message : error));
    }
}

// --- Move Folder Logic ---
async function openMoveModal(docId) {
    movingDocId = docId;
    let folders = [];
    try {
        folders = await window.MDPStorage.listFolders();
    } catch (error) {
        showToast('Folder list failed: ' + (error && error.message ? error.message : error));
        return;
    }

    const list = document.getElementById('folder-choice-list');
    list.innerHTML = "";
    const pathBuilder = window.SidebarLeft && typeof window.SidebarLeft.buildFolderPath === 'function'
        ? window.SidebarLeft.buildFolderPath
        : function (_folders, folderId) { return folderId === 'root' ? ROOT_FOLDER_NAME : folderId; };
    folders.slice().sort(function (a, b) {
        return pathBuilder(folders, a.id).localeCompare(pathBuilder(folders, b.id), 'ko');
    }).forEach(f => {
        const folderPath = pathBuilder(folders, f.id);
        const btn = document.createElement('button');
        btn.className = "w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-md transition-colors flex items-center gap-2";
        btn.innerHTML = '<i data-lucide="folder" class="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0"></i><span class="truncate"></span>';
        btn.querySelector('span').textContent = folderPath;
        btn.title = folderPath;
        btn.onclick = () => moveDocToFolder(docId, f.id);
        list.appendChild(btn);
    });

    document.getElementById('move-modal').classList.remove('hidden');
    document.getElementById('move-modal').classList.add('flex');
    refreshLucideIcons(list);
}

function closeMoveModal() {
    document.getElementById('move-modal').classList.add('hidden');
    document.getElementById('move-modal').classList.remove('flex');
    movingDocId = null;
}

async function moveDocToFolder(docId, folderId) {
    try {
        const doc = await window.MDPStorage.getDocument(docId);
        if (!doc) throw new Error('Document not found.');
        const updatePayload = {
            ...doc,
            folderId: folderId
        };
        if (getActiveStorageMode() === 'sqlite') updatePayload.expectedVersion = doc.version;
        const updated = await window.MDPStorage.updateDocument(docId, updatePayload);
        if (currentDocumentRef && currentDocumentRef.id === String(docId)
            && currentDocumentRef.storageMode === getActiveStorageMode()) {
            setCurrentDocumentRef(updated || doc, getActiveStorageMode());
            currentDocumentVirtualPath = '';
            updateCurrentDocumentDisplay();
        }
        showToast("Moved document to selected folder.");
        closeMoveModal();
        await renderDBList();
    } catch (error) {
        showToast('Move failed: ' + (error && error.message ? error.message : error));
    }
}

function getEditorInputDebounceMs() {
    const len = String(currentMarkdown || '').length;
    if (len >= 300000) return 520;
    if (len >= 180000) return 380;
    if (len >= 90000) return 260;
    return 120;
}

function schedulePerformAutoSave(delayMs) {
    const revision = syncRenderSourceRevision(currentMarkdown);
    if (!renderCoordinator) {
        setTimeout(performAutoSave, Math.max(40, Number(delayMs) || 0));
        return;
    }
    renderCoordinator.schedule('autosave', performAutoSave, {
        delayMs: Math.max(40, Number(delayMs) || 0),
        revision: revision,
        isCurrent: function (candidate) { return candidate === renderSourceRevision; },
        idle: true,
        idleTimeoutMs: 1200
    });
}

function scheduleRenderTOC(delayMs) {
    if (activeSidebarTab !== 'toc') return;
    const revision = syncRenderSourceRevision(currentMarkdown);
    if (!renderCoordinator) {
        setTimeout(function () { if (activeSidebarTab === 'toc') renderTOC(); }, Math.max(60, Number(delayMs) || 0));
        return;
    }
    renderCoordinator.schedule('toc', function () {
        if (activeSidebarTab === 'toc') renderTOC();
    }, {
        delayMs: Math.max(60, Number(delayMs) || 0),
        revision: revision,
        isCurrent: function (candidate) { return candidate === renderSourceRevision; }
    });
}

function scheduleMiniPreviewRender(delayMs) {
    if (!miniPreviewEnabled || !isEditMode) return;
    const revision = syncRenderSourceRevision(currentMarkdown);
    if (!renderCoordinator) {
        setTimeout(function () { if (miniPreviewEnabled && isEditMode) renderMiniPreviewContent(); }, Math.max(80, Number(delayMs) || 0));
        return;
    }
    renderCoordinator.schedule('mini-preview', function () {
        if (miniPreviewEnabled && isEditMode) renderMiniPreviewContent();
    }, {
        delayMs: Math.max(80, Number(delayMs) || 0),
        revision: revision,
        isCurrent: function (candidate) { return candidate === renderSourceRevision; }
    });
}

function scheduleUpdatePreviewPopupContent(delayMs) {
    if (!(typeof isPreviewPopupAlive === 'function' && isPreviewPopupAlive())) return;
    const revision = syncRenderSourceRevision(currentMarkdown);
    if (!renderCoordinator) {
        setTimeout(function () {
            if (typeof updatePreviewPopupContent === 'function') updatePreviewPopupContent();
        }, Math.max(80, Number(delayMs) || 0));
        return;
    }
    renderCoordinator.schedule('popup-preview', function () {
        if (typeof updatePreviewPopupContent === 'function') updatePreviewPopupContent();
    }, {
        delayMs: Math.max(80, Number(delayMs) || 0),
        revision: revision,
        isCurrent: function (candidate) { return candidate === renderSourceRevision; }
    });
}

function getCurrentAutoSaveDocumentKey() {
    if (!currentDocumentRef) return getActiveStorageMode() + ':unsaved_current';
    return String(currentDocumentRef.storageMode || getActiveStorageMode()) + ':' + String(currentDocumentRef.id || '');
}

async function saveCurrentDocumentToActiveStorageQuietly(snapshot) {
    if (!window.MDPStorage) return false;
    const candidate = snapshot || null;
    if (candidate && candidate.documentKey !== getCurrentAutoSaveDocumentKey()) return false;
    const activeMode = getActiveStorageMode();
    if (activeMode === 'indb' && typeof window.isInDbStorageEnabled === 'function' && !window.isInDbStorageEnabled()) {
        return false;
    }
    if (!currentDocumentRef) {
        if (activeMode !== 'sqlite') return false;
        const unsavedContent = candidate ? candidate.content : String(currentMarkdown || '');
        if (!unsavedContent.trim()) return false;
        try {
            await window.MDPStorage.saveDocumentDraft({
                documentId: 'unsaved_current',
                storageMode: 'sqlite',
                title: String(((candidate ? candidate.fileName : currentFileName) || 'Untitled').replace(/\.md$/i, '')).trim() || 'Untitled',
                content: unsavedContent,
                baseVersion: null,
                cursorPosition: editorTextarea ? editorTextarea.selectionStart : 0,
                scrollPosition: 0,
                dirty: true
            });
            return true;
        } catch (error) {
            console.warn('Unsaved SQLite draft could not be stored:', error);
            return false;
        }
    }
    if (currentDocumentRef.storageMode !== activeMode) return false;
    const content = candidate ? candidate.content : String(currentMarkdown || '');
    const title = String(((candidate ? candidate.fileName : currentFileName) || 'Untitled').replace(/\.md$/i, '')).trim() || 'Untitled';
    const expectedVersion = currentDocumentRef.version;
    let draft = null;
    if (activeMode === 'sqlite') {
        try {
            const maxScroll = editorTextarea
                ? Math.max(1, editorTextarea.scrollHeight - editorTextarea.clientHeight)
                : 1;
            draft = await window.MDPStorage.saveDocumentDraft({
                documentId: currentDocumentRef.id,
                storageMode: 'sqlite',
                title: title,
                content: content,
                baseVersion: expectedVersion,
                cursorPosition: editorTextarea ? editorTextarea.selectionStart : 0,
                scrollPosition: editorTextarea ? editorTextarea.scrollTop / maxScroll : 0,
                dirty: true
            });
        } catch (error) {
            console.warn('Recovery draft save failed; SQLite write was not attempted:', error);
            return false;
        }
    }
    try {
        const doc = await window.MDPStorage.getDocument(currentDocumentRef.id);
        if (!doc) return false;
        const updatePayload = {
            ...doc,
            title: title,
            content: content
        };
        if (activeMode === 'sqlite') {
            updatePayload.expectedVersion = expectedVersion || doc.version;
        }
        const updated = await window.MDPStorage.updateDocument(currentDocumentRef.id, updatePayload);
        setCurrentDocumentRef(updated || doc, activeMode);
        if (activeMode === 'sqlite') {
            await window.MDPStorage.confirmDocumentSaved(currentDocumentRef.id);
        }
        return true;
    } catch (error) {
        if (activeMode === 'sqlite' && draft) {
            try {
                await window.MDPStorage.queueDocumentUpdate({
                    entityId: currentDocumentRef.id,
                    expectedVersion: expectedVersion,
                    payload: {
                        title: title,
                        content: content,
                        folderId: currentDocumentRef.folderId || 'root',
                        checksum: draft.checksum
                    }
                }, error);
            } catch (queueError) {
                console.warn('SQLite pending operation queue failed:', queueError);
            }
        }
        if (error && error.code === 'VERSION_CONFLICT') {
            console.warn('Storage autosave conflict:', error.details || {});
        } else {
            console.warn('Storage autosave failed:', error);
        }
        return false;
    }
}

// --- AutoSave & Recovery ---
function performAutoSave(options) {
    if (!db) return;
    const opts = options || {};
    const force = !!opts.force;
    const content = String(currentMarkdown || '');
    const fileName = String(currentFileName || 'untitled.md');
    const revision = syncRenderSourceRevision(content);
    const documentKey = getCurrentAutoSaveDocumentKey();
    const requestKey = documentKey + '|' + revision + '|' + fileName;
    autoSaveStats.requested += 1;
    if (!force && content === lastAutoSavedContent && fileName === lastAutoSavedTitle) {
        autoSaveStats.skippedDuplicate += 1;
        return;
    }
    if (!force && requestKey === pendingAutoSaveKey) {
        autoSaveStats.skippedDuplicate += 1;
        return;
    }
    pendingAutoSaveKey = requestKey;
    const snapshot = { content: content, fileName: fileName, revision: revision, documentKey: documentKey };
    storageAutoSavePromise = storageAutoSavePromise
        .catch(function () { return false; })
        .then(async function () {
            if (!force && (snapshot.revision !== renderSourceRevision || snapshot.documentKey !== getCurrentAutoSaveDocumentKey())) {
                autoSaveStats.skippedStale += 1;
                return false;
            }
            const saved = await saveCurrentDocumentToActiveStorageQuietly(snapshot);
            if (saved) {
                lastAutoSavedContent = snapshot.content;
                lastAutoSavedTitle = snapshot.fileName;
                autoSaveStats.completed += 1;
            } else {
                autoSaveStats.failed += 1;
            }
            return saved;
        })
        .finally(function () {
            if (pendingAutoSaveKey === requestKey) pendingAutoSaveKey = '';
            if (snapshot.revision !== renderSourceRevision) schedulePerformAutoSave(80);
        });
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
    if (!window.MDPStorage || getActiveStorageMode() !== 'sqlite') return false;
    try {
        const drafts = await window.MDPStorage.listRecoveryDrafts();
        const draft = drafts.find(function (candidate) {
            return candidate && candidate.dirty === true && candidate.documentId === 'unsaved_current';
        });
        if (!draft) return false;
        recoveryCandidateDraft = draft;
        const modal = document.getElementById('recovery-modal');
        if (!modal) return false;
        const description = modal.querySelector('p');
        if (description) {
            description.textContent = 'SQLite에 저장하기 전 편집하던 "' + draft.title + '" 초안이 있습니다.';
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        return true;
    } catch (error) {
        console.warn('Startup recovery check failed:', error);
        return false;
    }
}

async function offerRecoveryForDocument(documentRecord) {
    if (!window.MDPStorage || getActiveStorageMode() !== 'sqlite' || !documentRecord) return false;
    try {
        const drafts = await window.MDPStorage.listRecoveryDrafts();
        const draft = drafts.find(function (candidate) {
            return candidate
                && candidate.dirty === true
                && String(candidate.documentId || '') === String(documentRecord.id || '')
                && String(candidate.checksum || '') !== String(documentRecord.checksum || '');
        });
        if (!draft) return false;
        recoveryCandidateDraft = draft;
        const modal = document.getElementById('recovery-modal');
        if (!modal) return false;
        const description = modal.querySelector('p');
        if (description) {
            const savedTime = new Date(Number(draft.savedAt || Date.now())).toLocaleString();
            description.textContent = 'SQLite에 반영되지 않은 "' + draft.title + '" 초안이 있습니다. 저장 시각: ' + savedTime;
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        return true;
    } catch (error) {
        console.warn('Recovery draft lookup failed:', error);
        return false;
    }
}

async function applyRecovery() {
    const draft = recoveryCandidateDraft;
    dismissRecovery();
    if (!draft) return;
    if (draft.documentId === 'unsaved_current') {
        clearCurrentDocumentRef();
        currentFileName = String(draft.title || 'Untitled') + '.md';
        currentFilePath = null;
        updateCurrentDocumentDisplay();
        updateContent(String(draft.content || ''));
        showToast('저장 전 초안을 복구했습니다. 저장 버튼으로 SQLite 문서를 생성해 주세요.');
        return;
    }
    if (!currentDocumentRef || currentDocumentRef.id !== String(draft.documentId || '')) {
        showToast('복구할 SQLite 문서를 먼저 다시 열어 주세요.');
        return;
    }
    currentFileName = String(draft.title || 'Untitled') + '.md';
    currentFilePath = null;
    updateCurrentDocumentDisplay();
    updateContent(String(draft.content || ''));
    if (editorTextarea) {
        const cursor = Math.max(0, Math.min(Number(draft.cursorPosition) || 0, editorTextarea.value.length));
        editorTextarea.setSelectionRange(cursor, cursor);
        requestAnimationFrame(function () {
            const maxScroll = Math.max(0, editorTextarea.scrollHeight - editorTextarea.clientHeight);
            editorTextarea.scrollTop = maxScroll * Math.max(0, Math.min(1, Number(draft.scrollPosition) || 0));
        });
    }
    showToast('복구 초안을 편집기에 불러왔습니다. SQLite 저장을 다시 시도합니다.');
    performAutoSave({ force: true });
}

function dismissRecovery() {
    const modal = document.getElementById('recovery-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    recoveryCandidateDraft = null;
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
        db: db,
        imageDb: window.ImageDB || null,
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

function convertHtmlToMarkdownInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyHtmlToMarkdown === 'function') {
        return window.TidyActions.applyHtmlToMarkdown(getTidyActionDeps());
    }
}

function applyNoteCoverTidyInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyNoteCover === 'function') {
        window.TidyActions.applyNoteCover(getTidyActionDeps());
    }
}

function applyInline2RefFootnoteInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyInlineToRef === 'function') {
        return window.TidyActions.applyInlineToRef(getTidyActionDeps(), 'footnote');
    }
}

function applyInline2RefReferenceInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyInlineToRef === 'function') {
        return window.TidyActions.applyInlineToRef(getTidyActionDeps(), 'reference');
    }
}

function openTidyScriptManager() {
    if (window.TidyScriptManager && typeof window.TidyScriptManager.openManager === 'function') {
        return window.TidyScriptManager.openManager();
    }
    showToast('사용자 JS 관리 기능을 불러오지 못했습니다.');
    return false;
}

function convertBase64ImagesToInternalInEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyBase64ToUrl === 'function') {
        return window.TidyActions.applyBase64ToUrl(getTidyActionDeps());
    }
}

function convertInternalImagesToBase64InEditor() {
    if (window.TidyActions && typeof window.TidyActions.applyUrl2base64 === 'function') {
        return window.TidyActions.applyUrl2base64(getTidyActionDeps());
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

function closeListQuickMenu() {
    const panel = document.getElementById('list-quick-panel');
    const btn = document.getElementById('btn-list-quick');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closeCodeQuoteQuickMenu() {
    const panel = document.getElementById('code-quote-quick-panel');
    const btn = document.getElementById('btn-code-quote-quick');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closeTextEmphasisQuickMenu() {
    const panel = document.getElementById('text-emphasis-quick-panel');
    const btn = document.getElementById('btn-text-emphasis-quick');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleTextEmphasisQuickMenu(forceOpen) {
    const panel = document.getElementById('text-emphasis-quick-panel');
    const btn = document.getElementById('btn-text-emphasis-quick');
    if (!panel || !btn) return;
    if (!textEmphasisQuickMenuBound && document.body) {
        textEmphasisQuickMenuBound = true;
        document.body.addEventListener('click', function (event) {
            const currentPanel = document.getElementById('text-emphasis-quick-panel');
            const currentButton = document.getElementById('btn-text-emphasis-quick');
            if (!currentPanel || !currentButton || currentPanel.contains(event.target) || currentButton.contains(event.target)) return;
            closeTextEmphasisQuickMenu();
        });
    }
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', String(shouldOpen));
}

function toggleCodeQuoteQuickMenu(forceOpen) {
    const panel = document.getElementById('code-quote-quick-panel');
    const btn = document.getElementById('btn-code-quote-quick');
    if (!panel || !btn) return;
    if (!codeQuoteQuickMenuBound && document.body) {
        codeQuoteQuickMenuBound = true;
        document.body.addEventListener('click', function (event) {
            const currentPanel = document.getElementById('code-quote-quick-panel');
            const currentButton = document.getElementById('btn-code-quote-quick');
            if (!currentPanel || !currentButton || currentPanel.contains(event.target) || currentButton.contains(event.target)) return;
            closeCodeQuoteQuickMenu();
        });
    }
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', String(shouldOpen));
}

function closeHeadingQuickMenu() {
    const panel = document.getElementById('heading-quick-panel');
    const btn = document.getElementById('btn-heading-quick');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleHeadingQuickMenu(forceOpen) {
    const panel = document.getElementById('heading-quick-panel');
    const btn = document.getElementById('btn-heading-quick');
    if (!panel || !btn) return;
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', String(shouldOpen));
    if (!document.body.__headingQuickMenuBound) {
        document.body.__headingQuickMenuBound = true;
        document.body.addEventListener('click', function (event) {
            const currentPanel = document.getElementById('heading-quick-panel');
            const currentButton = document.getElementById('btn-heading-quick');
            if (!currentPanel || !currentButton || currentPanel.contains(event.target) || currentButton.contains(event.target)) return;
            closeHeadingQuickMenu();
        });
    }
}

function toggleListQuickMenu(forceOpen) {
    const panel = document.getElementById('list-quick-panel');
    const btn = document.getElementById('btn-list-quick');
    if (!panel || !btn) return;
    bindListQuickMenuDismiss();
    const shouldOpen = forceOpen === true ? true : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', String(shouldOpen));
}

function bindListQuickMenuDismiss() {
    if (listQuickMenuBound || !document.body) return;
    listQuickMenuBound = true;
    document.body.addEventListener('click', function (event) {
        const panel = document.getElementById('list-quick-panel');
        const btn = document.getElementById('btn-list-quick');
        if (!panel || !btn) return;
        const target = event.target;
        if (panel.contains(target) || btn.contains(target)) return;
        closeListQuickMenu();
    });
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
        case 'inline-code':
            before = '`';
            after = '`';
            placeholder = 'code';
            break;
        case 'superscript':
            before = '<sup>';
            after = '</sup>';
            break;
        case 'subscript':
            before = '<sub>';
            after = '</sub>';
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
    } else if (!selectedText && after) {
        editorTextarea.setSelectionRange(start + before.length, start + before.length);
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
    if (!window.TextStyleTool || typeof window.TextStyleTool.open !== 'function') {
        showToast('서식 설정 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
        return false;
    }
    return window.TextStyleTool.open({
        isEditMode: isEditMode,
        textarea: editorTextarea,
        showToast: showToast
    });
}

function closeTextStyleModal() {
    if (!window.TextStyleTool || typeof window.TextStyleTool.close !== 'function') return false;
    return window.TextStyleTool.close({ textarea: editorTextarea });
}

function openMermaidEditorModal() {
    const modal = document.getElementById('mermaid-editor-modal');
    if (!modal) return;
    ensureLazyFrameLoaded('mermaid-editor-frame');
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
        showToast('편집 모드에서 텍스트를 선택한 뒤 사용해 주세요.');
        return false;
    }
    if (!window.TextStyleTool || typeof window.TextStyleTool.applySelection !== 'function') {
        showToast('서식 설정 모듈을 불러오지 못했습니다.');
        return false;
    }
    const result = window.TextStyleTool.applySelection({ textarea: editorTextarea });
    if (!result || !result.ok) {
        showToast(result && result.message ? result.message : '선택 영역에 서식을 적용하지 못했습니다.');
        return false;
    }
    currentMarkdown = editorTextarea.value;
    performAutoSave();
    if (activeSidebarTab === 'toc') renderTOC();
    showToast('선택 영역에 서식을 적용했습니다.');
    return true;
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
    syncEditorShiftFloatPosition();
}

let editorShiftFloatPositionTrackingInstalled = false;

function syncEditorShiftFloatPosition() {
    const control = document.getElementById('editor-shift-float');
    const viewport = document.getElementById('content-viewport');
    if (!control || !viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const sidebarEl = document.getElementById('sidebar');
    const sidebarVisible = !!(sidebarEl && getComputedStyle(sidebarEl).display !== 'none');
    const sidebarRect = sidebarVisible ? sidebarEl.getBoundingClientRect() : null;
    const outsideSidebarLeft = sidebarRect && sidebarRect.width > 0 ? sidebarRect.right + 8 : viewportRect.left + 8;

    control.style.left = `${Math.max(viewportRect.left + 8, outsideSidebarLeft)}px`;
    control.style.bottom = `${Math.max(8, window.innerHeight - viewportRect.bottom + 8)}px`;

    if (editorShiftFloatPositionTrackingInstalled) return;
    editorShiftFloatPositionTrackingInstalled = true;
    window.addEventListener('resize', syncEditorShiftFloatPosition, { passive: true });
    window.addEventListener('md-viewer:sidebar-resized', syncEditorShiftFloatPosition);
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(syncEditorShiftFloatPosition);
        observer.observe(viewport);
        if (sidebarEl) observer.observe(sidebarEl);
    }
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

let toastHideTimer = null;

function hideToast() {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (toastHideTimer !== null) {
        clearTimeout(toastHideTimer);
        toastHideTimer = null;
    }
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    toast.style.display = 'none';
    toast.setAttribute('aria-hidden', 'true');
}

function showToast(msg, options) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const config = options && typeof options === 'object' ? options : {};
    const message = document.getElementById('toast-message');
    const closeButton = document.getElementById('toast-close');
    if (message) message.textContent = sanitizeUiMessage(msg);
    if (closeButton) {
        closeButton.classList.toggle('hidden', config.dismissible !== true);
        closeButton.onclick = hideToast;
    }
    if (toastHideTimer !== null) clearTimeout(toastHideTimer);
    toastHideTimer = null;
    toast.style.display = 'flex';
    toast.style.opacity = '1';
    toast.style.pointerEvents = config.dismissible === true ? 'auto' : 'none';
    toast.setAttribute('aria-hidden', 'false');
    if (config.persistent !== true) {
        toastHideTimer = setTimeout(hideToast, 3000);
    }
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
function normalizeMarkdownCommentColor(value, fallback) {
    if (window.MDComment && typeof window.MDComment.normalizeEditorCommentColor === 'function') {
        return window.MDComment.normalizeEditorCommentColor(value, fallback);
    }
    const candidate = String(value == null ? '' : value).trim();
    return /^#[0-9a-f]{6}$/i.test(candidate)
        ? candidate.toLowerCase()
        : String(fallback || '#facc15').toLowerCase();
}

function setMainHeaderBackgroundRemoved(removed, persist) {
    mainHeaderBackgroundRemoved = !!removed;
    document.documentElement.classList.toggle('md-main-header-background-removed', mainHeaderBackgroundRemoved);
    const checkbox = document.getElementById('main-header-background-remove');
    if (checkbox) checkbox.checked = mainHeaderBackgroundRemoved;
    if (persist !== false) {
        try {
            localStorage.setItem(MAIN_HEADER_BACKGROUND_REMOVED_KEY, mainHeaderBackgroundRemoved ? '1' : '0');
        } catch (_) {}
    }
    return mainHeaderBackgroundRemoved;
}

function setMarkdownCommentColorVariables(lightColor, darkColor) {
    document.documentElement.style.setProperty('--md-comment-highlight-light', lightColor);
    document.documentElement.style.setProperty('--md-comment-highlight-dark', darkColor);
}

function loadMarkdownCommentColorSettings() {
    let savedLight = '';
    let savedDark = '';
    try {
        savedLight = localStorage.getItem(EDITOR_COMMENT_LIGHT_COLOR_KEY) || '';
        savedDark = localStorage.getItem(EDITOR_COMMENT_DARK_COLOR_KEY) || '';
    } catch (_) {}
    const lightColor = normalizeMarkdownCommentColor(savedLight, DEFAULT_EDITOR_COMMENT_COLORS.light);
    const darkColor = normalizeMarkdownCommentColor(savedDark, DEFAULT_EDITOR_COMMENT_COLORS.dark);
    const lightInput = document.getElementById('comment-highlight-light-color');
    const darkInput = document.getElementById('comment-highlight-dark-color');
    if (lightInput) lightInput.value = lightColor;
    if (darkInput) darkInput.value = darkColor;
    setMarkdownCommentColorVariables(lightColor, darkColor);
}

function applyMarkdownCommentColorSettings() {
    const lightInput = document.getElementById('comment-highlight-light-color');
    const darkInput = document.getElementById('comment-highlight-dark-color');
    const lightColor = normalizeMarkdownCommentColor(
        lightInput && lightInput.value,
        DEFAULT_EDITOR_COMMENT_COLORS.light
    );
    const darkColor = normalizeMarkdownCommentColor(
        darkInput && darkInput.value,
        DEFAULT_EDITOR_COMMENT_COLORS.dark
    );
    if (lightInput) lightInput.value = lightColor;
    if (darkInput) darkInput.value = darkColor;
    setMarkdownCommentColorVariables(lightColor, darkColor);
    try {
        localStorage.setItem(EDITOR_COMMENT_LIGHT_COLOR_KEY, lightColor);
        localStorage.setItem(EDITOR_COMMENT_DARK_COLOR_KEY, darkColor);
    } catch (_) {}
}

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
    loadMarkdownCommentColorSettings();
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
    loadGoogleCalendarOptionsUI();
    syncMermaidDisplayModeUI();
    if (typeof syncPreviewPopupHeaderSettingsUi === 'function') syncPreviewPopupHeaderSettingsUi();
}

function getMermaidDisplayModeFromLocal() {
    try {
        return localStorage.getItem(MERMAID_DISPLAY_MODE_KEY) === 'interactive' ? 'interactive' : 'fixed';
    } catch (_) {
        return 'fixed';
    }
}

function syncMermaidDisplayModeUI() {
    const mode = getMermaidDisplayModeFromLocal();
    const inputs = document.querySelectorAll('input[name="mermaid-display-mode"]');
    inputs.forEach(function (input) {
        input.checked = input.value === mode;
    });
    const status = document.getElementById('mermaid-display-mode-status');
    if (status) {
        status.textContent = mode === 'fixed'
            ? '고정형: 문서에 맞는 기본 크기로 표시하며 도표별 크기를 조절할 수 있습니다.'
            : '인터랙티브: 이동, 확대/축소, 맞춤, 크기 조절 도구를 표시합니다.';
    }
}

function refreshMermaidDisplay() {
    if (typeof updatePreviewPopupContent === 'function') {
        Promise.resolve(updatePreviewPopupContent()).catch(function () {});
    }
    if (!window.MermaidTRT || typeof window.MermaidTRT.refresh !== 'function') return Promise.resolve(false);
    return window.MermaidTRT.refresh(document).catch(function (error) {
        console.warn('Mermaid display refresh skipped:', error && error.message ? error.message : error);
        return false;
    });
}

function setMermaidDisplayMode(mode) {
    const nextMode = mode === 'fixed' ? 'fixed' : 'interactive';
    try { localStorage.setItem(MERMAID_DISPLAY_MODE_KEY, nextMode); } catch (_) {}
    syncMermaidDisplayModeUI();
    if (window.MermaidTRT && typeof window.MermaidTRT.setDisplayMode === 'function') {
        window.MermaidTRT.setDisplayMode(nextMode).catch(function (error) {
            console.warn('Mermaid display mode change skipped:', error && error.message ? error.message : error);
        });
    }
    if (typeof updatePreviewPopupContent === 'function') {
        Promise.resolve(updatePreviewPopupContent()).catch(function () {});
    }
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

function getGoogleCalendarOpenModeFromLocal() {
    try {
        return localStorage.getItem(GOOGLE_CALENDAR_OPEN_MODE_KEY) === 'external' ? 'external' : 'internal';
    } catch (_) {
        return 'internal';
    }
}

function getGoogleCalendarEmailFromLocal() {
    try {
        return String(localStorage.getItem(GOOGLE_CALENDAR_EMAIL_KEY) || '').trim();
    } catch (_) {
        return '';
    }
}

function isValidGoogleCalendarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function setGoogleCalendarOptionsToLocal(mode, email) {
    const safeMode = mode === 'external' ? 'external' : 'internal';
    const safeEmail = String(email || '').trim().toLowerCase();
    try {
        localStorage.setItem(GOOGLE_CALENDAR_OPEN_MODE_KEY, safeMode);
        if (safeEmail) localStorage.setItem(GOOGLE_CALENDAR_EMAIL_KEY, safeEmail);
        else localStorage.removeItem(GOOGLE_CALENDAR_EMAIL_KEY);
    } catch (_) {}
    return { mode: safeMode, email: safeEmail };
}

function setGoogleCalendarSettingsStatus(message, isError) {
    const status = document.getElementById('google-calendar-settings-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.className = 'min-h-[1rem] text-[11px] ' +
        (isError ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400');
}

function loadGoogleCalendarOptionsUI(settings) {
    const storedMode = settings && settings.googleCalendarOpenMode
        ? settings.googleCalendarOpenMode
        : getGoogleCalendarOpenModeFromLocal();
    const storedEmail = settings && typeof settings.googleCalendarEmail === 'string'
        ? settings.googleCalendarEmail
        : getGoogleCalendarEmailFromLocal();
    const options = setGoogleCalendarOptionsToLocal(storedMode, storedEmail);
    const emailInput = document.getElementById('google-calendar-email');
    if (emailInput) emailInput.value = options.email;
    document.querySelectorAll('input[name="google-calendar-open-mode"]').forEach(function (radio) {
        radio.checked = radio.value === options.mode;
    });
    const button = document.getElementById('btn-google-calendar');
    if (button) {
        button.title = options.mode === 'external'
            ? 'Google 캘린더 브라우저 새 창으로 열기'
            : 'Google 캘린더 앱 내부 창으로 열기';
    }
    setGoogleCalendarSettingsStatus(
        options.email
            ? options.email + ' · ' + (options.mode === 'external' ? '브라우저 새 창' : '앱 내부 창')
            : 'Gmail 주소 없이 기본 Google 캘린더를 엽니다.',
        false
    );
    return options;
}

async function saveGoogleCalendarOptions(showFeedback) {
    const emailInput = document.getElementById('google-calendar-email');
    const checkedMode = document.querySelector('input[name="google-calendar-open-mode"]:checked');
    const email = String(emailInput && emailInput.value || '').trim().toLowerCase();
    const mode = checkedMode && checkedMode.value === 'external' ? 'external' : 'internal';
    if (email && !isValidGoogleCalendarEmail(email)) {
        setGoogleCalendarSettingsStatus('올바른 Gmail 주소 형식으로 입력해 주세요.', true);
        if (showFeedback && emailInput) emailInput.focus();
        return false;
    }
    const options = setGoogleCalendarOptionsToLocal(mode, email);
    loadGoogleCalendarOptionsUI(options);
    try {
        await setAiSettings({
            googleCalendarOpenMode: options.mode,
            googleCalendarEmail: options.email
        });
    } catch (error) {
        setGoogleCalendarSettingsStatus('캘린더 설정 저장 실패: ' + (error && error.message ? error.message : error), true);
        return false;
    }
    if (showFeedback) {
        setGoogleCalendarSettingsStatus(
            '저장됨 · ' + (options.mode === 'external' ? '브라우저 새 창' : '앱 내부 창'),
            false
        );
        showToast('Google 캘린더 설정을 저장했습니다.');
    }
    return true;
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

function buildGoogleCalendarExternalUrl() {
    const email = getGoogleCalendarEmailFromLocal();
    const url = new URL(GOOGLE_CALENDAR_URL);
    if (email) url.searchParams.set('authuser', email);
    return url.href;
}

function buildGoogleCalendarAddUrl() {
    const email = getGoogleCalendarEmailFromLocal();
    if (!email) return buildGoogleCalendarExternalUrl();
    const url = new URL(GOOGLE_CALENDAR_URL);
    url.searchParams.set('cid', email);
    url.searchParams.set('authuser', email);
    return url.href;
}

function buildGoogleCalendarEmbedUrl(email) {
    const url = new URL('https://calendar.google.com/calendar/embed');
    const safeEmail = String(email || '').trim();
    if (safeEmail) url.searchParams.set('src', safeEmail);
    let timezone = 'Asia/Seoul';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch (_) {}
    url.searchParams.set('ctz', timezone);
    url.searchParams.set('mode', 'MONTH');
    return url.href;
}

function openGoogleCalendarExternalWindow() {
    const opened = window.open(buildGoogleCalendarExternalUrl(), '_blank');
    if (!opened) {
        showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
        return false;
    }
    try { opened.opener = null; } catch (_) {}
    return true;
}

function openGoogleCalendarAddWindow() {
    const opened = window.open(buildGoogleCalendarAddUrl(), '_blank');
    if (!opened) {
        showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
        return false;
    }
    try { opened.opener = null; } catch (_) {}
    return true;
}

function bindGoogleCalendarInternalDrag() {
    if (googleCalendarInternalDragBound) return;
    const panel = document.getElementById('google-calendar-internal-panel');
    const header = document.getElementById('google-calendar-internal-header');
    if (!panel || !header) return;
    googleCalendarInternalDragBound = true;
    header.addEventListener('pointerdown', function (event) {
        if (event.target.closest('button') || googleCalendarInternalMaximized) return;
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.margin = '0';
        try { header.setPointerCapture(event.pointerId); } catch (_) {}

        const move = function (moveEvent) {
            const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
            panel.style.left = Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX)) + 'px';
            panel.style.top = Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY)) + 'px';
        };
        const end = function (endEvent) {
            header.removeEventListener('pointermove', move);
            header.removeEventListener('pointerup', end);
            header.removeEventListener('pointercancel', end);
            try { header.releasePointerCapture(endEvent.pointerId); } catch (_) {}
        };
        header.addEventListener('pointermove', move);
        header.addEventListener('pointerup', end);
        header.addEventListener('pointercancel', end);
        event.preventDefault();
    });
}

function openGoogleCalendarInternalWindow() {
    const email = getGoogleCalendarEmailFromLocal();
    const shell = document.getElementById('google-calendar-internal-shell');
    const frame = document.getElementById('google-calendar-internal-frame');
    const loading = document.getElementById('google-calendar-internal-loading');
    const account = document.getElementById('google-calendar-internal-account');
    if (!shell || !frame) return false;
    if (account) account.textContent = email || '기본 Google 캘린더';
    if (loading) loading.classList.remove('hidden');
    frame.onload = onGoogleCalendarInternalFrameLoad;
    frame.src = buildGoogleCalendarEmbedUrl(email);
    shell.classList.remove('hidden');
    shell.classList.add('flex');
    bindGoogleCalendarInternalDrag();
    return true;
}

function onGoogleCalendarInternalFrameLoad() {
    const loading = document.getElementById('google-calendar-internal-loading');
    if (loading) loading.classList.add('hidden');
}

function closeGoogleCalendarInternalWindow() {
    const shell = document.getElementById('google-calendar-internal-shell');
    const frame = document.getElementById('google-calendar-internal-frame');
    if (googleCalendarInternalMaximized) toggleGoogleCalendarInternalMaximize();
    if (shell) {
        shell.classList.add('hidden');
        shell.classList.remove('flex');
    }
    if (frame) frame.removeAttribute('src');
}

function toggleGoogleCalendarInternalMaximize() {
    const panel = document.getElementById('google-calendar-internal-panel');
    const button = document.getElementById('google-calendar-internal-maximize');
    if (!panel) return;
    if (!googleCalendarInternalMaximized) {
        googleCalendarInternalRestoreStyle = panel.getAttribute('style') || '';
        panel.style.position = 'fixed';
        panel.style.inset = '6px';
        panel.style.left = '6px';
        panel.style.top = '6px';
        panel.style.width = 'calc(100vw - 12px)';
        panel.style.height = 'calc(100vh - 12px)';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = 'none';
        panel.style.resize = 'none';
        if (button) button.textContent = '❐';
    } else {
        if (googleCalendarInternalRestoreStyle) panel.setAttribute('style', googleCalendarInternalRestoreStyle);
        else panel.removeAttribute('style');
        if (button) button.textContent = '□';
    }
    googleCalendarInternalMaximized = !googleCalendarInternalMaximized;
}

function openGoogleCalendarSettingsFromInternal() {
    closeGoogleCalendarInternalWindow();
    openSettingsModal();
    setTimeout(focusGoogleCalendarSettings, 80);
}

function openGoogleCalendarWindow() {
    if (!getGoogleCalendarEnabledFromLocal()) {
        showToast('설정에서 Google 캘린더 사용을 먼저 켜 주세요.');
        openSettingsModal();
        setTimeout(focusGoogleCalendarSettings, 80);
        return false;
    }
    return getGoogleCalendarOpenModeFromLocal() === 'external'
        ? openGoogleCalendarExternalWindow()
        : openGoogleCalendarInternalWindow();
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
    async function mergeSqliteSettings(localSettings) {
        try {
            if (!window.MDPStorage || typeof window.MDPStorage.getStatus !== 'function'
                || typeof window.MDPStorage.getResolvedSqliteSettings !== 'function') {
                return localSettings;
            }
            const status = window.MDPStorage.getStatus();
            if (!status || status.activeMode !== 'sqlite'
                || !status.sqliteHealth || !status.sqliteHealth.capabilities
                || status.sqliteHealth.capabilities.settings !== true) {
                return localSettings;
            }
            const resolved = await window.MDPStorage.getResolvedSqliteSettings();
            const values = resolved && resolved.values && typeof resolved.values === 'object'
                ? resolved.values
                : {};
            // SQLite contains allow-listed values only. Locally stored credentials remain local.
            return { ...(localSettings || {}), ...values, id: AI_SETTINGS_KEY };
        } catch (error) {
            console.warn('SQLite settings restore skipped:', error && error.message ? error.message : error);
            return localSettings;
        }
    }
    if (!db) return await mergeSqliteSettings(readFallback());
    try {
        const localSettings = await new Promise((res) => {
            const tx = db.transaction('ai_settings', 'readonly');
            const req = tx.objectStore('ai_settings').get(AI_SETTINGS_KEY);
            req.onsuccess = () => res(req.result || null);
            req.onerror = () => res(readFallback());
            tx.onabort = () => res(readFallback());
        });
        return await mergeSqliteSettings(localSettings);
    } catch (_) {
        return await mergeSqliteSettings(readFallback());
    }
}

function getLocalStorageFeatureEnabledFromSettings(settings) {
    if (!settings || typeof settings.localEnabled !== 'boolean') return true;
    return settings.localEnabled === true;
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
    async function mirrorSafeSettings() {
        try {
            if (window.MDPStorage && typeof window.MDPStorage.saveSqliteSafeSettings === 'function') {
                await window.MDPStorage.saveSqliteSafeSettings(data || {});
            }
        } catch (error) {
            console.warn('SQLite safe settings mirror failed:', error && error.message ? error.message : error);
        }
    }
    if (!db || (typeof window.isInDbStorageEnabled === 'function' && !window.isInDbStorageEnabled())) {
        await mirrorSafeSettings();
        return;
    }
    try {
        await new Promise((res, rej) => {
            const tx = db.transaction('ai_settings', 'readwrite');
            const req = tx.objectStore('ai_settings').put(payload);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
            tx.onabort = () => rej(tx.error || new Error('ai_settings transaction aborted'));
        });
        await mirrorSafeSettings();
        return;
    } catch (e) {
        const fb = readFallback() || {};
        writeFallback({ ...fb, ...payload, id: AI_SETTINGS_KEY });
        await mirrorSafeSettings();
        return;
    }
}

function getShareAddressSettingsSnapshot(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    let shareSnapshot = {};
    try {
        if (window.ShareModule && typeof window.ShareModule.getSettingsSnapshot === 'function') {
            shareSnapshot = window.ShareModule.getSettingsSnapshot() || {};
        }
    } catch (_) {}
    const currentSites = typeof window.getSitesList === 'function'
        ? window.getSitesList()
        : normalizeSitesList(source.sitesList);
    return {
        sitesList: normalizeSitesList(Array.isArray(source.sitesList) ? source.sitesList : currentSites)
            .map(function (item) { return { name: item.name, url: item.url }; }),
        shareSites: (Array.isArray(source.shareSites) ? source.shareSites : shareSnapshot.shareSites || [])
            .map(function (value) { return String(value || '').trim(); })
            .filter(function (value, index, list) { return value && list.indexOf(value) === index; }),
        customShareDestinations: (Array.isArray(source.customShareDestinations)
            ? source.customShareDestinations : shareSnapshot.customShareDestinations || [])
            .map(function (item) {
                return {
                    key: String(item && item.key || '').trim(),
                    label: String(item && (item.label || item.name) || '').trim(),
                    url: String(item && item.url || '').trim()
                };
            })
            .filter(function (item) { return item.key && item.url; }),
        naverBlogId: String(source.naverBlogId != null ? source.naverBlogId : (shareSnapshot.naverBlogId || '')).trim()
    };
}

async function syncShareAddressSettingsToSqlite(settings) {
    if (!window.MDPStorage || typeof window.MDPStorage.getStatus !== 'function'
        || typeof window.MDPStorage.saveSqliteSafeSettings !== 'function') return { saved: 0, skipped: true };
    const status = window.MDPStorage.getStatus();
    if (!status || status.activeMode !== 'sqlite') return { saved: 0, skipped: true };
    const source = settings && typeof settings === 'object' ? settings : await getAiSettings() || {};
    return window.MDPStorage.saveSqliteSafeSettings(getShareAddressSettingsSnapshot(source));
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

function getProtectedAiCredential(id, legacyStorageKey) {
    try {
        if (window.MDPCredentialVault && typeof window.MDPCredentialVault.getSecret === 'function') {
            const protectedValue = String(window.MDPCredentialVault.getSecret(id) || '').trim();
            if (protectedValue) return protectedValue;
            const vaultStatus = window.MDPCredentialVault.getStatus();
            const metadata = vaultStatus && Array.isArray(vaultStatus.entries)
                ? vaultStatus.entries.find(function (item) { return item && item.id === id; })
                : null;
            if (metadata && metadata.configured && vaultStatus.locked) return '';
        }
    } catch (_) {}
    try { return String(localStorage.getItem(legacyStorageKey) || '').trim(); } catch (_) { return ''; }
}

function isValidDeepseekAiKey(key) {
    const k = (key || '').trim();
    return /^sk-[0-9A-Za-z_-]{16,}$/.test(k);
}

function isValidOpenAIApiKey(key) {
    const value = String(key || '').trim();
    return /^sk-[0-9A-Za-z_-]{16,}$/.test(value);
}

function validateOpenAIApiKeyInputUI() {
    const input = document.getElementById('openai-api-key');
    const key = String(input && input.value || '').trim();
    if (!input) return false;
    if (!key) {
        setCredentialConnectionVisual('openai-api-key', 'openai-api-key-feedback', 'neutral', '');
        return false;
    }
    if (!isValidOpenAIApiKey(key)) {
        setCredentialConnectionVisual('openai-api-key', 'openai-api-key-feedback', 'error', 'OpenAI API 키는 sk-로 시작해야 합니다.');
        return false;
    }
    const verified = getProtectedAiCredential('openai', 'ss_openai_api_key') === key
        && localStorage.getItem('ss_openai_api_key_verified') === credentialFingerprint(key);
    setCredentialConnectionVisual(
        'openai-api-key',
        'openai-api-key-feedback',
        verified ? 'connected' : 'neutral',
        verified ? '연결됨: OpenAI API Key 확인 완료' : '키 형식이 올바릅니다. OpenAI 키 저장을 눌러 연결을 확인하세요.'
    );
    return true;
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
    const verified = getProtectedAiCredential('deepseek', 'ss_deepseek_api_key') === key
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
            && getProtectedAiCredential('gemini', 'ss_gemini_api_key') === key;
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
let openaiApiKeyCheckKey = '';
let openaiApiKeyCheckPromise = null;

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
    const maxTokens = Math.max(256, Math.min(384000, Number(document.getElementById('deepseek-max-tokens')?.value) || 8192));
    const timeoutSeconds = Math.max(30, Math.min(3600, Number(document.getElementById('deepseek-timeout')?.value) || 300));
    const effortValue = String(document.getElementById('deepseek-reasoning-effort')?.value || 'high').toLowerCase();
    const reasoningEffort = ['low', 'high', 'max'].includes(effortValue) ? effortValue : 'high';
    localStorage.setItem('ss_deepseek_max_tokens', String(maxTokens));
    localStorage.setItem('ss_deepseek_timeout_seconds', String(timeoutSeconds));
    localStorage.setItem('ss_deepseek_reasoning_effort', reasoningEffort);
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

async function verifyOpenAIApiKeyConnection(apiKey) {
    const key = String(apiKey || '').trim();
    if (!isValidOpenAIApiKey(key)) throw new Error('OpenAI API Key 형식이 올바르지 않습니다.');
    if (openaiApiKeyCheckPromise && openaiApiKeyCheckKey === key) return openaiApiKeyCheckPromise;
    openaiApiKeyCheckKey = key;
    const request = (async function () {
        try {
            const models = await listOpenAIChatModels(key);
            saveStoredModelList(AI_CHAT_OPENAI_MODELS_KEY, models);
            saveStoredModelList('ss_scholar_ai_openai_models_v1', models);
            localStorage.setItem('ss_openai_api_key', key);
            localStorage.setItem('ss_openai_api_key_verified', credentialFingerprint(key));
            return models;
        } catch (error) {
            localStorage.removeItem('ss_openai_api_key_verified');
            throw error;
        }
    })();
    openaiApiKeyCheckPromise = request;
    try {
        return await request;
    } finally {
        if (openaiApiKeyCheckPromise === request) {
            openaiApiKeyCheckKey = '';
            openaiApiKeyCheckPromise = null;
        }
    }
}

async function saveOpenAIApiKey() {
    const input = document.getElementById('openai-api-key');
    const key = String(input && input.value || '').trim();
    if (key && !isValidOpenAIApiKey(key)) {
        validateOpenAIApiKeyInputUI();
        showToast('OpenAI API key 형식이 올바르지 않습니다.');
        return;
    }
    await setAiSettings({ openaiApiKey: key });
    if (!key) {
        localStorage.removeItem('ss_openai_api_key');
        localStorage.removeItem('ss_openai_api_key_verified');
        setCredentialConnectionVisual('openai-api-key', 'openai-api-key-feedback', 'neutral', 'OpenAI API key가 비워졌습니다.');
        showToast('OpenAI API key를 비웠습니다.');
        return;
    }
    localStorage.setItem('ss_openai_api_key', key);
    setCredentialConnectionVisual('openai-api-key', 'openai-api-key-feedback', 'checking', 'OpenAI 연결을 확인하는 중...');
    try {
        const models = await verifyOpenAIApiKeyConnection(key);
        setCredentialConnectionVisual('openai-api-key', 'openai-api-key-feedback', 'connected', '연결됨: OpenAI 텍스트 모델 ' + models.length + '개 확인');
        showToast('OpenAI API key가 저장되고 연결되었습니다.');
        if (window.AIChat && typeof window.AIChat.syncSettings === 'function') window.AIChat.syncSettings();
    } catch (error) {
        setCredentialConnectionVisual(
            'openai-api-key',
            'openai-api-key-feedback',
            'error',
            '저장됨 · 연결 확인 실패: ' + (error && error.message ? error.message : error)
        );
        showToast('OpenAI API key는 저장했지만 연결을 확인하지 못했습니다.');
    }
}

function getImgbbApiKey() {
    return getProtectedAiCredential('imgbb', 'ss_imgbb_api_key');
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

function normalizeViewPadding(value) {
    if (value == null || value === '') return DEFAULT_VIEW_PADDING;
    const size = Number(value);
    return [0, 16, 24, 32].includes(size) ? size : DEFAULT_VIEW_PADDING;
}

function getViewPaddingFromLocal() {
    return normalizeViewPadding(localStorage.getItem(VIEW_PADDING_KEY));
}

function applyViewPadding(value) {
    const size = normalizeViewPadding(value);
    document.documentElement.style.setProperty('--md-view-padding', size + 'px');
    const select = document.getElementById('view-padding-size');
    if (select) select.value = String(size);
    if (typeof window.refreshMarkdownCommentHighlight === 'function') {
        window.refreshMarkdownCommentHighlight({ force: true, geometry: true });
    }
    if (typeof window.refreshEditorFormatGutter === 'function') {
        window.refreshEditorFormatGutter();
    }
    return size;
}

async function setViewPaddingSetting(value) {
    const size = applyViewPadding(value);
    localStorage.setItem(VIEW_PADDING_KEY, String(size));
    try { await setAiSettings({ viewPadding: size }); } catch (e) {}
}

function getSettingsContainerFoldState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_CONTAINER_FOLD_STATE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function isSettingsContainerFolded(containerId) {
    const id = String(containerId || '');
    if (!id) return true;
    const state = getSettingsContainerFoldState();
    return state[id] !== false;
}

function setSettingsContainerFoldedToLocal(containerId, folded) {
    const id = String(containerId || '');
    if (!id) return;
    const state = getSettingsContainerFoldState();
    state[id] = !!folded;
    try {
        localStorage.setItem(SETTINGS_CONTAINER_FOLD_STATE_KEY, JSON.stringify(state));
    } catch (_) {}
}

function createSettingsContainerFoldButton(containerId, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-container-fold-toggle';
    button.dataset.settingsFoldButton = containerId;
    button.title = (label || '설정') + ' 접기/펼치기';
    return button;
}

function configureSettingsFoldContainer(container, content, button) {
    if (!container || !content || !button) return;
    container.dataset.settingsFoldContainer = container.id;
    container.dataset.settingsFoldBody = content.id;
    button.dataset.settingsFoldButton = container.id;
    button.setAttribute('aria-controls', content.id);
    if (!button.__settingsFoldBound) {
        button.__settingsFoldBound = true;
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleSettingsContainerFold(container.id);
        });
    }
    applySettingsContainerFold(container.id, isSettingsContainerFolded(container.id));
}

function enhanceSettingsCardFold(containerId, headerSelector, bodyId, buttonId, label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let header = container.querySelector(headerSelector);
    if (!header) return;
    const generatedBodyId = containerId + '-fold-body';
    let content = bodyId
        ? document.getElementById(bodyId)
        : Array.from(container.children).find(function (child) { return child.id === generatedBodyId; }) || null;
    if (!content) {
        content = document.createElement('div');
        content.id = generatedBodyId;
        content.className = 'settings-card-fold-body';
        Array.from(container.children).forEach(function (child) {
            if (child !== header) content.appendChild(child);
        });
        container.appendChild(content);
    } else if (!bodyId) {
        Array.from(content.querySelectorAll('[id]')).forEach(function (nestedBody) {
            if (nestedBody.id !== generatedBodyId) return;
            const parent = nestedBody.parentElement;
            if (!parent) return;
            while (nestedBody.firstChild) parent.insertBefore(nestedBody.firstChild, nestedBody);
            nestedBody.remove();
        });
    }
    const generatedButtons = Array.from(container.querySelectorAll('[data-settings-fold-button]')).filter(function (candidate) {
        return candidate.dataset.settingsFoldButton === containerId;
    });
    let button = buttonId ? document.getElementById(buttonId) : generatedButtons[0] || null;
    if (!button) {
        button = createSettingsContainerFoldButton(containerId, label);
        header.appendChild(button);
    }
    generatedButtons.forEach(function (candidate) {
        if (candidate !== button) candidate.remove();
    });
    if (header.classList) {
        header.classList.add('flex', 'items-center', 'justify-between', 'gap-2');
    }
    configureSettingsFoldContainer(container, content, button);
}

function initializeSettingsContainerFolds() {
    enhanceSettingsCardFold('pwa-settings-card', ':scope > div:first-child', '', '', 'PWA 앱');
    enhanceSettingsCardFold('ai-user-settings-card', ':scope > p:first-child', '', '', '사용자 정보');
    enhanceSettingsCardFold('google-calendar-settings-card', ':scope > div:first-child', '', '', 'Google 캘린더');
    enhanceSettingsCardFold('code-color-settings-card', ':scope > h4:first-child', '', '', '코드 색상');
    enhanceSettingsCardFold('pv-header-settings-card', ':scope > div:first-child', '', '', 'PV 헤더 표시');
    enhanceSettingsCardFold('mermaid-display-settings-card', ':scope > h4:first-child', '', '', 'Mermaid 표시');
    enhanceSettingsCardFold(
        'indb-backup-prefix-settings-card',
        ':scope > div:first-child',
        '',
        '',
        '전체 파일 prefix'
    );
    enhanceSettingsCardFold(
        'sqlite-settings-tool',
        '#sqlite-settings-fold-header',
        'sqlite-runtime-settings-panel',
        'sqlite-settings-fold-btn',
        'SQLite'
    );
    applyAllSettingsContainerFolds();
}

function applySettingsContainerFold(containerId, folded) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const contentId = container.dataset.settingsFoldBody;
    const content = contentId ? document.getElementById(contentId) : null;
    const button = container.querySelector('[data-settings-fold-button="' + containerId + '"]')
        || document.getElementById(containerId === 'sqlite-settings-tool' ? 'sqlite-settings-fold-btn' : '');
    const isFolded = !!folded;
    let hideContent = isFolded;
    if (containerId === 'sqlite-settings-tool') {
        const sqliteCheckbox = document.getElementById('sqlite-enabled');
        hideContent = isFolded || !sqliteCheckbox || sqliteCheckbox.checked !== true;
    }
    if (content) {
        content.classList.toggle('hidden', hideContent);
        content.setAttribute('aria-hidden', hideContent ? 'true' : 'false');
    }
    container.classList.toggle('settings-container-folded', isFolded);
    if (button) {
        button.textContent = isFolded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
        button.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    }
}

function applyAllSettingsContainerFolds() {
    document.querySelectorAll('[data-settings-fold-container]').forEach(function (container) {
        applySettingsContainerFold(container.id, isSettingsContainerFolded(container.id));
    });
}

function toggleSettingsContainerFold(containerId) {
    const next = !isSettingsContainerFolded(containerId);
    setSettingsContainerFoldedToLocal(containerId, next);
    applySettingsContainerFold(containerId, next);
}

function setAllSettingsContainersFolded(folded) {
    const isFolded = !!folded;
    initializeSettingsContainerFolds();
    document.querySelectorAll('[data-settings-fold-container]').forEach(function (container) {
        setSettingsContainerFoldedToLocal(container.id, isFolded);
        applySettingsContainerFold(container.id, isFolded);
    });
    setSettingsShortcutsFoldedToLocal(isFolded);
    applySettingsShortcutsFold(isFolded);
    setAiUseFoldedToLocal(isFolded);
    applyAiUseFold(isFolded);
    setAiChatSettingsFoldedToLocal(isFolded);
    applyAiChatSettingsFold(isFolded);
    setShareSettingsFoldedToLocal(isFolded);
    applyShareSettingsFold(isFolded);
    if (typeof setGithubSettingsFoldedToLocal === 'function') setGithubSettingsFoldedToLocal(isFolded);
    if (typeof applyGithubSettingsFold === 'function') applyGithubSettingsFold(isFolded);
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
    if (btn) {
        btn.textContent = isFolded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
        btn.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    }
}

function toggleSettingsShortcutsFold() {
    const next = !getSettingsShortcutsFoldedFromLocal();
    setSettingsShortcutsFoldedToLocal(next);
    applySettingsShortcutsFold(next);
}

function normalizeFileDownloadPrefix(value) {
    const normalized = String(value == null ? '' : value)
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[.\-]+|[.\-]+$/g, '')
        .slice(0, 40);
    return normalized || DEFAULT_FILE_DOWNLOAD_PREFIX;
}

function getFileDownloadPrefixFromLocal() {
    try {
        return normalizeFileDownloadPrefix(localStorage.getItem(FILE_DOWNLOAD_PREFIX_KEY));
    } catch (_) {
        return DEFAULT_FILE_DOWNLOAD_PREFIX;
    }
}

function syncFileDownloadPrefixSettingUI() {
    const prefix = getFileDownloadPrefixFromLocal();
    const input = document.getElementById('indb-backup-prefix-input');
    const preview = document.getElementById('indb-backup-prefix-preview');
    if (input) input.value = prefix;
    if (preview) preview.textContent = prefix + '-indb-folders-YYYYMMDD-HHMMSS.zip';
}

function saveFileDownloadPrefixSetting() {
    const input = document.getElementById('indb-backup-prefix-input');
    const prefix = normalizeFileDownloadPrefix(input ? input.value : '');
    try { localStorage.setItem(FILE_DOWNLOAD_PREFIX_KEY, prefix); } catch (_) {}
    syncFileDownloadPrefixSettingUI();
    showToast('전체 백업 파일명 prefix를 ' + prefix + '(으)로 저장했습니다.');
}

function resetFileDownloadPrefixSetting() {
    try { localStorage.removeItem(FILE_DOWNLOAD_PREFIX_KEY); } catch (_) {}
    syncFileDownloadPrefixSettingUI();
    showToast('전체 백업 파일명 prefix를 mdpro로 되돌렸습니다.');
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
    if (btn) btn.textContent = folded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
    const section = document.getElementById('ai-password-section');
    if (section) section.classList.toggle('hidden', !!folded);
}

function toggleAiUseFold() {
    const next = !getAiUseFoldedFromLocal();
    setAiUseFoldedToLocal(next);
    applyAiUseFold(next);
}

function getAiChatSettingsFoldedFromLocal() {
    const v = localStorage.getItem(AI_CHAT_SETTINGS_FOLD_KEY);
    return v == null ? true : v === '1';
}

function ensureAiProviderFoldsDefault() {
    if (localStorage.getItem(AI_PROVIDER_FOLDS_DEFAULT_VERSION_KEY) === '1') return;
    [
        AI_CHAT_SETTINGS_FOLD_KEY,
        SCHOLAR_LM_SETTINGS_FOLD_KEY,
        SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY,
        'ss_litertlm_settings_folded'
    ].forEach(function (key) { localStorage.setItem(key, '1'); });
    document.querySelectorAll('#ai-link-settings-block details').forEach(function (details) {
        details.open = false;
    });
    localStorage.setItem(AI_PROVIDER_FOLDS_DEFAULT_VERSION_KEY, '1');
}

function setAiChatSettingsFoldedToLocal(folded) {
    localStorage.setItem(AI_CHAT_SETTINGS_FOLD_KEY, folded ? '1' : '0');
}

function applyAiChatSettingsFold(folded) {
    const isFolded = !!folded;
    const body = document.getElementById('ai-chat-settings-body');
    const btn = document.getElementById('ai-chat-settings-fold-btn');
    if (body) body.classList.toggle('hidden', isFolded);
    if (btn) {
        btn.textContent = isFolded ? '\uD3BC\uCE58\uAE30' : '\uC811\uAE30';
        btn.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    }
}

function getScholarLmSettingsFoldedFromLocal() {
    const value = localStorage.getItem(SCHOLAR_LM_SETTINGS_FOLD_KEY);
    return value == null ? true : value === '1';
}

function applyScholarLmSettingsFold(folded) {
    const isFolded = !!folded;
    const body = document.getElementById('scholar-lm-settings-body');
    const btn = document.getElementById('scholar-lm-settings-fold-btn');
    if (body) body.classList.toggle('hidden', isFolded);
    if (btn) {
        btn.textContent = isFolded ? '펼치기' : '접기';
        btn.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    }
}

function toggleScholarLmSettingsFold() {
    const next = !getScholarLmSettingsFoldedFromLocal();
    localStorage.setItem(SCHOLAR_LM_SETTINGS_FOLD_KEY, next ? '1' : '0');
    applyScholarLmSettingsFold(next);
}

function getScholarOllamaSettingsFoldedFromLocal() {
    const value = localStorage.getItem(SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY);
    return value == null ? true : value === '1';
}

function applyScholarOllamaSettingsFold(folded) {
    const isFolded = !!folded;
    const body = document.getElementById('scholar-ollama-settings-body');
    const btn = document.getElementById('scholar-ollama-settings-fold-btn');
    if (body) body.classList.toggle('hidden', isFolded);
    if (btn) {
        btn.textContent = isFolded ? '펼치기' : '접기';
        btn.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    }
}

function toggleScholarOllamaSettingsFold() {
    const next = !getScholarOllamaSettingsFoldedFromLocal();
    localStorage.setItem(SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY, next ? '1' : '0');
    applyScholarOllamaSettingsFold(next);
}

function toggleAiChatSettingsFold() {
    const next = !getAiChatSettingsFoldedFromLocal();
    setAiChatSettingsFoldedToLocal(next);
    applyAiChatSettingsFold(next);
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
    const show = !!isEditMode || document.body.classList.contains('edit-toolbar-vertical');
    editTools.classList.toggle('hidden', !show);
    editTools.classList.toggle('invisible', false);
    editTools.classList.toggle('pointer-events-none', !show);
    if (toolbar) toolbar.classList.toggle('toolbar-view-compact', !show);
}

const EDIT_TOOLBAR_ORIENTATION_KEY = 'mdpro-edit-toolbar-orientation';

function updateVerticalEditToolbarTop() {
    if (!document.body.classList.contains('edit-toolbar-vertical')) return;
    const header = document.querySelector('header.app-header');
    const footer = document.getElementById('app-status-footer');
    const headerBottom = header ? Math.max(8, Math.round(header.getBoundingClientRect().bottom + 8)) : 72;
    const footerTop = footer ? footer.getBoundingClientRect().top : window.innerHeight;
    const bottomSpace = Math.max(10, Math.round(window.innerHeight - footerTop + 8));
    document.documentElement.style.setProperty('--edit-toolbar-vertical-top', headerBottom + 'px');
    document.documentElement.style.setProperty('--edit-toolbar-vertical-bottom', bottomSpace + 'px');
}

function applyEditToolbarOrientation(orientation, persist) {
    const vertical = orientation === 'vertical';
    const btn = document.getElementById('edit-toolbar-orientation-toggle');
    document.body.classList.toggle('edit-toolbar-vertical', vertical);
    applyEditToolsVisibilityByMode();
    if (btn) {
        btn.setAttribute('aria-pressed', String(vertical));
        btn.title = vertical ? '도구막대를 상단 가로형으로 전환' : '도구막대를 오른쪽 세로형으로 전환';
        const verticalIcon = btn.querySelector('.edit-toolbar-icon-vertical');
        const horizontalIcon = btn.querySelector('.edit-toolbar-icon-horizontal');
        if (verticalIcon) verticalIcon.classList.toggle('hidden', vertical);
        if (horizontalIcon) horizontalIcon.classList.toggle('hidden', !vertical);
    }
    if (vertical) updateVerticalEditToolbarTop();
    else {
        document.documentElement.style.removeProperty('--edit-toolbar-vertical-top');
        document.documentElement.style.removeProperty('--edit-toolbar-vertical-bottom');
    }
    if (persist !== false) {
        try { localStorage.setItem(EDIT_TOOLBAR_ORIENTATION_KEY, vertical ? 'vertical' : 'horizontal'); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('md-edit-toolbar-orientation-change', {
        detail: { orientation: vertical ? 'vertical' : 'horizontal' }
    }));
}

function toggleEditToolbarOrientation() {
    const next = document.body.classList.contains('edit-toolbar-vertical') ? 'horizontal' : 'vertical';
    applyEditToolbarOrientation(next, true);
}

function initEditToolbarOrientation() {
    let saved = 'horizontal';
    try { saved = localStorage.getItem(EDIT_TOOLBAR_ORIENTATION_KEY) || 'horizontal'; } catch (_) {}
    applyEditToolbarOrientation(saved === 'vertical' ? 'vertical' : 'horizontal', false);
    window.addEventListener('resize', updateVerticalEditToolbarTop);
}

document.addEventListener('DOMContentLoaded', initEditToolbarOrientation);

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
    const btn = document.getElementById('btn-footnote-quick');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
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
    btn.setAttribute('aria-expanded', String(shouldOpen));
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
    document.dispatchEvent(new CustomEvent('md-viewer-view-mode-text-input-change', {
        detail: { enabled: on }
    }));
    showToast(on
        ? '보기모드 텍스트 입력을 켰습니다. 보기 화면에서 입력할 위치를 클릭하세요.'
        : '보기모드 텍스트 입력을 껐습니다.');
    try { await setAiSettings({ viewModeEditEnabled: on }); } catch (e) {}
}

async function saveImgbbApiKey(key) {
    const value = String(key || '').trim();
    const previous = getProtectedAiCredential('imgbb', 'ss_imgbb_api_key');
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

function getHighlightVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.highlightVisible === true;
}

function getTemplateVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.templateVisible === true;
}

function getTemplateNewFileVisibleFromSettings(settings) {
    if (!settings) return false;
    if (typeof settings.templateNewFileVisible === 'boolean') return settings.templateNewFileVisible;
    return getTemplateVisibleFromSettings(settings);
}

function getNoteCoverInsertVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.noteCoverInsertVisible === true;
}

function getPdfMergeVisibleFromSettings(settings) {
    if (!settings) return false;
    return settings.pdfMergeVisible === true;
}

function getChromeSplitTabVisibleFromSettings(settings) {
    return !!(settings && settings.chromeSplitTabVisible === true);
}

function applyChromeSplitTabVisibility(settings) {
    const enabled = getChromeSplitTabVisibleFromSettings(settings || {});
    const link = document.getElementById('btn-chrome-split-tab');
    if (!link) return;
    link.href = window.location.href;
    link.classList.toggle('hidden', !enabled);
    link.classList.toggle('inline-flex', enabled);
}

async function toggleChromeSplitTabVisibilitySection() {
    const check = document.getElementById('chrome-split-tab-visible');
    const enabled = !!(check && check.checked);
    applyChromeSplitTabVisibility({ chromeSplitTabVisible: enabled });
    try { await setAiSettings({ chromeSplitTabVisible: enabled }); } catch (e) { console.error(e); }
}

function handleChromeSplitTabClick(event) {
    const link = event && event.currentTarget;
    if (link) link.href = window.location.href;
    // Chrome handles a trusted Ctrl+Alt+click on a link as "Open in split view".
    // Keep the plain click on this page so the control never replaces the editor.
    if (event && event.ctrlKey && event.altKey) return true;
    if (event) event.preventDefault();
    showToast('크롬 분할뷰: 이 버튼을 Ctrl+Alt+클릭하거나 우클릭 후 “분할 보기에서 링크 열기”를 선택하세요.');
    return false;
}

function applyPdfMergeVisibility(settings) {
    const enabled = getPdfMergeVisibleFromSettings(settings || {});
    const button = document.getElementById('btn-pdf-merge');
    if (button) button.classList.toggle('hidden', !enabled);
    const previewButton = document.querySelector('#pdf-export-preview [data-pdf-merge]');
    if (previewButton) previewButton.classList.toggle('hidden', !enabled);
    syncHeaderFeatureToolsVisibility();
}

async function togglePdfMergeVisibilitySection() {
    const check = document.getElementById('pdf-merge-visible');
    const enabled = !!(check && check.checked);
    applyPdfMergeVisibility({ pdfMergeVisible: enabled });
    try { await setAiSettings({ pdfMergeVisible: enabled }); } catch (e) { console.error(e); }
}

function applyNoteCoverInsertVisibility(settings) {
    const enabled = getNoteCoverInsertVisibleFromSettings(settings || {});
    const button = document.getElementById('btn-note-cover-insert');
    if (button) button.classList.toggle('hidden', !enabled);
}

async function toggleNoteCoverInsertSection() {
    const check = document.getElementById('note-cover-insert-visible');
    const enabled = !!(check && check.checked);
    applyNoteCoverInsertVisibility({ noteCoverInsertVisible: enabled });
    try { await setAiSettings({ noteCoverInsertVisible: enabled }); } catch (e) { console.error(e); }
}

function insertDefaultNoteCover() {
    if (!isEditMode) toggleMode('edit');
    if (!editorTextarea || !window.NoteCoverRenderer ||
        typeof window.NoteCoverRenderer.insertDefaultCover !== 'function') {
        showToast('표지 삽입 기능을 불러오지 못했습니다.');
        return false;
    }
    const fileTitle = String(currentFileName || '').replace(/\.md$/i, '').trim();
    const title = !fileTitle || /^untitled$/i.test(fileTitle) ? '문서 제목' : fileTitle;
    const updated = window.NoteCoverRenderer.insertDefaultCover(getNoteCoverMarkdownSource(), { title: title });
    if (!updated.changed) {
        editorTextarea.focus();
        editorTextarea.setSelectionRange(updated.selectionStart || 0, updated.selectionEnd || 0);
        editorTextarea.scrollTop = 0;
        showToast('이미 표지가 있어 기존 note-cover 블록을 선택했습니다.');
        return false;
    }
    const applied = applyNoteCoverMarkdownUpdate(updated, 'input.noteCoverInsert', {
        historyKey: 'insert-cover',
        coverIndex: 0,
        selectElementId: 'title',
        renderAfter: true
    });
    if (!applied) return false;
    editorTextarea.focus();
    editorTextarea.setSelectionRange(updated.selectionStart, updated.selectionEnd);
    editorTextarea.scrollTop = 0;
    lastEditCaretPos = updated.selectionEnd;
    showToast('문서 최상단에 표지를 삽입했습니다. 보기에서 텍스트를 직접 수정할 수 있습니다.');
    return true;
}

function getHtml2pptVisibleFromSettings(settings) {
    if (!settings || typeof settings.html2pptVisible !== 'boolean') return false;
    return settings.html2pptVisible;
}

function getHtml2pptNameVisibleFromSettings(settings) {
    return !!(settings && settings.html2pptNameVisible === true);
}

function getDeepseekApiState() {
    let baseUrl = 'https://api.deepseek.com';
    try {
        baseUrl = normalizeDeepseekBaseUrl(localStorage.getItem('ss_deepseek_base_url'));
    } catch (_) {}
    return {
        key: getProtectedAiCredential('deepseek', 'ss_deepseek_api_key'),
        baseUrl: baseUrl,
        maxTokens: Math.max(256, Math.min(384000, Number(localStorage.getItem('ss_deepseek_max_tokens')) || 8192)),
        timeoutSeconds: Math.max(30, Math.min(3600, Number(localStorage.getItem('ss_deepseek_timeout_seconds')) || 300)),
        reasoningEffort: ['low', 'high', 'max'].includes(String(localStorage.getItem('ss_deepseek_reasoning_effort') || '').toLowerCase())
            ? String(localStorage.getItem('ss_deepseek_reasoning_effort')).toLowerCase() : 'high',
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
    if (!settings || typeof settings.fmaViewerVisible !== 'boolean') return false;
    return settings.fmaViewerVisible;
}

function getFmaViewerNameVisibleFromSettings(settings) {
    return !!(settings && settings.fmaViewerNameVisible === true);
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

function syncHeaderFeatureToolsVisibility() {
    const wrap = document.getElementById('header-feature-tools-wrap');
    if (!wrap) return;
    const scholarBtn = document.getElementById('btn-scholar-search');
    const pdfMergeBtn = document.getElementById('btn-pdf-merge');
    const sitesBtn = document.getElementById('btn-sites-panel');
    const templateBtn = document.getElementById('btn-template-panel');
    const scholarEnabled = !!(scholarBtn && !scholarBtn.classList.contains('hidden'));
    const pdfMergeEnabled = !!(pdfMergeBtn && !pdfMergeBtn.classList.contains('hidden'));
    const sitesEnabled = !!(sitesBtn && !sitesBtn.classList.contains('hidden'));
    const templateEnabled = !!(templateBtn && !templateBtn.classList.contains('hidden'));
    if (scholarEnabled || pdfMergeEnabled || sitesEnabled || templateEnabled) {
        wrap.classList.remove('hidden');
        wrap.classList.add('flex');
        wrap.style.display = 'flex';
    } else {
        wrap.classList.add('hidden');
        wrap.classList.remove('flex');
        wrap.style.display = 'none';
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
    const fullscreenBtn = document.getElementById('template-panel-fullscreen-btn');
    const resizer = document.getElementById('template-panel-resizer');
    const preview = document.getElementById('template-preview');
    if (!panel || !body) return;

    if (fullscreenBtn) {
        fullscreenBtn.textContent = templatePanelFullscreen ? '복원' : '전체화면';
        fullscreenBtn.setAttribute('aria-pressed', templatePanelFullscreen ? 'true' : 'false');
        fullscreenBtn.title = templatePanelFullscreen ? '양식 창 크기 복원' : '양식 창 전체화면';
    }

    if (templatePanelFullscreen) {
        panel.style.left = '8px';
        panel.style.top = '8px';
        panel.style.right = '8px';
        panel.style.bottom = '8px';
        panel.style.width = 'auto';
        panel.style.height = 'auto';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = 'none';
        body.classList.remove('hidden');
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.flex = '1 1 auto';
        body.style.minHeight = '0';
        body.style.overflow = 'auto';
        if (preview) {
            preview.style.flex = '1 1 auto';
            preview.style.height = 'auto';
            preview.style.minHeight = '160px';
        }
        if (compactBtn) compactBtn.disabled = true;
        if (resizer) resizer.style.display = 'none';
        return;
    }

    body.style.display = '';
    body.style.flexDirection = '';
    body.style.flex = '';
    body.style.minHeight = '';
    body.style.overflow = '';
    if (preview) {
        preview.style.flex = '';
        preview.style.height = '';
        preview.style.minHeight = '';
    }
    if (compactBtn) compactBtn.disabled = false;

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
    if (templatePanelFullscreen) return;
    templatePanelCompact = !templatePanelCompact;
    applyTemplatePanelMode();
}

function setTemplatePanelFullscreen(enabled) {
    const panel = document.getElementById('template-panel');
    if (!panel) return;
    const next = !!enabled;
    if (next === templatePanelFullscreen) {
        applyTemplatePanelMode();
        return;
    }

    if (next) {
        templatePanelRestoreState = {
            left: panel.style.left,
            top: panel.style.top,
            right: panel.style.right,
            bottom: panel.style.bottom,
            width: panel.style.width,
            height: panel.style.height,
            maxWidth: panel.style.maxWidth,
            maxHeight: panel.style.maxHeight
        };
    }

    templatePanelFullscreen = next;
    if (!next && templatePanelRestoreState) {
        panel.style.left = templatePanelRestoreState.left;
        panel.style.top = templatePanelRestoreState.top;
        panel.style.right = templatePanelRestoreState.right;
        panel.style.bottom = templatePanelRestoreState.bottom;
        panel.style.width = templatePanelRestoreState.width;
        panel.style.height = templatePanelRestoreState.height;
        panel.style.maxWidth = templatePanelRestoreState.maxWidth;
        panel.style.maxHeight = templatePanelRestoreState.maxHeight;
        templatePanelRestoreState = null;
    }
    applyTemplatePanelMode();
}

function toggleTemplatePanelFullscreen() {
    setTemplatePanelFullscreen(!templatePanelFullscreen);
}

function bindTemplatePanelDrag() {
    if (templatePanelDragBound) return;
    templatePanelDragBound = true;
    const panel = document.getElementById('template-panel');
    const header = document.getElementById('template-panel-header');
    if (!panel || !header) return;
    enableTouchModalDrag(panel, header, {
        canStart: function () { return !templatePanelCompact && !templatePanelResizing && !templatePanelFullscreen; },
        onStart: function () {
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        },
        onMove: function () { templatePanelMoved = true; }
    });

    header.addEventListener('mousedown', function (e) {
        if (templatePanelResizing || templatePanelFullscreen) return;
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
        if (!templatePanelDragging || templatePanelCompact || templatePanelFullscreen) return;
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
        if (templatePanelCompact || templatePanelFullscreen) return;
        e.preventDefault();
        e.stopPropagation();
        templatePanelResizing = true;
    });
    document.addEventListener('mousemove', function (e) {
        if (!templatePanelResizing || templatePanelCompact || templatePanelFullscreen) return;
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
    const headerEnabled = getTemplateVisibleFromSettings(settings || {});
    const newFileEnabled = getTemplateNewFileVisibleFromSettings(settings || {});
    const menuItem = document.getElementById('new-template-menu-item');
    const menuToggle = document.getElementById('new-file-menu-toggle');
    const newFileButton = document.getElementById('header-new-file-button');
    const headerButton = document.getElementById('btn-template-panel');
    if (menuItem) {
        menuItem.classList.toggle('hidden', !newFileEnabled);
        menuItem.classList.toggle('flex', newFileEnabled);
    }
    if (menuToggle) {
        menuToggle.classList.toggle('hidden', !newFileEnabled);
        menuToggle.classList.toggle('flex', newFileEnabled);
    }
    if (newFileButton) {
        newFileButton.classList.toggle('rounded-md', !newFileEnabled);
        newFileButton.classList.toggle('rounded-l-md', newFileEnabled);
    }
    if (headerButton) headerButton.classList.toggle('hidden', !headerEnabled);
    syncHeaderFeatureToolsVisibility();
    if (!newFileEnabled) setNewFileMenuVisible(false);
    if (!headerEnabled && !newFileEnabled) {
        closeTemplatePanel();
    }
}

function openTemplatePanel(startTop) {
    const panel = document.getElementById('template-panel');
    if (!panel) return;
    bindTemplatePanelDrag();
    bindTemplatePanelResize();
    applyTemplatePanelMode();
    if (Number.isFinite(startTop) && !templatePanelFullscreen && !templatePanelCompact) {
        panel.style.top = Math.max(8, Math.round(startTop)) + 'px';
        panel.style.bottom = 'auto';
    }
    renderTemplatePanel();
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    templatePanelOpen = true;
}

function closeTemplatePanel() {
    const panel = document.getElementById('template-panel');
    if (!panel) return;
    if (templatePanelFullscreen) setTemplatePanelFullscreen(false);
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
    const newFileCheck = document.getElementById('template-new-file-visible');
    const newFileEnabled = !!(newFileCheck && newFileCheck.checked);
    applyTemplateVisibility({ templateVisible: enabled, templateNewFileVisible: newFileEnabled });
    try { await setAiSettings({ templateVisible: enabled }); } catch (e) { console.error(e); }
}

async function toggleTemplateNewFileSection() {
    const check = document.getElementById('template-new-file-visible');
    const enabled = !!(check && check.checked);
    const headerCheck = document.getElementById('template-visible');
    const headerEnabled = !!(headerCheck && headerCheck.checked);
    applyTemplateVisibility({ templateVisible: headerEnabled, templateNewFileVisible: enabled });
    try { await setAiSettings({ templateNewFileVisible: enabled }); } catch (e) { console.error(e); }
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
    ensureLazyFrameLoaded('html2ppt-frame');
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
    const nameVisible = getHtml2pptNameVisibleFromSettings(settings || {});
    const btn = document.getElementById('btn-html2ppt-panel');
    if (btn) btn.classList.toggle('hidden', !enabled);
    const name = document.getElementById('btn-html2ppt-name');
    if (name) name.classList.toggle('hidden', !nameVisible);
    if (!enabled) closeHtml2pptPanel();
}

async function toggleHtml2pptSection() {
    const check = document.getElementById('html2ppt-visible');
    const nameCheck = document.getElementById('html2ppt-name-visible');
    const enabled = !!(check && check.checked);
    const nameVisible = !!(nameCheck && nameCheck.checked);
    const nextSettings = { html2pptVisible: enabled, html2pptNameVisible: nameVisible };
    applyHtml2pptVisibility(nextSettings);
    try { await setAiSettings(nextSettings); } catch (e) { console.error(e); }
}

function applyFmaViewerVisibility(settings) {
    const enabled = getFmaViewerVisibleFromSettings(settings || {});
    const nameVisible = getFmaViewerNameVisibleFromSettings(settings || {});
    fmaViewerFeatureEnabled = enabled;
    const btn = document.getElementById('btn-fma-viewer');
    if (btn) {
        btn.classList.toggle('hidden', !enabled);
        btn.classList.toggle('flex', enabled);
    }
    const name = document.getElementById('btn-fma-viewer-name');
    if (name) name.classList.toggle('hidden', !nameVisible);
    const menuItems = [
        document.getElementById('open-image-folder-menu-item'),
        document.getElementById('open-fma-viewer-menu-item')
    ];
    menuItems.forEach(function (item) {
        if (!item) return;
        item.classList.toggle('hidden', !enabled);
        item.classList.toggle('flex', enabled);
    });
}

async function toggleFmaViewerSection() {
    const check = document.getElementById('fma-viewer-visible');
    const nameCheck = document.getElementById('fma-viewer-name-visible');
    const enabled = !!(check && check.checked);
    const nameVisible = !!(nameCheck && nameCheck.checked);
    const nextSettings = { fmaViewerVisible: enabled, fmaViewerNameVisible: nameVisible };
    applyFmaViewerVisibility(nextSettings);
    try { await setAiSettings(nextSettings); } catch (e) { console.error(e); }
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

function openHighlightPopup() {
    const modal = document.getElementById('highlight-popup-modal');
    if (!modal) return;
    ensureLazyFrameLoaded('highlight-popup-frame');
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
    if (imgBtn) imgBtn.style.display = 'inline-flex';
    const imageUploadBtn = document.getElementById('btn-image-upload-quick');
    if (imageUploadBtn) imageUploadBtn.classList.toggle('hidden', !enabled);
    const section = document.getElementById('image-upload-settings');
    const check = document.getElementById('image-upload-enabled');
    if (section && check) section.classList.toggle('hidden', !check.checked);
    setInputModalImagePanelToggleState();
}

function closeImageInsertQuickMenu() {
    const panel = document.getElementById('image-insert-quick-panel');
    const btn = document.getElementById('btn-image-insert');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleImageInsertQuickMenu(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('image-insert-quick-panel');
    const btn = document.getElementById('btn-image-insert');
    if (!panel || !btn) return;
    const shouldOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    btn.setAttribute('aria-expanded', String(shouldOpen));
}

function openImageLinkFromQuickMenu(event) {
    if (event) event.stopPropagation();
    closeImageInsertQuickMenu();
    openLinkModal('image');
}

function openLinkFromQuickMenu(event) {
    if (event) event.stopPropagation();
    closeImageInsertQuickMenu();
    openLinkModal('link');
}

function openImagePanelFromQuickMenu(event) {
    if (event) event.stopPropagation();
    closeImageInsertQuickMenu();
    openImageInsertModal();
}

document.addEventListener('click', function (event) {
    const wrap = document.getElementById('image-insert-menu-wrap');
    if (wrap && !wrap.contains(event.target)) closeImageInsertQuickMenu();
});
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeImageInsertQuickMenu();
});

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

function applyAiAuthenticationControlsVisibility(authenticated) {
    const controls = document.getElementById('ai-authentication-controls');
    if (!controls) return;
    const hidden = !AI_AUTHENTICATION_REQUIRED || authenticated === true;
    controls.classList.toggle('hidden', hidden);
    controls.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function isAiAccessVerified(settings) {
    return !AI_AUTHENTICATION_REQUIRED || !!(settings && settings.verified);
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
        getAiSettings().then(s => {
            const verified = isAiAccessVerified(s);
            applyAiAuthenticationControlsVisibility(verified);
            updateAiScholarSspimgAvailability(verified);
        });
        requestAnimationFrame(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const pwd = document.getElementById('ai-password-input');
            if (pwd) pwd.focus();
        });
    }
    if (check && !check.checked) {
        updateAiScholarSspimgAvailability(false);
        getAiSettings().then(s => applyAiAuthenticationControlsVisibility(isAiAccessVerified(s)));
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
    applyAiAuthenticationControlsVisibility(true);
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
    if (!isAiAccessVerified(settings)) return;
    await applyAiFeatureVisibility();
}

async function persistAiSettingsFromModal() {
    await saveGoogleCalendarOptions(false);
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
    const viewPaddingValue = applyViewPadding(document.getElementById('view-padding-size')?.value);
    localStorage.setItem(VIEW_PADDING_KEY, String(viewPaddingValue));
    applyEditToolsVisibilityByMode();
    saveScholarAIProviderSettingsFromUI(false);
    if (!db) return;
    const s = await getAiSettings();
    const shareAddressSettings = getShareAddressSettingsSnapshot(s || {});
    const verified = isAiAccessVerified(s);
    const scholarEl = document.getElementById('ai-scholar-enabled');
    const sspimgEl = document.getElementById('ai-sspimg-enabled');
    const githubEl = document.getElementById('ai-github-enabled');
    const localStorageEl = document.getElementById('local-storage-enabled');
    const inDbStorageEl = document.getElementById('indb-storage-enabled');
    const scholarOn = verified && scholarEl && scholarEl.checked;
    const sspimgOn = verified && sspimgEl && sspimgEl.checked;
    const imageUploadEl = document.getElementById('image-upload-enabled');
    const imageUploadEnabled = !!(imageUploadEl && imageUploadEl.checked);
    const scholarSearchVisible = !!(window.ScholarSearchApp &&
        typeof window.ScholarSearchApp.isVisibleSelected === 'function' &&
        window.ScholarSearchApp.isVisibleSelected());
    const highlightVisibleEl = document.getElementById('highlight-visible');
    const highlightVisible = !!(highlightVisibleEl && highlightVisibleEl.checked);
    const sitesVisibleEl = document.getElementById('sites-visible');
    const sitesVisible = !!(sitesVisibleEl && sitesVisibleEl.checked);
    const macroVisibleEl = document.getElementById('macro-visible');
    const macroVisible = !!(macroVisibleEl && macroVisibleEl.checked);
    const templateVisibleEl = document.getElementById('template-visible');
    const templateVisible = !!(templateVisibleEl && templateVisibleEl.checked);
    const templateNewFileVisibleEl = document.getElementById('template-new-file-visible');
    const templateNewFileVisible = !!(templateNewFileVisibleEl && templateNewFileVisibleEl.checked);
    const noteCoverInsertVisibleEl = document.getElementById('note-cover-insert-visible');
    const noteCoverInsertVisible = !!(noteCoverInsertVisibleEl && noteCoverInsertVisibleEl.checked);
    const pdfMergeVisibleEl = document.getElementById('pdf-merge-visible');
    const pdfMergeVisible = !!(pdfMergeVisibleEl && pdfMergeVisibleEl.checked);
    const chromeSplitTabVisibleEl = document.getElementById('chrome-split-tab-visible');
    const chromeSplitTabVisible = !!(chromeSplitTabVisibleEl && chromeSplitTabVisibleEl.checked);
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
        indbEnabled: !(inDbStorageEl && inDbStorageEl.checked === false),
        localEnabled: !!(localStorageEl && localStorageEl.checked),
        githubToken: githubToken,
        githubRepo: githubRepo,
        githubBranch: githubBranch,
        githubDefaultPushPath: githubDefaultPushPath,
        scholarSearchVisible: scholarSearchVisible,
        highlightVisible: highlightVisible,
        sitesVisible: sitesVisible,
        macroVisible: macroVisible,
        templateVisible: templateVisible,
        templateNewFileVisible: templateNewFileVisible,
        noteCoverInsertVisible: noteCoverInsertVisible,
        pdfMergeVisible: pdfMergeVisible,
        chromeSplitTabVisible: chromeSplitTabVisible,
        templateCustomList: normalizeTemplateCustomList(templateCustomList).map(function (item) {
            return { id: item.id, name: item.name, desc: item.desc, content: item.content };
        }),
        sitesList: sitesList.slice(),
        shareSites: shareAddressSettings.shareSites,
        customShareDestinations: shareAddressSettings.customShareDestinations,
        naverBlogId: shareAddressSettings.naverBlogId,
        imageUploadEnabled: imageUploadEnabled,
        enterButtonInsertBr: enterButtonInsertBrEnabled,
        selectionWrapEnabled: selectionWrapEnabledValue,
        viewModeEditEnabled: viewModeEditEnabledValue,
        viewPadding: viewPaddingValue,
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
    VIEW_PADDING_KEY,
    SETTINGS_SHORTCUTS_FOLD_KEY,
    SETTINGS_CONTAINER_FOLD_STATE_KEY,
    FILE_DOWNLOAD_PREFIX_KEY,
    MAIN_HEADER_BACKGROUND_REMOVED_KEY,
    AI_USE_FOLD_KEY,
    AI_CHAT_SETTINGS_FOLD_KEY,
    SCHOLAR_LM_SETTINGS_FOLD_KEY,
    SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY,
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
    GOOGLE_CALENDAR_OPEN_MODE_KEY,
    GOOGLE_CALENDAR_EMAIL_KEY,
    MERMAID_DISPLAY_MODE_KEY,
    EDITOR_COMMENT_LIGHT_COLOR_KEY,
    EDITOR_COMMENT_DARK_COLOR_KEY,
    'mdpro_storage_sidebar_visibility_v1',
    'mdpro_storage_sidebar_auto_revealed_v1',
    'md_viewer_indb_enabled',
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
    'ss_litertlm_settings_v1',
    'ss_litertlm_settings_folded',
    'ss_viewer_scholar_ai_ui_font_size',
    'ss_ai_chat_enabled',
    'ss_ai_chat_menu_enabled',
    'ss_ai_chat_provider',
    'ss_ai_chat_gemini_model',
    'ss_ai_chat_writing_style',
    'ss_ai_chat_gemini_models_v1',
    'ss_scholar_ai_openai_model',
    'ss_scholar_ai_openai_models_v1',
    'ss_ai_chat_openai_model',
    'ss_ai_chat_openai_models_v1',
    'ss_ai_chat_response_mode',
    'ss_ai_chat_layout'
];

// AI options are added in several independently loaded modules. Keep the
// settings backup forward-compatible without turning it into a chat/history
// backup (those records can be large and have their own persistence path).
const SETTINGS_EXPORT_AI_LOCAL_KEY_PREFIXES = [
    'ss_ai_',
    'ss_scholar_ai_',
    'ss_viewer_scholar_ai_',
    'ss_openai_',
    'ss_deepseek_',
    'ss_gemini_',
    'ss_image_',
    'ss_litertlm_',
    'ss_ollama_',
    'local_ai_',
    'mdpro_ai_'
];

const SETTINGS_EXPORT_AI_LOCAL_KEY_EXCLUDES = [
    /(?:^|_)history(?:_|$)/,
    /(?:^|_)current_conversation_id$/,
    /(?:^|_)idb_migrated(?:_|$)/,
    /(?:^|_)payload(?:_|$)/
];

function isSettingsExportLocalKey(key) {
    const safeKey = String(key || '');
    if (SETTINGS_EXPORT_LOCAL_KEYS.indexOf(safeKey) >= 0) return true;
    if (!SETTINGS_EXPORT_AI_LOCAL_KEY_PREFIXES.some(function (prefix) { return safeKey.indexOf(prefix) === 0; })) {
        return false;
    }
    return !SETTINGS_EXPORT_AI_LOCAL_KEY_EXCLUDES.some(function (pattern) { return pattern.test(safeKey); });
}

function getSettingsExportLocalKeys() {
    const keys = SETTINGS_EXPORT_LOCAL_KEYS.slice();
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (isSettingsExportLocalKey(key) && keys.indexOf(key) < 0) keys.push(key);
    }
    return keys;
}

function buildSettingsExportPayload(aiSettings) {
    const local = {};
    getSettingsExportLocalKeys().forEach(function (k) {
        const v = localStorage.getItem(k);
        if (v != null) local[k] = v;
    });
    return {
        format: 'md_viewer_settings',
        version: 2,
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
        downloadTextFile(getFileDownloadPrefixFromLocal() + '_settings_' + date + '.mset', text, 'application/json;charset=utf-8');
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

    Object.keys(local).forEach(function (k) {
        if (isSettingsExportLocalKey(k)) {
            const v = local[k];
            if (v == null) localStorage.removeItem(k);
            else localStorage.setItem(k, String(v));
        }
    });

    if (typeof loadAiSettingsToUI === 'function') await loadAiSettingsToUI();
    if (window.AIChat && typeof window.AIChat.syncSettings === 'function') window.AIChat.syncSettings();
    if (typeof initAiVisibility === 'function') await initAiVisibility();
    if (typeof window.syncInDbStorageSettingsUi === 'function') window.syncInDbStorageSettingsUi();
    if (typeof applyCodeColorSettings === 'function') applyCodeColorSettings();
    loadMarkdownCommentColorSettings();
    if (typeof applyTheme === 'function') applyTheme();
    syncMermaidDisplayModeUI();
    await refreshMermaidDisplay();
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

const SETTINGS_RESET_EXTRA_LOCAL_KEYS = [
    AI_SETTINGS_FALLBACK_KEY,
    'ss_gemini_api_key',
    'ss_gemini_api_key_verified',
    'ss_deepseek_api_key',
    'ss_deepseek_api_key_verified',
    'ss_deepseek_base_url',
    'ss_deepseek_balance_available',
    'ss_deepseek_balance_summary',
    'ss_openai_api_key',
    'ss_openai_api_key_verified',
    'ss_openai_compatible_provider',
    'ss_openai_compatible_base_url',
    'ss_openai_compatible_api_key',
    'ss_openai_compatible_model_id',
    'ss_imgbb_api_key_verified'
];

function deleteAiSettingsRecord() {
    if (!db || !db.objectStoreNames.contains('ai_settings')) return Promise.resolve();
    return new Promise(function (resolve, reject) {
        try {
            const tx = db.transaction('ai_settings', 'readwrite');
            tx.objectStore('ai_settings').delete(AI_SETTINGS_KEY);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error || new Error('설정 초기화 트랜잭션 실패')); };
            tx.onabort = function () { reject(tx.error || new Error('설정 초기화 트랜잭션 중단')); };
        } catch (error) {
            reject(error);
        }
    });
}

async function resetSettingsMset() {
    const confirmed = window.confirm(
        '환경설정을 기본값으로 초기화하시겠습니까?\n\n초기화한 설정은 되돌릴 수 없습니다.\n문서, 이미지, 자동저장 데이터는 삭제되지 않습니다.'
    );
    if (!confirmed) return;

    try {
        await deleteAiSettingsRecord();
        SETTINGS_EXPORT_LOCAL_KEYS.concat(SETTINGS_RESET_EXTRA_LOCAL_KEYS).forEach(function (key) {
            localStorage.removeItem(key);
        });

        setMainHeaderBackgroundRemoved(false, false);

        editorHorizontalShiftPx = 0;
        applyEditorHorizontalShift();
        miniPreviewEnabled = false;
        if (typeof applyMiniPreviewVisibility === 'function') applyMiniPreviewVisibility();
        initTheme();
        applyEditorLightPreference();
        syncMermaidDisplayModeUI();
        refreshMermaidDisplay();
        const codeBgInput = document.getElementById('code-bg-color');
        const codeTextInput = document.getElementById('code-text-color');
        if (codeBgInput) codeBgInput.value = '#1e293b';
        if (codeTextInput) codeTextInput.value = '#f8fafc';
        document.documentElement.style.setProperty('--code-bg-color', '#1e293b');
        document.documentElement.style.setProperty('--code-text-color', '#f8fafc');
        loadMarkdownCommentColorSettings();
        applySettingsShortcutsFold(getSettingsShortcutsFoldedFromLocal());
        syncFileDownloadPrefixSettingUI();

        ['ai-api-key', 'deepseek-api-key', 'openai-api-key', 'openai-compatible-api-key', 'ai-imgbb-api-key', 'ai-password-input'].forEach(function (id) {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        const aiUseCheck = document.getElementById('ai-use-checkbox');
        if (aiUseCheck) aiUseCheck.checked = false;
        const aiPasswordSection = document.getElementById('ai-password-section');
        if (aiPasswordSection) aiPasswordSection.classList.add('hidden');

        await loadAiSettingsToUI();
        await initAiVisibility();
        if (typeof window.syncInDbStorageSettingsUi === 'function') window.syncInDbStorageSettingsUi();
        showToast('환경설정을 기본값으로 초기화했습니다.');
    } catch (error) {
        console.error('Failed to reset settings:', error);
        showToast('환경설정 초기화에 실패했습니다.');
    }
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
    const verified = isAiAccessVerified(settings);
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
    const btnJenaMenu = document.getElementById('btn-ai-jena-menu');
    const jenaMenuOn = localStorage.getItem('ss_ai_chat_menu_enabled') === '1';
    const showAiOrJenaMenu = showAi || jenaMenuOn;
    if (headerBtns) {
        if (showAiOrJenaMenu) {
            headerBtns.classList.remove('hidden');
            headerBtns.classList.add('flex');
            headerBtns.style.display = 'flex';
            if (btnScholar) {
                btnScholar.classList.toggle('hidden', !(showAi && scholarOn));
                btnScholar.style.display = showAi && scholarOn ? '' : 'none';
            }
            if (btnSsp) {
                btnSsp.classList.toggle('hidden', !(showAi && sspimgOn));
                btnSsp.style.display = showAi && sspimgOn ? '' : 'none';
            }
            if (btnJenaMenu) {
                btnJenaMenu.classList.toggle('hidden', !jenaMenuOn);
                btnJenaMenu.style.display = jenaMenuOn ? 'inline-flex' : 'none';
            }
        } else {
            headerBtns.classList.add('hidden');
            headerBtns.style.display = 'none';
            if (btnScholar) btnScholar.style.display = '';
            if (btnSsp) btnSsp.style.display = '';
            if (btnJenaMenu) btnJenaMenu.style.display = 'none';
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
    if (window.ScholarSearchApp) window.ScholarSearchApp.applyVisibility(settings || { scholarSearchVisible: false });
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
    function vis(btn) {
        return btn && btn.style.display !== 'none' && !btn.classList.contains('hidden');
    }
    if (vis(bSch)) {
        bSch.classList.add('header-quick-tool');
        bSch.classList.toggle('header-quick-tool-active', !!schOn);
        bSch.setAttribute('aria-pressed', schOn ? 'true' : 'false');
    }
    if (vis(bSsp)) {
        bSsp.classList.add('header-quick-tool');
        bSsp.classList.toggle('header-quick-tool-active', !!sspOn);
        bSsp.setAttribute('aria-pressed', sspOn ? 'true' : 'false');
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
        if (!isAiAccessVerified(s)) {
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
        if (!isAiAccessVerified(s)) {
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
        if (!isAiAccessVerified(s)) {
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

function notifyAiToolSettingsChanged() {
    if (window.MDPCredentialVault && typeof window.MDPCredentialVault.notifySettingsChanged === 'function') {
        window.MDPCredentialVault.notifySettingsChanged();
    }
}
window.notifyAiToolSettingsChanged = notifyAiToolSettingsChanged;

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
        fastMaxTokens: Number(value('settings-aichat-fast-max-tokens') || 3000),
        fastTimeoutMs: Number(value('settings-aichat-fast-timeout') || 120) * 1000,
        fastSafetyTimeout: !!(document.getElementById('settings-aichat-fast-safety-timeout') && document.getElementById('settings-aichat-fast-safety-timeout').checked),
        fastCompleteStreaming: !!(document.getElementById('settings-aichat-fast-complete-streaming') && document.getElementById('settings-aichat-fast-complete-streaming').checked),
        reasoningLevel: value('settings-aichat-reasoning-level') || 'auto',
        timeoutMs: Number(value('settings-lmstudio-timeout') || 90) * 1000,
        topP: value('settings-lmstudio-top-p') === '' ? null : Number(value('settings-lmstudio-top-p'))
    };
}

function syncAiJenaFastLimitsInSettings(config) {
    const source = config || {};
    const tokenInput = document.getElementById('settings-ai-jena-fast-token-limit');
    const timeInput = document.getElementById('settings-ai-jena-fast-time-limit');
    if (tokenInput) tokenInput.value = Math.max(1, Number(source.fastMaxTokens) || 3000);
    if (timeInput) timeInput.value = Math.max(1, Math.round((Number(source.fastTimeoutMs) || 120000) / 1000));
}

function saveAiJenaFastLimitsFromSettings() {
    if (!window.LocalAI) return;
    const tokenInput = document.getElementById('settings-ai-jena-fast-token-limit');
    const timeInput = document.getElementById('settings-ai-jena-fast-time-limit');
    const fastMaxTokens = Math.max(1, Math.round(Number(tokenInput && tokenInput.value) || 3000));
    const fastTimeoutSeconds = Math.max(1, Math.round(Number(timeInput && timeInput.value) || 120));
    try {
        const current = window.LocalAI.loadConfig(localStorage);
        const config = getScholarAIProviderRuntime().saveLMStudioConfig(Object.assign({}, current, {
            fastMaxTokens: fastMaxTokens,
            fastTimeoutMs: fastTimeoutSeconds * 1000
        }));
        syncAiJenaFastLimitsInSettings(config);
        const lmTokenInput = document.getElementById('settings-aichat-fast-max-tokens');
        const lmTimeInput = document.getElementById('settings-aichat-fast-timeout');
        if (lmTokenInput) lmTokenInput.value = fastMaxTokens;
        if (lmTimeInput) lmTimeInput.value = fastTimeoutSeconds;
        if (window.AIChat && typeof window.AIChat.syncFastLimits === 'function') window.AIChat.syncFastLimits();
        notifyAiToolSettingsChanged();
        setSettingsScholarAIStatus('AI Jena FAST 설정을 저장했습니다.', false);
    } catch (error) {
        setSettingsScholarAIStatus('FAST 설정 저장 실패: ' + (error && error.message ? error.message : error), true);
    }
}
window.saveAiJenaFastLimitsFromSettings = saveAiJenaFastLimitsFromSettings;

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
    setValue('settings-aichat-fast-max-tokens', config.fastMaxTokens || 3000);
    setValue('settings-aichat-fast-timeout', Math.max(1, Math.round((config.fastTimeoutMs || 120000) / 1000)));
    syncAiJenaFastLimitsInSettings(config);
    const fastSafetyTimeout = document.getElementById('settings-aichat-fast-safety-timeout');
    if (fastSafetyTimeout) fastSafetyTimeout.checked = config.fastSafetyTimeout !== false;
    const fastCompleteStreaming = document.getElementById('settings-aichat-fast-complete-streaming');
    if (fastCompleteStreaming) fastCompleteStreaming.checked = config.fastCompleteStreaming !== false;
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
        notifyAiToolSettingsChanged();
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
    const key = getProtectedAiCredential('gemini', 'ss_gemini_api_key');
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
    const key = String(apiKeyOverride || getProtectedAiCredential('gemini', 'ss_gemini_api_key') || '');
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
        },
        callOpenAI: function (prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride) {
            return callOpenAIText(prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride);
        }
    });
    return scholarAIProviderRuntime;
}

let aiChatAbortController = null;
const AI_CHAT_GEMINI_MODELS_KEY = 'ss_ai_chat_gemini_models_v1';
const aiChatGeminiModelLimits = Object.create(null);
const AI_CHAT_DEEPSEEK_MODELS_KEY = 'ss_ai_chat_deepseek_models_v1';
const AI_CHAT_OPENAI_MODELS_KEY = 'ss_ai_chat_openai_models_v1';
const OLLAMA_MODELS_KEY = 'ss_ollama_models_v1';
const aiChatOllamaContextLengths = Object.create(null);
const OLLAMA_BASE_URL_KEY = 'ss_ollama_base_url';
const LITERTLM_SETTINGS_KEY = 'ss_litertlm_settings_v1';
const LITERTLM_BASE_URL_DEFAULT_MIGRATION_KEY = 'ss_litertlm_base_url_default_v1';
const LITERTLM_MODELS_KEY = 'ss_litertlm_models_v1';
const LITERTLM_CLOUD_BASE_URL = 'https://llm1.abci.co.kr/v1';
const LITERTLM_LEGACY_MODEL = 'gemma-4-E2B-it.litertlm';
const LITERTLM_MIGRATED_MODEL = 'gemma-4-E4B';
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
const AI_CHAT_OPENAI_DEFAULT_MODELS = [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna'
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

function mergeAIChatOpenAIModels(models) {
    const available = Array.from(new Set((Array.isArray(models) ? models : []).map(String).filter(Boolean)));
    if (!available.length) return AI_CHAT_OPENAI_DEFAULT_MODELS.slice();
    const preferred = AI_CHAT_OPENAI_DEFAULT_MODELS.filter(function (model) { return available.indexOf(model) >= 0; });
    return preferred.concat(available.filter(function (model) { return preferred.indexOf(model) < 0; }));
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

function getLiteRTLMSettings() {
    const defaults = { mode: 'cloud', cloudName: 'cloud', cloudUrl: LITERTLM_CLOUD_BASE_URL, model: '', contextLength: 4096, maxGen: 2048, sampler: 'greedy', temperature: 0.3, topP: 0.9, topK: 40, thinking: true, streaming: true, renderIntervalMs: 100 };
    try {
        const settings = Object.assign({}, defaults, JSON.parse(localStorage.getItem(LITERTLM_SETTINGS_KEY) || '{}'));
        settings.mode = 'cloud';
        settings.cloudName = String(settings.cloudName || '').trim() || 'cloud';
        settings.cloudUrl = LITERTLM_CLOUD_BASE_URL;
        delete settings.localUrl;
        delete settings.localName;
        if (String(settings.model || '').trim() === LITERTLM_LEGACY_MODEL) {
            settings.model = LITERTLM_MIGRATED_MODEL;
        }
        if (localStorage.getItem(LITERTLM_BASE_URL_DEFAULT_MIGRATION_KEY) !== '1'
            || localStorage.getItem(LITERTLM_SETTINGS_KEY) !== JSON.stringify(settings)) {
            localStorage.setItem(LITERTLM_SETTINGS_KEY, JSON.stringify(settings));
            localStorage.setItem(LITERTLM_BASE_URL_DEFAULT_MIGRATION_KEY, '1');
        }
        return settings;
    } catch (_) {
        localStorage.setItem(LITERTLM_SETTINGS_KEY, JSON.stringify(defaults));
        localStorage.setItem(LITERTLM_BASE_URL_DEFAULT_MIGRATION_KEY, '1');
        return defaults;
    }
}

function ensureLiteRTLMUrlPrefix(input) {
    if (!input) return;
    const value = String(input.value || '').trim();
    if (!value) input.value = 'https://';
    else if (!/^https?:\/\//i.test(value)) input.value = 'https://' + value.replace(/^\/+/, '');
}

function normalizeLiteRTLMBaseUrl(value) {
    let parsed;
    try { parsed = new URL(String(value || '').trim()); } catch (_) { throw new Error('LiteRT-LM URL 형식이 올바르지 않습니다.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('LiteRT-LM URL은 http:// 또는 https:// 주소여야 합니다.');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '').replace(/\/models$/i, '').replace(/\/chat\/completions$/i, '').replace(/\/+$/, '');
}

function updateLiteRTLMSettingsModeUI() {
    const cloudUrl = document.getElementById('settings-litertlm-cloud-url');
    if (cloudUrl) cloudUrl.value = LITERTLM_CLOUD_BASE_URL;
}

function setLiteRTLMSettingsFolded(folded) {
    const body = document.getElementById('litertlm-settings-body');
    const button = document.getElementById('litertlm-settings-fold-btn');
    if (body) body.classList.toggle('hidden', !!folded);
    if (button) {
        button.textContent = folded ? '펼치기' : '접기';
        button.setAttribute('aria-expanded', folded ? 'false' : 'true');
    }
    localStorage.setItem('ss_litertlm_settings_folded', folded ? '1' : '0');
}

function toggleLiteRTLMSettingsFold() {
    const body = document.getElementById('litertlm-settings-body');
    setLiteRTLMSettingsFolded(!(body && body.classList.contains('hidden')));
}

function loadLiteRTLMSettingsToUI() {
    const settings = getLiteRTLMSettings();
    const values = {
        'settings-litertlm-cloud-name': settings.cloudName,
        'settings-litertlm-cloud-url': settings.cloudUrl,
        'settings-litertlm-context-length': settings.contextLength,
        'settings-litertlm-max-gen': settings.maxGen,
        'settings-litertlm-sampler': settings.sampler,
        'settings-litertlm-temperature': settings.temperature,
        'settings-litertlm-top-p': settings.topP,
        'settings-litertlm-top-k': settings.topK,
        'settings-litertlm-render-interval': settings.renderIntervalMs
    };
    Object.keys(values).forEach(function (id) { const el = document.getElementById(id); if (el) el.value = values[id]; });
    const thinking = document.getElementById('settings-litertlm-thinking');
    if (thinking) thinking.checked = settings.thinking !== false;
    const streaming = document.getElementById('settings-litertlm-streaming');
    if (streaming) streaming.checked = settings.streaming !== false;
    const model = document.getElementById('settings-litertlm-model');
    if (model && settings.model && !Array.from(model.options).some(function (option) { return option.value === settings.model; })) model.add(new Option(settings.model, settings.model));
    if (model) model.value = settings.model;
    updateLiteRTLMSettingsModeUI();
    // No saved preference means collapsed. Users who explicitly expand it keep
    // that choice through the stored "0" value.
    setLiteRTLMSettingsFolded(localStorage.getItem('ss_litertlm_settings_folded') !== '0');
}

async function saveLiteRTLMSettings(showStatus) {
    const read = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const thinking = document.getElementById('settings-litertlm-thinking');
    const streaming = document.getElementById('settings-litertlm-streaming');
    const mode = 'cloud';
    const settings = {
        mode: mode, cloudName: read('settings-litertlm-cloud-name') || 'cloud', cloudUrl: LITERTLM_CLOUD_BASE_URL,
        model: read('settings-litertlm-model'), contextLength: Math.max(1, Number(read('settings-litertlm-context-length')) || 4096),
        maxGen: Math.max(1, Number(read('settings-litertlm-max-gen')) || 2048), sampler: read('settings-litertlm-sampler') || 'greedy',
        temperature: Math.max(0, Number(read('settings-litertlm-temperature')) || 0), topP: Math.min(1, Math.max(0, Number(read('settings-litertlm-top-p')) || 0)),
        topK: Math.max(1, Number(read('settings-litertlm-top-k')) || 40), thinking: !thinking || thinking.checked,
        streaming: !streaming || streaming.checked,
        renderIntervalMs: Math.max(50, Math.min(500, Number(read('settings-litertlm-render-interval')) || 100))
    };
    const activeUrl = settings.cloudUrl;
    if (!activeUrl) throw new Error('Cloud Base URL이 설정되지 않았습니다.');
    normalizeLiteRTLMBaseUrl(activeUrl);
    localStorage.setItem(LITERTLM_SETTINGS_KEY, JSON.stringify(settings));
    if (showStatus) {
        const status = document.getElementById('settings-litertlm-status');
        if (status) status.textContent = '설정을 저장했습니다. LiteRT-LM에 연결하는 중...';
        try {
            const models = await loadSettingsLiteRTLMModels();
            if (window.AIChat && typeof window.AIChat.syncSettings === 'function') window.AIChat.syncSettings();
            showToast('LiteRT-LM 연결 완료 · 모델 ' + models.length + '개');
        } catch (_) {
            showToast('설정은 저장했지만 LiteRT-LM 연결에 실패했습니다.', 'error');
        }
    }
    return settings;
}

function applyLiteRTLMMobilePreset() {
    const values = { 'settings-litertlm-context-length': 2048, 'settings-litertlm-max-gen': 512, 'settings-litertlm-render-interval': 100 };
    Object.keys(values).forEach(function (id) { const input = document.getElementById(id); if (input) input.value = values[id]; });
    const thinking = document.getElementById('settings-litertlm-thinking');
    const streaming = document.getElementById('settings-litertlm-streaming');
    if (thinking) thinking.checked = false;
    if (streaming) streaming.checked = true;
    const status = document.getElementById('settings-litertlm-status');
    if (status) status.textContent = '모바일 경량값을 적용했습니다. 저장 버튼을 눌러 확정하세요.';
}

async function streamLiteRTLMChat(body, settings, signal, onStreamEvent) {
    const baseUrl = normalizeLiteRTLMBaseUrl(settings.cloudUrl || LITERTLM_CLOUD_BASE_URL);
    const emit = typeof onStreamEvent === 'function' ? onStreamEvent : function () {};
    emit({ type: 'request.start', provider: 'litertlm', context_length: settings.contextLength, max_output_tokens: settings.maxGen, render_interval_ms: settings.renderIntervalMs });
    emit({ type: 'transport.start', provider: 'litertlm' });
    const response = await fetch(baseUrl + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
        body: JSON.stringify(Object.assign({}, body, { stream: true })), signal: signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (await response.text() || response.statusText));
    if (!response.body) throw new Error('LiteRT-LM 스트림 응답 본문이 없습니다.');
    emit({ type: 'chat.start', provider: 'litertlm' });
    emit({ type: 'prompt_processing.start', provider: 'litertlm' });
    let text = '', reasoning = '', finishReason = '', responseId = null, responseModel = body.model, usage = null, buffer = '';
    let answerStarted = false, reasoningStarted = false, reasoningEnded = false, promptEnded = false;
    function processPayload(payload) {
        const value = String(payload || '').trim();
        if (!value || value === '[DONE]') return;
        let data;
        try { data = JSON.parse(value); } catch (_) { return; }
        if (data.error) throw new Error(String(data.error.message || data.error));
        responseId = data.id || responseId; responseModel = data.model || responseModel; usage = data.usage || usage;
        const choice = data.choices && data.choices[0] || {};
        const delta = choice.delta || choice.message || {};
        const reasoningDelta = String(delta.reasoning_content || delta.reasoning || '');
        const answerDelta = String(delta.content || choice.text || '');
        if (!promptEnded && (reasoningDelta || answerDelta)) { promptEnded = true; emit({ type: 'prompt_processing.end', provider: 'litertlm' }); }
        if (reasoningDelta) {
            if (!reasoningStarted) { reasoningStarted = true; emit({ type: 'reasoning.start', provider: 'litertlm' }); }
            reasoning += reasoningDelta; emit({ type: 'reasoning.delta', provider: 'litertlm', content: reasoningDelta });
        }
        if (answerDelta) {
            if (reasoningStarted && !reasoningEnded) { reasoningEnded = true; emit({ type: 'reasoning.end', provider: 'litertlm' }); }
            if (!answerStarted) { answerStarted = true; emit({ type: 'message.start', provider: 'litertlm' }); }
            text += answerDelta; emit({ type: 'message.delta', provider: 'litertlm', content: answerDelta });
        }
        finishReason = choice.finish_reason || finishReason;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
            if (line.startsWith('data:')) processPayload(line.slice(5));
            else if (line.trim().startsWith('{')) processPayload(line);
        }
    }
    buffer += decoder.decode();
    if (buffer.trim()) processPayload(buffer.replace(/^data:\s*/i, ''));
    if (reasoningStarted && !reasoningEnded) emit({ type: 'reasoning.end', provider: 'litertlm' });
    if (answerStarted) emit({ type: 'message.end', provider: 'litertlm' });
    const completionTokens = Number(usage && (usage.completion_tokens || usage.output_tokens)) || 0;
    emit({ type: 'chat.end', provider: 'litertlm', result: { stats: { total_output_tokens: completionTokens, reasoning_output_tokens: Number(usage && usage.reasoning_tokens) || 0 } } });
    return { provider: 'litertlm', model: responseModel, text: text, reasoning: reasoning, finishReason: finishReason, usage: usage, contextLength: settings.contextLength, maxOutputTokens: settings.maxGen, responseId: responseId };
}

async function requestLiteRTLM(path, options) {
    // Model requests can originate from AI JENA while the settings panel has
    // never been opened. Reading form controls here used to replace the saved
    // model with the panel's initial blank option. Runtime transport must use
    // persisted settings; explicit settings actions save the form beforehand.
    const settings = getLiteRTLMSettings();
    const baseUrl = normalizeLiteRTLMBaseUrl(settings.mode === 'cloud' ? settings.cloudUrl : settings.localUrl);
    const response = await fetch(baseUrl + path, options);
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (await response.text() || response.statusText));
    return { data: await response.json(), settings: settings };
}

async function loadSettingsLiteRTLMModels() {
    const status = document.getElementById('settings-litertlm-status');
    try {
        if (status) status.textContent = 'LiteRT-LM 서버와 모델을 확인하는 중...';
        const result = await requestLiteRTLM('/models', { method: 'GET', headers: { Accept: 'application/json' } });
        const rows = Array.isArray(result.data && result.data.data) ? result.data.data : (Array.isArray(result.data && result.data.models) ? result.data.models : []);
        const models = rows.map(function (item) { return String(item && (item.id || item.model || item.name) || item || '').trim(); }).filter(Boolean);
        if (!models.length) throw new Error('서버에서 모델을 찾지 못했습니다.');
        const select = document.getElementById('settings-litertlm-model');
        if (select) {
            select.innerHTML = '';
            models.forEach(function (name) { select.add(new Option(name, name)); });
            select.value = models.indexOf(result.settings.model) >= 0 ? result.settings.model : models[0];
        }
        localStorage.setItem(LITERTLM_MODELS_KEY, JSON.stringify(models));
        await saveLiteRTLMSettings(false);
        if (status) status.textContent = '연결 완료 · 모델 ' + models.length + '개: ' + models.join(' · ');
        return models;
    } catch (error) {
        if (status) status.textContent = '연결 실패: ' + (error && error.message ? error.message : error);
        throw error;
    }
}

async function testSettingsLiteRTLMResponse() {
    const status = document.getElementById('settings-litertlm-status');
    try {
        if (status) status.textContent = 'LiteRT-LM 실제 응답을 기다리는 중...';
        let settings = await saveLiteRTLMSettings(false);
        if (!settings.model) {
            await loadSettingsLiteRTLMModels();
            settings = await saveLiteRTLMSettings(false);
        }
        if (!settings.model) throw new Error('사용할 LiteRT-LM 모델이 없습니다. 먼저 모델 가져오기를 실행하세요.');
        const body = { model: settings.model, messages: [{ role: 'user', content: '한 문장으로 연결 테스트 성공이라고 답하세요.' }], stream: false, max_tokens: Math.min(settings.maxGen, 64), temperature: settings.temperature, top_p: settings.topP, top_k: settings.topK, thinking: settings.thinking };
        const result = await requestLiteRTLM('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
        const text = String(result.data && result.data.choices && result.data.choices[0] && result.data.choices[0].message && result.data.choices[0].message.content || '').trim();
        if (!text) throw new Error('응답 내용이 비어 있습니다.');
        if (status) status.textContent = '실제 응답 성공: ' + text.slice(0, 180);
        return text;
    } catch (error) {
        if (status) status.textContent = '응답 테스트 실패: ' + (error && error.message ? error.message : error);
        throw error;
    }
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

function getOllamaContextLengthFromShow(data) {
    const modelInfo = data && data.model_info || {};
    const modelContextLength = Object.keys(modelInfo).reduce(function (largest, key) {
        if (!/\.context_length$/i.test(key)) return largest;
        return Math.max(largest, Number(modelInfo[key]) || 0);
    }, 0);
    const parameters = String(data && data.parameters || '');
    const configuredMatch = parameters.match(/(?:^|\n)\s*num_ctx\s+(\d+)/i);
    const configuredContextLength = configuredMatch ? Math.max(0, Number(configuredMatch[1]) || 0) : 0;
    return configuredContextLength || modelContextLength;
}

async function getAIChatOllamaContextLength(baseUrl, model, signal) {
    const cached = Math.max(0, Number(aiChatOllamaContextLengths[model]) || 0);
    try {
        const runningData = await requestLocalAIJson(baseUrl + '/api/ps', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: signal
        });
        const runningModels = Array.isArray(runningData.models) ? runningData.models : [];
        const running = runningModels.find(function (item) {
            const name = String(item && (item.name || item.model) || '');
            return name === model || name.replace(/:latest$/i, '') === model.replace(/:latest$/i, '');
        });
        const runningContextLength = Math.max(0, Number(running && running.context_length) || 0);
        if (runningContextLength) {
            aiChatOllamaContextLengths[model] = runningContextLength;
            return runningContextLength;
        }
    } catch (error) {
        if (signal && signal.aborted) throw error;
    }
    try {
        const showData = await requestLocalAIJson(baseUrl + '/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ model: model }),
            signal: signal
        });
        const shownContextLength = getOllamaContextLengthFromShow(showData);
        if (shownContextLength) {
            aiChatOllamaContextLengths[model] = shownContextLength;
            return shownContextLength;
        }
    } catch (error) {
        if (signal && signal.aborted) throw error;
    }
    return cached || 8192;
}

async function callOllamaChatText(messages, systemInstruction, modelOverride, signal, responseMode, onStreamEvent, settingsOverride) {
    const settings = Object.assign({}, getOllamaSettings(), settingsOverride || {});
    settings.baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
    const model = String(modelOverride || localStorage.getItem('ss_ai_chat_ollama_model') || localStorage.getItem('ss_scholar_ai_ollama_model') || '').trim();
    if (!model) throw new Error('Ollama 모델을 먼저 선택하세요.');
    const normalized = normalizeAIChatMessages(messages);
    const lastUserIndex = normalized.map(function (item) { return item.role; }).lastIndexOf('user');
    if (lastUserIndex < 0) throw new Error('전송할 사용자 질문이 없습니다.');
    const emit = typeof onStreamEvent === 'function' ? onStreamEvent : function () {};
    const reasoningMode = responseMode === 'reasoning';
    const contextLength = await getAIChatOllamaContextLength(settings.baseUrl, model, signal);
    const fixedInputTokens = estimateAIChatTokens(systemInstruction) + estimateAIChatTokens(normalized[lastUserIndex].content);
    const outputReserve = Math.min(
        Math.max(1, contextLength - fixedInputTokens - 256),
        Math.max(1024, Math.floor(contextLength * (reasoningMode ? 0.4 : 0.32)))
    );
    const historyTokenBudget = Math.max(0, contextLength - fixedInputTokens - outputReserve - 256);
    const historyMessages = retainAIChatHistory(normalized.slice(0, lastUserIndex), historyTokenBudget);
    const payloadMessages = historyMessages.concat([normalized[lastUserIndex]]).map(function (item) {
        return { role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') };
    });
    if (systemInstruction) payloadMessages.unshift({ role: 'system', content: String(systemInstruction) });
    const estimatedInputTokens = payloadMessages.reduce(function (sum, item) {
        return sum + estimateAIChatTokens(item.content);
    }, 0);
    const maxOutputTokens = Math.max(1, contextLength - estimatedInputTokens - 256);
    emit({
        type: 'request.start',
        provider: 'ollama',
        context_length: contextLength,
        estimated_input_tokens: estimatedInputTokens,
        max_output_tokens: maxOutputTokens,
        reasoning: reasoningMode ? 'on' : 'off'
    });
    emit({ type: 'transport.start', provider: 'ollama' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' };
    const body = {
        model: model,
        messages: payloadMessages,
        stream: true,
        think: reasoningMode,
        options: {
            num_ctx: contextLength,
            num_predict: maxOutputTokens
        }
    };
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
            total_output_tokens: outputTokens,
            total_tokens: promptTokens + outputTokens
        },
        contextLength: contextLength,
        maxOutputTokens: maxOutputTokens,
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
    let key = getProtectedAiCredential('gemini', 'ss_gemini_api_key');
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
        return {
            role: message.role,
            content: String(message.content),
            attachments: Array.isArray(message.attachments) ? message.attachments : []
        };
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
        const id = String(model.name || '').replace(/^models\//, '');
        if (id) {
            aiChatGeminiModelLimits[id] = {
                inputTokenLimit: Math.max(0, Number(model.inputTokenLimit) || 0),
                outputTokenLimit: Math.max(0, Number(model.outputTokenLimit) || 0)
            };
        }
        return id;
    }).filter(Boolean);
    return mergeAIChatGeminiModels(models);
}

async function getAIChatGeminiModelLimits(model, key, signal) {
    const cached = aiChatGeminiModelLimits[model];
    if (cached && cached.outputTokenLimit) return cached;
    try {
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + '?key=' + encodeURIComponent(key),
            { headers: { Accept: 'application/json' }, signal: signal }
        );
        if (!response.ok) return cached || { inputTokenLimit: 0, outputTokenLimit: 8192 };
        const data = await response.json();
        const limits = {
            inputTokenLimit: Math.max(0, Number(data.inputTokenLimit) || 0),
            outputTokenLimit: Math.max(0, Number(data.outputTokenLimit) || 0)
        };
        aiChatGeminiModelLimits[model] = limits;
        return limits;
    } catch (error) {
        if (signal && signal.aborted) throw error;
        return cached || { inputTokenLimit: 0, outputTokenLimit: 8192 };
    }
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

function shouldUseLocalDeepseekProxy() {
    return /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(location.hostname);
}

async function deepseekApiFetch(baseUrl, path, key, body, signal, timeoutSeconds) {
    const tauriInvoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (typeof tauriInvoke === 'function') {
        if (signal && signal.aborted) throw signal.reason || new DOMException('요청이 취소되었습니다.', 'AbortError');
        const result = await tauriInvoke('deepseek_api_request', {
            request: { baseUrl: baseUrl, path: path, apiKey: key, body: body, timeoutSeconds: timeoutSeconds || 300 }
        });
        return new Response(String(result.body || ''), {
            status: Number(result.status || 500),
            headers: { 'Content-Type': 'application/json' }
        });
    }
    if (shouldUseLocalDeepseekProxy()) {
        return fetch('/__mdviewer_deepseek_proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ baseUrl: baseUrl, path: path, apiKey: key, body: body, timeoutSeconds: timeoutSeconds || 300 }),
            signal: signal
        });
    }
    return fetch(baseUrl + path, {
        method: body == null ? 'GET' : 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
        signal: signal
    });
}

async function getDeepseekUserBalance(keyOverride, baseUrlOverride) {
    const state = getDeepseekApiState();
    const key = String(keyOverride || state.key || '').trim();
    if (!key) throw new Error('DeepSeek API Key가 없습니다.');
    const baseUrl = normalizeDeepseekBaseUrl(baseUrlOverride || state.baseUrl);
    let response;
    try {
        response = await deepseekApiFetch(baseUrl, '/user/balance', key, null, null, state.timeoutSeconds);
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
        response = await deepseekApiFetch(baseUrl, '/models', key, null, null, state.timeoutSeconds);
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
    baseUrlOverride,
    options
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
    const opts = options || {};
    const reasoningMode = opts.reasoningMode === true;
    const maxTokens = Math.max(256, Math.min(384000, Number(opts.maxTokens) || state.maxTokens || 8192));
    const effort = ['low', 'high', 'max'].includes(String(opts.reasoningEffort || state.reasoningEffort).toLowerCase())
        ? String(opts.reasoningEffort || state.reasoningEffort).toLowerCase() : 'high';
    const timeoutSeconds = Math.max(30, Math.min(3600, Number(opts.timeoutSeconds) || state.timeoutSeconds || 300));
    const requestBody = {
        model: normalizedModel,
        messages: payloadMessages,
        stream: false,
        max_tokens: maxTokens,
        thinking: { type: reasoningMode ? 'enabled' : 'disabled' }
    };
    if (reasoningMode) requestBody.reasoning_effort = effort;
    const timeoutController = new AbortController();
    const abortFromCaller = function () { timeoutController.abort(signal?.reason || new DOMException('요청이 취소되었습니다.', 'AbortError')); };
    if (signal) signal.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = setTimeout(function () { timeoutController.abort(new DOMException('DeepSeek 제한 시간을 초과했습니다.', 'TimeoutError')); }, timeoutSeconds * 1000);
    let response;
    try {
        response = await deepseekApiFetch(baseUrl, '/chat/completions', key, requestBody, timeoutController.signal, timeoutSeconds);
    } catch (error) {
        if (error && error.name === 'TimeoutError') throw new Error('DeepSeek 응답 제한 시간(' + timeoutSeconds + '초)을 초과했습니다. 설정에서 시간을 늘려주세요.');
        if (error && error.name === 'TypeError') throw new Error('DeepSeek 연결에 실패했습니다. 로컬 서버를 재시작한 뒤 다시 시도하세요. (' + error.message + ')');
        throw error;
    } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', abortFromCaller);
    }

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
        reasoning: String(data.choices?.[0]?.message?.reasoning_content || ''),
        maxOutputTokens: maxTokens,
        usage: data.usage || null,
        finishReason: data.choices && data.choices[0] ? data.choices[0].finish_reason : '',
        raw: data
    };
}

async function callDeepseekText(prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride, baseUrlOverride) {
    return callDeepseekChatText([{ role: 'user', content: String(prompt || '') }], systemInstruction, modelOverride, signal, keyOverride, baseUrlOverride);
}

function getOpenAIApiState() {
    return {
        key: getProtectedAiCredential('openai', 'ss_openai_api_key'),
        verifiedFingerprint: String(localStorage.getItem('ss_openai_api_key_verified') || '')
    };
}

async function createOpenAIApiError(response, fallbackLabel) {
    const status = response ? Number(response.status || 0) : 0;
    let providerMessage = '';
    let providerCode = '';
    try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
            providerMessage = String(errorData.error.message || '');
            providerCode = String(errorData.error.code || errorData.error.type || '');
        }
    } catch (_) {}
    let message = providerMessage || String(fallbackLabel || 'OpenAI API 오류') + (status ? ': ' + status : '');
    let code = 'OPENAI_API_ERROR';
    if (status === 401) {
        code = 'OPENAI_AUTH_FAILED';
        message = 'OpenAI 인증에 실패했습니다. 설정에 저장한 API 키를 확인하세요.';
    } else if (status === 429 && /insufficient_quota|quota|billing/i.test(providerCode + ' ' + providerMessage)) {
        code = 'OPENAI_INSUFFICIENT_QUOTA';
        message = 'OpenAI API 사용 한도 또는 결제 잔액이 부족합니다. Platform의 API 결제 설정을 확인하세요.';
    } else if (status === 429) {
        code = 'OPENAI_RATE_LIMIT';
        message = 'OpenAI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    } else if (status === 404 && /model/i.test(providerMessage)) {
        code = 'OPENAI_MODEL_UNAVAILABLE';
        message = '선택한 OpenAI 모델을 이 API 프로젝트에서 사용할 수 없습니다. 모델 목록을 새로고침하세요.';
    } else if (status >= 500) {
        code = 'OPENAI_SERVER_BUSY';
        message = 'OpenAI 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하세요.';
    }
    const error = new Error(message);
    error.name = 'OpenAIApiError';
    error.code = code;
    error.status = status;
    error.providerMessage = providerMessage;
    return error;
}

function isOpenAITextModel(model) {
    const id = String(model || '').trim();
    if (!/^(?:gpt-|o[134](?:-|$))/i.test(id)) return false;
    return !/(audio|realtime|transcri|tts|image|search|embedding|moderation|codex)/i.test(id);
}

async function listOpenAIChatModels(keyOverride) {
    const state = getOpenAIApiState();
    const key = String(keyOverride || state.key || '').trim();
    if (!key) throw new Error('OpenAI API Key가 없습니다. 앱 설정에서 키를 저장하세요.');
    let response;
    try {
        response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        throw new Error('OpenAI 서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요. (' + (error && error.message ? error.message : error) + ')');
    }
    if (!response.ok) throw await createOpenAIApiError(response, 'OpenAI 모델 조회 오류');
    const data = await response.json();
    const models = (Array.isArray(data.data) ? data.data : []).map(function (item) {
        return String(item && item.id || '').trim();
    }).filter(isOpenAITextModel).sort(function (a, b) { return a.localeCompare(b); });
    return mergeAIChatOpenAIModels(models);
}

function parseOpenAIResponseText(data) {
    if (!data) return '';
    if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
    const parts = [];
    (Array.isArray(data.output) ? data.output : []).forEach(function (item) {
        (Array.isArray(item && item.content) ? item.content : []).forEach(function (content) {
            if (content && content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
        });
    });
    return parts.join('');
}

async function callOpenAIChatText(messages, systemInstruction, modelOverride, signal, responseMode, keyOverride) {
    const state = getOpenAIApiState();
    const key = String(keyOverride || state.key || '').trim();
    if (!key) throw new Error('OpenAI API Key가 없습니다. 앱 설정에서 키를 저장하세요.');
    const model = String(modelOverride || AI_CHAT_OPENAI_DEFAULT_MODELS[0]).trim();
    const normalized = normalizeAIChatMessages(messages);
    if (!normalized.length) throw new Error('전송할 대화가 없습니다.');
    const config = getScholarAIProviderRuntime().getLMStudioConfig();
    const maxOutputTokens = Math.max(1, Number(responseMode === 'reasoning' ? config.reasoningMaxTokens : config.quickMaxTokens) || (responseMode === 'reasoning' ? 8192 : 4096));
    const payload = {
        model: model,
        input: normalized.map(function (item) {
            const images = item.role === 'user' ? item.attachments.filter(function (attachment) {
                return attachment && attachment.kind === 'image' && /^data:image\//i.test(String(attachment.dataUrl || ''));
            }) : [];
            const content = images.length
                ? [{ type: 'input_text', text: String(item.content) }].concat(images.map(function (attachment) {
                    return { type: 'input_image', image_url: attachment.dataUrl, detail: 'auto' };
                }))
                : String(item.content);
            return { role: item.role === 'assistant' ? 'assistant' : 'user', content: content };
        }),
        max_output_tokens: maxOutputTokens,
        store: false
    };
    if (systemInstruction) payload.instructions = String(systemInstruction);
    if (/^gpt-5\.6(?:-|$)/i.test(model)) {
        payload.reasoning = { effort: responseMode === 'reasoning' ? 'medium' : 'low' };
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: signal
    });
    if (!response.ok) throw await createOpenAIApiError(response, 'OpenAI 생성 오류');
    const data = await response.json();
    const text = parseOpenAIResponseText(data);
    if (!text) throw new Error('OpenAI 응답이 비어 있습니다.');
    return {
        provider: 'openai',
        model: model,
        text: text,
        usage: data.usage || null,
        finishReason: data.status === 'incomplete' && data.incomplete_details ? String(data.incomplete_details.reason || 'incomplete') : String(data.status || ''),
        responseId: data.id || null,
        maxOutputTokens: maxOutputTokens,
        raw: data
    };
}

async function callOpenAIText(prompt, systemInstruction, useSearch, modelOverride, signal, keyOverride) {
    return callOpenAIChatText([{ role: 'user', content: String(prompt || '') }], systemInstruction, modelOverride, signal, 'quick', keyOverride);
}

async function readAIStudioEventStream(response, emit) {
    if (!response.body || typeof response.body.getReader !== 'function') throw new Error('AI Studio 스트림을 읽을 수 없습니다.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const chunks = [];
    while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        events.forEach(function (eventBlock) {
            const jsonText = eventBlock.split(/\r?\n/).filter(function (line) { return line.indexOf('data:') === 0; })
                .map(function (line) { return line.slice(5).trim(); }).join('');
            if (!jsonText || jsonText === '[DONE]') return;
            const chunk = JSON.parse(jsonText);
            chunks.push(chunk);
            const candidate = chunk.candidates?.[0] || {};
            const parts = candidate.content?.parts || [];
            parts.forEach(function (item) {
                const value = String(item && item.text || '');
                if (!value) return;
                emit({ type: item.thought === true ? 'reasoning.delta' : 'message.delta', provider: 'aistudio', content: value });
            });
        });
        if (part.done) break;
    }
    if (buffer.trim()) {
        const jsonText = buffer.split(/\r?\n/).filter(function (line) { return line.indexOf('data:') === 0; })
            .map(function (line) { return line.slice(5).trim(); }).join('');
        if (jsonText && jsonText !== '[DONE]') chunks.push(JSON.parse(jsonText));
    }
    const mergedParts = [];
    let usageMetadata = {};
    let finishReason = '';
    chunks.forEach(function (chunk) {
        const candidate = chunk.candidates?.[0] || {};
        (candidate.content?.parts || []).forEach(function (item) { mergedParts.push(item); });
        if (candidate.finishReason) finishReason = candidate.finishReason;
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
    });
    return { candidates: [{ content: { parts: mergedParts }, finishReason: finishReason }], usageMetadata: usageMetadata };
}

async function callAIStudioChat(messages, systemInstruction, modelOverride, signal, responseMode, academicSearch, academicEvidenceCount, onStreamEvent) {
    const key = await getAIStudioKeyForChat();
    if (!key) throw new Error('AI Studio API Key가 없습니다. 앱 설정에서 API Key를 먼저 저장하세요.');
    const model = String(modelOverride || 'gemini-2.5-flash').trim();
    const normalized = normalizeAIChatMessages(messages);
    while (normalized.length && normalized[0].role !== 'user') normalized.shift();
    const contents = [];
    normalized.forEach(function (message) {
        const role = message.role === 'assistant' ? 'model' : 'user';
        const messageParts = [{ text: message.content }];
        if (role === 'user') {
            message.attachments.forEach(function (attachment) {
                const match = attachment && String(attachment.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/i);
                if (attachment && attachment.kind === 'image' && match) {
                    messageParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
                }
            });
        }
        const previous = contents[contents.length - 1];
        if (previous && previous.role === role) {
            previous.parts[0].text += '\n\n' + message.content;
            if (messageParts.length > 1) previous.parts = previous.parts.concat(messageParts.slice(1));
        } else {
            contents.push({ role: role, parts: messageParts });
        }
    });
    if (!contents.length) throw new Error('전송할 대화가 없습니다.');
    const reasoningMode = responseMode === 'reasoning';
    const imageModel = isAIChatGeminiImageModel(model);
    const modelLimits = imageModel
        ? { inputTokenLimit: 0, outputTokenLimit: 0 }
        : await getAIChatGeminiModelLimits(model, key, signal);
    const maxOutputTokens = Math.max(1, Number(modelLimits.outputTokenLimit) || 8192);
    const generationConfig = imageModel
        ? { responseModalities: ['TEXT', 'IMAGE'] }
        : { maxOutputTokens: maxOutputTokens };
    if (!imageModel && /^gemini-3/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingLevel: reasoningMode ? 'high' : 'low' };
    } else if (!imageModel && /^gemini-2\.5/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingBudget: reasoningMode ? 4096 : 0 };
    }
    const payload = { contents: contents, generationConfig: generationConfig };
    if (systemInstruction && !imageModel) payload.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
    const streaming = !imageModel && typeof onStreamEvent === 'function';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model)
        + (streaming ? ':streamGenerateContent?alt=sse&key=' : ':generateContent?key=') + encodeURIComponent(key);
    if (streaming) {
        onStreamEvent({ type: 'request.start', provider: 'aistudio', context_length: Number(modelLimits.inputTokenLimit) || 0, max_output_tokens: maxOutputTokens, estimated_input_tokens: estimateAIChatTokens([systemInstruction || ''].concat(normalized.map(function (message) { return message.content || ''; })).join('\n\n')) });
        onStreamEvent({ type: 'transport.start', provider: 'aistudio' });
        onStreamEvent({ type: 'chat.start', provider: 'aistudio' });
        onStreamEvent({ type: 'prompt_processing.start', provider: 'aistudio' });
    }
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
    if (streaming) onStreamEvent({ type: 'prompt_processing.end', provider: 'aistudio' });
    const data = streaming ? await readAIStudioEventStream(response, onStreamEvent) : await response.json();
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
    const usageMetadata = data.usageMetadata || {};
    const hasProviderUsage = ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount']
        .some(function (key) { return Number.isFinite(Number(usageMetadata[key])); });
    const estimatedPromptText = [systemInstruction || ''].concat(normalized.map(function (message) { return message.content || ''; })).join('\n\n');
    const promptTokens = Math.max(0, Number(usageMetadata.promptTokenCount) || (hasProviderUsage ? 0 : estimateAIChatTokens(estimatedPromptText)));
    const completionTokens = Math.max(0, Number(usageMetadata.candidatesTokenCount) || (hasProviderUsage ? 0 : estimateAIChatTokens(text)));
    const reasoningTokens = Math.max(0, Number(usageMetadata.thoughtsTokenCount) || (hasProviderUsage ? 0 : estimateAIChatTokens(reasoning)));
    if (streaming) {
        onStreamEvent({ type: 'message.end', provider: 'aistudio' });
        onStreamEvent({ type: 'chat.end', provider: 'aistudio', result: { stats: { total_output_tokens: completionTokens + reasoningTokens, reasoning_output_tokens: reasoningTokens } } });
    }
    return {
        provider: 'aistudio',
        model: model,
        text: text,
        reasoning: reasoning,
        images: images,
        finishReason: candidate.finishReason || '',
        usage: {
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            reasoningTokens: reasoningTokens,
            outputTokens: completionTokens + reasoningTokens,
            totalTokens: Math.max(0, Number(usageMetadata.totalTokenCount) || (promptTokens + completionTokens + reasoningTokens)),
            estimated: !hasProviderUsage,
            source: hasProviderUsage ? 'ai-studio' : 'lmstudio-estimate'
        },
        contextLength: Number(modelLimits.inputTokenLimit) || null,
        maxOutputTokens: imageModel ? null : maxOutputTokens
    };
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

function aiChatFileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(reader.error || new Error('파일을 읽지 못했습니다.')); };
        reader.readAsDataURL(file);
    });
}

function extractOfficeXmlText(xml, tags) {
    const doc = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
    const values = [];
    (tags || []).forEach(function (tag) {
        Array.from(doc.getElementsByTagName(tag)).forEach(function (node) {
            const value = String(node.textContent || '').trim();
            if (value) values.push(value);
        });
    });
    return values.join(' ');
}

async function extractAIChatOfficeText(file, extension) {
    if (!window.JSZip || typeof window.JSZip.loadAsync !== 'function') throw new Error('Office 문서 압축 해제 모듈이 없습니다.');
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const paths = Object.keys(zip.files).filter(function (path) {
        if (extension === '.docx') return /^word\/document\.xml$/i.test(path);
        if (extension === '.pptx') return /^ppt\/slides\/slide\d+\.xml$/i.test(path);
        return /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(path);
    }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
    const sections = [];
    for (const path of paths) {
        const xml = await zip.files[path].async('string');
        const text = extractOfficeXmlText(xml, extension === '.pptx' ? ['a:t'] : extension === '.docx' ? ['w:t'] : ['t', 'v']);
        if (text) sections.push((extension === '.pptx' ? '[슬라이드] ' : extension === '.xlsx' ? '[시트 데이터] ' : '') + text);
    }
    return sections.join('\n\n');
}

async function extractAIChatPdfText(file) {
    await loadOptionalScript('pdfJs', function () {
        return !!window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function';
    }, { module: true });
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(function (item) { return String(item && item.str || ''); }).join(' ').trim();
        if (text) pages.push('[페이지 ' + pageNumber + ']\n' + text);
    }
    return pages.join('\n\n');
}

async function extractAIChatAttachment(file) {
    if (!file) throw new Error('첨부 파일이 없습니다.');
    if (file.size > 25 * 1024 * 1024) throw new Error('첨부 파일은 25MB 이하여야 합니다: ' + file.name);
    const name = String(file.name || 'clipboard-image.png');
    const extension = (name.toLowerCase().match(/\.[^.]+$/) || [''])[0];
    const mimeType = String(file.type || '').toLowerCase();
    if (mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'].includes(extension)) {
        return { kind: 'image', name: name, type: mimeType || 'image/png', size: file.size, dataUrl: await aiChatFileToDataUrl(file) };
    }
    let text = '';
    if (extension === '.pdf') text = await extractAIChatPdfText(file);
    else if (extension === '.docx' || extension === '.pptx' || extension === '.xlsx') text = await extractAIChatOfficeText(file, extension);
    else if (['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm'].includes(extension) || /^text\//.test(mimeType)) text = await file.text();
    else throw new Error('지원하지 않는 첨부 형식입니다: ' + name);
    text = String(text || '').trim();
    if (!text) throw new Error('추출할 텍스트가 없습니다: ' + name);
    return { kind: 'document', name: name, type: mimeType, size: file.size, text: text.slice(0, 160000), truncated: text.length > 160000 };
}

function aiChatDataUrlToFile(dataUrl, name) {
    const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name || 'ai-image.png', { type: match[1] || 'image/png' });
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
    getCachedLiteRTLMModels: function () {
        return readStoredModelList(LITERTLM_MODELS_KEY);
    },
    refreshLiteRTLMModels: function () {
        return loadSettingsLiteRTLMModels();
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
    getCachedOpenAIModels: function () {
        return mergeAIChatOpenAIModels(readStoredModelList(AI_CHAT_OPENAI_MODELS_KEY));
    },
    refreshOpenAIModels: async function () {
        const models = await listOpenAIChatModels();
        saveStoredModelList(AI_CHAT_OPENAI_MODELS_KEY, models);
        return models;
    },
    getCachedOpenAICompatibleModels: function () {
        const models = readOpenAICompatibleModelsCache().map(function (item) { return item.id; });
        const selected = String(localStorage.getItem('ss_openai_compatible_model_id') || '').trim();
        return Array.from(new Set(models.concat(selected ? [selected] : []).filter(Boolean)));
    },
    refreshOpenAICompatibleModels: function () {
        return fetchOpenAICompatibleModels(getStoredOpenAICompatibleConnection());
    },
    refreshLMStudioModels: async function () {
        const result = await getScholarAIProviderRuntime().syncLMStudioLoadedModel();
        const models = result.models.map(function (item) { return item.id; }).filter(Boolean);
        saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, models);
        return { model: result.model, models: models, contextLength: getAIChatLMContextLength(result) };
    },
    insertIntoDocument: function (text, mode, options) {
        const insertOptions = options && typeof options === 'object' ? options : {};
        const value = insertOptions.format === 'html' && String(insertOptions.html || '').trim()
            ? insertOptions.html
            : text;
        return insertAIChatTextIntoDocument(value, mode);
    },
    saveImageForDocument: function (image, index) {
        return saveAIChatGeneratedImageForDocument(image, index);
    },
    uploadImageToImgbb: function (image, index) {
        return uploadAIChatGeneratedImageToImgbb(image, index);
    },
    extractAttachment: function (file) {
        return extractAIChatAttachment(file);
    },
    saveAIDataRecord: function (record) {
        if (!window.AIDataCenter || typeof window.AIDataCenter.save !== 'function') return Promise.resolve(false);
        return window.AIDataCenter.save(record);
    },
    openAIDataCenter: function () {
        if (!window.AIDataCenter || typeof window.AIDataCenter.open !== 'function') throw new Error('AI 데이터 센터 앱이 준비되지 않았습니다.');
        return window.AIDataCenter.open();
    },
    readAIDataRecords: async function () {
        return window.AIDataCenter && typeof window.AIDataCenter.readAll === 'function' ? window.AIDataCenter.readAll() : [];
    },
    openAIDataImagesInFma: function (records, selectedName) {
        if (!window.InternalImageApp || typeof window.InternalImageApp.openFiles !== 'function') throw new Error('FMA Viewer 연결 모듈이 준비되지 않았습니다.');
        const files = (Array.isArray(records) ? records : []).map(function (record) {
            return aiChatDataUrlToFile(record.dataUrl, record.name);
        });
        if (!files.length) throw new Error('FMA Viewer로 열 이미지가 없습니다.');
        window.InternalImageApp.openFiles(files, selectedName || files[0].name);
        return true;
    },
    complete: async function (request) {
        request = request || {};
        if (aiChatAbortController) aiChatAbortController.abort();
        const controller = new AbortController();
        aiChatAbortController = controller;
        try {
            if (request.provider === 'openai-compatible') {
                const connection = getStoredOpenAICompatibleConnection();
                const model = String(request.model || connection.modelId || '').trim();
                if (!model) throw new Error('OrcaRouter / OpenAI 호환 모델을 선택하세요.');
                const messages = normalizeAIChatMessages(request.messages);
                if (request.systemInstruction) messages.unshift({ role: 'system', content: String(request.systemInstruction) });
                const response = await fetch(connection.baseUrl + '/chat/completions', {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + connection.apiKey },
                    body: JSON.stringify({ model: model, messages: messages, stream: false }),
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(await readOpenAICompatibleError(response));
                const data = await response.json();
                const choice = data && data.choices && data.choices[0] || {};
                const message = choice.message || {};
                return {
                    provider: 'openai-compatible',
                    model: String(data.model || model),
                    text: String(message.content || choice.text || ''),
                    reasoning: String(message.reasoning_content || message.reasoning || ''),
                    finishReason: choice.finish_reason || '',
                    usage: data.usage || null,
                    responseId: data.id || null
                };
            }
            if (request.provider === 'litertlm') {
                const settings = getLiteRTLMSettings();
                const messages = normalizeAIChatMessages(request.messages);
                if (request.systemInstruction) messages.unshift({ role: 'system', content: String(request.systemInstruction) });
                const body = { model: request.model || settings.model, messages: messages, stream: false, max_tokens: settings.maxGen, temperature: settings.temperature, top_p: settings.topP, top_k: settings.topK, sampler: settings.sampler, thinking: settings.thinking };
                if (settings.streaming !== false && typeof request.onStreamEvent === 'function') {
                    return await streamLiteRTLMChat(body, settings, controller.signal, request.onStreamEvent);
                }
                const result = await requestLiteRTLM('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
                const choice = result.data && result.data.choices && result.data.choices[0] || {};
                return { provider: 'litertlm', model: result.data.model || body.model, text: String(choice.message && choice.message.content || choice.text || ''), reasoning: String(choice.message && choice.message.reasoning_content || ''), finishReason: choice.finish_reason || '', usage: result.data.usage || null, contextLength: settings.contextLength, maxOutputTokens: settings.maxGen, responseId: result.data.id || null };
            }
            if (request.provider === 'aistudio') {
                return await callAIStudioChat(request.messages, request.systemInstruction, request.model, controller.signal, request.academicSearch ? 'quick' : request.mode, request.academicSearch, request.academicEvidenceCount, request.onStreamEvent);
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
                    contextLength: result.contextLength || null,
                    maxOutputTokens: result.maxOutputTokens || null,
                    responseId: null
                };
            }
            if (request.provider === 'deepseek') {
                const result = await callDeepseekChatText(
                    request.messages,
                    request.systemInstruction,
                    request.model,
                    controller.signal,
                    undefined,
                    undefined,
                    {
                        reasoningMode: request.mode === 'reasoning' && request.academicSearch !== true,
                        maxTokens: getDeepseekApiState().maxTokens,
                        timeoutSeconds: getDeepseekApiState().timeoutSeconds,
                        reasoningEffort: getDeepseekApiState().reasoningEffort
                    }
                );
                return {
                    provider: result.provider || 'deepseek',
                    model: result.model || request.model || 'deepseek-v4-flash',
                    text: result.text || '',
                    reasoning: result.reasoning || '',
                    finishReason: result.finishReason || result.raw?.choices?.[0]?.finish_reason || '',
                    usage: result.usage || null,
                    contextLength: null,
                    maxOutputTokens: result.maxOutputTokens || null,
                    responseId: result.responseId || null
                };
            }
            if (request.provider === 'openai') {
                const result = await callOpenAIChatText(
                    request.messages,
                    request.systemInstruction,
                    request.model,
                    controller.signal,
                    request.academicSearch ? 'quick' : request.mode
                );
                return {
                    provider: 'openai',
                    model: result.model || request.model || AI_CHAT_OPENAI_DEFAULT_MODELS[0],
                    text: result.text || '',
                    reasoning: '',
                    finishReason: result.finishReason || '',
                    usage: result.usage || null,
                    contextLength: null,
                    maxOutputTokens: result.maxOutputTokens || null,
                    responseId: result.responseId || null
                };
            }
            const synced = await getScholarAIProviderRuntime().syncLMStudioLoadedModel();
            if (controller.signal.aborted) {
                const abortError = new Error('AI Jena request aborted');
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
            const configuredReasoning = String(config.reasoningLevel || 'auto').toLowerCase();
            const fastMode = request.fastMode === true;
            const configuredFastMaxTokens = Math.max(1, Number(config.fastMaxTokens) || 3000);
            const configuredFastTimeoutMs = Math.max(1000, Number(config.fastTimeoutMs) || 120000);
            const fastSafetyTimeoutMs = config.fastSafetyTimeout === false
                ? configuredFastTimeoutMs
                : Math.max(configuredFastTimeoutMs, 120000);
            const requestedOutputTokens = fastMode ? Math.min(configuredFastMaxTokens, configuredMaxTokens) : (contextLength || configuredMaxTokens);
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
            const requestMaxTokens = Math.max(1, Math.min(contextOutputBudget, fastMode ? configuredFastMaxTokens : contextOutputBudget));
            const minimumTimeout = continuationMode
                ? 600000
                : (fastMode ? fastSafetyTimeoutMs : (reasoningMode ? 300000 : (request.academicSearch ? 240000 : 60000)));
            const requestTimeoutMs = fastMode
                ? minimumTimeout
                : Math.max(
                    minimumTimeout,
                    Number(config.timeoutMs) || 0,
                    Math.ceil((requestMaxTokens / 8) * 1000 + 120000)
                );
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
                timeoutMs: requestTimeoutMs,
                completeStreaming: fastMode && config.fastCompleteStreaming !== false,
                store: fastMode || splitAcademicMode ? false : (request.retainForContinuation === true || request.academicSearch === true || continuationMode),
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
        if (s && s.openaiApiKey) localStorage.setItem('ss_openai_api_key', s.openaiApiKey);
        if (s && s.imgbbApiKey) localStorage.setItem('ss_imgbb_api_key', s.imgbbApiKey);
    });
    window.SidebarAIConfig = {
        host: null,
        cropEditorBase: './js/crop/',
        callbacks: {
            getApiKey: function () { return getProtectedAiCredential('gemini', 'ss_gemini_api_key'); },
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
            callScholarAI: function (prompt, systemInstruction, useSearch, modelOverride, requestOptions) {
                const special = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
                return getScholarAIProviderRuntime().complete({
                    prompt: prompt,
                    systemInstruction: systemInstruction,
                    useSearch: useSearch,
                    model: modelOverride,
                    responseMode: special.mode,
                    reasoning: special.reasoning,
                    maxTokens: special.maxOutputTokens,
                    timeoutMs: special.timeoutMs
                });
            },
            listScholarAIGeminiModels: function () { return listAIStudioTextModels(); },
            listScholarAIOllamaModels: function () { return listOllamaModels(); },
            listDeepseekModels: function () { return listDeepseekChatModels(); },
            listOpenAIModels: function () { return listOpenAIChatModels(); },
            getCachedScholarAIGeminiModels: function () { return readStoredModelList(SCHOLAR_AI_GEMINI_MODELS_KEY); },
            getCachedScholarAIOllamaModels: function () { return readStoredModelList(OLLAMA_MODELS_KEY); },
            getCachedScholarAIDeepseekModels: function () { return readStoredModelList(AI_CHAT_DEEPSEEK_MODELS_KEY); },
            getCachedScholarAIOpenAIModels: function () { return mergeAIChatOpenAIModels(readStoredModelList(AI_CHAT_OPENAI_MODELS_KEY)); },
            getCachedScholarAILMStudioModels: function () { return readStoredModelList(SCHOLAR_AI_LM_MODELS_KEY); },
            refreshScholarAILMStudioModels: async function () {
                const ids = await getScholarAIProviderRuntime().listLMStudioModels();
                saveStoredModelList(SCHOLAR_AI_LM_MODELS_KEY, ids);
                return ids;
            },
            loadScholarAILMStudioModel: async function (model) {
                const result = await getScholarAIProviderRuntime().loadLMStudioModel(model);
                notifyAiToolSettingsChanged();
                return result;
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
            refreshOpenAIModels: async function () {
                const models = await listOpenAIChatModels();
                saveStoredModelList(AI_CHAT_OPENAI_MODELS_KEY, models);
                saveStoredModelList('ss_scholar_ai_openai_models_v1', models);
                return models;
            },
            setScholarAIDeepseekConfig: function (config) {
                const result = getScholarAIProviderRuntime().setDeepSeekConfig(config);
                notifyAiToolSettingsChanged();
                return result;
            },
            getScholarAIDeepseekConfig: function () { return getScholarAIProviderRuntime().getDeepSeekConfig(); },
            getScholarAIProvider: function () { return getScholarAIProviderRuntime().getProvider(); },
            setScholarAIProvider: function (provider) {
                const result = getScholarAIProviderRuntime().setProvider(provider);
                notifyAiToolSettingsChanged();
                return result;
            },
            getScholarAILMStudioConfig: function () { return getScholarAIProviderRuntime().getLMStudioConfig(); },
            saveScholarAILMStudioConfig: function (config) {
                const result = getScholarAIProviderRuntime().saveLMStudioConfig(config);
                notifyAiToolSettingsChanged();
                return result;
            },
            listScholarAILMStudioModels: function (config) { return getScholarAIProviderRuntime().listLMStudioModels(config); },
            testScholarAILMStudio: function (config) { return getScholarAIProviderRuntime().testLMStudio(config); },
            /**
             */
            generateImage: async function (prompt, options) {
                const key = getProtectedAiCredential('gemini', 'ss_gemini_api_key');
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
                notifyAiToolSettingsChanged();
            },
            getScholarAIModelId: function (provider) { return getScholarAIProviderRuntime().getModel(provider); },
            setScholarAIModelId: function (id, provider) {
                const result = getScholarAIProviderRuntime().setModel(id, provider);
                notifyAiToolSettingsChanged();
                return result;
            },
            getImageModelId: function () {
                const saved = localStorage.getItem('ss_image_model') || 'gemini-3.1-flash-image';
                if (saved === 'gemini-3.1-flash-image-preview') return 'gemini-3.1-flash-image';
                if (saved === 'gemini-3-pro-image-preview') return 'gemini-3-pro-image';
                return saved;
            },
            setImageModelId: function (id) {
                const value = String(id || 'gemini-3.1-flash-image').trim().slice(0, 256) || 'gemini-3.1-flash-image';
                localStorage.setItem('ss_image_model', value);
                notifyAiToolSettingsChanged();
                return value;
            },
            getSspimgSettings: function () {
                return {
                    prompt: localStorage.getItem('ss_image_prompt') || '',
                    prompt2: localStorage.getItem('ss_image_prompt_2') || '',
                    ratio: localStorage.getItem('ss_image_ratio') || '1:1',
                    noText: localStorage.getItem('ss_image_no_text') === 'true'
                };
            },
            saveSspimgSettings: function (settings) {
                const value = settings && typeof settings === 'object' ? settings : {};
                localStorage.setItem('ss_image_prompt', String(value.prompt || '').slice(0, 65536));
                localStorage.setItem('ss_image_prompt_2', String(value.prompt2 || '').slice(0, 65536));
                localStorage.setItem('ss_image_ratio', String(value.ratio || '1:1').slice(0, 16));
                localStorage.setItem('ss_image_no_text', value.noText === true ? 'true' : 'false');
                notifyAiToolSettingsChanged();
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
    const aiSidebarScriptVersion = '20260824-lm-load-1';
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
        const upgradeScript = document.createElement('script');
        try {
            const upgradeUrl = new URL('./sidebarAI/scholar-ai-upgrades.js', base);
            upgradeUrl.searchParams.set('v', aiSidebarScriptVersion);
            upgradeScript.src = upgradeUrl.href;
        } catch (e) {
            upgradeScript.src = './sidebarAI/scholar-ai-upgrades.js?v=' + aiSidebarScriptVersion;
        }
        upgradeScript.charset = 'utf-8';
        upgradeScript.onerror = function () { showToast('Failed to load ScholarAI upgrades'); };
        upgradeScript.onload = function () {
            injectSidebarAIHtml().then(function (ok) {
                if (ok !== false && typeof window.sidebarAIInit === 'function') window.sidebarAIInit();
                if (ok !== false && typeof window.scholarAIUpgradeInit === 'function') window.scholarAIUpgradeInit();
            });
        };
        document.body.appendChild(upgradeScript);
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
        refreshLucideIcons(inner);
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
    loadOpenAICompatibleSettingsUI(settings);
    loadOllamaSettingsToUI();
    loadLiteRTLMSettingsToUI();
    const googleCalendarEnabled = settings && typeof settings.googleCalendarEnabled === 'boolean'
        ? settings.googleCalendarEnabled
        : getGoogleCalendarEnabledFromLocal();
    setGoogleCalendarEnabledToLocal(googleCalendarEnabled);
    const googleCalendarCheck = document.getElementById('google-calendar-enabled');
    if (googleCalendarCheck) googleCalendarCheck.checked = googleCalendarEnabled;
    applyGoogleCalendarVisibility(googleCalendarEnabled);
    loadGoogleCalendarOptionsUI(settings);
    loadScholarAIProviderSettingsUI(settings);
    if (!settings) {
        const imageCheckEmpty = document.getElementById('image-upload-enabled');
        if (imageCheckEmpty) imageCheckEmpty.checked = false;
        const highlightCheckEmpty = document.getElementById('highlight-visible');
        if (highlightCheckEmpty) highlightCheckEmpty.checked = false;
        const sitesCheckEmpty = document.getElementById('sites-visible');
        if (sitesCheckEmpty) sitesCheckEmpty.checked = false;
        const macroCheckEmpty = document.getElementById('macro-visible');
        if (macroCheckEmpty) macroCheckEmpty.checked = false;
        const templateCheckEmpty = document.getElementById('template-visible');
        if (templateCheckEmpty) templateCheckEmpty.checked = false;
        const templateNewFileCheckEmpty = document.getElementById('template-new-file-visible');
        if (templateNewFileCheckEmpty) templateNewFileCheckEmpty.checked = false;
        const noteCoverInsertCheckEmpty = document.getElementById('note-cover-insert-visible');
        if (noteCoverInsertCheckEmpty) noteCoverInsertCheckEmpty.checked = false;
        const pdfMergeCheckEmpty = document.getElementById('pdf-merge-visible');
        if (pdfMergeCheckEmpty) pdfMergeCheckEmpty.checked = false;
        const chromeSplitTabCheckEmpty = document.getElementById('chrome-split-tab-visible');
        if (chromeSplitTabCheckEmpty) chromeSplitTabCheckEmpty.checked = false;
        const html2pptCheckEmpty = document.getElementById('html2ppt-visible');
        if (html2pptCheckEmpty) html2pptCheckEmpty.checked = false;
        const html2pptNameCheckEmpty = document.getElementById('html2ppt-name-visible');
        if (html2pptNameCheckEmpty) html2pptNameCheckEmpty.checked = false;
        const fmaViewerCheckEmpty = document.getElementById('fma-viewer-visible');
        if (fmaViewerCheckEmpty) fmaViewerCheckEmpty.checked = false;
        const fmaViewerNameCheckEmpty = document.getElementById('fma-viewer-name-visible');
        if (fmaViewerNameCheckEmpty) fmaViewerNameCheckEmpty.checked = false;
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
        applyViewPadding(getViewPaddingFromLocal());
        const imageInputEmpty = document.getElementById('ai-imgbb-api-key');
        if (imageInputEmpty) imageInputEmpty.value = '';
        const openaiInputEmpty = document.getElementById('openai-api-key');
        if (openaiInputEmpty) openaiInputEmpty.value = getProtectedAiCredential('openai', 'ss_openai_api_key');
        const sqliteEnabledEmpty = document.getElementById('sqlite-enabled');
        if (window.SettingUI && typeof window.SettingUI.syncSqliteCheckbox === 'function') {
            window.SettingUI.syncSqliteCheckbox(false);
        } else if (sqliteEnabledEmpty) {
            sqliteEnabledEmpty.checked = false;
        }
        const localEnabledEmpty = document.getElementById('local-storage-enabled');
        if (localEnabledEmpty) localEnabledEmpty.checked = true;
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
        const defaultVerified = isAiAccessVerified(null);
        applyAiAuthenticationControlsVisibility(defaultVerified);
        updateAiScholarSspimgAvailability(defaultVerified);
        sitesList = DEFAULT_SITES_LIST.slice();
        templateCustomList = [];
        renderSitesPanel();
        renderTemplatePanel();
        applyImageUploadFeatureVisibility({ imageUploadEnabled: false });
        if (window.ScholarSearchApp) window.ScholarSearchApp.applyVisibility({ scholarSearchVisible: false });
        applyHighlightVisibility({ highlightVisible: false });
        applyToDocsVisibility({ googleDocsUseEnabled: false, toDocsVisible: false, docSyncVisible: false });
        applySitesVisibility({ sitesVisible: false });
        applyMacroVisibility({ macroVisible: false });
        applyTemplateVisibility({ templateVisible: false });
        applyNoteCoverInsertVisibility({ noteCoverInsertVisible: false });
        applyPdfMergeVisibility({ pdfMergeVisible: false });
        applyChromeSplitTabVisibility({ chromeSplitTabVisible: false });
    applyHtml2pptVisibility({ html2pptVisible: false, html2pptNameVisible: false });
    applyFmaViewerVisibility({ fmaViewerVisible: false, fmaViewerNameVisible: false });
        applyAiUseFold(getAiUseFoldedFromLocal());
        applyAiChatSettingsFold(getAiChatSettingsFoldedFromLocal());
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
    const effectiveGeminiKey = settings.apiKey || getProtectedAiCredential('gemini', 'ss_gemini_api_key');
    if (apiInput) apiInput.value = effectiveGeminiKey;
    if (settings.apiKey) localStorage.setItem('ss_gemini_api_key', settings.apiKey);
    if (settings.imgbbApiKey) localStorage.setItem('ss_imgbb_api_key', settings.imgbbApiKey);
    else localStorage.removeItem('ss_imgbb_api_key');
    const deepseekInput = document.getElementById('deepseek-api-key');
    const deepseekBaseInput = document.getElementById('deepseek-base-url');
    const openaiInput = document.getElementById('openai-api-key');
    const deepseekState = getDeepseekApiState();
    if (deepseekInput) deepseekInput.value = settings.deepseekApiKey || deepseekState.key || getProtectedAiCredential('deepseek', 'ss_deepseek_api_key');
    if (deepseekBaseInput) deepseekBaseInput.value = settings.deepseekBaseUrl || deepseekState.baseUrl || 'https://api.deepseek.com';
    const deepseekMaxTokensInput = document.getElementById('deepseek-max-tokens');
    const deepseekTimeoutInput = document.getElementById('deepseek-timeout');
    const deepseekEffortInput = document.getElementById('deepseek-reasoning-effort');
    if (deepseekMaxTokensInput) deepseekMaxTokensInput.value = String(deepseekState.maxTokens);
    if (deepseekTimeoutInput) deepseekTimeoutInput.value = String(deepseekState.timeoutSeconds);
    if (deepseekEffortInput) deepseekEffortInput.value = deepseekState.reasoningEffort;
    if (openaiInput) openaiInput.value = settings.openaiApiKey || getOpenAIApiState().key || '';
    if (settings.openaiApiKey) localStorage.setItem('ss_openai_api_key', settings.openaiApiKey);
    const imageCheck = document.getElementById('image-upload-enabled');
    if (imageCheck) imageCheck.checked = settings.imageUploadEnabled === true;
    const highlightCheck = document.getElementById('highlight-visible');
    if (highlightCheck) highlightCheck.checked = settings.highlightVisible === true;
    const sitesCheck = document.getElementById('sites-visible');
    if (sitesCheck) sitesCheck.checked = settings.sitesVisible === true;
    const macroCheck = document.getElementById('macro-visible');
    if (macroCheck) macroCheck.checked = settings.macroVisible === true;
    const templateCheck = document.getElementById('template-visible');
    if (templateCheck) templateCheck.checked = settings.templateVisible === true;
    const templateNewFileCheck = document.getElementById('template-new-file-visible');
    if (templateNewFileCheck) templateNewFileCheck.checked = getTemplateNewFileVisibleFromSettings(settings);
    const noteCoverInsertCheck = document.getElementById('note-cover-insert-visible');
    if (noteCoverInsertCheck) noteCoverInsertCheck.checked = settings.noteCoverInsertVisible === true;
    const pdfMergeCheck = document.getElementById('pdf-merge-visible');
    if (pdfMergeCheck) pdfMergeCheck.checked = settings.pdfMergeVisible === true;
    const chromeSplitTabCheck = document.getElementById('chrome-split-tab-visible');
    if (chromeSplitTabCheck) chromeSplitTabCheck.checked = getChromeSplitTabVisibleFromSettings(settings);
    const html2pptCheck = document.getElementById('html2ppt-visible');
    if (html2pptCheck) html2pptCheck.checked = getHtml2pptVisibleFromSettings(settings);
    const html2pptNameCheck = document.getElementById('html2ppt-name-visible');
    if (html2pptNameCheck) html2pptNameCheck.checked = getHtml2pptNameVisibleFromSettings(settings);
    const fmaViewerCheck = document.getElementById('fma-viewer-visible');
    if (fmaViewerCheck) fmaViewerCheck.checked = getFmaViewerVisibleFromSettings(settings);
    const fmaViewerNameCheck = document.getElementById('fma-viewer-name-visible');
    if (fmaViewerNameCheck) fmaViewerNameCheck.checked = getFmaViewerNameVisibleFromSettings(settings);
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
    const viewPaddingValue = typeof settings.viewPadding === 'number'
        ? normalizeViewPadding(settings.viewPadding)
        : getViewPaddingFromLocal();
    applyViewPadding(viewPaddingValue);
    localStorage.setItem(VIEW_PADDING_KEY, String(viewPaddingValue));
    const imageKeyInput = document.getElementById('ai-imgbb-api-key');
    const effectiveImgbbKey = settings.imgbbApiKey || getProtectedAiCredential('imgbb', 'ss_imgbb_api_key');
    if (imageKeyInput) imageKeyInput.value = effectiveImgbbKey;
    if (window.SettingUI && typeof window.SettingUI.syncSqliteCheckbox === 'function') {
        window.SettingUI.syncSqliteCheckbox(settings.sqliteEnabled === true);
    } else {
        const sqliteEnabledCheck = document.getElementById('sqlite-enabled');
        if (sqliteEnabledCheck) sqliteEnabledCheck.checked = false;
    }
    const localEnabledCheck = document.getElementById('local-storage-enabled');
    if (localEnabledCheck) localEnabledCheck.checked = getLocalStorageFeatureEnabledFromSettings(settings);
    if (window.GoogleDocs && typeof window.GoogleDocs.loadGoogleDocsSettingsUI === 'function') {
        window.GoogleDocs.loadGoogleDocsSettingsUI(settings);
    }
    syncImgbbApiKeyInputs(effectiveImgbbKey);
    if (typeof validateApiKeyInputUI === 'function') validateApiKeyInputUI();
    if (typeof validateDeepseekApiKeyInputUI === 'function') validateDeepseekApiKeyInputUI();
    if (typeof validateDeepseekBaseUrlInputUI === 'function') validateDeepseekBaseUrlInputUI();
    if (typeof validateOpenAIApiKeyInputUI === 'function') validateOpenAIApiKeyInputUI();
    if (effectiveGeminiKey && isValidGoogleAiApiKey(effectiveGeminiKey)
        && localStorage.getItem('ss_gemini_api_key_verified') !== credentialFingerprint(effectiveGeminiKey)) {
        verifyAIStudioApiKeyConnection(effectiveGeminiKey).catch(function () {});
    }
    const deepseekKey = settings.deepseekApiKey || getDeepseekApiState().key;
    const deepseekBase = settings.deepseekBaseUrl || getDeepseekApiState().baseUrl;
    if (deepseekKey && isValidDeepseekAiKey(deepseekKey)
        && localStorage.getItem('ss_deepseek_api_key_verified') !== getDeepseekVerifiedToken(deepseekKey, deepseekBase)) {
        verifyDeepseekApiKeyConnection(deepseekKey, deepseekBase).catch(function () {});
    }
    const openaiKey = settings.openaiApiKey || getOpenAIApiState().key;
    if (openaiKey && isValidOpenAIApiKey(openaiKey)
        && localStorage.getItem('ss_openai_api_key_verified') !== credentialFingerprint(openaiKey)) {
        verifyOpenAIApiKeyConnection(openaiKey).catch(function () {});
    }
    const useCheck = document.getElementById('ai-use-checkbox');
    const section = document.getElementById('ai-password-section');
    if (useCheck) {
        if (settings.aiMasterEnabled === false) useCheck.checked = false;
        else useCheck.checked = isAiAccessVerified(settings);
    }
    if (section) section.classList.toggle('hidden', !useCheck || !useCheck.checked);
    const verified = isAiAccessVerified(settings);
    applyAiAuthenticationControlsVisibility(verified);
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
    const localStorageEl = document.getElementById('local-storage-enabled');
    const githubTokenEl = document.getElementById('github-token-input');
    const githubRepoEl = document.getElementById('github-repo-input');
    const githubBranchEl = document.getElementById('github-branch-input');
    const githubPullMaxEl = document.getElementById('github-pull-max-files-input');
    const githubDefaultPushPathEl = document.getElementById('github-default-push-path-input');
    if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
    if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
    if (githubEl) githubEl.checked = !!settings.githubEnabled;
    if (localStorageEl) localStorageEl.checked = getLocalStorageFeatureEnabledFromSettings(settings);
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
    if (window.ScholarSearchApp) window.ScholarSearchApp.applyVisibility(settings);
    applyToDocsVisibility(settings);
    applySitesVisibility(settings);
    applyMacroVisibility(settings);
    applyTemplateVisibility(settings);
    applyNoteCoverInsertVisibility(settings);
    applyPdfMergeVisibility(settings);
    applyHtml2pptVisibility(settings);
    applyFmaViewerVisibility(settings);
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyAiChatSettingsFold(getAiChatSettingsFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    applyEditToolsVisibilityByMode();
    if (window.ViewModeTextInput && typeof window.ViewModeTextInput.updateInteractionState === 'function') {
        window.ViewModeTextInput.updateInteractionState();
    }
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
    const localStorageEl = document.getElementById('local-storage-enabled');
    const verified = isAiAccessVerified(settings);
    if (settings) {
        if (useCheck) {
            if (settings.aiMasterEnabled === false) useCheck.checked = false;
            else useCheck.checked = isAiAccessVerified(settings);
        }
        if (scholarEl) scholarEl.checked = verified ? !!settings.scholarAI : false;
        if (sspimgEl) sspimgEl.checked = verified ? !!settings.sspimgAI : false;
        if (githubEl) githubEl.checked = !!settings.githubEnabled;
        if (localStorageEl) localStorageEl.checked = getLocalStorageFeatureEnabledFromSettings(settings);
    } else {
        if (scholarEl) scholarEl.checked = false;
        if (sspimgEl) sspimgEl.checked = false;
        if (githubEl) githubEl.checked = false;
        if (localStorageEl) localStorageEl.checked = true;
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
    const viewPaddingValue = settings && typeof settings.viewPadding === 'number'
        ? normalizeViewPadding(settings.viewPadding)
        : getViewPaddingFromLocal();
    applyViewPadding(viewPaddingValue);
    localStorage.setItem(VIEW_PADDING_KEY, String(viewPaddingValue));
    if (window.ViewModeTextInput && typeof window.ViewModeTextInput.updateInteractionState === 'function') {
        window.ViewModeTextInput.updateInteractionState();
    }
    sitesList = normalizeSitesList(settings && settings.sitesList);
    templateCustomList = normalizeTemplateCustomList(settings && settings.templateCustomList);
    renderSitesPanel();
    renderTemplatePanel();
    updateAiScholarSspimgAvailability(verified);
    applyImageUploadFeatureVisibility(settings || { imageUploadEnabled: false });
    if (window.ScholarSearchApp) window.ScholarSearchApp.applyVisibility(settings || { scholarSearchVisible: false });
    applyHighlightVisibility(settings || { highlightVisible: false });
    applyToDocsVisibility(settings || { toDocsVisible: false });
    applySitesVisibility(settings || { sitesVisible: false });
    applyMacroVisibility(settings || { macroVisible: false });
    applyTemplateVisibility(settings || { templateVisible: false });
    applyNoteCoverInsertVisibility(settings || { noteCoverInsertVisible: false });
    applyPdfMergeVisibility(settings || { pdfMergeVisible: false });
    applyChromeSplitTabVisibility(settings || { chromeSplitTabVisible: false });
    applyHtml2pptVisibility(settings || { html2pptVisible: false, html2pptNameVisible: false });
    applyFmaViewerVisibility(settings || { fmaViewerVisible: false, fmaViewerNameVisible: false });
    applyEditToolsVisibilityByMode();
    await applyGithubUiState(settings || { githubEnabled: false, githubCacheDocs: [] });
    await applyAiFeatureVisibility();
    await syncShareAddressSettingsToSqlite(settings || {}).catch(function (error) {
        console.warn('Share address SQLite visibility sync skipped:', error && error.message ? error.message : error);
    });
}

function openSettingsModal() {
    ensureInDbStatusUi();
    applyHeaderFileActionStyle(getHeaderFileActionStyle(), false);
    applyHeaderFeatureKeyStyle(getHeaderFeatureKeyStyle(), false);
    document.getElementById('settings-modal').classList.remove('hidden');
    const settingsBody = document.getElementById('settings-modal-body');
    if (settingsBody) settingsBody.scrollTop = 0;
    bindSettingsModalDrag();
    bindSettingsModalResize();
    applySettingsModalCompactUI();
    applySettingsModalFullscreenUI();
    updateSettingsModalResponsiveLayout();
    initializeSettingsContainerFolds();
    if (typeof syncPreviewPopupHeaderSettingsUi === 'function') syncPreviewPopupHeaderSettingsUi();
    applySettingsShortcutsFold(getSettingsShortcutsFoldedFromLocal());
    syncFileDownloadPrefixSettingUI();
    applyAiUseFold(getAiUseFoldedFromLocal());
    applyAiChatSettingsFold(getAiChatSettingsFoldedFromLocal());
    applyShareSettingsFold(getShareSettingsFoldedFromLocal());
    applyGithubSettingsFold(getGithubSettingsFoldedFromLocal());
    loadAiSettingsToUI();
    loadAIWritingStylePrompt();
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

const AI_WRITING_STYLE_PROMPT_KEY = 'mdpro_ai_writing_style_prompt_v1';
const DEFAULT_AI_WRITING_STYLE_PROMPT = [
    '다음 문체 지침을 모든 한국어 본문 작성과 문장 수정에 적용한다.',
    '상투적인 “-이다”, “-한다” 종결을 문장마다 반복하지 않는다. 문맥과 논리 기능에 따라 학술적 서술어를 다양하게 선택한다.',
    '이미 완료된 사건·변화·분석 결과는 과거형으로 기술한다. 예: “야기한다”보다 “야기하였다”, “기제로 작용한다”보다 “기제로 작용하였다”를 사용한다.',
    '가능성이나 해석은 단정하지 않고 “규명할 수 있다”, “정밀도를 높일 수 있다”, “가능성을 시사한다”와 같이 근거 수준에 맞추어 표현한다.',
    '강조가 필요한 경우 “명확히 지시한다는 점이다”, “중요한 의미를 갖는다”처럼 논점을 분명히 드러낸다.',
    '역할·기능은 “역할을 수행한다”, “기능을 수행한다”, 의미·가치는 “의미를 갖는다”, “중요성을 지닌다”, “핵심적 기반이 된다”로 표현할 수 있다.',
    '영향·효과는 “기여한다”, “영향을 미친다”, “효과를 나타낸다”를 사용하고, 지위·평가는 “자리매김한다”, “위상을 갖는다”, “전략적 자산으로 간주된다”, “핵심적 요소로 평가된다” 등으로 다양화한다.',
    '동일한 종결 표현을 가까운 문장 안에서 반복하지 않으며, 의미에 가장 정확한 서술어를 선택한다. 표현을 억지로 치환하거나 지나치게 장식하지 않는다.',
    '객관적이고 논리적인 학술 문체를 유지하고, 주장·근거·해석을 구분한다. 근거보다 강한 단정, 과장, 구어체, 불필요한 존댓말을 피한다.',
    '수식은 한글(HWP) 수식 입력을 고려하여 별도 요청이 없으면 복사 가능한 텍스트 형태로 제시한다.',
    '사용자가 특정 언어, 문체, 시제 또는 형식을 명시한 경우에는 해당 요청을 우선한다.'
].join('\n');

function getAIWritingStylePrompt() {
    try { return String(localStorage.getItem(AI_WRITING_STYLE_PROMPT_KEY) || '').trim() || DEFAULT_AI_WRITING_STYLE_PROMPT; }
    catch (_) { return DEFAULT_AI_WRITING_STYLE_PROMPT; }
}

function loadAIWritingStylePrompt() {
    const input = document.getElementById('ai-writing-style-prompt');
    if (input) input.value = getAIWritingStylePrompt();
}

function setAIWritingStylePromptFeedback(message, isError) {
    const feedback = document.getElementById('ai-writing-style-prompt-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.className = 'min-h-[1rem] text-[11px] ' + (isError ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400');
}

function saveAIWritingStylePrompt() {
    const input = document.getElementById('ai-writing-style-prompt');
    const value = input ? String(input.value || '').trim() : '';
    if (!value) { setAIWritingStylePromptFeedback('문체 프롬프트를 입력해 주세요.', true); return false; }
    try {
        localStorage.setItem(AI_WRITING_STYLE_PROMPT_KEY, value);
        setAIWritingStylePromptFeedback('문체 프롬프트를 저장했습니다. 다음 AI 요청부터 적용됩니다.', false);
        return true;
    } catch (_) {
        setAIWritingStylePromptFeedback('브라우저 저장소에 문체 프롬프트를 저장하지 못했습니다.', true);
        return false;
    }
}

function resetAIWritingStylePrompt() {
    const input = document.getElementById('ai-writing-style-prompt');
    if (input) input.value = DEFAULT_AI_WRITING_STYLE_PROMPT;
    try { localStorage.removeItem(AI_WRITING_STYLE_PROMPT_KEY); } catch (_) {}
    setAIWritingStylePromptFeedback('학술 문체 기본값을 복원했습니다.', false);
}

window.getAIWritingStylePrompt = getAIWritingStylePrompt;

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
    panel.classList.toggle('settings-modal-compact', settingsModalCompact && !settingsModalFullscreen);
    if (settingsModalFullscreen) {
        if (btn) btn.textContent = 'Dock';
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
        if (btn) btn.textContent = '\uD31D\uC5C5';
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
        if (btn) btn.textContent = 'Dock';
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
            btn.innerHTML = '<i data-lucide="square" class="w-4 h-4"></i>';
            btn.title = '전체화면 해제';
            refreshLucideIcons(btn);
        }
    } else {
        if (compactBtn) compactBtn.disabled = false;
        if (btn) {
            btn.innerHTML = '<i data-lucide="square" class="w-4 h-4"></i>';
            btn.title = '전체화면';
            refreshLucideIcons(btn);
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

async function openGithubRepositoryShortcut() {
    const repoInput = document.getElementById('github-repo-input');
    let repo = String(repoInput && repoInput.value ? repoInput.value : '').trim();
    if (!repo) {
        try {
            const settings = await getAiSettings();
            repo = String(settings && settings.githubRepo ? settings.githubRepo : '').trim();
        } catch (_) {}
    }
    repo = repo
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/[?#].*$/, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
    const parts = repo.split('/').filter(Boolean);
    if (parts.length !== 2 || !parts.every(function (part) { return /^[A-Za-z0-9_.-]+$/.test(part); })) {
        showToast('GitHub 저장소(owner/repo)를 먼저 설정하세요.');
        const githubSettings = document.getElementById('github-settings-wrap');
        if (githubSettings && typeof githubSettings.scrollIntoView === 'function') {
            githubSettings.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
    }
    window.open('https://github.com/' + parts.map(encodeURIComponent).join('/'), '_blank', 'noopener,noreferrer');
    return true;
}
function bindSettingsModalDrag() {
    if (settingsModalDragBound) return;
    settingsModalDragBound = true;
    const header = document.getElementById('settings-modal-header');
    const moveHandle = document.getElementById('settings-modal-move-handle');
    const panel = document.getElementById('settings-modal-panel');
    if (!header || !panel) return;
    const dragHandles = [moveHandle, header].filter(Boolean);
    const touchDragOptions = {
        ignoreSelector: 'button,input,textarea,select,a,label',
        canStart: function () { return !settingsModalFullscreen; },
        onStart: function () {
            panel.style.maxHeight = '90vh';
            document.body.classList.add('settings-modal-is-dragging');
        },
        onEnd: function () {
            document.body.classList.remove('settings-modal-is-dragging');
        }
    };
    dragHandles.forEach(function (handle) {
        enableTouchModalDrag(panel, handle, touchDragOptions);
    });

    const startMouseDrag = function (e) {
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
        document.body.classList.add('settings-modal-is-dragging');
        e.preventDefault();
    };
    dragHandles.forEach(function (handle) {
        handle.addEventListener('mousedown', startMouseDrag);
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
        document.body.classList.remove('settings-modal-is-dragging');
    });
}

async function openLocalStorageSettings() {
    const localStorageEl = document.getElementById('local-storage-enabled');
    if (localStorageEl) localStorageEl.checked = true;
    if (typeof onStorageFeatureCheckboxChange === 'function') onStorageFeatureCheckboxChange();
    if (typeof switchStorageSourceTab !== 'function') {
        showToast('Local 저장소 설정을 불러오지 못했습니다.');
        return false;
    }
    await switchStorageSourceTab('local');
    return currentStorageSourceTab === 'local';
}

function updateSettingsModalResponsiveLayout() {
    const panel = document.getElementById('settings-modal-panel');
    if (!panel) return;
    const isWide = settingsModalFullscreen || panel.clientWidth >= 840;
    const showActionLabels = panel.clientWidth >= 660;
    panel.classList.toggle('settings-modal-wide', isWide);
    panel.classList.toggle('settings-modal-actions-expanded', showActionLabels);
}

function bindSettingsModalResize() {
    if (settingsModalResizeBound) return;
    settingsModalResizeBound = true;
    const panel = document.getElementById('settings-modal-panel');
    const handle = document.getElementById('settings-modal-resize-handle');
    if (!panel || !handle) return;

    if (typeof ResizeObserver === 'function') {
        const responsiveObserver = new ResizeObserver(function () {
            updateSettingsModalResponsiveLayout();
        });
        responsiveObserver.observe(panel);
    }

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

function resetCodeAndCommentColorSettings() {
    const codeBgInput = document.getElementById('code-bg-color');
    const codeTextInput = document.getElementById('code-text-color');
    const commentLightInput = document.getElementById('comment-highlight-light-color');
    const commentDarkInput = document.getElementById('comment-highlight-dark-color');
    if (codeBgInput) codeBgInput.value = '#1e293b';
    if (codeTextInput) codeTextInput.value = '#f8fafc';
    if (commentLightInput) commentLightInput.value = DEFAULT_EDITOR_COMMENT_COLORS.light;
    if (commentDarkInput) commentDarkInput.value = DEFAULT_EDITOR_COMMENT_COLORS.dark;
    applyCodeColorSettings();
    applyMarkdownCommentColorSettings();
    showToast('코드 및 주석 색상을 기본값으로 초기화했습니다.');
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

function askStorageSaveLocation(origin, targetSource) {
    const modal = document.getElementById('storage-save-location-modal');
    const summary = document.getElementById('storage-save-location-summary');
    const detail = document.getElementById('storage-save-location-detail');
    const originButton = document.getElementById('storage-save-origin');
    const targetButton = document.getElementById('storage-save-target');
    const cancelButton = document.getElementById('storage-save-cancel');
    if (!modal || !summary || !detail || !originButton || !targetButton || !cancelButton) {
        return Promise.resolve('cancel');
    }

    const originLabel = getStorageSourceLabel(origin.source);
    const targetLabel = getStorageSourceLabel(targetSource);
    summary.textContent = '이 문서는 ' + originLabel + '에서 열었습니다.';
    detail.textContent = '원래 위치: ' + origin.location + '\n현재 선택한 저장소는 ' + targetLabel + '입니다. 저장할 위치를 선택하세요.';
    detail.style.whiteSpace = 'pre-line';
    originButton.textContent = '원래 위치(' + originLabel + ')';
    targetButton.textContent = targetLabel + '에 별도 저장';
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise(function (resolve) {
        let settled = false;
        const finish = function (choice) {
            if (settled) return;
            settled = true;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            originButton.onclick = null;
            targetButton.onclick = null;
            cancelButton.onclick = null;
            modal.onclick = null;
            document.removeEventListener('keydown', onKeyDown);
            resolve(choice);
        };
        const onKeyDown = function (event) {
            if (event.key === 'Escape') finish('cancel');
        };
        originButton.onclick = function () { finish('origin'); };
        targetButton.onclick = function () { finish('target'); };
        cancelButton.onclick = function () { finish('cancel'); };
        modal.onclick = function (event) {
            if (event.target === modal) finish('cancel');
        };
        document.addEventListener('keydown', onKeyDown);
        targetButton.focus();
    });
}

async function ensureDatabaseStorageMode(storageMode) {
    const requestedMode = storageMode === 'sqlite' ? 'sqlite' : 'indb';
    if (!window.MDPStorage || typeof window.MDPStorage.requestMode !== 'function') return false;
    if (getActiveStorageMode() !== requestedMode) {
        const state = await window.MDPStorage.requestMode(requestedMode);
        const actualMode = state && state.activeMode === 'sqlite' ? 'sqlite' : 'indb';
        if (actualMode !== requestedMode) throw new Error(getStorageSourceLabel(requestedMode) + ' 저장소로 전환하지 못했습니다.');
    }
    currentStorageSourceTab = requestedMode;
    setStorageSourceTabToLocal(requestedMode);
    if (typeof updateStorageSourceTabsUI === 'function') updateStorageSourceTabsUI();
    if (activeSidebarTab === 'files') await renderDBList();
    return true;
}

async function saveCurrentDocumentAsLocalFile() {
    if (window.electron && window.electron.ipcRenderer) return saveFileAs();
    if (typeof window.showSaveFilePicker !== 'function') {
        showToast('Local에 새 파일로 저장하려면 Chrome 또는 Edge의 파일 저장 기능이 필요합니다.');
        return false;
    }
    syncCurrentMarkdownFromEditor();
    const pickerOptions = {
        suggestedName: getSaveCandidateFileName(),
        types: [{ description: 'Markdown 문서', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }]
    };
    const rootHandle = window.LocalFolderExplorer && typeof window.LocalFolderExplorer.getRootHandle === 'function'
        ? window.LocalFolderExplorer.getRootHandle()
        : null;
    if (rootHandle) pickerOptions.startIn = rootHandle;
    try {
        const handle = await window.showSaveFilePicker(pickerOptions);
        setCurrentDocumentInfo(handle.name || getSaveCandidateFileName(), null, {
            source: 'local-folder',
            localFileHandle: handle,
            localFolderPath: handle.name || getSaveCandidateFileName()
        });
        return saveCurrentLocalFile();
    } catch (error) {
        if (error && error.name === 'AbortError') return false;
        showToast('Local 파일 저장 위치를 열지 못했습니다: ' + (error && error.message ? error.message : error));
        return false;
    }
}

async function saveToSelectedStorage(targetSource) {
    if (targetSource === 'local') {
        if (currentLocalFileRef || (currentFilePath && window.electron && window.electron.ipcRenderer)) {
            return currentLocalFileRef ? saveCurrentLocalFile() : saveCurrentFile();
        }
        return saveCurrentDocumentAsLocalFile();
    }
    if (targetSource === 'github') {
        if (typeof window.pushCurrentContentToGithub !== 'function') {
            showToast('GitHub 저장 기능을 불러오지 못했습니다.');
            return false;
        }
        syncCurrentMarkdownFromEditor();
        return window.pushCurrentContentToGithub();
    }
    await ensureDatabaseStorageMode(targetSource);
    return openDatabaseSaveModal(targetSource);
}

async function saveToDB() {
    const origin = getCurrentDocumentStorageOrigin();
    const targetSource = getSelectedSaveStorageSource();
    if (origin && origin.source !== targetSource) {
        const choice = await askStorageSaveLocation(origin, targetSource);
        if (choice === 'cancel') return false;
        return saveToSelectedStorage(choice === 'origin' ? origin.source : targetSource);
    }
    return saveToSelectedStorage(targetSource);
}

async function openDatabaseSaveModal(storageModeInput, options) {
    const storageMode = storageModeInput === 'sqlite' ? 'sqlite' : 'indb';
    const saveAs = !!(options && options.saveAs);

    const modal = document.getElementById('save-modal');
    const titleEl = document.querySelector('#save-modal h3');
    const labelEl = document.querySelector('#save-modal label');
    const input = document.getElementById('save-title-input');
    if (!modal || !input) return;

    const storageLabel = getStorageModeLabel(storageMode);
    if (titleEl) titleEl.textContent = saveAs ? 'Save As to inDB' : 'Save to ' + storageLabel;
    if (labelEl) labelEl.textContent = saveAs
        ? '새 inDB 문서의 이름을 입력하세요. 원본 문서는 변경되지 않습니다.'
        : 'Enter a title for the ' + storageLabel + ' document.';

    let defaultTitle = currentFileName.replace(/\.(md|markdown|mdown|txt|html|htm|json|mdd|mpv|docx)$/i, '');
    const selected = getSelectedTextForSave();
    if (selected) defaultTitle = selected;
    input.value = defaultTitle || 'Untitled';

    currentActionCallback = async (title) => {
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle || !window.MDPStorage) return;
        syncCurrentMarkdownFromEditor();

        try {
            const docs = await window.MDPStorage.listDocuments({ query: normalizedTitle, limit: 500 });
            const exactMatches = docs.filter(doc => String(doc.title || '').trim() === normalizedTitle);
            let resolvedTitle = normalizedTitle;
            let targetDoc = null;

            if (exactMatches.length > 0) {
                if (saveAs) {
                    resolvedTitle = getNextIndexedDbTitle(normalizedTitle, docs);
                } else {
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
            }

            let savedDoc;
            if (targetDoc) {
                const existing = await window.MDPStorage.getDocument(targetDoc.id);
                const updatePayload = {
                    ...existing,
                    title: resolvedTitle,
                    content: currentMarkdown,
                    folderId: existing && existing.folderId ? existing.folderId : 'root',
                    updatedAt: new Date()
                };
                if (storageMode === 'sqlite') updatePayload.expectedVersion = existing.version;
                savedDoc = await window.MDPStorage.updateDocument(targetDoc.id, updatePayload);
            } else {
                savedDoc = await window.MDPStorage.createDocument({
                    id: 'doc_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
                    title: resolvedTitle,
                    content: currentMarkdown,
                    folderId: 'root',
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }

            setCurrentDocumentRef(savedDoc, storageMode);
            if (storageMode === 'sqlite' && savedDoc && savedDoc.id) {
                await window.MDPStorage.confirmDocumentSaved(savedDoc.id);
                await window.MDPStorage.deleteRecoveryDraft('unsaved_current');
            }
            if (window.GoogleDocs && typeof window.GoogleDocs.handleActiveDocumentChanged === 'function') {
                window.GoogleDocs.handleActiveDocumentChanged();
            }
            currentFileName = resolvedTitle + '.md';
            currentFilePath = null;
            updateCurrentDocumentDisplay();
            markPersistedState();
            showToast(targetDoc
                ? 'Existing ' + storageLabel + ' document overwritten.'
                : 'Saved to ' + storageLabel + ' as "' + resolvedTitle + '".');
            await revealSavedInDbDocument(savedDoc);
        } catch (error) {
            const prefix = error && error.code === 'VERSION_CONFLICT'
                ? 'Save conflict: '
                : 'Failed to save to ' + storageLabel + ': ';
            showToast(prefix + (error && error.message ? error.message : error));
        }
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.focus();
}

// Global exports for inline HTML handlers
window.toggleTheme = toggleTheme;
window.setMermaidDisplayMode = setMermaidDisplayMode;
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
window.toggleSaveDropdown = toggleSaveDropdown;
window.closeSaveDropdown = closeSaveDropdown;
window.saveCurrentDocumentAsNewFile = saveCurrentDocumentAsNewFile;
window.saveFileAs = saveFileAs;
window.exportCurrentDocumentByChoice = exportCurrentDocumentByChoice;
window.openPdfMergeWindow = openPdfMergeWindow;
window.printPage = printPage;
window.copyViewFormattedToClipboard = copyViewFormattedToClipboard;
window.getCurrentDbDocumentId = getCurrentDbDocumentId;
window.getCurrentFileGoogleDocId = getCurrentFileGoogleDocId;
window.setCurrentFileGoogleDocId = setCurrentFileGoogleDocId;
window.toggleSidebarVisibility = toggleSidebarVisibility;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.ensureRootFolder = ensureRootFolder;
window.createNewFolder = createNewFolder;
window.createDocumentInFolder = createDocumentInFolder;
window.deleteFolderFromDB = deleteFolderFromDB;
window.renameStoredDocument = renameStoredDocument;
window.saveToDB = saveToDB;
window.renderDBList = renderDBList;
window.scheduleStorageSearch = scheduleStorageSearch;
window.loadFromDB = loadFromDB;
window.deleteFromDB = deleteFromDB;
window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.moveDocToFolder = moveDocToFolder;
window.performAutoSave = performAutoSave;
window.__mdPerformanceDebug = Object.freeze({
    getAutoSaveStats: function () {
        return Object.assign({ pending: !!pendingAutoSaveKey }, autoSaveStats);
    },
    getRenderStats: function () {
        return Object.assign({}, renderPreparationStats);
    },
    getCoordinatorStats: function () {
        return renderCoordinator && typeof renderCoordinator.getStats === 'function'
            ? renderCoordinator.getStats()
            : null;
    },
    getOptionalScriptKeys: function () {
        return Array.from(optionalScriptLoads.keys());
    }
});
window.setLiveRenderInEditMode = setLiveRenderInEditMode;
window.checkAutoSave = checkAutoSave;
window.applyRecovery = applyRecovery;
window.dismissRecovery = dismissRecovery;
window.loadFromExternalContent = loadFromExternalContent;
window.pasteFromClipboardAndDismiss = pasteFromClipboardAndDismiss;
window.insertAtCursor = insertAtCursor;
window.toggleTextEmphasisQuickMenu = toggleTextEmphasisQuickMenu;
window.closeTextEmphasisQuickMenu = closeTextEmphasisQuickMenu;
window.toggleCodeQuoteQuickMenu = toggleCodeQuoteQuickMenu;
window.closeCodeQuoteQuickMenu = closeCodeQuoteQuickMenu;
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
window.setMainHeaderBackgroundRemoved = setMainHeaderBackgroundRemoved;
window.adjustEditorHorizontalShift = adjustEditorHorizontalShift;
window.resetEditorHorizontalShift = resetEditorHorizontalShift;
if (window.ScholarSearchApp && typeof window.ScholarSearchApp.connectHost === 'function') {
    window.ScholarSearchApp.connectHost({
        dbGetter: function () { return db; },
        getEditor: function () { return editorTextarea; },
        showToast: function (msg) { showToast(msg); },
        getEditorSelectedText: getEditorSelectedText,
        getDocumentBaseUrl: getDocumentBaseUrl,
        saveSettings: setAiSettings,
        syncHeaderVisibility: syncHeaderFeatureToolsVisibility
    });
}
window.toggleTemplatePanel = toggleTemplatePanel;
window.closeTemplatePanel = closeTemplatePanel;
window.toggleTemplateCompactMode = toggleTemplateCompactMode;
window.toggleTemplatePanelFullscreen = toggleTemplatePanelFullscreen;
window.onTemplateSelectChange = onTemplateSelectChange;
window.saveEditedTemplate = saveEditedTemplate;
window.addTemplateFromCurrentContent = addTemplateFromCurrentContent;
window.exportSelectedTemplateMd = exportSelectedTemplateMd;
window.triggerTemplateImportMd = triggerTemplateImportMd;
window.importTemplateMdFile = importTemplateMdFile;
window.insertSelectedTemplateToDocument = insertSelectedTemplateToDocument;
window.insertSelectedTemplateAsNewFile = insertSelectedTemplateAsNewFile;
window.toggleTemplateSection = toggleTemplateSection;
window.toggleNoteCoverInsertSection = toggleNoteCoverInsertSection;
window.insertDefaultNoteCover = insertDefaultNoteCover;
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
window.saveDeepseekApiKey = saveDeepseekApiKey;
window.validateDeepseekApiKeyInputUI = validateDeepseekApiKeyInputUI;
window.validateDeepseekBaseUrlInputUI = validateDeepseekBaseUrlInputUI;
window.saveOpenAIApiKey = saveOpenAIApiKey;
window.validateOpenAIApiKeyInputUI = validateOpenAIApiKeyInputUI;
window.toggleCredentialVisibility = toggleCredentialVisibility;
window.toggleAiPasswordSection = toggleAiPasswordSection;
window.toggleAiUseFold = toggleAiUseFold;
window.toggleAiChatSettingsFold = toggleAiChatSettingsFold;
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
window.applyNoteCoverTidyInEditor = applyNoteCoverTidyInEditor;
window.applyInline2RefFootnoteInEditor = applyInline2RefFootnoteInEditor;
window.applyInline2RefReferenceInEditor = applyInline2RefReferenceInEditor;
window.openTidyScriptManager = openTidyScriptManager;
window.convertBase64ImagesToInternalInEditor = convertBase64ImagesToInternalInEditor;
window.convertInternalImagesToBase64InEditor = convertInternalImagesToBase64InEditor;
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
window.toggleSettingsContainerFold = toggleSettingsContainerFold;
window.setAllSettingsContainersFolded = setAllSettingsContainersFolded;
window.isSettingsContainerFolded = isSettingsContainerFolded;
window.applySettingsContainerFold = applySettingsContainerFold;
window.toggleSettingsModalCompact = toggleSettingsModalCompact;
window.toggleSettingsModalFullscreen = toggleSettingsModalFullscreen;
window.openGithubRepositoryShortcut = openGithubRepositoryShortcut;
window.openLocalStorageSettings = openLocalStorageSettings;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeleteModal = confirmDeleteModal;
window.openSettingsModal = openSettingsModal;
window.focusGoogleCalendarSettings = focusGoogleCalendarSettings;
window.toggleGoogleCalendarSetting = toggleGoogleCalendarSetting;
window.openGoogleCalendarWindow = openGoogleCalendarWindow;
window.saveGoogleCalendarOptions = saveGoogleCalendarOptions;
window.openGoogleCalendarExternalWindow = openGoogleCalendarExternalWindow;
window.openGoogleCalendarAddWindow = openGoogleCalendarAddWindow;
window.closeGoogleCalendarInternalWindow = closeGoogleCalendarInternalWindow;
window.toggleGoogleCalendarInternalMaximize = toggleGoogleCalendarInternalMaximize;
window.onGoogleCalendarInternalFrameLoad = onGoogleCalendarInternalFrameLoad;
window.openGoogleCalendarSettingsFromInternal = openGoogleCalendarSettingsFromInternal;
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
window.resetSettingsMset = resetSettingsMset;
window.saveFileDownloadPrefixSetting = saveFileDownloadPrefixSetting;
window.resetFileDownloadPrefixSetting = resetFileDownloadPrefixSetting;
window.getMdProFilePrefix = getFileDownloadPrefixFromLocal;
window.applyCodeColorSettings = applyCodeColorSettings;
window.resetCodeColorSettings = resetCodeColorSettings;
window.applyMarkdownCommentColorSettings = applyMarkdownCommentColorSettings;
window.resetCodeAndCommentColorSettings = resetCodeAndCommentColorSettings;
window.clearUnusedCache = clearUnusedCache;
window.switchSidebarTab = switchSidebarTab;
window.openSqliteConflictResolver = openSqliteConflictResolver;
window.closeSqliteConflictResolver = closeSqliteConflictResolver;
window.moveSqliteConflict = moveSqliteConflict;
window.resolveSqliteConflict = resolveSqliteConflict;
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

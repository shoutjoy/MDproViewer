(function () {
    'use strict';

    const MOBILE_QUERY = '(max-width: 767px)';
    const EDIT_TOOLS_KEY = 'md_viewer_mobile_edit_tools_open_v1';
    const HEADER_FILE_MENU_KEY = 'md_viewer_mobile_header_file_menu_open_v1';
    const HEADER_FEATURE_MENU_KEY = 'md_viewer_mobile_header_feature_menu_open_v1';
    const ZOOM_CONTROLS_COLLAPSED_KEY = 'md_viewer_mobile_zoom_controls_collapsed_v1';
    const media = window.matchMedia(MOBILE_QUERY);
    let editToolsOpen = false;
    let headerFileMenuOpen = false;
    let headerFeatureMenuOpen = false;
    let zoomControlsCollapsed = false;

    function readEditToolsPreference() {
        try {
            return localStorage.getItem(EDIT_TOOLS_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function writeEditToolsPreference(open) {
        try {
            localStorage.setItem(EDIT_TOOLS_KEY, open ? '1' : '0');
        } catch (_) {}
    }

    function readBooleanPreference(key) {
        try {
            return localStorage.getItem(key) === '1';
        } catch (_) {
            return false;
        }
    }

    function writeBooleanPreference(key, open) {
        try {
            localStorage.setItem(key, open ? '1' : '0');
        } catch (_) {}
    }

    function isEditMode() {
        const editor = document.getElementById('content-viewport');
        return !!editor && !editor.classList.contains('hidden');
    }

    function button(className, label, icon, onClick) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = className;
        el.innerHTML = '<span class="mobile-dock-icon" aria-hidden="true">' + icon + '</span><span>' + label + '</span>';
        el.setAttribute('aria-label', label);
        el.addEventListener('click', onClick);
        return el;
    }

    function setSidebarOpen(open) {
        const sidebar = document.getElementById('sidebar');
        if (open && media.matches && sidebar && sidebar.classList.contains('sidebar-collapsed')
            && typeof window.toggleSidebarCollapse === 'function') {
            window.toggleSidebarCollapse();
        }
        document.body.classList.toggle('mobile-sidebar-open', !!open && media.matches);
        const menuButton = document.getElementById('mobile-ui-menu-button');
        if (menuButton) menuButton.setAttribute('aria-pressed', open ? 'true' : 'false');
    }

    function setHeaderGroupOpen(group, open, persist) {
        const isFile = group === 'file';
        if (isFile) headerFileMenuOpen = !!open;
        else headerFeatureMenuOpen = !!open;
        const currentOpen = isFile ? headerFileMenuOpen : headerFeatureMenuOpen;
        document.body.classList.toggle(isFile ? 'mobile-header-file-collapsed' : 'mobile-header-feature-collapsed', !currentOpen);
        const toggle = document.getElementById(isFile ? 'mobile-header-file-toggle' : 'mobile-header-feature-toggle');
        if (toggle) {
            toggle.setAttribute('aria-expanded', currentOpen ? 'true' : 'false');
            const label = isFile ? '파일' : '기능';
            toggle.textContent = currentOpen ? label + ' 접기 ▲' : label + ' 펼치기 ▼';
        }
        if (persist) writeBooleanPreference(isFile ? HEADER_FILE_MENU_KEY : HEADER_FEATURE_MENU_KEY, currentOpen);
    }

    function setEditToolsOpen(open, persist) {
        editToolsOpen = !!open;
        document.body.classList.toggle('mobile-edit-tools-collapsed', !editToolsOpen);
        const toggle = document.getElementById('mobile-edit-toolbar-toggle');
        if (toggle) {
            toggle.setAttribute('aria-expanded', editToolsOpen ? 'true' : 'false');
            toggle.textContent = editToolsOpen ? '접기 ▲' : '펼치기 ▼';
        }
        const tools = document.getElementById('edit-tools');
        if (tools) tools.setAttribute('aria-hidden', editToolsOpen ? 'false' : 'true');
        if (persist) writeEditToolsPreference(editToolsOpen);
    }

    function setReadingFocus(open) {
        document.body.classList.toggle('mobile-reading-focus', !!open);
        const focusButton = document.getElementById('mobile-ui-focus-button');
        if (focusButton) {
            focusButton.setAttribute('aria-pressed', open ? 'true' : 'false');
            const label = focusButton.querySelector('span:last-child');
            if (label) label.textContent = open ? '집중 종료' : '집중보기';
        }
    }

    function syncAiJenaState(detail) {
        const aiJena = document.getElementById('mobile-ui-ai-jena-button');
        if (!aiJena) return;
        let enabled = false;
        try {
            enabled = localStorage.getItem('ss_ai_chat_enabled') === '1';
        } catch (_) {}
        if (detail && typeof detail.enabled === 'boolean') enabled = detail.enabled;
        aiJena.classList.toggle('mobile-dock-ai-disabled', !enabled);
        const open = !!(window.AIChat && typeof window.AIChat.isOpen === 'function' && window.AIChat.isOpen());
        aiJena.setAttribute('aria-pressed', open ? 'true' : 'false');
    }

    function setZoomControlsCollapsed(collapsed, persist) {
        zoomControlsCollapsed = !!collapsed;
        document.body.classList.toggle('mobile-zoom-controls-collapsed', zoomControlsCollapsed);
        const toggle = document.getElementById('mobile-zoom-controls-toggle');
        if (toggle) {
            toggle.textContent = zoomControlsCollapsed ? '‹' : '›';
            toggle.title = zoomControlsCollapsed ? '확대/축소 메뉴 펼치기' : '확대/축소 메뉴 오른쪽으로 접기';
            toggle.setAttribute('aria-label', toggle.title);
            toggle.setAttribute('aria-expanded', zoomControlsCollapsed ? 'false' : 'true');
        }
        if (persist) writeBooleanPreference(ZOOM_CONTROLS_COLLAPSED_KEY, zoomControlsCollapsed);
    }

    function installZoomControlsToggle() {
        const controls = document.getElementById('footer-zoom-font');
        if (!controls || document.getElementById('mobile-zoom-controls-toggle')) return;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'mobile-zoom-controls-toggle';
        toggle.className = 'mobile-ui-only mobile-zoom-controls-toggle';
        toggle.addEventListener('click', function () {
            setZoomControlsCollapsed(!zoomControlsCollapsed, true);
        });
        controls.appendChild(toggle);
        setZoomControlsCollapsed(zoomControlsCollapsed, false);
    }

    function syncModeState() {
        const edit = isEditMode();
        document.body.classList.toggle('mobile-edit-mode', edit);
        const editButton = document.getElementById('mobile-ui-edit-button');
        const viewButton = document.getElementById('mobile-ui-view-button');
        if (editButton) editButton.setAttribute('aria-pressed', edit ? 'true' : 'false');
        if (viewButton) viewButton.setAttribute('aria-pressed', edit ? 'false' : 'true');
        if (!edit) setEditToolsOpen(false, false);
    }

    function changeMode(mode) {
        setReadingFocus(false);
        if (typeof window.toggleMode === 'function') window.toggleMode(mode);
        window.setTimeout(syncModeState, 0);
    }

    function createToolbarHead() {
        const toolbar = document.getElementById('toolbar');
        if (!toolbar || document.getElementById('mobile-edit-toolbar-head')) return;
        const head = document.createElement('div');
        head.id = 'mobile-edit-toolbar-head';
        head.className = 'mobile-ui-only mobile-edit-toolbar-head';
        head.innerHTML = '<span class="mobile-edit-toolbar-label">편집 메뉴</span>';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'mobile-edit-toolbar-toggle';
        toggle.className = 'mobile-edit-toolbar-toggle';
        toggle.setAttribute('aria-controls', 'edit-tools');
        toggle.addEventListener('click', function () {
            setEditToolsOpen(!editToolsOpen, true);
            syncModeState();
        });
        head.appendChild(toggle);
        toolbar.prepend(head);
    }

    function createHeaderMenuToggle() {
        const header = document.querySelector('.app-header');
        if (!header || document.getElementById('mobile-header-menu-head')) return;
        const desktopTitleRow = header.firstElementChild;
        if (desktopTitleRow) desktopTitleRow.classList.add('mobile-desktop-title-row');

        const head = document.createElement('div');
        head.id = 'mobile-header-menu-head';
        head.className = 'mobile-ui-only mobile-header-menu-head';
        head.innerHTML = '<span class="mobile-header-menu-label">상단 메뉴</span><div class="mobile-header-menu-buttons"></div>';
        const buttons = head.querySelector('.mobile-header-menu-buttons');

        const fileToggle = document.createElement('button');
        fileToggle.type = 'button';
        fileToggle.id = 'mobile-header-file-toggle';
        fileToggle.className = 'mobile-header-menu-toggle';
        fileToggle.setAttribute('aria-controls', 'mobile-header-file-group');
        fileToggle.addEventListener('click', function () {
            setHeaderGroupOpen('file', !headerFileMenuOpen, true);
        });

        const featureToggle = document.createElement('button');
        featureToggle.type = 'button';
        featureToggle.id = 'mobile-header-feature-toggle';
        featureToggle.className = 'mobile-header-menu-toggle';
        featureToggle.setAttribute('aria-controls', 'mobile-header-feature-group');
        featureToggle.addEventListener('click', function () {
            setHeaderGroupOpen('feature', !headerFeatureMenuOpen, true);
        });
        buttons.append(fileToggle, featureToggle);
        header.prepend(head);

        const actions = header.querySelector('.app-header-actions');
        if (!actions || document.getElementById('mobile-header-file-group')) return;
        const fileGroup = document.createElement('div');
        fileGroup.id = 'mobile-header-file-group';
        fileGroup.className = 'mobile-header-group mobile-header-file-group';
        const featureGroup = document.createElement('div');
        featureGroup.id = 'mobile-header-feature-group';
        featureGroup.className = 'mobile-header-group mobile-header-feature-group';
        const featureStart = actions.querySelector('#header-feature-tools-wrap');
        const children = Array.from(actions.children);
        let inFeatureGroup = false;
        children.forEach(function (child) {
            if (child === featureStart) inFeatureGroup = true;
            (inFeatureGroup ? featureGroup : fileGroup).appendChild(child);
        });
        actions.append(fileGroup, featureGroup);
    }

    function installSidebarCloseButton() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar || document.getElementById('mobile-sidebar-close-button')) return;
        const clearButton = sidebar.querySelector('button[onclick="clearUnusedCache()"]');
        if (!clearButton || !clearButton.parentElement) return;
        const close = document.createElement('button');
        close.type = 'button';
        close.id = 'mobile-sidebar-close-button';
        close.className = 'mobile-ui-only mobile-sidebar-close-button';
        close.innerHTML = '<span aria-hidden="true">✕</span><span>닫기</span>';
        close.setAttribute('aria-label', '문서 패널 닫기');
        close.addEventListener('click', function () { setSidebarOpen(false); });
        clearButton.parentElement.appendChild(close);
    }

    function createMobileDock() {
        if (document.getElementById('mobile-bottom-dock')) return;

        const backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = 'mobile-ui-only mobile-sidebar-backdrop';
        backdrop.setAttribute('aria-label', '사이드바 닫기');
        backdrop.addEventListener('click', function () { setSidebarOpen(false); });
        document.body.appendChild(backdrop);

        const dock = document.createElement('nav');
        dock.id = 'mobile-bottom-dock';
        dock.className = 'mobile-ui-only mobile-bottom-dock no-print';
        dock.setAttribute('aria-label', '모바일 빠른 메뉴');

        const menu = button('mobile-dock-button', '문서', '☰', function () {
            setSidebarOpen(!document.body.classList.contains('mobile-sidebar-open'));
        });
        menu.id = 'mobile-ui-menu-button';

        const edit = button('mobile-dock-button', '편집', '✎', function () { changeMode('edit'); });
        edit.id = 'mobile-ui-edit-button';

        const view = button('mobile-dock-button', '보기', '▤', function () { changeMode('view'); });
        view.id = 'mobile-ui-view-button';

        const preview = button('mobile-dock-button', 'PV', '▣', function () {
            if (typeof window.openPreviewPopupWindow === 'function') window.openPreviewPopupWindow();
        });
        preview.id = 'mobile-ui-preview-button';

        const focus = button('mobile-dock-button', '집중보기', '⛶', function () {
            const next = !document.body.classList.contains('mobile-reading-focus');
            if (next && isEditMode() && typeof window.toggleMode === 'function') window.toggleMode('view');
            setReadingFocus(next);
            window.setTimeout(syncModeState, 0);
        });
        focus.id = 'mobile-ui-focus-button';

        const theme = button('mobile-dock-button', '다크/라이트', '◐', function () {
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
            window.setTimeout(syncThemeState, 0);
        });
        theme.id = 'mobile-ui-theme-button';

        const settings = button('mobile-dock-button', '설정', '⚙', function () {
            if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
        });
        settings.id = 'mobile-ui-settings-button';

        const aiJena = button('mobile-dock-button', 'Jena', 'J', function () {
            if (typeof window.openAiJenaChat === 'function') window.openAiJenaChat();
        });
        aiJena.id = 'mobile-ui-ai-jena-button';
        aiJena.title = 'AI Jena 열기';

        dock.append(menu, edit, view, preview, focus, theme, settings, aiJena);
        document.body.appendChild(dock);
        syncAiJenaState();
    }

    function syncThemeState() {
        const theme = document.getElementById('mobile-ui-theme-button');
        if (!theme) return;
        const dark = document.documentElement.classList.contains('dark');
        theme.setAttribute('aria-pressed', dark ? 'true' : 'false');
        theme.setAttribute('title', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
    }

    function applyViewportMode() {
        document.body.classList.toggle('mobile-ui-active', media.matches);
        if (!media.matches) {
            setSidebarOpen(false);
            setReadingFocus(false);
            document.body.classList.remove('mobile-keyboard-open');
        }
        syncModeState();
    }

    function bindKeyboardAwareness() {
        if (!window.visualViewport) return;
        const update = function () {
            const keyboardOpen = media.matches && window.visualViewport.height < window.innerHeight * 0.72;
            document.body.classList.toggle('mobile-keyboard-open', keyboardOpen);
        };
        window.visualViewport.addEventListener('resize', update);
        window.visualViewport.addEventListener('scroll', update);
    }

    function init() {
        createHeaderMenuToggle();
        createToolbarHead();
        createMobileDock();
        zoomControlsCollapsed = readBooleanPreference(ZOOM_CONTROLS_COLLAPSED_KEY);
        installZoomControlsToggle();
        installSidebarCloseButton();
        editToolsOpen = readEditToolsPreference();
        headerFileMenuOpen = readBooleanPreference(HEADER_FILE_MENU_KEY);
        headerFeatureMenuOpen = readBooleanPreference(HEADER_FEATURE_MENU_KEY);
        setEditToolsOpen(editToolsOpen, false);
        setHeaderGroupOpen('file', headerFileMenuOpen, false);
        setHeaderGroupOpen('feature', headerFeatureMenuOpen, false);
        applyViewportMode();
        syncThemeState();
        bindKeyboardAwareness();

        window.addEventListener('ai-jena-enabled-change', function (event) {
            syncAiJenaState(event && event.detail);
        });
        window.addEventListener('ai-jena-layout-change', function (event) {
            syncAiJenaState(event && event.detail);
        });

        const editor = document.getElementById('content-viewport');
        const viewer = document.getElementById('viewer-container');
        if (window.MutationObserver && editor && viewer) {
            const observer = new MutationObserver(syncModeState);
            observer.observe(editor, { attributes: true, attributeFilter: ['class'] });
            observer.observe(viewer, { attributes: true, attributeFilter: ['class'] });
        }

        const sidebar = document.getElementById('sidebar');
        if (window.MutationObserver && sidebar) {
            const sidebarObserver = new MutationObserver(installSidebarCloseButton);
            sidebarObserver.observe(sidebar, { childList: true, subtree: true });
        }

        if (window.MutationObserver && document.documentElement) {
            const themeObserver = new MutationObserver(syncThemeState);
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }

        const onMediaChange = function () { applyViewportMode(); };
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onMediaChange);
        else if (typeof media.addListener === 'function') media.addListener(onMediaChange);

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape' || !media.matches) return;
            if (document.body.classList.contains('mobile-sidebar-open')) setSidebarOpen(false);
            else if (document.body.classList.contains('mobile-reading-focus')) setReadingFocus(false);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();

    window.MobileUI = {
        sync: syncModeState,
        toggleEditTools: function () {
            setEditToolsOpen(!editToolsOpen, true);
            syncModeState();
        },
        closeSidebar: function () { setSidebarOpen(false); },
        toggleHeaderFileMenu: function () { setHeaderGroupOpen('file', !headerFileMenuOpen, true); },
        toggleHeaderFeatureMenu: function () { setHeaderGroupOpen('feature', !headerFeatureMenuOpen, true); },
        toggleZoomControls: function () { setZoomControlsCollapsed(!zoomControlsCollapsed, true); }
    };
})();

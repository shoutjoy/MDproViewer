(function () {
    'use strict';

    const STORAGE_KEY = 'md_viewer_sidebar_width';
    const DEFAULT_WIDTH = 320;
    const MIN_WIDTH = 220;
    const COLLAPSED_WIDTH = 56;
    const MAX_WIDTH = 720;
    const MIN_CONTENT_WIDTH = 300;
    const NARROW_WIDTH = 188;
    const KEY_STEP = 16;
    let preferredWidth = DEFAULT_WIDTH;

    function numberOr(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function getMaxWidth(sidebar) {
        const parent = sidebar && sidebar.parentElement;
        const pWidth = parent ? parent.getBoundingClientRect().width : 0;
        const wWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
        const available = Math.max(pWidth, wWidth);
        const limit = Math.floor(available - MIN_CONTENT_WIDTH);
        return Math.max(DEFAULT_WIDTH, Math.min(MAX_WIDTH, limit));
    }

    function clampWidth(sidebar, width) {
        const maxWidth = getMaxWidth(sidebar);
        const parsed = numberOr(width, DEFAULT_WIDTH);
        return Math.max(MIN_WIDTH, Math.min(maxWidth, Math.round(parsed)));
    }

    function updateHandleValue(handle, width, maxWidth) {
        if (!handle) return;
        handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
        handle.setAttribute('aria-valuemax', String(maxWidth));
        handle.setAttribute('aria-valuenow', String(width));
        handle.setAttribute('aria-valuetext', width + '픽셀');
    }

    function applyWidth(sidebar, handle, width, options) {
        if (!sidebar) return DEFAULT_WIDTH;
        if (sidebar.classList.contains('sidebar-collapsed')) {
            sidebar.style.width = COLLAPSED_WIDTH + 'px';
            return COLLAPSED_WIDTH;
        }

        const nextWidth = clampWidth(sidebar, width);
        sidebar.style.width = nextWidth + 'px';
        sidebar.classList.toggle('sidebar-narrow', nextWidth <= NARROW_WIDTH);
        if (handle) updateHandleValue(handle, nextWidth, getMaxWidth(sidebar));

        if (!options || options.remember !== false) preferredWidth = nextWidth;
        if (options && options.persist) {
            try { localStorage.setItem(STORAGE_KEY, String(preferredWidth)); } catch (_) {}
        }
        try {
            window.dispatchEvent(new CustomEvent('md-viewer:sidebar-resized', {
                detail: { width: nextWidth, persisted: !!(options && options.persist) }
            }));
        } catch (_) {}
        return nextWidth;
    }

    function loadPreferredWidth() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const num = Number(raw);
            if (Number.isFinite(num) && num >= MIN_WIDTH && num <= MAX_WIDTH) {
                return num;
            }
            return DEFAULT_WIDTH;
        } catch (_) {
            return DEFAULT_WIDTH;
        }
    }

    function installSidebarResize() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar || sidebar.dataset.resizeReady === '1') return;

        if (window.SidebarLeft && typeof window.SidebarLeft.installSidebarShell === 'function') {
            window.SidebarLeft.installSidebarShell();
        }

        const handle = document.createElement('div');
        handle.id = 'sidebar-resize-handle';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', '왼쪽 사이드바 너비 조절');
        handle.setAttribute('title', '드래그하여 사이드바 너비 조절 · 더블클릭하여 기본 크기');
        handle.tabIndex = 0;
        sidebar.appendChild(handle);
        sidebar.dataset.resizeReady = '1';

        preferredWidth = loadPreferredWidth();
        applyWidth(sidebar, handle, preferredWidth, { remember: false });

        let activePointerId = null;
        let startX = 0;
        let startWidth = 0;

        function moveDrag(event) {
            if (event.pointerId !== activePointerId) return;
            event.preventDefault();
            applyWidth(sidebar, handle, startWidth + event.clientX - startX);
        }

        function finishDrag(event) {
            if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
            try { handle.releasePointerCapture(activePointerId); } catch (_) {}
            activePointerId = null;
            document.removeEventListener('pointermove', moveDrag);
            document.removeEventListener('pointerup', finishDrag);
            document.removeEventListener('pointercancel', finishDrag);
            handle.classList.remove('is-dragging');
            sidebar.classList.remove('sidebar-resizing');
            document.body.classList.remove('sidebar-resize-active');
            applyWidth(sidebar, handle, sidebar.getBoundingClientRect().width, { persist: true });
        }

        handle.addEventListener('pointerdown', function (event) {
            if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
            if (sidebar.classList.contains('sidebar-collapsed')) return;
            event.preventDefault();
            activePointerId = event.pointerId;
            startX = event.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            handle.classList.add('is-dragging');
            sidebar.classList.add('sidebar-resizing');
            document.body.classList.add('sidebar-resize-active');
            try { handle.setPointerCapture(activePointerId); } catch (_) {}
            document.addEventListener('pointermove', moveDrag, { passive: false });
            document.addEventListener('pointerup', finishDrag);
            document.addEventListener('pointercancel', finishDrag);
        });

        handle.addEventListener('dblclick', function (event) {
            event.preventDefault();
            preferredWidth = DEFAULT_WIDTH;
            applyWidth(sidebar, handle, DEFAULT_WIDTH, { persist: true });
        });

        handle.addEventListener('keydown', function (event) {
            if (sidebar.classList.contains('sidebar-collapsed')) return;
            let nextWidth = sidebar.getBoundingClientRect().width;
            const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
            if (event.key === 'ArrowLeft') nextWidth -= step;
            else if (event.key === 'ArrowRight') nextWidth += step;
            else if (event.key === 'Home') nextWidth = MIN_WIDTH;
            else if (event.key === 'End') nextWidth = getMaxWidth(sidebar);
            else return;
            event.preventDefault();
            applyWidth(sidebar, handle, nextWidth, { persist: true });
        });

        window.addEventListener('resize', function () {
            applyWidth(sidebar, handle, preferredWidth, { remember: false });
        });
    }

    window.SidebarResize = {
        install: installSidebarResize,
        storageKey: STORAGE_KEY,
        defaultWidth: DEFAULT_WIDTH,
        minWidth: MIN_WIDTH,
        maxWidth: MAX_WIDTH,
        narrowWidth: NARROW_WIDTH,
        loadWidth: loadPreferredWidth,
        reset: function () {
            const sidebar = document.getElementById('sidebar');
            const handle = document.getElementById('sidebar-resize-handle');
            preferredWidth = DEFAULT_WIDTH;
            try { localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH)); } catch (_) {}
            if (sidebar) {
                sidebar.classList.remove('sidebar-collapsed');
                sidebar.classList.remove('sidebar-narrow');
            }
            return applyWidth(sidebar, handle, DEFAULT_WIDTH, { persist: true });
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSidebarResize);
    else installSidebarResize();
})();

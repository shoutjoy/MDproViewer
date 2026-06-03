(function (global) {
    'use strict';

    var dragBound = false;
    var dragging = false;
    var dragOffsetX = 0;
    var dragOffsetY = 0;
    var pendingLeft = 0;
    var pendingTop = 0;
    var dragFrame = 0;

    function getPanel() {
        return document.getElementById('input-modal-panel');
    }

    function clampPanel(panel, left, top) {
        if (!panel) return { left: 0, top: 0 };
        var w = panel.offsetWidth || 360;
        var h = panel.offsetHeight || 260;
        return {
            left: Math.max(8, Math.min(window.innerWidth - w - 8, left)),
            top: Math.max(8, Math.min(window.innerHeight - h - 8, top))
        };
    }

    function centerPanel(panel) {
        if (!panel) return;
        panel.classList.add('input-modal-free');
        panel.style.transform = 'none';
        if (!panel.style.width) panel.style.width = (panel.offsetWidth || 464) + 'px';
        var rect = panel.getBoundingClientRect();
        var width = rect.width || panel.offsetWidth || 464;
        var height = rect.height || panel.offsetHeight || 320;
        var pos = clampPanel(panel, Math.round((window.innerWidth - width) / 2), Math.round((window.innerHeight - height) / 2));
        panel.style.left = pos.left + 'px';
        panel.style.top = pos.top + 'px';
    }

    function schedulePanelMove(panel, left, top) {
        var pos = clampPanel(panel, left, top);
        pendingLeft = pos.left;
        pendingTop = pos.top;
        if (dragFrame) return;
        dragFrame = requestAnimationFrame(function () {
            dragFrame = 0;
            var panelEl = getPanel();
            if (!panelEl) return;
            panelEl.style.left = pendingLeft + 'px';
            panelEl.style.top = pendingTop + 'px';
        });
    }

    function endDragging() {
        dragging = false;
        var panelEl = getPanel();
        if (panelEl) panelEl.classList.remove('input-modal-dragging');
        if (document.body) document.body.style.userSelect = '';
    }

    function bindMoveResize() {
        if (dragBound) return;
        dragBound = true;
        var panel = getPanel();
        var header = document.getElementById('input-modal-header');
        if (!panel || !header) return;

        header.addEventListener('pointerdown', function (e) {
            var target = e.target;
            if (target && target.closest && target.closest('button,input,a,select,textarea')) return;
            var rect = panel.getBoundingClientRect();
            panel.classList.add('input-modal-free');
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.transform = 'none';
            dragging = true;
            panel.classList.add('input-modal-dragging');
            if (document.body) document.body.style.userSelect = 'none';
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            if (header.setPointerCapture) header.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        document.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var panelEl = getPanel();
            if (!panelEl) return;
            schedulePanelMove(panelEl, e.clientX - dragOffsetX, e.clientY - dragOffsetY);
        });

        document.addEventListener('pointerup', endDragging);

        document.addEventListener('pointercancel', endDragging);

        window.addEventListener('resize', function () {
            var panelEl = getPanel();
            if (!panelEl || !panelEl.classList.contains('input-modal-free')) return;
            var rect = panelEl.getBoundingClientRect();
            var pos = clampPanel(panelEl, rect.left, rect.top);
            panelEl.style.left = pos.left + 'px';
            panelEl.style.top = pos.top + 'px';
        });
    }

    function setImagePanelToggleState() {
        var btn = document.getElementById('input-modal-image-panel-toggle');
        if (!btn) return;
        var imageModal = document.getElementById('image-insert-modal');
        var open = !!(imageModal && !imageModal.classList.contains('hidden'));
        btn.textContent = open ? '이미지 업로드 창 접기' : '이미지 업로드 창 열기';
    }

    function toggleImagePanel() {
        var imageModal = document.getElementById('image-insert-modal');
        var open = !!(imageModal && !imageModal.classList.contains('hidden'));
        if (open) {
            if (typeof global.closeImageInsertModal === 'function') global.closeImageInsertModal();
        } else {
            if (typeof global.openImageInsertModal === 'function') global.openImageInsertModal();
        }
        setImagePanelToggleState();
    }

    function open(mode, deps) {
        deps = deps || {};
        var inputModal = deps.inputModal || document.getElementById('input-modal');
        var editorTextarea = deps.editorTextarea || document.getElementById('viewer-edit-ta');
        if (!inputModal || !editorTextarea) return;

        var isLink = mode === 'link';
        var isImage = mode === 'image';
        var isId = mode === 'id';
        document.getElementById('modal-title').textContent = isLink ? 'Insert Link' : (isImage ? 'Insert Image' : 'Insert ID Anchor');
        document.getElementById('label-text').textContent = isLink ? 'Display text' : (isImage ? 'Image description' : 'ID');

        var shortcuts = document.getElementById('image-link-shortcuts');
        var urlWrap = document.getElementById('input-url-wrap');
        if (shortcuts) {
            if (isImage) {
                shortcuts.classList.remove('hidden');
                shortcuts.classList.add('flex');
            } else {
                shortcuts.classList.add('hidden');
                shortcuts.classList.remove('flex');
            }
        }
        if (urlWrap) urlWrap.classList.toggle('hidden', isId);

        var imagePanelFooter = document.getElementById('input-modal-image-panel-footer');
        if (imagePanelFooter) imagePanelFooter.classList.toggle('hidden', !isImage);

        document.getElementById('input-display-text').value = editorTextarea.value.substring(editorTextarea.selectionStart, editorTextarea.selectionEnd).trim();
        document.getElementById('input-url').value = isId ? '' : '';
        inputModal.classList.remove('hidden');
        inputModal.classList.add('flex');
        bindMoveResize();
        centerPanel(getPanel());
        setImagePanelToggleState();
        document.getElementById('input-display-text').focus();
    }

    function close(deps) {
        deps = deps || {};
        var inputModal = deps.inputModal || document.getElementById('input-modal');
        var editorTextarea = deps.editorTextarea || document.getElementById('viewer-edit-ta');
        if (inputModal) {
            inputModal.classList.add('hidden');
            inputModal.classList.remove('flex');
        }
        if (editorTextarea) editorTextarea.focus();
    }

    function confirm(deps) {
        deps = deps || {};
        var mode = deps.getMode ? deps.getMode() : 'link';
        var editorTextarea = deps.editorTextarea || document.getElementById('viewer-edit-ta');
        if (!editorTextarea) return '';

        var isId = mode === 'id';
        var displayText = document.getElementById('input-display-text').value || (mode === 'link' ? 'link text' : 'image');
        var url = document.getElementById('input-url').value || 'https://';
        var start = editorTextarea.selectionStart;
        var end = editorTextarea.selectionEnd;
        var currentScrollTop = editorTextarea.scrollTop;
        var replacement = '';

        if (isId) {
            var idValue = String(displayText || '').trim();
            if (!idValue) {
                if (typeof deps.showToast === 'function') deps.showToast('\u0049\u0044\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.');
                return '';
            }
            replacement = '<div id ="' + idValue + '"></div>\n[' + idValue + ']\n\n[' + idValue + '](#' + idValue + ')';
        } else {
            replacement = mode === 'link' ? '[' + displayText + '](' + url + ')' : '![' + displayText + '](' + url + ')';
        }

        editorTextarea.focus();
        editorTextarea.setSelectionRange(start, end);
        document.execCommand('insertText', false, replacement);
        close({ inputModal: deps.inputModal, editorTextarea: editorTextarea });
        editorTextarea.scrollTop = currentScrollTop;
        editorTextarea.setSelectionRange(start + replacement.length, start + replacement.length);
        if (typeof deps.onInserted === 'function') deps.onInserted(editorTextarea.value);
        return replacement;
    }

    global.LinkImageModal = {
        open: open,
        close: close,
        confirm: confirm,
        bindMoveResize: bindMoveResize,
        toggleImagePanel: toggleImagePanel,
        setImagePanelToggleState: setImagePanelToggleState
    };
})(window);

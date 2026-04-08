(function () {
    'use strict';

    const SHARE_DESTINATIONS = [
        { key: 'docs', label: 'docs.new', url: 'https://docs.new/', checkboxId: 'share-site-docs' },
        { key: 'gemini', label: 'gemini.new', url: 'https://gemini.google.com/app', checkboxId: 'share-site-gemini' },
        { key: 'colab', label: 'colab.new', url: 'https://colab.new/', checkboxId: 'share-site-colab' },
        { key: 'story', label: 'story.new', url: 'https://story.new/', checkboxId: 'share-site-story' },
        { key: 'sheets', label: 'sheets.new', url: 'https://sheets.new/', checkboxId: 'share-site-sheets' },
        { key: 'slides', label: 'slides.new', url: 'https://slides.new/', checkboxId: 'share-site-slides' },
        { key: 'gist', label: 'gist.new', url: 'https://gist.new/', checkboxId: 'share-site-gist' },
        { key: 'board', label: 'board.new', url: 'https://board.new', checkboxId: 'share-site-board' },
        { key: 'pdf2ppt', label: 'pdf to pptx', url: 'https://pdf2pptmake.onrender.com/', checkboxId: 'share-site-pdf2ppt' }
    ];
    const DEFAULT_SHARE_SITES = ['docs'];

    let toDocsVisible = false;
    let shareMenuExpanded = false;
    let shareSites = DEFAULT_SHARE_SITES.slice();
    let customShareDestinations = [];
    let shareModalDragBound = false;

    async function loadHtmlFragment(path) {
        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) return '';
            return await res.text();
        } catch (_) {
            return '';
        }
    }

    async function injectShareUiFragments() {
        let injected = false;

        const toolbarSlot = document.getElementById('google-share-toolbar-slot');
        if (toolbarSlot && !document.getElementById('btn-export-gdocs')) {
            const toolbarHtml = await loadHtmlFragment('./googleDocs/Share/share-toolbar.html');
            if (toolbarHtml) {
                toolbarSlot.innerHTML = toolbarHtml;
                injected = true;
            }
        }

        const settingsSlot = document.getElementById('google-share-settings-slot');
        if (settingsSlot && !document.getElementById('todocs-visible')) {
            const settingsHtml = await loadHtmlFragment('./googleDocs/Share/share-settings.html');
            if (settingsHtml) {
                settingsSlot.innerHTML = settingsHtml;
                injected = true;
            }
        }

        if (injected) {
            if (typeof getAiSettings === 'function') {
                const settings = await getAiSettings();
                if (settings) loadShareSettingsUI(settings);
                else applyToDocsVisibility({ toDocsVisible: false, shareSites: DEFAULT_SHARE_SITES.slice(), customShareDestinations: [] });
            } else {
                applyToDocsVisibility({ toDocsVisible: false, shareSites: DEFAULT_SHARE_SITES.slice(), customShareDestinations: [] });
            }
            if (typeof window.applyShareSettingsFold === 'function' && typeof window.getShareSettingsFoldedFromLocal === 'function') {
                window.applyShareSettingsFold(window.getShareSettingsFoldedFromLocal());
            }
        }
    }

    async function ensureShareUiReady() {
        if (document.getElementById('btn-export-gdocs') && document.getElementById('todocs-visible')) return;
        await injectShareUiFragments();
    }

    function setToDocsButtonBusy(busy) {
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        btn.disabled = !!busy;
        btn.classList.toggle('opacity-60', !!busy);
        btn.classList.toggle('cursor-not-allowed', !!busy);
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function getToDocsVisibleFromSettings(settings) {
        return !!(settings && settings.toDocsVisible === true);
    }

    function normalizeCustomShareDestinations(rawList) {
        const src = Array.isArray(rawList) ? rawList : [];
        const out = [];
        const seen = new Set();
        for (let i = 0; i < src.length; i += 1) {
            const item = src[i] || {};
            const keyRaw = String(item.key || '').trim();
            const label = String(item.label || item.name || '').trim();
            const urlRaw = String(item.url || '').trim();
            if (!urlRaw) continue;
            let url = urlRaw;
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            try { url = new URL(url).href; } catch (_) { continue; }
            const key = keyRaw || ('custom_' + Date.now() + '_' + i);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                key: key,
                label: label || url.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
                url: url,
                checkboxId: 'share-site-' + key.replace(/[^a-zA-Z0-9_-]/g, '_')
            });
        }
        return out;
    }

    function getAllShareDestinations() {
        return SHARE_DESTINATIONS.concat(customShareDestinations || []);
    }

    function getCustomShareDestinationsForSave() {
        return (customShareDestinations || []).map(function (item) {
            return { key: item.key, label: item.label, url: item.url };
        });
    }

    function renderCustomShareDestinationSettings() {
        const list = document.getElementById('share-custom-destinations-list');
        if (!list) return;
        list.innerHTML = '';
        if (!customShareDestinations.length) {
            const empty = document.createElement('p');
            empty.className = 'text-xs text-slate-500 dark:text-slate-400';
            empty.textContent = '추가된 대상이 없습니다.';
            list.appendChild(empty);
            return;
        }
        customShareDestinations.forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2';

            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0';

            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = item.checkboxId;
            check.className = 'rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500';
            check.addEventListener('change', function () { setTimeout(toggleShareSiteSelection, 0); });

            const text = document.createElement('span');
            text.className = 'text-sm font-medium text-slate-700 dark:text-slate-300 truncate';
            text.textContent = item.label;
            text.title = item.url;

            label.appendChild(check);
            label.appendChild(text);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'px-2 py-0.5 rounded border border-red-300 dark:border-red-700 text-[11px] text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20';
            del.textContent = 'x';
            del.title = '삭제';
            del.addEventListener('click', function () { removeCustomShareDestination(item.key); });

            row.appendChild(label);
            row.appendChild(del);
            list.appendChild(row);
        });
    }

    function normalizeShareSites(settings) {
        const s = settings || {};
        if (Array.isArray(s.shareSites)) {
            const allowed = new Set(getAllShareDestinations().map(function (item) { return item.key; }));
            return s.shareSites
                .map(function (value) { return String(value || '').trim(); })
                .filter(function (value, index, arr) {
                    return value && allowed.has(value) && arr.indexOf(value) === index;
                });
        }
        return DEFAULT_SHARE_SITES.slice();
    }

    function syncShareSiteCheckboxes(selectedKeys) {
        const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
        getAllShareDestinations().forEach(function (item) {
            const el = document.getElementById(item.checkboxId);
            if (el) el.checked = selected.has(item.key);
        });
    }

    function getSelectedShareDestinations() {
        const selected = new Set(Array.isArray(shareSites) ? shareSites : []);
        return getAllShareDestinations().filter(function (item) { return selected.has(item.key); });
    }

    function ensureShareLinksModalUi() {
        if (document.getElementById('share-links-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'share-links-modal';
        modal.className = 'fixed inset-0 hidden items-start justify-center z-[65] no-print pointer-events-none';
        modal.innerHTML = ''
            + '<div id="share-links-modal-panel" class="pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 w-auto min-w-[300px] max-w-[94vw] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4">'
            + '  <div id="share-links-modal-header" class="flex items-center justify-between mb-3 cursor-move select-none">'
            + '    <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">Share</h3>'
            + '    <div class="flex items-center gap-2">'
            + '      <button type="button" onclick="closeShareLinksModal()" class="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">Close</button>'
            + '    </div>'
            + '  </div>'
            + '  <div id="share-links-modal-list" class="flex flex-col items-start gap-2 max-h-[60vh] overflow-auto pr-1"></div>'
            + '</div>';
        document.body.appendChild(modal);
        bindShareLinksModalDrag();
    }

    function bindShareLinksModalDrag() {
        if (shareModalDragBound) return;
        const panel = document.getElementById('share-links-modal-panel');
        const header = document.getElementById('share-links-modal-header');
        if (!panel || !header) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', function (e) {
            const t = e.target;
            if (t && t.closest && t.closest('button,input,textarea,select,a')) return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            panel.style.transform = 'none';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
        });

        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - offsetX));
            const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - offsetY));
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
        });

        document.addEventListener('mouseup', function () {
            dragging = false;
        });

        shareModalDragBound = true;
    }

    function moveShareLinksModalToRightSide() {
        const panel = document.getElementById('share-links-modal-panel');
        if (!panel) return;
        const rightMargin = 16;
        const top = 100;
        panel.style.transform = 'none';
        panel.style.left = Math.max(8, window.innerWidth - panel.offsetWidth - rightMargin) + 'px';
        panel.style.top = Math.max(8, top) + 'px';
    }

    function optimizeShareLinksModalWidth() {
        const panel = document.getElementById('share-links-modal-panel');
        const header = document.getElementById('share-links-modal-header');
        const list = document.getElementById('share-links-modal-list');
        if (!panel || !list) return;
        const buttons = Array.from(list.querySelectorAll('.share-link-btn'));
        if (!buttons.length) return;

        let maxButtonWidth = 0;
        buttons.forEach(function (btn) {
            const w = Math.ceil(btn.scrollWidth || btn.getBoundingClientRect().width || 0);
            if (w > maxButtonWidth) maxButtonWidth = w;
        });
        const headerWidth = Math.ceil((header && header.scrollWidth) ? header.scrollWidth : 0);
        const listPadding = 28;
        const panelPadding = 24;
        const desired = Math.max(300, headerWidth + panelPadding, maxButtonWidth + listPadding + panelPadding);
        const maxAllowed = Math.max(300, Math.floor(window.innerWidth * 0.94));
        const width = Math.max(300, Math.min(desired, maxAllowed));
        panel.style.width = width + 'px';
    }

    function isShareLinksModalOpen() {
        const modal = document.getElementById('share-links-modal');
        return !!(modal && !modal.classList.contains('hidden'));
    }

    function closeShareLinksModal() {
        const modal = document.getElementById('share-links-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        shareMenuExpanded = false;
    }

    function renderShareLinksMenu() {
        ensureShareLinksModalUi();
        const list = document.getElementById('share-links-modal-list');
        if (!list) return;

        const inEditMode = (typeof isEditMode !== 'undefined' && isEditMode);
        const selectedDestinations = getSelectedShareDestinations();
        const canShow = !!toDocsVisible && !inEditMode && selectedDestinations.length > 0 && shareMenuExpanded;

        list.innerHTML = '';
        if (!canShow) {
            closeShareLinksModal();
            return;
        }

        selectedDestinations.forEach(function (dest) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'share-link-btn inline-flex items-center px-3 py-1.5 rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-slate-700 whitespace-nowrap';
            btn.textContent = dest.label;
            btn.title = dest.url;
            btn.addEventListener('click', function () {
                openShareDestination(dest.key);
            });
            list.appendChild(btn);
        });

        const modal = document.getElementById('share-links-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(function () {
                optimizeShareLinksModalWidth();
                moveShareLinksModalToRightSide();
            });
        }
    }

    function applyToDocsVisibility(settings) {
        const s = settings || {};
        const toDocsCheck = document.getElementById('todocs-visible');
        toDocsVisible = getToDocsVisibleFromSettings(s) || !!(toDocsCheck && toDocsCheck.checked);
        if (toDocsCheck) toDocsCheck.checked = !!toDocsVisible;
        customShareDestinations = normalizeCustomShareDestinations(s.customShareDestinations);
        renderCustomShareDestinationSettings();
        shareSites = normalizeShareSites(s);
        syncShareSiteCheckboxes(shareSites);

        const toDocsBtn = document.getElementById('btn-export-gdocs');
        const inEditMode = (typeof isEditMode !== 'undefined' && isEditMode);
        if (toDocsBtn) {
            if (!toDocsVisible || inEditMode) toDocsBtn.classList.add('hidden');
            else toDocsBtn.classList.remove('hidden');
            toDocsBtn.textContent = 'Share';
        }
        const shareSettingsBox = document.getElementById('share-destinations-settings');
        if (shareSettingsBox) shareSettingsBox.classList.toggle('hidden', !toDocsVisible);

        if (!toDocsVisible || inEditMode) shareMenuExpanded = false;
        renderShareLinksMenu();

        if (typeof window.applyShareSettingsFold === 'function' && typeof window.getShareSettingsFoldedFromLocal === 'function') {
            window.applyShareSettingsFold(window.getShareSettingsFoldedFromLocal());
        }
        if (window.GoogleDocs && typeof window.GoogleDocs.refreshDocSyncButtonVisibility === 'function') {
            window.GoogleDocs.refreshDocSyncButtonVisibility(s);
        }
    }

    async function toggleToDocsSection() {
        await ensureShareUiReady();
        const check = document.getElementById('todocs-visible');
        const enabled = !!(check && check.checked);
        if (typeof setAiSettings === 'function') await setAiSettings({ toDocsVisible: enabled });
        const s = (typeof getAiSettings === 'function') ? await getAiSettings() : null;
        applyToDocsVisibility(s || { toDocsVisible: enabled });
        if (!enabled) shareMenuExpanded = false;
        renderShareLinksMenu();
    }

    function findShareDestination(destKey) {
        const key = String(destKey || '').trim();
        if (!key) return null;
        const all = getAllShareDestinations();
        for (let i = 0; i < all.length; i += 1) {
            if (all[i].key === key) return all[i];
        }
        return null;
    }

    async function openShareDestination(destKey) {
        await ensureShareUiReady();
        const destination = findShareDestination(destKey);
        if (!destination) {
            if (typeof showToast === 'function') showToast('Share 대상이 올바르지 않습니다.');
            return;
        }
        setToDocsButtonBusy(true);
        try {
            let copied = true;
            if (typeof window.copyViewFormattedToClipboard === 'function') {
                copied = await window.copyViewFormattedToClipboard();
            }
            if (!copied && typeof showToast === 'function') showToast('Copy Styled 복사에 실패했습니다. 사이트는 계속 엽니다.');
            const win = window.open(destination.url, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
            if (win) closeShareLinksModal();
        } catch (err) {
            const msg = err && err.message ? err.message : 'Share 실행 중 오류';
            if (typeof showToast === 'function') showToast(msg + ' (사이트 열기는 계속 시도합니다.)');
            const win = window.open(destination.url, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
            if (win) closeShareLinksModal();
        } finally {
            setToDocsButtonBusy(false);
        }
    }

    async function toggleShareSiteSelection() {
        await ensureShareUiReady();
        const selectedKeys = getAllShareDestinations()
            .filter(function (item) {
                const el = document.getElementById(item.checkboxId);
                return !!(el && el.checked);
            })
            .map(function (item) { return item.key; });

        if (typeof setAiSettings === 'function') {
            await setAiSettings({
                shareSites: selectedKeys,
                customShareDestinations: getCustomShareDestinationsForSave()
            });
        }
        const settings = (typeof getAiSettings === 'function') ? await getAiSettings() : null;
        applyToDocsVisibility(settings || { shareSites: selectedKeys, customShareDestinations: getCustomShareDestinationsForSave() });
    }

    async function addShareDestinationFromSettings() {
        await ensureShareUiReady();
        const nameInput = document.getElementById('share-custom-name');
        const urlInput = document.getElementById('share-custom-url');
        const rawName = String(nameInput && nameInput.value ? nameInput.value : '').trim();
        const rawUrl = String(urlInput && urlInput.value ? urlInput.value : '').trim();
        if (!rawUrl) {
            if (typeof showToast === 'function') showToast('주소를 입력해주세요.');
            return;
        }
        let normalizedUrl = rawUrl;
        if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = 'https://' + normalizedUrl;
        try { normalizedUrl = new URL(normalizedUrl).href; } catch (_) {
            if (typeof showToast === 'function') showToast('유효한 주소를 입력해주세요.');
            return;
        }

        const exists = getAllShareDestinations().some(function (item) {
            return String(item.url || '').trim().toLowerCase() === normalizedUrl.toLowerCase();
        });
        if (exists) {
            if (typeof showToast === 'function') showToast('이미 등록된 주소입니다.');
            return;
        }

        const fallbackName = normalizedUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        const key = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const item = {
            key: key,
            label: rawName || fallbackName,
            url: normalizedUrl,
            checkboxId: 'share-site-' + key
        };
        customShareDestinations.push(item);
        if (!shareSites.includes(item.key)) shareSites.push(item.key);
        renderCustomShareDestinationSettings();
        syncShareSiteCheckboxes(shareSites);
        if (typeof setAiSettings === 'function') {
            await setAiSettings({
                shareSites: shareSites.slice(),
                customShareDestinations: getCustomShareDestinationsForSave()
            });
        }
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        if (typeof showToast === 'function') showToast('Share 대상이 추가되었습니다.');
    }

    async function removeCustomShareDestination(key) {
        const targetKey = String(key || '').trim();
        if (!targetKey) return;
        customShareDestinations = customShareDestinations.filter(function (item) { return item.key !== targetKey; });
        shareSites = shareSites.filter(function (k) { return k !== targetKey; });
        renderCustomShareDestinationSettings();
        syncShareSiteCheckboxes(shareSites);
        if (typeof setAiSettings === 'function') {
            await setAiSettings({
                shareSites: shareSites.slice(),
                customShareDestinations: getCustomShareDestinationsForSave()
            });
        }
    }

    async function toggleShareLinksMenu() {
        await ensureShareUiReady();
        if (!toDocsVisible) {
            shareMenuExpanded = false;
            renderShareLinksMenu();
            return;
        }
        if (isShareLinksModalOpen()) {
            shareMenuExpanded = false;
            renderShareLinksMenu();
            return;
        }

        setToDocsButtonBusy(true);
        try {
            let copied = true;
            if (typeof window.copyViewFormattedToClipboard === 'function') {
                copied = await window.copyViewFormattedToClipboard();
            }
            if (!copied && typeof showToast === 'function') showToast('Copy Styled 복사에 실패했습니다. Share 메뉴는 계속 엽니다.');
        } catch (err) {
            if (typeof showToast === 'function') showToast((err && err.message ? err.message : 'Copy Styled 실행 중 오류') + ' (Share 메뉴는 계속 엽니다.)');
        } finally {
            setToDocsButtonBusy(false);
        }

        shareMenuExpanded = true;
        renderShareLinksMenu();
    }

    function shouldShowInViewMode() {
        return !!toDocsVisible;
    }

    function resetShareSettingsUI() {
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = false;
        shareSites = DEFAULT_SHARE_SITES.slice();
        customShareDestinations = [];
        renderCustomShareDestinationSettings();
        syncShareSiteCheckboxes(shareSites);
        shareMenuExpanded = false;
        applyToDocsVisibility({ toDocsVisible: false, shareSites: shareSites, customShareDestinations: [] });
    }

    function loadShareSettingsUI(settings) {
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = !!(settings && settings.toDocsVisible === true);
        customShareDestinations = normalizeCustomShareDestinations(settings && settings.customShareDestinations);
        renderCustomShareDestinationSettings();
        shareSites = normalizeShareSites(settings || {});
        syncShareSiteCheckboxes(shareSites);
        applyToDocsVisibility(settings || { toDocsVisible: false, shareSites: shareSites, customShareDestinations: customShareDestinations });
    }

    window.ShareModule = {
        ensureShareUiReady,
        setToDocsButtonBusy,
        applyToDocsVisibility,
        toggleToDocsSection,
        toggleShareLinksMenu,
        closeShareLinksModal,
        moveShareLinksModalToRightSide,
        toggleShareSiteSelection,
        addShareDestinationFromSettings,
        removeCustomShareDestination,
        openShareDestination,
        shouldShowInViewMode,
        resetShareSettingsUI,
        loadShareSettingsUI
    };

    window.openShareDestination = openShareDestination;
    window.toggleShareLinksMenu = toggleShareLinksMenu;
    window.closeShareLinksModal = closeShareLinksModal;
    window.moveShareLinksModalToRightSide = moveShareLinksModalToRightSide;
    window.toggleShareSiteSelection = toggleShareSiteSelection;
    window.addShareDestinationFromSettings = addShareDestinationFromSettings;
    window.removeCustomShareDestination = removeCustomShareDestination;
    window.applyToDocsVisibility = applyToDocsVisibility;
    window.toggleToDocsSection = toggleToDocsSection;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            injectShareUiFragments();
        }, { once: true });
    } else {
        injectShareUiFragments();
    }
})();

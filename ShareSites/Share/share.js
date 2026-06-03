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
        { key: 'pdf2ppt', label: 'pdf to pptx', url: 'https://pdf2pptmake.onrender.com/', checkboxId: 'share-site-pdf2ppt' },
        { key: 'naverblog', label: 'NaverBlog', url: '', checkboxId: 'share-site-naverblog' }
    ];
    const DEFAULT_SHARE_SITES = ['docs', 'story', 'gist', 'board', 'naverblog'];

    let toDocsVisible = false;
    let shareMenuExpanded = false;
    let shareSites = DEFAULT_SHARE_SITES.slice();
    let customShareDestinations = [];
    let shareModalDragBound = false;

    function getNaverBlogIdFromSettings(settings) {
        return String(settings && settings.naverBlogId ? settings.naverBlogId : '').trim();
    }

    function getNaverBlogIdInput() {
        return document.getElementById('share-naverblog-id');
    }

    function buildNaverBlogWriteUrl(blogId) {
        const id = String(blogId || '').trim();
        if (!id) return '';
        return 'https://blog.naver.com/' + encodeURIComponent(id) + '?Redirect=Write';
    }

    function createPlainTextFromHtml(html) {
        try {
            const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
            return String(doc.body && (doc.body.innerText || doc.body.textContent) || '').trim();
        } catch (_) {
            return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    function transformHtmlForNaverBlog(html) {
        try {
            const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
            const blocks = doc.querySelectorAll('pre');
            blocks.forEach(function (pre) {
                const codeText = String(pre.innerText || pre.textContent || '').replace(/\r\n/g, '\n').trim();
                const table = doc.createElement('table');
                table.setAttribute('border', '1');
                table.style.borderCollapse = 'collapse';
                table.style.width = '100%';
                const tr = doc.createElement('tr');
                const td = doc.createElement('td');
                td.style.padding = '10px';
                td.style.verticalAlign = 'top';
                const code = doc.createElement('code');
                code.style.whiteSpace = 'pre-wrap';
                code.style.fontFamily = 'Consolas, Monaco, monospace';
                code.textContent = codeText;
                td.appendChild(code);
                tr.appendChild(td);
                table.appendChild(tr);
                pre.replaceWith(table);
            });
            return String(doc.body.innerHTML || html || '');
        } catch (_) {
            return String(html || '');
        }
    }

    async function saveNaverBlogId(value) {
        const next = String(value || '').trim();
        if (typeof setAiSettings === 'function') {
            await setAiSettings({ naverBlogId: next });
        }
        const input = getNaverBlogIdInput();
        if (input) input.value = next;
        return next;
    }

    async function ensureNaverBlogId() {
        let current = '';
        if (typeof getAiSettings === 'function') {
            try { current = getNaverBlogIdFromSettings(await getAiSettings()); } catch (_) {}
        }
        if (!current) {
            const input = getNaverBlogIdInput();
            current = String(input && input.value ? input.value : '').trim();
        }
        if (current) return current;
        const asked = window.prompt('네이버 블로그 ID를 입력하세요.', '');
        if (asked == null) return '';
        current = String(asked || '').trim();
        if (!current) return '';
        await saveNaverBlogId(current);
        return current;
    }

    async function loadHtmlFragment(path) {
        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) return '';
            return await res.text();
        } catch (_) {
            return '';
        }
    }

    function injectShareSettingsFallback(settingsSlot) {
        if (!settingsSlot) return;
        settingsSlot.innerHTML = ''
            + '<div class="flex items-center justify-between gap-2">'
            + '  <label class="flex items-center gap-2 cursor-pointer select-none">'
            + '    <input type="checkbox" id="todocs-visible" onclick="setTimeout(toggleToDocsSection,0)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500">'
            + '    <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Share 보이기</span>'
            + '  </label>'
            + '  <button type="button" id="share-settings-fold-btn" onclick="toggleShareSettingsFold()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" title="Share 설정 접기/펼치기">접기</button>'
            + '</div>'
            + '<div id="share-destinations-settings" class="pl-6 pt-1 space-y-2">'
            + '  <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">Share Destinations</p>'
            + '  <div id="share-destinations-settings-body" class="space-y-2"></div>'
            + '</div>';

        const body = settingsSlot.querySelector('#share-destinations-settings-body');
        if (!body) return;
        SHARE_DESTINATIONS.forEach(function (item) {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 cursor-pointer select-none';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = item.checkboxId;
            input.setAttribute('onclick', 'setTimeout(toggleShareSiteSelection,0)');
            input.className = 'rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500';
            const text = document.createElement('span');
            text.className = 'text-sm font-medium text-slate-700 dark:text-slate-300';
            text.textContent = item.label;
            label.appendChild(input);
            label.appendChild(text);
            body.appendChild(label);
        });

        const naverWrap = document.createElement('div');
        naverWrap.className = 'pl-6 space-y-2';
        naverWrap.innerHTML = ''
            + '<div class="flex items-center gap-2">'
            + '  <input type="text" id="share-naverblog-id" placeholder="네이버 블로그 ID" class="flex-1 min-w-[140px] px-2.5 py-1.5 border rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '  <button type="button" onclick="saveNaverBlogIdFromSettings()" class="px-2.5 py-1.5 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700">저장</button>'
            + '</div>'
            + '<p class="text-[11px] text-slate-500 dark:text-slate-400">Share에서 NaverBlog를 누를 때 사용할 ID입니다. 비어 있으면 실행 시 입력받습니다.</p>';
        body.appendChild(naverWrap);

        const addWrap = document.createElement('div');
        addWrap.className = 'pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2';
        addWrap.innerHTML = ''
            + '<p class="text-xs font-semibold text-slate-600 dark:text-slate-400">+Add</p>'
            + '<div class="flex items-center gap-2">'
            + '  <input type="text" id="share-custom-name" placeholder="이름 (예: research)" class="flex-1 min-w-[100px] px-2.5 py-1.5 border rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '  <input type="text" id="share-custom-url" placeholder="주소 (예: https://example.com)" class="flex-[1.4] min-w-[140px] px-2.5 py-1.5 border rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '  <button type="button" onclick="addShareDestinationFromSettings()" class="px-2.5 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700">+Add</button>'
            + '</div>'
            + '<div id="share-custom-destinations-list" class="space-y-1"></div>';
        body.appendChild(addWrap);
    }

    function injectShareToolbarFallback(toolbarSlot) {
        if (!toolbarSlot || document.getElementById('btn-export-gdocs')) return;
        toolbarSlot.innerHTML = ''
            + '<button type="button" id="btn-export-gdocs" onclick="toggleShareLinksMenu()"'
            + ' class="hidden px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 shrink-0 border border-emerald-300 dark:border-emerald-700"'
            + ' title="Show share destinations">Share</button>';
    }

    async function injectShareUiFragments() {
        let injected = false;

        const toolbarSlot = document.getElementById('google-share-toolbar-slot');
        if (toolbarSlot && !document.getElementById('btn-export-gdocs')) {
            const toolbarHtml = await loadHtmlFragment('./ShareSites/Share/share-toolbar.html');
            if (toolbarHtml) {
                toolbarSlot.innerHTML = toolbarHtml;
                injected = true;
            } else {
                injectShareToolbarFallback(toolbarSlot);
                injected = true;
            }
        }

        const settingsSlot = document.getElementById('google-share-settings-slot');
        if (settingsSlot && !document.getElementById('todocs-visible')) {
            const settingsHtml = await loadHtmlFragment('./ShareSites/Share/share-settings.html');
            if (settingsHtml) {
                settingsSlot.innerHTML = settingsHtml;
                injected = true;
            } else {
                injectShareSettingsFallback(settingsSlot);
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
            + '<div id="share-links-modal-panel" class="pointer-events-auto absolute top-24 left-4 w-[270px] min-w-[260px] max-w-[94vw] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4">'
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
        if (window.enableTouchModalDrag) {
            window.enableTouchModalDrag(panel, header);
        }

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
        panel.style.left = Math.max(8, window.innerWidth - Math.min(panel.offsetWidth || 270, 280) - rightMargin) + 'px';
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
        const desired = Math.max(260, headerWidth + panelPadding, maxButtonWidth + listPadding + panelPadding);
        const maxAllowed = Math.max(260, Math.min(280, Math.floor(window.innerWidth * 0.94)));
        const width = Math.max(260, Math.min(desired, maxAllowed));
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

        const selectedDestinations = getSelectedShareDestinations();
        const canShow = !!toDocsVisible && selectedDestinations.length > 0 && shareMenuExpanded;

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
            btn.title = dest.key === 'naverblog' ? 'https://blog.naver.com/{id}?Redirect=Write' : dest.url;
            btn.addEventListener('click', function () {
                openShareDestinationWithOptions(dest.key);
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
        const naverBlogIdInput = getNaverBlogIdInput();
        if (naverBlogIdInput) naverBlogIdInput.value = getNaverBlogIdFromSettings(s);

        const toDocsBtn = document.getElementById('btn-export-gdocs');
        if (toDocsBtn) {
            if (!toDocsVisible) {
                toDocsBtn.classList.add('hidden');
                toDocsBtn.style.display = 'none';
            } else {
                toDocsBtn.classList.remove('hidden');
                toDocsBtn.style.display = '';
            }
            toDocsBtn.textContent = 'Share';
        }
        const shareSettingsBox = document.getElementById('share-destinations-settings');
        if (shareSettingsBox) shareSettingsBox.classList.toggle('hidden', !toDocsVisible);

        if (!toDocsVisible) shareMenuExpanded = false;
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
        applyToDocsVisibility({ toDocsVisible: enabled });
        try {
            if (typeof setAiSettings === 'function') await setAiSettings({ toDocsVisible: enabled });
            const s = (typeof getAiSettings === 'function') ? await getAiSettings() : null;
            applyToDocsVisibility(s || { toDocsVisible: enabled });
        } catch (_) {
            applyToDocsVisibility({ toDocsVisible: enabled });
        }
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
            if (!copied && typeof showToast === 'function') showToast('서식 복사에 실패했습니다. 사이트 열기는 계속합니다.');
            const win = window.open(destination.url, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
            if (win) closeShareLinksModal();
        } catch (err) {
            const msg = err && err.message ? err.message : 'Share 실행 중 오류';
            if (typeof showToast === 'function') showToast(msg + ' (사이트 열기는 계속 시도합니다)');
            const win = window.open(destination.url, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
            if (win) closeShareLinksModal();
        } finally {
            setToDocsButtonBusy(false);
        }
    }

    async function openShareDestinationWithOptions(destKey) {
        await ensureShareUiReady();
        const destination = findShareDestination(destKey);
        if (!destination) {
            if (typeof showToast === 'function') showToast('Share 대상이 올바르지 않습니다.');
            return;
        }
        if (destination.key !== 'naverblog') {
            return openShareDestination(destKey);
        }

        setToDocsButtonBusy(true);
        try {
            const blogId = await ensureNaverBlogId();
            if (!blogId) {
                if (typeof showToast === 'function') showToast('네이버 블로그 ID가 필요합니다.');
                return;
            }
            const copied = typeof window.copyViewFormattedToClipboard === 'function'
                ? await window.copyViewFormattedToClipboard({
                    htmlTransform: transformHtmlForNaverBlog,
                    textTransform: function (_, __, transformedHtml) {
                        return createPlainTextFromHtml(transformedHtml);
                    },
                    successMessage: 'NaverBlog용 서식이 클립보드에 복사되었습니다.'
                })
                : true;
            if (!copied && typeof showToast === 'function') {
                showToast('클립보드 복사에 실패했습니다. 글쓰기는 계속합니다.');
            }
            const win = window.open(buildNaverBlogWriteUrl(blogId), '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') {
                showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
            }
            if (win) closeShareLinksModal();
        } catch (err) {
            const msg = err && err.message ? err.message : 'NaverBlog Share 실행 중 오류';
            if (typeof showToast === 'function') showToast(msg);
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
                customShareDestinations: getCustomShareDestinationsForSave(),
                naverBlogId: getNaverBlogIdInput() ? String(getNaverBlogIdInput().value || '').trim() : ''
            });
        }
        const settings = (typeof getAiSettings === 'function') ? await getAiSettings() : null;
        applyToDocsVisibility(settings || {
            shareSites: selectedKeys,
            customShareDestinations: getCustomShareDestinationsForSave(),
            naverBlogId: getNaverBlogIdInput() ? String(getNaverBlogIdInput().value || '').trim() : ''
        });
    }

    async function addShareDestinationFromSettings() {
        await ensureShareUiReady();
        const nameInput = document.getElementById('share-custom-name');
        const urlInput = document.getElementById('share-custom-url');
        const rawName = String(nameInput && nameInput.value ? nameInput.value : '').trim();
        const rawUrl = String(urlInput && urlInput.value ? urlInput.value : '').trim();
        if (!rawUrl) {
            if (typeof showToast === 'function') showToast('주소를 입력해 주세요.');
            return;
        }
        let normalizedUrl = rawUrl;
        if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = 'https://' + normalizedUrl;
        try { normalizedUrl = new URL(normalizedUrl).href; } catch (_) {
            if (typeof showToast === 'function') showToast('유효한 주소를 입력해 주세요.');
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
            if (!copied && typeof showToast === 'function') showToast('서식 복사에 실패했습니다. Share 메뉴는 계속 엽니다.');
        } catch (err) {
            if (typeof showToast === 'function') showToast((err && err.message ? err.message : '서식 복사 실행 중 오류') + ' (Share 메뉴는 계속 엽니다)');
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
        const naverBlogIdInput = getNaverBlogIdInput();
        if (naverBlogIdInput) naverBlogIdInput.value = '';
        shareSites = DEFAULT_SHARE_SITES.slice();
        customShareDestinations = [];
        renderCustomShareDestinationSettings();
        syncShareSiteCheckboxes(shareSites);
        shareMenuExpanded = false;
        applyToDocsVisibility({ toDocsVisible: false, shareSites: shareSites, customShareDestinations: [], naverBlogId: '' });
    }

    function loadShareSettingsUI(settings) {
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = !!(settings && settings.toDocsVisible === true);
        customShareDestinations = normalizeCustomShareDestinations(settings && settings.customShareDestinations);
        renderCustomShareDestinationSettings();
        shareSites = normalizeShareSites(settings || {});
        syncShareSiteCheckboxes(shareSites);
        const naverBlogIdInput = getNaverBlogIdInput();
        if (naverBlogIdInput) naverBlogIdInput.value = getNaverBlogIdFromSettings(settings || {});
        applyToDocsVisibility(settings || { toDocsVisible: false, shareSites: shareSites, customShareDestinations: customShareDestinations });
    }

    async function saveNaverBlogIdFromSettings() {
        await ensureShareUiReady();
        const input = getNaverBlogIdInput();
        const value = String(input && input.value ? input.value : '').trim();
        await saveNaverBlogId(value);
        if (typeof showToast === 'function') {
            showToast(value ? 'NaverBlog ID를 저장했습니다.' : 'NaverBlog ID를 비웠습니다.');
        }
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
        openShareDestination: openShareDestinationWithOptions,
        saveNaverBlogIdFromSettings,
        shouldShowInViewMode,
        resetShareSettingsUI,
        loadShareSettingsUI
    };

    window.openShareDestination = openShareDestinationWithOptions;
    window.toggleShareLinksMenu = toggleShareLinksMenu;
    window.closeShareLinksModal = closeShareLinksModal;
    window.moveShareLinksModalToRightSide = moveShareLinksModalToRightSide;
    window.toggleShareSiteSelection = toggleShareSiteSelection;
    window.addShareDestinationFromSettings = addShareDestinationFromSettings;
    window.removeCustomShareDestination = removeCustomShareDestination;
    window.applyToDocsVisibility = applyToDocsVisibility;
    window.toggleToDocsSection = toggleToDocsSection;
    window.saveNaverBlogIdFromSettings = saveNaverBlogIdFromSettings;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            injectShareUiFragments();
        }, { once: true });
    } else {
        injectShareUiFragments();
    }
})();



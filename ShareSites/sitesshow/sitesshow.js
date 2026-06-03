'use strict';

    let sitesPanelOpen = false;
    let sitesList = [];
    let sitesPanelCompact = false;
    let sitesPanelSettingsOpen = false;
    let sitesPanelDragBound = false;
    let sitesPanelDragging = false;
    let sitesPanelDragOffsetX = 0;
    let sitesPanelDragOffsetY = 0;
    let sitesPanelMoved = false;
    let sitesPanelResized = false;
    let sitesPanelResizeBound = false;
    let sitesPanelResizing = false;
    let sitesPanelSavedWidth = '';
    let sitesPanelSavedHeight = '';
    let editingSiteIndex = -1;

    const DEFAULT_SITES_LIST = [
        { name: 'data visualization', url: 'https://parkjoonghee.shinyapps.io/shinyapp2/' },
        { name: 'Serial Mediation effect', url: 'https://parkjoonghee.shinyapps.io/sobel/' },
        { name: 'LPA(Latent Profile Analysis)', url: 'https://parkjoonghee.shinyapps.io/LPA_plot/' },
        { name: 'WebR', url: 'https://webr.r-wasm.org/latest/' },
        { name: 'Posit R', url: 'https://posit.cloud/content/' },
        { name: 'NotebookLM', url: 'https://notebooklm.google.com/' },
        { name: 'rHWP', url: 'https://edwardkim.github.io/rhwp/' },
        { name: 'GeoGebra Calculator', url: 'https://www.geogebra.org/calculator' },
        { name: 'Napkin', url: 'https://app.napkin.ai/' },
        { name: 'Mermaid AI', url: 'https://mermaid.ai/' },
        { name: 'colab.new', url: 'http://colab.new' }
    ];

    async function loadHtmlFragment(path) {
        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) return '';
            return await res.text();
        } catch (_) {
            return '';
        }
    }

    async function injectSitesShowUiFragments() {
        let injected = false;

        const settingsSlot = document.getElementById('sites-settings-slot');
        if (settingsSlot && !document.getElementById('sites-visible')) {
            const settingsHtml = await loadHtmlFragment('./ShareSites/sitesshow/sitesshow-settings.html');
            if (settingsHtml) {
                settingsSlot.innerHTML = settingsHtml;
                injected = true;
            } else {
                // Fallback for environments where fragment fetch can fail.
                settingsSlot.innerHTML = [
                    '<label class="flex items-center gap-2 cursor-pointer select-none">',
                    '  <input type="checkbox" id="sites-visible" onclick="setTimeout(toggleSitesSection,0)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500">',
                    '  <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Sites 보이기</span>',
                    '</label>'
                ].join('');
                injected = true;
            }
        }

        const panelSlot = document.getElementById('sites-panel-slot');
        if (panelSlot && !document.getElementById('sites-panel')) {
            const panelHtml = await loadHtmlFragment('./ShareSites/sitesshow/sitesshow-panel.html');
            if (panelHtml) {
                panelSlot.innerHTML = panelHtml;
                injected = true;
            } else {
                panelSlot.innerHTML = [
                    '<div id="sites-panel" class="fixed bottom-3 right-3 hidden flex-col z-50 no-print w-[min(520px,94vw)] rounded-lg border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-sm overflow-hidden">',
                    '  <div id="sites-panel-header" class="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 cursor-move select-none">',
                    '    <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">Sites</h3>',
                    '    <div class="flex items-center gap-1">',
                    '      <button type="button" onclick="toggleSitesSettingsPanel()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">설정</button>',
                    '      <button type="button" id="sites-panel-compact-btn" onclick="toggleSitesCompactMode()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">>></button>',
                    '      <button type="button" onclick="closeSitesPanel()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">닫기</button>',
                    '    </div>',
                    '  </div>',
                    '  <div id="sites-panel-body" class="p-3 flex flex-col flex-1 min-h-0">',
                    '    <div id="sites-add-row" class="flex items-center gap-2 flex-wrap">',
                    '      <input type="text" id="sites-add-name-input" placeholder="보이기" class="flex-1 min-w-[120px] px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">',
                    '      <input type="url" id="sites-add-url-input" placeholder="주소 (https://example.com)" class="flex-[2] min-w-[180px] px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">',
                    '      <button type="button" id="sites-add-submit-btn" onclick="addSiteFromInput()" class="px-2.5 py-1.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs">+URL</button>',
                    '      <button type="button" id="sites-edit-cancel-btn" onclick="cancelEditSite()" class="hidden px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs">취소</button>',
                    '    </div>',
                    '    <div id="sites-list" class="space-y-1.5 flex-1 min-h-0 overflow-auto pr-1 mt-2"></div>',
                    '    <div id="sites-settings-wrap" class="hidden border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">',
                    '      <div class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Manage sites in settings</div>',
                    '      <div id="sites-list-settings" class="space-y-1.5 max-h-40 overflow-auto pr-1"></div>',
                    '    </div>',
                    '  </div>',
                    '  <div id="sites-panel-resizer" title="Resize" class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"></div>',
                    '</div>'
                ].join('');
                injected = true;
            }
        }

        if (injected) {
            renderSitesPanel();
            if (typeof getAiSettings === 'function') {
                const settings = await getAiSettings();
                const check = document.getElementById('sites-visible');
                if (check) check.checked = !!(settings && settings.sitesVisible === true);
                applySitesVisibility(settings || { sitesVisible: false });
                sitesList = normalizeSitesList(settings && settings.sitesList);
                renderSitesPanel();
            }
        }
    }

    async function ensureSitesShowUiReady() {
        if (document.getElementById('sites-visible') && document.getElementById('sites-panel')) return;
        await injectSitesShowUiFragments();
    }

    function getSitesVisibleFromSettings(settings) {
        if (!settings) return false;
        return settings.sitesVisible === true;
    }

    function normalizeSitesList(rawList) {
        const src = Array.isArray(rawList) ? rawList : [];
        const out = src
            .map(function (item) {
                const name = String(item && item.name ? item.name : '').trim();
                const url = String(item && item.url ? item.url : '').trim();
                return { name: name, url: url };
            })
            .filter(function (item) { return !!item.url; });

        const base = out.length ? out : DEFAULT_SITES_LIST.slice();
        function normalizeUrl(u) {
            return String(u || '').trim().toLowerCase().replace(/\/+$/, '');
        }
        const hasMermaidAi = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://mermaid.ai';
        });
        if (!hasMermaidAi) base.push({ name: 'Mermaid AI', url: 'https://mermaid.ai/' });
        const hasColabNew = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'http://colab.new' || u === 'https://colab.new';
        });
        if (!hasColabNew) base.push({ name: 'colab.new', url: 'http://colab.new' });
        const hasGeoGebraCalculator = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://www.geogebra.org/calculator' || u === 'https://geogebra.org/calculator';
        });
        if (!hasGeoGebraCalculator) base.push({ name: 'GeoGebra Calculator', url: 'https://www.geogebra.org/calculator' });
        const hasWebR = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://webr.r-wasm.org/latest' || u === 'http://webr.r-wasm.org/latest';
        });
        if (!hasWebR) base.push({ name: 'WebR', url: 'https://webr.r-wasm.org/latest/' });
        const hasPositR = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://posit.cloud/content' || u === 'https://posit.cloud';
        });
        if (!hasPositR) base.push({ name: 'Posit R', url: 'https://posit.cloud/content/' });
        const hasNapkin = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://app.napkin.ai' || u === 'http://app.napkin.ai';
        });
        if (!hasNapkin) base.push({ name: 'Napkin', url: 'https://app.napkin.ai/' });
        const hasNotebookLm = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://notebooklm.google.com' || u === 'http://notebooklm.google.com';
        });
        if (!hasNotebookLm) base.push({ name: 'NotebookLM', url: 'https://notebooklm.google.com/' });
        const hasRhwp = base.some(function (item) {
            const u = normalizeUrl(item && item.url ? item.url : '');
            return u === 'https://edwardkim.github.io/rhwp' || u === 'http://edwardkim.github.io/rhwp';
        });
        if (!hasRhwp) base.push({ name: 'rHWP', url: 'https://edwardkim.github.io/rhwp/' });
        return base;
    }

    function renderSitesPanel() {
        const listEl = document.getElementById('sites-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        sitesList.forEach(function (site, idx) {
            const btn = document.createElement('button');
            btn.type = 'button';
            if (sitesPanelCompact) {
                btn.className = 'inline-flex items-center px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs whitespace-nowrap w-auto shrink-0';
            } else {
                btn.className = 'w-full text-left px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs';
            }
            btn.textContent = site.name || site.url;
            btn.title = site.url;
            btn.onclick = function () { openSiteInNewWindow(site.url); };
            listEl.appendChild(btn);
        });
        renderSitesSettingsList();
    }

    function renderSitesSettingsList() {
        const listEl = document.getElementById('sites-list-settings');
        if (!listEl) return;
        listEl.innerHTML = '';
        sitesList.forEach(function (site, idx) {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2';

            const name = document.createElement('div');
            name.className = 'flex-1 text-[11px] text-slate-700 dark:text-slate-200 truncate';
            name.title = site.url;
            name.textContent = site.name || site.url;
            row.appendChild(name);

            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'px-2 py-1 rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-[11px]';
            edit.textContent = 'Edit';
            edit.onclick = function () { startEditSiteAt(idx); };
            row.appendChild(edit);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'px-2 py-1 rounded border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-[11px]';
            del.textContent = 'Delete';
            del.onclick = function () { removeSiteAt(idx); };
            row.appendChild(del);

            listEl.appendChild(row);
        });
    }

    function applySitesPanelMode() {
        const panel = document.getElementById('sites-panel');
        const list = document.getElementById('sites-list');
        const addRow = document.getElementById('sites-add-row');
        const compactBtn = document.getElementById('sites-panel-compact-btn');
        const resizer = document.getElementById('sites-panel-resizer');
        if (!panel || !list) return;

        if (sitesPanelCompact) {
            if (panel.style.width) sitesPanelSavedWidth = panel.style.width;
            if (panel.style.height) sitesPanelSavedHeight = panel.style.height;
            panel.style.left = '12px';
            panel.style.right = '12px';
            panel.style.bottom = '10px';
            panel.style.top = 'auto';
            panel.style.width = 'auto';
            panel.style.height = 'auto';
            panel.style.maxWidth = 'none';
            list.className = 'flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1';
            if (addRow) addRow.classList.add('hidden');
            if (compactBtn) compactBtn.textContent = '<<';
            if (resizer) resizer.style.display = 'none';
        } else {
            if (sitesPanelResized) {
                panel.style.width = sitesPanelSavedWidth || panel.style.width || '520px';
                panel.style.height = sitesPanelSavedHeight || panel.style.height || '';
                panel.style.maxWidth = 'none';
            } else {
                panel.style.width = '';
                panel.style.height = '';
                panel.style.maxWidth = '';
            }
            if (!sitesPanelMoved) {
                panel.style.left = '';
                panel.style.top = '';
                panel.style.right = '12px';
                panel.style.bottom = '12px';
            }
            list.className = 'space-y-1.5 flex-1 min-h-0 overflow-auto pr-1';
            if (addRow) addRow.classList.remove('hidden');
            if (compactBtn) compactBtn.textContent = '>>';
            if (resizer) resizer.style.display = '';
        }
        renderSitesPanel();
    }

    function toggleSitesCompactMode() {
        sitesPanelCompact = !sitesPanelCompact;
        applySitesPanelMode();
    }

    function toggleSitesSettingsPanel() {
        const wrap = document.getElementById('sites-settings-wrap');
        if (!wrap) return;
        sitesPanelSettingsOpen = !sitesPanelSettingsOpen;
        wrap.classList.toggle('hidden', !sitesPanelSettingsOpen);
    }

    function bindSitesPanelDrag() {
        if (sitesPanelDragBound) return;
        sitesPanelDragBound = true;
        const panel = document.getElementById('sites-panel');
        const header = document.getElementById('sites-panel-header');
        if (!panel || !header) return;
        if (window.enableTouchModalDrag) {
            window.enableTouchModalDrag(panel, header, {
                canStart: function () { return !sitesPanelCompact && !sitesPanelResizing; },
                onStart: function () {
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                },
                onMove: function () { sitesPanelMoved = true; }
            });
        }

        header.addEventListener('mousedown', function (e) {
            if (sitesPanelResizing) return;
            const target = e.target;
            if (target && target.closest && target.closest('button,input,textarea,select,a')) return;
            if (sitesPanelCompact) return;
            const rect = panel.getBoundingClientRect();
            sitesPanelDragging = true;
            sitesPanelDragOffsetX = e.clientX - rect.left;
            sitesPanelDragOffsetY = e.clientY - rect.top;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });
        document.addEventListener('mousemove', function (e) {
            if (sitesPanelResizing) return;
            if (!sitesPanelDragging || sitesPanelCompact) return;
            const x = Math.max(0, e.clientX - sitesPanelDragOffsetX);
            const y = Math.max(0, e.clientY - sitesPanelDragOffsetY);
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            sitesPanelMoved = true;
        });
        document.addEventListener('mouseup', function () {
            sitesPanelDragging = false;
        });
    }

    function bindSitesPanelResize() {
        if (sitesPanelResizeBound) return;
        sitesPanelResizeBound = true;
        const panel = document.getElementById('sites-panel');
        const handle = document.getElementById('sites-panel-resizer');
        if (!panel || !handle) return;

        handle.addEventListener('mousedown', function (e) {
            if (sitesPanelCompact) return;
            e.preventDefault();
            e.stopPropagation();
            sitesPanelResizing = true;
        });
        document.addEventListener('mousemove', function (e) {
            if (!sitesPanelResizing || sitesPanelCompact) return;
            const rect = panel.getBoundingClientRect();
            const minW = 320;
            const minH = 220;
            const maxW = Math.max(minW, window.innerWidth - rect.left - 8);
            const maxH = Math.max(minH, window.innerHeight - rect.top - 8);
            const nextW = Math.max(minW, Math.min(maxW, e.clientX - rect.left));
            const nextH = Math.max(minH, Math.min(maxH, e.clientY - rect.top));
            panel.style.width = Math.round(nextW) + 'px';
            panel.style.height = Math.round(nextH) + 'px';
            panel.style.maxWidth = 'none';
            sitesPanelSavedWidth = panel.style.width;
            sitesPanelSavedHeight = panel.style.height;
            sitesPanelResized = true;
        });
        document.addEventListener('mouseup', function () {
            sitesPanelResizing = false;
        });
    }

    function openSiteInNewWindow(url) {
        const u = String(url || '').trim();
        if (!u) return;
        const win = window.open(u, '_blank', 'noopener,noreferrer,width=1300,height=900');
        if (!win && typeof showToast === 'function') showToast('Popup blocked. Please allow popups for this site.');
    }

    function applySitesVisibility(settings) {
        const enabled = getSitesVisibleFromSettings(settings || {});
        const btn = document.getElementById('btn-sites-panel');
        if (btn) {
            if (enabled) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        }
        if (typeof syncHeaderScholarSearchWrapVisibility === 'function') {
            syncHeaderScholarSearchWrapVisibility();
        }
        if (!enabled) closeSitesPanel();
    }

    function openSitesPanel() {
        const panel = document.getElementById('sites-panel');
        if (!panel) return;
        bindSitesPanelDrag();
        bindSitesPanelResize();
        applySitesPanelMode();
        renderSitesPanel();
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        sitesPanelOpen = true;
    }

    function closeSitesPanel() {
        const panel = document.getElementById('sites-panel');
        if (!panel) return;
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        sitesPanelOpen = false;
    }

    function toggleSitesPanel() {
        if (sitesPanelOpen) closeSitesPanel();
        else openSitesPanel();
    }

    function buildSiteNameFromUrl(url) {
        try {
            const u = new URL(url);
            const base = (u.hostname || 'site').replace(/^www\./, '');
            return base;
        } catch (_) {
            return 'Custom Site';
        }
    }

    async function saveSitesListToSettings() {
        if (typeof setAiSettings !== 'function') return;
        await setAiSettings({ sitesList: sitesList.slice() });
    }

    function normalizeUrlForCompare(url) {
        return String(url || '').trim().toLowerCase().replace(/\/+$/, '');
    }

    function setSiteEditorMode(mode) {
        const addBtn = document.getElementById('sites-add-submit-btn');
        const cancelBtn = document.getElementById('sites-edit-cancel-btn');
        if (addBtn) addBtn.textContent = mode === 'edit' ? 'Save' : '+URL';
        if (cancelBtn) cancelBtn.classList.toggle('hidden', mode !== 'edit');
    }

    function clearSiteEditor() {
        const nameInput = document.getElementById('sites-add-name-input');
        const urlInput = document.getElementById('sites-add-url-input');
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        editingSiteIndex = -1;
        setSiteEditorMode('add');
    }

    function startEditSiteAt(index) {
        if (index < 0 || index >= sitesList.length) return;
        const site = sitesList[index] || {};
        const nameInput = document.getElementById('sites-add-name-input');
        const urlInput = document.getElementById('sites-add-url-input');
        if (!urlInput) return;
        if (nameInput) nameInput.value = String(site.name || '');
        urlInput.value = String(site.url || '');
        editingSiteIndex = index;
        setSiteEditorMode('edit');
        urlInput.focus();
        urlInput.select();
    }

    function cancelEditSite() {
        clearSiteEditor();
    }

    async function addSiteFromInput() {
        const nameInput = document.getElementById('sites-add-name-input');
        const urlInput = document.getElementById('sites-add-url-input');
        if (!urlInput) return;
        const raw = String(urlInput.value || '').trim();
        if (!raw) {
            if (typeof showToast === 'function') showToast('Enter a site URL first.');
            return;
        }
        let normalized = raw;
        if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
        try {
            const parsed = new URL(normalized);
            normalized = parsed.href;
        } catch (_) {
            if (typeof showToast === 'function') showToast('Invalid URL.');
            return;
        }
        const editing = editingSiteIndex >= 0 && editingSiteIndex < sitesList.length;
        const exists = sitesList.some(function (s, i) {
            if (editing && i === editingSiteIndex) return false;
            return normalizeUrlForCompare(s && s.url) === normalizeUrlForCompare(normalized);
        });
        if (exists) {
            if (typeof showToast === 'function') showToast('Site already exists.');
            return;
        }
        const displayName = String(nameInput && nameInput.value ? nameInput.value : '').trim() || buildSiteNameFromUrl(normalized);
        if (editing) {
            sitesList[editingSiteIndex] = { name: displayName, url: normalized };
        } else {
            sitesList.push({ name: displayName, url: normalized });
        }
        await saveSitesListToSettings();
        renderSitesPanel();
        clearSiteEditor();
        if (typeof showToast === 'function') showToast(editing ? 'Site updated.' : 'Site added.');
    }

    async function removeSiteAt(index) {
        if (index < 0 || index >= sitesList.length) return;
        if (editingSiteIndex === index) {
            clearSiteEditor();
        } else if (editingSiteIndex > index) {
            editingSiteIndex -= 1;
        }
        sitesList.splice(index, 1);
        if (!sitesList.length) sitesList = DEFAULT_SITES_LIST.slice();
        await saveSitesListToSettings();
        renderSitesPanel();
    }

    async function toggleSitesSection() {
        await ensureSitesShowUiReady();
        const check = document.getElementById('sites-visible');
        const enabled = !!(check && check.checked);
        applySitesVisibility({ sitesVisible: enabled });
        try {
            if (typeof setAiSettings === 'function') {
                await setAiSettings({ sitesVisible: enabled });
            }
            if (typeof getAiSettings === 'function') {
                const s = await getAiSettings();
                applySitesVisibility(s || { sitesVisible: enabled });
            } else {
                applySitesVisibility({ sitesVisible: enabled });
            }
        } catch (_) {
            applySitesVisibility({ sitesVisible: enabled });
        }
    }

    function getSitesList() {
        return sitesList.slice();
    }

    function setSitesList(nextList) {
        sitesList = normalizeSitesList(nextList);
        clearSiteEditor();
        renderSitesPanel();
    }

window.getSitesVisibleFromSettings = getSitesVisibleFromSettings;
window.normalizeSitesList = normalizeSitesList;
window.renderSitesPanel = renderSitesPanel;
window.applySitesVisibility = applySitesVisibility;
window.toggleSitesPanel = toggleSitesPanel;
window.closeSitesPanel = closeSitesPanel;
window.addSiteFromInput = addSiteFromInput;
window.cancelEditSite = cancelEditSite;
window.toggleSitesSection = toggleSitesSection;
window.toggleSitesCompactMode = toggleSitesCompactMode;
window.toggleSitesSettingsPanel = toggleSitesSettingsPanel;
window.getSitesList = getSitesList;
window.setSitesList = setSitesList;
window.getDefaultSitesList = function () { return DEFAULT_SITES_LIST.slice(); };
window.ensureSitesShowUiReady = ensureSitesShowUiReady;

ensureSitesShowUiReady();
document.addEventListener('DOMContentLoaded', ensureSitesShowUiReady);
window.addEventListener('load', ensureSitesShowUiReady);


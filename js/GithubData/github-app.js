(function () {
    'use strict';

    function parseGithubRepoInput(repoInput) {
        const raw = String(repoInput || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
        const parts = raw.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        const owner = parts[0];
        const repo = parts[1];
        const basePath = parts.slice(2).join('/').replace(/^\/+|\/+$/g, '');
        return {
            owner: owner,
            repo: repo,
            full: owner + '/' + repo,
            basePath: basePath,
            fullWithPath: basePath ? (owner + '/' + repo + '/' + basePath) : (owner + '/' + repo)
        };
    }

    function getGithubConfigFromSettings(settings) {
        const s = settings || {};
        const parsed = parseGithubRepoInput(s.githubRepo || '');
        const rawPullMax = Number(s.githubPullMaxFiles);
        const pullMaxFiles = Number.isFinite(rawPullMax)
            ? Math.max(1, Math.min(10000, Math.floor(rawPullMax)))
            : 10000;
        return {
            enabled: !!s.githubEnabled,
            token: String(s.githubToken || '').trim(),
            branch: String(s.githubBranch || 'main').trim() || 'main',
            repoInput: String(s.githubRepo || '').trim(),
            repo: parsed ? parsed.full : '',
            owner: parsed ? parsed.owner : '',
            name: parsed ? parsed.repo : '',
            basePath: parsed ? parsed.basePath : '',
            repoWithPath: parsed ? parsed.fullWithPath : '',
            pullMaxFiles: pullMaxFiles,
            cacheDocs: Array.isArray(s.githubCacheDocs) ? s.githubCacheDocs : [],
            lastPulledAt: s.githubLastPulledAt || ''
        };
    }

    function getGithubLinkPathFromConfig(cfg) {
        const rawInput = String(cfg && cfg.repoInput ? cfg.repoInput : '').trim();
        const normalized = rawInput
            .replace(/^https?:\/\/github\.com\//i, '')
            .replace(/\.git$/i, '')
            .replace(/^\/+|\/+$/g, '');
        if (normalized) return normalized;
        const fallback = String(cfg && cfg.repo ? cfg.repo : '').trim().replace(/^\/+|\/+$/g, '');
        return fallback;
    }

    function setGithubFeedback(message, kind) {
        const api = window.GithubDataSettings;
        if (api && typeof api.setGithubFeedback === 'function') {
            return api.setGithubFeedback(message, kind);
        }
    }

    function getGithubSettingsFoldedFromLocal() {
        const v = localStorage.getItem(GITHUB_SETTINGS_FOLD_KEY);
        return v == null ? false : v === '1';
    }

    function setGithubSettingsFoldedToLocal(folded) {
        localStorage.setItem(GITHUB_SETTINGS_FOLD_KEY, folded ? '1' : '0');
    }

    function applyGithubSettingsFold(folded) {
        const btn = document.getElementById('github-settings-fold-btn');
        if (btn) btn.textContent = folded ? '펼치기' : '접기';
        toggleGithubSettingsSection();
    }

    function toggleGithubSettingsFold() {
        const next = !getGithubSettingsFoldedFromLocal();
        setGithubSettingsFoldedToLocal(next);
        applyGithubSettingsFold(next);
    }

    function toggleGithubSettingsSection() {
        const checked = !!(document.getElementById('ai-github-enabled') && document.getElementById('ai-github-enabled').checked);
        const folded = getGithubSettingsFoldedFromLocal();
        const api = window.GithubDataSettings;
        if (api && typeof api.toggleGithubSettingsSection === 'function') {
            return api.toggleGithubSettingsSection({ checked: checked, folded: folded });
        }
        const body = document.getElementById('github-settings-body');
        if (body) body.classList.toggle('hidden', !checked || folded);
    }

    function updateStorageSourceTabsUI() {
        const indbBtn = document.getElementById('tab-storage-indb');
        const ghBtn = document.getElementById('tab-storage-github');
        if (!indbBtn || !ghBtn) return;
        const active = 'px-2 py-1 text-xs font-semibold border border-indigo-500 rounded bg-indigo-600 text-white';
        const inactive = 'px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200';
        indbBtn.className = currentStorageSourceTab === 'indb' ? active : inactive;
        ghBtn.className = currentStorageSourceTab === 'github' ? active : inactive;
    }

    function syncStorageSourceTabsVisibility(githubConfigured) {
        const tabsWrap = document.getElementById('storage-source-tabs');
        if (!tabsWrap) return;
        const shouldShow = !!githubConfigured && !isSidebarCollapsed;
        tabsWrap.classList.toggle('hidden', !shouldShow);
        tabsWrap.classList.toggle('flex', shouldShow);
    }

    async function applyGithubUiState(settingsInput) {
        const settings = settingsInput || await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        const githubConfigured = !!(cfg.enabled && cfg.token);
        const repoLink = document.getElementById('tab-storage-github-link');
        const syncBtn = document.getElementById('btn-github-sync');
        const syncLabel = document.getElementById('github-sync-label');

        syncStorageSourceTabsVisibility(githubConfigured);
        if (syncBtn) {
            const showSync = githubConfigured;
            syncBtn.classList.toggle('hidden', !showSync);
            syncBtn.classList.toggle('flex', showSync);
        }
        if (syncLabel) {
            const labelTarget = cfg.repoWithPath || cfg.repo;
            syncLabel.textContent = labelTarget ? ('sync ' + labelTarget) : 'sync';
        }
        if (repoLink) {
            const linkPath = getGithubLinkPathFromConfig(cfg);
            const hasRepo = !!linkPath;
            repoLink.classList.toggle('hidden', !(githubConfigured && hasRepo));
            if (githubConfigured && hasRepo) {
                repoLink.href = 'https://github.com/' + linkPath;
                repoLink.title = 'GitHub 저장소 열기: ' + linkPath;
            } else {
                repoLink.href = '#';
                repoLink.title = 'GitHub 저장소 열기';
            }
        }

        if (!githubConfigured && currentStorageSourceTab === 'github') {
            currentStorageSourceTab = 'indb';
            setStorageSourceTabToLocal('indb');
        }
        updateStorageSourceTabsUI();
        if (activeSidebarTab === 'files') renderDBList();
    }

    function switchStorageSourceTab(tab) {
        const next = String(tab || '').toLowerCase() === 'github' ? 'github' : 'indb';
        const githubEnabled = !!(document.getElementById('ai-github-enabled') && document.getElementById('ai-github-enabled').checked);
        const githubToken = String(document.getElementById('github-token-input') && document.getElementById('github-token-input').value ? document.getElementById('github-token-input').value : '').trim();
        const githubConfigured = !!(githubEnabled && githubToken);
        if (next === 'github' && !githubConfigured) {
            currentStorageSourceTab = 'indb';
            setStorageSourceTabToLocal('indb');
            updateStorageSourceTabsUI();
            renderDBList();
            return;
        }
        currentStorageSourceTab = next;
        setStorageSourceTabToLocal(next);
        updateStorageSourceTabsUI();
        renderDBList();
    }

    function githubApiHeaders(token) {
        return {
            'Accept': 'application/vnd.github+json',
            'Authorization': 'token ' + String(token || '').trim(),
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    async function githubApiRequest(url, options, token) {
        const opts = options || {};
        const method = opts.method || 'GET';
        const headers = { ...(opts.headers || {}), ...githubApiHeaders(token) };
        if (opts.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        const res = await fetch(url, { ...opts, method, headers });
        if (!res.ok) {
            let msg = 'GitHub API error: ' + res.status;
            try {
                const j = await res.json();
                if (j && j.message) msg = j.message;
            } catch (_) {}
            const err = new Error(msg);
            err.status = res.status;
            err.url = url;
            throw err;
        }
        if (res.status === 204) return null;
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) return await res.json();
        return await res.text();
    }

    function encodeTextToGithubBase64(text) {
        const bytes = new TextEncoder().encode(String(text || ''));
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function getGithubDocTitleFromPath(path) {
        const p = String(path || '');
        const parts = p.split('/');
        const file = parts[parts.length - 1] || 'untitled.md';
        return file.replace(/\.(md|markdown|txt)$/i, '');
    }

    async function pullGithubRepo() {
        const api = window.GithubDataSettings;
        if (api && typeof api.pullGithubRepo === 'function') {
            return await api.pullGithubRepo({
                getAiSettings: getAiSettings,
                setAiSettings: setAiSettings,
                getGithubConfigFromSettings: getGithubConfigFromSettings,
                showToast: showToast,
                renderDBList: renderDBList
            });
        }
        showToast('GitHub module is not loaded.');
    }

    function openGithubRepoCreateModal() {
        const api = window.GithubDataSettings;
        if (api && typeof api.openGithubRepoCreateModal === 'function') {
            return api.openGithubRepoCreateModal();
        }
    }

    function closeGithubRepoCreateModal() {
        const api = window.GithubDataSettings;
        if (api && typeof api.closeGithubRepoCreateModal === 'function') {
            return api.closeGithubRepoCreateModal();
        }
    }

    async function confirmGithubRepoCreateModal() {
        const api = window.GithubDataSettings;
        if (api && typeof api.confirmGithubRepoCreateModal === 'function') {
            return await api.confirmGithubRepoCreateModal({
                setAiSettings: setAiSettings,
                applyGithubUiState: applyGithubUiState,
                showToast: showToast
            });
        }
        showToast('GitHub module is not loaded.');
    }

    async function createGithubRepository(options) {
        const api = window.GithubDataSettings;
        if (api && typeof api.createGithubRepository === 'function') {
            return await api.createGithubRepository(options, {
                setAiSettings: setAiSettings,
                applyGithubUiState: applyGithubUiState,
                showToast: showToast
            });
        }
        showToast('GitHub module is not loaded.');
    }

    async function saveGithubSettingsFromModal() {
        const api = window.GithubDataSettings;
        if (api && typeof api.saveGithubSettingsFromModal === 'function') {
            return await api.saveGithubSettingsFromModal({
                setAiSettings: setAiSettings,
                applyGithubUiState: applyGithubUiState,
                showToast: showToast
            });
        }
        showToast('GitHub module is not loaded.');
    }

    async function loadFromGithubCache(path) {
        const target = String(path || '').trim();
        if (!target) return;
        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('Open canceled.');
            return;
        }
        const settings = await getAiSettings() || {};
        const docs = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs : [];
        const doc = docs.find(function (d) { return String(d.path || '') === target; });
        if (!doc) {
            showToast('File not found in local GitHub cache. Pull first.');
            return;
        }
        currentDbDocId = null;
        setCurrentDocumentInfo((doc.title || 'github-doc') + '.md', doc.path || null);
        updateContent(doc.content || '');
        markPersistedState();
        showToast('Loaded from GitHub cache.');
        if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
    }

    async function pushDocToGithub(docId) {
        const id = String(docId || '').trim();
        if (!id) return;
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
            showToast('Set GitHub token/repo/branch first.');
            return;
        }

        const tx = db.transaction(['documents', 'folders'], 'readonly');
        const docsStore = tx.objectStore('documents');
        const foldersStore = tx.objectStore('folders');
        const doc = await new Promise(function (resolve) {
            const req = docsStore.get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
        if (!doc) {
            showToast('Document not found.');
            return;
        }

        const folder = await new Promise(function (resolve) {
            const req = foldersStore.get(String(doc.folderId || 'root'));
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
        const folderName = folder && String(folder.id || '') !== 'root'
            ? String(folder.name || '').trim().replace(/[\\/:*?"<>|]+/g, '_')
            : '';
        const docName = String(doc.title || 'untitled').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'untitled';
        const path = folderName ? (folderName + '/' + docName + '.md') : (docName + '.md');
        const remotePath = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path;
        const getContentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);

        try {
            let existingSha = '';
            try {
                const existing = await githubApiRequest(getContentUrl, {}, cfg.token);
                existingSha = String(existing && existing.sha ? existing.sha : '');
            } catch (e) {
                const status = Number(e && e.status ? e.status : 0);
                const msg = String(e && e.message ? e.message : '').toLowerCase();
                const notFound = status === 404 || msg.includes('404') || msg.includes('not found');
                if (!notFound) throw e;
            }

            const body = {
                message: 'push: ' + docName + ' (' + new Date().toISOString() + ')',
                content: encodeTextToGithubBase64(doc.content || ''),
                branch: cfg.branch
            };
            if (existingSha) body.sha = existingSha;

            const putUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/');
            const pushed = await githubApiRequest(putUrl, {
                method: 'PUT',
                body: JSON.stringify(body)
            }, cfg.token);

            const nextCache = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
            const idx = nextCache.findIndex(function (d) { return String(d.path || '') === path; });
            const entry = {
                id: 'gh:' + path,
                path: path,
                remotePath: remotePath,
                title: getGithubDocTitleFromPath(path),
                folderPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'root',
                content: String(doc.content || ''),
                sha: String(pushed && pushed.content && pushed.content.sha ? pushed.content.sha : ''),
                updatedAt: new Date().toISOString()
            };
            if (idx >= 0) nextCache[idx] = entry;
            else nextCache.push(entry);

            await setAiSettings({ githubCacheDocs: nextCache });
            showToast('Pushed to GitHub: ' + remotePath);
            if (currentStorageSourceTab === 'github') renderDBList();
        } catch (e) {
            showToast('GitHub push failed: ' + String(e && e.message ? e.message : e));
        }
    }

    function isGithubExportEnabled() {
        const enabledEl = document.getElementById('ai-github-enabled');
        const tokenEl = document.getElementById('github-token-input');
        const repoEl = document.getElementById('github-repo-input');
        const branchEl = document.getElementById('github-branch-input');
        const enabled = !!(enabledEl && enabledEl.checked);
        const token = String(tokenEl && tokenEl.value ? tokenEl.value : '').trim();
        const repo = String(repoEl && repoEl.value ? repoEl.value : '').trim();
        const branch = String(branchEl && branchEl.value ? branchEl.value : '').trim();
        return !!(enabled && token && repo && branch);
    }

    async function pushCurrentContentToGithub() {
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
            showToast('Set GitHub token/repo/branch first.');
            return false;
        }
        if (currentDbDocId) {
            await pushDocToGithub(currentDbDocId);
            return true;
        }

        let fileName = String(currentFileName || 'untitled.md').trim().replace(/[/\\:*?"<>|]+/g, '_');
        if (!fileName) fileName = 'untitled.md';
        if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += '.md';
        const path = fileName;
        const remotePath = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path;
        const getContentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);

        try {
            let existingSha = '';
            try {
                const existing = await githubApiRequest(getContentUrl, {}, cfg.token);
                existingSha = String(existing && existing.sha ? existing.sha : '');
            } catch (e) {
                const status = Number(e && e.status ? e.status : 0);
                const msg = String(e && e.message ? e.message : '').toLowerCase();
                const notFound = status === 404 || msg.includes('404') || msg.includes('not found');
                if (!notFound) throw e;
            }

            const body = {
                message: 'export push: ' + fileName + ' (' + new Date().toISOString() + ')',
                content: encodeTextToGithubBase64(currentMarkdown || ''),
                branch: cfg.branch
            };
            if (existingSha) body.sha = existingSha;

            const putUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/');
            const pushed = await githubApiRequest(putUrl, {
                method: 'PUT',
                body: JSON.stringify(body)
            }, cfg.token);

            const nextCache = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
            const idx = nextCache.findIndex(function (d) { return String(d.path || '') === path; });
            const entry = {
                id: 'gh:' + path,
                path: path,
                remotePath: remotePath,
                title: getGithubDocTitleFromPath(path),
                folderPath: 'root',
                content: String(currentMarkdown || ''),
                sha: String(pushed && pushed.content && pushed.content.sha ? pushed.content.sha : ''),
                updatedAt: new Date().toISOString()
            };
            if (idx >= 0) nextCache[idx] = entry;
            else nextCache.push(entry);
            await setAiSettings({ githubCacheDocs: nextCache });
            showToast('Pushed to GitHub: ' + remotePath);
            return true;
        } catch (e) {
            showToast('GitHub push failed: ' + String(e && e.message ? e.message : e));
            return false;
        }
    }

    async function renderGithubCachedList(listEl, searchTerm) {
        const settings = await getAiSettings() || {};
        const docs = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
        const filtered = docs.filter(function (d) {
            const title = String(d && d.title ? d.title : '').toLowerCase();
            const path = String(d && d.path ? d.path : '').toLowerCase();
            return !searchTerm || title.includes(searchTerm) || path.includes(searchTerm);
        });
        const groups = new Map();
        filtered.forEach(function (doc) {
            const key = String(doc && doc.folderPath ? doc.folderPath : 'root') || 'root';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(doc);
        });
        const keys = Array.from(groups.keys()).sort(function (a, b) { return a.localeCompare(b); });
        keys.forEach(function (folderPath) {
            const items = groups.get(folderPath) || [];
            const folderId = 'gh-folder:' + folderPath;
            const isCollapsedFolder = !searchTerm && isFolderCollapsed(folderId);

            const folderDiv = document.createElement('div');
            folderDiv.className = 'mb-2';
            const folderHeader = document.createElement('div');
            folderHeader.className = 'flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 rounded ' + (isSidebarCollapsed ? 'justify-center' : '');
            folderHeader.innerHTML = ''
                + '<i data-lucide="' + (isCollapsedFolder ? 'chevron-right' : 'chevron-down') + '" class="w-3 h-3"></i>'
                + '<i data-lucide="folder-git-2" class="w-3 h-3"></i>'
                + '<span class="sidebar-text">' + escapeHtmlText(folderPath === 'root' ? 'ROOT' : folderPath) + '</span>';
            folderHeader.addEventListener('click', function () { toggleFolderCollapse(folderId); });
            folderDiv.appendChild(folderHeader);

            const docContainer = document.createElement('div');
            docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'pl-2 space-y-1') + (isCollapsedFolder ? ' hidden' : '');
            items.forEach(function (doc) {
                const path = String(doc && doc.path ? doc.path : '');
                const title = String(doc && doc.title ? doc.title : getGithubDocTitleFromPath(path));
                const shortTitle = Array.from(title).slice(0, 3).join('');
                const docItem = document.createElement('div');
                docItem.className = isSidebarCollapsed
                    ? 'group w-12 h-6 mx-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer flex items-center justify-center'
                    : 'group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md p-2 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all shadow-sm cursor-pointer';
                docItem.title = path || title;
                docItem.onclick = function () { loadFromGithubCache(path); };
                docItem.innerHTML = ''
                    + '<div class="flex flex-col gap-1 doc-item-inner">'
                    + '<div class="flex items-center gap-2">'
                    + '<i data-lucide="file-code-2" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i>'
                    + '<span class="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate ' + (isSidebarCollapsed ? '' : 'sidebar-text') + '">'
                    + escapeHtmlText(isSidebarCollapsed ? shortTitle : title)
                    + '</span>'
                    + '</div>'
                    + '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity doc-action-btns">'
                    + '<button onclick="event.stopPropagation(); loadFromGithubCache(\'' + escapeHtmlText(path) + '\')" class="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold hover:bg-indigo-600 hover:text-white">열기</button>'
                    + '</div>'
                    + '</div>';
                docContainer.appendChild(docItem);
            });

            folderDiv.appendChild(docContainer);
            listEl.appendChild(folderDiv);
        });

        if (!keys.length) {
            const empty = document.createElement('div');
            empty.className = 'px-2 py-4 text-xs text-slate-500 dark:text-slate-400';
            empty.textContent = 'Sync github';
            listEl.appendChild(empty);
        }
    }

    window.GithubApp = {
        parseGithubRepoInput: parseGithubRepoInput,
        getGithubConfigFromSettings: getGithubConfigFromSettings,
        getGithubLinkPathFromConfig: getGithubLinkPathFromConfig,
        setGithubFeedback: setGithubFeedback,
        getGithubSettingsFoldedFromLocal: getGithubSettingsFoldedFromLocal,
        setGithubSettingsFoldedToLocal: setGithubSettingsFoldedToLocal,
        applyGithubSettingsFold: applyGithubSettingsFold,
        toggleGithubSettingsFold: toggleGithubSettingsFold,
        toggleGithubSettingsSection: toggleGithubSettingsSection,
        updateStorageSourceTabsUI: updateStorageSourceTabsUI,
        syncStorageSourceTabsVisibility: syncStorageSourceTabsVisibility,
        applyGithubUiState: applyGithubUiState,
        switchStorageSourceTab: switchStorageSourceTab,
        pullGithubRepo: pullGithubRepo,
        openGithubRepoCreateModal: openGithubRepoCreateModal,
        closeGithubRepoCreateModal: closeGithubRepoCreateModal,
        confirmGithubRepoCreateModal: confirmGithubRepoCreateModal,
        createGithubRepository: createGithubRepository,
        saveGithubSettingsFromModal: saveGithubSettingsFromModal,
        loadFromGithubCache: loadFromGithubCache,
        pushDocToGithub: pushDocToGithub,
        pushCurrentContentToGithub: pushCurrentContentToGithub,
        isGithubExportEnabled: isGithubExportEnabled,
        renderGithubCachedList: renderGithubCachedList
    };

    window.parseGithubRepoInput = parseGithubRepoInput;
    window.getGithubConfigFromSettings = getGithubConfigFromSettings;
    window.getGithubLinkPathFromConfig = getGithubLinkPathFromConfig;
    window.setGithubFeedback = setGithubFeedback;
    window.getGithubSettingsFoldedFromLocal = getGithubSettingsFoldedFromLocal;
    window.setGithubSettingsFoldedToLocal = setGithubSettingsFoldedToLocal;
    window.applyGithubSettingsFold = applyGithubSettingsFold;
    window.toggleGithubSettingsFold = toggleGithubSettingsFold;
    window.toggleGithubSettingsSection = toggleGithubSettingsSection;
    window.updateStorageSourceTabsUI = updateStorageSourceTabsUI;
    window.syncStorageSourceTabsVisibility = syncStorageSourceTabsVisibility;
    window.applyGithubUiState = applyGithubUiState;
    window.switchStorageSourceTab = switchStorageSourceTab;
    window.pullGithubRepo = pullGithubRepo;
    window.openGithubRepoCreateModal = openGithubRepoCreateModal;
    window.closeGithubRepoCreateModal = closeGithubRepoCreateModal;
    window.confirmGithubRepoCreateModal = confirmGithubRepoCreateModal;
    window.createGithubRepository = createGithubRepository;
    window.saveGithubSettingsFromModal = saveGithubSettingsFromModal;
    window.loadFromGithubCache = loadFromGithubCache;
    window.pushDocToGithub = pushDocToGithub;
    window.pushCurrentContentToGithub = pushCurrentContentToGithub;
    window.isGithubExportEnabled = isGithubExportEnabled;
    window.renderGithubCachedList = renderGithubCachedList;
})();

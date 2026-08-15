(function () {
    'use strict';

    const STORAGE_SIDEBAR_VISIBILITY_KEY = 'mdpro_storage_sidebar_visibility_v1';
    const STORAGE_SIDEBAR_AUTO_REVEALED_KEY = 'mdpro_storage_sidebar_auto_revealed_v1';
    const DEFAULT_STORAGE_SIDEBAR_VISIBILITY = Object.freeze({
        local: false,
        indb: true,
        sqlite: false,
        github: false
    });
    const OPTIONAL_STORAGE_FEATURES = Object.freeze(['local', 'sqlite', 'github']);

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
            defaultPushPath: normalizeGithubFolderPath(s.githubDefaultPushPath || ''),
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

    function getGithubLoginUrlForRepoPath(linkPath) {
        const normalized = String(linkPath || '').trim().replace(/^\/+|\/+$/g, '');
        if (!normalized) return 'https://github.com/login';
        return 'https://github.com/login?return_to=' + encodeURIComponent('/' + normalized);
    }

    function openGithubRepositoryLink(event) {
        const link = event && event.currentTarget ? event.currentTarget : document.getElementById('tab-storage-github-link');
        const linkPath = String(link && link.dataset ? link.dataset.githubRepoPath || '' : '').trim();
        if (!linkPath) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            return false;
        }
        // GitHub의 웹 로그인 세션은 앱에서 사용하는 PAT와 별개다. 저장소를
        // 직접 열지 않고 로그인 화면을 거치면 비공개 저장소의 익명 404를 피하고
        // 로그인 완료 후 return_to에 지정된 저장소로 이동할 수 있다.
        link.href = getGithubLoginUrlForRepoPath(linkPath);
        return true;
    }

    function setGithubFeedback(message, kind) {
        const api = window.GithubDataSettings;
        if (api && typeof api.setGithubFeedback === 'function') {
            return api.setGithubFeedback(message, kind);
        }
    }

    function getGithubSettingsFoldedFromLocal() {
        const v = localStorage.getItem(GITHUB_SETTINGS_FOLD_KEY);
        return v == null ? true : v === '1';
    }

    function setGithubSettingsFoldedToLocal(folded) {
        localStorage.setItem(GITHUB_SETTINGS_FOLD_KEY, folded ? '1' : '0');
    }

    function applyGithubSettingsFold(folded) {
        const btn = document.getElementById('github-settings-fold-btn');
        if (btn) {
            btn.textContent = folded ? '펼치기' : '접기';
            btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
        }
        toggleGithubSettingsSection();
    }

    function toggleGithubSettingsFold() {
        const next = !getGithubSettingsFoldedFromLocal();
        setGithubSettingsFoldedToLocal(next);
        applyGithubSettingsFold(next);
    }

    function toggleGithubSettingsSection() {
        const folded = getGithubSettingsFoldedFromLocal();
        const api = window.GithubDataSettings;
        let result;
        if (api && typeof api.toggleGithubSettingsSection === 'function') {
            result = api.toggleGithubSettingsSection({ folded: folded });
        } else {
            const body = document.getElementById('github-settings-body');
            if (body) {
                body.classList.toggle('hidden', folded);
                body.setAttribute('aria-hidden', folded ? 'true' : 'false');
            }
        }
        onStorageFeatureCheckboxChange();
        return result;
    }

    function getStorageFeatureFlags(settingsInput) {
        const settings = settingsInput && typeof settingsInput === 'object' ? settingsInput : null;
        const sqliteCheckbox = document.getElementById('sqlite-enabled');
        const githubCheckbox = document.getElementById('ai-github-enabled');
        const localCheckbox = document.getElementById('local-storage-enabled');
        const inDbCheckbox = document.getElementById('indb-storage-enabled');
        return {
            indb: inDbCheckbox ? inDbCheckbox.checked : !(settings && settings.indbEnabled === false),
            sqlite: sqliteCheckbox ? sqliteCheckbox.checked : !!(settings && settings.sqliteEnabled === true),
            github: githubCheckbox ? githubCheckbox.checked : !!(settings && settings.githubEnabled === true),
            local: localCheckbox ? localCheckbox.checked : !(settings && settings.localEnabled === false)
        };
    }

    function getStorageSidebarVisibility() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_SIDEBAR_VISIBILITY_KEY) || 'null');
        } catch (_) {}
        return Object.keys(DEFAULT_STORAGE_SIDEBAR_VISIBILITY).reduce(function (result, key) {
            result[key] = !stored || typeof stored[key] !== 'boolean'
                ? DEFAULT_STORAGE_SIDEBAR_VISIBILITY[key]
                : stored[key];
            return result;
        }, {});
    }

    function setStorageSidebarVisibility(visibilityInput) {
        const current = getStorageSidebarVisibility();
        const input = visibilityInput && typeof visibilityInput === 'object' ? visibilityInput : {};
        Object.keys(DEFAULT_STORAGE_SIDEBAR_VISIBILITY).forEach(function (key) {
            if (typeof input[key] === 'boolean') current[key] = input[key];
        });
        try { localStorage.setItem(STORAGE_SIDEBAR_VISIBILITY_KEY, JSON.stringify(current)); } catch (_) {}
        return current;
    }

    function getStorageSidebarAutoRevealed() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_SIDEBAR_AUTO_REVEALED_KEY) || 'null');
        } catch (_) {}
        return OPTIONAL_STORAGE_FEATURES.reduce(function (result, feature) {
            result[feature] = !!(stored && stored[feature] === true);
            return result;
        }, {});
    }

    function revealEnabledStorageSidebarFeaturesOnce(flagsInput) {
        const flags = flagsInput && typeof flagsInput === 'object' ? flagsInput : {};
        const revealed = getStorageSidebarAutoRevealed();
        const visibility = getStorageSidebarVisibility();
        let revealedChanged = false;
        let visibilityChanged = false;

        OPTIONAL_STORAGE_FEATURES.forEach(function (feature) {
            if (flags[feature] !== true || revealed[feature] === true) return;
            revealed[feature] = true;
            revealedChanged = true;
            if (visibility[feature] !== true) {
                visibility[feature] = true;
                visibilityChanged = true;
            }
        });

        if (revealedChanged) {
            try { localStorage.setItem(STORAGE_SIDEBAR_AUTO_REVEALED_KEY, JSON.stringify(revealed)); } catch (_) {}
        }
        if (visibilityChanged) {
            const saved = setStorageSidebarVisibility(visibility);
            applyStorageSidebarVisibility(saved);
            return saved;
        }
        return visibility;
    }

    function syncStorageSidebarVisibilitySettingsUI(visibilityInput) {
        const visibility = visibilityInput || getStorageSidebarVisibility();
        Object.keys(DEFAULT_STORAGE_SIDEBAR_VISIBILITY).forEach(function (key) {
            const checkbox = document.getElementById('sidebar-storage-' + key + '-visible');
            if (checkbox) checkbox.checked = visibility[key] !== false;
        });
        return visibility;
    }

    function applyStorageSidebarVisibility(visibilityInput) {
        const visibility = visibilityInput || getStorageSidebarVisibility();
        Object.keys(DEFAULT_STORAGE_SIDEBAR_VISIBILITY).forEach(function (key) {
            const hidden = visibility[key] === false;
            const button = document.getElementById('tab-storage-' + key);
            if (button) button.toggleAttribute('hidden', hidden);
            if (document.body) {
                document.body.classList.toggle('sidebar-storage-' + key + '-hidden', hidden);
            }
        });
        const githubLink = document.getElementById('tab-storage-github-link');
        if (githubLink) githubLink.toggleAttribute('hidden', visibility.github === false);
        syncStorageSidebarVisibilitySettingsUI(visibility);
        return visibility;
    }

    function onStorageSidebarVisibilityChange() {
        const visibility = {};
        Object.keys(DEFAULT_STORAGE_SIDEBAR_VISIBILITY).forEach(function (key) {
            const checkbox = document.getElementById('sidebar-storage-' + key + '-visible');
            visibility[key] = checkbox ? checkbox.checked : true;
        });
        const saved = setStorageSidebarVisibility(visibility);
        applyStorageSidebarVisibility(saved);
        const tabsWrap = document.getElementById('storage-source-tabs');
        if (tabsWrap) {
            const hasVisibleTab = Object.keys(saved).some(function (key) { return saved[key] !== false; });
            const shouldShow = !isSidebarCollapsed && hasVisibleTab;
            tabsWrap.classList.toggle('hidden', !shouldShow);
            tabsWrap.classList.toggle('flex', shouldShow);
        }
        return saved;
    }

    function applyStorageFeatureVisibility(settingsInput) {
        const flags = getStorageFeatureFlags(settingsInput);
        revealEnabledStorageSidebarFeaturesOnce(flags);
        const body = document.body;
        if (body) {
            ['indb', 'sqlite', 'github', 'local'].forEach(function (feature) {
                body.classList.toggle('feature-' + feature + '-enabled', flags[feature]);
                body.classList.toggle('feature-' + feature + '-disabled', !flags[feature]);
            });
        }

        const disabledCurrentTab = (currentStorageSourceTab === 'indb' && !flags.indb)
            || (currentStorageSourceTab === 'local' && !flags.local)
            || (currentStorageSourceTab === 'sqlite' && !flags.sqlite)
            || (currentStorageSourceTab === 'github' && !flags.github);
        if (disabledCurrentTab) {
            const fallbackMode = flags.local ? 'local' : (flags.sqlite ? 'sqlite' : (flags.github ? 'github' : 'indb'));
            currentStorageSourceTab = fallbackMode;
            setStorageSourceTabToLocal(fallbackMode);
        }
        if (!flags.sqlite && window.SettingUI && typeof window.SettingUI.closeSqliteExplorer === 'function') {
            window.SettingUI.closeSqliteExplorer();
        }
        return flags;
    }

    function onStorageFeatureCheckboxChange() {
        const previousTab = currentStorageSourceTab;
        const flags = applyStorageFeatureVisibility();
        if (previousTab !== currentStorageSourceTab && activeSidebarTab === 'files') renderDBList();
        updateStorageSourceTabsUI();
        return flags;
    }

    function updateStorageSourceTabsUI() {
        const localBtn = document.getElementById('tab-storage-local');
        const indbBtn = document.getElementById('tab-storage-indb');
        const sqliteBtn = document.getElementById('tab-storage-sqlite');
        const ghBtn = document.getElementById('tab-storage-github');
        if (!localBtn || !indbBtn || !sqliteBtn || !ghBtn) return;
        const active = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border border-indigo-500 rounded bg-indigo-600 text-white';
        const inactive = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200';
        localBtn.className = currentStorageSourceTab === 'local' ? active : inactive;
        indbBtn.className = currentStorageSourceTab === 'indb' ? active : inactive;
        sqliteBtn.className = currentStorageSourceTab === 'sqlite' ? active : inactive;
        ghBtn.className = currentStorageSourceTab === 'github' ? active : inactive;
        const newFolderButton = document.getElementById('btn-new-folder');
        if (newFolderButton) newFolderButton.classList.toggle('hidden', currentStorageSourceTab === 'local');
        const searchInput = document.getElementById('db-search');
        if (searchInput) searchInput.placeholder = currentStorageSourceTab === 'local'
            ? '로컬 폴더에서 파일 검색...'
            : '문서 제목·본문 검색...';
        const storageState = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
            ? window.MDPStorage.getStatus()
            : null;
        const sqliteConnected = !!(storageState && storageState.sqliteHealth
            && storageState.sqliteHealth.available === true
            && storageState.sqliteHealth.capabilities
            && storageState.sqliteHealth.capabilities.documents === true
            && storageState.sqliteHealth.capabilities.folders === true);
        if (typeof window.setStorageConnectionButtonGlow === 'function') {
            window.setStorageConnectionButtonGlow('tab-storage-sqlite', 'sqlite', sqliteConnected);
            window.setStorageConnectionButtonGlow('tab-storage-github', 'github', window.githubStorageConnectionVerified === true);
        }
        syncStorageSourceTabsVisibility();
    }

    function syncStorageSourceTabsVisibility(settingsInput) {
        const tabsWrap = document.getElementById('storage-source-tabs');
        if (!tabsWrap) return;
        applyStorageFeatureVisibility(settingsInput);
        const sidebarVisibility = applyStorageSidebarVisibility();
        const hasVisibleTab = Object.keys(sidebarVisibility).some(function (key) {
            return sidebarVisibility[key] !== false;
        });
        const shouldShow = !isSidebarCollapsed && hasVisibleTab;
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

        syncStorageSourceTabsVisibility(settings);
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
                repoLink.dataset.githubRepoPath = linkPath;
                repoLink.href = getGithubLoginUrlForRepoPath(linkPath);
                repoLink.title = 'GitHub 로그인 후 저장소 열기: ' + linkPath;
            } else {
                delete repoLink.dataset.githubRepoPath;
                repoLink.href = '#';
                repoLink.title = 'GitHub 로그인 후 저장소 열기';
            }
        }

        if (!githubConfigured && currentStorageSourceTab === 'github') {
            currentStorageSourceTab = 'indb';
            setStorageSourceTabToLocal('indb');
        }
        if (window.GithubDataSettings && typeof window.GithubDataSettings.checkGithubConnectionFromModal === 'function') {
            if (cfg.enabled && cfg.token && cfg.repo && cfg.branch) {
                window.GithubDataSettings.checkGithubConnectionFromModal().catch(function () {});
            } else if (typeof window.GithubDataSettings.setGithubConnectionStatus === 'function') {
                window.GithubDataSettings.setGithubConnectionStatus('idle', 'GitHub 연결 상태를 확인하지 않았습니다.');
            }
        }
        updateStorageSourceTabsUI();
        if (activeSidebarTab === 'files') renderDBList();
    }

    async function switchStorageSourceTab(tab) {
        const requested = String(tab || '').toLowerCase();
        const next = requested === 'github' || requested === 'sqlite' || requested === 'local' ? requested : 'indb';
        const featureFlags = getStorageFeatureFlags();
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
        if ((next === 'indb' && !featureFlags.indb)
            || (next === 'local' && !featureFlags.local)
            || (next === 'sqlite' && !featureFlags.sqlite)) {
            const fallbackMode = featureFlags.local ? 'local' : (featureFlags.sqlite ? 'sqlite' : 'indb');
            currentStorageSourceTab = fallbackMode;
            setStorageSourceTabToLocal(fallbackMode);
            updateStorageSourceTabsUI();
            renderDBList();
            return;
        }
        if (next === 'local') {
            if (!window.LocalFolderExplorer || typeof window.LocalFolderExplorer.activate !== 'function') {
                if (typeof showToast === 'function') showToast('로컬 폴더 탐색기를 불러오지 못했습니다.');
                return;
            }
            const activated = await window.LocalFolderExplorer.activate({ pickIfNeeded: true });
            if (!activated) {
                updateStorageSourceTabsUI();
                return;
            }
            currentStorageSourceTab = 'local';
        } else if (next !== 'github') {
            if (!window.MDPStorage || typeof window.MDPStorage.requestMode !== 'function') return;
            try {
                const state = await window.MDPStorage.requestMode(next);
                currentStorageSourceTab = state.activeMode === 'sqlite' ? 'sqlite' : 'indb';
            } catch (error) {
                if (typeof showToast === 'function') {
                    showToast(error && error.message ? error.message : '저장소를 전환할 수 없습니다.');
                }
                updateStorageSourceTabsUI();
                return;
            }
        } else {
            currentStorageSourceTab = 'github';
        }
        setStorageSourceTabToLocal(currentStorageSourceTab);
        updateStorageSourceTabsUI();
        if (window.SettingUI && typeof window.SettingUI.syncSqliteCheckbox === 'function') {
            window.SettingUI.syncSqliteCheckbox();
        }
        await renderDBList();
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

    function decodeGithubBase64ToText(encoded) {
        const binary = atob(String(encoded || '').replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    function normalizeGithubTextFilePath(path) {
        return String(path || '')
            .trim()
            .replace(/\\/g, '/')
            .split('/')
            .map(function (part) { return part.trim().replace(/[\\:*?"<>|]+/g, '_'); })
            .filter(Boolean)
            .join('/');
    }

    async function getGithubTextFileContext(path) {
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.owner || !cfg.name || !cfg.branch) {
            throw new Error('GitHub PAT / 저장소 / 브랜치 설정이 필요합니다.');
        }
        const relativePath = normalizeGithubTextFilePath(path);
        if (!relativePath) throw new Error('GitHub 파일 경로가 비어 있습니다.');
        const remotePath = cfg.basePath
            ? normalizeGithubTextFilePath(cfg.basePath + '/' + relativePath)
            : relativePath;
        const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
        const url = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner)
            + '/' + encodeURIComponent(cfg.name) + '/contents/' + encodedPath;
        return { cfg: cfg, relativePath: relativePath, remotePath: remotePath, url: url };
    }

    async function readTextFile(path) {
        const context = await getGithubTextFileContext(path);
        const data = await githubApiRequest(
            context.url + '?ref=' + encodeURIComponent(context.cfg.branch),
            {},
            context.cfg.token
        );
        return decodeGithubBase64ToText(data && data.content ? data.content : '');
    }

    async function upsertTextFile(path, content, message) {
        const context = await getGithubTextFileContext(path);
        let sha = '';
        try {
            const existing = await githubApiRequest(
                context.url + '?ref=' + encodeURIComponent(context.cfg.branch),
                {},
                context.cfg.token
            );
            sha = String(existing && existing.sha ? existing.sha : '');
        } catch (error) {
            if (Number(error && error.status || 0) !== 404) throw error;
        }
        const body = {
            message: String(message || ('update: ' + context.relativePath)),
            content: encodeTextToGithubBase64(content),
            branch: context.cfg.branch
        };
        if (sha) body.sha = sha;
        return githubApiRequest(context.url, { method: 'PUT', body: JSON.stringify(body) }, context.cfg.token);
    }

    async function deleteTextFile(path, message) {
        const context = await getGithubTextFileContext(path);
        let existing;
        try {
            existing = await githubApiRequest(
                context.url + '?ref=' + encodeURIComponent(context.cfg.branch),
                {},
                context.cfg.token
            );
        } catch (error) {
            if (Number(error && error.status || 0) === 404) return false;
            throw error;
        }
        await githubApiRequest(context.url, {
            method: 'DELETE',
            body: JSON.stringify({
                message: String(message || ('delete: ' + context.relativePath)),
                sha: String(existing && existing.sha ? existing.sha : ''),
                branch: context.cfg.branch
            })
        }, context.cfg.token);
        return true;
    }

    async function listTextFiles(prefix, extension) {
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.owner || !cfg.name || !cfg.branch) {
            throw new Error('GitHub PAT / 저장소 / 브랜치 설정이 필요합니다.');
        }
        const relativePrefix = normalizeGithubTextFilePath(prefix).replace(/\/+$/, '');
        const basePrefix = normalizeGithubTextFilePath(cfg.basePath).replace(/\/+$/, '');
        const remotePrefix = [basePrefix, relativePrefix].filter(Boolean).join('/');
        const treeUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner)
            + '/' + encodeURIComponent(cfg.name) + '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1';
        const tree = await githubApiRequest(treeUrl, {}, cfg.token);
        const suffix = String(extension || '').toLowerCase();
        return (Array.isArray(tree && tree.tree) ? tree.tree : []).filter(function (item) {
            const remotePath = String(item && item.path || '');
            if (!item || item.type !== 'blob') return false;
            if (remotePrefix && remotePath !== remotePrefix && !remotePath.startsWith(remotePrefix + '/')) return false;
            return !suffix || remotePath.toLowerCase().endsWith(suffix);
        }).map(function (item) {
            const remotePath = String(item.path || '');
            const relativePath = basePrefix && remotePath.startsWith(basePrefix + '/')
                ? remotePath.slice(basePrefix.length + 1)
                : remotePath;
            return { path: relativePath, remotePath: remotePath, sha: String(item.sha || '') };
        });
    }

    function getGithubDocTitleFromPath(path) {
        const p = String(path || '');
        const parts = p.split('/');
        const file = parts[parts.length - 1] || 'untitled.md';
        return file.replace(/\.(md|markdown|txt)$/i, '');
    }

    function normalizeGithubFolderPath(path) {
        return String(path || '')
            .trim()
            .replace(/\\/g, '/')
            .split('/')
            .map(function (part) { return part.trim().replace(/[\\:*?"<>|]+/g, '_'); })
            .filter(Boolean)
            .join('/');
    }

    function joinGithubPath(folderPath, fileName) {
        const folder = normalizeGithubFolderPath(folderPath);
        const file = String(fileName || 'untitled.md').trim().replace(/[/\\:*?"<>|]+/g, '_') || 'untitled.md';
        return folder ? (folder + '/' + file) : file;
    }

    function confirmGithubDocumentPush(cfg, remotePath) {
        return window.confirm(
            'GitHub에 문서를 push합니다.\n\n'
            + '저장소: ' + String(cfg && cfg.repo ? cfg.repo : '') + '\n'
            + '브랜치: ' + String(cfg && cfg.branch ? cfg.branch : '') + '\n'
            + '저장 위치: ' + String(remotePath || '') + '\n\n'
            + '계속할까요?'
        );
    }

    function getGithubFolderChoices(settings, suggestedFolder) {
        const folders = new Set();
        const add = function (value) {
            const normalized = normalizeGithubFolderPath(value);
            if (normalized) folders.add(normalized);
        };
        add(suggestedFolder);
        add(settings && settings.githubDefaultPushPath);
        const docs = Array.isArray(settings && settings.githubCacheDocs) ? settings.githubCacheDocs : [];
        docs.forEach(function (doc) {
            const folder = String(doc && doc.folderPath ? doc.folderPath : '');
            if (folder && folder !== 'root') add(folder);
            const path = String(doc && doc.path ? doc.path : '');
            if (path.includes('/')) add(path.slice(0, path.lastIndexOf('/')));
        });
        return Array.from(folders).sort(function (a, b) { return a.localeCompare(b); });
    }

    async function getGithubRemoteFolderChoices(cfg) {
        if (!cfg || !cfg.token || !cfg.owner || !cfg.name || !cfg.branch) return [];
        const folders = new Set();
        const basePrefix = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/') : '';
        const treeUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1';
        const treeData = await githubApiRequest(treeUrl, {}, cfg.token);
        const items = Array.isArray(treeData && treeData.tree) ? treeData.tree : [];
        items.forEach(function (it) {
            const raw = String(it && it.path ? it.path : '').trim();
            if (!raw) return;
            if (basePrefix && !raw.startsWith(basePrefix)) return;
            const rel = basePrefix ? raw.slice(basePrefix.length) : raw;
            if (!rel) return;
            if (it.type === 'tree') {
                const folder = normalizeGithubFolderPath(rel);
                if (folder) folders.add(folder);
                return;
            }
            if (it.type === 'blob' && rel.includes('/')) {
                const parts = rel.split('/');
                parts.pop();
                for (let i = 1; i <= parts.length; i++) {
                    const folder = normalizeGithubFolderPath(parts.slice(0, i).join('/'));
                    if (folder) folders.add(folder);
                }
            }
        });
        return Array.from(folders).sort(function (a, b) { return a.localeCompare(b); });
    }

    function mergeGithubFolderChoices() {
        const folders = new Set();
        Array.prototype.slice.call(arguments).forEach(function (list) {
            (Array.isArray(list) ? list : []).forEach(function (folder) {
                const normalized = normalizeGithubFolderPath(folder);
                if (normalized) folders.add(normalized);
            });
        });
        return Array.from(folders).sort(function (a, b) { return a.localeCompare(b); });
    }

    function openGithubPushFolderModal(choices, defaultFolder) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'github-push-folder-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:16px;';

            const card = document.createElement('div');
            card.style.cssText = 'width:min(640px,96vw);max-height:86vh;overflow:hidden;background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;';

            const header = document.createElement('div');
            header.style.cssText = 'padding:14px 16px;border-bottom:1px solid #e2e8f0;';
            header.innerHTML = '<div style="font-size:15px;font-weight:800;margin-bottom:4px">GitHub push 폴더 선택</div>'
                + '<div style="font-size:12px;color:#64748b;line-height:1.45">기존 폴더를 선택하거나 새 폴더명을 입력하세요. 새 폴더는 push할 때 자동 생성됩니다.</div>';

            const body = document.createElement('div');
            body.style.cssText = 'padding:14px 16px;overflow:auto;';

            const inputLabel = document.createElement('label');
            inputLabel.textContent = '새 폴더명 또는 선택된 폴더';
            inputLabel.style.cssText = 'display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = normalizeGithubFolderPath(defaultFolder);
            input.placeholder = '예: notes/research, project-a';
            input.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:9px 10px;font-size:13px;color:#0f172a;background:#fff;margin-bottom:10px;';

            const rootBtn = document.createElement('button');
            rootBtn.type = 'button';
            rootBtn.textContent = '저장소 루트에 push';
            rootBtn.style.cssText = 'border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:7px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:10px;';
            rootBtn.onclick = function () { input.value = ''; };

            const listTitle = document.createElement('div');
            listTitle.textContent = choices.length ? '기존 폴더 목록' : '기존 폴더가 없습니다. 새 폴더명을 입력하세요.';
            listTitle.style.cssText = 'font-size:12px;font-weight:800;color:#334155;margin:6px 0;';

            const list = document.createElement('div');
            list.style.cssText = 'border:1px solid #e2e8f0;border-radius:8px;max-height:280px;overflow:auto;background:#f8fafc;';
            if (choices.length) {
                choices.forEach(function (folder) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = folder;
                    btn.title = folder;
                    btn.style.cssText = 'display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #e2e8f0;background:transparent;color:#1e293b;padding:8px 10px;font-size:12px;cursor:pointer;';
                    btn.onmouseenter = function () { btn.style.background = '#eef2ff'; };
                    btn.onmouseleave = function () { btn.style.background = 'transparent'; };
                    btn.onclick = function () { input.value = folder; };
                    list.appendChild(btn);
                });
            } else {
                const empty = document.createElement('div');
                empty.textContent = '아직 GitHub 저장소나 캐시에 폴더가 없습니다.';
                empty.style.cssText = 'padding:12px;color:#64748b;font-size:12px;';
                list.appendChild(empty);
            }

            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #e2e8f0;background:#f8fafc;';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = '취소';
            cancel.style.cssText = 'border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;';
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.textContent = '이 폴더로 push';
            ok.style.cssText = 'border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:7px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;';

            function close(value) {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve(value);
            }
            cancel.onclick = function () { close(null); };
            ok.onclick = function () { close(normalizeGithubFolderPath(input.value)); };
            overlay.onclick = function (ev) { if (ev.target === overlay) close(null); };
            input.onkeydown = function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    close(normalizeGithubFolderPath(input.value));
                }
                if (ev.key === 'Escape') close(null);
            };

            body.appendChild(inputLabel);
            body.appendChild(input);
            body.appendChild(rootBtn);
            body.appendChild(listTitle);
            body.appendChild(list);
            footer.appendChild(cancel);
            footer.appendChild(ok);
            card.appendChild(header);
            card.appendChild(body);
            card.appendChild(footer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            setTimeout(function () { input.focus(); input.select(); }, 0);
        });
    }

    async function chooseGithubPushFolder(settings, suggestedFolder) {
        const cfg = getGithubConfigFromSettings(settings || {});
        const localChoices = getGithubFolderChoices(settings || {}, suggestedFolder || cfg.defaultPushPath);
        let remoteChoices = [];
        try {
            remoteChoices = await getGithubRemoteFolderChoices(cfg);
        } catch (e) {
            showToast('GitHub folder list load failed. You can still enter a new folder.');
        }
        const choices = mergeGithubFolderChoices(localChoices, remoteChoices);
        const defaultFolder = normalizeGithubFolderPath(suggestedFolder || cfg.defaultPushPath || '');
        return await openGithubPushFolderModal(choices, defaultFolder);
    }

    function normalizeGithubDocumentFileName(fileName) {
        let normalized = String(fileName || '')
            .trim()
            .replace(/[/\\:*?"<>|]+/g, '_');
        if (!normalized) return '';
        if (!/\.(md|markdown|txt)$/i.test(normalized)) normalized += '.md';
        return normalized;
    }

    function openGithubDocumentCreateModal(defaultFolder) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center p-4 no-print';
            overlay.style.zIndex = '2147483647';

            const card = document.createElement('form');
            card.className = 'w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-6';
            card.innerHTML = ''
                + '<h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">GitHub 문서 생성</h3>'
                + '<p class="text-xs text-slate-500 dark:text-slate-400 mb-5">폴더와 문서 이름을 입력하면 <b>폴더/문서명.md</b> 경로로 생성됩니다.</p>'
                + '<label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">폴더 이름</label>'
                + '<input type="text" data-github-create-folder class="w-full px-3 py-2 mb-4 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" placeholder="예: docs/research (비우면 ROOT)">'
                + '<label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">문서 이름</label>'
                + '<input type="text" data-github-create-document class="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" placeholder="예: 새 문서">'
                + '<div data-github-create-preview class="mt-3 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-300 break-all"></div>'
                + '<p data-github-create-error class="hidden mt-2 text-xs text-red-600 dark:text-red-400"></p>'
                + '<div class="flex gap-2 mt-6">'
                + '<button type="button" data-github-create-cancel class="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">취소</button>'
                + '<button type="submit" class="flex-1 px-4 py-2 bg-emerald-600 rounded-md text-sm font-medium text-white hover:bg-emerald-700">생성</button>'
                + '</div>';

            const folderInput = card.querySelector('[data-github-create-folder]');
            const documentInput = card.querySelector('[data-github-create-document]');
            const preview = card.querySelector('[data-github-create-preview]');
            const errorElement = card.querySelector('[data-github-create-error]');
            const cancelButton = card.querySelector('[data-github-create-cancel]');
            folderInput.value = normalizeGithubFolderPath(defaultFolder);
            documentInput.value = 'Untitled';

            function updatePreview() {
                const folder = normalizeGithubFolderPath(folderInput.value);
                const fileName = normalizeGithubDocumentFileName(documentInput.value) || '문서명.md';
                preview.textContent = folder ? (folder + '/' + fileName) : fileName;
            }

            function close(value) {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve(value);
            }

            folderInput.addEventListener('input', updatePreview);
            documentInput.addEventListener('input', updatePreview);
            cancelButton.addEventListener('click', function () { close(null); });
            card.addEventListener('submit', function (event) {
                event.preventDefault();
                const fileName = normalizeGithubDocumentFileName(documentInput.value);
                if (!fileName) {
                    errorElement.textContent = '문서 이름을 입력하세요.';
                    errorElement.classList.remove('hidden');
                    documentInput.focus();
                    return;
                }
                close({
                    folderPath: normalizeGithubFolderPath(folderInput.value),
                    fileName: fileName
                });
            });
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) close(null);
            });
            overlay.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') close(null);
            });

            overlay.appendChild(card);
            document.body.appendChild(overlay);
            updatePreview();
            setTimeout(function () { documentInput.focus(); documentInput.select(); }, 0);
        });
    }

    async function createGithubDocumentInFolder(suggestedFolder) {
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
            showToast('Set GitHub token/repo/branch first.');
            return false;
        }

        const canProceed = await confirmSaveBeforeOpeningAnotherFile();
        if (!canProceed) {
            showToast('GitHub document creation canceled.');
            return false;
        }

        const requested = await openGithubDocumentCreateModal(
            String(suggestedFolder || '') === 'root' ? '' : suggestedFolder
        );
        if (!requested) return false;

        const path = joinGithubPath(requested.folderPath, requested.fileName);
        const remotePath = cfg.basePath
            ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path)
            : path;
        const encodedRemotePath = remotePath.split('/').map(encodeURIComponent).join('/');
        const contentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner)
            + '/' + encodeURIComponent(cfg.name) + '/contents/' + encodedRemotePath;

        try {
            try {
                await githubApiRequest(contentUrl + '?ref=' + encodeURIComponent(cfg.branch), {}, cfg.token);
                showToast('GitHub에 같은 경로의 문서가 이미 있습니다: ' + remotePath);
                return false;
            } catch (lookupError) {
                const status = Number(lookupError && lookupError.status ? lookupError.status : 0);
                if (status !== 404) throw lookupError;
            }

            const created = await githubApiRequest(contentUrl, {
                method: 'PUT',
                body: JSON.stringify({
                    message: 'create: ' + path + ' (' + new Date().toISOString() + ')',
                    content: encodeTextToGithubBase64(''),
                    branch: cfg.branch
                })
            }, cfg.token);

            const nextCache = Array.isArray(settings.githubCacheDocs) ? settings.githubCacheDocs.slice() : [];
            const entry = {
                id: 'gh:' + path,
                path: path,
                remotePath: remotePath,
                title: getGithubDocTitleFromPath(path),
                folderPath: requested.folderPath || 'root',
                content: '',
                sha: String(created && created.content && created.content.sha ? created.content.sha : ''),
                updatedAt: new Date().toISOString()
            };
            const existingIndex = nextCache.findIndex(function (doc) {
                return String(doc && doc.path || '') === path;
            });
            if (existingIndex >= 0) nextCache[existingIndex] = entry;
            else nextCache.push(entry);
            await setAiSettings({ githubCacheDocs: nextCache });

            const folderStateId = 'gh-folder:' + (entry.folderPath || 'root');
            if (isFolderCollapsed(folderStateId)) {
                folderCollapseState[folderStateId] = false;
                saveFolderCollapseState();
            }
            setCurrentDocumentInfo(requested.fileName, path, {
                source: 'github',
                githubPath: path,
                githubRemotePath: remotePath,
                githubSha: entry.sha,
                githubFolderPath: entry.folderPath
            });
            updateContent('');
            markPersistedState();
            await renderDBList();
            if (editorTextarea) editorTextarea.focus();
            showToast('GitHub 문서를 만들었습니다: ' + remotePath);
            if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
            return true;
        } catch (error) {
            showToast('GitHub document creation failed: ' + String(error && error.message ? error.message : error));
            return false;
        }
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

    async function checkGithubConnectionFromModal() {
        const api = window.GithubDataSettings;
        if (api && typeof api.checkGithubConnectionFromModal === 'function') {
            return await api.checkGithubConnectionFromModal();
        }
        showToast('GitHub module is not loaded.');
        return false;
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
        setCurrentDocumentInfo((doc.title || 'github-doc') + '.md', doc.path || null, {
            source: 'github',
            githubPath: doc.path || target,
            githubRemotePath: doc.remotePath || '',
            githubSha: doc.sha || '',
            githubFolderPath: doc.folderPath || 'root'
        });
        updateContent(doc.content || '');
        markPersistedState();
        showToast('Loaded from GitHub cache.');
        if (window.innerWidth < 1024 && !isSidebarHidden) toggleSidebarVisibility();
    }

    async function getGithubPushSource(docId, storageMode) {
        const id = String(docId || '').trim();
        if (!id) return { doc: null, folder: null, storageMode: 'indb' };
        const storageState = window.MDPStorage && typeof window.MDPStorage.getStatus === 'function'
            ? window.MDPStorage.getStatus()
            : null;
        const activeMode = storageState && storageState.activeMode === 'sqlite' ? 'sqlite' : 'indb';
        const requestedMode = storageMode === 'sqlite' || storageMode === 'indb'
            ? storageMode
            : activeMode;

        if (requestedMode === 'sqlite') {
            if (activeMode !== 'sqlite'
                || !window.MDPStorage
                || typeof window.MDPStorage.getDocument !== 'function'
                || typeof window.MDPStorage.listFolders !== 'function') {
                const unavailable = new Error('SQLite 저장소가 현재 활성화되어 있지 않습니다.');
                unavailable.code = 'SQLITE_STORAGE_NOT_ACTIVE';
                throw unavailable;
            }
            const results = await Promise.all([
                window.MDPStorage.getDocument(id),
                window.MDPStorage.listFolders()
            ]);
            const doc = results[0] || null;
            const folders = Array.isArray(results[1]) ? results[1] : [];
            const folder = doc
                ? folders.find(function (item) {
                    return String(item && item.id || '') === String(doc.folderId || 'root');
                }) || null
                : null;
            return { doc: doc, folder: folder, storageMode: 'sqlite' };
        }

        const tx = db.transaction(['documents', 'folders'], 'readonly');
        const docsStore = tx.objectStore('documents');
        const foldersStore = tx.objectStore('folders');
        const doc = await new Promise(function (resolve) {
            const req = docsStore.get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
        const folder = await new Promise(function (resolve) {
            if (!doc) {
                resolve(null);
                return;
            }
            const req = foldersStore.get(String(doc.folderId || 'root'));
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        });
        return { doc: doc, folder: folder, storageMode: 'indb' };
    }

    async function pushDocToGithub(docId, storageMode) {
        const id = String(docId || '').trim();
        if (!id) return;
        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
            showToast('Set GitHub token/repo/branch first.');
            return false;
        }

        let source;
        try {
            source = await getGithubPushSource(id, storageMode);
        } catch (error) {
            showToast('Document load failed: ' + String(error && error.message ? error.message : error));
            return false;
        }
        const doc = source && source.doc;
        const folder = source && source.folder;
        if (!doc) {
            showToast('Document not found.');
            return false;
        }
        const folderName = folder && String(folder.id || '') !== 'root'
            ? String(folder.name || '').trim().replace(/[\\/:*?"<>|]+/g, '_')
            : '';
        const docName = String(doc.title || 'untitled').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'untitled';
        const pushFolder = await chooseGithubPushFolder(settings, folderName || cfg.defaultPushPath);
        if (pushFolder === null) {
            showToast('GitHub push canceled.');
            return false;
        }
        const path = joinGithubPath(pushFolder, docName + '.md');
        const remotePath = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path;
        if (!confirmGithubDocumentPush(cfg, remotePath)) {
            showToast('GitHub push canceled.');
            return false;
        }
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
            return true;
        } catch (e) {
            showToast('GitHub push failed: ' + String(e && e.message ? e.message : e));
            return false;
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
            const sourceMode = currentDocumentRef && currentDocumentRef.id === currentDbDocId
                ? currentDocumentRef.storageMode
                : undefined;
            return !!(await pushDocToGithub(currentDbDocId, sourceMode));
        }

        let fileName = String(currentFileName || 'untitled.md').trim().replace(/[/\\:*?"<>|]+/g, '_');
        if (!fileName) fileName = 'untitled.md';
        if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += '.md';
        const githubOrigin = currentGithubFileRef && currentGithubFileRef.path ? currentGithubFileRef : null;
        let path = githubOrigin ? String(githubOrigin.path) : '';
        if (!path) {
            const pushFolder = await chooseGithubPushFolder(settings, cfg.defaultPushPath);
            if (pushFolder === null) {
                showToast('GitHub push canceled.');
                return false;
            }
            path = joinGithubPath(pushFolder, fileName);
        }
        const remotePath = githubOrigin && githubOrigin.remotePath
            ? String(githubOrigin.remotePath)
            : (cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' + path) : path);
        if (!confirmGithubDocumentPush(cfg, remotePath)) {
            showToast('GitHub push canceled.');
            return false;
        }
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
                folderPath: githubOrigin ? String(githubOrigin.folderPath || 'root') : 'root',
                content: String(currentMarkdown || ''),
                sha: String(pushed && pushed.content && pushed.content.sha ? pushed.content.sha : ''),
                updatedAt: new Date().toISOString()
            };
            if (idx >= 0) nextCache[idx] = entry;
            else nextCache.push(entry);
            await setAiSettings({ githubCacheDocs: nextCache });
            setCurrentDocumentInfo(fileName, path, {
                source: 'github',
                githubPath: path,
                githubRemotePath: remotePath,
                githubSha: entry.sha,
                githubFolderPath: entry.folderPath
            });
            markPersistedState();
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
        if (!searchTerm && !groups.has('root')) groups.set('root', []);
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

            const folderActions = document.createElement('span');
            folderActions.className = 'ml-auto flex items-center gap-1 sidebar-text';
            const createButton = document.createElement('button');
            createButton.type = 'button';
            createButton.className = 'text-[11px] leading-none px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white';
            createButton.title = (folderPath === 'root' ? 'ROOT' : folderPath) + ' 경로에 GitHub 문서 생성';
            createButton.setAttribute('aria-label', createButton.title);
            createButton.textContent = '+';
            createButton.addEventListener('click', function (event) {
                event.stopPropagation();
                createGithubDocumentInFolder(folderPath);
            });
            folderActions.appendChild(createButton);
            folderHeader.appendChild(folderActions);
            folderHeader.addEventListener('click', function () { toggleFolderCollapse(folderId); });
            folderDiv.appendChild(folderHeader);

            const docContainer = document.createElement('div');
            docContainer.className = (isSidebarCollapsed ? 'space-y-1' : 'sidebar-folder-documents space-y-1') + (isCollapsedFolder ? ' hidden' : '');
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
                    + '<div class="sidebar-doc-title-row flex items-start gap-2">'
                    + '<i data-lucide="file-code-2" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 ' + (isSidebarCollapsed ? 'hidden' : '') + '"></i>'
                    + '<span class="sidebar-doc-title font-semibold text-slate-700 dark:text-slate-300 ' + (isSidebarCollapsed ? '' : 'sidebar-text') + '">'
                    + escapeHtmlText(isSidebarCollapsed ? shortTitle : title)
                    + '</span>'
                    + '</div>'
                    + '<div class="flex gap-1 doc-action-btns" aria-label="문서 작업">'
                    + '<button type="button" onclick="event.stopPropagation(); loadFromGithubCache(\'' + escapeHtmlText(path) + '\')" class="doc-open-btn text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold">열기</button>'
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
        getGithubLoginUrlForRepoPath: getGithubLoginUrlForRepoPath,
        openGithubRepositoryLink: openGithubRepositoryLink,
        setGithubFeedback: setGithubFeedback,
        getGithubSettingsFoldedFromLocal: getGithubSettingsFoldedFromLocal,
        setGithubSettingsFoldedToLocal: setGithubSettingsFoldedToLocal,
        applyGithubSettingsFold: applyGithubSettingsFold,
        toggleGithubSettingsFold: toggleGithubSettingsFold,
        toggleGithubSettingsSection: toggleGithubSettingsSection,
        getStorageFeatureFlags: getStorageFeatureFlags,
        getStorageSidebarVisibility: getStorageSidebarVisibility,
        setStorageSidebarVisibility: setStorageSidebarVisibility,
        syncStorageSidebarVisibilitySettingsUI: syncStorageSidebarVisibilitySettingsUI,
        applyStorageSidebarVisibility: applyStorageSidebarVisibility,
        onStorageSidebarVisibilityChange: onStorageSidebarVisibilityChange,
        applyStorageFeatureVisibility: applyStorageFeatureVisibility,
        onStorageFeatureCheckboxChange: onStorageFeatureCheckboxChange,
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
        checkGithubConnectionFromModal: checkGithubConnectionFromModal,
        loadFromGithubCache: loadFromGithubCache,
        getGithubPushSource: getGithubPushSource,
        createGithubDocumentInFolder: createGithubDocumentInFolder,
        readTextFile: readTextFile,
        upsertTextFile: upsertTextFile,
        deleteTextFile: deleteTextFile,
        listTextFiles: listTextFiles,
        pushDocToGithub: pushDocToGithub,
        pushCurrentContentToGithub: pushCurrentContentToGithub,
        isGithubExportEnabled: isGithubExportEnabled,
        renderGithubCachedList: renderGithubCachedList
    };

    window.parseGithubRepoInput = parseGithubRepoInput;
    window.getGithubConfigFromSettings = getGithubConfigFromSettings;
    window.getGithubLinkPathFromConfig = getGithubLinkPathFromConfig;
    window.getGithubLoginUrlForRepoPath = getGithubLoginUrlForRepoPath;
    window.openGithubRepositoryLink = openGithubRepositoryLink;
    window.setGithubFeedback = setGithubFeedback;
    window.getGithubSettingsFoldedFromLocal = getGithubSettingsFoldedFromLocal;
    window.setGithubSettingsFoldedToLocal = setGithubSettingsFoldedToLocal;
    window.applyGithubSettingsFold = applyGithubSettingsFold;
    window.toggleGithubSettingsFold = toggleGithubSettingsFold;
    window.toggleGithubSettingsSection = toggleGithubSettingsSection;
    window.getStorageFeatureFlags = getStorageFeatureFlags;
    window.getStorageSidebarVisibility = getStorageSidebarVisibility;
    window.setStorageSidebarVisibility = setStorageSidebarVisibility;
    window.getStorageSidebarAutoRevealed = getStorageSidebarAutoRevealed;
    window.revealEnabledStorageSidebarFeaturesOnce = revealEnabledStorageSidebarFeaturesOnce;
    window.syncStorageSidebarVisibilitySettingsUI = syncStorageSidebarVisibilitySettingsUI;
    window.applyStorageSidebarVisibility = applyStorageSidebarVisibility;
    window.onStorageSidebarVisibilityChange = onStorageSidebarVisibilityChange;
    window.applyStorageFeatureVisibility = applyStorageFeatureVisibility;
    window.onStorageFeatureCheckboxChange = onStorageFeatureCheckboxChange;
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
    window.checkGithubConnectionFromModal = checkGithubConnectionFromModal;
    window.loadFromGithubCache = loadFromGithubCache;
    window.createGithubDocumentInFolder = createGithubDocumentInFolder;
    window.pushDocToGithub = pushDocToGithub;
    window.pushCurrentContentToGithub = pushCurrentContentToGithub;
    window.isGithubExportEnabled = isGithubExportEnabled;
    window.renderGithubCachedList = renderGithubCachedList;
})();

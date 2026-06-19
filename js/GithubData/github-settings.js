(function () {
    'use strict';

    const UI_TEMPLATE_URL = './js/GithubData/github-settings-ui.html';
    let uiReadyPromise = null;
    let githubConnectionCheckPromise = null;
    let githubConnectionCheckKey = '';

    function getUiFallbackHtml() {
        return ''
            + '<div class="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2" id="github-settings-wrap">'
            + '  <div class="flex items-center justify-between gap-2">'
            + '    <label class="flex items-center gap-2 cursor-pointer select-none">'
            + '      <input type="checkbox" id="ai-github-enabled" onclick="setTimeout(toggleGithubSettingsSection,0)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500">'
            + '      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">github 사용설정</span>'
            + '    </label>'
            + '    <button type="button" id="github-settings-fold-btn" onclick="toggleGithubSettingsFold()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">접기</button>'
            + '  </div>'
            + '  <div id="github-settings-body" class="hidden pl-6 space-y-2">'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">Personal Access Token (PAT)</label>'
            + '    <input type="password" id="github-token-input" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="off" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">토큰 발급: https://github.com/settings/tokens/new</a>'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">브랜치</label>'
            + '    <input type="text" id="github-branch-input" placeholder="main" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">pull 최대 파일 수 (1~10000)</label>'
            + '    <input type="number" id="github-pull-max-files-input" min="1" max="10000" step="1" value="10000" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">저장소 (owner/repo)</label>'
            + '    <input type="text" id="github-repo-input" placeholder="username/my-notes" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">기본 push 폴더 (선택)</label>'
            + '    <input type="text" id="github-default-push-path-input" placeholder="notes/research" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">새 저장소명(생성용)</label>'
            + '    <input type="text" id="github-new-repo-name-input" placeholder="my-notes" class="w-full px-3 py-1.5 border rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">'
            + '    <div class="flex items-center gap-2 flex-wrap">'
            + '      <button type="button" onclick="saveGithubSettingsFromModal()" class="px-3 py-1.5 bg-indigo-600 rounded-md text-xs font-medium text-white hover:bg-indigo-700">github 설정 저장</button>'
            + '      <button type="button" onclick="checkGithubConnectionFromModal()" class="px-3 py-1.5 bg-cyan-600 rounded-md text-xs font-medium text-white hover:bg-cyan-700">연결 확인</button>'
            + '      <button type="button" onclick="pullGithubRepo()" class="px-3 py-1.5 bg-slate-600 rounded-md text-xs font-medium text-white hover:bg-slate-700">pull</button>'
            + '      <button type="button" onclick="openGithubRepoCreateModal()" class="px-3 py-1.5 bg-emerald-600 rounded-md text-xs font-medium text-white hover:bg-emerald-700">저장소 생성</button>'
            + '    </div>'
            + '    <div id="github-connection-status" class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">'
            + '      <span id="github-connection-dot" class="inline-block w-2.5 h-2.5 rounded-full bg-slate-400"></span>'
            + '      <span id="github-connection-text">GitHub 연결 상태를 확인하지 않았습니다.</span>'
            + '    </div>'
            + '    <p id="github-settings-feedback" class="text-xs min-h-[1rem] text-slate-500 dark:text-slate-400" aria-live="polite"></p>'
            + '  </div>'
            + '</div>'
            + '<div id="github-create-repo-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-[2147483646] no-print" onclick="if(event.target===this) closeGithubRepoCreateModal()">'
            + '  <div class="w-full max-w-sm rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-4 space-y-3">'
            + '    <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">새 GitHub 저장소 생성</h3>'
            + '    <p class="text-xs text-slate-500 dark:text-slate-400">공개 범위를 선택한 뒤 생성하세요.</p>'
            + '    <div class="space-y-2">'
            + '      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer"><input type="radio" name="github-repo-visibility" value="public" checked class="text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"><span>Public</span></label>'
            + '      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer"><input type="radio" name="github-repo-visibility" value="private" class="text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"><span>Private</span></label>'
            + '    </div>'
            + '    <div class="flex items-center justify-end gap-2 pt-1">'
            + '      <button type="button" onclick="closeGithubRepoCreateModal()" class="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">취소</button>'
            + '      <button type="button" onclick="confirmGithubRepoCreateModal()" class="px-3 py-1.5 rounded-md bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700">생성</button>'
            + '    </div>'
            + '  </div>'
            + '</div>';
    }

    function setGithubFeedback(message, kind) {
        const el = document.getElementById('github-settings-feedback');
        if (!el) return;
        el.textContent = String(message || '');
        const t = String(kind || '').toLowerCase();
        if (t === 'error') el.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
        else if (t === 'ok') el.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
        else el.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
    }

    function setGithubConnectionStatus(state, message) {
        const wrap = document.getElementById('github-connection-status');
        const dot = document.getElementById('github-connection-dot');
        const text = document.getElementById('github-connection-text');
        if (!wrap || !dot || !text) return;
        const s = String(state || 'idle').toLowerCase();
        text.textContent = String(message || '');
        if (s === 'ok') {
            wrap.className = 'flex items-center gap-2 px-2 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300';
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.18)]';
        } else if (s === 'checking') {
            wrap.className = 'flex items-center gap-2 px-2 py-1.5 rounded-md border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-xs text-cyan-700 dark:text-cyan-300';
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-cyan-500';
        } else if (s === 'error') {
            wrap.className = 'flex items-center gap-2 px-2 py-1.5 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300';
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-red-500';
        } else {
            wrap.className = 'flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400';
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full bg-slate-400';
        }
    }

    function getGithubConfigFromFields() {
        const enabledEl = document.getElementById('ai-github-enabled');
        const tokenEl = document.getElementById('github-token-input');
        const repoEl = document.getElementById('github-repo-input');
        const branchEl = document.getElementById('github-branch-input');
        const repoRaw = String(repoEl && repoEl.value ? repoEl.value : '').trim()
            .replace(/^https?:\/\/github\.com\//i, '')
            .replace(/\.git$/i, '')
            .replace(/^\/+|\/+$/g, '');
        const parts = repoRaw.split('/').filter(Boolean);
        return {
            enabled: !!(enabledEl && enabledEl.checked),
            token: String(tokenEl && tokenEl.value ? tokenEl.value : '').trim(),
            owner: parts[0] || '',
            name: parts[1] || '',
            repo: parts.length >= 2 ? (parts[0] + '/' + parts[1]) : '',
            branch: String(branchEl && branchEl.value ? branchEl.value : 'main').trim() || 'main'
        };
    }

    async function checkGithubConnectionFromModal() {
        await ensureUiReady();
        const cfg = getGithubConfigFromFields();
        if (!cfg.enabled) {
            setGithubConnectionStatus('idle', 'GitHub 사용설정을 켜면 연결 상태를 확인합니다.');
            return false;
        }
        if (!cfg.token || !cfg.owner || !cfg.name || !cfg.branch) {
            setGithubConnectionStatus('error', 'PAT / 저장소 / 브랜치를 입력하세요.');
            return false;
        }
        const key = [cfg.repo, cfg.branch, cfg.token.slice(-8)].join('|');
        if (githubConnectionCheckPromise && githubConnectionCheckKey === key) return await githubConnectionCheckPromise;
        githubConnectionCheckKey = key;
        setGithubConnectionStatus('checking', 'GitHub 연결 확인 중...');
        githubConnectionCheckPromise = (async function () {
            await githubApiRequest('https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name), {}, cfg.token);
            await githubApiRequest('https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/git/ref/heads/' + encodeURIComponent(cfg.branch), {}, cfg.token);
            setGithubConnectionStatus('ok', '연결됨: ' + cfg.repo + ' / ' + cfg.branch);
            return true;
        })();
        try {
            return await githubConnectionCheckPromise;
        } catch (e) {
            setGithubConnectionStatus('error', '연결 실패: ' + String(e && e.message ? e.message : e));
            githubConnectionCheckPromise = null;
            return false;
        }
    }

    function loadUiTemplateFromUrl(url) {
        return fetch(url, { cache: 'no-store' }).then(function (resp) {
            if (!resp.ok) throw new Error('GitHub UI template load failed: ' + resp.status);
            return resp.text();
        });
    }

    function mountGithubUiFromHtml(html) {
        const slot = document.getElementById('github-settings-slot');
        if (!slot) return false;
        const template = document.createElement('template');
        template.innerHTML = String(html || '').trim();
        const wrap = template.content.querySelector('#github-settings-wrap');
        const modal = template.content.querySelector('#github-create-repo-modal');

        if (wrap) {
            slot.replaceChildren(wrap);
        } else {
            slot.innerHTML = '';
        }

        if (modal) {
            const existingModal = document.getElementById('github-create-repo-modal');
            if (existingModal && existingModal.parentNode) existingModal.parentNode.removeChild(existingModal);
            document.body.appendChild(modal);
        }

        return !!wrap;
    }

    function ensureUiReady() {
        if (document.getElementById('github-settings-wrap') && document.getElementById('github-create-repo-modal')) {
            return Promise.resolve(true);
        }
        if (uiReadyPromise) return uiReadyPromise;

        uiReadyPromise = Promise.resolve()
            .then(function () {
                return loadUiTemplateFromUrl(UI_TEMPLATE_URL)
                    .then(function (html) {
                        return mountGithubUiFromHtml(html);
                    })
                    .catch(function () {
                        return mountGithubUiFromHtml(getUiFallbackHtml());
                    });
            })
            .then(function (ok) {
                if (!ok) {
                    setGithubFeedback('GitHub UI mount failed.', 'error');
                    return false;
                }
                return true;
            });

        return uiReadyPromise;
    }

    function githubApiRequest(url, options, token) {
        const method = options && options.method ? options.method : 'GET';
        const headers = Object.assign({
            Accept: 'application/vnd.github+json',
            Authorization: 'token ' + String(token || '').trim()
        }, (options && options.headers) || {});
        const opts = Object.assign({}, options || {}, { method: method, headers: headers });
        return fetch(url, opts).then(async function (res) {
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
        });
    }

    function decodeGithubBase64ToText(encoded) {
        const clean = String(encoded || '').replace(/\n/g, '');
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    function getGithubDocTitleFromPath(path) {
        const p = String(path || '');
        const parts = p.split('/');
        const file = parts[parts.length - 1] || 'untitled.md';
        return file.replace(/\.(md|markdown|txt)$/i, '');
    }

    function toggleGithubSettingsSection(params) {
        const checked = !!(params && params.checked);
        const folded = !!(params && params.folded);
        const body = document.getElementById('github-settings-body');
        if (!body) return;
        body.classList.toggle('hidden', !checked || folded);
    }

    async function openGithubRepoCreateModal() {
        await ensureUiReady();
        const modal = document.getElementById('github-create-repo-modal');
        if (!modal) return;
        const selected = document.querySelector('input[name="github-repo-visibility"]:checked');
        if (!selected) {
            const publicRadio = document.querySelector('input[name="github-repo-visibility"][value="public"]');
            if (publicRadio) publicRadio.checked = true;
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async function closeGithubRepoCreateModal() {
        await ensureUiReady();
        const modal = document.getElementById('github-create-repo-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async function confirmGithubRepoCreateModal(deps) {
        await ensureUiReady();
        const selected = document.querySelector('input[name="github-repo-visibility"]:checked');
        const isPrivate = !!(selected && String(selected.value || '').toLowerCase() === 'private');
        await closeGithubRepoCreateModal();
        return await createGithubRepository({ private: isPrivate }, deps || {});
    }

    async function pullGithubRepo(deps) {
        await ensureUiReady();
        const d = deps || {};
        const getAiSettings = d.getAiSettings;
        const setAiSettings = d.setAiSettings;
        const getGithubConfigFromSettings = d.getGithubConfigFromSettings;
        const showToast = d.showToast || function () {};
        if (typeof getAiSettings !== 'function' || typeof setAiSettings !== 'function' || typeof getGithubConfigFromSettings !== 'function') {
            showToast('GitHub module dependency error.');
            return;
        }

        const settings = await getAiSettings() || {};
        const cfg = getGithubConfigFromSettings(settings);
        if (!cfg.enabled) {
            showToast('Enable github first in Settings.');
            return;
        }
        if (!cfg.token || !cfg.repo || !cfg.branch) {
            setGithubFeedback('PAT / 저장소 / 브랜치를 입력하세요.', 'error');
            showToast('Enter PAT, repository, and branch first.');
            return;
        }
        setGithubFeedback('Pulling from GitHub...', 'info');
        try {
            const treeUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1';
            const treeData = await githubApiRequest(treeUrl, {}, cfg.token);
            const treeItems = Array.isArray(treeData && treeData.tree) ? treeData.tree : [];
            const basePrefix = cfg.basePath ? (cfg.basePath.replace(/^\/+|\/+$/g, '') + '/') : '';
            const files = treeItems.filter(function (it) {
                if (!(it && it.type === 'blob' && /\.(md|markdown|txt)$/i.test(String(it.path || '')))) return false;
                if (!basePrefix) return true;
                const p = String(it.path || '');
                return p.startsWith(basePrefix);
            });
            const maxFiles = Math.max(1, Math.min(10000, Number(cfg.pullMaxFiles) || 10000));
            const limitedFiles = files.slice(0, maxFiles);
            const docs = [];
            for (let i = 0; i < limitedFiles.length; i++) {
                const f = limitedFiles[i];
                const remotePath = String(f.path || '').trim();
                if (!remotePath) continue;
                const relPath = basePrefix && remotePath.startsWith(basePrefix)
                    ? remotePath.slice(basePrefix.length)
                    : remotePath;
                if (!relPath) continue;
                const contentUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + remotePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);
                const contentData = await githubApiRequest(contentUrl, {}, cfg.token);
                const text = decodeGithubBase64ToText(contentData && contentData.content ? contentData.content : '');
                const folderPath = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : 'root';
                docs.push({
                    id: 'gh:' + relPath,
                    path: relPath,
                    remotePath: remotePath,
                    title: getGithubDocTitleFromPath(relPath),
                    folderPath: folderPath || 'root',
                    content: text,
                    sha: String(contentData && contentData.sha ? contentData.sha : ''),
                    updatedAt: new Date().toISOString()
                });
            }
        await setAiSettings({
            githubEnabled: true,
            githubToken: cfg.token,
            githubRepo: cfg.repo,
            githubBranch: cfg.branch,
            githubPullMaxFiles: maxFiles,
            githubCacheDocs: docs,
            githubLastPulledAt: new Date().toISOString()
        });
            const limitedNote = files.length > maxFiles
                ? ' (limited to ' + maxFiles + ' of ' + files.length + ')'
                : '';
            setGithubFeedback('Pulled ' + docs.length + ' files from GitHub' + limitedNote + '.', 'ok');
            setGithubConnectionStatus('ok', '연결됨: ' + cfg.repo + ' / ' + cfg.branch);
            showToast('GitHub pull complete: ' + docs.length + ' files' + limitedNote);
            if (typeof d.renderDBList === 'function') d.renderDBList();
        } catch (e) {
            setGithubFeedback(String(e && e.message ? e.message : e), 'error');
            showToast('GitHub pull failed.');
        }
    }

    async function createGithubRepository(options, deps) {
        await ensureUiReady();
        const d = deps || {};
        const setAiSettings = d.setAiSettings;
        const applyGithubUiState = d.applyGithubUiState;
        const showToast = d.showToast || function () {};
        if (typeof setAiSettings !== 'function' || typeof applyGithubUiState !== 'function') {
            showToast('GitHub module dependency error.');
            return;
        }

        const opts = (options && typeof options === 'object') ? options : {};
        const isPrivate = !!opts.private;
        const tokenInput = document.getElementById('github-token-input');
        const branchInput = document.getElementById('github-branch-input');
        const newRepoInput = document.getElementById('github-new-repo-name-input');
        const token = String(tokenInput && tokenInput.value ? tokenInput.value : '').trim();
        const branch = String(branchInput && branchInput.value ? branchInput.value : 'main').trim() || 'main';
        const newRepo = String(newRepoInput && newRepoInput.value ? newRepoInput.value : '').trim();
        if (!token || !newRepo) {
            setGithubFeedback('PAT와 새 저장소명을 입력하세요.', 'error');
            showToast('PAT and new repository name are required.');
            return;
        }
        setGithubFeedback('Creating ' + (isPrivate ? 'private' : 'public') + ' repository...', 'info');
        try {
            const created = await githubApiRequest('https://api.github.com/user/repos', {
                method: 'POST',
                body: JSON.stringify({ name: newRepo, private: isPrivate, auto_init: true })
            }, token);
            const fullName = String(created && created.full_name ? created.full_name : '');
            const repoInput = document.getElementById('github-repo-input');
            if (repoInput && fullName) repoInput.value = fullName;
            await setAiSettings({
                githubEnabled: true,
                githubToken: token,
                githubRepo: fullName || (repoInput && repoInput.value ? repoInput.value.trim() : ''),
                githubBranch: branch
            });
            await applyGithubUiState();
            await checkGithubConnectionFromModal();
            setGithubFeedback('Repository created (' + (isPrivate ? 'private' : 'public') + '): ' + fullName, 'ok');
            showToast('GitHub ' + (isPrivate ? 'private' : 'public') + ' repository created.');
        } catch (e) {
            setGithubFeedback(String(e && e.message ? e.message : e), 'error');
            showToast('GitHub repository creation failed.');
        }
    }

    async function saveGithubSettingsFromModal(deps) {
        await ensureUiReady();
        const d = deps || {};
        const setAiSettings = d.setAiSettings;
        const applyGithubUiState = d.applyGithubUiState;
        const showToast = d.showToast || function () {};
        if (typeof setAiSettings !== 'function' || typeof applyGithubUiState !== 'function') {
            showToast('GitHub module dependency error.');
            return;
        }

        const enabledEl = document.getElementById('ai-github-enabled');
        const tokenEl = document.getElementById('github-token-input');
        const repoEl = document.getElementById('github-repo-input');
        const branchEl = document.getElementById('github-branch-input');
        const pullMaxEl = document.getElementById('github-pull-max-files-input');
        const defaultPushPathEl = document.getElementById('github-default-push-path-input');
        const enabled = !!(enabledEl && enabledEl.checked);
        const token = String(tokenEl && tokenEl.value ? tokenEl.value : '').trim();
        const repo = String(repoEl && repoEl.value ? repoEl.value : '').trim();
        const branch = String(branchEl && branchEl.value ? branchEl.value : 'main').trim() || 'main';
        const defaultPushPath = String(defaultPushPathEl && defaultPushPathEl.value ? defaultPushPathEl.value : '').trim();
        const rawPullMax = Number(pullMaxEl && pullMaxEl.value ? pullMaxEl.value : 10000);
        const pullMaxFiles = Number.isFinite(rawPullMax) ? Math.max(1, Math.min(10000, Math.floor(rawPullMax))) : 10000;
        if (pullMaxEl) pullMaxEl.value = String(pullMaxFiles);
        await setAiSettings({
            githubEnabled: enabled,
            githubToken: token,
            githubRepo: repo,
            githubBranch: branch,
            githubDefaultPushPath: defaultPushPath,
            githubPullMaxFiles: pullMaxFiles
        });
        await applyGithubUiState();
        const connected = await checkGithubConnectionFromModal();
        setGithubFeedback(connected ? 'GitHub settings saved. Connection verified.' : 'GitHub settings saved. Check connection message.', connected ? 'ok' : 'error');
        showToast('GitHub settings saved.');
    }

    window.GithubDataSettings = {
        ensureUiReady: ensureUiReady,
        setGithubFeedback: setGithubFeedback,
        setGithubConnectionStatus: setGithubConnectionStatus,
        checkGithubConnectionFromModal: checkGithubConnectionFromModal,
        toggleGithubSettingsSection: toggleGithubSettingsSection,
        openGithubRepoCreateModal: openGithubRepoCreateModal,
        closeGithubRepoCreateModal: closeGithubRepoCreateModal,
        confirmGithubRepoCreateModal: confirmGithubRepoCreateModal,
        pullGithubRepo: pullGithubRepo,
        createGithubRepository: createGithubRepository,
        saveGithubSettingsFromModal: saveGithubSettingsFromModal
    };

    ensureUiReady();
})();

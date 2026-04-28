(function () {
    'use strict';

    const GDOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
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
    const DEFAULT_SHARE_SITES = ['docs', 'story', 'gist', 'board'];
    const DOCSYNC_DEBOUNCE_MS = 2000;

    let gdocsGisInited = false;
    let gdocsTokenClient = null;
    let gdocsTokenClientClientId = '';
    let currentAccessToken = '';

    let googleDocsUseEnabled = false;
    let toDocsVisible = false;
    let docSyncVisible = false;
    let shareMenuExpanded = false;
    let shareSites = DEFAULT_SHARE_SITES.slice();
    let customShareDestinations = [];

    let docSyncEnabled = false;
    let docSyncBusy = false;
    let docSyncDirty = false;
    let docSyncTimer = null;
    let docSyncDocumentId = '';
    let docSyncLastText = '';
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

    async function injectGoogleDocsUiFragments() {
        let injected = false;
        const toolbarSlot = document.getElementById('google-docs-toolbar-slot');
        if (toolbarSlot && !document.getElementById('btn-docsync')) {
            const toolbarHtml = await loadHtmlFragment('./ShareSites/googleDocs-toolbar.html');
            if (toolbarHtml) {
                toolbarSlot.innerHTML = toolbarHtml;
                injected = true;
            }
        }

        const settingsSlot = document.getElementById('google-docs-settings-slot');
        if (settingsSlot && !document.getElementById('gdocs-settings')) {
            const settingsHtml = await loadHtmlFragment('./ShareSites/googleDocs-settings.html');
            if (settingsHtml) {
                settingsSlot.innerHTML = settingsHtml;
                injected = true;
            }
        }

        if (injected && typeof getAiSettings === 'function') {
            const settings = await getAiSettings();
            if (settings) loadGoogleDocsSettingsUI(settings);
            else applyToDocsVisibility({ toDocsVisible: false });
            setDocSyncButtonState('', false);
        }
    }

    async function ensureGoogleDocsUiReady() {
        if (document.getElementById('btn-docsync') && document.getElementById('gdocs-settings')) return;
        await injectGoogleDocsUiFragments();
    }

    function isValidGoogleOAuthClientId(value) {
        const v = String(value || '').trim();
        return /^[0-9]+-[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(v);
    }

    function isValidGoogleCloudApiKey(value) {
        const v = String(value || '').trim();
        return /^AIza[0-9A-Za-z_-]{20,200}$/.test(v);
    }

    function getCurrentMarkdownText() {
        if (typeof editorTextarea !== 'undefined' && editorTextarea && typeof editorTextarea.value === 'string') {
            return String(editorTextarea.value || '');
        }
        if (typeof currentMarkdown !== 'undefined') return String(currentMarkdown || '');
        return '';
    }

    function setToDocsButtonBusy(busy) {
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        btn.disabled = !!busy;
        btn.classList.toggle('opacity-60', !!busy);
        btn.classList.toggle('cursor-not-allowed', !!busy);
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function setDocSyncButtonState(label, busy) {
        const btn = document.getElementById('btn-docsync');
        if (!btn) return;
        const text = String(label || '').trim();
        if (text) btn.textContent = text;
        else btn.textContent = docSyncEnabled ? 'DocSyn ON' : 'DocSyn';
        const b = !!busy;
        btn.disabled = b;
        btn.classList.toggle('opacity-60', b);
        btn.classList.toggle('cursor-not-allowed', b);
        btn.setAttribute('aria-busy', b ? 'true' : 'false');
    }

    function getToDocsVisibleFromSettings(settings) {
        return !!(settings && settings.toDocsVisible === true);
    }

    function getGoogleDocsUseEnabledFromSettings(settings) {
        return !!(settings && settings.googleDocsUseEnabled === true);
    }

    function getDocSyncVisibleFromSettings(settings) {
        return !!(settings && settings.docSyncVisible === true);
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
        // Modeless floating shell: keep background fully interactive.
        modal.className = 'fixed inset-0 hidden items-start justify-center z-[65] no-print pointer-events-none';
        modal.innerHTML = ''
            + '<div id="share-links-modal-panel" class="pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 w-[min(860px,94vw)] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4">'
            + '  <div id="share-links-modal-header" class="flex items-center justify-between mb-3 cursor-move select-none">'
            + '    <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">Share</h3>'
            + '    <div class="flex items-center gap-2">'
            + '      <button type="button" onclick="closeShareLinksModal()" class="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">Close</button>'
            + '    </div>'
            + '  </div>'
            + '  <p class="text-sm text-slate-600 dark:text-slate-300 mb-3">Click a destination. Copy Styled runs first, then the site opens in a new tab.</p>'
            + '  <div id="share-links-modal-list" class="flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1"></div>'
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
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        header.addEventListener('mousedown', function (event) {
            if (event.button !== 0) return;
            dragging = true;
            startX = event.clientX;
            startY = event.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';
            panel.style.right = 'auto';
            panel.style.transform = 'none';
            document.body.classList.add('select-none');
            event.preventDefault();
        });

        window.addEventListener('mousemove', function (event) {
            if (!dragging) return;
            const nextLeft = startLeft + (event.clientX - startX);
            const nextTop = startTop + (event.clientY - startY);
            panel.style.left = Math.max(6, nextLeft) + 'px';
            panel.style.top = Math.max(6, nextTop) + 'px';
        });

        window.addEventListener('mouseup', function () {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('select-none');
        });

        shareModalDragBound = true;
    }

    function moveShareLinksModalToRightSide() {
        const panel = document.getElementById('share-links-modal-panel');
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const currentWidth = Math.max(1, Math.round(rect.width || panel.offsetWidth || 420));
        const targetWidth = Math.max(220, Math.round(currentWidth / 3));
        panel.style.left = 'auto';
        panel.style.right = '12px';
        panel.style.top = '84px';
        panel.style.transform = 'none';
        panel.style.width = targetWidth + 'px';
        panel.style.maxWidth = '92vw';
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
            btn.className = 'px-3 py-1.5 rounded border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-slate-700';
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
                moveShareLinksModalToRightSide();
            });
        }
    }

    function applyGoogleDocsUseSectionVisibility(settings) {
        const s = settings || {};
        googleDocsUseEnabled = getGoogleDocsUseEnabledFromSettings(s);
        const useCheck = document.getElementById('gdocs-use-enabled');
        const body = document.getElementById('gdocs-settings-body');
        if (useCheck) useCheck.checked = googleDocsUseEnabled;
        if (body) body.classList.toggle('hidden', !googleDocsUseEnabled);
    }

    function refreshDocSyncButtonVisibility(settings) {
        const s = settings || {};
        googleDocsUseEnabled = getGoogleDocsUseEnabledFromSettings(s);
        docSyncVisible = getDocSyncVisibleFromSettings(s);
        const inEditMode = (typeof isEditMode !== 'undefined' && isEditMode);
        const docSyncBtn = document.getElementById('btn-docsync');
        if (!docSyncBtn) return;
        if (!googleDocsUseEnabled || !docSyncVisible || inEditMode) docSyncBtn.classList.add('hidden');
        else docSyncBtn.classList.remove('hidden');
        setDocSyncButtonState('', false);
    }

    function applyToDocsVisibility(settings) {
        const s = settings || {};
        applyGoogleDocsUseSectionVisibility(s);
        if (window.ShareModule && typeof window.ShareModule.applyToDocsVisibility === 'function') {
            window.ShareModule.applyToDocsVisibility(s);
        }
        refreshDocSyncButtonVisibility(s);
    }

    async function toggleGoogleDocsUseSection() {
        const check = document.getElementById('gdocs-use-enabled');
        const enabled = !!(check && check.checked);
        if (!enabled && docSyncEnabled) stopDocSync(false);
        await setAiSettings({ googleDocsUseEnabled: enabled });
        const s = await getAiSettings();
        const toDocsCheck = document.getElementById('todocs-visible');
        applyToDocsVisibility(s || { googleDocsUseEnabled: enabled, toDocsVisible: !!(toDocsCheck && toDocsCheck.checked) });
    }

    async function toggleToDocsSection() {
        if (window.ShareModule && typeof window.ShareModule.toggleToDocsSection === 'function') {
            await window.ShareModule.toggleToDocsSection();
            const s = await getAiSettings();
            refreshDocSyncButtonVisibility(s || {});
            return;
        }
        const check = document.getElementById('todocs-visible');
        const enabled = !!(check && check.checked);
        await setAiSettings({ toDocsVisible: enabled });
        const s = await getAiSettings();
        applyToDocsVisibility(s || { toDocsVisible: enabled });
    }

    async function toggleDocSyncSection() {
        const check = document.getElementById('docsync-visible');
        const enabled = !!(check && check.checked);
        await setAiSettings({ docSyncVisible: enabled });
        const s = await getAiSettings();
        applyToDocsVisibility(s || { docSyncVisible: enabled });
    }

    function shouldShowInViewMode() {
        if (window.ShareModule && typeof window.ShareModule.shouldShowInViewMode === 'function') {
            return !!window.ShareModule.shouldShowInViewMode();
        }
        return !!toDocsVisible;
    }

    function shouldShowDocSyncInViewMode() {
        return !!(googleDocsUseEnabled && docSyncVisible);
    }

    function ensureGisReady(timeoutMs) {
        const timeout = Math.max(1000, Number(timeoutMs) || 12000);
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const tick = function () {
                const ready = gdocsGisInited && window.google && window.google.accounts && window.google.accounts.oauth2;
                if (ready) {
                    resolve();
                    return;
                }
                if (Date.now() > deadline) {
                    reject(new Error('Google Identity script not loaded.'));
                    return;
                }
                setTimeout(tick, 120);
            };
            tick();
        });
    }

    async function ensureTokenClient(clientId) {
        const cid = String(clientId || '').trim();
        if (!cid) throw new Error('OAuth Client ID is missing.');
        await ensureGisReady(12000);
        if (gdocsTokenClient && gdocsTokenClientClientId === cid) return gdocsTokenClient;
        gdocsTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: cid,
            scope: GDOCS_SCOPE,
            callback: ''
        });
        gdocsTokenClientClientId = cid;
        return gdocsTokenClient;
    }

    async function requestAccessToken(clientId) {
        const tokenClient = await ensureTokenClient(clientId);
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = (fn, value) => {
                if (settled) return;
                settled = true;
                try { clearTimeout(timeoutId); } catch (_) {}
                fn(value);
            };

            const timeoutId = setTimeout(() => done(reject, new Error('Google 인증 시간이 초과되었습니다.')), 25000);

            tokenClient.error_callback = function (err) {
                const code = err && err.type ? String(err.type) : 'oauth_error';
                if (code === 'popup_failed_to_open' || code === 'popup_closed') {
                    done(reject, new Error('Google 인증 팝업이 차단되었거나 닫혔습니다.'));
                    return;
                }
                done(reject, new Error('Google 인증 오류: ' + code));
            };

            tokenClient.callback = function (resp) {
                if (!resp || resp.error) {
                    done(reject, new Error(resp && resp.error ? String(resp.error) : 'Token request failed.'));
                    return;
                }
                const token = String(resp.access_token || '').trim();
                if (!token) {
                    done(reject, new Error('No access token returned.'));
                    return;
                }
                currentAccessToken = token;
                done(resolve, token);
            };

            tokenClient.requestAccessToken({ prompt: currentAccessToken ? '' : 'consent' });
        });
    }

    async function docsFetch(url, token, init) {
        const headers = Object.assign({}, (init && init.headers) || {}, {
            Authorization: 'Bearer ' + token
        });
        const res = await fetch(url, Object.assign({}, init || {}, { headers: headers }));
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = data && data.error && data.error.message ? String(data.error.message) : ('HTTP ' + res.status);
            throw new Error(msg);
        }
        return data || {};
    }

    async function createGoogleDoc(token, title) {
        const body = { title: String(title || 'MDproViewer Sync').trim() || 'MDproViewer Sync' };
        const data = await docsFetch('https://docs.googleapis.com/v1/documents', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const id = String(data && data.documentId ? data.documentId : '').trim();
        if (!id) throw new Error('Google Docs 문서 생성에 실패했습니다.');
        return id;
    }

    async function replaceGoogleDocContent(documentId, token, text) {
        const docId = String(documentId || '').trim();
        if (!docId) throw new Error('Google Docs 문서 ID가 없습니다.');

        const getData = await docsFetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId), token, { method: 'GET' });
        const content = getData && getData.body && Array.isArray(getData.body.content) ? getData.body.content : [];
        let endIndex = 1;
        if (content.length > 0) {
            const last = content[content.length - 1];
            const idx = Number(last && last.endIndex ? last.endIndex : 1);
            endIndex = Number.isFinite(idx) ? Math.max(1, idx) : 1;
        }

        const requests = [];
        if (endIndex > 1) {
            requests.push({
                deleteContentRange: {
                    range: { startIndex: 1, endIndex: endIndex - 1 }
                }
            });
        }
        const source = String(text || '');
        if (source.length > 0) {
            requests.push({
                insertText: {
                    location: { index: 1 },
                    text: source
                }
            });
        }

        if (!requests.length) return;
        await docsFetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + ':batchUpdate', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: requests })
        });
    }

    async function resolveGooglePickerApiKey(settingsMaybe) {
        let settings = settingsMaybe || null;
        if (!settings && typeof getAiSettings === 'function') settings = await getAiSettings();
        const s = settings || {};
        const candidates = [
            { key: s.googlePickerApiKey, source: 'googlePickerApiKey' },
            { key: s.googleDocsApiKey, source: 'googleDocsApiKey(legacy)' },
            { key: s.apiKey, source: 'aiStudioApiKey' },
            { key: (typeof localStorage !== 'undefined' ? localStorage.getItem('ss_gemini_api_key') : ''), source: 'localStorage:ss_gemini_api_key' }
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const key = String(candidates[i].key || '').trim();
            if (!key) continue;
            return { key: key, source: candidates[i].source, valid: isValidGoogleCloudApiKey(key) };
        }
        return { key: '', source: '', valid: false };
    }

    function clearDocSyncTimer() {
        if (docSyncTimer) {
            clearTimeout(docSyncTimer);
            docSyncTimer = null;
        }
    }

    function stopDocSync(showMsg) {
        docSyncEnabled = false;
        docSyncBusy = false;
        docSyncDirty = false;
        clearDocSyncTimer();
        docSyncDocumentId = '';
        docSyncLastText = '';
        setDocSyncButtonState('', false);
        if (showMsg && typeof showToast === 'function') showToast('DocSyn을 종료했습니다.');
    }

    function scheduleDocSync(delayMs) {
        if (!docSyncEnabled || !docSyncDocumentId) return;
        const delay = Math.max(0, Number(delayMs) || 0);
        clearDocSyncTimer();
        docSyncTimer = setTimeout(function () {
            docSyncTimer = null;
            runDocSyncNow();
        }, delay);
    }

    async function runDocSyncNow() {
        if (!docSyncEnabled || !docSyncDocumentId) return;
        if (docSyncBusy) {
            docSyncDirty = true;
            return;
        }
        const latest = getCurrentMarkdownText();
        if (!docSyncDirty && latest === docSyncLastText) return;

        docSyncBusy = true;
        setDocSyncButtonState('DocSyn Sync', true);
        try {
            await replaceGoogleDocContent(docSyncDocumentId, currentAccessToken, latest);
            docSyncLastText = latest;
            docSyncDirty = false;
            setDocSyncButtonState('DocSyn ON', false);
        } catch (err) {
            if (typeof showToast === 'function') showToast('DocSyn 동기화 실패: ' + (err && err.message ? err.message : '오류'));
            setDocSyncButtonState('DocSyn Err', false);
        } finally {
            docSyncBusy = false;
            if (docSyncDirty) scheduleDocSync(300);
        }
    }

    async function ensureLinkedGoogleDocForCurrentFile(token) {
        if (!(typeof window.getCurrentDbDocumentId === 'function')) {
            throw new Error('문서 식별 함수가 없습니다.');
        }
        const localDocId = String(window.getCurrentDbDocumentId() || '').trim();
        if (!localDocId) {
            throw new Error('먼저 현재 문서를 inDB에 저장한 뒤 DocSyn을 사용하세요.');
        }

        let googleDocId = '';
        if (typeof window.getCurrentFileGoogleDocId === 'function') {
            googleDocId = String(await window.getCurrentFileGoogleDocId() || '').trim();
        }

        if (!googleDocId) {
            const fileName = String((typeof currentFileName !== 'undefined' ? currentFileName : 'Untitled') || 'Untitled')
                .replace(/\.md$/i, '')
                .trim() || 'MDproViewer Sync';
            googleDocId = await createGoogleDoc(token, fileName);
            if (typeof window.setCurrentFileGoogleDocId === 'function') {
                const ok = await window.setCurrentFileGoogleDocId(googleDocId);
                if (!ok) throw new Error('googleDocId 저장에 실패했습니다.');
            }
            if (typeof showToast === 'function') showToast('현재 파일에 새 Google Docs 문서를 연결했습니다.');
        }

        return googleDocId;
    }

    async function openToDocs() {
        if (window.ShareModule && typeof window.ShareModule.openShareDestination === 'function') {
            return window.ShareModule.openShareDestination('docs');
        }
        return openShareDestination('docs');
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
        if (window.ShareModule && typeof window.ShareModule.openShareDestination === 'function') {
            return window.ShareModule.openShareDestination(destKey);
        }
        await ensureGoogleDocsUiReady();
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
        if (window.ShareModule && typeof window.ShareModule.toggleShareSiteSelection === 'function') {
            return window.ShareModule.toggleShareSiteSelection();
        }
        await ensureGoogleDocsUiReady();
        const selectedKeys = getAllShareDestinations()
            .filter(function (item) {
                const el = document.getElementById(item.checkboxId);
                return !!(el && el.checked);
            })
            .map(function (item) { return item.key; });

        await setAiSettings({
            shareSites: selectedKeys,
            customShareDestinations: getCustomShareDestinationsForSave()
        });
        const settings = await getAiSettings();
        applyToDocsVisibility(settings || { shareSites: selectedKeys, customShareDestinations: getCustomShareDestinationsForSave() });
    }

    async function addShareDestinationFromSettings() {
        if (window.ShareModule && typeof window.ShareModule.addShareDestinationFromSettings === 'function') {
            return window.ShareModule.addShareDestinationFromSettings();
        }
        await ensureGoogleDocsUiReady();
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
        await setAiSettings({
            shareSites: shareSites.slice(),
            customShareDestinations: getCustomShareDestinationsForSave()
        });
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        if (typeof showToast === 'function') showToast('Share 대상이 추가되었습니다.');
    }

    async function removeCustomShareDestination(key) {
        if (window.ShareModule && typeof window.ShareModule.removeCustomShareDestination === 'function') {
            return window.ShareModule.removeCustomShareDestination(key);
        }
        const targetKey = String(key || '').trim();
        if (!targetKey) return;
        customShareDestinations = customShareDestinations.filter(function (item) { return item.key !== targetKey; });
        shareSites = shareSites.filter(function (k) { return k !== targetKey; });
        renderCustomShareDestinationSettings();
        syncShareSiteCheckboxes(shareSites);
        await setAiSettings({
            shareSites: shareSites.slice(),
            customShareDestinations: getCustomShareDestinationsForSave()
        });
    }

    async function toggleShareLinksMenu() {
        if (window.ShareModule && typeof window.ShareModule.toggleShareLinksMenu === 'function') {
            return window.ShareModule.toggleShareLinksMenu();
        }
        await ensureGoogleDocsUiReady();
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

    async function toggleGoogleDocSync() {
        await ensureGoogleDocsUiReady();
        if (docSyncEnabled) {
            stopDocSync(true);
            return;
        }

        try {
            const settings = await getAiSettings();
            const clientId = String(settings && settings.googleDocsClientId ? settings.googleDocsClientId : '').trim();
            if (!clientId) throw new Error('OAuth Client ID를 먼저 저장해주세요.');
            if (!isValidGoogleOAuthClientId(clientId)) throw new Error('OAuth Client ID 형식을 확인해주세요.');

            setDocSyncButtonState('DocSyn Auth', true);
            const token = await requestAccessToken(clientId);

            setDocSyncButtonState('DocSyn Link', true);
            const googleDocId = await ensureLinkedGoogleDocForCurrentFile(token);
            docSyncDocumentId = googleDocId;

            setDocSyncButtonState('DocSyn Init', true);
            const text = getCurrentMarkdownText();
            await replaceGoogleDocContent(docSyncDocumentId, token, text);
            docSyncLastText = text;

            docSyncEnabled = true;
            docSyncDirty = false;
            setDocSyncButtonState('DocSyn ON', false);
            if (typeof showToast === 'function') showToast('DocSyn이 시작되었습니다. (2초 디바운스)');
        } catch (err) {
            stopDocSync(false);
            const raw = err && err.message ? String(err.message) : 'DocSyn 시작 실패';
            let msg = raw;
            if (/redirect_uri_mismatch/i.test(raw) || /origin_mismatch/i.test(raw)) {
                const origin = (typeof location !== 'undefined' && location && location.origin) ? location.origin : '(현재 origin 확인 불가)';
                msg = 'OAuth 설정 오류(redirect/origin mismatch). Google Cloud OAuth 클라이언트의 승인된 JavaScript 원본에 ' + origin + ' 을 추가하세요.';
            }
            if (typeof showToast === 'function') showToast(msg);
        }
    }

    function handleEditorChanged() {
        if (!docSyncEnabled) return;
        docSyncDirty = true;
        scheduleDocSync(DOCSYNC_DEBOUNCE_MS);
    }

    function handleActiveDocumentChanged() {
        if (!docSyncEnabled) return;
        stopDocSync(false);
        if (typeof showToast === 'function') showToast('문서가 변경되어 DocSyn을 종료했습니다. 다시 켜주세요.');
    }

    function validateGoogleDocsCredentialInputsUI() {
        const clientInput = document.getElementById('gdocs-client-id');
        const clientFeedback = document.getElementById('gdocs-client-id-feedback');
        const pickerInput = document.getElementById('gdocs-picker-api-key');
        const pickerFeedback = document.getElementById('gdocs-picker-api-key-feedback');

        const clientId = String(clientInput && clientInput.value ? clientInput.value : '').trim();
        if (clientFeedback) {
            if (!clientId) {
                clientFeedback.textContent = '';
                clientFeedback.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
            } else if (isValidGoogleOAuthClientId(clientId)) {
                clientFeedback.textContent = 'Valid OAuth Client ID format.';
                clientFeedback.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
            } else {
                clientFeedback.textContent = 'Invalid OAuth Client ID format.';
                clientFeedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
        }

        const pickerKey = String(pickerInput && pickerInput.value ? pickerInput.value : '').trim();
        if (pickerFeedback) {
            if (!pickerKey) {
                pickerFeedback.textContent = 'Optional. Used only when Google Picker is enabled.';
                pickerFeedback.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
            } else if (isValidGoogleCloudApiKey(pickerKey)) {
                pickerFeedback.textContent = 'Valid Google API key format.';
                pickerFeedback.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
            } else {
                pickerFeedback.textContent = 'Invalid Google API key format.';
                pickerFeedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
        }
    }

    async function saveGoogleDocsCredentials() {
        await ensureGoogleDocsUiReady();
        const clientInput = document.getElementById('gdocs-client-id');
        const pickerInput = document.getElementById('gdocs-picker-api-key');
        const feedback = document.getElementById('gdocs-credentials-feedback');

        const clientId = String(clientInput && clientInput.value ? clientInput.value : '').trim();
        const manualPickerKey = String(pickerInput && pickerInput.value ? pickerInput.value : '').trim();

        if (!clientId) {
            if (feedback) {
                feedback.textContent = 'OAuth Client ID is required.';
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast('OAuth Client ID를 입력해주세요.');
            return;
        }
        if (!isValidGoogleOAuthClientId(clientId)) {
            validateGoogleDocsCredentialInputsUI();
            if (feedback) {
                feedback.textContent = 'Invalid OAuth Client ID format.';
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast('OAuth Client ID 형식을 확인해주세요.');
            return;
        }

        if (manualPickerKey && !isValidGoogleCloudApiKey(manualPickerKey)) {
            validateGoogleDocsCredentialInputsUI();
            if (feedback) {
                feedback.textContent = 'Invalid Picker API key format.';
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast('Picker API key 형식을 확인해주세요.');
            return;
        }

        if (feedback) {
            feedback.textContent = 'Checking OAuth Client ID...';
            feedback.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
        }

        try {
            await ensureTokenClient(clientId);
        } catch (err) {
            const msg = err && err.message ? err.message : 'Verification failed.';
            if (feedback) {
                feedback.textContent = msg;
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast(msg);
            return;
        }

        let pickerInfo = { key: '', source: '', valid: false };
        if (manualPickerKey) {
            pickerInfo = { key: manualPickerKey, source: 'manual', valid: true };
        } else {
            pickerInfo = await resolveGooglePickerApiKey();
        }

        const payload = { googleDocsClientId: clientId };
        if (pickerInfo.valid) payload.googlePickerApiKey = pickerInfo.key;

        await setAiSettings(payload);

        if (feedback) {
            if (pickerInfo.valid) {
                feedback.textContent = 'DocSync settings saved. Picker key source: ' + pickerInfo.source + '.';
            } else {
                feedback.textContent = 'DocSync settings saved. Picker key not set.';
            }
            feedback.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
        }
        if (typeof showToast === 'function') showToast('DocSync settings saved.');
    }

    function resetGoogleDocsSettingsUI() {
        const useCheck = document.getElementById('gdocs-use-enabled');
        if (useCheck) useCheck.checked = false;
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = false;
        const docSyncCheck = document.getElementById('docsync-visible');
        if (docSyncCheck) docSyncCheck.checked = false;

        const clientInput = document.getElementById('gdocs-client-id');
        if (clientInput) clientInput.value = '';

        const pickerInput = document.getElementById('gdocs-picker-api-key');
        if (pickerInput) pickerInput.value = '';

        const feedback = document.getElementById('gdocs-credentials-feedback');
        if (feedback) feedback.textContent = '';

        const clientFeedback = document.getElementById('gdocs-client-id-feedback');
        if (clientFeedback) clientFeedback.textContent = '';

        const pickerFeedback = document.getElementById('gdocs-picker-api-key-feedback');
        if (pickerFeedback) pickerFeedback.textContent = '';

        if (window.ShareModule && typeof window.ShareModule.resetShareSettingsUI === 'function') {
            window.ShareModule.resetShareSettingsUI();
        }

        stopDocSync(false);
        applyToDocsVisibility({ googleDocsUseEnabled: false, toDocsVisible: false, docSyncVisible: false, shareSites: DEFAULT_SHARE_SITES.slice(), customShareDestinations: [] });
    }

    function loadGoogleDocsSettingsUI(settings) {
        const useCheck = document.getElementById('gdocs-use-enabled');
        if (useCheck) useCheck.checked = !!(settings && settings.googleDocsUseEnabled === true);
        const docSyncCheck = document.getElementById('docsync-visible');
        if (docSyncCheck) docSyncCheck.checked = !!(settings && settings.docSyncVisible === true);
        if (window.ShareModule && typeof window.ShareModule.loadShareSettingsUI === 'function') {
            window.ShareModule.loadShareSettingsUI(settings || {});
        }

        const clientInput = document.getElementById('gdocs-client-id');
        if (clientInput) clientInput.value = settings && settings.googleDocsClientId ? settings.googleDocsClientId : '';

        const pickerInput = document.getElementById('gdocs-picker-api-key');
        if (pickerInput) pickerInput.value = settings && settings.googlePickerApiKey ? settings.googlePickerApiKey : '';

        const feedback = document.getElementById('gdocs-credentials-feedback');
        if (feedback) feedback.textContent = '';

        validateGoogleDocsCredentialInputsUI();
        applyToDocsVisibility(settings || { googleDocsUseEnabled: false, toDocsVisible: false, docSyncVisible: false, shareSites: DEFAULT_SHARE_SITES.slice() });
    }

    function onGoogleApiJsLoaded() {
        // gapi is optional in current DocSync implementation.
    }

    function onGoogleGisLoaded() {
        gdocsGisInited = true;
    }

    async function getReusableGooglePickerApiKey() {
        const info = await resolveGooglePickerApiKey();
        return info && info.valid ? info.key : '';
    }

    window.GoogleDocs = {
        onGoogleApiJsLoaded,
        onGoogleGisLoaded,
        openToDocs,
        openShareDestination,
        exportCurrentToGoogleDocs: openToDocs,
        toggleGoogleDocSync,
        toggleShareLinksMenu,
        closeShareLinksModal,
        moveShareLinksModalToRightSide,
        toggleShareSiteSelection,
        addShareDestinationFromSettings,
        removeCustomShareDestination,
        saveGoogleDocsCredentials,
        validateGoogleDocsCredentialInputsUI,
        applyToDocsVisibility,
        toggleGoogleDocsUseSection,
        toggleToDocsSection,
        toggleDocSyncSection,
        refreshDocSyncButtonVisibility,
        handleEditorChanged,
        handleActiveDocumentChanged,
        shouldShowInViewMode,
        shouldShowDocSyncInViewMode,
        resetGoogleDocsSettingsUI,
        loadGoogleDocsSettingsUI,
        getReusableGooglePickerApiKey
    };

    window.onGoogleApiJsLoaded = onGoogleApiJsLoaded;
    window.onGoogleGisLoaded = onGoogleGisLoaded;
    window.openToDocs = openToDocs;
    window.openShareDestination = (window.ShareModule && window.ShareModule.openShareDestination) ? window.ShareModule.openShareDestination : openShareDestination;
    window.exportCurrentToGoogleDocs = openToDocs;
    window.toggleGoogleDocSync = toggleGoogleDocSync;
    window.toggleShareLinksMenu = (window.ShareModule && window.ShareModule.toggleShareLinksMenu) ? window.ShareModule.toggleShareLinksMenu : toggleShareLinksMenu;
    window.closeShareLinksModal = (window.ShareModule && window.ShareModule.closeShareLinksModal) ? window.ShareModule.closeShareLinksModal : closeShareLinksModal;
    window.moveShareLinksModalToRightSide = (window.ShareModule && window.ShareModule.moveShareLinksModalToRightSide) ? window.ShareModule.moveShareLinksModalToRightSide : moveShareLinksModalToRightSide;
    window.toggleShareSiteSelection = (window.ShareModule && window.ShareModule.toggleShareSiteSelection) ? window.ShareModule.toggleShareSiteSelection : toggleShareSiteSelection;
    window.addShareDestinationFromSettings = (window.ShareModule && window.ShareModule.addShareDestinationFromSettings) ? window.ShareModule.addShareDestinationFromSettings : addShareDestinationFromSettings;
    window.removeCustomShareDestination = (window.ShareModule && window.ShareModule.removeCustomShareDestination) ? window.ShareModule.removeCustomShareDestination : removeCustomShareDestination;
    window.saveGoogleDocsCredentials = saveGoogleDocsCredentials;
    window.validateGoogleDocsCredentialInputsUI = validateGoogleDocsCredentialInputsUI;
    window.applyToDocsVisibility = (window.ShareModule && window.ShareModule.applyToDocsVisibility) ? window.ShareModule.applyToDocsVisibility : applyToDocsVisibility;
    window.toggleGoogleDocsUseSection = toggleGoogleDocsUseSection;
    window.toggleToDocsSection = (window.ShareModule && window.ShareModule.toggleToDocsSection) ? window.ShareModule.toggleToDocsSection : toggleToDocsSection;
    window.toggleDocSyncSection = toggleDocSyncSection;
    window.handleGoogleDocActiveDocumentChanged = handleActiveDocumentChanged;
    window.getReusableGooglePickerApiKey = getReusableGooglePickerApiKey;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            injectGoogleDocsUiFragments();
        }, { once: true });
    } else {
        injectGoogleDocsUiFragments();
    }
})();

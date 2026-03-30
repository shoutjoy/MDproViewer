(function () {
    'use strict';

    const GDOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
    const TOD0CS_TARGET_URL = 'https://docs.google.com/document/d/1GxyODdDK180K22j5e39oRTW7NrpgGDKtCu-5tTegCKU/edit?tab=t.0';
    const DOCSYNC_DEBOUNCE_MS = 2000;

    let gdocsGisInited = false;
    let gdocsTokenClient = null;
    let gdocsTokenClientClientId = '';
    let currentAccessToken = '';

    let toDocsVisible = false;
    let docSyncVisible = false;

    let docSyncEnabled = false;
    let docSyncBusy = false;
    let docSyncDirty = false;
    let docSyncTimer = null;
    let docSyncDocumentId = '';
    let docSyncLastText = '';

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
        if (toolbarSlot && !document.getElementById('btn-export-gdocs')) {
            const toolbarHtml = await loadHtmlFragment('./googleDocs/googleDocs-toolbar.html');
            if (toolbarHtml) {
                toolbarSlot.innerHTML = toolbarHtml;
                injected = true;
            }
        }

        const settingsSlot = document.getElementById('google-docs-settings-slot');
        if (settingsSlot && !document.getElementById('gdocs-settings')) {
            const settingsHtml = await loadHtmlFragment('./googleDocs/googleDocs-settings.html');
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
        if (document.getElementById('btn-export-gdocs') && document.getElementById('gdocs-settings')) return;
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

    function getDocSyncVisibleFromSettings(settings) {
        return !!(settings && settings.docSyncVisible === true);
    }

    function applyToDocsVisibility(settings) {
        const s = settings || {};
        toDocsVisible = getToDocsVisibleFromSettings(s);
        docSyncVisible = getDocSyncVisibleFromSettings(s);

        const toDocsBtn = document.getElementById('btn-export-gdocs');
        if (toDocsBtn) {
            if (!toDocsVisible || (typeof isEditMode !== 'undefined' && isEditMode)) toDocsBtn.classList.add('hidden');
            else toDocsBtn.classList.remove('hidden');
            toDocsBtn.textContent = 'ToDocs';
        }

        const docSyncBtn = document.getElementById('btn-docsync');
        if (docSyncBtn) {
            if (!docSyncVisible || (typeof isEditMode !== 'undefined' && isEditMode)) docSyncBtn.classList.add('hidden');
            else docSyncBtn.classList.remove('hidden');
            setDocSyncButtonState('', false);
        }
    }

    async function toggleToDocsSection() {
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
        return !!toDocsVisible;
    }

    function shouldShowDocSyncInViewMode() {
        return !!docSyncVisible;
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
        await ensureGoogleDocsUiReady();
        setToDocsButtonBusy(true);
        try {
            let copied = false;
            if (typeof window.copyViewFormattedToClipboard === 'function') {
                copied = await window.copyViewFormattedToClipboard();
            }
            if (!copied) {
                if (typeof showToast === 'function') showToast('Copy Styled 복사에 실패했습니다.');
                return;
            }
            const proceed = window.confirm('구글문서가 열리면 Ctrl+V를 실행하세요');
            if (!proceed) return;
            const win = window.open(TOD0CS_TARGET_URL, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
        } catch (err) {
            if (typeof showToast === 'function') showToast(err && err.message ? err.message : 'ToDocs 실행 중 오류');
        } finally {
            setToDocsButtonBusy(false);
        }
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

        stopDocSync(false);
        applyToDocsVisibility({ toDocsVisible: false, docSyncVisible: false });
    }

    function loadGoogleDocsSettingsUI(settings) {
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = !!(settings && settings.toDocsVisible === true);
        const docSyncCheck = document.getElementById('docsync-visible');
        if (docSyncCheck) docSyncCheck.checked = !!(settings && settings.docSyncVisible === true);

        const clientInput = document.getElementById('gdocs-client-id');
        if (clientInput) clientInput.value = settings && settings.googleDocsClientId ? settings.googleDocsClientId : '';

        const pickerInput = document.getElementById('gdocs-picker-api-key');
        if (pickerInput) pickerInput.value = settings && settings.googlePickerApiKey ? settings.googlePickerApiKey : '';

        const feedback = document.getElementById('gdocs-credentials-feedback');
        if (feedback) feedback.textContent = '';

        validateGoogleDocsCredentialInputsUI();
        applyToDocsVisibility(settings || { toDocsVisible: false, docSyncVisible: false });
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
        exportCurrentToGoogleDocs: openToDocs,
        toggleGoogleDocSync,
        saveGoogleDocsCredentials,
        validateGoogleDocsCredentialInputsUI,
        applyToDocsVisibility,
        toggleToDocsSection,
        toggleDocSyncSection,
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
    window.exportCurrentToGoogleDocs = openToDocs;
    window.toggleGoogleDocSync = toggleGoogleDocSync;
    window.saveGoogleDocsCredentials = saveGoogleDocsCredentials;
    window.validateGoogleDocsCredentialInputsUI = validateGoogleDocsCredentialInputsUI;
    window.applyToDocsVisibility = applyToDocsVisibility;
    window.toggleToDocsSection = toggleToDocsSection;
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

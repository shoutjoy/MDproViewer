(function () {
    'use strict';

    const GDOCS_SCOPE = 'https://www.googleapis.com/auth/documents';

    let gdocsGapiInited = false;
    let gdocsGisInited = false;
    let gdocsTokenClient = null;
    let gdocsTokenClientClientId = '';
    let toDocsVisible = false;
    let gdocsLiveSyncEnabled = false;
    let gdocsLiveDocumentId = '';
    let gdocsLiveLastSyncedText = '';
    let gdocsLiveSyncTimer = null;
    let gdocsLiveSyncInFlight = false;
    let gdocsLiveSyncDirty = false;
    let gdocsLiveDocumentUrl = '';

    function isValidGoogleOAuthClientId(value) {
        const v = String(value || '').trim();
        return /^[0-9]+-[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(v);
    }

    function getGoogleDocsExportText() {
        if (typeof editorTextarea !== 'undefined' && editorTextarea) {
            const t = String(editorTextarea.value || '');
            if (t) return t;
        }
        if (typeof currentMarkdown !== 'undefined') return String(currentMarkdown || '');
        return '';
    }

    function setGoogleDocsExportButtonBusy(busy) {
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        btn.disabled = !!busy;
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');
        btn.classList.toggle('opacity-60', !!busy);
        btn.classList.toggle('cursor-not-allowed', !!busy);
    }

    function setGoogleDocsButtonIdleLabel() {
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        btn.textContent = gdocsLiveSyncEnabled ? 'GDocs ON' : 'GDocs';
    }

    function setGoogleDocsExportProgress(label) {
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        const base = 'GDocs';
        const text = String(label || '').trim();
        if (!text) {
            setGoogleDocsButtonIdleLabel();
            return;
        }
        btn.textContent = base + ' · ' + text;
    }

    function buildGoogleDocEditUrl(documentId) {
        return 'https://docs.google.com/document/d/' + encodeURIComponent(String(documentId || '')) + '/edit';
    }

    async function presentGoogleDocsLink(docUrl) {
        const url = String(docUrl || '').trim();
        if (!url) return;
        let copied = false;
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(url);
                copied = true;
            }
        } catch (_) {}

        const message = copied
            ? 'Google Docs 링크가 생성되어 클립보드에 복사되었습니다.\n확인을 누르면 링크를 엽니다.\n\n' + url
            : 'Google Docs 링크가 생성되었습니다.\n확인을 누르면 링크를 엽니다.\n\n' + url;
        const openNow = window.confirm(message);
        if (openNow) {
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') showToast('문서는 생성되었습니다. 팝업 허용 후 링크를 열어주세요.');
        } else {
            window.prompt('생성된 Google Docs 링크입니다. 복사해두세요.', url);
        }
    }

    async function waitForGoogleDocsScripts(timeoutMs) {
        const timeout = Math.max(1000, Number(timeoutMs) || 12000);
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + timeout;
            const check = function () {
                const gapiReady = gdocsGapiInited && window.gapi && window.gapi.client;
                const gisReady = gdocsGisInited && window.google && window.google.accounts && window.google.accounts.oauth2;
                if (gapiReady && gisReady) {
                    resolve();
                    return;
                }
                if (Date.now() > deadline) {
                    reject(new Error('Google API scripts not loaded.'));
                    return;
                }
                setTimeout(check, 120);
            };
            check();
        });
    }

    async function ensureGoogleDocsTokenClient(clientId) {
        const cid = String(clientId || '').trim();
        if (!cid) throw new Error('Google OAuth client ID is missing.');
        await waitForGoogleDocsScripts(12000);
        if (gdocsTokenClient && gdocsTokenClientClientId === cid) return gdocsTokenClient;
        gdocsTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: cid,
            scope: GDOCS_SCOPE,
            callback: ''
        });
        gdocsTokenClientClientId = cid;
        return gdocsTokenClient;
    }

    async function requestGoogleDocsAccessToken(clientId) {
        const tokenClient = await ensureGoogleDocsTokenClient(clientId);
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = function (fn, value) {
                if (settled) return;
                settled = true;
                try { clearTimeout(timeoutId); } catch (_) {}
                fn(value);
            };
            const timeoutId = setTimeout(function () {
                done(reject, new Error('인증 시간이 초과되었습니다. 팝업 차단 또는 계정 인증 상태를 확인해주세요.'));
            }, 25000);

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
                    done(reject, resp && resp.error ? new Error(String(resp.error)) : new Error('Token request failed.'));
                    return;
                }
                const tokenObj = window.gapi && window.gapi.client ? window.gapi.client.getToken() : null;
                const token = tokenObj && tokenObj.access_token ? tokenObj.access_token : (resp.access_token || '');
                if (!token) {
                    done(reject, new Error('No access token returned.'));
                    return;
                }
                done(resolve, token);
            };
            const existing = window.gapi && window.gapi.client ? window.gapi.client.getToken() : null;
            tokenClient.requestAccessToken({ prompt: existing ? '' : 'consent' });
        });
    }

    async function replaceGoogleDocContent(documentId, text) {
        const docId = String(documentId || '').trim();
        if (!docId) throw new Error('Google Docs 문서 ID가 없습니다.');
        const source = String(text || '');
        const getRes = await window.gapi.client.docs.documents.get({ documentId: docId });
        const body = getRes && getRes.result ? getRes.result.body : null;
        const content = body && Array.isArray(body.content) ? body.content : [];
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
        if (source.length > 0) {
            requests.push({
                insertText: {
                    location: { index: 1 },
                    text: source
                }
            });
        }
        if (!requests.length) return;
        await window.gapi.client.docs.documents.batchUpdate({
            documentId: docId,
            requests: requests
        });
    }

    function scheduleGoogleDocsLiveSync(delayMs) {
        if (!gdocsLiveSyncEnabled || !gdocsLiveDocumentId) return;
        const delay = Math.max(0, Number(delayMs) || 0);
        if (gdocsLiveSyncTimer) clearTimeout(gdocsLiveSyncTimer);
        gdocsLiveSyncTimer = setTimeout(function () {
            gdocsLiveSyncTimer = null;
            runGoogleDocsLiveSync();
        }, delay);
    }

    async function runGoogleDocsLiveSync() {
        if (!gdocsLiveSyncEnabled || !gdocsLiveDocumentId) return;
        if (gdocsLiveSyncInFlight) {
            gdocsLiveSyncDirty = true;
            return;
        }
        const latest = getGoogleDocsExportText();
        if (!gdocsLiveSyncDirty && latest === gdocsLiveLastSyncedText) return;

        gdocsLiveSyncInFlight = true;
        setGoogleDocsExportProgress('동기화중');
        try {
            await replaceGoogleDocContent(gdocsLiveDocumentId, latest);
            gdocsLiveLastSyncedText = latest;
            gdocsLiveSyncDirty = false;
            setGoogleDocsExportProgress('동기화됨');
        } catch (e) {
            const msg = e && e.message ? e.message : '동기화 실패';
            if (typeof showToast === 'function') showToast('GDocs 실시간 동기화 실패: ' + msg);
            setGoogleDocsExportProgress('오류');
        } finally {
            gdocsLiveSyncInFlight = false;
            if (gdocsLiveSyncDirty) {
                scheduleGoogleDocsLiveSync(600);
            } else {
                setTimeout(function () {
                    if (gdocsLiveSyncEnabled) setGoogleDocsExportProgress('');
                }, 700);
            }
        }
    }

    function getToDocsVisibleFromSettings(settings) {
        if (!settings) return false;
        return settings.toDocsVisible === true;
    }

    function applyToDocsVisibility(settings) {
        const enabled = getToDocsVisibleFromSettings(settings || {});
        toDocsVisible = enabled;
        const btn = document.getElementById('btn-export-gdocs');
        if (!btn) return;
        if (!enabled || (typeof isEditMode !== 'undefined' && isEditMode)) btn.classList.add('hidden');
        else btn.classList.remove('hidden');
        setGoogleDocsButtonIdleLabel();
    }

    async function toggleToDocsSection() {
        const check = document.getElementById('todocs-visible');
        const enabled = !!(check && check.checked);
        await setAiSettings({ toDocsVisible: enabled });
        const s = await getAiSettings();
        applyToDocsVisibility(s || { toDocsVisible: enabled });
    }

    function handleEditorChanged() {
        if (!gdocsLiveSyncEnabled) return;
        gdocsLiveSyncDirty = true;
        scheduleGoogleDocsLiveSync(900);
    }

    function shouldShowInViewMode() {
        return !!toDocsVisible;
    }
    async function exportCurrentToGoogleDocs() {
        const targetUrl = 'https://docs.google.com/document/d/1GxyODdDK180K22j5e39oRTW7NrpgGDKtCu-5tTegCKU/edit?tab=t.0';
        setGoogleDocsExportButtonBusy(true);
        setGoogleDocsExportProgress('복사');
        try {
            let copied = false;
            if (typeof window.copyViewFormattedToClipboard === 'function') {
                copied = await window.copyViewFormattedToClipboard();
            } else if (typeof copyViewFormattedToClipboard === 'function') {
                copied = await copyViewFormattedToClipboard();
            }

            if (!copied) {
                if (typeof showToast === 'function') showToast('복사에 실패했습니다. Copy Styled를 먼저 확인해주세요.');
                return;
            }

            const proceed = window.confirm('구글문서가 열리면 Ctrl+V를 실행하세요');
            if (!proceed) return;

            setGoogleDocsExportProgress('열기');
            const win = window.open(targetUrl, '_blank', 'noopener,noreferrer');
            if (!win && typeof showToast === 'function') {
                showToast('팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.');
            }
        } catch (err) {
            const msg = err && err.message ? err.message : 'GDocs 실행 중 오류';
            if (typeof showToast === 'function') showToast(msg);
        } finally {
            setGoogleDocsExportButtonBusy(false);
            setGoogleDocsExportProgress('');
        }
    }
    function validateGoogleDocsCredentialInputsUI() {
        const clientInput = document.getElementById('gdocs-client-id');
        const clientFeedback = document.getElementById('gdocs-client-id-feedback');
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
    }
    async function verifyGoogleOAuthClientIdReady(clientId) {
        const cid = String(clientId || '').trim();
        if (!cid) throw new Error('OAuth Client ID is missing.');
        const timeout = Date.now() + 12000;
        while (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
            if (Date.now() > timeout) throw new Error('Google Identity script not loaded.');
            await new Promise(function (resolve) { setTimeout(resolve, 120); });
        }
        try {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: cid,
                scope: GDOCS_SCOPE,
                callback: ''
            });
            if (!tokenClient || typeof tokenClient.requestAccessToken !== 'function') {
                throw new Error('OAuth Client ID verification failed.');
            }
        } catch (e) {
            throw new Error('OAuth Client ID verification failed.');
        }
        return true;
    }

    async function saveGoogleDocsCredentials() {
        const clientInput = document.getElementById('gdocs-client-id');
        const feedback = document.getElementById('gdocs-credentials-feedback');
        const clientFeedback = document.getElementById('gdocs-client-id-feedback');
        const clientId = String(clientInput && clientInput.value ? clientInput.value : '').trim();

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
                feedback.textContent = 'Invalid OAuth client ID format.';
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast('Invalid OAuth client ID format.');
            return;
        }

        if (feedback) {
            feedback.textContent = 'Checking OAuth Client ID...';
            feedback.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
        }
        if (clientFeedback) {
            clientFeedback.textContent = 'Checking OAuth Client ID...';
            clientFeedback.className = 'text-xs min-h-[1rem] text-slate-500 dark:text-slate-400';
        }

        try {
            await verifyGoogleOAuthClientIdReady(clientId);
            if (clientFeedback) {
                clientFeedback.textContent = 'OAuth Client ID verified.';
                clientFeedback.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
            }
        } catch (err) {
            const msg = err && err.message ? err.message : 'Verification failed.';
            const guidance = '\n체크: 승인된 JavaScript 원본과 OAuth 클라이언트 ID 프로젝트가 일치해야 합니다.';
            if (feedback) {
                feedback.textContent = msg + guidance;
                feedback.className = 'text-xs min-h-[1rem] text-red-600 dark:text-red-400';
            }
            if (typeof showToast === 'function') showToast(msg);
            return;
        }

        await setAiSettings({
            googleDocsClientId: clientId
        });

        if (feedback) {
            feedback.textContent = 'Google Docs credentials saved.';
            feedback.className = 'text-xs min-h-[1rem] text-emerald-600 dark:text-emerald-400';
        }
        if (typeof showToast === 'function') showToast('Google Docs credentials saved.');
    }

    function resetGoogleDocsSettingsUI() {
        const toDocsCheckEmpty = document.getElementById('todocs-visible');
        if (toDocsCheckEmpty) toDocsCheckEmpty.checked = false;
        const gdocsClientInputEmpty = document.getElementById('gdocs-client-id');
        if (gdocsClientInputEmpty) gdocsClientInputEmpty.value = '';
        const gdocsFeedbackEmpty = document.getElementById('gdocs-credentials-feedback');
        if (gdocsFeedbackEmpty) gdocsFeedbackEmpty.textContent = '';
        const gdocsClientFeedbackEmpty = document.getElementById('gdocs-client-id-feedback');
        if (gdocsClientFeedbackEmpty) gdocsClientFeedbackEmpty.textContent = '';
        applyToDocsVisibility({ toDocsVisible: false });
    }

    function loadGoogleDocsSettingsUI(settings) {
        const toDocsCheck = document.getElementById('todocs-visible');
        if (toDocsCheck) toDocsCheck.checked = !!(settings && settings.toDocsVisible === true);
        const gdocsClientInput = document.getElementById('gdocs-client-id');
        if (gdocsClientInput) gdocsClientInput.value = settings && settings.googleDocsClientId ? settings.googleDocsClientId : '';
        const gdocsFeedback = document.getElementById('gdocs-credentials-feedback');
        if (gdocsFeedback) gdocsFeedback.textContent = '';
        const gdocsClientFeedback = document.getElementById('gdocs-client-id-feedback');
        if (gdocsClientFeedback) gdocsClientFeedback.textContent = '';
        validateGoogleDocsCredentialInputsUI();
        applyToDocsVisibility(settings || { toDocsVisible: false });
    }

    function onGoogleApiJsLoaded() {
        if (!(window.gapi && typeof window.gapi.load === 'function')) return;
        window.gapi.load('client', function () {
            gdocsGapiInited = true;
        });
    }

    function onGoogleGisLoaded() {
        gdocsGisInited = true;
    }

    window.GoogleDocs = {
        onGoogleApiJsLoaded,
        onGoogleGisLoaded,
        exportCurrentToGoogleDocs,
        saveGoogleDocsCredentials,
        validateGoogleDocsCredentialInputsUI,
        applyToDocsVisibility,
        toggleToDocsSection,
        handleEditorChanged,
        shouldShowInViewMode,
        resetGoogleDocsSettingsUI,
        loadGoogleDocsSettingsUI
    };

    window.onGoogleApiJsLoaded = onGoogleApiJsLoaded;
    window.onGoogleGisLoaded = onGoogleGisLoaded;
    window.exportCurrentToGoogleDocs = exportCurrentToGoogleDocs;
    window.saveGoogleDocsCredentials = saveGoogleDocsCredentials;
    window.validateGoogleDocsCredentialInputsUI = validateGoogleDocsCredentialInputsUI;
    window.applyToDocsVisibility = applyToDocsVisibility;
    window.toggleToDocsSection = toggleToDocsSection;
})();

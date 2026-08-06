(function (root) {
    'use strict';

    const SETTING_KEY = 'encryptedToolVault';
    const CATALOG_KEY = 'toolSettingsCatalog';
    const ITERATIONS = 310000;
    const AAD = 'md-viewer:sqlite-tool-vault:v1';
    const SECRET_DEFINITIONS = Object.freeze([
        { id: 'gemini', label: 'Google AI Studio', storage: 'ss_gemini_api_key' },
        { id: 'deepseek', label: 'DeepSeek', storage: 'ss_deepseek_api_key' },
        { id: 'openai', label: 'OpenAI', storage: 'ss_openai_api_key' },
        { id: 'imgbb', label: 'imgBB', storage: 'ss_imgbb_api_key' },
        { id: 'fmaGemini', label: 'fmaviewer AI Jena', storage: 'fma_ai_studio_api_key' }
    ]);
    const SECRET_IDS = new Set(SECRET_DEFINITIONS.map(function (item) { return item.id; }));
    let envelope = null;
    let unlockedValues = null;

    function requireCrypto() {
        if (!root.crypto || !root.crypto.subtle || typeof TextEncoder !== 'function' || typeof TextDecoder !== 'function') {
            const error = new Error('이 브라우저에서는 API 키 암호화 기능을 사용할 수 없습니다. 로컬 HTTPS 또는 앱 서버 주소로 열어 주세요.');
            error.code = 'CREDENTIAL_VAULT_CRYPTO_UNAVAILABLE';
            throw error;
        }
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (let offset = 0; offset < source.length; offset += 0x8000) {
            binary += String.fromCharCode.apply(null, source.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(String(value || ''));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    async function deriveKey(password, salt, iterations) {
        requireCrypto();
        const material = await root.crypto.subtle.importKey(
            'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey']
        );
        return root.crypto.subtle.deriveKey(
            { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    function normalizeValues(values) {
        const source = values && typeof values === 'object' ? values : {};
        const result = {};
        SECRET_DEFINITIONS.forEach(function (definition) {
            const value = String(source[definition.id] || '').trim();
            if (value) result[definition.id] = value;
        });
        return result;
    }

    function readLocalValues() {
        const result = {};
        SECRET_DEFINITIONS.forEach(function (definition) {
            try {
                const value = String(localStorage.getItem(definition.storage) || '').trim();
                if (value) result[definition.id] = value;
            } catch (_) {}
        });
        return result;
    }

    function entryMetadata(values) {
        const source = normalizeValues(values);
        return SECRET_DEFINITIONS.map(function (definition) {
            const value = source[definition.id] || '';
            return {
                id: definition.id,
                label: definition.label,
                configured: !!value,
                last4: value ? value.slice(-4) : ''
            };
        });
    }

    async function encryptValues(password, values) {
        const salt = root.crypto.getRandomValues(new Uint8Array(16));
        const iv = root.crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt, ITERATIONS);
        const plaintext = new TextEncoder().encode(JSON.stringify({ version: 1, values: normalizeValues(values) }));
        const ciphertext = await root.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(AAD), tagLength: 128 },
            key,
            plaintext
        );
        return {
            version: 1,
            algorithm: 'AES-GCM',
            derivation: 'PBKDF2-SHA256',
            iterations: ITERATIONS,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            ciphertext: bytesToBase64(ciphertext),
            entries: entryMetadata(values),
            updatedAt: new Date().toISOString()
        };
    }

    async function decryptEnvelope(password, source) {
        requireCrypto();
        if (!source || source.version !== 1) throw new Error('저장된 암호화 보관함 형식을 읽을 수 없습니다.');
        try {
            const salt = base64ToBytes(source.salt);
            const iv = base64ToBytes(source.iv);
            const key = await deriveKey(password, salt, Number(source.iterations));
            const plaintext = await root.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(AAD), tagLength: 128 },
                key,
                base64ToBytes(source.ciphertext)
            );
            const parsed = JSON.parse(new TextDecoder().decode(plaintext));
            if (!parsed || parsed.version !== 1 || !parsed.values || typeof parsed.values !== 'object') throw new Error('invalid payload');
            return normalizeValues(parsed.values);
        } catch (error) {
            const wrapped = new Error('비밀번호가 올바르지 않거나 암호화 데이터가 변경되었습니다.');
            wrapped.code = 'CREDENTIAL_VAULT_UNLOCK_FAILED';
            throw wrapped;
        }
    }

    function requireSqlite() {
        if (!root.MDPStorage || typeof root.MDPStorage.putSqliteSetting !== 'function') {
            const error = new Error('SQLite 저장 모듈이 아직 준비되지 않았습니다.');
            error.code = 'CREDENTIAL_VAULT_SQLITE_UNAVAILABLE';
            throw error;
        }
        const status = typeof root.MDPStorage.getStatus === 'function' ? root.MDPStorage.getStatus() : null;
        if (!status || status.activeMode !== 'sqlite') {
            const error = new Error('SQLite 저장을 먼저 켜 주세요.');
            error.code = 'CREDENTIAL_VAULT_SQLITE_DISABLED';
            throw error;
        }
    }

    async function putProfileSetting(key, value, group) {
        requireSqlite();
        return root.MDPStorage.putSqliteSetting({
            key: key,
            value: value,
            group: group,
            scopeType: 'profile',
            scopeId: 'profile_default'
        });
    }

    async function load() {
        requireSqlite();
        const items = await root.MDPStorage.listSqliteSettings({});
        const stored = (Array.isArray(items) ? items : []).find(function (item) {
            return item && item.key === SETTING_KEY && item.scopeType === 'profile';
        });
        envelope = stored && stored.value && typeof stored.value === 'object' ? stored.value : null;
        if (!envelope) unlockedValues = null;
        return getStatus();
    }

    async function clearLegacyPlaintext() {
        try {
            if (typeof root.setAiSettings === 'function') {
                await root.setAiSettings({ apiKey: '', deepseekApiKey: '', openaiApiKey: '', imgbbApiKey: '' });
            }
        } catch (error) {
            console.warn('Encrypted credential vault could not clear legacy IndexedDB values:', error && error.message ? error.message : error);
        }
        SECRET_DEFINITIONS.forEach(function (definition) {
            try { localStorage.removeItem(definition.storage); } catch (_) {}
        });
        clearCredentialInputs();
    }

    function clearCredentialInputs() {
        if (!root.document) return;
        ['ai-api-key', 'deepseek-api-key', 'openai-api-key', 'ai-imgbb-api-key'].forEach(function (id) {
            const input = root.document.getElementById(id);
            if (input) input.value = '';
        });
        try {
            root.document.querySelectorAll('iframe').forEach(function (frame) {
                try {
                    const input = frame.contentWindow && frame.contentWindow.document
                        ? frame.contentWindow.document.getElementById('aiStudioApiKey') : null;
                    if (input) input.value = '';
                } catch (_) {}
            });
        } catch (_) {}
    }

    async function create(password, confirmation) {
        requireSqlite();
        const pass = String(password || '');
        if (pass.length < 8) throw new Error('보관함 비밀번호는 8자 이상이어야 합니다.');
        if (pass !== String(confirmation || '')) throw new Error('비밀번호 확인이 일치하지 않습니다.');
        if (envelope) throw new Error('이미 보관함이 있습니다. 먼저 잠금을 해제한 뒤 비밀번호를 변경하세요.');
        const values = readLocalValues();
        envelope = await encryptValues(pass, values);
        await putProfileSetting(SETTING_KEY, envelope, 'security');
        unlockedValues = normalizeValues(values);
        await clearLegacyPlaintext();
        await syncCatalog();
        root.dispatchEvent(new CustomEvent('mdp-credential-vault-change', { detail: getStatus() }));
        return getStatus();
    }

    async function unlock(password) {
        if (!envelope) await load();
        if (!envelope) throw new Error('저장된 API 키 보관함이 없습니다. 새 비밀번호를 설정해 주세요.');
        unlockedValues = await decryptEnvelope(String(password || ''), envelope);
        await syncCatalog();
        root.dispatchEvent(new CustomEvent('mdp-credential-vault-change', { detail: getStatus() }));
        return getStatus();
    }

    function lock() {
        unlockedValues = null;
        clearCredentialInputs();
        root.dispatchEvent(new CustomEvent('mdp-credential-vault-change', { detail: getStatus() }));
        return getStatus();
    }

    async function importCurrent(password) {
        const pass = String(password || '');
        if (pass.length < 8) throw new Error('현재 보관함 비밀번호를 입력해 주세요.');
        if (!envelope) return create(pass, pass);
        const verifiedValues = await decryptEnvelope(pass, envelope);
        const values = Object.assign({}, verifiedValues, readLocalValues());
        envelope = await encryptValues(pass, values);
        await putProfileSetting(SETTING_KEY, envelope, 'security');
        unlockedValues = normalizeValues(values);
        await clearLegacyPlaintext();
        await syncCatalog();
        root.dispatchEvent(new CustomEvent('mdp-credential-vault-change', { detail: getStatus() }));
        return getStatus();
    }

    async function changePassword(currentPassword, nextPassword, confirmation) {
        if (!envelope) throw new Error('변경할 보관함이 없습니다.');
        const next = String(nextPassword || '');
        if (next.length < 8) throw new Error('새 비밀번호는 8자 이상이어야 합니다.');
        if (next !== String(confirmation || '')) throw new Error('새 비밀번호 확인이 일치하지 않습니다.');
        const values = await decryptEnvelope(String(currentPassword || ''), envelope);
        envelope = await encryptValues(next, values);
        await putProfileSetting(SETTING_KEY, envelope, 'security');
        unlockedValues = values;
        await syncCatalog();
        root.dispatchEvent(new CustomEvent('mdp-credential-vault-change', { detail: getStatus() }));
        return getStatus();
    }

    function getSecret(id) {
        if (!SECRET_IDS.has(String(id)) || !unlockedValues) return '';
        return String(unlockedValues[id] || '');
    }

    function metadataFor(id) {
        const items = envelope && Array.isArray(envelope.entries) ? envelope.entries : [];
        return items.find(function (item) { return item && item.id === id; }) || { configured: false, last4: '' };
    }

    function getStatus() {
        return {
            exists: !!envelope,
            locked: !!envelope && !unlockedValues,
            unlocked: !!envelope && !!unlockedValues,
            updatedAt: envelope ? envelope.updatedAt : null,
            entries: envelope && Array.isArray(envelope.entries) ? envelope.entries.map(function (item) {
                return { id: item.id, label: item.label, configured: !!item.configured, last4: item.last4 || '' };
            }) : entryMetadata({})
        };
    }

    function readValue(name, fallback) {
        try {
            const value = localStorage.getItem(name);
            return value == null ? (fallback || '') : String(value);
        } catch (_) { return fallback || ''; }
    }

    function redactProbableSecrets(value) {
        return String(value || '').replace(/(?:AIza[0-9A-Za-z_-]{30,}|sk-[0-9A-Za-z_-]{16,})/g, '[보호된 값 숨김]');
    }

    function selectedScholarModel(provider) {
        const map = {
            aistudio: 'ss_scholar_ai_model',
            deepseek: 'ss_scholar_ai_deepseek_model',
            openai: 'ss_scholar_ai_openai_model',
            ollama: 'ss_scholar_ai_ollama_model'
        };
        return readValue(map[provider] || 'ss_scholar_ai_model', '');
    }

    function protectionFor(id) {
        const item = metadataFor(id);
        return { configured: !!item.configured, locked: !!envelope && !unlockedValues, last4: item.last4 || '' };
    }

    async function buildCatalog() {
        let settings = {};
        try {
            if (typeof root.getAiSettings === 'function') settings = await root.getAiSettings() || {};
        } catch (_) {}
        const scholarProvider = readValue('ss_scholar_ai_provider', 'lmstudio');
        const aiChatProvider = readValue('ss_ai_chat_provider', 'aistudio');
        let lmBase = 'http://127.0.0.1:5678/v1';
        try {
            if (root.LocalAI && typeof root.LocalAI.loadConfig === 'function') lmBase = String(root.LocalAI.loadConfig(localStorage).baseUrl || lmBase);
        } catch (_) {}
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            tools: [
                {
                    id: 'scholarAI', label: 'ScholarAI', enabled: settings.scholarAI === true,
                    provider: scholarProvider, model: selectedScholarModel(scholarProvider),
                    prompt: redactProbableSecrets(readValue('ss_scholar_ai_system', '')),
                    endpoint: scholarProvider === 'lmstudio' ? lmBase : (scholarProvider === 'deepseek' ? readValue('ss_deepseek_base_url', 'https://api.deepseek.com') : ''),
                    options: { responseMode: readValue('ss_ai_chat_response_mode', 'quick') },
                    protection: protectionFor(scholarProvider === 'deepseek' ? 'deepseek' : (scholarProvider === 'openai' ? 'openai' : 'gemini'))
                },
                {
                    id: 'sspimgAI', label: 'sspimgAI', enabled: settings.sspimgAI === true,
                    provider: 'aistudio', model: readValue('ss_image_model', 'gemini-3.1-flash-image'), prompt: '', endpoint: '',
                    options: {}, protection: protectionFor('gemini')
                },
                {
                    id: 'aiJena', label: 'AI Jena', enabled: readValue('ss_ai_chat_enabled', 'false') === 'true',
                    provider: aiChatProvider, model: readValue('ss_ai_chat_' + aiChatProvider + '_model', ''), prompt: '', endpoint: '',
                    options: { writingStyle: readValue('ss_ai_chat_writing_style', ''), responseMode: readValue('ss_ai_chat_response_mode', 'quick') },
                    protection: protectionFor(aiChatProvider === 'deepseek' ? 'deepseek' : (aiChatProvider === 'openai' ? 'openai' : 'gemini'))
                },
                {
                    id: 'imgbb', label: 'imgBB', enabled: settings.imageUploadEnabled === true,
                    provider: 'imgbb', model: '', prompt: '', endpoint: 'https://api.imgbb.com/1/upload', options: {},
                    protection: protectionFor('imgbb')
                },
                {
                    id: 'fmaAiJena', label: 'fmaviewer AI Jena', enabled: readValue('fma_ai_key_usage_enabled', 'true') !== 'false',
                    provider: 'aistudio', model: 'gemini-3.1-flash-image',
                    prompt: redactProbableSecrets(
                        '업스케일: ' + readValue('fma_ai_upscale_prompt', '')
                        + '\n\n배경 제거: ' + readValue('fma_ai_bg_remove_prompt', '')
                    ).trim(), endpoint: '',
                    options: { videoDuration: readValue('fmaAiJenaVideoDuration', '8') }, protection: protectionFor('fmaGemini')
                }
            ]
        };
    }

    async function syncCatalog() {
        requireSqlite();
        const catalog = await buildCatalog();
        await putProfileSetting(CATALOG_KEY, catalog, 'integrations');
        return catalog;
    }

    root.MDPCredentialVault = Object.freeze({
        settingKey: SETTING_KEY,
        catalogKey: CATALOG_KEY,
        load: load,
        create: create,
        unlock: unlock,
        lock: lock,
        importCurrent: importCurrent,
        changePassword: changePassword,
        getSecret: getSecret,
        getStatus: getStatus,
        buildCatalog: buildCatalog,
        syncCatalog: syncCatalog,
        _test: Object.freeze({ encryptValues: encryptValues, decryptEnvelope: decryptEnvelope, normalizeValues: normalizeValues })
    });
})(window);

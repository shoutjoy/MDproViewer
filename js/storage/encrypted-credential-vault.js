(function (root) {
    'use strict';

    const SETTING_KEY = 'encryptedToolVault';
    const CATALOG_KEY = 'toolSettingsCatalog';
    const ITERATIONS = 310000;
    const AAD = 'md-viewer:sqlite-tool-vault:v1';
    const PROBABLE_SECRET_VALUE_RE = /(?:AIza[0-9A-Za-z_-]{30,}|sk-[0-9A-Za-z_-]{16,})/;
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
    let catalogSyncTimer = 0;
    let catalogSyncPromise = Promise.resolve(null);
    let catalogRestorePromise = null;

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

    function readJsonValue(name, fallback) {
        try {
            const parsed = JSON.parse(readValue(name, ''));
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) { return fallback; }
    }

    function safeLmStudioOptions() {
        let config = {};
        try {
            if (root.LocalAI && typeof root.LocalAI.loadConfig === 'function') {
                config = root.LocalAI.loadConfig(localStorage) || {};
            } else {
                config = readJsonValue('local_ai_lmstudio_settings_v1', {});
            }
        } catch (_) {}
        return {
            baseUrl: String(config.baseUrl || 'http://127.0.0.1:5678/v1'),
            model: String(config.model || ''),
            temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.4,
            outputLimit: Math.max(1, Number(config.maxTokens) || 8192),
            quickOutputLimit: Math.max(1, Number(config.quickMaxTokens) || 4096),
            reasoningOutputLimit: Math.max(1, Number(config.reasoningMaxTokens) || 8192),
            fastOutputLimit: Math.max(1, Number(config.fastMaxTokens) || 3000),
            fastTimeoutMs: Math.max(1000, Number(config.fastTimeoutMs) || 60000),
            reasoningLevel: String(config.reasoningLevel || 'auto'),
            timeoutMs: Math.max(1000, Number(config.timeoutMs) || 90000),
            topP: config.topP == null || config.topP === '' ? null : Number(config.topP)
        };
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
        const lmStudio = safeLmStudioOptions();
        const scholarModels = {
            aistudio: readValue('ss_scholar_ai_model', ''),
            lmstudio: lmStudio.model,
            ollama: readValue('ss_scholar_ai_ollama_model', ''),
            deepseek: readValue('ss_scholar_ai_deepseek_model', ''),
            openai: readValue('ss_scholar_ai_openai_model', '')
        };
        const aiJenaModels = {
            aistudio: readValue('ss_ai_chat_gemini_model', ''),
            ollama: readValue('ss_ai_chat_ollama_model', ''),
            deepseek: readValue('ss_ai_chat_deepseek_model', ''),
            openai: readValue('ss_ai_chat_openai_model', '')
        };
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            tools: [
                {
                    id: 'scholarAI', label: 'ScholarAI', enabled: settings.scholarAI === true,
                    provider: scholarProvider, model: scholarModels[scholarProvider] || selectedScholarModel(scholarProvider),
                    prompt: redactProbableSecrets(readValue('ss_scholar_ai_system', '')),
                    endpoint: scholarProvider === 'lmstudio' ? lmStudio.baseUrl : (scholarProvider === 'deepseek' ? readValue('ss_deepseek_base_url', 'https://api.deepseek.com') : ''),
                    options: {
                        tonePreset: readValue('ss_viewer_scholar_ai_tone_preset', 'academic'),
                        models: scholarModels,
                        lmStudio: lmStudio,
                        deepseekBaseUrl: readValue('ss_deepseek_base_url', 'https://api.deepseek.com')
                    },
                    protection: protectionFor(scholarProvider === 'deepseek' ? 'deepseek' : (scholarProvider === 'openai' ? 'openai' : 'gemini'))
                },
                {
                    id: 'sspimgAI', label: 'sspimgAI', enabled: settings.sspimgAI === true,
                    provider: 'aistudio', model: readValue('ss_image_model', 'gemini-3.1-flash-image'),
                    prompt: redactProbableSecrets(readValue('ss_image_prompt', '')), endpoint: '',
                    options: {
                        prompt2: redactProbableSecrets(readValue('ss_image_prompt_2', '')),
                        ratio: readValue('ss_image_ratio', '1:1'),
                        noText: readValue('ss_image_no_text', 'false') === 'true'
                    }, protection: protectionFor('gemini')
                },
                {
                    id: 'aiJena', label: 'AI Jena', enabled: ['1', 'true'].includes(readValue('ss_ai_chat_enabled', '0')),
                    provider: aiChatProvider, model: aiJenaModels[aiChatProvider] || '', prompt: '', endpoint: '',
                    options: {
                        models: aiJenaModels,
                        writingStyle: readValue('ss_ai_chat_writing_style', 'academic'),
                        responseMode: readValue('ss_ai_chat_response_mode', 'quick'),
                        showReasoning: readValue('ss_ai_chat_show_reasoning', '0') === '1',
                        academicSearchEnabled: readValue('ss_ai_chat_academic_search_enabled', '0') === '1',
                        academicSearchCount: Math.max(1, Number(readValue('ss_ai_chat_academic_search_count', '10')) || 10),
                        startLayout: readValue('ss_ai_chat_start_layout', 'dock'),
                        layout: readValue('ss_ai_chat_layout', 'dock')
                    },
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
                    options: {
                        upscalePrompt: redactProbableSecrets(readValue('fma_ai_upscale_prompt', '')),
                        backgroundRemovePrompt: redactProbableSecrets(readValue('fma_ai_bg_remove_prompt', '')),
                        resolution: readValue('fma_ai_upscale_resolution', '2K'),
                        upscaleEnabled: readValue('fma_ai_upscale_enabled', 'false') === 'true',
                        backgroundRemoveEnabled: readValue('fma_ai_bg_remove_enabled', 'false') === 'true',
                        keyUsageEnabled: readValue('fma_ai_key_usage_enabled', 'true') !== 'false',
                        videoDuration: readValue('fmaAiJenaVideoDuration', '8')
                    }, protection: protectionFor('fmaGemini')
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

    function writeRestoredValue(key, value, maximum) {
        if (value === undefined || value === null) return;
        const normalized = String(value);
        if (normalized.length > Number(maximum || 65536) || PROBABLE_SECRET_VALUE_RE.test(normalized)) return;
        try { localStorage.setItem(key, normalized); } catch (_) {}
    }

    function restoreLmStudio(options) {
        const safe = options && options.lmStudio && typeof options.lmStudio === 'object'
            ? options.lmStudio : null;
        if (!safe) return;
        const patch = {
            baseUrl: String(safe.baseUrl || 'http://127.0.0.1:5678/v1'),
            model: String(safe.model || ''),
            temperature: Number(safe.temperature),
            maxTokens: Number(safe.outputLimit == null ? safe.maxTokens : safe.outputLimit),
            quickMaxTokens: Number(safe.quickOutputLimit == null ? safe.quickMaxTokens : safe.quickOutputLimit),
            reasoningMaxTokens: Number(safe.reasoningOutputLimit == null ? safe.reasoningMaxTokens : safe.reasoningOutputLimit),
            fastMaxTokens: Number(safe.fastOutputLimit == null ? safe.fastMaxTokens : safe.fastOutputLimit),
            fastTimeoutMs: Number(safe.fastTimeoutMs),
            reasoningLevel: String(safe.reasoningLevel || 'auto'),
            timeoutMs: Number(safe.timeoutMs),
            topP: safe.topP == null ? null : Number(safe.topP)
        };
        try {
            if (root.LocalAI && typeof root.LocalAI.loadConfig === 'function' && typeof root.LocalAI.saveConfig === 'function') {
                const current = root.LocalAI.loadConfig(localStorage) || {};
                root.LocalAI.saveConfig(Object.assign({}, current, patch), localStorage);
                return;
            }
            const current = readJsonValue('local_ai_lmstudio_settings_v1', {});
            localStorage.setItem('local_ai_lmstudio_settings_v1', JSON.stringify(Object.assign({}, current, patch)));
        } catch (_) {}
    }

    function applyCatalog(catalog) {
        const tools = Array.isArray(catalog && catalog.tools) ? catalog.tools : [];
        const byId = new Map(tools.map(function (tool) { return [String(tool && tool.id || ''), tool]; }));
        const scholar = byId.get('scholarAI');
        if (scholar) {
            const options = scholar.options && typeof scholar.options === 'object' ? scholar.options : {};
            const models = options.models && typeof options.models === 'object' ? options.models : {};
            writeRestoredValue('ss_scholar_ai_provider', scholar.provider, 80);
            writeRestoredValue('ss_scholar_ai_system', scholar.prompt, 65536);
            writeRestoredValue('ss_viewer_scholar_ai_tone_preset', options.tonePreset, 80);
            writeRestoredValue('ss_scholar_ai_model', models.aistudio || (scholar.provider === 'aistudio' ? scholar.model : ''), 256);
            writeRestoredValue('ss_scholar_ai_ollama_model', models.ollama, 256);
            writeRestoredValue('ss_scholar_ai_deepseek_model', models.deepseek, 256);
            writeRestoredValue('ss_scholar_ai_openai_model', models.openai, 256);
            writeRestoredValue('ss_deepseek_base_url', options.deepseekBaseUrl, 4096);
            restoreLmStudio(options);
        }
        const sspimg = byId.get('sspimgAI');
        if (sspimg) {
            const options = sspimg.options && typeof sspimg.options === 'object' ? sspimg.options : {};
            writeRestoredValue('ss_image_model', sspimg.model, 256);
            writeRestoredValue('ss_image_prompt', sspimg.prompt, 65536);
            writeRestoredValue('ss_image_prompt_2', options.prompt2, 65536);
            writeRestoredValue('ss_image_ratio', options.ratio, 16);
            writeRestoredValue('ss_image_no_text', options.noText === true ? 'true' : 'false', 8);
        }
        const aiJena = byId.get('aiJena');
        if (aiJena) {
            const options = aiJena.options && typeof aiJena.options === 'object' ? aiJena.options : {};
            const models = options.models && typeof options.models === 'object' ? options.models : {};
            writeRestoredValue('ss_ai_chat_enabled', aiJena.enabled ? '1' : '0', 8);
            writeRestoredValue('ss_ai_chat_provider', aiJena.provider, 80);
            writeRestoredValue('ss_ai_chat_gemini_model', models.aistudio || (aiJena.provider === 'aistudio' ? aiJena.model : ''), 256);
            writeRestoredValue('ss_ai_chat_ollama_model', models.ollama, 256);
            writeRestoredValue('ss_ai_chat_deepseek_model', models.deepseek, 256);
            writeRestoredValue('ss_ai_chat_openai_model', models.openai, 256);
            writeRestoredValue('ss_ai_chat_writing_style', options.writingStyle, 80);
            writeRestoredValue('ss_ai_chat_response_mode', options.responseMode, 80);
            writeRestoredValue('ss_ai_chat_show_reasoning', options.showReasoning === true ? '1' : '0', 8);
            writeRestoredValue('ss_ai_chat_academic_search_enabled', options.academicSearchEnabled === true ? '1' : '0', 8);
            writeRestoredValue('ss_ai_chat_academic_search_count', options.academicSearchCount, 16);
            writeRestoredValue('ss_ai_chat_start_layout', options.startLayout, 32);
            writeRestoredValue('ss_ai_chat_layout', options.layout, 32);
        }
        const fma = byId.get('fmaAiJena');
        if (fma) {
            const options = fma.options && typeof fma.options === 'object' ? fma.options : {};
            writeRestoredValue('fma_ai_upscale_prompt', options.upscalePrompt, 65536);
            writeRestoredValue('fma_ai_bg_remove_prompt', options.backgroundRemovePrompt, 65536);
            writeRestoredValue('fma_ai_upscale_resolution', options.resolution, 16);
            writeRestoredValue('fma_ai_upscale_enabled', options.upscaleEnabled === true ? 'true' : 'false', 8);
            writeRestoredValue('fma_ai_bg_remove_enabled', options.backgroundRemoveEnabled === true ? 'true' : 'false', 8);
            writeRestoredValue('fma_ai_key_usage_enabled', options.keyUsageEnabled === false ? 'false' : 'true', 8);
            writeRestoredValue('fmaAiJenaVideoDuration', options.videoDuration, 16);
        }
    }

    function notifyCatalogRestored(catalog) {
        try {
            if (root.AIChat && typeof root.AIChat.syncSettings === 'function') root.AIChat.syncSettings();
            const scholarPrompt = root.document && root.document.getElementById('scholar-ai-pre-prompt-text');
            if (scholarPrompt && root.document.activeElement !== scholarPrompt) scholarPrompt.value = readValue('ss_scholar_ai_system', '');
            const scholarTone = root.document && root.document.getElementById('scholar-ai-tone-preset');
            if (scholarTone) scholarTone.value = readValue('ss_viewer_scholar_ai_tone_preset', scholarTone.value);
            const sspModel = root.document && root.document.getElementById('ssp-model');
            if (sspModel) sspModel.value = readValue('ss_image_model', sspModel.value);
            const sspPrompt = root.document && root.document.getElementById('ssp-prompt');
            const sspPrompt2 = root.document && root.document.getElementById('ssp-prompt-2');
            const sspNoText = root.document && root.document.getElementById('ssp-no-text');
            const sspRatio = readValue('ss_image_ratio', '1:1');
            if (sspPrompt && root.document.activeElement !== sspPrompt) sspPrompt.value = readValue('ss_image_prompt', '');
            if (sspPrompt2 && root.document.activeElement !== sspPrompt2) sspPrompt2.value = readValue('ss_image_prompt_2', '');
            if (sspNoText) sspNoText.checked = readValue('ss_image_no_text', 'false') === 'true';
            root.__viewerSSPRatio = sspRatio;
            if (root.document) root.document.querySelectorAll('.ssp-ratio-btn').forEach(function (button) {
                button.classList.toggle('active', button.getAttribute('data-ratio') === sspRatio);
            });
            root.dispatchEvent(new CustomEvent('mdp-ai-tool-settings-restored', { detail: catalog }));
        } catch (_) {}
    }

    async function restoreCatalog() {
        if (catalogRestorePromise) return catalogRestorePromise;
        catalogRestorePromise = (async function () {
            requireSqlite();
            const items = await root.MDPStorage.listSqliteSettings({ scopeType: 'profile', scopeId: 'profile_default' });
            const stored = (Array.isArray(items) ? items : []).find(function (item) {
                return item && item.key === CATALOG_KEY && item.scopeType === 'profile';
            });
            if (!stored || !stored.value || typeof stored.value !== 'object') return syncCatalog();
            applyCatalog(stored.value);
            notifyCatalogRestored(stored.value);
            return stored.value;
        })().finally(function () { catalogRestorePromise = null; });
        return catalogRestorePromise;
    }

    function scheduleCatalogSync(delay) {
        if (catalogSyncTimer) root.clearTimeout(catalogSyncTimer);
        catalogSyncTimer = root.setTimeout(function () {
            catalogSyncTimer = 0;
            const status = root.MDPStorage && typeof root.MDPStorage.getStatus === 'function'
                ? root.MDPStorage.getStatus() : null;
            if (!status || status.activeMode !== 'sqlite') return;
            catalogSyncPromise = catalogSyncPromise.catch(function () {}).then(syncCatalog).catch(function (error) {
                console.warn('AI tool settings SQLite sync skipped:', error && error.message ? error.message : error);
                return null;
            });
        }, Math.max(0, Number(delay) || 250));
        return catalogSyncPromise;
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
        restoreCatalog: restoreCatalog,
        notifySettingsChanged: scheduleCatalogSync,
        _test: Object.freeze({ encryptValues: encryptValues, decryptEnvelope: decryptEnvelope, normalizeValues: normalizeValues })
    });
})(window);

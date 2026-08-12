(function (root) {
    'use strict';

    const SENSITIVE_KEY_RE = /(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|password[_-]?hash|verified)/i;
    const PROBABLE_SECRET_VALUE_RE = /(?:AIza[0-9A-Za-z_-]{30,}|sk-[0-9A-Za-z_-]{16,})/;
    const VALID_SCOPES = new Set(['global', 'profile', 'workspace', 'document', 'feature']);
    const SCOPE_PRIORITY = Object.freeze(['global', 'profile', 'workspace', 'feature', 'document']);
    const RULES = Object.freeze({
        aiMasterEnabled: ['features', 'global', ['boolean'], 16],
        scholarAI: ['features', 'global', ['boolean'], 16],
        sspimgAI: ['features', 'global', ['boolean'], 16],
        imageUploadEnabled: ['features', 'global', ['boolean'], 16],
        scholarSearchVisible: ['features', 'global', ['boolean'], 16],
        highlightVisible: ['features', 'global', ['boolean'], 16],
        sitesVisible: ['features', 'global', ['boolean'], 16],
        macroVisible: ['features', 'global', ['boolean'], 16],
        templateVisible: ['features', 'global', ['boolean'], 16],
        noteCoverInsertVisible: ['features', 'global', ['boolean'], 16],
        pdfMergeVisible: ['features', 'global', ['boolean'], 16],
        html2pptVisible: ['features', 'global', ['boolean'], 16],
        html2pptNameVisible: ['features', 'global', ['boolean'], 16],
        fmaViewerVisible: ['features', 'global', ['boolean'], 16],
        fmaViewerNameVisible: ['features', 'global', ['boolean'], 16],
        googleCalendarEnabled: ['features', 'global', ['boolean'], 16],
        googleDocsUseEnabled: ['features', 'global', ['boolean'], 16],
        toDocsVisible: ['features', 'global', ['boolean'], 16],
        docSyncVisible: ['features', 'global', ['boolean'], 16],
        githubEnabled: ['features', 'global', ['boolean'], 16],
        enterButtonInsertBr: ['editor', 'global', ['boolean'], 16],
        selectionWrapEnabled: ['editor', 'global', ['boolean'], 16],
        viewModeEditEnabled: ['editor', 'global', ['boolean'], 16],
        deepseekBaseUrl: ['integrations', 'workspace', ['string'], 4096],
        githubRepo: ['integrations', 'workspace', ['string'], 1024],
        githubBranch: ['integrations', 'workspace', ['string'], 256],
        githubDefaultPushPath: ['integrations', 'workspace', ['string'], 2048],
        githubPullMaxFiles: ['integrations', 'workspace', ['number'], 32],
        googleDocsClientId: ['integrations', 'workspace', ['string'], 4096],
        googleCalendarOpenMode: ['integrations', 'profile', ['string'], 64],
        googleCalendarEmail: ['integrations', 'profile', ['string'], 1024],
        naverBlogId: ['integrations', 'profile', ['string'], 1024],
        sitesList: ['collections', 'workspace', ['array'], 2 * 1024 * 1024],
        templateCustomList: ['collections', 'workspace', ['array'], 4 * 1024 * 1024],
        tidyCustomScripts: ['collections', 'workspace', ['array'], 4 * 1024 * 1024],
        textStyleCustomFonts: ['collections', 'workspace', ['array'], 4 * 1024 * 1024],
        shareSites: ['collections', 'workspace', ['array'], 256 * 1024],
        customShareDestinations: ['collections', 'workspace', ['array'], 2 * 1024 * 1024],
        userInfo: ['profile', 'profile', ['object'], 64 * 1024],
        encryptedToolVault: ['security', 'profile', ['object'], 512 * 1024],
        toolSettingsCatalog: ['integrations', 'profile', ['object'], 2 * 1024 * 1024]
    });

    function policyError(code, message) {
        const error = new Error(message);
        error.code = code;
        error.status = 400;
        return error;
    }

    function containsSensitiveKey(value) {
        if (Array.isArray(value)) return value.some(containsSensitiveKey);
        if (!value || typeof value !== 'object') return false;
        return Object.keys(value).some(function (key) {
            return SENSITIVE_KEY_RE.test(key) || containsSensitiveKey(value[key]);
        });
    }

    function containsProbableSecret(value) {
        if (typeof value === 'string') return PROBABLE_SECRET_VALUE_RE.test(value);
        if (Array.isArray(value)) return value.some(containsProbableSecret);
        if (!value || typeof value !== 'object') return false;
        return Object.keys(value).some(function (key) { return containsProbableSecret(value[key]); });
    }

    function valueType(value) {
        if (Array.isArray(value)) return 'array';
        if (value === null) return 'json';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number' && Number.isFinite(value)) return 'number';
        if (typeof value === 'string') return 'string';
        if (typeof value === 'object') return 'object';
        return 'json';
    }

    function defaultScopeId(scopeType) {
        if (scopeType === 'profile') return 'profile_default';
        if (scopeType === 'workspace') return 'workspace_default';
        return '';
    }

    function validateSetting(input) {
        const payload = input && typeof input === 'object' ? input : {};
        const key = String(payload.key || payload.settingKey || '').trim();
        if (!key) throw policyError('SETTING_KEY_REQUIRED', 'settingKey is required.');
        if (SENSITIVE_KEY_RE.test(key)) {
            throw policyError('SENSITIVE_SETTING_BLOCKED', 'Sensitive settings cannot be stored in SQLite.');
        }
        const rule = RULES[key];
        if (!rule) throw policyError('SETTING_NOT_ALLOWED', 'Setting is not in the SQLite allow-list.');
        if (containsSensitiveKey(payload.value) || containsProbableSecret(payload.value)) {
            throw policyError('SENSITIVE_NESTED_SETTING_BLOCKED', 'Nested sensitive values cannot be stored in SQLite.');
        }
        const type = valueType(payload.value);
        if (rule[2].indexOf(type) < 0) {
            throw policyError('INVALID_SETTING_TYPE', 'Setting value type is invalid.');
        }
        const scopeType = String(payload.scopeType || rule[1]).trim().toLowerCase();
        if (!VALID_SCOPES.has(scopeType)) {
            throw policyError('INVALID_SETTING_SCOPE', 'Setting scope is invalid.');
        }
        let scopeId = String(payload.scopeId == null ? '' : payload.scopeId).trim();
        if (!scopeId) scopeId = defaultScopeId(scopeType);
        if (scopeType === 'global') scopeId = '';
        if (scopeType !== 'global' && !scopeId) {
            throw policyError('SETTING_SCOPE_ID_REQUIRED', 'scopeId is required for this setting scope.');
        }
        if (scopeId.length > 128) throw policyError('SETTING_SCOPE_ID_TOO_LONG', 'scopeId is too long.');
        let valueJson;
        try { valueJson = JSON.stringify(payload.value); } catch (_) {
            throw policyError('INVALID_SETTING_VALUE', 'Setting value must be valid JSON.');
        }
        if (typeof valueJson !== 'string') {
            throw policyError('INVALID_SETTING_VALUE', 'Setting value must be valid JSON.');
        }
        if (new TextEncoder().encode(valueJson).byteLength > rule[3]) {
            throw policyError('SETTING_VALUE_TOO_LARGE', 'Setting value is too large.');
        }
        return {
            scopeType: scopeType,
            scopeId: scopeId,
            group: rule[0],
            key: key,
            value: payload.value,
            valueJson: valueJson,
            valueType: type
        };
    }

    root.MDPWasmSettingPolicy = Object.freeze({
        RULES: RULES,
        SCOPE_PRIORITY: SCOPE_PRIORITY,
        validateSetting: validateSetting,
        containsSensitiveKey: containsSensitiveKey
    });
})(typeof self !== 'undefined' ? self : globalThis);

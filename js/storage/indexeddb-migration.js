(function (root) {
    'use strict';

    const SOURCE_DATABASE = 'MarkdownProDB';
    const FILE_SOURCE_DATABASE = 'mdpro-indb-v1';
    const FILE_SOURCE_ID = 'source_mdpro_indb_v1';
    const AI_SETTINGS_KEY = 'ai_settings';
    const SENSITIVE_SETTING_RE = /(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|password[_-]?hash)/i;
    const TRANSIENT_SETTING_KEYS = new Set(['id', 'sqliteEnabled', 'localEnabled', 'githubCacheDocs', 'githubLastPulledAt', 'verified']);
    const SAFE_SETTING_RULES = Object.freeze({
        aiMasterEnabled: ['features', 'global'], scholarAI: ['features', 'global'],
        sspimgAI: ['features', 'global'], imageUploadEnabled: ['features', 'global'],
        imageUploadLinkSideVisible: ['features', 'global'],
        scholarSearchVisible: ['features', 'global'], highlightVisible: ['features', 'global'],
        sitesVisible: ['features', 'global'], macroVisible: ['features', 'global'],
        templateVisible: ['features', 'global'], templateNewFileVisible: ['features', 'global'],
        noteCoverInsertVisible: ['features', 'global'],
        pdfMergeVisible: ['features', 'global'],
        chromeSplitTabVisible: ['features', 'global'],
        html2pptVisible: ['features', 'global'],
        html2pptNameVisible: ['features', 'global'], fmaViewerVisible: ['features', 'global'],
        fmaViewerNameVisible: ['features', 'global'], googleCalendarEnabled: ['features', 'global'],
        googleDocsUseEnabled: ['features', 'global'], toDocsVisible: ['features', 'global'],
        docSyncVisible: ['features', 'global'], githubEnabled: ['features', 'global'],
        enterButtonInsertBr: ['editor', 'global'], selectionWrapEnabled: ['editor', 'global'],
        viewModeEditEnabled: ['editor', 'global'], deepseekBaseUrl: ['integrations', 'workspace'],
        githubRepo: ['integrations', 'workspace'], githubBranch: ['integrations', 'workspace'],
        githubDefaultPushPath: ['integrations', 'workspace'], githubPullMaxFiles: ['integrations', 'workspace'],
        googleDocsClientId: ['integrations', 'workspace'], googleCalendarOpenMode: ['integrations', 'profile'],
        googleCalendarEmail: ['integrations', 'profile'], naverBlogId: ['integrations', 'profile'],
        sitesList: ['collections', 'workspace'], templateCustomList: ['collections', 'workspace'],
        tidyCustomScripts: ['collections', 'workspace'],
        tidyJenaSelection: ['preferences', 'workspace'],
        shareSites: ['collections', 'workspace'], customShareDestinations: ['collections', 'workspace'],
        userInfo: ['profile', 'profile'],
        encryptedToolVault: ['security', 'profile'],
        toolSettingsCatalog: ['integrations', 'profile']
    });
    let lastPreviewState = null;

    function containsSensitiveSettingKey(value) {
        if (Array.isArray(value)) return value.some(containsSensitiveSettingKey);
        if (!value || typeof value !== 'object') return false;
        return Object.keys(value).some(function (key) {
            return SENSITIVE_SETTING_RE.test(key) || containsSensitiveSettingKey(value[key]);
        });
    }

    function settingScopeId(scopeType) {
        if (scopeType === 'profile') return 'profile_default';
        if (scopeType === 'workspace') return 'workspace_default';
        return '';
    }

    function classifyAiSettings(record) {
        const source = record && typeof record === 'object' ? record : {};
        const result = {
            settings: [],
            classification: {
                safeKeys: [], sensitiveKeys: [], transientKeys: [], unknownKeys: [], missingSecrets: []
            }
        };
        Object.keys(source).sort().forEach(function (key) {
            const value = source[key];
            if (TRANSIENT_SETTING_KEYS.has(key)) {
                result.classification.transientKeys.push(key);
                return;
            }
            if (SENSITIVE_SETTING_RE.test(key)) {
                result.classification.sensitiveKeys.push(key);
                if (value !== undefined && value !== null && value !== '') {
                    result.classification.missingSecrets.push(key);
                }
                return;
            }
            const rule = SAFE_SETTING_RULES[key];
            if (!rule) {
                result.classification.unknownKeys.push(key);
                return;
            }
            if (containsSensitiveSettingKey(value)) {
                result.classification.sensitiveKeys.push(key);
                result.classification.missingSecrets.push(key);
                return;
            }
            result.classification.safeKeys.push(key);
            result.settings.push({
                key: key,
                value: value,
                group: rule[0],
                scopeType: rule[1],
                scopeId: settingScopeId(rule[1])
            });
        });
        return result;
    }

    function requestAsPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB request failed.')); };
        });
    }

    function transactionDone(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () { reject(transaction.error || new Error('IndexedDB transaction failed.')); };
            transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB transaction was aborted.')); };
        });
    }

    function normalizeTime(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
        if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
        if (typeof value === 'string' && value.trim()) {
            const parsed = Date.parse(value);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    function normalizeFolder(record) {
        const source = record && typeof record === 'object' ? record : {};
        const id = String(source.id || '').trim();
        return {
            id: id,
            name: id === 'root' ? 'ROOT' : String(source.name || '').trim(),
            parentId: id === 'root' ? null : String(source.parentId || 'root').trim(),
            sortOrder: Number.isFinite(Number(source.sortOrder)) ? Math.trunc(Number(source.sortOrder)) : 0,
            createdAt: normalizeTime(source.createdAt),
            updatedAt: normalizeTime(source.updatedAt)
        };
    }

    function normalizeDocument(record) {
        const source = record && typeof record === 'object' ? record : {};
        return {
            id: String(source.id || '').trim(),
            title: String(source.title || '').trim(),
            content: String(source.content == null ? '' : source.content),
            folderId: String(source.folderId || 'root').trim(),
            createdAt: normalizeTime(source.createdAt),
            updatedAt: normalizeTime(source.updatedAt)
        };
    }

    function normalizeFilePath(value) {
        return String(value == null ? '' : value)
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/^\/+|\/+$/g, '')
            .trim();
    }

    function normalizeFile(record) {
        const source = record && typeof record === 'object' ? record : {};
        const path = normalizeFilePath(source.path || source.__primaryKey);
        const segments = path.split('/');
        const fallbackName = segments[segments.length - 1] || '';
        const name = String(source.name || fallbackName).trim();
        const extensionFromName = name.includes('.') ? name.split('.').pop() : '';
        return {
            path: path,
            name: name,
            extension: String(source.ext || extensionFromName || '').replace(/^\./, '').toLowerCase(),
            content: String(source.content == null ? '' : source.content),
            modifiedAt: normalizeTime(source.modified)
        };
    }

    async function sha256Text(value) {
        const cryptoApi = root.crypto;
        if (!cryptoApi || !cryptoApi.subtle || typeof TextEncoder !== 'function') {
            const error = new Error('이관 미리보기에 필요한 SHA-256 기능을 사용할 수 없습니다. 로컬 앱 주소로 열어 주세요.');
            error.code = 'BROWSER_CHECKSUM_UNAVAILABLE';
            throw error;
        }
        const bytes = new TextEncoder().encode(String(value == null ? '' : value));
        const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    async function buildBatchFromRecords(records, version) {
        const folders = (Array.isArray(records && records.folders) ? records.folders : []).map(normalizeFolder);
        const documents = [];
        const sourceDocuments = Array.isArray(records && records.documents) ? records.documents : [];
        for (let index = 0; index < sourceDocuments.length; index++) {
            const documentRecord = normalizeDocument(sourceDocuments[index]);
            documentRecord.checksum = await sha256Text(documentRecord.content);
            documents.push(documentRecord);
        }
        const files = [];
        const sourceFiles = Array.isArray(records && records.files) ? records.files : [];
        for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
            const fileRecord = normalizeFile(sourceFiles[fileIndex]);
            fileRecord.sizeBytes = new TextEncoder().encode(fileRecord.content).byteLength;
            fileRecord.checksum = await sha256Text(fileRecord.content);
            files.push(fileRecord);
        }
        const batch = {
            source: { database: SOURCE_DATABASE, version: Number(version) || 0 },
            folders: folders,
            documents: documents
        };
        const classifiedSettings = classifyAiSettings(records && records.aiSettings);
        batch.settings = classifiedSettings.settings;
        batch.settingsClassification = classifiedSettings.classification;
        if (records && records.fileDatabaseExists === true) {
            const meta = records.fileMeta && typeof records.fileMeta === 'object' ? records.fileMeta : {};
            batch.source.fileDatabase = FILE_SOURCE_DATABASE;
            batch.source.fileVersion = Number(records.fileVersion) || 0;
            batch.fileSource = {
                id: FILE_SOURCE_ID,
                database: FILE_SOURCE_DATABASE,
                store: 'files',
                name: String(meta.folderName || 'inDB 파일 백업').trim() || 'inDB 파일 백업',
                rootUri: 'indexeddb://' + FILE_SOURCE_DATABASE + '/files',
                savedAt: normalizeTime(meta.savedAtIso || meta.savedAt),
                memo: meta.memo == null ? null : String(meta.memo),
                declaredFileCount: Number.isFinite(Number(meta.fileCount)) ? Math.max(0, Math.trunc(Number(meta.fileCount))) : null
            };
            batch.files = files;
        }
        return batch;
    }

    function openExistingDatabase(databaseName) {
        return new Promise(function (resolve, reject) {
            if (!root.indexedDB || typeof root.indexedDB.open !== 'function') {
                reject(new Error('IndexedDB를 사용할 수 없습니다.'));
                return;
            }
            const request = root.indexedDB.open(databaseName);
            let createdDuringOpen = false;
            request.onupgradeneeded = function () {
                createdDuringOpen = true;
                try { request.transaction.abort(); } catch (_) {}
            };
            request.onsuccess = function () {
                if (createdDuringOpen) {
                    request.result.close();
                    const error = new Error('기존 IndexedDB를 찾을 수 없습니다: ' + databaseName);
                    error.code = 'SOURCE_DATABASE_NOT_FOUND';
                    reject(error);
                    return;
                }
                resolve(request.result);
            };
            request.onerror = function () {
                if (createdDuringOpen) {
                    const missing = new Error('기존 IndexedDB를 찾을 수 없습니다: ' + databaseName);
                    missing.code = 'SOURCE_DATABASE_NOT_FOUND';
                    reject(missing);
                    return;
                }
                reject(request.error || new Error(databaseName + ' IndexedDB를 열 수 없습니다.'));
            };
        });
    }

    function openSourceDatabase() {
        return openExistingDatabase(SOURCE_DATABASE);
    }

    async function readLegacyFileSource() {
        let database;
        try {
            database = await openExistingDatabase(FILE_SOURCE_DATABASE);
        } catch (error) {
            if (error && error.code === 'SOURCE_DATABASE_NOT_FOUND') {
                return { exists: false, files: [], meta: null, version: 0 };
            }
            throw error;
        }
        try {
            if (!database.objectStoreNames.contains('files')) {
                return { exists: false, files: [], meta: null, version: database.version };
            }
            const stores = ['files'];
            if (database.objectStoreNames.contains('meta')) stores.push('meta');
            const transaction = database.transaction(stores, 'readonly');
            const fileStore = transaction.objectStore('files');
            const filesRequest = fileStore.getAll();
            const keysRequest = typeof fileStore.getAllKeys === 'function' ? fileStore.getAllKeys() : null;
            const metaRequest = stores.indexOf('meta') >= 0
                ? transaction.objectStore('meta').get('root')
                : null;
            const requests = [requestAsPromise(filesRequest)];
            if (keysRequest) requests.push(requestAsPromise(keysRequest));
            if (metaRequest) requests.push(requestAsPromise(metaRequest));
            requests.push(transactionDone(transaction));
            const results = await Promise.all(requests);
            const rawFiles = Array.isArray(results[0]) ? results[0] : [];
            const keys = keysRequest && Array.isArray(results[1]) ? results[1] : [];
            const metaIndex = 1 + (keysRequest ? 1 : 0);
            const meta = metaRequest ? results[metaIndex] : null;
            const files = rawFiles.map(function (record, index) {
                return Object.assign({}, record || {}, { __primaryKey: keys[index] });
            });
            return { exists: true, files: files, meta: meta, version: database.version };
        } finally {
            database.close();
        }
    }

    async function readSourceBatch() {
        let documentRecords = { folders: [], documents: [] };
        let sourceVersion = 0;
        let documentDatabaseExists = false;
        let database = null;
        try {
            database = await openSourceDatabase();
            documentDatabaseExists = true;
            try {
                const required = ['folders', 'documents'];
                const missing = required.filter(function (name) { return !database.objectStoreNames.contains(name); });
                if (missing.length) {
                    const error = new Error('IndexedDB 저장소가 없습니다: ' + missing.join(', '));
                    error.code = 'SOURCE_STORE_NOT_FOUND';
                    throw error;
                }
                const stores = required.slice();
                if (database.objectStoreNames.contains('ai_settings')) stores.push('ai_settings');
                const transaction = database.transaction(stores, 'readonly');
                const foldersRequest = transaction.objectStore('folders').getAll();
                const documentsRequest = transaction.objectStore('documents').getAll();
                const settingsRequest = stores.indexOf('ai_settings') >= 0
                    ? transaction.objectStore('ai_settings').get(AI_SETTINGS_KEY)
                    : null;
                const requests = [
                    requestAsPromise(foldersRequest),
                    requestAsPromise(documentsRequest)
                ];
                if (settingsRequest) requests.push(requestAsPromise(settingsRequest));
                requests.push(transactionDone(transaction));
                const results = await Promise.all(requests);
                documentRecords = {
                    folders: results[0],
                    documents: results[1],
                    aiSettings: settingsRequest ? results[2] : null
                };
                sourceVersion = database.version;
            } finally {
                database.close();
            }
        } catch (error) {
            if (!error || error.code !== 'SOURCE_DATABASE_NOT_FOUND') throw error;
        }
        const fileSource = await readLegacyFileSource();
        if (!documentDatabaseExists && !fileSource.exists) {
            const error = new Error('이관할 MarkdownProDB 또는 mdpro-indb-v1을 찾을 수 없습니다.');
            error.code = 'SOURCE_DATABASE_NOT_FOUND';
            throw error;
        }
        documentRecords.fileDatabaseExists = fileSource.exists;
        documentRecords.fileVersion = fileSource.version;
        documentRecords.fileMeta = fileSource.meta;
        documentRecords.files = fileSource.files;
        return await buildBatchFromRecords(documentRecords, sourceVersion);
    }

    async function preview() {
        if (!root.MDPStorage || typeof root.MDPStorage.previewIndexedDbMigration !== 'function') {
            throw new Error('SQLite 이관 미리보기 서비스가 준비되지 않았습니다.');
        }
        const batch = await readSourceBatch();
        const result = await root.MDPStorage.previewIndexedDbMigration(batch);
        lastPreviewState = { batch: batch, result: result };
        return result;
    }

    async function applyLastPreview() {
        if (!lastPreviewState || !lastPreviewState.result) {
            const error = new Error('먼저 IndexedDB 이관 미리보기를 실행해 주세요.');
            error.code = 'MIGRATION_PREVIEW_REQUIRED';
            throw error;
        }
        if (!root.MDPStorage || typeof root.MDPStorage.applyIndexedDbMigration !== 'function') {
            throw new Error('SQLite 이관 적용 서비스가 준비되지 않았습니다.');
        }
        const currentBatch = await readSourceBatch();
        currentBatch.previewFingerprint = String(lastPreviewState.result.batchFingerprint || '');
        currentBatch.migrationId = String(lastPreviewState.result.migrationId || '');
        const result = await root.MDPStorage.applyIndexedDbMigration(currentBatch);
        lastPreviewState = null;
        return result;
    }

    root.MDPIndexedDbMigration = {
        readSourceBatch: readSourceBatch,
        buildBatchFromRecords: buildBatchFromRecords,
        preview: preview,
        applyLastPreview: applyLastPreview,
        getLastPreview: function () { return lastPreviewState; },
        normalizeFolder: normalizeFolder,
        normalizeDocument: normalizeDocument,
        normalizeFile: normalizeFile,
        classifyAiSettings: classifyAiSettings,
        safeSettingKeys: Object.freeze(Object.keys(SAFE_SETTING_RULES)),
        readLegacyFileSource: readLegacyFileSource
    };
})(typeof window !== 'undefined' ? window : globalThis);

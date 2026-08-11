(function (root) {
    'use strict';

    const MODE_KEY = 'mdpro_storage_mode_v1';
    const SQLITE_BACKEND_KEY = 'mdpro_sqlite_backend_v1';
    const SQLITE_FEATURE_KEY = 'mdpro_sqlite_feature_enabled_v1';
    const DEFAULT_SQLITE_BACKEND = 'wasm';
    const MODES = Object.freeze({ INDB: 'indb', SQLITE: 'sqlite' });
    const listeners = new Set();
    let initialized = false;
    let activeMode = MODES.INDB;
    let preferredMode = MODES.INDB;
    let indexedDbAdapter = null;
    let sqliteAdapter = null;
    let sqliteApiAdapter = null;
    let sqliteWasmAdapter = null;
    let sqliteBackendPreference = DEFAULT_SQLITE_BACKEND;
    let sqliteBackend = null;
    let recoveryBuffer = null;
    let recoveryFlushPromise = null;
    let sqliteHealth = null;
    let lastError = null;
    let recoveryStatus = {
        available: false,
        draftCount: 0,
        pendingCount: 0,
        syncState: 'idle',
        lastError: null,
        lastSyncedAt: null
    };

    function readPreferredMode() {
        try {
            return root.localStorage.getItem(MODE_KEY) === MODES.SQLITE ? MODES.SQLITE : MODES.INDB;
        } catch (_) {
            return MODES.INDB;
        }
    }

    function writePreferredMode(mode) {
        try { root.localStorage.setItem(MODE_KEY, mode); } catch (_) {}
    }

    function readSqliteBackendPreference() {
        try {
            const value = String(root.localStorage.getItem(SQLITE_BACKEND_KEY) || DEFAULT_SQLITE_BACKEND).toLowerCase();
            return value === 'auto' || value === 'api' || value === 'wasm' ? value : DEFAULT_SQLITE_BACKEND;
        } catch (_) {
            return DEFAULT_SQLITE_BACKEND;
        }
    }

    function writeSqliteBackendPreference(backend) {
        try { root.localStorage.setItem(SQLITE_BACKEND_KEY, backend); } catch (_) {}
    }

    function snapshot() {
        return {
            initialized: initialized,
            activeMode: activeMode,
            preferredMode: preferredMode,
            sqliteBackendPreference: sqliteBackendPreference,
            sqliteBackend: sqliteBackend,
            sqliteHealth: sqliteHealth,
            lastError: lastError,
            recoveryStatus: { ...recoveryStatus }
        };
    }

    function notify() {
        const state = snapshot();
        listeners.forEach(function (listener) {
            try { listener(state); } catch (_) {}
        });
        try {
            root.dispatchEvent(new CustomEvent('mdp-storage-status', { detail: state }));
        } catch (_) {}
    }

    function sqliteCanActivate(health) {
        return !!(health && health.available === true
            && health.capabilities
            && health.capabilities.storageModeActivation === true
            && recoveryStatus.available === true);
    }

    function sqliteBackendCandidates() {
        if (sqliteBackendPreference === 'wasm') return sqliteWasmAdapter ? [sqliteWasmAdapter] : [];
        if (sqliteBackendPreference === 'api') return sqliteApiAdapter ? [sqliteApiAdapter] : [];
        return [sqliteApiAdapter, sqliteWasmAdapter].filter(Boolean);
    }

    function sqliteBackendName(adapter) {
        if (adapter === sqliteWasmAdapter) return 'wasm-opfs';
        if (adapter === sqliteApiAdapter) return 'api';
        return adapter && adapter.backend ? adapter.backend : null;
    }

    async function refreshSqliteHealth() {
        const candidates = sqliteBackendCandidates();
        sqliteHealth = null;
        lastError = null;
        sqliteAdapter = candidates[0] || null;
        sqliteBackend = sqliteBackendName(sqliteAdapter);
        if (!candidates.length) {
            const unavailable = new Error('SQLite storage adapter is not available.');
            unavailable.code = 'SQLITE_BACKEND_UNAVAILABLE';
            lastError = unavailable;
            notify();
            throw unavailable;
        }
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index];
            try {
                const health = await candidate.health();
                sqliteAdapter = candidate;
                sqliteBackend = sqliteBackendName(candidate);
                sqliteHealth = Object.assign({}, health, { backend: health.backend || sqliteBackend });
                lastError = null;
                break;
            } catch (error) {
                lastError = error;
            }
        }
        notify();
        return sqliteHealth;
    }

    async function initialize(options) {
        const config = options || {};
        indexedDbAdapter = new root.MDPIndexedDbAdapter({ getDb: config.getIndexedDb });
        sqliteApiAdapter = new root.MDPSqliteApiAdapter({
            baseUrl: config.sqliteBaseUrl || '/api/sqlite',
            fetchImpl: config.fetchImpl || root.fetch
        });
        sqliteWasmAdapter = null;
        if (typeof root.MDPSqliteWasmAdapter === 'function'
            && root.MDPSqliteWasmAdapter.isSupported(root)) {
            sqliteWasmAdapter = new root.MDPSqliteWasmAdapter({
                workerUrl: config.sqliteWasmWorkerUrl || './Local_SQLiteWASM/sqlite-wasm-worker.js?v=20260811-custom-fonts-1',
                workerFactory: config.sqliteWasmWorkerFactory,
                timeoutMs: config.sqliteWasmTimeoutMs
            });
        }
        sqliteBackendPreference = ['auto', 'api', 'wasm'].includes(config.sqliteBackend)
            ? config.sqliteBackend
            : readSqliteBackendPreference();
        sqliteAdapter = sqliteBackendPreference === 'wasm' && sqliteWasmAdapter
            ? sqliteWasmAdapter
            : sqliteApiAdapter;
        sqliteBackend = sqliteAdapter === sqliteWasmAdapter ? 'wasm-opfs' : 'api';
        recoveryBuffer = config.recoveryBuffer || (
            typeof root.MDPRecoveryBuffer === 'function'
                ? new root.MDPRecoveryBuffer({ indexedDBImpl: config.recoveryIndexedDB || root.indexedDB })
                : null
        );
        if (recoveryBuffer) {
            try {
                await recoveryBuffer.initialize();
                const bufferStatus = await recoveryBuffer.getStatus();
                recoveryStatus = {
                    ...recoveryStatus,
                    available: true,
                    draftCount: bufferStatus.draftCount,
                    pendingCount: bufferStatus.pendingCount,
                    syncState: bufferStatus.pendingCount > 0 ? 'pending' : 'idle',
                    lastError: null
                };
            } catch (error) {
                recoveryStatus = {
                    ...recoveryStatus,
                    available: false,
                    syncState: 'error',
                    lastError: error
                };
            }
        }
        preferredMode = readPreferredMode();
        activeMode = MODES.INDB;
        initialized = true;
        await refreshSqliteHealth();

        if (preferredMode === MODES.SQLITE && sqliteCanActivate(sqliteHealth)) {
            activeMode = MODES.SQLITE;
        } else if (preferredMode === MODES.SQLITE) {
            preferredMode = MODES.INDB;
            writePreferredMode(MODES.INDB);
        }
        notify();
        if (activeMode === MODES.SQLITE && recoveryStatus.pendingCount > 0) {
            await flushPendingOperations().catch(function () {});
        }
        return snapshot();
    }

    async function requestSqliteBackend(backend) {
        const requested = backend === 'auto' || backend === 'api' || backend === 'wasm'
            ? backend
            : DEFAULT_SQLITE_BACKEND;
        sqliteBackendPreference = requested;
        writeSqliteBackendPreference(requested);
        let health = null;
        try {
            health = await refreshSqliteHealth();
        } catch (error) {
            lastError = error;
        }
        if (!health) {
            // Keep the user's explicit backend selection. If it is temporarily
            // unavailable, fall back to IndexedDB for document writes until the
            // selected backend becomes healthy and SQLite is enabled again.
            if (activeMode === MODES.SQLITE) {
                activeMode = MODES.INDB;
                preferredMode = MODES.INDB;
                writePreferredMode(MODES.INDB);
            }
        }
        notify();
        return snapshot();
    }

    async function requestMode(mode) {
        const requested = mode === MODES.SQLITE ? MODES.SQLITE : MODES.INDB;
        if (!initialized) throw new Error('Storage service is not initialized.');
        if (requested === MODES.SQLITE) {
            const health = await refreshSqliteHealth();
            if (!health) {
                const offline = lastError || new Error('SQLite server is unavailable.');
                offline.code = offline.code || 'SQLITE_SERVER_OFFLINE';
                throw offline;
            }
            if (!sqliteCanActivate(health)) {
                const recoveryMissing = !!(health.capabilities
                    && health.capabilities.storageModeActivation === true
                    && recoveryStatus.available !== true);
                const notReady = new Error(recoveryMissing
                    ? 'SQLite 복구 버퍼를 사용할 수 없어 저장소를 전환할 수 없습니다.'
                    : 'SQLite 문서 저장 기능은 다음 단계에서 활성화됩니다.');
                notReady.code = recoveryMissing ? 'RECOVERY_BUFFER_UNAVAILABLE' : 'SQLITE_STORAGE_NOT_READY';
                lastError = notReady;
                notify();
                throw notReady;
            }
        }
        preferredMode = requested;
        activeMode = requested;
        lastError = null;
        writePreferredMode(requested);
        notify();
        if (requested === MODES.SQLITE && recoveryStatus.pendingCount > 0) {
            await flushPendingOperations().catch(function () {});
        }
        return snapshot();
    }

    async function refreshRecoveryStatus(syncState, error) {
        if (!recoveryBuffer) return { ...recoveryStatus };
        const counts = await recoveryBuffer.getStatus();
        recoveryStatus = {
            ...recoveryStatus,
            available: true,
            draftCount: counts.draftCount,
            pendingCount: counts.pendingCount,
            syncState: syncState || (counts.pendingCount > 0 ? 'pending' : 'idle'),
            lastError: error || null
        };
        notify();
        return { ...recoveryStatus };
    }

    async function saveDocumentDraft(record) {
        if (!recoveryBuffer) throw new Error('Recovery buffer is unavailable.');
        const saved = await recoveryBuffer.saveDraft(record);
        await refreshRecoveryStatus('draft', null);
        return saved;
    }

    async function queueDocumentUpdate(record, error) {
        if (!recoveryBuffer) throw new Error('Recovery buffer is unavailable.');
        const input = record || {};
        const queued = await recoveryBuffer.enqueueOperation({
            operationType: 'UPDATE',
            entityType: 'document',
            entityId: input.entityId,
            expectedVersion: input.expectedVersion,
            payload: input.payload,
            errorCode: error && error.code,
            error: error && error.message
        });
        const state = error && error.code === 'VERSION_CONFLICT' ? 'conflict' : 'pending';
        await refreshRecoveryStatus(state, error || null);
        return queued;
    }

    async function confirmDocumentSaved(documentId) {
        if (!recoveryBuffer) return false;
        await recoveryBuffer.clearDocument(documentId);
        recoveryStatus.lastSyncedAt = Date.now();
        await refreshRecoveryStatus('synced', null);
        return true;
    }

    async function deleteRecoveryDraft(documentId) {
        if (!recoveryBuffer) return false;
        await recoveryBuffer.deleteDraft(documentId);
        await refreshRecoveryStatus(null, null);
        return true;
    }

    async function previewIndexedDbMigration(batch) {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.migrationPreview !== true) {
            const unavailable = new Error('SQLite IndexedDB migration preview is not available.');
            unavailable.code = 'SQLITE_MIGRATION_PREVIEW_NOT_READY';
            throw unavailable;
        }
        return sqliteAdapter.previewIndexedDbMigration(batch);
    }

    async function applyIndexedDbMigration(batch) {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.migration !== true || capabilities.onlineBackup !== true) {
            const unavailable = new Error('SQLite IndexedDB migration apply is not available.');
            unavailable.code = 'SQLITE_MIGRATION_APPLY_NOT_READY';
            throw unavailable;
        }
        return sqliteAdapter.applyIndexedDbMigration(batch);
    }

    async function getResolvedSqliteSettings(options) {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.settings !== true) {
            const unavailable = new Error('SQLite settings are not available.');
            unavailable.code = 'SQLITE_SETTINGS_NOT_READY';
            throw unavailable;
        }
        return sqliteAdapter.getResolvedSettings(options || {});
    }

    async function saveSqliteSafeSettings(settingsRecord) {
        if (activeMode !== MODES.SQLITE) return { saved: 0, skipped: true };
        if (!root.MDPIndexedDbMigration
            || typeof root.MDPIndexedDbMigration.classifyAiSettings !== 'function') {
            const unavailable = new Error('SQLite setting policy is not ready.');
            unavailable.code = 'SQLITE_SETTING_POLICY_NOT_READY';
            throw unavailable;
        }
        const classified = root.MDPIndexedDbMigration.classifyAiSettings(settingsRecord || {});
        const settings = Array.isArray(classified.settings) ? classified.settings : [];
        for (let index = 0; index < settings.length; index++) {
            await sqliteAdapter.putSetting(settings[index]);
        }
        return {
            saved: settings.length,
            classification: classified.classification
        };
    }

    async function requireBackupPackageCapability() {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.backupPackage !== true || capabilities.onlineBackup !== true) {
            const unavailable = new Error('SQLite backup package is not available.');
            unavailable.code = 'SQLITE_BACKUP_PACKAGE_NOT_READY';
            throw unavailable;
        }
    }

    async function createBackupPackage() {
        await requireBackupPackageCapability();
        return sqliteAdapter.createBackupPackage();
    }

    async function validateBackupPackage(fileName) {
        await requireBackupPackageCapability();
        return sqliteAdapter.validateBackupPackage(fileName);
    }

    async function downloadBackupPackage(fileName) {
        await requireBackupPackageCapability();
        return sqliteAdapter.downloadBackupPackage(fileName);
    }

    async function previewBackupRestore(file) {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.restorePreview !== true) {
            const unavailable = new Error('SQLite restore preview is not available.');
            unavailable.code = 'SQLITE_RESTORE_PREVIEW_NOT_READY';
            throw unavailable;
        }
        return sqliteAdapter.previewBackupRestore(file);
    }

    async function applyBackupRestore(importId, expectedPackageChecksumSha256) {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        const capabilities = sqliteHealth && sqliteHealth.capabilities;
        if (!capabilities || capabilities.restore !== true) {
            const unavailable = new Error('SQLite restore apply is not available.');
            unavailable.code = 'SQLITE_RESTORE_NOT_READY';
            throw unavailable;
        }
        return sqliteAdapter.applyBackupRestore(importId, expectedPackageChecksumSha256);
    }

    function createConflictError(currentVersion) {
        const error = new Error('Pending SQLite save conflicts with the current document version.');
        error.code = 'VERSION_CONFLICT';
        error.status = 409;
        error.details = { currentVersion: currentVersion };
        return error;
    }

    async function listDocumentConflicts() {
        if (!recoveryBuffer) return [];
        if (activeMode !== MODES.SQLITE) return [];
        const results = await Promise.all([
            recoveryBuffer.listPendingOperations(500),
            recoveryBuffer.listDrafts()
        ]);
        const operations = Array.isArray(results[0]) ? results[0] : [];
        const drafts = Array.isArray(results[1]) ? results[1] : [];
        const draftById = new Map(drafts.map(function (draft) {
            return [String(draft.documentId || ''), draft];
        }));
        const conflicts = operations.filter(function (operation) {
            return operation.entityType === 'document'
                && operation.operationType === 'UPDATE'
                && operation.errorCode === 'VERSION_CONFLICT';
        });
        const items = [];
        for (let i = 0; i < conflicts.length; i++) {
            const operation = conflicts[i];
            let serverDocument = null;
            let serverError = null;
            try {
                serverDocument = await sqliteAdapter.getDocument(operation.entityId);
            } catch (error) {
                serverError = error;
            }
            const draft = draftById.get(String(operation.entityId || '')) || null;
            const payload = operation.payload && typeof operation.payload === 'object'
                ? operation.payload
                : {};
            items.push({
                documentId: String(operation.entityId || ''),
                operationId: String(operation.id || ''),
                expectedVersion: Number(operation.expectedVersion) || null,
                serverDocument: serverDocument,
                serverError: serverError,
                localDocument: {
                    id: String(operation.entityId || ''),
                    title: String(payload.title || (draft && draft.title) || 'Untitled'),
                    content: String(payload.content != null ? payload.content : (draft && draft.content) || ''),
                    folderId: String(payload.folderId || (serverDocument && serverDocument.folderId) || 'root'),
                    checksum: String(payload.checksum || (draft && draft.checksum) || ''),
                    baseVersion: Number(operation.expectedVersion) || (draft && Number(draft.baseVersion)) || null,
                    savedAt: draft && Number(draft.savedAt) || Number(operation.updatedAt) || null
                },
                retryCount: Number(operation.retryCount || 0),
                lastAttemptAt: Number(operation.lastAttemptAt) || null
            });
        }
        return items;
    }

    async function resolveDocumentConflict(documentId, strategy) {
        if (!recoveryBuffer) throw new Error('Recovery buffer is unavailable.');
        if (activeMode !== MODES.SQLITE) {
            const inactive = new Error('SQLite storage is not active.');
            inactive.code = 'SQLITE_STORAGE_NOT_ACTIVE';
            throw inactive;
        }
        if (recoveryFlushPromise) await recoveryFlushPromise.catch(function () {});
        const normalizedId = String(documentId || '').trim();
        const normalizedStrategy = String(strategy || '').trim().toLowerCase();
        if (!['server', 'local', 'copy'].includes(normalizedStrategy)) {
            const invalid = new Error('Conflict resolution strategy is invalid.');
            invalid.code = 'INVALID_CONFLICT_STRATEGY';
            throw invalid;
        }
        const conflicts = await listDocumentConflicts();
        const conflict = conflicts.find(function (item) { return item.documentId === normalizedId; });
        if (!conflict) {
            const missing = new Error('Document conflict was not found.');
            missing.code = 'CONFLICT_NOT_FOUND';
            throw missing;
        }
        const serverDocument = await sqliteAdapter.getDocument(normalizedId);
        const localDocument = conflict.localDocument;
        let resolvedDocument = serverDocument;

        if (normalizedStrategy === 'local') {
            resolvedDocument = await sqliteAdapter.updateDocument(normalizedId, {
                expectedVersion: Number(serverDocument.version),
                title: localDocument.title,
                content: localDocument.content,
                folderId: localDocument.folderId
            });
        } else if (normalizedStrategy === 'copy') {
            resolvedDocument = await sqliteAdapter.createDocument({
                title: localDocument.title + ' (복구본)',
                content: localDocument.content,
                folderId: localDocument.folderId
            });
        }

        await recoveryBuffer.clearDocument(normalizedId);
        recoveryStatus.lastSyncedAt = Date.now();
        await refreshRecoveryStatus(null, null);
        return {
            strategy: normalizedStrategy,
            document: resolvedDocument,
            serverDocument: serverDocument,
            originalDocumentId: normalizedId
        };
    }

    async function flushPendingOperations() {
        if (!recoveryBuffer) throw new Error('Recovery buffer is unavailable.');
        if (activeMode !== MODES.SQLITE) return { processed: 0, remaining: recoveryStatus.pendingCount };
        if (recoveryFlushPromise) return recoveryFlushPromise;

        recoveryFlushPromise = (async function () {
            await refreshRecoveryStatus('syncing', null);
            const operations = await recoveryBuffer.listPendingOperations(100);
            let processed = 0;
            let stopError = null;
            for (let i = 0; i < operations.length; i++) {
                const operation = operations[i];
                if (operation.entityType !== 'document' || operation.operationType !== 'UPDATE') continue;
                try {
                    const current = await sqliteAdapter.getDocument(operation.entityId);
                    const currentVersion = Number(current && current.version);
                    const expectedVersion = Number(operation.expectedVersion);
                    if (currentVersion !== expectedVersion) {
                        if (operation.payload && operation.payload.checksum
                            && current && current.checksum === operation.payload.checksum) {
                            await recoveryBuffer.clearDocument(operation.entityId);
                            processed += 1;
                            continue;
                        }
                        throw createConflictError(currentVersion);
                    }
                    await sqliteAdapter.updateDocument(operation.entityId, {
                        ...(operation.payload || {}),
                        expectedVersion: expectedVersion
                    });
                    await recoveryBuffer.clearDocument(operation.entityId);
                    processed += 1;
                } catch (error) {
                    await recoveryBuffer.markAttempt(operation.id, error);
                    stopError = error;
                    break;
                }
            }
            const state = stopError
                ? (stopError.code === 'VERSION_CONFLICT' ? 'conflict' : 'pending')
                : 'synced';
            if (!stopError) recoveryStatus.lastSyncedAt = Date.now();
            const status = await refreshRecoveryStatus(state, stopError);
            return { processed: processed, remaining: status.pendingCount, error: stopError };
        })();

        try {
            return await recoveryFlushPromise;
        } finally {
            recoveryFlushPromise = null;
        }
    }

    function getActiveAdapter() {
        if (!initialized) throw new Error('Storage service is not initialized.');
        return activeMode === MODES.SQLITE ? sqliteAdapter : indexedDbAdapter;
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.add(listener);
        return function () { listeners.delete(listener); };
    }

    function callActive(method, args) {
        const adapter = getActiveAdapter();
        if (!adapter || typeof adapter[method] !== 'function') {
            const unsupported = new Error('The active storage adapter does not support ' + method + '.');
            unsupported.code = 'STORAGE_METHOD_NOT_SUPPORTED';
            throw unsupported;
        }
        return adapter[method].apply(adapter, args || []);
    }

    function callSqlite(method, args) {
        if (!initialized || !sqliteAdapter) throw new Error('Storage service is not initialized.');
        if (typeof sqliteAdapter[method] !== 'function') {
            const unsupported = new Error('The SQLite storage adapter does not support ' + method + '.');
            unsupported.code = 'SQLITE_METHOD_NOT_SUPPORTED';
            throw unsupported;
        }
        return sqliteAdapter[method].apply(sqliteAdapter, args || []);
    }

    async function requireSqliteWorkFiles() {
        if (!sqliteHealth || !sqliteHealth.available) await refreshSqliteHealth();
        if (!sqliteHealth.capabilities || sqliteHealth.capabilities.workFiles !== true) {
            const unavailable = new Error('현재 SQLite 서버는 작업파일 저장을 지원하지 않습니다.');
            unavailable.code = 'SQLITE_WORK_FILES_NOT_READY';
            throw unavailable;
        }
    }

    async function saveSqliteWorkFile(file, options) {
        await requireSqliteWorkFiles();
        return callSqlite('uploadWorkFile', [file, options]);
    }

    async function listSqliteWorkFiles(options) {
        await requireSqliteWorkFiles();
        return callSqlite('listWorkFiles', [options]);
    }

    async function loadSqliteWorkFile(item) {
        await requireSqliteWorkFiles();
        return callSqlite('downloadWorkFile', [item]);
    }

    function sqliteWorkFileBackendName(adapter) {
        if (adapter === indexedDbAdapter) return 'indb';
        if (adapter === sqliteWasmAdapter) return 'wasm-opfs';
        if (adapter === sqliteApiAdapter) return 'api';
        return String(adapter && adapter.backend || 'sqlite');
    }

    function scholarSqliteFeatureEnabled() {
        try { return root.localStorage.getItem(SQLITE_FEATURE_KEY) === '1'; } catch (_) { return false; }
    }

    function scholarSqliteWorkFileAdapters(preferredBackend) {
        // Scholar work files prefer SQLite, but always keep inDB as the durable browser fallback.
        const sqliteAdapters = scholarSqliteFeatureEnabled()
            ? [sqliteAdapter, sqliteWasmAdapter, sqliteApiAdapter]
            : [];
        const all = sqliteAdapters.concat([indexedDbAdapter]).filter(Boolean);
        const unique = all.filter(function (adapter, index) { return all.indexOf(adapter) === index; });
        if (!preferredBackend) return unique;
        return unique.sort(function (left, right) {
            const leftPreferred = sqliteWorkFileBackendName(left) === preferredBackend ? 1 : 0;
            const rightPreferred = sqliteWorkFileBackendName(right) === preferredBackend ? 1 : 0;
            return rightPreferred - leftPreferred;
        });
    }

    async function scholarAdapterSupportsWorkFiles(adapter) {
        if (!adapter || typeof adapter.health !== 'function') return false;
        const health = await adapter.health();
        return !!(health && health.available === true
            && health.capabilities && health.capabilities.workFiles === true);
    }

    async function saveScholarSqliteWorkFile(file, options) {
        if (!initialized) throw new Error('Storage service is not initialized.');
        const errors = [];
        const adapters = scholarSqliteWorkFileAdapters();
        for (let index = 0; index < adapters.length; index++) {
            const adapter = adapters[index];
            try {
                if (!await scholarAdapterSupportsWorkFiles(adapter)) continue;
                if (typeof adapter.uploadWorkFile !== 'function') continue;
                const result = await adapter.uploadWorkFile(file, options || {});
                return Object.assign({}, result || {}, {
                    storageBackend: sqliteWorkFileBackendName(adapter)
                });
            } catch (error) {
                errors.push(error);
            }
        }
        const failure = errors[errors.length - 1];
        throw failure || new Error('학술검색용 STORAGE(SQLite/inDB)를 사용할 수 없습니다.');
    }

    async function listScholarSqliteWorkFiles(options) {
        if (!initialized) throw new Error('Storage service is not initialized.');
        const config = options || {};
        const adapters = scholarSqliteWorkFileAdapters();
        const items = [];
        const errors = [];
        let successCount = 0;
        for (let index = 0; index < adapters.length; index++) {
            const adapter = adapters[index];
            try {
                if (!await scholarAdapterSupportsWorkFiles(adapter)) continue;
                if (typeof adapter.listWorkFiles !== 'function') continue;
                const result = await adapter.listWorkFiles(config);
                const backend = sqliteWorkFileBackendName(adapter);
                (result && Array.isArray(result.items) ? result.items : []).forEach(function (item) {
                    items.push(Object.assign({}, item, { storageBackend: backend }));
                });
                successCount += 1;
            } catch (error) {
                errors.push(error);
            }
        }
        if (!successCount) {
            const failure = errors[errors.length - 1];
            throw failure || new Error('학술검색용 STORAGE(SQLite/inDB)를 사용할 수 없습니다.');
        }
        items.sort(function (left, right) {
            return Number(right.createdAt || right.modifiedAt || 0) - Number(left.createdAt || left.modifiedAt || 0);
        });
        const limit = Math.max(1, Math.min(500, Number(config.limit) || 200));
        return { items: items.slice(0, limit), total: items.length };
    }

    async function loadScholarSqliteWorkFile(item) {
        if (!initialized) throw new Error('Storage service is not initialized.');
        const preferredBackend = String(item && item.storageBackend || '');
        const adapters = scholarSqliteWorkFileAdapters(preferredBackend);
        const errors = [];
        for (let index = 0; index < adapters.length; index++) {
            const adapter = adapters[index];
            try {
                if (!await scholarAdapterSupportsWorkFiles(adapter)) continue;
                if (typeof adapter.downloadWorkFile !== 'function') continue;
                return await adapter.downloadWorkFile(item);
            } catch (error) {
                errors.push(error);
            }
        }
        const failure = errors[errors.length - 1];
        throw failure || new Error('저장된 학술검색 문서를 SQLite/inDB에서 불러올 수 없습니다.');
    }

    async function requireScholarInDbWorkFiles() {
        if (!initialized || !indexedDbAdapter) throw new Error('inDB 저장소가 초기화되지 않았습니다.');
        if (!await scholarAdapterSupportsWorkFiles(indexedDbAdapter)) {
            throw new Error('inDB 작업파일 저장소를 사용할 수 없습니다.');
        }
        return indexedDbAdapter;
    }

    async function saveScholarInDbWorkFile(file, options) {
        const adapter = await requireScholarInDbWorkFiles();
        const result = await adapter.uploadWorkFile(file, options || {});
        return Object.assign({}, result || {}, { storageBackend: 'indb' });
    }

    async function listScholarInDbWorkFiles(options) {
        const adapter = await requireScholarInDbWorkFiles();
        const result = await adapter.listWorkFiles(options || {});
        const items = result && Array.isArray(result.items) ? result.items : [];
        return {
            items: items.map(function (item) {
                return Object.assign({}, item, { storageBackend: 'indb' });
            }),
            total: Number(result && result.total || items.length)
        };
    }

    async function loadScholarInDbWorkFile(item) {
        const adapter = await requireScholarInDbWorkFiles();
        return adapter.downloadWorkFile(item);
    }

    root.MDPStorage = {
        MODES: MODES,
        MODE_KEY: MODE_KEY,
        SQLITE_BACKEND_KEY: SQLITE_BACKEND_KEY,
        SQLITE_FEATURE_KEY: SQLITE_FEATURE_KEY,
        DEFAULT_SQLITE_BACKEND: DEFAULT_SQLITE_BACKEND,
        initialize: initialize,
        requestMode: requestMode,
        requestSqliteBackend: requestSqliteBackend,
        refreshSqliteHealth: refreshSqliteHealth,
        getStatus: snapshot,
        getActiveAdapter: getActiveAdapter,
        subscribe: subscribe,
        saveDocumentDraft: saveDocumentDraft,
        queueDocumentUpdate: queueDocumentUpdate,
        confirmDocumentSaved: confirmDocumentSaved,
        flushPendingOperations: flushPendingOperations,
        listDocumentConflicts: listDocumentConflicts,
        resolveDocumentConflict: resolveDocumentConflict,
        listRecoveryDrafts: function () {
            return recoveryBuffer ? recoveryBuffer.listDrafts() : Promise.resolve([]);
        },
        deleteRecoveryDraft: deleteRecoveryDraft,
        previewIndexedDbMigration: previewIndexedDbMigration,
        applyIndexedDbMigration: applyIndexedDbMigration,
        getResolvedSqliteSettings: getResolvedSqliteSettings,
        saveSqliteSafeSettings: saveSqliteSafeSettings,
        listSqliteSettings: function (options) {
            return callSqlite('listSettings', [options]);
        },
        putSqliteSetting: function (setting) {
            return callSqlite('putSetting', [setting]);
        },
        createBackupPackage: createBackupPackage,
        validateBackupPackage: validateBackupPackage,
        downloadBackupPackage: downloadBackupPackage,
        previewBackupRestore: previewBackupRestore,
        applyBackupRestore: applyBackupRestore,
        getSqliteExplorerSnapshot: function (options) {
            return callSqlite('getExplorerSnapshot', [options]);
        },
        getSqliteExplorerDocument: function (id) {
            return callSqlite('getExplorerDocument', [id]);
        },
        listSqliteExplorerDocumentVersions: function (id) {
            return callSqlite('listExplorerDocumentVersions', [id]);
        },
        getSqliteExplorerFileEntry: function (id) {
            return callSqlite('getExplorerFileEntry', [id]);
        },
        getSqliteExplorerFmaPreview: function (id) {
            return callSqlite('getExplorerFmaPreview', [id]);
        },
        getSqliteExplorerFmaThumbnail: function (id, mediaId) {
            return callSqlite('getExplorerFmaThumbnail', [id, mediaId]);
        },
        getSqliteExplorerBackup: function (id) {
            return callSqlite('getExplorerBackup', [id]);
        },
        deleteSqliteExplorerBackup: function (id) {
            return callSqlite('deleteExplorerBackup', [id]);
        },
        runSqliteIntegrityCheck: function () {
            return callSqlite('integrityCheck', []);
        },
        exportSqliteDatabase: function (options) {
            return callSqlite('exportDatabase', [options || {}]);
        },
        importSqliteDatabase: function (file, options) {
            return callSqlite('importDatabase', [file, options || {}]);
        },
        saveSqliteWorkFile: saveSqliteWorkFile,
        listSqliteWorkFiles: listSqliteWorkFiles,
        loadSqliteWorkFile: loadSqliteWorkFile,
        saveScholarSqliteWorkFile: saveScholarSqliteWorkFile,
        listScholarSqliteWorkFiles: listScholarSqliteWorkFiles,
        loadScholarSqliteWorkFile: loadScholarSqliteWorkFile,
        saveScholarInDbWorkFile: saveScholarInDbWorkFile,
        listScholarInDbWorkFiles: listScholarInDbWorkFiles,
        loadScholarInDbWorkFile: loadScholarInDbWorkFile,
        getRecoveryStatus: function () { return { ...recoveryStatus }; },
        listDocuments: function (options) { return callActive('listDocuments', [options]); },
        searchDocuments: function (query, options) { return callActive('searchDocuments', [query, options]); },
        getDocument: function (id) { return callActive('getDocument', [id]); },
        createDocument: function (record) { return callActive('createDocument', [record]); },
        updateDocument: function (id, record) { return callActive('updateDocument', [id, record]); },
        deleteDocument: function (id, expectedVersion) { return callActive('deleteDocument', [id, expectedVersion]); },
        listDocumentVersions: function (id) { return callActive('listDocumentVersions', [id]); },
        restoreDocumentVersion: function (id, version, expectedVersion) {
            return callActive('restoreDocumentVersion', [id, version, expectedVersion]);
        },
        listFolders: function () { return callActive('listFolders', []); },
        createFolder: function (record) { return callActive('createFolder', [record]); },
        updateFolder: function (id, record) { return callActive('updateFolder', [id, record]); },
        deleteFolder: function (id) { return callActive('deleteFolder', [id]); }
    };
})(typeof window !== 'undefined' ? window : globalThis);

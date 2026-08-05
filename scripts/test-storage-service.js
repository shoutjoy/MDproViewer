const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.CustomEvent = class CustomEvent {
    constructor(type, options) {
        this.type = type;
        this.detail = options && options.detail;
    }
};
global.dispatchEvent = function () {};

const values = new Map();
global.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
};

const capabilities = {
    health: true,
    bootstrap: true,
    integrityCheck: true,
    documents: false,
    folders: false,
    settings: false,
    search: false,
    migration: false,
    backup: false,
    storageModeActivation: false
};

const requests = [];
let retryDocument = {
    id: 'doc_retry',
    title: 'Retry',
    content: 'server body',
    folderId: 'root',
    version: 1,
    checksum: 'server-checksum'
};
global.fetch = async function (url, options) {
    requests.push({ url: String(url), options: options || {}, boundToWindow: this === global });
    const pathname = String(url);
    const method = String(options && options.method || 'GET').toUpperCase();
    let data = pathname.endsWith('/session')
        ? { token: 'test-session', capabilities }
        : pathname.endsWith('/health')
            ? { available: true, schemaVersion: 3, journalMode: 'wal', capabilities }
            : { ok: true };
    if (pathname.endsWith('/documents/doc_retry') && method === 'GET') data = { ...retryDocument };
    if (pathname.endsWith('/documents/doc_retry') && method === 'PUT') {
        const body = JSON.parse(options.body);
        retryDocument = { ...retryDocument, ...body, version: retryDocument.version + 1 };
        delete retryDocument.expectedVersion;
        data = { ...retryDocument };
    }
    if (pathname.endsWith('/documents') && method === 'POST') {
        const body = JSON.parse(options.body);
        data = {
            id: body.id || 'doc_conflict_copy',
            title: body.title,
            content: body.content,
            folderId: body.folderId || 'root',
            version: 1,
            checksum: 'created-checksum'
        };
    }
    return {
        ok: true,
        status: 200,
        async json() { return { ok: true, data }; }
    };
};

const root = path.resolve(__dirname, '..');
require(path.join(root, 'js', 'storage', 'indexeddb-adapter.js'));
require(path.join(root, 'js', 'storage', 'sqlite-api-adapter.js'));
require(path.join(root, 'js', 'storage', 'storage-service.js'));

(async function () {
    const recoveryDrafts = new Map();
    const pendingOperations = new Map();
    const recoveryBuffer = {
        async initialize() { return true; },
        async getStatus() {
            return { draftCount: recoveryDrafts.size, pendingCount: pendingOperations.size };
        },
        async saveDraft(record) {
            const saved = { ...record, checksum: record.checksum || 'draft-checksum', savedAt: Date.now() };
            recoveryDrafts.set(record.documentId, saved);
            return saved;
        },
        async listDrafts() { return Array.from(recoveryDrafts.values()); },
        async deleteDraft(id) { recoveryDrafts.delete(String(id)); return true; },
        async enqueueOperation(record) {
            const id = record.id || 'document:update:' + record.entityId;
            const saved = { ...record, id, retryCount: 0, createdAt: Date.now() };
            pendingOperations.set(id, saved);
            return saved;
        },
        async listPendingOperations() { return Array.from(pendingOperations.values()); },
        async getPendingOperation(id) { return pendingOperations.get(id); },
        async markAttempt(id, error) {
            const current = pendingOperations.get(id);
            if (!current) return null;
            const saved = { ...current, retryCount: current.retryCount + 1, errorCode: error.code };
            pendingOperations.set(id, saved);
            return saved;
        },
        async deletePendingOperation(id) { pendingOperations.delete(id); return true; },
        async clearDocument(id) {
            recoveryDrafts.delete(String(id));
            Array.from(pendingOperations.values()).forEach(function (operation) {
                if (operation.entityId === String(id)) pendingOperations.delete(operation.id);
            });
            return true;
        }
    };
    const state = await global.MDPStorage.initialize({
        getIndexedDb: function () { return {}; },
        recoveryBuffer: recoveryBuffer
    });
    assert.equal(state.activeMode, 'indb');
    assert.equal(state.sqliteHealth.schemaVersion, 3);
    assert.equal(global.MDPStorage.getActiveAdapter().kind, 'indb');

    await assert.rejects(
        global.MDPStorage.requestMode('sqlite'),
        function (error) { return error && error.code === 'SQLITE_STORAGE_NOT_READY'; }
    );
    assert.equal(global.MDPStorage.getStatus().activeMode, 'indb');
    assert.equal(global.localStorage.getItem(global.MDPStorage.MODE_KEY), null);

    await global.MDPStorage.requestMode('indb');
    assert.equal(global.localStorage.getItem(global.MDPStorage.MODE_KEY), 'indb');

    capabilities.documents = true;
    capabilities.documentVersions = true;
    capabilities.folders = true;
    capabilities.search = true;
    capabilities.storageModeActivation = true;
    const sqliteState = await global.MDPStorage.requestMode('sqlite');
    assert.equal(sqliteState.activeMode, 'sqlite');
    assert.equal(global.MDPStorage.getActiveAdapter().kind, 'sqlite');
    assert.equal(sqliteState.recoveryStatus.available, true);
    await global.MDPStorage.listDocuments({ query: 'phase2c', limit: 25 });
    await global.MDPStorage.searchDocuments('본문 검색', { types: 'document', limit: 12 });
    await global.MDPStorage.listFolders();
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/documents?q=phase2c&limit=25');
    }), 'active SQLite adapter must receive document list requests');
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/search?q=%EB%B3%B8%EB%AC%B8%20%EA%B2%80%EC%83%89&types=document&limit=12');
    }), 'active SQLite adapter must receive FTS search requests');
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/folders/tree');
    }), 'active SQLite adapter must receive folder list requests');

    await global.MDPStorage.saveDocumentDraft({
        documentId: 'unsaved_current',
        storageMode: 'sqlite',
        title: 'Unsaved',
        content: 'not yet created'
    });
    assert.equal((await global.MDPStorage.listRecoveryDrafts()).length, 1);
    await global.MDPStorage.deleteRecoveryDraft('unsaved_current');
    assert.equal(global.MDPStorage.getRecoveryStatus().draftCount, 0);

    await global.MDPStorage.saveDocumentDraft({
        documentId: 'doc_retry',
        storageMode: 'sqlite',
        title: 'Retry',
        content: 'recovered body',
        baseVersion: 1
    });
    await global.MDPStorage.queueDocumentUpdate({
        entityId: 'doc_retry',
        expectedVersion: 1,
        payload: { title: 'Retry', content: 'recovered body', folderId: 'root', checksum: 'draft-checksum' }
    }, new Error('offline'));
    assert.equal(global.MDPStorage.getRecoveryStatus().pendingCount, 1);
    const flushResult = await global.MDPStorage.flushPendingOperations();
    assert.equal(flushResult.processed, 1);
    assert.equal(flushResult.remaining, 0);
    assert.equal(retryDocument.content, 'recovered body');
    assert.equal(retryDocument.version, 2);
    assert.equal(global.MDPStorage.getRecoveryStatus().draftCount, 0);

    retryDocument = { ...retryDocument, version: 5, checksum: 'newer-server-checksum' };
    await global.MDPStorage.saveDocumentDraft({
        documentId: 'doc_retry',
        storageMode: 'sqlite',
        title: 'Retry conflict',
        content: 'stale local body',
        baseVersion: 2
    });
    await global.MDPStorage.queueDocumentUpdate({
        entityId: 'doc_retry',
        expectedVersion: 2,
        payload: { title: 'Retry conflict', content: 'stale local body', checksum: 'stale-checksum' }
    }, new Error('offline'));
    const conflictFlush = await global.MDPStorage.flushPendingOperations();
    assert.equal(conflictFlush.processed, 0);
    assert.equal(conflictFlush.remaining, 1);
    assert.equal(conflictFlush.error.code, 'VERSION_CONFLICT');
    assert.equal(global.MDPStorage.getRecoveryStatus().syncState, 'conflict');

    const serverChoiceConflicts = await global.MDPStorage.listDocumentConflicts();
    assert.equal(serverChoiceConflicts.length, 1);
    assert.equal(serverChoiceConflicts[0].serverDocument.version, 5);
    assert.equal(serverChoiceConflicts[0].localDocument.content, 'stale local body');
    assert.equal(serverChoiceConflicts[0].expectedVersion, 2);
    const serverChoice = await global.MDPStorage.resolveDocumentConflict('doc_retry', 'server');
    assert.equal(serverChoice.strategy, 'server');
    assert.equal(serverChoice.document.version, 5);
    assert.equal(global.MDPStorage.getRecoveryStatus().pendingCount, 0);

    await global.MDPStorage.saveDocumentDraft({
        documentId: 'doc_retry',
        storageMode: 'sqlite',
        title: 'Local winner',
        content: 'local winner body',
        baseVersion: 2
    });
    await global.MDPStorage.queueDocumentUpdate({
        entityId: 'doc_retry',
        expectedVersion: 2,
        payload: { title: 'Local winner', content: 'local winner body', folderId: 'root', checksum: 'local-winner' }
    }, new Error('offline'));
    await global.MDPStorage.flushPendingOperations();
    const localChoice = await global.MDPStorage.resolveDocumentConflict('doc_retry', 'local');
    assert.equal(localChoice.strategy, 'local');
    assert.equal(localChoice.document.version, 6);
    assert.equal(localChoice.document.content, 'local winner body');
    assert.equal(global.MDPStorage.getRecoveryStatus().pendingCount, 0);

    retryDocument = { ...retryDocument, version: 8, checksum: 'server-copy-newer' };
    await global.MDPStorage.saveDocumentDraft({
        documentId: 'doc_retry',
        storageMode: 'sqlite',
        title: 'Copy winner',
        content: 'copy winner body',
        baseVersion: 6
    });
    await global.MDPStorage.queueDocumentUpdate({
        entityId: 'doc_retry',
        expectedVersion: 6,
        payload: { title: 'Copy winner', content: 'copy winner body', folderId: 'root', checksum: 'copy-winner' }
    }, new Error('offline'));
    await global.MDPStorage.flushPendingOperations();
    const copyChoice = await global.MDPStorage.resolveDocumentConflict('doc_retry', 'copy');
    assert.equal(copyChoice.strategy, 'copy');
    assert.equal(copyChoice.document.id, 'doc_conflict_copy');
    assert.equal(copyChoice.document.title, 'Copy winner (복구본)');
    assert.equal(copyChoice.document.content, 'copy winner body');
    assert.equal(global.MDPStorage.getRecoveryStatus().pendingCount, 0);
    assert.equal((await global.MDPStorage.listDocumentConflicts()).length, 0);
    await assert.rejects(
        global.MDPStorage.resolveDocumentConflict('doc_retry', 'overwrite'),
        function (error) { return error && error.code === 'INVALID_CONFLICT_STRATEGY'; }
    );
    await global.MDPStorage.requestMode('indb');

    const sqliteAdapter = new global.MDPSqliteApiAdapter({ baseUrl: '/api/sqlite' });
    await sqliteAdapter.integrityCheck();
    await sqliteAdapter.createDocument({ id: 'doc_mock', title: 'Mock', content: 'body' });
    await sqliteAdapter.updateDocument('doc_mock', {
        expectedVersion: 1,
        title: 'Mock 2',
        content: 'body 2'
    });
    await sqliteAdapter.deleteDocument('doc_mock', 2);
    const postRequest = requests.find(function (request) {
        return request.url.endsWith('/maintenance/integrity-check');
    });
    assert.ok(postRequest, 'integrity POST request must be sent');
    assert.equal(postRequest.boundToWindow, true, 'fetch must be bound to window');
    assert.equal(postRequest.options.headers['X-MDViewer-Session'], 'test-session');
    const createRequest = requests.find(function (request) {
        return request.url.endsWith('/documents')
            && request.options.method === 'POST'
            && JSON.parse(request.options.body).title === 'Mock';
    });
    assert.ok(createRequest, 'document create request must be sent');
    assert.equal(JSON.parse(createRequest.options.body).title, 'Mock');
    const deleteRequest = requests.find(function (request) {
        return request.url.endsWith('/documents/doc_mock?expectedVersion=2');
    });
    assert.ok(deleteRequest, 'document delete request must include expectedVersion');
    assert.equal(deleteRequest.options.headers['X-MDViewer-Session'], 'test-session');

    const conflictAdapter = new global.MDPSqliteApiAdapter({
        baseUrl: '/api/sqlite',
        fetchImpl: async function () {
            return {
                ok: false,
                status: 409,
                async json() {
                    return {
                        ok: false,
                        error: {
                            code: 'VERSION_CONFLICT',
                            message: 'conflict',
                            details: { currentVersion: 7 }
                        },
                        requestId: 'request-conflict'
                    };
                }
            };
        }
    });
    conflictAdapter.sessionToken = 'test-session';
    await assert.rejects(
        conflictAdapter.updateDocument('doc_mock', { expectedVersion: 2 }),
        function (error) {
            return error
                && error.code === 'VERSION_CONFLICT'
                && error.status === 409
                && error.details.currentVersion === 7
                && error.requestId === 'request-conflict';
        }
    );

    let refreshedSessionCalls = 0;
    let refreshedMutationCalls = 0;
    const restartAdapter = new global.MDPSqliteApiAdapter({
        baseUrl: '/api/sqlite',
        fetchImpl: async function (url, options) {
            if (String(url).endsWith('/session')) {
                refreshedSessionCalls += 1;
                return {
                    ok: true,
                    status: 200,
                    async json() { return { ok: true, data: { token: 'new-session' } }; }
                };
            }
            refreshedMutationCalls += 1;
            const accepted = options.headers['X-MDViewer-Session'] === 'new-session';
            return {
                ok: accepted,
                status: accepted ? 200 : 403,
                async json() {
                    return accepted
                        ? { ok: true, data: { id: 'doc_mock', version: 3 } }
                        : { ok: false, error: { code: 'FORBIDDEN', message: 'old session' } };
                }
            };
        }
    });
    restartAdapter.sessionToken = 'old-session';
    const restartedUpdate = await restartAdapter.updateDocument('doc_mock', { expectedVersion: 2 });
    assert.equal(restartedUpdate.version, 3);
    assert.equal(refreshedSessionCalls, 1, 'server restart must refresh the session once');
    assert.equal(refreshedMutationCalls, 2, 'failed mutation must be retried only once');
    console.log('Storage service tests passed.');
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

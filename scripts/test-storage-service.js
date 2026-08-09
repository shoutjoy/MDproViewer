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
    migration: true,
    migrationPreview: true,
    onlineBackup: true,
    explorer: false,
    backupExplorer: false,
    workFiles: false,
    fmaPreview: false,
    backup: true,
    backupPackage: true,
    restorePreview: true,
    restore: true,
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
    if (pathname.endsWith('/backups/packages/mdviewer_1785985000000_aaaaaaaaaaaa.mdpbackup') && method === 'GET') {
        assert.equal(options.headers['X-MDViewer-Session'], 'test-session');
        return {
            ok: true,
            status: 200,
            headers: {
                get(name) {
                    return String(name).toLowerCase() === 'content-disposition'
                        ? 'attachment; filename="mdviewer_1785985000000_aaaaaaaaaaaa.mdpbackup"'
                        : null;
                }
            },
            async blob() { return new Blob(['PK-backup']); }
        };
    }
    if (pathname.endsWith('/explorer/files/file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/fma-thumbnail/image-1') && method === 'GET') {
        assert.equal(options.headers['X-MDViewer-Session'], 'test-session');
        return {
            ok: true,
            status: 200,
            async blob() { return new Blob(['thumbnail']); }
        };
    }
    if (pathname.endsWith('/workfiles/file_scholar_test/download') && method === 'GET') {
        assert.equal(options.headers['X-MDViewer-Session'], 'test-session');
        return {
            ok: true,
            status: 200,
            async blob() { return new Blob(['# References\n\nTest (2026).']); }
        };
    }
    let data = pathname.endsWith('/session')
        ? { token: 'test-session', capabilities }
        : pathname.endsWith('/health')
            ? { available: true, schemaVersion: 3, journalMode: 'wal', capabilities }
            : { ok: true };
    if (pathname.endsWith('/documents/doc_retry') && method === 'GET') data = { ...retryDocument };
    if (pathname.endsWith('/documents/doc_retry/versions') && method === 'GET') data = { items: [] };
    if (pathname.endsWith('/explorer/files/legacy_file_test') && method === 'GET') data = {
        id: 'legacy_file_test', entryType: 'file', path: 'docs/test.md', content: 'file body'
    };
    if (pathname.endsWith('/explorer/files/file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/fma-preview') && method === 'GET') data = {
        kind: 'fma',
        counts: { galleryItems: 2, uniqueMedia: 2, images: 1, videos: 1 },
        mimeCounts: { 'image/png': 1, 'video/webm': 1 },
        gallery: [{ mediaId: 'image-1', previewAvailable: true }]
    };
    if (pathname.endsWith('/explorer/backups/backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') && method === 'GET') data = {
        id: 'backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        readOnly: true,
        sensitiveValuesIncluded: false,
        integrity: ['ok'],
        counts: { documents: 1, settings: 1 },
        documents: [{ id: 'doc_retry', title: 'Retry' }],
        settings: [{ key: 'sitesVisible', valueType: 'boolean' }]
    };
    if (pathname.endsWith('/explorer/backups/backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') && method === 'DELETE') data = {
        id: 'backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        deleted: true,
        recoverable: true,
        trashPath: 'LocalSave_sqlite/data/backups/trash/test.sqlite'
    };
    if ((pathname.includes('/explorer?') || pathname.endsWith('/explorer')) && method === 'GET') data = {
        readOnly: true,
        counts: { documents: 1, folders: 1, versions: 1, backups: 0, migrationCheckpoints: 0 },
        database: { path: 'LocalSave_sqlite/data/mdpro.sqlite', schemaVersion: 3, journalMode: 'wal' },
        documents: [{ id: 'doc_retry', title: 'Retry', version: 1 }],
        folders: [],
        backups: [],
        migrationCheckpoints: []
    };
    if (pathname.includes('/settings/resolved') && method === 'GET') data = {
        precedence: ['global', 'profile', 'workspace', 'feature', 'document'],
        values: { sitesVisible: true, githubRepo: 'owner/repo' },
        items: []
    };
    if ((pathname.includes('/settings?') || pathname.endsWith('/settings')) && method === 'GET') {
        data = { items: [{ key: 'sitesVisible', value: true, scopeType: 'global' }] };
    }
    if (pathname.endsWith('/settings') && method === 'PUT') data = JSON.parse(options.body);
    if (pathname.endsWith('/workfiles') && method === 'POST') data = {
        id: 'file_scholar_test', appId: 'scholarref', workType: 'scholar_references_md',
        name: 'scholar_references.md', mimeType: 'text/markdown', sizeBytes: 26
    };
    if (pathname.includes('/workfiles?') && method === 'GET') data = {
        items: [{
            id: 'file_scholar_test', appId: 'scholarref', workType: 'scholar_references_md',
            name: 'scholar_references.md', mimeType: 'text/markdown', sizeBytes: 26
        }]
    };
    if (pathname.endsWith('/backups/packages') && method === 'POST') data = {
        fileName: 'mdviewer_1785985000000_aaaaaaaaaaaa.mdpbackup',
        checksumSha256: 'package-checksum',
        sizeBytes: 9,
        validation: { ok: true },
        manifest: { database: { schemaVersion: 3 }, assets: { count: 0, totalBytes: 0 } }
    };
    if (pathname.endsWith('/backups/packages/validate') && method === 'POST') data = {
        ok: true,
        schemaVersion: 3
    };
    if (pathname.endsWith('/backups/restore/preview') && method === 'POST') data = {
        importId: 'restore_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        originalName: '다른PC.mdpbackup',
        status: 'validated_preview',
        validation: {
            ok: true,
            schemaVersion: 3,
            integrityCheck: ['ok'],
            foreignKeyViolations: 0,
            databaseCounts: { documents: 1, settings: 2 }
        }
    };
    if (pathname.endsWith('/backups/restore/apply') && method === 'POST') data = {
        status: 'applied',
        importId: 'restore_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        reloadRequired: true,
        verification: {
            integrityCheck: ['ok'],
            foreignKeyViolations: 0,
            databaseCounts: { documents: 1, settings: 2 }
        },
        preRestoreBackup: { fileName: 'mdviewer_1785985000001_bbbbbbbbbbbb.mdpbackup' }
    };
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
require(path.join(root, 'js', 'storage', 'indexeddb-migration.js'));

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
        sqliteBackend: 'api',
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

    const inDbAdapter = global.MDPStorage.getActiveAdapter();
    const originalInDbMethods = {
        health: inDbAdapter.health,
        uploadWorkFile: inDbAdapter.uploadWorkFile,
        listWorkFiles: inDbAdapter.listWorkFiles,
        downloadWorkFile: inDbAdapter.downloadWorkFile
    };
    inDbAdapter.health = async function () {
        return { available: true, backend: 'indb', capabilities: { workFiles: true } };
    };
    inDbAdapter.uploadWorkFile = async function (_file, options) {
        return { id: 'work_indb_fallback', name: options.fileName, createdAt: 1 };
    };
    inDbAdapter.listWorkFiles = async function () {
        return { items: [{ id: 'work_indb_fallback', name: 'fallback.md', createdAt: 1 }], total: 1 };
    };
    inDbAdapter.downloadWorkFile = async function () { return new Blob(['inDB fallback']); };

    global.localStorage.setItem(global.MDPStorage.SQLITE_FEATURE_KEY, '0');
    capabilities.workFiles = false;
    const fallbackSaved = await global.MDPStorage.saveScholarSqliteWorkFile(
        new Blob(['fallback']),
        { appId: 'scholarsearch', workType: 'crossref_markdown', fileName: 'fallback.md' }
    );
    assert.equal(fallbackSaved.storageBackend, 'indb', 'unavailable SQLite must fall back to inDB');
    const fallbackItems = await global.MDPStorage.listScholarSqliteWorkFiles({ appId: 'scholarsearch' });
    assert.equal(fallbackItems.items[0].storageBackend, 'indb');
    const fallbackBlob = await global.MDPStorage.loadScholarSqliteWorkFile(fallbackItems.items[0]);
    assert.equal(await fallbackBlob.text(), 'inDB fallback');

    Object.assign(inDbAdapter, originalInDbMethods);
    global.localStorage.setItem(global.MDPStorage.SQLITE_FEATURE_KEY, '1');
    capabilities.workFiles = true;
    const directSqliteArtifacts = await global.MDPStorage.listSqliteWorkFiles({
        appId: 'scholarsearch', workType: 'crossref_markdown', limit: 30
    });
    assert.equal(directSqliteArtifacts.items.length, 1);
    const mergedScholarArtifacts = await global.MDPStorage.listScholarSqliteWorkFiles({
        appId: 'scholarsearch', workType: 'crossref_markdown', limit: 30
    });
    assert.equal(mergedScholarArtifacts.items.length, 1);
    assert.equal(mergedScholarArtifacts.items[0].storageBackend, 'api');
    assert.equal(global.MDPStorage.getStatus().activeMode, 'indb', 'explicit SQLite artifacts must not switch document storage mode');

    capabilities.documents = true;
    capabilities.documentVersions = true;
    capabilities.folders = true;
    capabilities.search = true;
    capabilities.explorer = true;
    capabilities.backupExplorer = true;
    capabilities.fmaPreview = true;
    capabilities.workFiles = true;
    capabilities.settings = true;
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
    const explorer = await global.MDPStorage.getSqliteExplorerSnapshot({ query: 'HTTP', limit: 25 });
    assert.equal(explorer.readOnly, true);
    await global.MDPStorage.getSqliteExplorerDocument('doc_retry');
    await global.MDPStorage.listSqliteExplorerDocumentVersions('doc_retry');
    const explorerFile = await global.MDPStorage.getSqliteExplorerFileEntry('legacy_file_test');
    assert.equal(explorerFile.content, 'file body');
    const fmaPreview = await global.MDPStorage.getSqliteExplorerFmaPreview('file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(fmaPreview.counts.images, 1);
    const fmaThumbnail = await global.MDPStorage.getSqliteExplorerFmaThumbnail(
        'file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'image-1'
    );
    assert.equal(fmaThumbnail.size, 9);
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/explorer/files/file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/fma-preview')
            && request.options.headers['X-MDViewer-Session'] === 'test-session';
    }), 'FMA preview summary must use the local session');
    const backupDetail = await global.MDPStorage.getSqliteExplorerBackup('backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(backupDetail.readOnly, true);
    assert.equal(backupDetail.sensitiveValuesIncluded, false);
    const deletedBackup = await global.MDPStorage.deleteSqliteExplorerBackup('backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(deletedBackup.recoverable, true);
    const backupRequests = requests.filter(function (request) {
        return request.url.endsWith('/explorer/backups/backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });
    assert.equal(backupRequests.length, 2);
    assert.equal(backupRequests[0].options.headers['X-MDViewer-Session'], 'test-session');
    assert.equal(backupRequests[1].options.method, 'DELETE');
    assert.equal(backupRequests[1].options.headers['X-MDViewer-Session'], 'test-session');
    assert.deepEqual(JSON.parse(backupRequests[1].options.body), {
        confirmation: 'DELETE_BACKUP:backup_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/explorer?q=HTTP&limit=25');
    }), 'SQLite explorer must use its read-only endpoint');
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/documents/doc_retry/versions');
    }), 'SQLite explorer must load version metadata on document selection');
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/explorer/files/legacy_file_test');
    }), 'SQLite explorer must load file content only on file selection');
    const resolvedSettings = await global.MDPStorage.getResolvedSqliteSettings();
    assert.equal(resolvedSettings.values.githubRepo, 'owner/repo');
    const savedSettings = await global.MDPStorage.saveSqliteSafeSettings({
        sitesVisible: true,
        githubRepo: 'owner/repo',
        templateCustomList: [{ id: 'custom_1', name: '연구 양식', desc: '', content: '# 연구' }],
        sitesList: [{ name: 'Research App', url: 'https://example.com/research/' }],
        shareSites: ['docs', 'custom_research'],
        customShareDestinations: [{ key: 'custom_research', label: 'Research', url: 'https://example.com/share/' }],
        naverBlogId: 'researcher',
        githubToken: 'must-never-reach-api',
        sqliteEnabled: true
    });
    assert.equal(savedSettings.saved, 7);
    const settingWrites = requests.filter(function (request) {
        return request.url.endsWith('/settings') && request.options.method === 'PUT';
    });
    assert.equal(settingWrites.length, 7);
    assert.deepEqual(settingWrites.map(function (request) {
        return JSON.parse(request.options.body).key;
    }).sort(), [
        'customShareDestinations', 'githubRepo', 'naverBlogId', 'shareSites',
        'sitesList', 'sitesVisible', 'templateCustomList'
    ]);
    assert.equal(JSON.stringify(settingWrites).includes('must-never-reach-api'), false);
    const scholarBlob = new Blob(['# References\n\nTest (2026).'], { type: 'text/markdown' });
    const savedWorkFile = await global.MDPStorage.saveSqliteWorkFile(scholarBlob, {
        appId: 'scholarref', workType: 'scholar_references_md', fileName: 'scholar_references.md'
    });
    assert.equal(savedWorkFile.workType, 'scholar_references_md');
    const workFiles = await global.MDPStorage.listSqliteWorkFiles({
        appId: 'scholarref', workType: 'scholar_references_md', limit: 30
    });
    assert.equal(workFiles.items.length, 1);
    const loadedWorkFile = await global.MDPStorage.loadSqliteWorkFile(workFiles.items[0]);
    assert.match(await loadedWorkFile.text(), /References/);
    const workFileUpload = requests.find(function (request) {
        return request.url.endsWith('/workfiles') && request.options.method === 'POST';
    });
    assert.equal(workFileUpload.options.headers['X-MDViewer-Session'], 'test-session');
    assert.equal(workFileUpload.options.headers['X-MDViewer-Work-Type'], 'scholar_references_md');
    const backupPackage = await global.MDPStorage.createBackupPackage();
    assert.equal(backupPackage.validation.ok, true);
    const backupValidation = await global.MDPStorage.validateBackupPackage(backupPackage.fileName);
    assert.equal(backupValidation.schemaVersion, 3);
    const backupDownload = await global.MDPStorage.downloadBackupPackage(backupPackage.fileName);
    assert.equal(backupDownload.fileName, backupPackage.fileName);
    assert.equal(await backupDownload.blob.text(), 'PK-backup');
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/backups/packages') && request.options.method === 'POST';
    }), 'backup package creation must use a protected POST');
    const restoreBlob = new Blob(['PK-restore-preview'], {
        type: 'application/vnd.mdviewer.backup+zip'
    });
    Object.defineProperty(restoreBlob, 'name', { value: '다른PC.mdpbackup' });
    const restorePreview = await global.MDPStorage.previewBackupRestore(restoreBlob);
    assert.equal(restorePreview.status, 'validated_preview');
    assert.equal(restorePreview.validation.databaseCounts.documents, 1);
    const restoreRequest = requests.find(function (request) {
        return request.url.endsWith('/backups/restore/preview');
    });
    assert.ok(restoreRequest, 'restore preview upload request missing');
    assert.equal(restoreRequest.options.method, 'POST');
    assert.equal(restoreRequest.options.body, restoreBlob);
    assert.equal(
        decodeURIComponent(restoreRequest.options.headers['X-MDViewer-Backup-Name']),
        '다른PC.mdpbackup'
    );
    assert.equal(restoreRequest.options.headers['X-MDViewer-Session'], 'test-session');
    const restoreApplied = await global.MDPStorage.applyBackupRestore(
        restorePreview.importId,
        'a'.repeat(64)
    );
    assert.equal(restoreApplied.status, 'applied');
    assert.equal(restoreApplied.verification.integrityCheck[0], 'ok');
    const restoreApplyRequest = requests.find(function (request) {
        return request.url.endsWith('/backups/restore/apply');
    });
    assert.ok(restoreApplyRequest, 'restore apply request missing');
    assert.equal(restoreApplyRequest.options.method, 'POST');
    assert.equal(restoreApplyRequest.options.headers['X-MDViewer-Session'], 'test-session');
    assert.deepEqual(JSON.parse(restoreApplyRequest.options.body), {
        importId: restorePreview.importId,
        expectedPackageChecksumSha256: 'a'.repeat(64),
        confirmation: 'RESTORE_VALIDATED_BACKUP'
    });
    await global.MDPStorage.previewIndexedDbMigration({
        source: { database: 'MarkdownProDB', version: 5 },
        folders: [],
        documents: []
    });
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/migrations/indexeddb/preview')
            && request.options.method === 'POST';
    }), 'migration preview must use the SQLite API even while preserving IndexedDB');
    await global.MDPStorage.applyIndexedDbMigration({
        source: { database: 'MarkdownProDB', version: 5 },
        folders: [],
        documents: [],
        previewFingerprint: 'fingerprint',
        migrationId: 'indb_fingerprint'
    });
    assert.ok(requests.some(function (request) {
        return request.url.endsWith('/migrations/indexeddb/apply')
            && request.options.method === 'POST';
    }), 'migration apply must use the SQLite API with online backup capability');

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

    global.MDPSqliteWasmAdapter = class MDPSqliteWasmAdapter {
        static isSupported() { return true; }
        constructor() {
            this.kind = 'sqlite';
            this.backend = 'wasm-opfs';
        }
        async health() {
            return {
                available: true,
                backend: 'wasm-opfs',
                schemaVersion: 3,
                journalMode: 'delete',
                capabilities: { ...capabilities }
            };
        }
    };
    values.delete(global.MDPStorage.SQLITE_BACKEND_KEY);
    const defaultBackendState = await global.MDPStorage.initialize({
        getIndexedDb: function () { return {}; },
        recoveryBuffer: recoveryBuffer
    });
    assert.equal(defaultBackendState.sqliteBackendPreference, 'wasm');
    assert.equal(defaultBackendState.sqliteBackend, 'wasm-opfs');
    assert.equal(global.MDPStorage.DEFAULT_SQLITE_BACKEND, 'wasm');

    const switchState = await global.MDPStorage.initialize({
        getIndexedDb: function () { return {}; },
        sqliteBackend: 'wasm',
        recoveryBuffer: recoveryBuffer,
        fetchImpl: async function () { throw new Error('API offline'); }
    });
    assert.equal(switchState.sqliteBackendPreference, 'wasm');
    await global.MDPStorage.requestMode('sqlite');

    const unavailableApiState = await global.MDPStorage.requestSqliteBackend('api');
    assert.equal(unavailableApiState.sqliteBackendPreference, 'api', 'an unavailable backend selection must be retained');
    assert.equal(unavailableApiState.sqliteBackend, 'api', 'the selected adapter must replace the previous adapter');
    assert.equal(unavailableApiState.sqliteHealth, null);
    assert.equal(unavailableApiState.activeMode, 'indb', 'offline backend switching must safely fall back to IndexedDB');
    assert.equal(values.get(global.MDPStorage.SQLITE_BACKEND_KEY), 'api');

    const wasmSwitchState = await global.MDPStorage.requestSqliteBackend('wasm');
    assert.equal(wasmSwitchState.sqliteBackendPreference, 'wasm');
    assert.equal(wasmSwitchState.sqliteBackend, 'wasm-opfs');
    assert.equal(wasmSwitchState.sqliteHealth.available, true);

    const autoSwitchState = await global.MDPStorage.requestSqliteBackend('auto');
    assert.equal(autoSwitchState.sqliteBackendPreference, 'auto');
    assert.equal(autoSwitchState.sqliteBackend, 'wasm-opfs', 'auto must fall back from an offline API to WASM');
    assert.equal(autoSwitchState.sqliteHealth.available, true);
    assert.equal(values.get(global.MDPStorage.SQLITE_BACKEND_KEY), 'auto');

    const invalidSwitchState = await global.MDPStorage.requestSqliteBackend('invalid-backend');
    assert.equal(invalidSwitchState.sqliteBackendPreference, 'wasm');
    assert.equal(invalidSwitchState.sqliteBackend, 'wasm-opfs');
    assert.equal(values.get(global.MDPStorage.SQLITE_BACKEND_KEY), 'wasm');
    console.log('Storage service tests passed.');
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

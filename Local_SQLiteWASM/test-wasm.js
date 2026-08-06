(async function () {
    'use strict';

    const output = document.getElementById('result');
    const checks = [];
    const token = Date.now().toString(36);
    const folderId = 'folder_wasm_test_' + token;
    const documentId = 'doc_wasm_test_' + token;
    const migratedFolderId = 'folder_wasm_migration_' + token;
    const migratedChildFolderId = 'folder_wasm_migration_child_' + token;
    const migratedDocumentId = 'doc_wasm_migration_' + token;

    function assert(condition, message) {
        if (!condition) throw new Error(message);
        checks.push(message);
    }

    async function checksum(value) {
        const bytes = new TextEncoder().encode(String(value));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    let adapter = null;
    try {
        adapter = new window.MDPSqliteWasmAdapter({
            workerUrl: './sqlite-wasm-worker.js?test=1',
            timeoutMs: 60000
        });

        const health = await adapter.health();
        assert(health.available === true, 'WASM health');
        assert(health.backend === 'wasm-opfs', 'OPFS backend');
        assert(Number(health.schemaVersion) === 3, 'schema version 3');
        assert(Number(String(health.sqliteVersion).split('.')[0]) >= 3, 'SQLite version');
        assert(health.capabilities.search === true, 'FTS5 capability');
        assert(health.capabilities.workFiles === false, 'excluded work files capability');
        assert(health.capabilities.backupPackage === false && health.capabilities.restore === false, 'excluded mdpbackup capability');
        assert(health.capabilities.modelAssets === false && health.capabilities.fmaPreview === false, 'excluded model and FMA capability');
        assert(health.capabilities.imageProxy === false && health.capabilities.staticHosting === false, 'excluded proxy and hosting capability');

        const bootstrap = await adapter.bootstrap();
        assert(bootstrap.rootFolder.id === 'root', 'bootstrap ROOT folder');

        const folder = await adapter.createFolder({ id: folderId, name: 'WASM Test ' + token, parentId: 'root' });
        assert(folder.id === folderId, 'folder create');
        const renamed = await adapter.updateFolder(folderId, { name: 'WASM Renamed ' + token, parentId: 'root' });
        assert(renamed.name.indexOf('Renamed') >= 0, 'folder update');

        const created = await adapter.createDocument({
            id: documentId,
            folderId: folderId,
            title: 'WASM 문서 ' + token,
            content: 'SQLite WASM OPFS 검색 본문 ' + token
        });
        assert(created.version === 1, 'document create and initial version');
        const listed = await adapter.listDocuments({ query: 'WASM 문서', folderId: folderId });
        assert(listed.some(function (item) { return item.id === documentId; }), 'document list and title filter');

        const updated = await adapter.updateDocument(documentId, {
            expectedVersion: 1,
            folderId: folderId,
            title: 'WASM 수정 문서 ' + token,
            content: 'SQLite WASM OPFS 검색 수정 본문 ' + token
        });
        assert(updated.version === 2, 'optimistic document update');

        let conflict = null;
        try {
            await adapter.updateDocument(documentId, { expectedVersion: 1, title: '충돌', content: '충돌' });
        } catch (error) { conflict = error; }
        assert(conflict && conflict.code === 'VERSION_CONFLICT', 'version conflict error contract');

        const versions = await adapter.listDocumentVersions(documentId);
        assert(versions.length === 2 && versions[0].version === 2, 'document version list');

        const search = await adapter.searchDocuments('SQLite WASM', { limit: 20 });
        assert(search.some(function (item) { return item.id === documentId; }), 'FTS5 document search');
        const shortSearch = await adapter.searchDocuments('수정', { limit: 20 });
        assert(shortSearch.some(function (item) { return item.id === documentId; }), 'short LIKE document search');

        const restored = await adapter.restoreDocumentVersion(documentId, 1, 2);
        assert(restored.version === 3 && restored.title.indexOf('WASM 문서') === 0, 'document version restore');

        await adapter.putSetting({ key: 'sitesVisible', value: true, scopeType: 'global', scopeId: '' });
        const settings = await adapter.listSettings({ scopeType: 'global', scopeId: '' });
        assert(settings.some(function (item) { return item.key === 'sitesVisible' && item.value === true; }), 'safe setting storage');
        const resolved = await adapter.getResolvedSettings({});
        assert(resolved.values.sitesVisible === true, 'resolved setting precedence');

        let blockedSetting = null;
        try { await adapter.putSetting({ key: 'apiKey', value: 'secret' }); } catch (error) { blockedSetting = error; }
        assert(blockedSetting && blockedSetting.code === 'SENSITIVE_SETTING_BLOCKED', 'sensitive setting blocked');
        let nestedBlockedSetting = null;
        try {
            await adapter.putSetting({
                key: 'userInfo', value: { profile: { password: 'secret' } },
                scopeType: 'profile', scopeId: 'profile_default'
            });
        } catch (error) { nestedBlockedSetting = error; }
        assert(nestedBlockedSetting && nestedBlockedSetting.code === 'SENSITIVE_NESTED_SETTING_BLOCKED', 'nested sensitive setting blocked');

        const migratedContent = 'IndexedDB migration body ' + token;
        const migrationBatch = {
            source: { database: 'MarkdownProDB', version: 4 },
            folders: [{ id: migratedFolderId, name: 'Migrated ' + token, parentId: 'root', sortOrder: 0 }],
            documents: [{
                id: migratedDocumentId,
                title: 'Migrated document ' + token,
                content: migratedContent,
                folderId: migratedFolderId,
                checksum: await checksum(migratedContent)
            }],
            settings: [{
                key: 'githubBranch', value: 'wasm-' + token,
                scopeType: 'feature', scopeId: 'wasm-test-' + token
            }],
            settingsClassification: { sensitiveKeys: [], transientKeys: [], unknownKeys: [] }
        };
        const preview = await adapter.previewIndexedDbMigration(migrationBatch);
        assert(preview.summary.newCount === 3 && preview.summary.conflictCount === 0, 'IndexedDB migration preview');
        migrationBatch.previewFingerprint = preview.batchFingerprint;
        migrationBatch.migrationId = preview.migrationId;
        const applied = await adapter.applyIndexedDbMigration(migrationBatch);
        assert(applied.status === 'completed' && applied.applied.documents === 1, 'IndexedDB migration apply');
        const migratedDocument = await adapter.getDocument(migratedDocumentId);
        assert(migratedDocument.content === migratedContent, 'IndexedDB migration verification');
        const repeatedPreview = await adapter.previewIndexedDbMigration(migrationBatch);
        assert(repeatedPreview.summary.newCount === 0 && repeatedPreview.summary.duplicateCount === 3, 'IndexedDB migration idempotent preview');
        migrationBatch.previewFingerprint = repeatedPreview.batchFingerprint;
        migrationBatch.migrationId = repeatedPreview.migrationId;
        const repeatedApply = await adapter.applyIndexedDbMigration(migrationBatch);
        assert(repeatedApply.status === 'completed' && repeatedApply.applied.documents === 0, 'IndexedDB migration idempotent apply');

        await adapter.createFolder({ id: migratedChildFolderId, name: 'Migration child ' + token, parentId: migratedFolderId });
        let folderCycle = null;
        try {
            await adapter.updateFolder(migratedFolderId, { parentId: migratedChildFolderId });
        } catch (error) { folderCycle = error; }
        assert(folderCycle && folderCycle.code === 'FOLDER_CYCLE', 'folder cycle protection');
        let rootLocked = null;
        try { await adapter.deleteFolder('root'); } catch (error) { rootLocked = error; }
        assert(rootLocked && rootLocked.code === 'ROOT_FOLDER_LOCKED', 'ROOT folder protection');
        const deletedFolder = await adapter.deleteFolder(migratedFolderId);
        const movedDocument = await adapter.getDocument(migratedDocumentId);
        const foldersAfterDelete = await adapter.listFolders();
        const movedChild = foldersAfterDelete.find(function (item) { return item.id === migratedChildFolderId; });
        assert(deletedFolder.movedDocuments === 1 && movedDocument.folderId === 'root', 'folder delete moves documents to ROOT');
        assert(movedChild && movedChild.parentId === 'root', 'folder delete reparents child folders');

        const integrity = await adapter.integrityCheck();
        assert(integrity.ok === true, 'integrity and foreign key checks');

        const exported = await adapter.exportDatabase();
        assert(exported.blob.size > 0 && exported.fileName.endsWith('.sqlite'), 'SQLite database export');
        const exportHeader = new TextDecoder().decode(new Uint8Array(await exported.blob.slice(0, 16).arrayBuffer()));
        assert(exportHeader === 'SQLite format 3\u0000', 'exported file SQLite header');

        adapter.close();
        adapter = new window.MDPSqliteWasmAdapter({ workerUrl: './sqlite-wasm-worker.js?test=1', timeoutMs: 60000 });
        await adapter.health();
        const persisted = await adapter.getDocument(documentId);
        assert(persisted.version === 3, 'OPFS persistence after Worker restart');
        const deletedDocument = await adapter.deleteDocument(documentId, 3);
        const visibleAfterDelete = await adapter.listDocuments({ query: token });
        assert(deletedDocument.deleted === true && !visibleAfterDelete.some(function (item) { return item.id === documentId; }), 'document soft delete');

        output.dataset.status = 'passed';
        output.textContent = JSON.stringify({
            ok: true,
            checks: checks,
            health: health,
            exportBytes: exported.blob.size
        }, null, 2);
    } catch (error) {
        output.dataset.status = 'failed';
        output.textContent = JSON.stringify({
            ok: false,
            checks: checks,
            error: {
                name: error && error.name,
                code: error && error.code,
                message: error && error.message,
                status: error && error.status,
                details: error && error.details
            }
        }, null, 2);
    } finally {
        if (adapter) adapter.close();
    }
})();

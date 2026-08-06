(async function () {
    'use strict';

    const output = document.getElementById('result');
    const checks = [];
    const productionHealthOnly = new URLSearchParams(window.location.search).get('production-health') === '1';
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

    async function makeFmaBlob() {
        const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
        const mediaBytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
        const mediaId = 'media_' + token;
        const mediaPath = 'media/' + mediaId + '.png';
        const manifest = {
            format: 'fma-archive',
            version: 3,
            timestamp: new Date().toISOString(),
            generator: 'SQLite WASM integration test',
            images: [{
                path: 'sample-' + token + '.png',
                src: { $fmaMedia: mediaId },
                mimeType: 'image/png',
                mediaType: 'image',
                size: mediaBytes.byteLength,
                width: 1,
                height: 1
            }],
            media: {}
        };
        manifest.media[mediaId] = { path: mediaPath, mimeType: 'image/png', size: mediaBytes.byteLength };
        const zip = new JSZip();
        zip.file(mediaPath, mediaBytes, { binary: true, compression: 'STORE' });
        zip.file('manifest.json', JSON.stringify(manifest));
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.fma+zip' });
    }

    let adapter = null;
    try {
        adapter = new window.MDPSqliteWasmAdapter({
            workerUrl: productionHealthOnly ? './sqlite-wasm-worker.js?production-health=1' : './sqlite-wasm-worker.js?test=1',
            timeoutMs: 60000
        });

        const health = await adapter.health();
        assert(health.available === true, 'WASM health');
        assert(health.backend === 'wasm-opfs', 'OPFS backend');
        assert(Number(health.schemaVersion) === 3, 'schema version 3');
        assert(Number(String(health.sqliteVersion).split('.')[0]) >= 3, 'SQLite version');
        assert(health.capabilities.search === true, 'FTS5 capability');
        assert(health.capabilities.explorer === true, 'SQLite explorer capability');
        assert(health.capabilities.databaseImport === true, 'SQLite database import capability');
        assert(health.capabilities.workFiles === true, 'FMA work files capability');
        assert(health.capabilities.backupPackage === false && health.capabilities.restore === false, 'excluded mdpbackup capability');
        assert(health.capabilities.modelAssets === false && health.capabilities.fmaPreview === true, 'FMA preview without model assets');
        assert(health.capabilities.imageProxy === false && health.capabilities.staticHosting === false, 'excluded proxy and hosting capability');
        if (productionHealthOnly) {
            output.dataset.status = 'passed';
            output.textContent = JSON.stringify({ ok: true, checks: checks, health: health }, null, 2);
            return;
        }

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
        const aiCatalog = {
            version: 1,
            updatedAt: new Date().toISOString(),
            tools: [{
                id: 'scholarAI', label: 'ScholarAI', enabled: true,
                provider: 'lmstudio', model: 'local-' + token,
                prompt: 'SQLite AI prompt ' + token, endpoint: 'http://127.0.0.1:5678/v1',
                options: {
                    tonePreset: 'researcher',
                    models: { lmstudio: 'local-' + token },
                    lmStudio: { baseUrl: 'http://127.0.0.1:5678/v1', model: 'local-' + token, outputLimit: 8192 }
                },
                protection: { configured: false, locked: false, last4: '' }
            }]
        };
        await adapter.putSetting({
            key: 'toolSettingsCatalog', value: aiCatalog,
            scopeType: 'profile', scopeId: 'profile_default'
        });
        const profileSettings = await adapter.listSettings({ scopeType: 'profile', scopeId: 'profile_default' });
        const storedAiCatalog = profileSettings.find(function (item) { return item.key === 'toolSettingsCatalog'; });
        assert(storedAiCatalog && storedAiCatalog.value.tools[0].prompt.indexOf(token) >= 0, 'AI tool settings catalog storage');
        const addressSettings = [
            { key: 'sitesList', value: [{ name: 'Research ' + token, url: 'https://example.com/sites/' + token }] },
            { key: 'shareSites', value: ['docs', 'custom_' + token] },
            { key: 'customShareDestinations', value: [{ key: 'custom_' + token, label: 'Share ' + token, url: 'https://example.com/share/' + token }] }
        ];
        for (let addressIndex = 0; addressIndex < addressSettings.length; addressIndex++) {
            await adapter.putSetting(Object.assign({}, addressSettings[addressIndex], {
                scopeType: 'workspace', scopeId: 'workspace_default'
            }));
        }
        const workspaceSettings = await adapter.listSettings({ scopeType: 'workspace', scopeId: 'workspace_default' });
        assert(workspaceSettings.some(function (item) {
            return item.key === 'sitesList' && item.value[0].url.indexOf(token) >= 0;
        }), 'Sites address list storage');
        assert(workspaceSettings.some(function (item) {
            return item.key === 'customShareDestinations' && item.value[0].url.indexOf(token) >= 0;
        }), 'custom Share address storage');

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
        let catalogSecretBlocked = null;
        try {
            await adapter.putSetting({
                key: 'toolSettingsCatalog',
                value: Object.assign({}, aiCatalog, { tools: [Object.assign({}, aiCatalog.tools[0], { options: { apiKey: 'secret' } })] }),
                scopeType: 'profile', scopeId: 'profile_default'
            });
        } catch (error) { catalogSecretBlocked = error; }
        assert(catalogSecretBlocked && catalogSecretBlocked.code === 'SENSITIVE_NESTED_SETTING_BLOCKED', 'AI catalog secret field blocked');

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

        const fmaBlob = await makeFmaBlob();
        const fmaName = 'gallery-' + token + '.fma';
        const savedFma = await adapter.uploadWorkFile(fmaBlob, {
            fileName: fmaName, workType: 'fma', appId: 'fmaviewer'
        });
        assert(savedFma.workType === 'fma' && savedFma.sizeBytes === fmaBlob.size, 'FMA archive saved as SQLite BLOB');
        const savedWebpFma = await adapter.uploadWorkFile(fmaBlob, {
            fileName: 'gallery-webp-' + token + '.fma', workType: 'fma_webp', appId: 'fmaviewer'
        });
        assert(savedWebpFma.workType === 'fma_webp' && savedWebpFma.deduplicatedAsset === true, 'WebP FMA work type and asset deduplication');
        const workFiles = await adapter.listWorkFiles({ appId: 'fmaviewer', query: token, limit: 20 });
        assert(workFiles.items.length >= 2 && workFiles.items.some(function (item) {
            return item.id === savedFma.id && item.workType === 'fma';
        }), 'FMA work-file list');
        const fmaEntry = await adapter.getExplorerFileEntry(savedFma.id);
        assert(fmaEntry.extension === 'fma' && fmaEntry.workType === 'fma', 'FMA SQLite explorer file detail');
        const fmaPreview = await adapter.getExplorerFmaPreview(savedFma.id);
        assert(fmaPreview.counts.galleryItems === 1 && fmaPreview.gallery[0].previewAvailable === true, 'FMA manifest gallery summary');
        const fmaThumbnail = await adapter.getExplorerFmaThumbnail(savedFma.id, fmaPreview.gallery[0].mediaId);
        assert(fmaThumbnail instanceof Blob && fmaThumbnail.size > 0, 'FMA gallery thumbnail');
        const downloadedFma = await adapter.downloadWorkFile(workFiles.items.find(function (item) { return item.id === savedFma.id; }));
        assert(downloadedFma.size === fmaBlob.size, 'FMA SQLite BLOB download');

        const scholarMarkdownText = '# Crossref 학술검색 결과\n\n검색: ' + token + '\n';
        const scholarMarkdownBlob = new Blob([scholarMarkdownText], { type: 'text/markdown' });
        const savedScholarMarkdown = await adapter.uploadWorkFile(scholarMarkdownBlob, {
            fileName: 'crossref-' + token + '.md', workType: 'crossref_markdown', appId: 'scholarsearch'
        });
        const scholarFiles = await adapter.listWorkFiles({
            appId: 'scholarsearch', workType: 'crossref_markdown', query: token, limit: 20
        });
        const scholarItem = scholarFiles.items.find(function (item) { return item.id === savedScholarMarkdown.id; });
        assert(scholarItem && scholarItem.extension === 'md', 'Scholar Markdown work-file list');
        const downloadedScholarMarkdown = await adapter.downloadWorkFile(scholarItem);
        assert(await downloadedScholarMarkdown.text() === scholarMarkdownText, 'Scholar Markdown SQLite BLOB download');

        const explorer = await adapter.getExplorerSnapshot({ query: token, limit: 300 });
        assert(explorer.readOnly === true && explorer.database.path.indexOf('OPFS:') === 0, 'SQLite explorer read-only snapshot');
        assert(explorer.documents.some(function (item) { return item.id === documentId; })
            && explorer.folders.some(function (item) { return item.id === folderId; }), 'SQLite explorer document and folder lists');
        assert(explorer.settings.some(function (item) { return item.key === 'githubBranch'; })
            && explorer.migrationCheckpoints.length > 0, 'SQLite explorer settings and migration history');
        assert(explorer.fileEntries.some(function (item) { return item.id === savedFma.id; })
            && explorer.sources.some(function (item) { return item.id === 'source_sqlite_workfiles_fmaviewer'; }), 'SQLite explorer FMA source and files');
        assert(explorer.fileEntries.some(function (item) { return item.id === savedScholarMarkdown.id && item.workType === 'crossref_markdown'; })
            && explorer.sources.some(function (item) { return item.id === 'source_sqlite_workfiles_scholarsearch'; }), 'SQLite explorer scholar source and files');
        const explorerDocument = await adapter.getExplorerDocument(documentId);
        const explorerVersions = await adapter.listExplorerDocumentVersions(documentId);
        assert(explorerDocument.content.indexOf(token) >= 0 && explorerVersions.length === 3, 'SQLite explorer document detail and versions');

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

        const exportStartedAt = new Date();
        const exported = await adapter.exportDatabase();
        const expectedExportName = 'mdpro' + String(exportStartedAt.getFullYear())
            + String(exportStartedAt.getMonth() + 1).padStart(2, '0')
            + String(exportStartedAt.getDate()).padStart(2, '0') + '.sqlite';
        assert(exported.blob.size > 0 && exported.fileName === expectedExportName, 'dated SQLite database export');
        const exportHeader = new TextDecoder().decode(new Uint8Array(await exported.blob.slice(0, 16).arrayBuffer()));
        assert(exportHeader === 'SQLite format 3\u0000', 'exported file SQLite header');

        adapter.close();
        adapter = new window.MDPSqliteWasmAdapter({ workerUrl: './sqlite-wasm-worker.js?test=1', timeoutMs: 60000 });
        await adapter.health();
        const persisted = await adapter.getDocument(documentId);
        assert(persisted.version === 3, 'OPFS persistence after Worker restart');
        const persistedProfileSettings = await adapter.listSettings({ scopeType: 'profile', scopeId: 'profile_default' });
        const persistedAiCatalog = persistedProfileSettings.find(function (item) { return item.key === 'toolSettingsCatalog'; });
        assert(persistedAiCatalog && persistedAiCatalog.value.tools[0].model === 'local-' + token, 'AI settings persistence after Worker restart');
        const persistedWorkspaceSettings = await adapter.listSettings({ scopeType: 'workspace', scopeId: 'workspace_default' });
        assert(persistedWorkspaceSettings.some(function (item) {
            return item.key === 'sitesList' && item.value[0].name === 'Research ' + token;
        }) && persistedWorkspaceSettings.some(function (item) {
            return item.key === 'customShareDestinations' && item.value[0].key === 'custom_' + token;
        }), 'Sites and Share addresses persist after Worker restart');
        const deletedDocument = await adapter.deleteDocument(documentId, 3);
        const visibleAfterDelete = await adapter.listDocuments({ query: token });
        assert(deletedDocument.deleted === true && !visibleAfterDelete.some(function (item) { return item.id === documentId; }), 'document soft delete');

        const imported = await adapter.importDatabase(exported.blob, { fileName: 'roundtrip-' + token + '.sqlite' });
        const restoredByImport = await adapter.getDocument(documentId);
        assert(imported.imported === true && imported.validation.schemaVersion === 3, 'SQLite database import validation and apply');
        assert(imported.backup.path.indexOf('pre-import') >= 0 && restoredByImport.version === 3, 'SQLite database import backup and roundtrip restore');
        let invalidImport = null;
        try {
            await adapter.importDatabase(new Blob([new Uint8Array(512)]), { fileName: 'invalid.sqlite' });
        } catch (error) { invalidImport = error; }
        const preservedAfterInvalidImport = await adapter.getDocument(documentId);
        assert(invalidImport && invalidImport.code === 'DATABASE_IMPORT_HEADER_INVALID'
            && preservedAfterInvalidImport.version === 3, 'invalid SQLite import preserves current database');

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

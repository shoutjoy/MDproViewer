const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

global.window = global;
global.crypto = webcrypto;

const root = path.resolve(__dirname, '..');
require(path.join(root, 'js', 'storage', 'indexeddb-migration.js'));

(async function () {
    const folder = global.MDPIndexedDbMigration.normalizeFolder({
        id: 'folder_a',
        name: ' A ',
        updatedAt: new Date('2026-08-06T00:00:00Z')
    });
    assert.equal(folder.name, 'A');
    assert.equal(folder.parentId, 'root');
    assert.equal(folder.updatedAt, 1785974400000);
    assert.deepEqual(
        global.MDPIndexedDbMigration.normalizeFolder({ id: 'root', name: '루트' }),
        { id: 'root', name: 'ROOT', parentId: null, sortOrder: 0, createdAt: null, updatedAt: null }
    );

    const batch = await global.MDPIndexedDbMigration.buildBatchFromRecords({
        folders: [{ id: 'root', name: 'ROOT' }, { id: 'folder_a', name: 'A' }],
        documents: [{
            id: 'doc_a',
            title: ' 문서 ',
            content: 'abc',
            folderId: 'folder_a',
            updatedAt: '2026-08-06T00:00:00Z'
        }]
    }, 5);
    assert.equal(batch.source.database, 'MarkdownProDB');
    assert.equal(batch.source.version, 5);
    assert.equal(batch.documents[0].title, '문서');
    assert.equal(batch.documents[0].checksum, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(batch.documents[0].updatedAt, 1785974400000);
    assert.equal(Object.prototype.hasOwnProperty.call(batch, 'ai_settings'), false);
    assert.deepEqual(batch.settings, []);

    const classified = global.MDPIndexedDbMigration.classifyAiSettings({
        id: 'ai_settings',
        highlightVisible: true,
        githubRepo: 'owner/repo',
        sitesList: [{ name: 'Research App', url: 'https://example.com/research/' }],
        shareSites: ['docs', 'custom_research'],
        customShareDestinations: [{ key: 'custom_research', label: 'Research', url: 'https://example.com/share/' }],
        naverBlogId: 'researcher',
        userInfo: { name: 'Tester', major: 'Research' },
        apiKey: 'gemini-secret-value',
        githubToken: 'github-secret-value',
        googlePickerApiKey: 'picker-secret-value',
        sqliteEnabled: true,
        githubCacheDocs: [{ content: 'cached' }],
        futureSetting: 'unknown'
    });
    assert.deepEqual(classified.settings.map(function (item) { return item.key; }), [
        'customShareDestinations', 'githubRepo', 'highlightVisible', 'naverBlogId',
        'shareSites', 'sitesList', 'userInfo'
    ]);
    assert.equal(classified.settings.find(function (item) { return item.key === 'sitesList'; }).scopeType, 'workspace');
    assert.equal(classified.settings.find(function (item) { return item.key === 'customShareDestinations'; }).value[0].url, 'https://example.com/share/');
    assert.ok(classified.classification.sensitiveKeys.includes('apiKey'));
    assert.ok(classified.classification.transientKeys.includes('sqliteEnabled'));
    assert.ok(classified.classification.unknownKeys.includes('futureSetting'));
    const classifiedJson = JSON.stringify(classified);
    assert.equal(classifiedJson.includes('gemini-secret-value'), false);
    assert.equal(classifiedJson.includes('github-secret-value'), false);
    assert.equal(classifiedJson.includes('picker-secret-value'), false);

    const fileBatch = await global.MDPIndexedDbMigration.buildBatchFromRecords({
        folders: [],
        documents: [],
        fileDatabaseExists: true,
        fileVersion: 1,
        fileMeta: { folderName: ' 연구 파일 ', fileCount: 1, savedAt: '2026-08-06T00:00:00Z' },
        files: [{ path: '/docs\\note.md', content: '파일 본문', modified: 1785974400000 }]
    }, 5);
    assert.equal(fileBatch.fileSource.id, 'source_mdpro_indb_v1');
    assert.equal(fileBatch.fileSource.name, '연구 파일');
    assert.equal(fileBatch.files[0].path, 'docs/note.md');
    assert.equal(fileBatch.files[0].sizeBytes, new TextEncoder().encode('파일 본문').byteLength);
    assert.equal(fileBatch.files[0].checksum, '04fe962616978d61f69e841d82545f4f0ce4c40eb97a8765a4d2eb1885a83328');

    let transactionStores = [];
    let databaseClosed = false;
    const databaseRecords = {
        MarkdownProDB: {
            version: 5,
            stores: {
                folders: [{ id: 'root', name: 'ROOT' }],
                documents: [{ id: 'doc_read', title: 'Read', content: 'body', folderId: 'root' }],
                ai_settings: {
                    ai_settings: {
                        id: 'ai_settings',
                        sitesVisible: true,
                        githubRepo: 'read-owner/read-repo',
                        githubToken: 'must-not-leave-indexeddb'
                    }
                }
            }
        },
        'mdpro-indb-v1': {
            version: 1,
            stores: {
                files: [{ path: 'docs/read.md', name: 'read.md', ext: 'md', content: 'file body', modified: 1785974400000 }],
                meta: { root: { folderName: 'Read files', fileCount: 1, savedAt: 1785974400000 } }
            },
            keys: { files: ['docs/read.md'] }
        }
    };
    global.indexedDB = {
        open(name) {
            assert.ok(name in databaseRecords, 'unexpected IndexedDB: ' + name);
            const openRequest = {};
            setImmediate(function () {
                const definition = databaseRecords[name];
                const database = {
                    version: definition.version,
                    objectStoreNames: { contains(storeName) { return storeName in definition.stores; } },
                    transaction(storeNames) {
                        transactionStores = storeNames.slice();
                        const transaction = {
                            objectStore(storeName) {
                                return {
                                    getAll() {
                                        const request = {};
                                        setImmediate(function () {
                                            request.result = definition.stores[storeName];
                                            request.onsuccess();
                                        });
                                        return request;
                                    },
                                    getAllKeys() {
                                        const request = {};
                                        setImmediate(function () {
                                            request.result = definition.keys && definition.keys[storeName] || [];
                                            request.onsuccess();
                                        });
                                        return request;
                                    },
                                    get(key) {
                                        const request = {};
                                        setImmediate(function () {
                                            request.result = definition.stores[storeName] && definition.stores[storeName][key];
                                            request.onsuccess();
                                        });
                                        return request;
                                    }
                                };
                            }
                        };
                        setImmediate(function () { transaction.oncomplete(); });
                        return transaction;
                    },
                    close() { databaseClosed = true; }
                };
                openRequest.result = database;
                openRequest.onsuccess();
            });
            return openRequest;
        }
    };
    const readBatch = await global.MDPIndexedDbMigration.readSourceBatch();
    assert.deepEqual(transactionStores, ['files', 'meta']);
    assert.equal(readBatch.documents[0].id, 'doc_read');
    assert.equal(readBatch.files[0].path, 'docs/read.md');
    assert.equal(readBatch.fileSource.name, 'Read files');
    assert.deepEqual(readBatch.settings.map(function (item) { return item.key; }), ['githubRepo', 'sitesVisible']);
    assert.equal(JSON.stringify(readBatch).includes('must-not-leave-indexeddb'), false);
    assert.deepEqual(readBatch.settingsClassification.missingSecrets, ['githubToken']);
    assert.equal(databaseClosed, true);

    const populatedIndexedDB = global.indexedDB;
    global.indexedDB = {
        open(name) {
            const request = {};
            setImmediate(function () {
                if (name === 'MarkdownProDB') {
                    request.transaction = { abort() {} };
                    request.onupgradeneeded();
                    request.error = new Error('aborted missing database open');
                    request.onerror();
                    return;
                }
                assert.equal(name, 'mdpro-indb-v1');
                const transaction = {
                    objectStore() {
                        return {
                            getAll() {
                                const child = {};
                                setImmediate(function () { child.result = [{ path: 'only.md', content: 'file only' }]; child.onsuccess(); });
                                return child;
                            },
                            getAllKeys() {
                                const child = {};
                                setImmediate(function () { child.result = ['only.md']; child.onsuccess(); });
                                return child;
                            }
                        };
                    }
                };
                setImmediate(function () { transaction.oncomplete(); });
                request.result = {
                    version: 1,
                    objectStoreNames: { contains(storeName) { return storeName === 'files'; } },
                    transaction() { return transaction; },
                    close() {}
                };
                request.onsuccess();
            });
            return request;
        }
    };
    const fileOnlyBatch = await global.MDPIndexedDbMigration.readSourceBatch();
    assert.equal(fileOnlyBatch.documents.length, 0);
    assert.equal(fileOnlyBatch.files[0].path, 'only.md');
    global.indexedDB = populatedIndexedDB;

    let previewBatch = null;
    let applyBatch = null;
    global.MDPStorage = {
        async previewIndexedDbMigration(candidate) {
            previewBatch = candidate;
            return {
                batchFingerprint: 'fingerprint-test',
                migrationId: 'indb_fingerprint_test',
                summary: { newCount: 1, conflictCount: 0, excludedCount: 0 }
            };
        },
        async applyIndexedDbMigration(candidate) {
            applyBatch = candidate;
            return { status: 'completed', sourcePreserved: true };
        }
    };
    await global.MDPIndexedDbMigration.preview();
    assert.equal(previewBatch.documents[0].id, 'doc_read');
    assert.ok(global.MDPIndexedDbMigration.getLastPreview());
    const applyResult = await global.MDPIndexedDbMigration.applyLastPreview();
    assert.equal(applyBatch.previewFingerprint, 'fingerprint-test');
    assert.equal(applyBatch.migrationId, 'indb_fingerprint_test');
    assert.equal(applyBatch.documents[0].id, 'doc_read');
    assert.equal(applyResult.sourcePreserved, true);
    assert.equal(global.MDPIndexedDbMigration.getLastPreview(), null);

    console.log('IndexedDB migration browser batch tests passed.');
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

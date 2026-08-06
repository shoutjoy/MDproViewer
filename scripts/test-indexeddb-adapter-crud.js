const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
require(path.resolve(__dirname, '..', 'js', 'storage', 'indexeddb-adapter.js'));

function requestResult(result) {
    const request = {};
    setImmediate(function () {
        request.result = result;
        if (request.onsuccess) request.onsuccess();
    });
    return request;
}

function createDatabase() {
    const stores = {
        documents: new Map(),
        folders: new Map([['root', { id: 'root', name: 'ROOT', parentId: null }]])
    };
    return {
        stores,
        transaction(storeName, mode) {
            const transaction = {
                objectStore(name) {
                    const store = stores[name];
                    return {
                        getAll() { return requestResult(Array.from(store.values()).map((item) => ({ ...item }))); },
                        get(id) { return requestResult(store.has(String(id)) ? { ...store.get(String(id)) } : undefined); },
                        put(record) {
                            store.set(String(record.id), { ...record });
                            if (mode === 'readwrite') setImmediate(() => transaction.oncomplete && transaction.oncomplete());
                        },
                        delete(id) {
                            store.delete(String(id));
                            if (mode === 'readwrite') setImmediate(() => transaction.oncomplete && transaction.oncomplete());
                        }
                    };
                }
            };
            return transaction;
        }
    };
}

(async function () {
    const database = createDatabase();
    const adapter = new global.MDPIndexedDbAdapter({ getDb: () => database });
    const folder = await adapter.createFolder({ id: 'folder_a', name: '연구', parentId: 'root' });
    assert.equal(folder.parentId, 'root');

    await adapter.createDocument({
        id: 'doc_a', title: '기준 문서', content: '한글 본문과 😀', folderId: 'root',
        createdAt: 1, updatedAt: 1
    });
    assert.equal((await adapter.getDocument('doc_a')).content, '한글 본문과 😀');

    await adapter.updateDocument('doc_a', {
        id: 'doc_a', title: '수정된 기준 문서', content: '수정 본문', folderId: 'root',
        createdAt: 1, updatedAt: 2
    });
    assert.equal((await adapter.getDocument('doc_a')).updatedAt, 2);

    const moving = await adapter.getDocument('doc_a');
    moving.folderId = 'folder_a';
    await adapter.updateDocument('doc_a', moving);
    assert.equal((await adapter.getDocument('doc_a')).folderId, 'folder_a');

    assert.deepEqual((await adapter.searchDocuments('기준')).map((item) => item.id), ['doc_a']);
    assert.equal((await adapter.searchDocuments('수정 본문')).length, 0, 'current IndexedDB search must remain title-only');

    await adapter.deleteDocument('doc_a');
    assert.equal(await adapter.getDocument('doc_a'), null);
    assert.equal((await adapter.listDocuments()).length, 0);
    await adapter.deleteFolder('folder_a');
    assert.deepEqual((await adapter.listFolders()).map((item) => item.id), ['root']);

    console.log('IndexedDB adapter CRUD/title-search baseline tests passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

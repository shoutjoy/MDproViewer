const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
Object.defineProperty(global, 'navigator', { value: { storage: {} }, configurable: true });
global.WebAssembly = global.WebAssembly || {};

const calls = [];
class MockWorker {
    constructor(url) {
        this.url = url;
        this.listeners = new Map();
        this.terminated = false;
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }

    emit(type, data) {
        (this.listeners.get(type) || []).forEach(function (listener) { listener({ data: data }); });
    }

    postMessage(message) {
        calls.push(message);
        queueMicrotask(() => {
            if (message.method === 'health') {
                this.emit('message', { id: message.id, ok: true, result: { available: true, backend: 'wasm-opfs' } });
            } else if (message.method === 'createDocument') {
                this.emit('message', { id: message.id, ok: true, result: Object.assign({ version: 1 }, message.args[0]) });
            } else if (message.method === 'updateDocument') {
                this.emit('message', {
                    id: message.id,
                    ok: false,
                    error: { code: 'VERSION_CONFLICT', message: 'changed', status: 409, details: { currentVersion: 2 } }
                });
            } else if (message.method === 'exportDatabase') {
                this.emit('message', {
                    id: message.id,
                    ok: true,
                    result: { bytes: new Uint8Array([83, 81, 76]), fileName: 'test.sqlite', sizeBytes: 3 }
                });
            } else if (message.method === 'getExplorerSnapshot') {
                this.emit('message', {
                    id: message.id,
                    ok: true,
                    result: { readOnly: true, documents: [], folders: [], settings: [] }
                });
            } else if (message.method === 'importDatabase') {
                this.emit('message', {
                    id: message.id,
                    ok: true,
                    result: { imported: true, fileName: message.args[0].fileName, sizeBytes: message.args[0].bytes.byteLength }
                });
            } else if (message.method === 'uploadWorkFile') {
                this.emit('message', {
                    id: message.id,
                    ok: true,
                    result: {
                        id: 'file_markdown_test',
                        appId: message.args[0].appId,
                        workType: message.args[0].workType,
                        name: message.args[0].fileName,
                        sizeBytes: message.args[0].bytes.byteLength
                    }
                });
            } else {
                this.emit('message', { id: message.id, ok: true, result: null });
            }
        });
    }

    terminate() { this.terminated = true; }
}
global.Worker = MockWorker;

require(path.join(__dirname, '..', 'Local_SQLiteWASM', 'sqlite-wasm-adapter.js'));

(async function () {
    assert.equal(global.MDPSqliteWasmAdapter.isSupported(global), true);
    let worker;
    const adapter = new global.MDPSqliteWasmAdapter({
        workerUrl: '/sqlite-wasm-worker.js',
        workerFactory(url) {
            worker = new MockWorker(url);
            return worker;
        }
    });

    const firstHealth = adapter.health();
    const secondHealth = adapter.health();
    assert.equal(firstHealth, secondHealth, 'health startup must share one promise');
    assert.equal((await firstHealth).backend, 'wasm-opfs');
    assert.equal(worker.url, '/sqlite-wasm-worker.js');

    const created = await adapter.createDocument({ id: 'doc_test', title: 'Test', content: '' });
    assert.equal(created.version, 1);
    assert.deepEqual(calls.at(-1).args, [{ id: 'doc_test', title: 'Test', content: '' }]);

    await assert.rejects(
        adapter.updateDocument('doc_test', { expectedVersion: 1 }),
        function (error) {
            return error.code === 'VERSION_CONFLICT'
                && error.status === 409
                && error.details.currentVersion === 2;
        }
    );

    const exported = await adapter.exportDatabase();
    assert.equal(exported.fileName, 'test.sqlite');
    assert.equal(exported.sizeBytes, 3);
    assert.equal(exported.blob.size, 3);

    const explorer = await adapter.getExplorerSnapshot({ query: 'test' });
    assert.equal(explorer.readOnly, true);
    assert.equal(calls.at(-1).method, 'getExplorerSnapshot');

    const sqliteBytes = new Uint8Array(512);
    const imported = await adapter.importDatabase(new Blob([sqliteBytes]), { fileName: 'roundtrip.sqlite' });
    assert.equal(imported.imported, true);
    assert.equal(imported.fileName, 'roundtrip.sqlite');
    assert.equal(imported.sizeBytes, 512);

    const markdown = new Blob(['# Crossref 결과\n'], { type: 'text/markdown' });
    const savedMarkdown = await adapter.uploadWorkFile(markdown, {
        appId: 'scholarsearch', workType: 'crossref_markdown', fileName: 'crossref.md'
    });
    assert.equal(savedMarkdown.workType, 'crossref_markdown');
    assert.equal(calls.at(-1).args[0].appId, 'scholarsearch');
    assert.equal(calls.at(-1).args[0].validation && Object.keys(calls.at(-1).args[0].validation).length, 0);

    await assert.rejects(adapter.createBackupPackage(), function (error) {
        return error.code === 'SQLITE_WASM_FEATURE_EXCLUDED' && error.status === 501;
    });

    adapter.close();
    assert.equal(worker.terminated, true);
    assert.equal(adapter.worker, null);
    console.log('SQLite WASM adapter RPC tests passed.');
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

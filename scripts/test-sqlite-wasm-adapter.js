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

const assert = require('node:assert/strict');
const path = require('node:path');

global.window = global;
global.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options && options.detail; }
};
global.dispatchEvent = function () {};
global.localStorage = { getItem() { return null; }, setItem() {} };

global.MDPIndexedDbAdapter = class IndexedDbAdapter {
    constructor() { this.kind = 'indb'; }
};

global.MDPSqliteApiAdapter = class ApiAdapter {
    constructor() { this.backend = 'api'; }
    async health() { return { available: true, capabilities: { workFiles: true } }; }
    async uploadWorkFile() { throw new Error('API server does not support crossref_markdown'); }
    async listWorkFiles() { return { items: [] }; }
    async downloadWorkFile() { throw new Error('not found'); }
};

global.MDPSqliteWasmAdapter = class WasmAdapter {
    static isSupported() { return true; }
    constructor() {
        this.backend = 'wasm-opfs';
        this.saved = null;
    }
    async health() { return { available: true, capabilities: { workFiles: true } }; }
    async uploadWorkFile(file, options) {
        this.saved = {
            id: 'wasm-scholar-1',
            name: options.fileName,
            appId: options.appId,
            workType: options.workType,
            sizeBytes: file.size,
            createdAt: Date.now()
        };
        return this.saved;
    }
    async listWorkFiles() { return { items: this.saved ? [this.saved] : [] }; }
    async downloadWorkFile() { return new Blob(['# 브라우저 SQLite 저장 성공']); }
};

require(path.join(__dirname, '..', 'js', 'storage', 'storage-service.js'));

(async function () {
    await global.MDPStorage.initialize({ getIndexedDb() { return {}; } });
    const saved = await global.MDPStorage.saveScholarSqliteWorkFile(
        new Blob(['# fallback'], { type: 'text/markdown' }),
        { appId: 'scholarsearch', workType: 'crossref_markdown', fileName: 'fallback.md' }
    );
    assert.equal(saved.storageBackend, 'wasm-opfs');
    const listed = await global.MDPStorage.listScholarSqliteWorkFiles({
        appId: 'scholarsearch', workType: 'crossref_markdown', limit: 30
    });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].storageBackend, 'wasm-opfs');
    const loaded = await global.MDPStorage.loadScholarSqliteWorkFile(listed.items[0]);
    assert.match(await loaded.text(), /저장 성공/);
    console.log('Scholar SQLite API-to-WASM fallback tests passed.');
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});

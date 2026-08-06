const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'js', 'Html2pptx', 'jenaEditor', 'js', 'sqliteStorage.js'),
    'utf8'
);
const stored = new Map();
const writes = [];
let importedMpp = null;

class TestFile extends Blob {
    constructor(parts, name, options) {
        super(parts, options);
        this.name = name;
        this.lastModified = Number(options && options.lastModified || 0);
    }
}

const context = {
    Blob,
    File: TestFile,
    console,
    setTimeout(callback) { callback(); },
    alert() {},
    prompt() { return '1'; },
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    localStorage: {
        getItem(key) { return stored.has(key) ? stored.get(key) : null; },
        setItem(key, value) { stored.set(key, String(value)); }
    },
    document: {
        body: { appendChild() {} },
        getElementById() { return null; },
        createElement() { return { click() {}, remove() {} }; }
    },
    MDPStorage: {
        getStatus() { return { activeMode: 'sqlite' }; },
        async saveSqliteWorkFile(blob, options) {
            writes.push({ blob, options });
            return { id: 'file_' + writes.length, ...options, sizeBytes: blob.size };
        },
        async listSqliteWorkFiles() {
            return {
                items: [{
                    id: 'file_open', name: 'saved.mpp', workType: 'genslide_mpp',
                    mimeType: 'application/vnd.genslide.mpp+json', sizeBytes: 130, createdAt: 1
                }]
            };
        },
        async loadSqliteWorkFile() {
            return new Blob([JSON.stringify({
                format: 'genslide-html2pptx-mpp', version: 2, currentIndex: 0,
                slides: [{ html: '<section>loaded</section>' }], images: []
            })], { type: 'application/vnd.genslide.mpp+json' });
        }
    },
    async buildGenSlideMppPayload() {
        return {
            format: 'genslide-html2pptx-mpp', version: 2, exportedAt: '2026-08-06T00:00:00.000Z',
            currentIndex: 0, slides: [{ html: '<section>runtime</section>' }], images: []
        };
    },
    async importMpp(file) { importedMpp = file; },
    async importPptxToGenSlide() {}
};
context.window = context;
context.parent = context;
vm.runInNewContext(source, context, { filename: 'sqliteStorage.js' });

(async function () {
    const saved = await context.GenSlideSqlite.saveCurrentMpp('runtime deck');
    assert.equal(saved.workType, 'genslide_mpp');
    assert.equal(writes[0].options.appId, 'genslide');
    assert.equal(writes[0].options.fileName, 'runtime_deck.mpp');
    assert.equal((await writes[0].blob.text()).includes('runtime'), true);

    assert.equal(await context.GenSlideSqlite.captureExport(
        new Blob(['png']), 'slide.png'
    ), null, 'automatic mirror must be opt-in');
    stored.set('mdviewer_genslide_sqlite_mirror', '1');
    await context.GenSlideSqlite.captureExport(new Blob(['png'], { type: 'image/png' }), 'slide.png');
    assert.equal(writes[1].options.workType, 'genslide_png');

    const opened = await context.GenSlideSqlite.openFromSqlite();
    assert.equal(opened.workType, 'genslide_mpp');
    assert.equal(importedMpp.name, 'saved.mpp');
    assert.match(await importedMpp.text(), /loaded/);

    console.log('GenSlide SQLite runtime adapter tests passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

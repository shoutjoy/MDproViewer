const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const functionStart = app.indexOf('async function saveCurrentLocalFile()');
const functionEnd = app.indexOf('function registerPreviewInternalObjectUrl', functionStart);

assert.ok(functionStart >= 0 && functionEnd > functionStart, 'Local write-back function source is missing');
const functionSource = app.slice(functionStart, functionEnd);

test('Local 문서는 저장 버튼으로 열었던 파일 핸들에 덮어쓴다', async () => {
    const writes = [];
    const toasts = [];
    let closed = false;
    let persisted = false;
    const handle = {
        async queryPermission(options) {
            assert.equal(options && options.mode, 'readwrite');
            return 'granted';
        },
        async createWritable() {
            return {
                async write(value) { writes.push(value); },
                async close() { closed = true; }
            };
        },
        async getFile() { return { lastModified: 1234 }; }
    };
    const context = vm.createContext({
        currentLocalFileRef: { handle, path: 'notes/example.md', source: 'local-folder' },
        currentMarkdown: 'editor value',
        currentFileName: 'example.md',
        currentFileMetadata: null,
        syncCurrentMarkdownFromEditor() {},
        updateCurrentDocumentDisplay() {},
        markPersistedState() { persisted = true; },
        showToast(message) { toasts.push(message); },
        Date
    });
    vm.runInContext(functionSource, context);

    const saved = await context.saveCurrentLocalFile();

    assert.equal(saved, true);
    assert.deepEqual(writes, ['editor value']);
    assert.equal(closed, true);
    assert.equal(persisted, true);
    assert.match(toasts[0], /notes\/example\.md/);
});

test('쓰기 핸들이 없는 폴더 폴백은 다른 저장소로 잘못 저장하지 않는다', async () => {
    const toasts = [];
    const context = vm.createContext({
        currentLocalFileRef: { handle: null, path: 'fallback.md', source: 'local-folder' },
        currentMarkdown: 'value',
        currentFileName: 'fallback.md',
        currentFileMetadata: null,
        syncCurrentMarkdownFromEditor() { throw new Error('must not save elsewhere'); },
        updateCurrentDocumentDisplay() {},
        markPersistedState() {},
        showToast(message) { toasts.push(message); },
        Date
    });
    vm.runInContext(functionSource, context);

    const saved = await context.saveCurrentLocalFile();

    assert.equal(saved, false);
    assert.match(toasts[0], /Chrome 또는 Edge/);
});

test('Local DOCX 원본에는 Markdown 문자열이 아니라 다시 생성한 DOCX Blob을 쓴다', async () => {
    const docxBlob = { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    const writes = [];
    const handle = {
        name: 'source.docx',
        async queryPermission() { return 'granted'; },
        async createWritable() {
            return {
                async write(value) { writes.push(value); },
                async close() {}
            };
        },
        async getFile() { return { lastModified: 5678 }; }
    };
    const context = vm.createContext({
        currentLocalFileRef: { handle, path: 'notes/source.docx', source: 'local-folder' },
        currentMarkdown: '<h1>edited</h1>',
        currentFileName: 'source.docx',
        currentFileMetadata: null,
        syncCurrentMarkdownFromEditor() {},
        async createCurrentDocumentDocxBlob() { return docxBlob; },
        updateCurrentDocumentDisplay() {},
        markPersistedState() {},
        showToast() {},
        Date
    });
    vm.runInContext(functionSource, context);

    const saved = await context.saveCurrentLocalFile();

    assert.equal(saved, true);
    assert.equal(writes[0], docxBlob);
});

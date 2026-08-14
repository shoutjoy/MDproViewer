const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const controller = read('js/Html2pptx/jenaEditor/js/controller.js');
const appIndex = read('index.html');
const editorIndex = read('js/Html2pptx/jenaEditor/index.html');
const header = read('js/Html2pptx/jenaEditor/ui/header.html');
const sqlite = read('js/Html2pptx/jenaEditor/js/sqliteStorage.js');
const main = read('js/Html2pptx/jenaEditor/js/main.js');
const mpp = read('js/Html2pptx/jenaEditor/js/Export/mppExport.js');
const image = read('js/Html2pptx/jenaEditor/js/Export/imageExport.js');
const pptx = read('js/Html2pptx/jenaEditor/js/Export/pptExport.js');
const server = read('LocalSave_sqlite/server/work_files.py');

for (const source of [controller, header]) {
    for (const id of ['btnSqliteSave', 'btnSqliteOpen', 'btnSqliteMirror']) {
        assert.match(source, new RegExp(id));
    }
}
assert.match(controller, /\.\/js\/sqliteStorage\.js[\s\S]*\.\/js\/main\.js/);
assert.match(controller, /20260815-pptx-import-1/);
assert.match(appIndex, /Html2pptx\/jenaEditor\/index\.html\?v=20260815-pptx-import-1/);
assert.match(editorIndex, /controller\.js\?v=20260815-pptx-import-1/);
for (const token of [
    'saveCurrentMpp', 'openFromSqlite', 'captureCurrentMpp', 'captureImportedFile',
    'captureExport', 'genslide_mpp', 'genslide_pptx', 'genslide_png', 'genslide_image_zip'
]) assert.match(sqlite, new RegExp(token));
assert.match(sqlite, /activeMode !== "sqlite"/);
assert.match(sqlite, /storage\.saveSqliteWorkFile/);
assert.match(sqlite, /storage\.listSqliteWorkFiles/);
assert.match(sqlite, /storage\.loadSqliteWorkFile/);
assert.match(main, /captureCurrentMpp/);
assert.match(main, /captureImportedFile/);
assert.match(mpp, /buildGenSlideMppPayload/);
assert.match(mpp, /captureExport/);
assert.match(image, /captureExport/);
assert.match(pptx, /outputType:\s*"blob"/);
assert.match(pptx, /captureExport/);
for (const type of ['genslide_mpp', 'genslide_pptx', 'genslide_png', 'genslide_image_zip']) {
    assert.match(server, new RegExp('"' + type + '"'));
}

console.log('GenSlide SQLite UI/source contract tests passed.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8');
}

const classification = read('LocalSave_sqlite/MD_VIEWER_APP_SQLITE_ARTIFACT_CLASSIFICATION.md');
const activeReadme = read('js/GenSlide/README.md');
const genState = read('js/Html2pptx/jenaEditor/js/state.js');
const genSave = read('js/Html2pptx/jenaEditor/js/save.js');
const mpp = read('js/Html2pptx/jenaEditor/js/Export/mppExport.js');
const genMain = read('js/Html2pptx/jenaEditor/js/main.js');
const pptxImport = read('js/Html2pptx/jenaEditor/js/Import/pptxImport.js');
const app = read('js/app.js');
const policy = read('LocalSave_sqlite/server/settings_policy.py');
const workFiles = read('LocalSave_sqlite/server/work_files.py');
const scholarRef = read('js/Scholarref/reference/scholarref.js');
const scholarShell = read('js/Scholarref/ui/scholarsearch-shell.js');
const scholarHtml = read('js/Scholarref/scholarsearch-shell.html');

assert.match(activeReadme, /js\/Html2pptx/);
assert.match(genState, /GenSlideDB/);
for (const token of ['saveSlidesToInDb', 'listSavedSlidesFromInDb', 'loadSlidesFromInDbById']) {
    assert.match(genSave, new RegExp(token));
}
assert.match(mpp, /genslide-html2pptx-mpp/);
assert.match(mpp, /async function exportMpp/);
assert.match(mpp, /async function importMpp/);
assert.match(genMain, /exportPptx/);
assert.match(genMain, /exportImage/);
assert.match(pptxImport, /importPptxToGenSlide/);

for (const token of [
    'saveTemplateCustomListToSettings', 'exportSelectedTemplateMd', 'importTemplateMdFile',
    'insertSelectedTemplateToDocument', 'insertSelectedTemplateAsNewFile'
]) assert.match(app, new RegExp(token));
assert.match(app, /saveSqliteSafeSettings/);
assert.match(policy, /"templateCustomList"\s*:\s*SettingRule\("collections",\s*"workspace",\s*\("array",\),\s*4 \* 1024 \* 1024\)/);

for (const token of ['scholar_references_md', 'crossref_markdown', 'MAX_MARKDOWN_BYTES']) {
    assert.match(workFiles, new RegExp(token));
}
for (const token of ['readAllRefs', 'addRefs', 'importMd', 'downloadMd', 'mdproviewer-scholar-references']) {
    assert.match(scholarRef, new RegExp(token));
}
assert.match(scholarRef, /saveSqliteMarkdown/);
assert.match(scholarRef, /loadSqliteMarkdown/);
for (const token of ['saveScholarCrossrefMarkdown', 'saveScholarCrossrefToSqlite', 'loadScholarCrossrefFromSqlite']) {
    assert.match(scholarShell, new RegExp(token));
}
assert.match(scholarHtml, /GitHub 공유[\s\S]*STORAGE 저장[\s\S]*STORAGE 탐색기[\s\S]*inDB 저장[\s\S]*inDB 탐색기/);

for (const heading of ['GenSlide', '사용자 양식', 'Reference management', 'Scholar Crossref', '다음 구현 단위']) {
    assert.match(classification, new RegExp(heading));
}

console.log('SQLite app artifact classification/source contract tests passed.');

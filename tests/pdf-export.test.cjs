const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pdfExport = require('../js/export/pdf-export.js');

test('PDF export is offered immediately after HTML in both dialogs', () => {
  const app = read('js/app.js');
  const extendFiles = read('js/extendFiles/extend-files.js');
  const order = /key:\s*'html'[\s\S]{0,240}key:\s*'pdf'/;
  assert.match(app, order);
  assert.match(extendFiles, order);
  assert.match(app, /pdfExport:\s*'\.\/js\/export\/pdf-export\.js\?v=/);
  assert.match(app, /html2canvas:\s*'\.\/vendor\/html2canvas\/html2canvas\.min\.js\?v=/);
  assert.match(app, /jsPdf:\s*'\.\/vendor\/jspdf\/jspdf\.umd\.min\.js\?v=/);
  assert.match(extendFiles, /pdf'[\s\S]{0,80}tone:\s*'yellow'/);
});

test('PDF export builds self-contained HTML before opening the A4 preview', () => {
  const app = read('js/app.js');
  assert.match(app, /choice === 'pdf'/);
  assert.match(app, /choice === 'pdf'[\s\S]{0,1400}renderMarkdown\(\{ force: true \}\)/);
  assert.match(app, /HtmlExport\.buildExportHtml/);
  assert.match(app, /PdfExport\.openPreview/);
});

test('PDF preview keeps A4 dimensions and exposes automatic/manual pagination and direct download', () => {
  const source = read('js/export/pdf-export.js');
  assert.equal(pdfExport.__test.A4_WIDTH_MM, 210);
  assert.equal(pdfExport.__test.A4_HEIGHT_MM, 297);
  assert.equal(pdfExport.__test.DEFAULT_MARGIN_MM, 15);
  assert.match(source, /splitTableRows/);
  assert.match(source, /splitTextElement/);
  assert.match(source, /manualBreaks/);
  assert.match(source, /manualJoins/);
  assert.match(source, /data-pdf-join disabled>선택 앞에서 붙이기/);
  assert.match(source, /shouldJoinUp[\s\S]{0,500}splitOversized\(element, current\.content\)/);
  assert.match(source, /data-pdf-undo disabled[\s\S]{0,120}Ctrl\+Z/);
  assert.match(source, /undoHistory/);
  assert.match(source, /undoPaginationChange/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /global\.html2canvas\(pageElement/);
  assert.match(source, /new JsPdf\(\{ orientation: 'portrait'/);
  assert.match(source, /pdf\.output\('blob'\)/);
  assert.doesNotMatch(source, /\.print\(\)/);
});

test('PDF filenames are safe and word splitting prefers a nearby boundary', () => {
  assert.equal(pdfExport.__test.sanitizeFileBase('C:\\notes\\report.md'), 'report');
  assert.equal(pdfExport.__test.sanitizeFileBase('bad:name?.pdf'), 'bad_name_');
  assert.equal(pdfExport.__test.findWordBoundary('alpha beta gamma', 11), 11);
});

test('PDF quality has compact, standard, and high presets with a safe default', () => {
  assert.equal(pdfExport.__test.normalizeQuality('compact'), 'compact');
  assert.equal(pdfExport.__test.normalizeQuality('high'), 'high');
  assert.equal(pdfExport.__test.normalizeQuality('unknown'), 'standard');
  assert.ok(pdfExport.__test.QUALITY_PRESETS.compact.scale < pdfExport.__test.QUALITY_PRESETS.standard.scale);
  assert.ok(pdfExport.__test.QUALITY_PRESETS.standard.scale < pdfExport.__test.QUALITY_PRESETS.high.scale);
});

test('PDF edit state is document-scoped in IndexedDB and restored only for the same source structure', () => {
  const source = read('js/export/pdf-export.js');
  const app = read('js/app.js');
  assert.match(source, /PDF_STATE_STORE = 'work_files'/);
  assert.match(source, /PDF_STATE_APP_ID = 'pdf-export'/);
  assert.match(source, /writePdfStateRecord/);
  assert.match(source, /readPdfStateRecord/);
  assert.match(source, /record\.sourceSignature[\s\S]{0,100}state\.sourceSignature/);
  assert.match(source, /편집상태 inDB 저장됨/);
  assert.match(app, /documentKey:\s*getPdfExportDocumentKey\(\)/);
  assert.notEqual(pdfExport.__test.pdfStateRecordId('document:indb:a'), pdfExport.__test.pdfStateRecordId('document:indb:b'));
});

test('selected PDF objects expose persisted line-spacing presets through the pagination undo flow', () => {
  const source = read('js/export/pdf-export.js');
  assert.equal(pdfExport.__test.normalizeLineSpacing('relaxed'), 'relaxed');
  assert.equal(pdfExport.__test.normalizeLineSpacing('invalid'), 'default');
  assert.equal(pdfExport.__test.LINE_SPACING_PRESETS.compact.value, '1.2');
  assert.equal(pdfExport.__test.LINE_SPACING_PRESETS.wide.value, '2');
  assert.match(source, /data-pdf-line-spacing disabled/);
  assert.match(source, /applyObjectLineSpacing/);
  assert.match(source, /objectLineSpacing:\s*Array\.from/);
  assert.match(source, /state\.objectLineSpacing\.set\(state\.selectedIndex, spacing\)/);
  assert.match(source, /queuePdfEditStateSave\(\)/);
});

test('PDF preview edits selected objects with undo and IndexedDB persistence', () => {
  const source = read('js/export/pdf-export.js');
  assert.match(source, /data-pdf-edit disabled>선택 객체 수정/);
  assert.match(source, /data-pdf-edit-surface contenteditable="true"/);
  assert.match(source, /function deserializeEditedUnit/);
  assert.match(source, /objectEdits:\s*Array\.from/);
  assert.match(source, /function applyObjectEditorChange/);
  assert.match(source, /recordPaginationChange\(function \(\) \{[\s\S]{0,400}state\.objectEdits\.set/);
  assert.match(source, /previous\.objectEdits/);
});

test('PDF merger is removed from export choices and exposed as a persisted optional menu tool', () => {
  const app = read('js/app.js');
  const extendFiles = read('js/extendFiles/extend-files.js');
  const preview = read('js/UI_PV/editpv.js');
  const index = read('index.html');
  const migration = read('js/storage/indexeddb-migration.js');
  const wasmPolicy = read('Local_SQLiteWASM/settings-policy.js');
  const pythonPolicy = read('LocalSave_sqlite/server/settings_policy.py');
  const mergeHtml = read('js/export/pdf-merge-window.html');
  const mergeScript = read('js/export/pdf-merge-window.mjs');
  assert.doesNotMatch(app, /key:\s*'pdf_merge'/);
  assert.doesNotMatch(extendFiles, /key:\s*'pdf_merge'/);
  assert.doesNotMatch(preview, /key:\s*'pdf_merge'/);
  assert.match(app, /function openPdfMergeWindow\(\)/);
  assert.match(app, /pdf-merge-window\.html/);
  assert.doesNotMatch(app, /choice === 'pdf_merge'/);
  assert.match(index, /id="pdf-merge-visible"/);
  assert.match(index, /id="btn-pdf-merge"/);
  assert.match(app, /function applyPdfMergeVisibility\(settings\)/);
  assert.match(app, /setAiSettings\(\{ pdfMergeVisible: enabled \}\)/);
  assert.match(app, /showMergeButton:\s*getPdfMergeVisibleFromSettings/);
  assert.match(migration, /pdfMergeVisible: \['features', 'global'\]/);
  assert.match(wasmPolicy, /pdfMergeVisible: \['features', 'global', \['boolean'\], 16\]/);
  assert.match(pythonPolicy, /"pdfMergeVisible": _boolean\(\)/);
  assert.match(mergeHtml, /multiple/);
  assert.match(mergeHtml, /순서대로 병합 및 미리보기/);
  assert.match(mergeHtml, /id="to-pv"[\s\S]{0,160}병합 PDF ToPV/);
  assert.match(mergeScript, /pdfjsLib\.getDocument/);
  assert.match(mergeScript, /moveItem\(from, to\)/);
  assert.match(mergeScript, /page\.render/);
  assert.match(mergeScript, /output\.addPage/);
  assert.match(mergeScript, /output\.output\('blob'\)/);
  assert.match(mergeScript, /const verification = await pdfjsLib\.getDocument/);
  assert.match(mergeScript, /verifiedPages !== outputPages/);
  assert.match(mergeScript, /function showMergedPreview\(pages\)/);
  assert.match(mergeScript, /병합 PDF ' \+ \(index \+ 1\) \+ '쪽/);
  assert.match(mergeScript, /function sendMergedToPv\(\)/);
  assert.match(mergeScript, /parentWindow\.openMergedPdfInPreviewPopup\(mergedBlob, mergedFileName\(\)\)/);
  assert.match(mergeScript, /els\.toPv\.addEventListener\('click', sendMergedToPv\)/);
});

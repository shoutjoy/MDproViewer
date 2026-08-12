const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'js', 'UI_PV', 'editpv.js'), 'utf8');
const imageInsert = fs.readFileSync(path.join(root, 'imageDB', 'image_insert.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('PV provides a Markdown editor toggle and compact formatting toolbar', () => {
  assert.match(preview, /id=\\?"pv-mode-toggle\\?"/);
  assert.match(preview, /previewPopupToggleEditor\(\)/);
  assert.match(preview, /previewPopupFormat\(\\?'bold\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'italic\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'bullet\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'ordered\\?'\)/);
  assert.match(preview, /previewPopupInsertTable\(\)/);
  assert.match(preview, /openPreviewPopupImageInsert\(\)/);
  assert.match(preview, /id=\\?"pv-editor\\?"/);
});

test('PV draft stays separate until it is sent to the original note', () => {
  assert.match(preview, /previewPopupDraftBaseMarkdown/);
  assert.match(preview, /previewPopupDraftDirty/);
  assert.match(preview, /원본 노트에 반영/);
  assert.match(preview, /async function applyPreviewPopupEditsToOriginal/);
  assert.match(preview, /원본 노트가 변경되었습니다/);
  assert.match(preview, /updateContent\(draft\)/);
  assert.match(preview, /performAutoSave\(\{ force: true \}\)/);
});

test('PV export delegates to the same main export entry point', () => {
  assert.match(preview, /async function previewPopupExport/);
  assert.match(preview, /previewPopupExport[\s\S]{0,700}window\.focus\(\)/);
  assert.match(preview, /typeof exportCurrentDocumentByChoice === 'function'/);
  assert.match(preview, /await exportCurrentDocumentByChoice\(\)/);
  assert.match(preview, /openPdfMergeWindow\(\)/);
});

test('main image modal can target the PV editor without requiring main edit mode', () => {
  const routeIndex = imageInsert.indexOf('isPreviewPopupImageInsertTargetActive');
  const editGuardIndex = imageInsert.indexOf("if (!isEditMode)", imageInsert.indexOf('function insertImageFromModal'));
  assert.ok(routeIndex > 0);
  assert.ok(editGuardIndex > routeIndex, 'PV routing must happen before the main-editor edit-mode guard');
  assert.match(imageInsert, /insertImageIntoPreviewPopupEditor\(source, alt, type\)/);
  assert.match(imageInsert, /cancelPreviewPopupImageInsertTarget/);
});

test('zoom, width, and font controls are compact and fixed to the bottom-right', () => {
  assert.match(preview, /#pv-view-controls\{position:fixed;right:10px;bottom:10px/);
  assert.match(preview, /pv-control-name\\?">Zoom/);
  assert.match(preview, /pv-control-name\\?">Width/);
  assert.match(preview, /pv-control-name\\?">Font/);
  assert.match(preview, /\.pv-file-button\{height:24px;padding:1px 6px;font-size:10px/);
});

test('PV editor scripts use a fresh cache key', () => {
  assert.match(index, /image_insert\.js\?v=20260812-pv-editor-1/);
  assert.match(index, /editpv\.js\?v=20260812-pv-editor-2/);
});

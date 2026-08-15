const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'js', 'UI_PV', 'editpv.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const imageInsert = fs.readFileSync(path.join(root, 'imageDB', 'image_insert.js'), 'utf8');
const pvImageInsert = fs.readFileSync(path.join(root, 'js', 'UI_PV', 'pv-image-insert.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function readFunction(source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' function must exist');
  const asyncStart = source.lastIndexOf('async ', start);
  if (asyncStart >= 0 && source.slice(asyncStart + 6, start).trim() === '') start = asyncStart;
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(name + ' function is incomplete');
}

test('PV edits the rendered document directly with a compact formatting toolbar', () => {
  assert.match(preview, /id=\\?"pv-mode-toggle\\?"/);
  assert.match(preview, /previewPopupToggleEditor\(\)/);
  assert.match(preview, /previewPopupFormat\(\\?'bold\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'italic\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'bullet\\?'\)/);
  assert.match(preview, /previewPopupFormat\(\\?'ordered\\?'\)/);
  assert.match(preview, /previewPopupOpenTablePicker\(\)/);
  assert.match(preview, /previewPopupInsertTableAtRowsCols\(rowsInput, colsInput\)/);
  assert.match(preview, /const tableHtml = '<table><thead><tr>'/);
  assert.match(preview, /previewPopupInsertHtmlAtSelection\(tableHtml\)/);
  assert.match(preview, /restorePreviewPopupRenderedSelection\(\);[\s\S]{0,240}editor\.contains\(range\.commonAncestorContainer\)/);
  assert.doesNotMatch(preview, /replacePreviewPopupEditorSelection\(replacement\);[\s\S]{0,160}\uD45C \uC0BD\uC785/);
  assert.match(preview, /onclick=\\?"pvOpenImageInsert\(\)\\?"/);
  assert.match(preview, />렌더 편집<\/button>/);
  assert.match(preview, /editor\.setAttribute\('contenteditable', 'true'\)/);
  assert.match(preview, /PV 렌더링 문서 편집기/);
  assert.match(preview, /previewPopupRenderedHtmlToMarkdown/);
  assert.match(preview, /document\.execCommand\(command, false, value\)/);
  assert.doesNotMatch(preview, /id=\\?"pv-editor\\?"/);
});

test('rendered PV editing converts common rich blocks back to Markdown and protects complex widgets', () => {
  assert.match(preview, /function previewPopupInlineHtmlToMarkdown/);
  assert.match(preview, /function previewPopupBlockHtmlToMarkdown/);
  assert.match(preview, /function previewPopupListHtmlToMarkdown/);
  assert.match(preview, /data-mermaid-original-source/);
  assert.match(preview, /data-internal-id/);
  assert.match(preview, /note-cover-page,.trt-mermaid-wrapper,mjx-container/);
});

test('PV preserves the opened source syntax when rendered edits are saved', () => {
  assert.match(preview, /function getPreviewPopupSourceSyntax/);
  assert.match(readFunction(preview, 'getPreviewPopupSourceSyntax'), /docx\|html\?/);
  assert.match(preview, /function previewPopupRenderedHtmlToHtml/);
  assert.match(preview, /function previewPopupRenderedDomToSource/);
  assert.match(preview, /getPreviewPopupSourceSyntax\(previousSource\) === 'html'/);
  assert.match(preview, /previewPopupRenderedDomToSource\(editor, previous\)/);
  assert.doesNotMatch(
    readFunction(preview, 'previewPopupHandleEditorInput'),
    /previewPopupRenderedHtmlToMarkdown\(editor, previous\)/
  );

  const syntaxFunction = readFunction(preview, 'getPreviewPopupSourceSyntax');
  function detect(fileName, source) {
    return vm.runInNewContext('(' + syntaxFunction + ')', { currentFileName: fileName })(source);
  }
  assert.equal(detect('converted.docx', '<p>Word content</p>'), 'html');
  assert.equal(detect('page.html', '<main>HTML content</main>'), 'html');
  assert.equal(detect('notes.md', '<p>Allowed inline HTML</p>'), 'markdown');
  assert.equal(detect('notes.md', '<!doctype html><html><body>Page</body></html>'), 'html');
  assert.equal(detect('', '<!doctype html><html><body>Page</body></html>'), 'html');
});

test('PV table picker inserts a rendered table matching the main document row and column choice', () => {
  let insertedHtml = '';
  let draftUpdated = false;
  const context = {
    PREVIEW_PV_TABLE_ROWS_MAX: 10,
    PREVIEW_PV_TABLE_COLS_MAX: 10,
    isPreviewPopupAlive: () => true,
    previewPopupEditMode: true,
    previewPopupToggleEditor: () => true,
    previewPopupCloseTablePicker: () => {},
    previewPopupInsertHtmlAtSelection: html => { insertedHtml = html; return true; },
    rememberPreviewPopupRenderedSelection: () => true,
    previewPopupHandleEditorInput: changed => { draftUpdated = changed === true; },
    syncPreviewPopupEditorUi: () => {},
    showToast: () => {}
  };
  const insertTable = vm.runInNewContext(
    '(' + readFunction(preview, 'previewPopupInsertTableAtRowsCols') + ')',
    context
  );

  assert.equal(insertTable(3, 3), true);
  assert.equal((insertedHtml.match(/<th>/g) || []).length, 3);
  assert.equal((insertedHtml.match(/<tr>/g) || []).length, 3);
  assert.equal((insertedHtml.match(/<td><br><\/td>/g) || []).length, 6);
  assert.match(insertedHtml, /^<table><thead><tr><th>Header 1<\/th>/);
  assert.doesNotMatch(insertedHtml, /\|\s*---\s*\|/);
  assert.equal(draftUpdated, true);
});

test('PV table and margin popovers stay outside the horizontally scrolling toolbar', () => {
  assert.match(preview, /#pv-table-picker\{position:fixed/);
  assert.match(preview, /#pv-margin-popover\{position:fixed/);
  assert.match(preview, /id=\\?"pv-table-picker-button\\?"[\s\S]{0,240}previewPopupOpenTablePicker\(\)/);
  assert.match(preview, /id=\\?"pv-margin-button\\?"[\s\S]{0,280}previewPopupOpenMarginDialog\(\)/);
  assert.match(preview, /<\\?\/div>['"]?\s*\+\s*'<div id=\\?"pv-table-picker/);
  assert.match(preview, /previewPopupPositionPopover\(panel, doc\.getElementById\('pv-table-picker-button'\), false\)/);
  assert.match(preview, /previewPopupPositionPopover\(popover, doc\.getElementById\('pv-margin-button'\), true\)/);
  assert.match(preview, /cell\.addEventListener\('mousedown',[\s\S]{0,100}event\.preventDefault\(\)/);
  assert.match(preview, /previewPopupCloseMarginDialog\(\);[\s\S]{0,180}previewPopupEnsureTablePicker\(\)/);
  assert.match(preview, /previewPopupCloseTablePicker\(\);[\s\S]{0,180}previewPopupRefreshMarginControls\(\)/);

  const buildPopupHtml = vm.runInNewContext(
    '(' + readFunction(preview, 'getPreviewPopupDocumentHtml') + ')',
    {
      URL,
      window: { location: { href: 'http://127.0.0.1:8876/index.html' } },
      document: { baseURI: 'http://127.0.0.1:8876/index.html' },
      getPreviewPopupStylesheetLinks: () => '',
      escapePreviewAttribute: value => String(value),
      PREVIEW_PV_A4_WIDTH_MM: 210,
      PREVIEW_PV_A4_HEIGHT_MM: 297,
      PREVIEW_PV_TABLE_PICKER_COLS: 10
    }
  );
  const popupHtml = buildPopupHtml();
  const toolbarStart = popupHtml.indexOf('<div id="pv-toolbar">');
  const toolbarEnd = popupHtml.indexOf('</div>', toolbarStart);
  assert.ok(toolbarStart >= 0 && toolbarEnd > toolbarStart);
  assert.ok(popupHtml.indexOf('<div id="pv-table-picker"') > toolbarEnd);
  assert.ok(popupHtml.indexOf('<div id="pv-margin-popover"') > toolbarEnd);
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

test('ending PV render edit asks whether to apply the draft to the original note', () => {
  assert.match(preview, /async function previewPopupToggleEditor\(\)/);
  assert.match(preview, /confirmWindow\.confirm\('렌더 편집 내용을 원본 노트에 반영할까요\?'\)/);
  assert.match(preview, /if \(shouldApply\) \{[\s\S]{0,220}await applyPreviewPopupEditsToOriginal\(\{ silent: true \}\)/);
  assert.match(preview, /if \(!applied\) return false/);
  assert.match(preview, /previewPopupEditMode = false;[\s\S]{0,180}updatePreviewPopupContent\(\)/);
});

test('PV render edit exit applies on confirmation and keeps the draft separate on rejection', async () => {
  async function runExit(shouldApply) {
    const calls = { applied: 0, updated: 0, handled: 0 };
    const context = {
      isPreviewPopupAlive: () => true,
      previewPopupFileMode: false,
      previewPopupEditMode: true,
      previewPopupRenderedDomChanged: true,
      previewPopupWindow: { confirm: () => shouldApply },
      window: { confirm: () => shouldApply },
      getPreviewPopupEditorElement: () => ({}),
      previewPopupHandleEditorInput: () => { calls.handled += 1; },
      applyPreviewPopupEditsToOriginal: async () => { calls.applied += 1; return true; },
      syncPreviewPopupEditorUi: () => {},
      updatePreviewPopupContent: () => { calls.updated += 1; }
    };
    const toggle = vm.runInNewContext(
      '(' + readFunction(preview, 'previewPopupToggleEditor') + ')',
      context
    );
    const result = await toggle();
    return { calls, result, editMode: context.previewPopupEditMode };
  }

  const accepted = await runExit(true);
  assert.equal(accepted.result, true);
  assert.equal(accepted.calls.applied, 1);
  assert.equal(accepted.editMode, false);

  const rejected = await runExit(false);
  assert.equal(rejected.result, true);
  assert.equal(rejected.calls.applied, 0);
  assert.equal(rejected.calls.updated, 1);
  assert.equal(rejected.editMode, false);
});

test('PV export chooser is mounted inside the PV window before delegating the chosen format', () => {
  assert.match(preview, /async function previewPopupExport/);
  assert.match(preview, /const choice = await choosePreviewPopupExportType\(\)/);
  assert.match(preview, /const doc = previewPopupWindow\.document/);
  assert.match(preview, /overlay\.id = 'pv-export-choice-overlay'/);
  assert.match(preview, /z-index:2147483647/);
  assert.match(preview, /doc\.body\.appendChild\(overlay\)/);
  assert.match(preview, /data\.exportChoice|dataset\.exportChoice/);
  assert.match(preview, /typeof exportCurrentDocumentByChoice === 'function'/);
  assert.match(preview, /await exportCurrentDocumentByChoice\(choice\)/);
  assert.match(app, /async function exportCurrentDocumentByChoice\(requestedChoice\)/);
  assert.match(app, /allowedChoices\.has\(normalizedChoice\)/);
  assert.doesNotMatch(preview, /key:\s*'pdf_merge'/);
});

test('merged PDF can be sent from the merger window to PV', () => {
  assert.match(preview, /function openMergedPdfInPreviewPopup\(blob, fileName\)/);
  assert.match(preview, /new Blob\(\[blob\], \{ type: 'application\/pdf' \}\)/);
  assert.match(preview, /openFileViewerInPreviewPopup\(previewPopupFileObjectUrl, name\)/);
  assert.match(preview, /병합 PDF를 PV에서 열었습니다/);
});

test('PV owns an independent image modal and does not route through the main image modal', () => {
  assert.match(preview, /id=\\?"pv-image-insert-modal\\?"/);
  assert.match(preview, /pv-image-insert\.js\?v=20260815-child-3-resize/);
  assert.match(pvImageInsert, /function pvOpenImageInsert\(\)/);
  assert.match(pvImageInsert, /function insertImage\(outputType\)/);
  assert.match(pvImageInsert, /document\.createElement\('img'\)/);
  assert.match(pvImageInsert, /data-pv-image-output/);
  assert.match(pvImageInsert, /const internalId = parseInternalId\(source\)/);
  assert.match(pvImageInsert, /displaySource = await getInternalDisplayUrl\(internalId\)/);
  assert.match(pvImageInsert, /image\.src = displaySource/);
  assert.match(pvImageInsert, /image\.setAttribute\('data-internal-id', internalId\)/);
  assert.match(pvImageInsert, /image\.addEventListener\('load'/);
  assert.match(pvImageInsert, /schedulePreviewPopupImageResize/);
  assert.match(pvImageInsert, /function readFile\(file\)/);
  assert.match(pvImageInsert, /document\.addEventListener\('paste'/);
  assert.doesNotMatch(preview, /openPreviewPopupImageInsert/);
  assert.doesNotMatch(imageInsert, /isPreviewPopupImageInsertTargetActive|insertImageIntoPreviewPopupEditor|cancelPreviewPopupImageInsertTarget/);
});

test('zoom, width, and font controls are compact and fixed to the bottom-right', () => {
  assert.match(preview, /#pv-view-controls\{position:fixed;right:10px;bottom:10px/);
  assert.match(preview, /pv-control-name\\?">Zoom/);
  assert.match(preview, /pv-control-name\\?">Width/);
  assert.match(preview, /pv-control-name\\?">Font/);
  assert.match(preview, /\.pv-file-button\{height:24px;padding:1px 6px;font-size:10px/);
});

test('PV image resize is rehydrated after popup and inserted-image loading', () => {
  assert.match(preview, /image-resize\.js\?v=20260815-pv-restore-1/);
  assert.match(preview, /function schedulePreviewPopupImageResize\(attempt\)/);
  assert.match(preview, /editor\.querySelectorAll\('img'\)\.length > 0 && count === 0/);
  assert.match(preview, /클릭하여 이미지 크기 조절/);
  assert.match(preview, /schedulePreviewPopupImageResize\(retry \+ 1\)/);
});

test('PV header scale and background controls apply immediately and persist in settings', () => {
  assert.match(preview, /PREVIEW_PV_HEADER_SCALE_STORAGE_KEY = 'md_viewer_pv_header_scale_v1'/);
  assert.match(preview, /PREVIEW_PV_HEADER_BACKGROUND_REMOVED_STORAGE_KEY = 'md_viewer_pv_header_background_removed_v1'/);
  assert.match(preview, /id=\\?"pv-header-label\\?"/);
  assert.match(preview, /id=\\?"pv-header-background-remove\\?"/);
  assert.match(preview, /previewPopupSetHeaderBackgroundRemoved\(this\.checked\)/);
  assert.match(preview, /function previewPopupApplyHeaderScaleToElements\(doc, fontSize, scale\)/);
  assert.match(preview, /heading\.style\.setProperty\('font-size', value \+ 'px', 'important'\)/);
  assert.match(preview, /documentElement\.style\.setProperty\('--pv-header-scale', String\(headerScale\)\)/);
  assert.match(preview, /classList\.toggle\('pv-header-background-removed'/);
  assert.match(preview, /html\.pv-header-background-removed [^{]+\{background:none!important;\}/);
  assert.match(preview, /function previewPopupAdjustHeaderScale\(delta\)[\s\S]{0,180}previewPopupSetHeaderScale/);
  assert.doesNotMatch(readFunction(preview, 'previewPopupAdjustHeaderScale'), /updatePreviewPopupContent/);
  assert.match(index, /id="pv-header-settings-card"/);
  assert.match(index, /id="pv-header-scale-setting"/);
  assert.match(index, /id="pv-header-background-remove-setting"/);
  assert.match(index, /체크하면 PV의 헤더 색상 배경을 숨깁니다\. 기본값은 배경 표시입니다\./);
  assert.match(app, /enhanceSettingsCardFold\('pv-header-settings-card'/);
  assert.match(app, /if \(pvHeaderSettings\) appendToColumn\(generalColumn, pvHeaderSettings\)/);
  assert.match(app, /syncPreviewPopupHeaderSettingsUi/);

  const h1 = { style: { setProperty(name, value, priority) { this[name] = { value, priority }; } } };
  const h2 = { style: { setProperty(name, value, priority) { this[name] = { value, priority }; } } };
  const applyScale = vm.runInNewContext(
    '(' + readFunction(preview, 'previewPopupApplyHeaderScaleToElements') + ')'
  );
  applyScale({
    querySelectorAll(selector) {
      if (selector.includes('h1')) return [h1];
      if (selector.includes('h2')) return [h2];
      return [];
    }
  }, 16, 1.5);
  assert.ok(Math.abs(parseFloat(h1.style['font-size'].value) - 67.2) < 0.001);
  assert.equal(h1.style['font-size'].priority, 'important');
  assert.ok(Math.abs(parseFloat(h2.style['font-size'].value) - 50.4) < 0.001);
});

test('PV has a persistent independent light and dark theme toggle', () => {
  assert.match(preview, /PREVIEW_PV_THEME_STORAGE_KEY = 'md_viewer_pv_theme_v1'/);
  assert.match(preview, /function previewPopupToggleTheme\(\)/);
  assert.match(preview, /localStorage\.setItem\(PREVIEW_PV_THEME_STORAGE_KEY, nextTheme\)/);
  assert.match(preview, /classList\.toggle\('dark', dark\)/);
  assert.match(preview, /id=\\?"pv-theme-toggle\\?"/);
  assert.match(preview, /button\.textContent = dark \? '라이트' : '다크'/);
  assert.match(preview, /id=\\?"pv-theme-toggle\\?"[\s\S]{0,300}>인쇄<\/button>[\s\S]{0,160}>닫기<\/button>/);
});

test('PV render edit mode shows responsive A4 page guides and page numbers', () => {
  assert.match(preview, /id=\\?"pv-content\\?"[\s\S]{0,500}<\/div><div id=\\?"pv-edit-page-guides\\?" aria-hidden=\\?"true\\?"/);
  assert.match(preview, /body\.pv-editor-mode #pv-edit-page-guides\{display:block;\}/);
  assert.match(preview, /\.pv-edit-page-guide\{[^}]*border-top:2px dashed #ef4444/);
  assert.match(preview, /label\.textContent = '페이지 ' \+ page \+ ' \/ ' \+ pageCount/);
  assert.match(preview, /content\.style\.minHeight = \(PREVIEW_PV_A4_HEIGHT_MM \* pageCount\) \+ 'mm'/);
  assert.match(preview, /new ResizeObserverClass\(function \(\) \{[\s\S]{0,120}previewPopupScheduleEditPageGuides\(\)/);
  assert.match(preview, /@media print\{#pv-toolbar,#pv-view-controls,#pv-table-picker,#pv-edit-page-guides\{display:none!important;\}/);

  const getPageCount = vm.runInNewContext(
    '(' + readFunction(preview, 'previewPopupGetA4EditPageCount') + ')'
  );
  assert.equal(getPageCount(0, 1000), 1);
  assert.equal(getPageCount(1000, 1000), 1);
  assert.equal(getPageCount(1001, 1000), 2);
  assert.equal(getPageCount(2500, 1000), 3);
});

test('PV editor scripts use a fresh cache key', () => {
  assert.match(index, /image_insert\.js\?v=20260812-pv-editor-1/);
  assert.match(index, /editpv\.js\?v=20260815-pv-header-controls-1-pv-child-img-2-toolbar-order-1-resize-restore-1-a4-edit-guides-1-exit-confirm-1-source-syntax-1/);
  assert.match(index, /pvHeaderSettings=20260815-1/);
  assert.match(index, /pvExport=20260813-modal-2/);
});

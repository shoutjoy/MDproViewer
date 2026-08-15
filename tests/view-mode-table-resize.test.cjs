const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tableResize = require('../js/viewmode/table-resize.js');

test('scans top-level and nested HTML tables in source order', () => {
  const source = '<p>앞</p><table class="outer"><tr><td><table><tr><td>안</td></tr></table></td></tr></table><p>뒤</p>';
  const records = tableResize.scanHtmlTables(source);
  assert.equal(records.length, 2);
  assert.match(records[0].openTag, /class="outer"/);
  assert.equal(records[1].openTag, '<table>');
});

test('stores a dragged table width in the existing HTML style attribute', () => {
  const source = '<p>앞</p><table class="docx-import-table" style="border-collapse:collapse;width:100%;color:red"><tr><td>A</td></tr></table>';
  const record = tableResize.scanHtmlTables(source)[0];
  const result = tableResize.replaceTableWidth(source, record, 63.24);
  assert.equal(result.changed, true);
  assert.match(result.html, /class="docx-import-table"/);
  assert.match(result.html, /style="border-collapse:collapse;color:red;width:63\.2%;max-width:100%"/);
  assert.doesNotMatch(result.html, /width:100%;color:red/);
});

test('adds style to a table that originally has no style or width attribute', () => {
  const source = '<table width="700"><tbody><tr><td>A</td></tr></tbody></table>';
  const result = tableResize.replaceTableWidth(source, tableResize.scanHtmlTables(source)[0], 45);
  assert.match(result.html, /^<table style="width:45%;max-width:100%">/);
  assert.doesNotMatch(result.html, /width="700"/);
});

test('stores width and height together when a corner handle is dragged', () => {
  const source = '<table style="border-collapse:collapse;width:80%;height:120px"><tr><td>A</td></tr></table>';
  const record = tableResize.scanHtmlTables(source)[0];
  const result = tableResize.replaceTableSize(source, record, 62.75, 244.4);
  assert.match(result.html, /style="border-collapse:collapse;width:62\.8%;max-width:100%;height:244px"/);
});

test('bottom-only resize preserves the existing width style', () => {
  const source = '<table style="width:72%;max-width:100%;color:red"><tr><td>A</td></tr></table>';
  const record = tableResize.scanHtmlTables(source)[0];
  const result = tableResize.replaceTableSize(source, record, null, 310);
  assert.match(result.html, /style="width:72%;max-width:100%;color:red;height:310px"/);
});

test('main view loads and hydrates the table resizer before app.js', () => {
  const root = path.resolve(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  assert.ok(index.indexOf('viewmode/table-resize.js?v=20260815-2') < index.indexOf('./js/app.js?'));
  assert.match(index, /viewTableResize=20260815-2/);
  assert.match(app, /ViewModeTableResize\.hydrate\(viewer/);
  assert.match(app, /표 크기를 HTML style에 저장했습니다/);
  assert.match(css, /\.md-table-resize-handle\.is-w/);
  assert.match(css, /\.md-table-resize-handle\.is-e/);
  assert.match(css, /\.md-table-resize-handle\.is-s/);
  assert.match(css, /\.md-table-resize-handle\.is-sw/);
  assert.match(css, /\.md-table-resize-handle\.is-se/);
  assert.match(css, /\.md-table-resize-handle\.is-corner/);
});

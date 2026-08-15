const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const importer = fs.readFileSync(path.join(root, 'js', 'extendFiles', 'docx-import.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const browserFixture = fs.readFileSync(path.join(root, 'tests', 'docx-import-browser-fixture.html'), 'utf8');

test('DOCX open uses the OOXML table fidelity layer after Mammoth', () => {
  assert.match(app, /docxImport:\s*'\.\/js\/extendFiles\/docx-import\.js\?v=20260815-table-fidelity-2'/);
  assert.match(app, /await loadOptionalScript\('mammoth',[\s\S]*?await loadOptionalScript\('docxImport'/);
  assert.match(app, /window\.DocxImport\.convert\(arrayBuffer,[\s\S]*?mammothOptions:\s*options/);
  assert.match(index, /docxImport=20260815-table-fidelity-2/);
});

test('DOCX table importer restores structural and visual OOXML properties', () => {
  assert.match(importer, /word\/document\.xml/);
  assert.match(importer, /word\/styles\.xml/);
  assert.match(importer, /tblGrid/);
  assert.match(importer, /colgroup/);
  assert.match(importer, /gridSpan/);
  assert.match(importer, /vMerge/);
  assert.match(importer, /tblBorders/);
  assert.match(importer, /tcBorders/);
  assert.match(importer, /background-color/);
  assert.match(importer, /vertical-align/);
  assert.match(importer, /text-align/);
  assert.match(importer, /table-layout/);
  assert.match(importer, /background-color', 'transparent'/);
  assert.match(importer, /font-weight', '400'/);
  assert.match(importer, /tblStylePr/);
  assert.match(importer, /firstRow/);
  assert.match(importer, /themeFill/);
});

test('DOCX images remain embedded through the existing Mammoth callback', () => {
  assert.match(app, /options\.convertImage = window\.mammoth\.images\.imgElement/);
  assert.match(app, /image\.read\('base64'\)/);
  assert.match(app, /mammothOptions:\s*options/);
});

test('browser fixture covers DOCX widths, borders, fill, and alignment', () => {
  assert.match(browserFixture, /w:tblW w:w="5000" w:type="pct"/);
  assert.match(browserFixture, /w:tblBorders/);
  assert.match(browserFixture, /w:shd w:fill="E8F1FB"/);
  assert.match(browserFixture, /DocxImport\.enhanceHtml\(buffer, input\)/);
});

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

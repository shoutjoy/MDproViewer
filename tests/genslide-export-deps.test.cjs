const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('GenSlide export dependencies prefer repository-local assets', () => {
  const entry = read('js/Html2pptx/jenaEditor/js/export.js');
  const imageExport = read('js/Html2pptx/jenaEditor/js/Export/imageExport.js');

  assert.match(entry, /vendor\/html2canvas\/html2canvas\.min\.js\?v=1\.4\.1-local/);
  assert.match(entry, /vendor\/jszip\/jszip\.min\.js\?v=3\.10\.1-local/);
  assert.match(entry, /vendor\/pptxgenjs\/pptxgen\.bundle\.js\?v=3\.12\.0-local/);
  assert.ok(entry.indexOf('vendor/html2canvas') < entry.indexOf('cdn.jsdelivr.net/npm/html2canvas'));
  assert.ok(entry.indexOf('vendor/pptxgenjs') < entry.indexOf('cdn.jsdelivr.net/npm/pptxgenjs'));
  assert.match(imageExport, /EXPORT_DEPENDENCY_SOURCES\.html2canvas/);
  assert.match(imageExport, /EXPORT_DEPENDENCY_SOURCES\.jszip/);
});

test('vendored PptxGenJS and actionable export errors are shipped', () => {
  const bundlePath = path.join(root, 'vendor/pptxgenjs/pptxgen.bundle.js');
  const licensePath = path.join(root, 'vendor/pptxgenjs/LICENSE');
  const pptExport = read('js/Html2pptx/jenaEditor/js/Export/pptExport.js');
  const imageExport = read('js/Html2pptx/jenaEditor/js/Export/imageExport.js');

  assert.ok(fs.statSync(bundlePath).size > 400000);
  assert.ok(fs.statSync(licensePath).size > 500);
  assert.match(pptExport, /console\.error\("\[GenSlide\] PPTX export failed:/);
  assert.match(pptExport, /formatExportError\(e, "PPTX export failed"\)/);
  assert.match(imageExport, /console\.error\("\[GenSlide\] Image export failed:/);
  assert.match(imageExport, /formatExportError\(e, "Image export failed"\)/);
});

test('GenSlide iframe and dynamic scripts use the export dependency cache key', () => {
  assert.match(read('index.html'), /Html2pptx\/jenaEditor\/index\.html\?v=20260812-export-local-deps-1/);
  assert.match(read('js/Html2pptx/jenaEditor/index.html'), /controller\.js\?v=20260812-export-local-deps-1/);
  assert.match(read('js/Html2pptx/jenaEditor/js/controller.js'), /ASSET_VERSION = "20260812-export-local-deps-1"/);
});

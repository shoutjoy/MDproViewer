const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('GenSlide exposes PPTX/PPSX import in source and file input', () => {
  const header = read('js/Html2pptx/jenaEditor/ui/header.html');
  const controller = read('js/Html2pptx/jenaEditor/js/controller.js');
  const main = read('js/Html2pptx/jenaEditor/js/main.js');

  for (const source of [header, controller]) {
    assert.match(source, /id="btnPptxImport"/);
    assert.match(source, /id="pptxFileInput"[^>]+accept="\.pptx,\.ppsx/);
  }
  assert.match(main, /btnPptxImport\.onclick\s*=\s*\(\)\s*=>\s*pptxFileInput\.click\(\)/);
  assert.match(main, /await importPptxToGenSlide\(file\)/);
});

test('PPTX import validates the archive and waits for every rendered slide', () => {
  const source = read('js/Html2pptx/jenaEditor/js/Import/pptxImport.js');

  assert.match(source, /function inspectPptxArchive\(buffer\)/);
  assert.match(source, /zip\.file\("\[Content_Types\]\.xml"\)/);
  assert.match(source, /zip\.file\("ppt\/presentation\.xml"\)/);
  assert.match(source, /count >= expectedCount/);
  assert.match(source, /slides-loadnig-msg/);
  assert.match(source, /previousGetBinaryContent/);
  assert.match(source, /window\.importPptxToGenSlide = importPptxToGenSlide/);
});

test('GenSlide cache versions include the PPTX import build', () => {
  const appIndex = read('index.html');
  const editorIndex = read('js/Html2pptx/jenaEditor/index.html');
  const controller = read('js/Html2pptx/jenaEditor/js/controller.js');

  for (const source of [appIndex, editorIndex, controller]) {
    assert.match(source, /20260815-pptx-import-1/);
  }
});

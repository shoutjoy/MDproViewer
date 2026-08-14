const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'extendFiles', 'pdf-open.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function loadModule() {
  const context = { globalThis: {} };
  vm.runInNewContext(source, context, { filename: 'pdf-open.js' });
  return context.globalThis.PdfOpen;
}

test('PDF text items become editable Markdown in visual reading order', () => {
  const pdfOpen = loadModule();
  const page = pdfOpen.__test.pageToMarkdown([
    { str: 'Body', transform: [12, 0, 0, 12, 10, 80], width: 28 },
    { str: 'text', transform: [12, 0, 0, 12, 44, 80], width: 22 },
    { str: 'Title', transform: [24, 0, 0, 24, 10, 120], width: 52 },
    { str: '• item', transform: [12, 0, 0, 12, 10, 55], width: 38 }
  ], 1);
  assert.match(page.markdown, /^# Title/m);
  assert.match(page.markdown, /Body text/);
  assert.match(page.markdown, /^- item/m);
});

test('PDF converter keeps pages and reports pages without editable text', async () => {
  const pdfOpen = loadModule();
  const fakePdf = {
    numPages: 2,
    async getPage(number) {
      return {
        async getTextContent() {
          return { items: number === 1 ? [{ str: 'Hello', transform: [12, 0, 0, 12, 10, 10], width: 28 }] : [] };
        },
        cleanup() {}
      };
    },
    cleanup() {},
    async destroy() {}
  };
  const result = await pdfOpen.convert(new ArrayBuffer(2), {
    pdfjsLib: { getDocument: () => ({ promise: Promise.resolve(fakePdf) }) }
  });
  assert.match(result.markdown, /<!-- PDF page 1 -->/);
  assert.match(result.markdown, /<!-- page-break -->/);
  assert.deepEqual(Array.from(result.scannedPages), [2]);
});

test('all PDF picker paths route to the editable importer before dedicated viewers', () => {
  assert.match(app, /async function openDroppedDocumentFile\(file\)[\s\S]*?extension === '\.pdf'[\s\S]*?openPdfInEditor\(file\)/);
  assert.match(app, /async function handleFileSelect\(event\)[\s\S]*?extension === '\.pdf'[\s\S]*?await openPdfInEditor\(file\)[\s\S]*?DEDICATED_LOCAL_VIEWER_EXTENSIONS/);
  assert.match(app, /async function openFileFromLocalFolderExplorer\(file\)[\s\S]*?extension === '\.pdf'\) return openPdfInEditor\(file\)/);
  assert.match(app, /pdfJs: '.\/js\/extendFiles\/pdfjs-loader\.mjs/);
  assert.match(app, /loadOptionalScript\('pdfJs',[\s\S]*?\{ module: true \}/);
  assert.match(app, /pdfOpen: '.\/js\/extendFiles\/pdf-open\.js/);
});

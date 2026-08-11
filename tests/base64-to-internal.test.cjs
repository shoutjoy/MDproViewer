const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadBrowserModule(relativePath, sandbox) {
  const code = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: relativePath });
}

function createImageDbHarness() {
  const records = new Map();
  const db = {
    transaction(storeName) {
      assert.equal(storeName, 'images');
      const tx = { error: null };
      tx.objectStore = () => ({
        put(record) {
          records.set(record.id, record);
          queueMicrotask(() => tx.oncomplete && tx.oncomplete());
        },
        get(id) {
          const request = { result: null, error: null };
          queueMicrotask(() => {
            request.result = records.get(id) || null;
            if (request.onsuccess) request.onsuccess();
          });
          return request;
        }
      });
      return tx;
    }
  };
  return { db, records };
}

function createSandbox() {
  const sandbox = {
    atob,
    Blob,
    console,
    encodeURIComponent,
    decodeURIComponent,
    Map,
    Math,
    Date,
    Promise,
    queueMicrotask,
    Set,
    Uint8Array
  };
  sandbox.window = sandbox;
  return sandbox;
}

test('Base64 Markdown images become deduplicated internal IndexedDB links', async () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  const harness = createImageDbHarness();
  const pixel = 'iVBORw0KGgo=';
  const markdown = [
    `![](data:image/png;base64,${pixel})`,
    `![로고](data:image/png;base64,${pixel} "제목")`
  ].join('\n');

  const result = await sandbox.ImageDB.convertBase64ImagesInMarkdown(harness.db, markdown);

  assert.equal(result.convertedCount, 2);
  assert.equal(result.storedCount, 1);
  assert.equal(harness.records.size, 1);
  assert.match(result.markdown, /^!\[img_\d+_[a-z0-9]+\]\(internal:\/\/img_\d+_[a-z0-9]+\)$/m);
  assert.match(result.markdown, /!\[로고\]\(internal:\/\/img_\d+_[a-z0-9]+ "제목"\)/);
  assert.doesNotMatch(result.markdown, /data:image/);
});

test('MDD import rewrites exported internal image ids to restored ids', async () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  loadBrowserModule('js/extendFiles/extend-files.js', sandbox);
  const harness = createImageDbHarness();
  const payload = {
    format: 'mdviewer/mdd',
    version: 1,
    document: {
      fileName: 'sample.md',
      content: '![sample](internal://img_original)'
    },
    images: [{
      id: 'img_original',
      name: 'img_original.png',
      mime: 'image/png',
      base64: 'iVBORw0KGgo='
    }]
  };

  const imported = await sandbox.ExtendFiles.importMddToIndexedDb(harness.db, payload);

  assert.equal(imported.imageCount, 1);
  assert.doesNotMatch(imported.markdown, /internal:\/\/img_original\)/);
  assert.match(imported.markdown, /!\[sample\]\(internal:\/\/img_original_[a-z0-9]+\)/);
  const restoredId = sandbox.ImageDB.extractInternalImageIds(imported.markdown)[0];
  assert.ok(harness.records.has(restoredId));
});

test('unused image detection scans nested inDB records and the current draft', () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  const imageRecords = [
    { id: 'img_current' },
    { id: 'img_document' },
    { id: 'img_nested' },
    { id: 'img_unused' }
  ];
  const references = [
    '![현재](internal://img_current)',
    { content: '<!-- note-cover {"path":"internal://img_document"} -->' },
    { nested: [{ url: 'internal://img_nested' }] }
  ];

  assert.deepEqual(
    Array.from(sandbox.ImageDB.extractInternalImageIdsDeep(references)).sort(),
    ['img_current', 'img_document', 'img_nested']
  );
  assert.deepEqual(
    Array.from(sandbox.ImageDB.findUnusedImageIds(imageRecords, references)),
    ['img_unused']
  );
});

test('TIDY UI exposes the base64tourl action and selection-aware wiring', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const tidy = fs.readFileSync(path.join(root, 'js', 'Tidy', 'tidy-actions.js'), 'utf8');

  assert.match(html, />base64tourl<\/button>/);
  assert.match(html, /onclick="convertBase64ImagesToInternalInEditor\(\)"/);
  assert.match(app, /function convertBase64ImagesToInternalInEditor\(\)/);
  assert.match(tidy, /var hasSelection = start !== end;/);
  assert.match(tidy, /hasSelection \? originalText\.substring\(start, end\) : originalText/);
});

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
    btoa,
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

test('Base64 HTML img src values become internal links without changing other attributes', async () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  const harness = createImageDbHarness();
  const pixel = 'iVBORw0KGgo=';
  const markdown = [
    `<img class="hero" src="data:image/png;base64,${pixel}" alt="표지">`,
    `<IMG SRC='data:image/png;base64,${pixel}' width="20">`,
    `<img src=data:image/png;base64,${pixel} />`,
    `![같은 이미지](data:image/png;base64,${pixel})`
  ].join('\n');

  const result = await sandbox.ImageDB.convertBase64ImagesInMarkdown(harness.db, markdown);

  assert.equal(result.convertedCount, 4);
  assert.equal(result.storedCount, 1);
  assert.equal(harness.records.size, 1);
  assert.match(result.markdown, /<img class="hero" src="internal:\/\/img_\d+_[a-z0-9]+" alt="표지">/);
  assert.match(result.markdown, /<IMG SRC='internal:\/\/img_\d+_[a-z0-9]+' width="20">/);
  assert.match(result.markdown, /<img src=internal:\/\/img_\d+_[a-z0-9]+ \/>/);
  assert.match(result.markdown, /!\[같은 이미지\]\(internal:\/\/img_\d+_[a-z0-9]+\)/);
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

test('TIDY UI exposes the base64ToUrl action and selection-aware wiring', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const tidy = fs.readFileSync(path.join(root, 'js', 'Tidy', 'tidy-actions.js'), 'utf8');
  const tidyImages = fs.readFileSync(path.join(root, 'js', 'Tidy', 'tidy-base64-image.js'), 'utf8');

  assert.match(html, />base64ToUrl<\/button>/);
  assert.match(html, /Markdown\/HTML Base64 이미지/);
  assert.match(html, /onclick="convertBase64ImagesToInternalInEditor\(\)"/);
  assert.match(app, /function convertBase64ImagesToInternalInEditor\(\)/);
  assert.match(tidy, /applyBase64ToUrl/);
  assert.match(tidyImages, /var hasSelection = start !== end;/);
  assert.match(tidyImages, /hasSelection \? originalText\.substring\(start, end\) : originalText/);
});

test('TIDY Url2base64 converts internal Markdown and HTML image links while preserving attributes', async () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  loadBrowserModule('js/Tidy/tidy-base64-image.js', sandbox);
  const harness = createImageDbHarness();
  const blob = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
  harness.records.set('img_selected', { id: 'img_selected', blob, mime: 'image/png' });
  const source = [
    '![그림](internal://img_selected)',
    '<img src="internal://img_selected" alt="그림" width="268" height="480">',
    '<img src=internal://img_selected alt="따옴표 없음">'
  ].join('\n');

  const result = await sandbox.TidyImageRecovery.convertInternalUrlsToBase64(
    harness.db,
    source,
    sandbox.ImageDB
  );

  assert.equal(result.convertedCount, 3);
  assert.equal(result.resolvedCount, 1);
  assert.deepEqual(Array.from(result.missingIds), []);
  assert.doesNotMatch(result.markdown, /internal:\/\//);
  assert.match(result.markdown, /!\[그림\]\(data:image\/png;base64,iVBORw==\)/);
  assert.match(result.markdown, /<img src="data:image\/png;base64,iVBORw==" alt="그림" width="268" height="480">/);
  assert.match(result.markdown, /<img src="data:image\/png;base64,iVBORw==" alt="따옴표 없음">/);
});

test('TIDY Url2base64 leaves missing internal links unchanged', async () => {
  const sandbox = createSandbox();
  loadBrowserModule('imageDB/imageDB.js', sandbox);
  loadBrowserModule('js/Tidy/tidy-base64-image.js', sandbox);
  const harness = createImageDbHarness();
  const source = '<img src="internal://img_missing" alt="missing">';

  const result = await sandbox.TidyImageRecovery.convertInternalUrlsToBase64(
    harness.db,
    source,
    sandbox.ImageDB
  );

  assert.equal(result.convertedCount, 0);
  assert.deepEqual(Array.from(result.missingIds), ['img_missing']);
  assert.equal(result.markdown, source);
});

test('TIDY Url2base64 converts only the selected range and converts the whole document without a selection', async () => {
  async function runConversion(selectionStart, selectionEnd) {
    const sandbox = createSandbox();
    loadBrowserModule('imageDB/imageDB.js', sandbox);
    loadBrowserModule('js/Tidy/tidy-base64-image.js', sandbox);
    const harness = createImageDbHarness();
    const blob = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
    harness.records.set('img_one', { id: 'img_one', blob, mime: 'image/png' });
    harness.records.set('img_two', { id: 'img_two', blob, mime: 'image/png' });
    const textarea = {
      value: '<img src="internal://img_one">\n<img src="internal://img_two">',
      selectionStart,
      selectionEnd
    };
    await sandbox.TidyImageRecovery.applyUrl2base64({
      isEditMode: true,
      editorTextarea: textarea,
      db: harness.db,
      imageDb: sandbox.ImageDB,
      showToast() {}
    }, (result) => {
      textarea.value = result.replaceSelection
        ? textarea.value.slice(0, result.selectionStart) + result.value + textarea.value.slice(result.selectionEnd)
        : result.value;
    });
    return textarea.value;
  }

  const firstEnd = '<img src="internal://img_one">'.length;
  const selected = await runConversion(0, firstEnd);
  assert.match(selected, /^<img src="data:image\/png;base64,iVBORw==">/);
  assert.match(selected, /<img src="internal:\/\/img_two">$/);

  const whole = await runConversion(0, 0);
  assert.doesNotMatch(whole, /internal:\/\//);
  assert.equal((whole.match(/data:image\/png;base64,iVBORw==/g) || []).length, 2);
});

test('TIDY UI exposes Url2base64 with selection-aware editor wiring', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const tidyActions = fs.readFileSync(path.join(root, 'js', 'Tidy', 'tidy-actions.js'), 'utf8');
  const tidyImages = fs.readFileSync(path.join(root, 'js', 'Tidy', 'tidy-base64-image.js'), 'utf8');

  assert.match(html, />Url2base64<\/button>/);
  assert.match(html, /onclick="convertInternalImagesToBase64InEditor\(\)"/);
  assert.match(app, /function convertInternalImagesToBase64InEditor\(\)/);
  assert.match(tidyActions, /applyUrl2base64/);
  assert.match(tidyImages, /hasSelection \? originalText\.substring\(start, end\) : originalText/);
});

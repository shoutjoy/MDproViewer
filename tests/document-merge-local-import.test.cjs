const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mergeSource = fs.readFileSync(path.join(root, 'js', 'MergeDoc', 'merge.js'), 'utf8');
const mergeModal = fs.readFileSync(path.join(root, 'js', 'MergeDoc', 'merge-modal.html'), 'utf8');

function createElement(extra = {}) {
  const classes = new Set(String(extra.className || '').split(/\s+/).filter(Boolean));
  return Object.assign({
    value: '',
    innerHTML: '',
    textContent: '',
    className: extra.className || '',
    style: {},
    dataset: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      }
    },
    setAttribute(name, value) { this[name] = value; },
    focus() {},
    click() {}
  }, extra);
}

function textFile(name, content, relativePath = '') {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    lastModified: 1,
    webkitRelativePath: relativePath,
    async arrayBuffer() { return bytes.buffer.slice(0); }
  };
}

test('merge modal exposes Local file and folder import controls', () => {
  assert.match(mergeModal, /id="merge-source-local"/);
  assert.match(mergeModal, /id="merge-source-indb"/);
  assert.match(mergeModal, /id="merge-local-file-input"[^>]*multiple/);
  assert.match(mergeModal, /id="merge-local-folder-input"[^>]*webkitdirectory/);
  assert.match(mergeModal, /\.docx/);
  assert.match(mergeModal, /\.pdf/);
});

test('merge modal switches to a wide two-pane layout and supports fullscreen', () => {
  assert.match(mergeModal, /id="merge-fullscreen-button"/);
  assert.match(mergeModal, /id="merge-layout"/);
  assert.ok(mergeModal.indexOf('id="merge-menu-pane"') < mergeModal.indexOf('id="merge-list-pane"'));
  assert.match(mergeSource, /WIDE_LAYOUT_MIN_WIDTH = 720/);
  assert.match(mergeSource, /grid-template-columns:minmax\(260px,32%\) minmax\(0,1fr\)/);
  assert.match(mergeSource, /function toggleMergeFullscreen/);
  assert.match(mergeSource, /new ResizeObserver/);
});

test('local text documents are sorted, selected, and bound into an inDB document', async () => {
  const elements = {
    'merge-list': createElement(),
    'merge-selected-only-btn': createElement(),
    'merge-search-input': createElement(),
    'merge-source-local': createElement(),
    'merge-source-indb': createElement(),
    'merge-target-local': createElement(),
    'merge-target-indb': createElement(),
    'merge-local-import-tools': createElement({ className: 'hidden' }),
    'merge-local-import-status': createElement(),
    'merge-bundle-name': createElement({ value: '로컬 문서 묶음' }),
    'merge-modal': createElement()
  };
  let savedDocument = null;
  let downloadedName = '';
  const toasts = [];
  const context = {
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement(tag) {
        assert.equal(tag, 'a');
        return {
          href: '',
          download: '',
          click() { downloadedName = this.download; },
          remove() {}
        };
      },
      body: { contains() { return true; }, appendChild() {} }
    },
    Blob,
    localStorage: { setItem() {} },
    showToast(message) { toasts.push(message); },
    db: {
      transaction(storeName, mode) {
        assert.equal(storeName, 'documents');
        assert.equal(mode, 'readwrite');
        const tx = {
          objectStore() {
            return {
              add(document) {
                savedDocument = document;
                queueMicrotask(() => tx.oncomplete && tx.oncomplete());
              }
            };
          }
        };
        return tx;
      }
    }
  };
  context.window = context;
  vm.runInNewContext(mergeSource, context, { filename: 'merge.js' });

  context.switchMergeSource('local');
  context.switchMergeTarget('indb');
  await context.importMergeLocalFiles([
    textFile('10.md', '# ten', '강의/10.md'),
    textFile('2.md', '# two', '강의/2.md'),
    textFile('ignore.exe', 'ignored', '강의/ignore.exe')
  ], true);

  assert.ok(elements['merge-list'].innerHTML.indexOf('2.md') < elements['merge-list'].innerHTML.indexOf('10.md'));
  assert.match(elements['merge-local-import-status'].textContent, /2개 문서를 불러왔습니다/);
  assert.match(elements['merge-local-import-status'].textContent, /1개는 제외/);

  await context.bindMerge();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(savedDocument.title, '로컬 문서 묶음');
  assert.equal(savedDocument.mergeDocSource, 'local');
  assert.deepEqual(Array.from(savedDocument.mergeDocItems), ['강의/2.md', '강의/10.md']);
  assert.equal(savedDocument.content, '# two\n\n---\n\n# ten');
  assert.ok(toasts.some(message => message.includes('문서 묶기가 완료되었습니다')));

  context.switchMergeTarget('local');
  await context.bindMerge();
  assert.equal(downloadedName, '로컬 문서 묶음.md');
  assert.ok(toasts.some(message => message.includes('Local 파일로 저장했습니다')));
});

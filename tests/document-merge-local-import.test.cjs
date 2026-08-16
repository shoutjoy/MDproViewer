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
  assert.match(mergeModal, />가져온 폴더<\/button>/);
  assert.match(mergeModal, />inDB Bind<\/button>/);
  assert.match(mergeModal, /id="merge-move-up-button"/);
  assert.match(mergeModal, /id="merge-move-down-button"/);
  assert.match(mergeModal, /\.docx/);
  assert.match(mergeModal, /\.pdf/);
});

test('merge modal switches to a wide two-pane layout and supports fullscreen', () => {
  assert.match(mergeModal, /id="merge-fullscreen-button"/);
  assert.match(mergeModal, /id="merge-layout"/);
  assert.ok(mergeModal.indexOf('id="merge-menu-pane"') < mergeModal.indexOf('id="merge-list-pane"'));
  assert.match(mergeSource, /WIDE_LAYOUT_MIN_WIDTH = 720/);
  assert.match(mergeSource, /#merge-modal\{z-index:95!important;\}/);
  assert.match(mergeSource, /grid-template-columns:minmax\(260px,32%\) minmax\(0,1fr\)/);
  assert.match(mergeSource, /function toggleMergeFullscreen/);
  assert.match(mergeSource, /new ResizeObserver/);
});

test('local text documents are sorted, selected, and bound into an inDB document', async () => {
  const mergePanel = createElement();
  mergePanel.getBoundingClientRect = () => mergePanel.dataset.fullscreen === '1'
    ? { left: 8, top: 8, width: 1184, height: 784 }
    : { left: 100, top: 100, width: 420, height: 560 };
  const elements = {
    'merge-list': createElement(),
    'merge-selected-only-btn': createElement(),
    'merge-search-input': createElement(),
    'merge-source-local': createElement(),
    'merge-source-indb': createElement(),
    'merge-target-local': createElement(),
    'merge-target-indb': createElement(),
    'merge-move-up-button': createElement(),
    'merge-move-down-button': createElement(),
    'merge-focused-label': createElement(),
    'merge-local-import-tools': createElement({ className: 'hidden' }),
    'merge-local-import-status': createElement(),
    'merge-bundle-name': createElement({ value: '로컬 문서 묶음' }),
    'merge-modal': createElement(),
    'merge-panel': mergePanel,
    'merge-fullscreen-button': createElement(),
    'merge-panel-resizer': createElement(),
    toolbar: createElement({
      parentElement: {
        getBoundingClientRect() { return { left: 300, top: 70, width: 900, height: 730 }; }
      }
    })
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
    requestAnimationFrame(callback) { callback(); },
    innerWidth: 1200,
    innerHeight: 800,
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

  context.toggleMergeFullscreen();
  assert.equal(mergePanel.dataset.fullscreen, '1');
  assert.equal(mergePanel.dataset.layout, 'wide');
  assert.equal(mergePanel.style.left, '308px');
  assert.equal(mergePanel.style.top, '78px');
  assert.equal(mergePanel.style.width, '884px');
  assert.equal(mergePanel.style.height, '714px');
  context.toggleMergeFullscreen();
  assert.equal(mergePanel.dataset.fullscreen, '0');
  assert.equal(mergePanel.style.width, '420px');

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

  context.focusMergeItem(1);
  context.moveFocusedMergeItem(-1);
  assert.ok(elements['merge-list'].innerHTML.indexOf('10.md') < elements['merge-list'].innerHTML.indexOf('2.md'));
  assert.match(elements['merge-focused-label'].textContent, /^1\/2 10\.md/);
  context.moveFocusedMergeItem(1);
  assert.ok(elements['merge-list'].innerHTML.indexOf('2.md') < elements['merge-list'].innerHTML.indexOf('10.md'));
  assert.match(elements['merge-focused-label'].textContent, /^2\/2 10\.md/);

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
  assert.ok(toasts.some(message => message.includes('다운로드 폴더에 저장했습니다')));
});

test('DOCX-only local merge writes a DOCX Blob into the imported folder', async () => {
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
    'merge-bundle-name': createElement({ value: '강의 자료.docx' }),
    'merge-modal': createElement()
  };
  const writes = [];
  const outputBlob = new Blob(['docx-package'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  const directoryHandle = {
    name: '강의',
    async getFileHandle(name, options) {
      assert.equal(name, '강의 자료.docx');
      assert.equal(options.create, true);
      return {
        async createWritable() {
          return {
            async write(blob) { writes.push(blob); },
            async close() { writes.push('closed'); }
          };
        }
      };
    }
  };
  const context = {
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
    innerWidth: 1200,
    innerHeight: 800,
    document: {
      baseURI: 'http://localhost/',
      getElementById(id) { return elements[id] || null; },
      body: { contains() { return true; }, appendChild() {} }
    },
    async loadOptionalScript() {},
    DocxImport: {
      async convert() { return { value: '<p>DOCX 본문</p><table><tr><td>표</td></tr></table>' }; }
    },
    mammoth: { convertToHtml() {} },
    DocxExport: {
      async createBlob(payload) {
        assert.equal(payload.content, '');
        assert.match(payload.html, /DOCX 본문/);
        assert.match(payload.html, /<table>/);
        return outputBlob;
      }
    },
    showToast() {}
  };
  context.window = context;
  vm.runInNewContext(mergeSource, context, { filename: 'merge.js' });

  context.switchMergeSource('local');
  await context.importMergeLocalFiles([
    { file: textFile('01.docx', 'first'), relativePath: '01.docx' },
    { file: textFile('02.docx', 'second'), relativePath: '02.docx' }
  ], true, { directoryHandle, directoryName: '강의' });
  await context.bindMerge();

  assert.equal(writes[0], outputBlob);
  assert.equal(writes[1], 'closed');
  assert.equal(elements['merge-modal'].style.display, 'none');
});

test('DOCX-only merge bound to inDB preserves DOCX output metadata and Blob', async () => {
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
    'merge-bundle-name': createElement({ value: 'inDB DOCX 묶음' }),
    'merge-modal': createElement()
  };
  let savedDocument;
  const outputBlob = new Blob(['docx-package'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const context = {
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    innerWidth: 1200,
    innerHeight: 800,
    document: {
      baseURI: 'http://localhost/',
      getElementById(id) { return elements[id] || null; },
      body: { contains() { return true; }, appendChild() {} }
    },
    localStorage: { setItem() {} },
    async loadOptionalScript() {},
    DocxImport: { async convert() { return { value: '<p>DOCX 본문</p>' }; } },
    mammoth: { convertToHtml() {} },
    DocxExport: { async createBlob() { return outputBlob; } },
    showToast() {},
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
  await context.importMergeLocalFiles([textFile('source.docx', 'source')], false);
  await context.bindMerge();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(savedDocument.mergeDocOutputFormat, 'docx');
  assert.equal(savedDocument.mergeDocFileName, 'inDB DOCX 묶음.docx');
  assert.equal(savedDocument.mergeDocBlob, outputBlob);
  assert.match(savedDocument.content, /<section/);
});

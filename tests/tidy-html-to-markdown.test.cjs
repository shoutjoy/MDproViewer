const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createSandbox() {
  const elements = new Map();
  const sandbox = {
    console,
    document: {
      body: { addEventListener() {} },
      getElementById(id) { return elements.get(id) || null; }
    },
    requestAnimationFrame(callback) { callback(); }
  };
  sandbox.window = sandbox;
  return sandbox;
}

test('HTML2MD is loaded before Tidy actions and exposed in the quick menu', () => {
  const index = read('index.html');
  const converterPosition = index.indexOf('tidy-html-to-markdown.js?v=20260817-html2md-1');
  const actionsPosition = index.indexOf('tidy-actions.js?v=20260817-html2md-1');
  assert.ok(converterPosition > 0);
  assert.ok(actionsPosition > converterPosition);
  assert.match(index, /onclick="convertHtmlToMarkdownInEditor\(\)"/);
  assert.match(index, />HTML2MD<\/button>/);
  assert.match(read('js/app.js'), /function convertHtmlToMarkdownInEditor\(\)/);
});

test('HTML2MD applies to the selected range and opens a limitation report', () => {
  const sandbox = createSandbox();
  let reportScope = '';
  let savedValue = '';
  let toast = '';
  sandbox.TidyHtmlToMarkdown = {
    convert(source) {
      assert.equal(source, '<p>선택</p>');
      return {
        value: '선택',
        changed: true,
        foundHtml: true,
        convertedCount: 1,
        issues: [{ label: '<video>', reason: '지원하지 않는 HTML 태그', detail: '', count: 1 }]
      };
    },
    showReport(result, scope) {
      assert.equal(result.issues.length, 1);
      reportScope = scope;
    }
  };
  vm.runInNewContext(read('js/Tidy/tidy-actions.js'), sandbox, { filename: 'tidy-actions.js' });
  const textarea = {
    value: '앞\n<p>선택</p>\n뒤',
    selectionStart: 2,
    selectionEnd: 11,
    selectionDirection: 'forward',
    scrollTop: 9,
    scrollLeft: 0,
    focus() {},
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  };
  sandbox.TidyActions.applyHtmlToMarkdown({
    isEditMode: true,
    editorTextarea: textarea,
    setCurrentMarkdown(value) { savedValue = value; },
    renderMarkdown() {},
    performAutoSave() {},
    showToast(value) { toast = value; }
  });

  assert.equal(textarea.value, '앞\n선택\n뒤');
  assert.equal(savedValue, textarea.value);
  assert.equal(reportScope, '선택 영역');
  assert.match(toast, /제한 항목 1종/);
});

test('converter preserves unsupported HTML and reports concrete limitations', () => {
  const converter = read('js/Tidy/tidy-html-to-markdown.js');
  assert.match(converter, /원본 HTML로 보존/);
  assert.match(converter, /지원하지 않는 HTML 태그/);
  assert.match(converter, /병합 셀·캡션 표는 Markdown 표로 표현할 수 없음/);
  assert.match(converter, /Markdown으로 옮길 수 없는 속성/);
  assert.match(converter, /id = 'tidy-html2md-report'/);
  assert.match(converter, /100% 표현할 수 없는 항목/);
  assert.match(converter, /taskPrefix = child\.hasAttribute\('checked'\)/);
  assert.match(converter, /function descriptionListNode/);
  assert.match(converter, /aligned === 'center' \? ':---:'/);
});

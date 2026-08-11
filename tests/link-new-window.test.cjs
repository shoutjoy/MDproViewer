const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModalApi(options = {}) {
  const textarea = {
    value: options.initialValue || '',
    selectionStart: options.selectionStart || 0,
    selectionEnd: options.selectionEnd || 0,
    scrollTop: 0,
    focus() {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
  const elements = {
    'input-modal': { classList: { add() {}, remove() {} } },
    'viewer-edit-ta': textarea,
    'input-display-text': { value: options.displayText || '' },
    'input-url': { value: options.url || '' },
    'input-link-new-window': { checked: !!options.openInNewWindow }
  };
  const document = {
    getElementById(id) { return elements[id] || null; },
    execCommand(command, _showUi, value) {
      assert.equal(command, 'insertText');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + value + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + value.length;
      return true;
    }
  };
  const window = {};
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'Imagetool', 'link-image-modal.js'),
    'utf8'
  );
  vm.runInNewContext(source, { window, document, requestAnimationFrame() {} });
  return { api: window.LinkImageModal, textarea };
}

test('새 창 체크 시 target="_blank" HTML 링크를 삽입한다', () => {
  const { api, textarea } = loadModalApi({
    displayText: 'ECA Plus',
    url: 'https://pro.ecaplus.co.kr/',
    openInNewWindow: true
  });

  const inserted = api.confirm({
    editorTextarea: textarea,
    getMode: () => 'link'
  });

  assert.equal(
    inserted,
    '<a href="https://pro.ecaplus.co.kr/" target="_blank">ECA Plus</a>'
  );
  assert.equal(textarea.value, inserted);
});

test('새 창 체크가 없으면 기존 Markdown 링크 형식을 유지한다', () => {
  const { api, textarea } = loadModalApi({
    displayText: 'ECA Plus',
    url: 'https://pro.ecaplus.co.kr/'
  });

  const inserted = api.confirm({
    editorTextarea: textarea,
    getMode: () => 'link'
  });

  assert.equal(inserted, '[ECA Plus](https://pro.ecaplus.co.kr/)');
});

test('새 창 HTML 링크의 텍스트와 URL 속성을 안전하게 이스케이프한다', () => {
  const { api, textarea } = loadModalApi({
    displayText: 'A < B & C',
    url: 'https://example.com/?q="value"&next=1',
    openInNewWindow: true
  });

  const inserted = api.confirm({
    editorTextarea: textarea,
    getMode: () => 'link'
  });

  assert.equal(
    inserted,
    '<a href="https://example.com/?q=&quot;value&quot;&amp;next=1" target="_blank">A &lt; B &amp; C</a>'
  );
});

test('링크 모달에 새 창 체크박스가 포함되어 있다', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="input-link-new-window"/);
  assert.match(html, />새 창에서 열기</);
});

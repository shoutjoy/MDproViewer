const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'viewmode', 'viewmode-edit-input.js'), 'utf8');

test('exposes an opt-in plain-text input setting for view mode', () => {
  assert.match(indexHtml, /id="view-mode-edit-enabled"[^>]*onchange="toggleViewModeEditSetting\(this\.checked\)"/);
  assert.match(indexHtml, /보기모드 텍스트 입력/);
  assert.match(indexHtml, /viewmode-edit-input\.js\?v=20260815-text-input-3/);
  assert.match(appSource, /const show = !!isEditMode;/);
  assert.match(appSource, /md-viewer-view-mode-text-input-change/);
  assert.match(source, /pre,code,table,svg,\.mermaid,\.katex,\.note-cover/);
});

test('plain-text input updates the Markdown source, autosaves, and supports IME composition', () => {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  const editor = {
    value: '기존 문장',
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  };
  const viewer = {
    innerText: '기존 문장',
    textContent: '기존 문장',
    scrollHeight: 100,
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute() {},
    addEventListener(type, fn) { listeners.set('viewer:' + type, fn); },
    contains() { return true; }
  };
  const viewport = { classList: { contains(name) { return name === 'hidden'; } } };
  const checkbox = { checked: true };
  let sink;
  let autosaves = 0;

  function makeElement(tag) {
    const ownListeners = new Map();
    const element = {
      tagName: tag.toUpperCase(),
      value: '',
      style: {},
      setAttribute() {},
      addEventListener(type, fn) { ownListeners.set(type, fn); },
      dispatch(type, event = {}) { const fn = ownListeners.get(type); if (fn) fn(event); },
      focus() {},
      blur() {}
    };
    if (tag === 'textarea') sink = element;
    return element;
  }

  const document = {
    readyState: 'complete',
    body: { appendChild() {} },
    head: { appendChild() {} },
    getElementById(id) {
      return {
        viewer,
        'viewer-container': { scrollTop: 0 },
        'viewer-edit-ta': editor,
        'content-viewport': viewport,
        'view-mode-edit-enabled': checkbox
      }[id] || null;
    },
    createElement: makeElement,
    addEventListener(type, fn) { listeners.set('document:' + type, fn); }
  };
  const context = {
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      updateContent(text) { editor.value = text; },
      performAutoSave() { autosaves += 1; },
      requestAnimationFrame(fn) { fn(); },
      setTimeout(fn) { fn(); }
    },
    document,
    localStorage: { getItem() { return '1'; } },
    console
  };
  context.window.window = context.window;
  vm.runInNewContext(source, context, { filename: 'viewmode-edit-input.js' });

  context.window.ViewModeTextInput.insertTextAtCaret('새');
  assert.equal(editor.value, '새기존 문장');
  assert.equal(autosaves, 1);
  assert.ok(classes.has('view-mode-text-input-enabled'));

  sink.dispatch('compositionstart');
  sink.value = '한';
  sink.dispatch('input', { isComposing: true });
  assert.equal(editor.value, '새기존 문장');
  sink.dispatch('compositionend');
  assert.equal(editor.value, '새한기존 문장');
  assert.equal(autosaves, 2);

  sink.dispatch('keydown', { key: 'Backspace', isComposing: false, preventDefault() {} });
  assert.equal(editor.value, '새기존 문장');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bridgeSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'ai-jena-embedded-bridge.js'),
  'utf8'
);

test('cursor insertion keeps the caret captured before edit-mode switching', () => {
  let messageHandler;
  let response;
  const editor = {
    value: 'alpha omega',
    selectionStart: 6,
    selectionEnd: 6,
    focus() {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    dispatchEvent() {}
  };
  const parent = {
    postMessage(message) {
      response = message;
    }
  };
  const root = {
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
    viewerSwitchToEdit() {
      // This reproduces the old failure: changing mode moves the live caret.
      editor.selectionStart = 0;
      editor.selectionEnd = 0;
    }
  };
  const context = {
    window: root,
    document: { getElementById: () => editor },
    URL,
    Event: class Event {},
    InputEvent: class InputEvent {}
  };

  vm.runInNewContext(bridgeSource, context);
  messageHandler({
    source: parent,
    origin: 'http://127.0.0.1:8765',
    data: {
      source: 'ai-jena-mdpro-parent',
      action: 'insert',
      requestId: 'cursor-regression',
      payload: { mode: 'cursor', markdown: 'INSERT ' }
    }
  });

  assert.equal(editor.value, 'alpha INSERT omega');
  assert.equal(editor.selectionStart, 13);
  assert.equal(response.ok, true);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const bridge = app.slice(app.indexOf('async function initializeTauriFileOpen()'), app.indexOf('async function applyIncomingOpenedFile('));

test('native startup and drop share the file-open flow and protect dirty documents', async () => {
  const handlers = new Map();
  const calls = [];
  const payload = { path: 'C:\\문서 폴더\\검증.md', text: '# 한글 문서' };
  const context = vm.createContext({
    window: { __TAURI__: { event: { listen: async (name, fn) => handlers.set(name, fn) } } },
    receivedExternalContent: false,
    tryGetInitialFileViaTauri: async () => payload,
    applyIncomingOpenedFile: async (file, options) => { calls.push({ file, options }); return true; },
    showToast: () => {}
  });
  vm.runInContext(bridge, context);
  await context.initializeTauriFileOpen();
  assert.equal(calls[0].file, payload);
  assert.equal(calls[0].options.askBeforeReplace, false);
  assert.equal(context.receivedExternalContent, true);
  await handlers.get('mdpro-open-file')({ payload });
  assert.equal(calls[1].options.askBeforeReplace, true);
  assert.ok(handlers.has('mdpro-open-file-error'));
});

test('native file opening runs before optional database initialization', () => {
  const startup = app.slice(app.indexOf('window.onload = async'));
  assert.ok(startup.indexOf('await tauriFileOpenReady') < startup.indexOf('await initDB()'));
  assert.match(app, /const tauriFileOpenReady = initializeTauriFileOpen\(\)/);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'Tauri/src-tauri/tauri.conf.json')));
  assert.equal(config.app.withGlobalTauri, true);
  assert.equal(config.app.windows[0].dragDropEnabled, true);
  const rust = fs.readFileSync(path.join(root, 'Tauri/src-tauri/src/main.rs'), 'utf8');
  assert.match(rust, /DragDropEvent::Drop/);
  assert.match(rust, /window.emit\("mdpro-open-file", payload\)/);
});

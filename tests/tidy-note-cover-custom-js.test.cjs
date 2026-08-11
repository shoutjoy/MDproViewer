const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function load(relativePath, sandbox) {
  vm.runInNewContext(read(relativePath), sandbox, { filename: relativePath });
}

function createTidySandbox() {
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
  sandbox.elements = elements;
  return sandbox;
}

test('noteCover formats compact metadata and leaves malformed blocks unchanged', () => {
  const sandbox = createTidySandbox();
  load('js/Tidy/tidy-actions.js', sandbox);
  const source = '<!-- note-cover\n{"v":2,"layout":{"align":"center"}}\n-->\n\n'
    + '<!-- note-cover\n{"enabled":true,}\n-->';
  const result = sandbox.TidyActions.formatNoteCoverBlocks(source);

  assert.equal(result.foundCount, 2);
  assert.equal(result.formattedCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.match(result.value, /"layout": \{\n\s+"align": "center"\n\s+\}/);
  assert.match(result.value, /\{"enabled":true,\}/);
});

test('noteCover applies only to the selected editor range', () => {
  const sandbox = createTidySandbox();
  load('js/Tidy/tidy-actions.js', sandbox);
  const compact = '<!-- note-cover\n{"v":2,"enabled":true}\n-->';
  const textarea = {
    value: `앞\n${compact}\n뒤`,
    selectionStart: 2,
    selectionEnd: 2 + compact.length,
    selectionDirection: 'forward',
    scrollTop: 12,
    scrollLeft: 0,
    focus() {},
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  };
  let markdown = '';
  sandbox.TidyActions.applyNoteCover({
    isEditMode: true,
    editorTextarea: textarea,
    setCurrentMarkdown(value) { markdown = value; },
    renderMarkdown() {},
    performAutoSave() {},
    showToast() {}
  });

  assert.match(textarea.value, /^앞\n<!-- note-cover\n\{\n  "v": 2,/);
  assert.match(textarea.value, /\n-->\n뒤$/);
  assert.equal(markdown, textarea.value);
});

test('custom TIDY scripts compile as functions and round-trip as GitHub JS files', () => {
  const sandbox = {
    console,
    document: {
      currentScript: { src: 'http://127.0.0.1/js/Tidy/tidy-script-manager.js' },
      getElementById() { return null; }
    },
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa,
    atob,
    Date,
    Math,
    Map,
    Set,
    Promise
  };
  sandbox.window = sandbox;
  load('js/Tidy/tidy-script-manager.js', sandbox);
  const code = 'function transform(source, context) { return source + "\\n" + context.scope; }';
  const fn = sandbox.TidyScriptManager.compileTransformer(code);
  assert.equal(fn('본문', { scope: 'selection' }), '본문\nselection');

  const record = {
    id: 'tidy_example', name: '예제 정리', code, enabled: true,
    sourceName: 'example.js', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T01:00:00.000Z'
  };
  const file = sandbox.TidyScriptManager.serializeGithubFile(record);
  const parsed = sandbox.TidyScriptManager.parseGithubFile(file, 'fallback.js');
  assert.equal(parsed.id, record.id);
  assert.equal(parsed.name, record.name);
  assert.equal(parsed.code, record.code);
  assert.match(file, /^\/\* mdviewer-tidy-script:v1/);
});

test('TIDY UI, popup input modes, storage policies, and GitHub file bridge are wired', () => {
  const index = read('index.html');
  const app = read('js/app.js');
  const popup = read('js/Tidy/tidy-script-manager.html');
  const stylesheet = read('css/style.css');
  const migration = read('js/storage/indexeddb-migration.js');
  const wasmPolicy = read('Local_SQLiteWASM/settings-policy.js');
  const pythonPolicy = read('LocalSave_sqlite/server/settings_policy.py');
  const github = read('js/GithubData/github-app.js');

  assert.match(index, />noteCover<\/button>/);
  assert.match(index, /class="tidy-quick-panel/);
  assert.match(index, /class="tidy-action-grid"/);
  assert.match(index, /class="tidy-action-button/);
  assert.match(index, />\+ 기능 추가<\/button>/);
  assert.match(index, /tidy-script-manager\.js/);
  assert.match(index, /tidyUi=20260811-1/);
  assert.match(index, /tidy-actions\.js\?v=20260811-base64-html-1/);
  assert.match(stylesheet, /#tidy-quick-panel\.tidy-menu-portal/);
  assert.match(stylesheet, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(stylesheet, /white-space:\s*nowrap/);
  assert.match(app, /function toggleTidyQuickMenu/);
  assert.match(read('js/Tidy/tidy-actions.js'), /document\.body\.appendChild\(panel\)/);
  assert.match(app, /function applyNoteCoverTidyInEditor\(\)/);
  assert.match(app, /TidyScriptManager\.configure/);
  assert.match(popup, /직접 입력/);
  assert.match(popup, /JS 업로드/);
  assert.match(popup, /SQLite 가져오기/);
  assert.match(popup, /GitHub 가져오기/);
  assert.match(migration, /tidyCustomScripts: \['collections', 'workspace'\]/);
  assert.match(wasmPolicy, /tidyCustomScripts: \['collections', 'workspace', \['array'\], 4 \* 1024 \* 1024\]/);
  assert.match(pythonPolicy, /"tidyCustomScripts": SettingRule\("collections", "workspace", \("array",\), 4 \* 1024 \* 1024\)/);
  assert.match(github, /async function upsertTextFile\(/);
  assert.match(github, /async function listTextFiles\(/);
  assert.match(github, /upsertTextFile: upsertTextFile/);
});


test('custom TIDY script collections pass migration and SQLite WASM policy validation', () => {
  const migrationSandbox = { console, Set };
  migrationSandbox.window = migrationSandbox;
  load('js/storage/indexeddb-migration.js', migrationSandbox);
  const value = [{
    id: 'tidy_policy', name: '정책 테스트', enabled: true,
    code: 'function transform(source) { return source.trim(); }'
  }];
  const classified = migrationSandbox.MDPIndexedDbMigration.classifyAiSettings({ tidyCustomScripts: value });
  assert.deepEqual(Array.from(classified.classification.safeKeys), ['tidyCustomScripts']);
  assert.equal(classified.settings[0].group, 'collections');

  const wasmSandbox = { TextEncoder, Set };
  wasmSandbox.self = wasmSandbox;
  load('Local_SQLiteWASM/settings-policy.js', wasmSandbox);
  const normalized = wasmSandbox.MDPWasmSettingPolicy.validateSetting({ key: 'tidyCustomScripts', value });
  assert.equal(normalized.scopeType, 'workspace');
  assert.equal(normalized.scopeId, 'workspace_default');
  assert.equal(normalized.valueType, 'array');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tool = require('../js/text-style/text-style.js');
const api = tool.__test;

test('눈누 @font-face 샘플에서 폰트 정보를 추출한다', () => {
  const css = `@font-face {
    font-family: 'YeogiOttaeJalnan';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_four@1.2/JalnanOTF00.woff') format('woff');
    font-weight: normal;
    font-display: swap;
  }`;
  const faces = api.parseFontFaceCss(css);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].family, 'YeogiOttaeJalnan');
  assert.equal(faces[0].url, 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_four@1.2/JalnanOTF00.woff');
  assert.equal(faces[0].format, 'woff');
  assert.equal(faces[0].weight, 'normal');
  assert.equal(faces[0].display, 'swap');
  assert.match(api.buildFontFaceCss(faces[0]), /font-family:"YeogiOttaeJalnan"/);
});

test('위험한 폰트 URL과 CSS 구분자는 저장하지 않는다', () => {
  const css = `@font-face { font-family: 'Bad'; src: url('javascript:alert(1)'); }
    @font-face { font-family: 'Good; color:red'; src: url('https://example.com/font.woff2'); }
    @font-face { font-family: 'Credential'; src: url('https://user:pass@example.com/font.woff2'); }`;
  assert.deepEqual(api.parseFontFaceCss(css), []);
  assert.equal(api.safeFontFamilyValue('Font; color:red'), '');
});

test('선택한 Markdown은 보존하면서 모든 서식을 감싼다', () => {
  const html = api.buildStyledHtml('**선택 문장**', {
    fontSize: '14pt',
    fontFamily: '"YeogiOttaeJalnan",sans-serif',
    color: '#ef4444',
    backgroundColor: '#fff59d',
    bold: true,
    italic: true
  });
  assert.equal(
    html,
    '<em><strong><span style="font-size:14pt;font-family:&quot;YeogiOttaeJalnan&quot;,sans-serif;color:#ef4444;background-color:#fff59d;">**선택 문장**</span></strong></em>'
  );
});

test('윗첨자와 아랫첨자는 HTML 태그로 선택 내용을 감싼다', () => {
  assert.equal(api.buildStyledHtml('2', { superscript: true }), '<sup>2</sup>');
  assert.equal(api.buildStyledHtml('2', { subscript: true }), '<sub>2</sub>');
});

test('글자 크기는 6pt~96pt 범위로 제한한다', () => {
  assert.equal(api.normalizeFontSize(2), '6pt');
  assert.equal(api.normalizeFontSize(14.26), '14.3pt');
  assert.equal(api.normalizeFontSize(120), '96pt');
});

test('Alt+L UI와 app 연결이 문서에 포함되어 있다', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const inDb = fs.readFileSync(path.join(root, 'js', 'inDB', 'inDB.js'), 'utf8');
  const settingsUi = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
  assert.match(html, /id="text-style-modal"/);
  assert.match(html, /id="style-font-family"/);
  assert.match(html, /id="text-style-font-face-input"/);
  assert.match(html, /href="https:\/\/noonnu\.cc\/font_page"/);
  assert.match(html, /js\/text-style\/text-style\.js/);
  assert.match(html, /id="style-enable-superscript"/);
  assert.match(html, /id="style-enable-subscript"/);
  assert.match(app, /TextStyleTool\.open/);
  assert.match(app, /TextStyleTool\.applySelection/);
  assert.match(app, /insertAtCursor\('superscript'\)/);
  assert.match(app, /insertAtCursor\('subscript'\)/);
  assert.match(inDb, /const DB_VERSION = 8/);
  assert.match(inDb, /createObjectStore\('fonts', \{ keyPath: 'id' \}\)/);
  assert.match(inDb, /fonts: '사용자 폰트'/);
  assert.match(app, /TextStyleTool\.setDatabase\(db\)/);
  assert.match(app, /TextStyleTool\.setSqliteStorage\(window\.MDPStorage\)/);
  assert.match(settingsUi, /사용자 폰트 · textStyleCustomFonts/);
});

test('추가한 폰트는 inDB fonts 저장소에 기록되고 삭제된다', async () => {
  const records = new Map();
  const database = {
    objectStoreNames: { contains(name) { return name === 'fonts'; } },
    transaction(name, mode) {
      assert.equal(name, 'fonts');
      const tx = {
        objectStore() {
          return {
            getAll() {
              const request = {};
              queueMicrotask(() => {
                request.result = Array.from(records.values());
                if (request.onsuccess) request.onsuccess();
              });
              return request;
            },
            clear() { records.clear(); },
            put(record) { records.set(record.id, record); }
          };
        }
      };
      if (mode === 'readwrite') queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
      return tx;
    }
  };

  await tool.setDatabase(database);
  const added = await tool.addCustomFonts(`@font-face {
    font-family: 'YeogiOttaeJalnan';
    src: url('https://cdn.jsdelivr.net/font.woff') format('woff');
    font-display: swap;
  }`);
  assert.equal(added.ok, true);
  assert.equal(records.size, 1);
  assert.equal(Array.from(records.values())[0].family, 'YeogiOttaeJalnan');
  assert.equal(Array.from(records.values())[0].recordType, 'webfont');

  await tool.removeCustomFont('YeogiOttaeJalnan');
  assert.equal(records.size, 0);
});

test('추가 및 삭제한 폰트 배열을 SQLite 설정 저장소에도 미러링한다', async () => {
  const writes = [];
  const sqliteStorage = {
    getStatus() {
      return {
        initialized: true,
        sqliteHealth: { available: true, capabilities: { settings: true } }
      };
    },
    async putSqliteSetting(setting) {
      writes.push(structuredClone(setting));
      return setting;
    }
  };

  await tool.setSqliteStorage(sqliteStorage);
  const added = await tool.addCustomFonts(`@font-face {
    font-family: 'SQLiteMirrorFont';
    src: url('https://cdn.jsdelivr.net/sqlite-mirror.woff2') format('woff2');
  }`);
  assert.equal(added.sqliteSaved, true);
  assert.equal(writes.at(-1).key, 'textStyleCustomFonts');
  assert.equal(writes.at(-1).scopeType, 'workspace');
  assert.equal(writes.at(-1).value.at(-1).family, 'SQLiteMirrorFont');

  await tool.removeCustomFont('SQLiteMirrorFont');
  assert.equal(writes.at(-1).value.some((font) => font.family === 'SQLiteMirrorFont'), false);
});

test('SQLite 서버와 WASM 정책이 사용자 폰트 배열 저장을 허용한다', () => {
  const root = path.join(__dirname, '..');
  const serverPolicy = fs.readFileSync(path.join(root, 'LocalSave_sqlite', 'server', 'settings_policy.py'), 'utf8');
  const wasmPolicy = fs.readFileSync(path.join(root, 'Local_SQLiteWASM', 'settings-policy.js'), 'utf8');
  assert.match(serverPolicy, /"textStyleCustomFonts": SettingRule\("collections", "workspace", \("array",\), 4 \* 1024 \* 1024\)/);
  assert.match(wasmPolicy, /textStyleCustomFonts: \['collections', 'workspace', \['array'\], 4 \* 1024 \* 1024\]/);
  const sandbox = { self: {}, TextEncoder };
  vm.runInNewContext(wasmPolicy, sandbox);
  const normalized = sandbox.self.MDPWasmSettingPolicy.validateSetting({
    key: 'textStyleCustomFonts',
    value: [{ family: 'TestFont', url: 'https://example.com/font.woff2' }]
  });
  assert.equal(normalized.group, 'collections');
  assert.equal(normalized.scopeType, 'workspace');
});

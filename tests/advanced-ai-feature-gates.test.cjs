const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('advanced AI tools are separate opt-in settings and default disabled', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  for (const id of ['mermaid-ref-ai-enabled', 'img2math-enabled', 'tidy-jena-enabled']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /mermaidRefAi: value\.mermaidRefAiEnabled === true/);
  assert.match(app, /img2math: value\.img2mathEnabled === true/);
  assert.match(app, /tidyJena: value\.tidyJenaEnabled === true/);
  assert.match(app, /if \(!advancedAiFeatureFlags\.img2math\)/);
});

test('Mermaid Ref and TIDY child windows enforce their feature gates', () => {
  const mermaid = read('js/mermaid/mermaid-editor/app.js');
  const tidyHost = read('js/Tidy/tidy-script-manager.js');
  const tidyPopup = read('js/Tidy/tidy-script-manager.html');
  assert.match(mermaid, /applyMermaidAiFeatureAvailability/);
  assert.match(mermaid, /mermaidAiPanel\.hidden = !mermaidAiFeatureEnabled/);
  assert.match(tidyHost, /advancedAiFeatureFlags\.tidyJena/);
  assert.match(tidyHost, /환경설정에서 TIDY JS Jena 인공지능을 허용/);
  assert.match(tidyPopup, /tidyJenaEnabled/);
  assert.match(tidyPopup, /'jena-tab'\)\.hidden = true/);
});

test('advanced AI settings are allowed by both SQLite backends', () => {
  const wasm = read('Local_SQLiteWASM/settings-policy.js');
  const server = read('LocalSave_sqlite/server/settings_policy.py');
  for (const key of ['mermaidRefAiEnabled', 'img2mathEnabled', 'tidyJenaEnabled']) {
    assert.match(wasm, new RegExp(key));
    assert.match(server, new RegExp(key));
  }
});

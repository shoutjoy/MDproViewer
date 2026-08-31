const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const LocalAI = require(path.join(root, 'AI_App', 'ai_local', 'local-ai.js'));
const markup = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'lmstudio-settings.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

assert.match(markup, /Base URL 1 · 로컬/);
assert.match(markup, /id="settings-lmstudio-base-url-secondary"/);
assert.match(markup, /Base URL 2 · 온라인/);
assert.match(markup, /name="settings-lmstudio-base-url-slot" value="primary"/);
assert.match(markup, /name="settings-lmstudio-base-url-slot" value="secondary"/);
assert.match(app, /activeBaseUrlSlot === 'secondary' \? baseUrlSecondary : baseUrlPrimary/);

const legacyStorage = memoryStorage({
  [LocalAI.storageKey]: JSON.stringify({ baseUrl: 'http://127.0.0.1:5678/v1', model: 'legacy-model' })
});
const migrated = LocalAI.loadConfig(legacyStorage);
assert.equal(migrated.baseUrlPrimary, 'http://127.0.0.1:5678/v1');
assert.equal(migrated.baseUrlSecondary, '');
assert.equal(migrated.activeBaseUrlSlot, 'primary');
assert.equal(migrated.baseUrl, migrated.baseUrlPrimary);

const saved = LocalAI.saveConfig({
  baseUrlPrimary: 'http://127.0.0.1:5678/v1',
  baseUrlSecondary: 'https://online.example/v1',
  activeBaseUrlSlot: 'secondary',
  model: 'dual-url-model'
}, memoryStorage());
assert.equal(saved.baseUrlPrimary, 'http://127.0.0.1:5678/v1');
assert.equal(saved.baseUrlSecondary, 'https://online.example/v1');
assert.equal(saved.activeBaseUrlSlot, 'secondary');
assert.equal(saved.baseUrl, 'https://online.example/v1');

const fallback = LocalAI.saveConfig({
  baseUrlPrimary: 'http://127.0.0.1:5678/v1',
  baseUrlSecondary: '',
  activeBaseUrlSlot: 'secondary',
  model: 'fallback-model'
}, memoryStorage());
assert.equal(fallback.activeBaseUrlSlot, 'primary');
assert.equal(fallback.baseUrl, fallback.baseUrlPrimary);

console.log('LM Studio dual Base URL tests passed');

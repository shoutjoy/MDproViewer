const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const LocalAI = require(path.join(root, 'AI_App', 'ai_local', 'local-ai.js'));
const markup = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'lmstudio-settings.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const tauriMain = fs.readFileSync(path.join(root, 'Tauri', 'src-tauri', 'src', 'main.rs'), 'utf8');

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
assert.doesNotMatch(markup, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
assert.match(markup, /<div class="space-y-3">[\s\S]*Base URL 1 · 로컬[\s\S]*Base URL 2 · 온라인/);
assert.match(markup, /name="settings-lmstudio-base-url-slot" value="primary"/);
assert.match(markup, /name="settings-lmstudio-base-url-slot" value="secondary"/);
assert.match(markup, /API Key \(선택\)[\s\S]*Base URL 1 · 로컬/);
assert.match(markup, /onchange="normalizeLMStudioBaseUrlField\(this, false\)"/);
assert.match(markup, /생략한 <code>\/v1<\/code>은 자동으로 추가/);
assert.match(markup, /id="settings-lmstudio-advanced"/);
assert.match(markup, /고급 생성 설정 · Temperature \/ 토큰 \/ 추론/);
assert.match(markup, /id="settings-lmstudio-model-to-load"/);
assert.match(markup, /id="settings-lmstudio-model-max-tokens"/);
assert.match(markup, /모델 제시값 적용/);
assert.match(markup, /id="settings-lmstudio-timeout"[\s\S]*?value="720"/);
assert.match(app, /loadSelectedSettingsLMStudioModel/);
assert.match(app, /listLMStudioModels\(config\)/);
assert.match(app, /firstInstance && firstInstance\.contextLength/);
assert.match(app, /applySettingsLMStudioModelMaxTokens/);
assert.match(fs.readFileSync(path.join(root, 'AI_App', 'ai_local', 'local-ai.js'), 'utf8'), /lmstudio_api_request/);
assert.match(tauriMain, /async fn lmstudio_api_request/);
assert.match(tauriMain, /Only a local LM Studio HTTP address is allowed/);
assert.match(tauriMain, /generate_handler!\[[\s\S]*deepseek_api_request,[\s\S]*lmstudio_api_request,[\s\S]*get_initial_file[\s\S]*\]/);
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

const autoVersioned = LocalAI.saveConfig({
  baseUrlPrimary: 'http://127.0.0.1:5678',
  baseUrlSecondary: 'https://online.example',
  activeBaseUrlSlot: 'primary',
  model: 'auto-v1-model'
}, memoryStorage());
assert.equal(autoVersioned.baseUrlPrimary, 'http://127.0.0.1:5678/v1');
assert.equal(autoVersioned.baseUrlSecondary, 'https://online.example/v1');

assert.equal(LocalAI.defaults.timeoutMs, 720000);

console.log('LM Studio dual Base URL tests passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const start = source.indexOf('const SETTINGS_EXPORT_AI_LOCAL_KEY_PREFIXES =');
const end = source.indexOf('function downloadTextFile', start);
assert.ok(start >= 0 && end > start, 'settings export helpers must exist');

const values = new Map([
  ['ss_ai_chat_fast_mode', '1'],
  ['ss_ai_chat_academic_search_count', '25'],
  ['ss_ai_chat_deepseek_model', 'deepseek-v4-pro'],
  ['ss_viewer_scholar_ai_translation_direction', 'ko-en'],
  ['ss_image_ratio', '16:9'],
  ['local_ai_lmstudio_settings_v1', '{"temperature":0.2}'],
  ['mdpro_ai_writing_style_prompt_v1', 'custom'],
  ['ss_ai_chat_history_v1', 'must-not-export'],
  ['unrelated_key', 'must-not-export']
]);
const storage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] ?? null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const context = { localStorage: storage, Date };
vm.runInNewContext('const SETTINGS_EXPORT_LOCAL_KEYS = [];\n' + source.slice(start, end) + '\nthis.api={buildSettingsExportPayload,isSettingsExportLocalKey};', context);

const payload = context.api.buildSettingsExportPayload({ provider: 'openai' });
assert.equal(payload.version, 2);
assert.equal(payload.localStorage.ss_ai_chat_fast_mode, '1');
assert.equal(payload.localStorage.ss_ai_chat_academic_search_count, '25');
assert.equal(payload.localStorage.ss_viewer_scholar_ai_translation_direction, 'ko-en');
assert.equal(payload.localStorage.ss_image_ratio, '16:9');
assert.equal(payload.localStorage.local_ai_lmstudio_settings_v1, '{"temperature":0.2}');
assert.equal(payload.localStorage.mdpro_ai_writing_style_prompt_v1, 'custom');
assert.equal(payload.localStorage.ss_ai_chat_history_v1, undefined);
assert.equal(payload.localStorage.unrelated_key, undefined);
assert.equal(context.api.isSettingsExportLocalKey('ss_ai_chat_show_reasoning'), true);
assert.equal(context.api.isSettingsExportLocalKey('ss_ai_chat_history_v1'), false);
assert.equal(context.api.isSettingsExportLocalKey('ss_ai_chat_internet_search_enabled'), true);

console.log('settings AI export tests passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

assert.match(html, /id="litertlm-settings-body" class="hidden space-y-3"/);
assert.match(html, /id="litertlm-settings-fold-btn"[\s\S]*?aria-expanded="false"[\s\S]*?>펼치기<\/button>/);
assert.match(app, /setLiteRTLMSettingsFolded\(localStorage\.getItem\('ss_litertlm_settings_folded'\) !== '0'\)/);
assert.match(html, /id="settings-litertlm-cloud-url"[^>]*value="https:\/\/llm1\.abci\.co\.kr\/v1"/);
assert.match(html, /id="settings-litertlm-cloud-url"[^>]*readonly/);
assert.doesNotMatch(html, /id="settings-litertlm-local-mode"/);
assert.doesNotMatch(html, /id="settings-litertlm-local-url"/);
assert.match(html, /onclick="loadSettingsLiteRTLMModels\(\)"[^>]*>모델 가져오기<\/button>/);
assert.match(html, /onclick="testSettingsLiteRTLMResponse\(\)"[^>]*>연결 테스트<\/button>/);
assert.match(app, /const LITERTLM_CLOUD_BASE_URL = 'https:\/\/llm1\.abci\.co\.kr\/v1';/);
assert.match(app, /settings\.mode = 'cloud';[\s\S]*?settings\.cloudUrl = LITERTLM_CLOUD_BASE_URL;/);
assert.match(app, /const mode = 'cloud';/);
assert.match(app, /requestLiteRTLM\('\/models'/);
assert.match(app, /requestLiteRTLM\('\/chat\/completions'/);
assert.doesNotMatch(html, /gemma-4-E2B-it\.litertlm/);
assert.match(html, /<option value="">모델 가져오기를 실행하세요<\/option>/);
assert.match(app, /if \(!settings\.model\) \{[\s\S]*?await loadSettingsLiteRTLMModels\(\)/);
assert.match(app, /const LITERTLM_LEGACY_MODEL = 'gemma-4-E2B-it\.litertlm';/);
assert.match(app, /const LITERTLM_MIGRATED_MODEL = 'gemma-4-E4B';/);
assert.match(app, /settings\.model = LITERTLM_MIGRATED_MODEL;[\s\S]*?localStorage\.setItem\(LITERTLM_SETTINGS_KEY/);
assert.match(app, /const AI_PROVIDER_FOLDS_DEFAULT_VERSION_KEY = 'md_viewer_ai_provider_folds_default_v1';/);
assert.match(app, /function ensureAiProviderFoldsDefault\(\)[\s\S]*?AI_CHAT_SETTINGS_FOLD_KEY[\s\S]*?SCHOLAR_LM_SETTINGS_FOLD_KEY[\s\S]*?SCHOLAR_OLLAMA_SETTINGS_FOLD_KEY[\s\S]*?'ss_litertlm_settings_folded'/);
assert.match(html, /id="ai-chat-settings-fold-btn"[\s\S]*?aria-expanded="false"[\s\S]*?>펼치기<\/button>/);
assert.match(html, /id="ai-chat-settings-body" class="hidden"/);
assert.match(css, /#ai-link-settings-block #litertlm-settings-body\s*\{[\s\S]*?padding: 4px 18px 18px;/);
assert.match(css, /\.litertlm-save-button\s*\{[\s\S]*?background: #2563eb !important;[\s\S]*?color: #fff !important;/);
assert.match(css, /\.litertlm-parameter-grid > label\s*\{[\s\S]*?gap: 6px;/);

console.log('LiteRT-LM settings UI tests passed');

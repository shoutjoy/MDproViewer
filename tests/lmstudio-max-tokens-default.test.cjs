const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const localAI = fs.readFileSync('AI_App/ai_local/local-ai.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

test('LM Studio Max tokens defaults to 16,384 everywhere', () => {
  assert.match(localAI, /maxTokens: 16384/);
  assert.match(index, /id="settings-lmstudio-max-tokens"[^>]*value="16384"/);
  assert.match(app, /settings-lmstudio-max-tokens'\) \|\| 16384/);
  assert.match(app, /config\.maxTokens \|\| 16384/);
});

test('the former 8,192 default is migrated once without replacing custom values', () => {
  assert.match(app, /LMSTUDIO_MAX_TOKENS_DEFAULT_REVISION_KEY/);
  assert.match(app, /Number\(config\.maxTokens\) === 8192/);
  assert.match(app, /maxTokens: 16384/);
  assert.match(app, /'16384-v1'/);
});

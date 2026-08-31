const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const localAI = fs.readFileSync(path.join(root, 'AI_App', 'ai_local', 'local-ai.js'), 'utf8');

test('FAST mode is a persisted quick-mode option with minimal context', () => {
  assert.match(chat, /id="ai-chat-fast-mode"/);
  assert.match(chat, /FAST_MODE_KEY/);
  assert.match(chat, /valid\.slice\(state\.fastMode \? -1/);
  assert.match(chat, /explanation, rationale, preface, checklist/);
});

test('FAST mode skips searches and safety option extends slow connections to 120 seconds', () => {
  assert.match(chat, /!state\.fastMode && state\.academicSearchEnabled/);
  assert.match(chat, /!state\.fastMode && state\.internetSearchEnabled/);
  assert.match(app, /config\.fastSafetyTimeout === false[\s\S]*Math\.max\(configuredFastTimeoutMs, 120000\)/);
  assert.match(app, /fastMode \? fastSafetyTimeoutMs/);
});

test('FAST streaming continues past the time limit once an answer has started', () => {
  assert.match(app, /completeStreaming: fastMode && config\.fastCompleteStreaming !== false/);
  assert.match(localAI, /options\.completeStreaming === true[\s\S]*requestSignal\.disarmTimeout\(\)/);
  assert.match(localAI, /xhr\.timeout = 0/);
});

test('AI Jena keeps FAST limits out of the chat header and persists menu settings', () => {
  assert.doesNotMatch(chat, /id="ai-chat-fast-token-limit"/);
  assert.doesNotMatch(chat, /id="ai-chat-fast-time-limit"/);
  assert.match(chat, /id="ai-chat-layout-fast-token-limit"/);
  assert.match(chat, /id="ai-chat-layout-fast-time-limit"/);
  assert.match(chat, /fastMaxTokens: fastMaxTokens/);
  assert.match(chat, /fastTimeoutMs: fastTimeoutSeconds \* 1000/);
});

test('FAST limits are also available in menu settings and below answer font size', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /id="ai-chat-menu-enabled"[\s\S]*id="settings-ai-jena-fast-token-limit"[\s\S]*id="settings-ai-jena-fast-time-limit"/);
  assert.match(chat, /id="ai-chat-answer-font-size"[\s\S]*id="ai-chat-layout-fast-token-limit"[\s\S]*id="ai-chat-layout-fast-time-limit"/);
  assert.match(app, /function saveAiJenaFastLimitsFromSettings\(\)/);
});

test('FAST Mermaid requests return code only and use a bounded local-model budget', () => {
  assert.match(chat, /return exactly one fenced mermaid code block and nothing else/);
  assert.match(chat, /MERMAID_DARK_MODE_PROMPT_RULE/);
  assert.match(app, /Number\(config\.fastMaxTokens\) \|\| 4000/);
  assert.match(app, /Number\(config\.fastTimeoutMs\) \|\| 580000/);
  assert.match(app, /fastMode\s*\? fastSafetyTimeoutMs/);
});

test('built-in Mermaid rule is saved to the AI data center', () => {
  assert.match(chat, /recordType: 'prompt_rule'/);
  assert.match(chat, /category: 'fine_tuning_rule'/);
  assert.match(chat, /prompt-rule:' \+ revision/);
  assert.match(chat, /특수문자가 들어가면 라벨 전체를 큰따옴표로 감싼다/);
});

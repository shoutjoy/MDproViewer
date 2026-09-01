const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

test('AI Jena toolbar exposes writing style settings beside layout', () => {
  const layout = chat.indexOf('id="ai-chat-layout-menu-button"');
  const style = chat.indexOf('id="ai-chat-writing-style-settings"');
  const close = chat.indexOf('id="ai-chat-close"');
  assert.ok(layout >= 0 && style > layout && close > style);
  assert.match(chat, /openAIWritingStyleSettings/);
});

test('writing style settings support multiple source files and package transfer', () => {
  assert.match(html, /id="ai-writing-style-files"[^>]*multiple/);
  assert.match(html, /exportAIWritingStylePackage/);
  assert.match(html, /importAIWritingStylePackage/);
  assert.match(app, /mdpro_writing_styles/);
  assert.match(app, /source_files/);
  assert.match(app, /buildAIWritingStylePrompt/);
  assert.match(app, /localStorage\.setItem\(AI_WRITING_STYLE_PROMPT_KEY, prompt\)/);
  assert.match(app, /writeAIWritingStyleSetting\('active_prompt', prompt\)/);
});

test('generated prompt separates style imitation from source facts', () => {
  assert.match(app, /자료의 사실·주장·고유명사·수치는 답변 내용으로 복사하지 말고 문체적 특성만 모방한다/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

test('layout popup contains a persisted 5-25px answer font-size control', () => {
  assert.match(chat, /id="ai-chat-answer-font-size" type="range" min="5" max="25"/);
  assert.match(chat, /ANSWER_FONT_SIZE_KEY/);
  assert.match(chat, /Math\.max\(5, Math\.min\(25/);
  assert.match(chat, /--ai-chat-answer-font-size/);
  assert.match(css, /font-size: var\(--ai-chat-answer-font-size, 14px\)/);
});


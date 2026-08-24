const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

test('layout popup contains a persisted 5-25px answer font-size control', () => {
  assert.match(chat, /ai-chat-answer-font-head"><span>답변 폰트<\/span>/);
  assert.doesNotMatch(chat, />답변 폰트 크기<\/span>/);
  assert.match(chat, /id="ai-chat-answer-font-size" type="range" min="5" max="25"/);
  assert.match(chat, /ANSWER_FONT_SIZE_KEY/);
  assert.match(chat, /Math\.max\(5, Math\.min\(25/);
  assert.match(chat, /--ai-chat-answer-font-size/);
  assert.match(css, /font-size: var\(--ai-chat-answer-font-size, 14px\)/);
  assert.match(css, /\.ai-chat-answer-font-controls\s*\{[^}]*grid-template-columns:\s*30px minmax\(0, 1fr\) 30px/);
});

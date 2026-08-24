const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');
const css = fs.readFileSync('AI_App/aiChat/ai-chat.css', 'utf8');

test('conversation history has a close button beside new conversation', () => {
  assert.match(chat, /id="ai-chat-history-new"[\s\S]*id="ai-chat-history-close"/);
  assert.match(chat, /ai-chat-history-close'\)\.addEventListener\('click', closeHistorySidebar\)/);
});

test('conversation history width can be resized and persists', () => {
  assert.match(chat, /HISTORY_WIDTH_KEY = 'ss_ai_chat_history_width'/);
  assert.match(chat, /id="ai-chat-history-resizer"/);
  assert.match(chat, /setupHistoryResize\(\)/);
  assert.match(chat, /setPointerCapture/);
  assert.match(css, /--ai-chat-history-width/);
  assert.match(css, /cursor: ew-resize/);
});

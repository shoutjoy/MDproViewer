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
  assert.match(chat, /Math\.max\(140, Math\.min\(520/);
  assert.match(css, /\.ai-chat-history-sidebar\s*\{[\s\S]*?min-width:\s*140px/);
  assert.match(css, /cursor: ew-resize/);
});

test('conversation history splits the chat instead of covering it', () => {
  assert.doesNotMatch(css, /layout-popup\.history-force-open[\s\S]{0,300}position:\s*absolute/);
  assert.match(css, /layout-popup\.history-force-open[\s\S]{0,300}position:\s*relative/);
  assert.match(css, /layout-popup\.history-force-open[\s\S]{0,400}flex-basis/);
});

test('history footer offers load and confirmed clearing controls', () => {
  assert.match(chat, /id="ai-chat-history-load">대화 기록 불러오기/);
  assert.match(chat, /id="ai-chat-history-clear"[\s\S]*대화 기록 지우기/);
  assert.match(chat, /function clearConversationHistory\(\)[\s\S]*root\.confirm/);
  assert.match(css, /container-name:\s*ai-chat-history/);
  assert.match(css, /@container ai-chat-history \(max-width:\s*235px\)[\s\S]*grid-template-columns:\s*1fr/);
});

test('conversation rename opens an inline form and delete stays beside it', () => {
  assert.match(chat, /ai-chat-history-rename[\s\S]*ai-chat-history-delete/);
  assert.match(chat, /className = 'ai-chat-history-rename-form'/);
  assert.doesNotMatch(chat, /root\.prompt\('새 대화 이름을 입력하세요/);
  assert.match(css, /\.ai-chat-history-delete:hover\s*\{[^}]*background:\s*#b42336/);
});

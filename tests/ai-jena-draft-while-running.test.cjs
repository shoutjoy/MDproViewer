const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

test('composer stays editable while an answer is running', () => {
  assert.match(chat, /send\.disabled = state\.storageInitializing;/);
  assert.match(chat, /input\.disabled = state\.storageInitializing;/);
  assert.doesNotMatch(chat, /input\.disabled = state\.running \|\| state\.storageInitializing;/);
  assert.match(chat, /답변 중 · 다음 질문을 미리 입력하세요\./);
});

test('sending while running queues the request and starts it after completion', () => {
  assert.match(chat, /var queuedRequests = \[\];/);
  assert.match(chat, /if \(state\.running && !queuedRequest\) return queueComposerRequest\(\);/);
  assert.match(chat, /queuedRequests\.push\(\{[\s\S]*?text: text,[\s\S]*?attachments: pendingAttachments\.slice\(\),[\s\S]*?selectionSnapshot: documentSelectionSnapshot,[\s\S]*?replaceSelection: selectionWriteModeActive\(\)[\s\S]*?\}\);/);
  assert.match(chat, /var nextQueuedRequest = queuedRequests\.shift\(\) \|\| null;/);
  assert.match(chat, /sendMessage\(nextQueuedRequest\);/);
  assert.match(chat, /대기 추가/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

const start = chat.indexOf('function createReasoningActions(');
const end = chat.indexOf('\n  async function insertQuestionAnswer(', start);
assert.ok(start >= 0 && end > start, 'reasoning action builder exists');
const actions = chat.slice(start, end);

for (const label of ['MD raw 복사', 'MD render 복사', 'Q&A 복사', '새창에서 보기', '추론 지우기']) {
  assert.match(actions, new RegExp(label));
}
assert.match(actions, /appendAssistantDocumentInsertActions\(actions, messageIndex, reasoningMessage/);
assert.match(actions, /copyQuestionAnswer\(messageIndex, reasoningMessage\)/);
assert.match(actions, /openAnswerPreviewWindow\(messageIndex, reasoningMessage\)/);
assert.match(chat, /reasoning\.appendChild\(createReasoningActions\(messageIndex, message\)\)/);
assert.match(css, /\.ai-chat-reasoning-actions\s*\{/);

console.log('AI Jena reasoning action tests passed');

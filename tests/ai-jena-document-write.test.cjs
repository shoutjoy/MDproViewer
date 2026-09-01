const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

assert.match(chat, /id="ai-chat-document-write"/);
assert.match(chat, /id="ai-chat-document-write-mode"/);
assert.match(chat, /✍ 문서에 작성/);
assert.match(chat, /← 현재 커서/);
assert.match(chat, /↓ 맨 아래/);
assert.match(chat, /↔ 선택 영역/);
assert.match(chat, /function captureDocumentSelection/);
assert.match(chat, /selectionSnapshot: documentSelectionSnapshot/);
assert.match(chat, /replaceSelection: selectionWriteModeActive\(\)/);
assert.ok(chat.indexOf('id="ai-chat-internet-toggle"') < chat.indexOf('id="ai-chat-document-write"'));
assert.ok(chat.indexOf('id="ai-chat-document-write"') < chat.indexOf('id="ai-chat-academic-count-wrap"'));
assert.match(chat, /function visibleDocumentStreamAnswer/);
assert.match(chat, /finishDocumentWrite\(assistantMessage\.content, 'completed'\)/);
assert.match(chat, /outputTarget: documentWriteSession \? 'document' : 'chat'/);
assert.match(chat, /문서에 작성된 답변 · 기록 펼쳐보기/);
assert.match(app, /function beginAIChatDocumentWrite/);
assert.match(app, /captureDocumentSelection: function/);
assert.match(app, /선택 이후 문서가 변경되어 원래 영역을 안전하게 수정할 수 없습니다/);
assert.match(app, /status === 'error' && session\.replacedSelection \? session\.originalText : text/);
assert.match(app, /function followAIChatDocumentWrite/);
assert.match(app, /followAIChatDocumentWrite\(session\)/);
assert.match(app, /beginDocumentWrite: function/);
assert.match(app, /updateDocumentWrite: function/);
assert.match(app, /finishDocumentWrite: function/);
assert.match(css, /\.ai-chat-document-write-toggle/);

console.log('AI Jena document write wiring verified.');

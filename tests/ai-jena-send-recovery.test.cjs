const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

assert.match(chat, /var conversationStoreReadyPromise = null;/);
assert.match(chat, /addEventListener\('click', requestSendMessage\)/);
assert.match(chat, /function requestSendMessage\(\)\s*\{[\s\S]*?Promise\.resolve\(sendMessage\(\)\)\.catch/);
assert.match(chat, /if \(state\.storageInitializing\) \{[\s\S]*?await conversationStoreReadyPromise;[\s\S]*?대화 저장소 초기화가 완료되지 않았습니다/);
assert.match(chat, /conversationStoreReadyPromise = initializeConversationStore\(\);/);
assert.match(chat, /setStatus\('프롬프트를 전송하지 못했습니다: ' \+ message, 'error'\)/);

console.log('AI Jena send recovery tests passed');

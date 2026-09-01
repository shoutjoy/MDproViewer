const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

assert.match(chat, /function cleanAssistantProtocolArtifacts\(value, streaming\)/);
assert.match(chat, /replace\(\/\\\\\*\\\[\\s\*\\\\\*\(\\\/\?\)\\s\*\(CHECKLIST\|EXPLANATION\|ANSWER\)/);
assert.match(chat, /var visibleLiveAnswer = cleanAssistantProtocolArtifacts\(liveStream\.answer, true\)/);
assert.match(chat, /answer = cleanAssistantProtocolArtifacts\(answer \|\| raw, false\)/);
assert.match(chat, /\(\?:&#x20;\|&#32;\|&nbsp;\)/);

console.log('AI Jena escaped answer-tag sanitizer tests passed');

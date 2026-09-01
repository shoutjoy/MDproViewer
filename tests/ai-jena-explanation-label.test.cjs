const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

test('EXPLANATION content is presented as Jena\'s Thought', () => {
  assert.match(chat, /explanationHead\.innerHTML = '<strong>Jena\\'s Thought<\/strong>';/);
  assert.match(chat, /\[Jena\\'s Thought\]/);
  assert.match(chat, /### Jena\\'s Thought/);
  assert.doesNotMatch(chat, /explanationHead\.innerHTML = '<strong>응답 설명<\/strong>';/);
});

test('EXPLANATION protocol tags remain supported for existing responses', () => {
  assert.match(chat, /\\\[EXPLANATION\\\]/);
  assert.match(chat, /\\\[\\\/EXPLANATION\\\]/);
});

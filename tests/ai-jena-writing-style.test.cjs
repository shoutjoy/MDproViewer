const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'README.md'), 'utf8');

test('writing style remains a mandatory wrapper around custom academic prompts', () => {
  assert.match(chat, /\[필수 답변 문체 규칙\]/);
  assert.match(chat, /customPrompt \|\| '상투적인/);
  assert.match(chat, /최종 답변을 내기 직전에 문장 종결과 어휘가 이 문체를 위반하지 않는지/);
  assert.doesNotMatch(chat, /if \(customPrompt\) return customPrompt/);
});

test('FAST mode also receives the selected writing style', () => {
  assert.match(chat, /FAST mode[\s\S]*writingStyleInstruction\(\{ academic: false \}\)[\s\S]*MERMAID_DARK_MODE_PROMPT_RULE/);
});

test('documentation states strict, provider-independent style enforcement', () => {
  assert.match(readme, /공급자와 응답 모드에 관계없이/);
  assert.match(readme, /참고 지침이 아니라 최종 답변 전체에 적용되는 필수 출력 제약/);
});

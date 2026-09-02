const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

test('internet evidence is bounded so local models retain answer tokens', () => {
  assert.match(chat, /var maxEvidenceChars = 9000/);
  assert.match(chat, /snippetLimit[\s\S]*\.slice\(0, snippetLimit\)/);
  assert.match(chat, /evidence\.length > maxEvidenceChars/);
});

test('the compact internet-summary build bypasses stale chat caches', () => {
  assert.match(app, /ai-chat\.js\?v=20260902-search-max-tokens-1/);
});

test('internet search requests a structured evidence synthesis from local models', () => {
  for (const heading of ['검색 근거의 범위', '핵심 내용 요약', '출처 간 공통점과 차이', '종합 정리']) {
    assert.match(chat, new RegExp(heading));
  }
  assert.match(chat, /internetSearch: internetSearchActive/);
  assert.match(app, /request\.internetSearch[\s\S]*네 섹션을 모두 완결/);
  assert.match(app, /request\.academicSearch \|\| request\.internetSearch \|\| continuationMode/);
});

test('internet answers append real search results as references', () => {
  assert.match(chat, /function appendInternetReferences\(answer, sources\)/);
  assert.match(chat, /## 참고문헌/);
  assert.match(chat, /appendInternetReferences\(sections\.answer, pendingUser\.internetSources\)/);
  assert.match(chat, /internetSources: internetSearchActive \? pendingUser\.internetSources\.slice\(\) : \[\]/);
});

test('internet and academic search maximize output tokens and allow 15 minutes', () => {
  assert.match(app, /maximizeSearchOutput = request\.academicSearch === true \|\| request\.internetSearch === true/);
  assert.match(app, /searchTimeoutMs = 15 \* 60 \* 1000/);
  assert.match(app, /requestMaxTokens = maximizeSearchOutput[\s\S]*Math\.max\(1, contextOutputBudget\)/);
  assert.match(app, /requestTimeoutMs = maximizeSearchOutput[\s\S]*\? searchTimeoutMs/);
});

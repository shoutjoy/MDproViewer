const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

test('response settings expose concise style, theme, and insert labels', () => {
  assert.match(chat, /응답 스타일[^\n]*학술체[^\n]*존댓말[^\n]*Original · 모델 고유/);
  assert.match(chat, /응답 테마[^\n]*라이트[^\n]*다크/);
  assert.match(chat, /삽입 방식 펼치기/);
  assert.match(chat, /DOCUMENT_INSERT_OPTIONS\[1\], insertWrap/);
});

test('Original response bypasses Jena format prompts while retaining reasoning safety split', () => {
  assert.match(chat, /if \(state\.writingStyle === 'original'\) return ''/);
  assert.match(chat, /originalResponse\s*\? ''/);
  assert.match(chat, /originalResponse: state\.writingStyle === 'original'/);
  assert.match(chat, /separateEmbeddedReasoning\(responseStatus\.answer, reasoningText, originalResponse\)/);
  assert.match(chat, /preserveModelFormatting\) return \{ answer: answer, reasoning: reasoning \}/);
  assert.match(chat, /visibleOriginalAnswer\(liveStream\.answer, true\)/);
  assert.match(chat, /return visibleOriginalAnswer\(value, true\)/);
  assert.match(chat, /originalResponse[\s\S]{0,120}\{ answer: responseStatus\.answer, explanation: '', checklist: '', remaining: responseStatus\.answer \}/);
  assert.match(bridge, /const originalResponseMode = request\.originalResponse === true/);
  assert.match(bridge, /: originalResponseMode\s*\? ''/);
});

test('answer light and dark themes override the app chrome theme', () => {
  assert.match(chat, /answer-light/);
  assert.match(chat, /answer-dark/);
  assert.match(css, /\.ai-chat-panel\.answer-light[\s\S]*background: #fff/);
  assert.match(css, /\.ai-chat-panel\.answer-dark[\s\S]*background: #08111b/);
});

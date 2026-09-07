const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');
function extract(name) {
  const start = chat.indexOf('  function ' + name + '(');
  const end = chat.indexOf('\n  function ', start + 1);
  return chat.slice(start, end).split('\n  async function ')[0];
}
function context(extra = {}) {
  const ctx = vm.createContext({ URL, ...extra });
  for (const name of ['safeWebUrl', 'normalizeInternetSources', 'escapeInternetReferenceText', 'internetResultsMarkdown', 'appendSearchPreviewAction']) {
    vm.runInContext(extract(name), ctx);
  }
  return ctx;
}
test('internet export keeps all summaries and metadata while excluding unsafe URLs', () => {
  const ctx = context();
  const snippet = '긴 요약 '.repeat(400);
  const md = ctx.internetResultsMarkdown({content: '검색 질문', internetSources: [
    {title: '[자료]', url: 'https://example.com/a', snippet, source: '출처', date: '2026', engine: 'bing', channel: 'general'},
    {title: '위험', url: 'javascript:alert(1)'},
    {title: '두번째', url: 'https://example.com/b'}
  ]});
  assert.ok(md.includes(snippet.trim()));
  assert.ok(md.includes('출처 · 2026 · bing · general'));
  assert.ok(md.includes('## 2.'));
  assert.ok(!md.includes('javascript:'));
  assert.equal(ctx.internetResultsMarkdown({}), '');
});
test('search preview passes result markdown to the existing MD/PV window', () => {
  const message = { content: '질문' };
  let click, opened;
  const ctx = context({
    state: {messages: [message]},
    document: {createElement: () => ({addEventListener: (_, fn) => {click = fn;}})},
    openAnswerPreviewWindow: (index, payload) => {opened = {index, payload};}
  });
  ctx.appendSearchPreviewAction({appendChild() {}}, message, () => '전체 검색결과');
  click();
  assert.equal(opened.index, 0);
  assert.equal(opened.payload.content, '전체 검색결과');
});

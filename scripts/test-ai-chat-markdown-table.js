const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let parsed = '';
const context = {
  self: {},
  marked: {
    parse(value) {
      parsed = value;
      return value;
    }
  }
};
context.self.marked = context.marked;
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'AI_App', 'aiChat', 'ai-chat-markdown.js'), 'utf8'),
  context
);

const markdown = [
  '\\| 상관계수 범위 ($|r|$) | 해석 |\\',
  '\\| :--- | :--- |\\',
  '\\| $0.0 \\sim 0.2$ | 거의 없음 |\\',
  '\\| $0.2 \\sim 0.4$ | 약한 상관관계 |\\'
].join('\n');

context.self.AIChatMarkdown.toHtml(markdown);
assert.strictEqual(parsed, [
  '| 상관계수 범위 ($\\|r\\|$) | 해석 |',
  '| :--- | :--- |',
  '| $0.0 \\sim 0.2$ | 거의 없음 |',
  '| $0.2 \\sim 0.4$ | 약한 상관관계 |'
].join('\n'));

const prose = '키보드에서 \\| 문자를 입력하세요.';
context.self.AIChatMarkdown.toHtml(prose);
assert.strictEqual(parsed, prose);

const fenced = ['```md', '\\| A | B |', '\\| --- | --- |', '```'].join('\n');
context.self.AIChatMarkdown.toHtml(fenced);
assert.strictEqual(parsed, fenced);

console.log('AI chat escaped Markdown table tests passed.');

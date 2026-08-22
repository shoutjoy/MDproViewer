const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadConverter() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.runInNewContext(read('js/Tidy/tidy-inline-to-ref.js'), sandbox);
  return sandbox.TidyInlineToRef;
}

test('Inline2Ref moves numbered inline URLs to Markdown reference definitions', () => {
  const result = loadConverter().convert([
    '- **Models:** 설명 [[2]](https://example.com/models).',
    '- **활용:** 다운로드 [[15]](https://example.com/download).'
  ].join('\n'));

  assert.equal(result.convertedCount, 2);
  assert.equal(result.referenceCount, 2);
  assert.match(result.value, /설명 \[1\]\./);
  assert.match(result.value, /다운로드 \[2\]\./);
  assert.doesNotMatch(result.value, /## 참고문헌/);
  assert.match(result.value, /\[1\]: https:\/\/example\.com\/models/);
  assert.match(result.value, /\[2\]: https:\/\/example\.com\/download/);
  assert.match(result.value, /\[1\]: https:\/\/example\.com\/models "mdpro-inline2ref-new-window"/);
});

test('Inline2Ref footnote mode creates visible numbered notes with navigation syntax', () => {
  const result = loadConverter().convert(
    '설명 [[20]](https://example.com/source).',
    { mode: 'footnote' }
  );

  assert.equal(result.mode, 'footnote');
  assert.match(result.value, /설명 \[\^1\]\./);
  assert.match(result.value, /## 참고문헌\n\n\[\^1\]: https:\/\/example\.com\/source/);
});

test('Inline2Ref deduplicates references and leaves code untouched', () => {
  const source = [
    '첫 인용 [[1]](https://example.com/a), 재인용 [[1]](https://example.com/a).',
    '`[[2]](https://example.com/code)`',
    '```md',
    '[[3]](https://example.com/fence)',
    '```'
  ].join('\n');
  const result = loadConverter().convert(source);

  assert.equal(result.convertedCount, 2);
  assert.equal(result.referenceCount, 1);
  assert.match(result.value, /`\[\[2\]\]\(https:\/\/example\.com\/code\)`/);
  assert.match(result.value, /\[\[3\]\]\(https:\/\/example\.com\/fence\)/);
});

test('Inline2Ref renumbers all citations by first appearance and keeps repeated citations stable', () => {
  const result = loadConverter().convert([
    '기존 [[1]](https://example.com/first).',
    '새 출처 [[1]](https://example.com/second), 다시 [[1]](https://example.com/second).'
  ].join('\n'));

  assert.equal(result.convertedCount, 3);
  assert.equal(result.referenceCount, 2);
  assert.match(result.value, /기존 \[1\]/);
  assert.match(result.value, /새 출처 \[2\], 다시 \[2\]/);
  assert.match(result.value, /\[1\]: https:\/\/example\.com\/first/);
  assert.match(result.value, /\[2\]: https:\/\/example\.com\/second/);
});

test('Inline2Ref fixes sparse and out-of-order source numbers in both modes', () => {
  const source = '먼저 [[20]](https://example.com/a), 다음 [[3]](https://example.com/b).';
  const reference = loadConverter().convert(source, { mode: 'reference' });
  const footnote = loadConverter().convert(source, { mode: 'footnote' });

  assert.match(reference.value, /먼저 \[1\], 다음 \[2\]/);
  assert.doesNotMatch(reference.value, /## 참고문헌/);
  assert.match(footnote.value, /먼저 \[\^1\], 다음 \[\^2\]/);
  assert.match(footnote.value, /## 참고문헌/);
});

test('TIDY menu loads and exposes Inline2Ref', () => {
  const index = read('index.html');
  assert.ok(index.indexOf('tidy-inline-to-ref.js') < index.indexOf('tidy-actions.js'));
  assert.match(index, /onclick="applyInline2RefFootnoteInEditor\(\)"/);
  assert.match(index, /onclick="applyInline2RefReferenceInEditor\(\)"/);
  assert.match(index, />Inline2Ref 주석<\/button>/);
  assert.match(index, />Inline2Ref 인라인<\/button>/);
  assert.match(read('js/app.js'), /function applyInline2RefFootnoteInEditor\(\)/);
});

test('view renderer turns plain footnote URLs into safe clickable links', () => {
  const app = read('js/app.js');
  assert.match(app, /class="md-footnote-url"/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
});

test('inline reference links are marked and post-processed to open safely in a new tab', () => {
  const app = read('js/app.js');
  assert.match(app, /a\[title="mdpro-inline2ref-new-window"\]/);
  assert.match(app, /applyInline2RefLinkTargets\(viewer\)/);
  assert.match(app, /link\.setAttribute\('target', '_blank'\)/);
  assert.match(app, /link\.setAttribute\('rel', 'noopener noreferrer'\)/);
});

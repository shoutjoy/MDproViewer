const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const NoteCoverRenderer = require('../js/note-cover/note-cover.js');
const root = path.join(__dirname, '..');

function sampleConfig() {
  return {
    v: 2,
    enabled: true,
    pageSizeId: 'a4',
    layout: { align: 'center', containerWidthPct: 100, gapPx: 8 },
    bg: { color: '#ffffff', imagePath: '' },
    rootLayerIds: ['group-account', 'company', 'group-brand', 'title'],
    groups: [
      { id: 'group-brand', childIds: ['logo', 'brand'] },
      { id: 'group-account', childIds: ['account-label', 'account-value'] }
    ],
    elements: [
      { id: 'title', type: 'text', x: 30, y: 50, w: 40, h: 5, text: '사용문서', fontSize: 31, textAlign: 'center', color: '#111111' },
      { id: 'logo', type: 'image', path: '.images/logo.png', x: 8, y: 19, w: 30, h: 21, name: 'Logo' },
      { id: 'brand', type: 'text', x: 41, y: 20, w: 39, h: 9, text: 'ECApro', fontSize: 71, fontWeight: 'bold' },
      { id: 'account-label', type: 'text', x: 31, y: 66, w: 10, h: 3, text: '아이디', fontSize: 22 },
      { id: 'account-value', type: 'text', x: 43, y: 66, w: 25, h: 3, text: '대구_이화평', fontSize: 22 },
      { id: 'company', type: 'text', x: 26, y: 87, w: 47, h: 6, text: '(주)자유자재교육', fontSize: 23 }
    ]
  };
}

test('renders note-cover metadata as a responsive A4 cover', () => {
  const config = sampleConfig();
  const source = `<!-- note-cover\n${JSON.stringify(config)}\n-->\n\n# 본문`;
  const html = NoteCoverRenderer.replaceInMarkdown(source);

  assert.match(html, /class="note-cover-page note-cover-size-a4 note-cover-align-center"/);
  assert.match(html, /data-note-cover-version="2"/);
  assert.match(html, /data-note-cover-index="0"/);
  assert.match(html, /data-note-cover-text-editable="1" contenteditable="plaintext-only"/);
  assert.match(html, /data-note-cover-w="40"/);
  assert.match(html, /data-note-cover-rotation="0"/);
  assert.match(html, /role="textbox"/);
  assert.match(html, /src="\.images\/logo\.png"/);
  assert.match(html, /data-note-cover-image-path="\.images\/logo\.png"/);
  assert.match(html, /class="note-cover-image-fallback">Logo<\/span>/);
  assert.match(html, /class="note-cover-image-replace no-print"/);
  assert.match(html, /aria-label="이미지 바꾸기: Logo"/);
  assert.match(html, />ECApro<\/div>/);
  assert.match(html, />대구_이화평<\/div>/);
  assert.match(html, /# 본문/);
  assert.doesNotMatch(html, /<!--\s*note-cover/);
});

test('flattens nested groups in declared root layer order', () => {
  const ids = NoteCoverRenderer.collectLayerElements(sampleConfig()).map((item) => item.id);
  assert.deepEqual(ids, [
    'account-label', 'account-value', 'company', 'logo', 'brand', 'title'
  ]);
});

test('escapes text and blocks executable image protocols', () => {
  const config = sampleConfig();
  config.elements.push({
    id: 'unsafe', type: 'text', x: 0, y: 0, w: 10, h: 10,
    text: '<img src=x onerror=alert(1)>', color: 'red;position:fixed'
  });
  config.rootLayerIds.push('unsafe');
  config.elements.find((item) => item.id === 'logo').path = 'javascript:alert(1)';
  const html = NoteCoverRenderer.renderHtml(config);

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /position:fixed/);
});

test('shows a visible error for malformed note-cover JSON', () => {
  const html = NoteCoverRenderer.replaceInMarkdown('<!-- note-cover\n{"enabled":true,}\n-->');
  assert.match(html, /표지 렌더링 오류/);
  assert.doesNotMatch(html, /<!--\s*note-cover/);
});

test('keeps image replacement available when the original path is empty', () => {
  const config = sampleConfig();
  config.elements.find((item) => item.id === 'logo').path = '';
  const html = NoteCoverRenderer.renderHtml(config);

  assert.match(html, /class="note-cover-element note-cover-image is-missing"/);
  assert.match(html, />이미지 경로 없음<\/span>/);
  assert.match(html, /aria-label="이미지 바꾸기: Logo"/);
  assert.doesNotMatch(html, /<img[^>]+src=""/);
});

test('updates an editable text element in the selected note-cover comment', () => {
  const first = sampleConfig();
  const second = sampleConfig();
  second.elements.find((item) => item.id === 'title').text = '두 번째 표지';
  const source = `<!-- note-cover\n${JSON.stringify(first)}\n-->\n\n본문\n\n` +
    `<!-- note-cover\n${JSON.stringify(second)}\n-->`;
  const updated = NoteCoverRenderer.updateTextElementInMarkdown(
    source,
    1,
    'title',
    '보기에서 수정한 제목\n둘째 줄'
  );

  assert.equal(updated.changed, true);
  const configs = Array.from(updated.markdown.matchAll(/<!--\s*note-cover\b([\s\S]*?)-->/gi))
    .map((match) => JSON.parse(match[1].trim()));
  assert.equal(configs[0].elements.find((item) => item.id === 'title').text, '사용문서');
  assert.equal(
    configs[1].elements.find((item) => item.id === 'title').text,
    '보기에서 수정한 제목\n둘째 줄'
  );
});

test('updates text box size and rotation in note-cover metadata', () => {
  const source = `<!-- note-cover\n${JSON.stringify(sampleConfig())}\n-->`;
  const updated = NoteCoverRenderer.updateElementGeometryInMarkdown(
    source,
    0,
    'title',
    { w: 52.25, h: 8.5, rotation: 37 }
  );

  assert.equal(updated.changed, true);
  const config = JSON.parse(updated.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  const title = config.elements.find((item) => item.id === 'title');
  assert.equal(title.w, 52.25);
  assert.equal(title.h, 8.5);
  assert.equal(title.rotation, 37);
});

test('relinks a cover image to an IndexedDB internal URL', () => {
  const source = `<!-- note-cover\n${JSON.stringify(sampleConfig())}\n-->`;
  const updated = NoteCoverRenderer.updateImageElementPathInMarkdown(
    source,
    0,
    'logo',
    'internal://img_cover_logo_1'
  );

  assert.equal(updated.changed, true);
  const config = JSON.parse(updated.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  const logo = config.elements.find((item) => item.id === 'logo');
  assert.equal(logo.path, 'internal://img_cover_logo_1');
  assert.equal(Object.hasOwn(logo, 'src'), false);
});

test('index loads note-cover before the main app and app preprocesses it', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  assert.ok(index.indexOf('./js/note-cover/note-cover.js') < index.indexOf('./js/app.js'));
  assert.match(app, /NoteCoverRenderer\.replaceInMarkdown\(s\)/);
  assert.match(app, /onTextChange:\s*applyNoteCoverTextChange/);
  assert.match(app, /onGeometryChange:\s*applyNoteCoverGeometryChange/);
  assert.match(app, /onImageRelink:\s*requestNoteCoverImageRelink/);
  assert.match(app, /updateTextElementInMarkdown/);
  assert.match(app, /ImageDB\.saveBlob/);
  assert.match(index, /note-cover\.js\?v=20260811-image-replace-1/);
  assert.match(index, /app\.js\?v=20260811-note-cover-transform-1/);
  assert.match(index, /style\.css\?v=20260811-note-cover-image-replace-1/);
  assert.match(stylesheet, /note-cover-text\[data-note-cover-text-editable="1"\]:focus/);
  assert.match(stylesheet, /note-cover-resize-handle/);
  assert.match(stylesheet, /note-cover-rotate-handle/);
  assert.match(stylesheet, /note-cover-image-replace/);
  assert.match(stylesheet, /클릭하여 이미지 연결/);
});

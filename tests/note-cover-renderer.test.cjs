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
  assert.match(html, /src="\.images\/logo\.png"/);
  assert.match(html, /class="note-cover-image-fallback">Logo<\/span>/);
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

test('index loads note-cover before the main app and app preprocesses it', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.ok(index.indexOf('./js/note-cover/note-cover.js') < index.indexOf('./js/app.js'));
  assert.match(app, /NoteCoverRenderer\.replaceInMarkdown\(s\)/);
});

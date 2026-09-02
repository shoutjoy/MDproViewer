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
  assert.match(html, /class="note-cover-image-delete no-print"/);
  assert.match(html, /aria-label="이미지 삭제: Logo"/);
  assert.match(html, />ECApro<\/div>/);
  assert.match(html, />대구_이화평<\/div>/);
  assert.match(html, /# 본문/);
  assert.doesNotMatch(html, /<!--\s*note-cover/);
});

test('inserts a canonical editable v2 cover at the document start', () => {
  const inserted = NoteCoverRenderer.insertDefaultCover('# 본문', { title: '강의 -- 노트' });
  assert.equal(inserted.changed, true);
  assert.match(inserted.markdown, /^<!-- note-cover\n/);
  assert.match(inserted.markdown, /\\u002d\\u002d/);
  assert.match(inserted.markdown, /\n# 본문$/);
  const match = inserted.markdown.match(/^<!--\s*note-cover\b([\s\S]*?)-->/i);
  assert.ok(match);
  const config = JSON.parse(match[1].trim());
  assert.equal(config.v, 2);
  assert.equal(config.enabled, true);
  assert.equal(config.pageSizeId, 'a4');
  assert.equal(config.elements.find((item) => item.id === 'title').text, '강의 -- 노트');
  assert.ok(config.elements.every((item) => item.type === 'text'));
  const html = NoteCoverRenderer.renderHtml(config);
  assert.match(html, /강의 -- 노트/);
  assert.ok(inserted.selectionStart < inserted.selectionEnd);
  assert.equal(inserted.markdown.slice(inserted.selectionStart, inserted.selectionEnd), '강의 \\u002d\\u002d 노트');
});

test('does not create a second cover when one already exists', () => {
  const first = NoteCoverRenderer.insertDefaultCover('본문', { title: '첫 표지' });
  const second = NoteCoverRenderer.insertDefaultCover(first.markdown, { title: '두 번째 표지' });
  assert.equal(second.changed, false);
  assert.equal(second.reason, 'exists');
  assert.equal(second.markdown, first.markdown);
  assert.equal((second.markdown.match(/<!--\s*note-cover\b/gi) || []).length, 1);
  assert.ok(second.selectionEnd > second.selectionStart);
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

test('repairs missing and trailing commas in note-cover JSON', () => {
  const html = NoteCoverRenderer.replaceInMarkdown(`<!-- note-cover
{
  "v": 2
  "enabled": true,
  "pageSizeId": "a4",
  "elements": [
    {"id":"title","type":"text","text":"복구된 표지","x":10,"y":10,"w":40,"h":8,},
  ],
}
-->`);
  assert.match(html, /class="note-cover-page note-cover-size-a4/);
  assert.match(html, /복구된 표지/);
  assert.doesNotMatch(html, /표지 렌더링 오류|<!--\s*note-cover/);
});

test('shows a visible error for unrecoverable note-cover JSON', () => {
  const html = NoteCoverRenderer.replaceInMarkdown('<!-- note-cover\n{"enabled":truth}\n-->');
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
  assert.match(html, /aria-label="이미지 삭제: Logo"/);
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

test('moves and resizes image elements in note-cover metadata', () => {
  const source = `<!-- note-cover\n${JSON.stringify(sampleConfig())}\n-->`;
  const updated = NoteCoverRenderer.updateElementGeometryInMarkdown(
    source,
    0,
    'logo',
    { x: 14.5, y: 26.25, w: 42, h: 29, rotation: -12 }
  );

  assert.equal(updated.changed, true);
  const config = JSON.parse(updated.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  const logo = config.elements.find((item) => item.id === 'logo');
  assert.deepEqual(
    { x: logo.x, y: logo.y, w: logo.w, h: logo.h, rotation: logo.rotation },
    { x: 14.5, y: 26.25, w: 42, h: 29, rotation: -12 }
  );
});

test('persists text formatting and renders italic, font, color, bold, and size', () => {
  const source = `<!-- note-cover\n${JSON.stringify(sampleConfig())}\n-->`;
  const updated = NoteCoverRenderer.updateTextElementStyleInMarkdown(source, 0, 'title', {
    fontFamily: 'Times New Roman',
    color: '#c026d3',
    fontWeight: 700,
    fontStyle: 'italic',
    fontSize: 44
  });

  assert.equal(updated.changed, true);
  const config = JSON.parse(updated.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  const title = config.elements.find((item) => item.id === 'title');
  assert.equal(title.fontFamily, 'Times New Roman');
  assert.equal(title.color, '#c026d3');
  assert.equal(title.fontWeight, '700');
  assert.equal(title.fontStyle, 'italic');
  assert.equal(title.fontSize, 44);
  const html = NoteCoverRenderer.renderHtml(config);
  assert.match(html, /font-style:italic/);
  assert.match(html, /data-note-cover-font-family="Times New Roman"/);
  assert.match(html, /data-note-cover-font-size="44"/);
});

test('adds text and image layers to a cover root layer list', () => {
  const source = `<!-- note-cover\n${JSON.stringify(sampleConfig())}\n-->`;
  const withText = NoteCoverRenderer.addElementInMarkdown(source, 0, {
    type: 'text', text: '추가 문구', x: 10, y: 11, fontSize: 28
  });
  assert.equal(withText.changed, true);
  assert.ok(withText.elementId);
  const withImage = NoteCoverRenderer.addElementInMarkdown(withText.markdown, 0, {
    type: 'image', path: 'internal://new-cover-image', name: '추가 이미지'
  });
  assert.equal(withImage.changed, true);
  const config = JSON.parse(withImage.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  assert.equal(config.elements.find((item) => item.id === withText.elementId).text, '추가 문구');
  assert.equal(config.elements.find((item) => item.id === withImage.elementId).path, 'internal://new-cover-image');
  assert.ok(config.rootLayerIds.includes(withText.elementId));
  assert.ok(config.rootLayerIds.includes(withImage.elementId));
});

test('deletes only the selected text or image layer and removes group references', () => {
  const first = sampleConfig();
  const second = sampleConfig();
  second.elements.find((item) => item.id === 'logo').name = '두 번째 표지 로고';
  const source = `<!-- note-cover\n${JSON.stringify(first)}\n-->\n\n` +
    `<!-- note-cover\n${JSON.stringify(second)}\n-->`;
  const withoutLogo = NoteCoverRenderer.removeElementInMarkdown(source, 0, 'logo');

  assert.equal(withoutLogo.changed, true);
  const configs = Array.from(withoutLogo.markdown.matchAll(/<!--\s*note-cover\b([\s\S]*?)-->/gi))
    .map((match) => JSON.parse(match[1].trim()));
  assert.equal(configs[0].elements.some((item) => item.id === 'logo'), false);
  assert.equal(configs[0].groups.find((group) => group.id === 'group-brand').childIds.includes('logo'), false);
  assert.equal(configs[0].rootLayerIds.includes('logo'), false);
  assert.equal(configs[1].elements.find((item) => item.id === 'logo').name, '두 번째 표지 로고');

  const withoutTitle = NoteCoverRenderer.removeElementInMarkdown(withoutLogo.markdown, 0, 'title');
  const nextFirst = JSON.parse(withoutTitle.markdown.match(/<!--\s*note-cover\b([\s\S]*?)-->/i)[1].trim());
  assert.equal(withoutTitle.changed, true);
  assert.equal(nextFirst.elements.some((item) => item.id === 'title'), false);
  assert.equal(nextFirst.rootLayerIds.includes('title'), false);

  const missing = NoteCoverRenderer.removeElementInMarkdown(withoutTitle.markdown, 0, 'not-found');
  assert.equal(missing.changed, false);
  assert.equal(missing.markdown, withoutTitle.markdown);
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
  const renderer = fs.readFileSync(path.join(root, 'js', 'note-cover', 'note-cover.js'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  assert.ok(index.indexOf('./js/note-cover/note-cover.js') < index.indexOf('./js/app.js'));
  assert.match(app, /NoteCoverRenderer\.replaceInMarkdown\(s\)/);
  assert.match(app, /onTextChange:\s*applyNoteCoverTextChange/);
  assert.match(app, /onGeometryChange:\s*applyNoteCoverGeometryChange/);
  assert.match(app, /onStyleChange:\s*applyNoteCoverTextStyleChange/);
  assert.match(app, /onAddText:\s*addNoteCoverTextElement/);
  assert.match(app, /onAddImage:\s*requestNoteCoverImageAdd/);
  assert.match(app, /onDelete:\s*deleteNoteCoverElement/);
  assert.match(app, /onUndo:\s*undoNoteCoverEdit/);
  assert.match(app, /onImageRelink:\s*requestNoteCoverImageRelink/);
  assert.match(app, /updateTextElementInMarkdown/);
  assert.match(app, /ImageDB\.saveBlob/);
  assert.match(index, /note-cover\.js\?v=20260811-editor-14/);
  assert.match(index, /noteCoverForm=20260902-1/);
  assert.match(index, /\.\/css\/style\.css\?v=/);
  assert.match(stylesheet, /note-cover-text\[data-note-cover-text-editable="1"\]:focus/);
  assert.match(stylesheet, /note-cover-resize-handle/);
  assert.match(stylesheet, /note-cover-move-handle/);
  assert.match(stylesheet, /note-cover-move-edge/);
  assert.match(stylesheet, /note-cover-text.*\.is-border-move-ready/);
  assert.match(stylesheet, /note-cover-rotate-handle/);
  assert.match(stylesheet, /note-cover-floating-toolbar/);
  assert.match(stylesheet, /right:\s*calc\(100% \+ 10px\)/);
  assert.match(stylesheet, /flex-direction:\s*column/);
  assert.match(stylesheet, /note-cover-floating-toolbar\.is-vertical/);
  assert.match(stylesheet, /#sidebar:not\(\.sidebar-collapsed\).*~ \.order-2 .*\.note-cover-floating-toolbar\.is-vertical:not\(\.is-positioned\)/);
  assert.match(stylesheet, /note-cover-toolbar-drag-handle/);
  assert.match(stylesheet, /note-cover-rotation-control/);
  assert.match(stylesheet, /data-note-cover-action="delete"/);
  assert.match(stylesheet, /note-cover-image-replace/);
  assert.match(stylesheet, /note-cover-image-delete/);
  assert.match(stylesheet, /클릭하여 이미지 연결/);
  assert.match(renderer, /NOTE_COVER_TOOLBAR_POSITION_KEY/);
  assert.match(renderer, /NOTE_COVER_TOOLBAR_ORIENTATION_KEY/);
  assert.match(renderer, /data-note-cover-action="toggle-orientation"/);
  assert.match(renderer, /가로 메뉴로 전환/);
  assert.match(renderer, /세로 메뉴로 전환/);
  assert.match(renderer, /data-note-cover-toolbar-drag/);
  assert.match(renderer, /createMoveEdge/);
  assert.match(renderer, /테두리를 드래그하여 텍스트 상자 이동/);
  assert.match(renderer, /var moveHandle = isImage \?/);
  assert.match(renderer, /data-note-cover-geometry="rotation"/);
  assert.match(renderer, /applyTextRotationControl/);
  assert.match(renderer, /rotationCommitTimer/);
  assert.match(renderer, /data-note-cover-action="rotation-down"/);
  assert.match(renderer, /data-note-cover-action="rotation-up"/);
  assert.match(renderer, /parseJsonWithCommonRepairs/);
  assert.match(index, /id="note-cover-insert-visible"/);
  assert.match(index, /id="btn-note-cover-insert"/);
  assert.match(index, /id="note-cover-insert-modal"/);
  assert.match(index, /표지를 추가할까요\?/);
  assert.match(index, /표지 지우기/);
  assert.match(app, /noteCoverInsertVisible/);
  assert.match(app, /insertDefaultNoteCover/);
  assert.match(app, /removeDocumentNoteCover/);
});

test('default cover accepts the writing fields collected before insertion', () => {
  const config = NoteCoverRenderer.createDefaultConfig({ title: '연구 보고서', subtitle: '요약', author: '홍길동', date: '2026-09-02' });
  assert.equal(config.elements.find((item) => item.id === 'title').text, '연구 보고서');
  assert.equal(config.elements.find((item) => item.id === 'subtitle').text, '요약');
  assert.equal(config.elements.find((item) => item.id === 'author').text, '홍길동');
  assert.equal(config.elements.find((item) => item.id === 'date').text, '2026-09-02');
});

test('note-cover insertion visibility is allowed by all persistent settings policies', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'js', 'storage', 'indexeddb-migration.js'), 'utf8');
  const wasmPolicy = fs.readFileSync(path.join(root, 'Local_SQLiteWASM', 'settings-policy.js'), 'utf8');
  const pythonPolicy = fs.readFileSync(path.join(root, 'LocalSave_sqlite', 'server', 'settings_policy.py'), 'utf8');
  assert.match(app, /setAiSettings\(\{ noteCoverInsertVisible: enabled \}\)/);
  assert.match(migration, /noteCoverInsertVisible: \['features', 'global'\]/);
  assert.match(wasmPolicy, /noteCoverInsertVisible: \['features', 'global', \['boolean'\], 16\]/);
  assert.match(pythonPolicy, /"noteCoverInsertVisible": _boolean\(\)/);
});

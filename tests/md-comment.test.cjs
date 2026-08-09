const assert = require('node:assert/strict');
const test = require('node:test');
const mdComment = require('../js/md-comment.js');

test('custom comments are removed while line positions remain stable', () => {
    assert.equal(mdComment.stripForRender('앞<-- 숨김 -->뒤'), '앞뒤');
    assert.equal(
        mdComment.stripForRender('# 제목\n<-- 첫 줄\n둘째 줄 -->\n본문'),
        '# 제목\n\n\n본문'
    );
    assert.equal(mdComment.stripForRender('앞<-- 닫히지 않음'), '앞<-- 닫히지 않음');
});

test('comment selection toggles without losing the selected text', () => {
    const commented = mdComment.getToggleReplacement('선택 영역');
    assert.deepEqual(commented, { replacement: '<-- 선택 영역 -->', commented: true });
    assert.deepEqual(
        mdComment.getToggleReplacement(commented.replacement),
        { replacement: '선택 영역', commented: false }
    );
});

test('editor markup highlights only custom comment ranges', () => {
    assert.equal(
        mdComment.createHighlightMarkup('일반 <-- 주석 --> 일반'),
        '일반 <span class="md-editor-comment">&lt;-- 주석 --&gt;</span> 일반'
    );
});

test('highlight mode keeps native textarea fast path and simplifies very large documents', () => {
    const options = {
        largeDocumentThreshold: 100,
        plainTextThreshold: 200,
        largeDocumentDelayMs: 10
    };
    assert.equal(mdComment.getHighlightMode('일반 문서', options), 'native');
    assert.equal(mdComment.getHighlightMode('<-- 주석 -->', options), 'mirror');
    assert.equal(mdComment.getHighlightMode('<-- 주석 -->' + 'a'.repeat(100), options), 'mirror-large');
    assert.equal(mdComment.getHighlightMode('<-- 주석 -->' + 'a'.repeat(200), options), 'plain-large');
});

test('default large document thresholds remain ordered and configurable', () => {
    const options = mdComment.DEFAULT_HIGHLIGHT_OPTIONS;
    assert.ok(options.largeDocumentThreshold > 0);
    assert.ok(options.plainTextThreshold >= options.largeDocumentThreshold);
    assert.ok(options.largeDocumentDelayMs >= 0);
});

test('editor comment colors provide separate valid light and dark defaults', () => {
    const colors = mdComment.DEFAULT_EDITOR_COMMENT_COLORS;
    assert.match(colors.light, /^#[0-9a-f]{6}$/);
    assert.match(colors.dark, /^#[0-9a-f]{6}$/);
    assert.notEqual(colors.light, colors.dark);
    assert.equal(mdComment.normalizeEditorCommentColor('#ABCDEF', colors.dark), '#abcdef');
    assert.equal(mdComment.normalizeEditorCommentColor('invalid', colors.light), colors.light);
});

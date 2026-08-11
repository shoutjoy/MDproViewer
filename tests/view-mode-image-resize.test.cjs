const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const imageResize = require('../js/viewmode/image-resize.js');

test('loads the view-mode image resizer before app.js and wires post-render hydration', () => {
    const root = path.resolve(__dirname, '..');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

    const resizerPos = index.indexOf('./js/viewmode/image-resize.js?v=20260811-2');
    const appPos = index.indexOf('./js/app.js?');
    assert.ok(resizerPos >= 0 && appPos > resizerPos);
    assert.match(index, /viewImageResize=20260811-2/);
    assert.match(app, /ViewModeImageResize\.hydrate\(viewer/);
    assert.match(app, /performAutoSave\(\)/);
    assert.match(css, /\.md-image-resize-handle\.is-se/);
    assert.doesNotMatch(css, /\.md-image-resize-handle\.is-sw/);
    assert.match(css, /\.md-image-resize-handle\.is-se\s*\{[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;/);
    assert.match(css, /\.md-image-resize-confirm/);
});

test('scans Markdown, reference, and HTML images while ignoring protected code', () => {
    const source = [
        '![첫 이미지](internal://photo%201 "표지")',
        '',
        '`![inline](skip.png)`',
        '',
        '```md',
        '![fenced](skip-too.png)',
        '```',
        '',
        '![참조][hero]',
        '[hero]: https://example.com/hero.png "Hero title"',
        '',
        '<img src="local.png" alt="로컬" style="width: 10px; border: 0">'
    ].join('\n');

    const records = imageResize.scanImageReferences(source);
    assert.equal(records.length, 3);
    assert.deepEqual(records.map((record) => record.src), [
        'internal://photo%201',
        'https://example.com/hero.png',
        'local.png'
    ]);
    assert.equal(records[1].title, 'Hero title');
    assert.equal(records[2].type, 'html');
});

test('converts one Markdown image to an HTML img with recorded dimensions', () => {
    const source = '앞 ![A & B](internal://image-1 "설명") 뒤';
    const record = imageResize.scanImageReferences(source)[0];
    const result = imageResize.replaceImageReference(source, record, 321.4, 199.6);

    assert.equal(result.changed, true);
    assert.equal(
        result.markdown,
        '앞 <img src="internal://image-1" alt="A &amp; B" title="설명" width="321" height="200"> 뒤'
    );
});

test('updates an existing HTML img and removes conflicting inline dimensions', () => {
    const source = '<img class="hero" src="a.png" style="width: 40px; height:auto; border: 1px solid red" width="40">';
    const record = imageResize.scanImageReferences(source)[0];
    const result = imageResize.replaceImageReference(source, record, 480, 270);

    assert.match(result.markdown, /class="hero"/);
    assert.match(result.markdown, /style="border: 1px solid red"/);
    assert.match(result.markdown, /width="480"/);
    assert.match(result.markdown, /height="270"/);
    assert.doesNotMatch(result.markdown, /width: 40px|height:auto/);
});

test('relocates the same image record if unrelated source text changed before confirm', () => {
    const original = '![one](one.png)\n\n![two](two.png)';
    const record = imageResize.scanImageReferences(original)[1];
    const changed = '새 머리말\n\n' + original;
    const result = imageResize.replaceImageReference(changed, record, 640, 360);

    assert.equal(result.changed, true);
    assert.match(result.markdown, /!\[one\]\(one\.png\)/);
    assert.match(result.markdown, /<img src="two\.png" alt="two" width="640" height="360">/);
});

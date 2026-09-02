const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'editor-format-gutter.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('base64 image lines receive an image_data gutter marker', () => {
  assert.ok(source.includes('data:image\\/[a-z0-9.+-]+;base64,'));
  assert.match(source, /kind = 'image-data'; label = 'image_data'/);
  assert.match(css, /\.editor-format-image-data\s*\{/);
});

test('the editor folds only image payloads while keeping ordinary text editable', () => {
  assert.match(source, /foldedTextarea\.readOnly = false/);
  assert.match(source, /function restoreImageData\(foldedSource, originalSource\)/);
  assert.match(source, /foldedTextarea\.addEventListener\('input'/);
  assert.match(source, /textarea\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(source, /wrapper\.classList\.toggle\('image-data-fold-active'/);
  assert.match(source, /data:image\/' \+ subtype \+ ';base64,…\[image_data/);
  assert.match(source, /if \(displaySource\.length > MAX_MEASURE_CHARS\) return/);
  assert.doesNotMatch(source, /textarea\.value\s*=\s*foldImageData/);
  assert.match(css, /#editor-image-data-fold\s*\{/);
  assert.match(source, /format\.kind === 'image-data'[\s\S]*?foldButton\.dataset\.sourceTop/);
  assert.match(source, /positionFoldButton\(scrollSource\.scrollTop\)/);
  assert.match(source, /foldButton\.textContent = available && imageDataFolded \? '▸' : '▾'/);
  assert.match(css, /#editor-image-data-fold\s*\{[\s\S]*?top:\s*0;[\s\S]*?right:\s*0;/);
});

test('the image fold control lives beside the image_data marker outside the document', () => {
  assert.match(source, /gutter\.appendChild\(foldButton\)/);
  assert.doesNotMatch(source, /wrapper\.appendChild\(foldButton\)/);
  assert.match(css, /#editor-format-gutter\s*\{[\s\S]*?width:\s*140px;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.editor-format-image-data\s*\{[\s\S]*?left:\s*0;/);
});

test('the folded display keeps the same document padding as the source editor', () => {
  assert.match(css, /#viewer-edit-ta,\s*#viewer-edit-image-data-folded,\s*#viewer-edit-highlight\s*\{[\s\S]*?padding:\s*var\(--md-view-padding, 24px\);/);
});

test('the fold arrow follows scrolling only inside the image data block', () => {
  assert.match(source, /function positionFoldButton\(scrollTop\)/);
  assert.match(source, /Math\.min\(Math\.max\(naturalTop, stickyTop\), blockBottom\)/);
  assert.match(source, /foldButton\.dataset\.sourceBottom = String\(nextAnchor \? nextAnchor\.offsetTop : measure\.scrollHeight\)/);
});

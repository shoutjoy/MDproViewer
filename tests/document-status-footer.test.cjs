const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

const titleIndex = html.indexOf('id="file-title-display"');
const pathIndex = html.indexOf('id="file-path-display"');
const sizeIndex = html.indexOf('id="file-size-display"');
const createdIndex = html.indexOf('id="file-created-display"');

assert.ok(titleIndex >= 0 && pathIndex > titleIndex && sizeIndex > pathIndex && createdIndex > sizeIndex);
assert.match(app, /function getUtf8ByteLength\(value\)/);
assert.match(app, /formatDocumentBytes\(getUtf8ByteLength\(currentMarkdown\)\)/);
assert.match(app, /getStorageModeLabel\(storageMode\) \+ ' \/ ' \+ pathBuilder/);
assert.match(app, /dateLabel:\s*file\.lastModified \? '수정일' : '생성일'/);
assert.match(app, /createdAt:\s*new Date\(\)/);
assert.match(html, /folderTree=20260812-1/);
assert.match(html, /documentMeta=20260812-1/);

console.log('Document footer metadata wiring checks passed.');

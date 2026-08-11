const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

assert.match(html, /id="indb-status-panel"[^>]*class="indb-status-panel"/);
assert.match(html, /id="btn-open-indb-images-fma"[^>]*onclick="openAllInDbImagesInFmaViewer\(\)"/);
assert.match(html, /id="btn-clean-unused-indb-images"[^>]*onclick="deleteUnusedInDbImages\(\)"/);

assert.match(app, /async function createInDbStatusSnapshot\(\)/);
assert.match(app, /extractInternalImageIdsDeep/);
assert.match(app, /findUnusedImageIds/);
assert.match(app, /async function deleteUnusedInDbImages\(\)[\s\S]*?db\.transaction\('images', 'readwrite'\)/);
assert.match(app, /async function openAllInDbImagesInFmaViewer\(\)[\s\S]*?InternalImageApp\.openFiles/);
assert.match(app, /class="indb-image-thumb"/);
assert.match(app, /loading="lazy" decoding="async"/);
assert.match(app, /snapshot\.referencedIds\.has\(itemId\)/, '사용 중 이미지를 개별 삭제할 때 경고해야 합니다.');
assert.match(app, /window\.deleteUnusedInDbImages = deleteUnusedInDbImages/);
assert.match(app, /window\.openAllInDbImagesInFmaViewer = openAllInDbImagesInFmaViewer/);

assert.match(css, /\.indb-status-panel\s*\{/);
assert.match(css, /\.dark \.indb-status-panel\s*\{/);
assert.match(css, /\.indb-overview-grid\s*\{/);
assert.match(css, /\.indb-image-grid\s*\{/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.indb-status-panel/);

console.log('inDB image management and modal UI checks passed');

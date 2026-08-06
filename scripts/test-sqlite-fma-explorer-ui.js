const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(source, /renderExplorerFmaSummary/, 'FMA summary renderer is missing');
assert.match(source, /갤러리 항목/, 'FMA gallery item count is missing');
assert.match(source, /고유 미디어/, 'FMA unique media count is missing');
assert.match(source, /이미지/, 'FMA image count is missing');
assert.match(source, /영상/, 'FMA video count is missing');
assert.match(source, /mimeCounts/, 'FMA MIME distribution is missing');
assert.match(source, /getSqliteExplorerFmaPreview/, 'FMA preview summary request is missing');
assert.match(source, /getSqliteExplorerFmaThumbnail/, 'FMA thumbnail request is missing');
assert.match(source, /Promise\.all\(\[worker\(\), worker\(\), worker\(\), worker\(\)\]\)/,
    'FMA thumbnail concurrency must remain limited');
assert.match(source, /URL\.revokeObjectURL/, 'FMA preview object URLs must be released');
assert.match(source, /영상과 큰 원본 이미지는 자동 재생하거나 전체 다운로드하지 않습니다/,
    'FMA lightweight preview notice is missing');
assert.match(html, /settings-ui\.js\?v=20260806-maintenance-1/, 'FMA explorer cache version is missing');

console.log('SQLite FMA explorer UI contract tests passed');

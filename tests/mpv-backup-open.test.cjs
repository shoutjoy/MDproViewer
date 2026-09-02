const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('backup modal opens MPV files through the dedicated picker action', () => {
  assert.match(html, /onclick="openMpvFilePicker\(event\)"/);
  assert.match(html, />\s*MPV 열기\s*<\/button>/);
  assert.match(app, /function openMpvFilePicker\(event\)[\s\S]*?input\.value = ''[\s\S]*?input\.click\(\)/);
  assert.match(app, /window\.openMpvFilePicker = openMpvFilePicker/);
});

test('MPV restore reports invalid input instead of silently doing nothing', () => {
  assert.match(app, /reader\.onload = async \(e\) =>/);
  assert.match(app, /await restoreFromMpv\(data\)/);
  assert.match(app, /MPV 파일을 열 수 없습니다:/);
  assert.match(app, /if \(!db\) throw new Error/);
});

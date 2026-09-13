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

test('backup modal can save and restore all documents as ZIP', () => {
  assert.match(html, /id="zip-backup-input"[^>]*accept="\.zip,application\/zip"/);
  assert.match(html, /onclick="openZipBackupFilePicker\(event\)"/);
  assert.match(html, />\s*ZIP 열기\s*<\/button>/);
  assert.match(app, /function openZipBackupFilePicker\(event\)/);
  assert.match(app, /async function handleZipBackupFileSelect\(event\)/);
  assert.match(app, /async function restoreFromZipBackup\(zip\)/);
  assert.match(app, /zip\.file\('_mdpro_backup\.json'/);
  assert.match(app, /format: 'mdpro-zip-backup'/);
  assert.match(app, /window\.handleZipBackupFileSelect = handleZipBackupFileSelect/);
});

test('MPV restore reports invalid input instead of silently doing nothing', () => {
  assert.match(app, /reader\.onload = async \(e\) =>/);
  assert.match(app, /await restoreFromMpv\(data\)/);
  assert.match(app, /MPV 파일을 열 수 없습니다:/);
  assert.match(app, /async function restoreFromMpv\(data\) \{\s*await ensureMainDatabaseReady\(\)/);
});

test('MPV restore shares and waits for the application database initialization', () => {
  assert.match(app, /let mainDatabaseReadyPromise = null/);
  assert.match(app, /function ensureMainDatabaseReady\(\)/);
  assert.match(app, /if \(mainDatabaseReadyPromise\) return mainDatabaseReadyPromise/);
  assert.doesNotMatch(app, /await initDB\(\)/);
});

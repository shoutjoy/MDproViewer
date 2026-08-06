const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(ui, /data-sqlite-backup-id/);
assert.match(ui, /function openSqliteExplorerBackup\(backupId\)/);
assert.match(ui, /getSqliteExplorerBackup\(normalizedId\)/);
assert.match(ui, /function deleteSqliteExplorerBackup\(backupId\)/);
assert.match(ui, /typedId\.trim\(\) !== normalizedId/);
assert.match(ui, /window\.confirm\(/);
assert.match(ui, /deleteSqliteExplorerBackup\(normalizedId\)/);
assert.match(ui, /data\/backups\/trash/);
assert.match(ui, /문서 본문·설정값·API 키·암호문은 표시하지 않습니다/);
assert.match(ui, /문서 메타데이터/);
assert.match(ui, /폴더 메타데이터/);
assert.match(ui, /파일 메타데이터/);
assert.match(ui, /설정 키 메타데이터/);
assert.match(ui, /자산 메타데이터/);

const backupRenderer = ui.slice(
    ui.indexOf('function renderSqliteExplorerBackup'),
    ui.indexOf('async function openSqliteExplorerBackup')
);
assert.doesNotMatch(backupRenderer, /row\.content\b/);
assert.doesNotMatch(backupRenderer, /row\.value\b/);
assert.match(index, /sqlite-api-adapter\.js\?v=20260806-maintenance-1/);
assert.match(index, /storage-service\.js\?v=20260806-scholar-workfiles-fallback-3/);
assert.match(index, /settings-ui\.js\?v=20260806-lmstudio-status-1/);

console.log('SQLite backup explorer UI contract tests passed.');

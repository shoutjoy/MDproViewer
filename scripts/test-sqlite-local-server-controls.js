const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const settingsUi = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'start-md-viewer-server.cmd'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const vscodeTasks = fs.readFileSync(path.join(root, '.vscode', 'tasks.json'), 'utf8');

assert.match(settingsUi, /id="sqlite-start-local-server"/);
assert.match(settingsUi, /id="sqlite-open-local-app"/);
assert.match(settingsUi, /127\.0\.0\.1:8765 열기/);
assert.match(settingsUi, /buildLocalSqliteServerCommand/);
assert.match(settingsUi, /copyLocalServerCommand/);
assert.match(settingsUi, /Windows 키\+R/);
assert.match(settingsUi, /persistent: true, dismissible: true/);
assert.doesNotMatch(settingsUi, /MDViewer-Python-Server-Start\.cmd/);
assert.match(settingsUi, /startLocalSqliteServer: startLocalSqliteServer/);
assert.match(launcher, /py -3 run\.py/);
assert.match(launcher, /^@echo off & cd \/d "%~dp0" & py -3 run\.py\s*$/);
assert.match(indexHtml, /settings-ui\.js\?v=20260807-local-server-toast-3/);
assert.match(indexHtml, /id="toast-close"/);
assert.match(indexHtml, /z-\[2147483647\]/);
assert.match(appJs, /function hideToast\(\)/);
assert.match(appJs, /config\.persistent !== true/);
assert.match(appJs, /toast\.style\.display = 'none'/);
assert.match(appJs, /toast\.style\.display = 'flex'/);
assert.match(stylesheet, /body\.feature-sqlite-disabled button\[id\*="sqlite" i\]/);
assert.match(stylesheet, /body\.feature-sqlite-disabled a\[id\*="sqlite" i\]/);
assert.doesNotMatch(stylesheet, /:not\(#sqlite-start-local-server\)/);
assert.doesNotMatch(stylesheet, /:not\(#sqlite-open-local-app\)/);
assert.match(vscodeTasks, /MD Viewer: Python SQLite 서버/);
assert.match(vscodeTasks, /"command": "py"/);

console.log('SQLite local server control tests passed.');

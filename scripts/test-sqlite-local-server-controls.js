const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
assert.match(settingsUi, /buildLocalSqliteServerFolderPickerCommand/);
assert.match(settingsUi, /BrowseForFolder/);
assert.match(settingsUi, /선택한 폴더에 run\.py가 없습니다/);
assert.match(settingsUi, /Python 서버 폴더 찾기/);
assert.match(settingsUi, /copyLocalServerCommand/);
assert.match(settingsUi, /Windows 키\+R/);
assert.match(settingsUi, /persistent: true, dismissible: true/);
assert.doesNotMatch(settingsUi, /MDViewer-Python-Server-Start\.cmd/);
assert.match(settingsUi, /startLocalSqliteServer: startLocalSqliteServer/);
assert.match(launcher, /py -3 run\.py/);
assert.match(launcher, /^@echo off & cd \/d "%~dp0" & py -3 run\.py\s*$/);
assert.match(indexHtml, /settings-ui\.js\?v=20260811-folder-picker-1/);
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

const sandbox = {
    window: {},
    document: { addEventListener() {} },
    URL
};
vm.runInNewContext(settingsUi, sandbox);
const pickerCommand = sandbox.window.SettingUI.buildLocalSqliteServerFolderPickerCommand();
assert.match(pickerCommand, /^powershell\.exe -NoProfile -STA -Command "/);
assert.match(pickerCommand, /BrowseForFolder/);
assert.match(pickerCommand, /Join-Path \$folder\.Self\.Path 'run\.py'/);
assert.match(pickerCommand, /Test-Path -LiteralPath \$runPy/);
assert.match(pickerCommand, /py -3 \$runPy/);
assert.match(pickerCommand, /run\.py가 없습니다/);
assert.ok(pickerCommand.endsWith('"'));
if (process.platform === 'win32') {
    const commandBody = pickerCommand.slice(pickerCommand.indexOf('"') + 1, -1);
    const encodedBody = Buffer.from(commandBody, 'utf16le').toString('base64');
    const parserScript = "$body=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('"
        + encodedBody
        + "'));$tokens=$null;$errors=$null;"
        + '[System.Management.Automation.Language.Parser]::ParseInput($body,[ref]$tokens,[ref]$errors)|Out-Null;'
        + 'if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}';
    const encodedParser = Buffer.from(parserScript, 'utf16le').toString('base64');
    const parsed = childProcess.spawnSync(
        'powershell.exe',
        ['-NoProfile', '-EncodedCommand', encodedParser],
        { encoding: 'utf8', timeout: 10000 }
    );
    assert.equal(parsed.status, 0, parsed.stdout || parsed.stderr || 'PowerShell command parse failed');
}

console.log('SQLite local server control tests passed.');

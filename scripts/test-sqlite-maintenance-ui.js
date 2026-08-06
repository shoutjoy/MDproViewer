const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const settings = read('Setting/settings-ui.js');
const storage = read('js/storage/storage-service.js');
const index = read('index.html');
const run = read('run.py');
const lock = read('LocalSave_sqlite/server/instance_lock.py');
const policy = read('LocalSave_sqlite/SQLITE_LOCAL_SERVER_SHARING_POLICY.md');

assert.match(settings, /id="sqlite-integrity-check-run"/);
assert.match(settings, /id="sqlite-integrity-check-result"/);
assert.match(settings, /async function runSqliteIntegrityCheck/);
assert.match(settings, /MDPStorage\.runSqliteIntegrityCheck/);
assert.match(settings, /OneDrive·NAS·공유 폴더/);
assert.match(settings, /\.mdpbackup/);
assert.match(storage, /runSqliteIntegrityCheck/);
assert.match(index, /storage-service\.js\?v=20260806-maintenance-1/);
assert.match(index, /settings-ui\.js\?v=20260806-maintenance-1/);
assert.match(run, /SqliteInstanceLock/);
assert.match(run, /mdviewer\.instance\.lock/);
assert.doesNotMatch(settings, /MD_VIEWER_SQLITE_PATH/);
assert.match(lock, /msvcrt\.locking/);
assert.match(lock, /fcntl\.flock/);
assert.match(policy, /MD_VIEWER_SQLITE_ROOT/);
assert.match(policy, /MD_VIEWER_SQLITE_PATH/);
assert.match(policy, /동시에 열어 쓰는 방식은 지원하지 않는다/);
assert.match(policy, /인증/);
assert.match(policy, /TLS/);
assert.match(policy, /충돌/);

console.log('SQLite maintenance UI/lock policy contract tests passed.');

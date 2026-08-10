const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'js', 'Scholarref', 'scholarsearch-shell.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'js', 'Scholarref', 'scholarsearch-shell.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'Local_SQLiteWASM', 'sqlite-wasm-worker.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage', 'storage-service.js'), 'utf8');
const indexedDb = fs.readFileSync(path.join(root, 'js', 'storage', 'indexeddb-adapter.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

for (const token of [
    'scholar-search-sqlite-explorer-btn',
    'scholar-search-storage-actions',
    'CrossrefBank(SQL)',
    'scholar-search-indb-explorer-btn',
    'CrossrefBank(inDB)',
    'scholarref-indb-save-btn',
    'scholar-crossref-indb-save',
    'scholar-crossref-sqlite-query',
    'scholar-crossref-sqlite-list',
    'STORAGE 저장 검색'
]) assert.ok(html.includes(token), `Missing Scholar HTML token: ${token}`);

for (const token of [
    'function openScholarStorageExplorer',
    'function openScholarInDbExplorer',
    'function refreshScholarCrossrefSqliteExplorer',
    'function loadScholarCrossrefSqliteItem',
    'function saveScholarSqliteWorkFile',
    'function listScholarSqliteWorkFiles',
    'saveScholarInDbWorkFile',
    'storageBackendLabel',
    "workType: 'crossref_markdown'"
]) assert.match(shell, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(worker, /crossref_markdown:\s*\{\s*extension:\s*'md'/);
assert.match(worker, /scholar_references_md:\s*\{\s*extension:\s*'md'/);
assert.doesNotMatch(worker, /WORK_FILE_APP_UNSUPPORTED/);
assert.match(settings, /학술검색 결과창에서 열기/);
assert.match(settings, /window\.MDPStorage\.loadSqliteWorkFile\(item\)/);
assert.doesNotMatch(storage, /SQLITE_MODE_REQUIRED/);
assert.match(storage, /saveScholarSqliteWorkFile/);
assert.match(storage, /listScholarSqliteWorkFiles/);
assert.match(storage, /loadScholarSqliteWorkFile/);
assert.match(storage, /saveScholarInDbWorkFile/);
assert.match(storage, /listScholarInDbWorkFiles/);
assert.match(storage, /loadScholarInDbWorkFile/);
assert.match(storage, /sqliteAdapters\.concat\(\[indexedDbAdapter\]\)/);
assert.match(storage, /mdpro_sqlite_feature_enabled_v1/);
assert.match(indexedDb, /async uploadWorkFile/);
assert.match(indexedDb, /async listWorkFiles/);
assert.match(indexedDb, /async downloadWorkFile/);
assert.match(app, /const DB_VERSION = 6/);
assert.match(app, /createObjectStore\('work_files'/);
assert.match(app, /'STORAGE'/);
assert.match(styles, /body\.feature-sqlite-disabled button\[id\*="sqlite" i\]/);
assert.doesNotMatch(styles, /:not\(\.scholar-sqlite-access\)/);
assert.match(shell, /function scholarSqliteFeatureEnabled\(\)/);
assert.match(shell, /openScholarStorageExplorer\('sqlite'\)/);
assert.match(shell, /state\.crossrefStorageFilter === 'sqlite'/);
assert.match(shell, /설정에서 SQLite 사용을 먼저 체크하세요/);

console.log('Scholar SQLite explorer integration checks passed.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'js', 'Scholarref', 'scholarsearch-shell.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'js', 'Scholarref', 'scholarsearch-shell.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'Local_SQLiteWASM', 'sqlite-wasm-worker.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js', 'storage', 'storage-service.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

for (const token of [
    'scholar-search-sqlite-explorer-btn',
    'scholar-crossref-sqlite-query',
    'scholar-crossref-sqlite-list',
    'SQLite 저장 검색'
]) assert.match(html, new RegExp(token));

for (const token of [
    'function openScholarSqliteExplorer',
    'function refreshScholarCrossrefSqliteExplorer',
    'function loadScholarCrossrefSqliteItem',
    'function saveScholarSqliteWorkFile',
    'function listScholarSqliteWorkFiles',
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
assert.match(styles, /:not\(\.scholar-sqlite-access\)/);

console.log('Scholar SQLite explorer integration checks passed.');

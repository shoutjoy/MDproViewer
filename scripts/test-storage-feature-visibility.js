const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('index.html');
const css = read('css', 'style.css');
const app = read('js', 'app.js');
const github = read('js', 'GithubData', 'github-app.js');
const sidebar = read('sidebar_left', 'sidebar-left.js');
const settings = read('Setting', 'settings-ui.js');
const fmaSqlite = read('Apps', 'fmaviewer', 'js', 'storage', 'sqliteWorkfiles.js');
const genSlideSqlite = read('js', 'Html2pptx', 'jenaEditor', 'js', 'sqliteStorage.js');

assert.match(html, /<span>SQLite 사용<\/span>/);
assert.doesNotMatch(html, /<span>Sqlite 사용<\/span>/);
assert.match(html, /id="local-storage-enabled"/);
assert.match(html, /<span>Local<\/span>/);
assert.match(html, /feature-sqlite-disabled feature-github-disabled feature-local-disabled/);

assert.match(sidebar, /id="tab-storage-local"[\s\S]*?<span>Local<\/span>/);
assert.match(css, /feature-sqlite-disabled button\[id\*="sqlite" i\]/);
assert.doesNotMatch(css, /feature-sqlite-disabled[^\n]+scholar-sqlite-access/);
assert.match(css, /feature-github-disabled #tab-storage-github/);
assert.match(css, /feature-local-disabled #tab-storage-local/);

assert.match(app, /localEnabled:\s*!!\(localStorageEl && localStorageEl\.checked\)/);
assert.match(app, /localEnabledCheck\.checked = settings\.localEnabled === true/);
assert.match(github, /function applyStorageFeatureVisibility/);
assert.match(github, /currentStorageSourceTab = 'indb'/);
assert.match(github, /next === 'local' && !featureFlags\.local/);
assert.match(github, /next === 'sqlite' && !featureFlags\.sqlite/);
assert.match(settings, /notifyStorageFeatureVisibility\(\)/);

assert.match(fmaSqlite, /function applySqliteFeatureButtonVisibility/);
assert.match(genSlideSqlite, /function applySqliteFeatureButtonVisibility/);

console.log('Storage feature visibility checks passed.');

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
assert.match(html, /id="sqlite-enabled" aria-controls="sqlite-runtime-settings-panel" aria-expanded="false"/);
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
assert.match(app, /const sqliteEnabled = !!\(sqliteEnabledEl && sqliteEnabledEl\.checked\)/);
assert.doesNotMatch(app, /sqliteEnabledEl && sqliteEnabledEl\.checked\s*\n\s*&& sqliteStorageStatus/);
assert.match(github, /function applyStorageFeatureVisibility/);
assert.match(github, /currentStorageSourceTab = 'indb'/);
assert.match(github, /next === 'local' && !featureFlags\.local/);
assert.match(github, /next === 'sqlite' && !featureFlags\.sqlite/);
assert.match(settings, /notifyStorageFeatureVisibility\(\)/);
assert.match(settings, /mdpro_sqlite_feature_enabled_v1/);
assert.match(settings, /<option value="wasm" selected>WASM · OPFS \(기본\)<\/option>/);
assert.match(settings, /DEFAULT_SQLITE_BACKEND = 'wasm'/);
assert.match(settings, /panel\.classList\.toggle\('hidden', visible !== true\)/);
assert.match(settings, /panel\.id = 'sqlite-runtime-settings-panel'/);
const checkboxHandler = settings.slice(
    settings.indexOf('async function handleSqliteCheckboxChange'),
    settings.indexOf('async function refreshSqliteStatus')
);
assert.match(checkboxHandler, /writeSqliteFeatureEnabled\(enabled\)/);
assert.match(checkboxHandler, /setSqliteSettingsPanelVisible\(enabled\)/);
assert.doesNotMatch(checkboxHandler, /requestMode/);
assert.doesNotMatch(checkboxHandler, /checkbox\.checked = false/);
const backendHandler = settings.slice(
    settings.indexOf('async function handleSqliteBackendChange'),
    settings.indexOf('function setSqliteRestorePreviewAvailable')
);
assert.match(backendHandler, /requestSqliteBackend\(select\.value\)/);

assert.match(fmaSqlite, /function applySqliteFeatureButtonVisibility/);
assert.match(genSlideSqlite, /function applySqliteFeatureButtonVisibility/);

console.log('Storage feature visibility checks passed.');

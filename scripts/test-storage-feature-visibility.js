const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('index.html');
const css = read('css', 'style.css');
const app = read('js', 'app.js');
const github = read('js', 'GithubData', 'github-app.js');
const githubSettings = read('js', 'GithubData', 'github-settings.js');
const sidebar = read('sidebar_left', 'sidebar-left.js');
const settings = read('Setting', 'settings-ui.js');
const fmaSqlite = read('Apps', 'fmaviewer', 'js', 'storage', 'sqliteWorkfiles.js');
const genSlideSqlite = read('js', 'Html2pptx', 'jenaEditor', 'js', 'sqliteStorage.js');

assert.match(html, /<span>SQLite 사용<\/span>/);
assert.doesNotMatch(html, /<span>Sqlite 사용<\/span>/);
assert.match(html, /id="sqlite-enabled" aria-controls="sqlite-runtime-settings-panel" aria-expanded="false"/);
assert.match(html, /id="local-storage-enabled"/);
assert.match(html, /<span>Local<\/span>/);
assert.match(html, /feature-sqlite-disabled feature-github-disabled feature-local-enabled/);
assert.match(html, /id="local-storage-enabled"[^>]*checked/);

assert.match(sidebar, /id="tab-storage-local"[\s\S]*?<span>Local<\/span>/);
assert.match(css, /feature-sqlite-disabled button\[id\*="sqlite" i\]/);
assert.doesNotMatch(css, /feature-sqlite-disabled[^\n]+scholar-sqlite-access/);
assert.doesNotMatch(css, /feature-github-disabled #tab-storage-github/);
assert.doesNotMatch(css, /feature-local-disabled #tab-storage-local/);
assert.match(css, /sidebar-storage-local-hidden #tab-storage-local/);
assert.match(css, /sidebar-storage-indb-hidden #tab-storage-indb/);
assert.match(css, /sidebar-storage-sqlite-hidden #tab-storage-sqlite/);
assert.match(css, /sidebar-storage-github-hidden #tab-storage-github/);

assert.match(app, /localEnabled:\s*!!\(localStorageEl && localStorageEl\.checked\)/);
assert.match(app, /function getLocalStorageFeatureEnabledFromSettings\(settings\)/);
assert.match(app, /localEnabledCheck\.checked = getLocalStorageFeatureEnabledFromSettings\(settings\)/);
assert.match(app, /localEnabledEmpty\.checked = true/);
assert.match(app, /const sqliteEnabled = !!\(sqliteEnabledEl && sqliteEnabledEl\.checked\)/);
assert.doesNotMatch(app, /sqliteEnabledEl && sqliteEnabledEl\.checked\s*\n\s*&& sqliteStorageStatus/);
assert.match(github, /function applyStorageFeatureVisibility/);
assert.match(github, /mdpro_storage_sidebar_visibility_v1/);
assert.match(github, /mdpro_storage_sidebar_auto_revealed_v1/);
assert.match(github, /local:\s*false,[\s\S]*indb:\s*true,[\s\S]*sqlite:\s*false,[\s\S]*github:\s*false/);
assert.match(github, /function revealEnabledStorageSidebarFeaturesOnce/);
assert.match(github, /revealEnabledStorageSidebarFeaturesOnce\(flags\)/);
assert.match(github, /function onStorageSidebarVisibilityChange/);
assert.match(github, /toggleGithubSettingsSection\(\{ folded: folded \}\)/);
assert.match(github, /body\.classList\.toggle\('hidden', folded\)/);
assert.doesNotMatch(
    github.slice(github.indexOf('function toggleGithubSettingsSection'), github.indexOf('function getStorageFeatureFlags')),
    /!checked \|\| folded/
);
assert.match(github, /button\.toggleAttribute\('hidden', hidden\)/);
assert.doesNotMatch(
    github.slice(github.indexOf('function onStorageSidebarVisibilityChange'), github.indexOf('function applyStorageFeatureVisibility')),
    /currentStorageSourceTab|requestMode|setStorageSourceTabToLocal/
);
assert.match(app, /SIDEBAR 보이기/);
assert.match(app, /sidebar-storage-local-visible/);
assert.match(app, /sidebar-storage-indb-visible/);
assert.match(app, /sidebar-storage-sqlite-visible/);
assert.match(app, /sidebar-storage-github-visible/);
assert.equal((app.match(/data-storage-sidebar-visibility="(?:local|indb|sqlite|github)"[^>]* checked/g) || []).length, 1);
assert.match(app, /sidebar-storage-indb-visible[^>]* checked/);
assert.match(app, /기본은 inDB만 표시합니다/);
assert.match(app, /아래 사용 설정을 처음 켜면 자동으로 표시/);
assert.match(app, /SETTINGS_EXPORT_LOCAL_KEYS[\s\S]*mdpro_storage_sidebar_visibility_v1/);
assert.match(app, /SETTINGS_EXPORT_LOCAL_KEYS[\s\S]*mdpro_storage_sidebar_auto_revealed_v1/);
assert.match(github, /currentStorageSourceTab = 'indb'/);
assert.match(github, /next === 'local' && !featureFlags\.local/);
assert.match(github, /next === 'sqlite' && !featureFlags\.sqlite/);
assert.match(github, /const savedSettings = next === 'github' \? \(await getAiSettings\(\) \|\| \{\}\) : null/);
assert.match(github, /savedGithubConfig\.token/);
assert.match(github, /function syncGithubSettingsFields\(settings\)/);
assert.match(github, /const cfg = syncGithubSettingsFields\(settings\)/);
const startupVisibility = app.slice(app.indexOf('async function initAiVisibility'), app.indexOf('function openSettingsModal'));
assert.match(startupVisibility, /githubTokenEl\.value = settings\.githubToken \|\| ''/);
assert.match(startupVisibility, /githubRepoEl\.value = settings\.githubRepo \|\| ''/);
assert.match(startupVisibility, /githubBranchEl\.value = settings\.githubBranch \|\| 'main'/);
assert.match(app, /await initAiVisibility\(\)/);
assert.ok(app.indexOf('window.syncGithubSettingsFields(startupSettings || {})') < app.indexOf('currentStorageSourceTab = getStorageSourceTabFromLocal()'));
assert.match(settings, /notifyStorageFeatureVisibility\(\)/);
assert.match(githubSettings, /function toggleGithubSettingsSection\(params\)[\s\S]*body\.classList\.toggle\('hidden', folded\)/);
assert.doesNotMatch(
    githubSettings.slice(githubSettings.indexOf('function toggleGithubSettingsSection'), githubSettings.indexOf('async function openGithubRepoCreateModal')),
    /!checked \|\| folded/
);
assert.match(settings, /mdpro_sqlite_feature_enabled_v1/);
assert.match(settings, /<option value="wasm" selected>WASM · OPFS \(기본\)<\/option>/);
assert.match(settings, /DEFAULT_SQLITE_BACKEND = 'wasm'/);
assert.match(settings, /window\.isSettingsContainerFolded\('sqlite-settings-tool'\)/);
assert.match(settings, /const expanded = visible === true && folded !== true/);
assert.match(settings, /panel\.classList\.toggle\('hidden', !expanded\)/);
assert.match(settings, /panel\.id = 'sqlite-runtime-settings-panel'/);
assert.match(html, /id="sqlite-settings-fold-btn"/);
assert.match(html, /id="settings-collapse-all-btn"/);
assert.match(html, /id="settings-expand-all-btn"/);
assert.match(html, /id="ai-authentication-controls" class="hidden space-y-3" aria-hidden="true"/);
assert.match(html, /<details id="ai-studio-settings-card"/);
assert.match(html, /AI Studio API 설정 \(선택\)/);
assert.match(app, /function setAllSettingsContainersFolded\(folded\)/);
assert.match(app, /function applyAiAuthenticationControlsVisibility\(authenticated\)/);
assert.match(app, /const AI_AUTHENTICATION_REQUIRED = false/);
assert.match(app, /function isAiAccessVerified\(settings\)[\s\S]*!AI_AUTHENTICATION_REQUIRED/);
assert.match(app, /controls\.classList\.toggle\('hidden', hidden\)/);
assert.match(app, /const verified = isAiAccessVerified\(settings\);[\s\S]*applyAiAuthenticationControlsVisibility\(verified\)/);
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

const storage = new Map();
const context = {
    window: {},
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); }
    },
    document: {
        body: { classList: { toggle() {} } },
        getElementById() { return null; }
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    Blob,
    TextEncoder,
    TextDecoder
};
context.window.window = context.window;
context.window.document = context.document;
vm.runInNewContext(github, context, { filename: 'github-app.js' });

assert.deepEqual(
    JSON.parse(JSON.stringify(context.window.getStorageSidebarVisibility())),
    { local: false, indb: true, sqlite: false, github: false }
);
context.window.revealEnabledStorageSidebarFeaturesOnce({ local: true, sqlite: false, github: false });
assert.equal(context.window.getStorageSidebarVisibility().local, true);
context.window.setStorageSidebarVisibility({ local: false });
context.window.revealEnabledStorageSidebarFeaturesOnce({ local: true, sqlite: false, github: false });
assert.equal(context.window.getStorageSidebarVisibility().local, false);

console.log('Storage feature visibility checks passed.');

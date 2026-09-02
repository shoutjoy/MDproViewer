const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');
const githubApp = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');
const settingsUi = fs.readFileSync(path.join(root, 'Setting', 'settings-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('collapsed sidebar keeps storage sources as icon buttons', () => {
  for (const id of ['local', 'indb', 'sqlite', 'github']) {
    assert.match(sidebar, new RegExp(`id="tab-storage-${id}"[\\s\\S]{0,420}storage-tab-icon[\\s\\S]{0,180}storage-tab-label`));
  }
  assert.doesNotMatch(githubApp, /shouldShow\s*=\s*!isSidebarCollapsed\s*&&\s*hasVisibleTab/);
  assert.match(css, /\.sidebar-collapsed #storage-source-tabs\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(css, /\.sidebar-collapsed #storage-source-tabs \.storage-tab-label\s*\{\s*display:\s*none;/);
});

test('SQLite feature defaults to disabled when no preference exists', () => {
  assert.match(settingsUi, /const DEFAULT_SQLITE_FEATURE_ENABLED = false;/);
  assert.match(settingsUi, /readSqliteFeatureEnabled\(DEFAULT_SQLITE_FEATURE_ENABLED\)/);
});

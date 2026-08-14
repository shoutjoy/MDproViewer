const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('main viewer exposes a persisted header background removal control', () => {
  assert.match(index, /id="main-header-background-remove"/);
  assert.match(index, /onchange="setMainHeaderBackgroundRemoved\(this\.checked\)"/);
  assert.match(index, />배경 제거</);
  assert.match(app, /MAIN_HEADER_BACKGROUND_REMOVED_KEY = 'md_viewer_main_header_background_removed_v1'/);
  assert.match(app, /localStorage\.getItem\(MAIN_HEADER_BACKGROUND_REMOVED_KEY\) === '1'/);
  assert.match(app, /function setMainHeaderBackgroundRemoved\(removed, persist\)/);
  assert.match(app, /classList\.toggle\('md-main-header-background-removed', mainHeaderBackgroundRemoved\)/);
  assert.match(app, /localStorage\.setItem\(MAIN_HEADER_BACKGROUND_REMOVED_KEY, mainHeaderBackgroundRemoved \? '1' : '0'\)/);
  assert.match(app, /setMainHeaderBackgroundRemoved\(false, false\)/);
});

test('header background removal is scoped to the main viewer', () => {
  assert.match(style, /html\.md-main-header-background-removed #viewer\.markdown-body h1/);
  assert.match(style, /html\.md-main-header-background-removed #viewer\.markdown-body h6/);
  assert.match(style, /background: none !important/);
  assert.doesNotMatch(style, /html\.md-main-header-background-removed \.markdown-body h1/);
});

test('main header assets use a fresh cache key', () => {
  assert.match(index, /style\.css[^"\r\n]*mainHeaderBackground=20260815-1/);
  assert.match(index, /app\.js[^"\r\n]*mainHeaderBackground=20260815-1/);
});

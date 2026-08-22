const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('edit and view documents use the available height near the status footer', () => {
  assert.match(html, /id="viewer-container"[\s\S]*?pb-3 sm:pb-4 md:pb-5/);
  assert.match(html, /id="content-viewport"[^>]*pb-3 sm:pb-4 md:pb-5/);
  assert.doesNotMatch(html, /id="content-viewport"[^>]*md:pb-16/);
});

test('rendered view sheet cannot shrink shorter than its markdown content', () => {
  assert.match(css, /#viewer-container #viewer\s*\{[\s\S]*?flex:\s*0 0 auto;/);
  assert.match(css, /#viewer-container #viewer\s*\{[\s\S]*?align-self:\s*flex-start;/);
  assert.match(css, /#viewer-container #viewer\s*\{[\s\S]*?min-height:\s*100%;/);
  assert.match(css, /#viewer-container #viewer\s*\{[\s\S]*?height:\s*max-content;/);
});

test('top and bottom jump controls remain available in view mode', () => {
  assert.doesNotMatch(css, /body\.viewer-view-mode \.scroll-jump-rail\s*\{[\s\S]*?display:\s*none/);
  const toggleMode = app.slice(app.indexOf('function toggleMode(mode)'), app.indexOf('const DEDICATED_LOCAL_VIEWER_EXTENSIONS'));
  assert.match(toggleMode, /if \(scrollJumpRail\) scrollJumpRail\.classList\.remove\('hidden'\);/);
  assert.doesNotMatch(toggleMode, /if \(scrollJumpRail\) scrollJumpRail\.classList\.add\('hidden'\);/);
});

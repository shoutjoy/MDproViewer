const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

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

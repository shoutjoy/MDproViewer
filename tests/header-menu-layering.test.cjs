const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('main header menus stay above the edit toolbar', () => {
  const headerClass = html.match(/<header\s+class="([^"]*\bapp-header\b[^"]*)"/);
  assert.ok(headerClass, 'app header should exist');
  assert.ok(headerClass[1].split(/\s+/).includes('z-[60]'), 'app header stacking context should be above the edit toolbar');
  assert.match(css, /#toolbar\s*\{[\s\S]*?z-index:\s*50;/, 'edit toolbar layer should remain below the app header');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('A4 new-file choices are hidden by default and controlled by ENV settings', () => {
  assert.equal((html.match(/data-a4-new-file-menu-item/g) || []).length, 2);
  assert.equal((html.match(/data-a4-new-file-menu-item[^>]*class="hidden /g) || []).length, 2);
  assert.match(html, /id="a4-new-file-visible"[^>]*toggleA4NewFileVisibilitySection/);
  assert.match(app, /function getA4NewFileVisibleFromSettings\(settings\)[\s\S]*?settings\.a4NewFileVisible === true/);
  assert.match(app, /querySelectorAll\('\[data-a4-new-file-menu-item\]'\)[\s\S]*?classList\.toggle\('hidden', !a4NewFileEnabled\)/);
  assert.match(app, /setAiSettings\(\{ a4NewFileVisible: enabled \}\)/);
});

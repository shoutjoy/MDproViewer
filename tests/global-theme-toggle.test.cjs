const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const start = app.indexOf('function toggleTheme()');
const end = app.indexOf('\nfunction initTheme()', start);

assert.ok(start >= 0 && end > start, 'toggleTheme implementation must exist');
const toggleTheme = app.slice(start, end);
assert.match(toggleTheme, /localStorage\.setItem\(THEME_KEY, isDark \? 'dark' : 'light'\)/);
assert.match(toggleTheme, /localStorage\.setItem\(EDITOR_LIGHT_KEY, isDark \? '' : '1'\)/);
assert.match(toggleTheme, /applyEditorLightPreference\(\)/);
assert.ok(
  toggleTheme.indexOf('applyEditorLightPreference()') < toggleTheme.indexOf('refreshMermaidDisplay()'),
  'document theme must be aligned before Mermaid is refreshed'
);

console.log('global theme toggle tests passed');

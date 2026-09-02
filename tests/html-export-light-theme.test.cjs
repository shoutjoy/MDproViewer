const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'export', 'html-export.js'), 'utf8');

test('HTML export always emits the viewer document in light mode', () => {
  assert.match(source, /classList\.remove\('dark'\)/);
  assert.match(source, /body\.classList\.add\('theme-light'\)/);
  assert.match(source, /name !== 'dark'/);
  assert.match(source, /data-color-scheme="light"/);
  assert.match(source, /html,body\{color-scheme:light\}/);
  assert.match(source, /background:#fff;color:#1e293b/);
});

test('complete HTML documents are normalized to the light export theme', () => {
  assert.match(source, /ensureHtmlMetadata\(parsed,[\s\S]{0,160}applyLightExportTheme\(parsed\)/);
  assert.match(source, /hasAttribute\('data-theme'\)[\s\S]{0,80}setAttribute\('data-theme', 'light'\)/);
});

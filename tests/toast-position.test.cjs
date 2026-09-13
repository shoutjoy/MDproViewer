const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('bottom toast is positioned to the right of the LCR control', () => {
  assert.match(app, /function syncToastPosition\(\)[\s\S]*?getElementById\('editor-shift-float'\)/);
  assert.match(app, /preferredLeft\s*=\s*Math\.round\(controlRect\.right \+ gap\)/);
  assert.match(app, /toast\.style\.left\s*=\s*`\$\{preferredLeft\}px`/);
  assert.match(app, /toast\.style\.maxWidth\s*=\s*`\$\{Math\.min\(720, availableWidth\)\}px`/);
  assert.match(app, /toast\.style\.display\s*=\s*'flex';\s*syncToastPosition\(\);/);
});

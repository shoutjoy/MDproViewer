const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const share = fs.readFileSync(path.join(root, 'ShareSites', 'Share', 'share.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('Share button stays in the header when AI Jena is docked', () => {
  assert.doesNotMatch(style, /html\.ai-chat-page-pushed #btn-export-gdocs:not\(\.hidden\)/);
});

test('Share window opens immediately to the left of the AI Jena dock', () => {
  assert.match(share, /const rightMargin = dockWidth > 0 \? dockWidth \+ 36 : 16;/);
  assert.match(share, /const top = dockWidth > 0 \? 124 : 100;/);
  assert.match(share, /window\.innerWidth - \(panel\.offsetWidth \|\| 270\) - rightMargin/);
  assert.match(share, /panel\.classList\.toggle\('ai-jena-dock-adjacent', dockWidth > 0\)/);
});

test('Share window follows dock and viewport changes until manually moved', () => {
  assert.match(share, /window\.addEventListener\('ai-jena-layout-change'[\s\S]*?!shareModalMoved/);
  assert.match(share, /window\.addEventListener\('resize'[\s\S]*?!shareModalMoved/);
});

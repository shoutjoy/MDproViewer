const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('BI applies bold directly and its arrow opens the italic menu', () => {
  assert.match(html, /id="btn-text-emphasis-bold" onclick="insertAtCursor\('bold'\)"[\s\S]*?<span>BI<\/span>/);
  assert.match(html, /id="btn-text-emphasis-quick" onclick="toggleTextEmphasisQuickMenu\(\)"/);
  assert.match(html, /id="text-emphasis-quick-panel"[\s\S]*?format-quick-row[\s\S]*?insertAtCursor\('italic'\)[\s\S]*?>I</);
  const emphasisPanel = html.slice(html.indexOf('id="text-emphasis-quick-panel"'), html.indexOf('id="heading-tools-expanded"'));
  assert.doesNotMatch(emphasisPanel, /insertAtCursor\('bold'\)/);
});

test('H1-H5 quick format choices remain on a single row', () => {
  assert.match(html, /id="heading-quick-panel"[\s\S]*?applyHeading\(1\)[\s\S]*?applyHeading\(2\)[\s\S]*?applyHeading\(3\)[\s\S]*?applyHeading\(4\)[\s\S]*?applyHeading\(5\)/);
  assert.match(css, /\.format-quick-row\s*\{[\s\S]*?flex-flow:\s*row nowrap;/);
});

test('toolbar popovers remain above the document instead of disappearing below it', () => {
  assert.match(css, /#toolbar\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*50;[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(css, /html:not\(\.dark\) \.format-quick-item:hover[\s\S]*?background:\s*#7c3aed\s*!important;/);
});

test('both list menu choices are explicitly visible without a purple treatment', () => {
  assert.match(html, /insertListAtSelection\('bullet'\)[\s\S]*?insertListAtSelection\('number'\)/);
  assert.match(css, /#list-quick-panel:not\(\.hidden\)\s*\{[\s\S]*?display:\s*flex\s*!important;/);
  assert.match(css, /#list-quick-panel > button\s*\{[\s\S]*?visibility:\s*visible\s*!important;[\s\S]*?opacity:\s*1\s*!important;/);
  assert.doesNotMatch(html, /insertListAtSelection\('bullet'\)[^>]*hover:bg-indigo-600/);
});

test('all edit-toolbar dropdowns use the shared complete-popover layer', () => {
  const panelIds = [
    'text-emphasis-quick-panel', 'heading-quick-panel', 'list-quick-panel',
    'code-quote-quick-panel', 'mermaid-quick-panel', 'table-insert-picker',
    'image-insert-quick-panel', 'note-cover-menu-panel', 'math-quick-panel',
    'tidy-quick-panel', 'footnote-quick-panel'
  ];
  for (const id of panelIds) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,220}class="[^"]*toolbar-popover`), id);
  }
  assert.match(css, /\.toolbar-popover:not\(\.hidden\)\s*\{[\s\S]*?z-index:\s*100\s*!important;[\s\S]*?isolation:\s*isolate;/);
  assert.match(css, /\.toolbar-popover button:not\(\.hidden\)[\s\S]*?visibility:\s*visible\s*!important;/);
});

test('hovered menu choices retain contrasting backgrounds and text', () => {
  assert.match(css, /html:not\(\.dark\) \.toolbar-popover button:not\(\.hidden\):hover[\s\S]*?background-color:\s*#e2e8f0\s*!important;[\s\S]*?color:\s*#0f172a\s*!important;/);
  assert.match(css, /\.dark \.toolbar-popover button:not\(\.hidden\):hover[\s\S]*?background-color:\s*#334155\s*!important;[\s\S]*?color:\s*#f8fafc\s*!important;/);
});

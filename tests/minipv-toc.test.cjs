const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('js', 'UI_PV', 'minipv.html');
const js = read('js', 'UI_PV', 'minipv.js');
const css = read('css', 'style.css');

assert.match(html, /id="btn-mini-preview-zoom-in"[\s\S]*?id="btn-mini-preview-view-mode"[\s\S]*?>목차<\/button>/);
assert.match(js, /let miniPreviewViewMode = 'preview'/);
assert.match(js, /function toggleMiniPreviewViewMode\(forceMode\)/);
assert.match(js, /function renderMiniPreviewToc\(markdownText\)/);
assert.match(js, /SidebarLeft\.parseTocItemsFromMarkdown/);
assert.match(js, /window\.scrollToLine\(item\.lineIndex\)/);
assert.match(js, /miniPreviewViewMode === 'toc'[\s\S]*?renderMiniPreviewToc/);
assert.match(js, /window\.toggleMiniPreviewViewMode = toggleMiniPreviewViewMode/);
assert.match(css, /#btn-mini-preview-view-mode\.is-active/);
assert.match(css, /\.mini-preview-toc-item/);

console.log('miniPV preview and TOC mode checks passed.');

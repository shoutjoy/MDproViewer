const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('js', 'UI_PV', 'minipv.html');
const js = read('js', 'UI_PV', 'minipv.js');
const css = read('css', 'style.css');

assert.match(html, /id="btn-mini-preview-zoom-in"[\s\S]*?id="btn-mini-preview-view-mode"[\s\S]*?>ToC<\/button>/);
assert.match(html, /id="btn-mini-preview-fullscreen"[^>]*data-compact-label="⛶"/);
assert.match(html, /id="btn-mini-preview-close"[^>]*data-compact-label="×"/);
assert.match(js, /let miniPreviewViewMode = 'preview'/);
assert.match(js, /function toggleMiniPreviewViewMode\(forceMode\)/);
assert.match(js, /function renderMiniPreviewToc\(markdownText\)/);
assert.match(js, /SidebarLeft\.parseTocItemsFromMarkdown/);
assert.match(js, /window\.scrollToLine\(item\.lineIndex\)/);
assert.match(js, /miniPreviewViewMode === 'toc'[\s\S]*?renderMiniPreviewToc/);
assert.match(js, /window\.toggleMiniPreviewViewMode = toggleMiniPreviewViewMode/);
assert.match(js, /function prepareMiniPreviewResponsiveTables\(root\)/);
assert.match(js, /cell\.setAttribute\('data-mini-table-label', label\)/);
assert.match(js, /prepareMiniPreviewResponsiveTables\(miniPreviewContent\)/);
assert.match(css, /#btn-mini-preview-view-mode\.is-active/);
assert.match(css, /\.mini-preview-toc-item/);
assert.match(css, /table\.mini-preview-responsive-table/);
assert.match(css, /content: attr\(data-mini-table-label\)/);
assert.match(css, /@container \(max-width: 380px\)/);

console.log('miniPV preview and TOC mode checks passed.');

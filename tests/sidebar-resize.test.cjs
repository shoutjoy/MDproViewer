const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const html = read('index.html');
const css = read('sidebar_left', 'sidebar-resize.css');
const script = read('sidebar_left', 'sidebar-resize.js');
const sidebarScript = read('sidebar_left', 'sidebar-left.js');

assert.match(html, /sidebar_left\/sidebar-resize\.css\?v=20260903-narrow-icons-1/);
assert.match(html, /sidebar_left\/sidebar-resize\.js\?v=20260903-narrow-icons-1/);
assert.match(html, /sidebar_left\/sidebar-left\.js\?[^"']*shellRace=20260812-1/);
assert.match(script, /md_viewer_sidebar_width/);
assert.match(script, /addEventListener\('pointerdown'/);
assert.match(script, /setPointerCapture/);
assert.match(script, /addEventListener\('dblclick'/);
assert.match(script, /event\.key === 'ArrowLeft'/);
assert.match(script, /event\.key === 'ArrowRight'/);
assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(script, /Math\.max\(MIN_WIDTH, Math\.min\(getMaxWidth\(sidebar\)/);
assert.match(script, /const MIN_WIDTH = 64;/);
assert.match(script, /classList\.toggle\('sidebar-narrow', nextWidth <= NARROW_WIDTH\)/);
assert.match(script, /window\.SidebarLeft\.installSidebarShell\(\)/);
assert.match(sidebarScript, /sidebar\.querySelector\('#db-list'\)/);
assert.match(sidebarScript, /resizeHandle\.insertAdjacentHTML\('beforebegin', getSidebarShellHtml\(\)\)/);
assert.match(sidebarScript, /if \(document\.readyState === 'loading'\) document\.addEventListener\('DOMContentLoaded', installSidebarShell\);/);
assert.match(css, /#sidebar-resize-handle\s*\{[\s\S]*?cursor:\s*col-resize;/);
assert.match(css, /#sidebar\.sidebar-collapsed #sidebar-resize-handle\s*\{[\s\S]*?display:\s*none;/);
assert.match(css, /#sidebar\.sidebar-resizing\s*\{[\s\S]*?transition:\s*none !important;/);

console.log('Sidebar pointer resize wiring checks passed.');

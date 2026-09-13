const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const css = read('css', 'style.css');
const sidebar = read('sidebar_left', 'sidebar-left.js');
const github = read('js', 'GithubData', 'github-app.js');
const app = read('js', 'app.js');
const html = read('index.html');
const sidebarTitleRule = css.match(/#sidebar:not\(\.sidebar-collapsed\) \.sidebar-doc-title\s*\{([^}]*)\}/);

assert.match(css, /#sidebar:not\(\.sidebar-collapsed\) \.doc-action-btns\s*\{[\s\S]*?opacity:\s*1;/);
assert.match(css, /\.sidebar-collapsed \.doc-action-btns\s*\{[\s\S]*?display:\s*none !important;/);
assert.doesNotMatch(sidebar, /doc-action-btns[^"']*opacity-0/);
assert.doesNotMatch(github, /doc-action-btns[^"']*opacity-0/);
const openActionIndex = sidebar.indexOf("addDocumentAction('열기'");
const moveActionIndex = sidebar.indexOf("addDocumentAction('이동'");
const deleteActionIndex = sidebar.indexOf("addDocumentAction('삭제'");
assert.ok(openActionIndex >= 0 && moveActionIndex > openActionIndex && deleteActionIndex > moveActionIndex);
assert.match(sidebar, /addDocumentAction\('삭제', 'doc-delete-btn/);
assert.match(sidebar, /button\.setAttribute\('aria-label', title\)/);
assert.doesNotMatch(sidebar, /addDocumentAction\('삭제', '[^']*bg-red-50/);
assert.match(sidebar, /sidebar-folder-documents/);
assert.match(sidebar, /id="toggle-all-sidebar-folders"[\s\S]*?onclick="toggleAllSidebarFolders\(\)"/);
assert.match(app, /function toggleAllSidebarFolders\(\)[\s\S]*?const shouldCollapse = !syncToggleAllSidebarFoldersButton\(\)[\s\S]*?folderCollapseState\[folderId\] = shouldCollapse/);
assert.match(app, /button\.textContent = allCollapsed \? '▲' : '▼'/);
assert.match(github, /folderDiv\.className = 'sidebar-folder-node mb-2'[\s\S]*?folderDiv\.dataset\.folderId = folderId/);
assert.match(sidebar, /sidebar-doc-title/);
assert.doesNotMatch(sidebar, /sidebar-doc-title[^"']*truncate/);
assert.match(sidebar, /doc-open-btn/);
assert.match(sidebar, /doc-move-btn/);
assert.match(sidebar, /doc-github-btn/);
assert.match(github, /sidebar-folder-documents/);
assert.match(github, /sidebar-doc-title/);
assert.ok(sidebarTitleRule, 'sidebar title rule should exist');
assert.match(sidebarTitleRule[1], /max-height:\s*2\.7em;/);
assert.match(sidebarTitleRule[1], /font-size:\s*12px;/);
assert.doesNotMatch(sidebarTitleRule[1], /text-overflow:\s*ellipsis;/);
assert.match(css, /\.doc-open-btn:hover,[\s\S]*?background:\s*#7c3aed;/);
assert.match(css, /\.doc-move-btn:hover,[\s\S]*?background:\s*#2563eb;/);
assert.match(css, /\.doc-github-btn:hover,[\s\S]*?background:\s*#059669;/);
assert.match(css, /#sidebar \.doc-delete-btn\s*\{[\s\S]*?background:\s*#f8fafc;[\s\S]*?color:\s*#475569;/);
assert.match(css, /#sidebar \.doc-delete-btn:hover,[\s\S]*?background:\s*#dc2626;[\s\S]*?color:\s*#ffffff;/);
assert.match(html, /sidebarControls=20260812-4/);

console.log('Sidebar file controls visibility checks passed.');

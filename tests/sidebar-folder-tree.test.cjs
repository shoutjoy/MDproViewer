const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'sidebar_left', 'storage-tree.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

const sandbox = {
    window: {},
    document: {
        addEventListener() {},
        getElementById() { return null; }
    },
    setTimeout,
    clearTimeout,
    Map,
    Set
};
vm.runInNewContext(source, sandbox, { filename: 'sidebar-left.js' });

const folders = [
    { id: 'root', name: 'ROOT', parentId: null },
    { id: 'research', name: '연구자료', parentId: 'root' },
    { id: 'analysis', name: '연구분석', parentId: 'research' }
];
const documents = [
    { id: 'd1', title: '루트 문서', folderId: 'root' },
    { id: 'd2', title: '분석 문서', folderId: 'analysis' }
];
const tree = sandbox.window.SidebarLeft.buildFolderTreeModel(folders, documents, '');

assert.deepEqual(Array.from(tree.topLevel, folder => folder.id), ['root', 'research']);
assert.deepEqual(Array.from(tree.childrenByParent.get('research'), folder => folder.id), ['analysis']);
assert.equal(tree.documentsByFolder.get('analysis')[0].id, 'd2');
assert.equal(sandbox.window.SidebarLeft.buildFolderPath(folders, 'analysis'), '연구자료 / 연구분석');

const searched = sandbox.window.SidebarLeft.buildFolderTreeModel(folders, [documents[1]], '분석');
assert.equal(searched.visibleFolderIds.has('analysis'), true);
assert.equal(searched.visibleFolderIds.has('research'), true);
assert.equal(searched.visibleFolderIds.has('root'), true);

assert.match(source, /addEventListener\('dblclick'/);
assert.match(source, /ctx\.renameDocument/);
assert.match(source, /data-lucide="' \+ \(isCollapsedFolder \? 'chevron-right'/);
assert.match(source, /createActionButton\('folder-plus'/);
assert.match(css, /\.sidebar-folder-body\s*\{[\s\S]*?margin-left:\s*22px/);
assert.match(app, /function createNewFolder\(parentFolderId, parentFolderName\)/);
assert.match(app, /parentId:\s*targetParentId/);
assert.match(app, /renameDocument:\s*renameStoredDocument/);

console.log('Nested sidebar folders and inline rename checks passed.');

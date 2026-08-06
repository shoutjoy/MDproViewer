const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');
const explorer = fs.readFileSync(path.join(root, 'sidebar_left', 'local-folder-explorer.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const github = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert(sidebar.includes('id="tab-storage-local"'), 'Local folder tab is missing');
assert(
    sidebar.indexOf('id="tab-storage-local"') < sidebar.indexOf('id="tab-storage-indb"'),
    'Local folder tab must be placed to the left of inDB'
);
assert(html.includes('sidebar_left/local-folder-explorer.js'), 'Explorer script is not loaded');
assert(explorer.includes('window.showDirectoryPicker'), 'File System Access directory picker is missing');
assert(explorer.includes("input.setAttribute('webkitdirectory', '')"), 'Directory input fallback is missing');
assert(explorer.includes('window.LocalFolderExplorer = {'), 'Explorer public API is missing');
assert(app.includes("currentStorageSourceTab === 'local'"), 'Local storage list routing is missing');
assert(app.includes('window.openFileFromLocalFolderExplorer'), 'Local file opening bridge is missing');
assert(github.includes("window.LocalFolderExplorer.activate({ pickIfNeeded: true })"), 'Local tab activation is missing');

console.log('Local folder explorer integration tests passed');

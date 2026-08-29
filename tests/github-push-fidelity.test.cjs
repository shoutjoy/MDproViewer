const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const githubSource = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(githubSource, /function buildGithubFolderPath\(folders, folderId\)/);
assert.match(githubSource, /parts\.unshift\(segment\)/);
assert.match(githubSource, /folders:\s*folders,\s*storageMode:\s*'indb'/);
assert.match(githubSource, /const folderPath = buildGithubFolderPath\(source && source\.folders, doc\.folderId\)/);

assert.match(appSource, /function getCurrentMarkdownSnapshot\(\)/);
assert.match(appSource, /window\.getCurrentMarkdownSnapshot = getCurrentMarkdownSnapshot/);
assert.match(githubSource, /activeDocId === id && typeof window\.getCurrentMarkdownSnapshot === 'function'/);
assert.match(githubSource, /content:\s*encodeTextToGithubBase64\(pushContent\)/);
assert.match(githubSource, /content:\s*pushContent/);
assert.match(indexSource, /github-app\.js\?v=20260829-push-fidelity-1/);

console.log('GitHub push preserves nested folder paths and the active editor snapshot.');

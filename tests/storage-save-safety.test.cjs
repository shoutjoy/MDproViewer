const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const github = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('저장 위치 선택 모달은 원본, 선택 저장소, 취소를 모두 제공한다', () => {
    assert.match(html, /id="storage-save-location-modal"/);
    assert.match(html, /id="storage-save-origin"/);
    assert.match(html, /id="storage-save-target"/);
    assert.match(html, /id="storage-save-cancel"/);
    assert.match(app, /function askStorageSaveLocation\(origin, targetSource\)/);
});

test('저장 버튼은 출처와 선택 저장소가 다르면 먼저 안전 확인을 거친다', () => {
    assert.match(
        app,
        /async function saveToDB\(\)[\s\S]*?getCurrentDocumentStorageOrigin\(\)[\s\S]*?getSelectedSaveStorageSource\(\)[\s\S]*?origin\.source !== targetSource[\s\S]*?askStorageSaveLocation\(origin, targetSource\)/
    );
    assert.match(app, /choice === 'origin' \? origin\.source : targetSource/);
});

test('Local, inDB, SQLite, GitHub 출처를 서로 구분한다', () => {
    const start = app.indexOf('function getCurrentDocumentStorageOrigin()');
    const end = app.indexOf('function setStorageConnectionButtonGlow', start);
    assert.ok(start >= 0 && end > start);
    const source = app.slice(start, end);
    assert.match(source, /currentLocalFileRef/);
    assert.match(source, /currentGithubFileRef/);
    assert.match(source, /currentDocumentRef\.storageMode/);
    assert.match(source, /source: currentDocumentRef\.storageMode === 'sqlite' \? 'sqlite' : 'indb'/);
});

test('Local에서 연 문서를 inDB로 저장하려 하면 원본과 inDB 중 선택한다', async () => {
    const functionStart = app.indexOf('async function saveToDB()');
    const functionEnd = app.indexOf('async function openDatabaseSaveModal', functionStart);
    assert.ok(functionStart >= 0 && functionEnd > functionStart);
    const calls = [];
    const context = vm.createContext({
        getCurrentDocumentStorageOrigin() {
            return { source: 'local', location: 'notes/source.md' };
        },
        getSelectedSaveStorageSource() { return 'indb'; },
        async askStorageSaveLocation(origin, target) {
            calls.push(['ask', origin.source, target]);
            return 'target';
        },
        async saveToSelectedStorage(target) {
            calls.push(['save', target]);
            return true;
        }
    });
    vm.runInContext(app.slice(functionStart, functionEnd), context);

    const saved = await context.saveToDB();

    assert.equal(saved, true);
    assert.deepEqual(calls, [['ask', 'local', 'indb'], ['save', 'indb']]);
});

test('GitHub 문서는 기존 원격 경로를 출처로 보관하고 같은 경로로 저장한다', () => {
    assert.match(github, /setCurrentDocumentInfo\(\(doc\.title \|\| 'github-doc'\) \+ '\.md',[\s\S]*?source: 'github'[\s\S]*?githubPath: doc\.path/);
    assert.match(github, /const githubOrigin = currentGithubFileRef[\s\S]*?let path = githubOrigin \? String\(githubOrigin\.path\)/);
    assert.match(github, /githubOrigin && githubOrigin\.remotePath/);
});

test('Local DOCX도 원본 핸들을 유지하고 원래 위치에는 DOCX Blob으로 저장한다', () => {
    assert.match(app, /extension === '\.docx'[\s\S]*?openDocxInEditor\(file, \{[\s\S]*?source: 'local-folder'[\s\S]*?localFileHandle: fileHandle/);
    assert.match(app, /localFileName\.endsWith\('\.docx'\)[\s\S]*?createCurrentDocumentDocxBlob\(\)/);
    assert.match(app, /defaultTitle = currentFileName\.replace\(\/\\\.\(md\|markdown[\s\S]*?docx\)\$\/i, ''\)/);
});

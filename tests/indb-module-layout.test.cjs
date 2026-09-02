const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const inDb = fs.readFileSync(path.join(root, 'js', 'inDB', 'inDB.js'), 'utf8');
const mainCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const inDbCss = fs.readFileSync(path.join(root, 'js', 'inDB', 'inDB.css'), 'utf8');
const indexedDbAdapter = fs.readFileSync(path.join(root, 'js', 'storage', 'indexeddb-adapter.js'), 'utf8');

const appScriptIndex = html.indexOf('src="./js/app.js');
const inDbScriptIndex = html.indexOf('src="./js/inDB/inDB.js');
const internalImageScriptIndex = html.indexOf('src="./js/internal-image-app.js');

assert.ok(appScriptIndex >= 0, 'app.js 로드 선언이 필요합니다.');
assert.ok(inDbScriptIndex > appScriptIndex, 'inDB 모듈은 app.js 다음에 로드해야 합니다.');
assert.ok(internalImageScriptIndex > inDbScriptIndex, 'inDB API는 internal-image-app보다 먼저 등록해야 합니다.');
assert.match(html, /href="\.\/js\/inDB\/inDB\.css/);

assert.doesNotMatch(app, /const DB_NAME = "MarkdownProDB"/);
assert.doesNotMatch(app, /function initDB\(\)/);
assert.doesNotMatch(app, /const INDB_STATUS_STORE_ORDER/);
assert.doesNotMatch(app, /function ensureInDbStatusUi\(\)/);
assert.match(app, /await initDB\(\)/, 'app은 inDB 모듈 초기화 함수를 호출해야 합니다.');
assert.match(app, /if \(action === 'indb'\) return await saveCurrentToInDbAuto\(\)/);

assert.match(inDb, /const DB_NAME = "MarkdownProDB"/);
assert.match(inDb, /const DB_VERSION = 9/);
assert.match(inDb, /function initDB\(\)/);
assert.match(inDb, /async function saveCurrentToInDbAuto\(\)/);
assert.match(inDb, /window\.InDbStorage = Object\.freeze/);
assert.match(inDb, /id="indb-storage-enabled"[\s\S]*?<span>inDB 사용<\/span>/);
assert.match(inDb, /stored === null \? true : stored !== 'false'/, 'inDB 사용의 최초 기본값은 true여야 합니다.');
assert.match(inDb, /async function saveCurrentToInDbAuto\(\) \{\s*if \(!isInDbStorageEnabled\(\)\)/);
assert.match(inDb, /async function syncKnownFeatureDataToInDb\(\) \{\s*if \(!isInDbStorageEnabled\(\) \|\| !db\) return false;/);
assert.match(indexedDbAdapter, /_requireWriteEnabled\(\)/);
assert.match(indexedDbAdapter, /async putDocument\(documentRecord\) \{\s*this\._requireWriteEnabled\(\);/);
assert.match(indexedDbAdapter, /async uploadWorkFile\(file, options\) \{[\s\S]*?this\._requireWriteEnabled\(\);/);
assert.match(app, /appendToColumn\(saveColumn, inDbStorageSettings\)[\s\S]*?appendToColumn\(saveColumn, localSaveTools\)[\s\S]*?appendToColumn\(saveColumn, githubSettings\)/);
assert.match(html, /id="local-storage-settings-button"[\s\S]*?>\s*Local 설정\s*<\/button>/);
assert.match(inDb, /ensureInDbStatusUi\(\);\s*$/);

assert.doesNotMatch(mainCss, /\.indb-status-panel\s*\{/);
assert.match(inDbCss, /\.indb-status-panel\s*\{/);
assert.match(inDbCss, /\.indb-unused-panel\s*\{/);

console.log('inDB module ownership and loading-order checks passed');

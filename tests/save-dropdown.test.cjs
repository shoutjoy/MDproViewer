const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('저장 버튼은 기본 저장과 다른 이름으로 저장 드롭다운을 제공한다', () => {
  const index = read('index.html');
  assert.match(index, /id="save-dropdown-wrap"/);
  assert.match(index, /onclick="saveToDB\(\)"/);
  assert.match(index, /id="save-dropdown-toggle"/);
  assert.match(index, /onclick="toggleSaveDropdown\(event\)"/);
  assert.match(index, /onclick="saveCurrentDocumentAsNewFile\(\)"/);
  assert.match(index, />saveAs<\/span>/);
});

test('다른 이름으로 저장은 inDB에 원본과 별개의 새 문서를 만든다', () => {
  const app = read('js/app.js');
  assert.match(app, /async function saveCurrentDocumentAsNewFile\(\)/);
  assert.match(app, /await ensureDatabaseStorageMode\('indb'\)/);
  assert.match(app, /openDatabaseSaveModal\('indb', \{ saveAs: true \}\)/);
  assert.match(app, /const saveAs = !!\(options && options\.saveAs\)/);
  assert.match(app, /if \(saveAs\) \{[\s\S]*?resolvedTitle = getNextIndexedDbTitle\(normalizedTitle, docs\)/);
  assert.match(app, /saveAs \? 'Save As to inDB'/);
  assert.match(app, /event\.key === 'Escape'/);
});

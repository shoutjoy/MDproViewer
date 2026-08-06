const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(
    path.join(root, 'LocalSave_sqlite', 'baselines', 'indexeddb_sample_backup.json'),
    'utf8'
));
const baseline = fs.readFileSync(path.join(root, 'LocalSave_sqlite', 'INDEXEDDB_BASELINE.md'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

assert.equal(fixture.format, 'md-viewer-indexeddb-baseline');
assert.equal(fixture.version, 1);
assert.equal(fixture.synthetic, true);
assert.equal(fixture.containsSecrets, false);
const main = fixture.databases.MarkdownProDB;
const files = fixture.databases['mdpro-indb-v1'];
assert.equal(main.version, 5);
assert.equal(files.version, 1);
assert.equal(main.stores.documents.length, 1);
assert.equal(main.stores.folders.length, 2);
assert.equal(files.stores.files.length, 1);
assert.equal(
    crypto.createHash('sha256').update(main.stores.documents[0].content, 'utf8').digest('hex'),
    '4430dadf611cb0ef4309a33a521b84a75f8771a6b2b00bded86002f9cee02c54'
);
assert.equal(main.stores.documents[0].googleDocId, 'sample-google-doc-id-not-a-secret');
assert.equal(JSON.stringify(fixture).match(/apiKey|githubToken|password|secret-value/i), null);

for (const token of ['saveToDB', 'loadFromDB', 'moveDocToFolder', 'deleteFromDB', 'renderDBList']) {
    assert.match(app, new RegExp('function\\s+' + token + '\\b'));
}
assert.match(app, /doc\.googleDocId/);
assert.match(baseline, /GitHub 저장소·branch·기본 push path는 문서 레코드 필드가 아니라/);
assert.match(baseline, /사용자 IndexedDB는 이 단계에서 읽기 전용 원본/);

console.log('IndexedDB Phase 0 baseline tests passed.');

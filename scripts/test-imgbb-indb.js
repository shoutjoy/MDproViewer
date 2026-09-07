const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = vm.createContext({ window: { addEventListener() {} }, Blob, URL, Map, Set, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../imageDB/imageDB.js'), 'utf8'), context);
const api = context.window.ImageDB;
const records = new Map();
let fail = false;
const db = { transaction(store, mode) {
    assert.equal(store, 'images');
    assert.equal(mode, 'readwrite');
    const tx = { objectStore() { return { put(record) {
        queueMicrotask(() => {
            if (fail) { tx.error = new Error('storage unavailable'); tx.onabort(); }
            else { records.set(record.id, record); tx.oncomplete(); }
        });
    } }; } };
    return tx;
} };

(async () => {
    const url = 'https://i.ibb.co/example/test.png';
    const saved = await api.saveRemoteUrl(db, url, { name: 'test.png' });
    await api.saveRemoteUrl(db, url, { name: 'test.png' });
    assert.equal(records.size, 1, 'same link is reused');
    assert.equal(records.get(saved.id).url, url);
    assert.equal(records.get(saved.id).blob, undefined, 'only the link is stored');
    const restored = JSON.parse(JSON.stringify([...records.values()]));
    assert.equal(api.getRemoteImageUrl(restored[0]), url);
    for (const content of [`![test](${url})`, `<img src="${url}">`]) {
        assert.equal(api.findUnusedImageIds(restored, [{ content }]).length, 0);
    }
    assert.equal(api.findUnusedImageIds(restored, ['no images'])[0], saved.id);
    assert.equal(api.findUnusedImageIds([{ id: 'local' }], ['![](internal://local)']).length, 0);
    await assert.rejects(api.saveRemoteUrl(db, 'javascript:alert(1)'), /Invalid/);
    fail = true;
    await assert.rejects(api.saveRemoteUrl(db, url), /storage unavailable/);
    fail = false;

    vm.runInContext(fs.readFileSync(path.join(__dirname, '../imageDB/image_insert.js'), 'utf8'), context);
    const input = { value: '' };
    let status = '';
    Object.assign(context, {
        db, imageInsertCurrentDataUrl: 'data:image/png;base64,AA==', imageInsertCurrentFileName: 'upload.png',
        getImgbbApiKey: () => 'test-key', document: { getElementById: () => input },
        FormData: class { append() {} },
        XMLHttpRequest: class {
            constructor() { this.upload = {}; this.status = 200; this.responseText = JSON.stringify({ success: true, data: { url } }); }
            open() {} send() { this.onload(); }
        },
        setImageUploadProgress() {}, setImageInsertStatus(message) { status = message; }, refreshImageInsertGallery() {}
    });
    await context.uploadImageInsertToImgbb();
    assert.equal(input.value, url);
    assert.match(status, /inDB 링크 저장 완료/);
    assert.equal(records.get(saved.id).name, 'upload.png');
    fail = true;
    await context.uploadImageInsertToImgbb();
    assert.equal(input.value, url, 'upload URL remains usable after storage failure');
    assert.match(status, /inDB 링크 저장 실패/);
    console.log('imgBB inDB persistence and upload tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

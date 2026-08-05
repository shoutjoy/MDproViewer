const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'integrations', 'mdViewerBridge.js'),
    'utf8'
);

const posted = [];
const listeners = {};
const parent = { postMessage: message => posted.push(message) };
const window = {
    location: { search: '?embedded=1' },
    parent,
    images: [],
    currentIndex: 0,
    dom: { imageCount: { innerText: '' } },
    addEventListener: (type, handler) => { listeners[type] = handler; },
    renderGallery: () => {},
    renderFavorites: () => {},
    showImage: index => { window.shownIndex = index; },
    saveCurrentImagesToDB: async () => true
};
const document = {
    readyState: 'complete',
    addEventListener: () => {}
};

vm.runInNewContext(source, {
    window,
    document,
    URLSearchParams,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    console
});

assert.equal(posted[0]?.type, 'fmaviewer-ready');
assert.equal(typeof listeners.message, 'function');

listeners.message({
    source: parent,
    data: {
        type: 'fmaviewer-open-records',
        selectedPath: 'C:\\images\\b.png',
        records: [
            { name: 'a.png', path: 'C:\\images\\a.png', src: 'file:///C:/images/a.png' },
            { name: 'b.png', path: 'C:\\images\\b.png', src: 'file:///C:/images/b.png' }
        ]
    }
});

assert.equal(window.images.length, 2);
assert.equal(window.currentIndex, 1);
assert.equal(window.shownIndex, 1);
assert.equal(window.dom.imageCount.innerText, 'Media: 2');

listeners.message({
    source: parent,
    data: {
        type: 'fmaviewer-add-image',
        name: 'edited.png',
        dataUrl: 'data:image/png;base64,AA=='
    }
});

assert.equal(window.images.length, 3);
assert.equal(window.images[2].path, 'edited.png');
assert.equal(window.currentIndex, 2);

assert.equal(window.FMAMdViewerBridge.sendAction('fmaviewer-crop-image'), true);
assert.equal(posted.at(-1).type, 'fmaviewer-crop-image');
assert.equal(posted.at(-1).image.name, 'edited.png');
assert.equal(window.FMAMdViewerBridge.getImageCount(), 3);

assert.equal(window.FMAMdViewerBridge.sendAction('fmaviewer-open-image-insert', 0), true);
assert.equal(posted.at(-1).type, 'fmaviewer-open-image-insert');
assert.equal(posted.at(-1).image.name, 'a.png');

listeners.message({
    source: parent,
    data: { type: 'fmaviewer-get-image-count', requestId: 'count-test-1' }
});
assert.equal(posted.at(-1).type, 'fmaviewer-image-count');
assert.equal(posted.at(-1).requestId, 'count-test-1');
assert.equal(posted.at(-1).imageCount, 3);

console.log('md-viewer-bridge.test.cjs: MD Viewer iframe 호환 계약 검증 통과');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sidebarSource = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');

let insertedHtml = '';
let insertedPosition = '';
let shellInstalled = false;
const resizeHandle = {
    insertAdjacentHTML(position, html) {
        insertedPosition = position;
        insertedHtml = html;
        shellInstalled = true;
    }
};
const sidebar = {
    dataset: {},
    querySelector(selector) {
        if (selector === '#sidebar-resize-handle') return resizeHandle;
        if (shellInstalled && ['#db-list', '#toc-list', '#storage-source-tabs'].includes(selector)) return {};
        return null;
    },
    insertAdjacentHTML() {
        throw new Error('resize handle가 있으면 그 앞에 메뉴 본체를 삽입해야 합니다.');
    }
};
const documentMock = {
    readyState: 'interactive',
    getElementById(id) {
        return id === 'sidebar' ? sidebar : null;
    },
    addEventListener() {
        throw new Error('interactive 상태에서는 DOMContentLoaded를 기다리지 않아야 합니다.');
    }
};
const windowMock = {};

vm.runInNewContext(sidebarSource, {
    window: windowMock,
    document: documentMock,
    console,
    setTimeout,
    clearTimeout
});

assert.equal(insertedPosition, 'beforebegin');
assert.match(insertedHtml, /id="db-list"/);
assert.match(insertedHtml, /id="toc-list"/);
assert.match(insertedHtml, /id="storage-source-tabs"/);
assert.equal(sidebar.dataset.sidebarLeftReady, '1');
assert.equal(typeof windowMock.SidebarLeft.installSidebarShell, 'function');

console.log('Sidebar shell installs even when the resize handle already exists.');

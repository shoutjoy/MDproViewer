const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sidebarSource = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const githubSource = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');

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
    classList: { toggle() {} },
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
assert.match(insertedHtml, /id="db-list" class="[^"]*min-h-0[^"]*overflow-y-auto/, '파일 목록은 남은 사이드바 높이 안에서 스크롤되어야 합니다.');
assert.match(insertedHtml, /id="toc-list" class="[^"]*min-h-0[^"]*overflow-y-auto/, '목차 목록은 남은 사이드바 높이 안에서 스크롤되어야 합니다.');
assert.match(insertedHtml, /id="storage-source-tabs"/);
assert.equal(sidebar.dataset.sidebarLeftReady, '1');
assert.equal(typeof windowMock.SidebarLeft.installSidebarShell, 'function');
assert.match(appSource, /function ensureStorageServiceReady\(\)/, '앱은 저장소 준비를 한 곳에서 보장해야 합니다.');
assert.match(appSource, /const storageState = await ensureStorageServiceReady\(\)/, '시작 초기화도 공유 준비 경로를 사용해야 합니다.');
assert.match(githubSource, /await window\.ensureStorageServiceReady\(\);[\s\S]*?MDPStorage\.requestMode\(next\)/, 'inDB 탭은 저장소 전환 전에 초기화를 기다려야 합니다.');

console.log('Sidebar shell installs even when the resize handle already exists.');

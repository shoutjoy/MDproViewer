const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const internalImageApp = fs.readFileSync(path.join(root, 'js', 'internal-image-app.js'), 'utf8');

assert.match(html, /id="indb-status-panel"[^>]*class="indb-status-panel"/);
assert.match(html, /id="btn-open-indb-images-fma"[^>]*onclick="openAllInDbImagesInFmaViewer\(\)"/);
assert.match(html, /id="btn-clean-unused-indb-images"[^>]*onclick="deleteUnusedInDbImages\(\)"/);
assert.match(html, /id="indb-unused-image-modal"/);
assert.match(html, />전체 선택<\/button>[\s\S]*?>전체 해제<\/button>/);
assert.match(html, /id="btn-delete-selected-unused-images"[^>]*disabled>선택 삭제 0<\/button>/);
assert.match(html, /id="shortcuts-settings-card"[\s\S]*?id="indb-backup-prefix-settings-card"/, '전체 파일 prefix 설정은 단축키 아래에 있어야 합니다.');
assert.match(html, /id="indb-backup-prefix-input"[^>]*value="mdpro"/);

assert.match(app, /async function createInDbStatusSnapshot\(\)/);
assert.match(app, /extractInternalImageIdsDeep/);
assert.match(app, /findUnusedImageIds/);
assert.match(app, /async function deleteUnusedInDbImages\(\)[\s\S]*?renderUnusedInDbImageCleaner\(snapshot\)/);
assert.match(app, /async function deleteSelectedUnusedInDbImages\(\)[\s\S]*?db\.transaction\('images', 'readwrite'\)/);
assert.match(app, /function setAllUnusedInDbImagesSelected\(selected\)/);
assert.match(app, /class="indb-unused-checkbox"[^>]*data-id=/);
assert.match(app, /async function openAllInDbImagesInFmaViewer\(\)[\s\S]*?InternalImageApp\.openFiles/);
assert.match(app, /function dockSettingsModalForFmaViewer\(\)/);
assert.match(app, /layout: 'settings-left'/);
assert.match(internalImageApp, /function applyPanelLayout\(options\)/);
assert.match(internalImageApp, /opts\.layout === 'settings-left'/);
assert.match(app, /class="indb-record-thumb"/);
assert.match(app, /loading="lazy" decoding="async"/);
assert.match(app, /inDbStatusViewState = \{ storeName: 'documents', recordId: '' \}/, '처음 열 때 이미지 대신 문서 분류를 선택해야 합니다.');
assert.match(app, /class="indb-store-sidebar"/);
assert.match(app, /class="indb-record-pane"/);
assert.match(app, /class="indb-detail-pane"/);
assert.match(app, /function selectInDbStatusStore\(storeName\)/);
assert.match(app, /function selectInDbStatusRecord\(storeName, recordId\)/);
assert.doesNotMatch(app, /storeName === 'images' \? ' open'/, '이미지 저장소를 기본으로 펼치면 안 됩니다.');
assert.match(app, /DEFAULT_FILE_DOWNLOAD_PREFIX = 'mdpro'/);
assert.match(app, /return getFileDownloadPrefixFromLocal\(\) \+ '-indb-folders-'/);
assert.match(app, /snapshot\.referencedIds\.has\(itemId\)/, '사용 중 이미지를 개별 삭제할 때 경고해야 합니다.');
assert.match(app, /window\.deleteUnusedInDbImages = deleteUnusedInDbImages/);
assert.match(app, /window\.openAllInDbImagesInFmaViewer = openAllInDbImagesInFmaViewer/);

assert.match(css, /\.indb-status-panel\s*\{/);
assert.match(css, /\.dark \.indb-status-panel\s*\{/);
assert.match(css, /\.indb-overview-grid\s*\{/);
assert.match(css, /\.indb-image-grid\s*\{/);
assert.match(css, /\.indb-browser-grid\s*\{/);
assert.match(css, /\.indb-unused-grid\s*\{/);
assert.match(css, /\.indb-unused-card\.is-selected\s*\{/);
assert.match(css, /grid-template-columns:\s*minmax\(180px,[\s\S]*?minmax\(320px/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.indb-status-panel/);

console.log('inDB image management and modal UI checks passed');

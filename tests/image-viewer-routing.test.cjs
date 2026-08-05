const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'js', 'UI_PV', 'editpv.js'), 'utf8');

assert.match(
    html,
    /id="open-image-folder-menu-item"[^>]*class="hidden [^"]*"/,
    '이미지 폴더 메뉴는 설정을 읽기 전 기본적으로 숨겨져야 합니다.'
);
assert.match(
    html,
    /id="open-fma-viewer-menu-item"[^>]*class="hidden [^"]*"/,
    'FMA Viewer 메뉴는 설정을 읽기 전 기본적으로 숨겨져야 합니다.'
);
assert.match(app, /fmaViewerFeatureEnabled = enabled/, '이미지 전용 Viewer 설정 상태를 런타임에 보관해야 합니다.');
assert.match(app, /document\.getElementById\('open-image-folder-menu-item'\)/);
assert.match(app, /document\.getElementById\('open-fma-viewer-menu-item'\)/);
assert.match(
    app,
    /if \(imageFile\) \{\s*if \(isFmaViewerFeatureEnabled\(\)\)[\s\S]*?openSelectedImageInPreviewPopup\(file\)/,
    '파일 열기에서 이미지는 설정값에 따라 FMA Viewer 또는 PV로 분기해야 합니다.'
);
assert.match(
    app,
    /function openFmaViewer\(\) \{\s*if \(!isFmaViewerFeatureEnabled\(\)\)/,
    '설정이 꺼져 있으면 숨겨진 경로에서도 FMA Viewer를 열 수 없어야 합니다.'
);

assert.match(preview, /choosePreviewPopupFile\(\\'image\\'\)/, 'PV 도구막대에 이미지 열기 버튼이 있어야 합니다.');
assert.match(preview, /이미지 열기/, 'PV 이미지 열기 버튼의 표시 문구가 있어야 합니다.');
assert.match(preview, /input\.accept = type === 'image'/, 'PV 이미지 파일 선택 형식을 제한해야 합니다.');
assert.match(preview, /function openImageInPreviewPopup\(imageUrl, fileName\)/);
assert.match(preview, /className = 'pv-open-image'/, 'PV가 선택 이미지를 실제 이미지 요소로 표시해야 합니다.');
assert.match(
    preview,
    /async function updatePreviewPopupContent\(\) \{\s*if \(!isPreviewPopupAlive\(\)\) return;\s*if \(previewPopupFileMode\) return;/,
    '이미지 파일을 연 뒤 예약된 Markdown 렌더가 이미지를 덮어쓰면 안 됩니다.'
);

console.log('image viewer setting and PV routing checks passed');

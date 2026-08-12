const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

const installCall = app.indexOf('installDocumentFileDropHandlers();');
const onloadAssignment = app.indexOf('window.onload = async () =>');

assert.ok(installCall >= 0, '문서 파일 드롭 핸들러를 설치해야 합니다.');
assert.ok(
    installCall < onloadAssignment,
    '드롭 핸들러는 비동기 앱 초기화가 끝나기 전에 설치되어야 합니다.'
);
assert.match(
    app,
    /function isDocumentFileDrag\(event\)[\s\S]*?types\.includes\('Files'\)/,
    '파일 드래그만 전역 드롭 처리 대상으로 판별해야 합니다.'
);
assert.match(
    app,
    /async function openDroppedDocumentFile\(file\)[\s\S]*?extension === '\.docx'[\s\S]*?openDocxInEditor\(file\)[\s\S]*?readFile\(file\)/,
    'DOCX 드롭은 DOCX 가져오기 경로로, Markdown 드롭은 일반 문서 읽기 경로로 보내야 합니다.'
);
assert.match(
    app,
    /document\.addEventListener\('drop',[\s\S]*?openDroppedDocumentFile\(file\)/,
    '드롭 이벤트가 선택한 문서를 편집기 열기 함수로 전달해야 합니다.'
);
assert.match(
    app,
    /document\.addEventListener\('drop',[\s\S]*?event\.defaultPrevented \|\| !isDocumentFileDrag\(event\)/,
    '이미지 삽입 모달처럼 자체 드롭 처리가 있는 영역의 이벤트를 중복 처리하면 안 됩니다.'
);

console.log('Markdown and DOCX document drop wiring checks passed');

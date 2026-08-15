const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

const fileOpenIndex = html.indexOf('<span>파일 열기</span>');
const templateOpenIndex = html.indexOf('<span>양식열기</span>');
const imageFolderIndex = html.indexOf('<span>이미지 폴더 열기</span>');

assert.ok(fileOpenIndex >= 0, '파일 열기 메뉴가 있어야 합니다.');
assert.ok(templateOpenIndex > fileOpenIndex, '양식열기는 파일 열기 바로 다음 영역에 있어야 합니다.');
assert.ok(imageFolderIndex > templateOpenIndex, '양식열기는 이미지 폴더 열기보다 앞에 있어야 합니다.');
assert.match(html, /id="open-template-menu-item"[^>]*onclick="openTemplatePanelFromMenu\(event\)"[^>]*class="hidden /);
assert.match(app, /function openTemplatePanelFromMenu\(event\)[\s\S]*?setOpenSourceMenuVisible\(false\);[\s\S]*?openTemplatePanel\(\);/);
assert.match(app, /function applyTemplateVisibility\(settings\)[\s\S]*?getTemplateVisibleFromSettings[\s\S]*?document\.getElementById\('open-template-menu-item'\)[\s\S]*?classList\.toggle\('hidden', !enabled\)[\s\S]*?classList\.toggle\('flex', enabled\)/);

console.log('template open menu tests passed');

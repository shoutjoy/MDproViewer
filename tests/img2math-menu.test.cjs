const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('MATH menu exposes the img2Math workflow', () => {
    assert.match(html, /onclick="openImg2MathPopup\(\)"/);
    assert.match(html, /id="img2math-file"[^>]+accept="image\/\*"/);
    assert.match(html, /이미지 속 수식 TeX 생성/);
    assert.match(html, /id="img2math-result"/);
    assert.match(html, /문서 커서 위치에 삽입/);
});

test('img2Math sends an image to the existing AI bridge and inserts display LaTeX', () => {
    assert.match(app, /function generateImg2Math\(\)/);
    assert.match(app, /AIChatBridge\.complete/);
    assert.match(app, /attachments:\s*\[\{ kind: 'image'/);
    assert.match(app, /function cleanImg2MathLatex\(value\)/);
    assert.match(app, /const block = '\$\$\\n' \+ latex \+ '\\n\$\$'/);
    assert.match(app, /ensureMdMathEngineLoaded\(\)/);
});

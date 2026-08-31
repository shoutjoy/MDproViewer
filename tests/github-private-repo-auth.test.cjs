const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-settings.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js', 'GithubData', 'github-settings-ui.html'), 'utf8');

test('GitHub API 인증은 fine-grained PAT에 맞는 Bearer 헤더와 명시적 API 버전을 사용한다', () => {
    assert.match(settings, /Authorization: 'Bearer ' \+ String\(token \|\| ''\)\.trim\(\)/);
    assert.match(settings, /'X-GitHub-Api-Version': '2022-11-28'/);
    assert.match(app, /'Authorization': 'Bearer ' \+ String\(token \|\| ''\)\.trim\(\)/);
});

test('연결 검증은 PAT, 비공개 저장소 권한, 브랜치를 단계별로 구분한다', () => {
    assert.match(settings, /https:\/\/api\.github\.com\/user/);
    assert.match(settings, /PAT 인증 실패/);
    assert.match(settings, /비공개 저장소 접근 권한 없음/);
    assert.match(settings, /브랜치를 찾을 수 없음/);
});

test('PAT 발급 안내는 비공개 저장소 선택과 Contents 쓰기 권한을 설명한다', () => {
    assert.match(ui, /settings\/personal-access-tokens\/new/);
    assert.match(ui, /Repository access/);
    assert.match(ui, /Contents 권한을 Read and write/);
});

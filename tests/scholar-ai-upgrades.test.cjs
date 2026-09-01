const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadUpgrade(elements = {}, overrides = {}) {
  const sandbox = {
    console,
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    alert(message) { throw new Error(message); },
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement() { return { className: '', innerHTML: '', appendChild() {}, querySelector() { return null; } }; }
    },
    DOMParser: class { parseFromString() { return { querySelectorAll() { return []; }, head: { innerHTML: '' } }; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, overrides);
  vm.createContext(sandbox);
  vm.runInContext(read('sidebarAI/scholar-ai-upgrades.js'), sandbox, { filename: 'scholar-ai-upgrades.js' });
  return sandbox;
}

test('ScholarAI upgrade controls appear in static and both runtime templates', () => {
  const index = read('index.html');
  const html = read('sidebarAI/sidebar-ai.html');
  const sidebar = read('sidebarAI/sidebar-ai.js');
  for (const source of [index, html, sidebar]) {
    assert.match(source, /id="scholar-ai-quick-toggle"[^>]*>빠른기능 ▾<\/button>/);
    assert.match(source, /id="scholar-ai-quick-menu"[^>]*role="menu"/);
    assert.match(source, /id="scholar-ai-academic-ida-btn"[^>]*>~이다 문체변경<\/button>/);
    assert.match(source, /id="scholar-ai-academic-translate-btn"[^>]*>학술번역<\/button>/);
    assert.match(source, /id="scholar-ai-translation-direction"/);
    assert.match(source, /id="scholar-ai-slide-generate-btn"[^>]*>슬라이드 생성<\/button>/);
    assert.match(source, /id="scholar-ai-insert-translation-footnotes"/);
  }
  assert.equal((sidebar.match(/id="scholar-ai-academic-ida-btn"/g) || []).length, 2);
  assert.match(index, /src="\.\/sidebarAI\/scholar-ai-upgrades\.js\?v=20260817-quick-progress-1"/);
});

test('academic ida conversion changes endings locally while preserving literals', () => {
  const upgrade = loadUpgrade();
  const input = '본문입니다. 분석합니다. 중요합니다. 학습했습니다. 검토해요. `코드입니다.` “인용입니다.” 교정해요.';
  const result = upgrade.ScholarAcademicTone.transformLocal(input);
  assert.equal(result.text, '본문이다. 분석한다. 중요하다. 학습하였다. 검토한다. `코드입니다.` “인용입니다.” 교정해요.');
  assert.equal(result.changes, 5);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0].original, '교정해요');
});

test('academic translation supports both directions and Markdown term footnotes', () => {
  const elements = {
    'scholar-ai-result-wrap': { setAttribute() {} },
    'scholar-ai-result-insert': { value: '운영 효율성과 확장성을 확보한다.' },
    'scholar-ai-result': { value: '**operational efficiency (운영 효율성)**: 자원을 효과적으로 사용하는 정도이다.\n* **scalability (확장성)**: 증가하는 부하에 대응하는 능력이다.' }
  };
  const upgrade = loadUpgrade(elements);
  const translation = upgrade.ScholarAcademicTranslation;
  assert.match(translation.buildPrompt('en-ko', 'quick'), /영어에서 한국어로 번역/);
  assert.match(translation.buildPrompt('ko-en', 'reasoning'), /한국어에서 영어로 번역/);
  assert.match(translation.buildPrompt('ko-en', 'reasoning'), /academic English/);
  translation.setPresentation('translation');
  const footnoted = translation.buildFootnotedTranslation();
  assert.match(footnoted, /운영 효율성\[\^학술용어-1\]/);
  assert.match(footnoted, /확장성\[\^학술용어-2\]/);
  assert.match(footnoted, /\[\^학술용어-1\]: \*\*operational efficiency \(운영 효율성\)\*\*/);
});

test('quick academic translation button invokes the configured provider and fills both result tabs', async () => {
  let calls = 0;
  const progressWrap = {
    style: {},
    classList: { toggle(name, enabled) { this[name] = enabled; } },
    setAttribute(name, value) { this[name] = value; }
  };
  const elements = {
    'scholar-ai-selected': { value: 'Operational efficiency improves scalability.' },
    'scholar-ai-translation-direction': { value: 'en-ko' },
    'scholar-ai-response-mode-select': { value: 'quick' },
    'scholar-ai-run-btn': {},
    'scholar-ai-stop-btn': {},
    'scholar-ai-academic-ida-btn': {},
    'scholar-ai-academic-translate-btn': {},
    'scholar-ai-slide-generate-btn': {},
    'scholar-ai-progress-wrap': progressWrap,
    'scholar-ai-progress-fill': { style: {} },
    'scholar-ai-progress-pct': { textContent: '0%' },
    'scholar-ai-result-wrap': { setAttribute() {} },
    'scholar-ai-result': { value: '' },
    'scholar-ai-result-insert': { value: '', addEventListener() {} },
    'scholar-ai-slide-preview': { hidden: true }
  };
  const upgrade = loadUpgrade(elements, {
    SidebarAIConfig: {
      callbacks: {
        callScholarAI: async () => {
          calls += 1;
          return { text: '[ANSWER]\n운영 효율성은 확장성을 향상한다.\n[REASONING]\n**scalability (확장성)**: 부하 증가에 대응하는 능력이다.' };
        },
        getScholarAIModelId: () => 'test-model'
      }
    }
  });

  await upgrade.scholarAIQuickAction('translate');
  assert.equal(calls, 1);
  assert.equal(elements['scholar-ai-result-insert'].value, '운영 효율성은 확장성을 향상한다.');
  assert.match(elements['scholar-ai-result'].value, /scalability \(확장성\)/);
  assert.equal(elements['scholar-ai-progress-pct'].textContent, '100%');
  assert.equal(elements['scholar-ai-progress-fill'].style.width, '100%');
  assert.equal(progressWrap.style.display, 'flex');
  assert.equal(progressWrap['aria-valuenow'], '100');
  assert.equal(typeof upgrade.scholarAITranslateAcademic, 'function');
  assert.equal(typeof upgrade.toggleScholarAIQuickMenu, 'function');
});

test('slide generation uses updated 1600x900 GenSlide contract', () => {
  const upgrade = loadUpgrade();
  const prompt = upgrade.ScholarSlideGeneration.buildPrompt('강조 색상은 파란색');
  assert.match(prompt, /4~12장/);
  assert.match(prompt, /class="slide-container"/);
  assert.match(prompt, /width:1600px; height:900px/);
  assert.match(prompt, /Canvas 또는 SVG/);
  assert.match(prompt, /표 th\/td는 최소 24px/);
  assert.match(prompt, /추가 지시: 강조 색상은 파란색/);
});

test('quick academic tools render streamed tokens and slides request completion streaming', () => {
  const upgradeSource = read('sidebarAI/scholar-ai-upgrades.js');
  const providerSource = read('AI_App/ai_local/scholar-ai-provider.js');
  const appSource = read('js/app.js');
  assert.match(upgradeSource, /createLiveResultRenderer/);
  assert.match(upgradeSource, /event\.type === 'message\.delta'/);
  assert.match(upgradeSource, /completeStreaming: true, timeoutMs: 0/);
  assert.match(providerSource, /request\.completeStreaming === true \? 120000/);
  assert.match(providerSource, /client\.chatStream\(localOptions\)/);
  assert.match(appSource, /onStreamEvent: special\.onStreamEvent/);
});

test('ScholarAI shares one editable prompt pack with inDB AI settings', () => {
  const prompts = read('sidebarAI/Scholarai_prompt.js');
  const sidebar = read('sidebarAI/sidebar-ai.js');
  const app = read('js/app.js');
  const inDb = read('js/inDB/inDB.js');
  for (const phrase of ['정규식 기반 서술어 검색', '애매한 서술어만 AI', '[QUICK TOOL] 학술 번역', '[QUICK TOOL] 학술 슬라이드 생성']) {
    assert.match(prompts, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sidebar, /scholarAIEditPrePrompt/);
  assert.match(sidebar, /scholarAISavePrePrompt/);
  assert.match(app, /scholarAIPromptPack/);
  assert.match(inDb, /id="indb-scholar-ai-prompt-editor"/);
  assert.match(inDb, /saveInDbScholarAIPrompt/);
});

test('upgrade runtime is loaded after the existing ScholarAI core', () => {
  const app = read('js/app.js');
  const insert = read('sidebarAI/insert.js');
  assert.match(app, /script\.onload = \(\) => \{[\s\S]*scholar-ai-upgrades\.js[\s\S]*scholarAIUpgradeInit/);
  assert.match(read('sidebarAI/scholar-ai-upgrades.js'), /__scholarAIUpgradeInstall[\s\S]*installGlobals/);
  assert.match(insert, /mode === 6 \? getTranslationFootnoteText\(\) : getInsertResultText\(\)/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI data center uses a standalone database and is excluded from the inDB explorer', () => {
  const inDb = read('js/inDB/inDB.js');
  const center = read('AI_App/dataCenter/ai-data-center.js');
  assert.match(center, /DB_NAME = 'AIDataCenterDB'/);
  assert.match(center, /STORE_NAME = 'traces'/);
  assert.match(inDb, /name !== 'AI_data'/);
  assert.doesNotMatch(inDb, /id="btn-open-ai-data-center"/);
  assert.doesNotMatch(inDb, /FEATURE_DATA_STORE_NAMES = \[[^\]]*AI_data/);
});

test('AI Jena sends conversations and attachment usage to the standalone data center', () => {
  const chat = read('AI_App/aiChat/ai-chat.js');
  assert.match(chat, /recordType: 'conversation'/);
  assert.match(chat, /attachment\.kind === 'image' \? 'image' : 'attachment'/);
  assert.match(chat, /source: \/\^clipboard-/);
  assert.match(chat, /source: 'generated'/);
  assert.match(chat, /saveAIDataRecord/);
  assert.match(chat, /syncConversationsToAIData/);
});

test('academic searches are stored as AI usage traces with query and source results', () => {
  const chat = read('AI_App/aiChat/ai-chat.js');
  const app = read('js/app.js');
  const center = read('AI_App/dataCenter/ai-data-center.js');
  assert.match(chat, /recordType: 'academic_search'/);
  assert.match(chat, /question: text/);
  assert.match(chat, /results: academicSearch\.results/);
  assert.match(chat, /saveAIUsageAttachments/);
  assert.match(chat, /messagesForAIDataCenter/);
  assert.match(chat, /textLength: String\(attachment\.text \|\| ''\)\.length/);
  assert.match(app, /window\.AIDataCenter\.save/);
  assert.match(center, /sanitizeLegacyRecord/);
  assert.match(center, /delete copy\.text/);
  assert.match(center, /질문·답변·검색어·논문 제목 검색/);
  assert.match(center, /원문\/DOI 열기/);
});

test('settings and AI Jena open the standalone AI data center app', () => {
  const chat = read('AI_App/aiChat/ai-chat.js');
  const app = read('js/app.js');
  const index = read('index.html');
  const center = read('AI_App/dataCenter/ai-data-center.js');
  assert.match(chat, /getBridge\(\)\.openAIDataCenter\(\)/);
  assert.doesNotMatch(chat, /id="ai-chat-data-center"/);
  assert.match(app, /window\.AIDataCenter\.open/);
  assert.doesNotMatch(app, /openInDbStatusModal\('AI_data'\)/);
  assert.match(index, /AI 데이터 센터 열기/);
  assert.match(index, /AI_App\/dataCenter\/ai-data-center\.js/);
  assert.match(center, /답변만 보기/);
  assert.match(center, /class="aic-app"/);
  assert.match(app, /openAIDataImagesInFma/);
  assert.match(app, /window\.InternalImageApp\.openFiles/);
});

test('standalone center is a movable resizable popup with fullscreen and per-answer tools', () => {
  const center = read('AI_App/dataCenter/ai-data-center.js');
  const css = read('AI_App/dataCenter/ai-data-center.css');
  assert.match(center, /setupWindowControls/);
  assert.match(center, /ResizeObserver/);
  assert.match(center, /aic-fullscreen/);
  assert.match(center, /새창에서 보기/);
  assert.match(center, /data-action="zoom-out"/);
  assert.match(center, /data-action="zoom-in"/);
  assert.match(center, /data-action="md"/);
  assert.match(center, /data-action="pv"/);
  assert.match(center, /rawMD 복사/);
  assert.match(center, /Render 복사/);
  assert.match(center, /record\.messages\.splice\(index, 1\)/);
  assert.match(css, /resize:both/);
  assert.match(css, /\.aic-app\.fullscreen/);
  assert.match(css, /--aic-scale/);
});

test('center fits beside AI Jena and reuses its markdown preview, rendered copy, and answer viewer', () => {
  const center = read('AI_App/dataCenter/ai-data-center.js');
  assert.match(center, /fitNextToAIJena/);
  assert.match(center, /document\.getElementById\('ai-chat-panel'\)/);
  assert.match(center, /document\.getElementById\('ai-chat-dock-slot'\)/);
  assert.match(center, /AIChatMarkdown\.toHtml/);
  assert.match(center, /AIChatMarkdown\.copyRendered/);
  assert.match(center, /ai-chat-answer-view\.html/);
  assert.match(center, /aiJenaAnswerViewPayload:/);
  assert.match(center, /questionForMessage/);
});

test('center has a compact round theme control and an always-visible top category grid', () => {
  const center = read('AI_App/dataCenter/ai-data-center.js');
  const css = read('AI_App/dataCenter/ai-data-center.css');
  assert.match(center, /id="aic-theme"/);
  assert.match(center, /mdpro_ai_data_center_theme/);
  assert.match(center, /classList\.toggle\('light'/);
  assert.match(css, /\.aic-theme-button/);
  assert.match(css, /border-radius:50%/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('light theme keeps each AI answer header dark and high contrast', () => {
  const css = read('AI_App/dataCenter/ai-data-center.css');
  assert.match(css, /\.aic-app\.light \.aic-messages article\.assistant>header\{background:linear-gradient\(180deg,#475569,#334155\)/);
  assert.match(css, /article\.assistant>header>b\{color:#5eead4;font-weight:900/);
});

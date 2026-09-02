const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

test('AI Jena floating and menu settings are mutually exclusive', () => {
  assert.match(html, /AI Jena 사용 \(플로팅\)/);
  assert.match(html, /id="ai-chat-menu-enabled"[\s\S]*AI Jena 사용 \(메뉴\)/);
  assert.match(html, /id="ai-chat-enabled" name="ai-jena-entry-mode" value="floating"/);
  assert.match(html, /id="ai-chat-menu-enabled" name="ai-jena-entry-mode" value="menu"/);
  assert.match(app, /ss_ai_chat_menu_enabled/);
  assert.match(app, /localStorage\.setItem\(menuEnabledKey, '0'\)/);
  assert.match(app, /localStorage\.setItem\(enabledKey, '0'\)/);
});

test('AI Jena menu is a black button with a deep-blue teal inset after sspimgAI and opens without enabling floating', () => {
  assert.match(html, /id="btn-sspimg-ai"[\s\S]*id="btn-ai-jena-menu"/);
  assert.match(css, /#btn-ai-jena-menu[\s\S]*width: 42px;[\s\S]*height: 42px;[\s\S]*background: #05070b/);
  assert.match(css, /#btn-ai-jena-menu > span[\s\S]*linear-gradient\(135deg, #083b59 0%, #0f766e 100%\)/);
  assert.match(app, /openAiJenaFromMenu/);
  assert.match(chat, /function openFromMenu\(\)[\s\S]*storageGet\(ENABLED_KEY, '0'\) === '1'/);
});

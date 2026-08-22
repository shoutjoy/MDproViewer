const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const chatSource = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

test('lazy AI Jena launcher is draggable and avoids the vertical edit toolbar', () => {
  assert.match(appSource, /launcher\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(appSource, /document\.body\.classList\.contains\('edit-toolbar-vertical'\)/);
  assert.match(appSource, /toolbarRect\.left - width - 12/);
  assert.match(appSource, /md-edit-toolbar-orientation-change/);
});

test('AI Jena launcher position survives lazy loading and refresh', () => {
  assert.match(appSource, /const launcherPositionKey = 'ss_ai_chat_launcher_position'/);
  assert.match(appSource, /localStorage\.setItem\(launcherPositionKey/);
  assert.match(chatSource, /storageGet\(LAUNCHER_POSITION_KEY, 'null'\)/);
  assert.match(chatSource, /saved \? saved\.left/);
  assert.match(chatSource, /saved \? saved\.top/);
});

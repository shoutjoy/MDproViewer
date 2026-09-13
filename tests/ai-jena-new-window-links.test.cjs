const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const markdown = fs.readFileSync('AI_App/aiChat/ai-chat-markdown.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');

test('every rendered AI Jena markdown link opens in a new window safely', () => {
  assert.match(markdown, /querySelectorAll\('a\[href\]'\)/);
  assert.match(markdown, /link\.target = '_blank'/);
  assert.match(markdown, /link\.rel = 'noopener noreferrer'/);
  assert.match(app, /ai-chat-markdown\.js\?v=20260902-new-window-links-1/);
});

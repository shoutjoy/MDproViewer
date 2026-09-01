const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

test('light theme uses the dark live-answer surface', () => {
  assert.match(css, /body\.theme-light \.ai-chat-live-stream\.answer\s*\{[^}]*background:\s*rgba\(16,29,48,\.72\);/s);
  assert.match(css, /body\.theme-light \.ai-chat-live-stream\.answer > div\s*\{[^}]*color:\s*#e5f4ee;/s);
});

test('completed light-theme answers and code use the dark reading style', () => {
  assert.match(css, /body\.theme-light \.ai-chat-message\.assistant:not\(\.error\) \.ai-chat-message-content\s*\{[^}]*background:\s*#08111b;[^}]*color:\s*#e8f4f5;/s);
  assert.match(css, /body\.theme-light \.ai-chat-message\.assistant:not\(\.error\) \.ai-chat-message-content\.markdown-rendered pre\s*\{[^}]*background:\s*#030a12;[^}]*color:\s*#d7e7ef;/s);
  assert.match(css, /body\.theme-light \.ai-chat-message\.assistant:not\(\.error\) \.ai-chat-message-content\.markdown-rendered code\s*\{[^}]*font-family:\s*Consolas, "Courier New", monospace;/s);
});

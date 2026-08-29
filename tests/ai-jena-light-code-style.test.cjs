const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.css'), 'utf8');

test('light theme keeps the live answer readable on Jena dark shell', () => {
  assert.match(css, /body\.theme-light \.ai-chat-live-stream\.answer > div\s*\{[^}]*color:\s*#ecfff9;[^}]*font-weight:\s*500;/s);
});

test('completed light-theme code uses a pale surface and Comic Sans family', () => {
  assert.match(css, /body\.theme-light \.ai-chat-message\.assistant:not\(\.error\) \.ai-chat-message-content\.markdown-rendered pre\s*\{[^}]*background:\s*#fbfcfe;[^}]*color:\s*#475569;/s);
  assert.match(css, /body\.theme-light \.ai-chat-message\.assistant:not\(\.error\) \.ai-chat-message-content\.markdown-rendered code\s*\{[^}]*font-family:\s*"Comic Sans MS", "Comic Sans", cursive;/s);
});

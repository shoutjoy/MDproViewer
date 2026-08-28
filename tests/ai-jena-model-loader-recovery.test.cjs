const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

assert.match(
  app,
  /async function ensureAiChatLoaded\(\) \{[\s\S]*?await Promise\.allSettled\(\[[\s\S]*?aiAcademicSearch[\s\S]*?aiWebSearch[\s\S]*?aiMarkdown[\s\S]*?\]\);[\s\S]*?await loadOptionalScript\('aiChat'/,
  'optional AI helpers must not block the AI JENA chat/model core'
);
assert.match(
  app,
  /const fail = function \(\) \{[\s\S]*?optionalScriptLoads\.delete\(key\);[\s\S]*?script\.parentNode\.removeChild\(script\);[\s\S]*?reject\(/,
  'a failed lazy script must be removed so a later connection attempt can retry'
);

console.log('AI JENA model loader recovery tests passed');

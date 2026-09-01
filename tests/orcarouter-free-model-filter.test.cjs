const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

assert.match(app, /function getVisibleOpenAICompatibleModelIds\(\)[\s\S]*?OPENAI_COMPATIBLE_FREE_ONLY_KEY[\s\S]*?models\.filter\(isOpenAICompatibleFreeModel\)/);
assert.match(app, /getCachedOpenAICompatibleModels: function \(\) \{\s*return getVisibleOpenAICompatibleModelIds\(\);\s*\}/);
assert.match(app, /refreshOpenAICompatibleModels: async function \(\) \{[\s\S]*?fetchOpenAICompatibleModels[\s\S]*?return getVisibleOpenAICompatibleModelIds\(\);/);
assert.match(app, /function applyOpenAICompatibleModelFilter\(\)[\s\S]*?AIChat\.syncSettings\(\)/);

console.log('OrcaRouter free-model filter tests passed');

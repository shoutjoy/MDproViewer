const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

assert.match(chat, /loadSelectedLMStudioModel\(event\.target\.value\)/);
assert.match(chat, /async function loadSelectedLMStudioModel\(model\)/);
assert.match(chat, /getBridge\(\)\.loadLMStudioModel\(model\)/);
assert.match(chat, /setModelOptions\(lm && lm\.models \? lm\.models : \[\], state\.lmModel, false\)/);
assert.match(chat, /if \(model\) model\.disabled = state\.running;/);
assert.match(app, /const installed = await runtime\.listLMStudioModels\(\)/);
assert.match(app, /getCachedLMStudioModels: function \(\)/);
assert.match(app, /loadLMStudioModel: async function \(model\)/);
assert.match(app, /getScholarAIProviderRuntime\(\)\.loadLMStudioModel\(model\)/);

console.log('AI Jena LM Studio model loader tests passed');

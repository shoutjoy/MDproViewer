const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('js/app.js', 'utf8');
const chat = fs.readFileSync('AI_App/aiChat/ai-chat.js', 'utf8');

assert.match(app, /usageMetadata\.promptTokenCount/);
assert.match(app, /estimateAIChatTokens\(estimatedPromptText\)/);
assert.match(app, /estimateAIChatTokens\(text\)/);
assert.match(app, /estimated: !hasProviderUsage/);
assert.match(app, /source: hasProviderUsage \? 'ai-studio' : 'lmstudio-estimate'/);
assert.match(chat, /message\.provider === 'aistudio'/);
assert.match(chat, /AI Studio 제공값/);
assert.match(chat, /LM Studio 기준 추정/);
assert.match(app, /:streamGenerateContent\?alt=sse&key=/);
assert.match(app, /readAIStudioEventStream/);
assert.match(app, /type: item\.thought === true \? 'reasoning\.delta' : 'message\.delta'/);
assert.match(app, /type: 'chat\.end', provider: 'aistudio'/);
assert.match(chat, /provider === 'aistudio'[\s\S]*?'AI Studio'/);

console.log('AI Studio token stats tests passed');

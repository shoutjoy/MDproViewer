const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'AI_App', 'aiChat', 'ai-chat.js'), 'utf8');

assert.match(html, /id="openai-compatible-free-models-only"[^>]*checked[^>]*onchange="applyOpenAICompatibleModelFilter\(\)"/);
assert.match(html, /onclick="checkOpenAICompatibleModels\(\)"[^>]*>모델 확인<\/button>/);
assert.match(html, /onclick="testOpenAICompatibleConnection\(\)"[^>]*>연결 테스트<\/button>/);
assert.match(html, /id="openai-compatible-connection-status"/);

assert.match(app, /function isOpenAICompatibleFreeModel\(model\)[\s\S]*?orcarouter\/free[\s\S]*?-free/);
assert.match(app, /async function fetchOpenAICompatibleModels\(connection\)[\s\S]*?active\.baseUrl \+ '\/models'[\s\S]*?Authorization: 'Bearer '/);
assert.match(app, /async function checkOpenAICompatibleModels\(\)[\s\S]*?await fetchOpenAICompatibleModels\(connection\)/);
assert.match(app, /async function testOpenAICompatibleConnection\(\)[\s\S]*?connection\.baseUrl \+ '\/chat\/completions'[\s\S]*?max_tokens: 8/);
assert.match(app, /localStorage\.setItem\(OPENAI_COMPATIBLE_MODELS_KEY, JSON\.stringify\(models\)\)/);
assert.match(html, /href="https:\/\/platform\.deepseek\.com\/api_keys"[^>]*>[\s\S]*?API Key 발급/);

assert.match(chat, /<option value="openai-compatible">OrcaRouter \/ OpenAI 호환<\/option>/);
assert.match(chat, /OPENAI_COMPATIBLE_MODEL_KEY = 'ss_ai_chat_openai_compatible_model'/);
assert.match(chat, /state\.provider === 'openai-compatible'[\s\S]*?getCachedOpenAICompatibleModels/);
assert.match(chat, /bridge\.refreshOpenAICompatibleModels\(\)/);
assert.match(app, /getCachedOpenAICompatibleModels:[\s\S]*?refreshOpenAICompatibleModels:/);
assert.match(app, /request\.provider === 'openai-compatible'[\s\S]*?connection\.baseUrl \+ '\/chat\/completions'/);

console.log('OpenAI-compatible model check tests passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const server = fs.readFileSync('run.py', 'utf8');
const rust = fs.readFileSync('Tauri/src-tauri/src/main.rs', 'utf8');

assert.match(html, /id="deepseek-max-tokens"[\s\S]*?value="8192"/);
assert.match(html, /id="deepseek-timeout"[\s\S]*?value="300"/);
assert.match(html, /id="deepseek-reasoning-effort"[\s\S]*?value="low"[\s\S]*?value="high"[\s\S]*?value="max"/);
assert.match(app, /max_tokens: maxTokens/);
assert.match(app, /thinking: \{ type: reasoningMode \? 'enabled' : 'disabled' \}/);
assert.match(app, /requestBody\.reasoning_effort = effort/);
assert.match(app, /reasoning_content/);
assert.match(app, /__mdviewer_deepseek_proxy/);
assert.match(server, /DEEPSEEK_PROXY_PATH = "\/__mdviewer_deepseek_proxy"/);
assert.match(rust, /deepseek_api_request/);

console.log('DeepSeek runtime settings tests passed');

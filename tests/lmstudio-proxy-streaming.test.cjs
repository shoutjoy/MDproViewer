const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'run.py'), 'utf8');
const client = fs.readFileSync(path.join(root, 'AI_App', 'ai_local', 'local-ai.js'), 'utf8');

assert.match(server, /"text\/event-stream" in content_type\.lower\(\)/);
assert.match(server, /line = response\.readline\(\)/);
assert.match(server, /self\.wfile\.write\(line\)[\s\S]*?self\.wfile\.flush\(\)/);
assert.match(server, /self\.send_header\("X-Accel-Buffering", "no"\)/);
const sseBranch = server.match(/if "text\/event-stream" in content_type\.lower\(\):([\s\S]*?)\n\s+else:/);
assert.ok(sseBranch, 'SSE forwarding branch must exist');
assert.doesNotMatch(sseBranch[1], /response\.read\(/, 'SSE must not use a fixed-size buffered read');
assert.match(client, /const isLocalWebApp = location/);
assert.match(client, /if \(isLoopback && isLocalWebApp/);
assert.match(client, /return await bound\('\/__mdviewer_lmstudio_proxy\?url='/);

console.log('LM Studio proxy streaming tests passed');

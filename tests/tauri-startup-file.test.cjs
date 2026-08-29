const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rust = fs.readFileSync(path.join(root, 'Tauri', 'src-tauri', 'src', 'main.rs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

assert.match(rust, /fn get_initial_file\(\)/, 'Tauri must expose the startup file command');
assert.match(rust, /std::env::args_os\(\)/, 'startup file must come from the Windows process arguments');
assert.match(rust, /generate_handler!\[[^\]]*get_initial_file/s, 'startup file command must be registered');
assert.match(app, /tauriInvoke\('get_initial_file'\)/, 'frontend must request the startup file');
assert.match(app, /applyIncomingOpenedFile\(data,\s*\{\s*askBeforeReplace: false/s, 'startup file must use the existing document-open flow');

console.log('tauri-startup-file wiring: ok');

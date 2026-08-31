const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Tauri/src-tauri/src/main.rs'), 'utf8');
assert.match(source, /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/);
// Optional packaged-artifact verification: Windows GUI = 2, console = 3.
if (process.argv[2]) {
  const exe = fs.readFileSync(path.resolve(process.argv[2]));
  assert.equal(exe.toString('ascii', 0, 2), 'MZ');
  const pe = exe.readUInt32LE(0x3c);
  assert.equal(exe.toString('ascii', pe, pe + 4), 'PE\0\0');
  assert.equal(exe.readUInt16LE(pe + 24 + 68), 2, 'release EXE must use the Windows GUI subsystem');
}
console.log('Tauri Windows GUI subsystem: OK');

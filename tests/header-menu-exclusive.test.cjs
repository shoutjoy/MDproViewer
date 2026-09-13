const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');

test('opening a header dropdown closes the other header dropdowns', () => {
  assert.match(app, /function closeOtherHeaderMenus\(exceptMenuId\)[\s\S]*?setNewFileMenuVisible\(false\)[\s\S]*?setOpenSourceMenuVisible\(false\)[\s\S]*?closeSaveDropdown\(\)/);
  assert.match(app, /function toggleNewFileMenu\(event\)[\s\S]*?if \(shouldOpen\) closeOtherHeaderMenus\('new-file-menu'\);/);
  assert.match(app, /function toggleOpenSourceMenu\(event\)[\s\S]*?if \(shouldOpen\) closeOtherHeaderMenus\('open-source-menu'\);/);
  assert.match(app, /function toggleSaveDropdown\(event\)[\s\S]*?if \(shouldOpen\) closeOtherHeaderMenus\('save-dropdown-menu'\);/);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'sidebar_left', 'sidebar-left.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

test('sidebar offers a persistent checkbox that hides document action menus', () => {
  assert.match(sidebar, /id="hide-document-actions-toggle"[^>]*onchange="toggleDocumentActionsVisibility\(this\)"/);
  assert.match(sidebar, /mdpro_sidebar_document_actions_hidden/);
  assert.match(sidebar, /localStorage\.setItem\(DOCUMENT_ACTIONS_HIDDEN_KEY, shouldHide \? '1' : '0'\)/);
  assert.match(sidebar, /sidebar\.classList\.toggle\('sidebar-doc-actions-hidden', shouldHide\)/);
  assert.match(css, /#sidebar\.sidebar-doc-actions-hidden \.doc-action-btns\s*\{[\s\S]*?display:\s*none\s*!important;/);
});

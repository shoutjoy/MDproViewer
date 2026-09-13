const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('Highlight popup drag updates both axes while docked', () => {
  const bindStart = app.indexOf('function bindHighlightPopupDrag()');
  const bindEnd = app.indexOf('function toggleHighlightPopupDockRight()', bindStart);
  const dragSource = app.slice(bindStart, bindEnd);

  assert.match(dragSource, /highlightPopupDragOffsetX = e\.clientX - rect\.left;/);
  assert.match(dragSource, /panelEl\.style\.left = nextLeft \+ 'px';/);
  assert.match(dragSource, /highlightPopupDockLeft = nextLeft;/);
  assert.doesNotMatch(dragSource, /panelEl\.style\.left = '12px';/);
});

test('Highlight popup keeps its freely dragged horizontal position', () => {
  assert.match(app, /let highlightPopupDockLeft = 12;/);
  assert.match(app, /panel\.style\.left = `\$\{highlightPopupDockLeft\}px`;/);
});

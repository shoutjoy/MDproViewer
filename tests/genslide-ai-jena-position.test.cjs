const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

test('GenSlide initially fills the workspace beside an open AI Jena dock', () => {
  assert.match(app, /const HTML2PPT_AI_JENA_SIDE_GAP = 48;/);
  assert.match(app, /html2pptDockRight && aiJenaDockWidth > 0 && !html2pptMoved/);
  assert.match(app, /panel\.style\.right = \(aiJenaDockWidth \+ \(workspaceWidth >= 700 \? HTML2PPT_AI_JENA_SIDE_GAP : 12\)\) \+ 'px'/);
  assert.match(app, /panel\.style\.bottom = HTML2PPT_AI_JENA_BOTTOM_GAP \+ 'px'/);
  assert.match(app, /panel\.style\.width = 'auto'/);
  assert.match(app, /panel\.style\.height = 'auto'/);
});

test('GenSlide follows AI Jena layout and viewport changes until manually moved', () => {
  assert.match(app, /window\.addEventListener\('ai-jena-layout-change'[\s\S]*?html2pptPanelOpen && !html2pptMoved/);
  assert.match(app, /window\.addEventListener\('resize'[\s\S]*?html2pptPanelOpen && !html2pptMoved/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Slider Maker preset produces a GenSlide-ready HTML slide instruction', () => {
  const source = read('sidebarAI/Scholarai_prompt.js');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'Scholarai_prompt.js' });

  const preset = context.window.getScholarAIPromptByRole('slider-maker');
  assert.match(preset, /Professional Slide Architect \/ HTML Presentation Designer/);
  assert.match(preset, /even when the Prompt \/ Question field is empty/);
  assert.match(preset, /one complete self-contained HTML document/);
  assert.match(preset, /1280 x 720 \(16:9\)/);
  assert.match(preset, /class="slide"/);
  assert.match(preset, /sent directly to GenSlide/);
});

test('all ScholarAI render paths expose Slider Maker and ToGenslide controls', () => {
  for (const relative of ['index.html', 'sidebarAI/sidebar-ai.html', 'sidebarAI/sidebar-ai.js']) {
    const source = read(relative);
    assert.match(source, /scholarAIUsePromptRole\('slider-maker'\)/, `${relative} is missing Slider Maker`);
    assert.match(source, /id="scholar-ai-to-genslide-btn"/, `${relative} is missing the dedicated ToGenslide button`);
    assert.match(source, />ToGenslide</, `${relative} is missing the ToGenslide label`);
  }
});

test('empty Slider Maker command uses slide generation and multi-slide GenSlide transfer', () => {
  const sidebar = read('sidebarAI/sidebar-ai.js');
  const insert = read('sidebarAI/insert.js');
  const genSlide = read('js/Html2pptx/jenaEditor/js/main.js');

  assert.match(sidebar, /scholarAIIsSlideMakerActive\(\)[\s\S]*Create a complete, polished HTML slide deck/);
  assert.match(sidebar, /scholarAIUpdateToGenSlideButton/);
  assert.match(insert, /openHtml2pptPanel/);
  assert.match(insert, /type: 'mdv-scholar-genslide-insert'/);
  assert.match(insert, /mode: 'multi'/);
  assert.doesNotMatch(insert, /Switching to edit mode first/);
  assert.match(genSlide, /d\.type !== "mdv-scholar-genslide-insert"/);
  assert.match(genSlide, /mode === "multi"/);
});


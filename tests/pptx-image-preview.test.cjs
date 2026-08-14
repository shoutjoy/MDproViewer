const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const viewer = fs.readFileSync(path.join(root, 'pptx-viewer.html'), 'utf8');

test('PV PPTX preview rasterizes slides with the local html2canvas asset', () => {
  assert.match(viewer, /vendor\/html2canvas\/html2canvas\.min\.js/);
  assert.match(viewer, /async function rasterizeSlides\(generation\)/);
  assert.match(viewer, /await rasterizeSlide\(slides\[index\], slide\)/);
  assert.match(viewer, /container\.replaceChildren\(image\)/);
  assert.match(viewer, /image\.className = 'pptx-slide-image'/);
  assert.match(viewer, /document\.querySelector\('#viewer > \.loading'\)/);
  assert.match(viewer, /hasRasterImage && !rasterizing/);
});

test('PPTX image preview keeps navigation modes and releases generated image URLs', () => {
  assert.match(viewer, /getSlideVisual\(container\)/);
  assert.match(viewer, /command\.mode === '2-page'/);
  assert.match(viewer, /command\.mode === 'matrix'/);
  assert.match(viewer, /URL\.revokeObjectURL\(url\)/);
  assert.match(viewer, /addEventListener\('beforeunload', revokeRasterObjectUrls\)/);
});

test('PPTX image conversion is progressive and preserves an HTML fallback on failure', () => {
  assert.match(viewer, /if \(index === 0\)/);
  assert.match(viewer, /setTimeout\(resolve, 0\)/);
  assert.match(viewer, /HTML 대체/);
  assert.match(viewer, /Slide rasterization failed/);
});

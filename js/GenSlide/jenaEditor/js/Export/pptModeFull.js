// Mode: full
// Export with the most aggressive object extraction strategy.
window.renderPptxByModeFull = async function renderPptxByModeFull(frame, slide, pptW, pptH) {
  await renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, "full");
};


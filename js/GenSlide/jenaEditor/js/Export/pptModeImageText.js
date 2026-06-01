// Mode: image_text
// Export visuals as images and text as editable PPT text objects.
window.renderPptxByModeImageText = async function renderPptxByModeImageText(frame, slide, pptW, pptH) {
  await renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, "image_text");
};


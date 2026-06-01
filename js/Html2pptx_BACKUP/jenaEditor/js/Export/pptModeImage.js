// Mode: image
// Render the whole slide as one bitmap image.
window.renderPptxByModeImage = async function renderPptxByModeImage(frame, slide, pptW, pptH) {
  const doc = frame && frame.contentDocument;
  const target = (doc && doc.documentElement) ? doc.documentElement : frame;
  const canvas = await window.html2canvas(target, {
    width: slideWidth,
    height: slideHeight,
    windowWidth: slideWidth,
    windowHeight: slideHeight,
    useCORS: true,
    backgroundColor: "#ffffff",
    scale: 2
  });
  const dataUrl = canvas.toDataURL("image/png");
  slide.addImage({ data: dataUrl, x: 0, y: 0, w: pptW, h: pptH });
};


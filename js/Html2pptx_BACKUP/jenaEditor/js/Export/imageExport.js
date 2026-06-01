let imageExportInProgress = false;

function ensureImageExportModeOverlay() {
  let overlay = document.getElementById("imageExportModeOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "imageExportModeOverlay";
  overlay.className = "overlay";
  overlay.innerHTML = [
    '<div class="modal" style="width:min(520px,92vw)">',
    '  <div class="modal-head" id="imageExportModeHead" style="cursor:move">',
    '    <div class="modal-title">Image Export Mode</div>',
    '    <button class="btn tiny" id="btnImageExportModeClose">Close</button>',
    "  </div>",
    '  <div class="modal-body">',
    '    <div class="pptx-mode-list">',
    '      <button class="btn" id="btnImageExportCurrent">Current Page -> PNG</button>',
    '      <button class="btn" id="btnImageExportZip">All Pages -> ZIP (PNG per page)</button>',
    '      <button class="btn" id="btnImageExportVertical">All Pages -> One Vertical PNG</button>',
    "    </div>",
    '    <div style="margin-top:10px;color:#607092;font-size:12px;">',
    '      page 단위 PNG, 전체 ZIP, 전체 세로 합치기 지원',
    "    </div>",
    "  </div>",
    '  <div class="modal-foot">',
    '    <button class="btn" id="btnImageExportModeCancel">Cancel</button>',
    "  </div>",
    "</div>"
  ].join("");
  document.body.appendChild(overlay);
  return overlay;
}

function askImageExportMode() {
  return new Promise((resolve) => {
    const overlay = ensureImageExportModeOverlay();
    const btnClose = document.getElementById("btnImageExportModeClose");
    const btnCancel = document.getElementById("btnImageExportModeCancel");
    const btnCurrent = document.getElementById("btnImageExportCurrent");
    const btnZip = document.getElementById("btnImageExportZip");
    const btnVertical = document.getElementById("btnImageExportVertical");
    if (!overlay || !btnClose || !btnCancel || !btnCurrent || !btnZip || !btnVertical) {
      resolve("");
      return;
    }
    const done = (mode) => {
      overlay.classList.remove("open");
      btnClose.onclick = null;
      btnCancel.onclick = null;
      btnCurrent.onclick = null;
      btnZip.onclick = null;
      btnVertical.onclick = null;
      overlay.onclick = null;
      resolve(mode || "");
    };
    btnClose.onclick = () => done("");
    btnCancel.onclick = () => done("");
    btnCurrent.onclick = () => done("current_png");
    btnZip.onclick = () => done("all_zip");
    btnVertical.onclick = () => done("all_vertical");
    overlay.onclick = (e) => { if (e.target === overlay) done(""); };
    overlay.classList.add("open");
  });
}

async function ensureImageExportDeps(mode) {
  if (typeof window.html2canvas !== "function") {
    if (typeof loadScriptOnce === "function") {
      await loadScriptOnce([
        "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
        "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"
      ]);
    } else {
      throw new Error("html2canvas loader missing");
    }
  }
  if (mode === "all_zip" && typeof window.JSZip === "undefined") {
    if (typeof loadScriptOnce === "function") {
      await loadScriptOnce([
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
        "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
      ]);
    } else {
      throw new Error("JSZip loader missing");
    }
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }, 300);
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

async function renderSlidePngDataByIndex(index, urlMap) {
  const i = clamp(Number(index) || 0, 0, Math.max(0, slides.length - 1));
  const rawHtml = String((slides[i] && slides[i].html) || START_HTML);
  const html = replaceInternalImagesForRender(rawHtml, urlMap || new Map());
  return renderSlideHtmlToPngData(html);
}

async function exportCurrentSlidePng(urlMap) {
  const dataUrl = await renderSlidePngDataByIndex(cur, urlMap);
  const blob = await dataUrlToBlob(dataUrl);
  const name = `jena_slide_${String(cur + 1).padStart(3, "0")}_${Date.now()}.png`;
  downloadBlob(blob, name);
}

async function exportAllSlidesZip(urlMap) {
  if (typeof window.JSZip === "undefined") throw new Error("JSZip not loaded");
  const zip = new window.JSZip();
  const total = Math.max(1, slides.length);
  for (let i = 0; i < slides.length; i++) {
    const dataUrl = await renderSlidePngDataByIndex(i, urlMap);
    const base64 = String(dataUrl || "").replace(/^data:image\/png;base64,/i, "");
    zip.file(`slide_${String(i + 1).padStart(3, "0")}.png`, base64, { base64: true });
    if (typeof setPptxProgress === "function") {
      const pct = 15 + Math.round(((i + 1) / total) * 75);
      setPptxProgress(pct, `ZIP 이미지 생성 중... (${i + 1}/${total})`);
    }
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  downloadBlob(blob, `jena_slides_${Date.now()}.zip`);
}

async function exportAllSlidesVerticalPng(urlMap) {
  const imgs = [];
  const total = Math.max(1, slides.length);
  for (let i = 0; i < slides.length; i++) {
    const dataUrl = await renderSlidePngDataByIndex(i, urlMap);
    imgs.push(await loadImageFromDataUrl(dataUrl));
    if (typeof setPptxProgress === "function") {
      const pct = 15 + Math.round(((i + 1) / total) * 75);
      setPptxProgress(pct, `세로 이미지 생성 중... (${i + 1}/${total})`);
    }
  }
  const width = imgs.length ? Math.max.apply(null, imgs.map((im) => im.naturalWidth || im.width || slideWidth)) : slideWidth;
  const height = imgs.reduce((sum, im) => sum + (im.naturalHeight || im.height || slideHeight), 0) || slideHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (let i = 0; i < imgs.length; i++) {
    const im = imgs[i];
    const w = im.naturalWidth || im.width || slideWidth;
    const h = im.naturalHeight || im.height || slideHeight;
    ctx.drawImage(im, 0, y, w, h);
    y += h;
  }
  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  if (!blob) throw new Error("vertical png create failed");
  downloadBlob(blob, `jena_slides_vertical_${Date.now()}.png`);
}

async function exportImage() {
  if (imageExportInProgress) return;
  const mode = await askImageExportMode();
  if (!mode) return;
  const btn = document.getElementById("btnImageExport");
  imageExportInProgress = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Exporting...";
  }
  let objectUrls = [];
  try {
    if (typeof setPptxProgress === "function") setPptxProgress(2, `이미지 내보내기 준비 중... (${mode})`);
    await ensureImageExportDeps(mode);
    const urlMap = await buildInternalImageUrlMapFromSlides(slides);
    objectUrls = Array.from(urlMap.values());
    if (mode === "current_png") {
      await exportCurrentSlidePng(urlMap);
    } else if (mode === "all_zip") {
      await exportAllSlidesZip(urlMap);
    } else if (mode === "all_vertical") {
      await exportAllSlidesVerticalPng(urlMap);
    }
    if (typeof setPptxProgress === "function") {
      setPptxProgress(100, "완료");
      hidePptxProgress(1200);
    }
  } catch (e) {
    if (typeof setPptxProgress === "function") {
      setPptxProgress(100, "실패");
      hidePptxProgress(1800);
    }
    alert("image export failed.");
  } finally {
    for (let i = 0; i < objectUrls.length; i++) {
      try { URL.revokeObjectURL(objectUrls[i]); } catch (_) {}
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "image Export";
    }
    imageExportInProgress = false;
  }
}


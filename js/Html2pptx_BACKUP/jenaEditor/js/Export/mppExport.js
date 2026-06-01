async function collectIndexedDbImagesForMpp(list) {
  const ids = extractInternalImageIdsFromSlides(list);
  if (!ids.length) return [];
  const db = await openAppDb();
  try {
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const rec = await getImageRecord(db, id);
      if (!rec || !rec.blob) continue;
      out.push({
        id,
        name: rec.name || id,
        mime: rec.mime || rec.blob.type || "application/octet-stream",
        base64: await blobToBase64(rec.blob)
      });
    }
    return out;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function restoreIndexedDbImagesFromMpp(images) {
  const arr = Array.isArray(images) ? images : [];
  if (!arr.length) return 0;
  const db = await openAppDb();
  let count = 0;
  try {
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i] || {};
      const id = String(item.id || "").trim();
      const base64 = String(item.base64 || "").trim();
      if (!id || !base64) continue;
      const blob = base64ToBlob(base64, item.mime || "application/octet-stream");
      await putImageRecord(db, {
        id,
        blob,
        name: item.name || id,
        mime: item.mime || blob.type || "application/octet-stream",
        createdAt: Date.now()
      });
      count += 1;
    }
    return count;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function exportMpp() {
  let images = [];
  try { images = await collectIndexedDbImagesForMpp(slides); } catch (_) { images = []; }
  const payload = {
    format: "genslide-html2pptx-mpp",
    version: 2,
    exportedAt: new Date().toISOString(),
    currentIndex: cur,
    slides,
    images
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jena-editor-slides.mpp";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importMpp(file) {
  pushHistory();
  const text = await file.text();
  const data = JSON.parse(text);
  if (Array.isArray(data.images) && data.images.length) {
    try { await restoreIndexedDbImagesFromMpp(data.images); } catch (_) {}
  }
  if (!Array.isArray(data.slides) || !data.slides.length) return;
  slides = data.slides
    .map((item) => {
      if (typeof item === "string") return { html: String(item || START_HTML) };
      return { html: String((item && item.html) || START_HTML) };
    })
    .filter((s) => String((s && s.html) || "").trim().length > 0);
  if (!slides.length) slides = [{ html: START_HTML }];
  cur = clamp(Number(data.currentIndex) || 0, 0, slides.length - 1);
  loadCurrent();
}

function applyZoom() {
  let effectiveZoom = zoom;
  const extraCanvasPad = objectEditMode ? 700 : 0;
  const viewWidth = slideWidth + extraCanvasPad;
  const viewHeight = slideHeight + extraCanvasPad;
  // Keep zoom under explicit user control; avoid forced auto-shrink to fit.
  if (!Number.isFinite(effectiveZoom) || effectiveZoom <= 0) effectiveZoom = 0.75;
  effectiveZoom = clamp(effectiveZoom, 0.2, 2);

  const w = Math.round(slideWidth * effectiveZoom);
  const h = Math.round(slideHeight * effectiveZoom);
  els.stage.style.width = w + "px";
  els.stage.style.height = h + "px";
  els.stage.style.overflow = objectEditMode ? "auto" : "hidden";
  els.wys.style.width = `${viewWidth}px`;
  els.wys.style.height = `${viewHeight}px`;
  els.wys.style.transform = `scale(${effectiveZoom})`;
  els.zoomView.textContent = Math.round(effectiveZoom * 100) + "%";
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildGalleryWindowHtml(snapshotSlides, activeIndex) {
  const cards = snapshotSlides.map((s, i) => (
    `<article class="g-card${i === activeIndex ? " active" : ""}" data-idx="${i}">` +
      `<div class="g-thumb"><iframe sandbox="allow-same-origin allow-scripts" loading="lazy"></iframe></div>` +
      `<div class="g-foot">Slide ${i + 1} <button class="g-open" data-idx="${i}">Open in Editor</button></div>` +
    `</article>`
  )).join("");
  const payload = encodeURIComponent(JSON.stringify(snapshotSlides.map((s) => String((s && s.html) || START_HTML))));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slide Gallery</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,sans-serif;background:#eef2f8;color:#1b2947}
  .g-top{position:sticky;top:0;z-index:5;background:#0b2b67;color:#fff;padding:10px 14px;font-weight:700}
  .g-wrap{padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .g-card{background:#fff;border:1px solid #d2dbef;border-radius:12px;overflow:hidden;box-shadow:0 3px 10px rgba(14,29,62,.08)}
  .g-card.active{border-color:#2f66d2;box-shadow:0 0 0 1px #2f66d2}
  .g-thumb{padding:10px;background:#e9eef8}.g-thumb iframe{width:100%;aspect-ratio:16/9;border:1px solid #d7deef;background:#fff}
  .g-foot{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;font-size:13px;font-weight:600}
  .g-open{border:1px solid #2f66d2;background:#2f66d2;color:#fff;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:12px}
</style>
</head>
<body>
  <div class="g-top">Slide Gallery (${snapshotSlides.length})</div>
  <div class="g-wrap">${cards || '<div>No slides</div>'}</div>
<script>
  const data = JSON.parse(decodeURIComponent("${escapeAttr(payload)}"));
  const cards = Array.from(document.querySelectorAll(".g-card"));
  cards.forEach((card, i) => {
    const frame = card.querySelector("iframe");
    if (frame) frame.srcdoc = data[i] || "";
    const openBtn = card.querySelector(".g-open");
    const go = () => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: MSG_OPEN_SLIDE, index: i }, "*");
      }
    };
    card.addEventListener("dblclick", go);
    if (openBtn) openBtn.addEventListener("click", go);
  });
</script>
</body>
</html>`;
}

function openGalleryWindow() {
  const snapshot = slides.map((s) => ({ html: String((s && s.html) || START_HTML) }));
  const popup = window.open("", "genslide_gallery", "width=1400,height=900,resizable=yes,scrollbars=yes");
  if (!popup) {
    alert("Popup blocked. Please allow popups for this page.");
    return;
  }
  popup.document.open();
  popup.document.write(buildGalleryWindowHtml(snapshot, cur));
  popup.document.close();
}

function buildSlideShowWindowHtml(snapshotSlides, startIndex) {
  const payload = encodeURIComponent(JSON.stringify(snapshotSlides.map((s) => String((s && s.html) || START_HTML))));
  const start = Math.max(0, Math.min(Number(startIndex) || 0, Math.max(0, snapshotSlides.length - 1)));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slide Show</title>
<style>
  *{box-sizing:border-box}html,body{margin:0;height:100%;background:#101725;color:#fff;font-family:Segoe UI,sans-serif;overflow:hidden}
  .ss-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
  iframe{width:${slideWidth}px;height:${slideHeight}px;border:none;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.45);transform-origin:center center}
  .hud{position:fixed;left:14px;bottom:10px;font-size:13px;opacity:.8}
  .hint{position:fixed;right:14px;bottom:10px;font-size:12px;opacity:.65}
</style>
</head>
<body>
  <div class="ss-root"><iframe id="ssFrame" sandbox="allow-same-origin allow-scripts"></iframe></div>
  <div class="hud" id="ssInfo"></div>
  <div class="hint">Click: next 쨌 Left/Right: prev/next 쨌 Esc: close</div>
<script>
  const slides = JSON.parse(decodeURIComponent("${escapeAttr(payload)}"));
  let idx = ${start};
  const frame = document.getElementById("ssFrame");
  const info = document.getElementById("ssInfo");
  function draw(){
    if(!slides.length){ info.textContent="No slides"; frame.srcdoc=""; return; }
    frame.srcdoc = slides[idx] || "";
    info.textContent = "Slide " + (idx + 1) + " / " + slides.length;
  }
  function next(){ if(!slides.length) return; idx = Math.min(slides.length - 1, idx + 1); draw(); }
  function prev(){ if(!slides.length) return; idx = Math.max(0, idx - 1); draw(); }
  document.addEventListener("keydown",(e)=>{
    if(e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); next(); }
    else if(e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); prev(); }
    else if(e.key === "Escape"){ window.close(); }
  });
  document.addEventListener("click",(e)=>{
    const x = e.clientX || 0;
    const w = window.innerWidth || 1;
    if (x < w * 0.35) prev(); else next();
  });
  draw();
</script>
</body>
</html>`;
}

async function buildRenderableSlidesForPopup(snapshot) {
  const list = Array.isArray(snapshot) ? snapshot : [];
  const urlMap = await buildInternalImageUrlMapFromSlides(list);
  const objectUrls = Array.from(urlMap.values());
  const rendered = list.map((s) => ({
    html: replaceInternalImagesForRender(String((s && s.html) || START_HTML), urlMap)
  }));
  return { rendered, objectUrls };
}

async function openSlideShowWindow() {
  const snapshot = slides.map((s) => ({ html: String((s && s.html) || START_HTML) }));
  let renderedSnapshot = snapshot;
  let objectUrls = [];
  try {
    const prepared = await buildRenderableSlidesForPopup(snapshot);
    renderedSnapshot = prepared.rendered;
    objectUrls = prepared.objectUrls;
  } catch (_) {
    renderedSnapshot = snapshot;
    objectUrls = [];
  }
  const popup = window.open("", "genslide_slideshow", "width=1440,height=900,resizable=yes,scrollbars=no");
  if (!popup) {
    for (let i = 0; i < objectUrls.length; i++) {
      try { URL.revokeObjectURL(objectUrls[i]); } catch (_) {}
    }
    alert("Popup blocked. Please allow popups for this page.");
    return;
  }
  popup.document.open();
  popup.document.write(buildSlideShowWindowHtml(renderedSnapshot, cur));
  popup.document.close();
  popup.addEventListener("beforeunload", () => {
    for (let i = 0; i < objectUrls.length; i++) {
      try { URL.revokeObjectURL(objectUrls[i]); } catch (_) {}
    }
  });
}

function renderSidebar() {
  els.slides.innerHTML = "";
  slides.forEach((s, i) => {
    const el = document.createElement("div");
    const openClass = (expandedSlideIndex === i) ? " open" : "";
    el.className = "slide-item" + (i === cur ? " active" : "") + openClass;
    el.innerHTML = `<div class="slide-item-title">Slide ${i + 1}</div><div class="slide-item-snippet">${esc((s.html || "").slice(0, 60))}</div>`;

    const actions = document.createElement("div");
    actions.className = "slide-actions";
    actions.innerHTML = `
      <button class="sact remove" type="button">remove</button>
      <button class="sact add" type="button">+slide</button>
      <button class="sact" type="button">up</button>
      <button class="sact" type="button">down</button>
    `;

    const btnRemove = actions.children[0];
    const btnAdd = actions.children[1];
    const btnUp = actions.children[2];
    const btnDown = actions.children[3];
    btnRemove.onclick = (ev) => { ev.stopPropagation(); delSlideAt(i); };
    btnAdd.onclick = (ev) => { ev.stopPropagation(); insertSlideBelow(i); };
    btnUp.onclick = (ev) => { ev.stopPropagation(); moveSlideUp(i); };
    btnDown.onclick = (ev) => { ev.stopPropagation(); moveSlideDown(i); };

    el.appendChild(actions);
    el.onclick = () => {
      cur = i;
      expandedSlideIndex = (expandedSlideIndex === i) ? -1 : i;
      loadCurrent();
    };
    els.slides.appendChild(el);
  });
}
function loadCurrent() {
  if (!Array.isArray(slides) || !slides.length) {
    slides = [{ html: START_HTML }];
    cur = 0;
  }
  cur = clamp(Number(cur) || 0, 0, slides.length - 1);
  const raw = String((slides[cur] && slides[cur].html) || START_HTML);
  const safeHtml = ensureUsableSlideHtml(raw);
  if (!slides[cur]) slides[cur] = { html: safeHtml };
  if (slides[cur].html !== safeHtml) slides[cur].html = safeHtml;
  const formatted = formatHtml(safeHtml);
  els.code.value = formatted;
  renderCodeLineNumbers();
  backup = formatted;
  els.slideInfo.textContent = `${cur + 1} / ${slides.length}`;
  renderSidebar();
  loadWys(formatted);
  hideCodeMarker();
  applyZoom();
}

function resetSlidesWorkspace() {
  if (!confirm("Reset GenSlide workspace? All current slides will be cleared.")) return;
  pushHistory();
  slides = [{ html: START_HTML }];
  cur = 0;
  expandedSlideIndex = 0;
  backup = START_HTML;
  loadCurrent();
}

function saveCurrent() {
  pushHistory();
  const html = String(els.code.value || "");
  slides[cur].html = html;
  backup = html;
  renderSidebar();
  loadWys(html);
}

function revertCurrent() {
  els.code.value = backup;
  renderCodeLineNumbers();
  loadWys(backup);
}

function addSlide() {
  pushHistory();
  slides.push({ html: START_HTML });
  cur = slides.length - 1;
  expandedSlideIndex = cur;
  loadCurrent();
}

function insertSlideBelow(index) {
  const at = clamp(Number(index) || 0, 0, slides.length - 1);
  pushHistory();
  slides.splice(at + 1, 0, { html: START_HTML });
  cur = at + 1;
  expandedSlideIndex = cur;
  loadCurrent();
}

function normalizeHtml(html) {
  const src = String(html || "").trim();
  if (!src) return START_HTML;
  if (/^\s*<!DOCTYPE/i.test(src) || /^\s*<html[\s>]/i.test(src)) return src;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;">${src}</body></html>`;
}

function ensureUsableSlideHtml(html) {
  const normalized = normalizeHtml(html);
  try {
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    if (!doc || !doc.body) return START_HTML;
    const body = doc.body;
    const txt = String(body.textContent || "").replace(/\s+/g, "");
    const hasVisualNode = !!body.querySelector("img,svg,canvas,video,iframe,table,div,section,article,h1,h2,h3,h4,h5,h6,p,ul,ol,li,span");
    if (!txt && !hasVisualNode) return START_HTML;
    return normalized;
  } catch (_) {
    return START_HTML;
  }
}

function openAddModal() {
  els.addPaste.value = "";
  els.addOverlay.classList.add("open");
  setTimeout(() => els.addPaste.focus(), 0);
}

function closeAddModal() {
  els.addOverlay.classList.remove("open");
}

function confirmAddModal() {
  pushHistory();
  const incoming = normalizeHtml(els.addPaste.value);
  slides.push({ html: incoming });
  cur = slides.length - 1;
  expandedSlideIndex = cur;
  closeAddModal();
  loadCurrent();
}

function delSlide() {
  delSlideAt(cur);
}

function delSlideAt(index) {
  if (slides.length <= 1) return;
  if (!confirm("Are you sure you want to delete this slide?")) return;
  const at = clamp(Number(index) || 0, 0, slides.length - 1);
  pushHistory();
  slides.splice(at, 1);
  cur = clamp(at, 0, slides.length - 1);
  expandedSlideIndex = cur;
  loadCurrent();
}

function moveSlideUp(index) {
  const at = clamp(Number(index) || 0, 0, slides.length - 1);
  if (at <= 0) return;
  pushHistory();
  const tmp = slides[at - 1];
  slides[at - 1] = slides[at];
  slides[at] = tmp;
  cur = at - 1;
  expandedSlideIndex = cur;
  loadCurrent();
}

function moveSlideDown(index) {
  const at = clamp(Number(index) || 0, 0, slides.length - 1);
  if (at >= slides.length - 1) return;
  pushHistory();
  const tmp = slides[at + 1];
  slides[at + 1] = slides[at];
  slides[at] = tmp;
  cur = at + 1;
  expandedSlideIndex = cur;
  loadCurrent();
}


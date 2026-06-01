function applyZoom() {
  let effectiveZoom = zoom;
  const extraCanvasPad = objectEditMode ? 700 : 0;
  const viewWidth = slideWidth + extraCanvasPad;
  const viewHeight = slideHeight + extraCanvasPad;
  if (!Number.isFinite(effectiveZoom) || effectiveZoom <= 0) effectiveZoom = 0.75;
  effectiveZoom = clamp(effectiveZoom, 0.1, 3);

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
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#101725;color:#fff;font-family:Segoe UI,sans-serif;overflow:hidden}
  body.light{background:#e8edf7;color:#22314d}
  .ss-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:60px 16px 36px}
  iframe{width:${slideWidth}px;height:${slideHeight}px;border:none;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.45);transform-origin:center center;transition:transform .12s ease}
  .hud{position:fixed;left:14px;bottom:10px;font-size:13px;opacity:.85}
  .hint{position:fixed;right:14px;bottom:10px;font-size:12px;opacity:.7}
  .ss-tools{
    position:fixed;top:10px;left:50%;transform:translateX(-50%);
    display:flex;align-items:center;gap:6px;z-index:10;
    background:rgba(16,23,37,.86);border:1px solid rgba(120,142,183,.32);
    border-radius:10px;padding:6px 8px;backdrop-filter:blur(4px)
  }
  body.light .ss-tools{background:rgba(241,245,255,.95);border-color:rgba(90,112,152,.35)}
  .ss-btn{
    border:1px solid #3d5b93;background:#223a6f;color:#e6efff;border-radius:7px;
    padding:3px 8px;cursor:pointer;font-size:12px;line-height:1.2;font-weight:600
  }
  .ss-btn:hover{filter:brightness(1.08)}
  .ss-btn.reset{background:#2a3350;border-color:#4d5c83}
  .ss-sep{width:1px;height:18px;background:rgba(160,183,225,.35);margin:0 2px}
  .ss-lbl{min-width:42px;text-align:center;font-size:12px;font-weight:700;color:#9ec5ff;user-select:none}
  body.light .ss-lbl{color:#3b65b4}
</style>
</head>
<body>
  <div class="ss-tools" id="ssToolbar">
    <button class="ss-btn" id="ssPrev" title="Prev (Left)">◀</button>
    <button class="ss-btn" id="ssNext" title="Next (Right)">▶</button>
    <span class="ss-sep"></span>
    <button class="ss-btn" id="ssZoomOut" title="Page zoom out">－</button>
    <div class="ss-lbl" id="ssZoomLbl" title="Page zoom (double click: 100%)">100%</div>
    <button class="ss-btn" id="ssZoomIn" title="Page zoom in">＋</button>
    <span class="ss-sep"></span>
    <button class="ss-btn" id="ssFontDown" title="Font zoom out">A－</button>
    <div class="ss-lbl" id="ssFontLbl" title="Font zoom (double click: 100%)">100%</div>
    <button class="ss-btn" id="ssFontUp" title="Font zoom in">A＋</button>
    <span class="ss-sep"></span>
    <button class="ss-btn reset" id="ssDarkBtn" title="Dark/Light">Dark</button>
    <button class="ss-btn reset" id="ssFullBtn" title="Fullscreen">Fullscreen</button>
  </div>
  <div class="ss-root" id="ssRoot"><iframe id="ssFrame" sandbox="allow-same-origin allow-scripts"></iframe></div>
  <div class="hud" id="ssInfo"></div>
  <div class="hint">Click: next / left area: prev · ←/→ · +/- page zoom · [/] font zoom · D dark · F fullscreen · Esc close</div>
<script>
  const slides = JSON.parse(decodeURIComponent("${escapeAttr(payload)}"));
  let idx = ${start};
  let pageZoom = 1;
  let fontZoom = 1;
  let darkMode = true;
  const frame = document.getElementById("ssFrame");
  const info = document.getElementById("ssInfo");
  const toolbar = document.getElementById("ssToolbar");
  const zoomLbl = document.getElementById("ssZoomLbl");
  const fontLbl = document.getElementById("ssFontLbl");
  const darkBtn = document.getElementById("ssDarkBtn");
  const fullBtn = document.getElementById("ssFullBtn");

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function pct(v){ return Math.round(v * 100) + "%"; }
  function applyPageZoom(){
    pageZoom = clamp(pageZoom, 0.4, 2.4);
    frame.style.transform = "scale(" + pageZoom + ")";
    zoomLbl.textContent = pct(pageZoom);
  }
  function applyFontZoom(){
    fontZoom = clamp(fontZoom, 0.7, 2.2);
    fontLbl.textContent = pct(fontZoom);
    const doc = frame && frame.contentDocument ? frame.contentDocument : null;
    if (!doc || !doc.body) return;
    const nodes = doc.body.querySelectorAll("*");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el || !el.tagName) continue;
      const tag = String(el.tagName).toLowerCase();
      if (tag === "script" || tag === "style" || tag === "svg" || tag === "path" || tag === "img" || tag === "canvas" || tag === "video") continue;
      let base = Number(el.getAttribute("data-ss-base-font"));
      if (!Number.isFinite(base) || base <= 0) {
        const cs = window.getComputedStyle(el);
        const px = parseFloat(cs && cs.fontSize ? cs.fontSize : "");
        if (!Number.isFinite(px) || px <= 0) continue;
        base = px;
        el.setAttribute("data-ss-base-font", String(base));
      }
      const next = clamp(base * fontZoom, 6, 240);
      el.style.setProperty("font-size", next.toFixed(2) + "px", "important");
    }
  }
  function applyTheme(){
    document.body.classList.toggle("light", !darkMode);
    darkBtn.textContent = darkMode ? "Dark" : "Light";
  }
  function toggleFullscreen(){
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {});
  }
  function draw(){
    if(!slides.length){ info.textContent="No slides"; frame.srcdoc=""; return; }
    frame.srcdoc = slides[idx] || "";
    info.textContent = "Slide " + (idx + 1) + " / " + slides.length;
    applyPageZoom();
  }
  function next(){ if(!slides.length) return; idx = Math.min(slides.length - 1, idx + 1); draw(); }
  function prev(){ if(!slides.length) return; idx = Math.max(0, idx - 1); draw(); }
  frame.addEventListener("load", () => { applyFontZoom(); });
  document.getElementById("ssPrev").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); prev(); });
  document.getElementById("ssNext").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); next(); });
  document.getElementById("ssZoomIn").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pageZoom += 0.1; applyPageZoom(); });
  document.getElementById("ssZoomOut").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pageZoom -= 0.1; applyPageZoom(); });
  zoomLbl.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); pageZoom = 1; applyPageZoom(); });
  document.getElementById("ssFontUp").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fontZoom += 0.1; applyFontZoom(); });
  document.getElementById("ssFontDown").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fontZoom -= 0.1; applyFontZoom(); });
  fontLbl.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); fontZoom = 1; applyFontZoom(); });
  darkBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); darkMode = !darkMode; applyTheme(); });
  fullBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); });

  document.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    pageZoom += (e.deltaY < 0 ? 0.06 : -0.06);
    applyPageZoom();
  }, { passive: false });

  document.addEventListener("keydown",(e)=>{
    if(e.key === "ArrowRight" || e.key === "PageDown" || e.key === " "){ e.preventDefault(); next(); }
    else if(e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); prev(); }
    else if(e.key === "+" || e.key === "="){ e.preventDefault(); pageZoom += 0.1; applyPageZoom(); }
    else if(e.key === "-" || e.key === "_"){ e.preventDefault(); pageZoom -= 0.1; applyPageZoom(); }
    else if(e.key === "0"){ e.preventDefault(); pageZoom = 1; applyPageZoom(); }
    else if(e.key === "]"){ e.preventDefault(); fontZoom += 0.1; applyFontZoom(); }
    else if(e.key === "["){ e.preventDefault(); fontZoom -= 0.1; applyFontZoom(); }
    else if(e.key === "9"){ e.preventDefault(); fontZoom = 1; applyFontZoom(); }
    else if(e.key === "d" || e.key === "D"){ e.preventDefault(); darkMode = !darkMode; applyTheme(); }
    else if(e.key === "f" || e.key === "F"){ e.preventDefault(); toggleFullscreen(); }
    else if(e.key === "Escape"){
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else window.close();
    }
  });
  document.addEventListener("click",(e)=>{
    const target = e.target;
    if (target && target.closest && target.closest("#ssToolbar")) return;
    const x = e.clientX || 0;
    const w = window.innerWidth || 1;
    if (x < w * 0.35) prev(); else next();
  });
  applyTheme();
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


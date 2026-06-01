function loadScriptOnce(urls) {
  const arr = Array.isArray(urls) ? urls : [urls];
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= arr.length) {
        reject(new Error("Failed to load script."));
        return;
      }
      const src = arr[i++];
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => {
        s.remove();
        tryNext();
      };
      document.head.appendChild(s);
    };
    tryNext();
  });
}

async function ensurePptxDeps() {
  if (typeof window.html2canvas !== "function") {
    await loadScriptOnce([
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"
    ]);
  }
  if (typeof window.PptxGenJS === "undefined") {
    await loadScriptOnce([
      "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
      "https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"
    ]);
  }
}

async function buildInternalImageUrlMapFromSlides(list) {
  const ids = extractInternalImageIdsFromSlides(list);
  const map = new Map();
  if (!ids.length) return map;
  const db = await openAppDb();
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const rec = await getImageRecord(db, id);
      if (!rec || !rec.blob) continue;
      map.set(id, URL.createObjectURL(rec.blob));
    }
  } finally {
    try { db.close(); } catch (_) {}
  }
  return map;
}

function replaceInternalImagesForRender(html, urlMap) {
  const src = String(html || "");
  return src.replace(INTERNAL_RE, (_, encId) => {
    const id = decodeInternalId(encId);
    const u = urlMap.get(id);
    return u || `internal://${encId}`;
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FA_CSS_LINKS = [
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://use.fontawesome.com/releases/v5.15.4/css/all.css"
];

function ensureFontAwesomeInHtml(html) {
  const src = String(html || START_HTML || "");
  const hasFa = /font-awesome|fa[srbld]?\s+fa-|cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome|use\.fontawesome\.com/i.test(src);
  if (hasFa) return src;
  const links = FA_CSS_LINKS.map((u) => `<link rel="stylesheet" href="${u}">`).join("");
  if (/<\/head>/i.test(src)) {
    return src.replace(/<\/head>/i, `${links}</head>`);
  }
  if (/<html[^>]*>/i.test(src)) {
    return src.replace(/<html[^>]*>/i, (m) => `${m}<head>${links}</head>`);
  }
  return `<!DOCTYPE html><html><head>${links}</head><body>${src}</body></html>`;
}

let pptxExportInProgress = false;

function ensurePptxProgressUi() {
  let root = document.getElementById("jena-pptx-progress");
  if (root) return root;
  root = document.createElement("div");
  root.id = "jena-pptx-progress";
  root.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "width:280px",
    "padding:10px 12px",
    "border:1px solid #cdd7ef",
    "background:#ffffff",
    "border-radius:10px",
    "box-shadow:0 10px 24px rgba(17,32,70,.18)",
    "font:600 12px/1.3 'Segoe UI',sans-serif",
    "color:#1f2a44",
    "display:none"
  ].join(";");
  root.innerHTML = [
    '<div id="jena-pptx-progress-title" style="margin-bottom:6px;">PPTX Export</div>',
    '<div id="jena-pptx-progress-msg" style="font-weight:500;opacity:.9;margin-bottom:6px;">Ready</div>',
    '<div style="height:8px;border-radius:5px;background:#eef2fb;overflow:hidden;">',
    '  <div id="jena-pptx-progress-bar" style="height:100%;width:0%;background:#2f66d2;transition:width .2s ease;"></div>',
    '</div>',
    '<div id="jena-pptx-progress-pct" style="text-align:right;margin-top:6px;font-weight:700;">0%</div>'
  ].join("");
  document.body.appendChild(root);
  return root;
}

function setPptxProgress(percent, message) {
  const root = ensurePptxProgressUi();
  const pct = clamp(Math.round(Number(percent) || 0), 0, 100);
  const bar = document.getElementById("jena-pptx-progress-bar");
  const txt = document.getElementById("jena-pptx-progress-pct");
  const msg = document.getElementById("jena-pptx-progress-msg");
  if (bar) bar.style.width = `${pct}%`;
  if (txt) txt.textContent = `${pct}%`;
  if (msg) msg.textContent = String(message || "");
  root.style.display = "block";
}

function hidePptxProgress(delayMs) {
  const root = document.getElementById("jena-pptx-progress");
  if (!root) return;
  const waitMs = Math.max(0, Number(delayMs) || 0);
  setTimeout(() => {
    root.style.display = "none";
  }, waitMs);
}

async function settleChartsInFrame(frame, timeoutMs) {
  const win = frame && frame.contentWindow;
  const doc = frame && frame.contentDocument;
  if (!win || !doc) return;

  const start = Date.now();
  const timeout = Math.max(600, Number(timeoutMs) || 2500);

  while (Date.now() - start < timeout) {
    const Chart = win.Chart;
    if (!Chart) {
      await wait(80);
      continue;
    }

    try {
      if (Chart.defaults) {
        if (typeof Chart.defaults.animation !== "undefined") Chart.defaults.animation = false;
        if (typeof Chart.defaults.animations !== "undefined") Chart.defaults.animations = false;
      }
      if (Chart.defaults && Chart.defaults.transitions && Chart.defaults.transitions.active) {
        Chart.defaults.transitions.active.animation = false;
      }
    } catch (_) {}

    let charts = [];
    try {
      if (typeof Chart.instances !== "undefined") {
        if (Array.isArray(Chart.instances)) {
          charts = Chart.instances.filter(Boolean);
        } else {
          charts = Object.values(Chart.instances || {}).filter(Boolean);
        }
      } else if (typeof Chart.getChart === "function") {
        const canvases = Array.from(doc.querySelectorAll("canvas"));
        charts = canvases.map((c) => Chart.getChart(c)).filter(Boolean);
      }
    } catch (_) {}

    if (!charts.length) {
      await wait(90);
      continue;
    }

    for (let i = 0; i < charts.length; i++) {
      const ch = charts[i];
      if (!ch) continue;
      try { if (typeof ch.stop === "function") ch.stop(); } catch (_) {}
      try { if (typeof ch.update === "function") ch.update("none"); } catch (_) {}
      try { if (ch.options && ch.options.animation) ch.options.animation = false; } catch (_) {}
      try { if (ch.options && ch.options.animations) ch.options.animations = false; } catch (_) {}
    }

    // Give chart canvas paint a short chance, then finish.
    await wait(120);
    break;
  }
}

async function waitForFrameVisualReady(frame, timeoutMs) {
  const timeout = Math.max(1000, Number(timeoutMs) || 7000);
  const win = frame && frame.contentWindow;
  const doc = frame && frame.contentDocument;
  if (!win || !doc) {
    await wait(1200);
    return;
  }

  const start = Date.now();
  const timeLeft = () => Math.max(1, timeout - (Date.now() - start));

  // 1) Wait basic document readiness.
  while (doc.readyState !== "complete" && Date.now() - start < timeout) {
    await wait(50);
  }

  // 2) Wait web fonts if supported.
  try {
    if (doc.fonts && doc.fonts.ready) {
      await Promise.race([doc.fonts.ready, wait(timeLeft())]);
    }
  } catch (_) {}

  // 3) Wait all <img> to complete.
  try {
    const imgs = Array.from(doc.images || []);
    if (imgs.length) {
      await Promise.race([
        Promise.all(imgs.map((img) => new Promise((resolve) => {
          if (img.complete) { resolve(true); return; }
          const done = () => resolve(true);
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }))),
        wait(timeLeft())
      ]);
    }
  } catch (_) {}

  // 4) Wait quiet DOM window (no mutations for ~350ms).
  await new Promise((resolve) => {
    let timer = null;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      try { obs.disconnect(); } catch (_) {}
      resolve(true);
    };
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, 350);
    };
    const obs = new MutationObserver(() => kick());
    try {
      obs.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (_) {}
    kick();
    setTimeout(finish, timeLeft());
  });

  // 5) Force-finish chart animations and redraw static frame if Chart.js exists.
  await settleChartsInFrame(frame, Math.min(3000, timeLeft()));

  // 6) Extra buffer for canvas animation/JS chart drawing.
  await wait(1400);

  // 7) Two rAF ticks to ensure painted frame.
  await new Promise((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve(true))));
}

async function renderSlideHtmlToPngData(slideHtml) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${slideWidth}px`;
  host.style.height = `${slideHeight}px`;
  host.style.background = "#fff";
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
  frame.style.width = `${slideWidth}px`;
  frame.style.height = `${slideHeight}px`;
  frame.style.border = "0";
  host.appendChild(frame);
  document.body.appendChild(host);
  try {
    frame.srcdoc = ensureFontAwesomeInHtml(String(slideHtml || START_HTML));
    await new Promise((resolve) => {
      frame.onload = () => resolve(true);
      setTimeout(() => resolve(true), 1000);
    });
    await waitForFrameVisualReady(frame, 7500);
    const doc = frame.contentDocument;
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
    return canvas.toDataURL("image/png");
  } finally {
    host.remove();
  }
}

function toPptColor(input, fallback) {
  const src = String(input || "").trim();
  if (!src) return fallback || "1f2a44";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(src)) {
    const hex = src.slice(1);
    if (hex.length === 3) return hex.split("").map((c) => c + c).join("").toUpperCase();
    return hex.toUpperCase();
  }
  const m = src.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    const r = Math.max(0, Math.min(255, Math.round(Number(m[1]) || 0)));
    const g = Math.max(0, Math.min(255, Math.round(Number(m[2]) || 0)));
    const b = Math.max(0, Math.min(255, Math.round(Number(m[3]) || 0)));
    return [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return fallback || "1f2a44";
}

function parsePx(value, fallback) {
  const n = Number(String(value || "").replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(n)) return Number(fallback) || 0;
  return n;
}

function pxToInchX(px, pptW) {
  return (Math.max(0, Number(px) || 0) / Math.max(1, slideWidth)) * pptW;
}

function pxToInchY(px, pptH) {
  return (Math.max(0, Number(px) || 0) / Math.max(1, slideHeight)) * pptH;
}

function normalizeTextNodeValue(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeElementText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeTextForPpt(text) {
  return String(text || "")
    // remove common icon fallback glyphs / private-use symbols from web icon fonts
    .replace(/[\u25A1\u25A0\u2610\u2611\u2612]/g, "")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isElementVisible(win, el) {
  if (!el) return false;
  const cs = win.getComputedStyle(el);
  if (!cs) return false;
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (Number(cs.opacity) === 0) return false;
  return true;
}

function pickFirstSolidBgHex(win, nodes, fallbackHex) {
  const arr = Array.isArray(nodes) ? nodes : [];
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    if (!el) continue;
    try {
      const cs = win.getComputedStyle(el);
      if (!cs) continue;
      const bg = String(cs.backgroundColor || "").trim();
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)" || bg === "rgba(0,0,0,0)") continue;
      const hex = toPptColor(bg, "");
      if (hex) return hex;
    } catch (_) {}
  }
  return fallbackHex || "FFFFFF";
}

function isInlineTextTag(tag) {
  const t = String(tag || "").toLowerCase();
  return [
    "a", "abbr", "b", "bdi", "bdo", "cite", "code", "del", "dfn", "em", "i", "ins", "kbd",
    "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "u", "var", "font", "br"
  ].includes(t);
}

function hasVisualBoxStyle(cs) {
  if (!cs) return false;
  const bg = String(cs.backgroundColor || "").trim();
  const hasBg = !!bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgba(0,0,0,0)";
  const borderW = (
    parsePx(cs.borderTopWidth, 0) +
    parsePx(cs.borderRightWidth, 0) +
    parsePx(cs.borderBottomWidth, 0) +
    parsePx(cs.borderLeftWidth, 0)
  );
  const radius = (
    parsePx(cs.borderTopLeftRadius, 0) +
    parsePx(cs.borderTopRightRadius, 0) +
    parsePx(cs.borderBottomRightRadius, 0) +
    parsePx(cs.borderBottomLeftRadius, 0)
  );
  const shadow = String(cs.boxShadow || "none").trim().toLowerCase();
  const hasShadow = shadow && shadow !== "none";
  return hasBg || borderW > 0 || radius > 0 || hasShadow;
}

function parseCssColorToHexAlpha(input, fallbackHex) {
  const src = String(input || "").trim();
  if (!src) return { hex: fallbackHex || "000000", alpha: 1 };
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(src)) {
    return { hex: toPptColor(src, fallbackHex || "000000"), alpha: 1 };
  }
  const m = src.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!m) return { hex: toPptColor(src, fallbackHex || "000000"), alpha: 1 };
  const r = Math.max(0, Math.min(255, Math.round(Number(m[1]) || 0)));
  const g = Math.max(0, Math.min(255, Math.round(Number(m[2]) || 0)));
  const b = Math.max(0, Math.min(255, Math.round(Number(m[3]) || 0)));
  const a = m[4] == null ? 1 : Math.max(0, Math.min(1, Number(m[4]) || 0));
  return {
    hex: [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase(),
    alpha: a
  };
}

function getTextAlignFromStyle(cs) {
  const a = String((cs && cs.textAlign) || "left").toLowerCase();
  if (a === "center") return "center";
  if (a === "right" || a === "end") return "right";
  if (a === "justify") return "justify";
  return "left";
}

function isBlockLikeDisplay(display) {
  const d = String(display || "").toLowerCase();
  return d.includes("block") || d.includes("flex") || d.includes("grid") || d.includes("table") || d === "list-item";
}

function hasVisibleNonInlineTextChild(win, el) {
  const children = Array.from(el.children || []);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (!isElementVisible(win, c)) continue;
    if (isInlineTextTag(c.tagName)) continue;
    const txt = normalizeElementText(c.innerText || c.textContent || "");
    if (!txt) continue;
    const cs = win.getComputedStyle(c);
    if (isBlockLikeDisplay(cs && cs.display)) return true;
  }
  return false;
}

function getClassTokens(el) {
  const raw = String((el && el.className) || "");
  return raw.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function hasContainerLikeClass(el) {
  const classes = getClassTokens(el);
  if (!classes.length) return false;
  const keys = [
    "container", "panel", "box", "card", "item", "wrap", "section", "layout",
    "left-panel", "right-panel", "slide-container", "checklist-item", "checklist-container",
    "icon-box", "content-box", "header", "footer"
  ];
  return classes.some((c) => keys.some((k) => c === k || c.includes(k)));
}

function hasDecorLikeClass(el) {
  const classes = getClassTokens(el);
  if (!classes.length) return false;
  const keys = ["bg", "background", "pattern", "accent", "circle", "shape", "decor", "icon", "badge"];
  return classes.some((c) => keys.some((k) => c === k || c.includes(k)));
}

function isTextTag(tag) {
  const t = String(tag || "").toLowerCase();
  return [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "li", "label",
    "strong", "em", "small", "blockquote", "figcaption"
  ].includes(t);
}

function isBlockTextTag(tag) {
  const t = String(tag || "").toLowerCase();
  return ["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "label"].includes(t);
}

function isInlineTextSemanticTag(tag) {
  const t = String(tag || "").toLowerCase();
  return ["span", "strong", "b", "em", "i", "u", "small", "mark", "font", "a", "sub", "sup", "code"].includes(t);
}

function hasBlockChildren(el) {
  const children = Array.from((el && el.children) || []);
  for (let i = 0; i < children.length; i++) {
    const tag = String(children[i].tagName || "").toLowerCase();
    if (!tag) continue;
    if (!isInlineTextTag(tag)) return true;
  }
  return false;
}

function hasTextElementChild(el) {
  const children = Array.from((el && el.children) || []);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const txt = normalizeElementText(c.innerText || c.textContent || "");
    if (txt) return true;
  }
  return false;
}

function isPositionedForText(cs) {
  const p = String((cs && cs.position) || "").toLowerCase();
  return p === "absolute" || p === "fixed";
}

function hasBackgroundImageStyle(cs) {
  const bgImg = String((cs && cs.backgroundImage) || "").trim().toLowerCase();
  return !!bgImg && bgImg !== "none";
}

function hasRenderablePseudoVisual(win, el) {
  try {
    const b = win.getComputedStyle(el, "::before");
    const a = win.getComputedStyle(el, "::after");
    const check = (cs) => {
      if (!cs) return false;
      const content = String(cs.content || "").trim();
      const bgImg = String(cs.backgroundImage || "").trim().toLowerCase();
      const bgCol = String(cs.backgroundColor || "").trim().toLowerCase();
      const bw = parsePx(cs.borderTopWidth, 0) + parsePx(cs.borderRightWidth, 0) + parsePx(cs.borderBottomWidth, 0) + parsePx(cs.borderLeftWidth, 0);
      const hasContent = content && content !== "none" && content !== "\"\"" && content !== "''";
      const hasBg = (bgImg && bgImg !== "none") || (bgCol && bgCol !== "transparent" && bgCol !== "rgba(0, 0, 0, 0)" && bgCol !== "rgba(0,0,0,0)");
      return hasContent || hasBg || bw > 0;
    };
    return check(b) || check(a);
  } catch (_) {
    return false;
  }
}

function isIconLikeElement(win, el) {
  if (!el || !el.tagName) return false;
  const tag = String(el.tagName || "").toLowerCase();
  const cls = getClassTokens(el);
  const clsStr = cls.join(" ");
  if (tag === "i" || tag === "icon") {
    if (/\bfa[srbld]?\b/.test(clsStr) || cls.some((c) => c.startsWith("fa-"))) return true;
  }
  try {
    const cs = win.getComputedStyle(el);
    const ff = String((cs && cs.fontFamily) || "").toLowerCase();
    if (ff.includes("font awesome") || ff.includes("material icons")) return true;
  } catch (_) {}
  return false;
}

function getElementDomOrder(el) {
  const path = [];
  let cur = el;
  while (cur && cur.parentElement) {
    const p = cur.parentElement;
    const idx = Array.prototype.indexOf.call(p.children, cur);
    path.push(idx < 0 ? 0 : idx);
    cur = p;
  }
  path.reverse();
  return path;
}

function compareDomOrderPath(a, b) {
  const pa = a || [];
  const pb = b || [];
  const n = Math.min(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return pa.length - pb.length;
}

function getZChain(win, el) {
  const out = [];
  let cur = el;
  while (cur && cur.nodeType === 1) {
    try {
      const cs = win.getComputedStyle(cur);
      const ziRaw = String((cs && cs.zIndex) || "").trim().toLowerCase();
      const pos = String((cs && cs.position) || "").toLowerCase();
      if ((pos !== "static" || cur === el) && ziRaw && ziRaw !== "auto") {
        const zi = parseInt(ziRaw, 10);
        if (Number.isFinite(zi)) out.push(zi);
      }
    } catch (_) {}
    cur = cur.parentElement;
  }
  out.reverse();
  return out;
}

function compareZChain(a, b) {
  const ca = a || [];
  const cb = b || [];
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    if (ca[i] !== cb[i]) return ca[i] - cb[i];
  }
  return ca.length - cb.length;
}

async function captureBackgroundStyleToPngData(doc, cs, width, height) {
  const w = Math.max(2, Math.round(Number(width) || 0));
  const h = Math.max(2, Math.round(Number(height) || 0));
  const ghost = doc.createElement("div");
  ghost.setAttribute("data-jena-ui", "1");
  ghost.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:-10000px",
    `width:${w}px`,
    `height:${h}px`,
    `background-color:${String((cs && cs.backgroundColor) || "transparent")}`,
    `background-image:${String((cs && cs.backgroundImage) || "none")}`,
    `background-repeat:${String((cs && cs.backgroundRepeat) || "repeat")}`,
    `background-position:${String((cs && cs.backgroundPosition) || "0% 0%")}`,
    `background-size:${String((cs && cs.backgroundSize) || "auto")}`,
    `background-origin:${String((cs && cs.backgroundOrigin) || "padding-box")}`,
    `background-clip:${String((cs && cs.backgroundClip) || "border-box")}`,
    `border-top:${String((cs && cs.borderTop) || "0 none transparent")}`,
    `border-right:${String((cs && cs.borderRight) || "0 none transparent")}`,
    `border-bottom:${String((cs && cs.borderBottom) || "0 none transparent")}`,
    `border-left:${String((cs && cs.borderLeft) || "0 none transparent")}`,
    `border-top-left-radius:${String((cs && cs.borderTopLeftRadius) || "0")}`,
    `border-top-right-radius:${String((cs && cs.borderTopRightRadius) || "0")}`,
    `border-bottom-right-radius:${String((cs && cs.borderBottomRightRadius) || "0")}`,
    `border-bottom-left-radius:${String((cs && cs.borderBottomLeftRadius) || "0")}`,
    `box-shadow:${String((cs && cs.boxShadow) || "none")}`,
    `opacity:${String((cs && cs.opacity) || "1")}`
  ].join(";");
  doc.body.appendChild(ghost);
  try {
    return await captureDomElementToPngData(ghost);
  } finally {
    try { ghost.remove(); } catch (_) {}
  }
}

async function captureElementBackgroundOnlyToPngData(doc, srcEl) {
  const rect = srcEl.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return "";
  const ghost = srcEl.cloneNode(true);
  ghost.setAttribute("data-jena-ui", "1");
  ghost.style.position = "fixed";
  ghost.style.left = "-10000px";
  ghost.style.top = "-10000px";
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.height = `${Math.round(rect.height)}px`;
  ghost.style.margin = "0";
  ghost.style.transform = "none";
  ghost.style.opacity = "1";

  const all = ghost.querySelectorAll("*");
  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    n.setAttribute("data-jena-ui", "1");
    n.style.color = "transparent";
    n.style.textShadow = "none";
    n.style.borderColor = "transparent";
    n.style.background = "transparent";
    n.style.backgroundImage = "none";
  }

  doc.body.appendChild(ghost);
  try {
    return await captureDomElementToPngData(ghost);
  } finally {
    try { ghost.remove(); } catch (_) {}
  }
}

function getElementZIndex(win, el) {
  try {
    const cs = win.getComputedStyle(el);
    const z = parseInt(String((cs && cs.zIndex) || ""), 10);
    return Number.isFinite(z) ? z : 0;
  } catch (_) {
    return 0;
  }
}

async function captureDomElementToPngData(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return "";
  const canvas = await window.html2canvas(el, {
    backgroundColor: null,
    useCORS: true,
    scale: 2,
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  });
  return canvas.toDataURL("image/png");
}

function getSafeFontFace(style) {
  const raw = String((style && style.fontFamily) || "").trim();
  if (!raw) return "Segoe UI";
  return raw.split(",")[0].replace(/["']/g, "").trim() || "Segoe UI";
}

async function renderFrameToPptObjects(frame, slide, pptW, pptH) {
  return renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, "image_text");
}

function askPptxExportMode() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("pptxModeOverlay");
    const btnClose = document.getElementById("btnPptxModeClose");
    const btnCancel = document.getElementById("btnPptxModeCancel");
    const btnImage = document.getElementById("btnPptxModeImage");
    const btnImageText = document.getElementById("btnPptxModeImageText");
    const btnFull = document.getElementById("btnPptxModeFull");
    if (!overlay || !btnClose || !btnCancel || !btnImage || !btnImageText || !btnFull) {
      resolve("image_text");
      return;
    }

    const done = (mode) => {
      overlay.classList.remove("open");
      btnClose.onclick = null;
      btnCancel.onclick = null;
      btnImage.onclick = null;
      btnImageText.onclick = null;
      btnFull.onclick = null;
      overlay.onclick = null;
      resolve(mode || "");
    };

    btnClose.onclick = () => done("");
    btnCancel.onclick = () => done("");
    btnImage.onclick = () => done("image");
    btnImageText.onclick = () => done("image_text");
    btnFull.onclick = () => done("full");
    overlay.onclick = (e) => { if (e.target === overlay) done(""); };
    overlay.classList.add("open");
  });
}

function askPptxExportConfirm(mode) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("pptxConfirmOverlay");
    const txt = document.getElementById("pptxConfirmText");
    const btnClose = document.getElementById("btnPptxConfirmClose");
    const btnCancel = document.getElementById("btnPptxConfirmCancel");
    const btnOk = document.getElementById("btnPptxConfirmOk");
    if (!overlay || !txt || !btnClose || !btnCancel || !btnOk) {
      resolve(true);
      return;
    }

    const modeLabel = mode === "image" ? "image" : (mode === "full" ? "full" : "image_text");
    txt.textContent = `pptx를 생성합니다. 진행할까요? (${modeLabel})`;

    const done = (ok) => {
      overlay.classList.remove("open");
      btnClose.onclick = null;
      btnCancel.onclick = null;
      btnOk.onclick = null;
      overlay.onclick = null;
      resolve(!!ok);
    };

    btnClose.onclick = () => done(false);
    btnCancel.onclick = () => done(false);
    btnOk.onclick = () => done(true);
    overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    overlay.classList.add("open");
  });
}

async function renderSlideHtmlToPpt(slideHtml, slide, pptW, pptH) {
  return renderSlideHtmlToPptByMode(slideHtml, slide, pptW, pptH, "image_text");
}

async function renderSlideHtmlToPptByMode(slideHtml, slide, pptW, pptH, mode) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${slideWidth}px`;
  host.style.height = `${slideHeight}px`;
  host.style.background = "#fff";
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
  frame.style.width = `${slideWidth}px`;
  frame.style.height = `${slideHeight}px`;
  frame.style.border = "0";
  host.appendChild(frame);
  document.body.appendChild(host);
  try {
    frame.srcdoc = ensureFontAwesomeInHtml(String(slideHtml || START_HTML));
    await new Promise((resolve) => {
      frame.onload = () => resolve(true);
      setTimeout(() => resolve(true), 1200);
    });
    await waitForFrameVisualReady(frame, 9000);
    if (mode === "image" && typeof window.renderPptxByModeImage === "function") {
      await window.renderPptxByModeImage(frame, slide, pptW, pptH);
    } else if (mode === "full" && typeof window.renderPptxByModeFull === "function") {
      await window.renderPptxByModeFull(frame, slide, pptW, pptH);
    } else if (mode === "image_text" && typeof window.renderPptxByModeImageText === "function") {
      await window.renderPptxByModeImageText(frame, slide, pptW, pptH);
    } else if (mode === "image") {
      // fallback if mode file failed to load
      const doc = frame.contentDocument;
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
    } else {
      // fallback for image_text/full if mode file failed to load
      await renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, mode);
    }
  } finally {
    host.remove();
  }
}

async function exportPptx() {
  if (pptxExportInProgress) return;
  const mode = await askPptxExportMode();
  if (!mode) return;
  if (!(await askPptxExportConfirm(mode))) return;

  const btn = document.getElementById("btnPptxExport");
  pptxExportInProgress = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Exporting...";
  }
  let objectUrls = [];
  try {
    // Starting export pipeline
    setPptxProgress(2, `\uC900\uBE44 \uC911... (${mode})`);
    await ensurePptxDeps();
    // Dependencies are loaded
    setPptxProgress(8, "\uB77C\uC774\uBE0C\uB7EC\uB9AC \uC900\uBE44 \uC644\uB8CC");
    const urlMap = await buildInternalImageUrlMapFromSlides(slides);
    objectUrls = Array.from(urlMap.values());
    // Slide content parsing
    setPptxProgress(12, "\uC2AC\uB77C\uC774\uB4DC \uBD84\uC11D \uC911...");

    const Pptx = window.PptxGenJS;
    const pptx = new Pptx();
    const ratio = slideWidth / Math.max(1, slideHeight);
    const pptH = 7.5;
    const pptW = Math.max(4, Number((pptH * ratio).toFixed(3)));
    if (typeof pptx.defineLayout === "function") {
      pptx.defineLayout({ name: "JENA_DYNAMIC", width: pptW, height: pptH });
      pptx.layout = "JENA_DYNAMIC";
    } else {
      pptx.layout = "LAYOUT_WIDE";
      }

      for (let i = 0; i < slides.length; i++) {
        const donePct = slides.length > 0 ? Math.round((i / slides.length) * 80) : 80;
        // Rendering each slide
        setPptxProgress(15 + donePct, `\uC2AC\uB77C\uC774\uB4DC \uCC98\uB9AC \uC911... (${i + 1}/${slides.length})`);
        const html = replaceInternalImagesForRender(String((slides[i] && slides[i].html) || START_HTML), urlMap);
        const s = pptx.addSlide();
        await renderSlideHtmlToPptByMode(html, s, pptW, pptH, mode);
        const stepPct = slides.length > 0 ? Math.round(((i + 1) / slides.length) * 80) : 80;
        // Slide finished
        setPptxProgress(15 + stepPct, `\uC2AC\uB77C\uC774\uB4DC \uC644\uB8CC (${i + 1}/${slides.length})`);
      }
    // Writing final PPTX file
    setPptxProgress(97, "\uD30C\uC77C \uC0DD\uC131 \uC911...");
    const fname = `jena_slides_${Date.now()}.pptx`;
    await pptx.writeFile({ fileName: fname });
    // Export done
    setPptxProgress(100, "\uC644\uB8CC");
    hidePptxProgress(1600);
  } catch (e) {
    // Export failed
    setPptxProgress(100, "\uC2E4\uD328");
    hidePptxProgress(2200);
    alert("pptx export failed.");
  } finally {
    for (let i = 0; i < objectUrls.length; i++) {
      try { URL.revokeObjectURL(objectUrls[i]); } catch (_) {}
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "pptx Export";
    }
    pptxExportInProgress = false;
  }
}

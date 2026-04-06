;(() => {
const START_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:"Segoe UI",sans-serif;background:#f7f9ff;} .slide{width:1280px;height:720px;padding:72px;background:#fff;} h1{margin:0 0 16px;color:#0a2a66;} p{font-size:28px;color:#334155;}</style></head><body><div class="slide"><h1>New Slide</h1><p>Edit on the right and sync to HTML code.</p></div></body></html>';

let slides = [{ html: START_HTML }];
let cur = 0;
let zoom = 0.75;
let slideWidth = 1280;
let slideHeight = 720;
let backup = START_HTML;
let syncTimer = null;
let codeToWysTimer = null;
let lastLoadedWysHtml = "";
let autoSaveTimer = null;
let autoSidebarTimer = null;
let historyStack = [];
const MAX_HISTORY = 80;
let codeMarkerTimer = null;
let lastCodeMark = "";
let lastCodeIndex = 0;
let expandedSlideIndex = -1;
let lastFindIndex = -1;
const INTERNAL_RE = /internal:\/\/([A-Za-z0-9._~%\-]+)/g;
const APP_NAMESPACE = "genslide";
const IDB_NAME = "GenSlideDB";
const IDB_VERSION = 4;
const MSG_OPEN_SLIDE = `${APP_NAMESPACE}-open-slide`;
let currentInsertMode = "link";
let currentImgSource = "url";
let activeWysObjectUrls = [];
let savedStyleRange = null;
let selectedInDbId = "";
let appDarkMode = false;
let codeDarkMode = false;
let codeThemeFollowApp = true;
let codeFontSize = 12;
let objectEditMode = false;
const SLIDE_SIZE_PRESETS = {
  "3:4": { w: 1080, h: 1440 },
  "4:3": { w: 1024, h: 768 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  a4: { w: 1050, h: 1485 }
};
let codeWrapEnabled = false;

function refreshObjectEditModeButton() {
  const btn = els.objectEditModeBtn;
  if (!btn) return;
  btn.textContent = objectEditMode ? "편집모드: ON" : "편집모드: OFF";
  btn.classList.toggle("primary", objectEditMode);
}

function setObjectEditMode(next) {
  objectEditMode = !!next;
  refreshObjectEditModeButton();
  const d = getWysDoc();
  if (d && d.__jenaImageEditor && typeof d.__jenaImageEditor.setEnabled === "function") {
    d.__jenaImageEditor.setEnabled(objectEditMode);
  }
  if (d && d.__jenaContainerEditor && typeof d.__jenaContainerEditor.setEnabled === "function") {
    d.__jenaContainerEditor.setEnabled(objectEditMode);
  }
}

const els = {
  slides: document.getElementById("slides"),
  code: document.getElementById("code"),
  slideInfo: document.getElementById("slideInfo"),
  zoomView: document.getElementById("zoomView"),
  stage: document.getElementById("stage"),
  wys: document.getElementById("wys"),
  fileInput: document.getElementById("fileInput"),
  addOverlay: document.getElementById("addOverlay"),
  addPaste: document.getElementById("addPaste"),
  codeWrap: document.getElementById("codeWrap"),
  codeMarker: document.getElementById("codeMarker"),
  codeLines: document.getElementById("codeLines"),
  codeView: document.getElementById("codeView"),
  findBar: document.getElementById("find-replace-bar"),
  findInput: document.getElementById("find-input"),
  replaceInput: document.getElementById("replace-input"),
  insertOverlay: document.getElementById("insertOverlay"),
  linkOverlay: document.getElementById("linkOverlay"),
  linkDisplayText: document.getElementById("linkDisplayText"),
  linkUrlText: document.getElementById("linkUrlText"),
  insertModalTitle: document.getElementById("insertModalTitle"),
  insertLinkPane: document.getElementById("insertLinkPane"),
  insertImgPane: document.getElementById("insertImgPane"),
  insertLinkText: document.getElementById("insertLinkText"),
  insertLinkUrl: document.getElementById("insertLinkUrl"),
  insertImgAlt: document.getElementById("insertImgAlt"),
  insertImgUrl: document.getElementById("insertImgUrl"),
  insertImgDbSelect: document.getElementById("insertImgDbSelect"),
  insertImgLinkUrl: document.getElementById("insertImgLinkUrl"),
  insertImgFile: document.getElementById("insertImgFile"),
  insertImgPasteZone: document.getElementById("insertImgPasteZone"),
  styleOverlay: document.getElementById("styleOverlay"),
  styleFontSize: document.getElementById("styleFontSize"),
  styleTextColor: document.getElementById("styleTextColor"),
  styleBgColor: document.getElementById("styleBgColor"),
  styleBoldMode: document.getElementById("styleBoldMode"),
  styleItalicMode: document.getElementById("styleItalicMode"),
  quickFontSize: document.getElementById("quickFontSize"),
  quickTextColor: document.getElementById("quickTextColor"),
  quickHiliteColor: document.getElementById("quickHiliteColor"),
  objectEditModeBtn: document.getElementById("btnObjectEditMode"),
  textPreset: document.getElementById("textPreset"),
  inDbOverlay: document.getElementById("inDbOverlay"),
  inDbList: document.getElementById("inDbList"),
  slideSettingsOverlay: document.getElementById("slideSettingsOverlay"),
  slideSizeCurrent: document.getElementById("slideSizeCurrent"),
  slideSizePreset: document.getElementById("slideSizePreset"),
  slideSizeWidth: document.getElementById("slideSizeWidth"),
  slideSizeHeight: document.getElementById("slideSizeHeight")
};

const TEXTBOX_PRESETS = {
  basic: {
    bg: "rgba(255,255,255,0.92)",
    border: "#8ea0c8",
    color: "#1a2233",
    fontSize: 24,
    handleBg: "#e9eefc",
    handleBorder: "#9fb1da",
    handleColor: "#50638d"
  },
  note: {
    bg: "rgba(255,250,214,0.95)",
    border: "#d6b847",
    color: "#4a3b00",
    fontSize: 22,
    handleBg: "#fff3b8",
    handleBorder: "#d6b847",
    handleColor: "#7b6406"
  },
  accent: {
    bg: "rgba(236,245,255,0.95)",
    border: "#5b8def",
    color: "#14396b",
    fontSize: 24,
    handleBg: "#ddebff",
    handleBorder: "#9abcf6",
    handleColor: "#2b4f8f"
  },
  dark: {
    bg: "rgba(20,29,48,0.92)",
    border: "#4c5d86",
    color: "#f3f6ff",
    fontSize: 22,
    handleBg: "#2a3656",
    handleBorder: "#55658d",
    handleColor: "#d7e0f7"
  }
};

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function esc(s) { return String(s || "").replace(/[<>]/g, ""); }

function snapshotState() {
  return {
    slides: slides.map((s) => ({ html: String(s.html || "") })),
    cur,
    backup: String(backup || "")
  };
}

function pushHistory() {
  historyStack.push(snapshotState());
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
}

function undoHistory() {
  const prev = historyStack.pop();
  if (!prev) return false;
  slides = prev.slides.map((s) => ({ html: String(s.html || START_HTML) }));
  cur = clamp(Number(prev.cur) || 0, 0, slides.length - 1);
  backup = String(prev.backup || slides[cur].html || START_HTML);
  loadCurrent();
  return true;
}

function getWysDoc() {
  return els.wys.contentDocument || null;
}

function getWysHtml() {
  const d = getWysDoc();
  if (!d || !d.documentElement) return "";
  const cloned = d.documentElement.cloneNode(true);
  cloned.querySelectorAll('[data-jena-ui="1"], #jena-img-resize-ui').forEach((n) => n.remove());
  if (cloned.body) cloned.body.removeAttribute("contenteditable");
  const imgs = cloned.querySelectorAll("img[data-internal-src]");
  for (let i = 0; i < imgs.length; i++) {
    const internalSrc = String(imgs[i].getAttribute("data-internal-src") || "").trim();
    if (!internalSrc) continue;
    imgs[i].setAttribute("src", internalSrc);
    imgs[i].removeAttribute("data-internal-src");
  }
  return "<!DOCTYPE html>" + cloned.outerHTML;
}

function setCodeMarkerByIndex(index, shouldCenter) {
  const src = String(els.code.value || "");
  const i = clamp(Number(index) || 0, 0, Math.max(0, src.length - 1));
  const textBefore = src.slice(0, i);
  const line = textBefore.split("\n").length - 1;
  const styles = window.getComputedStyle(els.code);
  const lineHeight = parseFloat(styles.lineHeight) || 19.2;
  const padTop = parseFloat(styles.paddingTop) || 10;
  const top = padTop + line * lineHeight - els.code.scrollTop;
  els.codeMarker.style.top = `${Math.max(0, top)}px`;
  els.codeMarker.style.height = `${lineHeight}px`;
  els.codeMarker.style.display = "block";

  if (shouldCenter) {
    const target = Math.max(0, padTop + line * lineHeight - (els.code.clientHeight * 0.45));
    els.code.scrollTop = target;
  }
  syncCodeLineGutterScroll();
}

function getCodeIndexFromLine(lineNo) {
  const src = String(els.code.value || "");
  const lines = src.split("\n");
  const line = clamp(Number(lineNo) || 0, 0, Math.max(0, lines.length - 1));
  let idx = 0;
  for (let i = 0; i < line; i++) idx += lines[i].length + 1;
  return idx;
}

function hideCodeMarker() {
  els.codeMarker.style.display = "none";
}

function setCodeWrapMode(enabled) {
  codeWrapEnabled = !!enabled;
  if (els.codeWrap) els.codeWrap.classList.toggle("wrap-on", codeWrapEnabled);
  const b = document.getElementById("btnWrap");
  if (b) b.textContent = codeWrapEnabled ? "Wrap: On" : "Wrap: Off";
  renderCodeLineNumbers();
}

function toggleCodeWrapMode() {
  setCodeWrapMode(!codeWrapEnabled);
}

function syncCodeLineGutterScroll() {
  if (!els.codeLines) return;
  els.codeLines.scrollTop = els.code.scrollTop;
}

function syncCodeViewScroll() {
  if (!els.codeView) return;
  els.codeView.scrollTop = els.code.scrollTop;
  els.codeView.scrollLeft = els.code.scrollLeft;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCodeColorLayer() {
  if (!els.codeView) return;
  const src = String(els.code.value || "");
  const fallbackColor = (els.codeWrap && els.codeWrap.classList.contains("code-dark")) ? "#dce5f5" : "#1a2233";
  try {
    const out = [];
    const re = /<!--[\s\S]*?-->/g;
    let last = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push(escapeHtml(src.slice(last, m.index)));
      out.push(`<span class="code-comment">${escapeHtml(m[0])}</span>`);
      last = m.index + m[0].length;
    }
    out.push(escapeHtml(src.slice(last)));
    els.codeView.innerHTML = out.join("");
    if (src && !els.codeView.textContent) {
      els.code.style.color = fallbackColor;
      els.codeView.style.display = "none";
    } else {
      els.code.style.color = "transparent";
      els.codeView.style.display = "block";
    }
    syncCodeViewScroll();
  } catch (_) {
    els.code.style.color = fallbackColor;
    els.codeView.style.display = "none";
  }
}

function setAppThemeMode(isDark) {
  appDarkMode = !!isDark;
  document.body.classList.toggle("app-dark", appDarkMode);
  const b = document.getElementById("btnThemeMode");
  if (b) b.textContent = appDarkMode ? "Theme: Dark" : "Theme: Light";
  if (codeThemeFollowApp) {
    setCodeThemeMode(appDarkMode, true);
  }
}

function toggleAppThemeMode() {
  setAppThemeMode(!appDarkMode);
}

function setCodeThemeMode(isDark, fromAppSync) {
  codeDarkMode = !!isDark;
  if (!fromAppSync) codeThemeFollowApp = false;
  if (els.codeWrap) els.codeWrap.classList.toggle("code-dark", codeDarkMode);
  const b = document.getElementById("btnCodeTheme");
  if (b) {
    if (codeThemeFollowApp) {
      b.textContent = codeDarkMode ? "Code: Auto(Dark)" : "Code: Auto(Light)";
    } else {
      b.textContent = codeDarkMode ? "Code: Dark" : "Code: Light";
    }
  }
  renderCodeColorLayer();
}

function toggleCodeThemeMode() {
  // First click while auto-following breaks out to manual mode.
  if (codeThemeFollowApp) {
    codeThemeFollowApp = false;
    setCodeThemeMode(!appDarkMode, false);
    return;
  }
  setCodeThemeMode(!codeDarkMode, false);
}

function setCodeFontSize(px) {
  codeFontSize = clamp(parseInt(String(px || "12"), 10) || 12, 10, 36);
  if (els.codeWrap) els.codeWrap.style.setProperty("--code-font-size", `${codeFontSize}px`);
  const view = document.getElementById("codeFontView");
  if (view) view.textContent = `${codeFontSize}px`;
  renderCodeLineNumbers();
}

function renderCodeLineNumbers() {
  if (!els.codeLines) return;
  const src = String(els.code.value || "");
  const lines = Math.max(1, src.split("\n").length);
  const nums = new Array(lines);
  for (let i = 0; i < lines; i++) nums[i] = String(i + 1);
  els.codeLines.textContent = nums.join("\n");
  syncCodeLineGutterScroll();
  renderCodeColorLayer();
}

function getWysSelectionAnchor() {
  const d = getWysDoc();
  if (!d) return null;
  const sel = d.getSelection ? d.getSelection() : null;
  if (!sel || sel.rangeCount < 1) return null;
  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  if (!node) return null;
  if (node.nodeType === 3 && node.parentElement) node = node.parentElement;
  if (!node || !node.tagName) return null;

  const tag = String(node.tagName || "").toLowerCase();
  const text = (node.textContent || "").replace(/\s+/g, " ").trim();
  const textHint = text ? text.slice(0, 48) : "";
  return { tag, textHint };
}

function getWordAtCaret(range) {
  if (!range) return "";
  let node = range.startContainer;
  let offset = Number(range.startOffset) || 0;
  if (!node) return "";

  if (node.nodeType !== 3) {
    const kids = node.childNodes || [];
    let probe = null;
    if (kids.length > 0) {
      const at = Math.max(0, Math.min(offset - 1, kids.length - 1));
      probe = kids[at] || kids[0];
    }
    if (!probe || probe.nodeType !== 3) return "";
    node = probe;
    offset = String(node.textContent || "").length;
  }

  const text = String(node.textContent || "");
  const isWord = (ch) => /[^\s<>{}"'`=]/.test(ch || "");
  let s = Math.max(0, Math.min(offset, text.length));
  let e = s;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  const word = text.slice(s, e).trim();
  return word.length >= 2 ? word : "";
}

function getWysTextCandidates() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return [];
  const sel = d.getSelection();
  if (!sel || sel.rangeCount < 1) return [];

  const range = sel.getRangeAt(0);
  const out = [];
  const seen = new Set();
  const add = (v) => {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    if (!s || s.length < 2 || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  const selectedText = String(sel.toString() || "").trim();
  if (selectedText) add(selectedText);

  let node = range.startContainer;
  if (node && node.nodeType === 3 && node.parentElement) node = node.parentElement;
  const caretWord = getWordAtCaret(range);
  if (caretWord) add(caretWord);

  const base = String(sel.toString() || (node && node.textContent) || "");
  const words = base.match(/[^\s<>{}"'`=]{2,}/g) || [];
  for (let i = 0; i < words.length && i < 4; i++) add(words[i]);
  return out;
}

function findCodeLineByCandidates(candidates) {
  const src = String(els.code.value || "");
  if (!src) return null;
  const lines = src.split("\n");
  const cands = (Array.isArray(candidates) ? candidates : [])
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 2);
  if (!cands.length) return null;

  let best = null;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const clean = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    for (let ci = 0; ci < cands.length; ci++) {
      const c = cands[ci];
      let hit = raw.indexOf(c);
      if (hit < 0) hit = clean.indexOf(c);
      if (hit >= 0) {
        const score = (ci * 100000) + li;
        if (!best || score < best.score) best = { line: li, indexInLine: hit, score };
      }
    }
  }
  return best;
}

function findCodeIndexByAnchor(anchor) {
  const src = String(els.code.value || "");
  if (!src) return 0;
  if (!anchor) return lastCodeIndex || 0;

  const near = clamp(lastCodeIndex || 0, 0, src.length);
  const tagHint = `<${anchor.tag}`;

  if (anchor.textHint) {
    const textPos = src.indexOf(anchor.textHint, near);
    if (textPos >= 0) return textPos;
    const textPos2 = src.indexOf(anchor.textHint);
    if (textPos2 >= 0) return textPos2;
  }

  const tagPos = src.indexOf(tagHint, near);
  if (tagPos >= 0) return tagPos;
  const tagPos2 = src.indexOf(tagHint);
  if (tagPos2 >= 0) return tagPos2;

  return near;
}

function syncCodeMarkerFromWys(shouldCenter) {
  const anchor = getWysSelectionAnchor();
  const candidates = getWysTextCandidates();
  if (!anchor && !candidates.length) {
    hideCodeMarker();
    return;
  }
  const candSig = candidates.slice(0, 2).join("|");
  const sig = `${anchor ? anchor.tag : ""}|${anchor ? anchor.textHint : ""}|${candSig}`;
  if (sig === lastCodeMark && !shouldCenter) return;
  lastCodeMark = sig;
  const lineMatch = findCodeLineByCandidates(candidates);
  if (lineMatch && lineMatch.line >= 0) {
    const index = getCodeIndexFromLine(lineMatch.line) + Math.max(0, Number(lineMatch.indexInLine) || 0);
    lastCodeIndex = index;
    setCodeMarkerByIndex(index, shouldCenter);
    return;
  }
  const index = findCodeIndexByAnchor(anchor);
  lastCodeIndex = index;
  setCodeMarkerByIndex(index, shouldCenter);
}

function scheduleCodeMarkerSync(shouldCenter) {
  clearTimeout(codeMarkerTimer);
  codeMarkerTimer = setTimeout(() => syncCodeMarkerFromWys(shouldCenter), 60);
}

function persistCurrent(html) {
  const next = String(html || "");
  if (!slides[cur]) return;
  slides[cur].html = next;
  clearTimeout(autoSidebarTimer);
  autoSidebarTimer = setTimeout(() => {
    renderSidebar();
  }, 180);
}

function scheduleAutoSave(html) {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    persistCurrent(html);
  }, 120);
}

function applyWysObjectChange(nextHtml, recordHistory) {
  const next = String(nextHtml || "");
  const prev = String(els.code.value || "");
  if (next === prev) return false;

  clearTimeout(autoSaveTimer);
  persistCurrent(prev);
  if (recordHistory !== false) pushHistory();

  els.code.value = next;
  renderCodeLineNumbers();
  scheduleAutoSave(next);
  return true;
}

function setWysLayerSelection(doc, el) {
  if (!doc) return;
  let next = el || null;
  if (next && next.closest) {
    const tb = next.closest(".jena-textbox");
    if (tb) next = tb;
  }
  if (next && next.nodeType === 1 && String(next.tagName || "").toLowerCase() === "img") {
    // keep img itself
  }
  const prev = doc.__jenaLayerSelected || null;
  if (prev && prev.classList) prev.classList.remove("jena-layer-selected");
  if (!next || !doc.body || !doc.body.contains(next)) {
    doc.__jenaLayerSelected = null;
    return;
  }
  doc.__jenaLayerSelected = next;
  if (next.classList) next.classList.add("jena-layer-selected");
}

function changeSelectedLayerOrder(step) {
  const d = getWysDoc();
  if (!d || !d.defaultView) return;
  let el = d.__jenaLayerSelected || null;
  if (el && el.closest) {
    const tb = el.closest(".jena-textbox");
    if (tb) el = tb;
  }
  if (!el || !d.body || !d.body.contains(el)) return;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return;

  const cs = d.defaultView.getComputedStyle(el);
  if (cs && String(cs.position || "static") === "static") {
    el.style.position = "relative";
  }

  const parent = el.parentElement || d.body;
  const siblings = Array.from(parent.children || []).filter((n) => {
    if (!n || n === el) return false;
    if (n.getAttribute && String(n.getAttribute("data-jena-ui") || "") === "1") return false;
    return true;
  });
  const zVals = siblings.map((n) => {
    const ncs = d.defaultView.getComputedStyle(n);
    const nz = parseInt(String((ncs && ncs.zIndex) || ""), 10);
    return Number.isFinite(nz) ? nz : 0;
  });
  const maxZ = zVals.length ? Math.max.apply(null, zVals) : 0;
  const minZ = zVals.length ? Math.min.apply(null, zVals) : 0;

  let curZ = parseInt(String(el.style.zIndex || ""), 10);
  if (!Number.isFinite(curZ)) curZ = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(curZ)) curZ = 0;

  // one click should visibly work: move to front/back among siblings
  const nextZ = step > 0 ? Math.max(curZ + 1, maxZ + 1) : Math.min(curZ - 1, minZ - 1);
  el.style.zIndex = String(clamp(nextZ, -2147483000, 2147483000));

  const html = getWysHtml();
  applyWysObjectChange(html, true);
}

function bindImageResizeEditor(doc) {
  if (!doc || doc.__jenaImgResizeBound) return;
  doc.__jenaImgResizeBound = true;
  let enabled = !!objectEditMode;

  const ui = doc.createElement("div");
  ui.id = "jena-img-resize-ui";
  ui.setAttribute("data-jena-ui", "1");
  ui.style.cssText = "position:absolute;display:none;border:2px solid #2f66d2;z-index:2147483647;pointer-events:none;box-sizing:border-box;";
  doc.body.appendChild(ui);
  const applyBtn = doc.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Apply";
  applyBtn.setAttribute("data-jena-ui", "1");
  applyBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #2f66d2;background:#2f66d2;color:#fff;border-radius:6px;padding:4px 10px;font:600 12px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(applyBtn);

  const unit = (v) => (typeof v === "number" ? `${v}px` : String(v));

  function mkHandle(cursor, right, bottom, width, height) {
    const h = doc.createElement("div");
    h.style.cssText = [
      "position:absolute",
      `right:${unit(right)}`,
      `bottom:${unit(bottom)}`,
      `width:${unit(width)}`,
      `height:${unit(height)}`,
      "background:#2f66d2",
      "border:1px solid #fff",
      "border-radius:2px",
      `cursor:${cursor}`,
      "pointer-events:auto"
    ].join(";");
    ui.appendChild(h);
    return h;
  }

  const hX = mkHandle("ew-resize", -6, "calc(50% - 4px)", 10, 10);
  const hY = mkHandle("ns-resize", "calc(50% - 4px)", -6, 10, 10);
  const hXY = mkHandle("nwse-resize", -7, -7, 12, 12);

  let activeImg = null;
  let mode = "";
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sh = 0;
  let sl = 0;
  let st = 0;
  let hasPendingResize = false;

  function syncApplyButton() {
    if (!activeImg || !hasPendingResize) {
      applyBtn.style.display = "none";
      return;
    }
    const r = activeImg.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    applyBtn.style.left = `${r.left + dx}px`;
    applyBtn.style.top = `${r.bottom + dy + 8}px`;
    applyBtn.style.display = "inline-block";
  }

  function syncBox() {
    if (!activeImg) return;
    const r = activeImg.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    ui.style.left = `${r.left + dx}px`;
    ui.style.top = `${r.top + dy}px`;
    ui.style.width = `${r.width}px`;
    ui.style.height = `${r.height}px`;
    syncApplyButton();
  }

  function showFor(img) {
    activeImg = img;
    setWysLayerSelection(doc, img);
    const w = Math.max(1, img.offsetWidth || img.width || 1);
    const h = Math.max(1, img.offsetHeight || img.height || 1);
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.maxWidth = "none";
    img.style.cursor = "move";
    ui.style.display = "block";
    hasPendingResize = false;
    applyBtn.style.display = "none";
    syncBox();
  }

  function hide() {
    setWysLayerSelection(doc, null);
    activeImg = null;
    mode = "";
    hasPendingResize = false;
    ui.style.display = "none";
    applyBtn.style.display = "none";
  }

  function startResize(e, nextMode) {
    if (!enabled) return;
    if (!activeImg) return;
    e.preventDefault();
    e.stopPropagation();
    mode = nextMode;
    sx = e.clientX;
    sy = e.clientY;
    sw = activeImg.offsetWidth || 1;
    sh = activeImg.offsetHeight || 1;
  }

  function startMove(e) {
    if (!enabled) return;
    if (!activeImg) return;
    e.preventDefault();
    e.stopPropagation();
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;

    // Ensure move coordinates are persisted in style for HTML sync.
    if (activeImg.style.position !== "absolute") {
      const left = activeImg.offsetLeft || 0;
      const top = activeImg.offsetTop || 0;
      activeImg.style.position = "absolute";
      activeImg.style.left = `${left}px`;
      activeImg.style.top = `${top}px`;
      activeImg.style.float = "none";
      activeImg.style.margin = "0";
    }
    sl = parseFloat(activeImg.style.left) || 0;
    st = parseFloat(activeImg.style.top) || 0;
  }

  function onMove(e) {
    if (!enabled) return;
    if (!activeImg || !mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "move") {
      activeImg.style.left = `${Math.round(sl + dx)}px`;
      activeImg.style.top = `${Math.round(st + dy)}px`;
      hasPendingResize = true;
      syncBox();
      return;
    }
    const w = Math.max(16, sw + ((mode === "x" || mode === "xy") ? dx : 0));
    const h = Math.max(16, sh + ((mode === "y" || mode === "xy") ? dy : 0));
    if (mode === "x") {
      activeImg.style.width = `${w}px`;
    } else if (mode === "y") {
      activeImg.style.height = `${h}px`;
    } else {
      activeImg.style.width = `${w}px`;
      activeImg.style.height = `${h}px`;
    }
    hasPendingResize = true;
    syncBox();
  }

  function onUp() {
    if (!enabled) return;
    if (!mode) return;
    mode = "";
    syncApplyButton();
  }

  hX.addEventListener("mousedown", (e) => startResize(e, "x"));
  hY.addEventListener("mousedown", (e) => startResize(e, "y"));
  hXY.addEventListener("mousedown", (e) => startResize(e, "xy"));
  applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeImg || !hasPendingResize) return;
    const html = getWysHtml();
    applyWysObjectChange(html, true);
    hasPendingResize = false;
    syncApplyButton();
  });
  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("mousedown", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t || !t.tagName) return;
    if (String(t.tagName).toLowerCase() !== "img") return;
    showFor(t);
    if (e.button !== 0) return;
    startMove(e);
  }, true);
  doc.addEventListener("scroll", () => { if (activeImg) syncBox(); }, true);
  doc.defaultView.addEventListener("resize", () => { if (activeImg) syncBox(); });

  doc.addEventListener("click", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (t && t.tagName && String(t.tagName).toLowerCase() === "img") {
      showFor(t);
      return;
    }
    if (t === applyBtn || applyBtn.contains(t)) return;
    if (!ui.contains(t)) hide();
  }, true);

  doc.__jenaImageEditor = {
    setEnabled(next) {
      enabled = !!next;
      if (!enabled) hide();
    }
  };
}

function bindContainerObjectEditor(doc) {
  if (!doc || doc.__jenaContainerEditBound) return;
  doc.__jenaContainerEditBound = true;
  let enabled = !!objectEditMode;

  const ui = doc.createElement("div");
  ui.id = "jena-obj-resize-ui";
  ui.setAttribute("data-jena-ui", "1");
  ui.style.cssText = "position:absolute;display:none;border:2px dashed #18a0fb;z-index:2147483646;pointer-events:none;box-sizing:border-box;";
  doc.body.appendChild(ui);

  const unit = (v) => (typeof v === "number" ? `${v}px` : String(v));
  function mkHandle(cursor, right, bottom, size) {
    const h = doc.createElement("div");
    h.style.cssText = [
      "position:absolute",
      `right:${unit(right)}`,
      `bottom:${unit(bottom)}`,
      `width:${unit(size)}`,
      `height:${unit(size)}`,
      "border:1px solid #fff",
      "background:#18a0fb",
      "border-radius:2px",
      `cursor:${cursor}`,
      "pointer-events:auto"
    ].join(";");
    ui.appendChild(h);
    return h;
  }

  const hMove = doc.createElement("div");
  hMove.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "transform:translate(-50%,-50%)",
    "min-width:56px",
    "height:18px",
    "padding:0 8px",
    "border-radius:10px",
    "background:#18a0fb",
    "color:#fff",
    "font:700 10px/18px 'Segoe UI',sans-serif",
    "text-align:center",
    "cursor:move",
    "pointer-events:auto",
    "user-select:none",
    "box-shadow:0 2px 8px rgba(0,0,0,.18)"
  ].join(";");
  hMove.textContent = "MOVE";
  ui.appendChild(hMove);

  const hX = mkHandle("ew-resize", -6, "calc(50% - 4px)", 10);
  const hY = mkHandle("ns-resize", "calc(50% - 4px)", -6, 10);
  const hXY = mkHandle("nwse-resize", -7, -7, 12);

  const applyBtn = doc.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Apply";
  applyBtn.setAttribute("data-jena-ui", "1");
  applyBtn.style.cssText = "position:absolute;display:none;z-index:2147483647;border:1px solid #18a0fb;background:#18a0fb;color:#fff;border-radius:6px;padding:4px 10px;font:600 12px/1.2 'Segoe UI',sans-serif;cursor:pointer;";
  doc.body.appendChild(applyBtn);

  let activeEl = null;
  let mode = "";
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sh = 0;
  let sl = 0;
  let st = 0;
  let moveNeedsAbs = false;
  let hasPending = false;
  let textEditMode = false;

  function syncApplyButton() {
    if (!activeEl || !hasPending) {
      applyBtn.style.display = "none";
      return;
    }
    const r = activeEl.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    applyBtn.style.left = `${r.left + dx}px`;
    applyBtn.style.top = `${r.bottom + dy + 8}px`;
    applyBtn.style.display = "inline-block";
  }

  function syncBox() {
    if (!activeEl) return;
    const r = activeEl.getBoundingClientRect();
    const dx = doc.defaultView.pageXOffset || 0;
    const dy = doc.defaultView.pageYOffset || 0;
    ui.style.left = `${r.left + dx}px`;
    ui.style.top = `${r.top + dy}px`;
    ui.style.width = `${r.width}px`;
    ui.style.height = `${r.height}px`;
    syncApplyButton();
  }

  function toAbsolute(el) {
    if (!el) return;
    const cs = doc.defaultView.getComputedStyle(el);
    if (cs && cs.position === "absolute") return;
    const r = el.getBoundingClientRect();
    const vx = doc.defaultView.pageXOffset || 0;
    const vy = doc.defaultView.pageYOffset || 0;
    el.style.position = "absolute";
    el.style.left = `${Math.round(r.left + vx)}px`;
    el.style.top = `${Math.round(r.top + vy)}px`;
    el.style.width = `${Math.max(16, Math.round(r.width))}px`;
    el.style.height = `${Math.max(16, Math.round(r.height))}px`;
    el.style.margin = "0";
  }

  function isBlockedTarget(el) {
    if (!el || !el.tagName) return true;
    const tag = String(el.tagName).toLowerCase();
    if (tag === "html" || tag === "body" || tag === "script" || tag === "style" || tag === "img") return true;
    if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return true;
    if (el.closest && el.closest("#jena-img-resize-ui, #jena-obj-resize-ui, .jena-textbox")) return true;
    return false;
  }

  function isContainerLike(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toLowerCase();
    if (["div", "section", "article", "aside", "header", "footer", "main", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote"].includes(tag)) return true;
    const cs = doc.defaultView.getComputedStyle(el);
    const disp = String((cs && cs.display) || "");
    return disp.includes("block") || disp.includes("flex") || disp.includes("grid") || disp.includes("table");
  }

  function findSelectable(target) {
    if (target && target.closest && target.closest(".jena-textbox")) return target.closest(".jena-textbox");
    let cur = target;
    while (cur && cur !== doc.body) {
      if (!isBlockedTarget(cur) && isContainerLike(cur)) {
        const r = cur.getBoundingClientRect();
        if (r.width >= 20 && r.height >= 20) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function focusFirstTextNode(el) {
    if (!el || !doc.getSelection) return;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let n = walker.nextNode();
    while (n) {
      const txt = String(n.nodeValue || "");
      if (txt.trim().length > 0) {
        try {
          const sel = doc.getSelection();
          if (!sel) return;
          const r = doc.createRange();
          const pos = Math.min(1, txt.length);
          r.setStart(n, pos);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return;
        } catch (_) {
          return;
        }
      }
      n = walker.nextNode();
    }
  }

  function showFor(el) {
    activeEl = el;
    setWysLayerSelection(doc, el);
    ui.style.display = "block";
    hasPending = false;
    textEditMode = false;
    syncBox();
  }

  function hide() {
    activeEl = null;
    mode = "";
    hasPending = false;
    textEditMode = false;
    ui.style.display = "none";
    applyBtn.style.display = "none";
  }

  function startResize(e, nextMode) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    toAbsolute(activeEl);
    mode = nextMode;
    sx = e.clientX;
    sy = e.clientY;
    sw = activeEl.offsetWidth || 1;
    sh = activeEl.offsetHeight || 1;
    sl = parseFloat(activeEl.style.left) || 0;
    st = parseFloat(activeEl.style.top) || 0;
  }

  function startMove(e) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    toAbsolute(activeEl);
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;
    sl = parseFloat(activeEl.style.left) || 0;
    st = parseFloat(activeEl.style.top) || 0;
    moveNeedsAbs = false;
  }

  function startMoveLazy(e) {
    if (!enabled) return;
    if (!activeEl) return;
    e.preventDefault();
    e.stopPropagation();
    mode = "move";
    sx = e.clientX;
    sy = e.clientY;
    const cs = doc.defaultView.getComputedStyle(activeEl);
    if (cs && cs.position !== "absolute") {
      const r = activeEl.getBoundingClientRect();
      const vx = doc.defaultView.pageXOffset || 0;
      const vy = doc.defaultView.pageYOffset || 0;
      sl = Math.round(r.left + vx);
      st = Math.round(r.top + vy);
      sw = Math.max(16, Math.round(r.width));
      sh = Math.max(16, Math.round(r.height));
      moveNeedsAbs = true;
    } else {
      sl = parseFloat(activeEl.style.left) || 0;
      st = parseFloat(activeEl.style.top) || 0;
      moveNeedsAbs = false;
    }
  }

  function onMove(e) {
    if (!enabled) return;
    if (!activeEl || !mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "move") {
      if (moveNeedsAbs) {
        activeEl.style.position = "absolute";
        activeEl.style.left = `${sl}px`;
        activeEl.style.top = `${st}px`;
        activeEl.style.width = `${sw}px`;
        activeEl.style.height = `${sh}px`;
        activeEl.style.margin = "0";
        moveNeedsAbs = false;
      }
      activeEl.style.left = `${Math.round(sl + dx)}px`;
      activeEl.style.top = `${Math.round(st + dy)}px`;
    } else if (mode === "x") {
      activeEl.style.width = `${Math.max(20, sw + dx)}px`;
    } else if (mode === "y") {
      activeEl.style.height = `${Math.max(20, sh + dy)}px`;
    } else {
      activeEl.style.width = `${Math.max(20, sw + dx)}px`;
      activeEl.style.height = `${Math.max(20, sh + dy)}px`;
    }
    hasPending = true;
    syncBox();
  }

  function onUp() {
    if (!enabled) return;
    if (!mode) return;
    mode = "";
    syncApplyButton();
  }

  hMove.addEventListener("mousedown", startMove, true);
  hX.addEventListener("mousedown", (e) => startResize(e, "x"), true);
  hY.addEventListener("mousedown", (e) => startResize(e, "y"), true);
  hXY.addEventListener("mousedown", (e) => startResize(e, "xy"), true);

  applyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeEl || !hasPending) return;
    const html = getWysHtml();
    applyWysObjectChange(html, true);
    hasPending = false;
    syncApplyButton();
  });

  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseup", onUp, true);
  doc.addEventListener("scroll", () => { if (activeEl) syncBox(); }, true);
  doc.defaultView.addEventListener("resize", () => { if (activeEl) syncBox(); });

  doc.addEventListener("mousedown", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t) return;
    if (t.tagName && String(t.tagName).toLowerCase() === "img") return; // image editor handles img
    if (t === applyBtn || applyBtn.contains(t) || ui.contains(t)) return;
    const box = findSelectable(t);
    if (box) {
      showFor(box);
      // In text edit mode, allow native caret/text input behavior.
      if (textEditMode && activeEl === box) return;
      // single click: select object only (no text caret edit)
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 0) startMoveLazy(e);
      return;
    }
    hide();
  }, true);

  // double click: enter text edit mode inside selected container
  doc.addEventListener("dblclick", (e) => {
    if (!enabled) return;
    const t = e.target;
    if (!t) return;
    if (t.tagName && String(t.tagName).toLowerCase() === "img") return;
    const box = findSelectable(t);
    if (!box) return;
    showFor(box);
    textEditMode = true;
    if (box.setAttribute) box.setAttribute("contenteditable", "true");
    focusFirstTextNode(box);
  }, true);

  doc.__jenaContainerEditor = {
    setEnabled(next) {
      enabled = !!next;
      if (!enabled) hide();
    }
  };
}

function bindTextBoxEditor(doc) {
  if (!doc || doc.__jenaTextBoxBound) return;
  doc.__jenaTextBoxBound = true;

  let dragBox = null;
  let dragBeforeHtml = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;

  function getTextBoxContentText(box) {
    const content = box && box.querySelector ? box.querySelector(".jena-textbox-content") : null;
    if (!content) return "";
    const t = String(content.textContent || "").replace(/\u200B/g, "").trim();
    return t;
  }

  function applyTextBoxVisualState(box) {
    if (!box) return;
    const handle = box.querySelector(".jena-textbox-handle");
    const filled = getTextBoxContentText(box).length > 0;
    const borderColor = box.dataset.tbBorder || "#8ea0c8";
    const handleBg = box.dataset.tbHandleBg || "#e9eefc";
    const handleBorder = box.dataset.tbHandleBorder || "#9fb1da";
    const handleColor = box.dataset.tbHandleColor || "#50638d";

    if (filled) {
      box.style.borderColor = "transparent";
      if (handle) {
        handle.style.color = "transparent";
        handle.style.background = "transparent";
        handle.style.borderBottomColor = "transparent";
      }
    } else {
      box.style.borderColor = borderColor;
      if (handle) {
        handle.style.color = handleColor;
        handle.style.background = handleBg;
        handle.style.borderBottomColor = handleBorder;
      }
    }
  }

  doc.addEventListener("mousedown", (e) => {
    const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
    if (!handle) return;
    const box = handle.parentElement;
    if (!box) return;
    setWysLayerSelection(doc, box);
    e.preventDefault();
    e.stopPropagation();
    dragBox = box;
    dragBeforeHtml = String(els.code.value || "");
    sx = e.clientX;
    sy = e.clientY;
    sl = parseFloat(dragBox.style.left) || 0;
    st = parseFloat(dragBox.style.top) || 0;
  }, true);

  // Ensure text input always works when clicking the textbox area.
  doc.addEventListener("mousedown", (e) => {
    const box = e.target && e.target.closest ? e.target.closest(".jena-textbox") : null;
    if (!box) return;
    setWysLayerSelection(doc, box);
    const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
    if (handle) return;
    const content = box.querySelector(".jena-textbox-content");
    if (!content) return;
    setTimeout(() => {
      try { content.focus(); } catch (_) {}
    }, 0);
  }, true);

  doc.addEventListener("mousemove", (e) => {
    if (!dragBox) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    dragBox.style.left = `${Math.round(sl + dx)}px`;
    dragBox.style.top = `${Math.round(st + dy)}px`;
  }, true);

  doc.addEventListener("mouseup", () => {
    if (!dragBox) return;
    dragBox = null;
    const after = getWysHtml();
    if (after !== dragBeforeHtml) {
      applyWysObjectChange(after, true);
    }
    dragBeforeHtml = "";
  }, true);

  doc.addEventListener("input", (e) => {
    const content = e.target && e.target.closest ? e.target.closest(".jena-textbox-content") : null;
    if (!content) return;
    const box = content.closest(".jena-textbox");
    applyTextBoxVisualState(box);
    scheduleAutoSave(getWysHtml());
  }, true);

  doc.addEventListener("click", (e) => {
    const box = e.target && e.target.closest ? e.target.closest(".jena-textbox") : null;
    setWysLayerSelection(doc, box || null);
    const all = doc.querySelectorAll(".jena-textbox");
    for (let i = 0; i < all.length; i++) {
      all[i].style.borderColor = (all[i] === box) ? "#4f46e5" : "#8ea0c8";
    }
    if (box) {
      const handle = e.target && e.target.closest ? e.target.closest(".jena-textbox-handle") : null;
      const content = box.querySelector(".jena-textbox-content");
      if (content && !handle) {
        content.focus();
      }
      applyTextBoxVisualState(box);
    }
  }, true);

  const all = doc.querySelectorAll(".jena-textbox");
  for (let i = 0; i < all.length; i++) applyTextBoxVisualState(all[i]);
}

function insertTextBox() {
  saveWysSelectionRange();
  const key = String((els.textPreset && els.textPreset.value) || "basic");
  const p = TEXTBOX_PRESETS[key] || TEXTBOX_PRESETS.basic;
  const html = [
    `<div class="jena-textbox" data-tb-border="${sanitizeText(p.border)}" data-tb-handle-bg="${sanitizeText(p.handleBg)}" data-tb-handle-border="${sanitizeText(p.handleBorder)}" data-tb-handle-color="${sanitizeText(p.handleColor)}" contenteditable="false" style="position:absolute;left:120px;top:120px;width:320px;min-height:140px;padding:28px 12px 12px;border:2px dashed ${p.border};background:${p.bg};color:${p.color};font-size:${p.fontSize}px;line-height:1.35;resize:both;overflow:auto;z-index:30;">`,
    `<div class="jena-textbox-handle" contenteditable="false" style="position:absolute;left:0;top:0;right:0;height:22px;background:${p.handleBg};border-bottom:1px dashed ${p.handleBorder};cursor:move;font-size:11px;color:${p.handleColor};padding:3px 8px;user-select:none;">TEXT BOX</div>`,
    '<div class="jena-textbox-content" contenteditable="true" tabindex="0" style="min-height:80px;outline:none;cursor:text;"><br></div>',
    '</div>'
  ].join("");
  insertHtmlIntoWys(html);
}

function clearEnteredText() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return;
  const sel = d.getSelection();
  let changed = false;

  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (!r.collapsed) {
      r.deleteContents();
      changed = true;
    }
  }

  if (!changed) {
    const active = d.activeElement;
    const box = active && active.closest ? active.closest(".jena-textbox-content") : null;
    if (box) {
      box.innerHTML = "<br>";
      changed = true;
    }
  }

  if (!changed) return;
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
}

function revokeWysObjectUrls() {
  for (let i = 0; i < activeWysObjectUrls.length; i++) {
    try { URL.revokeObjectURL(activeWysObjectUrls[i]); } catch (_) {}
  }
  activeWysObjectUrls = [];
}

async function hydrateInternalImagesInWys(doc) {
  if (!doc) return;
  const imgs = Array.from(doc.querySelectorAll('img[src^="internal://"]'));
  if (!imgs.length) return;

  let db = null;
  try {
    db = await openAppDb();
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const raw = String(img.getAttribute("src") || "").trim();
      const id = decodeInternalId(raw.replace(/^internal:\/\//i, ""));
      if (!id) continue;
      const rec = await getImageRecord(db, id);
      if (!rec || !rec.blob) continue;
      const objectUrl = URL.createObjectURL(rec.blob);
      activeWysObjectUrls.push(objectUrl);
      img.setAttribute("data-internal-src", raw);
      img.setAttribute("src", objectUrl);
    }
  } catch (_) {
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

function loadWys(html) {
  const src = String(html || START_HTML);
  if (src === lastLoadedWysHtml) return;
  lastLoadedWysHtml = src;
  revokeWysObjectUrls();
  els.wys.onload = () => {
    const d = getWysDoc();
    if (!d) return;
    const markerStyle = d.createElement("style");
    markerStyle.setAttribute("data-jena-ui", "1");
    markerStyle.textContent = ".jena-layer-selected{outline:2px dashed rgba(79,70,229,.65);outline-offset:2px;}";
    if (d.head) d.head.appendChild(markerStyle);
    try { d.designMode = "on"; } catch (_) {}
    if (d.body) d.body.setAttribute("contenteditable", "true");
    bindImageResizeEditor(d);
    bindContainerObjectEditor(d);
    bindTextBoxEditor(d);
    hydrateInternalImagesInWys(d).catch(() => {});
    d.addEventListener("mouseup", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("keyup", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("click", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("selectionchange", () => scheduleCodeMarkerSync(false), true);
    d.addEventListener("mouseup", saveWysSelectionRange, true);
    d.addEventListener("keyup", saveWysSelectionRange, true);
    d.addEventListener("selectionchange", saveWysSelectionRange, true);
    d.addEventListener("input", () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        const html = getWysHtml();
        els.code.value = html;
        renderCodeLineNumbers();
        scheduleAutoSave(html);
        scheduleCodeMarkerSync(false);
      }, 120);
    }, true);
    scheduleCodeMarkerSync(true);
  };
  els.wys.srcdoc = src;
}

function applyZoom() {
  const w = Math.round(slideWidth * zoom);
  const h = Math.round(slideHeight * zoom);
  els.stage.style.width = w + "px";
  els.stage.style.height = h + "px";
  els.wys.style.width = `${slideWidth}px`;
  els.wys.style.height = `${slideHeight}px`;
  els.wys.style.transform = `scale(${zoom})`;
  els.zoomView.textContent = Math.round(zoom * 100) + "%";
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
  const html = String(slides[cur]?.html || START_HTML);
  const formatted = formatHtml(html);
  els.code.value = formatted;
  renderCodeLineNumbers();
  backup = formatted;
  els.slideInfo.textContent = `${cur + 1} / ${slides.length}`;
  renderSidebar();
  loadWys(formatted);
  hideCodeMarker();
  applyZoom();
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

function wrapTag(tag) {
  const ta = els.code;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  const snip = `<${tag}>${sel}</${tag}>`;
  ta.value = ta.value.slice(0, s) + snip + ta.value.slice(e);
  ta.selectionStart = s + tag.length + 2;
  ta.selectionEnd = ta.selectionStart + sel.length;
  ta.focus();
}

function formatHtml(src) {
  const parts = String(src || "").split(/(<[^>]+>)/g);
  let out = "";
  let indent = 0;
  for (const p of parts) {
    if (!p || !p.trim()) continue;
    const t = p.trim();
    if (/^<\//.test(t)) indent = Math.max(0, indent - 1);
    out += "  ".repeat(indent) + t + "\n";
    if (/^<[^!/][^>]*[^/]>$/.test(t) && !/^<(br|hr|img|input|meta|link)/i.test(t)) indent++;
  }
  return out;
}

function getCodeSelectedText() {
  const s = Number(els.code.selectionStart) || 0;
  const e = Number(els.code.selectionEnd) || 0;
  if (e <= s) return "";
  return String(els.code.value || "").slice(s, e);
}

function applyCodeText(next, selStart, selEnd) {
  els.code.value = String(next || "");
  renderCodeLineNumbers();
  const max = els.code.value.length;
  const s = Math.max(0, Math.min(Number(selStart) || 0, max));
  const e = Math.max(0, Math.min(Number(selEnd) || s, max));
  els.code.focus();
  els.code.setSelectionRange(s, e);
  scheduleAutoSave(els.code.value);
  hideCodeMarker();
  clearTimeout(codeToWysTimer);
  codeToWysTimer = setTimeout(() => loadWys(els.code.value), 60);
}

function openFindReplace() {
  if (!els.findBar) return;
  els.findBar.classList.remove("hidden");
  const selected = getCodeSelectedText().trim();
  if (selected && els.findInput) els.findInput.value = selected;
  if (els.findInput) {
    els.findInput.focus();
    els.findInput.select();
  }
  lastFindIndex = -1;
}

function closeFindReplace() {
  if (!els.findBar) return;
  els.findBar.classList.add("hidden");
  els.code.focus();
}

function findNextInCode() {
  const term = String((els.findInput && els.findInput.value) || "").trim();
  if (!term) return;
  const text = String(els.code.value || "");
  const lowText = text.toLowerCase();
  const lowTerm = term.toLowerCase();
  let idx = lowText.indexOf(lowTerm, Math.max(0, (Number(els.code.selectionEnd) || 0)));
  if (idx < 0) idx = lowText.indexOf(lowTerm, 0);
  if (idx < 0) return;
  lastFindIndex = idx;
  els.code.focus();
  els.code.setSelectionRange(idx, idx + term.length);
  setCodeMarkerByIndex(idx, true);
}

function findPrevInCode() {
  const term = String((els.findInput && els.findInput.value) || "").trim();
  if (!term) return;
  const text = String(els.code.value || "");
  const lowText = text.toLowerCase();
  const lowTerm = term.toLowerCase();
  const from = Math.max(0, (Number(els.code.selectionStart) || 0) - 1);
  let idx = lowText.lastIndexOf(lowTerm, from);
  if (idx < 0) idx = lowText.lastIndexOf(lowTerm);
  if (idx < 0) return;
  lastFindIndex = idx;
  els.code.focus();
  els.code.setSelectionRange(idx, idx + term.length);
  setCodeMarkerByIndex(idx, true);
}

function replaceCurrentInCode() {
  const term = String((els.findInput && els.findInput.value) || "").trim();
  const replacement = String((els.replaceInput && els.replaceInput.value) || "");
  if (!term) return;
  const text = String(els.code.value || "");
  const s = Number(els.code.selectionStart) || 0;
  const e = Number(els.code.selectionEnd) || 0;
  const selected = text.slice(s, e);
  if (selected.toLowerCase() !== term.toLowerCase()) {
    findNextInCode();
    return;
  }
  const next = text.slice(0, s) + replacement + text.slice(e);
  const caret = s + replacement.length;
  applyCodeText(next, s, caret);
  lastFindIndex = Math.max(-1, caret - 1);
  findNextInCode();
}

function replaceAllInCode() {
  const term = String((els.findInput && els.findInput.value) || "").trim();
  const replacement = String((els.replaceInput && els.replaceInput.value) || "");
  if (!term) return;
  const text = String(els.code.value || "");
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  if (!re.test(text)) return;
  const next = text.replace(re, replacement);
  applyCodeText(next, 0, 0);
}

function toggleHtmlCommentInCode() {
  const ta = els.code;
  const text = String(ta.value || "");
  let s = ta.selectionStart;
  let e = ta.selectionEnd;

  function lineStartAt(idx) {
    return Math.max(0, text.lastIndexOf("\n", Math.max(0, idx - 1)) + 1);
  }
  function lineEndAt(idx) {
    const pos = text.indexOf("\n", idx);
    return pos < 0 ? text.length : pos;
  }
  function isCommentWrapped(chunk) {
    const t = chunk.trim();
    return t.startsWith("<!--") && t.endsWith("-->");
  }
  function unwrapComment(chunk) {
    const first = chunk.indexOf("<!--");
    const last = chunk.lastIndexOf("-->");
    if (first < 0 || last < 0 || last <= first) return chunk;
    let inner = chunk.slice(first + 4, last);
    if (inner.startsWith(" ")) inner = inner.slice(1);
    if (inner.endsWith(" ")) inner = inner.slice(0, -1);
    return chunk.slice(0, first) + inner + chunk.slice(last + 3);
  }

  let start;
  let end;
  if (s === e) {
    start = lineStartAt(s);
    end = lineEndAt(s);
  } else {
    start = lineStartAt(s);
    const endAnchor = e > start ? e - 1 : e;
    end = lineEndAt(endAnchor);
  }

  const chunk = text.slice(start, end);
  const replaced = isCommentWrapped(chunk) ? unwrapComment(chunk) : `<!-- ${chunk} -->`;

  ta.value = text.slice(0, start) + replaced + text.slice(end);
  ta.selectionStart = start;
  ta.selectionEnd = start + replaced.length;
  renderCodeLineNumbers();
  scheduleAutoSave(ta.value);
  hideCodeMarker();
}

function execCmd(cmd, val) {
  const d = getWysDoc();
  if (!d) return;
  try { els.wys.contentWindow.focus(); } catch (_) {}
  d.execCommand(cmd, false, val == null ? null : val);
}

function saveWysSelectionRange() {
  const d = getWysDoc();
  if (!d || !d.getSelection) return;
  const sel = d.getSelection();
  if (!sel || sel.rangeCount < 1) return;
  savedStyleRange = sel.getRangeAt(0).cloneRange();
}

function restoreWysSelectionRange() {
  const d = getWysDoc();
  if (!d || !d.getSelection || !savedStyleRange) return false;
  const sel = d.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(savedStyleRange);
  return true;
}

function applyFontSizePx(px) {
  const size = clamp(Number(px) || 16, 8, 200);
  execCmd("fontSize", 7);
  const d = getWysDoc();
  if (!d) return;
  const fonts = d.querySelectorAll('font[size="7"]');
  for (let i = 0; i < fonts.length; i++) {
    fonts[i].removeAttribute("size");
    fonts[i].style.fontSize = `${size}px`;
  }
}

function applyQuickFormatting(type) {
  restoreWysSelectionRange();
  if (type === "size") {
    const size = Number(els.quickFontSize ? els.quickFontSize.value : 16) || 16;
    applyFontSizePx(size);
  } else if (type === "text") {
    const color = String(els.quickTextColor ? els.quickTextColor.value : "#1a2233");
    execCmd("foreColor", color);
  } else if (type === "hilite") {
    const color = String(els.quickHiliteColor ? els.quickHiliteColor.value : "#fff59d");
    execCmd("hiliteColor", color);
    execCmd("backColor", color);
  }
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
}

function setQuickFontSizeValue(px) {
  if (!els.quickFontSize) return;
  const size = clamp(parseInt(px, 10) || 16, 8, 200);
  const val = String(size);
  let opt = null;
  for (let i = 0; i < els.quickFontSize.options.length; i++) {
    if (String(els.quickFontSize.options[i].value) === val) {
      opt = els.quickFontSize.options[i];
      break;
    }
  }
  if (!opt) {
    opt = document.createElement("option");
    opt.value = val;
    opt.textContent = `${val}px`;
    els.quickFontSize.appendChild(opt);
  }
  els.quickFontSize.value = val;
  applyQuickFormatting("size");
}

function openInlineFontSizeEditor() {
  if (!els.quickFontSize) return;
  const selectEl = els.quickFontSize;
  if (selectEl.dataset.editing === "1") return;
  selectEl.dataset.editing = "1";

  const current = parseInt(String(selectEl.value || "16"), 10) || 16;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "find-input quick-select";
  input.value = String(current);
  input.style.minWidth = "88px";

  selectEl.style.display = "none";
  selectEl.parentNode.insertBefore(input, selectEl.nextSibling);
  input.focus();
  input.select();

  const closeEditor = (applyValue) => {
    if (applyValue) {
      const parsed = parseInt(String(input.value || "").trim(), 10);
      if (Number.isFinite(parsed)) setQuickFontSizeValue(parsed);
    }
    input.remove();
    selectEl.style.display = "";
    delete selectEl.dataset.editing;
    selectEl.focus();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeEditor(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeEditor(false);
    }
  });
  input.addEventListener("blur", () => closeEditor(true));
}

function stepQuickFontSize(delta) {
  if (!els.quickFontSize) return;
  const list = Array.from(els.quickFontSize.options).map((o) => Number(o.value) || 0).filter((n) => n > 0);
  if (!list.length) return;
  const curSize = Number(els.quickFontSize.value) || list[0];
  let nearest = list[0];
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - curSize) < Math.abs(nearest - curSize)) nearest = list[i];
  }
  const idx = Math.max(0, list.indexOf(nearest));
  const nextIdx = clamp(idx + (delta > 0 ? 1 : -1), 0, list.length - 1);
  els.quickFontSize.value = String(list[nextIdx]);
  applyQuickFormatting("size");
}

function openStyleModal() {
  saveWysSelectionRange();
  if (els.styleOverlay) els.styleOverlay.classList.add("open");
}

function closeStyleModal() {
  if (els.styleOverlay) els.styleOverlay.classList.remove("open");
}

function fmtInDbDate(ts) {
  const n = Number(ts) || Date.now();
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function closeInDbModal() {
  if (els.inDbOverlay) els.inDbOverlay.classList.remove("open");
}

function refreshSlideSizeUi() {
  if (els.slideSizeCurrent) {
    els.slideSizeCurrent.textContent = `Current: ${slideWidth} x ${slideHeight}`;
  }
  if (els.slideSizeWidth) els.slideSizeWidth.value = String(slideWidth);
  if (els.slideSizeHeight) els.slideSizeHeight.value = String(slideHeight);
  if (els.slideSizePreset) els.slideSizePreset.value = "current";
}

function openSlideSettingsModal() {
  refreshSlideSizeUi();
  if (els.slideSettingsOverlay) els.slideSettingsOverlay.classList.add("open");
}

function closeSlideSettingsModal() {
  if (els.slideSettingsOverlay) els.slideSettingsOverlay.classList.remove("open");
}

function applySlideSizePreset() {
  if (!els.slideSizePreset) return;
  const key = String(els.slideSizePreset.value || "current");
  if (key === "current") {
    if (els.slideSizeWidth) els.slideSizeWidth.value = String(slideWidth);
    if (els.slideSizeHeight) els.slideSizeHeight.value = String(slideHeight);
    return;
  }
  if (key === "custom") return;
  const p = SLIDE_SIZE_PRESETS[key];
  if (!p) return;
  if (els.slideSizeWidth) els.slideSizeWidth.value = String(p.w);
  if (els.slideSizeHeight) els.slideSizeHeight.value = String(p.h);
}

function applySlideSizeSettings() {
  const w = clamp(parseInt(String(els.slideSizeWidth ? els.slideSizeWidth.value : "1280"), 10) || 1280, 320, 4000);
  const h = clamp(parseInt(String(els.slideSizeHeight ? els.slideSizeHeight.value : "720"), 10) || 720, 240, 4000);
  slideWidth = w;
  slideHeight = h;
  applyZoom();
  refreshSlideSizeUi();
  closeSlideSettingsModal();
}

function renderInDbList(records) {
  if (!els.inDbList) return;
  const arr = Array.isArray(records) ? records : [];
  if (!arr.length) {
    els.inDbList.innerHTML = '<div class="indb-item"><div class="indb-title">No saved data</div></div>';
    selectedInDbId = "";
    return;
  }
  if (!selectedInDbId || !arr.some((r) => String(r.id) === selectedInDbId)) {
    selectedInDbId = String(arr[0].id || "");
  }
  const html = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const id = String(r.id || "");
    const name = sanitizeText(String(r.name || "saved-set"));
    const slidesCount = Array.isArray(r.slides) ? r.slides.length : 0;
    const active = id === selectedInDbId ? " active" : "";
    html.push(
      `<div class="indb-item${active}" data-indb-id="${sanitizeText(id)}">` +
      `<div class="indb-title">${name}</div>` +
      `<div class="indb-meta">${fmtInDbDate(r.updatedAt)} 쨌 ${slidesCount} slides</div>` +
      `</div>`
    );
  }
  els.inDbList.innerHTML = html.join("");
  els.inDbList.querySelectorAll("[data-indb-id]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedInDbId = String(el.getAttribute("data-indb-id") || "");
      els.inDbList.querySelectorAll(".indb-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

async function openInDbModal() {
  selectedInDbId = "";
  const list = await listSavedSlidesFromInDb();
  renderInDbList(list);
  if (els.inDbOverlay) els.inDbOverlay.classList.add("open");
}

async function loadSelectedInDb() {
  const id = String(selectedInDbId || "").trim();
  if (!id) return;
  const ok = await loadSlidesFromInDbById(id);
  if (!ok) return;
  closeInDbModal();
  loadCurrent();
}

async function deleteSelectedInDb() {
  const id = String(selectedInDbId || "").trim();
  if (!id) return;
  if (!confirm("Delete selected inDB saved data?")) return;
  await removeSlidesFromInDbById(id);
  const list = await listSavedSlidesFromInDb();
  renderInDbList(list);
}

function stepStyleFontSize(delta) {
  if (!els.styleFontSize) return;
  const list = Array.from(els.styleFontSize.options).map((o) => Number(o.value) || 0).filter((n) => n > 0);
  if (!list.length) return;
  const curSize = Number(els.styleFontSize.value) || list[0];
  let nearest = list[0];
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - curSize) < Math.abs(nearest - curSize)) nearest = list[i];
  }
  const idx = Math.max(0, list.indexOf(nearest));
  const nextIdx = clamp(idx + (delta > 0 ? 1 : -1), 0, list.length - 1);
  els.styleFontSize.value = String(list[nextIdx]);
}

function applyStyleFromModal() {
  restoreWysSelectionRange();
  const d = getWysDoc();
  if (!d) {
    closeStyleModal();
    return;
  }

  const size = Number(els.styleFontSize ? els.styleFontSize.value : 16) || 16;
  const textColor = String(els.styleTextColor ? els.styleTextColor.value : "#1a2233");
  const bgColor = String(els.styleBgColor ? els.styleBgColor.value : "#fff59d");
  const boldMode = String(els.styleBoldMode ? els.styleBoldMode.value : "keep");
  const italicMode = String(els.styleItalicMode ? els.styleItalicMode.value : "keep");

  applyFontSizePx(size);
  execCmd("foreColor", textColor);
  execCmd("hiliteColor", bgColor);
  execCmd("backColor", bgColor);

  if (boldMode !== "keep") {
    const on = !!d.queryCommandState && d.queryCommandState("bold");
    if ((boldMode === "on" && !on) || (boldMode === "off" && on)) execCmd("bold");
  }
  if (italicMode !== "keep") {
    const on = !!d.queryCommandState && d.queryCommandState("italic");
    if ((italicMode === "on" && !on) || (italicMode === "off" && on)) execCmd("italic");
  }

  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
  closeStyleModal();
}

function sanitizeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^internal:\/\//i.test(s)) return s;
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(s)) return s;
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/i.test(s)) return "";
  return "https://" + s;
}

function sanitizeText(raw) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .trim();
}

function openLinkModal() {
  saveWysSelectionRange();
  if (els.linkDisplayText) els.linkDisplayText.value = "";
  if (els.linkUrlText) els.linkUrlText.value = "https://";
  const modal = document.getElementById("linkModal");
  if (modal && modal.dataset.initPos !== "1") {
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "360px";
    modal.dataset.initPos = "1";
  }
  if (els.linkOverlay) els.linkOverlay.classList.add("open");
  if (els.linkDisplayText) setTimeout(() => els.linkDisplayText.focus(), 0);
}

function closeLinkModal() {
  if (els.linkOverlay) els.linkOverlay.classList.remove("open");
}

function applyLinkModal() {
  const href = sanitizeUrl(els.linkUrlText ? els.linkUrlText.value : "");
  const txt = sanitizeText(els.linkDisplayText ? els.linkDisplayText.value : "");
  if (!href) return;
  const label = txt || href;
  restoreWysSelectionRange();
  insertHtmlIntoWys(`<a href="${sanitizeText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  closeLinkModal();
}

function initLinkModalWindowControls() {
  const modal = document.getElementById("linkModal");
  const head = document.getElementById("linkModalHead");
  const handle = document.getElementById("linkResizeHandle");
  if (!modal || !head || !handle || modal.dataset.boundDragResize === "1") return;
  modal.dataset.boundDragResize = "1";

  let mode = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  let sw = 0;
  let sh = 0;

  const onMove = (e) => {
    if (!mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "drag") {
      modal.style.left = `${Math.round(sl + dx)}px`;
      modal.style.top = `${Math.round(st + dy)}px`;
      modal.style.transform = "none";
      return;
    }
    if (mode === "resize") {
      const w = Math.max(300, Math.round(sw + dx));
      const h = Math.max(220, Math.round(sh + dy));
      modal.style.width = `${w}px`;
      modal.style.height = `${h}px`;
    }
  };
  const onUp = () => { mode = ""; };

  head.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("button,input,select,textarea,label,a")) return;
    e.preventDefault();
    mode = "drag";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sl = rect.left;
    st = rect.top;
    modal.style.left = `${Math.round(sl)}px`;
    modal.style.top = `${Math.round(st)}px`;
    modal.style.transform = "none";
  });

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mode = "resize";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sw = rect.width;
    sh = rect.height;
    modal.style.width = `${Math.round(sw)}px`;
    modal.style.height = `${Math.round(sh)}px`;
  });

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

async function refreshImageDbOptions() {
  if (!els.insertImgDbSelect) return;
  let records = [];
  try {
    const db = await openAppDb();
    try {
      records = await listImageRecords(db);
    } finally {
      try { db.close(); } catch (_) {}
    }
  } catch (_) {
    records = [];
  }
  const opts = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i] || {};
    const id = String(r.id || "").trim();
    if (!id) continue;
    const label = String(r.name || id);
    const encoded = encodeURIComponent(id);
    opts.push(`<option value="internal://${encoded}">${sanitizeText(label)} (${sanitizeText(id)})</option>`);
  }
  els.insertImgDbSelect.innerHTML = opts.join("");
}

function setInsertMode(mode) {
  currentInsertMode = mode === "img" ? "img" : "link";
  if (els.insertModalTitle) {
    els.insertModalTitle.textContent = currentInsertMode === "img" ? "Insert Image" : "Insert Link";
  }
  if (els.insertLinkPane) els.insertLinkPane.classList.toggle("hidden", currentInsertMode !== "link");
  if (els.insertImgPane) els.insertImgPane.classList.toggle("hidden", currentInsertMode !== "img");
}

function setImgSource(mode) {
  currentImgSource = mode === "db" ? "db" : "url";
  if (els.insertImgUrl) els.insertImgUrl.classList.toggle("hidden", currentImgSource !== "url");
  if (els.insertImgDbSelect) els.insertImgDbSelect.classList.toggle("hidden", currentImgSource !== "db");
}

async function openInsertModal(mode) {
  setInsertMode(mode);
  setImgSource("url");
  if (els.insertLinkText) els.insertLinkText.value = "";
  if (els.insertLinkUrl) els.insertLinkUrl.value = "https://";
  if (els.insertImgAlt) els.insertImgAlt.value = "";
  if (els.insertImgUrl) els.insertImgUrl.value = "https://";
  if (els.insertImgLinkUrl) els.insertImgLinkUrl.value = "";
  if (els.insertImgFile) els.insertImgFile.value = "";
  const modal = document.getElementById("insertModalWindow");
  if (modal && modal.dataset.initPos !== "1") {
    modal.style.left = "50%";
    modal.style.top = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "1120px";
    modal.dataset.initPos = "1";
  }
  await refreshImageDbOptions();
  if (els.insertOverlay) els.insertOverlay.classList.add("open");
  if (currentInsertMode === "img" && currentImgSource === "db" && els.insertImgDbSelect) {
    els.insertImgDbSelect.focus();
  } else if (currentInsertMode === "img" && els.insertImgAlt) {
    els.insertImgAlt.focus();
  } else if (els.insertLinkText) {
    els.insertLinkText.focus();
  }
}

function initImageModalWindowControls() {
  const modal = document.getElementById("insertModalWindow");
  const head = document.getElementById("insertModalHead");
  const handle = document.getElementById("insertResizeHandle");
  if (!modal || !head || !handle || modal.dataset.boundDragResize === "1") return;
  modal.dataset.boundDragResize = "1";

  let mode = "";
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  let sw = 0;
  let sh = 0;

  const onMove = (e) => {
    if (!mode) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (mode === "drag") {
      modal.style.left = `${Math.round(sl + dx)}px`;
      modal.style.top = `${Math.round(st + dy)}px`;
      modal.style.transform = "none";
      return;
    }
    if (mode === "resize") {
      const w = Math.max(720, Math.round(sw + dx));
      const h = Math.max(360, Math.round(sh + dy));
      modal.style.width = `${w}px`;
      modal.style.height = `${h}px`;
    }
  };
  const onUp = () => { mode = ""; };

  head.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest("button,input,select,textarea,label,a")) return;
    e.preventDefault();
    mode = "drag";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sl = rect.left;
    st = rect.top;
    modal.style.left = `${Math.round(sl)}px`;
    modal.style.top = `${Math.round(st)}px`;
    modal.style.transform = "none";
  });

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mode = "resize";
    sx = e.clientX;
    sy = e.clientY;
    const rect = modal.getBoundingClientRect();
    sw = rect.width;
    sh = rect.height;
    modal.style.width = `${Math.round(sw)}px`;
    modal.style.height = `${Math.round(sh)}px`;
  });

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

function closeInsertModal() {
  if (els.insertOverlay) els.insertOverlay.classList.remove("open");
}

function insertHtmlIntoWys(html, forceReload) {
  const snippet = String(html || "");
  if (!snippet) return;
  execCmd("insertHTML", snippet);
  const next = getWysHtml();
  els.code.value = next;
  renderCodeLineNumbers();
  scheduleAutoSave(next);
  if (forceReload) {
    // Re-hydrate internal:// images immediately so inserted image is visible without manual apply.
    loadWys(next);
  }
}

function applyInsertModal() {
  if (currentInsertMode === "link") {
    const href = sanitizeUrl(els.insertLinkUrl ? els.insertLinkUrl.value : "");
    const txt = sanitizeText(els.insertLinkText ? els.insertLinkText.value : "");
    if (!href) return;
    const label = txt || href;
    insertHtmlIntoWys(`<a href="${sanitizeText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    closeInsertModal();
    return;
  }

  const alt = sanitizeText(els.insertImgAlt ? els.insertImgAlt.value : "");
  const src = currentImgSource === "db"
    ? sanitizeUrl(els.insertImgDbSelect ? els.insertImgDbSelect.value : "")
    : sanitizeUrl(els.insertImgUrl ? els.insertImgUrl.value : "");
  if (!src) return;
  const imgTag = `<img src="${sanitizeText(src)}" alt="${alt}" style="max-width:100%;height:auto;">`;
  const linkUrl = sanitizeUrl(els.insertImgLinkUrl ? els.insertImgLinkUrl.value : "");
  if (linkUrl) {
    insertHtmlIntoWys(`<a href="${sanitizeText(linkUrl)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`, true);
  } else {
    insertHtmlIntoWys(imgTag, true);
  }
  closeInsertModal();
}

function decodeInternalId(s) {
  try { return decodeURIComponent(String(s || "").trim()); } catch (_) { return String(s || "").trim(); }
}

function extractInternalImageIdsFromSlides(list) {
  const ids = [];
  const seen = new Set();
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i++) {
    const src = String((arr[i] && arr[i].html) || "");
    INTERNAL_RE.lastIndex = 0;
    let m;
    while ((m = INTERNAL_RE.exec(src)) !== null) {
      const id = decodeInternalId(m[1]);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function openAppDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB."));
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("images")) d.createObjectStore("images", { keyPath: "id" });
      if (!d.objectStoreNames.contains("autosave")) d.createObjectStore("autosave", { keyPath: "id" });
    };
  });
}

function listImageRecords(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("images", "readonly");
      const req = tx.objectStore("images").getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("Failed to list images."));
    } catch (e) {
      reject(e);
    }
  });
}

function makeInDbRecordName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `slides_${y}${m}${d}_${hh}${mm}`;
}

function saveSlidesToInDb(nameHint) {
  const name = String(nameHint || "").trim() || makeInDbRecordName();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return openAppDb().then((db) => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("autosave", "readwrite");
      tx.objectStore("autosave").put({
        id,
        name,
        updatedAt: Date.now(),
        currentIndex: cur,
        slides: slides.map((s) => ({ html: String((s && s.html) || "") }))
      });
      tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(id); };
      tx.onerror = () => { try { db.close(); } catch (_) {} reject(tx.error || new Error("Failed inDB save.")); };
    } catch (e) {
      try { db.close(); } catch (_) {}
      reject(e);
    }
  }));
}

async function listSavedSlidesFromInDb() {
  const db = await openAppDb();
  try {
    const list = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction("autosave", "readonly");
        const req = tx.objectStore("autosave").getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error || new Error("Failed inDB list."));
      } catch (e) {
        reject(e);
      }
    });
    return list
      .filter((r) => r && Array.isArray(r.slides) && r.slides.length > 0)
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function loadSlidesFromInDbById(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  const db = await openAppDb();
  try {
    const rec = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction("autosave", "readonly");
        const req = tx.objectStore("autosave").get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error("Failed inDB load."));
      } catch (e) {
        reject(e);
      }
    });
    if (!rec || !Array.isArray(rec.slides) || !rec.slides.length) return false;
    slides = rec.slides.map((s) => ({ html: String((s && s.html) || START_HTML) }));
    cur = clamp(Number(rec.currentIndex) || 0, 0, slides.length - 1);
    backup = String(slides[cur].html || START_HTML);
    return true;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function removeSlidesFromInDbById(id) {
  const key = String(id || "").trim();
  if (!key) return Promise.resolve(false);
  return openAppDb().then((db) => new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("autosave", "readwrite");
      tx.objectStore("autosave").delete(key);
      tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(true); };
      tx.onerror = () => { try { db.close(); } catch (_) {} reject(tx.error || new Error("Failed inDB remove.")); };
    } catch (e) {
      try { db.close(); } catch (_) {}
      reject(e);
    }
  }));
}

function getImageRecord(db, id) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("images", "readonly");
      const req = tx.objectStore("images").get(String(id || ""));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("Failed to read image record."));
    } catch (e) {
      reject(e);
    }
  });
}

function putImageRecord(db, rec) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to write image record."));
    } catch (e) {
      reject(e);
    }
  });
}

async function saveImageFileToDb(file) {
  const f = file;
  if (!f) return "";
  const db = await openAppDb();
  try {
    const safeName = String(f.name || "image").replace(/[^\w.\-]+/g, "_");
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    await putImageRecord(db, {
      id,
      blob: f,
      name: safeName,
      mime: f.type || "application/octet-stream",
      createdAt: Date.now()
    });
    return id;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function ingestImageFileToInsertDb(file) {
  if (!file) return;
  const id = await saveImageFileToDb(file);
  await refreshImageDbOptions();
  setImgSource("db");
  const targetVal = `internal://${encodeURIComponent(id)}`;
  if (els.insertImgDbSelect) els.insertImgDbSelect.value = targetVal;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.onerror = () => reject(fr.error || new Error("Failed to read blob."));
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mime) {
  const b64 = String(base64 || "").trim();
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

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
    frame.srcdoc = String(slideHtml || START_HTML);
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

async function renderFrameToPptObjectsByMode(frame, slide, pptW, pptH, mode) {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return;

  const rootRect = (doc.documentElement || doc.body).getBoundingClientRect();
  const clampRect = (r) => {
    const left = Math.max(0, r.left - rootRect.left);
    const top = Math.max(0, r.top - rootRect.top);
    const right = Math.min(slideWidth, r.right - rootRect.left);
    const bottom = Math.min(slideHeight, r.bottom - rootRect.top);
    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  };

  // slide background color (use actual rendered background instead of forced white)
  const bgHex = pickFirstSolidBgHex(
    win,
    [doc.querySelector(".slide-container"), doc.querySelector(".slide"), doc.body, doc.documentElement],
    "FFFFFF"
  );
  try {
    const shapeType = window.PptxGenJS && window.PptxGenJS.ShapeType && window.PptxGenJS.ShapeType.rect;
    if (shapeType) {
      slide.addShape(shapeType, {
        x: 0,
        y: 0,
        w: pptW,
        h: pptH,
        fill: { color: bgHex },
        line: { color: bgHex, transparency: 100 }
      });
    }
  } catch (_) {}

  const allEls = Array.from((doc.body || doc.documentElement).querySelectorAll("*"));
  const ops = [];
  const slideArea = Math.max(1, slideWidth * slideHeight);
  const rectShape = window.PptxGenJS && window.PptxGenJS.ShapeType && window.PptxGenJS.ShapeType.rect;

  for (let i = 0; i < allEls.length; i++) {
    const el = allEls[i];
    const tag = String(el.tagName || "").toLowerCase();
    if (!tag || tag === "script" || tag === "style" || tag === "noscript") continue;
    if (!isElementVisible(win, el)) continue;
    const rawRect = el.getBoundingClientRect();
    const r = clampRect(rawRect);
    if (r.width < 2 || r.height < 2) continue;
    const rawArea = Math.max(1, (rawRect.width || 0) * (rawRect.height || 0));
    const visRatio = (r.width * r.height) / rawArea;
    const minVisibleRatio = mode === "full" ? 0.01 : 0.12;
    if (visRatio < minVisibleRatio) continue; // mostly off-screen object
    const cs = win.getComputedStyle(el);
    const areaRatio = (r.width * r.height) / slideArea;

    const z = getElementZIndex(win, el);
    const zChain = getZChain(win, el);
    const domPath = getElementDomOrder(el);

    if (isIconLikeElement(win, el)) {
      ops.push({ kind: "image-icon", el, r, cs, z, zChain, domPath, order: i, subOrder: 3 });
      continue;
    }

    if (tag === "canvas" || tag === "svg") {
      ops.push({ kind: "image-js", el, r, cs, z, zChain, domPath, order: i, subOrder: 1 });
      continue;
    }
    if (tag === "img") {
      ops.push({ kind: "image-img", el, r, cs, z, zChain, domPath, order: i, subOrder: 1 });
      continue;
    }

    const hasBox = hasVisualBoxStyle(cs);
    const hasBgImage = hasBackgroundImageStyle(cs);
    const classContainer = hasContainerLikeClass(el);
    const hasDecorClass = hasDecorLikeClass(el);
    const txt = sanitizeTextForPpt(normalizeElementText(el.innerText || el.textContent || ""));
    const hasText = txt.length > 0;
    const hasMediaDesc = !!el.querySelector("img, canvas, svg");
    const isRootContainer = (tag === "html" || tag === "body");
    const hasPseudoVisual = hasRenderablePseudoVisual(win, el);

    // Container visuals
    if ((hasBox || classContainer || hasDecorClass || hasPseudoVisual) && !isRootContainer && areaRatio < 0.98) {
      // Strict rule: everything visual except text is exported as image slices.
      // (container backgrounds/borders/shadows/pseudo/decor included)
      ops.push({
        kind: hasBgImage ? "image-bg" : "image-box",
        el,
        r,
        cs,
        z,
        zChain,
        domPath,
        order: i,
        subOrder: 0
      });
    }

    // Text extraction: use semantic text tags and text-leaf containers.
    const allowInlineText = !isInlineTextTag(tag) || isPositionedForText(cs) || isBlockLikeDisplay(cs && cs.display);
    const textLeaf = !hasBlockChildren(el) && !hasVisibleNonInlineTextChild(win, el);
    const semanticText = isTextTag(tag);
    const inlineSemantic = isInlineTextSemanticTag(tag);
    const blockAncestor = inlineSemantic && el.closest ? el.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,label") : null;
    const skipInlineDup = !!blockAncestor;
    const skipContainerDup = !isBlockTextTag(tag) && hasTextElementChild(el) && !textLeaf;
    if (hasText && allowInlineText && !hasMediaDesc && areaRatio < 0.95 && (semanticText || textLeaf) && !skipInlineDup && !skipContainerDup) {
      ops.push({
        kind: "text",
        el,
        r,
        cs,
        z,
        zChain,
        domPath,
        order: i,
        subOrder: 2,
        text: txt
      });
    }
  }

  ops.sort((a, b) => {
    const zc = compareZChain(a.zChain, b.zChain);
    if (zc !== 0) return zc;
    if (a.z !== b.z) return a.z - b.z;
    const dc = compareDomOrderPath(a.domPath, b.domPath);
    if (dc !== 0) return dc;
    if (a.order !== b.order) return a.order - b.order;
    return (a.subOrder || 0) - (b.subOrder || 0);
  });

  const seenTextKeys = new Set();
  const seenImageKeys = new Set();

  for (let i = 0; i < ops.length; i++) {
    const c = ops[i];
    if (!c || !c.el) continue;

    if (c.kind === "image-js" || c.kind === "image-img" || c.kind === "image-icon") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        const data = await captureDomElementToPngData(c.el);
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "image-bg") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        let data = "";
        const hasBgImage = hasBackgroundImageStyle(c.cs);
        if (hasBgImage) {
          data = await captureBackgroundStyleToPngData(doc, c.cs, c.r.width, c.r.height);
        } else {
          data = await captureElementBackgroundOnlyToPngData(doc, c.el);
        }
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "image-box") {
      try {
        const key = [c.kind, Math.round(c.r.left), Math.round(c.r.top), Math.round(c.r.width), Math.round(c.r.height)].join("|");
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        const data = await captureElementBackgroundOnlyToPngData(doc, c.el);
        if (!data) continue;
        slide.addImage({
          data,
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH)
        });
      } catch (_) {}
      continue;
    }

    if (c.kind === "text") {
      const cs = c.cs;
      const key = [
        c.text,
        Math.round(c.r.left),
        Math.round(c.r.top),
        Math.round(c.r.width),
        Math.round(c.r.height)
      ].join("|");
      if (seenTextKeys.has(key)) continue;
      seenTextKeys.add(key);
      try {
        slide.addText(c.text, {
          x: pxToInchX(c.r.left, pptW),
          y: pxToInchY(c.r.top, pptH),
          w: pxToInchX(c.r.width, pptW),
          h: pxToInchY(c.r.height, pptH),
          fontSize: Math.max(7, Math.min(120, parsePx(cs && cs.fontSize, 16) * 0.75)),
          color: toPptColor(cs && cs.color, "1f2a44"),
          bold: Number(cs && cs.fontWeight) >= 600,
          italic: String((cs && cs.fontStyle) || "").includes("italic"),
          underline: String((cs && cs.textDecorationLine) || "").includes("underline"),
          fontFace: getSafeFontFace(cs),
          align: getTextAlignFromStyle(cs),
          valign: "top",
          margin: 0
        });
      } catch (_) {}
    }
  }
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
    frame.srcdoc = String(slideHtml || START_HTML);
    await new Promise((resolve) => {
      frame.onload = () => resolve(true);
      setTimeout(() => resolve(true), 1200);
    });
    await waitForFrameVisualReady(frame, 9000);
    if (mode === "image") {
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

document.getElementById("btnAdd").onclick = openAddModal;
document.getElementById("btnGallery").onclick = openGalleryWindow;
document.getElementById("btnSlideShow").onclick = () => { openSlideShowWindow().catch(() => {}); };
document.getElementById("btnSlideSettings").onclick = openSlideSettingsModal;
document.getElementById("btnThemeMode").onclick = toggleAppThemeMode;
document.getElementById("btnInDbSave").onclick = async () => {
  const suggested = makeInDbRecordName();
  const name = prompt("Save name", suggested);
  if (name == null) return;
  try { await saveSlidesToInDb(name); } catch (_) {}
};
document.getElementById("btnInDbOpen").onclick = () => { openInDbModal().catch(() => {}); };
document.getElementById("btnPrev").onclick = () => { if (cur > 0) { cur--; loadCurrent(); } };
document.getElementById("btnNext").onclick = () => { if (cur < slides.length - 1) { cur++; loadCurrent(); } };
document.getElementById("btnSave").onclick = saveCurrent;
document.getElementById("btnRevert").onclick = revertCurrent;
document.getElementById("btnZoomIn").onclick = () => { zoom = clamp(zoom + 0.1, 0.2, 2); applyZoom(); };
document.getElementById("btnZoomOut").onclick = () => { zoom = clamp(zoom - 0.1, 0.2, 2); applyZoom(); };
document.getElementById("btnWrap").onclick = toggleCodeWrapMode;
document.getElementById("btnCodeTheme").onclick = toggleCodeThemeMode;
document.getElementById("btnCodeFontInc").onclick = () => setCodeFontSize(codeFontSize + 1);
document.getElementById("btnCodeFontDec").onclick = () => setCodeFontSize(codeFontSize - 1);
document.getElementById("btnFormat").onclick = () => { applyCodeText(formatHtml(els.code.value), 0, 0); };
document.getElementById("btnFindReplace").onclick = openFindReplace;
document.getElementById("btnFindPrev").onclick = findPrevInCode;
document.getElementById("btnFindNext").onclick = findNextInCode;
document.getElementById("btnReplaceOne").onclick = replaceCurrentInCode;
document.getElementById("btnReplaceAll").onclick = replaceAllInCode;
document.getElementById("btnFindClose").onclick = closeFindReplace;
document.getElementById("btnExport").onclick = exportMpp;
document.getElementById("btnImport").onclick = () => els.fileInput.click();
document.getElementById("btnPptxExport").onclick = () => { exportPptx().catch(() => {}); };
document.getElementById("btnCloseAdd").onclick = closeAddModal;
document.getElementById("btnCancelAdd").onclick = closeAddModal;
document.getElementById("btnConfirmAdd").onclick = confirmAddModal;
document.getElementById("btnInDbClose").onclick = closeInDbModal;
document.getElementById("btnInDbLoad").onclick = () => { loadSelectedInDb().catch(() => {}); };
document.getElementById("btnInDbDelete").onclick = () => { deleteSelectedInDb().catch(() => {}); };
document.getElementById("btnSlideSettingsClose").onclick = closeSlideSettingsModal;
document.getElementById("btnSlideSettingsCancel").onclick = closeSlideSettingsModal;
document.getElementById("btnSlideSettingsApply").onclick = applySlideSizeSettings;
if (els.slideSizePreset) {
  els.slideSizePreset.addEventListener("change", applySlideSizePreset);
}

els.addOverlay.addEventListener("click", (e) => {
  if (e.target === els.addOverlay) closeAddModal();
});

els.addPaste.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text");
  els.addPaste.value = text;
});

document.getElementById("btnSyncToWys").onclick = () => loadWys(els.code.value);
document.getElementById("btnSyncToCode").onclick = () => {
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
};

els.code.addEventListener("input", () => {
  renderCodeLineNumbers();
  scheduleAutoSave(els.code.value);
  hideCodeMarker();
  clearTimeout(codeToWysTimer);
  codeToWysTimer = setTimeout(() => {
    loadWys(els.code.value);
  }, 200);
});

els.code.addEventListener("scroll", () => {
  syncCodeLineGutterScroll();
  syncCodeViewScroll();
  if (els.codeMarker.style.display !== "none") setCodeMarkerByIndex(lastCodeIndex || 0, false);
});

els.code.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    openFindReplace();
    return;
  }
  if (e.key === "Escape" && els.findBar && !els.findBar.classList.contains("hidden")) {
    e.preventDefault();
    closeFindReplace();
    return;
  }
  if (e.key === "Enter" && els.findBar && !els.findBar.classList.contains("hidden")) {
    e.preventDefault();
    if (e.shiftKey) findPrevInCode();
    else findNextInCode();
    return;
  }
  if (!mod) return;
  if (e.key === "/" || e.code === "Slash" || e.keyCode === 191) {
    e.preventDefault();
    toggleHtmlCommentInCode();
  }
});

if (els.findInput) {
  els.findInput.addEventListener("input", () => { lastFindIndex = -1; });
}

els.fileInput.onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try { await importMpp(f); } catch (_) {}
  e.target.value = "";
};

document.querySelectorAll("[data-tag]").forEach((btn) => {
  btn.onclick = () => wrapTag(btn.getAttribute("data-tag"));
});

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.onclick = () => execCmd(btn.getAttribute("data-cmd"));
});

document.getElementById("btnLink").onclick = () => {
  openLinkModal();
};

document.getElementById("btnImg").onclick = () => {
  openInsertModal("img").catch(() => {});
};
const btnClearText = document.getElementById("btnClearText");
if (btnClearText) btnClearText.onclick = clearEnteredText;
const btnTextBox = document.getElementById("btnTextBox");
if (btnTextBox) btnTextBox.onclick = insertTextBox;
const btnObjectEditMode = document.getElementById("btnObjectEditMode");
if (btnObjectEditMode) {
  btnObjectEditMode.onclick = () => setObjectEditMode(!objectEditMode);
}
const btnLayerUp = document.getElementById("btnLayerUp");
if (btnLayerUp) btnLayerUp.onclick = () => changeSelectedLayerOrder(1);
const btnLayerDown = document.getElementById("btnLayerDown");
if (btnLayerDown) btnLayerDown.onclick = () => changeSelectedLayerOrder(-1);
const btnStyle = document.getElementById("btnStyle");
if (btnStyle) btnStyle.onclick = openStyleModal;
const btnStyleApply = document.getElementById("btnStyleApply");
if (btnStyleApply) btnStyleApply.onclick = applyStyleFromModal;
const btnStyleClose = document.getElementById("btnStyleClose");
if (btnStyleClose) btnStyleClose.onclick = closeStyleModal;
const btnStyleCancel = document.getElementById("btnStyleCancel");
if (btnStyleCancel) btnStyleCancel.onclick = closeStyleModal;
const btnStyleSizeUp = document.getElementById("btnStyleSizeUp");
if (btnStyleSizeUp) btnStyleSizeUp.onclick = () => stepStyleFontSize(1);
const btnStyleSizeDown = document.getElementById("btnStyleSizeDown");
if (btnStyleSizeDown) btnStyleSizeDown.onclick = () => stepStyleFontSize(-1);
const btnFontDec = document.getElementById("btnFontDec");
if (btnFontDec) btnFontDec.onclick = () => stepQuickFontSize(-1);
const btnFontInc = document.getElementById("btnFontInc");
if (btnFontInc) btnFontInc.onclick = () => stepQuickFontSize(1);
if (els.quickFontSize) {
  els.quickFontSize.addEventListener("mousedown", saveWysSelectionRange);
  els.quickFontSize.addEventListener("change", () => applyQuickFormatting("size"));
  els.quickFontSize.addEventListener("dblclick", (e) => {
    e.preventDefault();
    openInlineFontSizeEditor();
  });
}
if (els.quickTextColor) {
  els.quickTextColor.addEventListener("mousedown", saveWysSelectionRange);
  els.quickTextColor.addEventListener("input", () => applyQuickFormatting("text"));
}
if (els.quickHiliteColor) {
  els.quickHiliteColor.addEventListener("mousedown", saveWysSelectionRange);
  els.quickHiliteColor.addEventListener("input", () => applyQuickFormatting("hilite"));
}

const btnInsertModeLink = document.getElementById("btnInsertModeLink");
if (btnInsertModeLink) btnInsertModeLink.onclick = () => setInsertMode("link");
const btnInsertModeImg = document.getElementById("btnInsertModeImg");
if (btnInsertModeImg) btnInsertModeImg.onclick = () => setInsertMode("img");
const btnImgSrcUrl = document.getElementById("btnImgSrcUrl");
if (btnImgSrcUrl) btnImgSrcUrl.onclick = () => setImgSource("url");
const btnImgSrcDb = document.getElementById("btnImgSrcDb");
if (btnImgSrcDb) btnImgSrcDb.onclick = () => setImgSource("db");
const btnImgUpload = document.getElementById("btnImgUpload");
if (btnImgUpload) btnImgUpload.onclick = () => {
  if (els.insertImgFile) els.insertImgFile.click();
};
const btnInsertApply = document.getElementById("btnInsertApply");
if (btnInsertApply) btnInsertApply.onclick = applyInsertModal;
const btnInsertClose = document.getElementById("btnInsertClose");
if (btnInsertClose) btnInsertClose.onclick = closeInsertModal;
const btnInsertCancel = document.getElementById("btnInsertCancel");
if (btnInsertCancel) btnInsertCancel.onclick = closeInsertModal;

if (els.insertOverlay) {
  els.insertOverlay.addEventListener("click", (e) => {
    if (e.target === els.insertOverlay) closeInsertModal();
  });
}
if (els.styleOverlay) {
  els.styleOverlay.addEventListener("click", (e) => {
    if (e.target === els.styleOverlay) closeStyleModal();
  });
}
if (els.linkOverlay) {
  els.linkOverlay.addEventListener("click", (e) => {
    if (e.target === els.linkOverlay) closeLinkModal();
  });
}
if (els.inDbOverlay) {
  els.inDbOverlay.addEventListener("click", (e) => {
    if (e.target === els.inDbOverlay) closeInDbModal();
  });
}
if (els.slideSettingsOverlay) {
  els.slideSettingsOverlay.addEventListener("click", (e) => {
    if (e.target === els.slideSettingsOverlay) closeSlideSettingsModal();
  });
}

const btnLinkCancel = document.getElementById("btnLinkCancel");
if (btnLinkCancel) btnLinkCancel.onclick = closeLinkModal;
const btnLinkInsert = document.getElementById("btnLinkInsert");
if (btnLinkInsert) btnLinkInsert.onclick = applyLinkModal;
if (els.linkDisplayText) {
  els.linkDisplayText.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (els.linkUrlText) els.linkUrlText.focus();
  });
}
if (els.linkUrlText) {
  els.linkUrlText.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    applyLinkModal();
  });
}

if (els.insertImgFile) {
  els.insertImgFile.addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await ingestImageFileToInsertDb(f);
    } catch (_) {
    } finally {
      e.target.value = "";
    }
  });
}

if (els.insertImgPasteZone) {
  els.insertImgPasteZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.insertImgPasteZone.style.borderColor = "#5a58f0";
  });
  els.insertImgPasteZone.addEventListener("dragleave", () => {
    els.insertImgPasteZone.style.borderColor = "";
  });
  els.insertImgPasteZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    els.insertImgPasteZone.style.borderColor = "";
    const dt = e.dataTransfer;
    const file = dt && dt.files && dt.files[0];
    if (!file || !String(file.type || "").startsWith("image/")) return;
    try { await ingestImageFileToInsertDb(file); } catch (_) {}
  });
}

document.addEventListener("paste", async (e) => {
  if (!els.insertOverlay || !els.insertOverlay.classList.contains("open")) return;
  const items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !String(it.type || "").startsWith("image/")) continue;
    const file = it.getAsFile ? it.getAsFile() : null;
    if (!file) continue;
    e.preventDefault();
    try { await ingestImageFileToInsertDb(file); } catch (_) {}
    break;
  }
});

document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  const k = String(e.key || "").toLowerCase();
  if (k === "4") {
    e.preventDefault();
    toggleAppThemeMode();
    return;
  }
  if (k === "z") {
    e.preventDefault();
    toggleCodeWrapMode();
    return;
  }
  if (k !== "l") return;
  if (!document.getElementById("btnStyle")) return;
  e.preventDefault();
  openStyleModal();
});

window.addEventListener("message", (e) => {
  const data = e && e.data;
  if (!data || data.type !== MSG_OPEN_SLIDE) return;
  const idx = clamp(Number(data.index) || 0, 0, slides.length - 1);
  cur = idx;
  expandedSlideIndex = cur;
  loadCurrent();
});

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (cur < slides.length - 1) { cur++; loadCurrent(); }
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (cur > 0) { cur--; loadCurrent(); }
    return;
  }
  const k = String(e.key || "").toLowerCase();
  const active = document.activeElement;
  const inCode = active === els.code;
  if (k === "z" && !e.shiftKey && !inCode) {
    if (undoHistory()) {
      e.preventDefault();
      return;
    }
  }
  if (k === "s") { e.preventDefault(); saveCurrent(); }
  if (k === "b") { e.preventDefault(); execCmd("bold"); }
  if (k === "i") { e.preventDefault(); execCmd("italic"); }
  if (k === "u") { e.preventDefault(); execCmd("underline"); }
});

async function initApp() {
  initLinkModalWindowControls();
  initImageModalWindowControls();
  setObjectEditMode(false);
  setCodeFontSize(codeFontSize);
  setAppThemeMode(false);
  // initial: code theme follows app theme
  codeThemeFollowApp = true;
  setCodeThemeMode(appDarkMode, true);
  refreshSlideSizeUi();
  setCodeWrapMode(false);
  loadCurrent();
}

initApp();


})();

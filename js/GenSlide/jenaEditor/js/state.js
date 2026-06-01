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
let lastUndoCheckpointAt = 0;
let lastUndoCheckpointType = "";
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
  default: { w: 1280, h: 720 },
  "3:4": { w: 1080, h: 1440 },
  "4:3": { w: 1024, h: 768 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  a4: { w: 1050, h: 1485 }
};
let codeWrapEnabled = false;
let showAbsCoordButton = false;

function refreshObjectEditModeButton() {
  const btn = els.objectEditModeBtn;
  if (!btn) return;
  btn.textContent = objectEditMode ? "편집모드: ON" : "편집모드: OFF";
  btn.classList.toggle("primary", objectEditMode);
  const baseBtn = document.getElementById("btnSetBaseLayer");
  if (baseBtn) baseBtn.classList.toggle("hidden", !objectEditMode);
}
function setObjectEditMode(next) {
  objectEditMode = !!next;
  refreshObjectEditModeButton();
  const d = getWysDoc();
  if (d && d.documentElement && d.documentElement.classList) {
    d.documentElement.classList.toggle("jena-object-edit", objectEditMode);
  }
  if (objectEditMode && d && typeof lockAllObjectsAbsoluteOnObjectMode === "function") {
    try { lockAllObjectsAbsoluteOnObjectMode(d); } catch (_) {}
  }
  if (d && d.__jenaImageEditor && typeof d.__jenaImageEditor.setEnabled === "function") {
    d.__jenaImageEditor.setEnabled(objectEditMode);
  }
  if (d && d.__jenaContainerEditor && typeof d.__jenaContainerEditor.setEnabled === "function") {
    d.__jenaContainerEditor.setEnabled(objectEditMode);
  }
  try { if (typeof applyZoom === "function") applyZoom(); } catch (_) {}
  if (!objectEditMode && d) {
    // Reset selection/edit state when leaving object edit mode.
    try { if (d.activeElement && d.activeElement.blur) d.activeElement.blur(); } catch (_) {}
    setWysLayerSelection(d, null);
    hideCodeMarker();
    try { if (els.code) els.code.focus(); } catch (_) {}
  }
  try {
    window.dispatchEvent(new CustomEvent("jena-object-edit-mode", { detail: { enabled: objectEditMode } }));
  } catch (_) {}
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
  insertImgGallery: document.getElementById("insertImgGallery"),
  insertImgLinkUrl: document.getElementById("insertImgLinkUrl"),
  insertImgFile: document.getElementById("insertImgFile"),
  insertImgPasteZone: document.getElementById("insertImgPasteZone"),
  insertImgbbApiKey: document.getElementById("insertImgbbApiKey"),
  insertImgbbStatus: document.getElementById("insertImgbbStatus"),
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
  slideSizeHeight: document.getElementById("slideSizeHeight"),
  slideSizeAspectLock: document.getElementById("slideSizeAspectLock"),
  slideSizeBottomInfo: document.getElementById("slideSizeBottomInfo"),
  chkShowAbsCoordBtn: document.getElementById("chkShowAbsCoordBtn"),
  btnAbsCoordInfo: document.getElementById("btnAbsCoordInfo"),
  absCoordOverlay: document.getElementById("absCoordOverlay"),
  absCoordText: document.getElementById("absCoordText")
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

function pushGlobalUndoCheckpoint(type) {
  const kind = String(type || "generic");
  const now = Date.now();
  if (now - lastUndoCheckpointAt < 450 && lastUndoCheckpointType === kind) return false;

  let html = "";
  if (kind === "wys") {
    try { html = String(getWysHtml() || ""); } catch (_) {}
  } else {
    html = String((els && els.code && els.code.value) || "");
  }
  if (!html) html = String((slides[cur] && slides[cur].html) || "");
  if (slides[cur]) slides[cur].html = html;
  backup = html || backup;

  pushHistory();
  lastUndoCheckpointAt = now;
  lastUndoCheckpointType = kind;
  return true;
}

function highlightCodeTextContent(src) {
  let out = escapeHtml(src);
  // Basic JS-like token tinting for script/style text blocks.
  out = out.replace(
    /\b(function|const|let|var|return|if|else|for|while|class|new|import|from|export|async|await|try|catch)\b/g,
    '<span class="code-kw">$1</span>'
  );
  out = out.replace(/([A-Za-z_$][\w$]*)(\s*\()/g, '<span class="code-fn">$1</span>$2');
  return out;
}

function highlightTagToken(tagRaw) {
  const m = /^<\s*(\/?)\s*([^\s/>!?]+)?([\s\S]*?)(\/?)\s*>$/.exec(tagRaw);
  if (!m) {
    return `<span class="code-doctype">${escapeHtml(tagRaw)}</span>`;
  }
  const isClose = !!m[1];
  const tagName = String(m[2] || "");
  const attrsRaw = String(m[3] || "");
  const selfClose = !!m[4];

  let out = `<span class="code-angle">&lt;${isClose ? "/" : ""}</span>`;
  out += `<span class="code-tag">${escapeHtml(tagName)}</span>`;

  const re = /(\s+)([^\s=/>]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  let last = 0;
  let a;
  while ((a = re.exec(attrsRaw)) !== null) {
    out += escapeHtml(attrsRaw.slice(last, a.index));
    out += escapeHtml(a[1] || "");
    out += `<span class="code-attr">${escapeHtml(a[2] || "")}</span>`;
    const assign = String(a[3] || "");
    if (assign) {
      const eq = assign.indexOf("=");
      if (eq >= 0) {
        out += escapeHtml(assign.slice(0, eq));
        out += '<span class="code-eq">=</span>';
        const rhs = assign.slice(eq + 1);
        out += `<span class="code-string">${escapeHtml(rhs)}</span>`;
      } else {
        out += `<span class="code-string">${escapeHtml(assign)}</span>`;
      }
    }
    last = a.index + a[0].length;
  }
  out += escapeHtml(attrsRaw.slice(last));
  out += `<span class="code-angle">${selfClose ? "/&gt;" : "&gt;"}</span>`;
  return out;
}

function highlightCodeSource(src) {
  const s = String(src || "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      const j = end < 0 ? s.length : end + 3;
      out.push(`<span class="code-comment">${escapeHtml(s.slice(i, j))}</span>`);
      i = j;
      continue;
    }
    if (s[i] === "<") {
      let j = i + 1;
      let quote = "";
      while (j < s.length) {
        const ch = s[j];
        if (quote) {
          if (ch === quote) quote = "";
          j++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          j++;
          continue;
        }
        if (ch === ">") {
          j++;
          break;
        }
        j++;
      }
      const token = s.slice(i, j);
      out.push(highlightTagToken(token));
      i = j;
      continue;
    }
    const next = s.indexOf("<", i);
    const j = next < 0 ? s.length : next;
    out.push(highlightCodeTextContent(s.slice(i, j)));
    i = j;
  }
  return out.join("");
}

function renderCodeColorLayer() {
  if (!els.codeView) return;
  const src = String(els.code.value || "");
  const fallbackColor = (els.codeWrap && els.codeWrap.classList.contains("code-dark")) ? "#dce5f5" : "#1a2233";
  try {
    els.codeView.innerHTML = highlightCodeSource(src);
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

function getLayerCodeCandidates(el) {
  const out = [];
  const seen = new Set();
  const add = (v) => {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    if (!s || s.length < 2 || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  if (!el || !el.tagName) return out;
  const tag = String(el.tagName || "").toLowerCase();
  add(`<${tag}`);
  if (el.id) add(`id="${el.id}"`);
  const cls = String(el.getAttribute ? (el.getAttribute("class") || "") : "").trim();
  if (cls) {
    const first = cls.split(/\s+/).filter(Boolean)[0] || "";
    if (first) add(first);
    add(`class="${cls}"`);
  }
  if (tag === "img") {
    const src = String(el.getAttribute ? (el.getAttribute("src") || "") : "").trim();
    const alt = String(el.getAttribute ? (el.getAttribute("alt") || "") : "").trim();
    if (src) add(src);
    if (alt) add(alt);
  }
  const txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
  if (txt) add(txt.slice(0, 64));
  return out;
}

function findCodeIndexBySelectedLayer(el) {
  const src = String(els.code.value || "");
  if (!src || !el || !el.tagName) return clamp(lastCodeIndex || 0, 0, Math.max(0, src.length - 1));
  const cands = getLayerCodeCandidates(el);
  for (let i = 0; i < cands.length; i++) {
    const pos = src.indexOf(cands[i]);
    if (pos >= 0) return pos;
  }
  const tag = String(el.tagName || "").toLowerCase();
  const tagPos = src.indexOf(`<${tag}`);
  if (tagPos >= 0) return tagPos;
  return clamp(lastCodeIndex || 0, 0, Math.max(0, src.length - 1));
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

function syncCodeMarkerFromWys(shouldCenter, moveCaret) {
  const d = getWysDoc();
  const selectedLayer = d ? (d.__jenaLayerSelected || null) : null;
  if (objectEditMode && selectedLayer) {
    const idx = findCodeIndexBySelectedLayer(selectedLayer);
    lastCodeIndex = idx;
    setCodeMarkerByIndex(idx, shouldCenter);
    if (moveCaret) {
      const i = clamp(Number(idx) || 0, 0, String(els.code.value || "").length);
      els.code.focus();
      els.code.setSelectionRange(i, i);
    }
    return;
  }
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

function scheduleCodeMarkerSync(shouldCenter, moveCaret) {
  clearTimeout(codeMarkerTimer);
  codeMarkerTimer = setTimeout(() => syncCodeMarkerFromWys(shouldCenter, moveCaret), 60);
}

function parseAttrsFromTag(tagText) {
  const out = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(String(tagText || ""))) !== null) {
    out[String(m[1] || "").toLowerCase()] = String(m[2] || "");
  }
  return out;
}

function getCodeLineAtIndex(index) {
  const src = String(els.code.value || "");
  const i = clamp(Number(index) || 0, 0, src.length);
  const s = src.lastIndexOf("\n", Math.max(0, i - 1)) + 1;
  const eRaw = src.indexOf("\n", i);
  const e = eRaw < 0 ? src.length : eRaw;
  return src.slice(s, e);
}

function findWysElementByCodeIndex(index, selectedText) {
  const d = getWysDoc();
  if (!d || !d.body) return null;
  const src = String(els.code.value || "");
  if (!src) return null;
  const i = clamp(Number(index) || 0, 0, Math.max(0, src.length - 1));

  const selTxt = String(selectedText || "").replace(/\s+/g, " ").trim();
  if (selTxt && selTxt.length >= 2 && !selTxt.includes("<")) {
    const all = Array.from(d.body.querySelectorAll("*"));
    const hit = all.find((el) => String(el.textContent || "").replace(/\s+/g, " ").includes(selTxt));
    if (hit) return hit;
  }

  const lt = src.lastIndexOf("<", i);
  const gt = lt >= 0 ? src.indexOf(">", lt) : -1;
  if (lt < 0 || gt < 0) return null;
  const tagText = src.slice(lt, gt + 1);
  if (/^<\//.test(tagText) || /^<!/.test(tagText)) return null;
  const tagNameMatch = /^<\s*([a-zA-Z][\w:-]*)/.exec(tagText);
  if (!tagNameMatch) return null;
  const tagName = String(tagNameMatch[1] || "").toLowerCase();
  const attrs = parseAttrsFromTag(tagText);

  if (attrs.id) {
    const byId = d.getElementById(attrs.id);
    if (byId) return byId;
  }
  if (tagName === "img" && attrs.src) {
    const imgExact = d.querySelector(`img[src="${attrs.src.replace(/"/g, '\\"')}"]`);
    if (imgExact) return imgExact;
    const imgs = Array.from(d.querySelectorAll("img"));
    const srcTail = attrs.src.split("/").pop();
    const imgTail = imgs.find((img) => String(img.getAttribute("src") || "").includes(srcTail || attrs.src));
    if (imgTail) return imgTail;
  }
  if (attrs.class) {
    const firstClass = attrs.class.split(/\s+/).filter(Boolean)[0];
    if (firstClass) {
      const byClass = d.querySelector(`${tagName}.${firstClass}`);
      if (byClass) return byClass;
    }
  }
  const byTag = d.querySelector(tagName);
  if (byTag) return byTag;

  const line = getCodeLineAtIndex(i);
  const lineTxt = String(line || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (lineTxt.length >= 2) {
    const all = Array.from(d.body.querySelectorAll("*"));
    const hit = all.find((el) => String(el.textContent || "").replace(/\s+/g, " ").includes(lineTxt));
    if (hit) return hit;
  }
  return null;
}

function syncWysSelectionFromCode(index, selectedText, shouldScroll) {
  const d = getWysDoc();
  if (!d) return false;
  const target = findWysElementByCodeIndex(index, selectedText);
  if (!target) {
    setWysLayerSelection(d, null);
    return false;
  }
  setWysLayerSelection(d, target);
  if (shouldScroll && target.scrollIntoView) {
    try { target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); } catch (_) {}
  }
  return true;
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
  // Keep direct image selection as-is so layer controls can target the image itself.
  const isImg = next && next.nodeType === 1 && String(next.tagName || "").toLowerCase() === "img";
  if (!isImg && next && next.closest) {
    const tb = next.closest(".jena-textbox");
    if (tb) next = tb;
  }
  if (isImg) {
    // keep img itself
  }
  const prev = doc.__jenaLayerSelected || null;
  if (prev && prev.classList) prev.classList.remove("jena-layer-selected");
  if (!next || !doc.body || !doc.body.contains(next)) {
    doc.__jenaLayerSelected = null;
    try { window.dispatchEvent(new CustomEvent("jena-layer-selection", { detail: { el: null } })); } catch (_) {}
    return;
  }
  doc.__jenaLayerSelected = next;
  if (next.classList) next.classList.add("jena-layer-selected");
  try { window.dispatchEvent(new CustomEvent("jena-layer-selection", { detail: { el: next } })); } catch (_) {}
  if (objectEditMode) {
    scheduleCodeMarkerSync(true, true);
  }
}

function getWysBaseLayer(doc) {
  if (!doc || !doc.body) return null;
  let base = doc.__jenaBaseLayer || null;
  if (base && doc.body.contains(base)) return base;
  base = doc.querySelector('[data-jena-base-layer="1"]') || null;
  if (!base) base = doc.querySelector(".slide") || doc.body;
  if (!base.getAttribute || String(base.getAttribute("data-jena-ui") || "") === "1") {
    base = doc.querySelector(".slide") || doc.body;
  }
  if (base && base.setAttribute) base.setAttribute("data-jena-base-layer", "1");
  doc.__jenaBaseLayer = base;
  return base;
}

function ensureWysBaseLayer(doc) {
  const base = getWysBaseLayer(doc);
  if (!doc || !doc.querySelectorAll) return base;
  const all = doc.querySelectorAll('[data-jena-base-layer="1"]');
  for (let i = 0; i < all.length; i++) {
    if (all[i] !== base) all[i].removeAttribute("data-jena-base-layer");
  }
  return base;
}

function setSelectedAsBaseLayer() {
  const d = getWysDoc();
  if (!d || !d.body) return false;
  let el = d.__jenaLayerSelected || null;
  if (!el) return false;
  if (el.closest) {
    const tb = el.closest(".jena-textbox");
    if (tb) return false;
  }
  if (String((el.tagName || "")).toLowerCase() === "img") return false;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return false;
  const all = d.querySelectorAll('[data-jena-base-layer="1"]');
  for (let i = 0; i < all.length; i++) all[i].removeAttribute("data-jena-base-layer");
  el.setAttribute("data-jena-base-layer", "1");
  d.__jenaBaseLayer = el;
  const html = getWysHtml();
  applyWysObjectChange(html, true);
  return true;
}

function deleteSelectedLayer() {
  const d = getWysDoc();
  if (!d || !d.body) return false;
  let el = d.__jenaLayerSelected || null;
  if (!el) return false;
  const isImg = el && el.nodeType === 1 && String(el.tagName || "").toLowerCase() === "img";
  if (!isImg && el.closest) {
    const tb = el.closest(".jena-textbox");
    if (tb) el = tb;
  }
  const base = ensureWysBaseLayer(d);
  if (!el || !d.body.contains(el) || el === d.body || el === base) return false;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return false;
  const moveId = el.getAttribute ? String(el.getAttribute("data-jena-move-id") || "").trim() : "";
  if (moveId) {
    const ph = d.querySelector(`[data-jena-placeholder-for="${moveId}"]`);
    if (ph && ph.remove) ph.remove();
  }
  el.remove();
  setWysLayerSelection(d, null);
  const html = getWysHtml();
  applyWysObjectChange(html, true);
  return true;
}

function changeSelectedLayerOrder(step) {
  const d = getWysDoc();
  if (!d || !d.defaultView) return;
  let el = d.__jenaLayerSelected || null;
  const isImg = el && el.nodeType === 1 && String(el.tagName || "").toLowerCase() === "img";
  if (!isImg && el && el.closest) {
    const tb = el.closest(".jena-textbox");
    if (tb && (el.classList && (el.classList.contains("jena-textbox-content") || el.classList.contains("jena-textbox-handle")))) {
      el = tb;
    }
  }
  if (!el || !d.body || !d.body.contains(el)) return;
  if (el.getAttribute && String(el.getAttribute("data-jena-ui") || "") === "1") return;
  const base = ensureWysBaseLayer(d);
  if (el === base) return;

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
  const baseCs = base ? d.defaultView.getComputedStyle(base) : null;
  let baseZ = parseInt(String((baseCs && baseCs.zIndex) || ""), 10);
  if (!Number.isFinite(baseZ)) baseZ = 0;
  // Allow normal one-step down without forcing objects to jump upward.
  // Keep the floor at base z-index (not base+1) so z:0 objects can still move down.
  const floorZ = base ? baseZ : minZ;

  let curZ = parseInt(String(el.style.zIndex || ""), 10);
  if (!Number.isFinite(curZ)) curZ = parseInt(String((cs && cs.zIndex) || ""), 10);
  if (!Number.isFinite(curZ)) curZ = 0;

  let nextZ = curZ;
  if (curZ < floorZ) curZ = floorZ;
  if (step === "top") {
    nextZ = Math.max(curZ + 1, maxZ + 1);
  } else if (step === "bottom") {
    nextZ = floorZ;
  } else if (Number(step) > 0) {
    // one-step up: move to the next higher existing z-level
    const higher = zVals.filter((z) => z > curZ).sort((a, b) => a - b);
    if (higher.length) nextZ = higher[0];
    else nextZ = curZ + 1;
  } else if (Number(step) < 0) {
    // one-step down: move to the next lower existing z-level (not below base floor)
    const lower = zVals.filter((z) => z < curZ && z >= floorZ).sort((a, b) => b - a);
    if (lower.length) nextZ = lower[0];
    else nextZ = Math.max(curZ - 1, floorZ);
  }
  el.style.zIndex = String(clamp(nextZ, -2147483000, 2147483000));

  const html = getWysHtml();
  applyWysObjectChange(html, true);
}


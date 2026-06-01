function wrapTag(tag) {
  const ta = els.code;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  if (String(tag || "").toLowerCase() === "br") {
    insertBrAtCodeCaret();
    return;
  }
  const snip = `<${tag}>${sel}</${tag}>`;
  const next = ta.value.slice(0, s) + snip + ta.value.slice(e);
  const selStart = s + tag.length + 2;
  const selEnd = selStart + sel.length;
  applyCodeText(next, selStart, selEnd);
}

function insertBrAtCodeCaret() {
  const ta = els.code;
  if (!ta) return;
  const s = Number(ta.selectionStart) || 0;
  const e = Number(ta.selectionEnd) || 0;
  const text = String(ta.value || "");
  const snip = "<br>";
  const next = text.slice(0, s) + snip + text.slice(e);
  const caret = s + snip.length;
  applyCodeText(next, caret, caret);
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
  // If HTML code is edited by toolbar actions, end object edit mode.
  if (typeof objectEditMode !== "undefined" && objectEditMode && typeof setObjectEditMode === "function") {
    setObjectEditMode(false);
  }
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


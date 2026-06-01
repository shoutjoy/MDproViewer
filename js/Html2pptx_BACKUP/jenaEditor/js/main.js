
function pickControl(id, action) {
  if (id) {
    const byId = document.getElementById(id);
    if (byId) return byId;
  }
  if (action) {
    return document.querySelector(`[data-action="${action}"]`);
  }
  return null;
}

let workViewMode = "twin";
function setWorkViewMode(mode) {
  const next = (mode === "code" || mode === "editor") ? mode : "twin";
  workViewMode = next;
  const root = document.getElementById("workSplitRoot");
  if (!root) return;
  root.classList.remove("mode-code", "mode-editor");
  if (next === "code") root.classList.add("mode-code");
  if (next === "editor") root.classList.add("mode-editor");
  const bTwin = document.getElementById("btnViewTwin");
  const bCode = document.getElementById("btnViewCode");
  const bEditor = document.getElementById("btnViewEditor");
  if (bTwin) bTwin.classList.toggle("primary", next === "twin");
  if (bCode) bCode.classList.toggle("primary", next === "code");
  if (bEditor) bEditor.classList.toggle("primary", next === "editor");
  try { applyZoom(); } catch (_) {}
}

function bindClick(id, action, handler) {
  const el = pickControl(id, action);
  if (el) el.onclick = handler;
}

bindClick("btnAdd", null, openAddModal);
bindClick("btnResetSlides", null, resetSlidesWorkspace);
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
let lastSlideWheelNavAt = 0;
if (els.slides) {
  els.slides.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const now = Date.now();
    if (now - lastSlideWheelNavAt < 120) {
      e.preventDefault();
      return;
    }
    const dy = Number(e.deltaY) || 0;
    if (Math.abs(dy) < 2) return;
    if (dy > 0) {
      if (cur < slides.length - 1) {
        cur++;
        loadCurrent();
      }
    } else {
      if (cur > 0) {
        cur--;
        loadCurrent();
      }
    }
    lastSlideWheelNavAt = now;
    e.preventDefault();
  }, { passive: false });
}
document.getElementById("btnSave").onclick = saveCurrent;
document.getElementById("btnRevert").onclick = revertCurrent;
document.getElementById("btnZoomIn").onclick = () => { zoom = clamp(zoom + 0.1, 0.2, 2); applyZoom(); };
document.getElementById("btnZoomOut").onclick = () => { zoom = clamp(zoom - 0.1, 0.2, 2); applyZoom(); };
bindClick("btnViewTwin", null, () => setWorkViewMode("twin"));
bindClick("btnViewCode", null, () => setWorkViewMode("code"));
bindClick("btnViewEditor", null, () => setWorkViewMode("editor"));
bindClick("btnWrap", "code-wrap", toggleCodeWrapMode);
bindClick("btnCodeTheme", "code-theme", toggleCodeThemeMode);
bindClick("btnCodeFontInc", "code-font-inc", () => setCodeFontSize(codeFontSize + 1));
bindClick("btnCodeFontDec", "code-font-dec", () => setCodeFontSize(codeFontSize - 1));
bindClick("btnFormat", "code-format", () => { applyCodeText(formatHtml(els.code.value), 0, 0); });
bindClick("btnFindReplace", "code-find-replace", openFindReplace);
bindClick("btnFindPrev", "code-find-prev", findPrevInCode);
bindClick("btnFindNext", "code-find-next", findNextInCode);
bindClick("btnReplaceOne", "code-replace-one", replaceCurrentInCode);
bindClick("btnReplaceAll", "code-replace-all", replaceAllInCode);
bindClick("btnFindClose", "code-find-close", closeFindReplace);
document.getElementById("btnExport").onclick = exportMpp;
document.getElementById("btnImport").onclick = () => els.fileInput.click();
document.getElementById("btnImageExport").onclick = () => { exportImage().catch(() => {}); };
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
const btnAbsCoordInfo = document.getElementById("btnAbsCoordInfo");
if (btnAbsCoordInfo) btnAbsCoordInfo.onclick = () => openAbsCoordInfoModal();
const btnAbsCoordClose = document.getElementById("btnAbsCoordClose");
if (btnAbsCoordClose) btnAbsCoordClose.onclick = () => closeAbsCoordInfoModal();
const btnAbsCoordOk = document.getElementById("btnAbsCoordOk");
if (btnAbsCoordOk) btnAbsCoordOk.onclick = () => closeAbsCoordInfoModal();
const btnAbsCoordCopy = document.getElementById("btnAbsCoordCopy");
if (btnAbsCoordCopy) btnAbsCoordCopy.onclick = async () => {
  const t = els.absCoordText ? String(els.absCoordText.value || "") : "";
  if (!t) return;
  try { await navigator.clipboard.writeText(t); } catch (_) {}
};

els.addOverlay.addEventListener("click", (e) => {
  if (e.target === els.addOverlay) closeAddModal();
});

els.addPaste.addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData("text");
  els.addPaste.value = text;
});

bindClick("btnSyncToWys", "sync-code-to-editor", () => loadWys(els.code.value));
bindClick("btnSyncToCode", "sync-editor-to-code", () => {
  const html = getWysHtml();
  els.code.value = html;
  renderCodeLineNumbers();
  scheduleAutoSave(html);
});

function exitObjectModeForCodeEditing() {
  if (!objectEditMode) return;
  setObjectEditMode(false);
}

els.code.addEventListener("input", () => {
  // Editing in HTML code has priority over object edit mode.
  exitObjectModeForCodeEditing();
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

function syncEditorByCodeCaret(shouldScroll) {
  if (!objectEditMode) return;
  const s = Number(els.code.selectionStart) || 0;
  const e = Number(els.code.selectionEnd) || 0;
  const picked = e > s ? String(els.code.value || "").slice(s, e) : "";
  syncWysSelectionFromCode(s, picked, !!shouldScroll);
}

els.code.addEventListener("mouseup", () => syncEditorByCodeCaret(true));
els.code.addEventListener("keyup", (e) => {
  const nav = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
  if (nav.has(String(e.key || "")) || e.key === "Enter") syncEditorByCodeCaret(false);
});

els.code.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = String(e.key || "");
  // User intends to edit HTML code -> leave object mode.
  const isCodeEditIntent =
    key === "Backspace" ||
    key === "Delete" ||
    key === "Enter" ||
    key === "Tab" ||
    (!mod && key.length === 1);
  if (isCodeEditIntent) exitObjectModeForCodeEditing();

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    insertBrAtCodeCaret();
    return;
  }
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
if (btnLayerUp) btnLayerUp.onclick = () => {
  if (typeof changeTextBoxLayerOrder === "function" && changeTextBoxLayerOrder(1)) return;
  changeSelectedLayerOrder(1);
};
const btnLayerDown = document.getElementById("btnLayerDown");
if (btnLayerDown) btnLayerDown.onclick = () => {
  if (typeof changeTextBoxLayerOrder === "function" && changeTextBoxLayerOrder(-1)) return;
  changeSelectedLayerOrder(-1);
};
const btnLayerTop = document.getElementById("btnLayerTop");
if (btnLayerTop) btnLayerTop.onclick = () => {
  if (typeof bringSelectedObjectToFront === "function" && bringSelectedObjectToFront()) return;
  changeSelectedLayerOrder("top");
};
const btnLayerBottom = document.getElementById("btnLayerBottom");
if (btnLayerBottom) btnLayerBottom.onclick = () => {
  if (typeof sendSelectedObjectToBack === "function" && sendSelectedObjectToBack()) return;
  changeSelectedLayerOrder("bottom");
};
const btnObjectDel = document.getElementById("btnObjectDel");
if (btnObjectDel) btnObjectDel.onclick = () => { deleteSelectedLayer(); };
const btnSetBaseLayer = document.getElementById("btnSetBaseLayer");
if (btnSetBaseLayer) btnSetBaseLayer.onclick = () => { setSelectedAsBaseLayer(); };
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
}
if (els.quickHiliteColor) {
  els.quickHiliteColor.addEventListener("mousedown", saveWysSelectionRange);
}

let pendingColorApplyType = "";
function hideColorApplyPopup() {
  const btn = document.getElementById("btnColorApplyPopup");
  if (!btn) return;
  btn.classList.add("hidden");
  pendingColorApplyType = "";
}

function showColorApplyPopup(type, anchorInput) {
  const btn = document.getElementById("btnColorApplyPopup");
  if (!btn || !anchorInput) return;
  pendingColorApplyType = type === "hilite" ? "hilite" : "text";
  btn.textContent = pendingColorApplyType === "hilite" ? "H apply" : "T apply";
  const r = anchorInput.getBoundingClientRect();
  // Place apply button above the color input first so it does not hide behind browser color picker.
  const btnW = Math.max(72, btn.offsetWidth || 72);
  const btnH = Math.max(28, btn.offsetHeight || 28);
  const margin = 8;
  let left = Math.round(r.right - btnW);
  if (!Number.isFinite(left)) left = Math.round(r.left);
  left = Math.max(margin, Math.min(left, window.innerWidth - btnW - margin));

  let top = Math.round(r.top - btnH - margin);
  if (top < margin) top = Math.round(r.bottom + margin);
  top = Math.max(margin, Math.min(top, window.innerHeight - btnH - margin));

  btn.style.left = `${left}px`;
  btn.style.top = `${top}px`;
  btn.classList.remove("hidden");
}

if (els.quickTextColor) {
  const openTextApply = () => showColorApplyPopup("text", els.quickTextColor);
  els.quickTextColor.addEventListener("focus", openTextApply);
  els.quickTextColor.addEventListener("click", openTextApply);
  els.quickTextColor.addEventListener("input", openTextApply);
}
if (els.quickHiliteColor) {
  const openHiliteApply = () => showColorApplyPopup("hilite", els.quickHiliteColor);
  els.quickHiliteColor.addEventListener("focus", openHiliteApply);
  els.quickHiliteColor.addEventListener("click", openHiliteApply);
  els.quickHiliteColor.addEventListener("input", openHiliteApply);
}

const btnColorApplyPopup = document.getElementById("btnColorApplyPopup");
if (btnColorApplyPopup) {
  btnColorApplyPopup.onclick = () => {
    if (!pendingColorApplyType) return;
    applyQuickFormattingWithCommit(pendingColorApplyType);
    hideColorApplyPopup();
  };
}

document.addEventListener("mousedown", (e) => {
  const t = e.target;
  const btn = document.getElementById("btnColorApplyPopup");
  if (!btn || btn.classList.contains("hidden")) return;
  if (t === btn || (btn.contains && btn.contains(t))) return;
  if (els.quickTextColor && (t === els.quickTextColor || (t.closest && t.closest(".quick-color-wrap")))) return;
  if (els.quickHiliteColor && (t === els.quickHiliteColor || (t.closest && t.closest(".quick-color-wrap")))) return;
  hideColorApplyPopup();
});

els.code.addEventListener("beforeinput", () => {
  try { if (typeof pushGlobalUndoCheckpoint === "function") pushGlobalUndoCheckpoint("code"); } catch (_) {}
});

window.addEventListener("resize", hideColorApplyPopup);
window.addEventListener("scroll", hideColorApplyPopup, true);

const btnInsertModeLink = document.getElementById("btnInsertModeLink");
if (btnInsertModeLink) btnInsertModeLink.onclick = () => setInsertMode("link");
const btnInsertModeImg = document.getElementById("btnInsertModeImg");
if (btnInsertModeImg) btnInsertModeImg.onclick = () => setInsertMode("img");
const btnImgSrcUrl = document.getElementById("btnImgSrcUrl");
if (btnImgSrcUrl) btnImgSrcUrl.onclick = () => setImgSource("url");
const btnImgSrcDb = document.getElementById("btnImgSrcDb");
if (btnImgSrcDb) btnImgSrcDb.onclick = () => setImgSource("db");
if (els.insertImgDbSelect) {
  els.insertImgDbSelect.addEventListener("change", () => {
    if (typeof syncInsertImgGallerySelection === "function") syncInsertImgGallerySelection();
  });
}
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
if (els.absCoordOverlay) {
  els.absCoordOverlay.addEventListener("click", (e) => {
    if (e.target === els.absCoordOverlay) closeAbsCoordInfoModal();
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

function refreshTextBoxSelectionTools() {
  const tbGroup = document.getElementById("textBoxSelectionTools");
  const objGroup = document.getElementById("objectLayerTools");
  const d = getWysDoc();
  const selected = d && d.__jenaLayerSelected ? d.__jenaLayerSelected : null;
  const isTextBox = !!(selected && selected.classList && selected.classList.contains("jena-textbox"));
  if (tbGroup) tbGroup.classList.toggle("hidden", !(objectEditMode && isTextBox));
  if (objGroup) objGroup.classList.toggle("hidden", !(objectEditMode && selected));
}

window.addEventListener("jena-layer-selection", refreshTextBoxSelectionTools);

function bindPanelSplitter() {
  const root = document.getElementById("workSplitRoot");
  const splitter = document.getElementById("panelSplitter");
  if (!root || !splitter || root.dataset.splitBound === "1") return;
  root.dataset.splitBound = "1";

  let dragging = false;
  let moved = false;
  let rafId = 0;
  const SPLITTER_TRACK_WIDTH = 8;

  function schedulePreviewRelayout() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      try { applyZoom(); } catch (_) {}
    });
  }

  function stabilizeAfterPanelResize() {
    // Refresh zoom/stage size first.
    try { applyZoom(); } catch (_) {}
    // Then force a safe WYS refresh to avoid broken layout state after splitter drag.
    let html = "";
    try { html = getWysHtml(); } catch (_) {}
    if (!html) html = String(els.code.value || "");
    if (!html) return;
    els.code.value = html;
    renderCodeLineNumbers();
    scheduleAutoSave(html);
    lastLoadedWysHtml = "";
    loadWys(html);
  }

  function setLeftWidthByClientX(clientX) {
    const rect = root.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = clamp(ratio, 0.28, 0.72);
    const next = `${Math.round(clamped * 1000) / 10}%`;
    root.style.setProperty("--left-pane-width", next);
  }

  splitter.addEventListener("mousedown", (e) => {
    if (workViewMode !== "twin") return;
    e.preventDefault();
    dragging = true;
    moved = false;
    document.body.classList.add("split-resizing");
    splitter.classList.add("dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    moved = true;
    setLeftWidthByClientX(e.clientX);
    schedulePreviewRelayout();
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("split-resizing");
    splitter.classList.remove("dragging");
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (moved) stabilizeAfterPanelResize();
  });
}

function initSlideResizeHandle() {
  const stage = els.stage;
  if (!stage || stage.dataset.slideResizeBound === "1") return;
  stage.dataset.slideResizeBound = "1";
  stage.classList.add("stage-resizable");

  const handle = document.createElement("div");
  handle.id = "slideSizeHandle";
  handle.className = "slide-size-handle";
  handle.title = "Resize slide size";

  const guide = document.createElement("div");
  guide.id = "slideOriginGuide";
  guide.className = "slide-origin-guide hidden";

  stage.appendChild(guide);
  stage.appendChild(handle);

  let dragging = false;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  let sh = 0;
  let startScale = 1;
  let guideW = 0;
  let guideH = 0;
  let activePointerId = null;

  function getCurrentScale() {
    const t = String(els.wys && els.wys.style ? (els.wys.style.transform || "") : "");
    const m = /scale\(([^)]+)\)/.exec(t);
    const s = m ? parseFloat(m[1]) : 1;
    return Number.isFinite(s) && s > 0 ? s : 1;
  }

  function placeGuide() {
    guide.style.left = "0px";
    guide.style.top = "0px";
    guide.style.width = `${Math.round(guideW)}px`;
    guide.style.height = `${Math.round(guideH)}px`;
  }

  function updateHandleVisibility() {
    handle.classList.toggle("hidden", !objectEditMode);
  }

  function stopResizeSession() {
    dragging = false;
    activePointerId = null;
    guide.classList.add("hidden");
    document.body.classList.remove("slide-resizing");
    try { applyZoom(); } catch (_) {}
  }

  handle.addEventListener("pointerdown", (e) => {
    if (!objectEditMode) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    activePointerId = e.pointerId;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    sx = e.clientX;
    sy = e.clientY;
    sw = slideWidth;
    sh = slideHeight;
    startScale = getCurrentScale();
    guideW = sw * startScale;
    guideH = sh * startScale;
    placeGuide();
    guide.classList.remove("hidden");
    document.body.classList.add("slide-resizing");
  }, true);

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if ((e.buttons & 1) !== 1) {
      stopResizeSession();
      return;
    }
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const scale = startScale > 0 ? startScale : 1;
    const nextW = clamp(Math.round(sw + (dx / scale)), 320, 4000);
    const nextH = clamp(Math.round(sh + (dy / scale)), 240, 4000);
    slideWidth = nextW;
    slideHeight = nextH;
    applyZoom();
    if (typeof refreshSlideSizeUi === "function") refreshSlideSizeUi();
    if (typeof renderObjLayerPanel === "function") renderObjLayerPanel();
  }, true);

  handle.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    stopResizeSession();
  }, true);

  handle.addEventListener("pointercancel", (e) => {
    if (!dragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    stopResizeSession();
  }, true);

  window.addEventListener("jena-object-edit-mode", updateHandleVisibility);
  window.addEventListener("jena-layer-selection", updateHandleVisibility);
  updateHandleVisibility();
}

document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && objectEditMode) {
    const active = document.activeElement;
    const inCode = active === els.code;
    if (!inCode && deleteSelectedLayer()) {
      e.preventDefault();
      return;
    }
  }
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
  if (k === "z" && !e.shiftKey) {
    if (undoHistory()) {
      e.preventDefault();
      e.stopPropagation();
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
  if (typeof initAbsCoordButtonSetting === "function") initAbsCoordButtonSetting();
  bindPanelSplitter();
  setWorkViewMode("twin");
  initSlideResizeHandle();
  loadCurrent();
  if (typeof initObjLayerPanel === "function") initObjLayerPanel();
  refreshTextBoxSelectionTools();
}

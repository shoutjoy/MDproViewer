
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

function bindClick(id, action, handler) {
  const el = pickControl(id, action);
  if (el) el.onclick = handler;
}

function setWorkViewMode(mode) {
  const root = document.getElementById("workSplitRoot");
  if (!root) return;
  const normalized = mode === "code-only" || mode === "editor-only" ? mode : "both";
  root.classList.remove("view-code-only", "view-editor-only");
  if (normalized === "code-only") root.classList.add("view-code-only");
  if (normalized === "editor-only") root.classList.add("view-editor-only");

  const btnBoth = document.getElementById("btnViewBoth");
  const btnCode = document.getElementById("btnViewCodeOnly");
  const btnEditor = document.getElementById("btnViewEditorOnly");
  if (btnBoth) btnBoth.classList.toggle("active", normalized === "both");
  if (btnCode) btnCode.classList.toggle("active", normalized === "code-only");
  if (btnEditor) btnEditor.classList.toggle("active", normalized === "editor-only");

  try { applyZoom(); } catch (_) {}
}

bindClick("btnAdd", null, openAddModal);
bindClick("btnResetSlides", null, resetSlidesWorkspace);
document.getElementById("btnGallery").onclick = openGalleryWindow;
bindClick("btnViewBoth", null, () => setWorkViewMode("both"));
bindClick("btnViewCodeOnly", null, () => setWorkViewMode("code-only"));
bindClick("btnViewEditorOnly", null, () => setWorkViewMode("editor-only"));
document.getElementById("btnSlideShow").onclick = () => { openSlideShowWindow().catch(() => {}); };
document.getElementById("btnSlideSettings").onclick = openSlideSettingsModal;
const btnSlideSettingsBottom = document.getElementById("btnSlideSettingsBottom");
if (btnSlideSettingsBottom) btnSlideSettingsBottom.onclick = openSlideSettingsModal;
const btnSaveChangesBottom = document.getElementById("btnSaveChangesBottom");
if (btnSaveChangesBottom) btnSaveChangesBottom.onclick = () => {
  let saved = false;
  try {
    if (typeof getWysHtml === "function" && typeof applyWysObjectChange === "function") {
      const html = getWysHtml();
      applyWysObjectChange(html, true);
      saved = true;
    }
  } catch (_) {}
  if (!saved) {
    try { if (typeof saveCurrent === "function") saveCurrent(); } catch (_) {}
  }
  const prev = btnSaveChangesBottom.textContent;
  btnSaveChangesBottom.textContent = "저장됨";
  setTimeout(() => {
    btnSaveChangesBottom.textContent = prev || "변경사항 저장";
  }, 900);
};
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
document.getElementById("btnZoomIn").onclick = () => { zoom = clamp(zoom + 0.1, 0.2, 3); applyZoom(); };
document.getElementById("btnZoomOut").onclick = () => { zoom = clamp(zoom - 0.1, 0.2, 3); applyZoom(); };

function bindCtrlWheelZoom() {
  const onWheelZoom = (e) => {
    if (!e || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const dy = Number(e.deltaY) || 0;
    if (dy === 0) return;
    const step = dy < 0 ? 0.05 : -0.05;
    zoom = clamp(zoom + step, 0.2, 3);
    applyZoom();
  };

  const area = document.querySelector(".editor-canvas-area");
  if (area && area.dataset.ctrlWheelZoomBound !== "1") {
    area.dataset.ctrlWheelZoomBound = "1";
    area.addEventListener("wheel", onWheelZoom, { passive: false });
  }

  window.addEventListener("jena-wys-loaded", (ev) => {
    const d = ev && ev.detail ? ev.detail.doc : null;
    if (!d || d.__jenaCtrlWheelZoomBound) return;
    d.__jenaCtrlWheelZoomBound = true;
    d.addEventListener("wheel", onWheelZoom, { passive: false });
    d.addEventListener("selectionchange", () => postScholarSelectionFromHtmlCode(false));
    d.addEventListener("mouseup", () => postScholarSelectionFromHtmlCode(false));
    d.addEventListener("keyup", () => postScholarSelectionFromHtmlCode(false));
  });
}
bindCtrlWheelZoom();

function bindAltWheelCodeFontZoom() {
  const onCodeFontWheel = (e) => {
    if (!e || !e.altKey || e.ctrlKey || e.metaKey) return;
    const dy = Number(e.deltaY) || 0;
    if (dy === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setCodeFontSize(codeFontSize + (dy < 0 ? 1 : -1));
  };
  const targets = [els.codeWrap, els.code, els.codeView, els.codeLines].filter(Boolean);
  targets.forEach((target) => {
    if (target.dataset.altWheelCodeFontBound === "1") return;
    target.dataset.altWheelCodeFontBound = "1";
    target.addEventListener("wheel", onCodeFontWheel, { passive: false });
  });
}
bindAltWheelCodeFontZoom();

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
const btnScholarAI = document.getElementById("btnScholarAI");
if (btnScholarAI) {
  btnScholarAI.onclick = () => {
    try { postScholarSelectionFromHtmlCode(true); } catch (_) {}
  };
}
document.getElementById("btnCloseAdd").onclick = closeAddModal;
document.getElementById("btnCancelAdd").onclick = closeAddModal;
document.getElementById("btnConfirmAdd").onclick = confirmAddModal;
document.getElementById("btnInDbClose").onclick = closeInDbModal;
document.getElementById("btnInDbLoad").onclick = () => { loadSelectedInDb().catch(() => {}); };
document.getElementById("btnInDbDelete").onclick = () => { deleteSelectedInDb().catch(() => {}); };
document.getElementById("btnSlideSettingsClose").onclick = closeSlideSettingsModal;
document.getElementById("btnSlideSettingsCancel").onclick = closeSlideSettingsModal;
document.getElementById("btnSlideSettingsApply").onclick = applySlideSizeSettings;
const btnSlideSettingsResetDefault = document.getElementById("btnSlideSettingsResetDefault");
if (btnSlideSettingsResetDefault) btnSlideSettingsResetDefault.onclick = () => {
  if (els.slideSizeWidth) els.slideSizeWidth.value = "1280";
  if (els.slideSizeHeight) els.slideSizeHeight.value = "720";
  applySlideSizeSettings();
};
if (els.slideSizePreset) {
  els.slideSizePreset.addEventListener("change", applySlideSizePreset);
}
if (els.slideSizeAspectLock) {
  els.slideSizeAspectLock.addEventListener("change", () => {
    if (typeof setSlideAspectLockEnabled === "function") {
      setSlideAspectLockEnabled(!!els.slideSizeAspectLock.checked);
    }
  });
}
if (els.slideSizeWidth) {
  els.slideSizeWidth.addEventListener("input", () => {
    if (typeof syncSlideAspectByWidthInput === "function") syncSlideAspectByWidthInput();
  });
}
if (els.slideSizeHeight) {
  els.slideSizeHeight.addEventListener("input", () => {
    if (typeof syncSlideAspectByHeightInput === "function") syncSlideAspectByHeightInput();
  });
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

let __lastPostedScholarSelection = null;
function getScholarSelectionFromWys() {
  try {
    const d = (typeof getWysDoc === "function") ? getWysDoc() : (els && els.wys && els.wys.contentDocument);
    if (!d || typeof d.getSelection !== "function") return "";
    const sel = d.getSelection();
    const text = sel && !sel.isCollapsed ? String(sel.toString() || "").trim() : "";
    if (text) return text;
    const active = d.activeElement;
    if (active && (active.isContentEditable || active.getAttribute("contenteditable") === "true")) {
      const activeText = String(active.innerText || active.textContent || "").trim();
      if (activeText) return activeText;
    }
  } catch (_) {}
  return "";
}

function postScholarSelectionFromHtmlCode(forceOpen) {
  try {
    if (!els || !els.code) return;
    const s = Number(els.code.selectionStart) || 0;
    const e = Number(els.code.selectionEnd) || s;
    let picked = getScholarSelectionFromWys();
    if (!picked) picked = e > s ? String(els.code.value || "").slice(s, e) : "";
    if (forceOpen && !String(picked || "").trim()) {
      picked = String(els.code.value || "").trim();
      if (!picked && typeof getWysHtml === "function") picked = String(getWysHtml() || "").trim();
    }
    if (!forceOpen && picked === __lastPostedScholarSelection) return;
    __lastPostedScholarSelection = picked;

    let handled = false;
    try {
      if (window.parent && typeof window.parent.LiveAISetSelectedText === "function") {
        window.parent.LiveAISetSelectedText(picked, { source: "genslide", forceOpen: !!forceOpen });
        handled = true;
      }
    } catch (_) {}
    if (!handled) {
      if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({
          type: "mdv-genslide-selection-changed",
          text: picked,
          forceOpen: !!forceOpen
        }, "*");
      }
    }
  } catch (_) {}
}

els.code.addEventListener("mouseup", () => syncEditorByCodeCaret(true));
els.code.addEventListener("select", () => postScholarSelectionFromHtmlCode(false));
els.code.addEventListener("mouseup", () => postScholarSelectionFromHtmlCode(false));
els.code.addEventListener("keyup", (e) => {
  const nav = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
  if (nav.has(String(e.key || "")) || e.key === "Enter") syncEditorByCodeCaret(false);
  postScholarSelectionFromHtmlCode(false);
});
els.code.addEventListener("focus", () => postScholarSelectionFromHtmlCode(false));

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
const btnDeleteInsertImage = document.getElementById("btnDeleteInsertImage");
if (btnDeleteInsertImage) btnDeleteInsertImage.onclick = async () => {
  try {
    await deleteSelectedInsertImageFromDb();
  } catch (_) {}
};
if (els.insertImgDbSelect) {
  els.insertImgDbSelect.addEventListener("change", () => {
    if (typeof syncInsertImgGallerySelection === "function") syncInsertImgGallerySelection();
  });
}
if (els.insertImgUrl) {
  els.insertImgUrl.addEventListener("input", () => {
    if (typeof syncInsertPreviewBySource === "function") syncInsertPreviewBySource();
  });
}
const insertPreviewImg = document.getElementById("insertImgPreview");
if (insertPreviewImg) {
  insertPreviewImg.addEventListener("click", () => {
    if (typeof openInsertImageZoom === "function") openInsertImageZoom(insertPreviewImg.src || "");
  });
}
const btnInsertImgZoomClose = document.getElementById("btnInsertImgZoomClose");
if (btnInsertImgZoomClose) btnInsertImgZoomClose.onclick = () => {
  if (typeof closeInsertImageZoom === "function") closeInsertImageZoom();
};
const insertImgZoomOverlay = document.getElementById("insertImgZoomOverlay");
if (insertImgZoomOverlay) {
  insertImgZoomOverlay.addEventListener("click", (e) => {
    if (e.target === insertImgZoomOverlay && typeof closeInsertImageZoom === "function") closeInsertImageZoom();
  });
}
const btnImgUpload = document.getElementById("btnImgUpload");
if (btnImgUpload) btnImgUpload.onclick = () => {
  if (els.insertImgFile) els.insertImgFile.click();
};
const btnSaveImgbbApiKey = document.getElementById("btnSaveImgbbApiKey");
if (btnSaveImgbbApiKey) btnSaveImgbbApiKey.onclick = () => {
  const key = String(els.insertImgbbApiKey && els.insertImgbbApiKey.value ? els.insertImgbbApiKey.value : "").trim();
  try {
    if (key) localStorage.setItem("ss_imgbb_api_key", key);
    else localStorage.removeItem("ss_imgbb_api_key");
  } catch (_) {}
  if (typeof syncInsertImgbbKeyUi === "function") syncInsertImgbbKeyUi();
};
const btnUploadImgbbFromInsert = document.getElementById("btnUploadImgbbFromInsert");
let insertLatestImageFileForImgbb = null;
if (btnUploadImgbbFromInsert) btnUploadImgbbFromInsert.onclick = async () => {
  if (!insertLatestImageFileForImgbb) {
    if (typeof setInsertImgbbStatus === "function") {
      setInsertImgbbStatus("먼저 이미지 업로드 또는 붙여넣기로 이미지를 준비하세요.", true);
    }
    return;
  }
  btnUploadImgbbFromInsert.disabled = true;
  const prevText = btnUploadImgbbFromInsert.textContent;
  btnUploadImgbbFromInsert.textContent = "Uploading...";
  try {
    await uploadInsertImageToImgbbByFile(insertLatestImageFileForImgbb);
  } catch (err) {
    if (typeof setInsertImgbbStatus === "function") {
      setInsertImgbbStatus(`업로드 실패: ${err && err.message ? err.message : String(err || "error")}`, true);
    }
  } finally {
    btnUploadImgbbFromInsert.disabled = false;
    btnUploadImgbbFromInsert.textContent = prevText || "imageBB 업로드";
  }
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
    insertLatestImageFileForImgbb = f;
    try {
      await ingestImageFileToInsertDb(f);
      if (typeof syncInsertPreviewBySource === "function") syncInsertPreviewBySource();
      if (typeof setInsertImgbbStatus === "function") {
        setInsertImgbbStatus("이미지 준비 완료. imageBB 업로드 버튼을 눌러 주소를 생성하세요.", false);
      }
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
    insertLatestImageFileForImgbb = file;
    try { await ingestImageFileToInsertDb(file); } catch (_) {}
    if (typeof syncInsertPreviewBySource === "function") syncInsertPreviewBySource();
    if (typeof setInsertImgbbStatus === "function") {
      setInsertImgbbStatus("이미지 준비 완료. imageBB 업로드 버튼을 눌러 주소를 생성하세요.", false);
    }
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
    insertLatestImageFileForImgbb = file;
    try { await ingestImageFileToInsertDb(file); } catch (_) {}
    if (typeof syncInsertPreviewBySource === "function") syncInsertPreviewBySource();
    if (typeof setInsertImgbbStatus === "function") {
      setInsertImgbbStatus("이미지 준비 완료. imageBB 업로드 버튼을 눌러 주소를 생성하세요.", false);
    }
    break;
  }
});

document.addEventListener("keydown", (e) => {
  if (!e.altKey) return;
  const k = String(e.key || "").toLowerCase();
  if (k === "5") {
    e.preventDefault();
    execCmd("insertUnorderedList");
    return;
  }
  if (k === "6") {
    e.preventDefault();
    execCmd("insertOrderedList");
    return;
  }
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
if (els.insertImgbbApiKey) {
  els.insertImgbbApiKey.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (btnSaveImgbbApiKey) btnSaveImgbbApiKey.click();
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
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    if (cur < slides.length - 1) { cur++; loadCurrent(); }
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
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

function scholarSplitSlidesFromHtml(rawText) {
  const src = String(rawText || "").trim();
  if (!src) return [];
  try {
    let normalized = src;
    if (/&lt;\/?(html|body|div|section)\b/i.test(normalized) && !/<\/?(html|body|div|section)\b/i.test(normalized)) {
      const ta = document.createElement("textarea");
      ta.innerHTML = normalized;
      normalized = String(ta.value || normalized);
    }
    if (!/^\s*<!DOCTYPE/i.test(normalized) && !/^\s*<html[\s>]/i.test(normalized)) {
      normalized = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${normalized}</body></html>`;
    }
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    if (!doc || !doc.body) return [normalized];
    const nodes = doc.querySelectorAll(".slide-container, .slide");
    if (!nodes || nodes.length < 2) {
      // Fallback: split by repeated slide-container/slide open tags in raw html.
      const bodyHtml = String(doc.body.innerHTML || "");
      const re = /<div\b[^>]*class\s*=\s*["'][^"']*\b(?:slide-container|slide)\b[^"']*["'][^>]*>/ig;
      const starts = [];
      let m = null;
      while ((m = re.exec(bodyHtml)) !== null) starts.push(m.index);
      if (starts.length >= 2) {
        const headHtml0 = doc.head && doc.head.innerHTML ? String(doc.head.innerHTML) : '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
        const lang0 = (doc.documentElement && doc.documentElement.getAttribute("lang")) || "ko";
        const out0 = [];
        for (let i = 0; i < starts.length; i++) {
          const s = starts[i];
          const e = (i + 1 < starts.length) ? starts[i + 1] : bodyHtml.length;
          const chunk = String(bodyHtml.slice(s, e) || "").trim();
          if (!chunk) continue;
          out0.push(`<!DOCTYPE html><html lang="${lang0}"><head>${headHtml0}</head><body>${chunk}</body></html>`);
        }
        return out0.length ? out0 : [normalized];
      }
      return [normalized];
    }
    const headHtml = doc.head && doc.head.innerHTML ? String(doc.head.innerHTML) : '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    const lang = (doc.documentElement && doc.documentElement.getAttribute("lang")) || "ko";
    const out = [];
    nodes.forEach((node) => {
      const outer = String(node.outerHTML || "").trim();
      if (!outer) return;
      out.push(`<!DOCTYPE html><html lang="${lang}"><head>${headHtml}</head><body>${outer}</body></html>`);
    });
    return out.length ? out : [normalized];
  } catch (_) {
    return [src];
  }
}

function scholarInsertSingleIntoCode(text, strategy) {
  const ta = (els && els.code) ? els.code : document.getElementById("code");
  if (!ta) return false;
  const raw = String(ta.value || "");
  let s = Number.isFinite(Number(ta.selectionStart)) ? Number(ta.selectionStart) : 0;
  let e = Number.isFinite(Number(ta.selectionEnd)) ? Number(ta.selectionEnd) : s;
  s = clamp(s, 0, raw.length);
  e = clamp(e, 0, raw.length);
  const hasSelection = e > s;
  const normalizedStrategy = String(strategy || "").toLowerCase();
  const replaceAll = normalizedStrategy === "replace-all" || (normalizedStrategy === "selection-or-all" && !hasSelection);
  const next = replaceAll ? String(text || "") : (raw.slice(0, s) + String(text || "") + raw.slice(e));
  ta.value = next;
  const caret = replaceAll ? String(next).length : (s + String(text || "").length);
  try { ta.focus(); } catch (_) {}
  try { ta.setSelectionRange(caret, caret); } catch (_) {}
  try {
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
  try { if (typeof saveCurrent === "function") saveCurrent(); } catch (_) {}
  return true;
}

function scholarInsertMultiSlides(text) {
  const parts = scholarSplitSlidesFromHtml(text);
  if (!parts.length) return false;
  const first = String(parts[0] || "");
  const ta = (els && els.code) ? els.code : document.getElementById("code");
  if (!ta) return false;
  ta.value = first;
  try {
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
  try { if (typeof saveCurrent === "function") saveCurrent(); } catch (_) {}

  for (let i = 1; i < parts.length; i++) {
    const html = String(parts[i] || "");
    let done = false;
    try {
      const btnAdd = document.getElementById("btnAdd");
      const addPaste = document.getElementById("addPaste");
      const btnConfirmAdd = document.getElementById("btnConfirmAdd");
      if (btnAdd && addPaste && btnConfirmAdd) {
        btnAdd.click();
        addPaste.value = html;
        addPaste.dispatchEvent(new Event("input", { bubbles: true }));
        btnConfirmAdd.click();
        done = true;
      }
    } catch (_) {}
    if (!done) {
      try { if (typeof addSlide === "function") addSlide(); } catch (_) {}
      const code2 = (els && els.code) ? els.code : document.getElementById("code");
      if (!code2) continue;
      code2.value = html;
      try {
        code2.dispatchEvent(new Event("input", { bubbles: true }));
        code2.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      try { if (typeof saveCurrent === "function") saveCurrent(); } catch (_) {}
    }
  }
  return true;
}

window.addEventListener("message", (e) => {
  const d = e && e.data ? e.data : null;
  if (!d || d.type !== "mdv-scholar-genslide-insert") return;
  const mode = String(d.mode || "single");
  const text = String(d.text || "");
  const strategy = String(d.strategy || "");
  let ok = false;
  if (mode === "multi") ok = scholarInsertMultiSlides(text);
  else ok = scholarInsertSingleIntoCode(text, strategy);
  try {
    if (e.source && typeof e.source.postMessage === "function") {
      e.source.postMessage({ type: "mdv-scholar-genslide-insert-result", ok, mode }, "*");
    }
  } catch (_) {}
});

async function initApp() {
  initLinkModalWindowControls();
  initImageModalWindowControls();
  setObjectEditMode(false);
  setCodeFontSize(codeFontSize);
  setAppThemeMode(true);
  // initial: code theme follows app theme
  codeThemeFollowApp = true;
  setCodeThemeMode(appDarkMode, true);
  refreshSlideSizeUi();
  setCodeWrapMode(false);
  if (typeof initAbsCoordButtonSetting === "function") initAbsCoordButtonSetting();
  bindPanelSplitter();
  setWorkViewMode("both");
  initSlideResizeHandle();
  loadCurrent();
  if (typeof initObjLayerPanel === "function") initObjLayerPanel();
  refreshTextBoxSelectionTools();
}


(function (global) {
  "use strict";

  const APP_ID = "genslide";
  const MIRROR_KEY = "mdviewer_genslide_sqlite_mirror";
  const TYPE_BY_EXTENSION = Object.freeze({
    mpp: "genslide_mpp",
    pptx: "genslide_pptx",
    png: "genslide_png",
    zip: "genslide_image_zip"
  });

  function storageHost() {
    const candidates = [];
    try { if (global.parent && global.parent !== global) candidates.push(global.parent); } catch (_) {}
    try { if (global.opener && !global.opener.closed) candidates.push(global.opener); } catch (_) {}
    candidates.push(global);
    for (let index = 0; index < candidates.length; index++) {
      const host = candidates[index];
      try {
        if (host && host.MDPStorage) return host;
      } catch (_) {}
    }
    return null;
  }

  function requireStorage() {
    const host = storageHost();
    const storage = host && host.MDPStorage;
    if (!storage || typeof storage.saveSqliteWorkFile !== "function") {
      throw new Error("MD Viewer의 SQLite 작업파일 기능을 찾을 수 없습니다.");
    }
    const status = typeof storage.getStatus === "function" ? storage.getStatus() : null;
    if (!status || status.activeMode !== "sqlite") {
      throw new Error("메인 MD Viewer 설정에서 SQLite 사용을 먼저 선택하세요.");
    }
    return storage;
  }

  function isSqliteFeatureEnabled() {
    const host = storageHost();
    const storage = host && host.MDPStorage;
    const status = storage && typeof storage.getStatus === "function" ? storage.getStatus() : null;
    return !!(status && status.activeMode === "sqlite");
  }

  function applySqliteFeatureButtonVisibility() {
    const enabled = isSqliteFeatureEnabled();
    document.querySelectorAll('button[id*="sqlite" i], a[id*="sqlite" i], button[onclick*="sqlite" i], a[onclick*="sqlite" i]')
      .forEach((element) => {
        if (!enabled) {
          if (!element.hidden) element.dataset.sqliteFeatureHidden = "1";
          element.hidden = true;
        } else if (element.dataset.sqliteFeatureHidden === "1") {
          element.hidden = false;
          delete element.dataset.sqliteFeatureHidden;
        }
      });
  }

  function isMirrorEnabled() {
    try { return global.localStorage.getItem(MIRROR_KEY) === "1"; } catch (_) { return false; }
  }

  function updateMirrorButton() {
    const button = document.getElementById("btnSqliteMirror");
    if (!button) return;
    const enabled = isMirrorEnabled();
    button.textContent = enabled ? "SQLite 자동: ON" : "SQLite 자동: OFF";
    button.classList.toggle("primary", enabled);
    button.title = enabled
      ? "inDB 저장과 MPP/PPTX/PNG/ZIP 입출력 결과를 SQLite에도 보관합니다."
      : "클릭하면 기존 저장과 함께 SQLite에도 자동 보관합니다.";
  }

  function toggleMirror() {
    const next = !isMirrorEnabled();
    try { global.localStorage.setItem(MIRROR_KEY, next ? "1" : "0"); } catch (_) {}
    updateMirrorButton();
    if (next) {
      try { requireStorage(); } catch (error) {
        try { global.localStorage.setItem(MIRROR_KEY, "0"); } catch (_) {}
        updateMirrorButton();
        alert(error.message || error);
        return false;
      }
    }
    return next;
  }

  function safeFileName(value, fallback, extension) {
    let name = String(value || fallback || "genslide")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "genslide";
    if (extension && !name.toLowerCase().endsWith("." + extension)) name += "." + extension;
    return name;
  }

  function extensionOf(fileName) {
    const match = /\.([^.]+)$/.exec(String(fileName || "").toLowerCase());
    return match ? match[1] : "";
  }

  async function buildCurrentMppBlob() {
    if (typeof global.buildGenSlideMppPayload !== "function") {
      throw new Error("GenSlide MPP 생성 기능을 찾을 수 없습니다.");
    }
    const payload = await global.buildGenSlideMppPayload();
    return new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/vnd.genslide.mpp+json"
    });
  }

  async function saveBlob(blob, fileName, workType) {
    const storage = requireStorage();
    return storage.saveSqliteWorkFile(blob, {
      appId: APP_ID,
      workType,
      fileName
    });
  }

  async function saveCurrentMpp(nameHint) {
    const blob = await buildCurrentMppBlob();
    const name = safeFileName(nameHint || ("genslide_" + Date.now()), "genslide", "mpp");
    const result = await saveBlob(blob, name, "genslide_mpp");
    return result;
  }

  async function captureCurrentMpp(nameHint) {
    if (!isMirrorEnabled()) return null;
    try { return await saveCurrentMpp(nameHint); } catch (error) {
      console.warn("[GenSlide SQLite] current MPP mirror skipped:", error && error.message ? error.message : error);
      return null;
    }
  }

  async function captureImportedFile(file) {
    if (!isMirrorEnabled() || !file) return null;
    const extension = extensionOf(file.name);
    const workType = TYPE_BY_EXTENSION[extension];
    if (!workType) return null;
    try {
      return await saveBlob(file, safeFileName(file.name, "genslide-import", extension), workType);
    } catch (error) {
      console.warn("[GenSlide SQLite] imported file mirror skipped:", error && error.message ? error.message : error);
      return null;
    }
  }

  async function captureExport(blob, fileName) {
    if (!isMirrorEnabled() || !blob) return null;
    const extension = extensionOf(fileName);
    const workType = TYPE_BY_EXTENSION[extension];
    if (!workType) return null;
    try {
      const typed = blob.type ? blob : new Blob([blob], {
        type: extension === "pptx"
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : extension === "png" ? "image/png" : "application/zip"
      });
      return await saveBlob(typed, safeFileName(fileName, "genslide-export", extension), workType);
    } catch (error) {
      console.warn("[GenSlide SQLite] export mirror skipped:", error && error.message ? error.message : error);
      return null;
    }
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function chooseItem(items) {
    const list = Array.isArray(items) ? items.slice(0, 100) : [];
    if (!list.length) return null;
    const lines = list.map((item, index) => {
      const date = item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : "";
      return `${index + 1}. [${item.workType}] ${item.name}${date ? " · " + date : ""}`;
    });
    const value = prompt("SQLite GenSlide 파일\n\n" + lines.join("\n") + "\n\n번호를 입력하세요.", "1");
    if (value == null) return null;
    const index = Number(value) - 1;
    return Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : null;
  }

  async function openFromSqlite() {
    const storage = requireStorage();
    const result = await storage.listSqliteWorkFiles({ appId: APP_ID, limit: 100 });
    const selected = chooseItem(result && result.items);
    if (!selected) {
      if (!result || !Array.isArray(result.items) || !result.items.length) alert("저장된 GenSlide SQLite 파일이 없습니다.");
      return null;
    }
    const blob = await storage.loadSqliteWorkFile(selected);
    const file = new File([blob], selected.name, {
      type: selected.mimeType || blob.type || "application/octet-stream",
      lastModified: Number(selected.updatedAt || selected.createdAt || Date.now())
    });
    if (selected.workType === "genslide_mpp") {
      await global.importMpp(file);
    } else if (selected.workType === "genslide_pptx") {
      await global.importPptxToGenSlide(file);
    } else {
      downloadBlob(blob, selected.name);
    }
    return selected;
  }

  async function saveCurrentWithPrompt() {
    try {
      const name = prompt("SQLite에 저장할 MPP 이름", "genslide_" + Date.now());
      if (name == null) return;
      await saveCurrentMpp(name);
      alert("현재 GenSlide 덱을 SQLite에 저장했습니다.");
    } catch (error) {
      alert("GenSlide SQLite 저장 실패: " + (error && error.message ? error.message : error));
    }
  }

  async function openWithNotice() {
    try { await openFromSqlite(); } catch (error) {
      alert("GenSlide SQLite 가져오기 실패: " + (error && error.message ? error.message : error));
    }
  }

  function bindButtons() {
    const save = document.getElementById("btnSqliteSave");
    const open = document.getElementById("btnSqliteOpen");
    const mirror = document.getElementById("btnSqliteMirror");
    if (save) save.onclick = saveCurrentWithPrompt;
    if (open) open.onclick = openWithNotice;
    if (mirror) mirror.onclick = toggleMirror;
    updateMirrorButton();
    applySqliteFeatureButtonVisibility();
  }

  if (typeof global.addEventListener === "function") {
    global.addEventListener("focus", applySqliteFeatureButtonVisibility);
  }

  global.GenSlideSqlite = {
    buildCurrentMppBlob,
    saveCurrentMpp,
    openFromSqlite,
    captureCurrentMpp,
    captureImportedFile,
    captureExport,
    isMirrorEnabled,
    toggleMirror,
    applySqliteFeatureButtonVisibility,
    bindButtons
  };
})(window);

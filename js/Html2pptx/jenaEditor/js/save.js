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


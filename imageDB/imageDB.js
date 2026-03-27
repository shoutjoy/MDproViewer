(function (global) {
  'use strict';

  var INTERNAL_PREFIX = 'internal://';
  var INTERNAL_RE = /internal:\/\/([A-Za-z0-9._~%\-]+)/g;

  function ensureDb(db) {
    if (!db) throw new Error('IndexedDB handle is not available.');
  }

  function ensureImageStore(db, mode) {
    ensureDb(db);
    return db.transaction('images', mode || 'readonly').objectStore('images');
  }

  function decodeId(id) {
    try { return decodeURIComponent(String(id || '').trim()); } catch (e) { return String(id || '').trim(); }
  }

  function encodeId(id) {
    return encodeURIComponent(String(id || '').trim());
  }

  function internalUrlFromId(id) {
    return INTERNAL_PREFIX + encodeId(id);
  }

  function parseInternalUrl(url) {
    var s = String(url || '').trim();
    if (!s.startsWith(INTERNAL_PREFIX)) return null;
    return decodeId(s.slice(INTERNAL_PREFIX.length));
  }

  function extractInternalImageIds(markdown) {
    var source = String(markdown || '');
    var ids = [];
    var seen = new Set();
    var m;
    INTERNAL_RE.lastIndex = 0;
    while ((m = INTERNAL_RE.exec(source)) !== null) {
      var id = decodeId(m[1]);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function hasInternalImages(markdown) {
    return extractInternalImageIds(markdown).length > 0;
  }

  function dataUrlToBlob(dataUrl) {
    var raw = String(dataUrl || '');
    var comma = raw.indexOf(',');
    if (comma < 0) throw new Error('Invalid data URL');
    var header = raw.slice(0, comma);
    var b64 = raw.slice(comma + 1);
    var mimeMatch = header.match(/^data:([^;]+);base64$/i);
    var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function saveBlob(db, blob, opts) {
    ensureDb(db);
    var options = opts || {};
    var id = options.id || ('img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    var name = options.name || (id + '.bin');
    var mime = (blob && blob.type) || options.mime || 'application/octet-stream';
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').put({
          id: id,
          blob: blob,
          name: name,
          mime: mime,
          createdAt: Date.now()
        });
        tx.oncomplete = function () {
          resolve({ id: id, url: internalUrlFromId(id), name: name, mime: mime });
        };
        tx.onerror = function () { reject(tx.error || new Error('Failed to save image.')); };
      } catch (e) {
        reject(e);
      }
    });
  }

  function saveDataUrl(db, dataUrl, opts) {
    var blob = dataUrlToBlob(dataUrl);
    return saveBlob(db, blob, opts || {});
  }

  function getImage(db, id) {
    ensureDb(db);
    var safeId = String(id || '').trim();
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('images', 'readonly');
        var req = tx.objectStore('images').get(safeId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('Failed to read image.')); };
      } catch (e) {
        reject(e);
      }
    });
  }

  async function resolveInternalUrlsInMarkdown(db, markdown, onObjectUrl) {
    var text = String(markdown || '');
    if (!hasInternalImages(text)) return { markdown: text, resolvedCount: 0, missingIds: [] };

    var ids = extractInternalImageIds(text);
    var out = text;
    var resolved = 0;
    var missing = [];

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var rec = await getImage(db, id);
      if (!rec || !rec.blob) {
        missing.push(id);
        continue;
      }
      var objectUrl = URL.createObjectURL(rec.blob);
      if (typeof onObjectUrl === 'function') onObjectUrl(objectUrl);
      var encoded = encodeId(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp(INTERNAL_PREFIX.replace('/', '\\/').replace('/', '\\/') + encoded, 'g');
      out = out.replace(re, objectUrl);
      resolved += 1;
    }
    return { markdown: out, resolvedCount: resolved, missingIds: missing };
  }

  async function exportMarkdownToZip(db, markdown, docName) {
    ensureDb(db);
    if (typeof JSZip === 'undefined') throw new Error('JSZip is not available.');

    var zip = new JSZip();
    var source = String(markdown || '');
    var ids = extractInternalImageIds(source);
    var mdOut = source;

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var rec = await getImage(db, id);
      if (!rec || !rec.blob) continue;
      zip.file('images/' + id, rec.blob);
      var encoded = encodeId(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp(INTERNAL_PREFIX.replace('/', '\\/').replace('/', '\\/') + encoded, 'g');
      mdOut = mdOut.replace(re, 'images/' + id);
    }

    var targetName = String(docName || 'doc.md');
    if (!/\.md$/i.test(targetName)) targetName += '.md';
    zip.file(targetName, mdOut);

    var blob = await zip.generateAsync({ type: 'blob' });
    return { blob: blob, markdownFileName: targetName, imageCount: ids.length };
  }

  async function importZipToIndexedDb(db, zipBuffer) {
    ensureDb(db);
    if (typeof JSZip === 'undefined') throw new Error('JSZip is not available.');

    var zip = await JSZip.loadAsync(zipBuffer);
    var mdName = null;
    Object.keys(zip.files).forEach(function (path) {
      if (mdName) return;
      if (!zip.files[path].dir && /\.md$/i.test(path)) mdName = path;
    });
    if (!mdName) throw new Error('No markdown file found in ZIP.');

    var md = await zip.files[mdName].async('string');
    var importedCount = 0;
    var imageIds = [];

    var entries = Object.keys(zip.files);
    for (var i = 0; i < entries.length; i++) {
      var path = entries[i];
      var f = zip.files[path];
      if (f.dir) continue;
      if (!/^images\//i.test(path)) continue;
      var id = path.replace(/^images\//i, '').trim();
      if (!id) continue;
      var blob = await f.async('blob');
      await saveBlob(db, blob, { id: id, name: id, mime: blob.type || 'application/octet-stream' });
      importedCount += 1;
      imageIds.push(id);
    }

    var restored = md;
    for (var j = 0; j < imageIds.length; j++) {
      var safe = imageIds[j].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var fileRefRe = new RegExp('images\\/' + safe, 'g');
      restored = restored.replace(fileRefRe, internalUrlFromId(imageIds[j]));
    }

    return {
      markdown: restored,
      docName: mdName.split('/').pop(),
      importedCount: importedCount
    };
  }

  global.ImageDB = {
    INTERNAL_PREFIX: INTERNAL_PREFIX,
    internalUrlFromId: internalUrlFromId,
    parseInternalUrl: parseInternalUrl,
    hasInternalImages: hasInternalImages,
    extractInternalImageIds: extractInternalImageIds,
    saveBlob: saveBlob,
    saveDataUrl: saveDataUrl,
    getImage: getImage,
    resolveInternalUrlsInMarkdown: resolveInternalUrlsInMarkdown,
    exportMarkdownToZip: exportMarkdownToZip,
    importZipToIndexedDb: importZipToIndexedDb
  };
})(window);

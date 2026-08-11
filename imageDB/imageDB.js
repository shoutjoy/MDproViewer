(function (global) {
  'use strict';

  var INTERNAL_PREFIX = 'internal://';
  var INTERNAL_RE = /internal:\/\/([A-Za-z0-9._~%\-]+)/g;
  var BASE64_MARKDOWN_IMAGE_RE = /!\[([^\]\r\n]*)\]\(\s*(data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+\/_=-]+))(\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^\)\r\n]*\)))?\s*\)/gi;
  var BASE64_IMAGE_DATA_URL_RE = /^data:(image\/[A-Za-z0-9.+-]+);base64,[A-Za-z0-9+\/_=\-\s]+$/i;
  var HTML_IMAGE_TAG_START_RE = /<img(?=[\s/>])/gi;

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

  function extractInternalImageIdsDeep(value) {
    var ids = new Set();
    var seen = new Set();

    function visit(current) {
      if (typeof current === 'string') {
        extractInternalImageIds(current).forEach(function (id) { ids.add(id); });
        return;
      }
      if (!current || typeof current !== 'object' || seen.has(current)) return;
      if ((typeof Blob !== 'undefined' && current instanceof Blob)
          || (typeof ArrayBuffer !== 'undefined' && current instanceof ArrayBuffer)
          || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(current))) return;
      seen.add(current);
      if (Array.isArray(current)) {
        current.forEach(visit);
      } else {
        Object.keys(current).forEach(function (key) { visit(current[key]); });
      }
    }

    visit(value);
    return Array.from(ids);
  }

  function findUnusedImageIds(imageRecords, referenceValues) {
    var referenced = new Set(extractInternalImageIdsDeep(referenceValues));
    return Array.from(imageRecords || []).map(function (record) {
      return String(record && record.id || '').trim();
    }).filter(function (id) {
      return id && !referenced.has(id);
    });
  }

  function dataUrlToBlob(dataUrl) {
    var raw = String(dataUrl || '');
    var comma = raw.indexOf(',');
    if (comma < 0) throw new Error('Invalid data URL');
    var header = raw.slice(0, comma);
    var b64 = raw.slice(comma + 1).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
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

  function getBase64MarkdownImages(markdown) {
    var source = String(markdown || '');
    var matches = [];
    var match;
    BASE64_MARKDOWN_IMAGE_RE.lastIndex = 0;
    while ((match = BASE64_MARKDOWN_IMAGE_RE.exec(source)) !== null) {
      matches.push({
        type: 'markdown',
        start: match.index,
        end: BASE64_MARKDOWN_IMAGE_RE.lastIndex,
        alt: match[1] || '',
        dataUrl: match[2],
        mime: String(match[3] || 'image/png').toLowerCase(),
        title: match[5] || ''
      });
    }
    return matches;
  }

  function findHtmlTagEnd(source, start) {
    var quote = '';
    for (var i = start; i < source.length; i++) {
      var ch = source.charAt(i);
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') return i + 1;
    }
    return -1;
  }

  function getBase64HtmlImages(markdown) {
    var source = String(markdown || '');
    var matches = [];
    var tagStart;
    HTML_IMAGE_TAG_START_RE.lastIndex = 0;
    while ((tagStart = HTML_IMAGE_TAG_START_RE.exec(source)) !== null) {
      var tagEnd = findHtmlTagEnd(source, HTML_IMAGE_TAG_START_RE.lastIndex);
      if (tagEnd < 0) break;
      var tag = source.slice(tagStart.index, tagEnd);
      var srcMatch = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/i.exec(tag);
      if (!srcMatch) {
        HTML_IMAGE_TAG_START_RE.lastIndex = tagEnd;
        continue;
      }

      var dataUrl = srcMatch[1] != null ? srcMatch[1]
        : (srcMatch[2] != null ? srcMatch[2] : srcMatch[3]);
      var dataMatch = BASE64_IMAGE_DATA_URL_RE.exec(dataUrl || '');
      if (!dataMatch) {
        HTML_IMAGE_TAG_START_RE.lastIndex = tagEnd;
        continue;
      }

      var valueOffset;
      if (srcMatch[1] != null) valueOffset = srcMatch.index + srcMatch[0].indexOf('"') + 1;
      else if (srcMatch[2] != null) valueOffset = srcMatch.index + srcMatch[0].indexOf("'") + 1;
      else valueOffset = srcMatch.index + srcMatch[0].length - srcMatch[3].length;
      matches.push({
        type: 'html',
        start: tagStart.index + valueOffset,
        end: tagStart.index + valueOffset + dataUrl.length,
        dataUrl: dataUrl,
        mime: String(dataMatch[1] || 'image/png').toLowerCase()
      });
      HTML_IMAGE_TAG_START_RE.lastIndex = tagEnd;
    }
    return matches;
  }

  function imageExtensionFromMime(mime) {
    var normalized = String(mime || '').toLowerCase();
    var map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/x-icon': '.ico',
      'image/avif': '.avif'
    };
    return map[normalized] || '.bin';
  }

  async function convertBase64ImagesInMarkdown(db, markdown) {
    ensureDb(db);
    var source = String(markdown || '');
    var matches = getBase64MarkdownImages(source).concat(getBase64HtmlImages(source));
    matches.sort(function (a, b) { return a.start - b.start; });
    if (!matches.length) {
      return { markdown: source, convertedCount: 0, storedCount: 0, imageIds: [] };
    }

    var uniqueByDataUrl = new Map();
    for (var i = 0; i < matches.length; i++) {
      if (uniqueByDataUrl.has(matches[i].dataUrl)) continue;
      // Decode every unique image before writing anything. Invalid Base64 then leaves the DB untouched.
      uniqueByDataUrl.set(matches[i].dataUrl, {
        blob: dataUrlToBlob(matches[i].dataUrl),
        mime: matches[i].mime
      });
    }

    var savedByDataUrl = new Map();
    var imageIds = [];
    var uniqueEntries = Array.from(uniqueByDataUrl.entries());
    for (var j = 0; j < uniqueEntries.length; j++) {
      var dataUrl = uniqueEntries[j][0];
      var prepared = uniqueEntries[j][1];
      var id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var saved = await saveBlob(db, prepared.blob, {
        id: id,
        name: id + imageExtensionFromMime(prepared.mime),
        mime: prepared.mime
      });
      savedByDataUrl.set(dataUrl, saved);
      imageIds.push(saved.id);
    }

    var output = source;
    for (var k = matches.length - 1; k >= 0; k--) {
      var item = matches[k];
      var image = savedByDataUrl.get(item.dataUrl);
      var replacement = image.url;
      if (item.type === 'markdown') {
        var alt = item.alt && item.alt.trim() ? item.alt : image.id;
        replacement = '![' + alt + '](' + image.url + item.title + ')';
      }
      output = output.slice(0, item.start) + replacement + output.slice(item.end);
    }

    return {
      markdown: output,
      convertedCount: matches.length,
      storedCount: savedByDataUrl.size,
      imageIds: imageIds
    };
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
    extractInternalImageIdsDeep: extractInternalImageIdsDeep,
    findUnusedImageIds: findUnusedImageIds,
    saveBlob: saveBlob,
    saveDataUrl: saveDataUrl,
    getBase64MarkdownImages: getBase64MarkdownImages,
    convertBase64ImagesInMarkdown: convertBase64ImagesInMarkdown,
    getImage: getImage,
    resolveInternalUrlsInMarkdown: resolveInternalUrlsInMarkdown,
    exportMarkdownToZip: exportMarkdownToZip,
    importZipToIndexedDb: importZipToIndexedDb
  };
})(window);

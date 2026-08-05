(function (global) {
  'use strict';

  var MAX_IMAGE_BYTES = 30 * 1024 * 1024;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeFileBase(value) {
    var name = String(value || 'document')
      .replace(/^.*[\\/]/, '')
      .replace(/\.(?:md|markdown|mdown|txt|html?|json|mdd|mpv|docx)$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim();
    return name || 'document';
  }

  function resolveUrl(value, baseUrl) {
    var source = String(value || '').trim();
    if (!source || /^(?:data:|blob:|internal:|#)/i.test(source)) return source;
    try {
      return new URL(source, baseUrl || (global.document && global.document.baseURI) || undefined).href;
    } catch (_) {
      return source;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Image encoding failed.')); };
      reader.readAsDataURL(blob);
    });
  }

  function normalizeResolvedBlob(value) {
    if (!value) return null;
    var candidate = value.blob || value.data || value;
    if (typeof candidate === 'string' && /^data:/i.test(candidate)) return { dataUrl: candidate };
    if (typeof global.Blob === 'function' && candidate instanceof global.Blob) return { blob: candidate };
    if (candidate instanceof ArrayBuffer || ArrayBuffer.isView(candidate)) {
      return { blob: new Blob([candidate], { type: value.mime || value.type || 'application/octet-stream' }) };
    }
    return null;
  }

  async function fetchImageBlob(url) {
    if (typeof global.fetch !== 'function') return null;
    var response = await global.fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache'
    });
    if (!response.ok) throw new Error('Image download failed (HTTP ' + response.status + ').');
    var blob = await response.blob();
    if (!blob || !blob.size) throw new Error('Downloaded image is empty.');
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 30 MB.');
    return blob;
  }

  function makeLocalProxyUrl(url) {
    if (!/^https?:\/\//i.test(String(url || '')) || !global.location) return '';
    var hostname = String(global.location.hostname || '').toLowerCase();
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') return '';
    try {
      var proxy = new URL('/__mdviewer_image_proxy', global.location.href);
      proxy.searchParams.set('url', url);
      return proxy.href;
    } catch (_) {
      return '';
    }
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas && typeof canvas.toBlob === 'function') {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Canvas capture failed.'));
        }, 'image/png');
        return;
      }
      try {
        var dataUrl = canvas.toDataURL('image/png');
        global.fetch(dataUrl).then(function (response) { return response.blob(); }).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function captureImageElement(image) {
    if (!image || !global.document) return null;
    var width = Number(image.naturalWidth || image.width || 0);
    var height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) return null;
    var scale = Math.min(1, 2400 / Math.max(width, height));
    var canvas = global.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    var context = canvas.getContext && canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas);
  }

  async function resolveImageDataUrl(source, originalImage, payload) {
    var src = String(source || '').trim();
    if (!src) return null;
    if (/^data:/i.test(src)) return src;

    if (typeof payload.resolveImage === 'function') {
      try {
        var custom = normalizeResolvedBlob(await payload.resolveImage(src));
        if (custom && custom.dataUrl) return custom.dataUrl;
        if (custom && custom.blob) return await blobToDataUrl(custom.blob);
      } catch (_) {}
    }

    var resolved = resolveUrl(src, payload.baseUrl);
    var candidates = [];
    if (originalImage) {
      var liveSource = originalImage.currentSrc || originalImage.src || originalImage.getAttribute('src') || '';
      if (liveSource) candidates.push(liveSource);
    }
    if (resolved && candidates.indexOf(resolved) < 0) candidates.push(resolved);

    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = candidates[index];
      if (!candidate || /^internal:/i.test(candidate)) continue;
      try {
        return await blobToDataUrl(await fetchImageBlob(candidate));
      } catch (_) {}
    }

    var proxyUrl = makeLocalProxyUrl(resolved);
    if (proxyUrl) {
      try {
        return await blobToDataUrl(await fetchImageBlob(proxyUrl));
      } catch (_) {}
    }

    if (originalImage) {
      try {
        var captured = await captureImageElement(originalImage);
        if (captured) return await blobToDataUrl(captured);
      } catch (_) {}
    }
    return null;
  }

  async function embedImages(root, liveRoot, payload) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return { embedded: 0, external: 0 };
    }
    var images = Array.prototype.slice.call(root.querySelectorAll('img'));
    var liveImages = liveRoot && typeof liveRoot.querySelectorAll === 'function'
      ? Array.prototype.slice.call(liveRoot.querySelectorAll('img'))
      : [];
    var results = await Promise.all(images.map(async function (image, index) {
      var source = image.getAttribute('src') ||
        image.getAttribute('data-src') ||
        image.getAttribute('data-original-src') || '';
      var dataUrl = await resolveImageDataUrl(source, liveImages[index] || null, payload);
      image.removeAttribute('srcset');
      image.removeAttribute('crossorigin');
      image.removeAttribute('loading');
      if (dataUrl) {
        image.setAttribute('src', dataUrl);
        image.removeAttribute('data-src');
        image.removeAttribute('data-original-src');
        return true;
      }
      var absolute = resolveUrl(source, payload.baseUrl);
      if (absolute) image.setAttribute('src', absolute);
      return false;
    }));

    Array.prototype.slice.call(root.querySelectorAll('source[srcset]')).forEach(function (source) {
      source.removeAttribute('srcset');
    });
    return {
      embedded: results.filter(Boolean).length,
      external: results.filter(function (result) { return !result; }).length
    };
  }

  function absolutizeCssUrls(css, stylesheetUrl) {
    return String(css || '').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, function (match, quote, value) {
      var source = String(value || '').trim();
      if (!source || /^(?:data:|blob:|#)/i.test(source)) return match;
      return 'url("' + resolveUrl(source, stylesheetUrl).replace(/"/g, '%22') + '")';
    });
  }

  async function collectPageStyles() {
    if (!global.document) return '';
    var chunks = [];
    Array.prototype.slice.call(global.document.querySelectorAll('style')).forEach(function (style) {
      chunks.push(style.outerHTML);
    });
    var links = Array.prototype.slice.call(global.document.querySelectorAll('link[rel="stylesheet"]'));
    await Promise.all(links.map(async function (link) {
      var href = link.href || link.getAttribute('href') || '';
      if (!href) return;
      try {
        var response = await global.fetch(href, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Stylesheet download failed.');
        var css = absolutizeCssUrls(await response.text(), href);
        chunks.push('<style>\n/* ' + escapeHtml(href) + ' */\n' + css + '\n</style>');
      } catch (_) {
        chunks.push('<link rel="stylesheet" href="' + escapeHtml(resolveUrl(href, global.document.baseURI)) + '">');
      }
    }));
    return chunks.join('\n');
  }

  function isFullHtmlDocument(content, fileName) {
    var source = String(content || '').replace(/^\uFEFF/, '').trim();
    if (/^(?:<!doctype\s+html\b|<html\b)/i.test(source)) return true;
    return /\.html?$/i.test(String(fileName || '').trim()) && /<[^>]+>/.test(source);
  }

  function ensureHtmlMetadata(documentNode, title, baseUrl) {
    var head = documentNode.head || documentNode.getElementsByTagName('head')[0];
    if (!head) return;
    if (!head.querySelector('meta[charset]')) {
      var charset = documentNode.createElement('meta');
      charset.setAttribute('charset', 'UTF-8');
      head.insertBefore(charset, head.firstChild);
    }
    if (!head.querySelector('meta[name="viewport"]')) {
      var viewport = documentNode.createElement('meta');
      viewport.setAttribute('name', 'viewport');
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
      head.appendChild(viewport);
    }
    if (!documentNode.title) documentNode.title = title;
    if (baseUrl && !head.querySelector('base')) {
      var base = documentNode.createElement('base');
      base.setAttribute('href', baseUrl);
      head.insertBefore(base, head.firstChild);
    }
  }

  async function buildExportHtml(payload) {
    var content = String(payload.content || '');
    var fileBase = sanitizeFileBase(payload.fileName);
    if (isFullHtmlDocument(content, payload.fileName) && typeof global.DOMParser === 'function') {
      var parsed = new global.DOMParser().parseFromString(content, 'text/html');
      ensureHtmlMetadata(parsed, fileBase, payload.baseUrl);
      var htmlImages = await embedImages(parsed, null, payload);
      return {
        html: '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML,
        embeddedImageCount: htmlImages.embedded,
        externalImageCount: htmlImages.external
      };
    }

    var rendered = payload.renderedElement ||
      (global.document && (global.document.getElementById('viewer') || global.document.querySelector('.markdown-body')));
    if (!rendered) throw new Error('HTML export content was not found.');
    var clone = rendered.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll('script,.no-print,button')).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    var imageResult = await embedImages(clone, rendered, payload);
    var styles = await collectPageStyles();
    var rootClass = global.document ? global.document.documentElement.className : '';
    var rootStyle = global.document ? (global.document.documentElement.getAttribute('style') || '') : '';
    var html = '<!DOCTYPE html>\n' +
      '<html lang="ko" class="' + escapeHtml(rootClass) + '" style="' + escapeHtml(rootStyle) + '">\n' +
      '<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>' + escapeHtml(fileBase) + '</title>\n' + styles + '\n' +
      '<style>body{margin:0;padding:32px 16px}.mdviewer-export-document{max-width:960px;margin:0 auto}</style>\n' +
      '</head>\n<body class="mdviewer-export-body">\n' +
      '<main class="mdviewer-export-document">' + clone.outerHTML + '</main>\n' +
      '</body>\n</html>';
    return {
      html: html,
      embeddedImageCount: imageResult.embedded,
      externalImageCount: imageResult.external
    };
  }

  function downloadHtml(html, fileName) {
    var blob = new Blob(['\uFEFF', html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = global.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    global.document.body.appendChild(anchor);
    anchor.click();
    global.setTimeout(function () {
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  async function exportToHTML(options) {
    var payload = options || {};
    var output = await buildExportHtml(payload);
    var fileName = sanitizeFileBase(payload.fileName) + '.html';
    downloadHtml(output.html, fileName);
    return {
      fileName: fileName,
      embeddedImageCount: output.embeddedImageCount,
      externalImageCount: output.externalImageCount
    };
  }

  global.HtmlExport = Object.freeze({
    exportToHTML: exportToHTML,
    buildExportHtml: buildExportHtml
  });
})(window);

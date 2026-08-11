(function (global) {
  'use strict';

  var A4_WIDTH_MM = 210;
  var A4_HEIGHT_MM = 297;
  var DEFAULT_MARGIN_MM = 15;
  var STYLE_ID = 'mdviewer-pdf-export-style';
  var PREVIEW_ID = 'pdf-export-preview';
  var QUALITY_STORAGE_KEY = 'md_viewer_pdf_quality_v1';
  var DEFAULT_QUALITY = 'standard';
  var QUALITY_PRESETS = Object.freeze({
    compact: Object.freeze({ label: '용량 절약', scale: 1.25, jpegQuality: 0.78, compression: 'FAST' }),
    standard: Object.freeze({ label: '표준', scale: 2, jpegQuality: 0.9, compression: 'MEDIUM' }),
    high: Object.freeze({ label: '고품질', scale: 3, jpegQuality: 0.97, compression: 'SLOW' })
  });

  function normalizeQuality(value) {
    var key = String(value || '');
    return Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, key) ? key : DEFAULT_QUALITY;
  }

  function readStoredQuality() {
    try { return normalizeQuality(global.localStorage && global.localStorage.getItem(QUALITY_STORAGE_KEY)); }
    catch (_) { return DEFAULT_QUALITY; }
  }

  function storeQuality(value) {
    var key = normalizeQuality(value);
    try { if (global.localStorage) global.localStorage.setItem(QUALITY_STORAGE_KEY, key); } catch (_) {}
    return key;
  }

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
      .replace(/\.(?:md|markdown|mdown|txt|html?|json|mdd|mpv|docx|pdf)$/i, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim();
    return name || 'document';
  }

  function findWordBoundary(text, limit) {
    var source = String(text || '');
    var max = Math.max(1, Math.min(source.length - 1, Number(limit) || 1));
    var minimum = Math.max(1, Math.floor(max * 0.62));
    for (var index = max; index >= minimum; index -= 1) {
      if (/\s|[.,;:!?\u3002\u3001)]/.test(source.charAt(index - 1))) return index;
    }
    return max;
  }

  function ensureStyle() {
    if (!global.document || global.document.getElementById(STYLE_ID)) return;
    var style = global.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PREVIEW_ID + '{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;background:#111827;color:#e5e7eb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '#' + PREVIEW_ID + ' *{box-sizing:border-box}',
      '.pdf-preview-toolbar{min-height:64px;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid #334155;background:#0f172a;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:2}',
      '.pdf-preview-title{margin-right:auto;min-width:210px}.pdf-preview-title strong{display:block;font-size:15px}.pdf-preview-title span{display:block;margin-top:3px;color:#94a3b8;font-size:11px}',
      '.pdf-preview-control{display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;font-weight:700}',
      '.pdf-preview-control select{height:34px;padding:0 28px 0 10px;border:1px solid #475569;border-radius:8px;background:#1e293b;color:#f8fafc}',
      '.pdf-preview-button{height:34px;padding:0 12px;border:1px solid #475569;border-radius:8px;background:#1e293b;color:#f8fafc;font-size:12px;font-weight:800;cursor:pointer}',
      '.pdf-preview-button:hover{background:#334155}.pdf-preview-button:disabled{opacity:.42;cursor:not-allowed}',
      '.pdf-preview-button-primary{border-color:#eab308;background:#a16207}.pdf-preview-button-primary:hover{background:#ca8a04}',
      '.pdf-preview-button-danger{border-color:#64748b;background:#334155}',
      '.pdf-preview-stage{position:relative;flex:1;min-height:0;overflow:auto;padding:34px 30px 70px;background:#374151}',
      '.pdf-preview-pages{display:flex;flex-direction:column;align-items:center;gap:28px;transform:scale(var(--pdf-preview-zoom,1));transform-origin:top center;min-width:210mm}',
      '.pdf-preview-page{position:relative;width:' + A4_WIDTH_MM + 'mm;height:' + A4_HEIGHT_MM + 'mm;flex:0 0 auto;padding:var(--pdf-page-margin-mm,' + DEFAULT_MARGIN_MM + 'mm);overflow:hidden;background:#fff;color:#1e293b;box-shadow:0 18px 46px rgba(0,0,0,.38)}',
      '.pdf-page-content{width:100%;height:100%;max-width:none!important;margin:0!important;padding:0!important;overflow:hidden;background:#fff!important;color:#1e293b!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content h1{color:#1e3a8a!important;border-bottom-color:#bfdbfe!important;background:linear-gradient(90deg,rgba(219,234,254,.85),rgba(255,255,255,0))!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content h2{color:#1d4ed8!important;border-bottom-color:#93c5fd!important;background:linear-gradient(90deg,rgba(219,234,254,.7),rgba(255,255,255,0))!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content h3,#' + PREVIEW_ID + ' .pdf-page-content h4,#' + PREVIEW_ID + ' .pdf-page-content h5,#' + PREVIEW_ID + ' .pdf-page-content h6{color:#0369a1!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content p,#' + PREVIEW_ID + ' .pdf-page-content li,#' + PREVIEW_ID + ' .pdf-page-content td{color:#1e293b!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content th{color:#0f172a!important;background:#f1f5f9!important}',
      '#' + PREVIEW_ID + ' .pdf-page-content th,#' + PREVIEW_ID + ' .pdf-page-content td{border-color:#cbd5e1!important}',
      '.pdf-page-content>.page-break{display:none!important}',
      '.pdf-page-content img,.pdf-page-content svg,.pdf-page-content canvas,.pdf-page-content video{max-width:100%!important}',
      '.pdf-page-content pre,.pdf-page-content table{max-width:100%;overflow-wrap:anywhere}',
      '.pdf-page-number{position:absolute;right:8mm;bottom:5mm;color:#94a3b8;font-size:9px;line-height:1;pointer-events:none}',
      '.pdf-preview-page [data-pdf-source-index]{cursor:pointer;outline-offset:3px}',
      '.pdf-preview-page [data-pdf-source-index]:hover{outline:1px dashed #06b6d4}',
      '.pdf-preview-page .pdf-preview-selected{outline:2px solid #06b6d4!important;background-color:rgba(6,182,212,.08)!important}',
      '.pdf-forced-fit{max-height:100%!important;overflow:hidden!important}.pdf-forced-fit>img,.pdf-forced-fit>svg,.pdf-forced-fit>canvas{max-height:100%!important;object-fit:contain!important}',
      '.pdf-preview-help{position:sticky;left:16px;bottom:-48px;align-self:flex-start;max-width:560px;margin-top:6px;padding:9px 12px;border:1px solid #475569;border-radius:9px;background:rgba(15,23,42,.94);color:#cbd5e1;font-size:11px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.24)}',
      '.pdf-preview-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72);color:#fff;font-size:14px;font-weight:800;z-index:3}',
      '@media(max-width:760px){.pdf-preview-toolbar{padding:8px}.pdf-preview-title{flex-basis:100%}.pdf-preview-stage{padding:20px 8px 60px}.pdf-preview-pages{transform-origin:top left}}'
    ].join('\n');
    global.document.head.appendChild(style);
  }

  function parseSource(html) {
    var parsed = new global.DOMParser().parseFromString(String(html || ''), 'text/html');
    var exportRoot = parsed.querySelector('.mdviewer-export-document');
    var root = exportRoot && (exportRoot.querySelector(':scope > #viewer') || exportRoot.querySelector(':scope > .markdown-body'));
    if (!root) root = exportRoot || parsed.body;
    Array.prototype.slice.call(root.querySelectorAll('script,button,.no-print,[data-html2canvas-ignore="true"]')).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    Array.prototype.slice.call(root.querySelectorAll('[contenteditable]')).forEach(function (node) {
      node.removeAttribute('contenteditable');
    });
    return { document: parsed, root: root };
  }

  function sourceUnits(root) {
    return Array.prototype.slice.call(root.childNodes).reduce(function (units, node) {
      if (node.nodeType === 1) {
        units.push(node.cloneNode(true));
      } else if (node.nodeType === 3 && String(node.nodeValue || '').trim()) {
        var paragraph = root.ownerDocument.createElement('p');
        paragraph.textContent = node.nodeValue;
        units.push(paragraph);
      }
      return units;
    }, []);
  }

  function cloneTextSlice(element, start, end) {
    var cursor = 0;
    function visit(node) {
      if (node.nodeType === 3) {
        var value = String(node.nodeValue || '');
        var nodeStart = cursor;
        var nodeEnd = cursor + value.length;
        cursor = nodeEnd;
        var from = Math.max(start, nodeStart);
        var to = Math.min(end, nodeEnd);
        return to > from ? node.ownerDocument.createTextNode(value.slice(from - nodeStart, to - nodeStart)) : null;
      }
      if (node.nodeType !== 1) return null;
      var clone = node.cloneNode(false);
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        var childClone = visit(child);
        if (childClone) clone.appendChild(childClone);
      });
      return clone.childNodes.length ? clone : null;
    }
    return visit(element);
  }

  function fits(content) {
    return content.scrollHeight <= content.clientHeight + 2;
  }

  function measureCandidate(content, node) {
    content.appendChild(node);
    var result = fits(content);
    content.removeChild(node);
    return result;
  }

  function splitTextElement(element, content) {
    if (element.querySelector('img,svg,canvas,video,iframe,table')) return null;
    var text = String(element.textContent || '');
    if (text.length < 2) return null;
    var low = 1;
    var high = text.length - 1;
    var best = 0;
    while (low <= high) {
      var middle = Math.floor((low + high) / 2);
      var trial = cloneTextSlice(element, 0, middle);
      if (trial && measureCandidate(content, trial)) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (!best || best >= text.length) return null;
    var boundary = findWordBoundary(text, best);
    var first = cloneTextSlice(element, 0, boundary);
    var second = cloneTextSlice(element, boundary, text.length);
    return first && second ? [first, second] : null;
  }

  function splitContainerChildren(element, content) {
    var tag = String(element.tagName || '').toLowerCase();
    if (!/^(?:div|section|article|blockquote|ul|ol|dl)$/.test(tag)) return null;
    var children = Array.prototype.slice.call(element.children);
    if (children.length < 2) return null;
    var fragments = [];
    var current = element.cloneNode(false);
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index].cloneNode(true);
      current.appendChild(child);
      if (!measureCandidate(content, current.cloneNode(true)) && current.children.length > 1) {
        current.removeChild(child);
        fragments.push(current);
        current = element.cloneNode(false);
        current.appendChild(child);
      }
    }
    if (current.children.length) fragments.push(current);
    return fragments.length > 1 ? fragments : null;
  }

  function splitTableRows(table, content) {
    if (String(table.tagName || '').toLowerCase() !== 'table') return null;
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody > tr'));
    if (rows.length < 2) return null;
    var fragments = [];
    var makeTable = function () {
      var clone = table.cloneNode(false);
      Array.prototype.slice.call(table.children).forEach(function (child) {
        var tag = String(child.tagName || '').toLowerCase();
        if (tag === 'tbody' || tag === 'tfoot') return;
        clone.appendChild(child.cloneNode(true));
      });
      clone.appendChild(table.ownerDocument.createElement('tbody'));
      return clone;
    };
    var current = makeTable();
    for (var index = 0; index < rows.length; index += 1) {
      var body = current.querySelector('tbody');
      var row = rows[index].cloneNode(true);
      body.appendChild(row);
      if (!measureCandidate(content, current.cloneNode(true)) && body.children.length > 1) {
        body.removeChild(row);
        fragments.push(current);
        current = makeTable();
        current.querySelector('tbody').appendChild(row);
      }
    }
    if (current.querySelector('tbody').children.length) fragments.push(current);
    return fragments.length > 1 ? fragments : null;
  }

  function splitOversized(element, content) {
    return splitTableRows(element, content) ||
      splitContainerChildren(element, content) ||
      splitTextElement(element, content);
  }

  function waitForMedia(root) {
    var images = Array.prototype.slice.call(root.querySelectorAll('img'));
    var waits = images.map(function (image) {
      if (image.complete) return Promise.resolve();
      if (typeof image.decode === 'function') return image.decode().catch(function () {});
      return new Promise(function (resolve) {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    });
    if (global.document.fonts && global.document.fonts.ready) waits.push(global.document.fonts.ready.catch(function () {}));
    return Promise.race([Promise.all(waits), new Promise(function (resolve) { global.setTimeout(resolve, 1600); })]);
  }

  function createPreviewShell(fileName, quality) {
    var overlay = global.document.createElement('div');
    overlay.id = PREVIEW_ID;
    overlay.innerHTML =
      '<div class="pdf-preview-toolbar">' +
        '<div class="pdf-preview-title"><strong>PDF 미리보기 · ' + escapeHtml(fileName) + '</strong><span data-pdf-status>A4 페이지를 구성하는 중입니다.</span></div>' +
        '<label class="pdf-preview-control">여백 <select data-pdf-margin><option value="10">좁게 10 mm</option><option value="15" selected>보통 15 mm</option><option value="20">넓게 20 mm</option><option value="25">매우 넓게 25 mm</option></select></label>' +
        '<label class="pdf-preview-control">PDF 품질 <select data-pdf-quality><option value="compact">용량 절약</option><option value="standard">표준</option><option value="high">고품질</option></select></label>' +
        '<label class="pdf-preview-control">확대 <select data-pdf-zoom><option value="0.6">60%</option><option value="0.75" selected>75%</option><option value="0.9">90%</option><option value="1">100%</option></select></label>' +
        '<button type="button" class="pdf-preview-button" data-pdf-break disabled>선택 앞에서 나누기</button>' +
        '<button type="button" class="pdf-preview-button" data-pdf-reset>수동 나눔 초기화</button>' +
        '<button type="button" class="pdf-preview-button pdf-preview-button-primary" data-pdf-download>PDF 파일 저장</button>' +
        '<button type="button" class="pdf-preview-button pdf-preview-button-danger" data-pdf-close>닫기</button>' +
      '</div>' +
      '<div class="pdf-preview-stage"><div class="pdf-preview-pages" data-pdf-pages></div><div class="pdf-preview-busy" data-pdf-busy>페이지를 나누는 중…</div><div class="pdf-preview-help">문단·목록·표를 클릭한 뒤 <b>선택 앞에서 나누기</b>로 끊는 위치를 조정할 수 있습니다. 품질을 선택하고 <b>PDF 파일 저장</b>을 누르면 인쇄창 없이 PDF가 바로 다운로드됩니다.</div></div>';
    global.document.body.appendChild(overlay);
    overlay.querySelector('[data-pdf-quality]').value = normalizeQuality(quality);
    return overlay;
  }

  function addPage(state) {
    var page = global.document.createElement('section');
    page.className = 'pdf-preview-page';
    page.style.setProperty('--pdf-page-margin-mm', state.margin + 'mm');
    var content = global.document.createElement('div');
    content.className = 'pdf-page-content markdown-body';
    page.appendChild(content);
    var number = global.document.createElement('span');
    number.className = 'pdf-page-number';
    page.appendChild(number);
    state.pagesRoot.appendChild(page);
    state.pages.push({ page: page, content: content, number: number });
    return state.pages[state.pages.length - 1];
  }

  function pageIsEmpty(page) {
    return !page || (!page.content.children.length && !String(page.content.textContent || '').trim());
  }

  function isExplicitBreak(element) {
    return !!(element && element.nodeType === 1 && element.classList && element.classList.contains('page-break'));
  }

  function paginate(state) {
    state.pagesRoot.innerHTML = '';
    state.pages = [];
    var current = addPage(state);

    function place(element, sourceIndex, allowManual, depth) {
      if (!element || depth > 24) return;
      if (isExplicitBreak(element)) {
        if (!pageIsEmpty(current)) current = addPage(state);
        return;
      }
      if (allowManual && sourceIndex > 0 && state.manualBreaks.has(sourceIndex) && !pageIsEmpty(current)) {
        current = addPage(state);
      }
      var node = global.document.importNode(element, true);
      node.setAttribute('data-pdf-source-index', String(sourceIndex));
      current.content.appendChild(node);
      if (fits(current.content)) return;
      current.content.removeChild(node);

      if (!pageIsEmpty(current)) {
        current = addPage(state);
        node = global.document.importNode(element, true);
        node.setAttribute('data-pdf-source-index', String(sourceIndex));
        current.content.appendChild(node);
        if (fits(current.content)) return;
        current.content.removeChild(node);
      }

      var fragments = splitOversized(element, current.content);
      if (fragments && fragments.length > 1) {
        fragments.forEach(function (fragment) { place(fragment, sourceIndex, false, depth + 1); });
        return;
      }

      node.classList.add('pdf-forced-fit');
      current.content.appendChild(node);
      if (!fits(current.content)) {
        node.style.maxHeight = current.content.clientHeight + 'px';
        node.style.overflow = 'hidden';
      }
    }

    state.units.forEach(function (unit, index) { place(unit, index, true, 0); });
    if (state.pages.length > 1 && pageIsEmpty(state.pages[state.pages.length - 1])) {
      state.pagesRoot.removeChild(state.pages.pop().page);
    }
    state.pages.forEach(function (page, index) { page.number.textContent = (index + 1) + ' / ' + state.pages.length; });
    state.status.textContent = 'A4 ' + state.pages.length + '쪽 · 여백 ' + state.margin + ' mm · PDF 품질 ' + QUALITY_PRESETS[state.quality].label + ' · 자동 분할 완료';
    state.busy.style.display = 'none';
  }

  function getJsPdfConstructor() {
    return global.jspdf && typeof global.jspdf.jsPDF === 'function' ? global.jspdf.jsPDF : null;
  }

  function downloadPdfBlob(blob, fileName) {
    var url = global.URL.createObjectURL(blob);
    var anchor = global.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    global.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 30000);
  }

  function canvasToJpegBytes(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('PDF 페이지 이미지를 만들지 못했습니다.')); return; }
        blob.arrayBuffer().then(function (buffer) { resolve(new Uint8Array(buffer)); }, reject);
      }, 'image/jpeg', quality);
    });
  }

  function clearPdfSelection(root) {
    Array.prototype.slice.call(root.querySelectorAll('.pdf-preview-selected')).forEach(function (node) {
      node.classList.remove('pdf-preview-selected');
    });
  }

  async function generatePdf(state) {
    var JsPdf = getJsPdfConstructor();
    if (typeof global.html2canvas !== 'function' || !JsPdf) {
      throw new Error('PDF 변환 라이브러리를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
    }
    if (!state.pages.length) throw new Error('PDF로 저장할 페이지가 없습니다.');

    var preset = QUALITY_PRESETS[state.quality];
    var pdf = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    var previousZoom = state.pagesRoot.style.getPropertyValue('--pdf-preview-zoom');
    state.pagesRoot.style.setProperty('--pdf-preview-zoom', '1');
    clearPdfSelection(state.pagesRoot);

    try {
      for (var index = 0; index < state.pages.length; index += 1) {
        state.busy.textContent = 'PDF 생성 중… ' + (index + 1) + ' / ' + state.pages.length;
        var pageElement = state.pages[index].page;
        await waitForMedia(pageElement);
        var canvas = await global.html2canvas(pageElement, {
          backgroundColor: '#ffffff',
          scale: preset.scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          scrollX: 0,
          scrollY: -global.scrollY,
          onclone: function (clonedDocument) {
            var clonedPreview = clonedDocument.getElementById(PREVIEW_ID);
            if (!clonedPreview) return;
            var clonedPages = clonedPreview.querySelector('[data-pdf-pages]');
            if (clonedPages) clonedPages.style.setProperty('--pdf-preview-zoom', '1');
            clearPdfSelection(clonedPreview);
          }
        });
        var jpegBytes = await canvasToJpegBytes(canvas, preset.jpegQuality);
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(jpegBytes, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, preset.compression);
        canvas.width = 1;
        canvas.height = 1;
        await new Promise(function (resolve) { global.setTimeout(resolve, 0); });
      }
      var blob = pdf.output('blob');
      downloadPdfBlob(blob, state.fileName);
      state.downloaded = true;
      state.status.textContent = state.fileName + ' 다운로드 완료 · A4 ' + state.pages.length + '쪽 · PDF 품질 ' + preset.label;
      return blob;
    } finally {
      state.pagesRoot.style.setProperty('--pdf-preview-zoom', previousZoom || '0.75');
    }
  }

  function schedulePaginate(state) {
    state.busy.style.display = 'flex';
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () { paginate(state); });
    });
  }

  async function openPreview(options) {
    var payload = options || {};
    if (!global.document || typeof global.DOMParser !== 'function') throw new Error('PDF preview requires a browser DOM.');
    var previous = global.document.getElementById(PREVIEW_ID);
    if (previous && previous.parentNode) previous.parentNode.removeChild(previous);
    ensureStyle();

    var parsed = parseSource(payload.html);
    var fileName = sanitizeFileBase(payload.fileName) + '.pdf';
    var quality = readStoredQuality();
    var overlay = createPreviewShell(fileName, quality);

    var state = {
      overlay: overlay,
      sourceDocument: parsed.document,
      units: sourceUnits(parsed.root),
      fileName: fileName,
      pagesRoot: overlay.querySelector('[data-pdf-pages]'),
      pages: [],
      margin: DEFAULT_MARGIN_MM,
      quality: quality,
      manualBreaks: new Set(),
      selectedIndex: -1,
      status: overlay.querySelector('[data-pdf-status]'),
      busy: overlay.querySelector('[data-pdf-busy]'),
      breakButton: overlay.querySelector('[data-pdf-break]'),
      downloadButton: overlay.querySelector('[data-pdf-download]'),
      downloaded: false
    };

    function clearSelection() {
      Array.prototype.slice.call(state.pagesRoot.querySelectorAll('.pdf-preview-selected')).forEach(function (node) {
        node.classList.remove('pdf-preview-selected');
      });
    }

    var result = new Promise(function (resolve) {
      function close(value) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value == null ? state.downloaded : !!value);
      }
      overlay.querySelector('[data-pdf-close]').addEventListener('click', function () { close(); });
      overlay.querySelector('[data-pdf-margin]').addEventListener('change', function (event) {
        state.margin = Number(event.target.value) || DEFAULT_MARGIN_MM;
        state.selectedIndex = -1;
        state.breakButton.disabled = true;
        schedulePaginate(state);
      });
      overlay.querySelector('[data-pdf-zoom]').addEventListener('change', function (event) {
        state.pagesRoot.style.setProperty('--pdf-preview-zoom', String(Number(event.target.value) || 0.75));
      });
      overlay.querySelector('[data-pdf-quality]').addEventListener('change', function (event) {
        state.quality = storeQuality(event.target.value);
        state.status.textContent = 'A4 ' + state.pages.length + '쪽 · 여백 ' + state.margin + ' mm · PDF 품질 ' + QUALITY_PRESETS[state.quality].label;
      });
      overlay.querySelector('[data-pdf-reset]').addEventListener('click', function () {
        state.manualBreaks.clear();
        state.selectedIndex = -1;
        state.breakButton.disabled = true;
        schedulePaginate(state);
      });
      state.breakButton.addEventListener('click', function () {
        if (state.selectedIndex <= 0) return;
        if (state.manualBreaks.has(state.selectedIndex)) state.manualBreaks.delete(state.selectedIndex);
        else state.manualBreaks.add(state.selectedIndex);
        schedulePaginate(state);
      });
      state.pagesRoot.addEventListener('click', function (event) {
        var target = event.target.closest('[data-pdf-source-index]');
        if (!target) return;
        event.preventDefault();
        clearSelection();
        state.selectedIndex = Number(target.getAttribute('data-pdf-source-index'));
        Array.prototype.slice.call(state.pagesRoot.querySelectorAll('[data-pdf-source-index="' + state.selectedIndex + '"]')).forEach(function (node) {
          node.classList.add('pdf-preview-selected');
        });
        state.breakButton.disabled = state.selectedIndex <= 0;
        state.breakButton.textContent = state.manualBreaks.has(state.selectedIndex) ? '이 수동 나눔 제거' : '선택 앞에서 나누기';
      });
      state.downloadButton.addEventListener('click', async function () {
        state.downloadButton.disabled = true;
        state.busy.style.display = 'flex';
        try {
          await generatePdf(state);
        } catch (error) {
          var message = error && error.message ? error.message : String(error);
          state.status.textContent = 'PDF 생성 실패: ' + message;
          if (typeof global.alert === 'function') global.alert('PDF 생성에 실패했습니다.\n' + message);
        } finally {
          state.busy.textContent = '페이지를 나누는 중…';
          state.busy.style.display = 'none';
          state.downloadButton.disabled = false;
        }
      });
      overlay.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') close();
      });
    });

    state.pagesRoot.style.setProperty('--pdf-preview-zoom', '0.75');
    overlay.tabIndex = -1;
    overlay.focus();
    await waitForMedia(parsed.root);
    schedulePaginate(state);
    return result;
  }

  var api = Object.freeze({
    openPreview: openPreview,
    __test: Object.freeze({
      sanitizeFileBase: sanitizeFileBase,
      findWordBoundary: findWordBoundary,
      normalizeQuality: normalizeQuality,
      QUALITY_PRESETS: QUALITY_PRESETS,
      A4_WIDTH_MM: A4_WIDTH_MM,
      A4_HEIGHT_MM: A4_HEIGHT_MM,
      DEFAULT_MARGIN_MM: DEFAULT_MARGIN_MM
    })
  });
  global.PdfExport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

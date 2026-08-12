(function (global) {
  'use strict';

  var A4_WIDTH_MM = 210;
  var A4_HEIGHT_MM = 297;
  var DEFAULT_MARGIN_MM = 15;
  var STYLE_ID = 'mdviewer-pdf-export-style';
  var PREVIEW_ID = 'pdf-export-preview';
  var QUALITY_STORAGE_KEY = 'md_viewer_pdf_quality_v1';
  var DEFAULT_QUALITY = 'standard';
  var MAX_UNDO_HISTORY = 100;
  var PDF_STATE_STORE = 'work_files';
  var PDF_STATE_APP_ID = 'pdf-export';
  var PDF_STATE_WORK_TYPE = 'layout-state';
  var PDF_STATE_VERSION = 1;
  var LINE_SPACING_PRESETS = Object.freeze({
    default: Object.freeze({ label: '기본', value: '' }),
    compact: Object.freeze({ label: '좁게 1.2', value: '1.2' }),
    standard: Object.freeze({ label: '보통 1.5', value: '1.5' }),
    relaxed: Object.freeze({ label: '넓게 1.8', value: '1.8' }),
    wide: Object.freeze({ label: '매우 넓게 2.0', value: '2' })
  });
  var QUALITY_PRESETS = Object.freeze({
    compact: Object.freeze({ label: '용량 절약', scale: 1.25, jpegQuality: 0.78, compression: 'FAST' }),
    standard: Object.freeze({ label: '표준', scale: 2, jpegQuality: 0.9, compression: 'MEDIUM' }),
    high: Object.freeze({ label: '고품질', scale: 3, jpegQuality: 0.97, compression: 'SLOW' })
  });

  function normalizeQuality(value) {
    var key = String(value || '');
    return Object.prototype.hasOwnProperty.call(QUALITY_PRESETS, key) ? key : DEFAULT_QUALITY;
  }

  function normalizeLineSpacing(value) {
    var key = String(value || 'default');
    return Object.prototype.hasOwnProperty.call(LINE_SPACING_PRESETS, key) ? key : 'default';
  }

  function hashString(value) {
    var text = String(value || '');
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function sourceSignature(units) {
    return hashString((units || []).map(function (unit) {
      return unit && unit.outerHTML ? unit.outerHTML : String(unit && unit.textContent || '');
    }).join('\u001e'));
  }

  function normalizeDocumentKey(value, fileName) {
    var key = String(value || '').trim();
    return key || ('file-name:' + sanitizeFileBase(fileName));
  }

  function pdfStateRecordId(documentKey) {
    return PDF_STATE_APP_ID + ':' + hashString(documentKey);
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
      '.pdf-preview-title .pdf-preview-storage-status[data-state="saved"],.pdf-preview-title .pdf-preview-storage-status[data-state="restored"]{color:#86efac}.pdf-preview-title .pdf-preview-storage-status[data-state="error"]{color:#fca5a5}.pdf-preview-title .pdf-preview-storage-status[data-state="changed"]{color:#fcd34d}',
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
      '.pdf-preview-page [data-pdf-line-spacing],.pdf-preview-page [data-pdf-line-spacing] *{line-height:var(--pdf-object-line-spacing)!important}',
      '.pdf-forced-fit{max-height:100%!important;overflow:hidden!important}.pdf-forced-fit>img,.pdf-forced-fit>svg,.pdf-forced-fit>canvas{max-height:100%!important;object-fit:contain!important}',
      '.pdf-preview-help{position:sticky;left:16px;bottom:-48px;align-self:flex-start;max-width:560px;margin-top:6px;padding:9px 12px;border:1px solid #475569;border-radius:9px;background:rgba(15,23,42,.94);color:#cbd5e1;font-size:11px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.24)}',
      '.pdf-preview-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.72);color:#fff;font-size:14px;font-weight:800;z-index:3}',
      '.pdf-object-editor{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.72)}.pdf-object-editor[hidden]{display:none}',
      '.pdf-object-editor-panel{width:min(880px,96vw);max-height:86vh;display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #64748b;border-radius:12px;background:#f8fafc;color:#1e293b;box-shadow:0 24px 70px rgba(0,0,0,.45)}',
      '.pdf-object-editor-panel h3{margin:0;font-size:16px}.pdf-object-editor-panel p{margin:0;color:#64748b;font-size:12px}',
      '.pdf-object-editor-surface{min-height:180px;max-height:60vh;overflow:auto;padding:18px;border:2px solid #38bdf8;border-radius:9px;background:#fff;color:#1e293b;line-height:1.6;outline:none}.pdf-object-editor-surface:focus{box-shadow:0 0 0 3px rgba(56,189,248,.22)}',
      '.pdf-object-editor-actions{display:flex;justify-content:flex-end;gap:8px}',
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

  function createPreviewShell(fileName, quality, showMergeButton) {
    var overlay = global.document.createElement('div');
    overlay.id = PREVIEW_ID;
    overlay.innerHTML =
      '<div class="pdf-preview-toolbar">' +
        '<div class="pdf-preview-title"><strong>PDF 미리보기 · ' + escapeHtml(fileName) + '</strong><span data-pdf-status>A4 페이지를 구성하는 중입니다.</span><span class="pdf-preview-storage-status" data-pdf-storage-status data-state="loading">편집상태 inDB 확인 중…</span></div>' +
        '<label class="pdf-preview-control">여백 <select data-pdf-margin><option value="10">좁게 10 mm</option><option value="15" selected>보통 15 mm</option><option value="20">넓게 20 mm</option><option value="25">매우 넓게 25 mm</option></select></label>' +
        '<label class="pdf-preview-control">PDF 품질 <select data-pdf-quality><option value="compact">용량 절약</option><option value="standard">표준</option><option value="high">고품질</option></select></label>' +
        '<label class="pdf-preview-control">확대 <select data-pdf-zoom><option value="0.6">60%</option><option value="0.75" selected>75%</option><option value="0.9">90%</option><option value="1">100%</option></select></label>' +
        '<label class="pdf-preview-control">객체 줄간격 <select data-pdf-line-spacing disabled><option value="default">기본</option><option value="compact">좁게 1.2</option><option value="standard">보통 1.5</option><option value="relaxed">넓게 1.8</option><option value="wide">매우 넓게 2.0</option></select></label>' +
        '<button type="button" class="pdf-preview-button" data-pdf-edit disabled>선택 객체 수정</button>' +
        '<button type="button" class="pdf-preview-button" data-pdf-undo disabled title="수동 페이지 나눔 작업 실행 취소 (Ctrl+Z)">실행 취소</button>' +
        '<button type="button" class="pdf-preview-button" data-pdf-break disabled>선택 앞에서 나누기</button>' +
        '<button type="button" class="pdf-preview-button" data-pdf-join disabled>선택 앞에서 붙이기</button>' +
        '<button type="button" class="pdf-preview-button" data-pdf-reset>수동 나눔 초기화</button>' +
        '<button type="button" class="pdf-preview-button' + (showMergeButton ? '' : ' hidden') + '" data-pdf-merge>PDF 병합</button>' +
        '<button type="button" class="pdf-preview-button pdf-preview-button-primary" data-pdf-download>PDF 파일 저장</button>' +
        '<button type="button" class="pdf-preview-button pdf-preview-button-danger" data-pdf-close>닫기</button>' +
      '</div>' +
      '<div class="pdf-preview-stage"><div class="pdf-preview-pages" data-pdf-pages></div><div class="pdf-preview-busy" data-pdf-busy>페이지를 나누는 중…</div><div class="pdf-preview-help">객체를 선택해 <b>선택 객체 수정</b>으로 PDF에 들어갈 내용을 직접 고치고 줄간격·나누기·붙이기를 조정할 수 있습니다. 모든 편집 작업은 <b>Ctrl+Z</b>로 되돌리고 문서별로 inDB에 자동 저장합니다.</div>' +
        '<div class="pdf-object-editor" data-pdf-object-editor hidden><section class="pdf-object-editor-panel" role="dialog" aria-modal="true" aria-labelledby="pdf-object-editor-title"><h3 id="pdf-object-editor-title">선택 객체 수정</h3><p>이 수정은 원본 Markdown이 아니라 PDF 내보내기용 편집 상태에 저장됩니다. 표·목록 구조를 유지하면서 글자를 직접 고칠 수 있습니다.</p><div class="pdf-object-editor-surface markdown-body" data-pdf-edit-surface contenteditable="true" spellcheck="true"></div><div class="pdf-object-editor-actions"><button type="button" class="pdf-preview-button" data-pdf-edit-cancel>취소</button><button type="button" class="pdf-preview-button pdf-preview-button-primary" data-pdf-edit-apply>수정 적용</button></div></section></div>' +
      '</div>';
    global.document.body.appendChild(overlay);
    overlay.querySelector('[data-pdf-quality]').value = normalizeQuality(quality);
    return overlay;
  }

  function getPdfStateDatabase() {
    try {
      var storage = global.InDbStorage;
      var database = storage && typeof storage.getDatabase === 'function' ? storage.getDatabase() : null;
      return database && database.objectStoreNames && database.objectStoreNames.contains(PDF_STATE_STORE) ? database : null;
    } catch (_) {
      return null;
    }
  }

  function readPdfStateRecord(documentKey) {
    var database = getPdfStateDatabase();
    if (!database) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      try {
        var request = database.transaction(PDF_STATE_STORE, 'readonly')
          .objectStore(PDF_STATE_STORE)
          .get(pdfStateRecordId(documentKey));
        request.onsuccess = function () {
          var record = request.result || null;
          resolve(record && record.appId === PDF_STATE_APP_ID && record.documentKey === documentKey ? record : null);
        };
        request.onerror = function () { reject(request.error || new Error('PDF 편집상태를 읽지 못했습니다.')); };
      } catch (error) {
        reject(error);
      }
    });
  }

  function deserializeEditedUnit(html, ownerDocument) {
    if (!html || !ownerDocument) return null;
    var parsed = new global.DOMParser().parseFromString('<body>' + String(html) + '</body>', 'text/html');
    var element = parsed.body.firstElementChild;
    if (!element) return null;
    Array.prototype.slice.call(element.querySelectorAll('script,style,form,input,textarea,select,button,object,embed')).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    [element].concat(Array.prototype.slice.call(element.querySelectorAll('*'))).forEach(function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attribute) {
        var name = String(attribute.name || '').toLowerCase();
        var value = String(attribute.value || '').trim();
        if (name.indexOf('on') === 0 || name === 'contenteditable' || name === 'tabindex' || name === 'data-pdf-source-index' || name === 'data-pdf-line-spacing') {
          node.removeAttribute(attribute.name);
        } else if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
      if (node.classList) node.classList.remove('pdf-preview-selected', 'pdf-forced-fit');
      if (node.style) node.style.removeProperty('--pdf-object-line-spacing');
    });
    return ownerDocument.importNode(element, true);
  }

  function applyObjectEditsToUnits(state) {
    state.units = state.baseUnits.map(function (unit) { return unit.cloneNode(true); });
    state.objectEdits.forEach(function (html, index) {
      var sourceIndex = validSourceIndex(index, state.units.length);
      if (sourceIndex < 0) return;
      var edited = deserializeEditedUnit(html, state.sourceDocument);
      if (edited) state.units[sourceIndex] = edited;
    });
  }

  function writePdfStateRecord(state) {
    var database = getPdfStateDatabase();
    if (!database) return Promise.reject(new Error('MarkdownProDB work_files 저장소가 준비되지 않았습니다.'));
    var now = new Date().toISOString();
    var record = {
      id: pdfStateRecordId(state.documentKey),
      appId: PDF_STATE_APP_ID,
      workType: PDF_STATE_WORK_TYPE,
      name: state.fileName,
      documentKey: state.documentKey,
      sourceSignature: state.sourceSignature,
      stateVersion: PDF_STATE_VERSION,
      layout: {
        margin: state.margin,
        manualBreaks: Array.from(state.manualBreaks).sort(function (left, right) { return left - right; }),
        manualJoins: Array.from(state.manualJoins).sort(function (left, right) { return left - right; }),
        objectLineSpacing: Array.from(state.objectLineSpacing.entries())
          .sort(function (left, right) { return left[0] - right[0]; })
          .map(function (entry) { return { index: entry[0], value: normalizeLineSpacing(entry[1]) }; }),
        objectEdits: Array.from(state.objectEdits.entries())
          .sort(function (left, right) { return left[0] - right[0]; })
          .map(function (entry) { return { index: entry[0], html: String(entry[1] || '') }; })
      },
      createdAt: state.persistedCreatedAt || now,
      updatedAt: now
    };
    return new Promise(function (resolve, reject) {
      try {
        var transaction = database.transaction(PDF_STATE_STORE, 'readwrite');
        transaction.objectStore(PDF_STATE_STORE).put(record);
        transaction.oncomplete = function () {
          state.persistedCreatedAt = record.createdAt;
          resolve(record);
        };
        transaction.onerror = function () { reject(transaction.error || new Error('PDF 편집상태를 저장하지 못했습니다.')); };
        transaction.onabort = function () { reject(transaction.error || new Error('PDF 편집상태 저장이 중단되었습니다.')); };
      } catch (error) {
        reject(error);
      }
    });
  }

  function validSourceIndex(value, unitCount) {
    var index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < unitCount ? index : -1;
  }

  function restorePdfLayoutState(state, record) {
    if (!record || Number(record.stateVersion) !== PDF_STATE_VERSION || !record.layout) return 'empty';
    if (String(record.sourceSignature || '') !== state.sourceSignature) return 'changed';
    var layout = record.layout || {};
    var margin = Number(layout.margin);
    if ([10, 15, 20, 25].indexOf(margin) >= 0) state.margin = margin;
    state.manualBreaks = new Set((Array.isArray(layout.manualBreaks) ? layout.manualBreaks : []).map(function (value) {
      return validSourceIndex(value, state.units.length);
    }).filter(function (value) { return value > 0; }));
    state.manualJoins = new Set((Array.isArray(layout.manualJoins) ? layout.manualJoins : []).map(function (value) {
      return validSourceIndex(value, state.units.length);
    }).filter(function (value) { return value > 0 && !state.manualBreaks.has(value); }));
    state.objectLineSpacing = new Map();
    (Array.isArray(layout.objectLineSpacing) ? layout.objectLineSpacing : []).forEach(function (entry) {
      var index = validSourceIndex(entry && entry.index, state.units.length);
      var spacing = normalizeLineSpacing(entry && entry.value);
      if (index >= 0 && spacing !== 'default') state.objectLineSpacing.set(index, spacing);
    });
    state.objectEdits = new Map();
    (Array.isArray(layout.objectEdits) ? layout.objectEdits : []).forEach(function (entry) {
      var index = validSourceIndex(entry && entry.index, state.units.length);
      var edited = deserializeEditedUnit(entry && entry.html, state.sourceDocument);
      if (index >= 0 && edited) state.objectEdits.set(index, edited.outerHTML);
    });
    applyObjectEditsToUnits(state);
    state.persistedCreatedAt = record.createdAt || null;
    return 'restored';
  }

  function setStorageStatus(state, message, status) {
    if (!state.storageStatus) return;
    state.storageStatus.textContent = message;
    state.storageStatus.setAttribute('data-state', status || '');
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

  function applyObjectLineSpacing(state, node, sourceIndex) {
    var spacingKey = normalizeLineSpacing(state.objectLineSpacing.get(sourceIndex));
    var preset = LINE_SPACING_PRESETS[spacingKey];
    if (!node || !preset || !preset.value) return;
    node.setAttribute('data-pdf-line-spacing', spacingKey);
    node.style.setProperty('--pdf-object-line-spacing', preset.value);
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
      var shouldJoinUp = allowManual && sourceIndex > 0 && state.manualJoins.has(sourceIndex) && !pageIsEmpty(current);
      var node = global.document.importNode(element, true);
      node.setAttribute('data-pdf-source-index', String(sourceIndex));
      applyObjectLineSpacing(state, node, sourceIndex);
      current.content.appendChild(node);
      if (fits(current.content)) return;
      current.content.removeChild(node);

      if (shouldJoinUp) {
        var joinedFragments = splitOversized(element, current.content);
        if (joinedFragments && joinedFragments.length > 1) {
          joinedFragments.forEach(function (fragment) { place(fragment, sourceIndex, false, depth + 1); });
          return;
        }
      }

      if (!pageIsEmpty(current)) {
        current = addPage(state);
        node = global.document.importNode(element, true);
        node.setAttribute('data-pdf-source-index', String(sourceIndex));
        applyObjectLineSpacing(state, node, sourceIndex);
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
    if (typeof state.restoreSelection === 'function') state.restoreSelection();
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
    var overlay = createPreviewShell(fileName, quality, payload.showMergeButton === true);
    var units = sourceUnits(parsed.root);
    var documentKey = normalizeDocumentKey(payload.documentKey, payload.fileName || fileName);

    var state = {
      overlay: overlay,
      sourceDocument: parsed.document,
      baseUnits: units.map(function (unit) { return unit.cloneNode(true); }),
      units: units.map(function (unit) { return unit.cloneNode(true); }),
      fileName: fileName,
      documentKey: documentKey,
      sourceSignature: sourceSignature(units),
      pagesRoot: overlay.querySelector('[data-pdf-pages]'),
      pages: [],
      margin: DEFAULT_MARGIN_MM,
      quality: quality,
      manualBreaks: new Set(),
      manualJoins: new Set(),
      objectLineSpacing: new Map(),
      objectEdits: new Map(),
      undoHistory: [],
      selectedIndex: -1,
      status: overlay.querySelector('[data-pdf-status]'),
      storageStatus: overlay.querySelector('[data-pdf-storage-status]'),
      busy: overlay.querySelector('[data-pdf-busy]'),
      undoButton: overlay.querySelector('[data-pdf-undo]'),
      breakButton: overlay.querySelector('[data-pdf-break]'),
      joinButton: overlay.querySelector('[data-pdf-join]'),
      lineSpacingSelect: overlay.querySelector('[data-pdf-line-spacing]'),
      editButton: overlay.querySelector('[data-pdf-edit]'),
      mergeButton: overlay.querySelector('[data-pdf-merge]'),
      objectEditor: overlay.querySelector('[data-pdf-object-editor]'),
      editSurface: overlay.querySelector('[data-pdf-edit-surface]'),
      downloadButton: overlay.querySelector('[data-pdf-download]'),
      persistTimer: null,
      persistPromise: Promise.resolve(true),
      persistedCreatedAt: null,
      downloaded: false
    };
    state.restoreSelection = restoreSelection;

    function clearSelection() {
      Array.prototype.slice.call(state.pagesRoot.querySelectorAll('.pdf-preview-selected')).forEach(function (node) {
        node.classList.remove('pdf-preview-selected');
      });
    }

    function copyIndexSet(indexSet) {
      return Array.from(indexSet).sort(function (left, right) { return left - right; });
    }

    function paginationSnapshot() {
      return {
        margin: state.margin,
        manualBreaks: copyIndexSet(state.manualBreaks),
        manualJoins: copyIndexSet(state.manualJoins),
        objectLineSpacing: Array.from(state.objectLineSpacing.entries())
          .sort(function (left, right) { return left[0] - right[0]; })
          .map(function (entry) { return entry[0] + ':' + normalizeLineSpacing(entry[1]); }),
        objectEdits: Array.from(state.objectEdits.entries())
          .sort(function (left, right) { return left[0] - right[0]; })
          .map(function (entry) { return entry[0] + ':' + String(entry[1] || ''); })
      };
    }

    function samePaginationSnapshot(left, right) {
      return left.margin === right.margin &&
        left.manualBreaks.join(',') === right.manualBreaks.join(',') &&
        left.manualJoins.join(',') === right.manualJoins.join(',') &&
        JSON.stringify(left.objectLineSpacing) === JSON.stringify(right.objectLineSpacing) &&
        JSON.stringify(left.objectEdits) === JSON.stringify(right.objectEdits);
    }

    function updateActionButtons() {
      var canActOnSelection = state.selectedIndex > 0;
      state.undoButton.disabled = state.undoHistory.length === 0;
      state.breakButton.disabled = !canActOnSelection || state.manualBreaks.has(state.selectedIndex);
      state.joinButton.disabled = !canActOnSelection || state.manualJoins.has(state.selectedIndex);
      state.lineSpacingSelect.disabled = state.selectedIndex < 0;
      state.editButton.disabled = state.selectedIndex < 0;
      state.lineSpacingSelect.value = state.selectedIndex < 0
        ? 'default'
        : normalizeLineSpacing(state.objectLineSpacing.get(state.selectedIndex));
    }

    function restoreSelection() {
      clearSelection();
      if (state.selectedIndex >= 0) {
        Array.prototype.slice.call(state.pagesRoot.querySelectorAll('[data-pdf-source-index="' + state.selectedIndex + '"]')).forEach(function (node) {
          node.classList.add('pdf-preview-selected');
        });
      }
      updateActionButtons();
    }

    function closeObjectEditor() {
      state.objectEditor.hidden = true;
      state.editSurface.replaceChildren();
      try { overlay.focus(); } catch (_) {}
    }

    function openObjectEditor() {
      if (state.selectedIndex < 0 || !state.units[state.selectedIndex]) return false;
      state.editSurface.replaceChildren(global.document.importNode(state.units[state.selectedIndex], true));
      state.objectEditor.hidden = false;
      try { state.editSurface.focus(); } catch (_) {}
      return true;
    }

    function applyObjectEditorChange() {
      if (state.selectedIndex < 0) return closeObjectEditor();
      var edited = state.editSurface.firstElementChild;
      if (!edited) {
        edited = global.document.importNode(state.units[state.selectedIndex], false);
        edited.textContent = state.editSurface.textContent || '';
      }
      var sanitized = deserializeEditedUnit(edited.outerHTML, state.sourceDocument);
      if (!sanitized) return;
      var sourceIndex = state.selectedIndex;
      closeObjectEditor();
      recordPaginationChange(function () {
        var baseHtml = state.baseUnits[sourceIndex] && state.baseUnits[sourceIndex].outerHTML;
        if (sanitized.outerHTML === baseHtml) state.objectEdits.delete(sourceIndex);
        else state.objectEdits.set(sourceIndex, sanitized.outerHTML);
      });
    }

    function flushPdfEditState() {
      if (state.persistTimer) {
        global.clearTimeout(state.persistTimer);
        state.persistTimer = null;
      }
      state.persistPromise = state.persistPromise.catch(function () { return false; }).then(function () {
        setStorageStatus(state, '편집상태 inDB 저장 중…', 'saving');
        return writePdfStateRecord(state);
      }).then(function () {
        setStorageStatus(state, '편집상태 inDB 저장됨', 'saved');
        return true;
      }).catch(function (error) {
        setStorageStatus(state, '편집상태 inDB 저장 실패 · ' + (error && error.message ? error.message : String(error)), 'error');
        return false;
      });
      return state.persistPromise;
    }

    function queuePdfEditStateSave() {
      if (state.persistTimer) global.clearTimeout(state.persistTimer);
      setStorageStatus(state, '편집상태 inDB 저장 대기…', 'saving');
      state.persistTimer = global.setTimeout(function () {
        state.persistTimer = null;
        flushPdfEditState();
      }, 180);
    }

    function recordPaginationChange(change) {
      var before = paginationSnapshot();
      change();
      applyObjectEditsToUnits(state);
      var after = paginationSnapshot();
      if (samePaginationSnapshot(before, after)) {
        updateActionButtons();
        return false;
      }
      state.undoHistory.push(before);
      if (state.undoHistory.length > MAX_UNDO_HISTORY) state.undoHistory.shift();
      updateActionButtons();
      schedulePaginate(state);
      queuePdfEditStateSave();
      return true;
    }

    function undoPaginationChange() {
      var previous = state.undoHistory.pop();
      if (!previous) {
        updateActionButtons();
        return false;
      }
      state.margin = previous.margin;
      state.manualBreaks = new Set(previous.manualBreaks);
      state.manualJoins = new Set(previous.manualJoins);
      state.objectLineSpacing = new Map((previous.objectLineSpacing || []).map(function (entry) {
        var separator = String(entry).indexOf(':');
        return [Number(String(entry).slice(0, separator)), normalizeLineSpacing(String(entry).slice(separator + 1))];
      }).filter(function (entry) { return entry[0] >= 0 && entry[1] !== 'default'; }));
      state.objectEdits = new Map((previous.objectEdits || []).map(function (entry) {
        var separator = String(entry).indexOf(':');
        return [Number(String(entry).slice(0, separator)), String(entry).slice(separator + 1)];
      }).filter(function (entry) { return entry[0] >= 0 && entry[1]; }));
      applyObjectEditsToUnits(state);
      overlay.querySelector('[data-pdf-margin]').value = String(state.margin);
      updateActionButtons();
      schedulePaginate(state);
      queuePdfEditStateSave();
      return true;
    }

    if (!getPdfStateDatabase()) {
      setStorageStatus(state, '편집상태 inDB 저장 불가 · 데이터베이스 준비 안 됨', 'error');
    } else {
      try {
        var savedStateRecord = await readPdfStateRecord(state.documentKey);
        var restoreResult = restorePdfLayoutState(state, savedStateRecord);
        if (restoreResult === 'restored') setStorageStatus(state, '편집상태 inDB 복원됨', 'restored');
        else if (restoreResult === 'changed') setStorageStatus(state, '문서 내용 변경 감지 · 새 편집상태로 시작', 'changed');
        else setStorageStatus(state, '편집상태 inDB 자동 저장 준비', 'saved');
      } catch (error) {
        setStorageStatus(state, '편집상태 inDB 읽기 실패 · ' + (error && error.message ? error.message : String(error)), 'error');
      }
    }
    overlay.querySelector('[data-pdf-margin]').value = String(state.margin);

    var result = new Promise(function (resolve) {
      async function close(value) {
        if (state.persistTimer) await flushPdfEditState();
        else await state.persistPromise.catch(function () { return false; });
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value == null ? state.downloaded : !!value);
      }
      overlay.querySelector('[data-pdf-close]').addEventListener('click', function () { close(); });
      overlay.querySelector('[data-pdf-margin]').addEventListener('change', function (event) {
        var nextMargin = Number(event.target.value) || DEFAULT_MARGIN_MM;
        recordPaginationChange(function () { state.margin = nextMargin; });
      });
      overlay.querySelector('[data-pdf-zoom]').addEventListener('change', function (event) {
        state.pagesRoot.style.setProperty('--pdf-preview-zoom', String(Number(event.target.value) || 0.75));
      });
      overlay.querySelector('[data-pdf-quality]').addEventListener('change', function (event) {
        state.quality = storeQuality(event.target.value);
        state.status.textContent = 'A4 ' + state.pages.length + '쪽 · 여백 ' + state.margin + ' mm · PDF 품질 ' + QUALITY_PRESETS[state.quality].label;
      });
      state.lineSpacingSelect.addEventListener('change', function (event) {
        if (state.selectedIndex < 0) return;
        var spacing = normalizeLineSpacing(event.target.value);
        recordPaginationChange(function () {
          if (spacing === 'default') state.objectLineSpacing.delete(state.selectedIndex);
          else state.objectLineSpacing.set(state.selectedIndex, spacing);
        });
      });
      state.editButton.addEventListener('click', openObjectEditor);
      overlay.querySelector('[data-pdf-edit-cancel]').addEventListener('click', closeObjectEditor);
      overlay.querySelector('[data-pdf-edit-apply]').addEventListener('click', applyObjectEditorChange);
      if (state.mergeButton) {
        state.mergeButton.addEventListener('click', function () {
          if (typeof payload.onOpenMerge === 'function') payload.onOpenMerge();
          else if (global.PdfMerge && typeof global.PdfMerge.open === 'function') global.PdfMerge.open();
        });
      }
      overlay.querySelector('[data-pdf-reset]').addEventListener('click', function () {
        recordPaginationChange(function () {
          state.manualBreaks.clear();
          state.manualJoins.clear();
        });
      });
      state.undoButton.addEventListener('click', undoPaginationChange);
      state.breakButton.addEventListener('click', function () {
        if (state.selectedIndex <= 0) return;
        recordPaginationChange(function () {
          state.manualJoins.delete(state.selectedIndex);
          state.manualBreaks.add(state.selectedIndex);
        });
      });
      state.joinButton.addEventListener('click', function () {
        if (state.selectedIndex <= 0) return;
        recordPaginationChange(function () {
          state.manualBreaks.delete(state.selectedIndex);
          state.manualJoins.add(state.selectedIndex);
        });
      });
      state.pagesRoot.addEventListener('click', function (event) {
        var target = event.target.closest('[data-pdf-source-index]');
        if (!target) return;
        event.preventDefault();
        state.selectedIndex = Number(target.getAttribute('data-pdf-source-index'));
        restoreSelection();
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
        if (event.key === 'Escape') {
          if (!state.objectEditor.hidden) closeObjectEditor();
          else close();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && String(event.key || '').toLowerCase() === 'z') {
          if (event.target && event.target.closest && event.target.closest('[data-pdf-edit-surface]')) return;
          event.preventDefault();
          event.stopPropagation();
          undoPaginationChange();
        }
      });
    });

    state.pagesRoot.style.setProperty('--pdf-preview-zoom', '0.75');
    overlay.tabIndex = -1;
    overlay.focus();
    await waitForMedia(parsed.root);
    schedulePaginate(state);
    updateActionButtons();
    return result;
  }

  var api = Object.freeze({
    openPreview: openPreview,
    __test: Object.freeze({
      sanitizeFileBase: sanitizeFileBase,
      findWordBoundary: findWordBoundary,
      normalizeQuality: normalizeQuality,
      normalizeLineSpacing: normalizeLineSpacing,
      hashString: hashString,
      pdfStateRecordId: pdfStateRecordId,
      QUALITY_PRESETS: QUALITY_PRESETS,
      LINE_SPACING_PRESETS: LINE_SPACING_PRESETS,
      A4_WIDTH_MM: A4_WIDTH_MM,
      A4_HEIGHT_MM: A4_HEIGHT_MM,
      DEFAULT_MARGIN_MM: DEFAULT_MARGIN_MM
    })
  });
  global.PdfExport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

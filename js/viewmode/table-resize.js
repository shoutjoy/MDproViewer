(function (global) {
  'use strict';

  var activeSession = null;
  var overlay = null;
  var sizeLabel = null;
  var columnHandles = null;
  var rowHandles = null;
  var sourceHtml = '';
  var bound = false;

  function clampPercent(value) {
    return Math.max(15, Math.min(100, Math.round(Number(value) * 10) / 10));
  }

  function clampHeight(value) {
    return Math.max(40, Math.min(10000, Math.round(Number(value) || 40)));
  }

  function escapeAttribute(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function findTagEnd(source, start) {
    var quote = '';
    for (var index = start; index < source.length; index += 1) {
      var char = source.charAt(index);
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') return index + 1;
    }
    return -1;
  }

  function scanHtmlTables(source) {
    var html = String(source || '');
    var tagPattern = /<\/?table\b/ig;
    var stack = [];
    var records = [];
    var match;
    while ((match = tagPattern.exec(html))) {
      var tagEnd = findTagEnd(html, match.index);
      if (tagEnd < 0) break;
      var isClose = html.slice(match.index, match.index + 8).toLowerCase().indexOf('</table') === 0;
      if (!isClose) {
        stack.push({ start: match.index, openEnd: tagEnd, openTag: html.slice(match.index, tagEnd) });
      } else if (stack.length) {
        var record = stack.pop();
        record.end = tagEnd;
        record.raw = html.slice(record.start, tagEnd);
        records.push(record);
      }
      tagPattern.lastIndex = tagEnd;
    }
    records.sort(function (left, right) { return left.start - right.start; });
    return records;
  }

  function readHtmlAttribute(tag, name) {
    var match = String(tag || '').match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
    return match ? (match[1] != null ? match[1] : (match[2] != null ? match[2] : match[3])) : '';
  }

  function setHtmlAttribute(tag, name, value) {
    var pattern = new RegExp('(\\s' + name + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
    if (pattern.test(tag)) return tag.replace(pattern, ' ' + name + '="' + escapeAttribute(value) + '"');
    var close = tag.lastIndexOf('>');
    if (close < 0) return tag;
    return tag.slice(0, close) + ' ' + name + '="' + escapeAttribute(value) + '"' + tag.slice(close);
  }

  function setSizeStyle(styleText, percent, height) {
    var parts = String(styleText || '').split(';').map(function (part) { return part.trim(); }).filter(function (part) {
      if (!part) return false;
      if (percent != null && /^(?:width|max-width)\s*:/i.test(part)) return false;
      if (height != null && /^(?:height|min-height|max-height)\s*:/i.test(part)) return false;
      return true;
    });
    if (percent != null) {
      parts.push('width:' + clampPercent(percent) + '%');
      parts.push('max-width:100%');
    }
    if (height != null) parts.push('height:' + clampHeight(height) + 'px');
    return parts.join(';');
  }

  function updateTableOpenTag(openTag, percent, height) {
    var next = String(openTag || '');
    var style = readHtmlAttribute(next, 'style');
    next = setHtmlAttribute(next, 'style', setSizeStyle(style, percent, height));
    if (percent != null) next = next.replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    if (height != null) next = next.replace(/\sheight\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    return next;
  }

  function setTagPixelStyle(tag, property, value) {
    var next = String(tag || '');
    var style = readHtmlAttribute(next, 'style');
    var pattern = new RegExp('^' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'i');
    var parts = String(style || '').split(';').map(function (part) { return part.trim(); }).filter(function (part) {
      return part && !pattern.test(part);
    });
    parts.push(property + ':' + Math.max(1, Math.round(Number(value) || 1)) + 'px');
    next = setHtmlAttribute(next, 'style', parts.join(';'));
    if (property === 'width') next = next.replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    if (property === 'height') next = next.replace(/\sheight\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '');
    return next;
  }

  function findTopLevelStartTags(rawTable, tagName) {
    var source = String(rawTable || '');
    var pattern = /<\/?[a-z][^>]*>/ig;
    var tableDepth = 0;
    var tags = [];
    var match;
    while ((match = pattern.exec(source))) {
      var token = match[0];
      var nameMatch = token.match(/^<\/?\s*([a-z0-9:-]+)/i);
      if (!nameMatch) continue;
      var name = nameMatch[1].toLowerCase();
      var isClose = /^<\//.test(token);
      if (name === 'table') {
        if (isClose) tableDepth = Math.max(0, tableDepth - 1);
        else tableDepth += 1;
        continue;
      }
      if (!isClose && tableDepth === 1 && name === String(tagName || '').toLowerCase()) {
        tags.push({ start: match.index, end: pattern.lastIndex, tag: token });
      }
    }
    return tags;
  }

  function replaceTopLevelTagStyles(rawTable, tagName, values, property) {
    var raw = String(rawTable || '');
    var tags = findTopLevelStartTags(raw, tagName);
    var replacements = [];
    Object.keys(values || {}).forEach(function (key) {
      var index = Number(key);
      if (!Number.isInteger(index) || !tags[index]) return;
      replacements.push({
        start: tags[index].start,
        end: tags[index].end,
        tag: setTagPixelStyle(tags[index].tag, property, values[key])
      });
    });
    replacements.sort(function (left, right) { return right.start - left.start; });
    replacements.forEach(function (replacement) {
      raw = raw.slice(0, replacement.start) + replacement.tag + raw.slice(replacement.end);
    });
    return { raw: raw, count: tags.length, changed: replacements.length > 0 };
  }

  function insertColumnGroup(rawTable, widths) {
    var raw = String(rawTable || '');
    var openEnd = findTagEnd(raw, 0);
    if (openEnd < 0 || !widths || !widths.length) return raw;
    var group = '<colgroup>' + widths.map(function (width) {
      return '<col style="width:' + Math.max(1, Math.round(Number(width) || 1)) + 'px">';
    }).join('') + '</colgroup>';
    return raw.slice(0, openEnd) + group + raw.slice(openEnd);
  }

  function replaceTableLayout(source, record, options) {
    var html = String(source || '');
    if (!record) return { changed: false, html: html, reason: 'missing-record' };
    var current = record;
    if (html.slice(record.start, record.end) !== record.raw) {
      var candidates = scanHtmlTables(html).filter(function (candidate) {
        return candidate.raw === record.raw || candidate.openTag === record.openTag;
      });
      if (!candidates.length) return { changed: false, html: html, reason: 'source-changed' };
      candidates.sort(function (left, right) { return Math.abs(left.start - record.start) - Math.abs(right.start - record.start); });
      current = candidates[0];
    }
    var opts = options || {};
    var raw = current.raw;
    var nextOpen = (opts.percent != null || opts.height != null)
      ? updateTableOpenTag(current.openTag, opts.percent, opts.height)
      : current.openTag;
    if (nextOpen !== current.openTag) raw = nextOpen + raw.slice(current.openTag.length);
    var columnResult = replaceTopLevelTagStyles(raw, 'col', opts.columnWidths, 'width');
    raw = columnResult.raw;
    if (!columnResult.count && Array.isArray(opts.allColumnWidths) && opts.allColumnWidths.length) {
      raw = insertColumnGroup(raw, opts.allColumnWidths);
      columnResult.changed = true;
    }
    var rowResult = replaceTopLevelTagStyles(raw, 'tr', opts.rowHeights, 'height');
    raw = rowResult.raw;
    return {
      changed: raw !== current.raw,
      html: html.slice(0, current.start) + raw + html.slice(current.end),
      start: current.start,
      end: current.start + raw.length,
      replacement: raw,
      columnsChanged: columnResult.changed,
      rowsChanged: rowResult.changed
    };
  }

  function replaceTableSize(source, record, percent, height) {
    var html = String(source || '');
    if (!record) return { changed: false, html: html, reason: 'missing-record' };
    var current = record;
    if (html.slice(record.start, record.end) !== record.raw) {
      var candidates = scanHtmlTables(html).filter(function (candidate) {
        return candidate.raw === record.raw || candidate.openTag === record.openTag;
      });
      if (!candidates.length) return { changed: false, html: html, reason: 'source-changed' };
      candidates.sort(function (left, right) { return Math.abs(left.start - record.start) - Math.abs(right.start - record.start); });
      current = candidates[0];
    }
    var nextOpen = updateTableOpenTag(current.openTag, percent, height);
    return {
      changed: nextOpen !== current.openTag,
      html: html.slice(0, current.start) + nextOpen + html.slice(current.openEnd),
      start: current.start,
      end: current.start + nextOpen.length,
      replacement: nextOpen
    };
  }

  function replaceTableWidth(source, record, percent) {
    return replaceTableSize(source, record, percent, null);
  }

  function ensureOverlay() {
    if (overlay || !global.document) return overlay;
    overlay = global.document.createElement('div');
    overlay.className = 'md-table-resize-overlay no-print';
    overlay.innerHTML = ''
      + '<div class="md-table-resize-size" aria-live="polite"></div>'
      + '<button type="button" class="md-table-resize-handle is-w" data-direction="w" aria-label="표 왼쪽 너비 조절" title="드래그하여 표 너비 조절"></button>'
      + '<button type="button" class="md-table-resize-handle is-e" data-direction="e" aria-label="표 오른쪽 너비 조절" title="드래그하여 표 너비 조절"></button>'
      + '<button type="button" class="md-table-resize-handle is-s" data-direction="s" aria-label="표 높이 조절" title="드래그하여 표 높이 조절"></button>'
      + '<button type="button" class="md-table-resize-handle is-sw is-corner" data-direction="sw" aria-label="표 왼쪽 아래 전체 크기 조절" title="드래그하여 표 너비와 높이 조절"></button>'
      + '<button type="button" class="md-table-resize-handle is-se is-corner" data-direction="se" aria-label="표 오른쪽 아래 전체 크기 조절" title="드래그하여 표 너비와 높이 조절"></button>'
      + '<div class="md-table-column-handles" aria-label="열 너비 조절"></div>'
      + '<div class="md-table-row-handles" aria-label="행 높이 조절"></div>'
      + '<div class="md-table-resize-actions">'
      + '<button type="button" class="md-table-resize-confirm">Confirm</button>'
      + '<button type="button" class="md-table-resize-cancel">Cancel</button>'
      + '</div>';
    global.document.body.appendChild(overlay);
    sizeLabel = overlay.querySelector('.md-table-resize-size');
    columnHandles = overlay.querySelector('.md-table-column-handles');
    rowHandles = overlay.querySelector('.md-table-row-handles');
    overlay.querySelectorAll('.md-table-resize-handle').forEach(function (handle) {
      handle.addEventListener('pointerdown', startDrag, { passive: false });
    });
    overlay.querySelector('.md-table-resize-confirm').addEventListener('click', confirmResize);
    overlay.querySelector('.md-table-resize-cancel').addEventListener('click', cancelResize);
    return overlay;
  }

  function updateOverlay() {
    if (!activeSession || !overlay || !activeSession.table.isConnected) return;
    var rect = activeSession.table.getBoundingClientRect();
    overlay.style.left = Math.round(rect.left) + 'px';
    overlay.style.top = Math.round(rect.top) + 'px';
    overlay.style.width = Math.round(rect.width) + 'px';
    overlay.style.height = Math.round(rect.height) + 'px';
    if (!activeSession.dragLabel) {
      sizeLabel.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height)
        + ' px · ' + activeSession.percent + '%';
    }
    Array.from(columnHandles ? columnHandles.children : []).forEach(function (handle, index) {
      var col = activeSession.columns[index];
      if (!col) return;
      var colRect = col.getBoundingClientRect();
      handle.style.left = Math.round(colRect.right - rect.left) + 'px';
    });
    Array.from(rowHandles ? rowHandles.children : []).forEach(function (handle, index) {
      var row = activeSession.rows[index];
      if (!row) return;
      var rowRect = row.getBoundingClientRect();
      handle.style.top = Math.round(rowRect.bottom - rect.top) + 'px';
    });
  }

  function ensureColumns(table) {
    var columns = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    if (columns.length) return { columns: columns, created: null };
    var firstRow = table.rows && table.rows[0];
    if (!firstRow || !firstRow.cells.length) return { columns: [], created: null };
    var tableWidth = Math.max(1, table.getBoundingClientRect().width);
    var group = table.ownerDocument.createElement('colgroup');
    Array.from(firstRow.cells).forEach(function (cell) {
      var span = Math.max(1, Number(cell.colSpan) || 1);
      var cellWidth = Math.max(24, cell.getBoundingClientRect().width / span);
      for (var index = 0; index < span; index += 1) {
        var col = table.ownerDocument.createElement('col');
        col.style.width = (cellWidth / tableWidth * 100) + '%';
        group.appendChild(col);
      }
    });
    table.insertBefore(group, table.firstChild);
    return { columns: Array.from(group.children), created: group };
  }

  function makeLayoutHandles() {
    if (!activeSession || !columnHandles || !rowHandles) return;
    columnHandles.innerHTML = '';
    rowHandles.innerHTML = '';
    for (var columnIndex = 0; columnIndex < activeSession.columns.length - 1; columnIndex += 1) {
      var columnHandle = global.document.createElement('button');
      columnHandle.type = 'button';
      columnHandle.className = 'md-table-column-resize-handle';
      columnHandle.dataset.columnIndex = String(columnIndex);
      columnHandle.setAttribute('aria-label', (columnIndex + 1) + '열과 ' + (columnIndex + 2) + '열 너비 조절');
      columnHandle.title = '드래그하여 열 너비 조절';
      columnHandle.addEventListener('pointerdown', startColumnDrag, { passive: false });
      columnHandles.appendChild(columnHandle);
    }
    activeSession.rows.forEach(function (_row, rowIndex) {
      var rowHandle = global.document.createElement('button');
      rowHandle.type = 'button';
      rowHandle.className = 'md-table-row-resize-handle';
      rowHandle.dataset.rowIndex = String(rowIndex);
      rowHandle.setAttribute('aria-label', (rowIndex + 1) + '행 높이 조절');
      rowHandle.title = '드래그하여 행 높이 조절';
      rowHandle.addEventListener('pointerdown', startRowDrag, { passive: false });
      rowHandles.appendChild(rowHandle);
    });
  }

  function openForTable(table) {
    var record = table && table.__mdTableResizeRecord;
    if (!record || !table.isConnected) return false;
    if (activeSession && activeSession.table !== table) cancelResize();
    ensureOverlay();
    var root = table.closest('#viewer') || table.closest('.markdown-body') || table.parentNode;
    var rootWidth = Math.max(1, root && root.clientWidth || table.getBoundingClientRect().width);
    var rect = table.getBoundingClientRect();
    var columnSetup = ensureColumns(table);
    var rows = Array.from(table.rows || []);
    activeSession = {
      table: table,
      record: record,
      rootWidth: rootWidth,
      originalStyle: table.getAttribute('style'),
      percent: clampPercent(rect.width / rootWidth * 100),
      height: clampHeight(rect.height),
      widthChanged: false,
      heightChanged: false,
      columns: columnSetup.columns,
      rows: rows,
      createdColgroup: columnSetup.created,
      originalColumnStyles: columnSetup.columns.map(function (col) { return col.getAttribute('style'); }),
      originalRowStyles: rows.map(function (row) { return row.getAttribute('style'); }),
      columnWidths: {},
      rowHeights: {},
      dragLabel: '',
      onConfirm: table.__mdTableResizeOnConfirm || (root && root.__mdTableResizeOnConfirm)
    };
    table.classList.add('md-view-table-resizing');
    overlay.classList.add('is-open');
    makeLayoutHandles();
    updateOverlay();
    return true;
  }

  function applyPreviewSize(percent, height, changes) {
    if (!activeSession) return;
    var changeFlags = changes || {};
    if (percent != null) {
      activeSession.percent = clampPercent(percent);
      activeSession.table.style.width = activeSession.percent + '%';
      activeSession.table.style.maxWidth = '100%';
      if (changeFlags.width) activeSession.widthChanged = true;
    }
    if (height != null) {
      activeSession.height = clampHeight(height);
      activeSession.table.style.height = activeSession.height + 'px';
      if (changeFlags.height) activeSession.heightChanged = true;
    }
    updateOverlay();
  }

  function startDrag(event) {
    if (!activeSession) return;
    var direction = String(event.currentTarget.getAttribute('data-direction') || 'e');
    var startX = event.clientX;
    var startY = event.clientY;
    var startPercent = activeSession.percent;
    var startHeight = activeSession.height;
    event.preventDefault();
    event.stopPropagation();
    global.document.body.classList.add('md-table-resize-dragging');

    function onMove(moveEvent) {
      var dxPercent = (moveEvent.clientX - startX) / activeSession.rootWidth * 100;
      var nextPercent = null;
      var nextHeight = null;
      if (direction.indexOf('e') >= 0) nextPercent = startPercent + dxPercent;
      else if (direction.indexOf('w') >= 0) nextPercent = startPercent - dxPercent;
      if (direction.indexOf('s') >= 0) nextHeight = startHeight + (moveEvent.clientY - startY);
      applyPreviewSize(nextPercent, nextHeight, {
        width: nextPercent != null,
        height: nextHeight != null
      });
      moveEvent.preventDefault();
    }
    function onEnd() {
      global.document.removeEventListener('pointermove', onMove);
      global.document.removeEventListener('pointerup', onEnd);
      global.document.removeEventListener('pointercancel', onEnd);
      global.document.body.classList.remove('md-table-resize-dragging');
    }
    global.document.addEventListener('pointermove', onMove, { passive: false });
    global.document.addEventListener('pointerup', onEnd, { passive: true });
    global.document.addEventListener('pointercancel', onEnd, { passive: true });
  }

  function beginPointerDrag(event, onMove) {
    event.preventDefault();
    event.stopPropagation();
    global.document.body.classList.add('md-table-resize-dragging');
    function move(moveEvent) {
      onMove(moveEvent);
      moveEvent.preventDefault();
    }
    function end() {
      global.document.removeEventListener('pointermove', move);
      global.document.removeEventListener('pointerup', end);
      global.document.removeEventListener('pointercancel', end);
      global.document.body.classList.remove('md-table-resize-dragging');
      if (activeSession) activeSession.dragLabel = '';
    }
    global.document.addEventListener('pointermove', move, { passive: false });
    global.document.addEventListener('pointerup', end, { passive: true });
    global.document.addEventListener('pointercancel', end, { passive: true });
  }

  function startColumnDrag(event) {
    if (!activeSession) return;
    var index = Number(event.currentTarget.dataset.columnIndex);
    var left = activeSession.columns[index];
    var right = activeSession.columns[index + 1];
    if (!left || !right) return;
    var startX = event.clientX;
    var leftWidth = left.getBoundingClientRect().width;
    var rightWidth = right.getBoundingClientRect().width;
    beginPointerDrag(event, function (moveEvent) {
      var delta = Math.max(24 - leftWidth, Math.min(rightWidth - 24, moveEvent.clientX - startX));
      var nextLeft = Math.round(leftWidth + delta);
      var nextRight = Math.round(rightWidth - delta);
      left.style.width = nextLeft + 'px';
      right.style.width = nextRight + 'px';
      activeSession.columnWidths[index] = nextLeft;
      activeSession.columnWidths[index + 1] = nextRight;
      activeSession.dragLabel = '열 ' + (index + 1) + ': ' + nextLeft + ' px · 열 ' + (index + 2) + ': ' + nextRight + ' px';
      sizeLabel.textContent = activeSession.dragLabel;
      updateOverlay();
    });
  }

  function startRowDrag(event) {
    if (!activeSession) return;
    var index = Number(event.currentTarget.dataset.rowIndex);
    var row = activeSession.rows[index];
    if (!row) return;
    var startY = event.clientY;
    var startHeight = row.getBoundingClientRect().height;
    beginPointerDrag(event, function (moveEvent) {
      var nextHeight = Math.max(24, Math.round(startHeight + moveEvent.clientY - startY));
      row.style.height = nextHeight + 'px';
      activeSession.rowHeights[index] = nextHeight;
      activeSession.dragLabel = '행 ' + (index + 1) + ': ' + nextHeight + ' px';
      sizeLabel.textContent = activeSession.dragLabel;
      updateOverlay();
    });
  }

  function closeOverlay() {
    if (activeSession && activeSession.table) activeSession.table.classList.remove('md-view-table-resizing');
    activeSession = null;
    if (overlay) overlay.classList.remove('is-open');
  }

  function cancelResize() {
    if (!activeSession) return;
    if (activeSession.originalStyle == null) activeSession.table.removeAttribute('style');
    else activeSession.table.setAttribute('style', activeSession.originalStyle);
    activeSession.columns.forEach(function (col, index) {
      if (activeSession.createdColgroup) return;
      var style = activeSession.originalColumnStyles[index];
      if (style == null) col.removeAttribute('style');
      else col.setAttribute('style', style);
    });
    activeSession.rows.forEach(function (row, index) {
      var style = activeSession.originalRowStyles[index];
      if (style == null) row.removeAttribute('style');
      else row.setAttribute('style', style);
    });
    if (activeSession.createdColgroup && activeSession.createdColgroup.isConnected) activeSession.createdColgroup.remove();
    closeOverlay();
  }

  function confirmResize() {
    if (!activeSession) return;
    var session = activeSession;
    var textarea = global.document.getElementById('viewer-edit-ta');
    var source = String(sourceHtml || (textarea && textarea.value != null ? textarea.value : ''));
    var allColumnWidths = session.columns.map(function (col) { return Math.round(col.getBoundingClientRect().width); });
    var result = replaceTableLayout(source, session.record, {
      percent: session.widthChanged ? session.percent : null,
      height: session.heightChanged ? session.height : null,
      columnWidths: session.columnWidths,
      rowHeights: session.rowHeights,
      allColumnWidths: session.createdColgroup && Object.keys(session.columnWidths).length ? allColumnWidths : null
    });
    if (!result.changed) {
      if (typeof global.showToast === 'function') global.showToast('표 원문이 변경되어 크기를 저장하지 못했습니다. 다시 선택해 주세요.');
      cancelResize();
      return;
    }
    closeOverlay();
    if (typeof session.onConfirm === 'function') session.onConfirm(result.html, result);
    else if (typeof global.updateContent === 'function') {
      global.updateContent(result.html);
      if (typeof global.performAutoSave === 'function') global.performAutoSave();
    }
  }

  function bindEvents() {
    if (bound || !global.document) return;
    bound = true;
    global.document.addEventListener('click', function (event) {
      var table = event.target && event.target.closest ? event.target.closest('#viewer table.md-view-resizable-table') : null;
      if (!table || !table.__mdTableResizeRecord) return;
      var viewport = global.document.getElementById('content-viewport');
      if (viewport && !viewport.classList.contains('hidden')) return;
      openForTable(table);
    }, true);
    global.addEventListener('resize', updateOverlay);
    global.addEventListener('scroll', updateOverlay, true);
    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && activeSession) cancelResize();
    });
  }

  function hydrate(root, options) {
    if (!root) return 0;
    if (activeSession) closeOverlay();
    var opts = options || {};
    sourceHtml = String(opts.sourceHtml || '');
    var records = scanHtmlTables(sourceHtml);
    var tables = Array.from(root.querySelectorAll('table'));
    tables.forEach(function (table, index) {
      if (!records[index]) return;
      table.__mdTableResizeRecord = records[index];
      table.__mdTableResizeOnConfirm = opts.onConfirm;
      table.classList.add('md-view-resizable-table');
    });
    root.__mdTableResizeOnConfirm = opts.onConfirm;
    bindEvents();
    return Math.min(records.length, tables.length);
  }

  var api = {
    scanHtmlTables: scanHtmlTables,
    replaceTableSize: replaceTableSize,
    replaceTableWidth: replaceTableWidth,
    replaceTableLayout: replaceTableLayout,
    updateTableOpenTag: updateTableOpenTag,
    hydrate: hydrate,
    cancel: cancelResize
  };
  global.ViewModeTableResize = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

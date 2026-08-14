(function (root) {
  'use strict';

  function numeric(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : (fallback || 0);
  }

  function itemMetrics(item) {
    var transform = Array.isArray(item && item.transform) ? item.transform : [];
    var fontSize = Math.max(
      Math.abs(numeric(transform[0])),
      Math.abs(numeric(transform[3])),
      Math.abs(numeric(item && item.height)),
      1
    );
    return {
      text: String(item && item.str || '').replace(/\s+/g, ' ').trim(),
      x: numeric(transform[4]),
      y: numeric(transform[5]),
      width: Math.max(0, numeric(item && item.width)),
      fontSize: fontSize
    };
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function shouldInsertSpace(previous, current) {
    if (!previous || !current) return false;
    if (/\s$/.test(previous.text) || /^\s/.test(current.text)) return false;
    if (/^[,.;:!?%)\]}\u3001\u3002]/.test(current.text)) return false;
    if (/[([{\u2018\u201c]$/.test(previous.text)) return false;
    var gap = current.x - (previous.x + previous.width);
    return gap > Math.max(previous.fontSize, current.fontSize) * 0.08;
  }

  function groupTextItems(items) {
    var metrics = (items || []).map(itemMetrics).filter(function (item) { return item.text; });
    metrics.sort(function (a, b) {
      if (Math.abs(b.y - a.y) > 0.5) return b.y - a.y;
      return a.x - b.x;
    });
    var lines = [];
    metrics.forEach(function (item) {
      var line = lines.find(function (candidate) {
        return Math.abs(candidate.y - item.y) <= Math.max(2, Math.min(candidate.fontSize, item.fontSize) * 0.38);
      });
      if (!line) {
        line = { y: item.y, fontSize: item.fontSize, items: [] };
        lines.push(line);
      }
      line.items.push(item);
      line.fontSize = Math.max(line.fontSize, item.fontSize);
    });
    lines.sort(function (a, b) { return b.y - a.y; });
    return lines.map(function (line) {
      line.items.sort(function (a, b) { return a.x - b.x; });
      var text = '';
      var previous = null;
      line.items.forEach(function (item) {
        if (text && shouldInsertSpace(previous, item)) text += ' ';
        text += item.text;
        previous = item;
      });
      return { text: text.trim(), y: line.y, fontSize: line.fontSize };
    }).filter(function (line) { return line.text; });
  }

  function escapeMarkdown(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/([`*_{}\[\]<>])/g, '\\$1');
  }

  function lineToMarkdown(line, bodySize) {
    var text = escapeMarkdown(line.text);
    var bullet = text.match(/^[\u2022\u25cf\u25e6\u25aa\u25ab\u2219]\s*(.*)$/);
    if (bullet) return '- ' + bullet[1];
    if (/^[-*+]\s+/.test(text) || /^\d+[.)]\s+/.test(text)) return text;
    if (text.length <= 120 && bodySize > 0) {
      var ratio = line.fontSize / bodySize;
      if (ratio >= 1.55) return '# ' + text;
      if (ratio >= 1.30) return '## ' + text;
      if (ratio >= 1.15) return '### ' + text;
    }
    return text;
  }

  function pageToMarkdown(items, pageNumber) {
    var lines = groupTextItems(items);
    var bodySize = median(lines.map(function (line) { return line.fontSize; }).filter(Boolean));
    return {
      markdown: lines.map(function (line) { return lineToMarkdown(line, bodySize); }).join('  \n'),
      lineCount: lines.length,
      itemCount: (items || []).filter(function (item) { return String(item && item.str || '').trim(); }).length,
      pageNumber: pageNumber
    };
  }

  async function convert(arrayBuffer, options) {
    var opts = options || {};
    var pdfjs = opts.pdfjsLib || root.pdfjsLib;
    if (!pdfjs || typeof pdfjs.getDocument !== 'function') throw new Error('PDF.js is not available.');
    var bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    var task = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      standardFontDataUrl: opts.standardFontDataUrl || undefined
    });
    var pdf = await task.promise;
    var pageCount = pdf.numPages;
    var pages = [];
    var textItemCount = 0;
    var scannedPages = [];
    try {
      for (var pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (typeof opts.onProgress === 'function') opts.onProgress(pageNumber, pageCount);
        var page = await pdf.getPage(pageNumber);
        var content = await page.getTextContent({ disableNormalization: false, includeMarkedContent: true });
        var converted = pageToMarkdown(content && content.items, pageNumber);
        textItemCount += converted.itemCount;
        if (!converted.markdown.trim()) scannedPages.push(pageNumber);
        pages.push('<!-- PDF page ' + pageNumber + ' -->\n\n' + converted.markdown);
        if (typeof page.cleanup === 'function') page.cleanup();
      }
    } finally {
      if (pdf && typeof pdf.cleanup === 'function') pdf.cleanup();
      if (pdf && typeof pdf.destroy === 'function') await pdf.destroy();
    }
    return {
      markdown: pages.join('\n\n<!-- page-break -->\n\n').trim(),
      pageCount: pageCount,
      textItemCount: textItemCount,
      scannedPages: scannedPages
    };
  }

  root.PdfOpen = {
    convert: convert,
    __test: { groupTextItems: groupTextItems, pageToMarkdown: pageToMarkdown, escapeMarkdown: escapeMarkdown }
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';

  function ensureMarked() {
    return typeof root.marked !== 'undefined' && typeof root.marked.parse === 'function';
  }

  function restoreTablePipes(markdown) {
    var lines = String(markdown || '').split(/\r?\n/);
    var inFence = false;

    function withoutEscapedPipes(line) {
      return String(line || '').replace(/\\\|/g, '|');
    }

    function isTableDivider(line) {
      var candidate = withoutEscapedPipes(line).replace(/\\\s*$/, '').trim();
      if (candidate.charAt(0) === '|') candidate = candidate.slice(1);
      if (candidate.charAt(candidate.length - 1) === '|') candidate = candidate.slice(0, -1);
      var cells = candidate.split('|');
      return cells.length >= 2 && cells.every(function (cell) {
        return /^\s*:?-{3,}:?\s*$/.test(cell);
      });
    }

    function restoreRow(line) {
      return withoutEscapedPipes(line).replace(/\\\s*$/, '').replace(/(\${1,2})([^\n]*?)\1/g, function (math) {
        return math.replace(/(^|[^\\])\|/g, '$1\\|');
      });
    }

    for (var i = 0; i < lines.length - 1; i += 1) {
      if (/^\s*(```|~~~)/.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence || !/\\\|/.test(lines[i]) || !isTableDivider(lines[i + 1])) continue;

      lines[i] = restoreRow(lines[i]);
      lines[i + 1] = restoreRow(lines[i + 1]);
      for (var row = i + 2; row < lines.length; row += 1) {
        if (!/\|/.test(withoutEscapedPipes(lines[row])) || !lines[row].trim()) break;
        lines[row] = restoreRow(lines[row]);
      }
      i += 1;
    }
    return lines.join('\n');
  }

  function toHtml(markdown) {
    var md = restoreTablePipes(markdown);
    if (!md.trim()) return '';
    if (!ensureMarked()) return md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>');
    var html = root.marked.parse(md, { breaks: true, gfm: true });
    if (!root.document || typeof root.document.createElement !== 'function') return html;
    var template = root.document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('a[href]').forEach(function (link) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    return template.innerHTML;
  }

  function toPlainText(markdown) {
    var html = toHtml(markdown);
    var box = document.createElement('div');
    box.innerHTML = html;
    return String(box.innerText || box.textContent || '').trim();
  }

  function copyPlain(text, onDone) {
    var done = typeof onDone === 'function' ? onDone : function () {};
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      try {
        var area = document.createElement('textarea');
        area.value = text || '';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
        done(true);
      } catch (_) {
        done(false);
      }
      return;
    }
    navigator.clipboard.writeText(text || '').then(function () { done(true); }).catch(function () { done(false); });
  }

  function copyRendered(markdown, onDone) {
    var done = typeof onDone === 'function' ? onDone : function () {};
    var html = toHtml(markdown);
    var plain = toPlainText(markdown);
    if (!html) return copyPlain('', done);
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      try {
        var item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        });
        navigator.clipboard.write([item]).then(function () { done(true); }).catch(function () {
          copyPlain(plain, done);
        });
        return;
      } catch (_) {}
    }
    copyPlain(plain, done);
  }

  root.AIChatMarkdown = {
    toHtml: toHtml,
    toPlainText: toPlainText,
    restoreTablePipes: restoreTablePipes,
    copyRaw: function (markdown, onDone) { copyPlain(String(markdown || ''), onDone); },
    copyRendered: copyRendered
  };
})(typeof window !== 'undefined' ? window : self);

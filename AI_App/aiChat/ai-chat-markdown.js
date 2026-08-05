(function (root) {
  'use strict';

  function ensureMarked() {
    return typeof root.marked !== 'undefined' && typeof root.marked.parse === 'function';
  }

  function toHtml(markdown) {
    var md = String(markdown || '');
    if (!md.trim()) return '';
    if (!ensureMarked()) return md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>');
    return root.marked.parse(md, { breaks: true, gfm: true });
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
    copyRaw: function (markdown, onDone) { copyPlain(String(markdown || ''), onDone); },
    copyRendered: copyRendered
  };
})(typeof window !== 'undefined' ? window : self);

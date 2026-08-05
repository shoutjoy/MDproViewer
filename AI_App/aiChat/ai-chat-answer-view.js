(function () {
  'use strict';

  var THEME_KEY = 'aiJenaAnswerViewTheme';
  var ZOOM_KEY = 'aiJenaAnswerViewZoom';
  var markdown = '';
  var payloadKey = '';
  var zoomLevel = 1;

  function setStatus(text, kind) {
    var el = document.getElementById('av-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'av-status' + (kind ? ' ' + kind : '');
  }

  function applyZoom() {
    document.documentElement.style.setProperty('--av-zoom', String(zoomLevel));
    try { localStorage.setItem(ZOOM_KEY, String(zoomLevel)); } catch (_) {}
  }

  function applyTheme(light) {
    document.body.classList.toggle('theme-light', light);
    try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (_) {}
  }

  function renderPreview() {
    var preview = document.getElementById('av-pv-render');
    if (preview && window.AIChatMarkdown) preview.innerHTML = window.AIChatMarkdown.toHtml(markdown);
  }

  function switchPane(name) {
    var showMarkdown = name === 'md';
    var mdPane = document.getElementById('av-pane-md');
    var pvPane = document.getElementById('av-pane-pv');
    var mdTab = document.getElementById('av-tab-md');
    var pvTab = document.getElementById('av-tab-pv');
    mdPane.classList.toggle('active', showMarkdown);
    mdPane.hidden = !showMarkdown;
    pvPane.classList.toggle('active', !showMarkdown);
    pvPane.hidden = showMarkdown;
    mdTab.classList.toggle('active', showMarkdown);
    mdTab.setAttribute('aria-selected', showMarkdown ? 'true' : 'false');
    pvTab.classList.toggle('active', !showMarkdown);
    pvTab.setAttribute('aria-selected', showMarkdown ? 'false' : 'true');
    if (!showMarkdown) renderPreview();
  }

  function insertModeLabel(mode) {
    if (mode === 'replace') return '선택 영역에 대체 삽입';
    if (mode === 'line-below') return '한 줄 아래 삽입';
    if (mode === 'document-end') return '문서 맨 아래 삽입';
    return '커서 위치에 삽입';
  }

  function appWindow() {
    try {
      if (window.opener && !window.opener.closed) return window.opener;
    } catch (_) {}
    return null;
  }

  async function insertRendered(mode) {
    if (!window.AIChatMarkdown) return setStatus('Markdown 모듈을 불러오지 못했습니다.', 'error');
    if (!markdown.trim()) return setStatus('삽입할 답변이 없습니다.', 'error');
    var target = appWindow();
    var bridge = target && target.AIChatBridge;
    if (!bridge || typeof bridge.insertIntoDocument !== 'function') {
      return setStatus('원래 MDproViewer 창을 찾지 못했습니다. AI Jena에서 답변 창을 다시 열어 주세요.', 'error');
    }
    var html = window.AIChatMarkdown.toHtml(markdown);
    var plain = window.AIChatMarkdown.toPlainText(markdown);
    setStatus(insertModeLabel(mode) + ' 중…');
    try {
      await Promise.resolve(bridge.insertIntoDocument(plain, mode || 'cursor', {
        format: 'html',
        html: html,
        plainText: plain
      }));
      setStatus('렌더된 답변을 ' + insertModeLabel(mode) + '했습니다.', 'ok');
      try { target.focus(); } catch (_) {}
    } catch (error) {
      setStatus(error && error.message ? error.message : '문서에 삽입하지 못했습니다.', 'error');
    }
  }

  function resizeWindow(expanded) {
    try {
      if (expanded) {
        window.moveTo(screen.availLeft || 0, screen.availTop || 0);
        window.resizeTo(screen.availWidth || 1200, screen.availHeight || 800);
        document.body.classList.add('av-fullscreen');
      } else {
        window.resizeTo(940, 820);
        document.body.classList.remove('av-fullscreen');
      }
    } catch (_) {}
  }

  function bindUi() {
    document.getElementById('av-tab-md').addEventListener('click', function () { switchPane('md'); });
    document.getElementById('av-tab-pv').addEventListener('click', function () { switchPane('pv'); });
    document.getElementById('av-copy-raw').addEventListener('click', function () {
      window.AIChatMarkdown.copyRaw(markdown, function (ok) {
        setStatus(ok ? 'MD raw를 복사했습니다.' : '복사하지 못했습니다.', ok ? 'ok' : 'error');
      });
    });
    document.getElementById('av-copy-render').addEventListener('click', function () {
      window.AIChatMarkdown.copyRendered(markdown, function (ok) {
        setStatus(ok ? 'MD render를 복사했습니다.' : '복사하지 못했습니다.', ok ? 'ok' : 'error');
      });
    });
    document.querySelectorAll('[data-insert-mode]').forEach(function (button) {
      button.addEventListener('click', function () { insertRendered(button.getAttribute('data-insert-mode')); });
    });
    document.getElementById('av-theme').addEventListener('click', function () {
      applyTheme(!document.body.classList.contains('theme-light'));
    });
    document.getElementById('av-zoom-out').addEventListener('click', function () {
      zoomLevel = Math.max(0.5, Math.round((zoomLevel - 0.1) * 100) / 100);
      applyZoom();
    });
    document.getElementById('av-zoom-in').addEventListener('click', function () {
      zoomLevel = Math.min(2, Math.round((zoomLevel + 0.1) * 100) / 100);
      applyZoom();
    });
    document.getElementById('av-win-shrink').addEventListener('click', function () { resizeWindow(false); });
    document.getElementById('av-win-expand').addEventListener('click', function () { resizeWindow(true); });
    document.addEventListener('wheel', function (event) {
      if (!event.altKey) return;
      event.preventDefault();
      zoomLevel = Math.min(2, Math.max(0.5, Math.round((zoomLevel + (event.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
      applyZoom();
    }, { passive: false });
  }

  function loadPayload() {
    try {
      zoomLevel = Math.min(2, Math.max(0.5, parseFloat(localStorage.getItem(ZOOM_KEY) || '1') || 1));
      applyTheme(localStorage.getItem(THEME_KEY) === 'light');
      payloadKey = new URLSearchParams(location.search).get('payload') || '';
      var payload = payloadKey ? JSON.parse(localStorage.getItem(payloadKey) || 'null') : null;
      markdown = String(payload && payload.markdown || '');
      document.getElementById('av-md-source').value = markdown;
      if (payload && payload.question) {
        var question = String(payload.question).replace(/\s+/g, ' ').trim();
        if (question.length > 80) question = question.slice(0, 80) + '…';
        document.getElementById('av-subtitle').textContent = '질문: ' + question;
      }
    } catch (_) {
      markdown = '';
    }
    applyZoom();
    renderPreview();
    setStatus(markdown.trim()
      ? '삽입 버튼은 원래 MDproViewer 문서에 렌더된 HTML을 넣습니다.'
      : '표시할 답변이 없습니다. AI Jena에서 다시 열어 주세요.', markdown.trim() ? '' : 'error');
  }

  window.addEventListener('beforeunload', function () {
    if (!payloadKey) return;
    try { localStorage.removeItem(payloadKey); } catch (_) {}
  });

  bindUi();
  loadPayload();
})();

(function () {
  'use strict';

  var STYLE_ID = 'ai-panel-avoid-style';
  var BODY_CLASS = 'ai-panels-avoid-open';
  var scheduled = false;
  var suppressUntil = 0;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'body.' + BODY_CLASS + ' #sites-panel,',
      'body.' + BODY_CLASS + ' #template-panel {',
      '  right: var(--ai-avoid-right, 12px) !important;',
      '  max-width: calc(100vw - var(--ai-avoid-right, 12px) - 16px) !important;',
      '}',
      'body.' + BODY_CLASS + ' #scholar-search-panel {',
      '  margin-right: var(--ai-avoid-right, 12px) !important;',
      '  max-width: min(36rem, calc(100vw - var(--ai-avoid-right, 12px) - 16px)) !important;',
      '}',
      'body.' + BODY_CLASS + ' #share-links-modal-panel {',
      '  transform: none !important;',
      '  width: min(280px, calc(100vw - var(--ai-avoid-right, 12px) - 32px)) !important;',
      '  max-width: min(280px, calc(100vw - var(--ai-avoid-right, 12px) - 32px)) !important;',
      '}',
      'body.' + BODY_CLASS + ' #mini-preview-panel {',
      '  right: var(--ai-avoid-right, 12px) !important;',
      '  max-width: min(42vw, calc(100vw - var(--ai-avoid-right, 12px) - 16px)) !important;',
      '}',
      'body.' + BODY_CLASS + ' #scholar-search-modal {',
      '  justify-content: flex-end !important;',
      '}',
      '.ai-avoid-managed-panel {',
      '  position: fixed !important;',
      '  margin: 0 !important;',
      '  transform: none !important;',
      '  box-sizing: border-box !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains('hidden')) return false;
    var style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20;
  }

  function getOpenAiLeft() {
    var panels = [
      document.getElementById('scholar-ai-sidebar'),
      document.getElementById('ssp-ai-sidebar')
    ];
    var left = null;
    panels.forEach(function (panel) {
      if (!panel || !panel.classList || !panel.classList.contains('open')) return;
      if (panel.classList.contains('fullscreen')) return;
      var rect = panel.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) return;
      if (rect.left < 0 || rect.left >= window.innerWidth - 40) return;
      left = left === null ? rect.left : Math.min(left, rect.left);
    });
    return left;
  }

  function clampOpenPanels(aiLeft) {
    var safeRight = Math.max(12, Math.ceil(window.innerWidth - aiLeft + 12));
    document.body.style.setProperty('--ai-avoid-right', safeRight + 'px');
    document.body.classList.add(BODY_CLASS);

    [
      document.getElementById('sites-panel'),
      document.getElementById('template-panel'),
      document.getElementById('mini-preview-panel')
    ].forEach(function (panel) {
      if (!isVisible(panel)) return;
      var rect = panel.getBoundingClientRect();
      if (rect.right > aiLeft - 8) {
        panel.style.right = safeRight + 'px';
        panel.style.left = 'auto';
      }
    });

    var scholarPanel = document.getElementById('scholar-search-panel');
    if (isVisible(scholarPanel)) {
      var scholarRect = scholarPanel.getBoundingClientRect();
      if (scholarRect.right > aiLeft - 8) {
        scholarPanel.style.marginRight = safeRight + 'px';
      }
    }

    var sharePanel = document.getElementById('share-links-modal-panel');
    if (isVisible(sharePanel)) {
      var shareRect = sharePanel.getBoundingClientRect();
      if (shareRect.right > aiLeft - 8) {
        sharePanel.style.left = '16px';
        sharePanel.style.right = 'auto';
        sharePanel.style.transform = 'none';
      }
    }
  }

  function getManagedPanels() {
    return [
      document.getElementById('template-panel'),
      document.getElementById('sites-panel'),
      document.getElementById('scholar-search-panel'),
      document.getElementById('share-links-modal-panel'),
      document.getElementById('mini-preview-panel')
    ].filter(isVisible).filter(function (panel) {
      if (panel.id === 'mini-preview-panel' && panel.classList.contains('fullscreen')) return false;
      return true;
    });
  }

  function rectsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function anyPanelOverlap(panels) {
    for (var i = 0; i < panels.length; i++) {
      for (var j = i + 1; j < panels.length; j++) {
        if (rectsOverlap(panels[i].getBoundingClientRect(), panels[j].getBoundingClientRect())) return true;
      }
    }
    return false;
  }

  function getPanelPreferredSize(panel, maxWidth, maxHeight) {
    var rect = panel.getBoundingClientRect();
    var width = Math.min(Math.max(rect.width || panel.offsetWidth || 320, 280), maxWidth);
    var height = Math.min(Math.max(rect.height || panel.offsetHeight || 220, 160), maxHeight);
    if (panel.id === 'sites-panel') {
      width = Math.min(Math.max(width, 360), maxWidth);
      height = Math.min(Math.max(height, 260), maxHeight);
    } else if (panel.id === 'template-panel') {
      width = Math.min(Math.max(width, 420), maxWidth);
      height = Math.min(Math.max(height, 320), maxHeight);
    } else if (panel.id === 'scholar-search-panel') {
      width = Math.min(Math.max(width, 360), maxWidth);
      height = Math.min(Math.max(height, 230), maxHeight);
    } else if (panel.id === 'mini-preview-panel') {
      width = Math.min(Math.max(width, 320), maxWidth);
      height = Math.min(Math.max(height, 260), maxHeight);
    } else if (panel.id === 'share-links-modal-panel') {
      width = Math.min(280, maxWidth);
      height = Math.min(Math.max(height, 180), maxHeight);
    }
    return { width: Math.round(width), height: Math.round(height) };
  }

  function arrangeManagedPanels(aiLeft) {
    var panels = getManagedPanels();
    if (panels.length < 2 && aiLeft === null) return;
    if (panels.length < 2 && aiLeft !== null) {
      if (!panels.length) return;
    } else if (!anyPanelOverlap(panels) && aiLeft === null) {
      return;
    }

    var gap = 12;
    var leftEdge = 14;
    var topEdge = 78;
    var rightEdge = Math.max(320, (aiLeft === null ? window.innerWidth : aiLeft) - 14);
    var bottomEdge = window.innerHeight - 16;
    var usableWidth = Math.max(280, rightEdge - leftEdge);
    var usableHeight = Math.max(180, bottomEdge - topEdge);
    var x = leftEdge;
    var y = topEdge;
    var rowHeight = 0;

    panels.forEach(function (panel) {
      var maxWidth = Math.max(280, Math.min(usableWidth, 640));
      var maxHeight = Math.max(160, Math.min(usableHeight, Math.floor(window.innerHeight * 0.78)));
      var size = getPanelPreferredSize(panel, maxWidth, maxHeight);
      if (x !== leftEdge && x + size.width > rightEdge) {
        x = leftEdge;
        y += rowHeight + gap;
        rowHeight = 0;
      }
      if (y + size.height > bottomEdge) {
        size.height = Math.max(160, bottomEdge - y);
      }
      panel.classList.add('ai-avoid-managed-panel');
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = size.width + 'px';
      panel.style.maxWidth = size.width + 'px';
      panel.style.maxHeight = size.height + 'px';
      if (panel.id === 'sites-panel' || panel.id === 'template-panel' || panel.id === 'mini-preview-panel') {
        panel.style.height = size.height + 'px';
      }
      x += size.width + gap;
      rowHeight = Math.max(rowHeight, size.height);
    });
  }

  function applyAiPanelAvoidance() {
    scheduled = false;
    if (Date.now() < suppressUntil) return;
    injectStyle();
    var aiLeft = getOpenAiLeft();
    if (aiLeft === null) {
      document.body.classList.remove(BODY_CLASS);
      document.body.style.removeProperty('--ai-avoid-right');
      arrangeManagedPanels(null);
      return;
    }
    clampOpenPanels(aiLeft);
    arrangeManagedPanels(aiLeft);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyAiPanelAvoidance);
  }

  function isManagedPanelHandle(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('#share-links-modal-header, #sites-panel-header, #template-panel-header, #scholar-search-header, #mini-preview-header');
  }

  function bind() {
    injectStyle();
    scheduleApply();
    window.addEventListener('resize', scheduleApply);
    document.addEventListener('mousedown', function (event) {
      if (!isManagedPanelHandle(event.target)) return;
      suppressUntil = Date.now() + 1200;
    }, true);
    document.addEventListener('mousemove', function () {
      if (suppressUntil > Date.now()) suppressUntil = Date.now() + 500;
    }, true);
    document.addEventListener('mouseup', function () {
      if (suppressUntil > Date.now()) {
        suppressUntil = Date.now() + 250;
        setTimeout(scheduleApply, 280);
      }
    }, true);
    window.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (target.closest('#btn-scholar-search, #btn-sites-panel, #btn-template-panel, #btn-mini-pv, #google-share-toolbar-slot, #btn-scholar-ai, #btn-ssp-ai')) {
        setTimeout(scheduleApply, 0);
        setTimeout(scheduleApply, 120);
      }
    }, true);
    var observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.applyAiPanelAvoidance = scheduleApply;
})();

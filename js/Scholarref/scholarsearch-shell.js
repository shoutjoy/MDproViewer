(function (global) {
  'use strict';

  var SHELL_VERSION = '20260424-1';
  var SHELL_TEMPLATE_VERSION = '20260424-1';
  var SCHOLAR_REF_VERSION = '20260402-1';

  var deps = {
    dbGetter: null,
    getEditor: null,
    showToast: null,
    getEditorSelectedText: null,
    getDocumentBaseUrl: null
  };

  var state = {
    initialized: false,
    dockRight: true,
    shrink: false,
    dragBound: false,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    scholarRefBootPromise: null,
    scholarRefInitDone: false,
    templateHtml: '',
    templateLoadPromise: null
  };

  function q(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    if (typeof deps.showToast === 'function') deps.showToast(msg);
  }

  function getEditor() {
    return typeof deps.getEditor === 'function' ? deps.getEditor() : null;
  }

  function getDocumentBase() {
    if (typeof deps.getDocumentBaseUrl === 'function') {
      try {
        var base = deps.getDocumentBaseUrl();
        if (base) return base;
      } catch (_) {}
    }
    return document.baseURI || location.href;
  }

  function getEditorSelectedTextFallback() {
    var editor = getEditor();
    if (!editor) return '';
    try {
      var s = typeof editor.selectionStart === 'number' ? editor.selectionStart : 0;
      var e = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : 0;
      return String(editor.value || '').slice(Math.min(s, e), Math.max(s, e));
    } catch (_) {
      return '';
    }
  }

  function getTemplateCandidates() {
    var base = getDocumentBase();
    var candidates = [];
    try {
      var u1 = new URL('./js/Scholarref/scholarsearch-shell.html', base);
      u1.searchParams.set('v', SHELL_TEMPLATE_VERSION);
      candidates.push(u1.href);
    } catch (_) {}
    candidates.push('./js/Scholarref/scholarsearch-shell.html?v=' + SHELL_TEMPLATE_VERSION);
    try {
      var u2 = new URL('./Scholarref/scholarsearch-shell.html', base);
      u2.searchParams.set('v', SHELL_TEMPLATE_VERSION);
      candidates.push(u2.href);
    } catch (_) {}
    candidates.push('./Scholarref/scholarsearch-shell.html?v=' + SHELL_TEMPLATE_VERSION);
    return candidates;
  }

  function loadTemplateFromUrl(url) {
    if (typeof fetch !== 'function') return Promise.resolve('');
    return fetch(url, { cache: 'no-store' }).then(function (resp) {
      if (!resp || !resp.ok) return '';
      return resp.text();
    }).then(function (html) {
      var src = String(html || '').trim();
      if (!src) return '';
      if (src.indexOf('id="scholar-search-modal"') < 0) return '';
      return src;
    }).catch(function () {
      return '';
    });
  }

  function primeTemplateHtml() {
    if (state.templateHtml) return Promise.resolve(state.templateHtml);
    if (state.templateLoadPromise) return state.templateLoadPromise;

    var candidates = getTemplateCandidates();
    state.templateLoadPromise = new Promise(function (resolve) {
      var idx = 0;
      function tryNext() {
        if (idx >= candidates.length) {
          resolve('');
          return;
        }
        var src = candidates[idx++];
        loadTemplateFromUrl(src).then(function (html) {
          if (html) {
            state.templateHtml = html;
            resolve(html);
            return;
          }
          tryNext();
        });
      }
      tryNext();
    }).finally(function () {
      state.templateLoadPromise = null;
    });

    return state.templateLoadPromise;
  }

  function getScholarSearchSeedText() {
    var editor = getEditor();
    var active = document.activeElement;
    if (editor && active === editor) {
      var selected = '';
      if (typeof deps.getEditorSelectedText === 'function') selected = deps.getEditorSelectedText();
      else selected = getEditorSelectedTextFallback();
      if (selected && String(selected).trim()) return String(selected).trim();
    }
    var sel = window.getSelection ? window.getSelection() : null;
    var text = sel && sel.toString ? String(sel.toString()) : '';
    return text.trim();
  }

  // AUTO-GENERATED FALLBACK TEMPLATE START
  var FALLBACK_TEMPLATE_HTML = "<div id=\"scholar-search-modal\" class=\"fixed inset-0 bg-transparent hidden items-start justify-end z-50 no-print pointer-events-none\">\n  <div id=\"scholar-search-panel\" class=\"pointer-events-auto mt-20 mr-5 bg-white/95 dark:bg-slate-800/95 rounded-xl shadow-2xl p-4 w-full max-w-xl border border-slate-200 dark:border-slate-700 backdrop-blur-[1px]\">\n    <div id=\"scholar-search-header\" class=\"flex items-center justify-between mb-3 gap-2 cursor-move select-none\">\n      <h3 id=\"scholar-search-title\" class=\"text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap\">Scholar Search</h3>\n      <div class=\"flex items-center gap-2 shrink-0\">\n        <button type=\"button\" id=\"scholar-search-shrink-btn\" onclick=\"toggleScholarSearchShrink()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">[>>]</button>\n        <button type=\"button\" id=\"scholar-search-dock-btn\" onclick=\"toggleScholarSearchDockRight()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">Undock</button>\n        <button type=\"button\" onclick=\"closeScholarSearchModal()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">Close</button>\n      </div>\n    </div>\n    <div id=\"scholar-search-body\" class=\"space-y-3\">\n      <label id=\"scholar-search-query-label\" for=\"scholar-search-query\" class=\"block text-xs font-semibold text-slate-500 dark:text-slate-400\">Search query (paper title, author, keyword)</label>\n      <div id=\"scholar-search-input-row\" class=\"flex items-center gap-2\">\n        <input type=\"text\" id=\"scholar-search-query\" placeholder=\"e.g.) structural equation modeling education Korea\" onkeydown=\"if(event.key==='Enter'){event.preventDefault();runScholarSearchFromModal();}\" class=\"flex-1 px-3 py-2 border border-indigo-400 dark:border-indigo-500 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500\">\n        <button type=\"button\" id=\"scholar-search-run-btn\" onclick=\"runScholarSearchFromModal()\" class=\"px-4 py-2 bg-indigo-600 rounded-md text-sm font-semibold text-white hover:bg-indigo-700\">Search</button>\n      </div>\n      <div id=\"scholar-search-options\" class=\"pt-1\">\n        <div class=\"text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1\">Options</div>\n        <div class=\"flex flex-wrap items-center gap-2\">\n          <label class=\"text-xs text-slate-700 dark:text-slate-300\">Language:</label>\n          <select id=\"scholar-search-lang\" class=\"px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n            <option value=\"ko\">Korean first</option>\n            <option value=\"en\">English first</option>\n            <option value=\"all\">All languages</option>\n          </select>\n          <label class=\"text-xs text-slate-700 dark:text-slate-300 ml-1\">Period:</label>\n          <select id=\"scholar-search-period\" class=\"px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n            <option value=\"\">Any time</option>\n            <option value=\"1\">Last 1 year</option>\n            <option value=\"5\">Last 5 years</option>\n            <option value=\"10\">Last 10 years</option>\n          </select>\n          <label class=\"inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 ml-1\">\n            <input type=\"checkbox\" id=\"scholar-search-review\" class=\"rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500\">\n            Review/Survey only\n          </label>\n        </div>\n      </div>\n      <p id=\"scholar-search-help\" class=\"text-[11px] text-amber-600 dark:text-amber-400\">Results open in a new browser tab.</p>\n      <div class=\"pt-1 flex justify-end\">\n        <button type=\"button\" id=\"scholarref-toggle-btn\" class=\"scholarref-toggle-btn\" onclick=\"toggleScholarRefPanel()\">Reference management</button>\n      </div>\n      <div id=\"scholarref-panel\" class=\"scholarref-panel hidden\">\n        <div class=\"scholarref-tab-menu\">\n          <button type=\"button\" class=\"scholarref-tab active\" data-tab=\"0\" onclick=\"switchScholarRefTab(0)\">① 참고문헌 추가</button>\n          <button type=\"button\" class=\"scholarref-tab\" data-tab=\"1\" onclick=\"switchScholarRefTab(1)\">② 인용 삽입</button>\n          <button type=\"button\" class=\"scholarref-tab\" data-tab=\"2\" onclick=\"switchScholarRefTab(2)\">④ 저장된 목록</button>\n        </div>\n        <div id=\"scholarref-tab-0\" class=\"scholarref-tab-content active\">\n          <div class=\"scholarref-row\">\n            <button type=\"button\" id=\"scholarref-method-blank\" class=\"scholarref-method-btn active\" onclick=\"setScholarRefInputMode('blank')\">빈 줄 구분</button>\n            <button type=\"button\" id=\"scholarref-method-line\" class=\"scholarref-method-btn\" onclick=\"setScholarRefInputMode('line')\">엔터 구분</button>\n          </div>\n          <label class=\"scholarref-label\" for=\"scholarref-input\">APA 형식 참고문헌 붙여넣기</label>\n          <textarea id=\"scholarref-input\" class=\"scholarref-textarea\" placeholder=\"여기에 참고문헌을 붙여넣으세요...\"></textarea>\n          <div class=\"scholarref-row\">\n            <button type=\"button\" class=\"scholarref-primary\" onclick=\"scholarRefApplyInput()\">앱에서 사용하기</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"scholarRefClearInput()\">지우기</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefTxtImport()\">TXT 불러오기</button>\n            <input type=\"file\" id=\"scholarref-txt-file\" accept=\".txt,.md\" class=\"hidden\" onchange=\"importScholarRefTxt(event)\">\n          </div>\n          <p id=\"scholarref-status\" class=\"scholarref-help\">현재: 빈 줄 구분</p>\n        </div>\n        <div id=\"scholarref-tab-1\" class=\"scholarref-tab-content\">\n          <div class=\"scholarref-row\">\n            <input type=\"text\" id=\"scholarref-search\" class=\"scholarref-search\" placeholder=\"저자, 연도, 키워드로 검색...\" oninput=\"renderScholarRefSelectionList()\">\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"selectAllScholarRefs()\">전체 선택</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"clearScholarRefSelection()\">선택 해제</button>\n          </div>\n          <div id=\"scholarref-select-list\" class=\"scholarref-list\"></div>\n          <div class=\"scholarref-row scholarref-wrap\">\n            <label class=\"scholarref-inline\">삽입 형식\n              <select id=\"scholarref-insert-format\" class=\"scholarref-select\">\n                <option value=\"inline\">인라인: (저자, 연도)</option>\n                <option value=\"narrative\">서술형: 저자(연도)</option>\n              </select>\n            </label>\n            <label class=\"scholarref-inline\"><input type=\"checkbox\" id=\"scholarref-append-section\"> 문서 끝 References(APA) 추가</label>\n            <label class=\"scholarref-inline\"><input type=\"checkbox\" id=\"scholarref-number-link\"> 번호(링크)로 삽입</label>\n            <span id=\"scholarref-selected-count\" class=\"scholarref-count\">0개 선택됨</span>\n          </div>\n          <div class=\"scholarref-row scholarref-center\">\n            <button type=\"button\" class=\"scholarref-primary\" onclick=\"insertSelectedScholarRefs()\">선택한 인용 삽입</button>\n          </div>\n        </div>\n        <div id=\"scholarref-tab-2\" class=\"scholarref-tab-content\">\n          <div class=\"scholarref-row scholarref-between\">\n            <div class=\"scholarref-count\">저장 <span id=\"scholarref-total-count\">0건</span></div>\n            <div class=\"scholarref-row\">\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"insertAllScholarRefSection()\">참고문헌 섹션 삽입</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"downloadScholarRefTxt()\">TXT 다운로드</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"downloadScholarRefMd()\">MD 다운로드</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefMdImport()\">MD 불러오기</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefListWindow()\">새창목록</button>\n              <button type=\"button\" class=\"scholarref-danger\" onclick=\"clearAllScholarRefs()\">전체 삭제</button>\n              <input type=\"file\" id=\"scholarref-md-file\" accept=\".md,.txt\" class=\"hidden\" onchange=\"importScholarRefMd(event)\">\n            </div>\n          </div>\n          <div id=\"scholarref-saved-list\" class=\"scholarref-list\"></div>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>";
  // AUTO-GENERATED FALLBACK TEMPLATE END

  function getTemplateHtml() {
    return FALLBACK_TEMPLATE_HTML;
  }

  function mountTemplateHtml(html) {
    if (q('scholar-search-modal')) return true;
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || getTemplateHtml()).trim();
    var modal = wrap.firstElementChild;
    if (!modal) return false;

    var slot = q('scholar-search-slot');
    if (slot && slot.parentNode) slot.parentNode.replaceChild(modal, slot);
    else document.body.appendChild(modal);
    return !!q('scholar-search-modal');
  }

  function ensureModalMarkup() {
    if (q('scholar-search-modal')) return;

    if (!state.templateHtml) {
      primeTemplateHtml().then(function (html) {
        if (!html || q('scholar-search-modal')) return;
        mountTemplateHtml(html);
      });
    }

    mountTemplateHtml(state.templateHtml || getTemplateHtml());
  }

  function openScholarSearchWindow(query, options) {
    var qv = String(query || '').trim();
    if (!qv) {
      toast('Enter a search query first.');
      return;
    }
    var opts = options || {};
    var lang = String(opts.lang || 'ko');
    var period = String(opts.period || '');
    var reviewOnly = opts.reviewOnly === true;
    var finalQuery = reviewOnly ? (qv + ' (review OR survey)') : qv;

    var params = new URLSearchParams();
    params.set('q', finalQuery);
    params.set('hl', lang === 'en' ? 'en' : 'ko');
    if (lang === 'ko') params.set('lr', 'lang_ko');
    if (lang === 'en') params.set('lr', 'lang_en');
    if (period) {
      var years = parseInt(period, 10);
      if (Number.isFinite(years) && years > 0) {
        var now = new Date().getFullYear();
        params.set('as_ylo', String(now - years + 1));
      }
    }
    params.set('as_vis', '1');

    var url = 'https://scholar.google.com/scholar?' + params.toString();
    if (window.web2electron && typeof window.web2electron.openExternal === 'function') {
      window.web2electron.openExternal(url).then(function (res) {
        if (!res || res.ok === false) toast((res && res.error) || 'Failed to open Scholar search.');
      }).catch(function (err) {
        toast((err && err.message) || 'Failed to open Scholar search.');
      });
      return;
    }
    var win = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) toast('Popup blocked. Please allow popups for this site.');
  }

  function applyScholarSearchPanelLayout() {
    var modal = q('scholar-search-modal');
    var panel = q('scholar-search-panel');
    var body = q('scholar-search-body');
    var title = q('scholar-search-title');
    var queryLabel = q('scholar-search-query-label');
    var inputRow = q('scholar-search-input-row');
    var options = q('scholar-search-options');
    var help = q('scholar-search-help');
    var runBtn = q('scholar-search-run-btn');
    var queryInput = q('scholar-search-query');
    var dockBtn = q('scholar-search-dock-btn');
    var shrinkBtn = q('scholar-search-shrink-btn');
    if (!modal || !panel) return;

    if (state.dockRight) {
      modal.classList.remove('items-center', 'justify-center');
      modal.classList.add('items-start', 'justify-end');
      panel.style.position = 'fixed';
      panel.style.top = '80px';
      panel.style.right = '12px';
      panel.style.left = 'auto';
      panel.style.margin = '0';
      panel.style.marginTop = '0';
      panel.style.marginRight = '0';
      panel.style.maxWidth = state.shrink ? '320px' : '760px';
    } else {
      modal.classList.remove('items-start', 'justify-end');
      modal.classList.add('items-center', 'justify-center');
      panel.style.position = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.left = '';
      panel.style.margin = '';
      panel.style.marginTop = '0';
      panel.style.marginRight = '0';
      panel.style.maxWidth = '760px';
    }

    if (title) title.classList.toggle('text-sm', state.shrink);
    if (title) title.classList.toggle('text-base', !state.shrink);
    if (title) title.style.whiteSpace = 'nowrap';
    if (title) title.style.wordBreak = 'keep-all';

    if (body) body.classList.remove('hidden');
    var canShrink = state.dockRight;
    var isShrinked = canShrink && state.shrink;
    if (queryLabel) queryLabel.classList.toggle('hidden', isShrinked);
    if (options) options.classList.toggle('hidden', isShrinked);
    if (help) help.classList.toggle('hidden', isShrinked);

    if (inputRow) {
      inputRow.style.display = 'flex';
      inputRow.style.gap = '8px';
      inputRow.style.flexDirection = isShrinked ? 'column' : 'row';
      inputRow.style.alignItems = isShrinked ? 'stretch' : 'center';
    }
    if (queryInput) queryInput.style.width = '100%';
    if (runBtn) {
      runBtn.style.width = isShrinked ? '100%' : '';
      runBtn.textContent = 'Search';
    }

    if (shrinkBtn) {
      shrinkBtn.textContent = isShrinked ? '[<<]' : '[>>]';
      shrinkBtn.disabled = !canShrink;
      shrinkBtn.classList.toggle('opacity-40', !canShrink);
      shrinkBtn.classList.toggle('cursor-not-allowed', !canShrink);
    }
    if (dockBtn) dockBtn.textContent = state.dockRight ? 'Undock' : 'Dock Right';
  }

  function bindScholarSearchModalDrag() {
    if (state.dragBound) return;
    state.dragBound = true;

    var header = q('scholar-search-header');
    var panel = q('scholar-search-panel');
    if (!header || !panel) return;
    if (window.enableTouchModalDrag) {
      window.enableTouchModalDrag(panel, header);
    }

    header.addEventListener('mousedown', function (e) {
      var target = e.target;
      if (!target) return;
      if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;

      state.dragging = true;
      var rect = panel.getBoundingClientRect();
      state.dragOffsetX = e.clientX - rect.left;
      state.dragOffsetY = e.clientY - rect.top;
      panel.style.position = 'fixed';
      panel.style.margin = '0';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!state.dragging) return;
      var panelEl = q('scholar-search-panel');
      if (!panelEl) return;

      var nextLeft = Math.max(8, Math.min(window.innerWidth - panelEl.offsetWidth - 8, e.clientX - state.dragOffsetX));
      var nextTop = Math.max(8, Math.min(window.innerHeight - panelEl.offsetHeight - 8, e.clientY - state.dragOffsetY));
      panelEl.style.left = nextLeft + 'px';
      panelEl.style.top = nextTop + 'px';
    });

    document.addEventListener('mouseup', function () {
      state.dragging = false;
    });
  }

  function openScholarSearchModal() {
    ensureModalMarkup();
    var modal = q('scholar-search-modal');
    var input = q('scholar-search-query');
    if (!modal || !input) {
      mountTemplateHtml(getTemplateHtml());
      modal = q('scholar-search-modal');
      input = q('scholar-search-query');
    }
    if (!modal || !input) {
      toast('Scholar Search UI could not be opened.');
      return;
    }

    bindScholarSearchModalDrag();
    applyScholarSearchPanelLayout();

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    var seed = getScholarSearchSeedText();
    if (seed) input.value = seed;

    requestAnimationFrame(function () {
      input.focus();
      input.select();
    });
  }

  function closeScholarSearchModal() {
    var modal = q('scholar-search-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function runScholarSearchFromModal() {
    var input = q('scholar-search-query');
    var langEl = q('scholar-search-lang');
    var periodEl = q('scholar-search-period');
    var reviewEl = q('scholar-search-review');
    var query = input ? input.value : '';
    var lang = langEl ? langEl.value : 'ko';
    var period = periodEl ? periodEl.value : '';
    var reviewOnly = !!(reviewEl && reviewEl.checked);
    openScholarSearchWindow(query, { lang: lang, period: period, reviewOnly: reviewOnly });
  }

  function quickScholarSearchFromSelection() {
    var seed = getScholarSearchSeedText();
    if (!seed) {
      openScholarSearchModal();
      return;
    }
    openScholarSearchWindow(seed);
  }

  function toggleScholarSearchDockRight() {
    state.dockRight = !state.dockRight;
    if (!state.dockRight) state.shrink = false;
    applyScholarSearchPanelLayout();
  }

  function toggleScholarSearchShrink() {
    if (!state.dockRight) return;
    state.shrink = !state.shrink;
    applyScholarSearchPanelLayout();
  }

  function initScholarRefIfAvailable() {
    if (!window.ScholarRef || typeof window.ScholarRef.init !== 'function') return Promise.resolve(false);
    if (state.scholarRefInitDone) return Promise.resolve(true);

    return Promise.resolve(window.ScholarRef.init({
      dbGetter: function () { return typeof deps.dbGetter === 'function' ? deps.dbGetter() : null; },
      getEditor: function () { return getEditor(); },
      showToast: function (msg) { toast(msg); }
    })).then(function () {
      state.scholarRefInitDone = true;
      return true;
    }).catch(function () {
      return false;
    });
  }

  function ensureScholarRefReady() {
    if (window.ScholarRef && typeof window.ScholarRef.init === 'function') {
      return initScholarRefIfAvailable();
    }
    if (state.scholarRefBootPromise) return state.scholarRefBootPromise;

    var base = getDocumentBase();
    var candidates = [];
    try {
      var u1 = new URL('./js/Scholarref/scholarref.js', base);
      u1.searchParams.set('v', SCHOLAR_REF_VERSION);
      candidates.push(u1.href);
    } catch (_) {}
    candidates.push('./js/Scholarref/scholarref.js?v=' + SCHOLAR_REF_VERSION);
    try {
      var u2 = new URL('./Scholarref/scholarref.js', base);
      u2.searchParams.set('v', SCHOLAR_REF_VERSION);
      candidates.push(u2.href);
    } catch (_) {}
    candidates.push('./Scholarref/scholarref.js?v=' + SCHOLAR_REF_VERSION);

    state.scholarRefBootPromise = new Promise(function (resolve) {
      var idx = 0;
      function tryNext() {
        if (window.ScholarRef && typeof window.ScholarRef.init === 'function') {
          initScholarRefIfAvailable().then(function () { resolve(true); });
          return;
        }
        if (idx >= candidates.length) {
          resolve(false);
          return;
        }

        var src = candidates[idx++];
        var script = document.createElement('script');
        script.charset = 'utf-8';
        script.async = false;
        script.src = src;
        script.onload = function () {
          initScholarRefIfAvailable().then(function (ok) {
            if (ok) resolve(true);
            else tryNext();
          });
        };
        script.onerror = function () {
          tryNext();
        };
        document.body.appendChild(script);
      }
      tryNext();
    }).finally(function () {
      state.scholarRefBootPromise = null;
    });

    return state.scholarRefBootPromise;
  }

  function invokeScholarRef(methodName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var run = function () {
      var mod = window.ScholarRef;
      if (!mod || typeof mod[methodName] !== 'function') return false;
      mod[methodName].apply(mod, args);
      return true;
    };

    if (run()) return;
    ensureScholarRefReady().then(function (ok) {
      if (!ok || !run()) toast('Reference management module failed to load.');
    });
  }

  function toggleScholarRefPanel() {
    if (window.ScholarRef && typeof window.ScholarRef.togglePanel === 'function') {
      window.ScholarRef.togglePanel();
      return;
    }
    ensureScholarRefReady().then(function (ok) {
      if (!ok) {
        toast('Reference management module failed to load.');
        return;
      }
      if (window.ScholarRef && typeof window.ScholarRef.togglePanel === 'function') {
        window.ScholarRef.togglePanel();
      }
    });
  }

  function switchScholarRefTab(index) { invokeScholarRef('switchTab', index); }
  function setScholarRefInputMode(mode) { invokeScholarRef('setInputMode', mode); }
  function scholarRefApplyInput() { invokeScholarRef('applyInput'); }
  function scholarRefClearInput() { invokeScholarRef('clearInput'); }
  function openScholarRefTxtImport() { invokeScholarRef('openTxtImport'); }
  function openScholarRefMdImport() { invokeScholarRef('openMdImport'); }
  function importScholarRefTxt(event) { invokeScholarRef('importTxt', event); }
  function importScholarRefMd(event) { invokeScholarRef('importMd', event); }
  function renderScholarRefSelectionList() { invokeScholarRef('renderSelectionList'); }
  function toggleScholarRefPick(id, checked) { invokeScholarRef('togglePick', id, checked); }
  function selectAllScholarRefs() { invokeScholarRef('selectAllFiltered'); }
  function clearScholarRefSelection() { invokeScholarRef('clearSelection'); }
  function insertSelectedScholarRefs() { invokeScholarRef('insertSelected'); }
  function insertAllScholarRefSection() { invokeScholarRef('insertAllSection'); }
  function downloadScholarRefTxt() { invokeScholarRef('downloadTxt'); }
  function downloadScholarRefMd() { invokeScholarRef('downloadMd'); }
  function openScholarRefListWindow() { invokeScholarRef('openListWindow'); }
  function pushScholarRefItemToGithub(id) { invokeScholarRef('pushGithubReferenceItem', id); }
  function pushScholarRefsToGithub() { invokeScholarRef('pushGithubSavedList'); }
  function pullScholarRefsFromGithub() { invokeScholarRef('pullGithubSavedList'); }
  function refreshScholarRefGithubList() { invokeScholarRef('renderGithubSavedList'); }
  function deleteScholarRefItem(id) { invokeScholarRef('deleteOne', id); }
  function clearAllScholarRefs() { invokeScholarRef('clearAll'); }

  function bindGlobals() {
    global.openScholarSearchModal = openScholarSearchModal;
    global.closeScholarSearchModal = closeScholarSearchModal;
    global.runScholarSearchFromModal = runScholarSearchFromModal;
    global.quickScholarSearchFromSelection = quickScholarSearchFromSelection;

    global.toggleScholarRefPanel = toggleScholarRefPanel;
    global.switchScholarRefTab = switchScholarRefTab;
    global.setScholarRefInputMode = setScholarRefInputMode;
    global.scholarRefApplyInput = scholarRefApplyInput;
    global.scholarRefClearInput = scholarRefClearInput;
    global.openScholarRefTxtImport = openScholarRefTxtImport;
    global.openScholarRefMdImport = openScholarRefMdImport;
    global.importScholarRefTxt = importScholarRefTxt;
    global.importScholarRefMd = importScholarRefMd;
    global.renderScholarRefSelectionList = renderScholarRefSelectionList;
    global.toggleScholarRefPick = toggleScholarRefPick;
    global.selectAllScholarRefs = selectAllScholarRefs;
    global.clearScholarRefSelection = clearScholarRefSelection;
    global.insertSelectedScholarRefs = insertSelectedScholarRefs;
    global.insertAllScholarRefSection = insertAllScholarRefSection;
    global.downloadScholarRefTxt = downloadScholarRefTxt;
    global.downloadScholarRefMd = downloadScholarRefMd;
    global.openScholarRefListWindow = openScholarRefListWindow;
    global.pushScholarRefItemToGithub = pushScholarRefItemToGithub;
    global.pushScholarRefsToGithub = pushScholarRefsToGithub;
    global.pullScholarRefsFromGithub = pullScholarRefsFromGithub;
    global.refreshScholarRefGithubList = refreshScholarRefGithubList;
    global.deleteScholarRefItem = deleteScholarRefItem;
    global.clearAllScholarRefs = clearAllScholarRefs;

    global.toggleScholarSearchDockRight = toggleScholarSearchDockRight;
    global.toggleScholarSearchShrink = toggleScholarSearchShrink;
  }

  function init(options) {
    var opts = options || {};
    if (typeof opts.dbGetter === 'function') deps.dbGetter = opts.dbGetter;
    if (typeof opts.getEditor === 'function') deps.getEditor = opts.getEditor;
    if (typeof opts.showToast === 'function') deps.showToast = opts.showToast;
    if (typeof opts.getEditorSelectedText === 'function') deps.getEditorSelectedText = opts.getEditorSelectedText;
    if (typeof opts.getDocumentBaseUrl === 'function') deps.getDocumentBaseUrl = opts.getDocumentBaseUrl;

    primeTemplateHtml();
    bindGlobals();
    state.initialized = true;
    return true;
  }

  global.ScholarSearchShell = {
    version: SHELL_VERSION,
    init: init,
    openModal: openScholarSearchModal,
    closeModal: closeScholarSearchModal,
    runSearch: runScholarSearchFromModal,
    quickSearch: quickScholarSearchFromSelection,
    openSearchWindow: openScholarSearchWindow,
    applyPanelLayout: applyScholarSearchPanelLayout,
    ensureScholarRefReady: ensureScholarRefReady
  };

  init({});
})(window);

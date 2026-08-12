(function (global) {
  'use strict';

  var VERSION = '20260812-scholar-modules-1';
  var currentScriptUrl = document.currentScript && document.currentScript.src;
  var loads = new Map();
  var host = {
    dbGetter: null,
    getEditor: null,
    showToast: null,
    getEditorSelectedText: null,
    getDocumentBaseUrl: null,
    saveSettings: null,
    syncHeaderVisibility: null
  };

  function q(id) {
    return document.getElementById(id);
  }

  function moduleUrl(relativePath) {
    if (currentScriptUrl) return new URL(relativePath, currentScriptUrl).href + '?v=' + VERSION;
    return './js/Scholarref/' + relativePath.replace(/^\.\.\//, '') + '?v=' + VERSION;
  }

  var sources = Object.freeze({
    references: moduleUrl('../reference/scholarref.js'),
    crossref: moduleUrl('../crossref/search.js'),
    shell: moduleUrl('../ui/scholarsearch-shell.js')
  });

  function toast(message) {
    if (typeof host.showToast === 'function') host.showToast(message);
    else console.warn(message);
  }

  function mountHostControls() {
    var headerSlot = q('scholar-search-header-slot');
    if (headerSlot && !q('btn-scholar-search')) {
      headerSlot.innerHTML = [
        '<button type="button" id="btn-scholar-search"',
        ' class="hidden px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"',
        ' title="학술검색 입력창 열기 (Alt+S)">학술검색</button>'
      ].join('');
      q('btn-scholar-search').addEventListener('click', open);
    }

    var settingsSlot = q('scholar-search-settings-slot');
    if (settingsSlot && !q('scholar-search-visible')) {
      settingsSlot.innerHTML = [
        '<label class="flex items-center gap-2 cursor-pointer select-none">',
        '<input type="checkbox" id="scholar-search-visible" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500">',
        '<span class="text-sm font-medium text-slate-700 dark:text-slate-300">학술검색 보이기</span>',
        '</label>'
      ].join('');
      q('scholar-search-visible').addEventListener('change', toggleVisibility);
    }
  }

  function loadScript(key, ready) {
    if (ready()) return Promise.resolve(true);
    if (loads.has(key)) return loads.get(key);
    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.charset = 'utf-8';
      script.async = false;
      script.dataset.scholarModule = key;
      script.src = sources[key];
      script.onload = function () {
        if (ready()) resolve(true);
        else reject(new Error('학술검색 모듈 API가 준비되지 않았습니다: ' + key));
      };
      script.onerror = function () {
        loads.delete(key);
        reject(new Error('학술검색 모듈을 불러오지 못했습니다: ' + key));
      };
      document.head.appendChild(script);
    });
    loads.set(key, promise);
    return promise;
  }

  function configureShell() {
    var shell = global.ScholarSearchShell;
    if (!shell || typeof shell.init !== 'function') return false;
    shell.init({
      dbGetter: host.dbGetter,
      getEditor: host.getEditor,
      showToast: host.showToast,
      getEditorSelectedText: host.getEditorSelectedText,
      getDocumentBaseUrl: host.getDocumentBaseUrl
    });
    return true;
  }

  async function ensureLoaded() {
    if (global.ScholarSearchShell && typeof global.ScholarSearchShell.openModal === 'function') {
      configureShell();
      return true;
    }
    await loadScript('references', function () { return !!global.ScholarRef; });
    await loadScript('crossref', function () { return !!global.ScholarCrossrefSearch; });
    await loadScript('shell', function () { return !!global.ScholarSearchShell; });
    configureShell();
    return true;
  }

  async function open() {
    try {
      await ensureLoaded();
      global.ScholarSearchShell.openModal();
      return true;
    } catch (error) {
      toast('학술검색을 불러오지 못했습니다: ' + (error && error.message ? error.message : error));
      return false;
    }
  }

  async function quickSearch() {
    try {
      await ensureLoaded();
      if (typeof global.ScholarSearchShell.quickSearch === 'function') {
        global.ScholarSearchShell.quickSearch();
        return true;
      }
    } catch (error) {
      toast('빠른 학술검색을 불러오지 못했습니다: ' + (error && error.message ? error.message : error));
    }
    return false;
  }

  function isVisibleSetting(settings) {
    return !!(settings && settings.scholarSearchVisible === true);
  }

  function isVisibleSelected() {
    var checkbox = q('scholar-search-visible');
    return !!(checkbox && checkbox.checked);
  }

  function syncSettingsControl(settings) {
    mountHostControls();
    var checkbox = q('scholar-search-visible');
    if (checkbox) checkbox.checked = isVisibleSetting(settings);
  }

  function applyVisibility(settings) {
    mountHostControls();
    var enabled = isVisibleSetting(settings);
    var button = q('btn-scholar-search');
    var checkbox = q('scholar-search-visible');
    if (button) button.classList.toggle('hidden', !enabled);
    if (checkbox) checkbox.checked = enabled;
    if (typeof host.syncHeaderVisibility === 'function') host.syncHeaderVisibility();
    return enabled;
  }

  async function toggleVisibility() {
    var enabled = isVisibleSelected();
    applyVisibility({ scholarSearchVisible: enabled });
    if (typeof host.saveSettings === 'function') {
      try {
        await host.saveSettings({ scholarSearchVisible: enabled });
      } catch (error) {
        console.error(error);
      }
    }
    return enabled;
  }

  function connectHost(options) {
    var next = options || {};
    Object.keys(host).forEach(function (key) {
      if (typeof next[key] === 'function') host[key] = next[key];
    });
    mountHostControls();
    configureShell();
    return api;
  }

  var api = Object.freeze({
    version: VERSION,
    connectHost: connectHost,
    mountHostControls: mountHostControls,
    ensureLoaded: ensureLoaded,
    open: open,
    quickSearch: quickSearch,
    applyVisibility: applyVisibility,
    syncSettingsControl: syncSettingsControl,
    isVisibleSetting: isVisibleSetting,
    isVisibleSelected: isVisibleSelected,
    toggleVisibility: toggleVisibility
  });

  var namespace = global.ScholarSearch || {};
  namespace.App = api;
  Object.defineProperties(namespace, {
    Shell: { configurable: true, get: function () { return global.ScholarSearchShell || null; } },
    Crossref: { configurable: true, get: function () { return global.ScholarCrossrefSearch || null; } },
    References: { configurable: true, get: function () { return global.ScholarRef || null; } }
  });
  global.ScholarSearch = namespace;
  global.ScholarSearchApp = api;

  // 기존 인라인 호출·단축키·명령 메뉴와의 호환 진입점이다.
  global.openScholarSearchModal = open;
  global.quickScholarSearchFromSelection = quickSearch;
  global.toggleScholarSearchSection = toggleVisibility;

  mountHostControls();
})(window);

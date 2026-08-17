(function (global) {
  'use strict';

  var SHELL_VERSION = '20260812-scholar-modules-1';
  var SHELL_TEMPLATE_VERSION = '20260812-scholar-modules-1';
  var SCHOLAR_REF_VERSION = '20260812-scholar-modules-1';
  var SQLITE_FEATURE_KEY = 'mdpro_sqlite_feature_enabled_v1';

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
    templateLoadPromise: null,
    crossrefSearchToken: 0,
    crossrefPreviewToken: 0,
    crossrefPvSyncTimer: null,
    crossrefViewMode: 'split',
    crossrefResults: [],
    crossrefWorkspaceBound: false,
    crossrefPaneWidths: { apa: 220, md: 0, pv: 0 },
    crossrefPaneResize: null,
    crossrefPanelDrag: null,
    crossrefGithubRepos: [],
    crossrefGithubLoading: false,
    crossrefSqliteItems: [],
    crossrefSqliteSelectedId: '',
    crossrefSqliteLoading: false,
    crossrefSqliteError: '',
    crossrefStorageFilter: 'all'
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
      var u1 = new URL('./js/Scholarref/ui/scholarsearch-shell.html', base);
      u1.searchParams.set('v', SHELL_TEMPLATE_VERSION);
      candidates.push(u1.href);
    } catch (_) {}
    candidates.push('./js/Scholarref/ui/scholarsearch-shell.html?v=' + SHELL_TEMPLATE_VERSION);
    try {
      var u2 = new URL('./Scholarref/ui/scholarsearch-shell.html', base);
      u2.searchParams.set('v', SHELL_TEMPLATE_VERSION);
      candidates.push(u2.href);
    } catch (_) {}
    candidates.push('./Scholarref/ui/scholarsearch-shell.html?v=' + SHELL_TEMPLATE_VERSION);
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
  var FALLBACK_TEMPLATE_HTML = "<div id=\"scholar-search-modal\" class=\"fixed inset-0 bg-transparent hidden items-start justify-end z-50 no-print pointer-events-none\">\n  <div id=\"scholar-search-panel\" class=\"pointer-events-auto mt-20 mr-5 bg-white/95 dark:bg-slate-800/95 rounded-xl shadow-2xl p-4 w-full max-w-xl border border-slate-200 dark:border-slate-700 backdrop-blur-[1px]\">\n    <div id=\"scholar-search-header\" class=\"flex items-center justify-between mb-3 gap-2 cursor-move select-none\">\n      <h3 id=\"scholar-search-title\" class=\"text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap\">Scholar Search</h3>\n      <div class=\"flex items-center gap-2 shrink-0\">\n        <button type=\"button\" id=\"scholar-search-shrink-btn\" onclick=\"toggleScholarSearchShrink()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">[>>]</button>\n        <button type=\"button\" id=\"scholar-search-dock-btn\" onclick=\"toggleScholarSearchDockRight()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">Undock</button>\n        <button type=\"button\" onclick=\"closeScholarSearchModal()\" class=\"px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700\">Close</button>\n      </div>\n    </div>\n    <div id=\"scholar-search-body\" class=\"space-y-3\">\n      <label id=\"scholar-search-query-label\" for=\"scholar-search-query\" class=\"block text-xs font-semibold text-slate-500 dark:text-slate-400\">Search query (paper title, author, keyword)</label>\n      <div id=\"scholar-search-input-row\" class=\"flex items-center gap-2\">\n        <input type=\"text\" id=\"scholar-search-query\" placeholder=\"e.g.) structural equation modeling education Korea\" onkeydown=\"if(event.key==='Enter'){event.preventDefault();runScholarSearchFromModal();}\" class=\"flex-1 px-3 py-2 border border-indigo-400 dark:border-indigo-500 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500\">\n        <button type=\"button\" id=\"scholar-search-run-btn\" onclick=\"runScholarSearchFromModal()\" class=\"px-4 py-2 bg-indigo-600 rounded-md text-sm font-semibold text-white hover:bg-indigo-700\">Search</button>\n      </div>\n      <div id=\"scholar-search-options\" class=\"pt-1\">\n        <div class=\"text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1\">Options</div>\n        <div class=\"flex flex-wrap items-center gap-2\">\n          <label class=\"text-xs text-slate-700 dark:text-slate-300\">Language:</label>\n          <select id=\"scholar-search-lang\" class=\"px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n            <option value=\"ko\">Korean first</option>\n            <option value=\"en\">English first</option>\n            <option value=\"all\">All languages</option>\n          </select>\n          <label class=\"text-xs text-slate-700 dark:text-slate-300 ml-1\">Period:</label>\n          <select id=\"scholar-search-period\" class=\"px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n            <option value=\"\">Any time</option>\n            <option value=\"1\">Last 1 year</option>\n            <option value=\"5\">Last 5 years</option>\n            <option value=\"10\">Last 10 years</option>\n          </select>\n          <label class=\"inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 ml-1\">\n            <input type=\"checkbox\" id=\"scholar-search-review\" class=\"rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500\">\n            Review/Survey only\n          </label>\n          <label class=\"inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 ml-1\">\n            <input type=\"checkbox\" id=\"scholar-search-crossref\" class=\"rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500\">\n            Crossref 동시검색\n          </label>\n          <label class=\"text-xs text-slate-700 dark:text-slate-300 ml-1\">개수:</label>\n          <select id=\"scholar-search-crossref-count-preset\" onchange=\"syncScholarCrossrefCountFromPreset()\" class=\"px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n            <option value=\"10\">10</option>\n            <option value=\"15\" selected>15</option>\n            <option value=\"20\">20</option>\n            <option value=\"30\">30</option>\n            <option value=\"40\">40</option>\n            <option value=\"50\">50</option>\n          </select>\n          <input type=\"number\" id=\"scholar-search-crossref-count\" value=\"15\" min=\"1\" max=\"50\" step=\"1\" oninput=\"syncScholarCrossrefCountFromInput()\" title=\"1~50 사이 결과 개수를 직접 입력\" class=\"w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100\">\n        </div>\n      </div>\n      <p id=\"scholar-search-help\" class=\"text-[11px] text-amber-600 dark:text-amber-400\">Google Scholar는 브라우저에서, Crossref 결과는 내부 MD/PV 편집창에서 동시에 열립니다.</p>\n      <div id=\"scholar-search-storage-actions\" class=\"flex flex-wrap items-center justify-start gap-2\">\n        <button type=\"button\" id=\"scholar-search-sqlite-explorer-btn\" onclick=\"openScholarSqliteExplorer()\" title=\"설정에서 SQLite 사용을 체크한 경우에만 사용할 수 있습니다.\" class=\"inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-violet-400 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700\">CrossrefBank(SQL)</button>\n        <button type=\"button\" id=\"scholar-search-indb-explorer-btn\" onclick=\"openScholarInDbExplorer()\" class=\"inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-cyan-500 px-3 py-2 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30\">CrossrefBank(inDB)</button>\n      </div>\n      <div class=\"pt-1 flex justify-end\">\n        <button type=\"button\" id=\"scholarref-toggle-btn\" class=\"scholarref-toggle-btn\" onclick=\"toggleScholarRefPanel()\">Reference management</button>\n      </div>\n      <div id=\"scholarref-panel\" class=\"scholarref-panel hidden\">\n        <div class=\"scholarref-tab-menu\">\n          <button type=\"button\" class=\"scholarref-tab active\" data-tab=\"0\" onclick=\"switchScholarRefTab(0)\">① 참고문헌 추가</button>\n          <button type=\"button\" class=\"scholarref-tab\" data-tab=\"1\" onclick=\"switchScholarRefTab(1)\">② 인용 삽입</button>\n          <button type=\"button\" class=\"scholarref-tab\" data-tab=\"2\" onclick=\"switchScholarRefTab(2)\">④ 저장된 목록</button>\n          <button type=\"button\" class=\"scholarref-tab\" data-tab=\"3\" onclick=\"switchScholarRefTab(3)\">저장목록(github)</button>\n        </div>\n        <div id=\"scholarref-tab-0\" class=\"scholarref-tab-content active\">\n          <div class=\"scholarref-row\">\n            <button type=\"button\" id=\"scholarref-method-blank\" class=\"scholarref-method-btn active\" onclick=\"setScholarRefInputMode('blank')\">빈 줄 구분</button>\n            <button type=\"button\" id=\"scholarref-method-line\" class=\"scholarref-method-btn\" onclick=\"setScholarRefInputMode('line')\">엔터 구분</button>\n          </div>\n          <label class=\"scholarref-label\" for=\"scholarref-input\">APA 형식 참고문헌 붙여넣기</label>\n          <textarea id=\"scholarref-input\" class=\"scholarref-textarea\" placeholder=\"여기에 참고문헌을 붙여넣으세요...\"></textarea>\n          <div class=\"scholarref-row\">\n            <button type=\"button\" class=\"scholarref-primary\" onclick=\"scholarRefApplyInput()\">앱에서 사용하기</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"scholarRefClearInput()\">지우기</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefTxtImport()\">TXT 불러오기</button>\n            <input type=\"file\" id=\"scholarref-txt-file\" accept=\".txt,.md\" class=\"hidden\" onchange=\"importScholarRefTxt(event)\">\n          </div>\n          <p id=\"scholarref-status\" class=\"scholarref-help\">현재: 빈 줄 구분</p>\n        </div>\n        <div id=\"scholarref-tab-1\" class=\"scholarref-tab-content\">\n          <div class=\"scholarref-row\">\n            <input type=\"text\" id=\"scholarref-search\" class=\"scholarref-search\" placeholder=\"저자, 연도, 키워드로 검색...\" oninput=\"renderScholarRefSelectionList()\">\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"selectAllScholarRefs()\">전체 선택</button>\n            <button type=\"button\" class=\"scholarref-secondary\" onclick=\"clearScholarRefSelection()\">선택 해제</button>\n          </div>\n          <div id=\"scholarref-select-list\" class=\"scholarref-list\"></div>\n          <div class=\"scholarref-row scholarref-wrap\">\n            <label class=\"scholarref-inline\">삽입 형식\n              <select id=\"scholarref-insert-format\" class=\"scholarref-select\">\n                <option value=\"inline\">인라인: (저자, 연도)</option>\n                <option value=\"narrative\">서술형: 저자(연도)</option>\n              </select>\n            </label>\n            <label class=\"scholarref-inline\"><input type=\"checkbox\" id=\"scholarref-append-section\"> 문서 끝 References(APA) 추가</label>\n            <label class=\"scholarref-inline\"><input type=\"checkbox\" id=\"scholarref-number-link\"> 번호(링크)로 삽입</label>\n            <span id=\"scholarref-selected-count\" class=\"scholarref-count\">0개 선택됨</span>\n          </div>\n          <div class=\"scholarref-row scholarref-center\">\n            <button type=\"button\" class=\"scholarref-primary\" onclick=\"insertSelectedScholarRefs()\">선택한 인용 삽입</button>\n          </div>\n        </div>\n        <div id=\"scholarref-tab-2\" class=\"scholarref-tab-content\">\n          <div class=\"scholarref-row scholarref-between\">\n            <div class=\"scholarref-count\">저장 <span id=\"scholarref-total-count\">0건</span></div>\n            <div class=\"scholarref-row\">\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"insertAllScholarRefSection()\">참고문헌 섹션 삽입</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"downloadScholarRefTxt()\">TXT 다운로드</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"downloadScholarRefMd()\">MD 다운로드</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefMdImport()\">MD 불러오기</button>\n              <button type=\"button\" id=\"scholarref-storage-save-btn\" class=\"scholarref-primary\" onclick=\"saveScholarRefsToStorage()\">STORAGE 저장</button>\n              <button type=\"button\" id=\"scholarref-storage-load-btn\" class=\"scholarref-secondary\" onclick=\"loadScholarRefsFromStorage()\">STORAGE 가져오기</button>\n              <button type=\"button\" id=\"scholarref-indb-save-btn\" class=\"scholarref-primary\" onclick=\"saveScholarRefsToInDb()\">inDB 저장</button>\n              <button type=\"button\" id=\"scholarref-indb-load-btn\" class=\"scholarref-secondary\" onclick=\"loadScholarRefsFromInDb()\">inDB 가져오기</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"openScholarRefListWindow()\">새창목록</button>\n              <button type=\"button\" id=\"scholarref-push-all-github-btn\" class=\"scholarref-primary\" onclick=\"pushScholarRefsToGithub()\">전체 push</button>\n              <button type=\"button\" class=\"scholarref-danger\" onclick=\"clearAllScholarRefs()\">전체 삭제</button>\n              <input type=\"file\" id=\"scholarref-md-file\" accept=\".md,.txt\" class=\"hidden\" onchange=\"importScholarRefMd(event)\">\n            </div>\n          </div>\n          <div id=\"scholarref-saved-list\" class=\"scholarref-list\"></div>\n        </div>\n        <div id=\"scholarref-tab-3\" class=\"scholarref-tab-content\">\n          <div class=\"scholarref-row scholarref-between\">\n            <div class=\"scholarref-count\">GitHub Reference 폴더</div>\n            <div class=\"scholarref-row\">\n              <button type=\"button\" class=\"scholarref-primary\" onclick=\"pullScholarRefsFromGithub()\">pull</button>\n              <button type=\"button\" class=\"scholarref-secondary\" onclick=\"refreshScholarRefGithubList()\">목록 새로고침</button>\n            </div>\n          </div>\n          <p id=\"scholarref-github-status\" class=\"scholarref-help\">GitHub 저장소의 Reference 폴더에 있는 저장목록입니다. pull하면 로컬 저장 목록에 병합됩니다.</p>\n          <div id=\"scholarref-github-list\" class=\"scholarref-list\"></div>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n\n<div id=\"scholar-crossref-results-modal\" class=\"pointer-events-none fixed inset-0 z-[90] hidden no-print\">\n  <div id=\"scholar-crossref-results-panel\" style=\"left:3vw;top:4vh\" class=\"pointer-events-auto absolute flex h-[88vh] w-[94vw] max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900\">\n    <div id=\"scholar-crossref-results-header\" class=\"flex cursor-move select-none items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700\">\n      <div class=\"min-w-0\">\n        <h3 class=\"truncate text-base font-bold text-slate-800 dark:text-slate-100\">Cressref 검색결과</h3>\n        <p id=\"scholar-crossref-results-status\" class=\"text-xs text-slate-500 dark:text-slate-400\">MD와 PV 어느 쪽에서 수정해도 서로 동기화됩니다.</p>\n      </div>\n      <div class=\"flex flex-wrap shrink-0 items-center justify-end gap-2\">\n        <div class=\"flex items-center rounded-md border border-slate-300 p-0.5 dark:border-slate-600\">\n          <button type=\"button\" id=\"scholar-crossref-view-split\" onclick=\"setScholarCrossrefViewMode('split')\" class=\"rounded px-2 py-1 text-xs font-semibold\">전체</button>\n          <button type=\"button\" id=\"scholar-crossref-view-md\" onclick=\"setScholarCrossrefViewMode('md')\" class=\"rounded px-2 py-1 text-xs font-semibold\">MD만 보기</button>\n          <button type=\"button\" id=\"scholar-crossref-view-pv\" onclick=\"setScholarCrossrefViewMode('pv')\" class=\"rounded px-2 py-1 text-xs font-semibold\">PV만 보기</button>\n        </div>\n        <button type=\"button\" onclick=\"copyScholarCrossrefMarkdown()\" class=\"rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800\">MD 복사</button>\n        <button type=\"button\" onclick=\"saveScholarCrossrefMarkdown()\" class=\"rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800\">MD 저장</button>\n        <button type=\"button\" onclick=\"toggleScholarCrossrefGithubPanel()\" class=\"rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700\">GitHub 공유</button>\n        <button type=\"button\" id=\"scholar-crossref-storage-save\" onclick=\"saveScholarCrossrefToStorage()\" class=\"rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700\">STORAGE 저장</button>\n        <button type=\"button\" id=\"scholar-crossref-storage-load\" onclick=\"loadScholarCrossrefFromStorage()\" class=\"rounded border border-violet-400 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40\">STORAGE 탐색기</button>\n        <button type=\"button\" id=\"scholar-crossref-indb-save\" onclick=\"saveScholarCrossrefToInDb()\" class=\"rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700\">inDB 저장</button>\n        <button type=\"button\" id=\"scholar-crossref-indb-load\" onclick=\"loadScholarCrossrefFromInDb()\" class=\"rounded border border-cyan-500 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40\">inDB 탐색기</button>\n        <button type=\"button\" onclick=\"applyScholarCrossrefResultsToDocument()\" class=\"rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700\">현재 문서로 열기</button>\n        <button type=\"button\" onclick=\"closeScholarCrossrefResults()\" class=\"rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800\">닫기</button>\n      </div>\n    </div>\n    <section id=\"scholar-crossref-github-panel\" style=\"max-width:calc(100% - 24px)\" class=\"absolute right-3 top-16 z-20 hidden w-[420px] space-y-3 rounded-lg border border-slate-300 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-900\">\n      <div class=\"flex items-center justify-between gap-2\">\n        <div>\n          <h4 class=\"text-sm font-bold text-slate-800 dark:text-slate-100\">GitHub 공유</h4>\n          <p class=\"text-[11px] text-slate-500 dark:text-slate-400\">현재 수정된 MD를 선택한 저장소와 폴더에 저장합니다.</p>\n        </div>\n        <button type=\"button\" onclick=\"toggleScholarCrossrefGithubPanel(false)\" class=\"rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300\">닫기</button>\n      </div>\n      <div class=\"space-y-1\">\n        <div class=\"flex items-center justify-between gap-2\">\n          <label for=\"scholar-crossref-github-repo\" class=\"text-xs font-semibold text-slate-600 dark:text-slate-300\">저장소 선택</label>\n          <button type=\"button\" onclick=\"loadScholarCrossrefGithubRepos(true)\" class=\"rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800\">새로고침</button>\n        </div>\n        <select id=\"scholar-crossref-github-repo\" onchange=\"syncScholarCrossrefGithubRepoSelection()\" class=\"w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100\">\n          <option value=\"\">저장소를 불러오세요</option>\n        </select>\n      </div>\n      <div class=\"grid grid-cols-[1fr_110px] gap-2\">\n        <label class=\"space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300\">저장소 폴더\n          <input id=\"scholar-crossref-github-folder\" type=\"text\" placeholder=\"research/crossref\" class=\"w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs font-normal text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100\">\n        </label>\n        <label class=\"space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300\">브랜치\n          <input id=\"scholar-crossref-github-branch\" type=\"text\" value=\"main\" class=\"w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs font-normal text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100\">\n        </label>\n      </div>\n      <label class=\"block space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300\">파일명\n        <input id=\"scholar-crossref-github-file\" type=\"text\" value=\"crossref-search-results.md\" class=\"w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs font-normal text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100\">\n      </label>\n      <div class=\"flex flex-wrap items-center gap-2\">\n        <button type=\"button\" onclick=\"createScholarCrossrefGithubFolder()\" class=\"rounded border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40\">폴더 생성</button>\n        <button type=\"button\" onclick=\"shareScholarCrossrefMarkdownToGithub()\" class=\"rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700\">현재 MD 공유</button>\n        <a id=\"scholar-crossref-github-open-link\" href=\"#\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"hidden rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300\">GitHub에서 열기</a>\n      </div>\n      <p id=\"scholar-crossref-github-status\" class=\"min-h-[1rem] text-[11px] text-slate-500 dark:text-slate-400\">설정에 저장된 GitHub PAT를 사용합니다.</p>\n    </section>\n    <div id=\"scholar-crossref-results-layout\" class=\"grid min-h-0 flex-1\">\n      <aside id=\"scholar-crossref-results-toc-pane\" class=\"flex min-h-0 flex-col border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r dark:border-slate-700 dark:bg-slate-900\">\n        <section class=\"flex max-h-[42%] min-h-[160px] shrink-0 flex-col border-b border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20\">\n          <div class=\"p-2 pb-1\">\n            <div class=\"mb-1 flex items-center justify-between gap-2\">\n              <div class=\"text-xs font-bold text-violet-700 dark:text-violet-300\">STORAGE 저장 검색 <span id=\"scholar-crossref-sqlite-count\" class=\"font-normal\">0건</span></div>\n              <button type=\"button\" onclick=\"refreshScholarCrossrefSqliteExplorer()\" title=\"저장 목록 새로고침\" class=\"rounded border border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/40\">새로고침</button>\n            </div>\n            <input type=\"search\" id=\"scholar-crossref-sqlite-query\" oninput=\"renderScholarCrossrefSqliteExplorer()\" placeholder=\"저장된 검색어·파일명 찾기\" class=\"w-full rounded border border-violet-200 bg-white px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-violet-500 dark:border-violet-800 dark:bg-slate-950 dark:text-slate-100\">\n          </div>\n          <div id=\"scholar-crossref-sqlite-list\" class=\"min-h-0 flex-1 overflow-auto px-2 pb-2 text-xs text-slate-700 dark:text-slate-300\">\n            <div class=\"rounded border border-dashed border-violet-300 p-3 text-center text-[11px] text-slate-500 dark:border-violet-800\">STORAGE 저장 목록을 불러오는 중입니다.</div>\n          </div>\n        </section>\n        <div class=\"border-b border-slate-200 p-2 dark:border-slate-700\">\n          <div class=\"mb-2 text-xs font-bold text-slate-600 dark:text-slate-300\">APA 참고문헌</div>\n          <div class=\"grid grid-cols-1 gap-1\">\n            <button type=\"button\" onclick=\"copyAllScholarCrossrefApa()\" class=\"rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800\">전체 복사</button>\n            <button type=\"button\" onclick=\"sendScholarCrossrefApaToReferenceManager()\" class=\"rounded bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700\">문헌관리로 보내기</button>\n          </div>\n        </div>\n        <nav id=\"scholar-crossref-results-toc\" class=\"min-h-0 flex-1 overflow-auto p-2 text-xs text-slate-700 dark:text-slate-300\"></nav>\n      </aside>\n      <div id=\"scholar-crossref-splitter-apa\" role=\"separator\" aria-label=\"APA 참고문헌과 편집 영역 너비 조절\" title=\"드래그하여 너비 조절\" class=\"w-1.5 cursor-col-resize touch-none select-none bg-slate-200 hover:bg-indigo-400 dark:bg-slate-700 dark:hover:bg-indigo-500\"></div>\n      <section id=\"scholar-crossref-results-md-pane\" class=\"flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r dark:border-slate-700\">\n        <div class=\"border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300\">MD 편집</div>\n        <textarea id=\"scholar-crossref-results-md\" oninput=\"renderScholarCrossrefMirror()\" spellcheck=\"false\" class=\"min-h-0 flex-1 resize-none bg-white p-4 font-mono text-sm leading-6 text-slate-900 outline-none dark:bg-slate-950 dark:text-slate-100\"></textarea>\n      </section>\n      <div id=\"scholar-crossref-splitter-preview\" role=\"separator\" aria-label=\"MD 편집과 PV 미리보기 너비 조절\" title=\"드래그하여 너비 조절\" class=\"w-1.5 cursor-col-resize touch-none select-none bg-slate-200 hover:bg-indigo-400 dark:bg-slate-700 dark:hover:bg-indigo-500\"></div>\n      <section id=\"scholar-crossref-results-pv-pane\" class=\"flex min-h-0 flex-col\">\n        <div class=\"border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300\">PV 편집 · 미리보기</div>\n        <div id=\"scholar-crossref-results-pv\" contenteditable=\"true\" spellcheck=\"true\" oninput=\"syncScholarCrossrefFromPv()\" class=\"markdown-body min-h-0 flex-1 overflow-auto bg-white p-5 text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:bg-slate-950 dark:text-slate-100\"></div>\n      </section>\n    </div>\n  </div>\n</div>";
  // AUTO-GENERATED FALLBACK TEMPLATE END

  function getTemplateHtml() {
    return FALLBACK_TEMPLATE_HTML;
  }

  function ensureStorageArtifactButtons() {
    var explorerButton = q('scholar-search-sqlite-explorer-btn') || q('scholar-search-storage-explorer-btn');
    var inDbExplorerButton = q('scholar-search-indb-explorer-btn');
    var explorerActions = q('scholar-search-storage-actions');
    var referenceToggle = q('scholarref-toggle-btn');
    if (!explorerActions && referenceToggle && referenceToggle.parentNode) {
      explorerActions = document.createElement('div');
      explorerActions.id = 'scholar-search-storage-actions';
      explorerActions.className = 'flex flex-wrap items-center justify-start gap-2';
      referenceToggle.parentNode.parentNode.insertBefore(explorerActions, referenceToggle.parentNode);
    }
    if (!explorerButton && explorerActions) {
      explorerButton = document.createElement('button');
      explorerButton.type = 'button';
      explorerButton.id = 'scholar-search-sqlite-explorer-btn';
    }
    if (explorerButton && explorerActions) {
      explorerButton.id = 'scholar-search-sqlite-explorer-btn';
      explorerButton.onclick = openScholarSqliteExplorer;
      explorerButton.title = '설정에서 SQLite 사용을 체크한 경우에만 사용할 수 있습니다.';
      explorerButton.className = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-violet-400 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700';
      explorerButton.textContent = 'CrossrefBank(SQL)';
      if (explorerButton.parentNode !== explorerActions) explorerActions.appendChild(explorerButton);
    }
    if (!inDbExplorerButton && explorerActions) {
      inDbExplorerButton = document.createElement('button');
      inDbExplorerButton.type = 'button';
      inDbExplorerButton.id = 'scholar-search-indb-explorer-btn';
      inDbExplorerButton.className = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-cyan-500 px-3 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300';
      inDbExplorerButton.onclick = openScholarInDbExplorer;
      explorerActions.appendChild(inDbExplorerButton);
    }
    if (inDbExplorerButton) {
      inDbExplorerButton.textContent = 'CrossrefBank(inDB)';
      inDbExplorerButton.onclick = openScholarInDbExplorer;
    }
    var refPush = q('scholarref-push-all-github-btn');
    if (refPush && refPush.parentNode && !q('scholarref-storage-save-btn')) {
      var refSave = document.createElement('button');
      refSave.type = 'button';
      refSave.id = 'scholarref-storage-save-btn';
      refSave.className = 'scholarref-primary';
      refSave.textContent = 'STORAGE 저장';
      refSave.onclick = saveScholarRefsToStorage;
      refPush.parentNode.insertBefore(refSave, refPush);
      var refLoad = document.createElement('button');
      refLoad.type = 'button';
      refLoad.id = 'scholarref-storage-load-btn';
      refLoad.className = 'scholarref-secondary';
      refLoad.textContent = 'STORAGE 가져오기';
      refLoad.onclick = loadScholarRefsFromStorage;
      refPush.parentNode.insertBefore(refLoad, refPush);
      var refInDbSave = document.createElement('button');
      refInDbSave.type = 'button';
      refInDbSave.id = 'scholarref-indb-save-btn';
      refInDbSave.className = 'scholarref-primary';
      refInDbSave.textContent = 'inDB 저장';
      refInDbSave.onclick = saveScholarRefsToInDb;
      refPush.parentNode.insertBefore(refInDbSave, refPush);
      var refInDbLoad = document.createElement('button');
      refInDbLoad.type = 'button';
      refInDbLoad.id = 'scholarref-indb-load-btn';
      refInDbLoad.className = 'scholarref-secondary';
      refInDbLoad.textContent = 'inDB 가져오기';
      refInDbLoad.onclick = loadScholarRefsFromInDb;
      refPush.parentNode.insertBefore(refInDbLoad, refPush);
    }
    var header = q('scholar-crossref-results-header');
    var github = header && header.querySelector('[onclick="toggleScholarCrossrefGithubPanel()"]');
    if (github && github.parentNode && !q('scholar-crossref-storage-save')) {
      var crossrefSave = document.createElement('button');
      crossrefSave.type = 'button';
      crossrefSave.id = 'scholar-crossref-storage-save';
      crossrefSave.className = 'rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700';
      crossrefSave.textContent = 'STORAGE 저장';
      crossrefSave.onclick = saveScholarCrossrefToStorage;
      github.parentNode.insertBefore(crossrefSave, github.nextSibling);
      var crossrefLoad = document.createElement('button');
      crossrefLoad.type = 'button';
      crossrefLoad.id = 'scholar-crossref-storage-load';
      crossrefLoad.className = 'rounded border border-violet-400 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300';
      crossrefLoad.textContent = 'STORAGE 탐색기';
      crossrefLoad.onclick = loadScholarCrossrefFromStorage;
      github.parentNode.insertBefore(crossrefLoad, crossrefSave.nextSibling);
      var crossrefInDbSave = document.createElement('button');
      crossrefInDbSave.type = 'button';
      crossrefInDbSave.id = 'scholar-crossref-indb-save';
      crossrefInDbSave.className = 'rounded bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700';
      crossrefInDbSave.textContent = 'inDB 저장';
      crossrefInDbSave.onclick = saveScholarCrossrefToInDb;
      github.parentNode.insertBefore(crossrefInDbSave, crossrefLoad.nextSibling);
      var crossrefInDbLoad = document.createElement('button');
      crossrefInDbLoad.type = 'button';
      crossrefInDbLoad.id = 'scholar-crossref-indb-load';
      crossrefInDbLoad.className = 'rounded border border-cyan-500 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300';
      crossrefInDbLoad.textContent = 'inDB 탐색기';
      crossrefInDbLoad.onclick = loadScholarCrossrefFromInDb;
      github.parentNode.insertBefore(crossrefInDbLoad, crossrefInDbSave.nextSibling);
    }
  }

  function mountTemplateHtml(html) {
    if (q('scholar-search-modal')) {
      ensureStorageArtifactButtons();
      return true;
    }
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html || getTemplateHtml()).trim();
    var nodes = Array.prototype.slice.call(wrap.children);
    var modal = nodes.shift();
    if (!modal) return false;

    var slot = q('scholar-search-slot');
    if (slot && slot.parentNode) slot.parentNode.replaceChild(modal, slot);
    else document.body.appendChild(modal);
    nodes.forEach(function (node) {
      document.body.appendChild(node);
    });
    ensureStorageArtifactButtons();
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

  function getScholarCrossrefCount() {
    var input = q('scholar-search-crossref-count');
    var value = Math.round(Number(input && input.value));
    if (!Number.isFinite(value)) value = 15;
    value = Math.max(1, Math.min(50, value));
    if (input) input.value = String(value);
    return value;
  }

  function syncScholarCrossrefCountFromPreset() {
    var preset = q('scholar-search-crossref-count-preset');
    var input = q('scholar-search-crossref-count');
    if (!preset || !input || preset.value === 'custom') return;
    input.value = preset.value;
  }

  function syncScholarCrossrefCountFromInput() {
    var input = q('scholar-search-crossref-count');
    var preset = q('scholar-search-crossref-count-preset');
    if (!input || !preset || input.value === '') return;
    var value = Math.max(1, Math.min(50, Math.round(Number(input.value) || 15)));
    var known = Array.prototype.some.call(preset.options, function (option) {
      return option.value !== 'custom' && Number(option.value) === value;
    });
    var custom = preset.querySelector('option[value="custom"]');
    if (known) {
      if (custom) custom.remove();
      preset.value = String(value);
    } else {
      if (!custom) {
        custom = document.createElement('option');
        custom.value = 'custom';
        preset.appendChild(custom);
      }
      custom.textContent = '직접 (' + value + ')';
      preset.value = 'custom';
    }
  }

  function escapeScholarResultHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildScholarCrossrefToc(preview) {
    var toc = q('scholar-crossref-results-toc');
    if (!toc || !preview) return;
    toc.innerHTML = '';
    var results = Array.isArray(state.crossrefResults) ? state.crossrefResults : [];
    var headings = preview.querySelectorAll('h2');
    var apaList = getScholarCrossrefApaList();

    results.forEach(function (result, index) {
      var apa = apaList[index] || '';
      var heading = headings[index] || null;
      if (heading) {
        heading.id = 'crossref-paper-' + (index + 1);
        heading.style.scrollMarginTop = '16px';
      }

      var item = document.createElement('div');
      item.className = 'scholar-crossref-apa-item mb-2 rounded border p-2';
      var jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'scholar-crossref-apa-jump block w-full text-left text-[11px] leading-5';
      jump.textContent = (index + 1) + '. ' + apa;
      jump.title = 'PV의 해당 논문으로 이동';
      jump.addEventListener('click', function () {
        if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      item.appendChild(jump);

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'scholar-crossref-apa-copy mt-1 rounded border px-2 py-0.5 text-[10px] font-semibold';
      copy.textContent = '복사';
      copy.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        copyScholarText(apa, 'APA 참고문헌 ' + (index + 1) + '번을 복사했습니다.');
      });
      item.appendChild(copy);
      toc.appendChild(item);
    });

    if (!toc.children.length) {
      var empty = document.createElement('p');
      empty.className = 'px-2 py-2 text-slate-400';
      empty.textContent = 'APA 참고문헌 정보가 없습니다.';
      toc.appendChild(empty);
    }
  }

  function getScholarCrossrefApaList() {
    if (!window.ScholarCrossrefSearch ||
        typeof window.ScholarCrossrefSearch.formatApaList !== 'function') return [];
    return window.ScholarCrossrefSearch.formatApaList(state.crossrefResults || []);
  }

  function copyScholarText(text, successMessage) {
    var value = String(text || '');
    if (!value) return Promise.resolve(false);
    function legacyCopy() {
      var temp = document.createElement('textarea');
      temp.value = value;
      temp.style.position = 'fixed';
      temp.style.left = '-10000px';
      document.body.appendChild(temp);
      temp.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (_) {}
      temp.remove();
      if (copied && successMessage) toast(successMessage);
      if (!copied) toast('클립보드 복사에 실패했습니다.');
      return copied;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () {
        if (successMessage) toast(successMessage);
        return true;
      }).catch(function () {
        return legacyCopy();
      });
    }
    return Promise.resolve(legacyCopy());
  }

  function copyAllScholarCrossrefApa() {
    var list = getScholarCrossrefApaList();
    if (!list.length) {
      toast('복사할 APA 참고문헌이 없습니다.');
      return;
    }
    copyScholarText(list.join('\n\n'), 'APA 참고문헌 ' + list.length + '건을 전체 복사했습니다.');
  }

  function sendScholarCrossrefApaToReferenceManager() {
    var list = getScholarCrossrefApaList();
    if (!list.length) {
      toast('문헌관리로 보낼 APA 참고문헌이 없습니다.');
      return;
    }
    ensureScholarRefReady().then(function (ok) {
      if (!ok || !window.ScholarRef) {
        toast('문헌관리 모듈을 준비하지 못했습니다.');
        return;
      }
      var textarea = q('scholarref-input');
      var panel = q('scholarref-panel');
      if (!textarea || !panel) {
        toast('APA 형식 참고문헌 붙여넣기 영역을 찾지 못했습니다.');
        return;
      }
      textarea.value = list.join('\n\n');
      window.ScholarRef.setInputMode('blank');
      window.ScholarRef.switchTab(0);
      panel.classList.remove('hidden');
      closeScholarCrossrefResults();
      var searchModal = q('scholar-search-modal');
      if (searchModal) {
        searchModal.classList.remove('hidden');
        searchModal.classList.add('flex');
      }
      applyScholarSearchPanelLayout();
      setTimeout(function () {
        textarea.focus();
        textarea.scrollTop = 0;
      }, 0);
      toast('APA 참고문헌 ' + list.length + '건을 문헌관리 입력란으로 보냈습니다.');
    });
  }

  function scholarInlineHtmlToMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var content = Array.prototype.map.call(node.childNodes, scholarInlineHtmlToMarkdown).join('');
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return '**' + content.trim() + '**';
    if (tag === 'em' || tag === 'i') return '*' + content.trim() + '*';
    if (tag === 'del' || tag === 's') return '~~' + content.trim() + '~~';
    if (tag === 'code') return '`' + String(node.textContent || '').replace(/`/g, '\\`') + '`';
    if (tag === 'a') {
      var href = String(node.getAttribute('href') || '').trim();
      var label = content.trim() || href;
      return !href || label === href ? label : '[' + label + '](' + href + ')';
    }
    return content;
  }

  function scholarBlockHtmlToMarkdown(node, depth) {
    if (!node) return '';
    if (node.nodeType === 3) {
      var text = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
      return text;
    }
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var level = Math.max(0, Number(depth) || 0);

    if (/^h[1-6]$/.test(tag)) {
      return '#'.repeat(Number(tag.slice(1))) + ' ' + scholarInlineHtmlToMarkdown(node).trim();
    }
    if (tag === 'p') return scholarInlineHtmlToMarkdown(node).trim();
    if (tag === 'pre') return '```\n' + String(node.textContent || '').replace(/\s+$/, '') + '\n```';
    if (tag === 'blockquote') {
      return scholarHtmlToMarkdown(node).split('\n').map(function (line) {
        return line ? '> ' + line : '>';
      }).join('\n');
    }
    if (tag === 'hr') return '---';
    if (tag === 'ul' || tag === 'ol') {
      var ordered = tag === 'ol';
      var index = 0;
      return Array.prototype.map.call(node.children, function (item) {
        if (!item || item.tagName.toLowerCase() !== 'li') return '';
        index += 1;
        var prefix = ordered ? index + '. ' : '- ';
        var line = scholarInlineHtmlToMarkdown(item).trim();
        return '  '.repeat(level) + prefix + line;
      }).filter(Boolean).join('\n');
    }
    if (tag === 'table') {
      var rows = Array.prototype.map.call(node.querySelectorAll('tr'), function (row) {
        return Array.prototype.map.call(row.querySelectorAll(':scope > th, :scope > td'), function (cell) {
          return scholarInlineHtmlToMarkdown(cell).trim().replace(/\|/g, '\\|');
        });
      }).filter(function (row) { return row.length; });
      if (!rows.length) return '';
      var output = ['| ' + rows[0].join(' | ') + ' |'];
      output.push('| ' + rows[0].map(function () { return '---'; }).join(' | ') + ' |');
      rows.slice(1).forEach(function (row) { output.push('| ' + row.join(' | ') + ' |'); });
      return output.join('\n');
    }
    if (tag === 'div' || tag === 'section' || tag === 'article') {
      return Array.prototype.map.call(node.childNodes, function (child) {
        return scholarBlockHtmlToMarkdown(child, level + 1);
      }).filter(Boolean).join('\n\n');
    }
    return scholarInlineHtmlToMarkdown(node).trim();
  }

  function scholarHtmlToMarkdown(root) {
    if (!root) return '';
    return Array.prototype.map.call(root.childNodes, function (node) {
      return scholarBlockHtmlToMarkdown(node, 0);
    }).filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function syncScholarCrossrefFromPv() {
    if (state.crossrefPvSyncTimer) clearTimeout(state.crossrefPvSyncTimer);
    state.crossrefPvSyncTimer = setTimeout(function () {
      state.crossrefPvSyncTimer = null;
      var preview = q('scholar-crossref-results-pv');
      var input = q('scholar-crossref-results-md');
      if (!preview || !input) return;
      input.value = scholarHtmlToMarkdown(preview);
      buildScholarCrossrefToc(preview);
      var status = q('scholar-crossref-results-status');
      if (status) status.textContent = 'PV에서 수정됨 · MD와 목차에 동기화되었습니다.';
    }, 180);
  }

  function clampScholarCrossrefWidth(value, min, max) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) numeric = min;
    return Math.max(min, Math.min(max, numeric));
  }

  function applyScholarCrossrefPaneLayout() {
    var layout = q('scholar-crossref-results-layout');
    var tocPane = q('scholar-crossref-results-toc-pane');
    var mdPane = q('scholar-crossref-results-md-pane');
    var pvPane = q('scholar-crossref-results-pv-pane');
    var apaSplitter = q('scholar-crossref-splitter-apa');
    var previewSplitter = q('scholar-crossref-splitter-preview');
    if (!layout || !tocPane || !mdPane || !pvPane) return;

    var next = state.crossrefViewMode || 'split';
    tocPane.classList.remove('hidden');
    mdPane.classList.toggle('hidden', next === 'pv');
    pvPane.classList.toggle('hidden', next === 'md');
    if (apaSplitter) apaSplitter.classList.remove('hidden');
    if (previewSplitter) previewSplitter.classList.toggle('hidden', next !== 'split');

    var total = Math.max(600, layout.clientWidth || Math.min(window.innerWidth * 0.94, 1500));
    var handleWidth = 6;
    var apa = clampScholarCrossrefWidth(state.crossrefPaneWidths.apa, 140, Math.max(140, total - 330));

    if (next === 'split') {
      var contentTotal = Math.max(320, total - apa - (handleWidth * 2));
      var md = state.crossrefPaneWidths.md > 0
        ? clampScholarCrossrefWidth(state.crossrefPaneWidths.md, 160, Math.max(160, contentTotal - 160))
        : Math.floor(contentTotal / 2);
      var pv = contentTotal - md;
      if (pv < 160) {
        pv = 160;
        md = Math.max(160, contentTotal - pv);
      }
      state.crossrefPaneWidths = { apa: apa, md: md, pv: pv };
      layout.style.gridTemplateColumns = apa + 'px ' + handleWidth + 'px ' + md + 'px ' + handleWidth + 'px minmax(160px,1fr)';
    } else {
      state.crossrefPaneWidths.apa = apa;
      layout.style.gridTemplateColumns = apa + 'px ' + handleWidth + 'px minmax(260px,1fr)';
    }
  }

  function setScholarCrossrefViewMode(mode) {
    var next = mode === 'md' || mode === 'pv' ? mode : 'split';
    state.crossrefViewMode = next;
    applyScholarCrossrefPaneLayout();

    ['split', 'md', 'pv'].forEach(function (name) {
      var button = q('scholar-crossref-view-' + name);
      if (!button) return;
      var active = name === next;
      button.classList.toggle('bg-indigo-600', active);
      button.classList.toggle('text-white', active);
      button.classList.toggle('text-slate-600', !active);
      button.classList.toggle('dark:text-slate-300', !active);
    });
  }

  function bindScholarCrossrefWorkspace() {
    if (state.crossrefWorkspaceBound) return;
    var panel = q('scholar-crossref-results-panel');
    var header = q('scholar-crossref-results-header');
    var apaSplitter = q('scholar-crossref-splitter-apa');
    var previewSplitter = q('scholar-crossref-splitter-preview');
    if (!panel || !header || !apaSplitter || !previewSplitter) return;
    state.crossrefWorkspaceBound = true;

    header.addEventListener('pointerdown', function (event) {
      var target = event.target;
      if (!target || (target.closest && target.closest('button,input,select,textarea,a'))) return;
      var rect = panel.getBoundingClientRect();
      state.crossrefPanelDrag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      event.preventDefault();
    });

    function beginPaneResize(kind, event) {
      var apaPane = q('scholar-crossref-results-toc-pane');
      var mdPane = q('scholar-crossref-results-md-pane');
      var pvPane = q('scholar-crossref-results-pv-pane');
      if (!apaPane || !mdPane || !pvPane) return;
      state.crossrefPaneResize = {
        kind: kind,
        startX: event.clientX,
        apa: apaPane.getBoundingClientRect().width,
        md: mdPane.classList.contains('hidden') ? 0 : mdPane.getBoundingClientRect().width,
        pv: pvPane.classList.contains('hidden') ? 0 : pvPane.getBoundingClientRect().width
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      event.preventDefault();
      event.stopPropagation();
    }

    apaSplitter.addEventListener('pointerdown', function (event) {
      beginPaneResize('apa', event);
    });
    previewSplitter.addEventListener('pointerdown', function (event) {
      beginPaneResize('preview', event);
    });

    document.addEventListener('pointermove', function (event) {
      if (state.crossrefPanelDrag) {
        var minLeft = Math.min(8, 160 - panel.offsetWidth);
        var maxLeft = Math.max(8, window.innerWidth - 160);
        var nextLeft = clampScholarCrossrefWidth(
          event.clientX - state.crossrefPanelDrag.offsetX,
          minLeft,
          maxLeft
        );
        var nextTop = clampScholarCrossrefWidth(
          event.clientY - state.crossrefPanelDrag.offsetY,
          0,
          Math.max(0, window.innerHeight - 48)
        );
        panel.style.left = nextLeft + 'px';
        panel.style.top = nextTop + 'px';
      }

      var resize = state.crossrefPaneResize;
      if (!resize) return;
      var delta = event.clientX - resize.startX;
      if (resize.kind === 'apa') {
        var adjacentStart = state.crossrefViewMode === 'pv' ? resize.pv : resize.md;
        var limitedDelta = Math.max(140 - resize.apa, Math.min(adjacentStart - 160, delta));
        state.crossrefPaneWidths.apa = resize.apa + limitedDelta;
        if (state.crossrefViewMode === 'pv') state.crossrefPaneWidths.pv = adjacentStart - limitedDelta;
        else state.crossrefPaneWidths.md = adjacentStart - limitedDelta;
      } else {
        var previewDelta = Math.max(160 - resize.md, Math.min(resize.pv - 160, delta));
        state.crossrefPaneWidths.md = resize.md + previewDelta;
        state.crossrefPaneWidths.pv = resize.pv - previewDelta;
      }
      applyScholarCrossrefPaneLayout();
    });

    document.addEventListener('pointerup', function () {
      state.crossrefPanelDrag = null;
      state.crossrefPaneResize = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    window.addEventListener('resize', function () {
      if (!q('scholar-crossref-results-modal') || q('scholar-crossref-results-modal').classList.contains('hidden')) return;
      applyScholarCrossrefPaneLayout();
    });
  }

  function renderScholarCrossrefMirror() {
    var input = q('scholar-crossref-results-md');
    var preview = q('scholar-crossref-results-pv');
    if (!input || !preview) return;
    var markdown = String(input.value || '');
    var token = ++state.crossrefPreviewToken;
    var renderPromise;

    if (window.MathRender && typeof window.MathRender.renderMarkdownSafe === 'function') {
      renderPromise = window.MathRender.renderMarkdownSafe(
        window.marked && window.marked.parse ? window.marked : null,
        markdown,
        { fallbackText: markdown }
      );
    } else if (window.marked && typeof window.marked.parse === 'function') {
      renderPromise = Promise.resolve(window.marked.parse(markdown));
    } else {
      renderPromise = Promise.resolve('<pre>' + escapeScholarResultHtml(markdown) + '</pre>');
    }

    Promise.resolve(renderPromise).then(function (html) {
      if (token !== state.crossrefPreviewToken || !preview) return;
      var output = String(html || '');
      if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        output = window.DOMPurify.sanitize(output);
      }
      preview.innerHTML = output;
      try {
        if (typeof window.applyDoiLinkTargets === 'function') {
          window.applyDoiLinkTargets(preview);
        }
      } catch (_) {}
      buildScholarCrossrefToc(preview);
      var status = q('scholar-crossref-results-status');
      if (status) status.textContent = 'MD에서 수정됨 · PV와 목차에 동기화되었습니다.';
      if (window.MathRender && typeof window.MathRender.typesetElement === 'function') {
        try { window.MathRender.typesetElement(preview); } catch (_) {}
      }
    }).catch(function () {
      if (token === state.crossrefPreviewToken) {
        preview.innerHTML = '<pre>' + escapeScholarResultHtml(markdown) + '</pre>';
        buildScholarCrossrefToc(preview);
      }
    });
  }

  function openScholarCrossrefResults(markdown, result) {
    var modal = q('scholar-crossref-results-modal');
    var input = q('scholar-crossref-results-md');
    var status = q('scholar-crossref-results-status');
    if (!modal || !input) {
      toast('Crossref 결과 편집창을 열 수 없습니다.');
      return;
    }
    state.crossrefResults = result && Array.isArray(result.results) ? result.results.slice() : [];
    input.value = String(markdown || '');
    var warnings = result && Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
    if (status) {
      status.textContent = 'Crossref ' + ((result && result.results && result.results.length) || 0)
        + '건 · 공개 초록 ' + ((result && result.abstractCount) || 0)
        + '건 · Markdown을 수정하면 PV에 즉시 반영됩니다.'
        + (warnings.length ? ' · ' + warnings.join(' / ') : '');
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    bindScholarCrossrefWorkspace();
    requestAnimationFrame(function () {
      setScholarCrossrefViewMode(state.crossrefViewMode || 'split');
    });
    renderScholarCrossrefMirror();
    refreshScholarCrossrefSqliteExplorer();
    setTimeout(function () { input.focus(); }, 0);
  }

  function closeScholarCrossrefResults() {
    var modal = q('scholar-crossref-results-modal');
    if (!modal) return;
    toggleScholarCrossrefGithubPanel(false);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function copyScholarCrossrefMarkdown() {
    var input = q('scholar-crossref-results-md');
    var markdown = String(input && input.value || '');
    if (!markdown) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(markdown).then(function () {
        toast('Crossref 검색 결과 Markdown을 복사했습니다.');
      }).catch(function () {
        toast('Markdown 복사에 실패했습니다.');
      });
    }
  }

  function saveScholarCrossrefMarkdown() {
    var input = q('scholar-crossref-results-md');
    var markdown = String(input && input.value || '');
    if (!markdown) {
      toast('저장할 Crossref Markdown이 없습니다.');
      return;
    }
    var queryInput = q('scholar-search-query');
    var query = String(queryInput && queryInput.value || 'crossref-search-results')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'crossref-search-results';
    var blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = query + '.md';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    toast('수정된 Markdown을 저장했습니다.');
  }

  function requireScholarStorage() {
    if (!global.MDPStorage
        || typeof global.MDPStorage.saveScholarSqliteWorkFile !== 'function'
        || typeof global.MDPStorage.listScholarSqliteWorkFiles !== 'function'
        || typeof global.MDPStorage.loadScholarSqliteWorkFile !== 'function') {
      throw new Error('STORAGE(SQLite/inDB) 작업파일 기능을 찾을 수 없습니다.');
    }
    return global.MDPStorage;
  }

  function requireScholarInDbStorage() {
    var storage = requireScholarStorage();
    if (typeof storage.saveScholarInDbWorkFile !== 'function'
        || typeof storage.listScholarInDbWorkFiles !== 'function'
        || typeof storage.loadScholarInDbWorkFile !== 'function') {
      throw new Error('inDB 전용 작업파일 기능을 찾을 수 없습니다.');
    }
    return storage;
  }

  function saveScholarSqliteWorkFile(storage, file, options) {
    var method = typeof storage.saveScholarSqliteWorkFile === 'function'
      ? storage.saveScholarSqliteWorkFile : storage.saveSqliteWorkFile;
    return method.call(storage, file, options);
  }

  function listScholarSqliteWorkFiles(storage, options) {
    var method = typeof storage.listScholarSqliteWorkFiles === 'function'
      ? storage.listScholarSqliteWorkFiles : storage.listSqliteWorkFiles;
    return method.call(storage, options);
  }

  function loadScholarSqliteWorkFile(storage, item) {
    var method = typeof storage.loadScholarSqliteWorkFile === 'function'
      ? storage.loadScholarSqliteWorkFile : storage.loadSqliteWorkFile;
    return method.call(storage, item);
  }

  function storageBackendLabel(value) {
    return String(value || '').toLowerCase() === 'indb' ? 'inDB' : 'SQLite';
  }

  function scholarSqliteFeatureEnabled() {
    var checkbox = q('sqlite-enabled');
    if (checkbox) return checkbox.checked === true;
    try {
      return global.localStorage.getItem(SQLITE_FEATURE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function scholarSqliteFileName(prefix) {
    var queryInput = q('scholar-search-query');
    var query = String(queryInput && queryInput.value || prefix || 'crossref-search-results')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || prefix || 'crossref-search-results';
    return query + '_' + Date.now() + '.md';
  }

  function chooseScholarSqliteItem(items, title) {
    var list = Array.isArray(items) ? items.slice(0, 30) : [];
    if (!list.length) return null;
    var labels = list.map(function (item, index) {
      var date = item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : '';
      return (index + 1) + '. ' + item.name + (date ? ' · ' + date : '');
    });
    var selected = window.prompt(title + '\n\n' + labels.join('\n') + '\n\n번호를 입력하세요.', '1');
    if (selected == null) return null;
    var index = Number(selected) - 1;
    return Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : null;
  }

  function scholarSqliteDisplayName(item) {
    var name = String(item && item.name || '저장된 학술검색');
    return name
      .replace(/_\d{13}\.md$/i, '')
      .replace(/\.md$/i, '')
      .replace(/-/g, ' ')
      .trim() || name;
  }

  function renderScholarCrossrefSqliteExplorer() {
    var list = q('scholar-crossref-sqlite-list');
    var count = q('scholar-crossref-sqlite-count');
    if (!list) return;
    var queryInput = q('scholar-crossref-sqlite-query');
    var keyword = String(queryInput && queryInput.value || '').trim().toLowerCase();
    var items = state.crossrefSqliteItems.filter(function (item) {
      if (state.crossrefStorageFilter === 'indb' && String(item.storageBackend) !== 'indb') return false;
      if (state.crossrefStorageFilter === 'sqlite' && String(item.storageBackend) === 'indb') return false;
      if (!keyword) return true;
      return (String(item.name || '') + ' ' + scholarSqliteDisplayName(item)).toLowerCase().indexOf(keyword) >= 0;
    });
    if (count) count.textContent = items.length + '건';
    if (state.crossrefSqliteLoading) {
      list.innerHTML = '<div class="rounded border border-dashed border-violet-300 p-3 text-center text-[11px] text-slate-500 dark:border-violet-800">저장 목록을 불러오는 중...</div>';
      return;
    }
    if (state.crossrefSqliteError) {
      list.innerHTML = '<div class="rounded border border-red-300 bg-red-50/60 p-3 text-[11px] text-red-600 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">'
        + escapeScholarResultHtml(state.crossrefSqliteError) + '</div>';
      return;
    }
    if (!items.length) {
      list.innerHTML = '<div class="rounded border border-dashed border-violet-300 p-3 text-center text-[11px] text-slate-500 dark:border-violet-800">'
        + (state.crossrefSqliteItems.length ? '검색 조건과 일치하는 저장 결과가 없습니다.' : 'STORAGE에 저장된 학술검색 결과가 없습니다.')
        + '</div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var selected = String(item.id) === state.crossrefSqliteSelectedId;
      var date = item.createdAt ? new Date(Number(item.createdAt)).toLocaleString('ko-KR') : '';
      return '<button type="button" data-scholar-sqlite-id="' + escapeScholarResultHtml(item.id) + '" '
        + 'class="mb-1.5 block w-full rounded border p-2 text-left transition '
        + (selected
          ? 'border-violet-600 bg-violet-100 ring-1 ring-violet-500/30 dark:bg-violet-950/50 '
          : 'border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-violet-950/30 ')
        + '"><span class="block truncate font-semibold text-slate-800 dark:text-slate-100" title="'
        + escapeScholarResultHtml(item.name) + '">' + escapeScholarResultHtml(scholarSqliteDisplayName(item)) + '</span>'
        + '<span class="mt-1 block text-[10px] text-slate-500">' + storageBackendLabel(item.storageBackend) + ' · ' + escapeScholarResultHtml(date)
        + ' · ' + Math.max(1, Math.ceil(Number(item.sizeBytes || 0) / 1024)) + ' KB</span></button>';
    }).join('');
    list.querySelectorAll('[data-scholar-sqlite-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        loadScholarCrossrefSqliteItem(button.dataset.scholarSqliteId);
      });
    });
  }

  async function refreshScholarCrossrefSqliteExplorer() {
    if (state.crossrefSqliteLoading) return state.crossrefSqliteItems;
    state.crossrefSqliteLoading = true;
    state.crossrefSqliteError = '';
    renderScholarCrossrefSqliteExplorer();
    try {
      var storage = state.crossrefStorageFilter === 'indb'
        ? requireScholarInDbStorage() : requireScholarStorage();
      var listMethod = state.crossrefStorageFilter === 'indb'
        ? storage.listScholarInDbWorkFiles.bind(storage)
        : function (options) { return listScholarSqliteWorkFiles(storage, options); };
      var result = await listMethod({
        appId: 'scholarsearch',
        workType: 'crossref_markdown',
        limit: 200
      });
      state.crossrefSqliteItems = result && Array.isArray(result.items) ? result.items : [];
      return state.crossrefSqliteItems;
    } catch (error) {
      state.crossrefSqliteItems = [];
      state.crossrefSqliteError = 'STORAGE 저장 목록을 읽지 못했습니다: ' + String(error && error.message || error);
      return [];
    } finally {
      state.crossrefSqliteLoading = false;
      renderScholarCrossrefSqliteExplorer();
    }
  }

  function openScholarStorageExplorer(filter) {
    state.crossrefStorageFilter = filter === 'indb' ? 'indb' : (filter === 'sqlite' ? 'sqlite' : 'all');
    var modal = q('scholar-crossref-results-modal');
    var input = q('scholar-crossref-results-md');
    if (!modal || !input) {
      toast('학술검색 STORAGE 탐색기를 열 수 없습니다.');
      return;
    }
    openScholarCrossrefResults(String(input.value || ''), { results: state.crossrefResults || [] });
    var status = q('scholar-crossref-results-status');
    if (status && !String(input.value || '').trim()) {
      status.textContent = '왼쪽 STORAGE 저장 검색 목록에서 항목을 선택하면 MD/PV 결과창에 표시됩니다.';
    }
  }

  function openScholarInDbExplorer() {
    openScholarStorageExplorer('indb');
    var status = q('scholar-crossref-results-status');
    if (status) status.textContent = 'inDB 전용 저장 목록입니다. 항목을 선택하면 MD/PV 결과창에 표시됩니다.';
    return state.crossrefSqliteItems;
  }

  function openScholarSqliteExplorer() {
    if (!scholarSqliteFeatureEnabled()) {
      toast('설정에서 SQLite 사용을 먼저 체크하세요.');
      return null;
    }
    openScholarStorageExplorer('sqlite');
    var status = q('scholar-crossref-results-status');
    if (status) status.textContent = 'SQLite 전용 저장 목록입니다. 항목을 선택하면 MD/PV 결과창에 표시됩니다.';
    return state.crossrefSqliteItems;
  }

  async function loadScholarCrossrefSqliteItem(itemId) {
    var normalizedId = String(itemId || '').trim();
    if (!normalizedId) return null;
    try {
      var storage = requireScholarStorage();
      var selected = state.crossrefSqliteItems.find(function (item) {
        return String(item.id) === normalizedId;
      });
      if (!selected) {
        var result = state.crossrefStorageFilter === 'indb'
          ? await storage.listScholarInDbWorkFiles({ appId: 'scholarsearch', workType: 'crossref_markdown', limit: 200 })
          : await listScholarSqliteWorkFiles(storage, {
          appId: 'scholarsearch', workType: 'crossref_markdown', limit: 200
          });
        state.crossrefSqliteItems = result && Array.isArray(result.items) ? result.items : [];
        selected = state.crossrefSqliteItems.find(function (item) { return String(item.id) === normalizedId; });
      }
      if (!selected) throw new Error('선택한 STORAGE 학술검색 결과를 찾을 수 없습니다.');
      var blob = String(selected.storageBackend) === 'indb'
        ? await storage.loadScholarInDbWorkFile(selected)
        : await loadScholarSqliteWorkFile(storage, selected);
      var markdown = await blob.text();
      var modal = q('scholar-crossref-results-modal');
      if (modal && modal.classList.contains('hidden')) {
        openScholarCrossrefResults(markdown, { results: [] });
      } else {
        var input = q('scholar-crossref-results-md');
        if (!input) throw new Error('Crossref 편집창을 찾을 수 없습니다.');
        input.value = markdown;
        state.crossrefResults = [];
        renderScholarCrossrefMirror();
      }
      state.crossrefSqliteSelectedId = normalizedId;
      renderScholarCrossrefSqliteExplorer();
      var status = q('scholar-crossref-results-status');
      var backendLabel = storageBackendLabel(selected.storageBackend);
      if (status) status.textContent = backendLabel + '에서 ' + selected.name + '을(를) 불러왔습니다. MD/PV에서 계속 편집할 수 있습니다.';
      toast(backendLabel + ' 학술검색 결과를 불러왔습니다.');
      return selected;
    } catch (error) {
      toast('STORAGE Crossref 불러오기 실패: ' + String(error && error.message || error));
      return null;
    }
  }

  async function saveScholarCrossrefWorkFile(forceInDb) {
    if (!forceInDb && !scholarSqliteFeatureEnabled()) {
      toast('설정에서 SQLite 사용을 먼저 체크하세요.');
      return null;
    }
    var input = q('scholar-crossref-results-md');
    var markdown = String(input && input.value || '');
    if (!markdown.trim()) {
      toast('STORAGE에 저장할 Crossref Markdown이 없습니다.');
      return null;
    }
    try {
      var storage = forceInDb ? requireScholarInDbStorage() : requireScholarStorage();
      var blob = new Blob([markdown], { type: 'text/markdown' });
      var options = {
          appId: 'scholarsearch',
          workType: 'crossref_markdown',
          fileName: scholarSqliteFileName('crossref-search-results')
      };
      var result = forceInDb
        ? await storage.saveScholarInDbWorkFile(blob, options)
        : await saveScholarSqliteWorkFile(storage, blob, options);
      state.crossrefSqliteSelectedId = String(result && result.id || '');
      var explorerQuery = q('scholar-crossref-sqlite-query');
      if (explorerQuery) explorerQuery.value = '';
      state.crossrefStorageFilter = forceInDb ? 'indb' : 'all';
      await refreshScholarCrossrefSqliteExplorer();
      toast('수정된 Crossref Markdown을 ' + storageBackendLabel(result && result.storageBackend) + '에 저장했습니다.');
      return result;
    } catch (error) {
      toast('STORAGE Crossref 저장 실패: ' + String(error && error.message || error));
      return null;
    }
  }

  function saveScholarCrossrefToStorage() { return saveScholarCrossrefWorkFile(false); }
  function saveScholarCrossrefToInDb() { return saveScholarCrossrefWorkFile(true); }
  function saveScholarCrossrefToSqlite() { return saveScholarCrossrefToStorage(); }

  async function loadScholarCrossrefFromStorage() {
    if (!scholarSqliteFeatureEnabled()) {
      toast('설정에서 SQLite 사용을 먼저 체크하세요.');
      return null;
    }
    openScholarStorageExplorer('sqlite');
    return refreshScholarCrossrefSqliteExplorer();
  }

  function loadScholarCrossrefFromInDb() { return openScholarInDbExplorer(); }
  function loadScholarCrossrefFromSqlite() { return loadScholarCrossrefFromStorage(); }

  function setScholarCrossrefGithubStatus(message, kind) {
    var status = q('scholar-crossref-github-status');
    if (!status) return;
    status.textContent = String(message || '');
    status.classList.remove('text-red-500', 'text-emerald-600', 'dark:text-red-400', 'dark:text-emerald-400', 'text-slate-500', 'dark:text-slate-400');
    if (kind === 'error') status.classList.add('text-red-500', 'dark:text-red-400');
    else if (kind === 'ok') status.classList.add('text-emerald-600', 'dark:text-emerald-400');
    else status.classList.add('text-slate-500', 'dark:text-slate-400');
  }

  function normalizeScholarCrossrefGithubPath(value) {
    return String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .map(function (part) {
        return part.trim().replace(/[\\:*?"<>|]+/g, '-');
      })
      .filter(function (part) { return !!part && part !== '.' && part !== '..'; })
      .join('/');
  }

  function encodeScholarCrossrefGithubPath(path) {
    return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function encodeScholarCrossrefGithubText(text) {
    var bytes = new TextEncoder().encode(String(text || ''));
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  async function getScholarCrossrefGithubConfig() {
    if (typeof global.getAiSettings !== 'function') {
      throw new Error('GitHub 설정을 읽을 수 없습니다.');
    }
    var settings = await global.getAiSettings() || {};
    var cfg;
    if (typeof global.getGithubConfigFromSettings === 'function') {
      cfg = global.getGithubConfigFromSettings(settings);
    } else {
      var repoRaw = String(settings.githubRepo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
      var repoParts = repoRaw.split('/').filter(Boolean);
      cfg = {
        enabled: !!settings.githubEnabled,
        token: String(settings.githubToken || '').trim(),
        branch: String(settings.githubBranch || 'main').trim() || 'main',
        repo: repoParts.length >= 2 ? repoParts[0] + '/' + repoParts[1] : '',
        defaultPushPath: normalizeScholarCrossrefGithubPath(settings.githubDefaultPushPath || '')
      };
    }
    if (!cfg || !cfg.enabled || !cfg.token) {
      throw new Error('설정에서 GitHub 사용과 PAT를 먼저 활성화하세요.');
    }
    return { settings: settings, cfg: cfg };
  }

  async function scholarCrossrefGithubRequest(url, options, token) {
    var opts = options || {};
    var headers = Object.assign({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + String(token || '').trim(),
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    if (opts.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    var response = await fetch(url, Object.assign({}, opts, { headers: headers }));
    if (!response.ok) {
      var message = 'GitHub API 오류: ' + response.status;
      try {
        var payload = await response.json();
        if (payload && payload.message) message = payload.message;
      } catch (_) {}
      var error = new Error(message);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return await response.json();
  }

  function getScholarCrossrefGithubSelection() {
    var repoSelect = q('scholar-crossref-github-repo');
    var branchInput = q('scholar-crossref-github-branch');
    var repo = String(repoSelect && repoSelect.value || '').trim();
    var parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('공유할 GitHub 저장소를 선택하세요.');
    }
    return {
      repo: repo,
      owner: parts[0],
      name: parts[1],
      branch: String(branchInput && branchInput.value || 'main').trim() || 'main'
    };
  }

  function syncScholarCrossrefGithubRepoSelection() {
    var select = q('scholar-crossref-github-repo');
    var branch = q('scholar-crossref-github-branch');
    if (!select || !branch) return;
    var option = select.options[select.selectedIndex];
    if (option && option.dataset && option.dataset.branch) branch.value = option.dataset.branch;
    var link = q('scholar-crossref-github-open-link');
    if (link) link.classList.add('hidden');
  }

  async function loadScholarCrossrefGithubRepos(force) {
    if (state.crossrefGithubLoading) return;
    var select = q('scholar-crossref-github-repo');
    if (!select) return;
    if (!force && state.crossrefGithubRepos.length) {
      return;
    }
    state.crossrefGithubLoading = true;
    select.disabled = true;
    select.innerHTML = '<option value="">저장소를 불러오는 중...</option>';
    setScholarCrossrefGithubStatus('접근 가능한 GitHub 저장소를 불러오는 중...', 'info');
    try {
      var pair = await getScholarCrossrefGithubConfig();
      var repos = await scholarCrossrefGithubRequest(
        'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
        {},
        pair.cfg.token
      );
      state.crossrefGithubRepos = Array.isArray(repos) ? repos : [];
      select.innerHTML = '<option value="">저장소 선택</option>';
      state.crossrefGithubRepos.forEach(function (repo) {
        var fullName = String(repo && repo.full_name || '').trim();
        if (!fullName) return;
        var option = document.createElement('option');
        option.value = fullName;
        option.textContent = fullName + (repo.private ? ' (Private)' : '');
        option.dataset.branch = String(repo.default_branch || 'main');
        select.appendChild(option);
      });
      var configuredRepo = String(pair.cfg.repo || '').trim();
      if (configuredRepo && Array.prototype.some.call(select.options, function (option) { return option.value === configuredRepo; })) {
        select.value = configuredRepo;
      } else if (select.options.length > 1) {
        select.selectedIndex = 1;
      }
      syncScholarCrossrefGithubRepoSelection();

      var folderInput = q('scholar-crossref-github-folder');
      if (folderInput && !folderInput.value) {
        var configuredFolder = [pair.cfg.basePath, pair.cfg.defaultPushPath]
          .map(normalizeScholarCrossrefGithubPath)
          .filter(Boolean)
          .join('/');
        folderInput.value = configuredFolder || 'Crossref';
      }
      setScholarCrossrefGithubStatus('저장소 ' + state.crossrefGithubRepos.length + '개를 불러왔습니다.', 'ok');
    } catch (error) {
      select.innerHTML = '<option value="">저장소를 불러오지 못했습니다</option>';
      setScholarCrossrefGithubStatus(String(error && error.message || error), 'error');
    } finally {
      state.crossrefGithubLoading = false;
      select.disabled = false;
    }
  }

  function toggleScholarCrossrefGithubPanel(force) {
    var panel = q('scholar-crossref-github-panel');
    if (!panel) return;
    var shouldOpen = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    if (!shouldOpen) return;

    var fileInput = q('scholar-crossref-github-file');
    var queryInput = q('scholar-search-query');
    if (fileInput && (!fileInput.value || fileInput.value === 'crossref-search-results.md')) {
      var query = String(queryInput && queryInput.value || 'crossref-search-results')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70) || 'crossref-search-results';
      fileInput.value = query + '.md';
    }
    loadScholarCrossrefGithubRepos(false);
  }

  async function createScholarCrossrefGithubFolder() {
    var folderInput = q('scholar-crossref-github-folder');
    var folder = normalizeScholarCrossrefGithubPath(folderInput && folderInput.value);
    if (!folder) {
      setScholarCrossrefGithubStatus('생성할 저장소 폴더 경로를 입력하세요.', 'error');
      return;
    }
    if (folderInput) folderInput.value = folder;
    setScholarCrossrefGithubStatus('GitHub 폴더를 생성하는 중...', 'info');
    try {
      var pair = await getScholarCrossrefGithubConfig();
      var selected = getScholarCrossrefGithubSelection();
      var keepPath = folder + '/.gitkeep';
      var apiBase = 'https://api.github.com/repos/' + encodeURIComponent(selected.owner) + '/' + encodeURIComponent(selected.name) + '/contents/';
      var getUrl = apiBase + encodeScholarCrossrefGithubPath(keepPath) + '?ref=' + encodeURIComponent(selected.branch);
      try {
        await scholarCrossrefGithubRequest(getUrl, {}, pair.cfg.token);
        setScholarCrossrefGithubStatus('이미 존재하는 폴더입니다: ' + folder, 'ok');
        return;
      } catch (error) {
        if (Number(error && error.status) !== 404) throw error;
      }
      await scholarCrossrefGithubRequest(apiBase + encodeScholarCrossrefGithubPath(keepPath), {
        method: 'PUT',
        body: JSON.stringify({
          message: 'create folder: ' + folder,
          content: encodeScholarCrossrefGithubText('\n'),
          branch: selected.branch
        })
      }, pair.cfg.token);
      setScholarCrossrefGithubStatus('폴더를 생성했습니다: ' + folder, 'ok');
      toast('GitHub 폴더를 생성했습니다.');
    } catch (error) {
      setScholarCrossrefGithubStatus('폴더 생성 실패: ' + String(error && error.message || error), 'error');
    }
  }

  async function shareScholarCrossrefMarkdownToGithub() {
    var mdInput = q('scholar-crossref-results-md');
    var folderInput = q('scholar-crossref-github-folder');
    var fileInput = q('scholar-crossref-github-file');
    var markdown = String(mdInput && mdInput.value || '');
    var folder = normalizeScholarCrossrefGithubPath(folderInput && folderInput.value);
    var fileName = String(fileInput && fileInput.value || 'crossref-search-results.md')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-');
    if (!markdown) {
      setScholarCrossrefGithubStatus('공유할 Markdown 내용이 없습니다.', 'error');
      return;
    }
    if (!fileName) fileName = 'crossref-search-results.md';
    if (!/\.md$/i.test(fileName)) fileName += '.md';
    if (folderInput) folderInput.value = folder;
    if (fileInput) fileInput.value = fileName;
    setScholarCrossrefGithubStatus('현재 Markdown을 GitHub에 공유하는 중...', 'info');

    try {
      var pair = await getScholarCrossrefGithubConfig();
      var selected = getScholarCrossrefGithubSelection();
      var remotePath = folder ? folder + '/' + fileName : fileName;
      var apiBase = 'https://api.github.com/repos/' + encodeURIComponent(selected.owner) + '/' + encodeURIComponent(selected.name) + '/contents/';
      var contentUrl = apiBase + encodeScholarCrossrefGithubPath(remotePath);
      var sha = '';
      try {
        var existing = await scholarCrossrefGithubRequest(
          contentUrl + '?ref=' + encodeURIComponent(selected.branch),
          {},
          pair.cfg.token
        );
        sha = String(existing && existing.sha || '');
      } catch (error) {
        if (Number(error && error.status) !== 404) throw error;
      }
      var body = {
        message: (sha ? 'update' : 'share') + ': ' + fileName,
        content: encodeScholarCrossrefGithubText(markdown),
        branch: selected.branch
      };
      if (sha) body.sha = sha;
      var pushed = await scholarCrossrefGithubRequest(contentUrl, {
        method: 'PUT',
        body: JSON.stringify(body)
      }, pair.cfg.token);
      var openUrl = String(pushed && pushed.content && pushed.content.html_url || '');
      if (!openUrl) {
        openUrl = 'https://github.com/' + selected.repo + '/blob/' + encodeURIComponent(selected.branch) + '/' + encodeScholarCrossrefGithubPath(remotePath);
      }
      var link = q('scholar-crossref-github-open-link');
      if (link) {
        link.href = openUrl;
        link.classList.remove('hidden');
      }
      setScholarCrossrefGithubStatus('GitHub 공유 완료: ' + selected.repo + '/' + remotePath, 'ok');
      toast('Crossref Markdown을 GitHub에 공유했습니다.');
    } catch (error) {
      setScholarCrossrefGithubStatus('GitHub 공유 실패: ' + String(error && error.message || error), 'error');
    }
  }

  function applyScholarCrossrefResultsToDocument() {
    var input = q('scholar-crossref-results-md');
    var editor = getEditor();
    var markdown = String(input && input.value || '');
    if (!editor || !markdown) {
      toast('현재 문서로 열 Crossref 결과가 없습니다.');
      return;
    }
    if (String(editor.value || '').trim() &&
        !window.confirm('현재 편집 중인 문서를 Crossref 검색 결과로 바꾸시겠습니까?')) {
      return;
    }
    editor.value = markdown;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    closeScholarCrossrefResults();
    closeScholarSearchModal();
    if (typeof global.toggleMode === 'function') global.toggleMode('edit');
    toast('Crossref 검색 결과를 현재 Markdown 문서로 열었습니다.');
  }

  async function runScholarSearchFromModal() {
    var input = q('scholar-search-query');
    var langEl = q('scholar-search-lang');
    var periodEl = q('scholar-search-period');
    var reviewEl = q('scholar-search-review');
    var crossrefEl = q('scholar-search-crossref');
    var runBtn = q('scholar-search-run-btn');
    var help = q('scholar-search-help');
    var query = String(input ? input.value : '').trim();
    var lang = langEl ? langEl.value : 'ko';
    var period = periodEl ? periodEl.value : '';
    var reviewOnly = !!(reviewEl && reviewEl.checked);
    var crossrefEnabled = !!(crossrefEl && crossrefEl.checked);
    if (!query) {
      toast('검색어를 입력하세요.');
      return;
    }

    openScholarSearchWindow(query, { lang: lang, period: period, reviewOnly: reviewOnly });
    if (!crossrefEnabled) return;

    if (!window.ScholarCrossrefSearch ||
        typeof window.ScholarCrossrefSearch.search !== 'function') {
      toast('Crossref 검색 모듈이 준비되지 않았습니다. 앱을 새로고침하세요.');
      return;
    }

    var token = ++state.crossrefSearchToken;
    var count = getScholarCrossrefCount();
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '검색 중...';
      runBtn.classList.add('opacity-60', 'cursor-wait');
    }
    try {
      var result = await window.ScholarCrossrefSearch.search(query, count, {
        periodYears: Number(period) || 0,
        reviewOnly: reviewOnly,
        onProgress: function (message) {
          if (token === state.crossrefSearchToken && help) help.textContent = message;
        }
      });
      if (token !== state.crossrefSearchToken) return;
      var markdown = window.ScholarCrossrefSearch.formatMarkdown(result.results, result.queryUsed || query);
      openScholarCrossrefResults(markdown, result);
      if (help) help.textContent = 'Google Scholar 검색과 Crossref ' + result.results.length + '건 검색을 완료했습니다.';
    } catch (error) {
      if (token !== state.crossrefSearchToken) return;
      var message = error && error.message ? error.message : 'Crossref 검색에 실패했습니다.';
      if (help) help.textContent = message;
      toast(message);
    } finally {
      if (token === state.crossrefSearchToken && runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = 'Search';
        runBtn.classList.remove('opacity-60', 'cursor-wait');
      }
    }
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
      var u1 = new URL('./js/Scholarref/reference/scholarref.js', base);
      u1.searchParams.set('v', SCHOLAR_REF_VERSION);
      candidates.push(u1.href);
    } catch (_) {}
    candidates.push('./js/Scholarref/reference/scholarref.js?v=' + SCHOLAR_REF_VERSION);
    try {
      var u2 = new URL('./Scholarref/reference/scholarref.js', base);
      u2.searchParams.set('v', SCHOLAR_REF_VERSION);
      candidates.push(u2.href);
    } catch (_) {}
    candidates.push('./Scholarref/reference/scholarref.js?v=' + SCHOLAR_REF_VERSION);

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
  function saveScholarRefsToStorage() { return invokeScholarRef('saveStorageMarkdown'); }
  function loadScholarRefsFromStorage() { return invokeScholarRef('loadStorageMarkdown'); }
  function saveScholarRefsToInDb() { return invokeScholarRef('saveInDbMarkdown'); }
  function loadScholarRefsFromInDb() { return invokeScholarRef('loadInDbMarkdown'); }
  function saveScholarRefsToSqlite() { return saveScholarRefsToStorage(); }
  function loadScholarRefsFromSqlite() { return loadScholarRefsFromStorage(); }
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
    global.syncScholarCrossrefCountFromPreset = syncScholarCrossrefCountFromPreset;
    global.syncScholarCrossrefCountFromInput = syncScholarCrossrefCountFromInput;
    global.renderScholarCrossrefMirror = renderScholarCrossrefMirror;
    global.syncScholarCrossrefFromPv = syncScholarCrossrefFromPv;
    global.setScholarCrossrefViewMode = setScholarCrossrefViewMode;
    global.copyAllScholarCrossrefApa = copyAllScholarCrossrefApa;
    global.sendScholarCrossrefApaToReferenceManager = sendScholarCrossrefApaToReferenceManager;
    global.closeScholarCrossrefResults = closeScholarCrossrefResults;
    global.copyScholarCrossrefMarkdown = copyScholarCrossrefMarkdown;
    global.saveScholarCrossrefMarkdown = saveScholarCrossrefMarkdown;
    global.saveScholarCrossrefToStorage = saveScholarCrossrefToStorage;
    global.loadScholarCrossrefFromStorage = loadScholarCrossrefFromStorage;
    global.saveScholarCrossrefToInDb = saveScholarCrossrefToInDb;
    global.loadScholarCrossrefFromInDb = loadScholarCrossrefFromInDb;
    global.saveScholarCrossrefToSqlite = saveScholarCrossrefToSqlite;
    global.loadScholarCrossrefFromSqlite = loadScholarCrossrefFromSqlite;
    global.openScholarStorageExplorer = openScholarStorageExplorer;
    global.openScholarInDbExplorer = openScholarInDbExplorer;
    global.openScholarSqliteExplorer = openScholarSqliteExplorer;
    global.refreshScholarCrossrefSqliteExplorer = refreshScholarCrossrefSqliteExplorer;
    global.renderScholarCrossrefSqliteExplorer = renderScholarCrossrefSqliteExplorer;
    global.loadScholarCrossrefSqliteItem = loadScholarCrossrefSqliteItem;
    global.toggleScholarCrossrefGithubPanel = toggleScholarCrossrefGithubPanel;
    global.loadScholarCrossrefGithubRepos = loadScholarCrossrefGithubRepos;
    global.syncScholarCrossrefGithubRepoSelection = syncScholarCrossrefGithubRepoSelection;
    global.createScholarCrossrefGithubFolder = createScholarCrossrefGithubFolder;
    global.shareScholarCrossrefMarkdownToGithub = shareScholarCrossrefMarkdownToGithub;
    global.applyScholarCrossrefResultsToDocument = applyScholarCrossrefResultsToDocument;

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
    global.saveScholarRefsToStorage = saveScholarRefsToStorage;
    global.loadScholarRefsFromStorage = loadScholarRefsFromStorage;
    global.saveScholarRefsToInDb = saveScholarRefsToInDb;
    global.loadScholarRefsFromInDb = loadScholarRefsFromInDb;
    global.saveScholarRefsToSqlite = saveScholarRefsToSqlite;
    global.loadScholarRefsFromSqlite = loadScholarRefsFromSqlite;
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

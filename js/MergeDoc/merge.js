(function () {
  'use strict';
  if (window.__mergeDocLoaded) return;
  window.__mergeDocLoaded = true;

  var mergeListState = [];
  var mergeInDbListState = [];
  var mergeLocalListState = [];
  var mergeSourceMode = 'indb';
  var mergeTargetMode = 'indb';
  var mergeListSearchQuery = '';
  var mergeListSelectedOnly = false;
  var mergeListDensity = 100;
  var mergeFocusedIndex = -1;
  var mergeLocalDirectoryHandle = null;
  var mergeLocalDirectoryName = '';
  var mergeModalReady = null;
  var mergePanelActive = null;
  var mergePanelInteractionsBound = false;
  var mergePanelDragging = false;
  var mergePanelResizing = false;
  var mergePanelPointerId = null;
  var mergePanelDragOffsetX = 0;
  var mergePanelDragOffsetY = 0;

  var DEFAULT_PANEL_WIDTH = 900;
  var DEFAULT_PANEL_HEIGHT = 640;
  var DEFAULT_PANEL_TOP = 72;
  var WIDE_LAYOUT_MIN_WIDTH = 720;
  var mergePanelBeforeFullscreen = null;
  var mergePanelResizeObserver = null;
  var mergeWorkspaceResizeObserver = null;
  var MERGE_MODAL_FALLBACK_HTML = ''
    + '<div id="merge-modal" data-source="merge-doc" class="fixed inset-0 hidden z-[55] no-print pointer-events-none bg-transparent">'
    + '<div id="merge-panel" class="pointer-events-auto fixed bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-[min(900px,92vw)] h-[min(640px,88vh)] min-w-[300px] min-h-[320px] flex flex-col overflow-hidden">'
    + '<div id="merge-panel-header" class="flex items-center justify-between mb-3 gap-2 cursor-move touch-none select-none shrink-0">'
    + '<h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><i data-lucide="layers" class="w-5 h-5"></i> 문서 묶기</h3>'
    + '<div class="flex items-center gap-1"><button type="button" id="merge-fullscreen-button" title="전체화면" class="p-1.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><i data-lucide="maximize-2" class="w-4 h-4"></i><span class="sr-only">전체화면</span></button><button type="button" onclick="closeMergeModal()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Close</button></div>'
    + '</div><div id="merge-layout" class="flex-1 min-h-0"><div id="merge-menu-pane">'
    + '<div class="grid grid-cols-2 gap-2 mb-3 shrink-0" role="tablist" aria-label="문서 출처">'
    + '<button type="button" id="merge-source-local" onclick="switchMergeSource(\'local\')" class="px-3 py-2 rounded-md border text-sm font-bold">Local</button>'
    + '<button type="button" id="merge-source-indb" onclick="switchMergeSource(\'indb\')" class="px-3 py-2 rounded-md border text-sm font-bold">inDB</button>'
    + '</div>'
    + '<div id="merge-local-import-tools" class="hidden mb-3 shrink-0 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-2">'
    + '<div class="grid grid-cols-2 gap-2">'
    + '<button type="button" onclick="openMergeLocalFiles()" class="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1"><i data-lucide="files" class="w-4 h-4"></i>파일 불러오기</button>'
    + '<button type="button" onclick="openMergeLocalFolder()" class="px-3 py-2 rounded-md border border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950 flex items-center justify-center gap-1"><i data-lucide="folder-open" class="w-4 h-4"></i>폴더 불러오기</button>'
    + '</div>'
    + '<p id="merge-local-import-status" class="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">md, txt, html, docx, pdf, csv, json 파일을 여러 개 또는 폴더째 불러올 수 있습니다.</p>'
    + '<input id="merge-local-file-input" type="file" multiple accept=".md,.markdown,.mdown,.txt,.html,.htm,.docx,.pdf,.csv,.json" class="hidden" onchange="importMergeLocalFiles(this.files, false); this.value=\'\'">'
    + '<input id="merge-local-folder-input" type="file" multiple webkitdirectory directory accept=".md,.markdown,.mdown,.txt,.html,.htm,.docx,.pdf,.csv,.json" class="hidden" onchange="importMergeLocalFiles(this.files, true); this.value=\'\'">'
    + '</div>'
    + '<div class="flex items-center gap-2 mb-2 shrink-0"><span class="text-xs font-bold text-slate-500 dark:text-slate-300 shrink-0">결과 저장</span><div class="grid grid-cols-2 gap-1 flex-1">'
    + '<button type="button" id="merge-target-local" onclick="switchMergeTarget(\'local\')" class="px-2 py-1 rounded border text-xs font-bold">가져온 폴더</button>'
    + '<button type="button" id="merge-target-indb" onclick="switchMergeTarget(\'indb\')" class="px-2 py-1 rounded border text-xs font-bold">inDB Bind</button>'
    + '</div></div>'
    + '<div class="mb-3 shrink-0 rounded-lg border border-slate-200 dark:border-slate-600 p-2"><div class="flex items-center justify-between gap-2 mb-1.5"><span class="text-xs font-bold text-slate-600 dark:text-slate-300">문서 순서</span><span id="merge-focused-label" class="text-[10px] text-slate-500 dark:text-slate-400 truncate">목록에서 문서를 선택하세요</span></div><div class="grid grid-cols-2 gap-2"><button type="button" id="merge-move-up-button" onclick="moveFocusedMergeItem(-1)" class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40" disabled><i data-lucide="arrow-up" class="inline w-4 h-4 mr-1"></i>위로</button><button type="button" id="merge-move-down-button" onclick="moveFocusedMergeItem(1)" class="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40" disabled><i data-lucide="arrow-down" class="inline w-4 h-4 mr-1"></i>아래로</button></div></div>'
    + '<div class="flex gap-2 mb-3 shrink-0">'
    + '<input type="text" id="merge-bundle-name" placeholder="새로운 묶음 파일" class="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<button type="button" id="merge-bind-button" class="px-4 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-md text-sm font-bold border border-slate-700 dark:border-slate-300 hover:bg-slate-700 dark:hover:bg-slate-300">Bind</button>'
    + '</div><div class="mb-3 shrink-0 rounded-lg border border-slate-200 dark:border-slate-600 p-2 space-y-2"><div class="flex flex-wrap items-center gap-x-4 gap-y-2"><label class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"><input id="merge-cover-enabled" type="checkbox" onchange="toggleMergeCoverOptions(this.checked)" class="rounded border-slate-300 text-indigo-600">표지 넣기</label><label class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"><input id="merge-toc-enabled" type="checkbox" class="rounded border-slate-300 text-indigo-600">자동 목차 넣기</label></div><div id="merge-cover-fields" class="hidden grid grid-cols-1 gap-2 pt-2 border-t border-slate-200 dark:border-slate-600"><input id="merge-cover-title" type="text" placeholder="표지 제목" class="w-full min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"><input id="merge-cover-subtitle" type="text" placeholder="부제목" class="w-full min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"><input id="merge-cover-author" type="text" placeholder="작성자" class="w-full min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"><input id="merge-cover-institution" type="text" placeholder="기관" class="w-full min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"><input id="merge-cover-date" type="text" placeholder="작성일" class="w-full min-w-0 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"></div><p class="text-[10px] leading-4 text-slate-500 dark:text-slate-400">표지 또는 자동 목차를 사용하면 결과는 DOCX로 생성됩니다.</p></div></div><div id="merge-list-pane"><div class="mb-3 shrink-0 space-y-2">'
    + '<input type="text" id="merge-search-input" placeholder="문서 검색..." oninput="filterMergeList(this.value)" class="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<div class="grid grid-cols-3 gap-2">'
    + '<button type="button" onclick="selectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체선택</button>'
    + '<button type="button" onclick="deselectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체 해제</button>'
    + '<button type="button" id="merge-selected-only-btn" onclick="toggleSelectedOnlyMergeView()" class="px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700">선택 보기</button>'
    + '</div></div>'
    + '<div id="merge-list" class="flex-1 overflow-y-auto space-y-2 min-h-0 custom-scrollbar" aria-live="polite"></div><div id="merge-list-density-controls" class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between gap-2 shrink-0"><span id="merge-list-count" class="text-[10px] text-slate-500 dark:text-slate-400">0개 문서</span><div class="flex items-center gap-1" aria-label="목록 표시 크기"><span class="text-[10px] text-slate-500 dark:text-slate-400 mr-1">목록 크기</span><button type="button" id="merge-density-smaller" onclick="adjustMergeListDensity(-1)" title="목록을 더 작게" class="w-7 h-7 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">−</button><button type="button" id="merge-density-label" onclick="setMergeListDensity(100)" title="기본 크기로 복원" class="min-w-[46px] h-7 px-2 rounded border border-slate-300 dark:border-slate-600 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">100%</button><button type="button" id="merge-density-larger" onclick="adjustMergeListDensity(1)" title="목록을 더 크게" class="w-7 h-7 rounded border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">+</button></div></div>'
    + '</div></div>'
    + '<div id="merge-panel-resizer" title="Resize" class="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize touch-none opacity-70 hover:opacity-100 select-none" style="background:linear-gradient(135deg,transparent 45%,#94a3b8 46%,#94a3b8 54%,transparent 55%);"></div>'
    + '</div></div>';

  function getMergePanel() {
    if (mergePanelActive && document.body.contains(mergePanelActive)) return mergePanelActive;
    mergePanelActive = document.getElementById('merge-panel');
    return mergePanelActive;
  }

  function getMergeHeader(panel) {
    return panel ? document.getElementById('merge-panel-header') : null;
  }

  function getMergeResizer(panel) {
    return panel ? document.getElementById('merge-panel-resizer') : null;
  }

  function ensureMergeResponsiveStyles() {
    if (document.getElementById('merge-responsive-layout-style')) return;
    var style = document.createElement('style');
    style.id = 'merge-responsive-layout-style';
    style.textContent = [
      '#merge-modal{z-index:95!important;}',
      '#merge-layout{display:flex;flex-direction:column;min-height:0;overflow:hidden;}',
      '#merge-menu-pane{flex:0 0 auto;min-width:0;}',
      '#merge-list-pane{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;}',
      '#merge-panel[data-layout="wide"] #merge-layout{display:grid;grid-template-columns:minmax(260px,32%) minmax(0,1fr);gap:16px;}',
      '#merge-panel[data-layout="wide"] #merge-menu-pane{overflow-y:auto;padding-right:16px;border-right:1px solid #e2e8f0;}',
      '#merge-panel[data-layout="wide"] #merge-cover-fields{grid-template-columns:repeat(2,minmax(0,1fr));}',
      '.dark #merge-panel[data-layout="wide"] #merge-menu-pane{border-right-color:#475569;}',
      '#merge-panel[data-layout="wide"] #merge-list-pane{overflow:hidden;}',
      '#merge-list>.merge-list-item+ .merge-list-item{margin-top:8px;}',
      '#merge-panel[data-list-density="85"] #merge-list>.merge-list-item{padding:6px;gap:6px;border-radius:7px;}',
      '#merge-panel[data-list-density="85"] #merge-list>.merge-list-item+ .merge-list-item{margin-top:5px;}',
      '#merge-panel[data-list-density="85"] .merge-list-title{font-size:12px;line-height:16px;}',
      '#merge-panel[data-list-density="85"] .merge-list-path{font-size:9px;line-height:12px;}',
      '#merge-panel[data-list-density="85"] .merge-list-icon{width:14px;height:14px;}',
      '#merge-panel[data-list-density="70"] #merge-list>.merge-list-item{padding:4px;gap:4px;border-radius:6px;}',
      '#merge-panel[data-list-density="70"] #merge-list>.merge-list-item+ .merge-list-item{margin-top:3px;}',
      '#merge-panel[data-list-density="70"] .merge-list-title{font-size:11px;line-height:14px;}',
      '#merge-panel[data-list-density="70"] .merge-list-path{display:none;}',
      '#merge-panel[data-list-density="70"] .merge-list-badge{font-size:8px;padding:1px 4px;}',
      '#merge-panel[data-list-density="70"] .merge-list-icon{width:12px;height:12px;}',
      '#merge-panel[data-list-density="70"] .merge-list-order button{padding:0;line-height:10px;}',
      '#merge-panel[data-fullscreen="1"]{border-radius:10px;}',
      '#merge-panel[data-fullscreen="1"] #merge-panel-header{cursor:default;}',
      '#merge-panel[data-fullscreen="1"] #merge-panel-resizer{display:none;}',
      '@media (max-width:719px){#merge-menu-pane{max-height:46%;overflow-y:auto;}#merge-list-pane{border-top:1px solid #e2e8f0;padding-top:12px;}.dark #merge-list-pane{border-top-color:#475569;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function updateMergeFullscreenButton() {
    var panel = getMergePanel();
    var button = document.getElementById('merge-fullscreen-button');
    if (!panel || !button) return;
    var fullscreen = panel.dataset.fullscreen === '1';
    button.title = fullscreen ? '전체화면 종료' : '전체화면';
    button.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
    button.innerHTML = '<i data-lucide="' + (fullscreen ? 'minimize-2' : 'maximize-2') + '" class="w-4 h-4"></i>' +
      '<span class="sr-only">' + (fullscreen ? '전체화면 종료' : '전체화면') + '</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function updateMergeLayoutMode() {
    var panel = getMergePanel();
    if (!panel) return;
    var width = panel.getBoundingClientRect().width || parseFloat(panel.style.width) || DEFAULT_PANEL_WIDTH;
    panel.dataset.layout = width >= WIDE_LAYOUT_MIN_WIDTH ? 'wide' : 'stacked';
  }

  function getMergeWorkspaceRect() {
    var toolbar = document.getElementById('toolbar');
    var workspace = toolbar && toolbar.parentElement;
    if (workspace && typeof workspace.getBoundingClientRect === 'function') {
      var rect = workspace.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        return {
          left: rect.left + 8,
          top: rect.top + 8,
          width: Math.max(104, rect.width - 16),
          height: Math.max(104, rect.height - 16)
        };
      }
    }
    return {
      left: 8,
      top: 8,
      width: Math.max(304, (window.innerWidth || 320) - 16),
      height: Math.max(344, (window.innerHeight || 360) - 16)
    };
  }

  function applyMergeFullscreenRect() {
    var panel = getMergePanel();
    if (!panel) return;
    var rect = getMergeWorkspaceRect();
    panel.style.position = 'fixed';
    panel.style.left = Math.round(rect.left) + 'px';
    panel.style.top = Math.round(rect.top) + 'px';
    panel.style.width = Math.round(rect.width) + 'px';
    panel.style.height = Math.round(rect.height) + 'px';
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
    panel.style.transform = 'none';
    requestAnimationFrame(updateMergeLayoutMode);
  }

  function toggleMergeFullscreen(force) {
    var panel = getMergePanel();
    if (!panel) return;
    var currentlyFullscreen = panel.dataset.fullscreen === '1';
    var nextFullscreen = typeof force === 'boolean' ? force : !currentlyFullscreen;
    if (nextFullscreen === currentlyFullscreen) return;

    if (nextFullscreen) {
      var rect = panel.getBoundingClientRect();
      mergePanelBeforeFullscreen = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      panel.dataset.fullscreen = '1';
      panel.dataset.userLayout = '1';
      applyMergeFullscreenRect();
    } else {
      panel.dataset.fullscreen = '0';
      var restore = mergePanelBeforeFullscreen || getDefaultPanelRect();
      mergePanelBeforeFullscreen = null;
      applyMergePanelRect(restore);
    }
    updateMergeFullscreenButton();
    updateMergeLayoutMode();
  }

  function getDb() {
    try { return (typeof db !== 'undefined') ? db : null; } catch (e) { return null; }
  }

  function showMergedDocInFileList() {
    try {
      localStorage.setItem('md_viewer_storage_source_tab', 'indb');
    } catch (_) {}
    try {
      currentStorageSourceTab = 'indb';
    } catch (_) {}
    try {
      if (typeof setStorageSourceTabToLocal === 'function') setStorageSourceTabToLocal('indb');
    } catch (_) {}
    try {
      if (typeof updateStorageSourceTabsUI === 'function') updateStorageSourceTabsUI();
    } catch (_) {}

    var searchInput = document.getElementById('db-search');
    if (searchInput) searchInput.value = '';
    if (typeof renderDBList === 'function') renderDBList();
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getFileExtension(name) {
    var match = String(name || '').toLowerCase().match(/(\.[^.\\/]+)$/);
    return match ? match[1] : '';
  }

  function isSupportedLocalMergeFile(file) {
    return ['.md', '.markdown', '.mdown', '.txt', '.html', '.htm', '.docx', '.pdf', '.csv', '.json']
      .indexOf(getFileExtension(file && file.name)) !== -1;
  }

  function setLocalImportStatus(message, isError) {
    var el = document.getElementById('merge-local-import-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'mt-2 text-[11px] leading-4 ' + (isError
      ? 'text-rose-600 dark:text-rose-300'
      : 'text-slate-500 dark:text-slate-400');
  }

  function decodeMergeText(arrayBuffer) {
    if (typeof decodeOpenedTextBytes === 'function') {
      return decodeOpenedTextBytes(arrayBuffer).text;
    }
    var bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      bytes = bytes.subarray(3);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function convertLocalMergeFile(file) {
    var extension = getFileExtension(file && file.name);
    if (extension === '.docx') {
      if (typeof loadOptionalScript !== 'function') throw new Error('DOCX 변환 모듈을 찾을 수 없습니다.');
      await loadOptionalScript('mammoth', function () {
        return !!window.mammoth && typeof window.mammoth.convertToHtml === 'function';
      });
      await loadOptionalScript('docxImport', function () {
        return !!window.DocxImport && typeof window.DocxImport.convert === 'function';
      });
      var mammothOptions = {};
      if (window.mammoth.images && typeof window.mammoth.images.imgElement === 'function') {
        mammothOptions.convertImage = window.mammoth.images.imgElement(async function (image) {
          var base64 = await image.read('base64');
          return { src: 'data:' + (image.contentType || 'image/png') + ';base64,' + base64 };
        });
      }
      var docxResult = await window.DocxImport.convert(await file.arrayBuffer(), {
        mammoth: window.mammoth,
        mammothOptions: mammothOptions
      });
      return String(docxResult && docxResult.value || '').trim();
    }

    if (extension === '.pdf') {
      if (typeof loadOptionalScript !== 'function') throw new Error('PDF 변환 모듈을 찾을 수 없습니다.');
      await loadOptionalScript('pdfJs', function () {
        return !!window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function';
      }, { module: true });
      await loadOptionalScript('pdfOpen', function () {
        return !!window.PdfOpen && typeof window.PdfOpen.convert === 'function';
      });
      var pdfResult = await window.PdfOpen.convert(await file.arrayBuffer(), {
        pdfjsLib: window.pdfjsLib,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', window.location.href).href
      });
      var markdown = String(pdfResult && pdfResult.markdown || '').trim();
      if (!markdown.replace(/<!--[\s\S]*?-->/g, '').trim()) {
        throw new Error('편집 가능한 텍스트가 없습니다. 스캔 PDF는 OCR이 필요합니다.');
      }
      return markdown;
    }

    return decodeMergeText(await file.arrayBuffer());
  }

  function updateMergeSourceUI() {
    var localButton = document.getElementById('merge-source-local');
    var inDbButton = document.getElementById('merge-source-indb');
    var localTools = document.getElementById('merge-local-import-tools');
    var activeClass = 'px-3 py-2 rounded-md border border-indigo-600 dark:border-indigo-400 bg-indigo-600 dark:bg-indigo-500 text-white dark:text-slate-950 text-sm font-bold';
    var idleClass = 'px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-bold';
    if (localButton) {
      localButton.className = mergeSourceMode === 'local' ? activeClass : idleClass;
      localButton.setAttribute('aria-selected', mergeSourceMode === 'local' ? 'true' : 'false');
    }
    if (inDbButton) {
      inDbButton.className = mergeSourceMode === 'indb' ? activeClass : idleClass;
      inDbButton.setAttribute('aria-selected', mergeSourceMode === 'indb' ? 'true' : 'false');
    }
    if (localTools) localTools.classList.toggle('hidden', mergeSourceMode !== 'local');
    updateMergeTargetUI();
  }

  function updateMergeTargetUI() {
    var localButton = document.getElementById('merge-target-local');
    var inDbButton = document.getElementById('merge-target-indb');
    var activeClass = 'px-2 py-1 rounded border border-indigo-600 dark:border-indigo-400 bg-indigo-600 dark:bg-indigo-500 text-white dark:text-slate-950 text-xs font-bold';
    var idleClass = 'px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold';
    if (localButton) {
      localButton.textContent = mergeLocalDirectoryName ? mergeLocalDirectoryName + ' 폴더' : '가져온 폴더';
      localButton.title = mergeLocalDirectoryName
        ? '가져온 ' + mergeLocalDirectoryName + ' 폴더에 결과 저장'
        : '가져온 폴더 또는 선택한 Local 폴더에 결과 저장';
      localButton.className = mergeTargetMode === 'local' ? activeClass : idleClass;
      localButton.setAttribute('aria-pressed', mergeTargetMode === 'local' ? 'true' : 'false');
    }
    if (inDbButton) {
      inDbButton.className = mergeTargetMode === 'indb' ? activeClass : idleClass;
      inDbButton.setAttribute('aria-pressed', mergeTargetMode === 'indb' ? 'true' : 'false');
    }
  }

  function switchMergeTarget(target) {
    mergeTargetMode = target === 'local' ? 'local' : 'indb';
    updateMergeTargetUI();
  }

  function switchMergeSource(source) {
    mergeSourceMode = source === 'local' ? 'local' : 'indb';
    mergeTargetMode = mergeSourceMode;
    mergeListState = mergeSourceMode === 'local' ? mergeLocalListState : mergeInDbListState;
    mergeListSearchQuery = '';
    mergeListSelectedOnly = false;
    mergeFocusedIndex = -1;
    var searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    updateMergeSourceUI();
    renderMergeList();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function toggleMergeCoverOptions(enabled) {
    var fields = document.getElementById('merge-cover-fields');
    if (fields) fields.classList.toggle('hidden', !enabled);
    if (!enabled) return;
    var nameInput = document.getElementById('merge-bundle-name');
    var titleInput = document.getElementById('merge-cover-title');
    if (titleInput && !titleInput.value && nameInput) titleInput.value = String(nameInput.value || '');
    var panel = getMergePanel();
    if (!panel || panel.dataset.fullscreen === '1') return;
    var workspace = getMergeWorkspaceRect();
    if (workspace.width < WIDE_LAYOUT_MIN_WIDTH) {
      toggleMergeFullscreen(true);
      return;
    }
    var rect = panel.getBoundingClientRect();
    var width = Math.min(840, workspace.width);
    var height = Math.min(Math.max(650, rect.height), workspace.height);
    applyMergePanelRect({
      left: workspace.left + Math.max(0, (workspace.width - width) / 2),
      top: workspace.top + Math.max(0, (workspace.height - height) / 2),
      width: width,
      height: height
    });
  }

  function openMergeLocalFiles() {
    var input = document.getElementById('merge-local-file-input');
    if (input) input.click();
  }

  async function collectMergeDirectoryFiles(directoryHandle, prefix, output) {
    for await (var entry of directoryHandle.entries()) {
      var name = entry[0];
      var handle = entry[1];
      var relativePath = prefix ? prefix + '/' + name : name;
      if (handle.kind === 'directory') {
        await collectMergeDirectoryFiles(handle, relativePath, output);
      } else if (handle.kind === 'file') {
        output.push({ file: await handle.getFile(), relativePath: relativePath, fileHandle: handle });
      }
    }
  }

  async function openMergeLocalFolder() {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        var descriptors = [];
        await collectMergeDirectoryFiles(handle, '', descriptors);
        mergeLocalDirectoryHandle = handle;
        mergeLocalDirectoryName = String(handle.name || '가져온');
        updateMergeTargetUI();
        await importMergeLocalFiles(descriptors, true, {
          directoryHandle: handle,
          directoryName: mergeLocalDirectoryName
        });
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        setLocalImportStatus('폴더를 불러올 수 없습니다: ' + (error && error.message ? error.message : error), true);
        toast('로컬 폴더를 불러오지 못했습니다.');
      }
      return;
    }
    var input = document.getElementById('merge-local-folder-input');
    if (input) input.click();
  }

  async function importMergeLocalFiles(fileList, fromFolder, directoryContext) {
    var allFiles = Array.prototype.slice.call(fileList || []).map(function (entry) {
      return entry && entry.file ? entry : {
        file: entry,
        relativePath: String(entry && (entry.webkitRelativePath || entry.name) || ''),
        fileHandle: null
      };
    });
    if (fromFolder) {
      if (directoryContext && directoryContext.directoryHandle) {
        mergeLocalDirectoryHandle = directoryContext.directoryHandle;
        mergeLocalDirectoryName = String(directoryContext.directoryName || mergeLocalDirectoryHandle.name || '가져온');
      } else {
        mergeLocalDirectoryHandle = null;
        var firstPath = String(allFiles[0] && allFiles[0].relativePath || '');
        mergeLocalDirectoryName = firstPath.indexOf('/') > 0 ? firstPath.split('/')[0] : '';
      }
      updateMergeTargetUI();
    }
    var supported = allFiles.filter(function (entry) { return isSupportedLocalMergeFile(entry.file); }).sort(function (a, b) {
      var aPath = String(a.relativePath || (a.file && a.file.name) || '');
      var bPath = String(b.relativePath || (b.file && b.file.name) || '');
      return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: 'base' });
    });
    var skipped = allFiles.length - supported.length;
    if (!supported.length) {
      setLocalImportStatus('지원되는 문서가 없습니다. md, txt, html, docx, pdf, csv, json 파일을 선택하세요.', true);
      toast('지원되는 로컬 문서가 없습니다.');
      return;
    }

    setLocalImportStatus((fromFolder ? '폴더' : '파일') + '에서 문서 ' + supported.length + '개를 불러오는 중입니다...', false);
    var imported = [];
    var failures = [];
    for (var i = 0; i < supported.length; i++) {
      var descriptor = supported[i];
      var file = descriptor.file;
      var relativePath = String(descriptor.relativePath || file.name || ('문서 ' + (i + 1)));
      setLocalImportStatus('변환 중 ' + (i + 1) + '/' + supported.length + ': ' + relativePath, false);
      try {
        var content = await convertLocalMergeFile(file);
        imported.push({
          id: 'local:' + relativePath + ':' + (file.size || 0) + ':' + (file.lastModified || 0),
          title: file.name || relativePath,
          displayPath: relativePath,
          extension: getFileExtension(file.name).replace(/^\./, '').toUpperCase() || 'FILE',
          content: content,
          checked: true,
          local: true,
          fileHandle: descriptor.fileHandle || null
        });
      } catch (error) {
        failures.push(relativePath + ': ' + (error && error.message ? error.message : error));
      }
    }

    imported.forEach(function (item) {
      var existingIndex = mergeLocalListState.findIndex(function (current) { return current.id === item.id; });
      if (existingIndex >= 0) mergeLocalListState[existingIndex] = item;
      else mergeLocalListState.push(item);
    });
    mergeListState = mergeLocalListState;
    renderMergeList();

    var message = imported.length + '개 문서를 불러왔습니다.';
    if (fromFolder && mergeLocalDirectoryName) {
      message += mergeLocalDirectoryHandle
        ? ' 결과를 ' + mergeLocalDirectoryName + ' 폴더에 직접 저장할 수 있습니다.'
        : ' 결과 저장 시 ' + mergeLocalDirectoryName + ' 폴더를 다시 선택해야 합니다.';
    }
    if (skipped) message += ' 지원하지 않는 파일 ' + skipped + '개는 제외했습니다.';
    if (failures.length) message += ' 변환 실패 ' + failures.length + '개.';
    setLocalImportStatus(message + (failures[0] ? ' ' + failures[0] : ''), failures.length > 0);
    toast(message);
  }

  function removeLegacyInlineMergeModal() {
    var existing = document.getElementById('merge-modal');
    if (existing && existing.getAttribute('data-source') !== 'merge-doc') {
      existing.remove();
    }
  }

  function bindMergeActionButton() {
    var button = document.getElementById('merge-bind-button');
    if (!button || button.dataset.mergeBound === '1') return;
    button.dataset.mergeBound = '1';
    button.addEventListener('click', function () {
      bindMerge().catch(function (error) {
        console.error('Document merge failed:', error);
        toast('문서 묶기에 실패했습니다: ' + (error && error.message ? error.message : error));
      });
    });
  }

  function bindMergeFullscreenButton() {
    var button = document.getElementById('merge-fullscreen-button');
    if (!button || button.dataset.mergeFullscreenBound === '1') return;
    button.dataset.mergeFullscreenBound = '1';
    button.addEventListener('click', function () { toggleMergeFullscreen(); });
  }

  async function ensureMergeModalLoaded() {
    removeLegacyInlineMergeModal();
    ensureMergeResponsiveStyles();
    if (document.getElementById('merge-modal')) {
      bindMergeActionButton();
      bindMergeFullscreenButton();
      updateMergeFullscreenButton();
      updateMergeLayoutMode();
      return true;
    }
    if (mergeModalReady) return mergeModalReady;

    mergeModalReady = (async function () {
      var slot = document.getElementById('merge-modal-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.id = 'merge-modal-slot';
        document.body.appendChild(slot);
      }
      try {
        var res = await fetch('./js/MergeDoc/merge-modal.html', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        slot.innerHTML = await res.text();
      } catch (err) {
        console.error('Failed to load merge modal html:', err);
        slot.innerHTML = MERGE_MODAL_FALLBACK_HTML;
      }
      bindMergeActionButton();
      bindMergeFullscreenButton();
      updateMergeFullscreenButton();
      updateMergeLayoutMode();
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return !!document.getElementById('merge-modal');
    })();

    return mergeModalReady;
  }

  function getDefaultPanelRect() {
    var workspace = getMergeWorkspaceRect();
    var width = Math.min(DEFAULT_PANEL_WIDTH, Math.max(300, workspace.width));
    var height = Math.min(DEFAULT_PANEL_HEIGHT, Math.max(320, workspace.height));
    return {
      left: workspace.left + Math.max(0, (workspace.width - width) / 2),
      top: workspace.top + Math.max(0, (workspace.height - height) / 2),
      width: width,
      height: height
    };
  }

  function clampPanelRect(rect) {
    var viewportW = Math.max(320, window.innerWidth || 0);
    var viewportH = Math.max(360, window.innerHeight || 0);
    var minW = Math.min(300, viewportW - 24);
    var minH = Math.min(320, viewportH - 24);
    var width = Math.max(minW, Math.min(Number(rect.width) || DEFAULT_PANEL_WIDTH, viewportW - 16));
    var height = Math.max(minH, Math.min(Number(rect.height) || DEFAULT_PANEL_HEIGHT, viewportH - 16));
    var left = Math.max(8, Math.min(Number(rect.left) || 8, viewportW - width - 8));
    var top = Math.max(8, Math.min(Number(rect.top) || 8, viewportH - height - 8));
    return { left: left, top: top, width: width, height: height };
  }

  function applyMergePanelRect(rect) {
    var panel = getMergePanel();
    if (!panel) return;
    var next = clampPanelRect(rect);
    panel.style.position = 'fixed';
    panel.style.left = Math.round(next.left) + 'px';
    panel.style.top = Math.round(next.top) + 'px';
    panel.style.width = Math.round(next.width) + 'px';
    panel.style.height = Math.round(next.height) + 'px';
    panel.style.maxWidth = 'calc(100vw - 16px)';
    panel.style.maxHeight = 'calc(100vh - 16px)';
    panel.style.transform = 'none';
    updateMergeLayoutMode();
  }

  function applyDefaultMergePanelLayout() {
    var panel = getMergePanel();
    if (!panel) return;
    if (panel.dataset.fullscreen === '1') {
      applyMergeFullscreenRect();
      return;
    }
    if (panel.dataset.userLayout === '1') {
      var rect = panel.getBoundingClientRect();
      applyMergePanelRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      return;
    }
    applyMergePanelRect(getDefaultPanelRect());
  }

  function updateMergeListDensityUI() {
    var panel = getMergePanel();
    var label = document.getElementById('merge-density-label');
    var smaller = document.getElementById('merge-density-smaller');
    var larger = document.getElementById('merge-density-larger');
    var count = document.getElementById('merge-list-count');
    if (panel) panel.dataset.listDensity = String(mergeListDensity);
    if (label) label.textContent = mergeListDensity + '%';
    if (smaller) smaller.disabled = mergeListDensity <= 70;
    if (larger) larger.disabled = mergeListDensity >= 100;
    if (count) {
      var selectedCount = mergeListState.filter(function (item) { return item.checked; }).length;
      count.textContent = mergeListState.length + '개 문서 · 선택 ' + selectedCount + '개';
    }
  }

  function setMergeListDensity(value) {
    var allowed = [70, 85, 100];
    var numeric = Number(value) || 100;
    mergeListDensity = allowed.reduce(function (best, current) {
      return Math.abs(current - numeric) < Math.abs(best - numeric) ? current : best;
    }, 100);
    try { localStorage.setItem('md_viewer_merge_list_density', String(mergeListDensity)); } catch (_) {}
    updateMergeListDensityUI();
  }

  function adjustMergeListDensity(direction) {
    var allowed = [70, 85, 100];
    var index = allowed.indexOf(mergeListDensity);
    if (index < 0) index = allowed.length - 1;
    setMergeListDensity(allowed[Math.max(0, Math.min(allowed.length - 1, index + (direction < 0 ? -1 : 1)))]);
  }

  function renderMergeList() {
    var listEl = document.getElementById('merge-list');
    var selectedOnlyBtn = document.getElementById('merge-selected-only-btn');
    if (!listEl) return;
    updateMergeMoveControls();
    updateMergeListDensityUI();

    if (selectedOnlyBtn) {
      selectedOnlyBtn.textContent = mergeListSelectedOnly ? '전체 보기' : '선택 보기';
      selectedOnlyBtn.className = mergeListSelectedOnly
        ? 'px-3 py-1.5 text-xs font-medium border border-indigo-600 dark:border-indigo-400 rounded-md text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
        : 'px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700';
    }

    if (!mergeListState.length) {
      listEl.innerHTML = mergeSourceMode === 'local'
        ? '<div class="py-6 text-center text-slate-500 dark:text-slate-400"><i data-lucide="folder-input" class="w-8 h-8 mx-auto mb-2 opacity-70"></i><p class="text-sm font-medium">불러온 로컬 문서가 없습니다.</p><p class="mt-1 text-xs">위의 파일 또는 폴더 불러오기를 사용하세요.</p></div>'
        : '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">inDB 루트 폴더에 문서가 없습니다.</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    var q = mergeListSearchQuery;
    var filtered = mergeListState
      .map(function (item, idx) { return { item: item, idx: idx }; })
      .filter(function (x) {
        var searchable = String(((x.item && x.item.title) || '') + ' ' + ((x.item && x.item.displayPath) || '')).toLowerCase();
        return (!mergeListSelectedOnly || x.item.checked) && (!q || searchable.indexOf(q) !== -1);
      });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">' +
        (mergeListSelectedOnly ? '선택된 문서가 없습니다.' : '검색 결과가 없습니다.') + '</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    listEl.innerHTML = filtered.map(function (x) {
      var title = (x.item && x.item.title) || '';
      var displayPath = (x.item && x.item.displayPath) || title;
      var sourceBadge = x.item && x.item.local ? (x.item.extension || 'Local') : 'inDB';
      var focused = x.idx === mergeFocusedIndex;
      return '' +
        '<div class="merge-list-item flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer" data-idx="' + x.idx + '" tabindex="0" role="option" aria-selected="' + (focused ? 'true' : 'false') + '" onclick="focusMergeItem(' + x.idx + ')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();focusMergeItem(' + x.idx + ')}"' + (focused ? ' style="outline:2px solid #6366f1;outline-offset:-2px"' : '') + '>' +
          '<i data-lucide="file-text" class="merge-list-icon w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0"></i>' +
          '<span class="flex-1 min-w-0" title="' + escapeHtml(displayPath) + '"><span class="merge-list-title block text-sm text-slate-700 dark:text-slate-100 truncate">' + escapeHtml(title) + '</span>' +
            (displayPath !== title ? '<span class="merge-list-path block text-[10px] text-slate-500 dark:text-slate-300 truncate">' + escapeHtml(displayPath) + '</span>' : '') + '</span>' +
          '<span class="merge-list-badge px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-300 shrink-0">' + escapeHtml(sourceBadge) + '</span>' +
          '<label class="flex items-center shrink-0 cursor-pointer">' +
            '<input type="checkbox" ' + (x.item.checked ? 'checked' : '') + ' onchange="toggleMergeItem(' + x.idx + ', this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600">' +
          '</label>' +
          '<div class="merge-list-order flex flex-col shrink-0">' +
            '<button type="button" onclick="event.stopPropagation();moveMergeItem(' + x.idx + ',-1)" class="p-0.5 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300" title="위로 이동"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
            '<button type="button" onclick="event.stopPropagation();moveMergeItem(' + x.idx + ',1)" class="p-0.5 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300" title="아래로 이동"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
          '</div>' +
          (x.item && x.item.local ? '<button type="button" onclick="removeMergeLocalItem(' + x.idx + ')" class="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 shrink-0" title="목록에서 제거"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>' : '') +
        '</div>';
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function bindMergePanelInteractions() {
    if (mergePanelInteractionsBound) return;
    var panel = getMergePanel();
    var header = getMergeHeader(panel);
    var resizer = getMergeResizer(panel);
    if (!panel || !header || !resizer) return;
    mergePanelInteractionsBound = true;

    header.style.touchAction = 'none';
    resizer.style.touchAction = 'none';

    header.addEventListener('pointerdown', function (e) {
      if (panel.dataset.fullscreen === '1') return;
      if (mergePanelResizing) return;
      var target = e.target;
      if (target && target.closest && target.closest('button,input,textarea,select,a,label')) return;
      var rect = panel.getBoundingClientRect();
      mergePanelDragging = true;
      mergePanelPointerId = e.pointerId;
      mergePanelDragOffsetX = e.clientX - rect.left;
      mergePanelDragOffsetY = e.clientY - rect.top;
      panel.dataset.userLayout = '1';
      try { header.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });

    resizer.addEventListener('pointerdown', function (e) {
      if (panel.dataset.fullscreen === '1') return;
      mergePanelResizing = true;
      mergePanelPointerId = e.pointerId;
      panel.dataset.userLayout = '1';
      try { resizer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('pointermove', function (e) {
      if (mergePanelPointerId !== null && e.pointerId !== mergePanelPointerId) return;
      var rect = panel.getBoundingClientRect();
      if (mergePanelDragging) {
        applyMergePanelRect({
          left: e.clientX - mergePanelDragOffsetX,
          top: e.clientY - mergePanelDragOffsetY,
          width: rect.width,
          height: rect.height
        });
        e.preventDefault();
        return;
      }
      if (mergePanelResizing) {
        applyMergePanelRect({
          left: rect.left,
          top: rect.top,
          width: e.clientX - rect.left,
          height: e.clientY - rect.top
        });
        e.preventDefault();
      }
    }, { passive: false });

    function stopPointer(e) {
      if (e && mergePanelPointerId !== null && e.pointerId !== mergePanelPointerId) return;
      try {
        if (mergePanelDragging) header.releasePointerCapture(e.pointerId);
        if (mergePanelResizing) resizer.releasePointerCapture(e.pointerId);
      } catch (_) {}
      mergePanelDragging = false;
      mergePanelResizing = false;
      mergePanelPointerId = null;
    }

    document.addEventListener('pointerup', stopPointer);
    document.addEventListener('pointercancel', stopPointer);
    if (typeof ResizeObserver === 'function' && !mergePanelResizeObserver) {
      mergePanelResizeObserver = new ResizeObserver(function () {
        updateMergeLayoutMode();
      });
      mergePanelResizeObserver.observe(panel);
    }
    var toolbar = document.getElementById('toolbar');
    var workspace = toolbar && toolbar.parentElement;
    if (workspace && typeof ResizeObserver === 'function' && !mergeWorkspaceResizeObserver) {
      mergeWorkspaceResizeObserver = new ResizeObserver(function () {
        if (panel.dataset.fullscreen === '1') applyMergeFullscreenRect();
      });
      mergeWorkspaceResizeObserver.observe(workspace);
    }
    window.addEventListener('resize', function () {
      var modal = document.getElementById('merge-modal');
      if (modal && !modal.classList.contains('hidden')) applyDefaultMergePanelLayout();
    });
  }

  async function openMergeModal() {
    var ok = await ensureMergeModalLoaded();
    if (!ok) return;
    var dbRef = getDb();
    var docs = [];
    if (dbRef) {
      docs = await new Promise(function (resolve) {
        var req = dbRef.transaction('documents', 'readonly').objectStore('documents').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    }

    var rootDocs = (docs || []).filter(function (d) {
      return d && d.folderId === 'root' && !d.mergeDocGenerated;
    });
    mergeInDbListState = rootDocs.map(function (d) { return { id: d.id, title: d.title, checked: true, local: false }; });
    mergeLocalListState = [];
    mergeLocalDirectoryHandle = null;
    mergeLocalDirectoryName = '';
    try {
      mergeSourceMode = currentStorageSourceTab === 'local' ? 'local' : 'indb';
    } catch (_) {
      mergeSourceMode = 'indb';
    }
    mergeTargetMode = mergeSourceMode;
    mergeListState = mergeSourceMode === 'local' ? mergeLocalListState : mergeInDbListState;
    mergeListSearchQuery = '';
    mergeListSelectedOnly = false;
    mergeFocusedIndex = -1;
    try {
      mergeListDensity = Number(localStorage.getItem('md_viewer_merge_list_density')) || 100;
    } catch (_) {
      mergeListDensity = 100;
    }

    var searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    var nameInput = document.getElementById('merge-bundle-name');
    if (nameInput) nameInput.value = '';
    var coverEnabled = document.getElementById('merge-cover-enabled');
    var tocEnabled = document.getElementById('merge-toc-enabled');
    if (coverEnabled) coverEnabled.checked = false;
    if (tocEnabled) tocEnabled.checked = false;
    toggleMergeCoverOptions(false);
    ['merge-cover-title', 'merge-cover-subtitle', 'merge-cover-author', 'merge-cover-institution'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    var coverDate = document.getElementById('merge-cover-date');
    if (coverDate) coverDate.value = new Date().toISOString().slice(0, 10);

    setLocalImportStatus('md, txt, html, docx, pdf, csv, json 파일을 여러 개 또는 폴더째 불러올 수 있습니다.', false);
    updateMergeSourceUI();
    renderMergeList();
    var modal = document.getElementById('merge-modal');
    if (modal) {
      bindMergePanelInteractions();
      modal.dataset.listDensity = String(mergeListDensity);
      modal.classList.remove('hidden');
      modal.style.display = 'block';
      var panel = getMergePanel();
      if (panel) {
        panel.dataset.fullscreen = '0';
        panel.dataset.userLayout = '0';
      }
      mergePanelBeforeFullscreen = null;
      applyDefaultMergePanelLayout();
      updateMergeFullscreenButton();
      updateMergeLayoutMode();
      updateMergeListDensityUI();
    }
  }

  function filterMergeList(query) {
    mergeListSearchQuery = String(query || '').trim().toLowerCase();
    renderMergeList();
  }

  function selectAllMergeItems() {
    var q = mergeListSearchQuery;
    mergeListState.forEach(function (item) {
      var match = !q || String(item.title || '').toLowerCase().indexOf(q) !== -1;
      if (match) item.checked = true;
    });
    renderMergeList();
  }

  function deselectAllMergeItems() {
    var q = mergeListSearchQuery;
    mergeListState.forEach(function (item) {
      var match = !q || String(item.title || '').toLowerCase().indexOf(q) !== -1;
      if (match) item.checked = false;
    });
    renderMergeList();
  }

  function toggleMergeItem(idx, checked) {
    if (mergeListState[idx]) mergeListState[idx].checked = !!checked;
    if (mergeListSelectedOnly) renderMergeList();
  }

  function updateMergeMoveControls() {
    var upButton = document.getElementById('merge-move-up-button');
    var downButton = document.getElementById('merge-move-down-button');
    var label = document.getElementById('merge-focused-label');
    var valid = mergeFocusedIndex >= 0 && mergeFocusedIndex < mergeListState.length;
    if (upButton) upButton.disabled = !valid || mergeFocusedIndex === 0;
    if (downButton) downButton.disabled = !valid || mergeFocusedIndex === mergeListState.length - 1;
    if (label) {
      label.textContent = valid
        ? (mergeFocusedIndex + 1) + '/' + mergeListState.length + ' ' + String(mergeListState[mergeFocusedIndex].title || '')
        : '목록에서 문서를 선택하세요';
      label.title = valid ? String(mergeListState[mergeFocusedIndex].displayPath || mergeListState[mergeFocusedIndex].title || '') : '';
    }
  }

  function focusMergeItem(idx) {
    if (idx < 0 || idx >= mergeListState.length) return;
    mergeFocusedIndex = idx;
    renderMergeList();
  }

  function moveFocusedMergeItem(dir) {
    if (mergeFocusedIndex < 0 || mergeFocusedIndex >= mergeListState.length) {
      toast('먼저 목록에서 이동할 문서를 선택하세요.');
      return;
    }
    moveMergeItem(mergeFocusedIndex, dir);
  }

  function moveMergeItem(idx, dir) {
    var next = idx + dir;
    mergeFocusedIndex = idx;
    if (next < 0 || next >= mergeListState.length) {
      updateMergeMoveControls();
      return;
    }
    var tmp = mergeListState[idx];
    mergeListState[idx] = mergeListState[next];
    mergeListState[next] = tmp;
    mergeFocusedIndex = next;
    renderMergeList();
  }

  function removeMergeLocalItem(idx) {
    if (mergeSourceMode !== 'local' || idx < 0 || idx >= mergeLocalListState.length) return;
    mergeLocalListState.splice(idx, 1);
    if (mergeFocusedIndex === idx) mergeFocusedIndex = -1;
    else if (mergeFocusedIndex > idx) mergeFocusedIndex -= 1;
    mergeListState = mergeLocalListState;
    setLocalImportStatus(mergeLocalListState.length
      ? '현재 로컬 문서 ' + mergeLocalListState.length + '개가 목록에 있습니다.'
      : '불러온 로컬 문서가 없습니다.', false);
    renderMergeList();
  }

  function toggleSelectedOnlyMergeView() {
    mergeListSelectedOnly = !mergeListSelectedOnly;
    renderMergeList();
  }

  function closeMergeModal() {
    var modal = document.getElementById('merge-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  function getMergeOutputFormat(selected, forceDocx) {
    return forceDocx || (selected.length && selected.every(function (item) {
      return String(item.extension || '').toUpperCase() === 'DOCX';
    })) ? 'docx' : 'md';
  }

  function getMergedDocxHtml(selected, contents) {
    return contents.map(function (content, index) {
      var label = selected[index] && (selected[index].displayPath || selected[index].title) || '';
      var extension = String(selected[index] && selected[index].extension || '').toUpperCase();
      var source = String(content || '');
      var html = source;
      if (extension !== 'DOCX' && extension !== 'HTML' && extension !== 'HTM' && !/<(?:h[1-6]|p|div|section|table|ul|ol|pre)\b/i.test(source)) {
        if (window.marked && typeof window.marked.parse === 'function') html = window.marked.parse(source);
        else html = '<pre>' + escapeHtml(source) + '</pre>';
      }
      return '<section data-merge-source="' + escapeHtml(label) + '">' + html + '</section>';
    }).join('<p></p>');
  }

  async function createMergedDocxBlob(html, options) {
    if (typeof loadOptionalScript !== 'function') throw new Error('DOCX 내보내기 모듈을 찾을 수 없습니다.');
    await loadOptionalScript('docxExport', function () {
      return !!window.DocxExport && typeof window.DocxExport.createBlob === 'function';
    });
    return window.DocxExport.createBlob({
      content: '',
      html: html,
      mergeCover: options && options.cover,
      includeToc: !!(options && options.includeToc),
      baseUrl: document.baseURI,
      resolveImage: typeof resolveDocxExportImage === 'function' ? resolveDocxExportImage : undefined
    });
  }

  function readMergeFrontMatter(bundleName) {
    var coverEnabled = !!(document.getElementById('merge-cover-enabled') || {}).checked;
    var tocEnabled = !!(document.getElementById('merge-toc-enabled') || {}).checked;
    function value(id) {
      var input = document.getElementById(id);
      return input ? String(input.value || '').trim() : '';
    }
    return {
      coverEnabled: coverEnabled,
      tocEnabled: tocEnabled,
      cover: coverEnabled ? {
        title: value('merge-cover-title') || bundleName,
        subtitle: value('merge-cover-subtitle'),
        author: value('merge-cover-author'),
        institution: value('merge-cover-institution'),
        date: value('merge-cover-date')
      } : null
    };
  }

  async function ensureMergeOutputDirectory() {
    if (mergeLocalDirectoryHandle) return mergeLocalDirectoryHandle;
    if (typeof window.showDirectoryPicker !== 'function') return null;
    try {
      var handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      mergeLocalDirectoryHandle = handle;
      mergeLocalDirectoryName = String(handle.name || '선택한');
      updateMergeTargetUI();
      return handle;
    } catch (error) {
      if (error && error.name === 'AbortError') return null;
      throw error;
    }
  }

  async function saveMergeBlobToDirectory(directoryHandle, fileName, blob) {
    var fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    var writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  function downloadMergeBlob(fileName, blob) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function bindMerge() {
    var dbRef = getDb();

    var nameInput = document.getElementById('merge-bundle-name');
    var bundleName = (nameInput && nameInput.value) ? String(nameInput.value).trim() : '';
    if (!bundleName) {
      toast('묶음 이름을 먼저 입력하세요.');
      if (nameInput) nameInput.focus();
      return;
    }

    var selected = mergeListState.filter(function (x) { return x.checked; });
    if (!selected.length) {
      toast('최소 1개 이상의 문서를 선택하세요.');
      return;
    }

    if (mergeSourceMode === 'indb' && !dbRef) {
      toast('inDB가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
      return;
    }

    var contents;
    if (mergeSourceMode === 'local') {
      contents = selected.map(function (item) { return String(item.content == null ? '' : item.content); });
    } else {
      var tx = dbRef.transaction('documents', 'readonly');
      contents = await Promise.all(selected.map(function (item) {
        return new Promise(function (resolve) {
          var req = tx.objectStore('documents').get(item.id);
          req.onsuccess = function () { resolve(req.result ? (req.result.content || '') : ''); };
          req.onerror = function () { resolve(''); };
        });
      }));
    }

    var frontMatter = readMergeFrontMatter(bundleName);
    var outputFormat = mergeSourceMode === 'local'
      ? getMergeOutputFormat(selected, frontMatter.coverEnabled || frontMatter.tocEnabled)
      : (frontMatter.coverEnabled || frontMatter.tocEnabled ? 'docx' : 'md');
    var mergedContent = outputFormat === 'docx'
      ? getMergedDocxHtml(selected, contents)
      : contents.join('\n\n---\n\n');
    var safeName = bundleName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(md|markdown|docx)$/i, '') || '문서 묶음';
    var outputFileName = safeName + '.' + outputFormat;
    var outputBlob = outputFormat === 'docx'
      ? await createMergedDocxBlob(mergedContent, { cover: frontMatter.cover, includeToc: frontMatter.tocEnabled })
      : new Blob([mergedContent], { type: 'text/markdown;charset=utf-8' });

    var newDoc = {
      id: 'doc_' + Date.now(),
      title: bundleName,
      content: mergedContent,
      folderId: 'root',
      mergeDocGenerated: true,
      mergeDocSource: mergeSourceMode,
      mergeDocOutputFormat: outputFormat,
      mergeDocFileName: outputFileName,
      mergeDocCover: frontMatter.cover,
      mergeDocIncludeToc: frontMatter.tocEnabled,
      mergeDocItems: selected.map(function (item) { return item.displayPath || item.title || ''; }),
      updatedAt: new Date()
    };
    if (outputFormat === 'docx') newDoc.mergeDocBlob = outputBlob;

    if (mergeTargetMode === 'local') {
      var directoryHandle = await ensureMergeOutputDirectory();
      if (directoryHandle) {
        await saveMergeBlobToDirectory(directoryHandle, outputFileName, outputBlob);
        toast('문서 묶음을 ' + mergeLocalDirectoryName + ' 폴더에 ' + outputFileName + '(으)로 저장했습니다.');
      } else if (typeof window.showDirectoryPicker !== 'function') {
        downloadMergeBlob(outputFileName, outputBlob);
        toast('이 브라우저는 폴더 직접 저장을 지원하지 않아 다운로드 폴더에 저장했습니다.');
      } else {
        toast('저장할 Local 폴더를 선택하지 않아 취소했습니다.');
        return;
      }
      closeMergeModal();
      return;
    }

    if (!dbRef) {
      toast('inDB가 아직 준비되지 않았습니다. 잠시 후 다시 시도하거나 결과 저장을 Local 파일로 선택하세요.');
      return;
    }

    var writeTx = dbRef.transaction('documents', 'readwrite');
    writeTx.objectStore('documents').add(newDoc);
    writeTx.oncomplete = function () {
      toast('문서 묶기가 완료되었습니다.');
      showMergedDocInFileList();
      closeMergeModal();
    };
    writeTx.onerror = function () {
      toast('문서 묶기 저장에 실패했습니다.');
    };
  }

  window.openMergeModal = openMergeModal;
  window.toggleMergeFullscreen = toggleMergeFullscreen;
  window.switchMergeSource = switchMergeSource;
  window.switchMergeTarget = switchMergeTarget;
  window.toggleMergeCoverOptions = toggleMergeCoverOptions;
  window.openMergeLocalFiles = openMergeLocalFiles;
  window.openMergeLocalFolder = openMergeLocalFolder;
  window.importMergeLocalFiles = importMergeLocalFiles;
  window.filterMergeList = filterMergeList;
  window.selectAllMergeItems = selectAllMergeItems;
  window.deselectAllMergeItems = deselectAllMergeItems;
  window.toggleMergeItem = toggleMergeItem;
  window.focusMergeItem = focusMergeItem;
  window.moveFocusedMergeItem = moveFocusedMergeItem;
  window.moveMergeItem = moveMergeItem;
  window.removeMergeLocalItem = removeMergeLocalItem;
  window.toggleSelectedOnlyMergeView = toggleSelectedOnlyMergeView;
  window.setMergeListDensity = setMergeListDensity;
  window.adjustMergeListDensity = adjustMergeListDensity;
  window.closeMergeModal = closeMergeModal;
  window.bindMerge = bindMerge;
  window.bindMergeDocuments = bindMerge;
  window.__sidebarLeftMergeApi = {
    openMergeModal: openMergeModal,
    toggleMergeFullscreen: toggleMergeFullscreen,
    switchMergeSource: switchMergeSource,
    switchMergeTarget: switchMergeTarget,
    importMergeLocalFiles: importMergeLocalFiles,
    filterMergeList: filterMergeList,
    selectAllMergeItems: selectAllMergeItems,
    deselectAllMergeItems: deselectAllMergeItems,
    toggleMergeItem: toggleMergeItem,
    focusMergeItem: focusMergeItem,
    moveFocusedMergeItem: moveFocusedMergeItem,
    moveMergeItem: moveMergeItem,
    toggleSelectedOnlyMergeView: toggleSelectedOnlyMergeView,
    setMergeListDensity: setMergeListDensity,
    adjustMergeListDensity: adjustMergeListDensity,
    closeMergeModal: closeMergeModal,
    bindMerge: bindMerge
  };
})();

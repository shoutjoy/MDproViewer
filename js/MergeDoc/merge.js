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
  var mergeModalReady = null;
  var mergePanelActive = null;
  var mergePanelInteractionsBound = false;
  var mergePanelDragging = false;
  var mergePanelResizing = false;
  var mergePanelPointerId = null;
  var mergePanelDragOffsetX = 0;
  var mergePanelDragOffsetY = 0;

  var DEFAULT_PANEL_WIDTH = 420;
  var DEFAULT_PANEL_HEIGHT = 560;
  var DEFAULT_PANEL_TOP = 152;
  var WIDE_LAYOUT_MIN_WIDTH = 720;
  var mergePanelBeforeFullscreen = null;
  var mergePanelResizeObserver = null;
  var MERGE_MODAL_FALLBACK_HTML = ''
    + '<div id="merge-modal" data-source="merge-doc" class="fixed inset-0 hidden z-[55] no-print pointer-events-none bg-transparent">'
    + '<div id="merge-panel" class="pointer-events-auto fixed bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-[min(420px,92vw)] h-[min(560px,78vh)] min-w-[300px] min-h-[320px] flex flex-col overflow-hidden">'
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
    + '<button type="button" id="merge-target-local" onclick="switchMergeTarget(\'local\')" class="px-2 py-1 rounded border text-xs font-bold">Local 파일</button>'
    + '<button type="button" id="merge-target-indb" onclick="switchMergeTarget(\'indb\')" class="px-2 py-1 rounded border text-xs font-bold">inDB</button>'
    + '</div></div>'
    + '<div class="flex gap-2 mb-3 shrink-0">'
    + '<input type="text" id="merge-bundle-name" placeholder="새로운 묶음 파일" class="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<button type="button" id="merge-bind-button" class="px-4 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-md text-sm font-bold border border-slate-700 dark:border-slate-300 hover:bg-slate-700 dark:hover:bg-slate-300">Bind</button>'
    + '</div></div><div id="merge-list-pane"><div class="mb-3 shrink-0 space-y-2">'
    + '<input type="text" id="merge-search-input" placeholder="문서 검색..." oninput="filterMergeList(this.value)" class="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<div class="grid grid-cols-3 gap-2">'
    + '<button type="button" onclick="selectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체선택</button>'
    + '<button type="button" onclick="deselectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체 해제</button>'
    + '<button type="button" id="merge-selected-only-btn" onclick="toggleSelectedOnlyMergeView()" class="px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700">선택 보기</button>'
    + '</div></div>'
    + '<div id="merge-list" class="flex-1 overflow-y-auto space-y-2 min-h-0 custom-scrollbar" aria-live="polite"></div>'
    + '</div></div>'
    + '<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 shrink-0"><button type="button" onclick="closeMergeModal()" class="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">취소</button></div>'
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
      '#merge-layout{display:flex;flex-direction:column;min-height:0;overflow:hidden;}',
      '#merge-menu-pane{flex:0 0 auto;min-width:0;}',
      '#merge-list-pane{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;}',
      '#merge-panel[data-layout="wide"] #merge-layout{display:grid;grid-template-columns:minmax(260px,32%) minmax(0,1fr);gap:16px;}',
      '#merge-panel[data-layout="wide"] #merge-menu-pane{overflow-y:auto;padding-right:16px;border-right:1px solid #e2e8f0;}',
      '.dark #merge-panel[data-layout="wide"] #merge-menu-pane{border-right-color:#475569;}',
      '#merge-panel[data-layout="wide"] #merge-list-pane{overflow:hidden;}',
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

  function applyMergeFullscreenRect() {
    var panel = getMergePanel();
    if (!panel) return;
    panel.style.position = 'fixed';
    panel.style.left = '8px';
    panel.style.top = '8px';
    panel.style.width = 'calc(100vw - 16px)';
    panel.style.height = 'calc(100vh - 16px)';
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
    var searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    updateMergeSourceUI();
    renderMergeList();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function openMergeLocalFiles() {
    var input = document.getElementById('merge-local-file-input');
    if (input) input.click();
  }

  function openMergeLocalFolder() {
    var input = document.getElementById('merge-local-folder-input');
    if (input) input.click();
  }

  async function importMergeLocalFiles(fileList, fromFolder) {
    var allFiles = Array.prototype.slice.call(fileList || []);
    var supported = allFiles.filter(isSupportedLocalMergeFile).sort(function (a, b) {
      var aPath = String(a.webkitRelativePath || a.name || '');
      var bPath = String(b.webkitRelativePath || b.name || '');
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
      var file = supported[i];
      var relativePath = String(file.webkitRelativePath || file.name || ('문서 ' + (i + 1)));
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
          local: true
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
    var viewportW = Math.max(320, window.innerWidth || 0);
    var viewportH = Math.max(360, window.innerHeight || 0);
    var width = Math.min(DEFAULT_PANEL_WIDTH, Math.max(300, viewportW - 24));
    var height = Math.min(DEFAULT_PANEL_HEIGHT, Math.max(320, viewportH - 24));
    var sidebar = document.getElementById('sidebar');
    var sidebarRect = sidebar && !sidebar.classList.contains('hidden') ? sidebar.getBoundingClientRect() : null;
    var sidebarRight = sidebarRect ? Math.max(0, sidebarRect.right) : 0;
    var left;

    if (viewportW <= 640) {
      left = Math.round((viewportW - width) / 2);
    } else {
      left = Math.max(12, Math.min(viewportW - width - 12, sidebarRight + 28));
    }

    return {
      left: left,
      top: Math.max(12, Math.min(DEFAULT_PANEL_TOP, viewportH - height - 12)),
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

  function renderMergeList() {
    var listEl = document.getElementById('merge-list');
    var selectedOnlyBtn = document.getElementById('merge-selected-only-btn');
    if (!listEl) return;

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
      return '' +
        '<div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-600" data-idx="' + x.idx + '">' +
          '<i data-lucide="file-text" class="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0"></i>' +
          '<span class="flex-1 min-w-0" title="' + escapeHtml(displayPath) + '"><span class="block text-sm text-slate-700 dark:text-slate-100 truncate">' + escapeHtml(title) + '</span>' +
            (displayPath !== title ? '<span class="block text-[10px] text-slate-500 dark:text-slate-300 truncate">' + escapeHtml(displayPath) + '</span>' : '') + '</span>' +
          '<span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-300 shrink-0">' + escapeHtml(sourceBadge) + '</span>' +
          '<label class="flex items-center shrink-0 cursor-pointer">' +
            '<input type="checkbox" ' + (x.item.checked ? 'checked' : '') + ' onchange="toggleMergeItem(' + x.idx + ', this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600">' +
          '</label>' +
          '<div class="flex flex-col shrink-0">' +
            '<button type="button" onclick="moveMergeItem(' + x.idx + ',-1)" class="p-0.5 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300" title="위로 이동"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
            '<button type="button" onclick="moveMergeItem(' + x.idx + ',1)" class="p-0.5 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300" title="아래로 이동"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
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
    try {
      mergeSourceMode = currentStorageSourceTab === 'local' ? 'local' : 'indb';
    } catch (_) {
      mergeSourceMode = 'indb';
    }
    mergeTargetMode = mergeSourceMode;
    mergeListState = mergeSourceMode === 'local' ? mergeLocalListState : mergeInDbListState;
    mergeListSearchQuery = '';
    mergeListSelectedOnly = false;

    var searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    var nameInput = document.getElementById('merge-bundle-name');
    if (nameInput) nameInput.value = '';

    setLocalImportStatus('md, txt, html, docx, pdf, csv, json 파일을 여러 개 또는 폴더째 불러올 수 있습니다.', false);
    updateMergeSourceUI();
    renderMergeList();
    var modal = document.getElementById('merge-modal');
    if (modal) {
      bindMergePanelInteractions();
      modal.classList.remove('hidden');
      modal.style.display = 'block';
      applyDefaultMergePanelLayout();
      updateMergeFullscreenButton();
      updateMergeLayoutMode();
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

  function moveMergeItem(idx, dir) {
    var next = idx + dir;
    if (next < 0 || next >= mergeListState.length) return;
    var tmp = mergeListState[idx];
    mergeListState[idx] = mergeListState[next];
    mergeListState[next] = tmp;
    renderMergeList();
  }

  function removeMergeLocalItem(idx) {
    if (mergeSourceMode !== 'local' || idx < 0 || idx >= mergeLocalListState.length) return;
    mergeLocalListState.splice(idx, 1);
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

    var newDoc = {
      id: 'doc_' + Date.now(),
      title: bundleName,
      content: contents.join('\n\n---\n\n'),
      folderId: 'root',
      mergeDocGenerated: true,
      mergeDocSource: mergeSourceMode,
      mergeDocItems: selected.map(function (item) { return item.displayPath || item.title || ''; }),
      updatedAt: new Date()
    };

    if (mergeTargetMode === 'local') {
      var safeName = bundleName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(md|markdown)$/i, '') || '문서 묶음';
      var blob = new Blob([newDoc.content], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeName + '.md';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('문서 묶음을 Local 파일로 저장했습니다.');
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
  window.openMergeLocalFiles = openMergeLocalFiles;
  window.openMergeLocalFolder = openMergeLocalFolder;
  window.importMergeLocalFiles = importMergeLocalFiles;
  window.filterMergeList = filterMergeList;
  window.selectAllMergeItems = selectAllMergeItems;
  window.deselectAllMergeItems = deselectAllMergeItems;
  window.toggleMergeItem = toggleMergeItem;
  window.moveMergeItem = moveMergeItem;
  window.removeMergeLocalItem = removeMergeLocalItem;
  window.toggleSelectedOnlyMergeView = toggleSelectedOnlyMergeView;
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
    moveMergeItem: moveMergeItem,
    toggleSelectedOnlyMergeView: toggleSelectedOnlyMergeView,
    closeMergeModal: closeMergeModal,
    bindMerge: bindMerge
  };
})();

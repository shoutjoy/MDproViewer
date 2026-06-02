(function () {
  'use strict';
  if (window.__mergeDocLoaded) return;
  window.__mergeDocLoaded = true;

  var mergeListState = [];
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
  var MERGE_MODAL_FALLBACK_HTML = ''
    + '<div id="merge-modal" data-source="merge-doc" class="fixed inset-0 hidden z-[55] no-print pointer-events-none bg-transparent">'
    + '<div id="merge-panel" class="pointer-events-auto fixed bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-[min(420px,92vw)] h-[min(560px,78vh)] min-w-[300px] min-h-[320px] flex flex-col overflow-hidden">'
    + '<div id="merge-panel-header" class="flex items-center justify-between mb-3 gap-2 cursor-move touch-none select-none shrink-0">'
    + '<h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><i data-lucide="layers" class="w-5 h-5"></i> 문서 묶기</h3>'
    + '<button type="button" onclick="closeMergeModal()" class="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Close</button>'
    + '</div>'
    + '<div class="flex gap-2 mb-3 shrink-0">'
    + '<input type="text" id="merge-bundle-name" placeholder="새로운 묶음 파일" class="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<button type="button" onclick="bindMerge()" class="px-4 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-md text-sm font-bold border border-slate-700 dark:border-slate-300 hover:bg-slate-700 dark:hover:bg-slate-300">Bind</button>'
    + '</div>'
    + '<div class="mb-3 shrink-0 space-y-2">'
    + '<input type="text" id="merge-search-input" placeholder="문서 검색..." oninput="filterMergeList(this.value)" class="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">'
    + '<div class="grid grid-cols-3 gap-2">'
    + '<button type="button" onclick="selectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체선택</button>'
    + '<button type="button" onclick="deselectAllMergeItems()" class="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">전체 해제</button>'
    + '<button type="button" id="merge-selected-only-btn" onclick="toggleSelectedOnlyMergeView()" class="px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700">선택 보기</button>'
    + '</div></div>'
    + '<div id="merge-list" class="flex-1 overflow-y-auto space-y-2 min-h-0 custom-scrollbar"></div>'
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

  function removeLegacyInlineMergeModal() {
    var existing = document.getElementById('merge-modal');
    if (existing && existing.getAttribute('data-source') !== 'merge-doc') {
      existing.remove();
    }
  }

  async function ensureMergeModalLoaded() {
    removeLegacyInlineMergeModal();
    if (document.getElementById('merge-modal')) return true;
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
  }

  function applyDefaultMergePanelLayout() {
    var panel = getMergePanel();
    if (!panel) return;
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
      listEl.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">루트 폴더에 문서가 없습니다.</p>';
      return;
    }

    var q = mergeListSearchQuery;
    var filtered = mergeListState
      .map(function (item, idx) { return { item: item, idx: idx }; })
      .filter(function (x) {
        var title = String((x.item && x.item.title) || '').toLowerCase();
        return (!mergeListSelectedOnly || x.item.checked) && (!q || title.indexOf(q) !== -1);
      });

    if (!filtered.length) {
      listEl.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">' +
        (mergeListSelectedOnly ? '선택된 문서가 없습니다.' : '검색 결과가 없습니다.') + '</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    listEl.innerHTML = filtered.map(function (x) {
      var title = (x.item && x.item.title) || '';
      return '' +
        '<div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600" data-idx="' + x.idx + '">' +
          '<i data-lucide="file-text" class="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0"></i>' +
          '<span class="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</span>' +
          '<label class="flex items-center shrink-0 cursor-pointer">' +
            '<input type="checkbox" ' + (x.item.checked ? 'checked' : '') + ' onchange="toggleMergeItem(' + x.idx + ', this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600">' +
          '</label>' +
          '<div class="flex flex-col shrink-0">' +
            '<button type="button" onclick="moveMergeItem(' + x.idx + ',-1)" class="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400" title="위로 이동"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
            '<button type="button" onclick="moveMergeItem(' + x.idx + ',1)" class="p-0.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400" title="아래로 이동"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
          '</div>' +
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
    window.addEventListener('resize', function () {
      var modal = document.getElementById('merge-modal');
      if (modal && !modal.classList.contains('hidden')) applyDefaultMergePanelLayout();
    });
  }

  async function openMergeModal() {
    var ok = await ensureMergeModalLoaded();
    if (!ok) return;
    var dbRef = getDb();
    if (!dbRef) return;

    var docs = await new Promise(function (resolve) {
      var req = dbRef.transaction('documents', 'readonly').objectStore('documents').getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { resolve([]); };
    });

    var rootDocs = (docs || []).filter(function (d) {
      return d && d.folderId === 'root' && !d.mergeDocGenerated;
    });
    mergeListState = rootDocs.map(function (d) { return { id: d.id, title: d.title, checked: true }; });
    mergeListSearchQuery = '';
    mergeListSelectedOnly = false;

    var searchInput = document.getElementById('merge-search-input');
    if (searchInput) searchInput.value = '';
    var nameInput = document.getElementById('merge-bundle-name');
    if (nameInput) nameInput.value = '';

    renderMergeList();
    var modal = document.getElementById('merge-modal');
    if (modal) {
      bindMergePanelInteractions();
      modal.classList.remove('hidden');
      modal.style.display = 'block';
      applyDefaultMergePanelLayout();
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
    if (!dbRef) return;

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

    var tx = dbRef.transaction('documents', 'readonly');
    var contents = await Promise.all(selected.map(function (item) {
      return new Promise(function (resolve) {
        var req = tx.objectStore('documents').get(item.id);
        req.onsuccess = function () { resolve(req.result ? (req.result.content || '') : ''); };
        req.onerror = function () { resolve(''); };
      });
    }));

    var newDoc = {
      id: 'doc_' + Date.now(),
      title: bundleName,
      content: contents.join('\n\n---\n\n'),
      folderId: 'root',
      mergeDocGenerated: true,
      updatedAt: new Date()
    };

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
  window.filterMergeList = filterMergeList;
  window.selectAllMergeItems = selectAllMergeItems;
  window.deselectAllMergeItems = deselectAllMergeItems;
  window.toggleMergeItem = toggleMergeItem;
  window.moveMergeItem = moveMergeItem;
  window.toggleSelectedOnlyMergeView = toggleSelectedOnlyMergeView;
  window.closeMergeModal = closeMergeModal;
  window.bindMerge = bindMerge;
  window.__sidebarLeftMergeApi = {
    openMergeModal: openMergeModal,
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

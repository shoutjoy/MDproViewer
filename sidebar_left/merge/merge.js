(function () {
  'use strict';
  if (window.__sidebarLeftMergeLoaded) return;
  window.__sidebarLeftMergeLoaded = true;

  var mergeListState = [];
  var mergeListSearchQuery = '';
  var mergeListSelectedOnly = false;
  var mergeModalReady = null;
  var mergePanelDragBound = false;
  var mergePanelDragging = false;
  var mergePanelDragOffsetX = 0;
  var mergePanelDragOffsetY = 0;
  var mergePanelResizeBound = false;
  var mergePanelResizing = false;
  var mergePanelActive = null;

  function getMergePanel() {
    if (mergePanelActive && document.body.contains(mergePanelActive)) return mergePanelActive;
    var panel = document.getElementById('merge-panel');
    if (!panel) {
      var modal = document.getElementById('merge-modal');
      if (modal) panel = modal.querySelector('div');
    }
    if (panel) {
      mergePanelActive = panel;
      if (!panel.id) panel.id = 'merge-panel';
    }
    return panel;
  }

  function getMergeHeader(panel) {
    if (!panel) return null;
    var header = document.getElementById('merge-panel-header');
    if (!header) {
      header = panel.querySelector('h3');
      if (header && !header.id) header.id = 'merge-panel-header';
    }
    return header;
  }

  function ensureMergeResizer(panel) {
    if (!panel) return null;
    var resizer = document.getElementById('merge-panel-resizer');
    if (!resizer) {
      resizer = document.createElement('div');
      resizer.id = 'merge-panel-resizer';
      resizer.style.position = 'absolute';
      resizer.style.right = '0';
      resizer.style.bottom = '0';
      resizer.style.width = '14px';
      resizer.style.height = '14px';
      resizer.style.cursor = 'nwse-resize';
      resizer.style.userSelect = 'none';
      resizer.style.opacity = '0.8';
      resizer.style.background = 'linear-gradient(135deg, transparent 45%, #94a3b8 46%, #94a3b8 54%, transparent 55%)';
      panel.appendChild(resizer);
    }
    return resizer;
  }

  function getDb() {
    try { return (typeof db !== 'undefined') ? db : null; } catch (e) { return null; }
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

  async function ensureMergeModalLoaded() {
    var existing = document.getElementById('merge-modal');
    // Prefer built-in modal already present in index.html.
    // Do not remove it; this avoids no-op when external fragment fetch fails.
    if (existing) return true;
    if (mergeModalReady) return mergeModalReady;
    mergeModalReady = (async function () {
      var slot = document.getElementById('merge-modal-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.id = 'merge-modal-slot';
        document.body.appendChild(slot);
      }
      try {
        var res = await fetch('./sidebar_left/merge/merge-modal.html', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        slot.innerHTML = await res.text();
      } catch (err) {
        console.error('Failed to load merge modal html:', err);
        toast('Merge 창을 불러오지 못했습니다.');
        return false;
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return !!document.getElementById('merge-modal');
    })();
    return mergeModalReady;
  }

  function renderMergeList() {
    var listEl = document.getElementById('merge-list');
    var selectedOnlyBtn = document.getElementById('merge-selected-only-btn');
    if (!listEl) return;

    if (selectedOnlyBtn) {
      selectedOnlyBtn.textContent = mergeListSelectedOnly ? '전체 보기' : '선택 보기';
      selectedOnlyBtn.className = mergeListSelectedOnly
        ? 'flex-1 px-3 py-1.5 text-xs font-medium border border-indigo-600 dark:border-indigo-400 rounded-md text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
        : 'flex-1 px-3 py-1.5 text-xs font-medium border border-slate-900 dark:border-slate-100 rounded-md text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700';
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
    if (mergePanelDragBound && mergePanelResizeBound) return;
    var panel = getMergePanel();
    var header = getMergeHeader(panel);
    var resizer = ensureMergeResizer(panel);
    if (!panel || !header || !resizer) return;

    if (!mergePanelDragBound) {
      mergePanelDragBound = true;
      header.addEventListener('mousedown', function (e) {
        if (mergePanelResizing) return;
        var target = e.target;
        if (target && target.closest && target.closest('button,input,textarea,select,a,label')) return;
        var rect = panel.getBoundingClientRect();
        mergePanelDragging = true;
        mergePanelDragOffsetX = e.clientX - rect.left;
        mergePanelDragOffsetY = e.clientY - rect.top;
        panel.style.transform = 'none';
      });
      document.addEventListener('mousemove', function (e) {
        if (!mergePanelDragging || mergePanelResizing) return;
        var x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - mergePanelDragOffsetX));
        var y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - mergePanelDragOffsetY));
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
      });
      document.addEventListener('mouseup', function () {
        mergePanelDragging = false;
      });
    }

    if (!mergePanelResizeBound) {
      mergePanelResizeBound = true;
      resizer.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        mergePanelResizing = true;
      });
      document.addEventListener('mousemove', function (e) {
        if (!mergePanelResizing) return;
        var rect = panel.getBoundingClientRect();
        var minW = 420;
        var minH = 320;
        var maxW = Math.max(minW, window.innerWidth - rect.left - 8);
        var maxH = Math.max(minH, window.innerHeight - rect.top - 8);
        var nextW = Math.max(minW, Math.min(maxW, e.clientX - rect.left));
        var nextH = Math.max(minH, Math.min(maxH, e.clientY - rect.top));
        panel.style.width = Math.round(nextW) + 'px';
        panel.style.height = Math.round(nextH) + 'px';
      });
      document.addEventListener('mouseup', function () {
        mergePanelResizing = false;
      });
    }
  }

  function resetMergePanelPositionIfNeeded() {
    var panel = getMergePanel();
    if (!panel) return;
    panel.style.position = 'fixed';
    panel.style.maxWidth = '96vw';
    panel.style.maxHeight = '92vh';
    panel.style.overflow = 'hidden';
    var header = getMergeHeader(panel);
    if (header) header.style.cursor = 'move';
    if (!panel.style.left || !panel.style.top) {
      panel.style.left = Math.max(12, Math.round((window.innerWidth - panel.offsetWidth) / 2)) + 'px';
      panel.style.top = '80px';
      panel.style.transform = 'none';
    }
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

    var rootDocs = (docs || []).filter(function (d) { return d && d.folderId === 'root'; });
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
      resetMergePanelPositionIfNeeded();
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
      updatedAt: new Date()
    };

    var writeTx = dbRef.transaction('documents', 'readwrite');
    writeTx.objectStore('documents').add(newDoc);
    writeTx.oncomplete = function () {
      toast('문서 묶기가 완료되었습니다.');
      if (typeof renderDBList === 'function') renderDBList();
      closeMergeModal();
      try {
        if (typeof isSidebarHidden !== 'undefined' && isSidebarHidden && typeof toggleSidebarVisibility === 'function') {
          toggleSidebarVisibility();
        }
      } catch (e) {}
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

(function (global) {
  'use strict';

  var refs = [];
  var selectedIds = new Set();
  var inputMode = 'blank';
  var initialized = false;
  var deps = { dbGetter: null, getEditor: null, showToast: null };

  function toast(msg) {
    if (typeof deps.showToast === 'function') deps.showToast(msg);
  }

  function q(id) { return document.getElementById(id); }

  function getDb() {
    return typeof deps.dbGetter === 'function' ? deps.dbGetter() : null;
  }

  function nowIso() { return new Date().toISOString(); }

  function safeText(v) { return String(v || '').trim(); }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseAuthorYear(text) {
    var raw = safeText(text);
    var yearMatch = raw.match(/(19|20)\d{2}/);
    var year = yearMatch ? yearMatch[0] : 'n.d.';
    var firstPart = raw.split(/[.]/)[0] || raw;
    firstPart = firstPart.replace(/\([^)]*\)/g, '').trim();
    if (!firstPart) firstPart = 'Unknown';
    return { author: firstPart, year: year };
  }

  function buildLabel(item) {
    var ay = parseAuthorYear(item.text);
    return ay.author + ', ' + ay.year;
  }

  async function readAllRefs() {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) return [];
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readonly');
        var req = tx.objectStore('scholar_refs').getAll();
        req.onsuccess = function () {
          var out = Array.isArray(req.result) ? req.result : [];
          out.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
          resolve(out);
        };
        req.onerror = function () { reject(req.error || new Error('Failed to load references')); };
      } catch (e) { reject(e); }
    });
  }

  async function addRefs(items) {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) throw new Error('DB is not ready');
    if (!Array.isArray(items) || !items.length) return 0;
    var current = await readAllRefs();
    var dedupe = new Set(current.map(function (x) { return safeText(x.text).toLowerCase(); }));
    var toAdd = items.filter(function (t) {
      var key = safeText(t).toLowerCase();
      if (!key) return false;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    });
    if (!toAdd.length) return 0;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        var store = tx.objectStore('scholar_refs');
        toAdd.forEach(function (text) {
          var ay = parseAuthorYear(text);
          store.add({
            id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            author: ay.author,
            year: ay.year,
            text: safeText(text),
            createdAt: nowIso()
          });
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Failed to save references')); };
      } catch (e) { reject(e); }
    });
    return toAdd.length;
  }

  async function removeRef(id) {
    var db = getDb();
    if (!db || !id || !db.objectStoreNames.contains('scholar_refs')) return;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        tx.objectStore('scholar_refs').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Delete failed')); };
      } catch (e) { reject(e); }
    });
  }

  async function clearRefs() {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) return;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        tx.objectStore('scholar_refs').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Clear failed')); };
      } catch (e) { reject(e); }
    });
  }

  function splitInputText(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n');
    if (inputMode === 'line') return text.split('\n').map(safeText).filter(Boolean);
    return text.split(/\n\s*\n+/).map(safeText).filter(Boolean);
  }

  function getSelectedRefs() {
    return refs.filter(function (r) { return selectedIds.has(String(r.id)); });
  }

  function setCountText() {
    var c = q('scholarref-selected-count');
    if (c) c.textContent = selectedIds.size + '개 선택됨';
    var t = q('scholarref-total-count');
    if (t) t.textContent = refs.length + '건';
  }

  function renderSavedList() {
    var box = q('scholarref-saved-list');
    if (!box) return;
    if (!refs.length) {
      box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">저장된 참고문헌이 없습니다.</div></div>';
      setCountText();
      return;
    }
    var html = '';
    refs.forEach(function (r) {
      html += '<div class="scholarref-item">';
      html += '<div><div class="scholarref-item-title">' + escapeHtml(buildLabel(r)) + '</div>';
      html += '<div class="scholarref-item-text">' + escapeHtml(r.text) + '</div></div>';
      html += '<div class="scholarref-item-actions"><button type="button" class="scholarref-danger" onclick="deleteScholarRefItem(\'' + String(r.id).replace(/'/g, "\\'") + '\')">삭제</button></div>';
      html += '</div>';
    });
    box.innerHTML = html;
    setCountText();
  }

  function renderSelectionList() {
    var box = q('scholarref-select-list');
    if (!box) return;
    var keyword = safeText((q('scholarref-search') || {}).value).toLowerCase();
    var filtered = refs.filter(function (r) {
      if (!keyword) return true;
      var blob = (r.author + ' ' + r.year + ' ' + r.text).toLowerCase();
      return blob.indexOf(keyword) >= 0;
    });
    if (!filtered.length) {
      box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">표시할 참고문헌이 없습니다.</div></div>';
      setCountText();
      return;
    }
    var html = '';
    filtered.forEach(function (r) {
      var checked = selectedIds.has(String(r.id)) ? ' checked' : '';
      html += '<label class="scholarref-item">';
      html += '<input type="checkbox" ' + checked + ' onchange="toggleScholarRefPick(\'' + String(r.id).replace(/'/g, "\\'") + '\', this.checked)">';
      html += '<div><div class="scholarref-item-title">' + escapeHtml(buildLabel(r)) + '</div>';
      html += '<div class="scholarref-item-text">' + escapeHtml(r.text) + '</div></div>';
      html += '</label>';
    });
    box.innerHTML = html;
    setCountText();
  }

  function buildReferencesSection(items) {
    if (!items.length) return '';
    var lines = items.map(function (r, i) { return (i + 1) + '. ' + r.text; }).join('\n');
    return '\n\n## References\n' + lines + '\n';
  }

  function insertTextAtCursor(text) {
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) return false;
    ta.focus();
    var s = ta.selectionStart;
    var e = ta.selectionEnd;
    ta.setSelectionRange(s, e);
    document.execCommand('insertText', false, text);
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    return true;
  }

  async function reloadRefsAndRender() {
    refs = await readAllRefs();
    var known = new Set(refs.map(function (r) { return String(r.id); }));
    Array.from(selectedIds).forEach(function (id) { if (!known.has(id)) selectedIds.delete(id); });
    renderSelectionList();
    renderSavedList();
  }

  async function init(opts) {
    deps.dbGetter = opts && opts.dbGetter;
    deps.getEditor = opts && opts.getEditor;
    deps.showToast = opts && opts.showToast;
    if (initialized) return;
    initialized = true;
    await reloadRefsAndRender();
  }

  function togglePanel() {
    var panel = q('scholarref-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) reloadRefsAndRender().catch(function () {});
  }

  function switchTab(i) {
    var tabs = document.querySelectorAll('.scholarref-tab');
    var contents = document.querySelectorAll('.scholarref-tab-content');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    contents.forEach(function (c) { c.classList.remove('active'); });
    var tab = document.querySelector('.scholarref-tab[data-tab="' + i + '"]');
    var content = q('scholarref-tab-' + i);
    if (tab) tab.classList.add('active');
    if (content) content.classList.add('active');
  }

  function setInputMode(mode) {
    inputMode = mode === 'line' ? 'line' : 'blank';
    var b = q('scholarref-method-blank');
    var l = q('scholarref-method-line');
    if (b) b.classList.toggle('active', inputMode === 'blank');
    if (l) l.classList.toggle('active', inputMode === 'line');
    var s = q('scholarref-status');
    if (s) s.textContent = inputMode === 'blank'
      ? '현재: 빈 줄 구분 — 항목 사이에 빈 줄 하나를 넣어 구분하세요.'
      : '현재: 엔터 구분 — 각 줄을 하나의 참고문헌으로 처리합니다.';
  }

  async function applyInput() {
    var ta = q('scholarref-input');
    if (!ta) return;
    var items = splitInputText(ta.value);
    if (!items.length) {
      toast('붙여넣은 참고문헌이 없습니다.');
      return;
    }
    try {
      var count = await addRefs(items);
      await reloadRefsAndRender();
      toast(count > 0 ? (count + '건 저장했습니다.') : '중복을 제외하고 저장할 항목이 없습니다.');
    } catch (e) {
      toast('참고문헌 저장 실패: ' + (e && e.message ? e.message : e));
    }
  }

  function clearInput() {
    var ta = q('scholarref-input');
    if (ta) ta.value = '';
  }

  function openTxtImport() {
    var file = q('scholarref-txt-file');
    if (file) file.click();
  }

  async function importTxt(ev) {
    var file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;
    try {
      var text = await file.text();
      var ta = q('scholarref-input');
      if (ta) ta.value = text;
      toast('TXT 불러오기 완료');
    } catch (e) {
      toast('TXT 불러오기 실패');
    } finally {
      if (ev && ev.target) ev.target.value = '';
    }
  }

  function togglePick(id, checked) {
    var key = String(id);
    if (checked) selectedIds.add(key);
    else selectedIds.delete(key);
    setCountText();
  }

  function selectAllFiltered() {
    var keyword = safeText((q('scholarref-search') || {}).value).toLowerCase();
    refs.forEach(function (r) {
      var blob = (r.author + ' ' + r.year + ' ' + r.text).toLowerCase();
      if (!keyword || blob.indexOf(keyword) >= 0) selectedIds.add(String(r.id));
    });
    renderSelectionList();
  }

  function clearSelection() {
    selectedIds.clear();
    renderSelectionList();
  }

  function buildCitationText(items, opts) {
    if (!items.length) return '';
    if (opts.numberLink) {
      return items.map(function (_, i) { return '[' + (i + 1) + ']'; }).join(' ');
    }
    if (opts.format === 'narrative') {
      return items.map(function (r) {
        var ay = parseAuthorYear(r.text);
        return ay.author + ' (' + ay.year + ')';
      }).join('; ');
    }
    return '(' + items.map(function (r) {
      var ay = parseAuthorYear(r.text);
      return ay.author + ', ' + ay.year;
    }).join('; ') + ')';
  }

  function insertSelected() {
    var picked = getSelectedRefs();
    if (!picked.length) {
      toast('삽입할 참고문헌을 선택해 주세요.');
      return;
    }
    var format = ((q('scholarref-insert-format') || {}).value) || 'inline';
    var appendSection = !!((q('scholarref-append-section') || {}).checked);
    var numberLink = !!((q('scholarref-number-link') || {}).checked);
    var text = buildCitationText(picked, { format: format, numberLink: numberLink });
    if (appendSection) text += buildReferencesSection(picked);
    if (!insertTextAtCursor(text)) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    toast('선택한 인용을 삽입했습니다.');
  }

  function insertAllSection() {
    if (!refs.length) {
      toast('저장된 참고문헌이 없습니다.');
      return;
    }
    if (!insertTextAtCursor(buildReferencesSection(refs))) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    toast('참고문헌 섹션을 삽입했습니다.');
  }

  function download(name, body, mime) {
    var blob = new Blob([body], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 300);
  }

  function downloadTxt() {
    var body = refs.map(function (r) { return r.text; }).join('\n\n');
    download('scholar_references.txt', body, 'text/plain;charset=utf-8');
  }

  function downloadMd() {
    var body = buildReferencesSection(refs).replace(/^\n+/, '');
    download('scholar_references.md', body, 'text/markdown;charset=utf-8');
  }

  async function deleteOne(id) {
    try {
      await removeRef(id);
      selectedIds.delete(String(id));
      await reloadRefsAndRender();
      toast('삭제했습니다.');
    } catch (e) {
      toast('삭제 실패');
    }
  }

  async function clearAll() {
    if (!refs.length) return;
    if (!window.confirm('저장된 참고문헌을 모두 삭제할까요?')) return;
    try {
      await clearRefs();
      selectedIds.clear();
      await reloadRefsAndRender();
      toast('전체 삭제했습니다.');
    } catch (e) {
      toast('전체 삭제 실패');
    }
  }

  global.ScholarRef = {
    init: init,
    togglePanel: togglePanel,
    switchTab: switchTab,
    setInputMode: setInputMode,
    applyInput: applyInput,
    clearInput: clearInput,
    openTxtImport: openTxtImport,
    importTxt: importTxt,
    renderSelectionList: renderSelectionList,
    togglePick: togglePick,
    selectAllFiltered: selectAllFiltered,
    clearSelection: clearSelection,
    insertSelected: insertSelected,
    insertAllSection: insertAllSection,
    downloadTxt: downloadTxt,
    downloadMd: downloadMd,
    deleteOne: deleteOne,
    clearAll: clearAll
  };
})(window);

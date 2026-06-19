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

  function stripHtmlTags(v) {
    return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeRefText(v) {
    return safeText(v).replace(/\s+/g, ' ').toLowerCase();
  }

  function anchorFromRefText(text) {
    var raw = safeText(text).toLowerCase();
    var slug = raw.replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    if (!slug) slug = 'ref';
    var hash = 0;
    for (var i = 0; i < raw.length; i++) hash = ((hash * 31) + raw.charCodeAt(i)) >>> 0;
    return 'schref-' + slug + '-' + hash.toString(16);
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

  function extractReferencesSectionFromMarkdown(mdText) {
    var src = String(mdText || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return '';

    var headingRe = /^##\s*(References|참고문헌)\s*$/im;
    var m = headingRe.exec(src);
    if (!m) return '';

    var start = m.index + m[0].length;
    var tail = src.slice(start);
    var nextHeadingRe = /\n##\s+/g;
    nextHeadingRe.lastIndex = 0;
    var n = nextHeadingRe.exec(tail);
    var section = n ? tail.slice(0, n.index) : tail;
    return section.trim();
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
      html += '<div class="scholarref-item-actions">'
        + '<button type="button" class="scholarref-secondary" onclick="pushScholarRefItemToGithub(\'' + String(r.id).replace(/'/g, "\\'") + '\')">push</button>'
        + '<button type="button" class="scholarref-danger" onclick="deleteScholarRefItem(\'' + String(r.id).replace(/'/g, "\\'") + '\')">삭제</button>'
        + '</div>';
      html += '</div>';
    });
    box.innerHTML = html;
    setCountText();
  }

  function ensureGithubTabUi() {
    var savedActions = q('scholarref-tab-2') ? q('scholarref-tab-2').querySelector('.scholarref-row .scholarref-row') : null;
    if (savedActions && !q('scholarref-push-all-github-btn')) {
      var pushAllBtn = document.createElement('button');
      pushAllBtn.type = 'button';
      pushAllBtn.id = 'scholarref-push-all-github-btn';
      pushAllBtn.className = 'scholarref-primary';
      pushAllBtn.textContent = '전체 push';
      pushAllBtn.onclick = function () { pushGithubSavedList(); };
      var danger = savedActions.querySelector('.scholarref-danger');
      if (danger) savedActions.insertBefore(pushAllBtn, danger);
      else savedActions.appendChild(pushAllBtn);
    }
    if (q('scholarref-tab-3')) return;
    var menu = document.querySelector('.scholarref-tab-menu');
    if (menu && !document.querySelector('.scholarref-tab[data-tab="3"]')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scholarref-tab';
      btn.setAttribute('data-tab', '3');
      btn.textContent = '저장목록(github)';
      btn.onclick = function () { switchTab(3); };
      menu.appendChild(btn);
    }
    var panel = q('scholarref-panel');
    if (!panel) return;
    var content = document.createElement('div');
    content.id = 'scholarref-tab-3';
    content.className = 'scholarref-tab-content';
    content.innerHTML = ''
      + '<div class="scholarref-row scholarref-between">'
      + '<div class="scholarref-count">GitHub Reference 폴더</div>'
      + '<div class="scholarref-row">'
      + '<button type="button" class="scholarref-primary" onclick="pullScholarRefsFromGithub()">pull</button>'
      + '<button type="button" class="scholarref-secondary" onclick="refreshScholarRefGithubList()">목록 새로고침</button>'
      + '</div></div>'
      + '<p id="scholarref-github-status" class="scholarref-help">GitHub 저장소의 Reference 폴더에 있는 저장목록입니다. pull하면 로컬 저장 목록에 병합됩니다.</p>'
      + '<div id="scholarref-github-list" class="scholarref-list"></div>';
    panel.appendChild(content);
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

  function buildReferencesSectionFromTexts(texts, opts) {
    if (!texts.length) return '';
    var withAnchors = !!(opts && opts.withAnchors);
    var blocks = texts.map(function (t) {
      var clean = safeText(t);
      if (!withAnchors) return clean;
      var anchor = anchorFromRefText(clean);
      return '<div id="' + anchor + '"></div>\n' + clean;
    }).join('\n\n');
    return '\n\n## References\n\n' + blocks + '\n';
  }

  function encodeUtf8Base64(text) {
    var bytes = new TextEncoder().encode(String(text || ''));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeGithubBase64Text(encoded) {
    var clean = String(encoded || '').replace(/\n/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function sanitizeGithubFileName(value) {
    var s = safeText(value).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
    return s || 'reference';
  }

  function githubHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: 'token ' + String(token || '').trim(),
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function githubRequest(url, options, token) {
    var opts = options || {};
    var headers = Object.assign({}, githubHeaders(token), opts.headers || {});
    if (opts.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    var res = await fetch(url, Object.assign({}, opts, { headers: headers }));
    if (!res.ok) {
      var msg = 'GitHub API error: ' + res.status;
      try {
        var j = await res.json();
        if (j && j.message) msg = j.message;
      } catch (e) {}
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    var ct = String(res.headers.get('content-type') || '').toLowerCase();
    return ct.indexOf('application/json') >= 0 ? await res.json() : await res.text();
  }

  function getGithubConfig() {
    if (typeof global.getAiSettings !== 'function' || typeof global.getGithubConfigFromSettings !== 'function') {
      throw new Error('GitHub 설정 모듈을 찾을 수 없습니다.');
    }
    return global.getAiSettings().then(function (settings) {
      return { settings: settings || {}, cfg: global.getGithubConfigFromSettings(settings || {}) };
    });
  }

  function buildGithubReferencePayload(items) {
    var onlyTexts = items.map(function (r) { return r.text; });
    var md = buildReferencesSectionFromTexts(onlyTexts, { withAnchors: false }).replace(/^\n+/, '');
    var json = JSON.stringify({
      format: 'mdproviewer-scholar-references',
      version: 1,
      exportedAt: nowIso(),
      count: items.length,
      references: items.map(function (r) {
        return {
          id: r.id,
          author: r.author,
          year: r.year,
          text: r.text,
          createdAt: r.createdAt || ''
        };
      })
    }, null, 2);
    return { md: md, json: json };
  }

  function buildSingleReferencePayload(item) {
    var data = {
      format: 'mdproviewer-scholar-reference',
      version: 1,
      exportedAt: nowIso(),
      reference: {
        id: item.id,
        author: item.author,
        year: item.year,
        text: item.text,
        createdAt: item.createdAt || ''
      }
    };
    return {
      md: buildReferencesSectionFromTexts([item.text], { withAnchors: false }).replace(/^\n+/, ''),
      json: JSON.stringify(data, null, 2)
    };
  }

  function getReferenceItemBaseName(item) {
    return sanitizeGithubFileName((item.year || 'n.d.') + '_' + (item.author || 'Unknown') + '_' + item.id);
  }

  function getGithubReferenceBasePrefix(cfg) {
    return cfg && cfg.basePath ? cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' : '';
  }

  function getGithubBlobUrl(cfg, path) {
    return 'https://github.com/' + cfg.repo + '/blob/' + encodeURIComponent(cfg.branch) + '/' + String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function getGithubTreeUrl(cfg, path) {
    return 'https://github.com/' + cfg.repo + '/tree/' + encodeURIComponent(cfg.branch) + '/' + String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function confirmGithubReferencePush(cfg, paths, count) {
    var list = (paths || []).slice(0, 8).map(function (p) { return '- ' + p; }).join('\n');
    if ((paths || []).length > 8) list += '\n- ...';
    return window.confirm(
      'GitHub Reference 폴더에 push합니다.\n\n'
      + '저장소: ' + cfg.repo + '\n'
      + '브랜치: ' + cfg.branch + '\n'
      + '참고문헌: ' + count + '건\n\n'
      + '저장 파일:\n' + list + '\n\n'
      + '계속할까요?'
    );
  }

  async function putGithubReferenceFile(cfg, fileName, content) {
    var basePrefix = cfg.basePath ? cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' : '';
    var remotePath = basePrefix + 'Reference/' + fileName;
    var encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
    var baseUrl = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + encodedPath;
    var sha = '';
    try {
      var existing = await githubRequest(baseUrl + '?ref=' + encodeURIComponent(cfg.branch), {}, cfg.token);
      sha = String(existing && existing.sha ? existing.sha : '');
    } catch (e) {
      if (Number(e && e.status) !== 404) throw e;
    }
    var body = {
      message: 'share references: ' + fileName + ' (' + nowIso() + ')',
      content: encodeUtf8Base64(content),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    await githubRequest(baseUrl, { method: 'PUT', body: JSON.stringify(body) }, cfg.token);
    return remotePath;
  }

  async function getGithubReferenceContent(cfg, path) {
    var encodedPath = String(path || '').split('/').map(encodeURIComponent).join('/');
    var url = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(cfg.branch);
    var data = await githubRequest(url, {}, cfg.token);
    return decodeGithubBase64Text(data && data.content ? data.content : '');
  }

  async function pushGithubReferenceItem(id) {
    await reloadRefsAndRender();
    var item = refs.find(function (r) { return String(r.id) === String(id); });
    if (!item) {
      toast('push할 참고문헌을 찾을 수 없습니다.');
      return;
    }
    var status = q('scholarref-github-status');
    try {
      var pair = await getGithubConfig();
      var cfg = pair.cfg;
      if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        throw new Error('GitHub 사용설정, PAT, 저장소, 브랜치를 먼저 설정하세요.');
      }
      var payload = buildSingleReferencePayload(item);
      var base = 'items/' + getReferenceItemBaseName(item);
      var prefix = getGithubReferenceBasePrefix(cfg);
      var planned = [prefix + 'Reference/' + base + '.md', prefix + 'Reference/' + base + '.json'];
      if (!confirmGithubReferencePush(cfg, planned, 1)) return;
      var mdPath = await putGithubReferenceFile(cfg, base + '.md', payload.md);
      var jsonPath = await putGithubReferenceFile(cfg, base + '.json', payload.json);
      if (status) status.textContent = '항목 저장 완료: ' + mdPath + ', ' + jsonPath;
      toast('참고문헌 1건을 GitHub에 push했습니다.');
    } catch (e) {
      if (status) status.textContent = 'GitHub push 실패: ' + String(e && e.message ? e.message : e);
      toast('GitHub push 실패: ' + String(e && e.message ? e.message : e));
    }
  }

  async function pushGithubSavedList() {
    await reloadRefsAndRender();
    if (!refs.length) {
      toast('공유할 저장 참고문헌이 없습니다.');
      return;
    }
    var status = q('scholarref-github-status');
    try {
      var pair = await getGithubConfig();
      var cfg = pair.cfg;
      if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        throw new Error('GitHub 사용설정, PAT, 저장소, 브랜치를 먼저 설정하세요.');
      }
      var prefix = getGithubReferenceBasePrefix(cfg);
      var planned = [
        prefix + 'Reference/scholar_references.md',
        prefix + 'Reference/scholar_references.json',
        prefix + 'Reference/items/*.md',
        prefix + 'Reference/items/*.json'
      ];
      if (!confirmGithubReferencePush(cfg, planned, refs.length)) return;
      if (status) status.textContent = 'GitHub Reference 폴더에 저장 중...';
      var payload = buildGithubReferencePayload(refs);
      var mdPath = await putGithubReferenceFile(cfg, 'scholar_references.md', payload.md);
      var jsonPath = await putGithubReferenceFile(cfg, 'scholar_references.json', payload.json);
      for (var i = 0; i < refs.length; i++) {
        var itemPayload = buildSingleReferencePayload(refs[i]);
        var base = 'items/' + getReferenceItemBaseName(refs[i]);
        await putGithubReferenceFile(cfg, base + '.md', itemPayload.md);
        await putGithubReferenceFile(cfg, base + '.json', itemPayload.json);
      }
      if (status) status.textContent = '저장 완료: ' + mdPath + ', ' + jsonPath;
      toast('GitHub Reference 폴더에 저장했습니다.');
      await renderGithubSavedList();
    } catch (e) {
      if (status) status.textContent = 'GitHub 저장 실패: ' + String(e && e.message ? e.message : e);
      toast('GitHub 저장 실패: ' + String(e && e.message ? e.message : e));
    }
  }

  async function renderGithubSavedList() {
    var box = q('scholarref-github-list');
    var status = q('scholarref-github-status');
    if (!box) return;
    box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">GitHub 목록을 불러오는 중...</div></div>';
    try {
      var pair = await getGithubConfig();
      var cfg = pair.cfg;
      if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">GitHub 설정을 먼저 완료하세요.</div></div>';
        return;
      }
      var basePrefix = getGithubReferenceBasePrefix(cfg);
      var folderPath = basePrefix + 'Reference';
      var remoteRefs = [];
      var mdUrl = getGithubBlobUrl(cfg, folderPath + '/scholar_references.md');
      var folderUrl = getGithubTreeUrl(cfg, folderPath);
      try {
        var aggregate = await getGithubReferenceContent(cfg, folderPath + '/scholar_references.json');
        var parsed = JSON.parse(aggregate);
        remoteRefs = Array.isArray(parsed && parsed.references) ? parsed.references : [];
      } catch (e1) {
        try {
          var mdText = await getGithubReferenceContent(cfg, folderPath + '/scholar_references.md');
          remoteRefs = extractReferenceTexts(mdText).map(function (text) {
            var ay = parseAuthorYear(text);
            return { author: ay.author, year: ay.year, text: text };
          });
        } catch (e2) {
          remoteRefs = [];
        }
      }
      if (!remoteRefs.length) {
        box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">GitHub Reference 폴더에 APA 참고문헌 목록이 없습니다.</div></div>';
        return;
      }
      var top = '<div class="scholarref-row" style="padding:8px;margin:0;border-bottom:1px solid #1e293b">'
        + '<a class="scholarref-secondary scholarref-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(mdUrl) + '">참고문헌 파일 열기</a>'
        + '<a class="scholarref-secondary scholarref-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(folderUrl) + '">Reference 폴더 열기</a>'
        + '</div>';
      box.innerHTML = top + remoteRefs.map(function (r) {
        var ref = normalizePulledReference(r);
        if (!ref) return '';
        return '<div class="scholarref-item"><div><div class="scholarref-item-title">' + escapeHtml(buildLabel(ref)) + '</div><div class="scholarref-item-text">' + escapeHtml(ref.text) + '</div></div></div>';
      }).join('');
      if (status) status.textContent = 'GitHub Reference 폴더의 APA 참고문헌 목록입니다. (' + remoteRefs.length + '건)';
    } catch (e) {
      var notFound = Number(e && e.status) === 404;
      box.innerHTML = '<div class="scholarref-item"><div class="scholarref-item-text">' + (notFound ? 'Reference 폴더가 아직 없습니다. GitHub 공유를 누르면 생성됩니다.' : escapeHtml(String(e && e.message ? e.message : e))) + '</div></div>';
    }
  }

  function normalizePulledReference(raw) {
    var ref = raw && raw.reference ? raw.reference : raw;
    if (!ref || !safeText(ref.text)) return null;
    var ay = parseAuthorYear(ref.text);
    return {
      id: safeText(ref.id) || ('ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      author: safeText(ref.author) || ay.author,
      year: safeText(ref.year) || ay.year,
      text: safeText(ref.text),
      createdAt: safeText(ref.createdAt) || nowIso()
    };
  }

  async function mergePulledRefs(items) {
    var db = getDb();
    if (!db || !db.objectStoreNames.contains('scholar_refs')) throw new Error('DB is not ready');
    var current = await readAllRefs();
    var seenText = new Set(current.map(function (x) { return normalizeRefText(x.text); }));
    var seenId = new Set(current.map(function (x) { return String(x.id); }));
    var toAdd = [];
    (items || []).forEach(function (item) {
      var ref = normalizePulledReference(item);
      if (!ref) return;
      var key = normalizeRefText(ref.text);
      if (seenText.has(key)) return;
      seenText.add(key);
      while (seenId.has(String(ref.id))) ref.id = 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      seenId.add(String(ref.id));
      toAdd.push(ref);
    });
    if (!toAdd.length) return 0;
    await new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction('scholar_refs', 'readwrite');
        var store = tx.objectStore('scholar_refs');
        toAdd.forEach(function (ref) { store.add(ref); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('Pull save failed')); };
      } catch (e) { reject(e); }
    });
    return toAdd.length;
  }

  async function pullGithubSavedList() {
    var status = q('scholarref-github-status');
    try {
      var pair = await getGithubConfig();
      var cfg = pair.cfg;
      if (!cfg.enabled || !cfg.token || !cfg.repo || !cfg.branch) {
        throw new Error('GitHub 사용설정, PAT, 저장소, 브랜치를 먼저 설정하세요.');
      }
      if (status) status.textContent = 'GitHub Reference 폴더에서 pull 중...';
      var basePrefix = cfg.basePath ? cfg.basePath.replace(/^\/+|\/+$/g, '') + '/' : '';
      var refsToMerge = [];
      try {
        var aggregate = await getGithubReferenceContent(cfg, basePrefix + 'Reference/scholar_references.json');
        var parsed = JSON.parse(aggregate);
        refsToMerge = Array.isArray(parsed && parsed.references) ? parsed.references : [];
      } catch (e) {
        try {
          var folderPath = basePrefix + 'Reference/items';
          var url = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.name) + '/contents/' + folderPath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(cfg.branch);
          var items = await githubRequest(url, {}, cfg.token);
          items = Array.isArray(items) ? items.filter(function (it) { return /\.json$/i.test(String(it && it.name ? it.name : '')); }) : [];
          for (var i = 0; i < items.length; i++) {
            var text = await getGithubReferenceContent(cfg, String(items[i].path || ''));
            var itemJson = JSON.parse(text);
            refsToMerge.push(itemJson && itemJson.reference ? itemJson.reference : itemJson);
          }
        } catch (e2) {
          var mdText = await getGithubReferenceContent(cfg, basePrefix + 'Reference/scholar_references.md');
          refsToMerge = extractReferenceTexts(mdText).map(function (text) {
            var ay = parseAuthorYear(text);
            return { author: ay.author, year: ay.year, text: text, createdAt: nowIso() };
          });
        }
      }
      var added = await mergePulledRefs(refsToMerge);
      await reloadRefsAndRender();
      if (status) status.textContent = 'pull 완료: ' + added + '건 추가됨';
      toast('GitHub reference pull 완료: ' + added + '건 추가됨');
    } catch (e) {
      if (status) status.textContent = 'GitHub pull 실패: ' + String(e && e.message ? e.message : e);
      toast('GitHub pull 실패: ' + String(e && e.message ? e.message : e));
    }
  }

  function extractReferenceTexts(rawSection) {
    var out = [];
    var seen = new Set();

    function pushUnique(text) {
      var clean = safeText(text);
      if (!clean) return;
      var key = normalizeRefText(clean);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    }

    var liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    var m;
    while ((m = liRe.exec(rawSection)) !== null) {
      pushUnique(stripHtmlTags(m[1]));
    }

    var anchorBlockRe = /<div\b[^>]*id=["']schref-[^"']+["'][^>]*>\s*<\/div>\s*([\s\S]*?)(?=\n\s*<div\b[^>]*id=["']schref-|$)/gi;
    while ((m = anchorBlockRe.exec(rawSection)) !== null) {
      var firstLine = String(m[1] || '').split('\n').map(safeText).filter(Boolean)[0] || '';
      pushUnique(stripHtmlTags(firstLine));
    }

    var numberedRe = /^\s*\d+\.\s+(.+)$/gm;
    while ((m = numberedRe.exec(rawSection)) !== null) {
      pushUnique(stripHtmlTags(m[1]));
    }

    var plainBlocks = String(rawSection || '')
      .replace(/<div\b[^>]*id=["']schref-[^"']+["'][^>]*>\s*<\/div>/gi, '')
      .split(/\n\s*\n+/)
      .map(function (s) { return stripHtmlTags(s); })
      .map(safeText)
      .filter(Boolean);
    plainBlocks.forEach(pushUnique);

    return out;
  }

  function mergeReferencesIntoDocument(docText, pickedRefs, opts) {
    var source = String(docText || '');
    var headingRe = /^##\s*References\s*$/im;
    var headingMatch = headingRe.exec(source);
    var body = source;
    var existingRefRaw = '';
    if (headingMatch) {
      body = source.slice(0, headingMatch.index).trimEnd();
      existingRefRaw = source.slice(headingMatch.index + headingMatch[0].length);
    }

    var merged = [];
    var seen = new Set();
    function addText(text) {
      var clean = safeText(text);
      if (!clean) return;
      var key = normalizeRefText(clean);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    }

    extractReferenceTexts(existingRefRaw).forEach(addText);
    (pickedRefs || []).forEach(function (r) { addText(r && r.text); });

    if (!merged.length) return body;
    return body + buildReferencesSectionFromTexts(merged, opts);
  }

  function replaceEditorAllText(nextText) {
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) return false;
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    document.execCommand('insertText', false, String(nextText || ''));
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    return true;
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
    ensureGithubTabUi();
    await reloadRefsAndRender();
  }

  function togglePanel() {
    var panel = q('scholarref-panel');
    if (!panel) return;
    ensureGithubTabUi();
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
    if (String(i) === '3') renderGithubSavedList().catch(function () {});
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

  function openMdImport() {
    var file = q('scholarref-md-file');
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

  async function importMd(ev) {
    var file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;
    try {
      var text = await file.text();
      var extracted = extractReferencesSectionFromMarkdown(text);
      var ta = q('scholarref-input');
      if (ta) {
        ta.value = extracted || text;
      }
      if (extracted) {
        var approxCount = splitInputText(extracted).length;
        toast('MD에서 References 섹션을 불러왔습니다. (' + approxCount + '개)');
      } else {
        toast('References 섹션이 없어 문서 전체를 불러왔습니다.');
      }
    } catch (e) {
      toast('MD 불러오기 실패');
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
      return items.map(function (r, i) {
        var anchorId = anchorFromRefText(r.text);
        return '[\\[' + (i + 1) + '\\]](#' + anchorId + ')';
      }).join(' ');
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
    if (numberLink && !appendSection) {
      toast('번호(링크) 삽입은 "문서 끝 References(APA) 추가"와 함께 사용해 주세요.');
      return;
    }
    var citationText = buildCitationText(picked, { format: format, numberLink: numberLink });
    if (!insertTextAtCursor(citationText)) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    if (appendSection) {
      var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
      if (!ta) {
        toast('References 섹션을 문서 끝에 추가하지 못했습니다.');
        return;
      }
      var mergedDoc = mergeReferencesIntoDocument(String(ta.value || ''), picked, { withAnchors: numberLink });
      if (!replaceEditorAllText(mergedDoc)) {
        toast('References 섹션을 문서 끝에 추가하지 못했습니다.');
        return;
      }
    }
    toast('선택한 인용을 삽입했습니다.');
  }

  function insertAllSection() {
    if (!refs.length) {
      toast('저장된 참고문헌이 없습니다.');
      return;
    }
    var ta = typeof deps.getEditor === 'function' ? deps.getEditor() : null;
    if (!ta) {
      toast('편집창을 찾을 수 없습니다.');
      return;
    }
    var mergedDoc = mergeReferencesIntoDocument(String(ta.value || ''), refs, { withAnchors: false });
    if (!replaceEditorAllText(mergedDoc)) {
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
    var onlyTexts = refs.map(function (r) { return r.text; });
    var body = buildReferencesSectionFromTexts(onlyTexts, { withAnchors: false }).replace(/^\n+/, '');
    download('scholar_references.md', body, 'text/markdown;charset=utf-8');
  }

  function openListWindow() {
    if (!refs.length) {
      toast('저장된 참고문헌이 없습니다.');
      return;
    }
    var win = null;
    try {
      win = window.open('', 'scholarref_list_window', 'width=980,height=820,scrollbars=yes,resizable=yes');
    } catch (e) {}
    if (!win) {
      toast('팝업 차단으로 새창을 열지 못했습니다.');
      return;
    }
    var itemsHtml = refs.map(function (r) {
      var label = escapeHtml(buildLabel(r));
      var text = escapeHtml(r.text);
      return '<div class="item"><div class="label">' + label + '</div><div class="txt">' + text + '</div></div>';
    }).join('');
    var html = ''
      + '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>참고문헌 목록</title>'
      + '<style>'
      + 'body{margin:0;font-family:Segoe UI,Pretendard,sans-serif;background:#0f172a;color:#e2e8f0;}'
      + '.top{position:sticky;top:0;background:#111827;border-bottom:1px solid #334155;padding:10px 12px;display:flex;gap:8px;align-items:center;}'
      + '.top h1{font-size:15px;margin:0 8px 0 0;font-weight:700;}'
      + '.top button{border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;}'
      + '.wrap{max-width:860px;margin:18px auto;padding:0 14px;}'
      + '.item{border-bottom:1px solid #233044;padding:10px 0;}'
      + '.label{color:#a5b4fc;font-size:12px;font-weight:700;margin-bottom:4px;}'
      + '.txt{color:#d1d5db;font-size:14px;line-height:1.55;}'
      + '</style></head><body>'
      + '<div class="top"><h1>References (' + refs.length + ')</h1>'
      + '<button onclick="window.print()">인쇄</button>'
      + '<button onclick="window.close()">닫기</button></div>'
      + '<div class="wrap">' + itemsHtml + '</div>'
      + '</body></html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
    try { win.focus(); } catch (e2) {}
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
    openMdImport: openMdImport,
    importTxt: importTxt,
    importMd: importMd,
    renderSelectionList: renderSelectionList,
    togglePick: togglePick,
    selectAllFiltered: selectAllFiltered,
    clearSelection: clearSelection,
    insertSelected: insertSelected,
    insertAllSection: insertAllSection,
    downloadTxt: downloadTxt,
    downloadMd: downloadMd,
    openListWindow: openListWindow,
    pushGithubReferenceItem: pushGithubReferenceItem,
    pushGithubSavedList: pushGithubSavedList,
    pullGithubSavedList: pullGithubSavedList,
    renderGithubSavedList: renderGithubSavedList,
    deleteOne: deleteOne,
    clearAll: clearAll
  };
})(window);

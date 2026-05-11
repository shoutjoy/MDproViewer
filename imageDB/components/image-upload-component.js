(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function openDb(name, ver) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name || 'MarkdownProDB', ver || 4);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { reject(req.error || new Error('DB open failed')); };
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(r.error || new Error('File read failed')); };
      r.readAsDataURL(blob);
    });
  }

  function ImageUploadComponent(root, options) {
    this.root = root;
    this.opt = options || {};
    this.db = null;
    this.currentDataUrl = '';
    this.currentFileName = '';
    this.savedInternalId = '';
    this.galleryUrls = [];
  }

  ImageUploadComponent.prototype.setStatus = function (msg, isErr) {
    this.el.status.textContent = String(msg || '');
    this.el.status.className = 'mdvu-iu-status' + (isErr ? ' err' : '');
  };

  ImageUploadComponent.prototype.setPreview = function (dataUrl) {
    this.currentDataUrl = String(dataUrl || '');
    if (!this.currentDataUrl) {
      this.el.preview.removeAttribute('src');
      this.el.preview.classList.remove('show');
      return;
    }
    this.el.preview.src = this.currentDataUrl;
    this.el.preview.classList.add('show');
  };

  ImageUploadComponent.prototype.render = function () {
    this.root.innerHTML = '' +
      '<div class="mdvu-image-upload"><div class="mdvu-iu-panel">' +
      '<div class="mdvu-iu-header"><div><div class="mdvu-iu-title">이미지 삽입</div><div class="mdvu-iu-sub">컴포넌트형 업로드/저장/삽입</div></div></div>' +
      '<input type="file" class="mdvu-iu-file" accept="image/*" hidden />' +
      '<div class="mdvu-iu-grid">' +
      '<button type="button" class="mdvu-iu-zone mdvu-iu-upload"><div class="mdvu-iu-zone-title">이미지 업로드</div><div class="mdvu-iu-zone-desc">JPG, PNG, GIF, WebP</div><div class="mdvu-iu-zone-desc">드래그 앤 드롭</div></button>' +
      '<button type="button" class="mdvu-iu-zone mdvu-iu-paste"><div class="mdvu-iu-zone-title">클릭 후 Ctrl+V</div><div class="mdvu-iu-zone-desc">이미지 붙여넣기</div></button>' +
      '</div>' +
      '<div class="mdvu-iu-actions">' +
      '<button class="mdvu-iu-btn secondary" data-act="imgbb">[imgBB] Upload</button>' +
      '<button class="mdvu-iu-btn" data-act="internal">문서내부저장</button>' +
      '<button class="mdvu-iu-btn purple" data-act="gallery">Gallery</button>' +
      '</div>' +
      '<div class="mdvu-iu-box"><div class="mdvu-iu-label">Image URL → Insert (Markdown / HTML)</div>' +
      '<input class="mdvu-iu-url" type="url" placeholder="https://i.ibb.co/... 또는 internal://..." />' +
      '<div class="mdvu-iu-insert"><button class="mdvu-iu-linkbtn" data-act="insert-md">Markdown</button><button class="mdvu-iu-linkbtn" data-act="insert-html">HTML</button></div></div>' +
      '<div class="mdvu-iu-gallery"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><b style="font-size:12px;">IndexedDB 이미지</b><button class="mdvu-iu-btn ghost" data-act="refresh">새로고침</button></div><div class="mdvu-iu-gallery-list"></div></div>' +
      '<div class="mdvu-iu-status"></div>' +
      '<img class="mdvu-iu-preview" alt="preview" />' +
      '</div></div>';

    this.el = {
      file: this.root.querySelector('.mdvu-iu-file'),
      upload: this.root.querySelector('.mdvu-iu-upload'),
      paste: this.root.querySelector('.mdvu-iu-paste'),
      url: this.root.querySelector('.mdvu-iu-url'),
      gallery: this.root.querySelector('.mdvu-iu-gallery'),
      galleryList: this.root.querySelector('.mdvu-iu-gallery-list'),
      status: this.root.querySelector('.mdvu-iu-status'),
      preview: this.root.querySelector('.mdvu-iu-preview')
    };

    var self = this;
    this.el.upload.addEventListener('click', function () { self.el.file.click(); });
    this.el.file.addEventListener('change', function () {
      var f = self.el.file.files && self.el.file.files[0];
      if (f) self.readFile(f);
      self.el.file.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      self.el.upload.addEventListener(ev, function (e) { e.preventDefault(); self.el.upload.classList.add('active'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      self.el.upload.addEventListener(ev, function (e) { e.preventDefault(); self.el.upload.classList.remove('active'); });
    });
    self.el.upload.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) self.readFile(f);
    });

    this.el.paste.addEventListener('click', function () { self.setStatus('이제 Ctrl+V로 붙여넣으세요.', false); });
    this.root.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
      var file = items.map(function (it) { return it.kind === 'file' ? it.getAsFile() : null; }).filter(Boolean)[0];
      if (!file) return;
      e.preventDefault();
      self.readFile(file);
    });

    this.root.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.onAction(btn.getAttribute('data-act')); });
    });
  };

  ImageUploadComponent.prototype.readFile = function (file) {
    if (!file || String(file.type || '').indexOf('image/') !== 0) {
      this.setStatus('이미지 파일만 가능합니다.', true);
      return;
    }
    var self = this;
    var r = new FileReader();
    r.onload = function () {
      self.currentFileName = file.name || ('upload_' + Date.now() + '.png');
      self.savedInternalId = '';
      self.setPreview(String(r.result || ''));
      self.el.url.value = '';
      self.setStatus('이미지가 준비되었습니다. Upload 또는 내부저장을 선택하세요.', false);
    };
    r.readAsDataURL(file);
  };

  ImageUploadComponent.prototype.loadGallery = async function () {
    var self = this;
    this.galleryUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    this.galleryUrls = [];
    this.el.galleryList.innerHTML = '<div style="font-size:12px;color:#6a7790;">불러오는 중...</div>';

    var rows = await new Promise(function (resolve, reject) {
      var tx = self.db.transaction('images', 'readonly');
      var req = tx.objectStore('images').getAll();
      req.onsuccess = function () { resolve(Array.isArray(req.result) ? req.result : []); };
      req.onerror = function () { reject(req.error || new Error('load failed')); };
    });

    rows.sort(function (a, b) { return Number((b && b.createdAt) || 0) - Number((a && a.createdAt) || 0); });
    if (!rows.length) {
      this.el.galleryList.innerHTML = '<div style="font-size:12px;color:#6a7790;">저장된 이미지가 없습니다.</div>';
      return;
    }

    var html = [];
    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i];
      if (!rec || !rec.id || !rec.blob) continue;
      var u = URL.createObjectURL(rec.blob);
      this.galleryUrls.push(u);
      html.push('<button class="mdvu-iu-item" type="button" data-id="' + encodeURIComponent(rec.id) + '"><img src="' + u + '" alt="" /><div class="mdvu-iu-item-name">' + esc(rec.name || rec.id) + '</div></button>');
    }
    this.el.galleryList.innerHTML = html.join('');

    this.el.galleryList.querySelectorAll('.mdvu-iu-item').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = decodeURIComponent(String(btn.getAttribute('data-id') || ''));
        var rec = rows.find(function (r) { return String(r.id) === id; });
        if (!rec) return;
        self.savedInternalId = id;
        self.el.url.value = global.ImageDB.internalUrlFromId(id);
        try { self.setPreview(await blobToDataUrl(rec.blob)); } catch (e) {}
        self.setStatus('갤러리 선택: ' + id, false);
      });
    });
  };

  ImageUploadComponent.prototype.uploadToImgbb = async function () {
    if (!this.currentDataUrl || this.currentDataUrl.indexOf('data:image') !== 0) {
      this.setStatus('먼저 이미지를 선택하세요.', true);
      return;
    }
    var keyFn = this.opt.getImgbbApiKey;
    var key = String(typeof keyFn === 'function' ? keyFn() : '').trim();
    if (!key) {
      this.setStatus('imgBB API key가 없습니다.', true);
      return;
    }

    var comma = this.currentDataUrl.indexOf(',');
    var b64 = comma >= 0 ? this.currentDataUrl.slice(comma + 1) : this.currentDataUrl;
    var form = new FormData();
    form.append('image', b64);
    form.append('name', 'img_insert_' + Date.now());
    this.setStatus('imgBB 업로드 중...', false);

    var data = await new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key), true);
      xhr.onload = function () {
        try {
          var j = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && j && j.success !== false) resolve(j);
          else reject(new Error((j && j.error && j.error.message) || ('imgBB failed (' + xhr.status + ')')));
        } catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(form);
    });

    var d = data.data || {};
    var url = d.url || (d.image && d.image.url) || d.display_url || '';
    this.el.url.value = url;
    this.setStatus(url ? ('업로드 완료: ' + url) : '업로드 완료', false);
  };

  ImageUploadComponent.prototype.saveInternal = async function () {
    if (!this.currentDataUrl || this.currentDataUrl.indexOf('data:image') !== 0) {
      this.setStatus('먼저 이미지를 선택하세요.', true);
      return;
    }
    var saved = await global.ImageDB.saveDataUrl(this.db, this.currentDataUrl, {
      name: this.currentFileName || ('internal_' + Date.now() + '.png')
    });
    this.savedInternalId = saved.id;
    this.el.url.value = saved.url;
    this.setStatus('내부 저장 완료: ' + saved.url, false);
    if (this.el.gallery.classList.contains('open')) await this.loadGallery();
  };

  ImageUploadComponent.prototype.onAction = async function (act) {
    try {
      if (act === 'imgbb') await this.uploadToImgbb();
      else if (act === 'internal') await this.saveInternal();
      else if (act === 'gallery') {
        this.el.gallery.classList.toggle('open');
        if (this.el.gallery.classList.contains('open')) await this.loadGallery();
      } else if (act === 'refresh') await this.loadGallery();
      else if (act === 'insert-md') {
        var url = String(this.el.url.value || '').trim() || this.currentDataUrl;
        if (!url) return this.setStatus('삽입할 URL이 없습니다.', true);
        if (typeof this.opt.onInsertMarkdown === 'function') this.opt.onInsertMarkdown(url, this.currentFileName || 'image');
      } else if (act === 'insert-html') {
        var hurl = String(this.el.url.value || '').trim() || this.currentDataUrl;
        if (!hurl) return this.setStatus('삽입할 URL이 없습니다.', true);
        if (typeof this.opt.onInsertHtml === 'function') this.opt.onInsertHtml(hurl, this.currentFileName || 'image');
      }
    } catch (e) {
      this.setStatus(String((e && e.message) || e), true);
    }
  };

  ImageUploadComponent.prototype.init = async function () {
    if (!global.ImageDB) throw new Error('imageDB.js가 필요합니다.');
    this.render();
    this.db = this.opt.db || await openDb(this.opt.dbName || 'MarkdownProDB', this.opt.dbVersion || 4);
    this.setStatus('컴포넌트 준비 완료', false);
  };

  global.ImageUploadComponent = {
    mount: async function (container, options) {
      var root = (typeof container === 'string') ? document.querySelector(container) : container;
      if (!root) throw new Error('mount target not found');
      var c = new ImageUploadComponent(root, options || {});
      await c.init();
      return c;
    }
  };
})(window);

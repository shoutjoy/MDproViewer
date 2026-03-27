(function (global) {
  'use strict';

  function ensureImageDb() {
    if (!global.ImageDB) throw new Error('ImageDB is not available.');
    return global.ImageDB;
  }

  function showChoiceDialog(title, message, choices, cancelKey) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;';

      var card = document.createElement('div');
      card.style.cssText = 'width:min(520px,96vw);background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,.35);padding:16px;';

      var h = document.createElement('h3');
      h.textContent = title || 'Select an action';
      h.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:700;';
      card.appendChild(h);

      if (message) {
        var p = document.createElement('p');
        p.textContent = message;
        p.style.cssText = 'margin:0 0 14px;font-size:13px;line-height:1.5;color:#cbd5e1;';
        card.appendChild(p);
      }

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      function done(key) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(key);
      }

      (choices || []).forEach(function (choice) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = choice.label || choice.key;
        btn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:13px;font-weight:600;cursor:pointer;';
        btn.addEventListener('click', function () { done(choice.key); });
        row.appendChild(btn);
      });

      card.appendChild(row);
      overlay.appendChild(card);
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) done(cancelKey || 'cancel');
      });
      document.body.appendChild(overlay);
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        var comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = function () { reject(reader.error || new Error('Failed to read blob.')); };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mime) {
    var b64 = String(base64 || '').trim();
    var binary = atob(b64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  }

  async function exportMdd(db, markdown, fileName) {
    var imageDb = ensureImageDb();
    var source = String(markdown || '');
    var ids = imageDb.extractInternalImageIds(source);
    var images = [];

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var rec = await imageDb.getImage(db, id);
      if (!rec || !rec.blob) continue;
      images.push({
        id: id,
        name: rec.name || id,
        mime: rec.mime || rec.blob.type || 'application/octet-stream',
        base64: await blobToBase64(rec.blob)
      });
    }

    var name = String(fileName || 'document.mdd');
    if (!/\.mdd$/i.test(name)) name += '.mdd';
    var payload = {
      format: 'mdviewer/mdd',
      version: 1,
      exportedAt: new Date().toISOString(),
      document: {
        fileName: name.replace(/\.mdd$/i, '.md'),
        content: source
      },
      images: images
    };
    var json = JSON.stringify(payload, null, 2);
    return {
      fileName: name,
      blob: new Blob([json], { type: 'application/json;charset=utf-8' }),
      imageCount: images.length
    };
  }

  async function importMddToIndexedDb(db, textOrObject) {
    var imageDb = ensureImageDb();
    var payload = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
    if (!payload || payload.format !== 'mdviewer/mdd') {
      throw new Error('Invalid MDD format.');
    }
    var images = Array.isArray(payload.images) ? payload.images : [];
    var imported = 0;
    for (var i = 0; i < images.length; i++) {
      var item = images[i] || {};
      var id = String(item.id || '').trim();
      var base64 = String(item.base64 || '').trim();
      if (!id || !base64) continue;
      var blob = base64ToBlob(base64, item.mime || 'application/octet-stream');
      await imageDb.saveBlob(db, blob, {
        id: id,
        name: item.name || id,
        mime: item.mime || blob.type || 'application/octet-stream'
      });
      imported += 1;
    }
    var doc = payload.document || {};
    return {
      markdown: String(doc.content || ''),
      fileName: String(doc.fileName || 'document.md'),
      imageCount: imported
    };
  }

  function showCloseActionDialog() {
    return showChoiceDialog(
      '저장되지 않은 변경사항',
      '현재 문서를 닫기 전에 작업을 어떻게 처리할까요?',
      [
        { key: 'indb', label: '[ ] 저장(inDB)' },
        { key: 'export', label: '[ ] 내보내기' },
        { key: 'cancel', label: '[취소]' }
      ],
      'cancel'
    );
  }

  function showExportTypeDialog() {
    return showChoiceDialog(
      '내보내기 형식 선택',
      '원하는 파일 형식을 선택하세요.',
      [
        { key: 'md', label: 'md파일' },
        { key: 'mdd', label: 'mdd파일(통합문서)' },
        { key: 'zip', label: 'Zip파일' },
        { key: 'cancel', label: '[취소]' }
      ],
      'cancel'
    );
  }

  global.ExtendFiles = {
    showChoiceDialog: showChoiceDialog,
    showCloseActionDialog: showCloseActionDialog,
    showExportTypeDialog: showExportTypeDialog,
    exportMdd: exportMdd,
    importMddToIndexedDb: importMddToIndexedDb
  };
})(window);

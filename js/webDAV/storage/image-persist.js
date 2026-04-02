/* ═══════════════════════════════════════════════════════════
   ImagePersist — 문서 내 이미지를 IMAGE 폴더에 저장·indb: 경로 치환
   저장 시: data:image/blob → IMAGE 폴더 저장 → indb:경로 치환
   렌더 시: indb:이미지 → IndexedDB에서 로드 → blob URL로 표시
   의존: InDB
═══════════════════════════════════════════════════════════ */
const ImagePersist = (() => {
    const IMAGE_FOLDER = 'IMAGE';
    /** 마크다운 이미지: ![](data:image...) 또는 ![](blob:...) */
    const DATA_IMG_RE = /!\[([^\]]*)\]\((data:image[^)]+)\)/gi;
    const BLOB_IMG_RE = /!\[([^\]]*)\]\((blob:[^)]+)\)/gi;

    function _blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
            var r = new FileReader();
            r.onload = function() { resolve(r.result.split(',')[1]); };
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    function _dataUrlToBase64(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
        var i = dataUrl.indexOf(',');
        return i >= 0 ? dataUrl.slice(i + 1) : null;
    }

    /** docPath에서 문서명 추출 (확장자 제외). 예: Edu_industrial/교육심리/SDT.md → SDT */
    function _docNameFromPath(docPath) {
        if (!docPath || typeof docPath !== 'string') return '';
        var p = docPath.trim().replace(/^\/+|\/+$/g, '');
        var last = p.split('/').pop() || '';
        var dot = last.lastIndexOf('.');
        return dot > 0 ? last.slice(0, dot) : last;
    }

    /** 문서별 IMAGE 하위 폴더: IMAGE/문서명/aiimg-xxx.png. docName 없으면 IMAGE/aiimg-xxx.png (기존 호환) */
    function _uniqueImageName(idx, docName) {
        var d = new Date();
        var base = 'aiimg-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
        if (idx > 0) base += '-' + idx;
        var sub = (docName && String(docName).trim()) ? (IMAGE_FOLDER + '/' + docName.replace(/[/\\:*?"<>|]/g, '_') + '/' + base + '.png') : (IMAGE_FOLDER + '/' + base + '.png');
        return sub;
    }

    /**
     * content 내 data:image, blob: 이미지를 IMAGE/문서명/ 폴더에 저장하고 indb: 경로로 치환
     */
    async function extractAndReplace(content, docPath, saveFn) {
        if (!content || typeof content !== 'string') return content;
        var docName = _docNameFromPath(docPath);
        var result = content;
        var idx = 0;

        /* data:image */
        DATA_IMG_RE.lastIndex = 0;
        var m;
        while ((m = DATA_IMG_RE.exec(content)) !== null) {
            var alt = m[1] || '';
            var dataUrl = m[2];
            var b64 = _dataUrlToBase64(dataUrl);
            if (b64 && typeof saveFn === 'function') {
                try {
                    var imgPath = _uniqueImageName(idx, docName);
                    var ok = await saveFn(imgPath, b64);
                    if (ok) {
                        var indbRef = 'indb:' + imgPath;
                        result = result.replace(m[0], '![' + alt + '](' + indbRef + ')');
                    }
                    idx++;
                } catch (e) { console.warn('[ImagePersist] data:image 저장 실패:', e); }
            }
        }

        /* blob: */
        BLOB_IMG_RE.lastIndex = 0;
        while ((m = BLOB_IMG_RE.exec(content)) !== null) {
            var alt = m[1] || '';
            var blobUrl = m[2];
            try {
                var blob = await fetch(blobUrl).then(function(r) { return r.blob(); });
                var b64 = await _blobToBase64(blob);
                if (b64 && typeof saveFn === 'function') {
                    var imgPath = _uniqueImageName(idx, docName);
                    var ok = await saveFn(imgPath, b64);
                    if (ok) {
                        var indbRef = 'indb:' + imgPath;
                        result = result.replace(m[0], '![' + alt + '](' + indbRef + ')');
                    }
                    idx++;
                }
            } catch (e) { console.warn('[ImagePersist] blob 저장 실패:', e); }
        }
        return result;
    }

    /**
     * container 내 img[src^="indb:"]를 IndexedDB에서 로드해 blob URL로 표시
     */
    async function resolveInContainer(container) {
        if (!container || !container.querySelectorAll) return;
        var imgs = container.querySelectorAll('img[src^="indb:"]');
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            var src = img.getAttribute('src') || '';
            var path = src.replace(/^indb:/, '').trim();
            if (!path) continue;
            try {
                if (typeof InDB !== 'undefined' && InDB.getFileByPath) {
                    var f = await InDB.getFileByPath(path);
                    if (f && f.content) {
                        var b64 = f.content;
                        var low = path.toLowerCase();
                        var mime = low.endsWith('.png') ? 'image/png' : low.endsWith('.webp') ? 'image/webp' : low.endsWith('.jpg') || low.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
                        var bin = atob(b64);
                        var arr = new Uint8Array(bin.length);
                        for (var j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
                        var blob = new Blob([arr], { type: mime });
                        var blobUrl = URL.createObjectURL(blob);
                        img.src = blobUrl;
                        if (!img._imagePersistBlobUrls) img._imagePersistBlobUrls = [];
                        img._imagePersistBlobUrls.push(blobUrl);
                    }
                }
            } catch (e) { console.warn('[ImagePersist] indb 이미지 로드 실패:', path, e); }
        }
    }

    function revokeUrlsInContainer(container) {
        if (!container) return;
        container.querySelectorAll('img').forEach(function(img) {
            if (img._imagePersistBlobUrls && img._imagePersistBlobUrls.length) {
                img._imagePersistBlobUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (e) {} });
                img._imagePersistBlobUrls = [];
            }
        });
    }

    /**
     * dataUrl을 IMAGE/문서명/ 폴더에 저장 후 indb: 경로 반환. docName 없으면 IMAGE/ (기존 호환)
     * @param {string} dataUrl - data:image URL
     * @param {function} saveFn - (path, base64) => Promise<boolean>
     * @param {string} [docName] - 문서명(확장자 제외). TM.getActive() 등에서 추출
     */
    async function saveToImageFolder(dataUrl, saveFn, docName) {
        if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
        var b64 = _dataUrlToBase64(dataUrl);
        if (!b64 || typeof saveFn !== 'function') return null;
        try {
            var path = _uniqueImageName(0, docName);
            var ok = await saveFn(path, b64);
            return ok ? 'indb:' + path : null;
        } catch (e) { return null; }
    }

    /** indb:IMAGE/... 경로를 docPath 기준 상대 경로로 변환. GitHub push 시 사용 */
    function indbPathToRelative(content, docPath) {
        if (!content || typeof content !== 'string') return content;
        var docDir = (docPath || '').trim().replace(/^\/+|\/+$/g, '');
        var lastSlash = docDir.lastIndexOf('/');
        docDir = lastSlash >= 0 ? docDir.slice(0, lastSlash) : '';
        var upCount = docDir ? docDir.split('/').length : 0;
        var prefix = upCount > 0 ? ('../'.repeat(upCount)) : '';

        /* ![](indb:IMAGE/xxx.png) 또는 <img src="indb:IMAGE/xxx.png" */
        var re = /(indb:)(IMAGE\/[^)\s"']+)/gi;
        return content.replace(re, function(_, scheme, relPath) {
            return prefix + relPath;
        });
    }

    /** content에서 indb:IMAGE/... 경로 목록 추출 */
    function extractIndbImagePaths(content) {
        if (!content || typeof content !== 'string') return [];
        var paths = [];
        var re = /indb:(IMAGE\/[^)\s"']+)/gi;
        var m;
        while ((m = re.exec(content)) !== null) {
            var p = m[1];
            if (paths.indexOf(p) < 0) paths.push(p);
        }
        return paths;
    }

    return { extractAndReplace, resolveInContainer, revokeUrlsInContainer, saveToImageFolder, indbPathToRelative, extractIndbImagePaths, IMAGE_FOLDER, _docNameFromPath };
})();
window.ImagePersist = ImagePersist;

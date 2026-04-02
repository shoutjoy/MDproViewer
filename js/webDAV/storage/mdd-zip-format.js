/* mdd-zip-format
   - MDD(JSON 호환 통합문서) export/import
   - ZIP(문서+이미지) export/import
   - 현재 앱의 indb:IMAGE/... 참조 규칙에 맞춘 포맷 헬퍼
*/
(function (global) {
    'use strict';

    const MDD_FORMAT = 'mdlive/mdd';
    const MDD_VERSION = 1;
    const IMAGE_REF_RE = /indb:(IMAGE\/[^)\s"']+)/gi;
    const INVALID_PATH_RE = /[<>:"|?*]/g;

    function _safeString(v) {
        return v == null ? '' : String(v);
    }

    function _guessMime(path) {
        const p = _safeString(path).toLowerCase();
        if (p.endsWith('.png')) return 'image/png';
        if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
        if (p.endsWith('.gif')) return 'image/gif';
        if (p.endsWith('.webp')) return 'image/webp';
        if (p.endsWith('.svg')) return 'image/svg+xml';
        return 'application/octet-stream';
    }

    function _sanitizeInDbPath(pathLike, fallbackName) {
        const fallback = _safeString(fallbackName || 'document.md').trim() || 'document.md';
        const normalized = _safeString(pathLike).replace(/\\/g, '/').replace(/^\/+/, '').trim();
        const src = normalized || fallback;
        const parts = src.split('/').map(function (seg) {
            return _safeString(seg).trim().replace(INVALID_PATH_RE, '_');
        }).filter(Boolean);
        let out = parts.length ? parts.join('/') : fallback.replace(INVALID_PATH_RE, '_');
        if (!/\.[A-Za-z0-9]+$/.test(out)) out += '.md';
        return out;
    }

    function _escapeRegExp(s) {
        return _safeString(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function _extractImagePaths(markdown) {
        if (typeof ImagePersist !== 'undefined' && ImagePersist.extractIndbImagePaths) {
            return ImagePersist.extractIndbImagePaths(markdown || '');
        }
        const out = [];
        const seen = new Set();
        const text = _safeString(markdown);
        IMAGE_REF_RE.lastIndex = 0;
        let m;
        while ((m = IMAGE_REF_RE.exec(text)) !== null) {
            const p = _safeString(m[1]).trim();
            if (!p || seen.has(p)) continue;
            seen.add(p);
            out.push(p);
        }
        return out;
    }

    async function _readInDbBase64(path) {
        if (typeof InDB === 'undefined' || !InDB.getFileByPath) return null;
        const row = await InDB.getFileByPath(path);
        if (!row || row.content == null) return null;
        return _safeString(row.content);
    }

    async function exportToMdd(markdown, fileName) {
        const md = _safeString(markdown);
        const rawName = _safeString(fileName || 'document.mdd').trim() || 'document.mdd';
        const name = /\.mdd$/i.test(rawName) ? rawName : (rawName + '.mdd');
        const docName = name.replace(/\.mdd$/i, '.md');

        const imagePaths = _extractImagePaths(md);
        const images = [];
        for (let i = 0; i < imagePaths.length; i++) {
            const path = imagePaths[i];
            const base64 = await _readInDbBase64(path);
            if (!base64) continue;
            images.push({
                path: path,
                name: path.split('/').pop() || path,
                mime: _guessMime(path),
                base64: base64
            });
        }

        const payload = {
            format: MDD_FORMAT,
            version: MDD_VERSION,
            exportedAt: new Date().toISOString(),
            document: {
                fileName: docName,
                content: md
            },
            images: images
        };

        return {
            fileName: name,
            imageCount: images.length,
            blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
        };
    }

    async function importFromMddText(textOrObject) {
        if (typeof InDB === 'undefined' || !InDB.saveFile) throw new Error('InDB.saveFile이 필요합니다.');
        const payload = typeof textOrObject === 'string' ? JSON.parse(textOrObject) : textOrObject;
        if (!payload || typeof payload !== 'object') throw new Error('올바른 MDD 데이터가 아닙니다.');

        const format = _safeString(payload.format).trim();
        if (!format) throw new Error('MDD format 필드가 없습니다.');

        const doc = payload.document || {};
        let markdown = _safeString(doc.content);
        const fileName = _sanitizeInDbPath(doc.fileName || 'document.md', 'document.md');
        const images = Array.isArray(payload.images) ? payload.images : [];

        let imported = 0;
        for (let i = 0; i < images.length; i++) {
            const img = images[i] || {};
            const base64 = _safeString(img.base64).trim();
            if (!base64) continue;

            let path = _safeString(img.path).trim();
            if (!path) {
                const id = _safeString(img.id).trim();
                if (!id) continue;
                path = /^IMAGE\//i.test(id) ? id : ('IMAGE/' + id);
            }
            path = _sanitizeInDbPath(path, 'IMAGE/imported-' + (i + 1) + '.png');

            await InDB.saveFile(path, base64);
            imported += 1;

            const id = _safeString(img.id).trim();
            if (id) {
                markdown = markdown.replace(new RegExp(_escapeRegExp('internal://' + id), 'g'), 'indb:' + path);
                markdown = markdown.replace(new RegExp(_escapeRegExp('indexeddb://' + id), 'g'), 'indb:' + path);
            }
        }

        return {
            markdown: markdown,
            fileName: fileName,
            imageCount: imported
        };
    }

    async function importFromMddFile(file) {
        const text = await file.text();
        return importFromMddText(text);
    }

    async function exportToZip(markdown, fileName) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리가 필요합니다.');
        const md = _safeString(markdown);
        const rawName = _safeString(fileName || 'document.zip').trim() || 'document.zip';
        const zipName = /\.zip$/i.test(rawName) ? rawName : (rawName + '.zip');
        const mdName = zipName.replace(/\.zip$/i, '.md');

        const imagePaths = _extractImagePaths(md);
        const zip = new JSZip();
        let replaced = md;
        let imageCount = 0;

        for (let i = 0; i < imagePaths.length; i++) {
            const path = _sanitizeInDbPath(imagePaths[i], 'IMAGE/imported-' + (i + 1) + '.png');
            const b64 = await _readInDbBase64(path);
            if (!b64) continue;
            zip.file('images/' + path, b64, { base64: true, createFolders: true });
            replaced = replaced.replace(new RegExp(_escapeRegExp('indb:' + path), 'g'), 'images/' + path);
            imageCount += 1;
        }

        zip.file(mdName, replaced, { createFolders: true });
        const blob = await zip.generateAsync({ type: 'blob' });
        return {
            fileName: zipName,
            markdownFileName: mdName,
            imageCount: imageCount,
            blob: blob
        };
    }

    async function importFromZipFile(fileOrBlob) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리가 필요합니다.');
        if (typeof InDB === 'undefined' || !InDB.saveFile) throw new Error('InDB.saveFile이 필요합니다.');
        const zip = await JSZip.loadAsync(fileOrBlob);

        let mdPath = null;
        Object.keys(zip.files).forEach(function (path) {
            const entry = zip.files[path];
            if (mdPath || !entry || entry.dir) return;
            if (/\.md$/i.test(path)) mdPath = path;
        });
        if (!mdPath || !zip.files[mdPath]) throw new Error('ZIP 내부에서 markdown(.md) 파일을 찾지 못했습니다.');

        let markdown = await zip.files[mdPath].async('string');
        const entries = Object.keys(zip.files);
        let imageCount = 0;
        for (let i = 0; i < entries.length; i++) {
            const p = entries[i];
            const entry = zip.files[p];
            if (!entry || entry.dir || !/^images\//i.test(p)) continue;
            const rel = p.replace(/^images\//i, '').trim();
            if (!rel) continue;
            const path = _sanitizeInDbPath(rel, 'IMAGE/imported-' + (imageCount + 1) + '.png');
            const b64 = await entry.async('base64');
            await InDB.saveFile(path, b64);
            markdown = markdown.replace(new RegExp(_escapeRegExp('images/' + rel), 'g'), 'indb:' + path);
            imageCount += 1;
        }

        return {
            markdown: markdown,
            fileName: _sanitizeInDbPath(mdPath, 'document.md'),
            imageCount: imageCount
        };
    }

    global.MddZipFormat = {
        MDD_FORMAT: MDD_FORMAT,
        MDD_VERSION: MDD_VERSION,
        sanitizeInDbPath: _sanitizeInDbPath,
        extractImagePaths: _extractImagePaths,
        exportToMdd: exportToMdd,
        importFromMddText: importFromMddText,
        importFromMddFile: importFromMddFile,
        exportToZip: exportToZip,
        importFromZipFile: importFromZipFile
    };
})(window);

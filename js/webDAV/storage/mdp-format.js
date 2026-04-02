/* mdp-format — 통일된 .mdp 저장/로드 포맷
   ZIP 기반: manifest.json + path별 파일 (이미지는 IMAGE/ 경로에 base64)
   의존: JSZip (전역) */

const MdpFormat = (() => {
    const MDP_ZIP_VERSION = 3;
    const MANIFEST_PATH = 'manifest.json';
    const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp)$/i;
    const IMAGE_FOLDER = 'IMAGE';

    /** 파일이 이미지인지 (path 기준) */
    function _isImagePath(path) {
        return path && IMAGE_EXT.test(path);
    }

    /** ZIP으로 mdp 내보내기. files: [{ path, name?, ext?, folder?, content, modified? }] */
    async function exportToZip(manifest, files) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip를 불러올 수 없습니다.');
        const zip = new JSZip();
        const m = {
            version: MDP_ZIP_VERSION,
            format: 'zip',
            type: manifest.type || 'full',
            savedAt: manifest.savedAt || new Date().toISOString(),
            tabs: manifest.tabs || [],
            activeId: manifest.activeId,
            nextId: manifest.nextId,
            folderName: manifest.folderName || 'mdp-export',
            filePaths: []
        };
        (files || []).forEach(f => {
            const path = (f.path || '').trim();
            if (!path) return;
            m.filePaths.push(path);
            const content = f.content != null ? String(f.content) : '';
            if (_isImagePath(path) && content) {
                const b64 = (typeof content === 'string' && content.startsWith('data:')) ? content.replace(/^data:image\/\w+;base64,/, '') : content;
                if (b64) zip.file(path, b64, { base64: true, createFolders: true });
            } else {
                zip.file(path, content, { createFolders: true });
            }
        });
        zip.file(MANIFEST_PATH, JSON.stringify(m, null, 0));
        return zip.generateAsync({ type: 'blob' });
    }

    /** ZIP mdp에서 데이터 파싱. 반환: { manifest, files }. manifest.json 없으면 gallery.json/project.json 폴백 */
    async function importFromZip(zipOrBlob) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip를 불러올 수 없습니다.');
        const zip = zipOrBlob instanceof JSZip ? zipOrBlob : await JSZip.loadAsync(zipOrBlob);
        let manifest = null;
        let paths = [];
        const manifestFile = zip.file(MANIFEST_PATH);
        if (manifestFile) {
            manifest = JSON.parse(await manifestFile.async('string'));
            paths = manifest.filePaths || [];
        } else {
            const galleryFile = zip.file('gallery.json');
            if (galleryFile) {
                const g = JSON.parse(await galleryFile.async('string'));
                manifest = { type: 'gallery', savedAt: g.createdAt, folderName: 'gallery-import' };
                const items = g.items || [];
                paths = [];
                for (let i = 0; i < items.length; i++) {
                    const idx = items[i].fileIndex != null ? items[i].fileIndex : i + 1;
                    const pNew = 'IMAGE/gallery-' + idx + '.png';
                    const pOld = 'image-' + idx + '.png';
                    if (zip.file(pNew)) paths.push(pNew);
                    else if (zip.file(pOld)) paths.push(pOld);
                }
            } else {
                const projectFile = zip.file('project.json');
                if (projectFile) {
                    const p = JSON.parse(await projectFile.async('string'));
                    manifest = { type: 'aiimage', savedAt: p.createdAt, folderName: 'aiimg-import', tabs: [] };
                    const results = p.results || [];
                    paths = results.map((r, i) => 'image-' + (i + 1) + '.png');
                    if (p.seedImage) paths.unshift('seed.png');
                } else {
                    throw new Error('manifest.json, gallery.json, project.json 중 하나가 필요합니다.');
                }
            }
        }
        const files = [];
        for (const path of paths) {
            const entry = zip.file(path);
            if (!entry) continue;
            const c = _isImagePath(path) ? await entry.async('base64') : await entry.async('string');
            const parts = path.split('/');
            const name = parts.pop() || path;
            const folder = parts.length ? parts.join('/') : '/';
            const ext = (name.split('.').pop() || 'md').toLowerCase();
            files.push({ path, name, ext, folder, content: c, modified: Date.now() });
        }
        return { manifest, files };
    }

    /** 파일이 ZIP mdp인지 (PK 시그니처) */
    async function isZipMdp(file) {
        if (!file || !file.arrayBuffer) return false;
        const buf = await file.slice(0, 4).arrayBuffer();
        const arr = new Uint8Array(buf);
        return arr[0] === 0x50 && arr[1] === 0x4B;
    }

    return { exportToZip, importFromZip, isZipMdp, MDP_ZIP_VERSION, MANIFEST_PATH };
})();
window.MdpFormat = MdpFormat;

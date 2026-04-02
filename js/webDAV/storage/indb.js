/* ═══════════════════════════════════════════════════════════
   inDB — IndexedDB 백업 폴더 (History 저장 시 자동 저장, .mdp 불러오기 시 저장)
   의존: el (dom.js), TM, GH (GitHub에서 가져오기 시)
═══════════════════════════════════════════════════════════ */
const InDB = (() => {
    const DB_NAME = 'mdpro-indb-v1';
    const DB_VER = 1;
    let allFiles = [];
    let folderName = '';
    let _lastSavedAt = null;  // ISO string
    let _lastSavedMemo = null;
    let _searchQuery = '';
    let _syncStatus = 'idle';  // 'idle' | 'syncing' — GitHub 동기화 중 표시용
    let filtered = [];
    const GH_LOCKED_KEY = 'indb_locked_folders';

    function _getDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
                if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
            };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }

    async function _idbGet(store, key) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const r = db.transaction(store, 'readonly').objectStore(store).get(key);
            r.onsuccess = () => res(r.result ?? null);
            r.onerror = () => rej(r.error);
        });
    }

    async function _idbAll(store) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const out = [];
            const r = db.transaction(store, 'readonly').objectStore(store).openCursor();
            r.onsuccess = () => {
                const c = r.result;
                if (c) { out.push(c.value); c.continue(); }
                else res(out);
            };
            r.onerror = () => rej(r.error);
        });
    }

    async function _idbDel(store, key) {
        const db = await _getDB();
        return new Promise((res, rej) => {
            const r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
            r.onsuccess = () => res();
            r.onerror = () => rej(r.error);
        });
    }

    /** 경로로 파일 조회 (오디오 등 바이너리 해석용) */
    async function getFileByPath(path) {
        if (!path || typeof path !== 'string') return null;
        const db = await _getDB();
        return new Promise((res, rej) => {
            const r = db.transaction('files', 'readonly').objectStore('files').get(path.trim());
            r.onsuccess = () => res(r.result ?? null);
            r.onerror = () => rej(r.error);
        });
    }

    function _getLockedFolders() {
        try {
            const raw = localStorage.getItem(GH_LOCKED_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) { return new Set(); }
    }

    function _setLockedFolders(set) {
        try { localStorage.setItem(GH_LOCKED_KEY, JSON.stringify([...set])); } catch (e) {}
    }

    /** History 저장 또는 .mdp 불러오기 시 호출 — 파일 목록을 inDB에 저장 (깃허브와 동일한 path 기반 폴더구조). opts.preservePathPrefixes가 있으면 해당 경로 파일은 유지(깃허브 동기화 시 AUDIO 보존용) */
    async function saveBackup(filesArr, name, savedAt, memo, opts) {
        if (!filesArr || !Array.isArray(filesArr)) return false;
        opts = opts || {};
        const preservePrefixes = opts.preservePathPrefixes || [];
        const db = await _getDB();
        let preserved = [];
        if (preservePrefixes.length > 0) {
            const all = await _idbAll('files');
            preserved = all.filter(f => {
                const p = (f.path || '').trim();
                return p && preservePrefixes.some(prefix => p.startsWith(prefix));
            });
        }
        const tx = db.transaction(['meta', 'files'], 'readwrite');
        const metaSt = tx.objectStore('meta');
        const filesSt = tx.objectStore('files');
        const normalized = filesArr.map(f => {
            const path = (f.path || '').trim();
            if (!path) return null;
            const parts = path.split('/');
            const fileName = parts.pop() || 'untitled';
            const folder = parts.length ? parts.join('/') : '/';
            const ext = (f.ext || fileName.split('.').pop() || 'md').toLowerCase();
            return {
                name: f.name || fileName,
                ext: ext,
                folder,
                path,
                content: (f.content != null) ? String(f.content) : '',
                modified: f.modified || Date.now()
            };
        }).filter(Boolean);
        filesSt.clear();
        normalized.forEach(f => filesSt.put(f, f.path));
        preserved.forEach(f => filesSt.put(f, f.path));
        const savedAtIso = savedAt || new Date().toISOString();
        const totalCount = normalized.length + preserved.length;
        metaSt.put({
            folderName: name || 'inDB 백업',
            fileCount: totalCount,
            savedAt: Date.now(),
            savedAtIso,
            memo: (memo != null && String(memo).trim() !== '') ? String(memo).trim() : null
        }, 'root');
        return new Promise((res, rej) => {
            tx.oncomplete = () => {
                const merged = normalized.concat(preserved);
                merged.sort((a, b) => (a.path || '').localeCompare(b.path || ''));
                allFiles = merged;
                folderName = name || 'inDB 백업';
                _lastSavedAt = savedAtIso;
                _lastSavedMemo = (memo != null && String(memo).trim() !== '') ? String(memo).trim() : null;
                _updateHdr();
                res(true);
            };
            tx.onerror = () => rej(tx.error);
        });
    }

    function _formatSavedAt(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
            const h = d.getHours(), min = d.getMinutes();
            return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0') + ' ' + String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
        } catch (e) { return ''; }
    }

    function _showProgress(pct, label) {
        const v = Math.min(100, Math.max(0, pct));
        const s = Math.round(v) + '%';
        const wrap = document.getElementById('indb-progress-wrap');
        const bar = document.getElementById('indb-progress-bar');
        const pctEl = document.getElementById('indb-progress-pct');
        const labelEl = document.getElementById('indb-progress-label');
        if (wrap) wrap.style.display = '';
        if (bar) bar.style.width = v + '%';
        if (pctEl) pctEl.textContent = s;
        if (labelEl) labelEl.textContent = label != null ? label : (v >= 100 ? '완료' : '가져오는 중');
        const ghWrap = document.getElementById('gh-sync-progress-wrap');
        const ghBar = document.getElementById('gh-sync-progress-bar');
        const ghPct = document.getElementById('gh-sync-progress-pct');
        const ghLabel = document.getElementById('gh-sync-progress-label');
        if (ghWrap) ghWrap.style.display = '';
        if (ghBar) ghBar.style.width = v + '%';
        if (ghPct) ghPct.textContent = s;
        if (ghLabel) ghLabel.textContent = label != null ? label : (v >= 100 ? '완료' : '가져오는 중');
    }

    function _hideProgress() {
        const wrap = document.getElementById('indb-progress-wrap');
        if (wrap) wrap.style.display = 'none';
        const ghWrap = document.getElementById('gh-sync-progress-wrap');
        if (ghWrap) ghWrap.style.display = 'none';
    }

    /** GitHub 동기화 중일 때 헤더에 "동기화 중" 표시 */
    function _setSyncStatus(status) {
        _syncStatus = status;
        const el = document.getElementById('indb-sync-status');
        if (el) el.style.display = status === 'syncing' ? '' : 'none';
        if (status === 'idle') _updateHdr();
    }

    /** GitHub에서 현재 저장소 파일 전체를 inDB로 백업 (백그라운드 + 진행률 표시). opts.fromAuto === true 이면 자동 동기화로 기록 */
    async function syncFromGitHub(opts) {
        opts = opts || {};
        const fromAuto = !!opts.fromAuto;
        if (typeof GH === 'undefined' || !GH.cfg) {
            if (typeof App !== 'undefined' && App._toast) App._toast('GitHub 연결이 필요합니다');
            return;
        }
        const files = (GH.getFiles && GH.getFiles()) || [];
        if (!files.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('GitHub에 파일이 없습니다');
            return;
        }
        _setSyncStatus('syncing');
        try {
            const tabByPath = {};
            if (typeof TM !== 'undefined' && TM.getAll) {
                TM.getAll().forEach(t => {
                    const p = (t.ghPath || t.filePath || '').replace(/^indb:/, '');
                    if (p) tabByPath[p] = t;
                });
            }
            _showProgress(0, '가져오는 중');
            const total = files.length;
            const merged = [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                let content = '';
                if (tabByPath[f.path] && tabByPath[f.path].content != null) {
                    content = tabByPath[f.path].content;
                } else if (GH.fetchFileContent) {
                    content = await GH.fetchFileContent(f.path);
                }
                const parts = (f.path || '').split('/');
                const fileName = parts.pop() || 'untitled';
                const folder = parts.length ? parts.join('/') : '/';
                merged.push({
                    path: f.path,
                    name: f.name || fileName,
                    ext: (f.ext || fileName.split('.').pop() || 'md').toLowerCase(),
                    folder,
                    content,
                    modified: f.date || f.modified || Date.now()
                });
                const pct = ((i + 1) / total) * 100;
                _showProgress(pct, pct >= 100 ? '완료' : '가져오는 중');
                await new Promise(r => setTimeout(r, 0));
            }
            const name = (GH.getFolderName && GH.getFolderName()) || 'github';
            const memo = fromAuto ? '자동 동기화 (' + merged.length + '개)' : 'GitHub에서 가져옴 (' + merged.length + '개)';
            await saveBackup(merged, name, new Date().toISOString(), memo, { preservePathPrefixes: ['AUDIO/'] });
            _showProgress(100, '완료');
            await new Promise(r => setTimeout(r, 300));
            _hideProgress();
            if (typeof SB !== 'undefined') {
                if (SB.switchSource) SB.switchSource('indb');
                if (SB.switchTab) SB.switchTab('files');
            }
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ GitHub → inDB 백업 완료 (' + merged.length + '개)');
        } finally {
            _setSyncStatus('idle');
        }
    }

    function _updateHdr() {
        const nameEl = document.getElementById('indb-folder-name');
        const savedEl = document.getElementById('indb-saved-info');
        const linkEl = document.getElementById('indb-repo-link');
        if (!nameEl) return;
        const repoMatch = (folderName || '').match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/);
        if (repoMatch) {
            /* GitHub 저장소일 때: 주소 텍스트는 넣지 않고 ↗ 링크만 표시 (겹침 방지). 전체 주소는 링크 title에 */
            nameEl.textContent = '';
            nameEl.title = folderName;
            nameEl.style.flex = '0';
            nameEl.style.minWidth = '0';
        } else {
            nameEl.textContent = folderName || 'inDB 백업';
            nameEl.title = folderName || 'inDB 백업';
            nameEl.style.flex = '';
            nameEl.style.minWidth = '';
        }
        if (linkEl) {
            if (repoMatch) {
                linkEl.href = 'https://github.com/' + folderName;
                linkEl.title = 'GitHub 저장소 열기: ' + folderName;
                linkEl.style.display = '';
            } else {
                linkEl.href = '#';
                linkEl.style.display = 'none';
            }
        }
        if (savedEl) {
            if (_syncStatus === 'syncing') {
                savedEl.style.display = 'none';
            } else if (_lastSavedAt) {
                const dateStr = _formatSavedAt(_lastSavedAt);
                const memoStr = _lastSavedMemo || '메모 없음';
                savedEl.textContent = '최종저장: ' + dateStr + ' ' + memoStr;
                savedEl.title = '최종저장: ' + dateStr + ' ' + memoStr;
                savedEl.style.display = '';
            } else {
                savedEl.style.display = 'none';
            }
        }
    }

    /** 단일 파일 저장 (기존 파일 업데이트 또는 추가) */
    async function saveFile(path, content) {
        if (!path || path.trim() === '') return false;
        const parts = path.split('/');
        const fileName = parts.pop() || 'untitled';
        const folder = parts.length ? parts.join('/') : '/';
        const ext = (fileName.split('.').pop() || 'md').toLowerCase();
        const normalized = {
            name: fileName,
            ext: ext,
            folder,
            path: path.trim(),
            content: content != null ? String(content) : '',
            modified: Date.now()
        };
        try {
            const db = await _getDB();
            /* meta가 없을 수 있으므로 files만 단독 트랜잭션으로 저장 */
            await new Promise((res, rej) => {
                const tx = db.transaction('files', 'readwrite');
                tx.objectStore('files').put(normalized, normalized.path);
                tx.oncomplete = res;
                tx.onerror = () => rej(tx.error);
                tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
            });
            /* meta 업데이트는 별도 시도 (실패해도 파일 저장은 성공으로 처리) */
            try {
                const meta = await _idbGet('meta', 'root');
                if (meta) {
                    const db2 = await _getDB();
                    await new Promise((res, rej) => {
                        const tx2 = db2.transaction('meta', 'readwrite');
                        tx2.objectStore('meta').put({
                            ...meta,
                            fileCount: allFiles.length + 1,
                            savedAt: Date.now(),
                            savedAtIso: new Date().toISOString(),
                            memo: meta.memo
                        }, 'root');
                        tx2.oncomplete = res;
                        tx2.onerror = () => rej(tx2.error);
                    });
                }
            } catch (_) {}
            const existing = allFiles.find(f => f.path === normalized.path);
            if (existing) {
                existing.content = normalized.content;
                existing.modified = normalized.modified;
            } else {
                allFiles.push(normalized);
                allFiles.sort((a, b) => a.path.localeCompare(b.path));
            }
            _applyFilters();
            _render();
            return true;
        } catch (e) {
            console.error('[InDB] saveFile 실패:', path, e);
            throw e;
        }
    }

    /** 새 파일 생성 (inDB에 추가) */
    async function createNewFile(folderPath, fileName) {
        const folder = (folderPath || '/').replace(/^\/|\/$/g, '');
        const base = folder ? folder + '/' : '';
        const name = (fileName || 'untitled').replace(/\.[^.]+$/, '');
        const ext = (fileName && fileName.includes('.')) ? fileName.split('.').pop().toLowerCase() : 'md';
        const path = base + (name + (['md','txt','html'].includes(ext) ? '.' + ext : '.md'));
        if (allFiles.some(f => f.path === path)) {
            if (typeof App !== 'undefined' && App._toast) App._toast('같은 경로의 파일이 있습니다.');
            return null;
        }
        await saveFile(path, '');
        const f = allFiles.find(x => x.path === path);
        if (f && typeof TM !== 'undefined') return f;
        return null;
    }

    /** 새 파일 생성 프롬프트: 폴더 선택 + 파일명 입력 모달 (밝은 UI) */
    function createNewFilePrompt() {
        const folderOptions = _getFolderOptionsForNewFile();
        _showNewFileModal(folderOptions).then(result => {
            if (!result) return;
            const folderPath = result.folderVal || '';
            let fileName = (result.filename || 'Untitled').trim();
            if (!fileName) return;
            if (!/\.(md|txt|html)$/i.test(fileName)) fileName = fileName + '.md';
            createNewFile(folderPath, fileName).then(f => {
                if (f && typeof TM !== 'undefined') _openFile(f);
            });
        });
    }

    /** 새 파일 모달용 폴더 목록 (루트 + 기존 폴더들, 정렬) */
    function _getFolderOptionsForNewFile() {
        const folders = new Set(['']);
        allFiles.forEach(f => {
            const folder = (f.folder || '').replace(/^\/|\/$/g, '');
            if (folder !== '') folders.add(folder);
        });
        const sorted = [...folders].sort((a, b) => a.localeCompare(b));
        return sorted.map(f => ({
            value: f,
            label: f === '' ? '루트' : '📁 ' + f + ' (' + f.split('/').pop() + ')'
        }));
    }

    /** 새 파일 만들기 모달 표시 (밝은 배경, 폴더 선택 + 파일명). 반환: Promise<{ folderVal, filename } | null> */
    function _showNewFileModal(folderOptions) {
        return new Promise(resolve => {
            const existing = document.getElementById('indb-newfile-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'indb-newfile-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';

            const selOptions = folderOptions.map(o =>
                `<option value="${(o.value || '').replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');

            const box = document.createElement('div');
            box.className = 'indb-newfile-modal-box';
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2);';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📄 새 파일 만들기</span>
                    <button id="indb-nf-close" type="button" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px;line-height:1;padding:0 4px" aria-label="닫기">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더 선택</label>
                    <select id="indb-nf-folder" style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${selOptions}
                    </select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">파일 이름 <span style="opacity:.7">(.md 자동 추가)</span></label>
                    <input id="indb-nf-name" type="text" value="Untitled" autocomplete="off"
                        style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box"
                        placeholder="파일명을 입력하세요">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="indb-nf-cancel" type="button" style="padding:6px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#444;font-size:12px;cursor:pointer">취소</button>
                    <button id="indb-nf-ok" type="button" style="padding:6px 18px;border-radius:6px;border:none;background:#5c4cd4;color:#fff;font-size:12px;font-weight:600;cursor:pointer">✓ 생성</button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const nameInput = document.getElementById('indb-nf-name');
            const folderSel = document.getElementById('indb-nf-folder');
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

            const close = (result) => { ov.remove(); resolve(result); };

            document.getElementById('indb-nf-close').onclick = () => close(null);
            document.getElementById('indb-nf-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('indb-nf-ok').onclick = () => {
                const fn = nameInput.value.trim();
                if (!fn) { nameInput.focus(); return; }
                close({ folderVal: folderSel.value, filename: fn });
            };
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('indb-nf-ok').click();
                if (e.key === 'Escape') close(null);
            });
        });
    }

    /** 저장 방법 선택 모달에서 호출 — 현재 탭 내용을 inDB 폴더·파일명 지정 후 저장 */
    async function showSaveToInDBModal() {
        await load();
        const tab = typeof TM !== 'undefined' && TM.getActive ? TM.getActive() : null;
        const content = (typeof el === 'function' ? el('editor') : null) ? el('editor').value : (tab && tab.content != null ? tab.content : '');
        let defaultName = (tab && tab.title) ? tab.title : 'Untitled';
        if (!/\.(md|txt|html)$/i.test(defaultName)) defaultName = defaultName + '.md';
        defaultName = defaultName.replace(/[\\:*?"<>|]/g, '_');
        const folderOptions = _getFolderOptionsForNewFile();
        const result = await _showSaveToInDBModal(folderOptions, defaultName);
        if (!result) return false;
        const folderPath = (result.folderVal || '').trim();
        let fileName = (result.filename || '').trim();
        if (!fileName) return false;
        if (!/\.(md|txt|html)$/i.test(fileName)) fileName = fileName + '.md';
        const base = folderPath ? folderPath + '/' : '';
        const path = base + fileName.replace(/[\\:*?"<>|]/g, '_');
        let finalContent = content;
        if (typeof AudioPersist !== 'undefined' && AudioPersist.extractAndReplace) {
            finalContent = await AudioPersist.extractAndReplace(content, path, (ap, b64) => saveFile(ap, b64));
        }
        if (typeof ImagePersist !== 'undefined' && ImagePersist.extractAndReplace) {
            finalContent = await ImagePersist.extractAndReplace(finalContent, path, (imgPath, b64) => saveFile(imgPath, b64));
        }
        const ok = await saveFile(path, finalContent);
        if (ok && tab && typeof TM !== 'undefined') {
            tab.filePath = 'indb:' + path;
            tab.content = finalContent;
            if (TM.markClean) TM.markClean(tab.id);
            if (TM.persist) TM.persist();
            if (TM.renderTabs) TM.renderTabs();
        }
        if (ok && typeof App !== 'undefined' && App._toast) App._toast('✓ inDB에 저장됨');
        return ok;
    }

    /** inDB 저장 모달 표시 (폴더 선택 + 파일명). 반환: Promise<{ folderVal, filename } | null> */
    function _showSaveToInDBModal(folderOptions, defaultFilename) {
        return new Promise(resolve => {
            const existing = document.getElementById('indb-save-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'indb-save-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';

            const selOptions = folderOptions.map(o =>
                `<option value="${(o.value || '').replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');

            const box = document.createElement('div');
            box.className = 'indb-newfile-modal-box';
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2);';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📄 inDB에 다른이름 저장</span>
                    <button id="indb-save-close" type="button" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px;line-height:1;padding:0 4px" aria-label="닫기">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">위치 (폴더)</label>
                    <select id="indb-save-folder" style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${selOptions}
                    </select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">파일명</label>
                    <input id="indb-save-name" type="text" value="${_esc(defaultFilename || 'Untitled.md').replace(/"/g, '&quot;')}" autocomplete="off"
                        style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box"
                        placeholder="파일명을 입력하세요">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="indb-save-cancel" type="button" style="padding:6px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#444;font-size:12px;cursor:pointer">취소</button>
                    <button id="indb-save-ok" type="button" style="padding:6px 18px;border-radius:6px;border:none;background:#5c4cd4;color:#fff;font-size:12px;font-weight:600;cursor:pointer">✓ 저장</button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const nameInput = document.getElementById('indb-save-name');
            const folderSel = document.getElementById('indb-save-folder');
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

            const close = (result) => { ov.remove(); resolve(result); };

            document.getElementById('indb-save-close').onclick = () => close(null);
            document.getElementById('indb-save-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('indb-save-ok').onclick = () => {
                const fn = nameInput.value.trim();
                if (!fn) { nameInput.focus(); return; }
                close({ folderVal: folderSel.value, filename: fn });
            };
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('indb-save-ok').click();
                if (e.key === 'Escape') close(null);
            });
        });
    }

    /** 새 폴더 생성 프롬프트: 폴더 선택 + 폴더명 입력 모달 (새 파일 만들기 형식과 동일) */
    function createNewFolderPrompt() {
        const folderOptions = _getFolderOptionsForNewFile();
        _showNewFolderModal(folderOptions).then(result => {
            if (!result) return;
            const parentFolder = (result.folderVal || '').trim();
            let folderName = (result.folderName || '').trim();
            if (!folderName) return;
            folderName = folderName.replace(/[/\\:*?"<>|]/g, '_');
            const p = parentFolder ? parentFolder + '/' + folderName : folderName;
            const fullPath = p + '/.gitkeep';
            if (allFiles.some(f => f.path === fullPath)) {
                if (typeof App !== 'undefined' && App._toast) App._toast('이미 존재하는 폴더입니다.');
                return;
            }
            if (allFiles.some(f => f.path.startsWith(p + '/'))) {
                if (typeof App !== 'undefined' && App._toast) App._toast('폴더가 이미 있습니다.');
                return;
            }
            saveFile(fullPath, '').then(() => {
                _render();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 폴더 생성됨: ' + p);
            });
        });
    }

    /** 새 폴더 만들기 모달 표시 (저장 폴더 선택 + 폴더명 입력). 반환: Promise<{ folderVal, folderName } | null> */
    function _showNewFolderModal(folderOptions) {
        return new Promise(resolve => {
            const existing = document.getElementById('indb-newfolder-modal');
            if (existing) existing.remove();

            const ov = document.createElement('div');
            ov.id = 'indb-newfolder-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';

            const selOptions = folderOptions.map(o =>
                `<option value="${(o.value || '').replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');

            const box = document.createElement('div');
            box.className = 'indb-newfile-modal-box';
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2);';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📁 새 폴더 만들기</span>
                    <button id="indb-nd-close" type="button" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px;line-height:1;padding:0 4px" aria-label="닫기">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더 선택</label>
                    <select id="indb-nd-folder" style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${selOptions}
                    </select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">폴더 이름</label>
                    <input id="indb-nd-name" type="text" value="새폴더" autocomplete="off"
                        style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;color:#1a1a2e;font-size:13px;padding:7px 10px;outline:none;box-sizing:border-box"
                        placeholder="폴더명을 입력하세요">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="indb-nd-cancel" type="button" style="padding:6px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#444;font-size:12px;cursor:pointer">취소</button>
                    <button id="indb-nd-ok" type="button" style="padding:6px 18px;border-radius:6px;border:none;background:#5c4cd4;color:#fff;font-size:12px;font-weight:600;cursor:pointer">✓ 생성</button>
                </div>`;

            ov.appendChild(box);
            document.body.appendChild(ov);

            const nameInput = document.getElementById('indb-nd-name');
            const folderSel = document.getElementById('indb-nd-folder');
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);

            const close = (result) => { ov.remove(); resolve(result); };

            document.getElementById('indb-nd-close').onclick = () => close(null);
            document.getElementById('indb-nd-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('indb-nd-ok').onclick = () => {
                const fn = nameInput.value.trim();
                if (!fn) { nameInput.focus(); return; }
                close({ folderVal: folderSel.value, folderName: fn });
            };
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') document.getElementById('indb-nd-ok').click();
                if (e.key === 'Escape') close(null);
            });
        });
    }

    /** inDB에서 백업 로드 후 UI 갱신 */
    async function load() {
        const meta = await _idbGet('meta', 'root');
        const files = await _idbAll('files');
        folderName = meta ? (meta.folderName || 'inDB 백업') : 'inDB 백업';
        _lastSavedAt = meta && meta.savedAtIso ? meta.savedAtIso : (meta && meta.savedAt ? new Date(meta.savedAt).toISOString() : null);
        _lastSavedMemo = meta && meta.memo != null ? meta.memo : null;
        allFiles = files || [];
        _applyFilters();
        _updateHdr();
        _render();
        /* 새로고침/탭 전환 후 문서의 indb: 이미지가 미리보기에 표시되도록 재해석 */
        if (typeof ImagePersist !== 'undefined' && ImagePersist.resolveInContainer) {
            var pc = document.getElementById('preview-container');
            if (pc && pc.querySelectorAll && pc.querySelectorAll('img[src^="indb:"]').length > 0) {
                setTimeout(function() {
                    ImagePersist.resolveInContainer(pc).catch(function() {});
                }, 0);
            }
        }
    }

    function search(q) {
        _searchQuery = (q && q.trim()) ? q.trim() : '';
        _applyFilters();
        _render();
    }

    function _applyFilters() {
        let base = allFiles;
        if (typeof SB !== 'undefined' && SB._hideIndbImageFolder && SB._hideIndbImageFolder()) {
            base = base.filter(f => !(f.path || '').startsWith('IMAGE/'));
        }
        filtered = _searchQuery
            ? base.filter(f => f.name.toLowerCase().includes(_searchQuery.toLowerCase()))
            : base;
    }

    function _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** 파일 용량(바이트) → "1.2KB", "3.5MB" 등 문자열 */
    function _formatSize(bytes) {
        if (bytes == null || bytes < 0) return '';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return bytes + 'B';
    }

    /** inDB 파일 객체에서 용량(바이트) 계산. content가 base64면 디코드 크기, 아니면 UTF-8 바이트 수 */
    function _indbFileSize(f) {
        const c = f.content;
        if (c == null || typeof c !== 'string') return null;
        if (c.length === 0) return 0;
        if (/^[A-Za-z0-9+/]+=*$/.test(c)) return Math.ceil((c.replace(/=+$/, '').length * 3) / 4);
        try { return new Blob([c]).size; } catch (e) { return c.length; }
    }

    function _openFile(f) {
        if (!f || typeof TM === 'undefined') return;
        const name = f.name.replace(/\.[^.]+$/, '');
        const ft = f.ext === 'html' ? 'md' : f.ext;
        const content = f.ext === 'html' && (TM._htmlToEditableContent)
            ? TM._htmlToEditableContent(f.content)
            : (f.content != null ? String(f.content) : '');
        const existing = TM.getAll().find(t => t.filePath === 'indb:' + f.path || t.title === name);
        if (existing) { TM.switchTab(existing.id); return; }
        const tab = TM.newTab(name, content, ft);
        tab.filePath = 'indb:' + f.path;
        TM.markClean(tab.id);
        TM.renderTabs();
        TM.persist();
    }

    function toggleFoldAll() {
        const list = document.getElementById('indb-list');
        if (!list) return;
        const folders = list.querySelectorAll('.ft-folder');
        if (!folders.length) return;
        const lockedSet = _getLockedFolders();
        const anyExpanded = Array.from(folders).some(f => !f.classList.contains('collapsed'));
        const collapse = anyExpanded;
        folders.forEach(f => {
            const path = f.dataset.path;
            if (!collapse && path && lockedSet.has(path)) return;
            const hdr = f.querySelector('.ft-folder-hdr');
            const toggle = hdr && hdr.querySelector('.ft-toggle');
            const isEmpty = toggle && toggle.textContent === '—';
            if (collapse) {
                f.classList.add('collapsed');
                if (toggle && !isEmpty) toggle.textContent = '▸';
            } else {
                f.classList.remove('collapsed');
                if (toggle && !isEmpty) toggle.textContent = '▾';
            }
        });
        const foldBtn = document.getElementById('indb-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = collapse ? '▾' : '▽';
    }

    function _render() {
        const list = document.getElementById('indb-list');
        if (!list) return;
        list.innerHTML = '';
        if (!allFiles.length) {
            list.innerHTML = '<div class="files-empty">' +
                '<div style="font-size:28px;margin-bottom:8px">📦</div>' +
                '<div style="font-weight:600;margin-bottom:6px">inDB 백업이 없습니다</div>' +
                '<div style="color:var(--tx3);font-size:10px;line-height:1.7">History 저장을 누르거나<br>.mdp 파일을 불러오면<br>여기에 백업이 저장됩니다</div></div>';
            return;
        }
        const src = filtered;
        if (!src.length) {
            list.innerHTML = '<div class="files-empty">검색 결과 없음</div>';
            return;
        }
        const root = { name: '', children: {}, files: [] };
        src.forEach(f => {
            const parts = f.path.split('/');
            let node = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const seg = parts[i];
                if (!node.children[seg]) node.children[seg] = { name: seg, children: {}, files: [], _fullPath: (node._fullPath ? node._fullPath + '/' : '') + seg };
                node = node.children[seg];
            }
            node.files.push(f);
        });

        function countFiles(node) {
            const fileCount = node.files.filter(f => !f.name.endsWith('.gitkeep')).length;
            let n = fileCount;
            Object.values(node.children).forEach(c => { n += countFiles(c); });
            return n;
        }

        function renderNode(node, depth, container) {
            const indent = depth * 12;
            Object.keys(node.children).sort().forEach(folderName => {
                const child = node.children[folderName];
                child._fullPath = child._fullPath || (node._fullPath ? node._fullPath + '/' : '') + folderName;
                const totalFiles = countFiles(child);
                const isEmpty = totalFiles === 0;
                const folderEl = document.createElement('div');
                folderEl.className = 'ft-folder';
                folderEl.dataset.path = child._fullPath;
                const hdr = document.createElement('div');
                hdr.className = 'ft-folder-hdr';
                hdr.style.paddingLeft = (8 + indent) + 'px';
                const folderPath = child._fullPath;
                hdr.innerHTML =
                    `<span class="ft-toggle">${isEmpty ? '—' : '▾'}</span>` +
                    `<span class="ft-folder-icon">📂</span>` +
                    `<span class="ft-folder-name">${_esc(folderName)}</span>` +
                    `<span class="ft-folder-lock" title="접었을 때 잠금" role="button" tabindex="0">▼</span>` +
                    `<span class="ft-count" style="${isEmpty ? 'opacity:.4' : ''}">${isEmpty ? '빈 폴더' : totalFiles}</span>` +
                    `<button class="fg-add-btn" title="이 폴더에 새 파일 만들기" onclick="event.stopPropagation();InDB._createFileInFolder('${_esc(folderPath)}')">＋</button>` +
                    `<button class="folder-move-btn" title="폴더 이동" data-path="${_esc(folderPath)}" onclick="event.stopPropagation();InDB.moveFolder(this)">↗</button>` +
                    `<button class="folder-rename-btn" title="폴더명 고치기" data-path="${_esc(folderPath)}" onclick="event.stopPropagation();InDB.renameFolder(this)">✎</button>` +
                    `<button class="folder-del-btn" title="${isEmpty ? '빈 폴더 삭제' : '폴더 삭제 (내부 파일 포함)'}" data-path="${_esc(folderPath)}" data-empty="${isEmpty}" onclick="event.stopPropagation();InDB.confirmDeleteFolder(this)">🗑</button>`;
                hdr.onclick = (e) => {
                    if (e.target.closest('.ft-folder-lock')) return;
                    folderEl.classList.toggle('collapsed');
                    hdr.querySelector('.ft-toggle').textContent = folderEl.classList.contains('collapsed') ? '▸' : '▾';
                };
                const lockEl = hdr.querySelector('.ft-folder-lock');
                lockEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const locked = _getLockedFolders();
                    const path = child._fullPath;
                    if (locked.has(path)) {
                        locked.delete(path);
                        lockEl.classList.remove('ft-folder-lock-on');
                    } else {
                        locked.add(path);
                        folderEl.classList.add('collapsed');
                        hdr.querySelector('.ft-toggle').textContent = isEmpty ? '—' : '▸';
                        lockEl.classList.add('ft-folder-lock-on');
                    }
                    _setLockedFolders(locked);
                });
                folderEl.appendChild(hdr);
                const body = document.createElement('div');
                body.className = 'ft-folder-body';
                renderNode(child, depth + 1, body);
                folderEl.appendChild(body);
                container.appendChild(folderEl);
            });
            node.files.filter(f => !f.name.endsWith('.gitkeep')).sort((a, b) => (b.modified || 0) - (a.modified || 0)).forEach(f => {
                const row = document.createElement('div');
                row.className = 'file-item';
                row.style.paddingLeft = (18 + indent) + 'px';
                const icon = f.ext === 'html' ? '🌐' : f.ext === 'txt' ? '📄' : '📝';
                const sizeStr = _formatSize(_indbFileSize(f));
                const modStr = f.modified ? new Date(f.modified).toLocaleDateString('ko', { month: '2-digit', day: '2-digit' }) : '';
                const metaContent = sizeStr && modStr
                    ? `<span class="file-item-meta-size">${sizeStr}</span> · <span class="file-item-meta-date">${modStr}</span>`
                    : sizeStr ? `<span class="file-item-meta-size">${sizeStr}</span>` : modStr ? `<span class="file-item-meta-date">${modStr}</span>` : '';
                row.innerHTML =
                    `<span class="file-item-icon">${icon}</span>` +
                    `<span class="file-item-name">${_esc(f.name.replace(/\.[^.]+$/, ''))}</span>` +
                    (metaContent ? `<span class="file-item-meta">${metaContent}</span>` : '') +
                    `<button class="file-share-btn" title="GitHub(mdliveData)에 Push" onclick="event.stopPropagation();InDB.pushToGH(this)" style="font-size:9px;padding:1px 4px">🐙</button>` +
                    `<button class="file-share-btn" title="md-viewer에 Push (공유)" onclick="event.stopPropagation();InDB.pushToViewer(this)" style="font-size:9px;padding:1px 4px;color:#58c8f8">📤</button>` +
                    `<button class="file-move-btn" title="파일 이동" onclick="event.stopPropagation();InDB.moveFile(this)">↗</button>` +
                    `<button class="file-rename-btn" title="파일명 고치기" onclick="event.stopPropagation();InDB.renameFile(this)">✎</button>` +
                    `<button class="file-del-btn" title="파일 삭제" onclick="event.stopPropagation();InDB.confirmDelete(this)">🗑</button>`;
                row.title = f.path + (sizeStr ? '\n크기: ' + sizeStr : '') + (modStr ? '\n수정: ' + modStr : '');
                row._indbFile = f;
                row.onclick = () => _openFile(f);
                container.appendChild(row);
            });
        }
        renderNode(root, 0, list);
        const lockedSet = _getLockedFolders();
        list.querySelectorAll('.ft-folder').forEach(folderEl => {
            const path = folderEl.dataset.path;
            if (!path || !lockedSet.has(path)) return;
            folderEl.classList.add('collapsed');
            const hdr = folderEl.querySelector('.ft-folder-hdr');
            const toggle = hdr && hdr.querySelector('.ft-toggle');
            if (toggle && toggle.textContent !== '—') toggle.textContent = '▸';
            const lockSpan = hdr && hdr.querySelector('.ft-folder-lock');
            if (lockSpan) lockSpan.classList.add('ft-folder-lock-on');
        });
        const foldBtn = document.getElementById('indb-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = '▽';
    }

    /** 파일 삭제 확인 & 실행 */
    function confirmDelete(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._indbFile;
        if (!f) return;
        if (typeof DelConfirm === 'undefined') {
            if (!confirm(`"${f.name}"을(를) 삭제하시겠습니까?`)) return;
            _doDeleteFile(f);
            return;
        }
        DelConfirm.show({
            name: f.name,
            path: f.path,
            type: 'indb',
            onConfirm: async () => { await _doDeleteFile(f); },
        });
    }

    async function _doDeleteFile(f) {
        try {
            await _idbDel('files', f.path);
            allFiles = allFiles.filter(x => x.path !== f.path);
            _applyFilters();
            const tab = typeof TM !== 'undefined' && TM.getAll ? TM.getAll().find(t => (t.filePath || '').replace(/^indb:/, '') === f.path) : null;
            if (tab && typeof TM !== 'undefined' && TM.closeTab) TM.closeTab(tab.id);
            _render();
            if (typeof App !== 'undefined' && App._toast) App._toast(`🗑 ${f.name} 삭제 완료`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('삭제 실패: ' + (e.message || e));
        }
    }

    /** 폴더 삭제 확인 & 실행 */
    async function confirmDeleteFolder(btn) {
        const folderPath = btn.dataset.path;
        const isEmpty = btn.dataset.empty === 'true';
        if (!folderPath) return;
        const filesInFolder = allFiles.filter(f =>
            f.folder === folderPath || f.path.startsWith(folderPath + '/')
        );
        const fileCount = filesInFolder.filter(f => !f.name.endsWith('.gitkeep')).length;
        const folderName = folderPath.split('/').pop();
        const warnHtml = isEmpty
            ? `<div style="font-size:11px;color:#6af7b0;margin-top:6px">✅ 빈 폴더입니다. 안전하게 삭제됩니다.</div>`
            : `<div style="font-size:11px;color:#f7a06a;margin-top:6px;line-height:1.7">⚠ 이 폴더 안의 <b style="color:#ff8080">${fileCount}개 파일</b>이 모두 삭제됩니다.</div>`;
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--bg2);border:2px solid rgba(247,106,106,.4);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)';
        box.innerHTML = `
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px">
                <span style="font-size:20px">🗑</span>
                <span style="font-size:14px;font-weight:700;color:#f76a6a">inDB 폴더 삭제</span>
            </div>
            <div style="background:rgba(247,106,106,.08);border:1px solid rgba(247,106,106,.3);border-radius:8px;padding:12px 14px;margin-bottom:14px">
                <div style="font-size:11px;color:var(--tx3);margin-bottom:4px">삭제할 폴더</div>
                <div style="font-size:14px;font-weight:700;color:#f76a6a">${_esc(folderName)}</div>
                <div style="font-size:10px;color:var(--tx3);font-family:var(--fm)">${_esc(folderPath)}</div>
                ${warnHtml}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button id="indb-fdel-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">취소</button>
                <button id="indb-fdel-ok" style="padding:6px 18px;border-radius:6px;border:none;background:rgba(247,106,106,.2);border:1px solid rgba(247,106,106,.5);color:#f76a6a;font-size:12px;font-weight:700;cursor:pointer">🗑 삭제 확인</button>
            </div>`;
        ov.appendChild(box);
        document.body.appendChild(ov);
        const confirmed = await new Promise(resolve => {
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('indb-fdel-cancel').onclick = () => close(false);
            ov.onclick = (e) => { if (e.target === ov) close(false); };
            document.getElementById('indb-fdel-ok').onclick = () => close(true);
        });
        if (!confirmed) return;
        try {
            const toRemove = allFiles.filter(f =>
                f.folder === folderPath || f.path.startsWith(folderPath + '/')
            );
            for (const f of toRemove) await _idbDel('files', f.path);
            allFiles = allFiles.filter(f => f.folder !== folderPath && !f.path.startsWith(folderPath + '/'));
            _applyFilters();
            toRemove.forEach(f => {
                const tab = typeof TM !== 'undefined' && TM.getAll ? TM.getAll().find(t => (t.filePath || '').replace(/^indb:/, '') === f.path) : null;
                if (tab && typeof TM !== 'undefined' && TM.closeTab) TM.closeTab(tab.id);
            });
            _render();
            if (typeof App !== 'undefined' && App._toast) App._toast(`🗑 "${folderPath}" 폴더 삭제 완료`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('폴더 삭제 실패: ' + (e.message || e));
        }
    }

    /** 파일 이동 */
    async function moveFile(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._indbFile;
        if (!f) return;
        const currentFolder = (f.folder && f.folder !== '/') ? f.folder : '/';
        const folderSet = new Set(['/']);
        allFiles.forEach(ff => {
            const parts = ff.path.split('/');
            for (let i = 1; i < parts.length; i++) {
                folderSet.add(parts.slice(0, i).join('/'));
            }
        });
        allFiles.filter(x => x.name.endsWith('.gitkeep')).forEach(x => {
            const p = x.path.replace(/\/\.gitkeep$/, '');
            if (p) folderSet.add(p);
        });
        const folderOptions = [...folderSet].sort()
            .filter(p => p !== currentFolder)
            .map(p => ({ label: p === '/' ? '📁 (루트)' : '📂 ' + p, value: p }));
        if (!folderOptions.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이동할 폴더가 없습니다');
            return;
        }
        const destFolder = await _showMoveModal(f.name, folderOptions);
        if (destFolder === null) return;
        const destPath = destFolder === '/' ? f.name : destFolder + '/' + f.name;
        if (destPath === f.path) {
            if (typeof App !== 'undefined' && App._toast) App._toast('같은 폴더입니다');
            return;
        }
        try {
            const content = (typeof TM !== 'undefined' && TM.getAll) ? (() => {
                const t = TM.getAll().find(tab => (tab.filePath || '').replace(/^indb:/, '') === f.path);
                return t && t.content != null ? t.content : f.content;
            })() : f.content;
            await saveFile(destPath, content != null ? String(content) : '');
            await _idbDel('files', f.path);
            allFiles = allFiles.filter(x => x.path !== f.path);
            _applyFilters();
            const tab = typeof TM !== 'undefined' && TM.getAll ? TM.getAll().find(t => (t.filePath || '').replace(/^indb:/, '') === f.path) : null;
            if (tab) {
                tab.filePath = 'indb:' + destPath;
                TM.renderTabs();
            }
            _render();
            if (typeof App !== 'undefined' && App._toast) App._toast(`✅ "${f.name}" → "${destFolder === '/' ? '루트' : destFolder}" 이동 완료`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이동 실패: ' + (e.message || e));
        }
    }

    /** inDB: 폴더 접두어가 일치하는 파일을 한꺼번에 새 접두어 경로로 옮긴다 */
    async function _indbRelocateFolderPrefix(oldPrefix, newPrefix) {
        oldPrefix = String(oldPrefix || '').replace(/\/$/, '');
        newPrefix = String(newPrefix || '').replace(/\/$/, '');
        if (oldPrefix === newPrefix) return;
        const affected = allFiles.filter(f =>
            f.path.startsWith(oldPrefix + '/') || f.path === oldPrefix + '/.gitkeep'
        );
        if (!affected.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이동·이름변경할 파일이 없습니다');
            return;
        }
        const moving = new Set(affected.map(f => f.path));
        for (const f of affected) {
            const np = newPrefix + f.path.slice(oldPrefix.length);
            if (allFiles.some(x => x.path === np && !moving.has(x.path))) {
                throw new Error('대상 경로 충돌: ' + np);
            }
        }
        const sorted = [...affected].sort((a, b) => b.path.length - a.path.length);
        for (const f of sorted) {
            const newPath = newPrefix + f.path.slice(oldPrefix.length);
            const content = (typeof TM !== 'undefined' && TM.getAll) ? (() => {
                const t = TM.getAll().find(tab => (tab.filePath || '').replace(/^indb:/, '') === f.path);
                return t && t.content != null ? t.content : f.content;
            })() : f.content;
            const pathParts = newPath.split('/');
            const fileName = pathParts.pop() || 'untitled';
            const folder = pathParts.length ? pathParts.join('/') : '/';
            const extRaw = (fileName.split('.').pop() || 'md').toLowerCase();
            const ext = ['md', 'txt', 'html'].includes(extRaw) ? extRaw : 'md';
            const normalized = {
                name: fileName,
                ext,
                folder,
                path: newPath,
                content: content != null ? String(content) : '',
                modified: Date.now(),
            };
            await _idbDel('files', f.path);
            await _idbPut('files', newPath, normalized);
            allFiles = allFiles.filter(x => x.path !== f.path);
            allFiles.push(normalized);
        }
        allFiles.sort((a, b) => a.path.localeCompare(b.path));
        if (typeof TM !== 'undefined' && TM.getAll) {
            TM.getAll().forEach(t => {
                const fp = (t.filePath || '').replace(/^indb:/, '');
                if (!fp) return;
                if (fp.startsWith(oldPrefix + '/')) {
                    t.filePath = 'indb:' + newPrefix + fp.slice(oldPrefix.length);
                }
            });
            TM.renderTabs();
        }
        _applyFilters();
        _render();
    }

    /** inDB 파일명만 변경(같은 폴더) */
    async function renameFile(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._indbFile;
        if (!f) return;
        const input = prompt('새 파일명 (확장자 포함)', f.name);
        if (input == null) return;
        const newName = String(input).trim().replace(/[\\/:*?"<>|]/g, '_');
        if (!newName || newName === f.name) return;
        const curFolder = (f.folder && f.folder !== '/') ? f.folder : '/';
        const destPath = curFolder === '/' ? newName : curFolder + '/' + newName;
        if (allFiles.some(x => x.path === destPath)) {
            if (typeof App !== 'undefined' && App._toast) App._toast('같은 이름의 파일이 이미 있습니다');
            return;
        }
        try {
            const content = (typeof TM !== 'undefined' && TM.getAll) ? (() => {
                const t = TM.getAll().find(tab => (tab.filePath || '').replace(/^indb:/, '') === f.path);
                return t && t.content != null ? t.content : f.content;
            })() : f.content;
            await saveFile(destPath, content != null ? String(content) : '');
            await _idbDel('files', f.path);
            allFiles = allFiles.filter(x => x.path !== f.path);
            _applyFilters();
            const tab = typeof TM !== 'undefined' && TM.getAll ? TM.getAll().find(t => (t.filePath || '').replace(/^indb:/, '') === f.path) : null;
            if (tab) {
                tab.filePath = 'indb:' + destPath;
                tab.title = newName.replace(/\.[^.]+$/, '');
                TM.renderTabs();
            }
            _render();
            if (typeof App !== 'undefined' && App._toast) App._toast(`✅ 파일명 변경: ${newName}`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이름 변경 실패: ' + (e.message || e));
        }
    }

    /** inDB 폴더명만 변경 */
    async function renameFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath) return;
        const parts = folderPath.split('/').filter(Boolean);
        const leaf = parts.pop();
        if (!leaf) return;
        const parent = parts.length ? parts.join('/') : '';
        const input = prompt('새 폴더 이름', leaf);
        if (input == null) return;
        const newLeaf = String(input).trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\/+/g, '');
        if (!newLeaf || newLeaf === leaf) return;
        const newFull = parent ? parent + '/' + newLeaf : newLeaf;
        try {
            await _indbRelocateFolderPrefix(folderPath, newFull);
            if (typeof App !== 'undefined' && App._toast) App._toast(`✅ 폴더명 변경: ${newLeaf}`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('폴더명 변경 실패: ' + (e.message || e));
        }
    }

    /** inDB 폴더를 다른 상위 폴더로 이동(폴더 이름 유지) */
    async function moveFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath) return;
        const parts = folderPath.split('/').filter(Boolean);
        const leaf = parts.pop();
        if (!leaf) return;
        const parentPath = parts.length ? parts.join('/') : '';
        const parentKey = parentPath || '/';
        const isUnder = (p) => p === folderPath || (folderPath && p.startsWith(folderPath + '/'));

        const folderSet = new Set(['/']);
        allFiles.forEach(ff => {
            const ps = ff.path.split('/');
            for (let i = 1; i < ps.length; i++) {
                folderSet.add(ps.slice(0, i).join('/'));
            }
        });
        allFiles.filter(x => x.name.endsWith('.gitkeep')).forEach(x => {
            const p = x.path.replace(/\/\.gitkeep$/, '');
            if (p) folderSet.add(p);
        });
        const folderOptions = [...folderSet].sort()
            .filter(p => !isUnder(p) && p !== parentKey)
            .map(p => ({ label: p === '/' ? '📁 (루트)' : '📂 ' + p, value: p }));
        if (!folderOptions.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이동할 상위 폴더가 없습니다');
            return;
        }
        const destFolder = await _showMoveModal(leaf, folderOptions, '📦 폴더 이동');
        if (destFolder === null) return;
        const newFull = destFolder === '/' ? leaf : destFolder + '/' + leaf;
        if (newFull === folderPath) {
            if (typeof App !== 'undefined' && App._toast) App._toast('같은 폴더입니다');
            return;
        }
        try {
            await _indbRelocateFolderPrefix(folderPath, newFull);
            if (typeof App !== 'undefined' && App._toast) App._toast('✅ 폴더 이동 완료');
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('폴더 이동 실패: ' + (e.message || e));
        }
    }

    /** 이동 대상 폴더 선택 모달 (title 선택) */
    function _showMoveModal(fileName, folderOptions, title) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.6)';
            const head = title || '📦 파일 이동';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">${_esc(head)}</span>
                    <button id="indb-mov-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px;line-height:1;padding:0 4px">✕</button>
                </div>
                <div style="font-size:12px;color:var(--tx2);margin-bottom:12px;padding:8px 10px;background:var(--bg3);border-radius:6px">📝 <b>${_esc(fileName)}</b></div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:5px">이동할 폴더 선택</label>
                    <select id="indb-mov-dest" style="width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-size:12px;padding:7px 10px;outline:none;cursor:pointer;box-sizing:border-box">
                        ${folderOptions.map(o => `<option value="${_esc(o.value)}">${_esc(o.label)}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="indb-mov-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx2);font-size:12px;cursor:pointer">취소</button>
                    <button id="indb-mov-ok" style="padding:6px 18px;border-radius:6px;border:none;background:var(--ac);color:#fff;font-size:12px;font-weight:600;cursor:pointer">✔ 이동</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('indb-mov-close').onclick = () => close(null);
            document.getElementById('indb-mov-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('indb-mov-ok').onclick = () => close(document.getElementById('indb-mov-dest').value);
        });
    }

    /** inDB 파일 → GitHub Push */
    async function pushToGH(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._indbFile;
        if (!f) return;
        if (typeof GH === 'undefined' || !GH.cfg) {
            if (typeof App !== 'undefined' && App._toast) App._toast('GitHub 연결이 필요합니다');
            return;
        }
        let content = (typeof TM !== 'undefined' && TM.getAll) ? (() => {
            const t = TM.getAll().find(tab => (tab.filePath || '').replace(/^indb:/, '') === f.path);
            return t && t.content != null ? t.content : f.content;
        })() : f.content;
        if (content === undefined || content === null) content = f.content != null ? String(f.content) : '';
        btn.textContent = '⟳';
        btn.disabled = true;
        _ensurePushLogVisible();
        _showPushLog('📤 개별 파일 Push: ' + f.path);
        const ghCfg = GH.cfg;
        const base = (ghCfg.basePath ? ghCfg.basePath.replace(/\/$/, '') + '/' : '');
        const path = base + f.path;
        _showPushLog('git add ' + path);
        _showPushLog('git commit -m "Upload: ' + f.name.replace(/"/g, '\\"') + '"');
        _showPushLog('git push');
        _showPushLog('⟳ 업로드 중…');
        try {
            let sha = null;
            try {
                const info = await fetch(
                    `https://api.github.com/repos/${ghCfg.repo}/contents/${encodeURIComponent(path)}?ref=${ghCfg.branch}`,
                    { headers: { 'Authorization': `token ${ghCfg.token}`, 'Accept': 'application/vnd.github.v3+json' } }
                ).then(r => r.ok ? r.json() : null);
                if (info && info.sha) sha = info.sha;
            } catch (e) {}
            const b64 = btoa(unescape(encodeURIComponent(content)));
            const body = { message: `Upload: ${f.name}`, content: b64, branch: ghCfg.branch };
            if (sha) body.sha = sha;
            const res = await fetch(
                `https://api.github.com/repos/${ghCfg.repo}/contents/${encodeURIComponent(path)}`,
                { method: 'PUT', headers: { 'Authorization': `token ${ghCfg.token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(`GitHub ${res.status}: ${err.message || res.statusText}`);
            }
            btn.textContent = '🐙';
            btn.disabled = false;
            _showPushLog('✓ Push 완료: ' + f.name);
            if (typeof App !== 'undefined' && App._toast) App._toast(`🐙 mdliveData Push 완료: ${f.name}`);
            if (typeof GH !== 'undefined' && GH._render) GH._render();
        } catch (e) {
            btn.textContent = '🐙';
            btn.disabled = false;
            _showPushLog('❌ 실패: ' + (e.message || e));
            if (typeof App !== 'undefined' && App._toast) App._toast('Push 실패: ' + (e.message || e));
        }
    }

    /** inDB 파일 → md-viewer Push */
    async function pushToViewer(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._indbFile;
        if (!f) return;
        let content = (typeof TM !== 'undefined' && TM.getAll) ? (() => {
            const t = TM.getAll().find(tab => (tab.filePath || '').replace(/^indb:/, '') === f.path);
            return t && t.content != null ? t.content : f.content;
        })() : f.content;
        if (content === undefined || content === null) content = f.content != null ? String(f.content) : '';
        btn.textContent = '⟳';
        btn.disabled = true;
        try {
            if (typeof PVShare !== 'undefined' && PVShare.quickPush) await PVShare.quickPush({ name: f.name, content });
            if (typeof App !== 'undefined' && App._toast) App._toast(`📤 md-viewer Push 완료: ${f.name}`);
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('Push 실패: ' + (e.message || e));
        }
        btn.textContent = '📤';
        btn.disabled = false;
    }

    /** 폴더 내 새 파일 생성 */
    function _createFileInFolder(folderPath) {
        const folder = (folderPath === '/' || !folderPath) ? '' : folderPath;
        const name = prompt('파일 이름 (.md 자동 추가):', 'untitled.md');
        if (name == null || !name.trim()) return;
        const safe = name.trim().replace(/[\\:*?"<>|]/g, '_');
        const hasExt = /\.(md|txt|html)$/i.test(safe);
        const fileName = hasExt ? safe : safe + '.md';
        const path = folder ? folder + '/' + fileName : fileName;
        if (allFiles.some(f => f.path === path)) {
            if (typeof App !== 'undefined' && App._toast) App._toast('같은 경로의 파일이 있습니다.');
            return;
        }
        createNewFile(folder, fileName).then(f => {
            if (f && typeof TM !== 'undefined') _openFile(f);
        });
    }

    /** inDB 초기화 — 확인 후 meta/files 스토어 비우기 */
    async function reset() {
        const msg = 'inDB를 초기화합니다.\n\n먼저 .mdp 파일로 저장하고, 차후에 복구하려면 백업해둔 .mdp 파일로 하시기 바랍니다.\n\n계속하시겠습니까?';
        if (!confirm(msg)) return;
        try {
            const db = await _getDB();
            const tx = db.transaction(['meta', 'files'], 'readwrite');
            tx.objectStore('meta').clear();
            tx.objectStore('files').clear();
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
            allFiles = [];
            folderName = '';
            _lastSavedAt = null;
            _lastSavedMemo = null;
            _updateHdr();
            _render();
            if (typeof App !== 'undefined' && App._toast) App._toast('inDB가 초기화되었습니다.');
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('초기화 실패: ' + (e.message || e));
        }
    }

    /** Push 로그 영역에 메시지 추가 (콘솔은 그대로 표시) */
    function _showPushLog(line) {
        const wrap = document.getElementById('indb-push-log');
        const content = document.getElementById('indb-push-log-content');
        if (wrap && content) {
            wrap.style.display = 'flex';
            content.appendChild(document.createElement('div')).textContent = line;
            content.scrollTop = content.scrollHeight;
        }
    }
    /** 콘솔 펼침 (Push 시 자동 호출) */
    function _ensurePushLogVisible() {
        const wrap = document.getElementById('indb-push-log');
        if (wrap) wrap.style.display = 'flex';
    }
    /** 콘솔 접기/펼치기 토글 */
    function togglePushLog() {
        const wrap = document.getElementById('indb-push-log');
        const btn = document.getElementById('indb-console-btn');
        if (!wrap || !btn) return;
        const visible = wrap.style.display === 'flex';
        wrap.style.display = visible ? 'none' : 'flex';
        btn.title = visible ? '콘솔 펼치기' : '콘솔 접기';
    }
    /** 콘솔 내용만 지우기 (창은 유지) */
    function clearPushLog() {
        const content = document.getElementById('indb-push-log-content');
        if (content) content.innerHTML = '';
    }
    /** Push 로그 영역 숨김 (취소 시 등) */
    function _hidePushLog() {
        const wrap = document.getElementById('indb-push-log');
        if (wrap) wrap.style.display = 'none';
    }

    /** inDB → GitHub Push (pull 먼저, 커밋 메시지 일자+요일 자동). Push 단계·파일 목록을 로그에 표시 */
    async function pushToGitHub() {
        if (typeof GH === 'undefined' || !GH.cfg) {
            if (typeof App !== 'undefined' && App._toast) App._toast('GitHub 연결이 필요합니다');
            return;
        }
        const files = allFiles || [];
        if (!files.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('inDB에 파일이 없습니다');
            return;
        }
        const tabByPath = {};
        if (typeof TM !== 'undefined' && TM.getAll) {
            TM.getAll().forEach(t => {
                const p = (t.filePath || '').replace(/^indb:/, '');
                if (p) tabByPath[p] = t;
            });
        }
        let toPush = files.map(f => {
            let content = (tabByPath[f.path] && tabByPath[f.path].content != null) ? tabByPath[f.path].content : (f.content != null ? String(f.content) : '');
            /* Push 시 indb:IMAGE/... → 상대 경로 변환 (GitHub에서 이미지 표시용) */
            if (typeof ImagePersist !== 'undefined' && ImagePersist.indbPathToRelative && content && /indb:IMAGE\//i.test(content)) {
                content = ImagePersist.indbPathToRelative(content, f.path);
            }
            return { path: f.path, content };
        });
        /* 설정에서 허용하지 않으면 IMAGE 폴더는 Push에서 제외 (기본: 제외) */
        let imageExcludedCount = 0;
        if (typeof SB !== 'undefined' && SB.allowImageInGhPush && !SB.allowImageInGhPush()) {
            imageExcludedCount = toPush.filter(p => (p.path || '').startsWith('IMAGE/')).length;
            toPush = toPush.filter(p => !(p.path || '').startsWith('IMAGE/'));
        }

        _ensurePushLogVisible();
        if (imageExcludedCount > 0) {
            const hasDocsWithImages = toPush.some(f => f.content && /IMAGE\/[^)\s"']+\.(png|jpg|jpeg|gif|webp)/i.test(f.content));
            _showPushLog('ℹ IMAGE 폴더는 Push에서 제외됩니다. 제외: ' + imageExcludedCount + '개');
            if (hasDocsWithImages) {
                _showPushLog('⚠ 이미지가 포함된 문서는 IMAGE 폴더 push를 허용해야 GitHub에서 이미지가 보입니다. 설정 → "GitHub push에 IMAGE 포함" 체크.');
            } else {
                _showPushLog('   (설정에서 "GitHub push에 IMAGE 포함" 체크 시 포함)');
            }
        }
        _showPushLog('--- 전체 Push ---');
        _showPushLog('📤 Push할 파일 (' + toPush.length + '개):');
        toPush.forEach(f => _showPushLog('  • ' + f.path));
        _showPushLog('');

        try {
            if (typeof GH.refresh === 'function') {
                _showPushLog('⟳ 원격 최신화 중…');
                await GH.refresh();
            }
            const remoteSHAs = (typeof GH.getRemoteSHAs === 'function') ? await GH.getRemoteSHAs() : {};
            let diffCount = 0;
            for (const f of toPush) {
                if (remoteSHAs[f.path]) {
                    const remoteSha = remoteSHAs[f.path];
                    let remoteContent = '';
                    try {
                        const resp = await fetch(
                            `https://api.github.com/repos/${GH.cfg.repo}/git/blobs/${remoteSha}`,
                            { headers: { 'Authorization': `token ${GH.cfg.token}`, 'Accept': 'application/vnd.github.v3+json' } }
                        );
                        const d = await resp.json();
                        if (d.content) remoteContent = decodeURIComponent(escape(atob(d.content.replace(/\n/g, ''))));
                    } catch (_) {}
                    const localContent = (f.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                    if (localContent !== remoteContent) diffCount++;
                }
            }
            if (diffCount > 0) {
                _showPushLog('⚠ GitHub와 내용이 다른 파일 ' + diffCount + '개');
                if (typeof App !== 'undefined' && App._toast) App._toast('⚠ GitHub와 내용이 다른 파일 ' + diffCount + '개입니다.');
            }
            const now = new Date();
            const days = ['일','월','화','수','목','금','토'];
            const defaultMsg = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} (${days[now.getDay()]})`;
            const msg = prompt('커밋 메시지:', defaultMsg);
            if (msg === null) return;
            const commitMsg = (msg || defaultMsg).trim();
            _showPushLog('커밋 메시지: ' + commitMsg);
            toPush.forEach(function(p) { _showPushLog('git add ' + p.path); });
            _showPushLog('git commit -m "' + commitMsg.replace(/"/g, '\\"') + '"');
            _showPushLog('git push');
            _showPushLog('');

            await GH.pushLocalFiles(toPush, commitMsg, {
                onProgress: function(step, message, detail) {
                    _showPushLog(message);
                    if (detail && Array.isArray(detail) && detail.length > 0) {
                        detail.slice(0, 5).forEach(function(p) { _showPushLog('    ' + p); });
                        if (detail.length > 5) _showPushLog('    … 외 ' + (detail.length - 5) + '개');
                    }
                }
            });
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ inDB → GitHub Push 완료');
        } catch (e) {
            _showPushLog('❌ 실패: ' + (e.message || e));
            if (typeof App !== 'undefined' && App._toast) App._toast('Push 실패: ' + (e.message || e));
        }
    }

    /** 경로로 파일 삭제 (VoiceRecorder 등에서 호출). allFiles 갱신 및 _render */
    async function deleteFile(path) {
        if (!path || typeof path !== 'string') return false;
        try {
            await _idbDel('files', path.trim());
            allFiles = allFiles.filter(x => x.path !== path.trim());
            _applyFilters();
            _render();
            return true;
        } catch (e) {
            if (typeof App !== 'undefined' && App._toast) App._toast('삭제 실패: ' + (e.message || e));
            return false;
        }
    }

    /** inDB 트리에서 상대 경로에 해당하는 파일 행을 활성으로 표시하고 스크롤한다 */
    function highlightFileInList(relPath) {
        const list = document.getElementById('indb-list');
        if (!list || !relPath) return;
        list.querySelectorAll('.file-item').forEach(el => {
            const f = el._indbFile;
            el.classList.toggle('active', !!(f && f.path === relPath));
        });
        const row = list.querySelector('.file-item.active');
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    return { saveBackup, load, search, syncFromGitHub, toggleFoldAll, reset, pushToGitHub, saveFile, getFileByPath, deleteFile, createNewFile, createNewFilePrompt, createNewFolderPrompt, showSaveToInDBModal, _createFileInFolder, confirmDelete, confirmDeleteFolder, moveFile, renameFile, moveFolder, renameFolder, pushToGH, pushToViewer, togglePushLog, clearPushLog, _render, highlightFileInList, getFiles: () => allFiles, getFolderName: () => folderName };
})();

/* ═══════════════════════════════════════════════════════════
   HistorySave — IndexedDB 날짜별 히스토리 저장 + .mdp 내보내기 (H-save)
   의존: el (dom.js), TM, US, App (토스트), FM (ZIP 백업), JSZip (전역)
═══════════════════════════════════════════════════════════ */
const HistorySave = (() => {
    const DB_NAME = 'mdpro_history_v1';
    const DB_VER = 1;
    const STORE = 'state';
    const MDP_VERSION = 2;  /* v2: full folder structure (files array) */
    const CONFIRM_DELETE = '지우면 영구삭제됩니다. 지울까요?';
    let _selectedId = null;

    /** 현재 에디터/탭 상태를 스냅샷 객체로 만든다 (undo 포함) */
    function buildSnapshot() {
        if (typeof TM === 'undefined' || !TM.getActive || !TM.getAll) return null;
        if (TM.saveFromEditor) TM.saveFromEditor();
        const all = TM.getAll();
        const active = TM.getActive();
        const activeId = active ? active.id : (all.length ? all[0].id : null);
        const undoState = (typeof US !== 'undefined' && US._getState) ? US._getState() : { stack: [], ptr: 0 };
        const tabs = all.map(t => {
            const row = {
                id: t.id,
                title: t.title,
                content: t.content,
                filePath: t.filePath || null,
                fileType: t.fileType || 'md',
                isDirty: !!t.isDirty,
                undoSt: t.undoSt,
                undoPtr: t.undoPtr
            };
            if (t.id === activeId) {
                row.undoSt = undoState.stack;
                row.undoPtr = undoState.ptr;
            }
            if (t.ghPath != null) row.ghPath = t.ghPath;
            if (t.ghBranch != null) row.ghBranch = t.ghBranch;
            if (t.ghSha != null) row.ghSha = t.ghSha;
            return row;
        });
        const nextId = all.length ? Math.max(...all.map(t => t.id)) + 1 : 1;
        return {
            version: MDP_VERSION,
            savedAt: new Date().toISOString(),
            tabs,
            activeId,
            nextId
        };
    }

    /** TM 없을 때 에디터에서 직접 스냅샷 생성 (폴백) */
    function _buildSnapshotFromEditor() {
        const ed = document.getElementById('editor');
        const ti = document.getElementById('doc-title');
        if (!ed) return null;
        const content = ed.value || '';
        const title = (ti && ti.value) ? ti.value : 'Untitled';
        return {
            version: MDP_VERSION,
            savedAt: new Date().toISOString(),
            tabs: [{ id: 1, title, content, filePath: null, fileType: 'md', isDirty: false, undoSt: [content], undoPtr: 0 }],
            activeId: 1,
            nextId: 2
        };
    }

    /** IndexedDB에 현재 상태를 저장한다 (메모 없으면 null) */
    function saveToIndexedDB(memo) {
        let snap = buildSnapshot();
        if (!snap || !snap.tabs.length) snap = _buildSnapshotFromEditor();
        if (!snap || !snap.tabs.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('저장할 탭이 없습니다.');
            return Promise.resolve(false);
        }
        const id = 'h_' + Date.now();
        const memoVal = (memo != null && String(memo).trim() !== '') ? String(memo).trim() : null;
        const src = (typeof SB !== 'undefined' && SB.currentSource) ? SB.currentSource() : 'local';
        let fmFiles = [];
        let folderName = null;
        if (src === 'github' && typeof GH !== 'undefined' && GH.getFiles) {
            fmFiles = GH.getFiles() || [];
            folderName = (GH.getFolderName && GH.getFolderName()) || 'github';
        } else if (src === 'indb' && typeof InDB !== 'undefined' && InDB.getFiles) {
            fmFiles = InDB.getFiles() || [];
            folderName = (InDB.getFolderName && InDB.getFolderName()) || 'inDB 백업';
        } else if (src === 'nas' && typeof NAS !== 'undefined' && NAS.getFiles) {
            fmFiles = NAS.getFiles() || [];
            folderName = 'WebDAV';
        } else if (typeof FM !== 'undefined' && FM.getFiles) {
            fmFiles = FM.getFiles() || [];
            folderName = (FM.getFolderName && FM.getFolderName()) || null;
        }
        const tabByPath = {};
        (snap.tabs || []).forEach(t => {
            const p = (t.filePath || t.ghPath || '').replace(/^indb:/, '').replace(/^nas:/, '');
            if (p) tabByPath[p] = t;
        });
        const mergedFiles = fmFiles.length > 0 ? fmFiles.map(f => {
            const t = tabByPath[f.path];
            return { path: f.path, name: f.name, ext: f.ext, folder: f.folder, content: t ? t.content : (f.content != null ? String(f.content) : ''), modified: f.modified || f.date };
        }) : [];
        const record = { id, memo: memoVal, ...snap, folderName, files: mergedFiles };
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VER);
                req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction(STORE, 'readwrite');
                    const store = tx.objectStore(STORE);
                    store.put(record);
                    tx.oncomplete = () => {
                        db.close();
                        const savedAt = record.savedAt ? _formatDate(record.savedAt) : '';
                        if (typeof App !== 'undefined' && App._toast) App._toast('✓ History 저장됨' + (savedAt ? ' — ' + savedAt : ''), 3500);
                        if (mergedFiles.length > 0 && typeof InDB !== 'undefined' && InDB.saveBackup) {
                            InDB.saveBackup(mergedFiles, folderName, record.savedAt, record.memo).then(() => InDB._render && InDB._render()).catch(() => {});
                            if (typeof GH === 'undefined' || !GH.cfg) {
                                const key = 'indb_gh_recommend_shown';
                                if (!localStorage.getItem(key)) {
                                    localStorage.setItem(key, '1');
                                    if (typeof App !== 'undefined' && App._toast) App._toast('💡 GitHub 토큰으로 연결하면 데이터를 안전하게 백업할 수 있습니다. 설정 → GitHub에서 연결하세요.', 5000);
                                }
                            }
                        }
                        resolve({ ok: true, savedAt: record.savedAt });
                    };
                    tx.onerror = () => {
                        db.close();
                        const err = tx.error ? tx.error.message : 'IndexedDB 오류';
                        if (typeof App !== 'undefined' && App._toast) App._toast('저장 실패: ' + err);
                        reject(tx.error);
                    };
                };
                req.onerror = () => {
                    const err = req.error ? req.error.message : 'IndexedDB 오류';
                    if (typeof App !== 'undefined' && App._toast) App._toast('저장 실패: ' + err);
                    reject(req.error);
                };
            } catch (e) {
                if (typeof App !== 'undefined' && App._toast) App._toast('저장 실패: ' + (e.message || e));
                reject(e);
            }
        });
    }

    /** 저장된 히스토리 목록을 날짜 내림차순으로 반환한다 */
    function listHistories() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VER);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction(STORE, 'readonly');
                    const store = tx.objectStore(STORE);
                    const getAll = store.getAll();
                    getAll.onsuccess = () => {
                        db.close();
                        const rows = (getAll.result || []).filter(r => r && r.id && String(r.id).startsWith('h_'));
                        rows.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
                        resolve(rows);
                    };
                    getAll.onerror = () => { db.close(); reject(getAll.error); };
                };
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 지정한 id의 히스토리를 불러와 탭을 복원한다 */
    function loadHistoryById(id) {
        if (!id) return Promise.resolve(false);
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VER);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction(STORE, 'readonly');
                    const store = tx.objectStore(STORE);
                    const get = store.get(id);
                    get.onsuccess = async () => {
                        db.close();
                        const row = get.result;
                        if (!row || !row.tabs || !row.tabs.length) {
                            if (typeof App !== 'undefined' && App._toast) App._toast('해당 History를 찾을 수 없습니다.');
                            resolve(false);
                            return;
                        }
                        let fmOk = true;
                        if (row.files && Array.isArray(row.files) && row.files.length > 0 && typeof FM !== 'undefined' && FM.restoreFromMdp) {
                            fmOk = await FM.restoreFromMdp(row.files, row.folderName || 'history-restore');
                        }
                        const tmOk = typeof TM !== 'undefined' && TM.loadSnapshot && TM.loadSnapshot(row);
                        if (tmOk || fmOk) {
                            if (typeof App !== 'undefined' && App._toast) App._toast('✓ History 불러옴' + (row.files && row.files.length ? ' (' + row.files.length + '개 파일)' : ''));
                            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('local');
                        }
                        resolve(!!tmOk || !!fmOk);
                    };
                    get.onerror = () => { db.close(); reject(get.error); };
                };
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 선택된 항목 불러오기 (목록에서 선택 후 상단 불러오기 버튼용) */
    function loadSelected() {
        if (!_selectedId) {
            if (typeof App !== 'undefined' && App._toast) App._toast('목록에서 복원할 항목을 선택하세요.');
            return Promise.resolve(false);
        }
        return loadHistoryById(_selectedId);
    }

    /** 항목 하나 삭제 (확인 후) */
    function deleteHistoryById(id) {
        if (!id) return Promise.resolve();
        if (!confirm(CONFIRM_DELETE)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VER);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction(STORE, 'readwrite');
                    const store = tx.objectStore(STORE);
                    store.delete(id);
                    tx.oncomplete = () => {
                        db.close();
                        if (_selectedId === id) _selectedId = null;
                        _renderOpenList();
                        resolve();
                    };
                    tx.onerror = () => { db.close(); reject(tx.error); };
                };
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    /** 전체 삭제: cursor로 h_ 항목만 삭제 */
    function _clearAllHistoriesCursor() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction(STORE, 'readwrite');
                const store = tx.objectStore(STORE);
                const cr = store.openCursor();
                cr.onsuccess = function (e) {
                    const c = e.target.result;
                    if (c) {
                        if (String(c.key).startsWith('h_')) c.delete();
                        c.continue();
                    } else {
                        db.close();
                        _selectedId = null;
                        _renderOpenList();
                        resolve();
                    }
                };
                cr.onerror = () => { db.close(); reject(cr.error); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            };
            req.onerror = () => reject(req.error);
        });
    }

    /** 전체 히스토리 삭제 (확인 후) */
    function clearAllHistoriesFinal() {
        if (!confirm(CONFIRM_DELETE)) return Promise.resolve();
        return _clearAllHistoriesCursor();
    }

    /** H-open 모달 내 목록 영역을 렌더링한다 */
    function _renderOpenList() {
        const listEl = document.getElementById('h-open-list');
        if (!listEl) return;
        listHistories().then(rows => {
            listEl.innerHTML = '';
            if (rows.length === 0) {
                listEl.innerHTML = '<div class="h-open-empty" style="padding:12px;text-align:center;color:var(--tx3);font-size:11px">저장된 히스토리가 없습니다.</div>';
                return;
            }
            rows.forEach(r => {
                const savedAt = r.savedAt || '';
                const dateStr = savedAt ? _formatDate(savedAt) : '(날짜 없음)';
                const memoStr = (r.memo != null && r.memo !== '') ? r.memo : null;
                const div = document.createElement('div');
                div.className = 'h-open-item' + (_selectedId === r.id ? ' selected' : '');
                div.dataset.id = r.id;
                div.setAttribute('role', 'button');
                div.setAttribute('tabindex', '0');
                const dateSpan = document.createElement('span');
                dateSpan.className = 'h-open-item-date';
                dateSpan.textContent = dateStr;
                const memoSpan = document.createElement('span');
                memoSpan.className = 'h-open-item-memo';
                memoSpan.textContent = memoStr || '메모 없음';
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'btn-ic h-open-item-del';
                delBtn.title = '지우기';
                delBtn.textContent = '\u2715';
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    deleteHistoryById(r.id);
                });
                div.appendChild(dateSpan);
                div.appendChild(memoSpan);
                div.appendChild(delBtn);
                div.addEventListener('click', function (e) {
                    if (e.target.classList.contains('h-open-item-del')) return;
                    _selectedId = r.id;
                    listEl.querySelectorAll('.h-open-item').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                });
                listEl.appendChild(div);
            });
        }).catch(() => {
            listEl.innerHTML = '<div class="h-open-empty" style="padding:12px;text-align:center;color:var(--er);font-size:11px">목록을 불러올 수 없습니다.</div>';
        });
    }

    function _formatDate(iso) {
        try {
            const d = new Date(iso);
            const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
            const h = d.getHours(), min = d.getMinutes();
            return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0') + ' ' + String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
        } catch (e) { return iso; }
    }

    function _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** .mdp보내기·WebDAV 업로드 공용: 스냅샷·병합 파일·파일명. 없으면 null */
    function _buildMdpExportPayload() {
        let snap = buildSnapshot();
        if (!snap || !snap.tabs.length) snap = _buildSnapshotFromEditor();
        if (!snap || !snap.tabs.length) return null;
        const src = (typeof SB !== 'undefined' && SB.currentSource) ? SB.currentSource() : 'local';
        let fmFiles = [];
        let folderName = null;
        if (src === 'github' && typeof GH !== 'undefined' && GH.getFiles) {
            fmFiles = GH.getFiles() || [];
            folderName = (GH.getFolderName && GH.getFolderName()) ? GH.getFolderName() : 'github';
        } else if (src === 'indb' && typeof InDB !== 'undefined' && InDB.getFiles) {
            fmFiles = InDB.getFiles() || [];
            folderName = (InDB.getFolderName && InDB.getFolderName()) ? InDB.getFolderName() : 'inDB 백업';
        } else if (src === 'nas' && typeof NAS !== 'undefined' && NAS.getFiles) {
            fmFiles = NAS.getFiles() || [];
            folderName = 'WebDAV';
        } else if (typeof FM !== 'undefined' && FM.getFiles) {
            fmFiles = FM.getFiles() || [];
            folderName = (FM.getFolderName && FM.getFolderName()) ? FM.getFolderName() : null;
        }
        if (folderName == null) folderName = 'backup';
        const tabByPath = {};
        (snap.tabs || []).forEach(t => {
            const p = (t.filePath || t.ghPath || '').replace(/^indb:/, '').replace(/^nas:/, '');
            if (p) tabByPath[p] = t;
        });
        const mergedFiles = fmFiles.length > 0
            ? fmFiles.map(f => {
                const t = tabByPath[f.path];
                return {
                    path: f.path,
                    name: f.name,
                    ext: f.ext,
                    folder: f.folder,
                    content: t ? t.content : (f.content != null ? String(f.content) : ''),
                    modified: f.modified || f.date
                };
            })
            : (snap.tabs || []).filter(t => (t.filePath || t.ghPath)).map(t => {
                const rawPath = t.filePath || t.ghPath || '';
                const path = rawPath.replace(/^indb:/, '').replace(/^nas:/, '');
                const name = path.split('/').pop() || 'untitled';
                return {
                    path,
                    name,
                    ext: t.fileType || 'md',
                    folder: path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/',
                    content: t.content || '',
                    modified: Date.now()
                };
            });
        const fileName = 'mdpro_' + (folderName || 'backup').replace(/[<>:"/\\|?*]/g, '_') + '_' + (snap.savedAt || '').slice(0, 19).replace(/[-:T]/g, '').replace(/\D/g, '') + '.mdp';
        return { snap, mergedFiles, fileName, folderName };
    }

    /** 현재 상태를 .mdp 파일로보낸다 (탭 + 전체 폴더 구조). 현재 소스(inDB/GitHub/로컬) 기준으로 파일·폴더 위치를 저장한다 */
    function exportToMdp() {
        const pkg = _buildMdpExportPayload();
        if (!pkg) {
            if (typeof App !== 'undefined' && App._toast) App._toast('보낼 탭이 없습니다.');
            return;
        }
        const { snap, mergedFiles, fileName, folderName } = pkg;
        if (typeof JSZip !== 'undefined' && typeof MdpFormat !== 'undefined' && MdpFormat.exportToZip) {
            MdpFormat.exportToZip(
                { savedAt: snap.savedAt, tabs: snap.tabs, activeId: snap.activeId, nextId: snap.nextId, folderName },
                mergedFiles
            ).then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(a.href);
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ .mdp보냄 (' + mergedFiles.length + '개 파일)');
            }).catch(() => {
                if (typeof App !== 'undefined' && App._toast) App._toast('.mdp보내기 실패');
            });
        } else {
            const exportData = { version: MDP_VERSION, savedAt: snap.savedAt, tabs: snap.tabs, activeId: snap.activeId, nextId: snap.nextId, folderName, files: mergedFiles };
            const json = JSON.stringify(exportData, null, 0);
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(a.href);
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ .mdp보냄 (' + mergedFiles.length + '개 파일)');
        }
    }

    /** 현재 상태를 .mdp Blob으로 만든다 (WebDAV PUT 등). 실패 시 null */
    async function exportToMdpBlob() {
        const pkg = _buildMdpExportPayload();
        if (!pkg) return null;
        const { snap, mergedFiles, fileName, folderName } = pkg;
        try {
            if (typeof JSZip !== 'undefined' && typeof MdpFormat !== 'undefined' && MdpFormat.exportToZip) {
                const blob = await MdpFormat.exportToZip(
                    { savedAt: snap.savedAt, tabs: snap.tabs, activeId: snap.activeId, nextId: snap.nextId, folderName },
                    mergedFiles
                );
                return { blob, fileName, mergedCount: mergedFiles.length, mime: 'application/zip' };
            }
            const exportData = { version: MDP_VERSION, savedAt: snap.savedAt, tabs: snap.tabs, activeId: snap.activeId, nextId: snap.nextId, folderName, files: mergedFiles };
            const blob = new Blob([JSON.stringify(exportData, null, 0)], { type: 'application/json' });
            return { blob, fileName, mergedCount: mergedFiles.length, mime: 'application/json' };
        } catch (e) {
            console.warn('[HistorySave] exportToMdpBlob', e);
            return null;
        }
    }


    function exportToZip() {
        if (typeof JSZip === 'undefined') {
            if (typeof App !== 'undefined' && App._toast) App._toast('ZIP 라이브러리를 불러올 수 없습니다.');
            return;
        }
        const files = typeof FM !== 'undefined' && FM.getFiles ? FM.getFiles() : [];
        const folderName = typeof FM !== 'undefined' && FM.getFolderName ? FM.getFolderName() : 'backup';
        if (!files || !files.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('백업할 파일이 없습니다. 로컬 폴더를 먼저 선택하세요.');
            return;
        }
        const zip = new JSZip();
        files.forEach(f => {
            const path = (f.path || '').trim();
            if (!path) return;
            const content = (f.content != null) ? String(f.content) : '';
            zip.file(path, content, { createFolders: true });
        });
        zip.generateAsync({ type: 'blob' }).then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const safeName = (folderName || 'backup').replace(/[<>:"/\\|?*]/g, '_').trim() || 'backup';
            a.download = safeName + '_' + (new Date().toISOString().slice(0, 10)) + '.zip';
            a.click();
            URL.revokeObjectURL(a.href);
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ ZIP 백업 다운로드됨 (' + files.length + '개 파일)');
        }).catch(() => {
            if (typeof App !== 'undefined' && App._toast) App._toast('ZIP 생성 실패');
        });
    }

    /** inDB IndexedDB 백업 폴더의 파일을 경로 구조를 유지한 채 ZIP으로 내보낸다 (파일 패널 inDB 탭 하단) */
    function exportInDbFolderToZip() {
        if (typeof JSZip === 'undefined') {
            if (typeof App !== 'undefined' && App._toast) App._toast('ZIP 라이브러리를 불러올 수 없습니다.');
            return;
        }
        if (typeof InDB === 'undefined' || !InDB.getFiles) {
            if (typeof App !== 'undefined' && App._toast) App._toast('inDB를 사용할 수 없습니다.');
            return;
        }
        const files = InDB.getFiles() || [];
        const folderName = (InDB.getFolderName && InDB.getFolderName()) || 'inDB_backup';
        if (!files.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('내보낼 파일이 없습니다. History 저장 또는 .mdp 불러오기로 inDB를 채운 뒤 시도하세요.');
            return;
        }
        const zip = new JSZip();
        files.forEach(f => {
            const path = (f.path || '').trim();
            if (!path) return;
            const content = (f.content != null) ? String(f.content) : '';
            zip.file(path, content, { createFolders: true });
        });
        zip.generateAsync({ type: 'blob' }).then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const safeName = String(folderName || 'inDB_backup').replace(/[<>:"/\\|?*]/g, '_').trim() || 'inDB_backup';
            a.download = safeName + '_' + (new Date().toISOString().slice(0, 10)) + '.zip';
            a.click();
            URL.revokeObjectURL(a.href);
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ inDB 폴더 ZIP 다운로드 (' + files.length + '개 파일)');
        }).catch(() => {
            if (typeof App !== 'undefined' && App._toast) App._toast('ZIP 생성 실패');
        });
    }

    /** .mdp 파일(File 또는 JSON)에서 상태를 불러와 탭 + 폴더 구조 복원 */
    async function importFromMdp(fileOrJson) {
        async function doImport(data) {
            if (!data) return false;
            const type = data.type || 'full';
            if (type === 'gallery' && data.files && data.files.length > 0 && typeof ImgStore !== 'undefined' && ImgStore.save) {
                let count = 0;
                for (const f of data.files) {
                    const path = (f.path || '').toLowerCase();
                    if (/\.(png|jpg|jpeg|gif|webp)$/.test(path) && f.content) {
                        const dataUrl = f.content.startsWith('data:') ? f.content : 'data:image/png;base64,' + f.content;
                        await ImgStore.save(dataUrl, (f.name || 'imported').replace(/\.[^.]+$/, ''));
                        count++;
                    }
                }
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 갤러리 mdp 불러옴 (' + count + '개)');
                return count > 0;
            }
            if (type === 'aiimage' && data.files && data.files.length > 0 && typeof InDB !== 'undefined' && InDB.saveBackup) {
                const imgFiles = data.files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.path || ''));
                const withPath = imgFiles.map((f, i) => ({
                    path: 'IMAGE/aiimg-import-' + (i + 1) + '.png',
                    name: f.name || 'aiimg-' + (i + 1),
                    ext: 'png',
                    folder: 'IMAGE',
                    content: f.content,
                    modified: Date.now()
                }));
                await InDB.saveBackup(withPath, data.folderName || 'aiimg-import', data.savedAt);
                if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('indb');
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ AI 이미지 mdp 불러옴 (' + withPath.length + '개) → inDB');
                return true;
            }
            let tabs = data.tabs;
            if (!tabs || !Array.isArray(tabs) || !tabs.length) {
                if (data.files && data.files.length > 0) {
                    const mdFiles = data.files.filter(f => /\.(md|txt|html)$/i.test(f.path || ''));
                    if (mdFiles.length > 0) {
                        tabs = mdFiles.slice(0, 5).map((f, i) => ({
                            id: i + 1, title: (f.name || f.path || 'untitled').replace(/\.[^.]+$/, ''),
                            content: f.content != null ? String(f.content) : '',
                            filePath: f.path, fileType: f.ext || 'md', isDirty: false, undoSt: [], undoPtr: 0
                        }));
                    } else return false;
                } else return false;
            }
            const snap = { tabs, activeId: data.activeId != null ? data.activeId : tabs[0].id, nextId: data.nextId != null ? data.nextId : tabs.length + 1 };
            let fmOk = true;
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                const filesForInDB = data.files.filter(f => f.path);
                if (filesForInDB.length > 0 && typeof InDB !== 'undefined' && InDB.saveBackup) {
                    await InDB.saveBackup(filesForInDB, data.folderName || 'mdp-import', data.savedAt, data.memo);
                    if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('indb');
                }
                if (typeof FM !== 'undefined' && FM.restoreFromMdp) {
                    fmOk = await FM.restoreFromMdp(data.files, data.folderName || 'mdp-import');
                }
            }
            const tmOk = typeof TM !== 'undefined' && TM.loadSnapshot && TM.loadSnapshot(snap);
            if (tmOk || fmOk) {
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ .mdp 불러옴' + (data.files && data.files.length ? ' (' + data.files.length + '개 파일) → inDB' : ''));
                if (typeof SB !== 'undefined' && SB.switchSource && (!data.files || !data.files.length)) SB.switchSource('local');
            }
            return !!tmOk || !!fmOk;
        }
        if (fileOrJson instanceof File) {
            return (async () => {
                try {
                    const isZip = typeof MdpFormat !== 'undefined' && MdpFormat.isZipMdp && await MdpFormat.isZipMdp(fileOrJson);
                    if (isZip && typeof MdpFormat !== 'undefined' && MdpFormat.importFromZip) {
                        const { manifest, files } = await MdpFormat.importFromZip(fileOrJson);
                        const data = { ...manifest, files };
                        return doImport(data);
                    }
                    const text = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(r.result);
                        r.onerror = rej;
                        r.readAsText(fileOrJson, 'UTF-8');
                    });
                    const data = JSON.parse(text);
                    return doImport(data);
                } catch (e) { throw e; }
            })();
        }
        try {
            const data = typeof fileOrJson === 'string' ? JSON.parse(fileOrJson) : (fileOrJson && fileOrJson.tabs ? fileOrJson : null);
            return doImport(data);
        } catch (e) {
            return Promise.resolve(false);
        }
    }

    /** H-save 모달 하단에 저장된 히스토리 목록을 렌더링한다 (읽기 전용) */
    function _renderSaveList() {
        const listEl = document.getElementById('h-save-list');
        if (!listEl) return;
        listHistories().then(rows => {
            listEl.innerHTML = '';
            if (rows.length === 0) {
                listEl.innerHTML = '<div class="h-open-empty" style="padding:12px;text-align:center;color:var(--tx3);font-size:11px">저장된 히스토리가 없습니다.</div>';
                return;
            }
            rows.forEach(r => {
                const savedAt = r.savedAt || '';
                const dateStr = savedAt ? _formatDate(savedAt) : '(날짜 없음)';
                const memoStr = (r.memo != null && r.memo !== '') ? r.memo : '메모 없음';
                const div = document.createElement('div');
                div.className = 'h-save-item';
                div.innerHTML = '<span class="h-open-item-date">' + _esc(dateStr) + '</span><span class="h-open-item-memo">' + _esc(memoStr) + '</span>';
                listEl.appendChild(div);
            });
        }).catch(() => {
            listEl.innerHTML = '<div class="h-open-empty" style="padding:12px;text-align:center;color:var(--er);font-size:11px">목록을 불러올 수 없습니다.</div>';
        });
    }

    function showModal() {
        const elm = document.getElementById('h-save-modal');
        if (elm) elm.classList.add('vis');
        const memoInp = document.getElementById('h-save-memo');
        if (memoInp) memoInp.value = '';
        _renderSaveList();
    }

    function hideModal() {
        const elm = document.getElementById('h-save-modal');
        if (elm) elm.classList.remove('vis');
    }

    function showOpenModal() {
        _selectedId = null;
        const elm = document.getElementById('h-open-modal');
        if (elm) elm.classList.add('vis');
        _renderOpenList();
    }

    function hideOpenModal() {
        const elm = document.getElementById('h-open-modal');
        if (elm) elm.classList.remove('vis');
    }

    /** History 저장 클릭 시 메모 읽어서 저장 후 모달 닫기 */
    function saveWithMemoAndClose() {
        const memoInp = document.getElementById('h-save-memo');
        const memo = memoInp ? memoInp.value : '';
        saveToIndexedDB(memo).then(ok => { if (ok) hideModal(); });
    }

    /** History 저장 클릭 시 메모 읽어서 저장 후 하단 목록 갱신 (모달 유지) */
    function saveWithMemoAndRefresh() {
        const memoInp = document.getElementById('h-save-memo');
        const memo = memoInp ? memoInp.value : '';
        const successEl = document.getElementById('h-save-success-msg');
        saveToIndexedDB(memo).then(result => {
            const ok = result && (result.ok === true || result === true);
            if (!ok) return;
            if (memoInp) memoInp.value = '';
            const savedAt = result && result.savedAt ? _formatDate(result.savedAt) : _formatDate(new Date().toISOString());
            if (successEl) {
                successEl.textContent = '✓ 저장됨 — ' + savedAt;
                successEl.style.display = '';
                clearTimeout(successEl._hideTid);
                successEl._hideTid = setTimeout(() => { successEl.style.display = 'none'; }, 3000);
            }
            setTimeout(() => _renderSaveList(), 50);
        }).catch(() => {});
    }

    /** 목록에서 선택 후 불러오기 버튼 클릭 */
    function openSelectedAndClose() {
        loadSelected().then(ok => { if (ok) hideOpenModal(); });
    }

    /** .mdp 파일 input change 시 import 후 모달 닫기 */
    function _onMdpFileSelected(ev) {
        const f = ev.target && ev.target.files && ev.target.files[0];
        if (!f) return;
        importFromMdp(f).then(() => { hideOpenModal(); }).catch(() => {});
        ev.target.value = '';
    }

    return {
        saveToIndexedDB,
        listHistories,
        loadHistoryById,
        loadSelected,
        deleteHistoryById,
        clearAllHistories: clearAllHistoriesFinal,
        exportToMdp,
        exportToMdpBlob,
        exportToZip,
        exportInDbFolderToZip,
        loadFromIndexedDB: loadSelected,
        importFromMdp,
        showModal,
        hideModal,
        showOpenModal,
        hideOpenModal,
        saveWithMemoAndClose,
        saveWithMemoAndRefresh,
        openSelectedAndClose,
        buildSnapshot,
        _renderOpenList,
        _onMdpFileSelected
    };
})();

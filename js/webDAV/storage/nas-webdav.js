/* WebDAV 온라인 저장소 (NAS 등). PROPFIND/GET/PUT/MKCOL/DELETE/MOVE — 전역 객체 이름은 NAS 유지
   CORS·Basic 인증은 서버 설정 필요. 참고: https://explainpark101.github.io/webdav-viewer/
   자격 증명: localStorage — Web Crypto(AES-GCM)로 암호화 저장(브라우저·HTTPS). 동일 기기 내 키가 있으므로 기기 탈취 시 복호화 가능 */
const NAS = (() => {
    const CFG_KEY = 'mdpro_nas_cfg_v1';
    const PW_KEY = 'mdpro_nas_pw_v1';
    const CFG_V2_KEY = 'mdpro_nas_cfg_v2';
    const NAS_AES_KEY_KEY = 'mdpro_nas_storage_aes_v1';
    const LOCK_KEY = 'mdpro_nas_locked_folders';
    /** Web Crypto 불가 시 URL만 저장(아이디 없음) */
    const URL_SOLO_KEY = 'mdpro_nas_url_solo_v1';
    const EXT = ['md', 'txt', 'html', 'mdp'];

    let _cfgMem = null;
    let _nasStorageReadyPromise = null;

    function _bufToB64(buf) {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    }

    function _b64ToBuf(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function _canUseWebCrypto() {
        return typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.getRandomValues === 'function';
    }

    async function _getOrCreateNasAesKey() {
        let b64 = localStorage.getItem(NAS_AES_KEY_KEY);
        if (!b64 || b64.length < 40) {
            const raw = new Uint8Array(32);
            crypto.getRandomValues(raw);
            b64 = _bufToB64(raw);
            localStorage.setItem(NAS_AES_KEY_KEY, b64);
        }
        const rawKey = _b64ToBuf(b64);
        return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }

    async function _encryptNasPayloadJson(jsonStr) {
        const key = await _getOrCreateNasAesKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(jsonStr);
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
        return { iv: _bufToB64(iv), ct: _bufToB64(new Uint8Array(ct)) };
    }

    async function _decryptNasPayloadJson(ivB64, ctB64) {
        const key = await _getOrCreateNasAesKey();
        const iv = _b64ToBuf(ivB64);
        const ct = _b64ToBuf(ctB64);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
        return new TextDecoder().decode(plain);
    }

    function _readLegacyV1Sync() {
        try {
            const j = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
            if (!j || !j.baseUrl || !j.user) return null;
            const pass = localStorage.getItem(PW_KEY) || '';
            return {
                baseUrl: String(j.baseUrl).trim().replace(/\/$/, ''),
                user: String(j.user).trim(),
                pass,
            };
        } catch (e) {
            return null;
        }
    }

    async function _hydrateNasCfgFromStorage() {
        const v2raw = localStorage.getItem(CFG_V2_KEY);
        if (v2raw && _canUseWebCrypto()) {
            try {
                const o = JSON.parse(v2raw);
                if (o && o.iv && o.ct) {
                    const json = await _decryptNasPayloadJson(o.iv, o.ct);
                    const p = JSON.parse(json);
                    _cfgMem = {
                        baseUrl: String(p.baseUrl || '').trim().replace(/\/$/, ''),
                        user: String(p.user || '').trim(),
                        pass: String(p.pass || ''),
                    };
                    if (!_cfgMem.baseUrl) _cfgMem = null;
                    return;
                }
            } catch (e) {
                _cfgMem = null;
            }
        }
        try {
            const soloRaw = localStorage.getItem(URL_SOLO_KEY);
            const solo = soloRaw ? JSON.parse(soloRaw) : null;
            if (solo && solo.baseUrl) {
                _cfgMem = {
                    baseUrl: String(solo.baseUrl).trim().replace(/\/$/, ''),
                    user: '',
                    pass: '',
                };
                return;
            }
        } catch (e) { /* ignore */ }
        const leg = _readLegacyV1Sync();
        if (leg) {
            _cfgMem = leg;
            if (_canUseWebCrypto()) {
                try {
                    await _persistCfgEncrypted(leg);
                } catch (e) { /* 유지: 평문 v1 */ }
            }
            return;
        }
        _cfgMem = null;
    }

    function _ensureNasStorageReady() {
        if (!_nasStorageReadyPromise) {
            _nasStorageReadyPromise = _hydrateNasCfgFromStorage();
        }
        return _nasStorageReadyPromise;
    }

    async function _persistCfgEncrypted(c) {
        if (!c || !c.baseUrl) return;
        if (!_canUseWebCrypto()) {
            if (String(c.user || '').trim()) {
                localStorage.setItem(CFG_KEY, JSON.stringify({ baseUrl: c.baseUrl, user: c.user }));
                localStorage.setItem(PW_KEY, c.pass || '');
                localStorage.removeItem(URL_SOLO_KEY);
            } else {
                localStorage.removeItem(CFG_KEY);
                localStorage.removeItem(PW_KEY);
                try {
                    localStorage.setItem(URL_SOLO_KEY, JSON.stringify({ baseUrl: c.baseUrl }));
                } catch (e) { /* ignore */ }
            }
            localStorage.removeItem(CFG_V2_KEY);
            return;
        }
        const json = JSON.stringify({ baseUrl: c.baseUrl, user: c.user || '', pass: c.pass || '' });
        const enc = await _encryptNasPayloadJson(json);
        localStorage.setItem(CFG_V2_KEY, JSON.stringify(enc));
        localStorage.removeItem(CFG_KEY);
        localStorage.removeItem(PW_KEY);
        localStorage.removeItem(URL_SOLO_KEY);
    }

    /** WebDAV 사용자 관리(관리자) 페이지 — 통과 시 새 탭으로 연다 */
    const _WEBDAV_ADMIN_URL = 'https://admin-webdav.freemath.synology.me/';
    /** 진입 게이트 비밀번호의 SHA-256(hex). 소스에 평문 비밀번호를 두지 않는다(클라이언트만으로는 완전한 보안 불가) */
    const _WEBDAV_ADMIN_PW_SHA256_HEX = '8414ba5089ef373db02a339b2331b19b3514a550f640952eced0f188ce8dc5b1';

    /** 사이드바·설정 패널 입력란 쌍 (동일 localStorage 반영) */
    const _NAS_FIELD_TRIPLE = [
        ['nas-url-input', 'hk-nas-url-input', 'url'],
        ['nas-user-input', 'hk-nas-user-input', 'user'],
        ['nas-pass-input', 'hk-nas-pass-input', 'pass'],
    ];
    let _nasMirrorLock = false;

    let allFiles = [];
    let filtered = [];
    let _searchQuery = '';
    let _lastListAt = null;
    let _activePath = null;

    function _loadCfg() {
        return _cfgMem;
    }

    async function _saveCfg(c) {
        if (!c) {
            _cfgMem = null;
            localStorage.removeItem(CFG_KEY);
            localStorage.removeItem(PW_KEY);
            localStorage.removeItem(CFG_V2_KEY);
            localStorage.removeItem(URL_SOLO_KEY);
            return;
        }
        _cfgMem = {
            baseUrl: String(c.baseUrl).trim().replace(/\/$/, ''),
            user: String(c.user).trim(),
            pass: String(c.pass || ''),
        };
        await _persistCfgEncrypted(_cfgMem);
    }

    /** Basic Auth 헤더 (UTF-8 안전) */
    function _basicAuth(user, pass) {
        const s = user + ':' + (pass || '');
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return 'Basic ' + btoa(bin);
    }

    function cfg() { return _loadCfg(); }

    /** 아이디가 있어야 실제 WebDAV 요청 가능 */
    function _authCfg() {
        const c = _loadCfg();
        if (!c || !c.baseUrl || !String(c.user || '').trim()) return null;
        return c;
    }

    /** UTF-8 문자열의 SHA-256을 소문자 16진 문자열로 반환한다(crypto.subtle 없으면 빈 문자열) */
    async function _sha256HexUtf8(text) {
        if (text == null || typeof crypto === 'undefined' || !crypto.subtle) return '';
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return '';
        }
    }

    /** WebDAV 관리 페이지 진입용 비밀번호 입력 오버레이를 한 번 만들어 반환한다 */
    function _ensureWebDavAdminGateOverlay() {
        let el = document.getElementById('nas-webdav-admin-gate');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'nas-webdav-admin-gate';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200100;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
        el.innerHTML =
            '<div style="background:var(--bg2, #1e1e2e);border:1px solid var(--bd, #3a3a5a);border-radius:10px;padding:20px;max-width:360px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.45)">' +
            '<div style="font-size:13px;font-weight:700;color:var(--txh, #fff);margin-bottom:8px">WebDAV 관리 페이지</div>' +
            '<p style="font-size:11px;color:var(--tx3, #888);margin:0 0 12px;line-height:1.5">관리자 비밀번호를 입력하세요. 확인되면 <span style="word-break:break-all">' + _WEBDAV_ADMIN_URL + '</span> 가 새 탭에서 열립니다.</p>' +
            '<label style="font-size:11px;color:var(--tx2, #aaa);display:block;margin-bottom:4px">비밀번호</label>' +
            '<input type="password" id="nas-webdav-admin-gate-pw" autocomplete="off" class="fi" style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:12px;margin-bottom:14px;border-radius:6px;border:1px solid var(--bd, #444);background:var(--bg3, #2a2a3a);color:var(--tx, #eee)">' +
            '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button type="button" class="btn btn-g btn-sm" id="nas-webdav-admin-gate-cancel">취소</button>' +
            '<button type="button" class="btn btn-p btn-sm" id="nas-webdav-admin-gate-ok">확인</button>' +
            '</div></div>';
        el.addEventListener('click', (ev) => { if (ev.target === el) _closeWebDavAdminGate(); });
        document.body.appendChild(el);
        const pwIn = el.querySelector('#nas-webdav-admin-gate-pw');
        el.querySelector('#nas-webdav-admin-gate-cancel').addEventListener('click', () => _closeWebDavAdminGate());
        el.querySelector('#nas-webdav-admin-gate-ok').addEventListener('click', () => _submitWebDavAdminGate());
        if (pwIn) {
            pwIn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); _submitWebDavAdminGate(); }
            });
        }
        return el;
    }

    function _closeWebDavAdminGate() {
        const el = document.getElementById('nas-webdav-admin-gate');
        const pwIn = document.getElementById('nas-webdav-admin-gate-pw');
        if (pwIn) pwIn.value = '';
        if (el) {
            el.style.display = 'none';
            el.style.removeProperty('align-items');
            el.style.removeProperty('justify-content');
        }
    }

    /** 비밀번호 검증 후 관리 URL을 연다 */
    async function _submitWebDavAdminGate() {
        const pwIn = document.getElementById('nas-webdav-admin-gate-pw');
        const raw = pwIn ? String(pwIn.value || '') : '';
        const hex = await _sha256HexUtf8(raw);
        if (!hex) {
            alert('이 환경에서는 비밀번호 확인(SHA-256)을 사용할 수 없습니다. HTTPS로 열었는지 확인하세요.');
            return;
        }
        if (hex !== _WEBDAV_ADMIN_PW_SHA256_HEX) {
            if (pwIn) pwIn.value = '';
            if (typeof App !== 'undefined' && App._toast) App._toast('비밀번호가 올바르지 않습니다.');
            else alert('비밀번호가 올바르지 않습니다.');
            return;
        }
        _closeWebDavAdminGate();
        try {
            window.open(_WEBDAV_ADMIN_URL, '_blank', 'noopener,noreferrer');
        } catch (e) {
            window.location.href = _WEBDAV_ADMIN_URL;
        }
    }

    /** WebDAV admin 버튼: 비밀번호 게이트 후 관리자 페이지로 이동 */
    function openWebDavAdminGate() {
        const el = _ensureWebDavAdminGateOverlay();
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        const pwIn = document.getElementById('nas-webdav-admin-gate-pw');
        if (pwIn) setTimeout(() => pwIn.focus(), 50);
    }

    function isConnected() { return !!_authCfg(); }

    /** 설정·WebDAV 탭 입력란을 localStorage 값으로 맞춘다 */
    function syncFormsFromStorage() {
        return _ensureNasStorageReady().then(() => {
            const c = _loadCfg();
            _nasMirrorLock = true;
            _NAS_FIELD_TRIPLE.forEach(([id1, id2, key]) => {
                const v = c ? (key === 'url' ? (c.baseUrl || '') : key === 'user' ? (c.user || '') : (c.pass || '')) : '';
                const e1 = document.getElementById(id1);
                const e2 = document.getElementById(id2);
                if (e1) e1.value = v;
                if (e2) e2.value = v;
            });
            _nasMirrorLock = false;
        });
    }

    /** 사이드바↔설정 WebDAV 입력란 실시간 미러링 */
    function installFormMirror() {
        _NAS_FIELD_TRIPLE.forEach(([id1, id2]) => {
            const ea = document.getElementById(id1);
            const eb = document.getElementById(id2);
            if (!ea || !eb) return;
            const mirror = (from, to) => {
                if (_nasMirrorLock) return;
                _nasMirrorLock = true;
                to.value = from.value;
                _nasMirrorLock = false;
            };
            ea.addEventListener('input', () => mirror(ea, eb));
            eb.addEventListener('input', () => mirror(eb, ea));
        });
    }

    /** 접속 폼에서 URL·계정 읽기 (두 위치 중 비어 있지 않은 값) */
    function _readConnectFormValues() {
        function firstNonEmpty(ids) {
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(ids[i]);
                if (el && String(el.value || '').trim() !== '') return String(el.value).trim();
            }
            const el = document.getElementById(ids[0]);
            return el ? String(el.value || '').trim() : '';
        }
        const baseUrl = firstNonEmpty(['nas-url-input', 'hk-nas-url-input']).replace(/\/$/, '');
        const user = firstNonEmpty(['nas-user-input', 'hk-nas-user-input']);
        const p1 = document.getElementById('nas-pass-input');
        const p2 = document.getElementById('hk-nas-pass-input');
        const pass = String((p1 && p1.value) || (p2 && p2.value) || '');
        return { baseUrl, user, pass };
    }

    /** baseUrl과 상대 경로(선행 / 없음)를 절대 URL로 합침 */
    function _joinUrl(rel) {
        const c = _loadCfg();
        if (!c || !c.baseUrl) throw new Error('WebDAV 미연결');
        const base = c.baseUrl.replace(/\/$/, '');
        const r = String(rel || '').replace(/^\/+/, '');
        return r ? base + '/' + r : base + '/';
    }

    /** 절대 URL의 pathname을 세그먼트 단위로 인코딩해 fetch 헤더(Destination 등)에 넣을 수 있게 한다. 한글 경로 시 ISO-8859-1 오류 방지 */
    function _toHeaderSafeAbsoluteUrl(absoluteUrl) {
        const u = new URL(absoluteUrl);
        const encodedPath = u.pathname.split('/').map(segment => {
            if (segment === '') return '';
            try {
                return encodeURIComponent(decodeURIComponent(segment));
            } catch (e) {
                return encodeURIComponent(segment);
            }
        }).join('/');
        return u.origin + encodedPath + u.search + u.hash;
    }

    /** WebDAV 요청 (상대 경로 또는 절대 URL) */
    async function _dav(relPath, opts) {
        await _ensureNasStorageReady();
        const c = _authCfg();
        if (!c) throw new Error('WebDAV 미연결');
        const url = relPath.startsWith('http') ? relPath : _joinUrl(relPath);
        const headers = {
            'Authorization': _basicAuth(c.user, c.pass),
            ...(opts && opts.headers ? opts.headers : {}),
        };
        const res = await fetch(url, { ...opts, headers });
        return res;
    }

    function _xmlLocal(el) {
        if (!el || !el.nodeName) return '';
        const n = el.nodeName;
        return n.indexOf(':') >= 0 ? n.split(':').pop() : n;
    }

    function _collectByLocal(root, name, acc) {
        if (!root) return;
        if (root.nodeType === 1) {
            if (_xmlLocal(root).toLowerCase() === name.toLowerCase()) acc.push(root);
            const ch = root.children;
            for (let i = 0; i < ch.length; i++) _collectByLocal(ch[i], name, acc);
        }
    }

    function _firstChildLocal(el, name) {
        if (!el) return null;
        const ch = el.children;
        for (let i = 0; i < ch.length; i++) {
            if (_xmlLocal(ch[i]).toLowerCase() === name.toLowerCase()) return ch[i];
        }
        return null;
    }

    function _allChildLocal(el, name) {
        const out = [];
        if (!el) return out;
        const ch = el.children;
        for (let i = 0; i < ch.length; i++) {
            if (_xmlLocal(ch[i]).toLowerCase() === name.toLowerCase()) out.push(ch[i]);
        }
        return out;
    }

    /** PROPFIND XML → { href, isCollection, size, modified }[] */
    function _parsePropfind(xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
        const responses = [];
        _collectByLocal(doc.documentElement, 'response', responses);
        const out = [];
        responses.forEach(resp => {
            const hrefEl = _firstChildLocal(resp, 'href');
            if (!hrefEl) return;
            let href = _xmlText(hrefEl);
            if (!href) return;
            const propstats = _allChildLocal(resp, 'propstat');
            let isCollection = false;
            let size = null;
            let modified = null;
            propstats.forEach(ps => {
                const prop = _firstChildLocal(ps, 'prop');
                if (!prop) return;
                const rt = _firstChildLocal(prop, 'resourcetype');
                if (rt && _firstChildLocal(rt, 'collection')) isCollection = true;
                const lenEl = _firstChildLocal(prop, 'getcontentlength');
                if (lenEl && _xmlText(lenEl)) size = parseInt(_xmlText(lenEl), 10);
                const modEl = _firstChildLocal(prop, 'getlastmodified');
                if (modEl && _xmlText(modEl)) {
                    const t = Date.parse(_xmlText(modEl));
                    if (!isNaN(t)) modified = t;
                }
            });
            out.push({ href, isCollection, size: isNaN(size) ? null : size, modified });
        });
        return out;
    }

    function _xmlText(el) {
        return el && el.textContent ? el.textContent.trim() : '';
    }

    /** href → 저장소 루트 기준 상대 경로 (슬래시 없음) */
    function _relPathFromHref(hrefRaw) {
        const c = _loadCfg();
        if (!c) return '';
        let path = hrefRaw;
        try {
            if (hrefRaw.startsWith('http')) {
                const u = new URL(hrefRaw);
                path = u.pathname;
            }
        } catch (_) {}
        path = decodeURIComponent(path);
        const base = new URL(c.baseUrl + '/');
        let bp = base.pathname;
        if (!bp.endsWith('/')) bp += '/';
        if (path.startsWith(bp)) path = path.slice(bp.length);
        return path.replace(/^\/+/, '').replace(/\/$/, '');
    }

    /** 전체 목록: Depth infinity PROPFIND, 실패 시 Depth 1 반복 */
    async function _propfindRecursive() {
        await _ensureNasStorageReady();
        const c = _authCfg();
        if (!c) throw new Error('WebDAV 미연결');
        const rootUrl = c.baseUrl.endsWith('/') ? c.baseUrl : c.baseUrl + '/';
        let res = await fetch(rootUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': _basicAuth(c.user, c.pass),
                'Depth': 'infinity',
                'Content-Type': 'application/xml',
            },
            body: '<?xml version="1.0"?><propfind xmlns="DAV:"><allprop/></propfind>',
        });
        let xml = await res.text();
        if (res.ok) return _parsePropfind(xml);
        res = await fetch(rootUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': _basicAuth(c.user, c.pass),
                'Depth': '1',
                'Content-Type': 'application/xml',
            },
            body: '<?xml version="1.0"?><propfind xmlns="DAV:"><allprop/></propfind>',
        });
        xml = await res.text();
        if (!res.ok) throw new Error('PROPFIND ' + res.status + ': ' + (xml.slice(0, 200) || res.statusText));
        return _expandDepthOne(_parsePropfind(xml));
    }

    /** Depth 1만 지원 시 폴더별 추가 PROPFIND */
    async function _expandDepthOne(entries) {
        const c = _authCfg();
        if (!c) return entries;
        const seen = new Set();
        const all = [...entries];
        entries.forEach(e => {
            const rel = _relPathFromHref(e.href);
            if (rel) seen.add(rel);
        });
        const folders = entries.filter(e => e.isCollection && _relPathFromHref(e.href) !== '');
        for (const f of folders) {
            const rel = _relPathFromHref(f.href);
            if (!rel) continue;
            const url = _joinUrl(rel + '/');
            try {
                const res = await fetch(url, {
                    method: 'PROPFIND',
                    headers: {
                        'Authorization': _basicAuth(c.user, c.pass),
                        'Depth': '1',
                        'Content-Type': 'application/xml',
                    },
                    body: '<?xml version="1.0"?><propfind xmlns="DAV:"><allprop/></propfind>',
                });
                const xml = await res.text();
                if (!res.ok) continue;
                const inner = _parsePropfind(xml);
                inner.forEach(item => {
                    const r = _relPathFromHref(item.href);
                    if (r && !seen.has(r)) {
                        seen.add(r);
                        all.push(item);
                    }
                });
            } catch (_) {}
        }
        return all;
    }

    function _entriesToFiles(entries) {
        const rows = [];
        const rootEmpty = new Set();
        entries.forEach(e => {
            const rel = _relPathFromHref(e.href);
            if (rel === '') return;
            if (e.isCollection) return;
            const parts = rel.split('/').filter(Boolean);
            const name = parts.pop() || '';
            const ext = (name.split('.').pop() || '').toLowerCase();
            if (!EXT.includes(ext)) return;
            const folder = parts.length ? parts.join('/') : '/';
            rows.push({
                name,
                ext,
                folder,
                path: rel,
                size: e.size,
                modified: e.modified || null,
            });
        });
        entries.forEach(e => {
            const rel = _relPathFromHref(e.href);
            if (rel === '' || !e.isCollection) return;
            const hasChildFile = rows.some(f => f.path.startsWith(rel + '/'));
            if (!hasChildFile) rootEmpty.add(rel);
        });
        rows.sort((a, b) => a.path.localeCompare(b.path));
        return { files: rows, emptyFolders: rootEmpty };
    }

    /** 원격 목록 다시 불러와 렌더. opts.silent 이면 성공 토스트 생략(저장 후 갱신 등) */
    async function refresh(opts) {
        await _ensureNasStorageReady();
        const silent = opts && opts.silent;
        const el = document.getElementById('nas-list-msg');
        if (el) { el.textContent = '⟳ 목록 불러오는 중…'; el.style.display = ''; }
        try {
            const entries = await _propfindRecursive();
            const { files, emptyFolders } = _entriesToFiles(entries);
            allFiles = files;
            _emptyFolders = emptyFolders;
            _lastListAt = Date.now();
            _applyFilters();
            _updateHdr();
            _render();
            if (!silent && typeof App !== 'undefined' && App._toast) App._toast('✓ WebDAV 목록 갱신됨');
        } catch (e) {
            if (!silent && typeof App !== 'undefined' && App._toast) App._toast('⚠ WebDAV: ' + (e.message || e));
            allFiles = [];
            filtered = [];
            _render();
        } finally {
            if (el) el.style.display = 'none';
        }
    }

    let _emptyFolders = new Set();

    function _updateHdr() {
        const info = document.getElementById('nas-saved-info');
        if (!info) return;
        if (!isConnected()) {
            info.style.display = 'none';
            return;
        }
        const n = allFiles.length;
        const t = _lastListAt ? new Date(_lastListAt).toLocaleString('ko-KR') : '';
        info.textContent = t ? `목록 갱신: ${t} (${n}개)` : `${n}개`;
        info.style.display = '';
    }

    function search(q) {
        _searchQuery = (q && q.trim()) ? q.trim() : '';
        _applyFilters();
        _render();
    }

    function _applyFilters() {
        const base = allFiles;
        filtered = _searchQuery
            ? base.filter(f => f.name.toLowerCase().includes(_searchQuery.toLowerCase()))
            : base;
    }

    function _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _formatSize(bytes) {
        if (bytes == null || bytes < 0) return '';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return bytes + 'B';
    }

    function _getLockedFolders() {
        try {
            const raw = localStorage.getItem(LOCK_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (e) { return new Set(); }
    }

    function _setLockedFolders(set) {
        try { localStorage.setItem(LOCK_KEY, JSON.stringify([...set])); } catch (e) {}
    }

    function _highlight(path) {
        const list = document.getElementById('nas-list');
        if (!list) return;
        list.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.nasPath === path);
        });
    }

    /** WebDAV .mdp 복원 성공 후 사이드바를「파일 → WebDAV」로 맞추고 목록을 다시 불러온다 */
    function applyNasUiAfterMdpImport() {
        try {
            if (typeof SB !== 'undefined' && SB.switchTab) SB.switchTab('files');
            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('nas');
            if (typeof SB !== 'undefined' && SB.syncFilesDefaultSourceSelect) SB.syncFilesDefaultSourceSelect();
        } catch (e) { /* ignore */ }
    }

    /** WebDAV의 .mdp 프로젝트 파일을 HistorySave로 복원한다. skipConfirm 이면 확인 생략(선택 모달에서 호출 시) */
    async function _openMdpProjectFromNas(f, skipConfirm) {
        if (!f || typeof HistorySave === 'undefined' || !HistorySave.importFromMdp) return;
        if (!skipConfirm) {
            const ok = confirm('WebDAV의 .mdp 프로젝트를 불러올까요?\n탭·inDB 백업이 스냅샷 내용으로 갱신될 수 있습니다.');
            if (!ok) return;
        }
        try {
            const res = await _dav(f.path, { method: 'GET' });
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            const file = new File([blob], f.name || 'project.mdp', { type: 'application/octet-stream' });
            const imported = await HistorySave.importFromMdp(file);
            if (imported) applyNasUiAfterMdpImport();
        } catch (e) {
            alert('.mdp 불러오기 실패: ' + (e.message || e));
        }
    }

    /** WebDAV에서 .mdp 목록을 고르면 프로젝트 복원 (연결·목록 필요) */
    function importMdpFromNasUI() {
        if (!isConnected()) {
            alert('WebDAV에 먼저 접속하세요.\n설정 또는 파일 패널 → WebDAV 탭에서 접속할 수 있습니다.');
            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('nas');
            return;
        }
        const mdps = allFiles.filter(x => x.ext === 'mdp');
        if (!mdps.length) {
            alert('현재 WebDAV 목록에 .mdp 파일이 없습니다.\n파일 패널 WebDAV 탭에서 ↻ 새로고침 후 다시 시도하세요.');
            return;
        }
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
            const opts = mdps.map(m => `<option value="${_esc(m.path)}">${_esc(m.path)}</option>`).join('');
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:18px 20px;min-width:300px;max-width:480px;width:92%';
            box.innerHTML = `
                <div style="font-weight:700;font-size:13px;color:var(--txh);margin-bottom:10px">📦 WebDAV에서 .mdp 가져오기</div>
                <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">프로젝트 백업(.mdp)을 선택한 뒤 불러오기를 누르세요.</div>
                <select id="nas-mdp-pick-sel" style="width:100%;margin-bottom:14px;padding:8px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx);font-size:11px">${opts}</select>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-mdp-pick-cancel" class="btn btn-g btn-sm">취소</button>
                    <button type="button" id="nas-mdp-pick-ok" class="btn btn-p btn-sm">불러오기</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const close = () => { ov.remove(); resolve(); };
            document.getElementById('nas-mdp-pick-cancel').onclick = close;
            ov.onclick = (e) => { if (e.target === ov) close(); };
            document.getElementById('nas-mdp-pick-ok').onclick = async () => {
                const path = document.getElementById('nas-mdp-pick-sel').value;
                const mf = mdps.find(x => x.path === path);
                close();
                if (mf) await _openMdpProjectFromNas(mf, true);
            };
        });
    }

    /** 파일 열기 → 에디터 (.mdp 는 프로젝트 복원) */
    async function _openFile(f) {
        if (!f || typeof TM === 'undefined') return;
        _activePath = f.path;
        _highlight(f.path);
        if (f.ext === 'mdp') {
            await _openMdpProjectFromNas(f);
            return;
        }
        const name = f.name.replace(/\.[^.]+$/, '');
        const ft = f.ext === 'html' ? 'md' : f.ext;
        try {
            const res = await _dav(f.path, { method: 'GET' });
            if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
            let raw = await res.text();
            if (f.ext === 'html' && TM._htmlToEditableContent) raw = TM._htmlToEditableContent(raw);
            const existing = TM.getAll().find(t => (t.filePath || '') === 'nas:' + f.path);
            if (existing) {
                TM.switchTab(existing.id);
                return;
            }
            const tab = TM.newTab(name, raw, ft);
            tab.filePath = 'nas:' + f.path;
            TM.markClean(tab.id);
            TM.renderTabs();
            TM.persist();
        } catch (e) {
            alert('WebDAV 파일 열기 실패: ' + (e.message || e));
        }
    }

    /** 상대 파일 경로의 부모 폴더들을 MKCOL로 만든다 (이미 있으면 405 등은 무시) */
    async function _ensureParentDirs(relFilePath) {
        await _ensureNasStorageReady();
        const parts = String(relFilePath || '').split('/').filter(Boolean);
        if (parts.length <= 1) return;
        const c = _authCfg();
        if (!c) throw new Error('WebDAV 미연결');
        for (let i = 0; i < parts.length - 1; i++) {
            const dir = parts.slice(0, i + 1).join('/');
            const url = _joinUrl(dir + '/');
            const res = await fetch(url, {
                method: 'MKCOL',
                headers: { 'Authorization': _basicAuth(c.user, c.pass) },
            });
            if (res.ok || res.status === 201 || res.status === 204 || res.status === 405 || res.status === 409) continue;
            throw new Error('MKCOL ' + dir + ' → ' + res.status);
        }
    }

    /** 텍스트 PUT (부모 MKCOL 포함, 목록 갱신 없음) */
    async function _putTextContent(relPath, content) {
        await _ensureParentDirs(relPath);
        const res = await _dav(relPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: content != null ? String(content) : '',
        });
        if (!res.ok && res.status !== 204 && res.status !== 201) throw new Error('PUT ' + res.status);
    }

    /** Blob PUT (부모 MKCOL 포함, 목록 갱신 없음) */
    async function _putBinaryContent(relPath, blob, mime) {
        await _ensureParentDirs(relPath);
        const res = await _dav(relPath, {
            method: 'PUT',
            headers: { 'Content-Type': mime || 'application/octet-stream' },
            body: blob,
        });
        if (!res.ok && res.status !== 204 && res.status !== 201) throw new Error('PUT ' + res.status);
    }

    /** 탭 저장용: 상대 경로에 PUT */
    async function saveFileContent(relPath, content) {
        await _putTextContent(relPath, content);
        await refresh({ silent: true });
        return true;
    }

    function toggleFoldAll() {
        const list = document.getElementById('nas-list');
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
        const foldBtn = document.getElementById('nas-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = collapse ? '▾' : '▽';
    }

    function _render() {
        const list = document.getElementById('nas-list');
        if (!list) return;
        list.innerHTML = '';
        if (!isConnected()) {
            list.innerHTML = '<div class="files-empty"><div style="font-size:28px;margin-bottom:8px">📁</div>' +
                '<div style="font-weight:600;margin-bottom:6px">WebDAV 미연결</div>' +
                '<div style="color:var(--tx3);font-size:10px;line-height:1.7">상단에서 서버 URL·아이디·비밀번호 입력 후<br><b>접속하기</b>를 눌러 주세요.<br>CORS는 WebDAV 서버에서 허용해야 합니다.</div></div>';
            return;
        }
        if (!allFiles.length && !_emptyFolders.size) {
            list.innerHTML = '<div class="files-empty"><div style="font-size:28px;margin-bottom:8px">📂</div>' +
                '<div style="font-weight:600;margin-bottom:6px">표시할 파일이 없습니다</div>' +
                '<div style="color:var(--tx3);font-size:10px;line-height:1.7">새 파일·새 폴더로 추가하거나<br>↻ 새로고침으로 목록을 다시 불러오세요.</div></div>';
            return;
        }
        const src = filtered;
        if (!src.length && !_emptyFolders.size) {
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
        _emptyFolders.forEach(folderRel => {
            const parts = folderRel.split('/').filter(Boolean);
            let node = root;
            let acc = '';
            for (let i = 0; i < parts.length; i++) {
                const seg = parts[i];
                acc = acc ? acc + '/' + seg : seg;
                if (!node.children[seg]) {
                    node.children[seg] = { name: seg, children: {}, files: [], _fullPath: acc, _isEmpty: true };
                }
                node = node.children[seg];
            }
        });

        function countFiles(node) {
            let n = node.files.length;
            Object.values(node.children).forEach(c => { n += countFiles(c); });
            return n;
        }

        function renderNode(node, depth, container) {
            const indent = depth * 12;
            Object.keys(node.children).sort().forEach(folderName => {
                const child = node.children[folderName];
                child._fullPath = child._fullPath || (node._fullPath ? node._fullPath + '/' : '') + folderName;
                const total = countFiles(child);
                const ghIsEmpty = !!(child._isEmpty && total === 0);
                const folderEl = document.createElement('div');
                folderEl.className = 'ft-folder';
                folderEl.dataset.path = child._fullPath;
                const hdr = document.createElement('div');
                hdr.className = 'ft-folder-hdr';
                hdr.style.paddingLeft = (8 + indent) + 'px';
                const folderPath = child._fullPath;
                hdr.innerHTML =
                    `<span class="ft-toggle">${ghIsEmpty ? '—' : '▾'}</span>` +
                    `<span class="ft-folder-icon">📂</span>` +
                    `<span class="ft-folder-name">${_esc(folderName)}</span>` +
                    `<span class="ft-folder-lock" title="접었을 때 잠금" role="button" tabindex="0">▼</span>` +
                    `<span class="ft-count" style="${ghIsEmpty ? 'opacity:.4' : ''}">${ghIsEmpty ? '빈 폴더' : total}</span>` +
                    `<button class="fg-add-btn" title="이 폴더에 새 파일 만들기" onclick="event.stopPropagation();NAS._createFileInFolder('${_esc(folderPath)}')">＋</button>` +
                    `<button class="folder-move-btn" title="폴더 이동" data-path="${_esc(folderPath)}" onclick="event.stopPropagation();NAS.moveFolder(this)">↗</button>` +
                    `<button class="folder-rename-btn" title="폴더명 고치기" data-path="${_esc(folderPath)}" onclick="event.stopPropagation();NAS.renameFolder(this)">✎</button>` +
                    `<button class="folder-del-btn" title="폴더 삭제" data-path="${_esc(folderPath)}" onclick="event.stopPropagation();NAS.confirmDeleteFolder(this)">🗑</button>`;
                hdr.onclick = (e) => {
                    if (e.target.closest('.ft-folder-lock')) return;
                    if (ghIsEmpty) return;
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
                        hdr.querySelector('.ft-toggle').textContent = ghIsEmpty ? '—' : '▸';
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
            node.files.sort((a, b) => (b.modified || 0) - (a.modified || 0)).forEach(f => {
                const row = document.createElement('div');
                row.className = 'file-item' + (f.path === _activePath ? ' active' : '');
                row.dataset.nasPath = f.path;
                row.style.paddingLeft = (18 + indent) + 'px';
                const icon = f.ext === 'mdp' ? '📦' : f.ext === 'html' ? '🌐' : f.ext === 'txt' ? '📄' : '📝';
                const sizeStr = _formatSize(f.size);
                const modStr = f.modified ? new Date(f.modified).toLocaleDateString('ko', { month: '2-digit', day: '2-digit' }) : '';
                const metaContent = sizeStr && modStr
                    ? `<span class="file-item-meta-size">${sizeStr}</span> · <span class="file-item-meta-date">${modStr}</span>`
                    : sizeStr ? `<span class="file-item-meta-size">${sizeStr}</span>` : modStr ? `<span class="file-item-meta-date">${modStr}</span>` : '';
                row.innerHTML =
                    `<span class="file-item-icon">${icon}</span>` +
                    `<span class="file-item-name">${_esc(f.name.replace(/\.[^.]+$/, ''))}</span>` +
                    (metaContent ? `<span class="file-item-meta">${metaContent}</span>` : '') +
                    `<button class="file-share-btn" title="다운로드(열기)" onclick="event.stopPropagation();NAS.downloadFile('${_esc(f.path)}')" style="font-size:9px;padding:1px 4px">⬇</button>` +
                    `<button class="file-move-btn" title="파일 이동" onclick="event.stopPropagation();NAS.moveFile(this)">↗</button>` +
                    `<button class="file-rename-btn" title="파일명 고치기" onclick="event.stopPropagation();NAS.renameFile(this)">✎</button>` +
                    `<button class="file-del-btn" title="삭제" onclick="event.stopPropagation();NAS.confirmDelete(this)">🗑</button>`;
                row.title = f.path;
                row._nasFile = f;
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
        const foldBtn = document.getElementById('nas-fold-toggle-btn');
        if (foldBtn) foldBtn.textContent = '▽';
    }

    async function downloadFile(relPath) {
        try {
            const res = await _dav(relPath, { method: 'GET' });
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = relPath.split('/').pop() || 'file';
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            alert('다운로드 실패: ' + (e.message || e));
        }
    }

    function confirmDelete(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._nasFile;
        if (!f) return;
        const run = async () => {
            try {
                const res = await _dav(f.path, { method: 'DELETE' });
                if (!res.ok && res.status !== 204) throw new Error(String(res.status));
                const tab = TM.getAll().find(t => t.filePath === 'nas:' + f.path);
                if (tab) TM.closeTab(tab.id);
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('🗑 삭제됨');
            } catch (e) {
                alert('삭제 실패: ' + (e.message || e));
            }
        };
        if (typeof DelConfirm !== 'undefined') {
            DelConfirm.show({ name: f.name, path: f.path, type: 'nas', onConfirm: run });
        } else {
            if (confirm('삭제할까요? ' + f.name)) run();
        }
    }

    async function confirmDeleteFolder(btn) {
        const folderPath = btn.dataset.path;
        if (!folderPath || !confirm('폴더 "' + folderPath + '" 및 내부 파일을 WebDAV에서 삭제할까요?')) return;
        try {
            const res = await _dav(folderPath + '/', { method: 'DELETE' });
            if (!res.ok && res.status !== 204) {
                const res2 = await _dav(folderPath, { method: 'DELETE' });
                if (!res2.ok && res2.status !== 204) throw new Error(String(res.status));
            }
            await refresh();
            if (typeof App !== 'undefined' && App._toast) App._toast('🗑 폴더 삭제됨');
        } catch (e) {
            alert('폴더 삭제 실패: ' + (e.message || e));
        }
    }

    function moveFile(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._nasFile;
        if (!f) return;
        const folders = new Set(['/']);
        allFiles.forEach(ff => {
            const parts = ff.path.split('/');
            for (let i = 1; i < parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        });
        _emptyFolders.forEach(p => {
            const parts = p.split('/');
            for (let i = 1; i <= parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        });
        const currentFolder = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '/';
        const opts = [...folders].sort().filter(p => p !== currentFolder).map(p => ({
            value: p,
            label: p === '/' ? '루트' : p,
        }));
        _showNasMoveModal(f.name, opts).then(async (dest) => {
            if (dest == null) return;
            const destFolder = dest === '/' ? '' : dest;
            const newPath = destFolder ? destFolder + '/' + f.name : f.name;
            if (newPath === f.path) return;
            try {
                await _ensureNasStorageReady();
                const destUrlRaw = _joinUrl(newPath);
                const destUrl = _toHeaderSafeAbsoluteUrl(destUrlRaw);
                const res = await _dav(f.path, {
                    method: 'MOVE',
                    headers: {
                        'Destination': destUrl,
                        'Overwrite': 'T',
                    },
                });
                if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(String(res.status));
                TM.getAll().filter(t => t.filePath === 'nas:' + f.path).forEach(t => {
                    t.filePath = 'nas:' + newPath;
                });
                TM.renderTabs();
                TM.persist();
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 이동 완료');
            } catch (e) {
                alert('이동 실패: ' + (e.message || e));
            }
        });
    }

    /** WebDAV 폴더(컬렉션) MOVE — 슬래시 유무에 따라 한 번 더 시도한다 */
    async function _nasDavMoveFolderRel(fromRel, toRel) {
        await _ensureNasStorageReady();
        let fromN = String(fromRel || '').replace(/\/$/, '');
        let toN   = String(toRel || '').replace(/\/$/, '');
        if (!fromN || fromN === toN) return;
        const destAbs  = _toHeaderSafeAbsoluteUrl(_joinUrl(toN));
        const destFold = destAbs.endsWith('/') ? destAbs : destAbs + '/';
        let res = await _dav(fromN + '/', {
            method: 'MOVE',
            headers: { 'Destination': destFold, 'Overwrite': 'T' },
        });
        if (!res.ok && res.status !== 201 && res.status !== 204) {
            res = await _dav(fromN, {
                method: 'MOVE',
                headers: { 'Destination': destAbs, 'Overwrite': 'T' },
            });
        }
        if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(String(res.status));
    }

    /** nas: 탭 경로에서 폴더 접두어를 치환한다 */
    function _nasRemapTabsFolderPrefix(oldP, newP) {
        if (typeof TM === 'undefined' || !TM.getAll) return;
        const o = oldP.replace(/\/$/, '');
        const n = newP.replace(/\/$/, '');
        TM.getAll().forEach(t => {
            const fp = t.filePath || '';
            if (!fp.startsWith('nas:')) return;
            const rel = fp.slice(4);
            if (rel === o) t.filePath = 'nas:' + n;
            else if (rel.startsWith(o + '/')) t.filePath = 'nas:' + n + rel.slice(o.length);
        });
        TM.renderTabs();
        if (TM.persist) TM.persist();
    }

    /** WebDAV 파일명만 변경(같은 폴더) */
    function renameFile(btn) {
        const row = btn.closest('.file-item');
        const f = row && row._nasFile;
        if (!f) return;
        const input = prompt('새 파일명 (확장자 포함)', f.name);
        if (input == null) return;
        const newName = String(input).trim().replace(/[\\/:*?"<>|]/g, '_');
        if (!newName || newName === f.name) return;
        const parent = f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : '';
        const newPath = parent ? parent + '/' + newName : newName;
        if (newPath === f.path) return;
        if (allFiles.some(x => x.path === newPath)) {
            alert('같은 경로에 파일이 이미 있습니다.');
            return;
        }
        (async () => {
            try {
                await _ensureNasStorageReady();
                const destUrlRaw = _joinUrl(newPath);
                const destUrl = _toHeaderSafeAbsoluteUrl(destUrlRaw);
                const res = await _dav(f.path, {
                    method: 'MOVE',
                    headers: { 'Destination': destUrl, 'Overwrite': 'T' },
                });
                if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(String(res.status));
                TM.getAll().filter(t => t.filePath === 'nas:' + f.path).forEach(t => {
                    t.filePath = 'nas:' + newPath;
                });
                TM.renderTabs();
                TM.persist();
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 파일명 변경됨');
            } catch (e) {
                alert('이름 변경 실패: ' + (e.message || e));
            }
        })();
    }

    /** WebDAV 폴더명만 변경 */
    function renameFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath) return;
        const parts = folderPath.split('/').filter(Boolean);
        const leaf = parts.pop();
        if (!leaf) return;
        const parent = parts.join('/');
        const input = prompt('새 폴더 이름', leaf);
        if (input == null) return;
        const newLeaf = String(input).trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\/+/g, '');
        if (!newLeaf || newLeaf === leaf) return;
        const newFull = parent ? parent + '/' + newLeaf : newLeaf;
        if (newFull === folderPath) return;
        (async () => {
            try {
                await _nasDavMoveFolderRel(folderPath, newFull);
                _nasRemapTabsFolderPrefix(folderPath, newFull);
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 폴더명 변경됨');
            } catch (e) {
                alert('폴더명 변경 실패: ' + (e.message || e));
            }
        })();
    }

    /** WebDAV 폴더를 다른 상위 경로로 이동 */
    function moveFolder(btn) {
        const folderPath = (btn.dataset.path || '').replace(/\/$/, '');
        if (!folderPath) return;
        const parts = folderPath.split('/').filter(Boolean);
        const leaf = parts.pop();
        if (!leaf) return;
        const parentPath = parts.length ? parts.join('/') : '';
        const parentKey = parentPath || '/';
        const isUnder = (p) => p === folderPath || (folderPath && p.startsWith(folderPath + '/'));

        const folders = new Set(['/']);
        allFiles.forEach(ff => {
            const ps = ff.path.split('/');
            for (let i = 1; i < ps.length; i++) {
                folders.add(ps.slice(0, i).join('/'));
            }
        });
        _emptyFolders.forEach(p => {
            const ps = p.split('/');
            for (let i = 1; i <= ps.length; i++) {
                folders.add(ps.slice(0, i).join('/'));
            }
        });
        const currentFolder = parentKey;
        const opts = [...folders].sort().filter(p => !isUnder(p) && p !== currentFolder).map(p => ({
            value: p,
            label: p === '/' ? '루트' : p,
        }));
        if (!opts.length) {
            if (typeof App !== 'undefined' && App._toast) App._toast('이동할 상위 폴더가 없습니다');
            return;
        }
        _showNasMoveModal(leaf, opts, '📦 WebDAV 폴더 이동').then(async (dest) => {
            if (dest == null) return;
            const newFull = dest === '/' ? leaf : dest + '/' + leaf;
            if (newFull === folderPath) return;
            try {
                await _nasDavMoveFolderRel(folderPath, newFull);
                _nasRemapTabsFolderPrefix(folderPath, newFull);
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 폴더 이동 완료');
            } catch (e) {
                alert('폴더 이동 실패: ' + (e.message || e));
            }
        });
    }

    /** WebDAV 이동 대상 폴더 선택 모달 (title 선택) */
    function _showNasMoveModal(fileName, folderOptions, title) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;min-width:320px;max-width:440px;width:90%';
            const head = title || '📦 WebDAV 파일 이동';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:var(--txh)">${_esc(head)}</span>
                    <button type="button" id="nas-mv-close" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:18px">✕</button>
                </div>
                <div style="font-size:12px;color:var(--tx2);margin-bottom:12px">${_esc(fileName)}</div>
                <label style="font-size:11px;color:var(--tx3);display:block;margin-bottom:6px">대상 폴더</label>
                <select id="nas-mv-dest" style="width:100%;margin-bottom:16px;padding:8px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx)">
                    ${folderOptions.map(o => `<option value="${_esc(o.value)}">${_esc(o.label)}</option>`).join('')}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-mv-cancel" class="btn btn-g btn-sm">취소</button>
                    <button type="button" id="nas-mv-ok" class="btn btn-p btn-sm">이동</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-mv-close').onclick = () => close(null);
            document.getElementById('nas-mv-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-mv-ok').onclick = () => {
                close(document.getElementById('nas-mv-dest').value);
            };
        });
    }

    function _getFolderOptionsForNew() {
        const folders = new Set(['']);
        allFiles.forEach(f => {
            const parts = f.path.split('/');
            for (let i = 1; i < parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        });
        _emptyFolders.forEach(p => {
            const parts = p.split('/');
            for (let i = 1; i <= parts.length; i++) {
                folders.add(parts.slice(0, i).join('/'));
            }
        });
        return [...folders].sort().map(p => ({
            value: p,
            label: p === '' ? '루트' : p,
        }));
    }

    function createNewFilePrompt() {
        if (!isConnected()) { alert('먼저 WebDAV에 접속하세요.'); return; }
        const folderOptions = _getFolderOptionsForNew();
        _showNewFileModal(folderOptions).then(async (result) => {
            if (!result) return;
            let fname = (result.fileName || '').trim();
            if (!fname) return;
            if (!/\.[a-z]+$/i.test(fname)) fname += '.md';
            fname = fname.replace(/[\\:*?"<>|]/g, '_');
            const parent = (result.folderVal || '').trim();
            const relPath = parent ? parent + '/' + fname : fname;
            try {
                const res = await _dav(relPath, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                    body: '# ' + fname.replace(/\.[^.]+$/, '') + '\n\n',
                });
                if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(String(res.status));
                await refresh();
                const f = allFiles.find(x => x.path === relPath);
                if (f) _openFile(f);
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 파일 생성됨');
            } catch (e) {
                alert('생성 실패: ' + (e.message || e));
            }
        });
    }

    function createNewFolderPrompt() {
        if (!isConnected()) { alert('먼저 WebDAV에 접속하세요.'); return; }
        const folderOptions = _getFolderOptionsForNew();
        _showNewFolderModal(folderOptions).then(async (result) => {
            if (!result) return;
            const parent = (result.folderVal || '').trim();
            let name = (result.folderName || '').trim().replace(/[/\\:*?"<>|]/g, '_');
            if (!name) return;
            const rel = parent ? parent + '/' + name : name;
            try {
                await _ensureNasStorageReady();
                const url = _joinUrl(rel + '/');
                const c = _authCfg();
                if (!c) throw new Error('WebDAV 미연결');
                const res = await fetch(url, {
                    method: 'MKCOL',
                    headers: { 'Authorization': _basicAuth(c.user, c.pass) },
                });
                if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error('MKCOL ' + res.status);
                _emptyFolders.add(rel);
                await refresh();
                if (typeof App !== 'undefined' && App._toast) App._toast('✓ 폴더 생성됨');
            } catch (e) {
                alert('폴더 생성 실패: ' + (e.message || e));
            }
        });
    }

    function _showNewFileModal(folderOptions) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.id = 'nas-newfile-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
            const sel = folderOptions.map(o =>
                `<option value="${String(o.value).replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2)';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📄 새 파일 만들기</span>
                    <button type="button" id="nas-nf-close" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더 선택</label>
                    <select id="nas-nf-folder" style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;font-size:12px;padding:7px 10px">${sel}</select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">파일 이름 (.md 자동 추가)</label>
                    <input id="nas-nf-name" type="text" value="Untitled" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #ddd;border-radius:6px">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-nf-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:12px">취소</button>
                    <button type="button" id="nas-nf-ok" style="padding:6px 18px;border-radius:6px;border:none;background:#5c4cd4;color:#fff;font-size:12px;font-weight:600">✓ 생성</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const nameInput = document.getElementById('nas-nf-name');
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-nf-close').onclick = () => close(null);
            document.getElementById('nas-nf-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-nf-ok').onclick = () => {
                const fn = nameInput.value.trim();
                if (!fn) return;
                close({ folderVal: document.getElementById('nas-nf-folder').value, fileName: fn });
            };
        });
    }

    function _showNewFolderModal(folderOptions) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center';
            const sel = folderOptions.map(o =>
                `<option value="${String(o.value).replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📁 새 폴더 만들기</span>
                    <button type="button" id="nas-nd-close" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더 선택</label>
                    <select id="nas-nd-folder" style="width:100%;background:#f5f5f7;border:1px solid #ddd;border-radius:6px;font-size:12px;padding:7px 10px">${sel}</select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">폴더 이름</label>
                    <input id="nas-nd-name" type="text" value="새폴더" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #ddd;border-radius:6px">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-nd-cancel" style="padding:6px 16px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:12px">취소</button>
                    <button type="button" id="nas-nd-ok" style="padding:6px 18px;border-radius:6px;border:none;background:#5c4cd4;color:#fff;font-size:12px;font-weight:600">✓ 생성</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const ni = document.getElementById('nas-nd-name');
            setTimeout(() => { ni.focus(); ni.select(); }, 50);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-nd-close').onclick = () => close(null);
            document.getElementById('nas-nd-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-nd-ok').onclick = () => {
                const fn = ni.value.trim();
                if (!fn) return;
                close({ folderVal: document.getElementById('nas-nd-folder').value, folderName: fn });
            };
        });
    }

    function _createFileInFolder(folderPath) {
        if (!isConnected()) return;
        const folderOptions = [{ value: folderPath, label: folderPath || '루트' }];
        _showNewFileModal(folderOptions).then(async (result) => {
            if (!result) return;
            let fname = (result.fileName || '').trim();
            if (!fname) return;
            if (!/\.[a-z]+$/i.test(fname)) fname += '.md';
            fname = fname.replace(/[\\:*?"<>|]/g, '_');
            const parent = folderPath || '';
            const relPath = parent ? parent + '/' + fname : fname;
            try {
                const res = await _dav(relPath, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                    body: '# ' + fname.replace(/\.[^.]+$/, '') + '\n\n',
                });
                if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(String(res.status));
                await refresh();
                const f = allFiles.find(x => x.path === relPath);
                if (f) _openFile(f);
            } catch (e) {
                alert('생성 실패: ' + (e.message || e));
            }
        });
    }

    /** WebDAV에 다른 이름으로 저장 — 폴더·파일명 모달 후 PUT 및 탭에 nas: 경로 설정 */
    async function saveActiveDocumentAs() {
        const tab = typeof TM !== 'undefined' && TM.getActive ? TM.getActive() : null;
        if (!tab) return;
        if (!isConnected()) {
            alert('WebDAV에 먼저 접속하세요.');
            return;
        }
        await refresh({ silent: true }).catch(() => {});
        const content = (typeof el === 'function' && el('editor')) ? el('editor').value : (tab.content != null ? String(tab.content) : '');
        let defaultName = (tab.title || 'Untitled').replace(/[\\:*?"<>|]/g, '_');
        if (!/\.(md|txt|html)$/i.test(defaultName)) defaultName += '.md';
        const folderOptions = _getFolderOptionsForNew();
        const result = await _showSaveToNasModal(folderOptions, defaultName);
        if (!result) return;
        const folderPath = (result.folderVal || '').trim();
        let fileName = (result.filename || '').trim();
        if (!fileName) return;
        if (!/\.(md|txt|html)$/i.test(fileName)) fileName += '.md';
        fileName = fileName.replace(/[\\:*?"<>|]/g, '_');
        const base = folderPath ? folderPath + '/' : '';
        const path = base + fileName;
        try {
            await saveFileContent(path, content);
            tab.filePath = 'nas:' + path;
            tab.content = content;
            if (typeof TM !== 'undefined') {
                if (TM.markClean) TM.markClean(tab.id, { revealSavedInPanel: true });
                if (TM.persist) TM.persist();
                if (TM.renderTabs) TM.renderTabs();
            }
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ WebDAV에 저장됨');
        } catch (e) {
            alert('WebDAV 저장 실패: ' + (e.message || e));
        }
    }

    /** .mdp WebDAV 업로드용 폴더·파일명 모달 */
    function _showMdpUploadToNasModal(folderOptions, defaultFilename) {
        return new Promise(resolve => {
            const sel = folderOptions.map(o =>
                `<option value="${String(o.value).replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');
            const ov = document.createElement('div');
            ov.id = 'nas-mdp-upload-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9150;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📦 .mdp WebDAV에 올리기</span>
                    <button type="button" id="nas-mu-close" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px">✕</button>
                </div>
                <div style="font-size:11px;color:#555;margin-bottom:12px;line-height:1.5">현재 탭·파일 패널 상태로 만든 프로젝트(.mdp)를 WebDAV에 PUT합니다. 빈 저장소에 첫 백업을 올릴 때 사용하세요.</div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더</label>
                    <select id="nas-mu-folder" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;font-size:12px">${sel}</select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">파일명 (.mdp)</label>
                    <input id="nas-mu-name" type="text" value="${_esc(defaultFilename || 'project.mdp').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-mu-cancel" class="btn btn-g btn-sm">취소</button>
                    <button type="button" id="nas-mu-ok" class="btn btn-p btn-sm">업로드</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const ni = document.getElementById('nas-mu-name');
            setTimeout(() => { ni.focus(); ni.select(); }, 50);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-mu-close').onclick = () => close(null);
            document.getElementById('nas-mu-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-mu-ok').onclick = () => {
                const fn = ni.value.trim();
                if (!fn) return;
                close({ folderVal: document.getElementById('nas-mu-folder').value, filename: fn });
            };
        });
    }

    /** inDB → WebDAV 업로드: 폴더만 선택 */
    function _showInDbUploadToNasModal(folderOptions, fileCount) {
        return new Promise(resolve => {
            const sel = folderOptions.map(o =>
                `<option value="${String(o.value).replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');
            const ov = document.createElement('div');
            ov.id = 'nas-indb-upload-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9150;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📤 inDB → WebDAV</span>
                    <button type="button" id="nas-iu-close" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px">✕</button>
                </div>
                <div style="font-size:11px;color:#555;margin-bottom:12px;line-height:1.5">inDB에 있는 <b>.md / .txt / .html</b> ${fileCount}개를 선택한 WebDAV 폴더 아래에 <b>같은 상대 경로</b>로 올립니다.</div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">대상 폴더 (루트면 inDB 경로 그대로)</label>
                    <select id="nas-iu-folder" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;font-size:12px">${sel}</select>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-iu-cancel" class="btn btn-g btn-sm">취소</button>
                    <button type="button" id="nas-iu-ok" class="btn btn-p btn-sm">업로드</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-iu-close').onclick = () => close(null);
            document.getElementById('nas-iu-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-iu-ok').onclick = () => {
                close({ folderVal: document.getElementById('nas-iu-folder').value });
            };
        });
    }

    /** HistorySave.exportToMdpBlob으로 만든 .mdp를 WebDAV에 PUT한다 */
    async function uploadProjectMdpToNasUI() {
        if (!isConnected()) {
            alert('WebDAV에 먼저 접속하세요.\n설정 또는 파일 패널 → WebDAV 탭에서 접속할 수 있습니다.');
            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('nas');
            return;
        }
        if (typeof HistorySave === 'undefined' || !HistorySave.exportToMdpBlob) {
            alert('보내기 모듈을 불러올 수 없습니다.');
            return;
        }
        await refresh({ silent: true }).catch(() => {});
        let built;
        try {
            built = await HistorySave.exportToMdpBlob();
        } catch (e) {
            built = null;
        }
        if (!built || !built.blob) {
            if (typeof App !== 'undefined' && App._toast) App._toast('보낼 탭이 없거나 .mdp 생성에 실패했습니다.');
            return;
        }
        const folderOptions = _getFolderOptionsForNew();
        const result = await _showMdpUploadToNasModal(folderOptions, built.fileName || 'project.mdp');
        if (!result) return;
        let fileName = (result.filename || '').trim().replace(/[\\:*?"<>|]/g, '_');
        if (!fileName.toLowerCase().endsWith('.mdp')) fileName += '.mdp';
        const folderPath = (result.folderVal || '').trim();
        const relPath = folderPath ? folderPath + '/' + fileName : fileName;
        try {
            await _putBinaryContent(relPath, built.blob, built.mime || 'application/zip');
            await refresh();
            if (typeof App !== 'undefined' && App._toast) {
                App._toast('✓ WebDAV에 .mdp 업로드됨' + (built.mergedCount != null ? ' (' + built.mergedCount + '개 파일 반영)' : ''));
            }
        } catch (e) {
            alert('.mdp WebDAV 업로드 실패: ' + (e.message || e));
        }
    }

    /** 설정 등에서 호출: 확인 후 inDB→WebDAV 일괄 업로드를 실행한다 */
    async function uploadInDbFilesToNasUIAfterConfirm() {
        const ok = window.confirm(
            'inDB에 있는 .md / .txt / .html 파일을 WebDAV에 동일한 상대 경로로 올립니다.\n\n' +
            '[확인] = 진행\n[취소] = 진행 안 함'
        );
        if (!ok) return;
        await uploadInDbFilesToNasUI();
    }

    /** inDB의 md/txt/html만 골라 WebDAV에 동일 상대 경로로 일괄 PUT */
    async function uploadInDbFilesToNasUI() {
        if (!isConnected()) {
            alert('WebDAV에 먼저 접속하세요.');
            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('nas');
            return;
        }
        if (typeof InDB === 'undefined' || !InDB.getFiles) {
            alert('inDB 모듈을 사용할 수 없습니다.');
            return;
        }
        const raw = InDB.getFiles() || [];
        const files = raw.filter(f => {
            const ex = String(f.ext || '').toLowerCase();
            return ex === 'md' || ex === 'txt' || ex === 'html';
        });
        if (!files.length) {
            alert('inDB에 .md / .txt / .html 파일이 없습니다.\n.mdp 가져오기 또는 inDB 백업을 먼저 채운 뒤 시도하세요.');
            return;
        }
        await refresh({ silent: true }).catch(() => {});
        const folderOptions = _getFolderOptionsForNew();
        const result = await _showInDbUploadToNasModal(folderOptions, files.length);
        if (!result) return;
        const base = (result.folderVal || '').trim();
        let ok = 0;
        let fail = 0;
        for (const f of files) {
            const p = String(f.path || '').replace(/^\/+/, '');
            if (!p) { fail++; continue; }
            const rel = base ? base + '/' + p : p;
            try {
                await _putTextContent(rel, f.content != null ? String(f.content) : '');
                ok++;
            } catch (err) {
                fail++;
                console.warn('[WebDAV] inDB upload', rel, err);
            }
        }
        try {
            await refresh();
        } catch (_) {}
        if (typeof App !== 'undefined' && App._toast) {
            App._toast('✓ inDB → WebDAV ' + ok + '개 업로드' + (fail ? ' (' + fail + '개 실패)' : ''));
        }
    }

    /** WebDAV 저장용 폴더·파일명 모달 */
    function _showSaveToNasModal(folderOptions, defaultFilename) {
        return new Promise(resolve => {
            const sel = folderOptions.map(o =>
                `<option value="${String(o.value).replace(/"/g, '&quot;')}">${_esc(o.label)}</option>`
            ).join('');
            const ov = document.createElement('div');
            ov.id = 'nas-save-as-modal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:9150;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px 22px;min-width:340px;max-width:460px;width:90%';
            box.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <span style="font-size:14px;font-weight:700;color:#1a1a2e">📡 WebDAV에 저장</span>
                    <button type="button" id="nas-sa-close" style="background:none;border:none;cursor:pointer;color:#666;font-size:18px">✕</button>
                </div>
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">저장 폴더</label>
                    <select id="nas-sa-folder" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;font-size:12px">${sel}</select>
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:11px;color:#555;display:block;margin-bottom:5px">파일명</label>
                    <input id="nas-sa-name" type="text" value="${_esc(defaultFilename || 'Untitled.md').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button type="button" id="nas-sa-cancel" class="btn btn-g btn-sm">취소</button>
                    <button type="button" id="nas-sa-ok" class="btn btn-p btn-sm">저장</button>
                </div>`;
            ov.appendChild(box);
            document.body.appendChild(ov);
            const ni = document.getElementById('nas-sa-name');
            setTimeout(() => { ni.focus(); ni.select(); }, 50);
            const close = (v) => { ov.remove(); resolve(v); };
            document.getElementById('nas-sa-close').onclick = () => close(null);
            document.getElementById('nas-sa-cancel').onclick = () => close(null);
            ov.onclick = (e) => { if (e.target === ov) close(null); };
            document.getElementById('nas-sa-ok').onclick = () => {
                const fn = ni.value.trim();
                if (!fn) return;
                close({ folderVal: document.getElementById('nas-sa-folder').value, filename: fn });
            };
        });
    }

    /** 연결 폼·연결됨 바 표시 및 입력란·호스트 라벨 동기화 */
    async function showConnectBar() {
        await _ensureNasStorageReady();
        const bar = document.getElementById('nas-connect-bar');
        const ok = document.getElementById('nas-connected-bar');
        if (bar) bar.style.display = isConnected() ? 'none' : '';
        if (ok) ok.style.display = isConnected() ? '' : 'none';
        await syncFormsFromStorage();
        const c = _loadCfg();
        const fn = document.getElementById('nas-folder-name');
        if (fn) {
            fn.textContent = 'WebDAV 연결됨';
            fn.title = c ? 'WebDAV에 연결됨' : 'WebDAV 루트';
        }
    }

    async function connectFromForm() {
        await _ensureNasStorageReady();
        const { baseUrl, user, pass } = _readConnectFormValues();
        if (!baseUrl || !user) {
            alert('서버 URL과 아이디를 입력하세요.');
            return;
        }
        const prevSnap = (() => {
            const p = _loadCfg();
            return p ? { baseUrl: p.baseUrl, user: p.user, pass: p.pass } : null;
        })();
        await _saveCfg({ baseUrl, user, pass });
        await syncFormsFromStorage();
        try {
            await refresh({ silent: true });
            if (typeof App !== 'undefined' && App._toast) App._toast('WebDAV에 접속했습니다.');
            else alert('WebDAV에 접속했습니다.');
            await showConnectBar();
            if (typeof SB !== 'undefined' && SB.switchSource) SB.switchSource('nas');
        } catch (e) {
            if (prevSnap) await _saveCfg(prevSnap);
            else await _saveCfg(null);
            await syncFormsFromStorage();
            await showConnectBar();
            const msg = '서버URL, 비번과 아이디를 점검하세요';
            if (typeof App !== 'undefined' && App._toast) App._toast(msg);
            else alert(msg);
        }
    }

    /** 서버 URL만(또는 URL+기존 저장 아이디/비번) 암호화 저장 — 접속 검증 없음 */
    async function saveServerUrlFromForm() {
        await _ensureNasStorageReady();
        const raw = _readConnectFormValues();
        const baseUrl = String(raw.baseUrl || '').trim().replace(/\/$/, '');
        if (!baseUrl) {
            const msg = '서버 URL을 입력하세요';
            if (typeof App !== 'undefined' && App._toast) App._toast(msg);
            else alert(msg);
            return;
        }
        const ex = _loadCfg();
        const userFromForm = String(raw.user || '').trim();
        const passFromForm = String(raw.pass || '');
        const next = {
            baseUrl,
            user: userFromForm || (ex && ex.user) || '',
            pass: passFromForm !== '' ? passFromForm : (ex && ex.pass) || '',
        };
        await _saveCfg(next);
        await syncFormsFromStorage();
        const okMsg = '서버 URL을 저장했습니다';
        if (typeof App !== 'undefined' && App._toast) App._toast(okMsg);
        else alert(okMsg);
    }

    async function disconnect() {
        await _ensureNasStorageReady();
        await _saveCfg(null);
        allFiles = [];
        filtered = [];
        _emptyFolders = new Set();
        _lastListAt = null;
        await showConnectBar();
        _render();
        if (typeof App !== 'undefined' && App._toast) App._toast('WebDAV 연결 해제됨');
    }

    async function load() {
        await _ensureNasStorageReady();
        await showConnectBar();
        if (isConnected()) await refresh().catch(() => _render());
        else _render();
    }

    /** DOM 준비 후 WebDAV 입력란 미러링·값 복원 */
    async function _bootNasForms() {
        await _ensureNasStorageReady();
        installFormMirror();
        await syncFormsFromStorage();
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { _bootNasForms(); });
        else _bootNasForms();
    }

    _ensureNasStorageReady();

    return {
        cfg,
        isConnected,
        refresh,
        load,
        search,
        toggleFoldAll,
        saveFileContent,
        saveActiveDocumentAs,
        createNewFilePrompt,
        createNewFolderPrompt,
        confirmDelete,
        confirmDeleteFolder,
        moveFile,
        renameFile,
        renameFolder,
        moveFolder,
        downloadFile,
        showConnectBar,
        connectFromForm,
        saveServerUrlFromForm,
        disconnect,
        syncFormsFromStorage,
        installFormMirror,
        importMdpFromNasUI,
        uploadProjectMdpToNasUI,
        uploadInDbFilesToNasUI,
        uploadInDbFilesToNasUIAfterConfirm,
        _createFileInFolder,
        /** WebDAV 목록에서 상대 경로 행을 활성으로 표시한다 */
        highlightPath: _highlight,
        getFiles: () => allFiles,
        openWebDavAdminGate,
    };
})();

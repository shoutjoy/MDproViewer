(function () {
    'use strict';

    const STORAGE_KEY = 'mdpro_env_access_verifier_v1';
    const SALT = 'mdpro-env-access-v1';
    const ITERATIONS = 210000;
    const BOOTSTRAP_VERIFIER = 'RgsYUM4DqUOUQ258i/e8/x+qCwfmMr/JTBFdNcA8XgU=';
    const RECOVERY_ADDRESS = 'shoutjoy1@yonsei.ac.kr';
    const SHA256_CONSTANTS = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    let pendingRequest = null;

    function encodeBase64(bytes) {
        let binary = '';
        bytes.forEach(function (value) { binary += String.fromCharCode(value); });
        return btoa(binary);
    }

    function encodeUtf8(value) {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(String(value));
        const encoded = unescape(encodeURIComponent(String(value)));
        const bytes = new Uint8Array(encoded.length);
        for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
        return bytes;
    }

    // Web Crypto is unavailable in some Chromium forks and non-secure/file origins.
    // Keep a small standards-compatible SHA-256/PBKDF2 fallback so the same verifier
    // works everywhere without weakening or changing existing passwords.
    function sha256(bytes) {
        const bitLength = bytes.length * 8;
        const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
        const padded = new Uint8Array(paddedLength);
        padded.set(bytes);
        padded[bytes.length] = 0x80;
        const view = new DataView(padded.buffer);
        view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
        view.setUint32(paddedLength - 4, bitLength >>> 0, false);
        const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        const words = new Uint32Array(64);
        const rotateRight = function (value, amount) { return (value >>> amount) | (value << (32 - amount)); };
        for (let offset = 0; offset < paddedLength; offset += 64) {
            for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
            for (let index = 16; index < 64; index += 1) {
                const a = words[index - 15];
                const b = words[index - 2];
                const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
                const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
                words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
            }
            let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
            let e = hash[4], f = hash[5], g = hash[6], h = hash[7];
            for (let index = 0; index < 64; index += 1) {
                const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
                const choice = (e & f) ^ (~e & g);
                const temp1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
                const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
                const majority = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (sum0 + majority) >>> 0;
                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }
            hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
            hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
            hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
            hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
        }
        const output = new Uint8Array(32);
        const outputView = new DataView(output.buffer);
        for (let index = 0; index < 8; index += 1) outputView.setUint32(index * 4, hash[index], false);
        return output;
    }

    function concatBytes(left, right) {
        const output = new Uint8Array(left.length + right.length);
        output.set(left);
        output.set(right, left.length);
        return output;
    }

    function createHmacSha256(key) {
        const block = new Uint8Array(64);
        block.set(key.length > 64 ? sha256(key) : key);
        const innerPad = new Uint8Array(64);
        const outerPad = new Uint8Array(64);
        for (let index = 0; index < 64; index += 1) {
            innerPad[index] = block[index] ^ 0x36;
            outerPad[index] = block[index] ^ 0x5c;
        }
        return function (message) {
            return sha256(concatBytes(outerPad, sha256(concatBytes(innerPad, message))));
        };
    }

    async function deriveVerifierFallback(password) {
        const key = encodeUtf8(password);
        const salt = encodeUtf8(SALT);
        const hmacSha256 = createHmacSha256(key);
        const initialMessage = new Uint8Array(salt.length + 4);
        initialMessage.set(salt);
        initialMessage[initialMessage.length - 1] = 1;
        let previous = hmacSha256(initialMessage);
        const result = new Uint8Array(previous);
        for (let iteration = 1; iteration < ITERATIONS; iteration += 1) {
            previous = hmacSha256(previous);
            for (let index = 0; index < result.length; index += 1) result[index] ^= previous[index];
            if (iteration % 2048 === 0) await new Promise(function (resolve) { setTimeout(resolve, 0); });
        }
        return encodeBase64(result);
    }

    async function deriveVerifier(password) {
        const subtle = typeof crypto !== 'undefined' && crypto && crypto.subtle;
        if (subtle && typeof subtle.importKey === 'function' && typeof subtle.deriveBits === 'function') {
            try {
                const key = await subtle.importKey(
                    'raw', encodeUtf8(password), { name: 'PBKDF2' }, false, ['deriveBits']
                );
                const bits = await subtle.deriveBits({
                    name: 'PBKDF2', salt: encodeUtf8(SALT), iterations: ITERATIONS, hash: 'SHA-256'
                }, key, 256);
                return encodeBase64(new Uint8Array(bits));
            } catch (_) {
                // A present-but-disabled Web Crypto implementation is common on
                // non-secure origins. Fall through to the compatible implementation.
            }
        }
        return deriveVerifierFallback(password);
    }

    function initializeVerifier() {
        try {
            const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (current && current.verifier && current.iterations === ITERATIONS) return current;
        } catch (_) {}

        const record = {
            algorithm: 'PBKDF2-SHA-256',
            salt: SALT,
            iterations: ITERATIONS,
            verifier: BOOTSTRAP_VERIFIER,
            initializedAt: new Date().toISOString()
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (_) {}
        return record;
    }

    function getVerifier() {
        try {
            const record = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (record && record.verifier) return record.verifier;
        } catch (_) {}
        return initializeVerifier().verifier;
    }

    function ensureUi() {
        if (document.getElementById('env-access-modal')) return;
        const style = document.createElement('style');
        style.textContent = [
            '.env-access-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.62);backdrop-filter:blur(4px)}',
            '.env-access-overlay[hidden]{display:none}',
            '.env-access-card{width:min(430px,100%);max-height:calc(100vh - 40px);overflow:auto;border:1px solid #cbd5e1;border-radius:16px;background:#fff;padding:24px;box-shadow:0 24px 70px rgba(15,23,42,.32);color:#0f172a}',
            '.dark .env-access-card{border-color:#475569;background:#0f172a;color:#f8fafc}',
            '.env-access-title{margin:0;font-size:20px;font-weight:800}.env-access-help{margin:6px 0 18px;color:#64748b;font-size:13px;line-height:1.55}',
            '.dark .env-access-help{color:#94a3b8}.env-access-label{display:block;margin:12px 0 5px;font-size:12px;font-weight:700}',
            '.env-access-input{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:10px 12px;color:#0f172a;outline:none}',
            '.env-access-input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.14)}.dark .env-access-input{border-color:#475569;background:#1e293b;color:#f8fafc}',
            '.env-access-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:18px}.env-access-button{border:1px solid #cbd5e1;border-radius:8px;padding:9px 13px;font-size:13px;font-weight:700}',
            '.env-access-primary{border-color:#4f46e5;background:#4f46e5;color:#fff}.env-access-link{margin-right:auto;border:0;color:#4f46e5;padding-left:0}',
            '.dark .env-access-link{color:#a5b4fc}.env-access-error{min-height:18px;margin:10px 0 0;color:#dc2626;font-size:12px}.env-access-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
            '@media(max-width:480px){.env-access-card{padding:19px}.env-access-row{grid-template-columns:1fr}}'
        ].join('');
        document.head.appendChild(style);

        const host = document.createElement('div');
        host.innerHTML = [
            '<div id="env-access-modal" class="env-access-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="env-access-title">',
            '  <form id="env-access-form" class="env-access-card">',
            '    <h2 id="env-access-title" class="env-access-title">ENV 설정 잠금</h2>',
            '    <p class="env-access-help">MDPRO 환경 설정에 진입하려면 비밀번호를 입력하세요.</p>',
            '    <label class="env-access-label" for="env-access-password">비밀번호</label>',
            '    <input id="env-access-password" class="env-access-input" type="password" autocomplete="current-password" required>',
            '    <p id="env-access-error" class="env-access-error" role="alert" aria-live="polite"></p>',
            '    <div class="env-access-actions">',
            '      <button id="env-access-recovery" class="env-access-button env-access-link" type="button">비밀번호 찾기 / 사용자 신청</button>',
            '      <button id="env-access-cancel" class="env-access-button" type="button">취소</button>',
            '      <button class="env-access-button env-access-primary" type="submit">확인</button>',
            '    </div>',
            '  </form>',
            '</div>',
            '<div id="env-recovery-modal" class="env-access-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="env-recovery-title">',
            '  <form id="env-recovery-form" class="env-access-card">',
            '    <h2 id="env-recovery-title" class="env-access-title">비밀번호 사용자 신청</h2>',
            '    <p class="env-access-help">아래 정보를 작성하면 관리자에게 보낼 신청 메일이 작성됩니다.</p>',
            '    <label class="env-access-label" for="env-recovery-subject">제목</label>',
            '    <input id="env-recovery-subject" class="env-access-input" value="사용자 신청" readonly>',
            '    <div class="env-access-row">',
            '      <div><label class="env-access-label" for="env-recovery-name">이름</label><input id="env-recovery-name" class="env-access-input" required></div>',
            '      <div><label class="env-access-label" for="env-recovery-school">학교</label><input id="env-recovery-school" class="env-access-input" required></div>',
            '    </div>',
            '    <label class="env-access-label" for="env-recovery-major">전공</label>',
            '    <input id="env-recovery-major" class="env-access-input" required>',
            '    <label class="env-access-label" for="env-recovery-contact">회신받을 이메일</label>',
            '    <input id="env-recovery-contact" class="env-access-input" type="email" autocomplete="email" required>',
            '    <label class="env-access-label" for="env-recovery-detail">소개 및 신청 내용</label>',
            '    <textarea id="env-recovery-detail" class="env-access-input" rows="5" required placeholder="소속, 사용 목적 등 본인을 소개해 주세요."></textarea>',
            '    <p class="env-access-help">메일 앱이 열리면 내용을 확인한 뒤 전송해 주세요.</p>',
            '    <div class="env-access-actions"><button id="env-recovery-cancel" class="env-access-button" type="button">뒤로</button><button class="env-access-button env-access-primary" type="submit">신청 메일 작성</button></div>',
            '  </form>',
            '</div>'
        ].join('');
        document.body.appendChild(host.firstElementChild);
        document.body.appendChild(host.firstElementChild);

        document.getElementById('env-access-form').addEventListener('submit', verifyAccess);
        document.getElementById('env-access-cancel').addEventListener('click', function () { finishRequest(false); });
        document.getElementById('env-access-recovery').addEventListener('click', openRecovery);
        document.getElementById('env-recovery-cancel').addEventListener('click', closeRecovery);
        document.getElementById('env-recovery-form').addEventListener('submit', composeRecoveryEmail);
    }

    function finishRequest(granted) {
        const modal = document.getElementById('env-access-modal');
        if (modal) modal.hidden = true;
        const request = pendingRequest;
        pendingRequest = null;
        if (request) request.resolve(granted);
    }

    async function verifyAccess(event) {
        event.preventDefault();
        const input = document.getElementById('env-access-password');
        const error = document.getElementById('env-access-error');
        error.textContent = '확인 중입니다…';
        try {
            const candidate = await deriveVerifier(input.value);
            input.value = '';
            if (candidate === getVerifier()) {
                error.textContent = '';
                finishRequest(true);
                return;
            }
            error.textContent = '비밀번호가 올바르지 않습니다.';
            input.focus();
        } catch (_) {
            error.textContent = '이 브라우저에서 안전한 비밀번호 검증을 실행할 수 없습니다.';
        }
    }

    function openRecovery() {
        document.getElementById('env-access-modal').hidden = true;
        document.getElementById('env-recovery-modal').hidden = false;
        document.getElementById('env-recovery-name').focus();
    }

    function closeRecovery() {
        document.getElementById('env-recovery-modal').hidden = true;
        document.getElementById('env-access-modal').hidden = false;
        document.getElementById('env-access-password').focus();
    }

    function composeRecoveryEmail(event) {
        event.preventDefault();
        const value = function (id) { return document.getElementById(id).value.trim(); };
        const body = [
            'MDPRO ENV 비밀번호 사용자 신청입니다.', '',
            '이름: ' + value('env-recovery-name'),
            '학교: ' + value('env-recovery-school'),
            '전공: ' + value('env-recovery-major'),
            '회신 이메일: ' + value('env-recovery-contact'), '',
            '[소개 및 신청 내용]', value('env-recovery-detail')
        ].join('\r\n');
        const href = 'https://mail.google.com/mail/?view=cm&fs=1'
            + '&to=' + encodeURIComponent(RECOVERY_ADDRESS)
            + '&su=' + encodeURIComponent(value('env-recovery-subject'))
            + '&body=' + encodeURIComponent(body);
        const width = Math.min(960, Math.max(720, window.screen.availWidth - 160));
        const height = Math.min(820, Math.max(620, window.screen.availHeight - 140));
        const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
        const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
        const features = [
            'popup=yes', 'width=' + width, 'height=' + height,
            'left=' + left, 'top=' + top,
            'resizable=yes', 'scrollbars=yes'
        ].join(',');
        const gmailWindow = window.open(href, 'mdpro-gmail-compose', features);
        if (gmailWindow) {
            try { gmailWindow.opener = null; } catch (_) {}
            gmailWindow.focus();
        } else {
            window.location.href = href;
        }
    }

    function requestAccess() {
        ensureUi();
        initializeVerifier();
        if (pendingRequest) return pendingRequest.promise;
        let resolveRequest;
        const promise = new Promise(function (resolve) { resolveRequest = resolve; });
        pendingRequest = { promise: promise, resolve: resolveRequest };
        document.getElementById('env-access-error').textContent = '';
        document.getElementById('env-access-password').value = '';
        document.getElementById('env-access-modal').hidden = false;
        setTimeout(function () { document.getElementById('env-access-password').focus(); }, 0);
        return promise;
    }

    window.MdproSettingsAccess = { requestAccess: requestAccess };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeVerifier, { once: true });
    } else {
        initializeVerifier();
    }
}());

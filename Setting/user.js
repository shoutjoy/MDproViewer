(function () {
    const state = {
        authRequestEmail: '',
        getDb: function () { return null; },
        getAiSettings: async function () { return null; },
        setAiSettings: async function () {},
        showToast: function () {},
        getIsEditMode: function () { return false; },
        getEditorTextarea: function () { return null; },
        onEditorChanged: function () {}
    };

    function readAiUserInfoFromModal() {
        const name = ((document.getElementById('ai-user-name') && document.getElementById('ai-user-name').value) || '').trim();
        const id = ((document.getElementById('ai-user-id') && document.getElementById('ai-user-id').value) || '').trim();
        const major = ((document.getElementById('ai-user-major') && document.getElementById('ai-user-major').value) || '').trim();
        const contact = ((document.getElementById('ai-user-contact') && document.getElementById('ai-user-contact').value) || '').trim();
        const email = ((document.getElementById('ai-user-email') && document.getElementById('ai-user-email').value) || '').trim();
        const prefixSetEl = document.getElementById('ai-user-prefix-set');
        const prefixSet = !(prefixSetEl && prefixSetEl.checked === false);
        return { name, id, major, contact, email, prefixSet };
    }

    function applyUserInfoToModalFields(userInfo) {
        const nameEl = document.getElementById('ai-user-name');
        const idEl = document.getElementById('ai-user-id');
        const majorEl = document.getElementById('ai-user-major');
        const contactEl = document.getElementById('ai-user-contact');
        const emailEl = document.getElementById('ai-user-email');
        const prefixSetEl = document.getElementById('ai-user-prefix-set');
        const info = userInfo || {};
        if (nameEl) nameEl.value = info.name || '';
        if (idEl) idEl.value = info.id || '';
        if (majorEl) majorEl.value = info.major || '';
        if (contactEl) contactEl.value = info.contact || '';
        if (emailEl) emailEl.value = info.email || '';
        if (prefixSetEl) prefixSetEl.checked = info.prefixSet !== false;
    }

    function hasUserInfo(userInfo) {
        const info = userInfo || {};
        return ['name', 'id', 'major', 'contact', 'email'].some(function (key) {
            return String(info[key] || '').trim();
        });
    }

    function readUserInfoPrompt() {
        function value(id) {
            const el = document.getElementById(id);
            return el ? String(el.value || '').trim() : '';
        }
        const prefixSetEl = document.getElementById('user-info-prompt-prefix-set');
        return {
            name: value('user-info-prompt-name'),
            id: value('user-info-prompt-id'),
            major: value('user-info-prompt-major'),
            contact: value('user-info-prompt-contact'),
            email: value('user-info-prompt-email'),
            prefixSet: !(prefixSetEl && prefixSetEl.checked === false)
        };
    }

    function applyUserInfoToPrompt(userInfo) {
        const info = userInfo || {};
        ['name', 'id', 'major', 'contact', 'email'].forEach(function (key) {
            const el = document.getElementById('user-info-prompt-' + key);
            if (el) el.value = info[key] || '';
        });
        const prefixSetEl = document.getElementById('user-info-prompt-prefix-set');
        if (prefixSetEl) prefixSetEl.checked = info.prefixSet !== false;
    }

    function openUserInfoPrompt(userInfo) {
        const modal = document.getElementById('user-info-prompt-modal');
        const feedback = document.getElementById('user-info-prompt-feedback');
        if (!modal) return;
        bindUserInfoPromptDrag();
        applyUserInfoToPrompt(userInfo);
        if (feedback) feedback.textContent = '';
        modal.classList.remove('hidden');
        modal.classList.add('block');
        const nameEl = document.getElementById('user-info-prompt-name');
        if (nameEl) setTimeout(function () { nameEl.focus(); }, 0);
    }

    function closeUserInfoPrompt() {
        const modal = document.getElementById('user-info-prompt-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('block');
    }

    function clampUserInfoPromptPanel() {
        const panel = document.getElementById('user-info-prompt-panel');
        if (!panel || panel.style.transform !== 'none') return;
        const rect = panel.getBoundingClientRect();
        const left = Math.max(6, Math.min(rect.left, window.innerWidth - rect.width - 6));
        const top = Math.max(6, Math.min(rect.top, window.innerHeight - rect.height - 6));
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
    }

    function bindUserInfoPromptDrag() {
        const panel = document.getElementById('user-info-prompt-panel');
        const header = document.getElementById('user-info-prompt-header');
        if (!panel || !header || header.dataset.dragBound === '1') return;
        header.dataset.dragBound = '1';
        header.addEventListener('pointerdown', function (event) {
            if (event.button !== 0 || event.target.closest('button, input, label')) return;
            const rect = panel.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            panel.style.transform = 'none';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            header.classList.add('dragging');
            header.setPointerCapture(event.pointerId);
            function move(moveEvent) {
                const left = Math.max(6, Math.min(moveEvent.clientX - offsetX, window.innerWidth - panel.offsetWidth - 6));
                const top = Math.max(6, Math.min(moveEvent.clientY - offsetY, window.innerHeight - panel.offsetHeight - 6));
                panel.style.left = Math.round(left) + 'px';
                panel.style.top = Math.round(top) + 'px';
            }
            function finish() {
                header.classList.remove('dragging');
                header.removeEventListener('pointermove', move);
                header.removeEventListener('pointerup', finish);
                header.removeEventListener('pointercancel', finish);
            }
            header.addEventListener('pointermove', move);
            header.addEventListener('pointerup', finish);
            header.addEventListener('pointercancel', finish);
            event.preventDefault();
        });
        window.addEventListener('resize', clampUserInfoPromptPanel);
    }

    async function saveAiUserInfo() {
        const fb = document.getElementById('ai-user-info-feedback');
        if (fb) fb.textContent = '';
        if (!state.getDb()) {
            state.showToast('Storage is not ready yet. Please try again.');
            return;
        }
        const userInfo = readAiUserInfoFromModal();
        if (!userInfo.name && !userInfo.id && !userInfo.major && !userInfo.contact && !userInfo.email) {
            if (fb) fb.textContent = 'Please enter at least one user info field.';
            state.showToast('No input provided.');
            return;
        }
        await state.setAiSettings({ userInfo: userInfo });
        if (fb) fb.textContent = 'User info saved.';
        state.showToast('Saved user info.');
    }

    async function sendAuthRequestMail() {
        const userInfo = readAiUserInfoFromModal();
        await state.setAiSettings({ userInfo: userInfo });
        const body = 'Requesting verification code with user information.\n\n'
            + 'Name: ' + userInfo.name + '\n'
            + 'Student ID: ' + userInfo.id + '\n'
            + 'Major: ' + userInfo.major + '\n'
            + 'Contact: ' + userInfo.contact + '\n'
            + 'Email: ' + userInfo.email;
        const subject = 'MDproViewer AI access verification request';
        const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1'
            + '&to=' + encodeURIComponent(state.authRequestEmail || '')
            + '&su=' + encodeURIComponent(subject)
            + '&body=' + encodeURIComponent(body);
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
        state.showToast('Opened Gmail compose window.');
    }

    function insertUserInfoValue(u) {
        const lines = [];
        const usePrefix = u.prefixSet !== false;
        if (String(u.name || '').trim()) lines.push(String(u.name).trim());
        if (String(u.id || '').trim()) lines.push(usePrefix ? ('Student ID: ' + String(u.id).trim()) : String(u.id).trim());
        if (String(u.major || '').trim()) lines.push(usePrefix ? ('Major: ' + String(u.major).trim()) : String(u.major).trim());
        if (String(u.contact || '').trim()) lines.push(usePrefix ? ('Contact: ' + String(u.contact).trim()) : String(u.contact).trim());
        if (String(u.email || '').trim()) lines.push(usePrefix ? ('Email: ' + String(u.email).trim()) : String(u.email).trim());
        const block = lines.map(function (line) { return line + '  '; }).join('\n');
        const ta = state.getEditorTextarea();
        if (!ta) return;
        const start = Number(ta.selectionStart || 0);
        const end = Number(ta.selectionEnd || 0);
        const before = String(ta.value || '').slice(0, start);
        const after = String(ta.value || '').slice(end);
        const next = before + block + after;
        const nextPos = before.length + block.length;
        const scrollTop = ta.scrollTop;
        ta.value = next;
        ta.focus();
        try { ta.setSelectionRange(nextPos, nextPos); } catch (_) {}
        ta.scrollTop = scrollTop;
        state.onEditorChanged();
        state.showToast('User info inserted.');
    }

    async function saveUserInfoPrompt(insertAfterSave) {
        const feedback = document.getElementById('user-info-prompt-feedback');
        const userInfo = readUserInfoPrompt();
        if (!hasUserInfo(userInfo)) {
            if (feedback) feedback.textContent = '사용자 정보를 한 항목 이상 입력하세요.';
            return;
        }
        if (!state.getDb()) {
            if (feedback) feedback.textContent = '저장소가 아직 준비되지 않았습니다.';
            return;
        }
        await state.setAiSettings({ userInfo: userInfo });
        applyUserInfoToModalFields(userInfo);
        closeUserInfoPrompt();
        if (insertAfterSave) insertUserInfoValue(userInfo);
        else state.showToast('사용자 정보를 저장했습니다.');
    }

    async function insertUserInfoAtCursor() {
        if (!state.getIsEditMode()) {
            state.showToast('Use this in edit mode.');
            return;
        }
        if (!state.getDb()) {
            state.showToast('Database is not ready yet. Please try again.');
            return;
        }
        const s = await state.getAiSettings();
        const u = s && s.userInfo;
        if (!hasUserInfo(u)) {
            openUserInfoPrompt(u);
            return;
        }
        insertUserInfoValue(u);
    }

    function init(deps) {
        const d = deps || {};
        state.authRequestEmail = String(d.authRequestEmail || '');
        state.getDb = typeof d.getDb === 'function' ? d.getDb : state.getDb;
        state.getAiSettings = typeof d.getAiSettings === 'function' ? d.getAiSettings : state.getAiSettings;
        state.setAiSettings = typeof d.setAiSettings === 'function' ? d.setAiSettings : state.setAiSettings;
        state.showToast = typeof d.showToast === 'function' ? d.showToast : state.showToast;
        state.getIsEditMode = typeof d.getIsEditMode === 'function' ? d.getIsEditMode : state.getIsEditMode;
        state.getEditorTextarea = typeof d.getEditorTextarea === 'function' ? d.getEditorTextarea : state.getEditorTextarea;
        state.onEditorChanged = typeof d.onEditorChanged === 'function' ? d.onEditorChanged : state.onEditorChanged;

        window.insertUserInfoAtCursor = insertUserInfoAtCursor;
        window.saveAiUserInfo = saveAiUserInfo;
        window.sendAuthRequestMail = sendAuthRequestMail;
        window.openUserInfoPrompt = openUserInfoPrompt;
        window.closeUserInfoPrompt = closeUserInfoPrompt;
        window.saveUserInfoPrompt = saveUserInfoPrompt;
    }

    window.UserSettingsModule = {
        init: init,
        readAiUserInfoFromModal: readAiUserInfoFromModal,
        applyUserInfoToModalFields: applyUserInfoToModalFields,
        saveAiUserInfo: saveAiUserInfo,
        sendAuthRequestMail: sendAuthRequestMail,
        insertUserInfoAtCursor: insertUserInfoAtCursor
    };
})();

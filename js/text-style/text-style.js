(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        root.TextStyleTool = api;
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', api.init, { once: true });
        } else {
            api.init();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const LEGACY_FONT_STORAGE_KEY = 'md_viewer_text_style_custom_fonts_v1';
    const PREF_STORAGE_KEY = 'md_viewer_text_style_preferences_v1';
    const SQLITE_FONT_SETTING_KEY = 'textStyleCustomFonts';
    const FONT_STYLE_ID = 'md-viewer-custom-font-faces';
    const BASIC_FONTS = Object.freeze([
        { label: '기본 글꼴', value: 'inherit' },
        { label: '맑은 고딕', value: '"Malgun Gothic",sans-serif' },
        { label: 'Arial', value: 'Arial,sans-serif' },
        { label: 'Times New Roman', value: '"Times New Roman",serif' },
        { label: 'Georgia', value: 'Georgia,serif' },
        { label: 'Verdana', value: 'Verdana,sans-serif' },
        { label: 'Courier New', value: '"Courier New",monospace' },
        { label: 'Noto Sans KR', value: '"Noto Sans KR",sans-serif' },
        { label: '나눔고딕', value: '"Nanum Gothic",sans-serif' }
    ]);
    const TEXT_COLORS = Object.freeze([
        '#ef4444', '#f43f5e', '#f97316', '#f59e0b', '#eab308', '#22c55e',
        '#14b8a6', '#0ea5e9', '#2563eb', '#8b5cf6', '#d946ef', '#ec4899',
        '#111827', '#6b7280', '#ffffff'
    ]);
    const HIGHLIGHT_COLORS = Object.freeze([
        '#fff59d', '#fde68a', '#fdba74', '#fca5a5', '#f9a8d4', '#d8b4fe',
        '#bfdbfe', '#bae6fd', '#99f6e4', '#bbf7d0', '#d9f99d', '#fef3c7'
    ]);

    let savedSelection = null;
    let initialized = false;
    let fontDatabase = null;
    let sqliteStorage = null;
    let sqliteSyncPromise = null;
    let lastSqliteSync = { saved: false, pending: true, error: '' };
    let customFontsCache = [];

    function getDocument() {
        return root && root.document ? root.document : null;
    }

    function getStorage() {
        try { return root.localStorage || null; } catch (error) { return null; }
    }

    function readJson(key, fallback) {
        const storage = getStorage();
        if (!storage) return fallback;
        try {
            const parsed = JSON.parse(storage.getItem(key) || 'null');
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        const storage = getStorage();
        if (!storage) return false;
        try {
            storage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function cleanFamily(value) {
        return String(value || '')
            .trim()
            .replace(/^(['"])([\s\S]*)\1$/, '$2')
            .trim();
    }

    function isSafeFamily(value) {
        const family = cleanFamily(value);
        return !!family && family.length <= 80 && !/[;'"{}<>\\\r\n\u0000-\u001f]/.test(family);
    }

    function safeUrl(value) {
        const raw = String(value || '').trim();
        if (!raw || /[\r\n\u0000-\u001f]/.test(raw)) return '';
        try {
            const parsed = new URL(raw, 'https://mdviewer.local/');
            if (parsed.username || parsed.password) return '';
            return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
        } catch (error) {
            return '';
        }
    }

    function getDeclaration(body, name) {
        const match = String(body || '').match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)', 'i'));
        return match ? match[1].trim() : '';
    }

    function parseFontFaceCss(cssText) {
        const source = String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, '');
        const faces = [];
        const blockPattern = /@font-face\s*\{([\s\S]*?)\}/gi;
        let match;
        while ((match = blockPattern.exec(source))) {
            const body = match[1];
            const family = cleanFamily(getDeclaration(body, 'font-family'));
            const src = getDeclaration(body, 'src');
            const urlMatch = src.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
            const formatMatch = src.match(/format\(\s*(['"]?)([a-z0-9-]+)\1\s*\)/i);
            const url = safeUrl(urlMatch && urlMatch[2]);
            if (!isSafeFamily(family) || !url) continue;
            const weightRaw = getDeclaration(body, 'font-weight').toLowerCase();
            const styleRaw = getDeclaration(body, 'font-style').toLowerCase();
            const displayRaw = getDeclaration(body, 'font-display').toLowerCase();
            const weight = /^(normal|bold|[1-9]00)$/.test(weightRaw) ? weightRaw : 'normal';
            const style = /^(normal|italic|oblique)$/.test(styleRaw) ? styleRaw : 'normal';
            const display = /^(auto|block|swap|fallback|optional)$/.test(displayRaw) ? displayRaw : 'swap';
            const format = formatMatch ? formatMatch[2].toLowerCase() : '';
            faces.push({ family: family, url: url, format: format, weight: weight, style: style, display: display });
        }
        return faces;
    }

    function escapeCssString(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
    }

    function buildFontFaceCss(face) {
        if (!face || !isSafeFamily(face.family) || !safeUrl(face.url)) return '';
        const format = /^[a-z0-9-]+$/i.test(String(face.format || ''))
            ? ' format("' + String(face.format).toLowerCase() + '")'
            : '';
        return '@font-face{font-family:"' + escapeCssString(cleanFamily(face.family)) + '";src:url("' +
            escapeCssString(safeUrl(face.url)) + '")' + format + ';font-weight:' +
            (/^(normal|bold|[1-9]00)$/.test(String(face.weight || '')) ? face.weight : 'normal') +
            ';font-style:' + (/^(normal|italic|oblique)$/.test(String(face.style || '')) ? face.style : 'normal') +
            ';font-display:' + (/^(auto|block|swap|fallback|optional)$/.test(String(face.display || '')) ? face.display : 'swap') + ';}';
    }

    function sanitizeFontFaces(faces) {
        const stored = Array.isArray(faces) ? faces : [];
        if (!Array.isArray(stored)) return [];
        return stored.filter(function (face) {
            return !!buildFontFaceCss(face);
        }).slice(0, 50);
    }

    function getLegacyCustomFonts() {
        return sanitizeFontFaces(readJson(LEGACY_FONT_STORAGE_KEY, []));
    }

    function getCustomFonts() {
        return customFontsCache.slice();
    }

    function getFontRecordId(face) {
        const family = cleanFamily(face && face.family).toLowerCase()
            .replace(/[^a-z0-9가-힣_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'custom';
        return 'font:' + family + ':' + String(face && face.weight || 'normal') + ':' + String(face && face.style || 'normal');
    }

    function toFontRecord(face) {
        return Object.assign({}, face, {
            id: getFontRecordId(face),
            recordType: 'webfont',
            source: '@font-face',
            updatedAt: new Date().toISOString()
        });
    }

    function readFontRecordsFromInDb() {
        if (!fontDatabase || !fontDatabase.objectStoreNames || !fontDatabase.objectStoreNames.contains('fonts')) {
            return Promise.resolve([]);
        }
        return new Promise(function (resolve, reject) {
            try {
                const tx = fontDatabase.transaction('fonts', 'readonly');
                const request = tx.objectStore('fonts').getAll();
                request.onsuccess = function () { resolve(sanitizeFontFaces(request.result)); };
                request.onerror = function () { reject(request.error || new Error('폰트 저장소를 읽지 못했습니다.')); };
            } catch (error) {
                reject(error);
            }
        });
    }

    function writeFontRecordsToInDb(faces) {
        if (!fontDatabase || !fontDatabase.objectStoreNames || !fontDatabase.objectStoreNames.contains('fonts')) {
            return Promise.resolve(false);
        }
        const list = sanitizeFontFaces(faces);
        return new Promise(function (resolve, reject) {
            try {
                const tx = fontDatabase.transaction('fonts', 'readwrite');
                const store = tx.objectStore('fonts');
                store.clear();
                list.forEach(function (face) { store.put(toFontRecord(face)); });
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error || new Error('폰트 저장소에 기록하지 못했습니다.')); };
                tx.onabort = function () { reject(tx.error || new Error('폰트 저장이 중단되었습니다.')); };
            } catch (error) {
                reject(error);
            }
        });
    }

    function notifyFontStoreChanged() {
        if (!root || typeof root.dispatchEvent !== 'function') return;
        try {
            const FontStoreEvent = root.CustomEvent;
            if (typeof FontStoreEvent !== 'function') return;
            root.dispatchEvent(new FontStoreEvent('mdviewer-font-store-changed', {
                detail: {
                    count: customFontsCache.length,
                    store: 'fonts',
                    sqliteSaved: lastSqliteSync.saved,
                    sqlitePending: lastSqliteSync.pending
                }
            }));
        } catch (error) {}
    }

    function sqliteSettingsReady() {
        if (!sqliteStorage || typeof sqliteStorage.putSqliteSetting !== 'function') return false;
        if (typeof sqliteStorage.getStatus !== 'function') return true;
        const state = sqliteStorage.getStatus();
        return !!(state && state.initialized && state.sqliteHealth
            && state.sqliteHealth.available === true
            && state.sqliteHealth.capabilities
            && state.sqliteHealth.capabilities.settings === true);
    }

    function sqliteFontPayload() {
        return sanitizeFontFaces(customFontsCache).map(function (face) {
            return {
                family: cleanFamily(face.family),
                url: safeUrl(face.url),
                format: String(face.format || ''),
                weight: String(face.weight || 'normal'),
                style: String(face.style || 'normal'),
                display: String(face.display || 'swap')
            };
        });
    }

    async function syncToSqlite() {
        if (sqliteSyncPromise) return sqliteSyncPromise;
        if (!sqliteSettingsReady()) {
            lastSqliteSync = { saved: false, pending: true, error: 'SQLite 설정 저장소가 연결되지 않았습니다.' };
            return Object.assign({}, lastSqliteSync);
        }
        sqliteSyncPromise = (async function () {
            try {
                await sqliteStorage.putSqliteSetting({
                    key: SQLITE_FONT_SETTING_KEY,
                    value: sqliteFontPayload(),
                    scopeType: 'workspace',
                    scopeId: 'workspace_default'
                });
                lastSqliteSync = { saved: true, pending: false, error: '' };
            } catch (error) {
                lastSqliteSync = {
                    saved: false,
                    pending: true,
                    error: error && error.message ? error.message : String(error || 'SQLite 저장 실패')
                };
            }
            notifyFontStoreChanged();
            return Object.assign({}, lastSqliteSync);
        })();
        try {
            return await sqliteSyncPromise;
        } finally {
            sqliteSyncPromise = null;
        }
    }

    async function setSqliteStorage(storage) {
        sqliteStorage = storage || null;
        return syncToSqlite();
    }

    function getSqliteSyncStatus() {
        return Object.assign({}, lastSqliteSync);
    }

    function persistenceMessage(action) {
        return lastSqliteSync.saved
            ? action + ' inDB fonts와 SQLite 사용자 폰트 저장소에 함께 반영했습니다.'
            : action + ' inDB fonts에 반영했습니다. SQLite 연결 시 자동으로 동기화합니다.';
    }

    async function saveCustomFonts(faces) {
        const next = [];
        (Array.isArray(faces) ? faces : []).forEach(function (face) {
            if (!buildFontFaceCss(face)) return;
            const key = cleanFamily(face.family).toLowerCase() + '|' + face.weight + '|' + face.style;
            const index = next.findIndex(function (item) {
                return cleanFamily(item.family).toLowerCase() + '|' + item.weight + '|' + item.style === key;
            });
            if (index >= 0) next[index] = face;
            else next.push(face);
        });
        customFontsCache = next.slice(-50);
        if (fontDatabase && fontDatabase.objectStoreNames && fontDatabase.objectStoreNames.contains('fonts')) {
            await writeFontRecordsToInDb(customFontsCache);
            const storage = getStorage();
            if (storage) {
                try { storage.removeItem(LEGACY_FONT_STORAGE_KEY); } catch (error) {}
            }
        } else {
            writeJson(LEGACY_FONT_STORAGE_KEY, customFontsCache);
        }
        installFontFaces(customFontsCache);
        refreshFontUi();
        await syncToSqlite();
        notifyFontStoreChanged();
        return customFontsCache.slice();
    }

    async function setDatabase(database) {
        fontDatabase = database || null;
        const legacyFonts = getLegacyCustomFonts();
        if (!fontDatabase || !fontDatabase.objectStoreNames || !fontDatabase.objectStoreNames.contains('fonts')) {
            customFontsCache = legacyFonts;
            installFontFaces(customFontsCache);
            refreshFontUi();
            return customFontsCache.slice();
        }
        let storedFonts = await readFontRecordsFromInDb();
        if (!storedFonts.length && legacyFonts.length) {
            await writeFontRecordsToInDb(legacyFonts);
            storedFonts = legacyFonts;
        }
        customFontsCache = sanitizeFontFaces(storedFonts);
        const storage = getStorage();
        if (storage) {
            try { storage.removeItem(LEGACY_FONT_STORAGE_KEY); } catch (error) {}
        }
        installFontFaces(customFontsCache);
        refreshFontUi();
        notifyFontStoreChanged();
        return customFontsCache.slice();
    }

    async function refreshFromInDb() {
        if (!fontDatabase) return getCustomFonts();
        customFontsCache = await readFontRecordsFromInDb();
        installFontFaces(customFontsCache);
        refreshFontUi();
        await syncToSqlite();
        notifyFontStoreChanged();
        return getCustomFonts();
    }

    function installFontFaces(faces) {
        const doc = getDocument();
        if (!doc) return;
        let style = doc.getElementById(FONT_STYLE_ID);
        if (!style) {
            style = doc.createElement('style');
            style.id = FONT_STYLE_ID;
            (doc.head || doc.documentElement).appendChild(style);
        }
        style.textContent = (Array.isArray(faces) ? faces : getCustomFonts()).map(buildFontFaceCss).filter(Boolean).join('\n');
    }

    function uniqueFontFamilies(faces) {
        const seen = new Set();
        return (Array.isArray(faces) ? faces : []).filter(function (face) {
            const key = cleanFamily(face.family).toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function populateFontSelect() {
        const doc = getDocument();
        const select = doc && doc.getElementById('style-font-family');
        if (!select) return;
        const previous = select.value;
        select.textContent = '';
        const basicGroup = doc.createElement('optgroup');
        basicGroup.label = '기본 글꼴';
        BASIC_FONTS.forEach(function (font) {
            const option = doc.createElement('option');
            option.value = font.value;
            option.textContent = font.label;
            option.style.fontFamily = font.value;
            basicGroup.appendChild(option);
        });
        select.appendChild(basicGroup);
        const custom = uniqueFontFamilies(getCustomFonts());
        if (custom.length) {
            const customGroup = doc.createElement('optgroup');
            customGroup.label = '추가한 글꼴';
            custom.forEach(function (face) {
                const option = doc.createElement('option');
                option.value = '"' + cleanFamily(face.family) + '",sans-serif';
                option.textContent = face.family;
                option.style.fontFamily = option.value;
                customGroup.appendChild(option);
            });
            select.appendChild(customGroup);
        }
        if (Array.from(select.options).some(function (option) { return option.value === previous; })) select.value = previous;
    }

    function renderCustomFontList() {
        const doc = getDocument();
        const list = doc && doc.getElementById('text-style-custom-font-list');
        if (!list) return;
        list.textContent = '';
        const fonts = uniqueFontFamilies(getCustomFonts());
        if (!fonts.length) {
            const empty = doc.createElement('span');
            empty.className = 'text-style-custom-font-empty';
            empty.textContent = '아직 추가한 폰트가 없습니다.';
            list.appendChild(empty);
            return;
        }
        fonts.forEach(function (face) {
            const chip = doc.createElement('span');
            chip.className = 'text-style-font-chip';
            chip.style.fontFamily = '"' + face.family + '",sans-serif';
            const label = doc.createElement('span');
            label.textContent = face.family;
            const remove = doc.createElement('button');
            remove.type = 'button';
            remove.setAttribute('aria-label', face.family + ' 폰트 삭제');
            remove.dataset.fontFamily = face.family;
            remove.textContent = '×';
            chip.appendChild(label);
            chip.appendChild(remove);
            list.appendChild(chip);
        });
    }

    function refreshFontUi() {
        populateFontSelect();
        renderCustomFontList();
    }

    async function addCustomFonts(cssText) {
        const parsed = parseFontFaceCss(cssText);
        if (!parsed.length) return { ok: false, message: '유효한 @font-face와 http(s) 폰트 URL을 찾지 못했습니다.', fonts: [] };
        const merged = getCustomFonts();
        parsed.forEach(function (face) {
            const key = cleanFamily(face.family).toLowerCase() + '|' + face.weight + '|' + face.style;
            const index = merged.findIndex(function (item) {
                return cleanFamily(item.family).toLowerCase() + '|' + item.weight + '|' + item.style === key;
            });
            if (index >= 0) merged[index] = face;
            else merged.push(face);
        });
        await saveCustomFonts(merged);
        return {
            ok: true,
            message: persistenceMessage(parsed.length + '개의 폰트를'),
            fonts: parsed,
            sqliteSaved: lastSqliteSync.saved,
            sqlitePending: lastSqliteSync.pending
        };
    }

    async function removeCustomFont(family) {
        const target = cleanFamily(family).toLowerCase();
        const next = getCustomFonts().filter(function (face) {
            return cleanFamily(face.family).toLowerCase() !== target;
        });
        return await saveCustomFonts(next);
    }

    function setStatus(message, isError) {
        const doc = getDocument();
        const status = doc && doc.getElementById('text-style-font-status');
        if (!status) return;
        status.textContent = String(message || '');
        status.classList.toggle('is-error', !!isError);
    }

    function setEnabled(name, enabled) {
        const doc = getDocument();
        const checkbox = doc && doc.getElementById('style-enable-' + name);
        if (checkbox) checkbox.checked = !!enabled;
        const row = checkbox && checkbox.closest('.text-style-row');
        if (row) row.classList.toggle('is-enabled', !!enabled);
        if (enabled && (name === 'superscript' || name === 'subscript')) {
            const otherName = name === 'superscript' ? 'subscript' : 'superscript';
            const otherCheckbox = doc && doc.getElementById('style-enable-' + otherName);
            if (otherCheckbox) otherCheckbox.checked = false;
            const otherRow = otherCheckbox && otherCheckbox.closest('.text-style-row');
            if (otherRow) otherRow.classList.remove('is-enabled');
        }
        updatePreview();
    }

    function isEnabled(name) {
        const doc = getDocument();
        const checkbox = doc && doc.getElementById('style-enable-' + name);
        return !!(checkbox && checkbox.checked);
    }

    function selectColor(kind, color) {
        const doc = getDocument();
        const inputId = kind === 'highlight' ? 'style-highlight-color' : 'style-text-color';
        const input = doc && doc.getElementById(inputId);
        if (input) input.value = color;
        setEnabled(kind === 'highlight' ? 'highlight' : 'text-color', true);
        if (doc) {
            doc.querySelectorAll('[data-style-color-kind="' + kind + '"]').forEach(function (button) {
                button.classList.toggle('is-selected', String(button.dataset.color || '').toLowerCase() === color.toLowerCase());
            });
        }
        updatePreview();
    }

    function renderPalette(containerId, kind, colors) {
        const doc = getDocument();
        const container = doc && doc.getElementById(containerId);
        if (!container || container.childElementCount) return;
        colors.forEach(function (color) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'text-style-swatch';
            button.dataset.styleColorKind = kind;
            button.dataset.color = color;
            button.style.setProperty('--swatch-color', color);
            button.setAttribute('aria-label', color + ' 선택');
            button.title = color;
            container.appendChild(button);
        });
        const custom = doc.createElement('label');
        custom.className = 'text-style-color-picker';
        custom.title = '직접 색상 선택';
        custom.setAttribute('aria-label', '직접 색상 선택');
        const input = doc.createElement('input');
        input.type = 'color';
        input.id = kind === 'highlight' ? 'style-highlight-color' : 'style-text-color';
        input.value = kind === 'highlight' ? '#fff59d' : '#ef4444';
        custom.appendChild(input);
        container.appendChild(custom);
    }

    function normalizeFontSize(value) {
        const numeric = Math.max(6, Math.min(96, Number(value) || 12));
        return String(Math.round(numeric * 10) / 10) + 'pt';
    }

    function safeFontFamilyValue(value) {
        const raw = String(value || '').trim();
        if (!raw || raw.length > 180 || /[;{}<>\\\r\n\u0000-\u001f]/.test(raw)) return '';
        return raw;
    }

    function readSettings() {
        const doc = getDocument();
        const size = doc && doc.getElementById('style-font-size-number');
        const family = doc && doc.getElementById('style-font-family');
        const textColor = doc && doc.getElementById('style-text-color');
        const highlightColor = doc && doc.getElementById('style-highlight-color');
        return {
            fontSize: isEnabled('font-size') ? normalizeFontSize(size && size.value) : '',
            fontFamily: isEnabled('font-family') ? safeFontFamilyValue(family && family.value) : '',
            color: isEnabled('text-color') && textColor ? textColor.value : '',
            backgroundColor: isEnabled('highlight') && highlightColor ? highlightColor.value : '',
            bold: isEnabled('bold'),
            italic: isEnabled('italic'),
            superscript: isEnabled('superscript'),
            subscript: isEnabled('subscript')
        };
    }

    function hasStyle(settings) {
        return !!(settings && (settings.fontSize || settings.fontFamily || settings.color || settings.backgroundColor || settings.bold || settings.italic || settings.superscript || settings.subscript));
    }

    function buildStyledHtml(selectedText, settings) {
        const source = String(selectedText == null ? '' : selectedText);
        const safe = settings || {};
        const style = [];
        if (/^(?:[6-9](?:\.\d)?|[1-8]\d(?:\.\d)?|9[0-6](?:\.0)?)pt$/.test(String(safe.fontSize || ''))) {
            style.push('font-size:' + safe.fontSize);
        }
        const family = safeFontFamilyValue(safe.fontFamily);
        if (family) style.push('font-family:' + family);
        if (/^#[0-9a-f]{6}$/i.test(String(safe.color || ''))) style.push('color:' + safe.color);
        if (/^#[0-9a-f]{6}$/i.test(String(safe.backgroundColor || ''))) style.push('background-color:' + safe.backgroundColor);
        let html = source;
        if (style.length) {
            const styleAttribute = style.join(';').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            html = '<span style="' + styleAttribute + ';">' + html + '</span>';
        }
        if (safe.bold) html = '<strong>' + html + '</strong>';
        if (safe.italic) html = '<em>' + html + '</em>';
        if (safe.superscript) html = '<sup>' + html + '</sup>';
        else if (safe.subscript) html = '<sub>' + html + '</sub>';
        return html;
    }

    function persistPreferences(settings) {
        writeJson(PREF_STORAGE_KEY, settings || readSettings());
    }

    function restorePreferences() {
        const doc = getDocument();
        if (!doc) return;
        const prefs = readJson(PREF_STORAGE_KEY, {});
        const size = doc.getElementById('style-font-size-number');
        if (size && prefs.fontSize) size.value = parseFloat(prefs.fontSize) || 12;
        const family = doc.getElementById('style-font-family');
        if (family && prefs.fontFamily && Array.from(family.options).some(function (option) { return option.value === prefs.fontFamily; })) {
            family.value = prefs.fontFamily;
        }
        const textColor = doc.getElementById('style-text-color');
        if (textColor && /^#[0-9a-f]{6}$/i.test(String(prefs.color || ''))) textColor.value = prefs.color;
        const highlight = doc.getElementById('style-highlight-color');
        if (highlight && /^#[0-9a-f]{6}$/i.test(String(prefs.backgroundColor || ''))) highlight.value = prefs.backgroundColor;
        setEnabled('font-size', !!prefs.fontSize);
        setEnabled('font-family', !!prefs.fontFamily);
        setEnabled('text-color', !!prefs.color);
        setEnabled('highlight', !!prefs.backgroundColor);
        setEnabled('bold', !!prefs.bold);
        setEnabled('italic', !!prefs.italic);
        setEnabled('superscript', !!prefs.superscript);
        setEnabled('subscript', !!prefs.subscript);
    }

    function updatePreview() {
        const doc = getDocument();
        const preview = doc && doc.getElementById('text-style-preview');
        if (!preview) return;
        const settings = readSettings();
        preview.style.fontSize = settings.fontSize || '';
        preview.style.fontFamily = settings.fontFamily || '';
        preview.style.color = settings.color || '';
        preview.style.backgroundColor = settings.backgroundColor || '';
        preview.style.fontWeight = settings.bold ? '700' : '';
        preview.style.fontStyle = settings.italic ? 'italic' : '';
        preview.style.verticalAlign = settings.superscript ? 'super' : (settings.subscript ? 'sub' : '');
    }

    function updateSelectionSummary(textarea) {
        const doc = getDocument();
        const summary = doc && doc.getElementById('text-style-selection-summary');
        const preview = doc && doc.getElementById('text-style-preview');
        const start = savedSelection ? savedSelection.start : Number(textarea && textarea.selectionStart) || 0;
        const end = savedSelection ? savedSelection.end : Number(textarea && textarea.selectionEnd) || start;
        const selected = textarea ? String(textarea.value || '').substring(start, end) : '';
        if (summary) {
            summary.textContent = selected
                ? selected.length + '자 선택됨'
                : '선택된 텍스트가 없습니다.';
            summary.classList.toggle('is-empty', !selected);
        }
        if (preview) preview.textContent = selected.trim().slice(0, 100) || '서식 미리보기';
        updatePreview();
    }

    function open(options) {
        const doc = getDocument();
        const modal = doc && doc.getElementById('text-style-modal');
        const opts = options || {};
        const textarea = opts.textarea || (doc && doc.getElementById('viewer-edit-ta'));
        if (!modal) return false;
        if (!opts.isEditMode || !textarea) {
            if (typeof opts.showToast === 'function') opts.showToast('편집 모드에서 텍스트를 선택한 뒤 Alt+L을 눌러 주세요.');
            return false;
        }
        savedSelection = {
            start: Number(textarea.selectionStart) || 0,
            end: Number(textarea.selectionEnd) || 0,
            scrollTop: Number(textarea.scrollTop) || 0,
            scrollLeft: Number(textarea.scrollLeft) || 0
        };
        restorePreferences();
        updateSelectionSummary(textarea);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.setAttribute('aria-hidden', 'false');
        const first = doc.getElementById('style-font-size-number');
        if (first && typeof first.focus === 'function') first.focus();
        return true;
    }

    function close(options) {
        const doc = getDocument();
        const modal = doc && doc.getElementById('text-style-modal');
        if (!modal) return false;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
        const textarea = options && options.textarea;
        if (textarea && savedSelection) {
            textarea.focus();
            textarea.setSelectionRange(savedSelection.start, savedSelection.end);
            textarea.scrollTop = savedSelection.scrollTop;
            textarea.scrollLeft = savedSelection.scrollLeft;
        }
        return true;
    }

    function applySelection(options) {
        const doc = getDocument();
        const opts = options || {};
        const textarea = opts.textarea || (doc && doc.getElementById('viewer-edit-ta'));
        if (!textarea || !savedSelection) return { ok: false, message: '선택 영역을 찾지 못했습니다.' };
        const start = Math.max(0, Math.min(savedSelection.start, textarea.value.length));
        const end = Math.max(start, Math.min(savedSelection.end, textarea.value.length));
        if (start === end) return { ok: false, message: '먼저 서식을 적용할 텍스트를 선택해 주세요.' };
        const settings = readSettings();
        if (!hasStyle(settings)) return { ok: false, message: '적용할 서식을 하나 이상 선택해 주세요.' };
        const selected = textarea.value.substring(start, end);
        const html = buildStyledHtml(selected, settings);
        textarea.focus();
        textarea.setSelectionRange(start, end);
        if (doc && typeof doc.execCommand === 'function') doc.execCommand('insertText', false, html);
        else textarea.setRangeText(html, start, end, 'select');
        textarea.setSelectionRange(start, start + html.length);
        textarea.scrollTop = savedSelection.scrollTop;
        textarea.scrollLeft = savedSelection.scrollLeft;
        savedSelection = { start: start, end: start + html.length, scrollTop: textarea.scrollTop, scrollLeft: textarea.scrollLeft };
        persistPreferences(settings);
        close();
        return { ok: true, html: html, start: start, end: start + html.length, settings: settings };
    }

    function adjustSize(delta) {
        const doc = getDocument();
        const input = doc && doc.getElementById('style-font-size-number');
        if (!input) return;
        input.value = Math.max(6, Math.min(96, (Number(input.value) || 12) + Number(delta || 0)));
        setEnabled('font-size', true);
        updatePreview();
    }

    async function addFontsFromInput() {
        const doc = getDocument();
        const input = doc && doc.getElementById('text-style-font-face-input');
        if (!input) return;
        const addButton = doc.getElementById('text-style-add-font');
        if (addButton) addButton.disabled = true;
        let result;
        try {
            result = await addCustomFonts(input.value);
        } catch (error) {
            result = { ok: false, message: 'inDB 폰트 저장에 실패했습니다: ' + (error && error.message ? error.message : error), fonts: [] };
        } finally {
            if (addButton) addButton.disabled = false;
        }
        setStatus(result.message, !result.ok);
        if (!result.ok) return;
        const family = result.fonts[0] && result.fonts[0].family;
        const select = doc.getElementById('style-font-family');
        const value = family ? '"' + family + '",sans-serif' : '';
        if (select && value) select.value = value;
        setEnabled('font-family', true);
        input.value = '';
        if (root.document.fonts && family) {
            root.document.fonts.load('16px "' + family.replace(/"/g, '') + '"').then(function (loaded) {
                setStatus(loaded && loaded.length ? result.message + ' 폰트 로드도 확인했습니다.' : result.message + ' 저장했지만 원격 폰트 응답은 아직 확인되지 않았습니다.', false);
            }).catch(function () {
                setStatus(result.message + ' 저장했지만 원격 폰트 로드는 확인하지 못했습니다.', false);
            });
        }
    }

    function bindEvents() {
        const doc = getDocument();
        if (!doc) return;
        renderPalette('text-style-text-colors', 'text', TEXT_COLORS);
        renderPalette('text-style-highlight-colors', 'highlight', HIGHLIGHT_COLORS);
        installFontFaces();
        refreshFontUi();

        doc.addEventListener('click', function (event) {
            const target = event.target && event.target.closest ? event.target.closest('button, [data-style-toggle], [data-style-reset]') : null;
            if (!target) return;
            if (target.dataset.styleColorKind && target.dataset.color) {
                selectColor(target.dataset.styleColorKind, target.dataset.color);
                return;
            }
            if (target.dataset.styleToggle) {
                const name = target.dataset.styleToggle;
                setEnabled(name, !isEnabled(name));
                return;
            }
            if (target.dataset.styleReset) {
                setEnabled(target.dataset.styleReset, false);
                return;
            }
            if (target.dataset.styleSizeStep) {
                adjustSize(Number(target.dataset.styleSizeStep));
                return;
            }
            if (target.dataset.fontFamily) {
                const family = target.dataset.fontFamily;
                removeCustomFont(family).then(function () {
                    setStatus(persistenceMessage(family + ' 폰트를 삭제하여'), false);
                }).catch(function (error) {
                    setStatus('폰트를 삭제하지 못했습니다: ' + (error && error.message ? error.message : error), true);
                });
            }
        });

        doc.addEventListener('input', function (event) {
            const id = event.target && event.target.id;
            if (id === 'style-font-size-number') setEnabled('font-size', true);
            if (id === 'style-text-color') selectColor('text', event.target.value);
            if (id === 'style-highlight-color') selectColor('highlight', event.target.value);
            updatePreview();
        });
        doc.addEventListener('change', function (event) {
            if (event.target && event.target.id === 'style-font-family') setEnabled('font-family', true);
            updatePreview();
        });

        const addFont = doc.getElementById('text-style-add-font');
        if (addFont) addFont.addEventListener('click', addFontsFromInput);
        const modal = doc.getElementById('text-style-modal');
        if (modal) modal.addEventListener('mousedown', function (event) {
            if (event.target === modal && typeof root.closeTextStyleModal === 'function') root.closeTextStyleModal();
        });
        doc.addEventListener('keydown', function (event) {
            const activeModal = doc.getElementById('text-style-modal');
            if (!activeModal || activeModal.classList.contains('hidden')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (typeof root.closeTextStyleModal === 'function') root.closeTextStyleModal();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (typeof root.applyTextStyleToSelection === 'function') root.applyTextStyleToSelection();
                return;
            }
            event.stopPropagation();
        }, true);
    }

    function init() {
        if (initialized || !getDocument()) return;
        initialized = true;
        customFontsCache = getLegacyCustomFonts();
        bindEvents();
    }

    return {
        init: init,
        setDatabase: setDatabase,
        setSqliteStorage: setSqliteStorage,
        syncToSqlite: syncToSqlite,
        getSqliteSyncStatus: getSqliteSyncStatus,
        refreshFromInDb: refreshFromInDb,
        open: open,
        close: close,
        applySelection: applySelection,
        addCustomFonts: addCustomFonts,
        removeCustomFont: removeCustomFont,
        getCustomFonts: getCustomFonts,
        __test: {
            parseFontFaceCss: parseFontFaceCss,
            buildFontFaceCss: buildFontFaceCss,
            buildStyledHtml: buildStyledHtml,
            normalizeFontSize: normalizeFontSize,
            safeFontFamilyValue: safeFontFamilyValue,
            hasStyle: hasStyle,
            sqliteFontPayload: sqliteFontPayload
        }
    };
});

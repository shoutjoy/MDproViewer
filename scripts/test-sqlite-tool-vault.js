const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

class MemoryStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

(async function run() {
    const stored = new Map();
    const localStorage = new MemoryStorage();
    const window = {
        crypto: webcrypto,
        localStorage,
        TextEncoder,
        TextDecoder,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        dispatchEvent() {},
        MDPStorage: {
            getStatus() { return { activeMode: 'sqlite' }; },
            async putSqliteSetting(item) { stored.set(item.key, JSON.parse(JSON.stringify(item))); return item; },
            async listSqliteSettings() { return Array.from(stored.values()).map(item => ({ ...item, valueType: 'object' })); }
        },
        async getAiSettings() { return { scholarAI: true, sspimgAI: true, imageUploadEnabled: true }; }
    };
    window.window = window;
    const context = vm.createContext({ window, localStorage, TextEncoder, TextDecoder, btoa, atob, console, CustomEvent: window.CustomEvent });
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage', 'encrypted-credential-vault.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'encrypted-credential-vault.js' });

    const originalGemini = 'AIza01234567890123456789012345678901234';
    const originalOpenAI = 'sk-protected-openai-0123456789';
    localStorage.setItem('ss_gemini_api_key', originalGemini);
    localStorage.setItem('ss_openai_api_key', originalOpenAI);
    localStorage.setItem('ss_scholar_ai_provider', 'aistudio');
    localStorage.setItem('ss_scholar_ai_model', 'gemini-2.5-pro');
    localStorage.setItem('ss_scholar_ai_system', '학술 근거를 우선해 답하세요.');

    await window.MDPCredentialVault.create('correct horse battery', 'correct horse battery');
    const vaultRecord = stored.get('encryptedToolVault');
    assert(vaultRecord, 'encrypted vault was not stored');
    const serialized = JSON.stringify(vaultRecord);
    assert(!serialized.includes(originalGemini), 'Gemini key leaked into SQLite payload');
    assert(!serialized.includes(originalOpenAI), 'OpenAI key leaked into SQLite payload');
    assert(!serialized.includes('correct horse battery'), 'password leaked into SQLite payload');
    assert.strictEqual(localStorage.getItem('ss_gemini_api_key'), null, 'legacy Gemini key was not cleared');
    assert.strictEqual(window.MDPCredentialVault.getSecret('gemini'), originalGemini, 'unlocked Gemini key mismatch');
    assert.strictEqual(vaultRecord.value.entries.find(item => item.id === 'gemini').last4, originalGemini.slice(-4));

    window.MDPCredentialVault.lock();
    assert.strictEqual(window.MDPCredentialVault.getSecret('gemini'), '', 'locked vault exposed a key');
    await assert.rejects(() => window.MDPCredentialVault.unlock('wrong password'), /올바르지 않거나/);
    await window.MDPCredentialVault.unlock('correct horse battery');
    assert.strictEqual(window.MDPCredentialVault.getSecret('openai'), originalOpenAI, 'unlock round-trip mismatch');
    await assert.rejects(() => window.MDPCredentialVault.importCurrent(''), /현재 보관함 비밀번호/);

    const tampered = JSON.parse(JSON.stringify(vaultRecord.value));
    tampered.ciphertext = tampered.ciphertext.slice(0, -4) + 'AAAA';
    await assert.rejects(
        () => window.MDPCredentialVault._test.decryptEnvelope('correct horse battery', tampered),
        /올바르지 않거나/
    );

    const catalogRecord = stored.get('toolSettingsCatalog');
    assert(catalogRecord && catalogRecord.value.tools.length === 5, 'tool settings catalog was not stored');
    const scholar = catalogRecord.value.tools.find(item => item.id === 'scholarAI');
    assert.strictEqual(scholar.model, 'gemini-2.5-pro');
    assert.strictEqual(scholar.prompt, '학술 근거를 우선해 답하세요.');
    assert.strictEqual(scholar.protection.last4, originalGemini.slice(-4));
    assert(!JSON.stringify(catalogRecord).includes(originalGemini), 'catalog leaked a raw key');
    localStorage.setItem('ss_scholar_ai_system', '예시 sk-abcdefghijklmnopqrstuvwxyz 값을 숨기세요.');
    const redactedCatalog = await window.MDPCredentialVault.syncCatalog();
    assert(redactedCatalog.tools.find(item => item.id === 'scholarAI').prompt.includes('[보호된 값 숨김]'), 'prompt secret was not redacted');
    assert(!JSON.stringify(redactedCatalog).includes('sk-abcdefghijklmnopqrstuvwxyz'), 'prompt secret leaked into catalog');

    const ui = fs.readFileSync(path.join(__dirname, '..', 'Setting', 'settings-ui.js'), 'utf8');
    assert(ui.includes("entry.item.key !== 'encryptedToolVault'"), 'explorer does not hide encrypted envelope record');
    assert(ui.includes('도구 설정 모아보기'), 'tool overview UI is missing');
    assert(ui.includes('API 키 원문은 이 화면에 표시하지 않습니다.'), 'masked key notice is missing');
    console.log('SQLite encrypted tool vault tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "storage", "sqliteWorkfiles.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const handlers = fs.readFileSync(path.join(root, "js", "files", "fileHandlers.js"), "utf8");
const aiJena = fs.readFileSync(path.join(root, "js", "ai", "aiJena.js"), "utf8");

for (const id of [
    "btnSaveFmaSqlite", "btnSaveFmaWebpSqlite", "btnOpenSqliteWorkfiles",
    "btnSaveDbSqlite", "btnSaveFmeSqlite", "btnOpenFmeSqlite", "sqliteWorkfilesModal",
    "aiJenaReferenceSqliteList", "btnSaveAiJenaReferencesSqlite", "btnLoadAiJenaReferencesSqlite"
]) {
    assert(html.includes(`id="${id}"`), `missing SQLite work-file UI: ${id}`);
}
assert(html.includes("sqliteWorkfiles.js"), "SQLite work-file script is not loaded");
assert(handlers.includes("async function createFmaArchiveFile"), "shared FMA archive builder missing");
for (const preservedFunction of [
    "exportAiJenaReferencePreset", "importAiJenaReferencePreset",
    "saveAiJenaReferencePresetToDb", "loadAiJenaReferencePresetFromDb"
]) {
    assert(aiJena.includes(`function ${preservedFunction}`), `existing AI Jena storage function missing: ${preservedFunction}`);
}
assert(aiJena.includes("saveAiJenaReferencePresetToSqlite"), "AI Jena SQLite save adapter missing");
assert(aiJena.includes("loadAiJenaReferencePresetFromSqlite"), "AI Jena SQLite load adapter missing");

let storageMode = "sqlite";
const requests = [];
const windowObject = {
    clearTimeout,
    setTimeout,
    FMASqliteWorkfiles: null
};
const sandbox = {
    window: windowObject,
    document: {
        addEventListener() {},
        getElementById() { return null; }
    },
    localStorage: {
        getItem(key) { return key === "mdpro_storage_mode_v1" ? storageMode : null; }
    },
    fetch: async (url, options = {}) => {
        requests.push({ url, options });
        if (url.endsWith("/session")) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    data: { token: "test-session", capabilities: { workFiles: true, modelAssets: true } }
                })
            };
        }
        if (url.endsWith("/workfiles") && options.method === "POST") {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    data: {
                        id: options.headers.get("X-MDViewer-Work-Type") === "ai_jena_preset" ? "file_preset" : "file_1",
                        name: decodeURIComponent(options.headers.get("X-MDViewer-File-Name")),
                        workType: options.headers.get("X-MDViewer-Work-Type"),
                        sizeBytes: options.body.size
                    }
                })
            };
        }
        if (url.includes("/workfiles?") && options.method === "GET") {
            const presetList = url.includes("type=ai_jena_preset") ? [{
                id: "file_preset", name: "aiJena_refs_test.json", workType: "ai_jena_preset",
                mimeType: "application/vnd.fma-ai-jena-preset+json", sizeBytes: 123, createdAt: 1, updatedAt: 1
            }] : [];
            return {
                ok: true,
                status: 200,
                json: async () => ({ ok: true, data: { items: presetList, appId: "fmaviewer" } })
            };
        }
        if (url.endsWith("/models/u2net_human_seg") && options.method === "POST") {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    data: { available: true, modelKey: "u2net_human_seg", sizeBytes: options.body.size }
                })
            };
        }
        if (url.endsWith("/models/u2net_human_seg") && options.method === "GET") {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    data: {
                        available: true,
                        modelKey: "u2net_human_seg",
                        sizeBytes: 5,
                        checksumSha256: "model-checksum"
                    }
                })
            };
        }
        if (url.endsWith("/models/u2net_human_seg/download") && options.method === "GET") {
            return {
                ok: true,
                status: 200,
                headers: new Headers({ "X-MDViewer-Checksum-Sha256": "model-checksum" }),
                blob: async () => new Blob(["model"], { type: "application/octet-stream" })
            };
        }
        throw new Error(`unexpected request: ${url}`);
    },
    Headers,
    URLSearchParams,
    Blob,
    File: global.File || class File extends Blob {
        constructor(parts, name, options = {}) {
            super(parts, options);
            this.name = name;
            this.lastModified = options.lastModified || 0;
        }
    },
    URL,
    console,
    alert() {},
    setTimeout,
    clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "sqliteWorkfiles.js" });
const api = windowObject.FMASqliteWorkfiles;
assert(api, "FMASqliteWorkfiles API was not exported");

(async () => {
    const blob = new Blob(["test"], { type: "application/vnd.fma+zip" });
    await api.uploadWorkFile(blob, "프로젝트.fma", "fma");
    await api.listWorkFiles({ query: "프로젝트", workType: "fma" });
    assert.strictEqual(requests.length, 3, "session should be reused after first request");
    const upload = requests[1];
    assert.strictEqual(upload.options.headers.get("X-MDViewer-Session"), "test-session");
    assert.strictEqual(upload.options.headers.get("X-MDViewer-Work-Type"), "fma");
    assert.strictEqual(upload.options.headers.get("X-MDViewer-App"), "fmaviewer");
    assert.strictEqual(upload.options.headers.get("X-MDViewer-File-Name"), encodeURIComponent("프로젝트.fma"));
    assert(requests[2].url.includes("q=%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8"), "search query was not encoded");

    const preset = {
        format: "FMA-AI-JENA-REFERENCES", version: 1, name: "test",
        references: { face: null, clothing: null, background: null, pose: null }
    };
    const savedPreset = await api.saveAiJenaReferencePreset(preset);
    assert.strictEqual(savedPreset.workType, "ai_jena_preset");
    const listedPresets = await api.listAiJenaReferencePresets();
    assert.strictEqual(listedPresets.items[0].workType, "ai_jena_preset");
    const presetUpload = requests.find(request =>
        request.options.headers?.get?.("X-MDViewer-Work-Type") === "ai_jena_preset"
    );
    assert(presetUpload, "AI Jena preset upload request missing");
    assert.strictEqual(presetUpload.options.body.type, "application/vnd.fma-ai-jena-preset+json");

    const modelBlob = new Blob(["model"], { type: "application/octet-stream" });
    await api.saveOnnxModel(modelBlob, "u2net_human_seg.onnx");
    const loadedModel = await api.loadOnnxModel();
    assert.strictEqual(loadedModel.blob.size, 5, "SQLite ONNX model size changed");
    const modelUpload = requests.find(request => request.url.endsWith("/models/u2net_human_seg") && request.options.method === "POST");
    const modelDownload = requests.find(request => request.url.endsWith("/models/u2net_human_seg/download"));
    assert.strictEqual(modelUpload.options.headers.get("X-MDViewer-File-Name"), "u2net_human_seg.onnx");
    assert.strictEqual(modelUpload.options.headers.get("X-MDViewer-Session"), "test-session");
    assert.strictEqual(modelDownload.options.headers.get("X-MDViewer-Session"), "test-session");

    const hostCalls = [];
    windowObject.parent = {
        MDPStorage: {
            getStatus() {
                return {
                    activeMode: "sqlite",
                    sqliteBackend: "wasm-opfs",
                    sqliteHealth: { available: true, capabilities: { workFiles: true, modelAssets: false } }
                };
            },
            async saveSqliteWorkFile(file, options) {
                hostCalls.push({ method: "save", file, options });
                return { id: "file_wasm", name: options.fileName, workType: options.workType, sizeBytes: file.size };
            },
            async listSqliteWorkFiles(options) {
                hostCalls.push({ method: "list", options });
                return { items: [{
                    id: "file_wasm", name: "WASM.fma", workType: "fma", mimeType: "application/vnd.fma+zip",
                    sizeBytes: 4, createdAt: 1, updatedAt: 1
                }] };
            },
            async loadSqliteWorkFile(item) {
                hostCalls.push({ method: "load", item });
                return new Blob(["test"], { type: item.mimeType });
            }
        }
    };
    api._resetSessionForTests();
    const requestCountBeforeHost = requests.length;
    const hostSaved = await api.uploadWorkFile(blob, "WASM.fma", "fma");
    const hostListed = await api.listWorkFiles({ workType: "fma" });
    const hostLoaded = await api.fetchWorkFile(hostListed.items[0]);
    assert.strictEqual(hostSaved.id, "file_wasm", "FMA iframe did not use parent MDPStorage");
    assert.strictEqual(hostLoaded.size, 4, "FMA iframe parent storage load changed bytes");
    assert.deepStrictEqual(hostCalls.map(call => call.method), ["save", "list", "load"]);
    assert.strictEqual(requests.length, requestCountBeforeHost, "WASM FMA bridge must not call Python API");

    storageMode = "inDB";
    await assert.rejects(
        api.listWorkFiles(),
        /SQLite 사용/,
        "IndexedDB mode must not silently use SQLite work files"
    );
    console.log("FMA Viewer SQLite work-file adapter tests passed");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

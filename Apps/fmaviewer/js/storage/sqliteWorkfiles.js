/* SQLite work-file vault for FMA Viewer. Existing file/IndexedDB saves remain intact. */
(function () {
    "use strict";

    const API_ROOT = "/api/sqlite";
    const STORAGE_MODE_KEY = "mdpro_storage_mode_v1";
    const APP_ID = "fmaviewer";
    const TYPE_LABELS = {
        fma: "FMA 원본",
        fma_webp: "FMA WebP",
        fma_snapshot: "SaveDB",
        fme: "FME",
        ai_jena_preset: "AI Jena 참고 세팅"
    };
    let sessionToken = "";
    let sessionCapabilities = null;
    let searchTimer = 0;
    let currentItems = [];

    function getHostStorage() {
        try {
            if (window.parent && window.parent !== window && window.parent.MDPStorage) {
                return window.parent.MDPStorage;
            }
        } catch (_) {}
        return window.MDPStorage || null;
    }

    async function getHostStorageStatus() {
        const storage = getHostStorage();
        if (!storage || typeof storage.getStatus !== "function") return null;
        let status = storage.getStatus();
        if ((!status?.sqliteHealth || !status.sqliteHealth.available)
            && typeof storage.refreshSqliteHealth === "function") {
            await storage.refreshSqliteHealth();
            status = storage.getStatus();
        }
        return { storage, status };
    }

    function isSqliteMode() {
        try {
            return localStorage.getItem(STORAGE_MODE_KEY) === "sqlite";
        } catch (error) {
            return false;
        }
    }

    function applySqliteFeatureButtonVisibility() {
        const enabled = isSqliteMode();
        document.querySelectorAll('button[id*="sqlite" i], a[id*="sqlite" i], button[onclick*="sqlite" i], a[onclick*="sqlite" i]')
            .forEach((element) => {
                if (!enabled) {
                    if (!element.hidden) element.dataset.sqliteFeatureHidden = "1";
                    element.hidden = true;
                } else if (element.dataset.sqliteFeatureHidden === "1") {
                    element.hidden = false;
                    delete element.dataset.sqliteFeatureHidden;
                }
            });
    }

    async function getSession(force = false) {
        if (sessionToken && !force) return sessionToken;
        const response = await fetch(`${API_ROOT}/session`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store"
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok || !result.data?.token) {
            throw new Error(result?.error?.message || "SQLite 로컬 서버 세션을 열 수 없습니다.");
        }
        if (result.data.capabilities?.workFiles !== true) {
            throw new Error("현재 SQLite 서버는 작업파일 저장 기능을 지원하지 않습니다. 서버를 재시작하세요.");
        }
        sessionToken = result.data.token;
        sessionCapabilities = result.data.capabilities || {};
        return sessionToken;
    }

    async function sessionFetch(path, options = {}, retry = true) {
        const token = await getSession();
        const headers = new Headers(options.headers || {});
        headers.set("X-MDViewer-Session", token);
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
        if (response.status === 403 && retry) {
            await getSession(true);
            return sessionFetch(path, options, false);
        }
        return response;
    }

    async function apiJson(path, options = {}) {
        const response = await sessionFetch(path, options);
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.ok) {
            throw new Error(result?.error?.message || `SQLite 요청 실패 (${response.status})`);
        }
        return result.data;
    }

    async function requireSqlite() {
        if (!isSqliteMode()) {
            throw new Error("메인 MD Viewer 설정에서 ‘SQLite 사용’을 먼저 선택하세요.");
        }
        const host = await getHostStorageStatus();
        if (host && host.status?.activeMode === "sqlite") {
            sessionCapabilities = host.status.sqliteHealth?.capabilities || {};
            if (sessionCapabilities.workFiles === true) return host.storage;
            if (host.status.sqliteBackend === "wasm-opfs") {
                throw new Error("현재 SQLite WASM 저장소는 FMA 작업파일 저장을 지원하지 않습니다.");
            }
        }
        await getSession();
        return null;
    }

    if (document && typeof document.addEventListener === "function") {
        document.addEventListener("DOMContentLoaded", applySqliteFeatureButtonVisibility);
    }
    if (window && typeof window.addEventListener === "function") {
        window.addEventListener("focus", applySqliteFeatureButtonVisibility);
        window.addEventListener("storage", (event) => {
            if (!event || event.key === STORAGE_MODE_KEY) applySqliteFeatureButtonVisibility();
        });
    }

    async function requireModelAssets() {
        await requireSqlite();
        if (sessionCapabilities?.modelAssets !== true) {
            throw new Error("현재 SQLite 서버는 ONNX 모델 저장을 지원하지 않습니다. 서버를 재시작하세요.");
        }
    }

    async function uploadWorkFile(blob, fileName, workType) {
        const hostStorage = await requireSqlite();
        if (hostStorage) {
            if (!["fma", "fma_webp", "fma_snapshot"].includes(String(workType || ""))) {
                throw new Error("현재 SQLite WASM 저장소는 FMA 작업파일만 지원합니다.");
            }
            return hostStorage.saveSqliteWorkFile(blob, {
                fileName,
                workType,
                appId: APP_ID,
                mimeType: blob.type || "application/vnd.fma+zip"
            });
        }
        return apiJson("/workfiles", {
            method: "POST",
            headers: {
                "Content-Type": blob.type || "application/octet-stream",
                "X-MDViewer-File-Name": encodeURIComponent(fileName),
                "X-MDViewer-Work-Type": workType,
                "X-MDViewer-App": APP_ID
            },
            body: blob
        });
    }

    async function listWorkFiles(options = {}) {
        const hostStorage = await requireSqlite();
        if (hostStorage) {
            return hostStorage.listSqliteWorkFiles({
                appId: APP_ID,
                query: options.query,
                workType: options.workType,
                limit: 200
            });
        }
        const params = new URLSearchParams({ app: APP_ID, limit: "200" });
        if (options.query) params.set("q", options.query);
        if (options.workType) params.set("type", options.workType);
        return apiJson(`/workfiles?${params.toString()}`, { method: "GET" });
    }

    async function fetchWorkFile(item) {
        const hostStorage = await requireSqlite();
        if (hostStorage) {
            const blob = await hostStorage.loadSqliteWorkFile(item);
            if (blob.size !== Number(item.sizeBytes)) {
                throw new Error("불러온 작업파일의 크기가 SQLite 메타데이터와 다릅니다.");
            }
            return new File([blob], item.name, {
                type: item.mimeType || blob.type || "application/octet-stream",
                lastModified: Number(item.updatedAt || item.createdAt || Date.now())
            });
        }
        const response = await sessionFetch(`/workfiles/${encodeURIComponent(item.id)}/download`, {
            method: "GET",
            headers: { Accept: item.mimeType || "application/octet-stream" }
        });
        if (!response.ok) {
            const result = await response.json().catch(() => null);
            throw new Error(result?.error?.message || `작업파일 다운로드 실패 (${response.status})`);
        }
        const blob = await response.blob();
        if (blob.size !== Number(item.sizeBytes)) {
            throw new Error("불러온 작업파일의 크기가 SQLite 메타데이터와 다릅니다.");
        }
        return new File([blob], item.name, {
            type: item.mimeType || blob.type || "application/octet-stream",
            lastModified: Number(item.updatedAt || item.createdAt || Date.now())
        });
    }

    async function saveAiJenaReferencePreset(preset) {
        if (!preset || preset.format !== "FMA-AI-JENA-REFERENCES" || preset.version !== 1) {
            throw new Error("올바른 AI Jena 참고 세팅이 아닙니다.");
        }
        const safeName = String(preset.name || "AI Jena 참고 세팅")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "_")
            .slice(0, 60) || "AI_Jena_참고_세팅";
        const blob = new Blob([JSON.stringify(preset, null, 2)], {
            type: "application/vnd.fma-ai-jena-preset+json"
        });
        return uploadWorkFile(blob, `aiJena_refs_${safeName}_${Date.now()}.json`, "ai_jena_preset");
    }

    async function listAiJenaReferencePresets(query = "") {
        return listWorkFiles({ query, workType: "ai_jena_preset" });
    }

    async function loadAiJenaReferencePreset(item) {
        if (!item || item.workType !== "ai_jena_preset") {
            throw new Error("SQLite AI Jena 참고 세팅 항목이 아닙니다.");
        }
        const file = await fetchWorkFile(item);
        let preset;
        try {
            preset = JSON.parse(await file.text());
        } catch (error) {
            throw new Error("SQLite 참고 세팅 JSON을 해석할 수 없습니다.");
        }
        if (preset?.format !== "FMA-AI-JENA-REFERENCES" || preset?.version !== 1) {
            throw new Error("SQLite 참고 세팅 형식 또는 버전이 올바르지 않습니다.");
        }
        return preset;
    }

    async function getOnnxModelStatus(modelKey = "u2net_human_seg") {
        await requireModelAssets();
        return apiJson(`/models/${encodeURIComponent(modelKey)}`, { method: "GET" });
    }

    async function saveOnnxModel(blob, fileName = "u2net_human_seg.onnx", modelKey = "u2net_human_seg") {
        await requireModelAssets();
        return apiJson(`/models/${encodeURIComponent(modelKey)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                "X-MDViewer-File-Name": encodeURIComponent(fileName)
            },
            body: blob
        });
    }

    async function loadOnnxModel(modelKey = "u2net_human_seg") {
        const metadata = await getOnnxModelStatus(modelKey);
        if (!metadata?.available) return null;
        const response = await sessionFetch(`/models/${encodeURIComponent(modelKey)}/download`, {
            method: "GET",
            headers: { Accept: "application/octet-stream" }
        });
        if (!response.ok) {
            const result = await response.json().catch(() => null);
            throw new Error(result?.error?.message || `SQLite ONNX 모델 다운로드 실패 (${response.status})`);
        }
        const responseChecksum = String(response.headers.get("X-MDViewer-Checksum-Sha256") || "");
        if (responseChecksum && responseChecksum !== metadata.checksumSha256) {
            throw new Error("SQLite ONNX 모델 checksum 헤더가 메타데이터와 다릅니다.");
        }
        const blob = await response.blob();
        if (blob.size !== Number(metadata.sizeBytes)) {
            throw new Error("SQLite ONNX 모델 크기가 메타데이터와 다릅니다.");
        }
        return {
            blob: new Blob([blob], { type: "application/octet-stream" }),
            metadata
        };
    }

    function saveBlobDownload(file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function saveFmaToSqlite(workType, compressImages) {
        if (!Array.isArray(images) || images.length === 0) {
            alert("SQLite에 저장할 데이터가 없습니다.");
            return;
        }
        if (typeof JSZip === "undefined" || typeof createFmaArchiveFile !== "function") {
            alert("FMA 압축 모듈을 불러오지 못했습니다.");
            return;
        }
        showLoading(compressImages ? "SQLite용 WebP FMA 생성 중…" : "SQLite용 FMA 생성 중…");
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
            await requireSqlite();
            const archive = await createFmaArchiveFile({
                compressImages,
                onZipProgress: percent => updateLoading(58 + percent * .34)
            });
            updateLoading(94);
            const prefix = workType === "fma_snapshot"
                ? "savedb_snapshot"
                : (compressImages ? "project_export_webp" : "project_export");
            const fileName = `${prefix}_${Date.now()}.fma`;
            const saved = await uploadWorkFile(archive.blob, fileName, workType);
            updateLoading(100);
            updateImportStatus(
                `SQLite ${TYPE_LABELS[workType]} 저장 완료 · 미디어 ${archive.mediaCount}개 · ` +
                `${formatFmaBytes(saved.sizeBytes)}${saved.deduplicatedAsset ? " · 원본 중복 저장 생략" : ""}`
            );
        } catch (error) {
            console.error("SQLite FMA save failed:", error);
            alert("SQLite에 FMA를 저장하지 못했습니다: " + error.message);
        } finally {
            window.setTimeout(hideLoading, 350);
        }
    }

    async function saveFmeToSqlite() {
        try {
            await requireSqlite();
            if (typeof buildCurrentImageEditorProject !== "function") {
                throw new Error("FME 편집 프로젝트 생성 기능을 불러오지 못했습니다.");
            }
            const project = buildCurrentImageEditorProject();
            if (!project) throw new Error("저장할 이미지 편집 프로젝트가 없습니다.");
            const sourceItem = images[imageEditorState.imageIndex];
            if (sourceItem) sourceItem.fmeProject = project;
            const safeName = String(project.source?.name || "image")
                .replace(/\.[^.]+$/, "")
                .replace(/[\\/:*?"<>|]+/g, "_") || "image";
            const blob = new Blob([JSON.stringify(project)], {
                type: "application/vnd.fma-edit+json"
            });
            showLoading("FME 프로젝트를 SQLite에 저장 중…");
            updateLoading(45);
            const saved = await uploadWorkFile(blob, `${safeName}_${Date.now()}.fme`, "fme");
            updateLoading(100);
            if (typeof saveCurrentImagesToDB === "function") saveCurrentImagesToDB();
            updateImportStatus(`SQLite FME 저장 완료 · ${formatFmaBytes(saved.sizeBytes)}`);
        } catch (error) {
            console.error("SQLite FME save failed:", error);
            alert("SQLite에 FME를 저장하지 못했습니다: " + error.message);
        } finally {
            window.setTimeout(hideLoading, 350);
        }
    }

    function setStatus(message, isError = false) {
        const status = document.getElementById("sqliteWorkfilesStatus");
        if (!status) return;
        status.textContent = message || "";
        status.classList.toggle("error", Boolean(isError));
    }

    function formatDate(value) {
        const date = new Date(Number(value));
        return Number.isFinite(date.getTime()) ? date.toLocaleString("ko-KR") : "";
    }

    function renderWorkFiles(items) {
        const list = document.getElementById("sqliteWorkfilesList");
        if (!list) return;
        list.replaceChildren();
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "sqlite-workfile-empty";
            empty.textContent = "조건에 맞는 SQLite 작업파일이 없습니다.";
            list.appendChild(empty);
            return;
        }
        items.forEach(item => {
            const row = document.createElement("article");
            row.className = "sqlite-workfile-item";
            const info = document.createElement("div");
            const title = document.createElement("strong");
            const kind = document.createElement("span");
            kind.className = "sqlite-workfile-kind";
            kind.textContent = TYPE_LABELS[item.workType] || item.workType;
            title.append(kind, document.createTextNode(item.name));
            const meta = document.createElement("small");
            meta.textContent = `${formatDate(item.createdAt)} · ${formatFmaBytes(item.sizeBytes)} · SHA-256 ${String(item.checksumSha256).slice(0, 12)}…`;
            info.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "sqlite-workfile-actions";
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.textContent = "열기";
            openButton.onclick = () => openStoredWorkFile(item);
            const downloadButton = document.createElement("button");
            downloadButton.type = "button";
            downloadButton.textContent = "다운로드";
            downloadButton.onclick = () => downloadStoredWorkFile(item);
            actions.append(openButton, downloadButton);
            row.append(info, actions);
            list.appendChild(row);
        });
    }

    async function refreshWorkFiles() {
        const query = document.getElementById("sqliteWorkfilesSearch")?.value.trim() || "";
        const workType = document.getElementById("sqliteWorkfilesType")?.value || "";
        setStatus("SQLite 작업파일을 불러오는 중…");
        try {
            const result = await listWorkFiles({ query, workType });
            currentItems = result.items || [];
            renderWorkFiles(currentItems);
            setStatus(`${currentItems.length}개 작업파일 · SQLite 연결됨`);
        } catch (error) {
            currentItems = [];
            renderWorkFiles([]);
            setStatus(error.message, true);
        }
    }

    async function openStoredWorkFile(item) {
        setStatus(`${item.name} 불러오는 중…`);
        try {
            if (item.workType === "fme" && document.getElementById("imageEditorModal")?.style.display === "none") {
                throw new Error("FME는 이미지 편집 창을 연 다음 ‘FME SQLite 불러오기’에서 선택하세요.");
            }
            if (item.workType === "ai_jena_preset") {
                const preset = await loadAiJenaReferencePreset(item);
                if (typeof applyAiJenaReferencePreset !== "function") {
                    throw new Error("AI Jena 참고 세팅 적용 기능을 불러오지 못했습니다.");
                }
                const loaded = applyAiJenaReferencePreset(preset);
                closeWorkfilesModal();
                if (typeof setAiJenaReferenceStorageStatus === "function") {
                    setAiJenaReferenceStorageStatus(`“${loaded.name}” 세팅을 SQLite에서 불러왔습니다.`);
                }
                return;
            }
            const file = await fetchWorkFile(item);
            closeWorkfilesModal();
            if (item.workType === "fme") {
                await importImageEditorProject(file);
            } else {
                await loadFMA(file);
            }
        } catch (error) {
            console.error("SQLite work file open failed:", error);
            setStatus(error.message, true);
            alert("SQLite 작업파일을 열지 못했습니다: " + error.message);
        }
    }

    async function downloadStoredWorkFile(item) {
        setStatus(`${item.name} 다운로드 준비 중…`);
        try {
            const file = await fetchWorkFile(item);
            saveBlobDownload(file);
            setStatus(`${item.name} 다운로드 완료`);
        } catch (error) {
            setStatus(error.message, true);
        }
    }

    function openWorkfilesModal(workType = "") {
        const modal = document.getElementById("sqliteWorkfilesModal");
        const typeSelect = document.getElementById("sqliteWorkfilesType");
        if (!modal || !typeSelect) return;
        typeSelect.value = workType;
        modal.style.display = "flex";
        refreshWorkFiles();
    }

    function closeWorkfilesModal() {
        const modal = document.getElementById("sqliteWorkfilesModal");
        if (modal) modal.style.display = "none";
    }

    function initialize() {
        document.getElementById("btnSaveFmaSqlite")?.addEventListener("click", () => {
            closeFileMenu();
            saveFmaToSqlite("fma", false);
        });
        document.getElementById("btnSaveFmaWebpSqlite")?.addEventListener("click", () => {
            closeFileMenu();
            saveFmaToSqlite("fma_webp", true);
        });
        document.getElementById("btnOpenSqliteWorkfiles")?.addEventListener("click", () => {
            closeFileMenu();
            openWorkfilesModal();
        });
        document.getElementById("btnSaveDbSqlite")?.addEventListener("click", () => {
            closeSaveDbMenu();
            saveFmaToSqlite("fma_snapshot", false);
        });
        document.getElementById("btnSaveFmeSqlite")?.addEventListener("click", saveFmeToSqlite);
        document.getElementById("btnOpenFmeSqlite")?.addEventListener("click", () => openWorkfilesModal("fme"));
        document.getElementById("btnCloseSqliteWorkfiles")?.addEventListener("click", closeWorkfilesModal);
        document.getElementById("btnRefreshSqliteWorkfiles")?.addEventListener("click", refreshWorkFiles);
        document.getElementById("sqliteWorkfilesType")?.addEventListener("change", refreshWorkFiles);
        document.getElementById("sqliteWorkfilesSearch")?.addEventListener("input", () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(refreshWorkFiles, 250);
        });
        document.getElementById("sqliteWorkfilesModal")?.addEventListener("click", event => {
            if (event.target === event.currentTarget) closeWorkfilesModal();
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && document.getElementById("sqliteWorkfilesModal")?.style.display !== "none") {
                closeWorkfilesModal();
            }
        });
    }

    window.FMASqliteWorkfiles = {
        isSqliteMode,
        uploadWorkFile,
        listWorkFiles,
        fetchWorkFile,
        saveAiJenaReferencePreset,
        listAiJenaReferencePresets,
        loadAiJenaReferencePreset,
        getOnnxModelStatus,
        saveOnnxModel,
        loadOnnxModel,
        saveFmaToSqlite,
        saveFmeToSqlite,
        openWorkfilesModal,
        refreshWorkFiles,
        _resetSessionForTests: () => {
            sessionToken = "";
            sessionCapabilities = null;
        }
    };

    document.addEventListener("DOMContentLoaded", initialize);
})();

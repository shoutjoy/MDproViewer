/* =======================================================
   Background Removal Mask Refinement Editor
   ======================================================= */

const MASK_POLYGON_PRESETS_STORAGE = "fma_mask_polygon_presets_v1";
const MASK_POLYGON_PRESET_LIMIT = 30;

var maskEditorState = {
    open: false,
    tool: "brush",
    action: "erase",
    brushSize: 48,
    strength: 1,
    brushType: "hard",
    width: 0,
    height: 0,
    fitScale: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    drawing: false,
    panning: false,
    lastPoint: null,
    panStart: null,
    polygonPoints: [],
    lastPolygonPoints: [],
    hasSelection: false,
    originalCanvas: null,
    initialCanvas: null,
    undoHistory: [],
    undoLimit: 8,
    onApply: null,
    onCancel: null
};

function initBackgroundMaskEditor() {
    if (!dom.bgMaskEditorModal) return;

    document.querySelectorAll(".mask-tool").forEach(button => {
        button.onclick = () => setMaskEditorTool(button.dataset.maskTool);
    });
    document.querySelectorAll(".mask-action").forEach(button => {
        button.onclick = () => setMaskEditorAction(button.dataset.maskAction);
    });

    dom.maskBrushSize.oninput = () => {
        maskEditorState.brushSize = Number(dom.maskBrushSize.value) || 48;
        dom.maskBrushSizeValue.innerText = maskEditorState.brushSize + "px";
        updateMaskEditorCursorSize();
    };
    dom.maskBrushStrength.oninput = () => {
        maskEditorState.strength = (Number(dom.maskBrushStrength.value) || 100) / 100;
        dom.maskBrushStrengthValue.innerText = Math.round(maskEditorState.strength * 100) + "%";
    };
    dom.maskBrushType.onchange = () => {
        maskEditorState.brushType = dom.maskBrushType.value;
        dom.maskEditorCursor.style.borderRadius =
            maskEditorState.brushType === "square" ? "2px" : "50%";
    };

    dom.btnMaskPolygonComplete.onclick = finalizeMaskPolygonSelection;
    dom.btnMaskApplySelection.onclick = applyMaskSelection;
    dom.btnMaskClearSelection.onclick = clearMaskSelection;
    dom.btnSaveMaskPolygon.onclick = saveMaskPolygonPreset;
    dom.btnLoadMaskPolygon.onclick = loadSelectedMaskPolygonPreset;
    dom.btnDeleteMaskPolygon.onclick = deleteSelectedMaskPolygonPreset;
    dom.btnMaskUndo.onclick = undoMaskEditor;
    dom.btnMaskReset.onclick = resetMaskEditorResult;
    dom.btnMaskEditorFit.onclick = fitMaskEditorView;
    dom.btnMaskEditorFullscreen.onclick = toggleMaskEditorFullscreen;
    dom.btnMaskEditorClose.onclick = cancelBackgroundMaskEditor;
    dom.btnMaskSkip.onclick = () => completeBackgroundMaskEditor(true);
    dom.btnMaskApply.onclick = () => completeBackgroundMaskEditor(false);

    dom.maskEditorStage.addEventListener("pointerdown", handleMaskEditorPointerDown);
    dom.maskEditorStage.addEventListener("pointermove", handleMaskEditorPointerMove);
    dom.maskEditorStage.addEventListener("pointerup", handleMaskEditorPointerUp);
    dom.maskEditorStage.addEventListener("pointercancel", handleMaskEditorPointerUp);
    dom.maskEditorStage.addEventListener("pointerleave", event => {
        dom.maskEditorCursor.style.display = "none";
        if (maskEditorState.drawing) handleMaskEditorPointerUp(event);
    });
    dom.maskEditorStage.addEventListener("wheel", handleMaskEditorWheel, { passive: false });
    dom.maskEditorStage.addEventListener("contextmenu", event => event.preventDefault());

    document.addEventListener("fullscreenchange", () => {
        if (maskEditorState.open) requestAnimationFrame(fitMaskEditorView);
    });
    window.addEventListener("resize", () => {
        if (maskEditorState.open && !document.fullscreenElement) {
            requestAnimationFrame(fitMaskEditorView);
        }
    });

    document.addEventListener("keydown", event => {
        if (!maskEditorState.open || !(event.ctrlKey || event.metaKey) ||
            event.key.toLowerCase() !== "z" || event.altKey) return;
        const target = event.target;
        if (target?.matches?.("input, textarea, select") || target?.isContentEditable) return;
        event.preventDefault();
        undoMaskEditor();
    });
    refreshMaskPolygonPresetSelect();
}

async function openBackgroundMaskEditor(options) {
    const originalImage = await loadUpscaleImage(options.originalSrc);
    const resultImage = await loadUpscaleImage(options.resultSrc);
    const width = resultImage.naturalWidth;
    const height = resultImage.naturalHeight;

    maskEditorState.open = true;
    maskEditorState.width = width;
    maskEditorState.height = height;
    maskEditorState.onApply = options.onApply || null;
    maskEditorState.onCancel = options.onCancel || null;
    maskEditorState.polygonPoints = [];
    maskEditorState.lastPolygonPoints = [];
    maskEditorState.hasSelection = false;
    maskEditorState.undoHistory = [];
    const snapshotBytes = Math.max(1, width * height * 4);
    maskEditorState.undoLimit = Math.max(
        1,
        Math.min(20, Math.floor((128 * 1024 * 1024) / snapshotBytes))
    );

    [dom.maskEditorCanvas, dom.maskSelectionCanvas, dom.maskGuideCanvas].forEach(canvas => {
        canvas.width = width;
        canvas.height = height;
    });
    dom.maskEditorCanvasStack.style.width = width + "px";
    dom.maskEditorCanvasStack.style.height = height + "px";

    const workingContext = dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    workingContext.clearRect(0, 0, width, height);
    workingContext.drawImage(resultImage, 0, 0, width, height);

    maskEditorState.initialCanvas = document.createElement("canvas");
    maskEditorState.initialCanvas.width = width;
    maskEditorState.initialCanvas.height = height;
    maskEditorState.initialCanvas.getContext("2d").drawImage(resultImage, 0, 0, width, height);

    maskEditorState.originalCanvas = document.createElement("canvas");
    maskEditorState.originalCanvas.width = width;
    maskEditorState.originalCanvas.height = height;
    maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true })
        .drawImage(originalImage, 0, 0, width, height);

    clearMaskSelection();
    refreshMaskPolygonPresetSelect();
    updateMaskUndoButton();
    setMaskEditorTool("brush");
    setMaskEditorAction("erase", true);
    dom.bgMaskEditorModal.style.display = "flex";
    requestAnimationFrame(fitMaskEditorView);
}

function hideBackgroundMaskEditor() {
    maskEditorState.open = false;
    maskEditorState.drawing = false;
    maskEditorState.panning = false;
    maskEditorState.undoHistory = [];
    updateMaskUndoButton();
    dom.bgMaskEditorModal.style.display = "none";
    dom.maskEditorCursor.style.display = "none";
    if (document.fullscreenElement === dom.bgMaskEditorDialog) {
        document.exitFullscreen().catch(() => {});
    }
}

function cancelBackgroundMaskEditor() {
    const callback = maskEditorState.onCancel;
    hideBackgroundMaskEditor();
    if (callback) callback();
}

function completeBackgroundMaskEditor(useInitialResult) {
    const sourceCanvas = useInitialResult
        ? maskEditorState.initialCanvas
        : dom.maskEditorCanvas;
    if (!sourceCanvas) return;

    const resultSrc = sourceCanvas.toDataURL("image/png");
    const callback = maskEditorState.onApply;
    hideBackgroundMaskEditor();
    if (callback) callback(resultSrc);
}

function setMaskEditorTool(tool) {
    const allowed = ["brush", "paint-select", "polygon"];
    maskEditorState.tool = allowed.includes(tool) ? tool : "brush";
    maskEditorState.polygonPoints = [];
    clearMaskGuideCanvas();

    document.querySelectorAll(".mask-tool").forEach(button => {
        button.classList.toggle("active", button.dataset.maskTool === maskEditorState.tool);
    });
    const selectionMode = maskEditorState.tool !== "brush";
    dom.maskSelectionActions.style.display = selectionMode ? "flex" : "none";
    dom.btnMaskPolygonComplete.style.display =
        maskEditorState.tool === "polygon" ? "block" : "none";
    dom.maskPolygonPresetControls.style.display =
        maskEditorState.tool === "polygon" ? "flex" : "none";
    updateMaskEditorStatus();
}

function setMaskEditorAction(action, preserveSelection) {
    maskEditorState.action = action === "restore" ? "restore" : "erase";
    if (!preserveSelection && (maskEditorState.hasSelection || maskEditorState.polygonPoints.length)) {
        clearMaskSelection();
    }

    document.querySelectorAll(".mask-action").forEach(button => {
        button.classList.toggle("active", button.dataset.maskAction === maskEditorState.action);
    });
    dom.maskActionHelp.innerText = maskEditorState.action === "erase"
        ? "남아 있는 배경을 투명하게 지웁니다."
        : "잘못 지워진 부분을 원본 이미지에서 복구합니다.";
    updateMaskEditorStatus();
}

function updateMaskEditorStatus(message) {
    if (message) {
        dom.maskEditorStatus.innerText = message;
        return;
    }
    const toolNames = {
        brush: "직접 붓",
        "paint-select": "칠해서 선택",
        polygon: "다각형 선택"
    };
    dom.maskEditorStatus.innerText =
        `${toolNames[maskEditorState.tool]} · ${maskEditorState.action === "erase" ? "지우기" : "복구"}`;
}

function fitMaskEditorView() {
    if (!maskEditorState.open || !maskEditorState.width || !dom.maskEditorStage.clientWidth) return;
    const padding = 34;
    const stageWidth = Math.max(1, dom.maskEditorStage.clientWidth - padding * 2);
    const stageHeight = Math.max(1, dom.maskEditorStage.clientHeight - padding * 2);
    maskEditorState.fitScale = Math.min(
        stageWidth / maskEditorState.width,
        stageHeight / maskEditorState.height,
        1
    );
    maskEditorState.zoom = 1;
    const scale = maskEditorState.fitScale;
    maskEditorState.panX =
        (dom.maskEditorStage.clientWidth - maskEditorState.width * scale) / 2;
    maskEditorState.panY =
        (dom.maskEditorStage.clientHeight - maskEditorState.height * scale) / 2;
    updateMaskEditorTransform();
}

function updateMaskEditorTransform() {
    const scale = getMaskEditorScale();
    dom.maskEditorCanvasStack.style.transform =
        `translate(${maskEditorState.panX}px, ${maskEditorState.panY}px) scale(${scale})`;
    dom.maskEditorZoomText.innerText = `맞춤 ${Math.round(maskEditorState.zoom * 100)}%`;
    updateMaskEditorCursorSize();
    renderMaskPolygonGuide();
}

function getMaskEditorScale() {
    return maskEditorState.fitScale * maskEditorState.zoom;
}

function handleMaskEditorWheel(event) {
    if (!maskEditorState.open || !event.altKey) return;
    event.preventDefault();

    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const cursorX = event.clientX - stageRect.left;
    const cursorY = event.clientY - stageRect.top;
    const oldScale = getMaskEditorScale();
    const imageX = (cursorX - maskEditorState.panX) / oldScale;
    const imageY = (cursorY - maskEditorState.panY) / oldScale;

    const zoomFactor = Math.exp(-event.deltaY * .0015);
    maskEditorState.zoom = maskClamp(maskEditorState.zoom * zoomFactor, .2, 12);
    const newScale = getMaskEditorScale();
    maskEditorState.panX = cursorX - imageX * newScale;
    maskEditorState.panY = cursorY - imageY * newScale;
    updateMaskEditorTransform();
}

function handleMaskEditorPointerDown(event) {
    if (!maskEditorState.open) return;

    if (event.altKey || event.button === 1) {
        event.preventDefault();
        maskEditorState.panning = true;
        maskEditorState.panStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            panX: maskEditorState.panX,
            panY: maskEditorState.panY
        };
        dom.maskEditorStage.classList.add("panning");
        dom.maskEditorStage.setPointerCapture?.(event.pointerId);
        return;
    }

    const point = getMaskEditorPoint(event);
    if (!point.inside) return;

    if (maskEditorState.tool === "polygon") {
        maskEditorState.polygonPoints.push({ x: point.x, y: point.y });
        renderMaskPolygonGuide();
        updateMaskUndoButton();
        if (event.detail >= 2 && maskEditorState.polygonPoints.length >= 3) {
            finalizeMaskPolygonSelection();
        }
        return;
    }

    maskEditorState.drawing = true;
    maskEditorState.lastPoint = point;
    dom.maskEditorStage.setPointerCapture?.(event.pointerId);
    if (maskEditorState.tool === "brush") {
        pushMaskUndoSnapshot(
            maskEditorState.action === "erase" ? "붓 지우기" : "붓 복구"
        );
    }
    applyMaskStroke(point, point);
}

function handleMaskEditorPointerMove(event) {
    if (!maskEditorState.open) return;
    updateMaskEditorCursor(event);

    if (maskEditorState.panning && maskEditorState.panStart) {
        maskEditorState.panX =
            maskEditorState.panStart.panX + event.clientX - maskEditorState.panStart.clientX;
        maskEditorState.panY =
            maskEditorState.panStart.panY + event.clientY - maskEditorState.panStart.clientY;
        updateMaskEditorTransform();
        return;
    }
    if (!maskEditorState.drawing) return;

    const point = getMaskEditorPoint(event);
    if (!point.inside) return;
    applyMaskStroke(maskEditorState.lastPoint, point);
    maskEditorState.lastPoint = point;
}

function handleMaskEditorPointerUp(event) {
    if (maskEditorState.panning) {
        maskEditorState.panning = false;
        maskEditorState.panStart = null;
        dom.maskEditorStage.classList.remove("panning");
    }
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;
    try {
        dom.maskEditorStage.releasePointerCapture?.(event.pointerId);
    } catch (error) {
        // Pointer may already be released when leaving the editor.
    }
}

function getMaskEditorPoint(event) {
    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const scale = getMaskEditorScale();
    const x = (event.clientX - stageRect.left - maskEditorState.panX) / scale;
    const y = (event.clientY - stageRect.top - maskEditorState.panY) / scale;
    return {
        x: maskClamp(x, 0, Math.max(0, maskEditorState.width - 1)),
        y: maskClamp(y, 0, Math.max(0, maskEditorState.height - 1)),
        inside: x >= 0 && y >= 0 &&
            x < maskEditorState.width && y < maskEditorState.height
    };
}

function applyMaskStroke(fromPoint, toPoint) {
    const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
    const spacing = Math.max(1, maskEditorState.brushSize / 5);
    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let step = 0; step <= steps; step++) {
        const ratio = step / steps;
        const x = fromPoint.x + (toPoint.x - fromPoint.x) * ratio;
        const y = fromPoint.y + (toPoint.y - fromPoint.y) * ratio;
        if (maskEditorState.tool === "brush") {
            applyDirectMaskBrush(x, y);
        } else {
            paintMaskSelection(x, y);
        }
    }
}

function applyDirectMaskBrush(centerX, centerY) {
    const radius = maskEditorState.brushSize / 2;
    const left = Math.max(0, Math.floor(centerX - radius - 1));
    const top = Math.max(0, Math.floor(centerY - radius - 1));
    const right = Math.min(maskEditorState.width, Math.ceil(centerX + radius + 1));
    const bottom = Math.min(maskEditorState.height, Math.ceil(centerY + radius + 1));
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;

    const context = dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    const originalContext =
        maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true });
    const current = context.getImageData(left, top, width, height);
    const original = originalContext.getImageData(left, top, width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const absoluteX = left + x + .5;
            const absoluteY = top + y + .5;
            const dx = absoluteX - centerX;
            const dy = absoluteY - centerY;
            let weight = 1;

            if (maskEditorState.brushType !== "square") {
                const distance = Math.hypot(dx, dy);
                if (distance > radius) continue;
                if (maskEditorState.brushType === "soft") {
                    weight = Math.max(0, 1 - distance / radius);
                    weight = weight * weight * (3 - 2 * weight);
                }
            } else if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
                continue;
            }

            const factor = maskEditorState.strength * weight;
            const index = (y * width + x) * 4;
            if (maskEditorState.action === "erase") {
                current.data[index + 3] =
                    Math.round(current.data[index + 3] * (1 - factor));
            } else {
                current.data[index] = blendMaskValue(current.data[index], original.data[index], factor);
                current.data[index + 1] =
                    blendMaskValue(current.data[index + 1], original.data[index + 1], factor);
                current.data[index + 2] =
                    blendMaskValue(current.data[index + 2], original.data[index + 2], factor);
                current.data[index + 3] =
                    blendMaskValue(current.data[index + 3], original.data[index + 3], factor);
            }
        }
    }
    context.putImageData(current, left, top);
}

function paintMaskSelection(centerX, centerY) {
    const context = dom.maskSelectionCanvas.getContext("2d");
    const radius = maskEditorState.brushSize / 2;
    context.fillStyle = maskEditorState.action === "erase" ? "#ff4364" : "#52f1ba";
    if (maskEditorState.brushType === "square") {
        context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else {
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
    }
    maskEditorState.hasSelection = true;
    updateMaskUndoButton();
}

function finalizeMaskPolygonSelection() {
    if (maskEditorState.polygonPoints.length < 3) {
        updateMaskEditorStatus("다각형은 점을 3개 이상 찍어야 합니다.");
        return;
    }
    const points = maskEditorState.polygonPoints.map(point => ({ x: point.x, y: point.y }));
    paintMaskPolygonSelection(points);
    maskEditorState.lastPolygonPoints = points;
    maskEditorState.polygonPoints = [];
    clearMaskGuideCanvas();
    updateMaskUndoButton();
    updateMaskEditorStatus("다각형 선택 완료 · 선택영역 적용을 누르세요.");
}

function paintMaskPolygonSelection(points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    const context = dom.maskSelectionCanvas.getContext("2d");
    context.fillStyle = maskEditorState.action === "erase" ? "#ff4364" : "#52f1ba";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    maskEditorState.hasSelection = true;
    return true;
}

function readMaskPolygonPresets() {
    try {
        const value = JSON.parse(localStorage.getItem(MASK_POLYGON_PRESETS_STORAGE) || "[]");
        return Array.isArray(value) ? value.filter(preset =>
            preset && typeof preset.id === "string" && Array.isArray(preset.points)
        ) : [];
    } catch (error) {
        console.warn("Polygon preset read failed:", error);
        return [];
    }
}

function writeMaskPolygonPresets(presets) {
    try {
        localStorage.setItem(
            MASK_POLYGON_PRESETS_STORAGE,
            JSON.stringify(presets.slice(0, MASK_POLYGON_PRESET_LIMIT))
        );
        return true;
    } catch (error) {
        console.warn("Polygon preset save failed:", error);
        updateMaskEditorStatus("다각형 영역을 브라우저 저장소에 저장하지 못했습니다.");
        return false;
    }
}

function refreshMaskPolygonPresetSelect(selectedId) {
    if (!dom.maskPolygonPresetSelect) return;
    const presets = readMaskPolygonPresets();
    dom.maskPolygonPresetSelect.innerHTML = "";
    if (!presets.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "저장한 영역 없음";
        dom.maskPolygonPresetSelect.appendChild(option);
    } else {
        presets.forEach(preset => {
            const option = document.createElement("option");
            option.value = preset.id;
            option.textContent = `${preset.name} · ${preset.points.length}점`;
            dom.maskPolygonPresetSelect.appendChild(option);
        });
        dom.maskPolygonPresetSelect.value =
            presets.some(preset => preset.id === selectedId) ? selectedId : presets[0].id;
    }
    const available = presets.length > 0;
    dom.btnLoadMaskPolygon.disabled = !available;
    dom.btnDeleteMaskPolygon.disabled = !available;
}

function saveMaskPolygonPreset() {
    const points = maskEditorState.polygonPoints.length >= 3
        ? maskEditorState.polygonPoints
        : maskEditorState.lastPolygonPoints;
    if (!Array.isArray(points) || points.length < 3) {
        updateMaskEditorStatus("저장할 다각형을 먼저 3점 이상 지정하세요.");
        return;
    }
    const name = dom.maskPolygonPresetName.value.trim();
    if (!name) {
        updateMaskEditorStatus("저장할 다각형 영역의 이름을 입력하세요.");
        dom.maskPolygonPresetName.focus();
        return;
    }

    const presets = readMaskPolygonPresets();
    const existing = presets.find(preset => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preset = {
        id: id,
        name: name,
        updatedAt: Date.now(),
        points: points.map(point => ({
            x: maskClamp(point.x / Math.max(1, maskEditorState.width), 0, 1),
            y: maskClamp(point.y / Math.max(1, maskEditorState.height), 0, 1)
        }))
    };
    const nextPresets = [preset, ...presets.filter(item => item.id !== id)];
    if (!writeMaskPolygonPresets(nextPresets)) return;
    dom.maskPolygonPresetName.value = "";
    refreshMaskPolygonPresetSelect(id);
    updateMaskEditorStatus(`다각형 영역 '${name}' 저장 완료`);
}

function loadSelectedMaskPolygonPreset() {
    const selectedId = dom.maskPolygonPresetSelect.value;
    const preset = readMaskPolygonPresets().find(item => item.id === selectedId);
    if (!preset || preset.points.length < 3) {
        updateMaskEditorStatus("불러올 다각형 영역을 선택하세요.");
        return;
    }
    const points = preset.points.map(point => ({
        x: maskClamp(Number(point.x) * maskEditorState.width, 0, maskEditorState.width - 1),
        y: maskClamp(Number(point.y) * maskEditorState.height, 0, maskEditorState.height - 1)
    }));
    clearMaskSelection();
    paintMaskPolygonSelection(points);
    maskEditorState.lastPolygonPoints = points;
    updateMaskUndoButton();
    updateMaskEditorStatus(`'${preset.name}' 영역 불러옴 · 선택영역 적용을 누르세요.`);
}

function deleteSelectedMaskPolygonPreset() {
    const selectedId = dom.maskPolygonPresetSelect.value;
    if (!selectedId) return;
    const presets = readMaskPolygonPresets();
    const preset = presets.find(item => item.id === selectedId);
    if (!preset) return;
    if (!confirm(`저장한 다각형 영역 '${preset.name}'을 삭제할까요?`)) return;
    if (!writeMaskPolygonPresets(presets.filter(item => item.id !== selectedId))) return;
    refreshMaskPolygonPresetSelect();
    updateMaskEditorStatus(`'${preset.name}' 영역을 삭제했습니다.`);
}

function renderMaskPolygonGuide() {
    clearMaskGuideCanvas();
    if (!maskEditorState.polygonPoints.length) return;

    const context = dom.maskGuideCanvas.getContext("2d");
    const visualScale = Math.max(.001, getMaskEditorScale());
    context.strokeStyle = maskEditorState.action === "erase" ? "#ff5d72" : "#77f5d1";
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 2 / visualScale;
    context.setLineDash([7 / visualScale, 5 / visualScale]);
    context.beginPath();
    context.moveTo(maskEditorState.polygonPoints[0].x, maskEditorState.polygonPoints[0].y);
    maskEditorState.polygonPoints.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.stroke();
    context.setLineDash([]);

    maskEditorState.polygonPoints.forEach(point => {
        context.beginPath();
        context.arc(point.x, point.y, 4 / visualScale, 0, Math.PI * 2);
        context.fill();
    });
}

function clearMaskGuideCanvas() {
    const context = dom.maskGuideCanvas.getContext("2d");
    context.clearRect(0, 0, maskEditorState.width, maskEditorState.height);
}

function clearMaskSelection() {
    if (!dom.maskSelectionCanvas) return;
    dom.maskSelectionCanvas.getContext("2d")
        .clearRect(0, 0, maskEditorState.width, maskEditorState.height);
    maskEditorState.hasSelection = false;
    maskEditorState.polygonPoints = [];
    clearMaskGuideCanvas();
    updateMaskUndoButton();
    updateMaskEditorStatus();
}

function applyMaskSelection() {
    if (maskEditorState.polygonPoints.length >= 3) finalizeMaskPolygonSelection();
    if (!maskEditorState.hasSelection) {
        updateMaskEditorStatus("먼저 칠하거나 다각형으로 영역을 선택하세요.");
        return;
    }

    pushMaskUndoSnapshot(
        maskEditorState.action === "erase" ? "선택영역 지우기" : "선택영역 복구"
    );
    const workingContext =
        dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    const originalContext =
        maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true });
    const selectionContext =
        dom.maskSelectionCanvas.getContext("2d", { willReadFrequently: true });
    const current =
        workingContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);
    const original =
        originalContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);
    const selection =
        selectionContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);

    for (let index = 0; index < current.data.length; index += 4) {
        const selected = selection.data[index + 3] / 255;
        if (selected <= 0) continue;
        const factor = selected * maskEditorState.strength;
        if (maskEditorState.action === "erase") {
            current.data[index + 3] =
                Math.round(current.data[index + 3] * (1 - factor));
        } else {
            current.data[index] = blendMaskValue(current.data[index], original.data[index], factor);
            current.data[index + 1] =
                blendMaskValue(current.data[index + 1], original.data[index + 1], factor);
            current.data[index + 2] =
                blendMaskValue(current.data[index + 2], original.data[index + 2], factor);
            current.data[index + 3] =
                blendMaskValue(current.data[index + 3], original.data[index + 3], factor);
        }
    }

    workingContext.putImageData(current, 0, 0);
    clearMaskSelection();
    updateMaskEditorStatus("선택영역 편집을 적용했습니다.");
}

function resetMaskEditorResult() {
    if (!maskEditorState.initialCanvas) return;
    pushMaskUndoSnapshot("자동 결과 초기화");
    const context = dom.maskEditorCanvas.getContext("2d");
    context.clearRect(0, 0, maskEditorState.width, maskEditorState.height);
    context.drawImage(maskEditorState.initialCanvas, 0, 0);
    clearMaskSelection();
    updateMaskEditorStatus("자동 배경 제거 결과로 초기화했습니다.");
}

function pushMaskUndoSnapshot(label) {
    if (!maskEditorState.open || !maskEditorState.width || !maskEditorState.height) return;
    try {
        const context =
            dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
        const snapshot =
            context.getImageData(0, 0, maskEditorState.width, maskEditorState.height);
        maskEditorState.undoHistory.push({
            imageData: snapshot,
            label: label || "편집"
        });
        while (maskEditorState.undoHistory.length > maskEditorState.undoLimit) {
            maskEditorState.undoHistory.shift();
        }
        updateMaskUndoButton();
    } catch (error) {
        console.warn("Undo snapshot unavailable:", error);
        updateMaskEditorStatus("메모리 부족으로 이 작업의 Undo 기록을 만들지 못했습니다.");
    }
}

function undoMaskEditor() {
    if (!maskEditorState.open) return;
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;

    if (maskEditorState.polygonPoints.length > 0) {
        maskEditorState.polygonPoints.pop();
        renderMaskPolygonGuide();
        updateMaskUndoButton();
        updateMaskEditorStatus("마지막 다각형 점을 취소했습니다.");
        return;
    }

    if (maskEditorState.hasSelection) {
        clearMaskSelection();
        updateMaskEditorStatus("적용 전 선택영역을 취소했습니다.");
        return;
    }

    const snapshot = maskEditorState.undoHistory.pop();
    if (!snapshot) {
        updateMaskEditorStatus("되돌릴 편집 기록이 없습니다.");
        updateMaskUndoButton();
        return;
    }

    const context = dom.maskEditorCanvas.getContext("2d");
    context.putImageData(snapshot.imageData, 0, 0);
    clearMaskSelection();
    updateMaskUndoButton();
    updateMaskEditorStatus(`${snapshot.label} 작업을 되돌렸습니다.`);
}

function updateMaskUndoButton() {
    if (!dom.btnMaskUndo) return;
    const pendingSelection =
        maskEditorState.hasSelection || maskEditorState.polygonPoints.length > 0;
    const count = maskEditorState.undoHistory.length;
    dom.btnMaskUndo.disabled = !maskEditorState.open || (!pendingSelection && count === 0);
    dom.btnMaskUndo.innerHTML =
        `↶ Undo <kbd>Ctrl+Z</kbd>${count > 0 ? ` <span>${count}</span>` : ""}`;
}

function updateMaskEditorCursor(event) {
    if (maskEditorState.panning || event.altKey || maskEditorState.tool === "polygon") {
        dom.maskEditorCursor.style.display = "none";
        return;
    }
    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const point = getMaskEditorPoint(event);
    if (!point.inside) {
        dom.maskEditorCursor.style.display = "none";
        return;
    }
    dom.maskEditorCursor.style.display = "block";
    dom.maskEditorCursor.style.left = event.clientX - stageRect.left + "px";
    dom.maskEditorCursor.style.top = event.clientY - stageRect.top + "px";
    dom.maskEditorCursor.style.borderColor =
        maskEditorState.action === "erase" ? "#ff7187" : "#77f5d1";
    updateMaskEditorCursorSize();
}

function updateMaskEditorCursorSize() {
    if (!dom.maskEditorCursor) return;
    const size = Math.max(3, maskEditorState.brushSize * getMaskEditorScale());
    dom.maskEditorCursor.style.width = size + "px";
    dom.maskEditorCursor.style.height = size + "px";
}

async function toggleMaskEditorFullscreen() {
    try {
        if (document.fullscreenElement === dom.bgMaskEditorDialog) {
            await document.exitFullscreen();
        } else if (dom.bgMaskEditorDialog.requestFullscreen) {
            await dom.bgMaskEditorDialog.requestFullscreen();
        }
    } catch (error) {
        console.warn("Fullscreen unavailable:", error);
    }
}

function blendMaskValue(currentValue, originalValue, factor) {
    return Math.round(currentValue + (originalValue - currentValue) * factor);
}

function maskClamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

document.addEventListener("DOMContentLoaded", initBackgroundMaskEditor);

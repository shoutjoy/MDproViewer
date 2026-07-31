/* =======================================================
   Non-destructive Image Adjustment & Text Layer Editor
   ======================================================= */

const IMAGE_EDITOR_PARAMS = [
    "brightness", "lightBalance", "exposure", "contrast", "highlight", "shadow",
    "saturation", "tint", "temperature", "sharpness", "clarity"
];
const IMAGE_EDITOR_EFFECTS = ["vignette", "grain", "glow", "fade"];
const IMAGE_EDITOR_PRESETS = {
    original: {
        name: "Original",
        values: {}
    },
    warmGlow: {
        name: "Warm Glow",
        values: {
            brightness: .05, lightBalance: .1, exposure: .08, contrast: -.05,
            highlight: -.1, shadow: .15, saturation: .12, tint: .05,
            temperature: .25, sharpness: .05, clarity: -.1,
            glow: .22, vignette: .08
        }
    },
    moodyDark: {
        name: "Moody Dark",
        values: {
            brightness: -.15, lightBalance: -.1, exposure: -.12, contrast: .15,
            highlight: -.2, shadow: -.25, saturation: -.1, tint: -.05,
            temperature: -.1, sharpness: .05, clarity: .15,
            vignette: .36, fade: .05
        }
    },
    tealOrange: {
        name: "Teal & Orange",
        values: {
            brightness: .02, lightBalance: .05, exposure: .03, contrast: .12,
            highlight: -.05, shadow: .1, saturation: .2, tint: -.1,
            temperature: .15, sharpness: .1, clarity: .1,
            vignette: .14
        }
    },
    pastelSoft: {
        name: "Pastel Soft",
        values: {
            brightness: .12, lightBalance: .05, exposure: .1, contrast: -.15,
            highlight: .1, shadow: .05, saturation: -.1, tint: .05,
            temperature: .05, sharpness: 0, clarity: -.15,
            glow: .18, fade: .16
        }
    },
    vintageFilm: {
        name: "Vintage Film",
        values: {
            brightness: -.05, lightBalance: -.05, exposure: -.03, contrast: -.1,
            highlight: -.15, shadow: .1, saturation: -.2, tint: .1,
            temperature: -.05, sharpness: 0, clarity: -.05,
            grain: .28, vignette: .22, fade: .2
        }
    },
    blackWhite: {
        name: "Black & White Fine",
        values: {
            brightness: .05, exposure: .02, contrast: .2, highlight: -.1,
            shadow: -.1, saturation: -1, sharpness: .1, clarity: .2,
            vignette: .18, grain: .08
        }
    }
};

var imageEditorState = {
    imageIndex: -1,
    sourceImage: null,
    sourceSrc: "",
    config: null,
    selectedLayerId: null,
    bypass: false,
    previewScale: 1,
    renderRequested: false,
    textBounds: new Map(),
    draggingLayer: false,
    textTransformMode: "",
    transformStart: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    processing: false
};

function createDefaultImageEditorConfig() {
    const adjustments = {};
    const effects = {};
    IMAGE_EDITOR_PARAMS.forEach(key => adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => effects[key] = 0);
    return {
        version: 1,
        preset: "original",
        adjustments: adjustments,
        effects: effects,
        textLayers: []
    };
}

function cloneImageEditorConfig(config) {
    const base = createDefaultImageEditorConfig();
    if (!config || typeof config !== "object") return base;
    IMAGE_EDITOR_PARAMS.forEach(key => {
        base.adjustments[key] = editorClamp(Number(config.adjustments?.[key]) || 0, -1, 1);
    });
    base.adjustments.sharpness = editorClamp(
        Number(config.adjustments?.sharpness) || 0, 0, 1
    );
    IMAGE_EDITOR_EFFECTS.forEach(key => {
        base.effects[key] = editorClamp(Number(config.effects?.[key]) || 0, 0, 1);
    });
    base.preset = typeof config.preset === "string" ? config.preset : "custom";
    base.textLayers = Array.isArray(config.textLayers)
        ? config.textLayers.map(normalizeTextLayer)
        : [];
    return base;
}

function normalizeTextLayer(layer) {
    return {
        id: String(layer?.id || createTextLayerId()),
        name: String(layer?.name || "Text"),
        text: String(layer?.text ?? "새 텍스트"),
        visible: layer?.visible !== false,
        x: Number(layer?.x) || 0,
        y: Number(layer?.y) || 0,
        fontSize: editorClamp(Number(layer?.fontSize) || 64, 8, 500),
        fontFamily: String(layer?.fontFamily || "Pretendard, sans-serif"),
        fontWeight: String(layer?.fontWeight || "700"),
        color: validEditorHex(layer?.color, "#ffffff"),
        opacity: editorClamp(Number(layer?.opacity ?? 1), 0, 1),
        align: ["left", "center", "right"].includes(layer?.align) ? layer.align : "left",
        rotation: editorClamp(Number(layer?.rotation) || 0, -180, 180),
        scaleX: editorClamp(Number(layer?.scaleX) || 1, .1, 10),
        scaleY: editorClamp(Number(layer?.scaleY) || 1, .1, 10),
        shadow: {
            enabled: layer?.shadow?.enabled !== false,
            blur: editorClamp(Number(layer?.shadow?.blur) || 0, 0, 100),
            distance: editorClamp(Number(layer?.shadow?.distance) || 0, 0, 200),
            angle: editorClamp(Number(layer?.shadow?.angle) || 0, 0, 360),
            color: validEditorHex(layer?.shadow?.color, "#000000"),
            opacity: editorClamp(Number(layer?.shadow?.opacity ?? .65), 0, 1)
        }
    };
}

function initImageEditorFeature() {
    if (!dom.imageEditorModal) return;

    document.querySelectorAll(".editor-preset").forEach(button => {
        button.onclick = () => applyImageEditorPreset(button.dataset.editorPreset);
    });
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const input = label.querySelector("input");
        input.oninput = () => {
            imageEditorState.config.adjustments[label.dataset.param] = Number(input.value) / 100;
            setImageEditorPreset("custom", "Custom");
            label.querySelector("b").innerText = formatEditorControlValue(input.value);
            requestImageEditorRender();
        };
    });
    dom.imageEffectControls.querySelectorAll("label[data-effect]").forEach(label => {
        const input = label.querySelector("input");
        input.oninput = () => {
            imageEditorState.config.effects[label.dataset.effect] = Number(input.value) / 100;
            setImageEditorPreset("custom", "Custom");
            label.querySelector("b").innerText = input.value;
            requestImageEditorRender();
        };
    });

    dom.btnImageEditorBypass.onclick = toggleImageEditorBypass;
    dom.btnImageEditorReset.onclick = resetEntireImageEditor;
    dom.btnResetImageAdjustments.onclick = resetImageEditorAdjustments;
    dom.btnAddTextLayer.onclick = addImageEditorTextLayer;
    dom.btnMoveLayerUp.onclick = () => moveSelectedTextLayer(1);
    dom.btnMoveLayerDown.onclick = () => moveSelectedTextLayer(-1);
    dom.btnDuplicateTextLayer.onclick = duplicateSelectedTextLayer;
    dom.btnDeleteTextLayer.onclick = deleteSelectedTextLayer;
    dom.btnImageEditorClose.onclick = closeImageEditor;
    dom.btnImageEditorCancel.onclick = closeImageEditor;
    dom.btnImageEditorSave.onclick = openImageEditorSaveChoice;
    dom.btnImageEditorSaveBack.onclick = closeImageEditorSaveChoice;
    dom.btnImageEditorReplace.onclick = () => saveImageEditorResult("replace");
    dom.btnImageEditorNew.onclick = () => saveImageEditorResult("new");

    bindTextLayerInspector();
    dom.imageEditorCanvas.addEventListener("pointerdown", beginTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointermove", continueTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointerup", endTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointercancel", endTextLayerDrag);
    window.addEventListener("resize", () => {
        if (imageEditorState.imageIndex >= 0) sizeImageEditorCanvas();
    });
    dom.imageEditorModal.addEventListener("mousedown", event => {
        if (event.target === dom.imageEditorModal && !imageEditorState.processing) {
            closeImageEditor();
        }
    });
    document.addEventListener("keydown", event => {
        if (dom.imageEditorModal.style.display === "none") return;
        if (event.key === "Escape" && !imageEditorState.processing) {
            if (dom.imageEditorSaveChoice.style.display !== "none") closeImageEditorSaveChoice();
            else closeImageEditor();
        }
    });
}

async function openImageEditor(index) {
    const item = images[index];
    if (!item) return;
    const sourceSrc = item.imageEditSourceSrc || item.src;
    try {
        const sourceImage = await loadUpscaleImage(sourceSrc);
        imageEditorState.imageIndex = index;
        imageEditorState.sourceImage = sourceImage;
        imageEditorState.sourceSrc = sourceSrc;
        imageEditorState.config = cloneImageEditorConfig(item.imageEditConfig);
        imageEditorState.selectedLayerId =
            imageEditorState.config.textLayers.at(-1)?.id || null;
        imageEditorState.bypass = false;
        imageEditorState.processing = false;
        updateImageEditorBypassButton();
        closeImageEditorSaveChoice();
        dom.imageEditorModal.style.display = "flex";
        syncImageEditorControls();
        renderImageEditorLayerList();
        requestAnimationFrame(sizeImageEditorCanvas);
    } catch (error) {
        console.error("Image editor open failed:", error);
        alert("편집할 이미지를 불러올 수 없습니다: " + error.message);
    }
}

function closeImageEditor() {
    if (imageEditorState.processing) return;
    dom.imageEditorModal.style.display = "none";
    closeImageEditorSaveChoice();
    imageEditorState.imageIndex = -1;
    imageEditorState.sourceImage = null;
    imageEditorState.sourceSrc = "";
    imageEditorState.config = null;
    imageEditorState.selectedLayerId = null;
    imageEditorState.textBounds.clear();
}

function sizeImageEditorCanvas() {
    if (!imageEditorState.sourceImage || dom.imageEditorModal.style.display === "none") return;
    const stageRect = dom.imageEditorStage.getBoundingClientRect();
    const sourceWidth = imageEditorState.sourceImage.naturalWidth;
    const sourceHeight = imageEditorState.sourceImage.naturalHeight;
    const availableWidth = Math.max(160, stageRect.width - 48);
    const availableHeight = Math.max(160, stageRect.height - 64);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1);
    imageEditorState.previewScale = scale;
    dom.imageEditorCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
    dom.imageEditorCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
    requestImageEditorRender();
}

function requestImageEditorRender() {
    if (imageEditorState.renderRequested || !imageEditorState.sourceImage) return;
    imageEditorState.renderRequested = true;
    requestAnimationFrame(() => {
        imageEditorState.renderRequested = false;
        renderImageEditorPreview();
    });
}

function renderImageEditorPreview() {
    if (!imageEditorState.sourceImage || !imageEditorState.config) return;
    renderImageEditorCanvas(
        dom.imageEditorCanvas,
        imageEditorState.sourceImage,
        imageEditorState.config,
        imageEditorState.bypass,
        imageEditorState.previewScale,
        true
    );
    updateImageEditorStatus();
}

function renderImageEditorCanvas(canvas, image, config, bypass, scale, showSelection) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();

    if (bypass) {
        imageEditorState.textBounds.clear();
        return canvas;
    }
    applyImageEditorAdjustments(canvas, config.adjustments);
    applyImageEditorAtmosphere(canvas, config.effects);
    drawImageEditorTextLayers(canvas, config.textLayers, scale, showSelection);
    return canvas;
}

function applyImageEditorAdjustments(canvas, params) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const exposureFactor = Math.pow(2, params.exposure);
    const contrastFactor = Math.max(.05, 1 + params.contrast * 1.35);
    const clarityFactor = Math.max(.1, 1 + params.clarity * .65);
    const gamma = Math.max(.45, 1 - params.lightBalance * .32);

    for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue;
        let red = data[index];
        let green = data[index + 1];
        let blue = data[index + 2];

        red = Math.pow(editorClamp(red / 255, 0, 1), gamma) * 255;
        green = Math.pow(editorClamp(green / 255, 0, 1), gamma) * 255;
        blue = Math.pow(editorClamp(blue / 255, 0, 1), gamma) * 255;
        const brightnessOffset = params.brightness * 85;
        red = red * exposureFactor + brightnessOffset;
        green = green * exposureFactor + brightnessOffset;
        blue = blue * exposureFactor + brightnessOffset;
        red = (red - 128) * contrastFactor + 128;
        green = (green - 128) * contrastFactor + 128;
        blue = (blue - 128) * contrastFactor + 128;

        let luminance = red * .2126 + green * .7152 + blue * .0722;
        const highlightMask = editorSmoothStep(110, 245, luminance);
        const shadowMask = 1 - editorSmoothStep(10, 145, luminance);
        const tonalOffset =
            params.highlight * 75 * highlightMask + params.shadow * 75 * shadowMask;
        red += tonalOffset;
        green += tonalOffset;
        blue += tonalOffset;

        const gray = red * .299 + green * .587 + blue * .114;
        const saturationFactor = Math.max(0, 1 + params.saturation);
        red = gray + (red - gray) * saturationFactor;
        green = gray + (green - gray) * saturationFactor;
        blue = gray + (blue - gray) * saturationFactor;

        red += params.temperature * 54 + params.tint * 22;
        green -= params.tint * 38;
        blue -= params.temperature * 54 - params.tint * 22;
        luminance = red * .2126 + green * .7152 + blue * .0722;
        red = luminance + (red - luminance) * clarityFactor;
        green = luminance + (green - luminance) * clarityFactor;
        blue = luminance + (blue - luminance) * clarityFactor;

        data[index] = editorClamp(red, 0, 255);
        data[index + 1] = editorClamp(green, 0, 255);
        data[index + 2] = editorClamp(blue, 0, 255);
    }
    context.putImageData(imageData, 0, 0);
    if (params.sharpness > 0) applySharpen(canvas, params.sharpness * .65);
}

function applyImageEditorAtmosphere(canvas, effects) {
    const context = canvas.getContext("2d");
    if (effects.glow > 0) {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext("2d").drawImage(canvas, 0, 0);
        context.save();
        context.globalAlpha = effects.glow * .38;
        context.globalCompositeOperation = "source-atop";
        context.filter = `blur(${Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * .012))}px)`;
        context.drawImage(copy, 0, 0);
        context.restore();
    }
    if (effects.fade > 0) {
        context.save();
        context.globalAlpha = effects.fade * .34;
        context.fillStyle = "#d6a77b";
        context.globalCompositeOperation = "source-atop";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }
    if (effects.vignette > 0) {
        const radius = Math.max(canvas.width, canvas.height) * .72;
        const gradient = context.createRadialGradient(
            canvas.width / 2, canvas.height / 2, radius * .18,
            canvas.width / 2, canvas.height / 2, radius
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${Math.min(.85, effects.vignette * .82)})`);
        context.save();
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }
    if (effects.grain > 0) {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const amount = effects.grain * 34;
        let seed = 8121;
        for (let index = 0; index < data.length; index += 4) {
            seed = (seed * 16807) % 2147483647;
            const noise = (seed / 2147483647 - .5) * amount;
            data[index] = editorClamp(data[index] + noise, 0, 255);
            data[index + 1] = editorClamp(data[index + 1] + noise, 0, 255);
            data[index + 2] = editorClamp(data[index + 2] + noise, 0, 255);
        }
        context.putImageData(imageData, 0, 0);
    }
}

function drawImageEditorTextLayers(canvas, layers, scale, showSelection) {
    const context = canvas.getContext("2d");
    imageEditorState.textBounds.clear();
    layers.forEach(layer => {
        if (!layer.visible) return;
        const size = layer.fontSize * scale;
        const x = layer.x * scale;
        const y = layer.y * scale;
        const lineHeight = size * 1.2;
        const lines = String(layer.text).split(/\r?\n/);
        context.save();
        context.font = `${layer.fontWeight} ${size}px ${layer.fontFamily}`;
        context.textBaseline = "top";
        context.textAlign = layer.align;
        context.globalAlpha = layer.opacity;
        context.fillStyle = layer.color;
        const widths = lines.map(line => context.measureText(line || " ").width);
        const width = Math.max(...widths, size * .25);
        const height = lines.length * lineHeight;
        let left = x;
        if (layer.align === "center") left -= width / 2;
        else if (layer.align === "right") left -= width;
        const centerX = left + width / 2;
        const centerY = y + height / 2;
        context.translate(centerX, centerY);
        context.rotate(layer.rotation * Math.PI / 180);
        context.scale(layer.scaleX, layer.scaleY);
        if (layer.shadow.enabled) {
            const radians = layer.shadow.angle * Math.PI / 180;
            context.shadowOffsetX = Math.cos(radians) * layer.shadow.distance * scale;
            context.shadowOffsetY = Math.sin(radians) * layer.shadow.distance * scale;
            context.shadowBlur = layer.shadow.blur * scale;
            context.shadowColor = editorHexToRgba(layer.shadow.color, layer.shadow.opacity);
        }
        lines.forEach((line, lineIndex) => {
            context.fillText(line, x - centerX, y + lineIndex * lineHeight - centerY);
        });
        context.restore();

        const bounds = createTextTransformBounds(
            centerX / scale,
            centerY / scale,
            width / scale,
            height / scale,
            layer.scaleX,
            layer.scaleY,
            layer.rotation
        );
        imageEditorState.textBounds.set(layer.id, bounds);
        if (showSelection && layer.id === imageEditorState.selectedLayerId) {
            drawTextTransformSelection(context, bounds, scale);
        }
    });
}

function createTextTransformBounds(centerX, centerY, width, height, scaleX, scaleY, rotation) {
    const radians = rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const halfWidth = width * scaleX / 2;
    const halfHeight = height * scaleY / 2;
    const transform = (dx, dy) => ({
        x: centerX + dx * cosine - dy * sine,
        y: centerY + dx * sine + dy * cosine
    });
    const corners = [
        transform(-halfWidth, -halfHeight),
        transform(halfWidth, -halfHeight),
        transform(halfWidth, halfHeight),
        transform(-halfWidth, halfHeight)
    ];
    const handleGap = 30 / Math.max(.1, imageEditorState.previewScale);
    return {
        centerX,
        centerY,
        width,
        height,
        halfWidth,
        halfHeight,
        rotation,
        corners,
        handles: {
            scaleX: transform(halfWidth, 0),
            scaleY: transform(0, halfHeight),
            uniform: transform(halfWidth, halfHeight),
            rotate: transform(0, -halfHeight - handleGap)
        }
    };
}

function drawTextTransformSelection(context, bounds, scale) {
    const points = bounds.corners.map(point => ({
        x: point.x * scale,
        y: point.y * scale
    }));
    const handles = Object.fromEntries(
        Object.entries(bounds.handles).map(([key, point]) => [
            key,
            { x: point.x * scale, y: point.y * scale }
        ])
    );
    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = "#7fddff";
    context.fillStyle = "#101722";
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    context.lineTo(handles.rotate.x, handles.rotate.y);
    context.stroke();
    Object.entries(handles).forEach(([type, point]) => {
        context.beginPath();
        context.arc(point.x, point.y, type === "rotate" ? 7 : 6, 0, Math.PI * 2);
        context.fillStyle = type === "rotate" ? "#a78bfa" : "#101722";
        context.fill();
        context.strokeStyle = type === "rotate" ? "#ffffff" : "#7fddff";
        context.stroke();
    });
    context.restore();
}

function applyImageEditorPreset(key) {
    const preset = IMAGE_EDITOR_PRESETS[key];
    if (!preset || !imageEditorState.config) return;
    IMAGE_EDITOR_PARAMS.forEach(name => {
        imageEditorState.config.adjustments[name] = Number(preset.values[name]) || 0;
    });
    IMAGE_EDITOR_EFFECTS.forEach(name => {
        imageEditorState.config.effects[name] = Number(preset.values[name]) || 0;
    });
    setImageEditorPreset(key, preset.name);
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function setImageEditorPreset(key, displayName) {
    imageEditorState.config.preset = key;
    dom.imageEditorPresetName.innerText = displayName;
    document.querySelectorAll(".editor-preset").forEach(button => {
        button.classList.toggle("active", button.dataset.editorPreset === key);
    });
}

function syncImageEditorControls() {
    const preset = IMAGE_EDITOR_PRESETS[imageEditorState.config.preset];
    setImageEditorPreset(
        imageEditorState.config.preset,
        preset?.name || (imageEditorState.config.preset === "original" ? "Original" : "Custom")
    );
    syncImageAdjustmentControls();
    syncTextLayerInspector();
}

function syncImageAdjustmentControls() {
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const value = Math.round(imageEditorState.config.adjustments[label.dataset.param] * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("b").innerText = formatEditorControlValue(value);
    });
    dom.imageEffectControls.querySelectorAll("label[data-effect]").forEach(label => {
        const value = Math.round(imageEditorState.config.effects[label.dataset.effect] * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("b").innerText = value;
    });
}

function resetImageEditorAdjustments() {
    IMAGE_EDITOR_PARAMS.forEach(key => imageEditorState.config.adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => imageEditorState.config.effects[key] = 0);
    setImageEditorPreset("original", "Original");
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function resetEntireImageEditor() {
    if (!confirm("모든 보정과 텍스트 레이어를 초기화할까요?")) return;
    imageEditorState.config = createDefaultImageEditorConfig();
    imageEditorState.selectedLayerId = null;
    imageEditorState.bypass = false;
    updateImageEditorBypassButton();
    syncImageEditorControls();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function toggleImageEditorBypass() {
    imageEditorState.bypass = !imageEditorState.bypass;
    updateImageEditorBypassButton();
    requestImageEditorRender();
}

function updateImageEditorBypassButton() {
    dom.btnImageEditorBypass.classList.toggle("active", imageEditorState.bypass);
    dom.btnImageEditorBypass.setAttribute("aria-pressed", String(imageEditorState.bypass));
    dom.btnImageEditorBypass.innerText = imageEditorState.bypass
        ? "◉ Bypass ON · 원본"
        : "◉ Bypass · 원본 보기";
}

function addImageEditorTextLayer() {
    const image = imageEditorState.sourceImage;
    const count = imageEditorState.config.textLayers.length + 1;
    const layer = normalizeTextLayer({
        id: createTextLayerId(),
        name: `Text ${count}`,
        text: count === 1 ? "새 텍스트" : `새 텍스트 ${count}`,
        x: image.naturalWidth / 2,
        y: image.naturalHeight / 2,
        align: "center",
        fontSize: Math.max(24, Math.round(Math.min(image.naturalWidth, image.naturalHeight) * .065)),
        shadow: { enabled: true, blur: 10, distance: 6, angle: 45, color: "#000000", opacity: .65 }
    });
    imageEditorState.config.textLayers.push(layer);
    imageEditorState.selectedLayerId = layer.id;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
    dom.editorTextContent.focus();
    dom.editorTextContent.select();
}

function renderImageEditorLayerList() {
    dom.imageEditorLayerList.innerHTML = "";
    const base = document.createElement("div");
    base.className = "editor-layer-item base-layer";
    base.innerHTML = "<span>▣</span><div><b>Image</b><small>보정 · 필터 베이스</small></div><em>잠금</em>";
    dom.imageEditorLayerList.appendChild(base);

    [...imageEditorState.config.textLayers].reverse().forEach(layer => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "editor-layer-item text-layer-item";
        item.classList.toggle("active", layer.id === imageEditorState.selectedLayerId);
        const visibility = document.createElement("span");
        visibility.className = "layer-visibility";
        visibility.innerText = layer.visible ? "◉" : "○";
        visibility.title = layer.visible ? "레이어 숨기기" : "레이어 보이기";
        visibility.onclick = event => {
            event.stopPropagation();
            layer.visible = !layer.visible;
            renderImageEditorLayerList();
            requestImageEditorRender();
        };
        const details = document.createElement("div");
        const title = document.createElement("b");
        title.innerText = layer.name;
        const preview = document.createElement("small");
        preview.innerText = layer.text.replace(/\s+/g, " ").slice(0, 28) || "빈 텍스트";
        details.append(title, preview);
        const type = document.createElement("em");
        type.innerText = "T";
        item.append(visibility, details, type);
        item.onclick = () => selectImageEditorTextLayer(layer.id);
        dom.imageEditorLayerList.appendChild(item);
    });
    updateTextLayerActionState();
}

function selectImageEditorTextLayer(id) {
    imageEditorState.selectedLayerId = id;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function getSelectedTextLayer() {
    return imageEditorState.config?.textLayers.find(
        layer => layer.id === imageEditorState.selectedLayerId
    ) || null;
}

function moveSelectedTextLayer(direction) {
    const layers = imageEditorState.config.textLayers;
    const index = layers.findIndex(layer => layer.id === imageEditorState.selectedLayerId);
    const next = editorClamp(index + direction, 0, layers.length - 1);
    if (index < 0 || index === next) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function duplicateSelectedTextLayer() {
    const selected = getSelectedTextLayer();
    if (!selected) return;
    const clone = normalizeTextLayer(JSON.parse(JSON.stringify(selected)));
    clone.id = createTextLayerId();
    clone.name = selected.name + " Copy";
    clone.x += 20;
    clone.y += 20;
    const index = imageEditorState.config.textLayers.indexOf(selected);
    imageEditorState.config.textLayers.splice(index + 1, 0, clone);
    imageEditorState.selectedLayerId = clone.id;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function deleteSelectedTextLayer() {
    const selected = getSelectedTextLayer();
    if (!selected) return;
    const layers = imageEditorState.config.textLayers;
    const index = layers.indexOf(selected);
    layers.splice(index, 1);
    imageEditorState.selectedLayerId = layers[Math.min(index, layers.length - 1)]?.id || null;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function updateTextLayerActionState() {
    const selected = getSelectedTextLayer();
    const disabled = !selected;
    dom.btnMoveLayerUp.disabled = disabled;
    dom.btnMoveLayerDown.disabled = disabled;
    dom.btnDuplicateTextLayer.disabled = disabled;
    dom.btnDeleteTextLayer.disabled = disabled;
    dom.textLayerInspector.style.display = selected ? "flex" : "none";
    dom.textLayerEmpty.style.display = selected ? "none" : "block";
}

function bindTextLayerInspector() {
    const bindings = [
        [dom.editorTextContent, "text", value => value],
        [dom.editorTextFont, "fontFamily", value => value],
        [dom.editorTextSize, "fontSize", value => editorClamp(Number(value), 8, 500)],
        [dom.editorTextColor, "color", value => value],
        [dom.editorTextOpacity, "opacity", value => editorClamp(Number(value) / 100, 0, 1)],
        [dom.editorTextX, "x", value => Number(value) || 0],
        [dom.editorTextY, "y", value => Number(value) || 0],
        [dom.editorTextWeight, "fontWeight", value => value],
        [dom.editorTextAlign, "align", value => value],
        [dom.editorTextRotation, "rotation", value =>
            editorClamp(Number(value) || 0, -180, 180)],
        [dom.editorTextScaleX, "scaleX", value =>
            editorClamp((Number(value) || 100) / 100, .1, 10)],
        [dom.editorTextScaleY, "scaleY", value =>
            editorClamp((Number(value) || 100) / 100, .1, 10)]
    ];
    bindings.forEach(([element, key, parse]) => {
        element.oninput = () => {
            const layer = getSelectedTextLayer();
            if (!layer) return;
            layer[key] = parse(element.value);
            if (key === "text") {
                layer.name = element.value.replace(/\s+/g, " ").trim().slice(0, 18) || "Text";
                renderImageEditorLayerList();
            }
            requestImageEditorRender();
        };
    });
    dom.editorTextShadowEnabled.onchange = updateSelectedTextLayerShadow;
    [
        dom.editorTextShadowBlur, dom.editorTextShadowDistance, dom.editorTextShadowAngle,
        dom.editorTextShadowColor, dom.editorTextShadowOpacity
    ].forEach(element => element.oninput = updateSelectedTextLayerShadow);
}

function updateSelectedTextLayerShadow() {
    const layer = getSelectedTextLayer();
    if (!layer) return;
    layer.shadow.enabled = dom.editorTextShadowEnabled.checked;
    layer.shadow.blur = editorClamp(Number(dom.editorTextShadowBlur.value) || 0, 0, 100);
    layer.shadow.distance =
        editorClamp(Number(dom.editorTextShadowDistance.value) || 0, 0, 200);
    layer.shadow.angle = editorClamp(Number(dom.editorTextShadowAngle.value) || 0, 0, 360);
    layer.shadow.color = dom.editorTextShadowColor.value;
    layer.shadow.opacity =
        editorClamp(Number(dom.editorTextShadowOpacity.value) / 100, 0, 1);
    requestImageEditorRender();
}

function syncTextLayerInspector() {
    const layer = getSelectedTextLayer();
    updateTextLayerActionState();
    if (!layer) return;
    dom.editorTextContent.value = layer.text;
    setEditorSelectValue(dom.editorTextFont, layer.fontFamily);
    dom.editorTextSize.value = Math.round(layer.fontSize);
    dom.editorTextColor.value = layer.color;
    dom.editorTextOpacity.value = Math.round(layer.opacity * 100);
    dom.editorTextX.value = Math.round(layer.x);
    dom.editorTextY.value = Math.round(layer.y);
    setEditorSelectValue(dom.editorTextWeight, layer.fontWeight);
    setEditorSelectValue(dom.editorTextAlign, layer.align);
    dom.editorTextRotation.value = Math.round(layer.rotation);
    dom.editorTextScaleX.value = Math.round(layer.scaleX * 100);
    dom.editorTextScaleY.value = Math.round(layer.scaleY * 100);
    dom.editorTextShadowEnabled.checked = layer.shadow.enabled;
    dom.editorTextShadowBlur.value = Math.round(layer.shadow.blur);
    dom.editorTextShadowDistance.value = Math.round(layer.shadow.distance);
    dom.editorTextShadowAngle.value = Math.round(layer.shadow.angle);
    dom.editorTextShadowColor.value = layer.shadow.color;
    dom.editorTextShadowOpacity.value = Math.round(layer.shadow.opacity * 100);
}

function beginTextLayerDrag(event) {
    if (imageEditorState.bypass) return;
    const point = getImageEditorSourcePoint(event);
    const layers = [...imageEditorState.config.textLayers].reverse();
    const hit = layers.find(layer => {
        if (!layer.visible) return false;
        const bounds = imageEditorState.textBounds.get(layer.id);
        return bounds && point.x >= bounds.left - 8 && point.x <= bounds.right + 8 &&
            point.y >= bounds.top - 8 && point.y <= bounds.bottom + 8;
    });
    if (!hit) return;
    selectImageEditorTextLayer(hit.id);
    imageEditorState.draggingLayer = true;
    imageEditorState.dragOffsetX = point.x - hit.x;
    imageEditorState.dragOffsetY = point.y - hit.y;
    dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
    dom.imageEditorCanvas.classList.add("dragging-text");
}

function continueTextLayerDrag(event) {
    if (!imageEditorState.draggingLayer) return;
    const layer = getSelectedTextLayer();
    if (!layer) return;
    const point = getImageEditorSourcePoint(event);
    layer.x = editorClamp(
        point.x - imageEditorState.dragOffsetX, 0, imageEditorState.sourceImage.naturalWidth
    );
    layer.y = editorClamp(
        point.y - imageEditorState.dragOffsetY, 0, imageEditorState.sourceImage.naturalHeight
    );
    dom.editorTextX.value = Math.round(layer.x);
    dom.editorTextY.value = Math.round(layer.y);
    requestImageEditorRender();
}

function endTextLayerDrag(event) {
    imageEditorState.draggingLayer = false;
    dom.imageEditorCanvas.classList.remove("dragging-text");
    try {
        dom.imageEditorCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {
        // Pointer may already have been released.
    }
}

function getImageEditorSourcePoint(event) {
    const rect = dom.imageEditorCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) / Math.max(.0001, imageEditorState.previewScale),
        y: (event.clientY - rect.top) / Math.max(.0001, imageEditorState.previewScale)
    };
}

function openImageEditorSaveChoice() {
    dom.imageEditorSaveChoice.style.display = "flex";
    dom.btnImageEditorNew.focus();
}

function closeImageEditorSaveChoice() {
    dom.imageEditorSaveChoice.style.display = "none";
}

async function saveImageEditorResult(saveMode) {
    const sourceIndex = imageEditorState.imageIndex;
    const sourceItem = images[sourceIndex];
    if (!sourceItem || !imageEditorState.sourceImage || imageEditorState.processing) return;
    const width = imageEditorState.sourceImage.naturalWidth;
    const height = imageEditorState.sourceImage.naturalHeight;
    if (width * height > 64000000) {
        alert("편집 결과가 너무 큽니다. 6,400만 픽셀 이하 이미지에서 저장하세요.");
        return;
    }

    imageEditorState.processing = true;
    dom.btnImageEditorReplace.disabled = true;
    dom.btnImageEditorNew.disabled = true;
    try {
        showLoading("이미지 편집 결과 생성 중...");
        updateLoading(8);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        renderImageEditorCanvas(
            canvas,
            imageEditorState.sourceImage,
            imageEditorState.config,
            false,
            1,
            false
        );
        updateLoading(76);
        const resultSrc = canvas.toDataURL("image/png");
        const config = cloneImageEditorConfig(imageEditorState.config);
        let resultIndex = sourceIndex;

        if (saveMode === "replace") {
            sourceItem.src = resultSrc;
            sourceItem.size = estimateDataUrlBytes(resultSrc);
            sourceItem.date = Date.now();
            sourceItem.mimeType = "image/png";
            sourceItem.imageEditSourceSrc = imageEditorState.sourceSrc;
            sourceItem.imageEditConfig = config;
            sourceItem.imageEditInfo = {
                preset: config.preset,
                textLayerCount: config.textLayers.length,
                width: width,
                height: height
            };
            applyDerivedImageMetadata(sourceItem, sourceItem, width, height, "Image Edit");
        } else {
            const sourcePath = sourceItem.path;
            const count = images.filter(item => item.imageEditParentPath === sourcePath).length + 1;
            const editedItem = {
                src: resultSrc,
                path: `${sourcePath}.edit_${count}`,
                group: "image-edited",
                date: Date.now(),
                size: estimateDataUrlBytes(resultSrc),
                mimeType: "image/png",
                isFav: false,
                imageEditParentPath: sourcePath,
                imageEditSourceSrc: imageEditorState.sourceSrc,
                imageEditConfig: config,
                imageEditInfo: {
                    preset: config.preset,
                    textLayerCount: config.textLayers.length,
                    width: width,
                    height: height
                }
            };
            applyDerivedImageMetadata(editedItem, sourceItem, width, height, "Image Edit");
            images.splice(sourceIndex + 1, 0, editedItem);
            resultIndex = sourceIndex + 1;
        }

        imageEditorState.processing = false;
        closeImageEditor();
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        saveCurrentImagesToDB();
        updateLoading(100);
        showImage(resultIndex);
    } catch (error) {
        console.error("Image editor save failed:", error);
        alert("이미지 편집 결과 저장 중 오류가 발생했습니다: " + error.message);
    } finally {
        hideLoading();
        imageEditorState.processing = false;
        dom.btnImageEditorReplace.disabled = false;
        dom.btnImageEditorNew.disabled = false;
    }
}

function updateImageEditorStatus() {
    if (imageEditorState.bypass) {
        dom.imageEditorStatus.innerText = "Bypass ON · 적용 전 원본";
        return;
    }
    const config = imageEditorState.config;
    const adjusted = IMAGE_EDITOR_PARAMS.some(key => Math.abs(config.adjustments[key]) > .0001) ||
        IMAGE_EDITOR_EFFECTS.some(key => config.effects[key] > .0001);
    const preset = IMAGE_EDITOR_PRESETS[config.preset]?.name ||
        (config.preset === "original" ? "Original" : "Custom");
    dom.imageEditorStatus.innerText =
        `${preset} · ${adjusted ? "보정 적용" : "보정 없음"} · Text ${config.textLayers.length}개`;
}

function createTextLayerId() {
    return `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatEditorControlValue(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
}

function setEditorSelectValue(select, value) {
    if ([...select.options].some(option => option.value === value)) select.value = value;
    else select.selectedIndex = 0;
}

function validEditorHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function editorHexToRgba(hex, alpha) {
    const normalized = validEditorHex(hex, "#000000").slice(1);
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${editorClamp(alpha, 0, 1)})`;
}

function editorSmoothStep(minimum, maximum, value) {
    const ratio = editorClamp((value - minimum) / (maximum - minimum), 0, 1);
    return ratio * ratio * (3 - 2 * ratio);
}

function editorClamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

document.addEventListener("DOMContentLoaded", initImageEditorFeature);

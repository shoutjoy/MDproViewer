(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NoteCoverRenderer = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var BLOCK_RE = /<!--\s*note-cover\b([\s\S]*?)-->/gi;
    var PAGE_SIZES = {
        a3: { width: 297, height: 420, screenWidth: 1123 },
        a4: { width: 210, height: 297, screenWidth: 794 },
        a5: { width: 148, height: 210, screenWidth: 559 },
        letter: { width: 216, height: 279, screenWidth: 816 },
        legal: { width: 216, height: 356, screenWidth: 816 }
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function finiteNumber(value, fallback, min, max) {
        var parsed = Number(value);
        if (!Number.isFinite(parsed)) parsed = fallback;
        if (Number.isFinite(min)) parsed = Math.max(min, parsed);
        if (Number.isFinite(max)) parsed = Math.min(max, parsed);
        return parsed;
    }

    function safeColor(value, fallback) {
        var source = String(value || '').trim();
        if (/^#[0-9a-f]{3,8}$/i.test(source)) return source;
        if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s+-]+\)$/i.test(source)) return source;
        if (/^[a-z]{3,24}$/i.test(source)) return source;
        return fallback || '#ffffff';
    }

    function safeImageSource(value) {
        var source = String(value || '').trim();
        if (!source) return '';
        if (/^(?:https?:|blob:|internal:\/\/)/i.test(source)) return source;
        if (/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,/i.test(source)) return source;
        if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return '';
        return source;
    }

    function safeTextAlign(value) {
        var source = String(value || '').toLowerCase();
        return /^(?:left|center|right|justify)$/.test(source) ? source : 'left';
    }

    function safeFontWeight(value) {
        var source = String(value == null ? '' : value).trim().toLowerCase();
        if (/^(?:normal|bold|bolder|lighter)$/.test(source)) return source;
        var numeric = finiteNumber(source, 400, 100, 900);
        return String(Math.round(numeric / 100) * 100);
    }

    function safeFontFamily(value) {
        var source = String(value || '').trim();
        if (!source || /[;{}<>]/.test(source)) return '';
        return source.slice(0, 120);
    }

    function parseBlock(jsonText) {
        var payload = JSON.parse(String(jsonText || '').trim());
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('표지 설정이 JSON 객체가 아닙니다.');
        }
        return payload;
    }

    function collectLayerElements(config) {
        var elements = Array.isArray(config.elements) ? config.elements.filter(function (item) {
            return item && typeof item === 'object' && item.id;
        }) : [];
        var groups = Array.isArray(config.groups) ? config.groups : [];
        var elementMap = new Map();
        var groupMap = new Map();
        var output = [];
        var visited = new Set();

        elements.forEach(function (item) { elementMap.set(String(item.id), item); });
        groups.forEach(function (item) {
            if (item && item.id) groupMap.set(String(item.id), item);
        });

        function walk(id) {
            var key = String(id || '');
            if (!key || visited.has(key)) return;
            visited.add(key);
            if (elementMap.has(key)) {
                output.push(elementMap.get(key));
                return;
            }
            var group = groupMap.get(key);
            if (!group || !Array.isArray(group.childIds)) return;
            group.childIds.forEach(walk);
        }

        var roots = Array.isArray(config.rootLayerIds) && config.rootLayerIds.length
            ? config.rootLayerIds
            : elements.map(function (item) { return item.id; });
        roots.forEach(walk);
        elements.forEach(function (item) {
            if (!visited.has(String(item.id))) output.push(item);
        });
        return output;
    }

    function getBoxStyle(element, layerIndex) {
        var x = finiteNumber(element.x, 0, -1000, 1000);
        var y = finiteNumber(element.y, 0, -1000, 1000);
        var w = finiteNumber(element.w, 10, 0, 2000);
        var h = finiteNumber(element.h, 10, 0, 2000);
        var rotation = finiteNumber(element.rotation, 0, -3600, 3600);
        var opacity = finiteNumber(element.opacity, 1, 0, 1);
        return 'left:' + x + '%;top:' + y + '%;width:' + w + '%;height:' + h + '%;'
            + 'z-index:' + (layerIndex + 1) + ';opacity:' + opacity + ';'
            + (rotation ? 'transform:rotate(' + rotation + 'deg);' : '');
    }

    function getGeometryAttributes(element) {
        return ' data-note-cover-x="' + finiteNumber(element.x, 0, -1000, 1000)
            + '" data-note-cover-y="' + finiteNumber(element.y, 0, -1000, 1000)
            + '" data-note-cover-w="' + finiteNumber(element.w, 10, 0, 2000)
            + '" data-note-cover-h="' + finiteNumber(element.h, 10, 0, 2000)
            + '" data-note-cover-rotation="' + finiteNumber(element.rotation, 0, -3600, 3600) + '"';
    }

    function renderTextElement(element, layerIndex, screenWidth) {
        var fontSize = finiteNumber(element.fontSize, 16, 4, 600);
        var fontCqw = fontSize / screenWidth * 100;
        var family = safeFontFamily(element.fontFamily);
        var style = getBoxStyle(element, layerIndex)
            + 'color:' + safeColor(element.color, '#111111') + ';'
            + 'font-weight:' + safeFontWeight(element.fontWeight) + ';'
            + 'text-align:' + safeTextAlign(element.textAlign) + ';'
            + 'font-size:' + fontSize + 'px;font-size:' + fontCqw.toFixed(5) + 'cqw;'
            + (family ? 'font-family:' + family + ';' : '');
        return '<div class="note-cover-element note-cover-text" data-note-cover-element-id="'
            + escapeHtml(element.id) + '"' + getGeometryAttributes(element)
            + ' data-note-cover-text-editable="1" contenteditable="plaintext-only" '
            + 'role="textbox" tabindex="0" spellcheck="true" title="클릭하여 표지 텍스트 편집" '
            + 'style="' + escapeHtml(style) + '">'
            + escapeHtml(element.text || '') + '</div>';
    }

    function renderImageElement(element, layerIndex) {
        var source = safeImageSource(element.path || element.src || '');
        var style = getBoxStyle(element, layerIndex);
        var alt = element.name || '표지 이미지';
        return '<div class="note-cover-element note-cover-image' + (source ? '' : ' is-missing')
            + '" data-note-cover-element-id="'
            + escapeHtml(element.id) + '"' + getGeometryAttributes(element)
            + ' data-note-cover-image-path="' + escapeHtml(source) + '" style="' + escapeHtml(style) + '">'
            + '<span class="note-cover-image-fallback">' + escapeHtml(source ? alt : '이미지 경로 없음') + '</span>'
            + (source ? '<img src="' + escapeHtml(source) + '" alt="' + escapeHtml(alt) + '" loading="lazy">' : '')
            + '<button type="button" class="note-cover-image-replace no-print" '
            + 'data-html2canvas-ignore="true" aria-label="이미지 바꾸기: ' + escapeHtml(alt)
            + '" title="표지 이미지 바꾸기">이미지 바꾸기</button></div>';
    }

    function renderElement(element, layerIndex, screenWidth) {
        var type = String(element.type || '').toLowerCase();
        if (type === 'text') return renderTextElement(element, layerIndex, screenWidth);
        if (type === 'image') return renderImageElement(element, layerIndex);
        return '';
    }

    function renderHtml(config, options) {
        if (!config || config.enabled === false) return '';
        var renderOptions = options || {};
        var coverIndex = Math.max(0, Math.floor(finiteNumber(renderOptions.coverIndex, 0, 0, 100000)));
        var pageSizeId = String(config.pageSizeId || 'a4').toLowerCase();
        var pageSize = PAGE_SIZES[pageSizeId] || PAGE_SIZES.a4;
        var layout = config.layout && typeof config.layout === 'object' ? config.layout : {};
        var align = /^(?:left|center|right)$/.test(String(layout.align || '').toLowerCase())
            ? String(layout.align).toLowerCase()
            : 'center';
        var containerWidth = finiteNumber(layout.containerWidthPct, 100, 10, 100);
        var gap = finiteNumber(layout.gapPx, 24, 0, 240);
        var background = config.bg && typeof config.bg === 'object' ? config.bg : {};
        var backgroundImage = safeImageSource(background.imagePath || '');
        var layers = collectLayerElements(config);
        var canvasLeft = align === 'center' ? (100 - containerWidth) / 2 : (align === 'right' ? 100 - containerWidth : 0);
        var pageStyle = 'aspect-ratio:' + pageSize.width + '/' + pageSize.height + ';'
            + 'max-width:' + pageSize.screenWidth + 'px;'
            + 'background-color:' + safeColor(background.color, '#ffffff') + ';'
            + 'margin-bottom:' + gap + 'px;';
        var canvasStyle = 'left:' + canvasLeft + '%;width:' + containerWidth + '%;';
        var html = '<section class="note-cover-page note-cover-size-' + escapeHtml(pageSizeId)
            + ' note-cover-align-' + escapeHtml(align) + '" data-note-cover-version="'
            + escapeHtml(config.v || 1) + '" data-note-cover-index="' + coverIndex
            + '" style="' + escapeHtml(pageStyle) + '">';
        if (backgroundImage) {
            html += '<img class="note-cover-background" src="' + escapeHtml(backgroundImage)
                + '" alt="" aria-hidden="true">';
        }
        html += '<div class="note-cover-canvas" style="' + escapeHtml(canvasStyle) + '">';
        layers.forEach(function (element, index) {
            html += renderElement(element, index, pageSize.screenWidth);
        });
        html += '</div></section>';
        return html;
    }

    function renderError(error) {
        var message = error && error.message ? error.message : String(error || '알 수 없는 오류');
        return '<aside class="note-cover-error" role="alert"><strong>표지 렌더링 오류</strong><span>'
            + escapeHtml(message) + '</span></aside>';
    }

    function replaceInMarkdown(markdown) {
        var source = String(markdown == null ? '' : markdown);
        var coverIndex = 0;
        BLOCK_RE.lastIndex = 0;
        return source.replace(BLOCK_RE, function (_, jsonText) {
            try {
                var config = parseBlock(jsonText);
                return '\n\n' + renderHtml(config, { coverIndex: coverIndex++ }) + '\n\n';
            } catch (error) {
                coverIndex += 1;
                return '\n\n' + renderError(error) + '\n\n';
            }
        });
    }

    function updateTextElementInMarkdown(markdown, coverIndex, elementId, nextText) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var targetElementId = String(elementId || '');
        var normalizedText = String(nextText == null ? '' : nextText).replace(/\r\n?/g, '\n');
        var currentCoverIndex = 0;
        var changed = false;
        BLOCK_RE.lastIndex = 0;
        var output = source.replace(BLOCK_RE, function (fullMatch, jsonText) {
            var thisCoverIndex = currentCoverIndex++;
            if (thisCoverIndex !== targetCoverIndex || !targetElementId) return fullMatch;
            try {
                var config = parseBlock(jsonText);
                var elements = Array.isArray(config.elements) ? config.elements : [];
                var target = elements.find(function (item) {
                    return item && String(item.id || '') === targetElementId &&
                        String(item.type || '').toLowerCase() === 'text';
                });
                if (!target || String(target.text || '') === normalizedText) return fullMatch;
                target.text = normalizedText;
                changed = true;
                return '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
            } catch (_) {
                return fullMatch;
            }
        });
        return { markdown: output, changed: changed };
    }

    function roundedNumber(value) {
        return Math.round(Number(value) * 1000000) / 1000000;
    }

    function normalizedRotation(value) {
        var rotation = finiteNumber(value, 0, -3600, 3600);
        return roundedNumber(((rotation % 360) + 540) % 360 - 180);
    }

    function updateElementGeometryInMarkdown(markdown, coverIndex, elementId, geometry) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var targetElementId = String(elementId || '');
        var next = geometry && typeof geometry === 'object' ? geometry : {};
        var currentCoverIndex = 0;
        var changed = false;
        BLOCK_RE.lastIndex = 0;
        var output = source.replace(BLOCK_RE, function (fullMatch, jsonText) {
            var thisCoverIndex = currentCoverIndex++;
            if (thisCoverIndex !== targetCoverIndex || !targetElementId) return fullMatch;
            try {
                var config = parseBlock(jsonText);
                var elements = Array.isArray(config.elements) ? config.elements : [];
                var target = elements.find(function (item) {
                    return item && String(item.id || '') === targetElementId
                        && String(item.type || '').toLowerCase() === 'text';
                });
                if (!target) return fullMatch;
                var fields = {
                    x: finiteNumber(next.x, target.x, -1000, 1000),
                    y: finiteNumber(next.y, target.y, -1000, 1000),
                    w: finiteNumber(next.w, target.w, 1, 2000),
                    h: finiteNumber(next.h, target.h, 0.5, 2000),
                    rotation: normalizedRotation(next.rotation == null ? target.rotation : next.rotation)
                };
                Object.keys(fields).forEach(function (key) {
                    var value = roundedNumber(fields[key]);
                    var previous = key === 'rotation'
                        ? normalizedRotation(target[key])
                        : roundedNumber(finiteNumber(target[key], key === 'w' || key === 'h' ? 10 : 0));
                    if (previous === value) return;
                    target[key] = value;
                    changed = true;
                });
                if (!changed) return fullMatch;
                return '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
            } catch (_) {
                return fullMatch;
            }
        });
        return { markdown: output, changed: changed };
    }

    function updateImageElementPathInMarkdown(markdown, coverIndex, elementId, imagePath) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var targetElementId = String(elementId || '');
        var safePath = safeImageSource(imagePath);
        var currentCoverIndex = 0;
        var changed = false;
        if (!targetElementId || !safePath) return { markdown: source, changed: false };
        BLOCK_RE.lastIndex = 0;
        var output = source.replace(BLOCK_RE, function (fullMatch, jsonText) {
            var thisCoverIndex = currentCoverIndex++;
            if (thisCoverIndex !== targetCoverIndex) return fullMatch;
            try {
                var config = parseBlock(jsonText);
                var elements = Array.isArray(config.elements) ? config.elements : [];
                var target = elements.find(function (item) {
                    return item && String(item.id || '') === targetElementId
                        && String(item.type || '').toLowerCase() === 'image';
                });
                if (!target || String(target.path || target.src || '') === safePath) return fullMatch;
                target.path = safePath;
                if (Object.prototype.hasOwnProperty.call(target, 'src')) delete target.src;
                changed = true;
                return '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
            } catch (_) {
                return fullMatch;
            }
        });
        return { markdown: output, changed: changed };
    }

    function readEditableText(element) {
        var value = typeof element.innerText === 'string' ? element.innerText : element.textContent;
        return String(value == null ? '' : value).replace(/\r\n?/g, '\n');
    }

    function insertPlainTextAtSelection(element, text) {
        var doc = element && element.ownerDocument;
        if (doc && typeof doc.execCommand === 'function') {
            try {
                if (doc.execCommand('insertText', false, text)) return true;
            } catch (_) {}
        }
        if (!doc || !doc.getSelection) return false;
        var selection = doc.getSelection();
        if (!selection || !selection.rangeCount) return false;
        var range = selection.getRangeAt(0);
        range.deleteContents();
        var textNode = doc.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function createTransformHandle(doc, className, label) {
        var handle = doc.createElement('span');
        handle.className = 'note-cover-transform-handle ' + className + ' no-print';
        handle.setAttribute('contenteditable', 'false');
        handle.setAttribute('role', 'button');
        handle.setAttribute('tabindex', '-1');
        handle.setAttribute('aria-label', label);
        handle.setAttribute('title', label);
        handle.setAttribute('data-html2canvas-ignore', 'true');
        return handle;
    }

    function getCoverChangeDetail(element, geometry, phase) {
        var page = element.closest ? element.closest('.note-cover-page') : null;
        return {
            coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
            elementId: String(element.getAttribute('data-note-cover-element-id') || ''),
            geometry: geometry,
            phase: phase || 'commit'
        };
    }

    function bindTextGeometryControls(textElement, hydrateOptions) {
        var doc = textElement && textElement.ownerDocument;
        if (!doc || textElement.__noteCoverGeometryBound) return false;
        textElement.__noteCoverGeometryBound = true;
        var resizeHandle = createTransformHandle(doc, 'note-cover-resize-handle', '텍스트 상자 크기 조절');
        var rotateHandle = createTransformHandle(doc, 'note-cover-rotate-handle', '텍스트 상자 회전');
        textElement.appendChild(resizeHandle);
        textElement.appendChild(rotateHandle);

        function beginPointerTransform(event, mode) {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            var canvas = textElement.closest ? textElement.closest('.note-cover-canvas') : null;
            if (!canvas) return;
            var canvasRect = canvas.getBoundingClientRect();
            var elementRect = textElement.getBoundingClientRect();
            if (!canvasRect.width || !canvasRect.height) return;

            var startX = event.clientX;
            var startY = event.clientY;
            var startW = finiteNumber(textElement.getAttribute('data-note-cover-w'), 10, 1, 2000);
            var startH = finiteNumber(textElement.getAttribute('data-note-cover-h'), 10, 0.5, 2000);
            var startRotation = normalizedRotation(textElement.getAttribute('data-note-cover-rotation'));
            var centerX = elementRect.left + elementRect.width / 2;
            var centerY = elementRect.top + elementRect.height / 2;
            var startPointerAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI;
            var nextW = startW;
            var nextH = startH;
            var nextRotation = startRotation;
            textElement.classList.add('is-transforming');

            var onMove = function (moveEvent) {
                moveEvent.preventDefault();
                if (mode === 'resize') {
                    var dx = moveEvent.clientX - startX;
                    var dy = moveEvent.clientY - startY;
                    var radians = startRotation * Math.PI / 180;
                    var localDx = dx * Math.cos(radians) + dy * Math.sin(radians);
                    var localDy = -dx * Math.sin(radians) + dy * Math.cos(radians);
                    nextW = Math.max(1, startW + localDx / canvasRect.width * 100);
                    nextH = Math.max(0.5, startH + localDy / canvasRect.height * 100);
                    if (moveEvent.shiftKey) {
                        var ratio = startW / Math.max(0.5, startH);
                        if (Math.abs(localDx) >= Math.abs(localDy)) nextH = nextW / ratio;
                        else nextW = nextH * ratio;
                    }
                    textElement.style.width = roundedNumber(nextW) + '%';
                    textElement.style.height = roundedNumber(nextH) + '%';
                } else {
                    var pointerAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
                    nextRotation = normalizedRotation(startRotation + pointerAngle - startPointerAngle);
                    if (moveEvent.shiftKey) nextRotation = Math.round(nextRotation / 15) * 15;
                    textElement.style.transform = 'rotate(' + roundedNumber(nextRotation) + 'deg)';
                }
            };
            var onUp = function (upEvent) {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onUp);
                textElement.classList.remove('is-transforming');
                textElement.setAttribute('data-note-cover-w', roundedNumber(nextW));
                textElement.setAttribute('data-note-cover-h', roundedNumber(nextH));
                textElement.setAttribute('data-note-cover-rotation', roundedNumber(nextRotation));
                if (typeof hydrateOptions.onGeometryChange === 'function') {
                    hydrateOptions.onGeometryChange(getCoverChangeDetail(textElement, {
                        w: nextW,
                        h: nextH,
                        rotation: nextRotation
                    }, 'commit'));
                }
                try { event.target.releasePointerCapture(event.pointerId); } catch (_) {}
                if (upEvent) upEvent.preventDefault();
            };
            doc.addEventListener('pointermove', onMove, { passive: false });
            doc.addEventListener('pointerup', onUp, { passive: false });
            doc.addEventListener('pointercancel', onUp, { passive: false });
            try { event.target.setPointerCapture(event.pointerId); } catch (_) {}
        }

        resizeHandle.addEventListener('pointerdown', function (event) {
            beginPointerTransform(event, 'resize');
        });
        rotateHandle.addEventListener('pointerdown', function (event) {
            beginPointerTransform(event, 'rotate');
        });
        return true;
    }

    function hydrate(rootElement, options) {
        if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return 0;
        var hydrateOptions = options || {};
        var imageWrappers = rootElement.querySelectorAll('.note-cover-image');
        Array.prototype.forEach.call(imageWrappers, function (wrapper) {
            if (!wrapper || wrapper.__noteCoverBound) return;
            wrapper.__noteCoverBound = true;
            var image = wrapper.querySelector('img');
            var markLoaded = function () {
                wrapper.classList.add('is-loaded');
                wrapper.classList.remove('is-missing');
            };
            var markMissing = function () {
                wrapper.classList.add('is-missing');
                wrapper.classList.remove('is-loaded');
            };
            if (image) {
                image.addEventListener('load', markLoaded);
                image.addEventListener('error', markMissing);
                if (image.complete) {
                    if (image.naturalWidth > 0) markLoaded();
                    else markMissing();
                }
            } else {
                markMissing();
            }
            var fallback = wrapper.querySelector('.note-cover-image-fallback');
            var replaceButton = wrapper.querySelector('.note-cover-image-replace');
            if (typeof hydrateOptions.onImageRelink === 'function') {
                var requestRelink = function (event) {
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                    var page = wrapper.closest ? wrapper.closest('.note-cover-page') : null;
                    hydrateOptions.onImageRelink({
                        coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
                        elementId: String(wrapper.getAttribute('data-note-cover-element-id') || ''),
                        currentPath: String(wrapper.getAttribute('data-note-cover-image-path') || '')
                    });
                };
                if (fallback) {
                fallback.setAttribute('role', 'button');
                fallback.setAttribute('tabindex', '0');
                fallback.setAttribute('title', '클릭하여 표지 이미지 다시 연결');
                fallback.addEventListener('click', requestRelink);
                fallback.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') requestRelink(event);
                });
                }
                if (replaceButton) {
                    replaceButton.addEventListener('click', requestRelink);
                    replaceButton.addEventListener('dblclick', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    });
                }
                wrapper.addEventListener('dblclick', requestRelink);
            }
        });
        var editableTexts = rootElement.querySelectorAll('.note-cover-text[data-note-cover-text-editable="1"]');
        Array.prototype.forEach.call(editableTexts, function (textElement) {
            if (!textElement || textElement.__noteCoverEditBound) return;
            textElement.__noteCoverEditBound = true;
            bindTextGeometryControls(textElement, hydrateOptions);
            var timer = null;
            var lastEmittedText = readEditableText(textElement);
            var emitChange = function (phase) {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                var text = readEditableText(textElement);
                if (text === lastEmittedText && phase !== 'commit') return;
                lastEmittedText = text;
                var page = textElement.closest ? textElement.closest('.note-cover-page') : null;
                var detail = {
                    coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
                    elementId: String(textElement.getAttribute('data-note-cover-element-id') || ''),
                    text: text,
                    phase: phase || 'input'
                };
                if (typeof hydrateOptions.onTextChange === 'function') hydrateOptions.onTextChange(detail);
            };
            textElement.addEventListener('focus', function () {
                textElement.classList.add('is-editing');
            });
            textElement.addEventListener('blur', function () {
                textElement.classList.remove('is-editing');
                emitChange('commit');
            });
            textElement.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () { emitChange('input'); }, 80);
            });
            textElement.addEventListener('paste', function (event) {
                var clipboard = event.clipboardData || (root && root.clipboardData);
                if (!clipboard) return;
                event.preventDefault();
                insertPlainTextAtSelection(textElement, clipboard.getData('text/plain') || '');
            });
            textElement.addEventListener('keydown', function (event) {
                event.stopPropagation();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    textElement.blur();
                }
            });
            textElement.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            textElement.addEventListener('click', function (event) { event.stopPropagation(); });
        });
        return imageWrappers.length + editableTexts.length;
    }

    return {
        PAGE_SIZES: PAGE_SIZES,
        parseBlock: parseBlock,
        collectLayerElements: collectLayerElements,
        renderHtml: renderHtml,
        replaceInMarkdown: replaceInMarkdown,
        updateTextElementInMarkdown: updateTextElementInMarkdown,
        updateElementGeometryInMarkdown: updateElementGeometryInMarkdown,
        updateImageElementPathInMarkdown: updateImageElementPathInMarkdown,
        hydrate: hydrate,
        safeImageSource: safeImageSource
    };
});

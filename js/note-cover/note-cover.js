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

    function safeFontStyle(value) {
        return String(value || '').toLowerCase() === 'italic' ? 'italic' : 'normal';
    }

    function stripTrailingJsonCommas(source) {
        var input = String(source || '');
        var output = '';
        var inString = false;
        var escaped = false;
        for (var i = 0; i < input.length; i += 1) {
            var char = input.charAt(i);
            if (inString) {
                output += char;
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') {
                inString = true;
                output += char;
                continue;
            }
            if (char === ',') {
                var nextIndex = i + 1;
                while (nextIndex < input.length && /\s/.test(input.charAt(nextIndex))) nextIndex += 1;
                if (input.charAt(nextIndex) === '}' || input.charAt(nextIndex) === ']') continue;
            }
            output += char;
        }
        return output;
    }

    function getJsonErrorPosition(error) {
        var match = String(error && error.message || '').match(/\bposition\s+(\d+)\b/i);
        return match ? Number(match[1]) : -1;
    }

    function insertMissingJsonComma(source, error) {
        var message = String(error && error.message || '');
        var propertyError = /after property value/i.test(message);
        var arrayError = /after array element/i.test(message);
        if (!propertyError && !arrayError) return '';
        var position = getJsonErrorPosition(error);
        if (!Number.isFinite(position) || position < 0 || position > source.length) return '';
        var previousIndex = position - 1;
        while (previousIndex >= 0 && /\s/.test(source.charAt(previousIndex))) previousIndex -= 1;
        var nextIndex = position;
        while (nextIndex < source.length && /\s/.test(source.charAt(nextIndex))) nextIndex += 1;
        var previous = source.charAt(previousIndex);
        var next = source.charAt(nextIndex);
        if (!previous || /[,{[]/.test(previous)) return '';
        if (propertyError && next !== '"') return '';
        if (arrayError && !/["{[\d\-tfn]/.test(next)) return '';
        return source.slice(0, position) + ',' + source.slice(position);
    }

    function parseJsonWithCommonRepairs(jsonText) {
        var source = stripTrailingJsonCommas(String(jsonText || '').trim());
        var lastError = null;
        for (var attempt = 0; attempt < 12; attempt += 1) {
            try {
                return JSON.parse(source);
            } catch (error) {
                lastError = error;
                var repaired = insertMissingJsonComma(source, error);
                if (!repaired || repaired === source) break;
                source = repaired;
            }
        }
        throw lastError || new Error('표지 JSON을 해석할 수 없습니다.');
    }

    function parseBlock(jsonText) {
        var payload = parseJsonWithCommonRepairs(jsonText);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('표지 설정이 JSON 객체가 아닙니다.');
        }
        return payload;
    }

    function createDefaultConfig(options) {
        var input = options && typeof options === 'object' ? options : {};
        var title = String(input.title || '문서 제목').trim() || '문서 제목';
        var subtitle = String(input.subtitle || '문서 부제').trim() || '문서 부제';
        var author = String(input.author || '작성자').trim() || '작성자';
        var date = String(input.date || '작성일').trim() || '작성일';
        return {
            v: 2,
            enabled: true,
            pageSizeId: 'a4',
            layout: { align: 'center', containerWidthPct: 100, gapPx: 24 },
            bg: { color: '#ffffff', imagePath: '' },
            rootLayerIds: ['title', 'subtitle', 'author', 'date'],
            groups: [],
            elements: [
                {
                    id: 'title', type: 'text', x: 10, y: 32, w: 80, h: 12,
                    text: title, fontSize: 48, fontFamily: 'Arial', color: '#111827',
                    fontWeight: 700, textAlign: 'center'
                },
                {
                    id: 'subtitle', type: 'text', x: 15, y: 47, w: 70, h: 7,
                    text: subtitle, fontSize: 24, fontFamily: 'Arial', color: '#475569',
                    fontWeight: 400, textAlign: 'center'
                },
                {
                    id: 'author', type: 'text', x: 20, y: 72, w: 60, h: 6,
                    text: author, fontSize: 18, fontFamily: 'Arial', color: '#334155',
                    fontWeight: 400, textAlign: 'center'
                },
                {
                    id: 'date', type: 'text', x: 20, y: 80, w: 60, h: 5,
                    text: date, fontSize: 16, fontFamily: 'Arial', color: '#64748b',
                    fontWeight: 400, textAlign: 'center'
                }
            ]
        };
    }

    function serializeConfig(config) {
        var json = JSON.stringify(config, null, 2).replace(/--/g, '\\u002d\\u002d');
        return '<!-- note-cover\n' + json + '\n-->';
    }

    function findFirstCoverBlock(markdown) {
        var source = String(markdown == null ? '' : markdown);
        BLOCK_RE.lastIndex = 0;
        var match = BLOCK_RE.exec(source);
        BLOCK_RE.lastIndex = 0;
        if (!match) return null;
        return { start: match.index, end: match.index + match[0].length, block: match[0] };
    }

    function insertDefaultCover(markdown, options) {
        var source = String(markdown == null ? '' : markdown);
        var existing = findFirstCoverBlock(source);
        if (existing) {
            return {
                markdown: source,
                changed: false,
                reason: 'exists',
                selectionStart: existing.start,
                selectionEnd: existing.end
            };
        }
        var config = createDefaultConfig(options);
        var block = serializeConfig(config);
        var body = source.replace(/^\uFEFF/, '');
        var output = block + (body ? '\n' + body : '');
        var escapedTitle = JSON.stringify(config.elements[0].text).slice(1, -1)
            .replace(/--/g, '\\u002d\\u002d');
        var titleMarker = '"text": "' + escapedTitle + '"';
        var markerStart = block.indexOf(titleMarker);
        var titleStart = markerStart >= 0 ? markerStart + '"text": "'.length : block.length;
        return {
            markdown: output,
            changed: true,
            reason: 'inserted',
            config: config,
            selectionStart: titleStart,
            selectionEnd: titleStart + escapedTitle.length
        };
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
            + 'font-style:' + safeFontStyle(element.fontStyle) + ';'
            + 'text-align:' + safeTextAlign(element.textAlign) + ';'
            + 'font-size:' + fontSize + 'px;font-size:' + fontCqw.toFixed(5) + 'cqw;'
            + (family ? 'font-family:' + family + ';' : '');
        return '<div class="note-cover-element note-cover-text" data-note-cover-element-id="'
            + escapeHtml(element.id) + '"' + getGeometryAttributes(element)
            + ' data-note-cover-font-size="' + fontSize + '"'
            + ' data-note-cover-font-family="' + escapeHtml(family) + '"'
            + ' data-note-cover-color="' + escapeHtml(safeColor(element.color, '#111111')) + '"'
            + ' data-note-cover-font-weight="' + escapeHtml(safeFontWeight(element.fontWeight)) + '"'
            + ' data-note-cover-font-style="' + escapeHtml(safeFontStyle(element.fontStyle)) + '"'
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
            + '" title="표지 이미지 바꾸기">이미지 바꾸기</button>'
            + '<button type="button" class="note-cover-image-delete no-print" '
            + 'data-html2canvas-ignore="true" aria-label="이미지 삭제: ' + escapeHtml(alt)
            + '" title="표지 이미지 삭제">삭제</button></div>';
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
                        && /^(?:text|image)$/.test(String(item.type || '').toLowerCase());
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

    function updateTextElementStyleInMarkdown(markdown, coverIndex, elementId, nextStyle) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var targetElementId = String(elementId || '');
        var style = nextStyle && typeof nextStyle === 'object' ? nextStyle : {};
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
                var fields = {};
                if (Object.prototype.hasOwnProperty.call(style, 'fontSize')) {
                    fields.fontSize = roundedNumber(finiteNumber(style.fontSize, target.fontSize, 4, 600));
                }
                if (Object.prototype.hasOwnProperty.call(style, 'fontFamily')) {
                    fields.fontFamily = safeFontFamily(style.fontFamily);
                }
                if (Object.prototype.hasOwnProperty.call(style, 'color')) {
                    fields.color = safeColor(style.color, safeColor(target.color, '#111111'));
                }
                if (Object.prototype.hasOwnProperty.call(style, 'fontWeight')) {
                    fields.fontWeight = safeFontWeight(style.fontWeight);
                }
                if (Object.prototype.hasOwnProperty.call(style, 'fontStyle')) {
                    fields.fontStyle = safeFontStyle(style.fontStyle);
                }
                Object.keys(fields).forEach(function (key) {
                    if (String(target[key] == null ? '' : target[key]) === String(fields[key])) return;
                    target[key] = fields[key];
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

    function createElementId(config, prefix) {
        var used = new Set((Array.isArray(config.elements) ? config.elements : []).map(function (item) {
            return String(item && item.id || '');
        }));
        var base = String(prefix || 'element') + '-' + Date.now().toString(36);
        var id = base;
        var suffix = 1;
        while (used.has(id)) id = base + '-' + suffix++;
        return id;
    }

    function addElementInMarkdown(markdown, coverIndex, elementDraft) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var draft = elementDraft && typeof elementDraft === 'object' ? elementDraft : {};
        var currentCoverIndex = 0;
        var changed = false;
        var addedElementId = '';
        BLOCK_RE.lastIndex = 0;
        var output = source.replace(BLOCK_RE, function (fullMatch, jsonText) {
            var thisCoverIndex = currentCoverIndex++;
            if (thisCoverIndex !== targetCoverIndex) return fullMatch;
            try {
                var config = parseBlock(jsonText);
                if (!Array.isArray(config.elements)) config.elements = [];
                var type = String(draft.type || '').toLowerCase() === 'image' ? 'image' : 'text';
                var id = String(draft.id || '') || createElementId(config, type);
                var element = {
                    id: id,
                    type: type,
                    x: roundedNumber(finiteNumber(draft.x, 12, -1000, 1000)),
                    y: roundedNumber(finiteNumber(draft.y, 12, -1000, 1000)),
                    w: roundedNumber(finiteNumber(draft.w, type === 'image' ? 32 : 38, 1, 2000)),
                    h: roundedNumber(finiteNumber(draft.h, type === 'image' ? 24 : 8, 0.5, 2000)),
                    rotation: normalizedRotation(draft.rotation)
                };
                if (type === 'image') {
                    element.path = safeImageSource(draft.path || draft.src || '');
                    element.name = String(draft.name || '새 이미지').slice(0, 200);
                } else {
                    element.text = String(draft.text == null ? '새 텍스트' : draft.text);
                    element.fontSize = roundedNumber(finiteNumber(draft.fontSize, 32, 4, 600));
                    element.fontFamily = safeFontFamily(draft.fontFamily) || 'Arial';
                    element.color = safeColor(draft.color, '#111111');
                    element.fontWeight = safeFontWeight(draft.fontWeight || 400);
                    element.fontStyle = safeFontStyle(draft.fontStyle);
                    element.textAlign = safeTextAlign(draft.textAlign);
                }
                config.elements.push(element);
                if (!Array.isArray(config.rootLayerIds)) config.rootLayerIds = [];
                config.rootLayerIds.push(id);
                addedElementId = id;
                changed = true;
                return '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
            } catch (_) {
                return fullMatch;
            }
        });
        return { markdown: output, changed: changed, elementId: addedElementId };
    }

    function removeElementInMarkdown(markdown, coverIndex, elementId) {
        var source = String(markdown == null ? '' : markdown);
        var targetCoverIndex = Math.max(0, Math.floor(finiteNumber(coverIndex, 0, 0, 100000)));
        var targetElementId = String(elementId || '');
        var currentCoverIndex = 0;
        var changed = false;
        if (!targetElementId) return { markdown: source, changed: false };
        BLOCK_RE.lastIndex = 0;
        var output = source.replace(BLOCK_RE, function (fullMatch, jsonText) {
            var thisCoverIndex = currentCoverIndex++;
            if (thisCoverIndex !== targetCoverIndex) return fullMatch;
            try {
                var config = parseBlock(jsonText);
                var elements = Array.isArray(config.elements) ? config.elements : [];
                var exists = elements.some(function (item) {
                    return item && String(item.id || '') === targetElementId
                        && /^(?:text|image)$/.test(String(item.type || '').toLowerCase());
                });
                if (!exists) return fullMatch;
                config.elements = elements.filter(function (item) {
                    return !item || String(item.id || '') !== targetElementId;
                });
                if (Array.isArray(config.rootLayerIds)) {
                    config.rootLayerIds = config.rootLayerIds.filter(function (id) {
                        return String(id || '') !== targetElementId;
                    });
                }
                if (Array.isArray(config.groups)) {
                    config.groups.forEach(function (group) {
                        if (!group || !Array.isArray(group.childIds)) return;
                        group.childIds = group.childIds.filter(function (id) {
                            return String(id || '') !== targetElementId;
                        });
                    });
                }
                changed = true;
                return '<!-- note-cover\n' + JSON.stringify(config, null, 2) + '\n-->';
            } catch (_) {
                return fullMatch;
            }
        });
        return { markdown: output, changed: changed, elementId: targetElementId };
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

    var selectedCoverIndex = null;
    var selectedElementId = '';
    var NOTE_COVER_TOOLBAR_POSITION_KEY = 'md_viewer_note_cover_toolbar_position_v1';
    var NOTE_COVER_TOOLBAR_ORIENTATION_KEY = 'md_viewer_note_cover_toolbar_orientation_v1';

    function setPendingSelection(coverIndex, elementId) {
        selectedCoverIndex = Math.max(0, Number(coverIndex) || 0);
        selectedElementId = String(elementId || '');
    }

    function getToolbarStorage(page) {
        try {
            return page && page.ownerDocument && page.ownerDocument.defaultView
                ? page.ownerDocument.defaultView.localStorage
                : null;
        } catch (_) {
            return null;
        }
    }

    function readToolbarPosition(page) {
        var storage = getToolbarStorage(page);
        if (!storage) return null;
        try {
            var parsed = JSON.parse(storage.getItem(NOTE_COVER_TOOLBAR_POSITION_KEY) || 'null');
            if (!parsed || typeof parsed !== 'object') return null;
            var centerPct = Number(parsed.centerPct);
            var topPx = Number(parsed.topPx);
            if (!Number.isFinite(centerPct) || !Number.isFinite(topPx)) return null;
            return {
                centerPct: finiteNumber(centerPct, 50, -100, 200),
                topPx: finiteNumber(topPx, -50, -2000, 4000)
            };
        } catch (_) {
            return null;
        }
    }

    function writeToolbarPosition(page, position) {
        var storage = getToolbarStorage(page);
        if (!storage || !position) return false;
        try {
            storage.setItem(NOTE_COVER_TOOLBAR_POSITION_KEY, JSON.stringify(position));
            return true;
        } catch (_) {
            return false;
        }
    }

    function readToolbarOrientation(page) {
        var storage = getToolbarStorage(page);
        if (!storage) return 'horizontal';
        try {
            return storage.getItem(NOTE_COVER_TOOLBAR_ORIENTATION_KEY) === 'vertical' ? 'vertical' : 'horizontal';
        } catch (_) {
            return 'horizontal';
        }
    }

    function writeToolbarOrientation(page, orientation) {
        var storage = getToolbarStorage(page);
        if (!storage) return false;
        try {
            storage.setItem(NOTE_COVER_TOOLBAR_ORIENTATION_KEY, orientation === 'vertical' ? 'vertical' : 'horizontal');
            return true;
        } catch (_) {
            return false;
        }
    }

    function applyToolbarOrientation(toolbar, orientation) {
        if (!toolbar) return 'horizontal';
        var next = orientation === 'vertical' ? 'vertical' : 'horizontal';
        var vertical = next === 'vertical';
        toolbar.classList.toggle('is-vertical', vertical);
        toolbar.classList.toggle('is-horizontal', !vertical);
        toolbar.setAttribute('data-note-cover-orientation', next);
        var button = toolbar.querySelector('[data-note-cover-action="toggle-orientation"]');
        if (button) {
            button.textContent = vertical ? '↔' : '↕';
            button.setAttribute('aria-pressed', vertical ? 'true' : 'false');
            button.setAttribute('aria-label', vertical ? '가로 메뉴로 전환' : '세로 메뉴로 전환');
            button.setAttribute('title', vertical ? '가로 메뉴로 전환' : '세로 메뉴로 전환');
        }
        return next;
    }

    function applyToolbarPosition(toolbar, page, position) {
        if (!toolbar || !page || !position) return false;
        toolbar.style.left = finiteNumber(position.centerPct, 50, -100, 200) + '%';
        toolbar.style.top = finiteNumber(position.topPx, -50, -2000, 4000) + 'px';
        toolbar.style.right = 'auto';
        toolbar.style.bottom = 'auto';
        toolbar.style.transform = 'translateX(-50%)';
        toolbar.classList.add('is-positioned');
        return true;
    }

    function resetToolbarPosition(toolbar, page) {
        var storage = getToolbarStorage(page);
        try { if (storage) storage.removeItem(NOTE_COVER_TOOLBAR_POSITION_KEY); } catch (_) {}
        toolbar.style.left = '';
        toolbar.style.top = '';
        toolbar.style.right = '';
        toolbar.style.bottom = '';
        toolbar.style.transform = '';
        toolbar.classList.remove('is-positioned');
    }

    function bindToolbarDrag(toolbar, page) {
        if (!toolbar || !page || toolbar.__noteCoverDragBound) return;
        toolbar.__noteCoverDragBound = true;
        var doc = page.ownerDocument;
        var handle = toolbar.querySelector('[data-note-cover-toolbar-drag]');
        if (!doc || !handle) return;
        var saved = readToolbarPosition(page);
        if (saved) applyToolbarPosition(toolbar, page, saved);

        function captureCurrentPosition(offsetX, offsetY) {
            var pageRect = page.getBoundingClientRect();
            var toolbarRect = toolbar.getBoundingClientRect();
            if (!pageRect.width) return null;
            return {
                centerPct: ((toolbarRect.left - pageRect.left + toolbarRect.width / 2 + (offsetX || 0)) / pageRect.width) * 100,
                topPx: toolbarRect.top - pageRect.top + (offsetY || 0)
            };
        }

        handle.addEventListener('pointerdown', function (event) {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            var startX = event.clientX;
            var startY = event.clientY;
            var startPosition = captureCurrentPosition(0, 0);
            if (!startPosition) return;
            toolbar.classList.add('is-dragging');

            var onMove = function (moveEvent) {
                moveEvent.preventDefault();
                var pageRect = page.getBoundingClientRect();
                if (!pageRect.width) return;
                applyToolbarPosition(toolbar, page, {
                    centerPct: startPosition.centerPct + (moveEvent.clientX - startX) / pageRect.width * 100,
                    topPx: startPosition.topPx + moveEvent.clientY - startY
                });
            };
            var onUp = function (upEvent) {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onUp);
                toolbar.classList.remove('is-dragging');
                var next = captureCurrentPosition(0, 0);
                if (next) writeToolbarPosition(page, {
                    centerPct: roundedNumber(next.centerPct),
                    topPx: roundedNumber(next.topPx)
                });
                try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
                if (upEvent) upEvent.preventDefault();
            };
            doc.addEventListener('pointermove', onMove, { passive: false });
            doc.addEventListener('pointerup', onUp, { passive: false });
            doc.addEventListener('pointercancel', onUp, { passive: false });
            try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        });
        handle.addEventListener('keydown', function (event) {
            var key = String(event.key || '');
            if (!/^(?:ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(key)) return;
            event.preventDefault();
            event.stopPropagation();
            var step = event.shiftKey ? 24 : 8;
            var next = captureCurrentPosition(
                key === 'ArrowLeft' ? -step : (key === 'ArrowRight' ? step : 0),
                key === 'ArrowUp' ? -step : (key === 'ArrowDown' ? step : 0)
            );
            if (!next) return;
            applyToolbarPosition(toolbar, page, next);
            writeToolbarPosition(page, { centerPct: roundedNumber(next.centerPct), topPx: roundedNumber(next.topPx) });
        });
        handle.addEventListener('dblclick', function (event) {
            event.preventDefault();
            event.stopPropagation();
            resetToolbarPosition(toolbar, page);
        });
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

    function createMoveEdge(doc, side) {
        var edge = doc.createElement('span');
        edge.className = 'note-cover-move-edge note-cover-move-edge-' + side + ' no-print';
        edge.setAttribute('contenteditable', 'false');
        edge.setAttribute('aria-hidden', 'true');
        edge.setAttribute('title', '테두리를 드래그하여 텍스트 상자 이동');
        edge.setAttribute('data-html2canvas-ignore', 'true');
        return edge;
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

    function getPageScreenWidth(page) {
        var className = String(page && page.className || '');
        var match = className.match(/note-cover-size-([a-z0-9-]+)/i);
        var pageSize = PAGE_SIZES[(match && match[1] || 'a4').toLowerCase()] || PAGE_SIZES.a4;
        return pageSize.screenWidth;
    }

    function normalizeColorInput(value) {
        var color = String(value || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(color)) return color;
        if (/^#[0-9a-f]{3}$/i.test(color)) {
            return '#' + color.slice(1).split('').map(function (part) { return part + part; }).join('');
        }
        return '#111111';
    }

    function syncToolbarForSelection(page, element) {
        var toolbar = page && page.querySelector('.note-cover-floating-toolbar');
        if (!toolbar) return;
        var format = toolbar.querySelector('.note-cover-format-controls');
        var isText = !!(element && element.classList.contains('note-cover-text'));
        var remove = toolbar.querySelector('[data-note-cover-action="delete"]');
        if (remove) {
            remove.disabled = !element;
            remove.setAttribute('aria-disabled', element ? 'false' : 'true');
        }
        if (format) format.classList.toggle('is-hidden', !isText);
        if (!isText) return;
        var fontFamily = toolbar.querySelector('[data-note-cover-format="fontFamily"]');
        var fontSize = toolbar.querySelector('[data-note-cover-format="fontSize"]');
        var rotation = toolbar.querySelector('[data-note-cover-geometry="rotation"]');
        var color = toolbar.querySelector('[data-note-cover-format="color"]');
        var bold = toolbar.querySelector('[data-note-cover-action="bold"]');
        var italic = toolbar.querySelector('[data-note-cover-action="italic"]');
        var weightValue = String(element.getAttribute('data-note-cover-font-weight') || '400');
        var styleValue = String(element.getAttribute('data-note-cover-font-style') || 'normal');
        if (fontFamily) fontFamily.value = String(element.getAttribute('data-note-cover-font-family') || 'Arial');
        if (fontSize) fontSize.value = String(Math.round(finiteNumber(element.getAttribute('data-note-cover-font-size'), 16, 4, 600)));
        if (rotation) rotation.value = String(normalizedRotation(element.getAttribute('data-note-cover-rotation')));
        if (color) color.value = normalizeColorInput(element.getAttribute('data-note-cover-color'));
        if (bold) bold.setAttribute('aria-pressed', /^(?:bold|bolder|[6-9]00)$/i.test(weightValue) ? 'true' : 'false');
        if (italic) italic.setAttribute('aria-pressed', styleValue === 'italic' ? 'true' : 'false');
    }

    function selectCoverElement(element) {
        if (!element || !element.closest) return false;
        var page = element.closest('.note-cover-page');
        if (!page) return false;
        Array.prototype.forEach.call(page.querySelectorAll('.note-cover-element.is-selected'), function (candidate) {
            if (candidate !== element) candidate.classList.remove('is-selected');
        });
        element.classList.add('is-selected');
        setPendingSelection(page.getAttribute('data-note-cover-index'), element.getAttribute('data-note-cover-element-id'));
        syncToolbarForSelection(page, element);
        return true;
    }

    function emitTextStyleChange(element, hydrateOptions, style) {
        if (!element || !style) return;
        var page = element.closest('.note-cover-page');
        var screenWidth = getPageScreenWidth(page);
        if (Object.prototype.hasOwnProperty.call(style, 'fontFamily')) {
            var family = safeFontFamily(style.fontFamily) || 'Arial';
            element.style.fontFamily = family;
            element.setAttribute('data-note-cover-font-family', family);
        }
        if (Object.prototype.hasOwnProperty.call(style, 'fontSize')) {
            var size = finiteNumber(style.fontSize, 16, 4, 600);
            element.style.fontSize = (size / screenWidth * 100).toFixed(5) + 'cqw';
            element.setAttribute('data-note-cover-font-size', roundedNumber(size));
        }
        if (Object.prototype.hasOwnProperty.call(style, 'color')) {
            var color = safeColor(style.color, '#111111');
            element.style.color = color;
            element.setAttribute('data-note-cover-color', color);
        }
        if (Object.prototype.hasOwnProperty.call(style, 'fontWeight')) {
            var weight = safeFontWeight(style.fontWeight);
            element.style.fontWeight = weight;
            element.setAttribute('data-note-cover-font-weight', weight);
        }
        if (Object.prototype.hasOwnProperty.call(style, 'fontStyle')) {
            var fontStyle = safeFontStyle(style.fontStyle);
            element.style.fontStyle = fontStyle;
            element.setAttribute('data-note-cover-font-style', fontStyle);
        }
        if (typeof hydrateOptions.onStyleChange === 'function') {
            hydrateOptions.onStyleChange({
                coverIndex: Number(page.getAttribute('data-note-cover-index')) || 0,
                elementId: String(element.getAttribute('data-note-cover-element-id') || ''),
                style: style,
                phase: 'commit'
            });
        }
    }

    function applyTextRotationControl(element, hydrateOptions, value, commit) {
        if (!element || !element.classList.contains('note-cover-text')) return false;
        var raw = String(value == null ? '' : value).trim();
        if (!raw) return false;
        var rotation = normalizedRotation(raw);
        element.style.transform = 'rotate(' + roundedNumber(rotation) + 'deg)';
        element.setAttribute('data-note-cover-rotation', roundedNumber(rotation));
        if (commit && typeof hydrateOptions.onGeometryChange === 'function') {
            hydrateOptions.onGeometryChange(getCoverChangeDetail(element, { rotation: rotation }, 'commit'));
        }
        return true;
    }

    function ensureFloatingToolbar(page, hydrateOptions) {
        if (!page || page.querySelector('.note-cover-floating-toolbar')) return;
        var doc = page.ownerDocument;
        var toolbar = doc.createElement('div');
        toolbar.className = 'note-cover-floating-toolbar no-print';
        toolbar.setAttribute('contenteditable', 'false');
        toolbar.setAttribute('data-html2canvas-ignore', 'true');
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', '표지 편집 도구');
        toolbar.innerHTML = ''
            + '<span class="note-cover-toolbar-drag-handle" data-note-cover-toolbar-drag '
            + 'role="button" tabindex="0" aria-label="표지 편집 메뉴 이동" '
            + 'title="드래그하여 메뉴 이동 · 더블클릭하여 위치 초기화">⠿</span>'
            + '<button type="button" class="note-cover-toolbar-orientation" '
            + 'data-note-cover-action="toggle-orientation" aria-pressed="false" '
            + 'aria-label="세로 메뉴로 전환" title="세로 메뉴로 전환">↕</button>'
            + '<div class="note-cover-toolbar-main">'
            + '<button type="button" data-note-cover-action="undo" title="실행 취소 (Ctrl+Z)">↶</button>'
            + '<button type="button" data-note-cover-action="redo" title="다시 실행 (Ctrl+Shift+Z)">↷</button>'
            + '<button type="button" data-note-cover-action="add-text">+ 텍스트</button>'
            + '<button type="button" data-note-cover-action="add-image">+ 이미지</button>'
            + '<button type="button" data-note-cover-action="delete" title="선택 요소 삭제 (Delete)" disabled aria-disabled="true">삭제</button>'
            + '</div>'
            + '<div class="note-cover-format-controls is-hidden">'
            + '<select data-note-cover-format="fontFamily" aria-label="폰트" title="폰트">'
            + '<option value="Arial">Arial</option><option value="Noto Sans KR">Noto Sans KR</option>'
            + '<option value="Malgun Gothic">맑은 고딕</option><option value="Batang">바탕</option>'
            + '<option value="Times New Roman">Times New Roman</option></select>'
            + '<input type="number" data-note-cover-format="fontSize" min="4" max="600" step="1" aria-label="글자 크기" title="글자 크기">'
            + '<div class="note-cover-rotation-control" role="group" aria-label="텍스트 회전 각도 조절" title="텍스트 회전 각도">'
            + '<button type="button" class="note-cover-rotation-step" data-note-cover-action="rotation-down" title="1도 감소 (Shift: 10도)">−</button>'
            + '<input type="number" data-note-cover-geometry="rotation" min="-180" max="179" step="1" '
            + 'aria-label="텍스트 회전 각도" title="텍스트 회전 각도"><span class="note-cover-rotation-unit">°</span>'
            + '<button type="button" class="note-cover-rotation-step" data-note-cover-action="rotation-up" title="1도 증가 (Shift: 10도)">+</button></div>'
            + '<input type="color" data-note-cover-format="color" aria-label="글자 색" title="글자 색">'
            + '<button type="button" data-note-cover-action="bold" aria-pressed="false" title="굵게">B</button>'
            + '<button type="button" data-note-cover-action="italic" aria-pressed="false" title="기울임">I</button>'
            + '</div>';
        applyToolbarOrientation(toolbar, readToolbarOrientation(page));
        page.appendChild(toolbar);
        bindToolbarDrag(toolbar, page);
        toolbar.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        toolbar.addEventListener('click', function (event) {
            var button = event.target && event.target.closest ? event.target.closest('button[data-note-cover-action]') : null;
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            var action = String(button.getAttribute('data-note-cover-action') || '');
            var coverIndex = Number(page.getAttribute('data-note-cover-index')) || 0;
            var selected = page.querySelector('.note-cover-element.is-selected');
            if (action === 'toggle-orientation') {
                var nextOrientation = toolbar.classList.contains('is-vertical') ? 'horizontal' : 'vertical';
                writeToolbarOrientation(page, applyToolbarOrientation(toolbar, nextOrientation));
            }
            else if (action === 'undo' && typeof hydrateOptions.onUndo === 'function') hydrateOptions.onUndo({ coverIndex: coverIndex });
            else if (action === 'redo' && typeof hydrateOptions.onRedo === 'function') hydrateOptions.onRedo({ coverIndex: coverIndex });
            else if (action === 'add-text' && typeof hydrateOptions.onAddText === 'function') hydrateOptions.onAddText({ coverIndex: coverIndex });
            else if (action === 'add-image' && typeof hydrateOptions.onAddImage === 'function') hydrateOptions.onAddImage({ coverIndex: coverIndex });
            else if (action === 'delete' && selected && typeof hydrateOptions.onDelete === 'function') {
                hydrateOptions.onDelete({
                    coverIndex: coverIndex,
                    elementId: String(selected.getAttribute('data-note-cover-element-id') || ''),
                    elementType: selected.classList.contains('note-cover-image') ? 'image' : 'text',
                    source: 'toolbar'
                });
            }
            else if (selected && selected.classList.contains('note-cover-text') && /^(?:rotation-down|rotation-up)$/.test(action)) {
                var rotationControl = toolbar.querySelector('[data-note-cover-geometry="rotation"]');
                var currentRotation = normalizedRotation(rotationControl ? rotationControl.value : selected.getAttribute('data-note-cover-rotation'));
                var rotationStep = event.shiftKey ? 10 : 1;
                var nextRotation = normalizedRotation(currentRotation + (action === 'rotation-up' ? rotationStep : -rotationStep));
                if (rotationControl) rotationControl.value = String(nextRotation);
                applyTextRotationControl(selected, hydrateOptions, nextRotation, true);
            }
            else if (selected && selected.classList.contains('note-cover-text') && action === 'bold') {
                var isBold = button.getAttribute('aria-pressed') === 'true';
                button.setAttribute('aria-pressed', isBold ? 'false' : 'true');
                emitTextStyleChange(selected, hydrateOptions, { fontWeight: isBold ? '400' : '700' });
            } else if (selected && selected.classList.contains('note-cover-text') && action === 'italic') {
                var isItalic = button.getAttribute('aria-pressed') === 'true';
                button.setAttribute('aria-pressed', isItalic ? 'false' : 'true');
                emitTextStyleChange(selected, hydrateOptions, { fontStyle: isItalic ? 'normal' : 'italic' });
            }
        });
        Array.prototype.forEach.call(toolbar.querySelectorAll('[data-note-cover-format]'), function (control) {
            var applyControlValue = function (event) {
                event.stopPropagation();
                var selected = page.querySelector('.note-cover-text.is-selected');
                if (!selected) return;
                var property = String(control.getAttribute('data-note-cover-format') || '');
                var style = {};
                style[property] = property === 'fontSize' ? Number(control.value) : control.value;
                emitTextStyleChange(selected, hydrateOptions, style);
            };
            control.addEventListener('change', applyControlValue);
            if (String(control.tagName || '').toLowerCase() === 'input') {
                control.addEventListener('input', applyControlValue);
            }
        });
        var rotationControl = toolbar.querySelector('[data-note-cover-geometry="rotation"]');
        if (rotationControl) {
            var rotationCommitTimer = 0;
            var timerHost = doc.defaultView || root;
            var clearRotationCommitTimer = function () {
                if (!rotationCommitTimer) return;
                timerHost.clearTimeout(rotationCommitTimer);
                rotationCommitTimer = 0;
            };
            rotationControl.addEventListener('input', function (event) {
                event.stopPropagation();
                var selected = page.querySelector('.note-cover-text.is-selected');
                if (!selected || !applyTextRotationControl(selected, hydrateOptions, rotationControl.value, false)) return;
                clearRotationCommitTimer();
                var pendingElement = selected;
                var pendingValue = rotationControl.value;
                rotationCommitTimer = timerHost.setTimeout(function () {
                    rotationCommitTimer = 0;
                    applyTextRotationControl(pendingElement, hydrateOptions, pendingValue, true);
                }, 320);
            });
            rotationControl.addEventListener('change', function (event) {
                event.stopPropagation();
                clearRotationCommitTimer();
                var selected = page.querySelector('.note-cover-text.is-selected');
                if (!selected) return;
                if (applyTextRotationControl(selected, hydrateOptions, rotationControl.value, true)) {
                    rotationControl.value = String(normalizedRotation(rotationControl.value));
                }
            });
        }
    }

    function bindElementGeometryControls(element, hydrateOptions) {
        var doc = element && element.ownerDocument;
        if (!doc || element.__noteCoverGeometryBound) return false;
        element.__noteCoverGeometryBound = true;
        var isImage = element.classList.contains('note-cover-image');
        var moveHandle = isImage ? createTransformHandle(doc, 'note-cover-move-handle', '이미지 이동') : null;
        var moveEdges = isImage ? [] : ['top', 'right', 'bottom', 'left'].map(function (side) {
            return createMoveEdge(doc, side);
        });
        var resizeHandle = createTransformHandle(doc, 'note-cover-resize-handle', (isImage ? '이미지' : '텍스트 상자') + ' 크기 조절');
        var rotateHandle = createTransformHandle(doc, 'note-cover-rotate-handle', (isImage ? '이미지' : '텍스트 상자') + ' 회전');
        if (moveHandle) element.appendChild(moveHandle);
        moveEdges.forEach(function (edge) { element.appendChild(edge); });
        element.appendChild(resizeHandle);
        element.appendChild(rotateHandle);

        function beginPointerTransform(event, mode) {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            selectCoverElement(element);
            var canvas = element.closest ? element.closest('.note-cover-canvas') : null;
            if (!canvas) return;
            var canvasRect = canvas.getBoundingClientRect();
            var elementRect = element.getBoundingClientRect();
            if (!canvasRect.width || !canvasRect.height) return;

            var startPointerX = event.clientX;
            var startPointerY = event.clientY;
            var startElementX = finiteNumber(element.getAttribute('data-note-cover-x'), 0, -1000, 1000);
            var startElementY = finiteNumber(element.getAttribute('data-note-cover-y'), 0, -1000, 1000);
            var startW = finiteNumber(element.getAttribute('data-note-cover-w'), 10, 1, 2000);
            var startH = finiteNumber(element.getAttribute('data-note-cover-h'), 10, 0.5, 2000);
            var startRotation = normalizedRotation(element.getAttribute('data-note-cover-rotation'));
            var centerX = elementRect.left + elementRect.width / 2;
            var centerY = elementRect.top + elementRect.height / 2;
            var startPointerAngle = Math.atan2(startPointerY - centerY, startPointerX - centerX) * 180 / Math.PI;
            var nextX = startElementX;
            var nextY = startElementY;
            var nextW = startW;
            var nextH = startH;
            var nextRotation = startRotation;
            element.classList.add('is-transforming');

            var onMove = function (moveEvent) {
                moveEvent.preventDefault();
                var dx = moveEvent.clientX - startPointerX;
                var dy = moveEvent.clientY - startPointerY;
                if (mode === 'move') {
                    nextX = startElementX + dx / canvasRect.width * 100;
                    nextY = startElementY + dy / canvasRect.height * 100;
                    element.style.left = roundedNumber(nextX) + '%';
                    element.style.top = roundedNumber(nextY) + '%';
                } else if (mode === 'resize') {
                    var radians = startRotation * Math.PI / 180;
                    var localDx = dx * Math.cos(radians) + dy * Math.sin(radians);
                    var localDy = -dx * Math.sin(radians) + dy * Math.cos(radians);
                    nextW = Math.max(1, startW + localDx / canvasRect.width * 100);
                    nextH = Math.max(0.5, startH + localDy / canvasRect.height * 100);
                    if (isImage || moveEvent.shiftKey) {
                        var ratio = startW / Math.max(0.5, startH);
                        if (Math.abs(localDx) >= Math.abs(localDy)) nextH = nextW / ratio;
                        else nextW = nextH * ratio;
                    }
                    element.style.width = roundedNumber(nextW) + '%';
                    element.style.height = roundedNumber(nextH) + '%';
                } else {
                    var pointerAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
                    nextRotation = normalizedRotation(startRotation + pointerAngle - startPointerAngle);
                    if (moveEvent.shiftKey) nextRotation = Math.round(nextRotation / 15) * 15;
                    element.style.transform = 'rotate(' + roundedNumber(nextRotation) + 'deg)';
                }
            };
            var onUp = function (upEvent) {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onUp);
                element.classList.remove('is-transforming');
                element.setAttribute('data-note-cover-x', roundedNumber(nextX));
                element.setAttribute('data-note-cover-y', roundedNumber(nextY));
                element.setAttribute('data-note-cover-w', roundedNumber(nextW));
                element.setAttribute('data-note-cover-h', roundedNumber(nextH));
                element.setAttribute('data-note-cover-rotation', roundedNumber(nextRotation));
                if (typeof hydrateOptions.onGeometryChange === 'function') {
                    hydrateOptions.onGeometryChange(getCoverChangeDetail(element, {
                        x: nextX, y: nextY, w: nextW, h: nextH, rotation: nextRotation
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

        if (moveHandle) moveHandle.addEventListener('pointerdown', function (event) { beginPointerTransform(event, 'move'); });
        moveEdges.forEach(function (edge) {
            edge.addEventListener('pointerenter', function () { element.classList.add('is-border-move-ready'); });
            edge.addEventListener('pointerleave', function () {
                if (!element.classList.contains('is-transforming')) element.classList.remove('is-border-move-ready');
            });
            edge.addEventListener('pointerdown', function (event) { beginPointerTransform(event, 'move'); });
        });
        resizeHandle.addEventListener('pointerdown', function (event) { beginPointerTransform(event, 'resize'); });
        rotateHandle.addEventListener('pointerdown', function (event) { beginPointerTransform(event, 'rotate'); });
        element.addEventListener('click', function (event) {
            if (event.target && event.target.closest && event.target.closest('.note-cover-image-replace, .note-cover-image-delete')) return;
            selectCoverElement(element);
            event.stopPropagation();
        });
        if (isImage) {
            element.addEventListener('pointerdown', function (event) {
                if (event.target && event.target.closest && event.target.closest('.note-cover-transform-handle, .note-cover-image-replace, .note-cover-image-delete')) return;
                beginPointerTransform(event, 'move');
            });
        }
        return true;
    }

    function bindCoverKeyboard(doc, rootElement, hydrateOptions) {
        if (!doc) return;
        doc.__noteCoverHydrateOptions = hydrateOptions;
        doc.__noteCoverRootElement = rootElement;
        if (doc.__noteCoverKeyboardBound) return;
        doc.__noteCoverKeyboardBound = true;
        doc.addEventListener('keydown', function (event) {
            var options = doc.__noteCoverHydrateOptions || {};
            var targetInCover = !!(event.target && event.target.closest && event.target.closest('.note-cover-page'));
            var root = doc.__noteCoverRootElement;
            var selected = root && root.querySelector ? root.querySelector('.note-cover-element.is-selected') : null;
            var key = String(event.key || '').toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 'z' && (targetInCover || selected)) {
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                    if (typeof options.onRedo === 'function') options.onRedo({ source: 'keyboard' });
                } else if (typeof options.onUndo === 'function') {
                    options.onUndo({ source: 'keyboard' });
                }
                return;
            }
            var editingTarget = !!(event.target && (
                event.target.isContentEditable ||
                (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'))
            ));
            if (!selected || editingTarget || event.ctrlKey || event.metaKey || event.altKey
                || (key !== 'delete' && key !== 'backspace') || typeof options.onDelete !== 'function') return;
            event.preventDefault();
            event.stopPropagation();
            var page = selected.closest ? selected.closest('.note-cover-page') : null;
            options.onDelete({
                coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
                elementId: String(selected.getAttribute('data-note-cover-element-id') || ''),
                elementType: selected.classList.contains('note-cover-image') ? 'image' : 'text',
                source: 'keyboard'
            });
        }, true);
    }

    function hydrate(rootElement, options) {
        if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return 0;
        var hydrateOptions = options || {};
        var pages = rootElement.querySelectorAll('.note-cover-page');
        Array.prototype.forEach.call(pages, function (page) {
            ensureFloatingToolbar(page, hydrateOptions);
            page.addEventListener('click', function (event) {
                if (event.target !== page && !(event.target && event.target.classList && event.target.classList.contains('note-cover-canvas'))) return;
                Array.prototype.forEach.call(page.querySelectorAll('.note-cover-element.is-selected'), function (element) {
                    element.classList.remove('is-selected');
                });
                syncToolbarForSelection(page, null);
            });
        });
        bindCoverKeyboard(rootElement.ownerDocument, rootElement, hydrateOptions);

        var imageWrappers = rootElement.querySelectorAll('.note-cover-image');
        Array.prototype.forEach.call(imageWrappers, function (wrapper) {
            if (!wrapper || wrapper.__noteCoverBound) return;
            wrapper.__noteCoverBound = true;
            bindElementGeometryControls(wrapper, hydrateOptions);
            var image = wrapper.querySelector('img');
            var markLoaded = function () { wrapper.classList.add('is-loaded'); wrapper.classList.remove('is-missing'); };
            var markMissing = function () { wrapper.classList.add('is-missing'); wrapper.classList.remove('is-loaded'); };
            if (image) {
                image.addEventListener('load', markLoaded);
                image.addEventListener('error', markMissing);
                if (image.complete) { if (image.naturalWidth > 0) markLoaded(); else markMissing(); }
            } else markMissing();
            var fallback = wrapper.querySelector('.note-cover-image-fallback');
            var replaceButton = wrapper.querySelector('.note-cover-image-replace');
            var deleteButton = wrapper.querySelector('.note-cover-image-delete');
            if (typeof hydrateOptions.onImageRelink === 'function') {
                var requestRelink = function (event) {
                    if (event) { event.preventDefault(); event.stopPropagation(); }
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
                    fallback.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') requestRelink(event); });
                }
                if (replaceButton) {
                    replaceButton.addEventListener('click', requestRelink);
                    replaceButton.addEventListener('dblclick', function (event) { event.preventDefault(); event.stopPropagation(); });
                }
                wrapper.addEventListener('dblclick', requestRelink);
            }
            if (deleteButton && typeof hydrateOptions.onDelete === 'function') {
                deleteButton.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var page = wrapper.closest ? wrapper.closest('.note-cover-page') : null;
                    hydrateOptions.onDelete({
                        coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
                        elementId: String(wrapper.getAttribute('data-note-cover-element-id') || ''),
                        elementType: 'image',
                        source: 'image-button'
                    });
                });
                deleteButton.addEventListener('dblclick', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                });
            }
        });
        var editableTexts = rootElement.querySelectorAll('.note-cover-text[data-note-cover-text-editable="1"]');
        Array.prototype.forEach.call(editableTexts, function (textElement) {
            if (!textElement || textElement.__noteCoverEditBound) return;
            textElement.__noteCoverEditBound = true;
            bindElementGeometryControls(textElement, hydrateOptions);
            var timer = null;
            var lastEmittedText = readEditableText(textElement);
            var emitChange = function (phase) {
                if (timer) { clearTimeout(timer); timer = null; }
                var text = readEditableText(textElement);
                if (text === lastEmittedText && phase !== 'commit') return;
                lastEmittedText = text;
                var page = textElement.closest ? textElement.closest('.note-cover-page') : null;
                if (typeof hydrateOptions.onTextChange === 'function') {
                    hydrateOptions.onTextChange({
                        coverIndex: Number(page && page.getAttribute('data-note-cover-index')) || 0,
                        elementId: String(textElement.getAttribute('data-note-cover-element-id') || ''),
                        text: text,
                        phase: phase || 'input'
                    });
                }
            };
            textElement.addEventListener('focus', function () { textElement.classList.add('is-editing'); selectCoverElement(textElement); });
            textElement.addEventListener('blur', function () { textElement.classList.remove('is-editing'); emitChange('commit'); });
            textElement.addEventListener('input', function () { if (timer) clearTimeout(timer); timer = setTimeout(function () { emitChange('input'); }, 80); });
            textElement.addEventListener('paste', function (event) {
                var clipboard = event.clipboardData || (root && root.clipboardData);
                if (!clipboard) return;
                event.preventDefault();
                insertPlainTextAtSelection(textElement, clipboard.getData('text/plain') || '');
            });
            textElement.addEventListener('keydown', function (event) {
                event.stopPropagation();
                if (event.key === 'Escape') { event.preventDefault(); textElement.blur(); }
            });
            textElement.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        });

        Array.prototype.forEach.call(pages, function (page) {
            var pageIndex = Number(page.getAttribute('data-note-cover-index')) || 0;
            if (selectedElementId && pageIndex === selectedCoverIndex) {
                var candidates = page.querySelectorAll('.note-cover-element[data-note-cover-element-id]');
                Array.prototype.forEach.call(candidates, function (element) {
                    if (String(element.getAttribute('data-note-cover-element-id') || '') === selectedElementId) selectCoverElement(element);
                });
            }
        });
        return imageWrappers.length + editableTexts.length;
    }

    return {
        PAGE_SIZES: PAGE_SIZES,
        parseBlock: parseBlock,
        parseJsonWithCommonRepairs: parseJsonWithCommonRepairs,
        createDefaultConfig: createDefaultConfig,
        serializeConfig: serializeConfig,
        findFirstCoverBlock: findFirstCoverBlock,
        insertDefaultCover: insertDefaultCover,
        collectLayerElements: collectLayerElements,
        renderHtml: renderHtml,
        replaceInMarkdown: replaceInMarkdown,
        updateTextElementInMarkdown: updateTextElementInMarkdown,
        updateElementGeometryInMarkdown: updateElementGeometryInMarkdown,
        updateTextElementStyleInMarkdown: updateTextElementStyleInMarkdown,
        updateImageElementPathInMarkdown: updateImageElementPathInMarkdown,
        addElementInMarkdown: addElementInMarkdown,
        removeElementInMarkdown: removeElementInMarkdown,
        setPendingSelection: setPendingSelection,
        hydrate: hydrate,
        safeImageSource: safeImageSource
    };
});

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
            + escapeHtml(element.id) + '" style="' + escapeHtml(style) + '">'
            + escapeHtml(element.text || '') + '</div>';
    }

    function renderImageElement(element, layerIndex) {
        var source = safeImageSource(element.path || element.src || '');
        var style = getBoxStyle(element, layerIndex);
        var alt = element.name || '표지 이미지';
        if (!source) {
            return '<div class="note-cover-element note-cover-image-missing" data-note-cover-element-id="'
                + escapeHtml(element.id) + '" style="' + escapeHtml(style) + '">이미지 경로 없음</div>';
        }
        return '<div class="note-cover-element note-cover-image" data-note-cover-element-id="'
            + escapeHtml(element.id) + '" style="' + escapeHtml(style) + '">'
            + '<span class="note-cover-image-fallback">' + escapeHtml(alt) + '</span><img src="'
            + escapeHtml(source) + '" alt="' + escapeHtml(alt) + '" loading="lazy"></div>';
    }

    function renderElement(element, layerIndex, screenWidth) {
        var type = String(element.type || '').toLowerCase();
        if (type === 'text') return renderTextElement(element, layerIndex, screenWidth);
        if (type === 'image') return renderImageElement(element, layerIndex);
        return '';
    }

    function renderHtml(config) {
        if (!config || config.enabled === false) return '';
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
            + escapeHtml(config.v || 1) + '" style="' + escapeHtml(pageStyle) + '">';
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
        BLOCK_RE.lastIndex = 0;
        return source.replace(BLOCK_RE, function (_, jsonText) {
            try {
                var config = parseBlock(jsonText);
                return '\n\n' + renderHtml(config) + '\n\n';
            } catch (error) {
                return '\n\n' + renderError(error) + '\n\n';
            }
        });
    }

    function hydrate(rootElement) {
        if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return 0;
        var images = rootElement.querySelectorAll('.note-cover-image img');
        Array.prototype.forEach.call(images, function (image) {
            var wrapper = image.closest ? image.closest('.note-cover-image') : image.parentElement;
            if (!wrapper || image.__noteCoverBound) return;
            image.__noteCoverBound = true;
            var markLoaded = function () {
                wrapper.classList.add('is-loaded');
                wrapper.classList.remove('is-missing');
            };
            var markMissing = function () {
                wrapper.classList.add('is-missing');
                wrapper.classList.remove('is-loaded');
            };
            image.addEventListener('load', markLoaded);
            image.addEventListener('error', markMissing);
            if (image.complete) {
                if (image.naturalWidth > 0) markLoaded();
                else markMissing();
            }
        });
        return images.length;
    }

    return {
        PAGE_SIZES: PAGE_SIZES,
        parseBlock: parseBlock,
        collectLayerElements: collectLayerElements,
        renderHtml: renderHtml,
        replaceInMarkdown: replaceInMarkdown,
        hydrate: hydrate,
        safeImageSource: safeImageSource
    };
});

(function (global) {
    'use strict';

    var activeSession = null;
    var overlay = null;
    var sizeLabel = null;
    var confirmButton = null;
    var cancelButton = null;
    var bound = false;
    var imageSelector = '#viewer img';
    var sourceMarkdown = '';

    function clampDimension(value) {
        return Math.max(24, Math.min(10000, Math.round(Number(value) || 24)));
    }

    function escapeAttribute(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function unescapeMarkdown(value) {
        return String(value || '').replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1');
    }

    function collectProtectedRanges(source) {
        var ranges = [];
        var match;
        var comments = /<!--[\s\S]*?-->/g;
        while ((match = comments.exec(source))) ranges.push([match.index, comments.lastIndex]);

        var lines = source.split(/\n/);
        var offset = 0;
        var fence = null;
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i];
            var fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
            if (!fence && fenceMatch) {
                fence = { marker: fenceMatch[1].charAt(0), length: fenceMatch[1].length, start: offset };
            } else if (fence && new RegExp('^ {0,3}' + (fence.marker === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$').test(line)) {
                ranges.push([fence.start, offset + line.length]);
                fence = null;
            }
            offset += line.length + 1;
        }
        if (fence) ranges.push([fence.start, source.length]);

        var code = /(`+)([^\n]*?)\1/g;
        while ((match = code.exec(source))) ranges.push([match.index, code.lastIndex]);
        ranges.sort(function (a, b) { return a[0] - b[0]; });
        return ranges;
    }

    function isProtected(index, ranges) {
        for (var i = 0; i < ranges.length; i += 1) {
            if (index < ranges[i][0]) return false;
            if (index >= ranges[i][0] && index < ranges[i][1]) return true;
        }
        return false;
    }

    function findClosing(source, start, openChar, closeChar) {
        var depth = 0;
        var quote = '';
        for (var i = start; i < source.length; i += 1) {
            var ch = source.charAt(i);
            if (ch === '\\') { i += 1; continue; }
            if (quote) {
                if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; continue; }
            if (ch === openChar) depth += 1;
            else if (ch === closeChar) {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function parseDestination(body) {
        var text = String(body || '').trim();
        if (!text) return null;
        var src = '';
        var rest = '';
        if (text.charAt(0) === '<') {
            var endAngle = text.indexOf('>');
            if (endAngle < 0) return null;
            src = text.slice(1, endAngle);
            rest = text.slice(endAngle + 1).trim();
        } else {
            var depth = 0;
            var end = text.length;
            for (var i = 0; i < text.length; i += 1) {
                var ch = text.charAt(i);
                if (ch === '\\') { i += 1; continue; }
                if (ch === '(') depth += 1;
                else if (ch === ')' && depth > 0) depth -= 1;
                else if (/\s/.test(ch) && depth === 0) { end = i; break; }
            }
            src = text.slice(0, end);
            rest = text.slice(end).trim();
        }
        var title = '';
        var titleMatch = rest.match(/^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/);
        if (titleMatch) title = titleMatch[1] || titleMatch[2] || titleMatch[3] || '';
        return { src: unescapeMarkdown(src), title: unescapeMarkdown(title) };
    }

    function collectReferenceDefinitions(source) {
        var defs = Object.create(null);
        var re = /^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/gm;
        var match;
        while ((match = re.exec(source))) {
            var rawSrc = match[2] || '';
            defs[String(match[1] || '').trim().toLowerCase()] = {
                src: unescapeMarkdown(rawSrc.charAt(0) === '<' ? rawSrc.slice(1, -1) : rawSrc),
                title: unescapeMarkdown(match[3] || match[4] || match[5] || '')
            };
        }
        return defs;
    }

    function findHtmlTagEnd(source, start) {
        var quote = '';
        for (var i = start; i < source.length; i += 1) {
            var ch = source.charAt(i);
            if (quote) {
                if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") quote = ch;
            else if (ch === '>') return i + 1;
        }
        return -1;
    }

    function readHtmlAttribute(tag, name) {
        var match = String(tag || '').match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
        return match ? (match[1] != null ? match[1] : (match[2] != null ? match[2] : match[3])) : '';
    }

    function scanImageReferences(markdown) {
        var source = String(markdown || '');
        var protectedRanges = collectProtectedRanges(source);
        var definitions = collectReferenceDefinitions(source);
        var records = [];
        var i = 0;
        while (i < source.length) {
            if (isProtected(i, protectedRanges)) { i += 1; continue; }

            if (source.slice(i, i + 4).toLowerCase() === '<img') {
                var afterName = source.charAt(i + 4);
                if (!afterName || /[\s/>]/.test(afterName)) {
                    var htmlEnd = findHtmlTagEnd(source, i + 4);
                    if (htmlEnd > i) {
                        var htmlRaw = source.slice(i, htmlEnd);
                        records.push({
                            type: 'html', start: i, end: htmlEnd, raw: htmlRaw,
                            src: readHtmlAttribute(htmlRaw, 'src'),
                            alt: readHtmlAttribute(htmlRaw, 'alt'),
                            title: readHtmlAttribute(htmlRaw, 'title')
                        });
                        i = htmlEnd;
                        continue;
                    }
                }
            }

            if (source.slice(i, i + 2) === '![') {
                var altEnd = findClosing(source, i + 1, '[', ']');
                if (altEnd > i) {
                    var alt = unescapeMarkdown(source.slice(i + 2, altEnd));
                    var next = altEnd + 1;
                    var parsed = null;
                    var imageEnd = -1;
                    if (source.charAt(next) === '(') {
                        var destEnd = findClosing(source, next, '(', ')');
                        if (destEnd > next) {
                            parsed = parseDestination(source.slice(next + 1, destEnd));
                            imageEnd = destEnd + 1;
                        }
                    } else if (source.charAt(next) === '[') {
                        var labelEnd = findClosing(source, next, '[', ']');
                        if (labelEnd > next) {
                            var label = source.slice(next + 1, labelEnd).trim() || alt;
                            parsed = definitions[label.toLowerCase()] || null;
                            imageEnd = labelEnd + 1;
                        }
                    } else {
                        parsed = definitions[alt.trim().toLowerCase()] || null;
                        imageEnd = parsed ? altEnd + 1 : -1;
                    }
                    if (parsed && parsed.src && imageEnd > i) {
                        records.push({
                            type: 'markdown', start: i, end: imageEnd,
                            raw: source.slice(i, imageEnd), src: parsed.src,
                            alt: alt, title: parsed.title || ''
                        });
                        i = imageEnd;
                        continue;
                    }
                }
            }
            i += 1;
        }
        return records;
    }

    function stripDimensionStyles(styleText) {
        return String(styleText || '').split(';').map(function (part) { return part.trim(); }).filter(function (part) {
            return part && !/^(?:width|height)\s*:/i.test(part);
        }).join('; ');
    }

    function setHtmlAttribute(tag, name, value) {
        var attrRe = new RegExp('(\\s' + name + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
        if (attrRe.test(tag)) return tag.replace(attrRe, ' ' + name + '="' + escapeAttribute(value) + '"');
        var closeIndex = tag.lastIndexOf('/>');
        if (closeIndex < 0) closeIndex = tag.lastIndexOf('>');
        if (closeIndex < 0) return tag;
        return tag.slice(0, closeIndex) + ' ' + name + '="' + escapeAttribute(value) + '"' + tag.slice(closeIndex);
    }

    function updateHtmlImageTag(raw, width, height) {
        var tag = String(raw || '');
        var style = readHtmlAttribute(tag, 'style');
        if (style) {
            var cleaned = stripDimensionStyles(style);
            var styleRe = /(\sstyle\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
            if (cleaned) tag = tag.replace(styleRe, ' style="' + escapeAttribute(cleaned) + '"');
            else tag = tag.replace(styleRe, '');
        }
        tag = setHtmlAttribute(tag, 'width', clampDimension(width));
        tag = setHtmlAttribute(tag, 'height', clampDimension(height));
        return tag;
    }

    function buildHtmlImage(record, width, height) {
        var html = '<img src="' + escapeAttribute(record.src) + '" alt="' + escapeAttribute(record.alt || '') + '"';
        if (record.title) html += ' title="' + escapeAttribute(record.title) + '"';
        html += ' width="' + clampDimension(width) + '" height="' + clampDimension(height) + '">';
        return html;
    }

    function replaceImageReference(markdown, record, width, height) {
        var source = String(markdown || '');
        if (!record) return { changed: false, markdown: source, reason: 'missing-record' };
        var start = Number(record.start);
        var end = Number(record.end);
        if (start < 0 || end <= start || source.slice(start, end) !== String(record.raw || '')) {
            var matches = scanImageReferences(source).filter(function (candidate) {
                return candidate.raw === record.raw && candidate.src === record.src && candidate.alt === record.alt;
            });
            if (!matches.length) return { changed: false, markdown: source, reason: 'source-changed' };
            matches.sort(function (a, b) { return Math.abs(a.start - start) - Math.abs(b.start - start); });
            start = matches[0].start;
            end = matches[0].end;
            record = matches[0];
        }
        var replacement = record.type === 'html'
            ? updateHtmlImageTag(record.raw, width, height)
            : buildHtmlImage(record, width, height);
        return {
            changed: replacement !== source.slice(start, end),
            markdown: source.slice(0, start) + replacement + source.slice(end),
            start: start,
            end: start + replacement.length,
            replacement: replacement
        };
    }

    function decodeHtml(value) {
        if (!global.document) return String(value || '');
        var textarea = global.document.createElement('textarea');
        textarea.innerHTML = String(value || '');
        return textarea.value;
    }

    function comparableSource(img) {
        var internalId = img.getAttribute('data-internal-id');
        if (internalId) return 'internal://' + encodeURIComponent(internalId);
        return String(img.getAttribute('src') || '');
    }

    function sourceMatches(img, record) {
        var domSrc = comparableSource(img);
        var source = decodeHtml(record.src);
        if (domSrc === source) return true;
        if (domSrc.indexOf('internal://') === 0 && source.indexOf('internal://') === 0) {
            try { return decodeURIComponent(domSrc.slice(11)) === decodeURIComponent(source.slice(11)); } catch (_) {}
        }
        return false;
    }

    function isResizableImage(img, root) {
        if (!img || !root || !root.contains(img)) return false;
        if (img.closest('.note-cover-page, .mermaid, [data-mermaid-controls], .katex, .md-image-resize-overlay')) return false;
        return true;
    }

    function mapImages(root, markdown) {
        var records = scanImageReferences(markdown);
        var images = Array.prototype.slice.call(root.querySelectorAll('img')).filter(function (img) {
            return isResizableImage(img, root);
        });
        var used = [];
        images.forEach(function (img) {
            var found = -1;
            for (var i = 0; i < records.length; i += 1) {
                if (!used[i] && sourceMatches(img, records[i])) { found = i; break; }
            }
            if (found < 0) return;
            used[found] = true;
            img.__mdImageResizeRecord = records[found];
            img.classList.add('md-view-resizable-image');
        });
        return images.length;
    }

    function ensureOverlay() {
        if (overlay || !global.document) return overlay;
        overlay = global.document.createElement('div');
        overlay.className = 'md-image-resize-overlay no-print';
        overlay.innerHTML = ''
            + '<div class="md-image-resize-size" aria-live="polite"></div>'
            + '<button type="button" class="md-image-resize-handle is-n" data-direction="n" aria-label="위쪽에서 높이 조절"></button>'
            + '<button type="button" class="md-image-resize-handle is-e" data-direction="e" aria-label="오른쪽에서 너비 조절"></button>'
            + '<button type="button" class="md-image-resize-handle is-s" data-direction="s" aria-label="아래쪽에서 높이 조절"></button>'
            + '<button type="button" class="md-image-resize-handle is-w" data-direction="w" aria-label="왼쪽에서 너비 조절"></button>'
            + '<button type="button" class="md-image-resize-handle is-se" data-direction="se" aria-label="오른쪽 아래 모서리에서 비율 조절"></button>'
            + '<div class="md-image-resize-actions">'
            + '<button type="button" class="md-image-resize-confirm">Confirm</button>'
            + '<button type="button" class="md-image-resize-cancel">Cancel</button>'
            + '</div>';
        global.document.body.appendChild(overlay);
        sizeLabel = overlay.querySelector('.md-image-resize-size');
        confirmButton = overlay.querySelector('.md-image-resize-confirm');
        cancelButton = overlay.querySelector('.md-image-resize-cancel');
        overlay.querySelectorAll('.md-image-resize-handle').forEach(function (handle) {
            handle.addEventListener('pointerdown', startDrag, { passive: false });
        });
        confirmButton.addEventListener('click', confirmResize);
        cancelButton.addEventListener('click', cancelResize);
        return overlay;
    }

    function updateOverlay() {
        if (!activeSession || !overlay) return;
        var rect = activeSession.img.getBoundingClientRect();
        overlay.style.left = Math.round(rect.left) + 'px';
        overlay.style.top = Math.round(rect.top) + 'px';
        overlay.style.width = Math.round(rect.width) + 'px';
        overlay.style.height = Math.round(rect.height) + 'px';
        sizeLabel.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';
    }

    function openForImage(img) {
        var record = img && img.__mdImageResizeRecord;
        if (!record || !img.isConnected) return false;
        if (activeSession && activeSession.img !== img) cancelResize();
        ensureOverlay();
        var rect = img.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        var root = img.closest('#viewer') || img.closest('.markdown-body') || img.parentNode;
        activeSession = {
            img: img,
            record: record,
            onConfirm: img.__mdImageResizeOnConfirm || (root && root.__mdImageResizeOnConfirm),
            originalStyle: img.getAttribute('style'),
            originalWidth: img.getAttribute('width'),
            originalHeight: img.getAttribute('height'),
            width: rect.width,
            height: rect.height,
            ratio: rect.width / Math.max(1, rect.height)
        };
        img.classList.add('md-view-image-resizing');
        overlay.classList.add('is-open');
        updateOverlay();
        return true;
    }

    function applyPreviewSize(width, height) {
        if (!activeSession) return;
        activeSession.width = clampDimension(width);
        activeSession.height = clampDimension(height);
        activeSession.img.style.width = activeSession.width + 'px';
        activeSession.img.style.height = activeSession.height + 'px';
        activeSession.img.style.maxWidth = 'none';
        updateOverlay();
    }

    function startDrag(event) {
        if (!activeSession) return;
        var direction = String(event.currentTarget.getAttribute('data-direction') || '');
        var startX = event.clientX;
        var startY = event.clientY;
        var startWidth = activeSession.width;
        var startHeight = activeSession.height;
        var ratio = activeSession.ratio || (startWidth / Math.max(1, startHeight));
        event.preventDefault();
        event.stopPropagation();
        global.document.body.classList.add('md-image-resize-dragging');

        function onMove(moveEvent) {
            var dx = moveEvent.clientX - startX;
            var dy = moveEvent.clientY - startY;
            var width = startWidth;
            var height = startHeight;
            if (direction === 'e') width = startWidth + dx;
            else if (direction === 'w') width = startWidth - dx;
            else if (direction === 's') height = startHeight + dy;
            else if (direction === 'n') height = startHeight - dy;
            else if (direction === 'se') {
                var widthFromDrag = startWidth + dx;
                var heightFromDrag = startHeight + dy;
                if (Math.abs(dx) >= Math.abs(dy * ratio)) {
                    width = widthFromDrag;
                    height = width / ratio;
                } else {
                    height = heightFromDrag;
                    width = height * ratio;
                }
            }
            applyPreviewSize(width, height);
            moveEvent.preventDefault();
        }

        function onEnd() {
            global.document.removeEventListener('pointermove', onMove);
            global.document.removeEventListener('pointerup', onEnd);
            global.document.removeEventListener('pointercancel', onEnd);
            global.document.body.classList.remove('md-image-resize-dragging');
        }

        global.document.addEventListener('pointermove', onMove, { passive: false });
        global.document.addEventListener('pointerup', onEnd, { passive: true });
        global.document.addEventListener('pointercancel', onEnd, { passive: true });
    }

    function restoreImage(session) {
        if (!session || !session.img || !session.img.isConnected) return;
        if (session.originalStyle == null) session.img.removeAttribute('style');
        else session.img.setAttribute('style', session.originalStyle);
        if (session.originalWidth == null) session.img.removeAttribute('width');
        else session.img.setAttribute('width', session.originalWidth);
        if (session.originalHeight == null) session.img.removeAttribute('height');
        else session.img.setAttribute('height', session.originalHeight);
    }

    function closeOverlay() {
        if (activeSession && activeSession.img) activeSession.img.classList.remove('md-view-image-resizing');
        activeSession = null;
        if (overlay) overlay.classList.remove('is-open');
    }

    function cancelResize() {
        if (!activeSession) return;
        restoreImage(activeSession);
        closeOverlay();
    }

    function confirmResize() {
        if (!activeSession) return;
        var session = activeSession;
        var textarea = global.document.getElementById('viewer-edit-ta');
        var source = String(sourceMarkdown || (textarea && textarea.value != null ? textarea.value : ''));
        var result = replaceImageReference(source, session.record, session.width, session.height);
        if (!result.changed) {
            if (typeof global.showToast === 'function') global.showToast('이미지 원문이 변경되어 크기를 저장하지 못했습니다. 다시 선택해 주세요.');
            cancelResize();
            return;
        }
        closeOverlay();
        if (typeof session.onConfirm === 'function') {
            session.onConfirm(result.markdown, result);
        } else if (typeof global.updateContent === 'function') {
            global.updateContent(result.markdown);
            if (typeof global.performAutoSave === 'function') global.performAutoSave();
        }
    }

    function bindGlobalEvents() {
        if (bound || !global.document) return;
        bound = true;
        global.document.addEventListener('click', function (event) {
            var img = event.target && event.target.closest ? event.target.closest(imageSelector) : null;
            if (!img || !img.__mdImageResizeRecord) return;
            var viewport = global.document.getElementById('content-viewport');
            if (viewport && !viewport.classList.contains('hidden')) return;
            event.preventDefault();
            event.stopPropagation();
            openForImage(img);
        }, true);
        global.addEventListener('resize', updateOverlay);
        global.addEventListener('scroll', updateOverlay, true);
        global.document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && activeSession) cancelResize();
        });
    }

    function hydrate(root, options) {
        if (!root) return 0;
        var opts = options || {};
        if (activeSession) closeOverlay();
        if (opts.imageSelector) imageSelector = String(opts.imageSelector || '');
        sourceMarkdown = String(opts.sourceMarkdown || sourceMarkdown || '');
        var markdown = String(opts.sourceMarkdown || '');
        var count = mapImages(root, markdown);
        Array.prototype.slice.call(root.querySelectorAll('img')).forEach(function (img) {
            if (!img.__mdImageResizeRecord) return;
            img.__mdImageResizeOnConfirm = opts.onConfirm;
        });
        root.__mdImageResizeOnConfirm = opts.onConfirm;
        bindGlobalEvents();
        return count;
    }

    var api = {
        scanImageReferences: scanImageReferences,
        replaceImageReference: replaceImageReference,
        buildHtmlImage: buildHtmlImage,
        updateHtmlImageTag: updateHtmlImageTag,
        hydrate: hydrate,
        cancel: cancelResize
    };
    global.ViewModeImageResize = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

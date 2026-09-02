(function () {
    'use strict';

    const MAX_MEASURE_CHARS = 300000;
    const IMAGE_DATA_FOLD_KEY = 'md_viewer_image_data_folded';
    const IMAGE_DATA_PATTERN = /data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=]+)/gi;
    let textarea;
    let wrapper;
    let gutter;
    let measure;
    let foldButton;
    let foldedTextarea;
    let imageDataFolded = true;
    let frameId = 0;
    let scrollFrameId = 0;

    function hasImageData(source) {
        IMAGE_DATA_PATTERN.lastIndex = 0;
        return IMAGE_DATA_PATTERN.test(String(source || ''));
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function foldImageData(source) {
        IMAGE_DATA_PATTERN.lastIndex = 0;
        return String(source || '').replace(IMAGE_DATA_PATTERN, function (whole, subtype, payload) {
            const padding = (payload.match(/=*$/) || [''])[0].length;
            const bytes = Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
            return 'data:image/' + subtype + ';base64,…[image_data · ' + formatBytes(bytes) + ' 접힘]';
        });
    }

    function restoreImageData(foldedSource, originalSource) {
        IMAGE_DATA_PATTERN.lastIndex = 0;
        const originals = String(originalSource || '').match(IMAGE_DATA_PATTERN) || [];
        let index = 0;
        const restored = String(foldedSource || '').replace(
            /data:image\/([a-z0-9.+-]+);base64,…\[image_data · [^\]]+ 접힘\]/gi,
            function () { return originals[index++] || ''; }
        );
        return index === originals.length ? restored : null;
    }

    function classifyLines(lines) {
        let inCode = false;
        let previousKind = '';
        return lines.map(function (line) {
            const text = String(line || '');
            const trimmed = text.trimStart();
            let match;
            let kind = '';
            let label = '';
            let title = '';

            if (!inCode && /data:image\/[a-z0-9.+-]+;base64,/i.test(text)) {
                kind = 'image-data'; label = 'image_data'; title = 'Base64 이미지 데이터';
            } else if (/^(```|~~~)/.test(trimmed)) {
                kind = 'code'; label = 'CODE'; title = inCode ? '코드 블록 끝' : '코드 블록 시작';
                inCode = !inCode;
            } else if (!inCode && (match = trimmed.match(/^(#{1,6})(?:\s+|$)/))) {
                kind = 'heading'; label = 'H' + match[1].length; title = '제목 ' + label;
            } else if (!inCode && /^>\s?/.test(trimmed)) {
                kind = 'quote'; label = 'QUOTE'; title = '인용문';
            } else if (!inCode && /^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
                kind = 'rule'; label = 'HR'; title = '구분선';
            } else if (!inCode && /^\s*(?:[-+*]|\d+[.)])\s+/.test(text)) {
                kind = 'list';
                if (previousKind !== 'list') { label = 'LIST'; title = '목록 시작'; }
            } else if (!inCode && /^\s*\|.*\|\s*$/.test(text)) {
                kind = 'table';
                if (previousKind !== 'table') { label = 'TABLE'; title = '표 시작'; }
            }
            previousKind = kind;
            return label ? { label: label, kind: kind, title: title } : null;
        });
    }

    function copyMeasureTypography(computed) {
        [
            'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontVariant',
            'fontStretch', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
        ].forEach(function (property) {
            measure.style[property] = computed[property];
        });
        measure.style.width = textarea.clientWidth + 'px';
    }

    function selectSourceLine(lineIndex, lines) {
        let start = 0;
        for (let i = 0; i < lineIndex; i += 1) start += lines[i].length + 1;
        const end = start + lines[lineIndex].length;
        textarea.focus();
        textarea.setSelectionRange(start, end);
    }

    function getAnchorTop(anchor) {
        if (!anchor || !measure) return 0;
        return anchor.getBoundingClientRect().top - measure.getBoundingClientRect().top;
    }

    function updateFoldUi(source) {
        if (!foldButton || !foldedTextarea) return;
        const available = hasImageData(source);
        foldButton.hidden = !available;
        wrapper.classList.toggle('image-data-fold-active', available && imageDataFolded);
        foldedTextarea.hidden = !(available && imageDataFolded);
        foldButton.setAttribute('aria-pressed', available && imageDataFolded ? 'true' : 'false');
        foldButton.textContent = available && imageDataFolded ? '▸' : '▾';
        foldButton.setAttribute('aria-label', available && imageDataFolded
            ? 'Base64 이미지 데이터 펼치기'
            : 'Base64 이미지 데이터 접기');
        foldButton.title = available && imageDataFolded
            ? '접힌 Base64 이미지 데이터를 펼쳐서 편집합니다.'
            : 'Base64 이미지 데이터를 짧게 접어 표시합니다.';
        if (available && imageDataFolded) {
            const nextValue = foldImageData(source);
            if (foldedTextarea.value !== nextValue) foldedTextarea.value = nextValue;
            foldedTextarea.scrollTop = textarea.scrollTop;
            foldedTextarea.scrollLeft = textarea.scrollLeft;
        }
    }

    function setImageDataFolded(folded) {
        imageDataFolded = !!folded;
        try { localStorage.setItem(IMAGE_DATA_FOLD_KEY, imageDataFolded ? '1' : '0'); } catch (_) {}
        updateFoldUi(textarea ? textarea.value : '');
        schedule();
        if (!imageDataFolded && textarea) {
            requestAnimationFrame(function () { textarea.focus(); });
        }
    }

    function positionFoldButton(scrollTop) {
        if (!foldButton || !foldButton.dataset.sourceTop) return;
        const sourceTop = Number(foldButton.dataset.sourceTop);
        const naturalTop = sourceTop - scrollTop;
        const stickyTop = 4;
        foldButton.style.top = Math.max(naturalTop, stickyTop) + 'px';
    }

    function syncMarkerScroll() {
        scrollFrameId = 0;
        if (!textarea || !gutter) return;
        const scrollSource = imageDataFolded && foldedTextarea && !foldedTextarea.hidden ? foldedTextarea : textarea;
        gutter.querySelectorAll('.editor-format-marker').forEach(function (button) {
            button.style.top = (Number(button.dataset.sourceTop) - scrollSource.scrollTop) + 'px';
        });
        positionFoldButton(scrollSource.scrollTop);
    }

    function scheduleScrollSync() {
        if (scrollFrameId) return;
        scrollFrameId = requestAnimationFrame(syncMarkerScroll);
    }

    function render() {
        frameId = 0;
        if (!textarea || !wrapper || textarea.offsetParent === null) return;
        const source = textarea.value || '';
        updateFoldUi(source);
        gutter.replaceChildren();
        gutter.appendChild(foldButton);
        if (!source) return;

        const lines = source.split('\n');
        const displaySource = imageDataFolded ? foldImageData(source) : source;
        if (displaySource.length > MAX_MEASURE_CHARS) return;
        const displayLines = displaySource.split('\n');
        const formats = classifyLines(lines);
        if (!formats.some(Boolean)) return;

        copyMeasureTypography(getComputedStyle(textarea));
        measure.replaceChildren();
        const fragment = document.createDocumentFragment();
        const anchors = [];
        let imageDataButtonPositioned = false;
        displayLines.forEach(function (line, index) {
            const anchor = document.createElement('span');
            anchor.className = 'editor-format-measure-anchor';
            anchor.dataset.line = String(index);
            anchor.textContent = '\u200b';
            fragment.appendChild(anchor);
            fragment.appendChild(document.createTextNode(line));
            if (index < lines.length - 1) fragment.appendChild(document.createTextNode('\n'));
            anchors.push(anchor);
        });
        measure.appendChild(fragment);

        formats.forEach(function (format, index) {
            if (!format) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'editor-format-marker editor-format-' + format.kind;
            button.textContent = format.label;
            button.title = format.title + ' · 클릭하면 해당 원문 줄을 선택합니다.';
            const anchorTop = getAnchorTop(anchors[index]);
            button.dataset.sourceTop = String(anchorTop);
            const scrollSource = imageDataFolded && foldedTextarea && !foldedTextarea.hidden ? foldedTextarea : textarea;
            button.style.top = (anchorTop - scrollSource.scrollTop) + 'px';
            button.addEventListener('click', function () {
                if (format.kind === 'image-data' && imageDataFolded) setImageDataFolded(false);
                selectSourceLine(index, lines);
            });
            gutter.appendChild(button);
            if (format.kind === 'image-data' && !imageDataButtonPositioned) {
                imageDataButtonPositioned = true;
                foldButton.dataset.sourceTop = String(anchorTop);
                positionFoldButton(scrollSource.scrollTop);
            }
        });
    }

    function schedule() {
        if (frameId) return;
        frameId = requestAnimationFrame(render);
    }

    function init() {
        textarea = document.getElementById('viewer-edit-ta');
        wrapper = document.getElementById('editor-doc-wrap');
        if (!textarea || !wrapper || wrapper.querySelector('#editor-format-gutter')) return;

        gutter = document.createElement('div');
        gutter.id = 'editor-format-gutter';
        gutter.setAttribute('aria-label', '마크다운 줄 서식 표시');
        measure = document.createElement('div');
        measure.id = 'editor-format-measure';
        measure.setAttribute('aria-hidden', 'true');
        foldButton = document.createElement('button');
        foldButton.type = 'button';
        foldButton.id = 'editor-image-data-fold';
        foldButton.className = 'no-print';
        foldButton.textContent = '▸';
        foldButton.setAttribute('aria-label', 'Base64 이미지 데이터 펼치기');
        foldButton.addEventListener('click', function () { setImageDataFolded(!imageDataFolded); });
        foldedTextarea = document.createElement('textarea');
        foldedTextarea.id = 'viewer-edit-image-data-folded';
        foldedTextarea.className = textarea.className + ' editor-image-data-folded-view';
        foldedTextarea.readOnly = false;
        foldedTextarea.spellcheck = false;
        foldedTextarea.hidden = true;
        foldedTextarea.setAttribute('aria-label', 'Base64 이미지 데이터가 접힌 마크다운 원문');
        try { imageDataFolded = localStorage.getItem(IMAGE_DATA_FOLD_KEY) !== '0'; } catch (_) {}
        wrapper.appendChild(gutter);
        wrapper.appendChild(measure);
        wrapper.appendChild(foldedTextarea);
        gutter.appendChild(foldButton);

        textarea.addEventListener('input', schedule);
        textarea.addEventListener('scroll', scheduleScrollSync, { passive: true });
        foldedTextarea.addEventListener('scroll', scheduleScrollSync, { passive: true });
        foldedTextarea.addEventListener('input', function () {
            if (!imageDataFolded || !textarea) return;
            const restored = restoreImageData(foldedTextarea.value, textarea.value);
            if (restored === null) {
                foldedTextarea.value = foldImageData(textarea.value);
                return;
            }
            textarea.value = restored;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        window.addEventListener('resize', schedule, { passive: true });
        document.addEventListener('md-viewer-mode-change', schedule);
        if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(textarea);
        schedule();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.refreshEditorFormatGutter = schedule;
    window.MDImageDataFold = Object.freeze({
        fold: function () { setImageDataFolded(true); },
        unfold: function () { setImageDataFolded(false); },
        toggle: function () { setImageDataFolded(!imageDataFolded); },
        foldText: foldImageData
    });
})();

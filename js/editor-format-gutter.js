(function () {
    'use strict';

    const MAX_MEASURE_CHARS = 300000;
    let textarea;
    let wrapper;
    let gutter;
    let measure;
    let frameId = 0;
    let scrollFrameId = 0;

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

            if (/^(```|~~~)/.test(trimmed)) {
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

    function syncMarkerScroll() {
        scrollFrameId = 0;
        if (!textarea || !gutter) return;
        gutter.querySelectorAll('.editor-format-marker').forEach(function (button) {
            button.style.top = (Number(button.dataset.sourceTop) - textarea.scrollTop) + 'px';
        });
    }

    function scheduleScrollSync() {
        if (scrollFrameId) return;
        scrollFrameId = requestAnimationFrame(syncMarkerScroll);
    }

    function render() {
        frameId = 0;
        if (!textarea || !wrapper || textarea.offsetParent === null) return;
        const source = textarea.value || '';
        gutter.replaceChildren();
        if (!source || source.length > MAX_MEASURE_CHARS) return;

        const lines = source.split('\n');
        const formats = classifyLines(lines);
        if (!formats.some(Boolean)) return;

        copyMeasureTypography(getComputedStyle(textarea));
        measure.replaceChildren();
        const fragment = document.createDocumentFragment();
        const anchors = [];
        lines.forEach(function (line, index) {
            const anchor = document.createElement('span');
            anchor.className = 'editor-format-measure-anchor';
            anchor.dataset.line = String(index);
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
            button.dataset.sourceTop = String(anchors[index].offsetTop);
            button.style.top = (anchors[index].offsetTop - textarea.scrollTop) + 'px';
            button.addEventListener('click', function () { selectSourceLine(index, lines); });
            gutter.appendChild(button);
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
        wrapper.appendChild(gutter);
        wrapper.appendChild(measure);

        textarea.addEventListener('input', schedule);
        textarea.addEventListener('scroll', scheduleScrollSync, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        document.addEventListener('md-viewer-mode-change', schedule);
        if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(textarea);
        schedule();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window.refreshEditorFormatGutter = schedule;
})();

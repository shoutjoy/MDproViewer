/* Opt-in A4 documents. HTML comments preserve page boundaries in Markdown saves. */
(function () {
    'use strict';
    const HEADER = '<!-- mdpro-a4:v1 -->\n';
    const marker = /<!-- mdpro-page:(portrait|landscape) -->\n/g;
    let pages = null, source = null, active = 0, writing = false;
    let toolbar, host, status, pageDirection, allDirection;
    const orientation = value => value === 'landscape' ? 'landscape' : 'portrait';
    function parse(raw) {
        if (!String(raw).startsWith(HEADER)) return null;
        const body = raw.slice(HEADER.length);
        const matches = Array.from(body.matchAll(marker));
        if (!matches.length || matches[0].index !== 0) return null;
        return matches.map((match, i) => ({
            direction: match[1],
            text: body.slice(match.index + match[0].length, i + 1 < matches.length ? matches[i + 1].index : body.length)
        }));
    }
    function serialize(items) {
        return HEADER + items.map(p => `<!-- mdpro-page:${orientation(p.direction)} -->\n${p.text}`).join('');
    }
    function button(text, label, action) {
        const element = document.createElement('button');
        element.type = 'button'; element.textContent = text;
        element.setAttribute('aria-label', label); element.title = label;
        element.addEventListener('click', action); return element;
    }
    function select(label, action) {
        const wrap = document.createElement('label'); wrap.textContent = label + ' ';
        const element = document.createElement('select'); element.setAttribute('aria-label', label);
        for (const [value, title] of [['portrait', 'A4 세로'], ['landscape', 'A4 가로']]) {
            const option = document.createElement('option'); option.value = value; option.textContent = title;
            element.append(option);
        }
        element.addEventListener('change', () => action(element.value));
        wrap.append(element); toolbar.append(wrap); return element;
    }
    function init() {
        if (toolbar) return;
        toolbar = document.createElement('div'); toolbar.id = 'a4-page-toolbar'; toolbar.hidden = true;
        toolbar.append(button('←', '이전 페이지', () => navigate(-1)));
        status = document.createElement('span'); status.setAttribute('aria-live', 'polite'); toolbar.append(status);
        toolbar.append(button('→', '다음 페이지', () => navigate(1)));
        toolbar.append(button('+ Add', '현재 페이지 다음에 빈 페이지 추가', () => {
            const index = logicalIndex();
            pages.splice(index + 1, 0, { direction: pages[index].direction, text: '' });
            active = index + 1; commit(); drawEditor(); navigate(0);
        }));
        pageDirection = select('현재 페이지', value => {
            pages[logicalIndex()].direction = value; commit(); drawEditor(); reflowEditors();
        });
        allDirection = select('전체 페이지', value => {
            pages.forEach(p => { p.direction = value; }); commit(); drawEditor(); reflowEditors();
        });
        const mixed = document.createElement('option'); mixed.value = ''; mixed.textContent = '혼합'; mixed.disabled = true;
        allDirection.append(mixed);
        toolbar.append(button('원문', '기존 마크다운 편집기로 원문 편집', () => {
            document.body.classList.toggle('a4-source-mode');
            if (!isEditMode) toggleMode('edit');
        }));
        const viewport = document.getElementById('content-viewport');
        viewport.parentElement.insertBefore(toolbar, viewport.parentElement.firstChild);
        host = document.createElement('div'); host.id = 'a4-page-editor'; viewport.append(host);
        for (const scroller of [host, document.getElementById('viewer-container')]) {
            let timer;
            scroller.addEventListener('scroll', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    if (!pages || (scroller === host) !== isEditMode) return;
                    const top = scroller.getBoundingClientRect().top;
                    const sheets = Array.from(scroller.querySelectorAll('.a4-sheet'));
                    let closest = 0, distance = Infinity;
                    sheets.forEach((item, i) => {
                        const rect = item.getBoundingClientRect();
                        const d = rect.bottom < top ? Infinity : Math.abs(rect.top - top);
                        if (d < distance) { closest = i; distance = d; }
                    });
                    active = closest; refresh();
                }, 120);
            }, { passive: true });
        }
        document.addEventListener('keydown', event => {
            if (!pages || isEditMode || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1);
            }
        });
        document.getElementById('viewer-edit-ta').addEventListener('input', () => {
            if (!writing) sync(editorTextarea.value);
        });
    }
    function logicalIndex() {
        const sheet = !isEditMode && document.querySelectorAll('#viewer .a4-sheet')[active];
        return sheet ? Number(sheet.dataset.logicalPage) : Math.min(active, pages.length - 1);
    }
    function refresh() {
        if (!pages) return;
        const count = isEditMode ? pages.length : document.querySelectorAll('#viewer .a4-sheet').length || pages.length;
        active = Math.max(0, Math.min(active, count - 1));
        status.textContent = `${active + 1} / ${count}`;
        pageDirection.value = pages[logicalIndex()].direction;
        allDirection.value = pages.every(p => p.direction === pages[0].direction) ? pages[0].direction : '';
        toolbar.children[0].disabled = active === 0;
        toolbar.children[2].disabled = active === count - 1;
    }
    function navigate(delta) {
        active += delta; refresh();
        const sheets = (isEditMode ? host : document.getElementById('viewer')).querySelectorAll('.a4-sheet');
        sheets[active]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (isEditMode) sheets[active]?.querySelector('textarea')?.focus({ preventScroll: true });
    }
    function commit() {
        writing = true;
        source = serialize(pages);
        editorTextarea.value = source;
        editorTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        currentMarkdown = source;
        writing = false;
        renderMarkdown();
        refresh();
    }
    function sync(raw) {
        init();
        const next = parse(raw);
        document.body.classList.toggle('a4-document', !!next);
        toolbar.hidden = !next;
        if (!next) { pages = null; source = null; host.replaceChildren(); return; }
        if (source !== raw) {
            source = raw; pages = next; active = Math.min(active, pages.length - 1); drawEditor();
        }
        refresh();
    }
    function sheet(direction, index) {
        const element = document.createElement('section');
        element.className = 'a4-sheet a4-' + direction;
        element.dataset.logicalPage = index;
        element.dataset.pageLabel = `${index + 1} 페이지 · A4 ${direction === 'landscape' ? '가로' : '세로'}`;
        element.setAttribute('aria-label', `A4 ${index + 1} 페이지`);
        element.addEventListener('pointerdown', () => {
            active = Array.from(element.parentElement.children).indexOf(element); refresh();
        });
        return element;
    }
    function drawEditor() {
        host.replaceChildren();
        pages.forEach((page, index) => {
            const element = sheet(page.direction, index);
            const area = document.createElement('textarea'); area.value = page.text;
            area.spellcheck = false; area.placeholder = '마크다운 내용을 입력하세요…';
            area.setAttribute('aria-label', `${index + 1} 페이지 내용`);
            function syncSelection() {
                const offset = HEADER.length + pages.slice(0, index).reduce((sum, p) => sum + `<!-- mdpro-page:${p.direction} -->\n`.length + p.text.length, 0) + `<!-- mdpro-page:${page.direction} -->\n`.length;
                editorTextarea.setSelectionRange(offset + area.selectionStart, offset + area.selectionEnd);
            }
            area.addEventListener('focus', () => { active = index; syncSelection(); refresh(); });
            for (const event of ['select', 'keyup', 'pointerup']) area.addEventListener(event, syncSelection);
            area.addEventListener('input', event => {
                page.text = area.value;
                if (event.isComposing) return;
                overflow(index, area); commit();
                if (area.isConnected) syncSelection();
            });
            area.addEventListener('compositionend', () => { page.text = area.value; overflow(index, area); commit(); });
            element.append(area); host.append(element);
        });
        refresh();
    }
    // Measure actual wrapping, preserving every character (including Korean/emoji).
    function splitToFit(text, fits) {
        const chars = Array.from(text);
        let low = 0, high = chars.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (fits(chars.slice(0, mid).join(''))) low = mid; else high = mid - 1;
        }
        return [chars.slice(0, low).join(''), chars.slice(low).join('')];
    }
    function overflow(index, area) {
        if (!area.clientHeight || area.scrollHeight <= area.clientHeight + 1) return;
        const value = area.value, caret = area.selectionStart;
        const [head, tail] = splitToFit(value, prefix => {
            area.value = prefix; return area.scrollHeight <= area.clientHeight + 1;
        });
        if (!head || !tail) { area.value = value; return; }
        pages[index].text = head;
        // Insert overflow before the next manually added page; never overwrite it.
        pages.splice(index + 1, 0, { direction: pages[index].direction, text: tail });
        active = caret > head.length ? index + 1 : index;
        drawEditor();
        const next = host.children[index + 1].querySelector('textarea');
        next.setSelectionRange(Math.max(0, caret - head.length), Math.max(0, caret - head.length));
        overflow(index + 1, next);
        const target = host.children[active].querySelector('textarea');
        if (active === index) target.setSelectionRange(caret, caret);
        target.focus({ preventScroll: true });
    }
    function reflowEditors() {
        if (!pages || !isEditMode) return;
        for (let i = 0; i < pages.length; i++) overflow(i, host.children[i].querySelector('textarea'));
        commit();
    }
    async function render(viewer, raw, isCurrent) {
        const items = parse(raw);
        // Page fragments must not advance the main document's render revision.
        const html = await Promise.all(items.map(p => {
            const renderSource = hideMarkdownCommentsForRender(p.text);
            const preprocessed = preprocessMarkdownForView(renderSource, { commentsAlreadyHidden: true });
            return renderMarkdownSnapshotToHtml({ renderSource, preprocessed, features: detectRenderFeatures(preprocessed), baseHtmlPromise: null });
        }));
        if (!isCurrent()) return;
        viewer.replaceChildren();
        items.forEach((p, index) => {
            let page, content;
            const nextPage = () => {
                page = sheet(p.direction, index); content = document.createElement('div');
                content.className = 'a4-page-content'; page.append(content); viewer.append(page);
            };
            nextPage();
            const template = document.createElement('template'); template.innerHTML = html[index];
            // Split overflowing blocks recursively, including long paragraphs and lists.
            function append(node, parent) {
                parent.append(node);
                if (!content.clientHeight || content.scrollHeight <= content.clientHeight + 1) return;
                node.remove();
                if (node.nodeType === Node.TEXT_NODE) {
                    const original = node.textContent;
                    const [head, tail] = splitToFit(original, value => {
                        node.textContent = value; parent.append(node);
                        const fits = content.scrollHeight <= content.clientHeight + 1; node.remove(); return fits;
                    });
                    node.textContent = head; parent.append(node);
                    if (tail) {
                        if (!head && !content.textContent.trim()) {
                            parent.append(document.createTextNode(tail)); content.classList.add('a4-large-block');
                        } else {
                            const ancestors = [];
                            for (let ancestor = parent; ancestor !== content; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
                            nextPage();
                            let continuation = content;
                            for (const ancestor of ancestors) {
                                const copy = ancestor.cloneNode(false); copy.removeAttribute('id');
                                continuation.append(copy); continuation = copy;
                            }
                            append(document.createTextNode(tail), continuation);
                        }
                    }
                } else if (node.childNodes.length && !['SVG', 'TABLE'].includes(node.nodeName)) {
                    const children = Array.from(node.childNodes); const shell = node.cloneNode(false);
                    parent.append(shell);
                    for (const child of children) {
                        if (!shell.isConnected || !content.contains(shell)) {
                            const continuation = node.cloneNode(false); continuation.removeAttribute('id');
                            content.append(continuation); append(child, continuation);
                        } else append(child, shell);
                    }
                } else {
                    if (content.textContent.trim() || content.querySelector('img,svg,table,pre')) nextPage();
                    content.append(node);
                    // Indivisible blocks remain accessible in their own scrollable page.
                    if (content.scrollHeight > content.clientHeight + 1) content.classList.add('a4-large-block');
                }
            }
            Array.from(template.content.childNodes).forEach(node => append(node, content));
        });
        viewer.querySelectorAll('.a4-sheet').forEach((item, i) => {
            item.dataset.pageLabel = `${i + 1} 페이지 · A4 ${item.classList.contains('a4-landscape') ? '가로' : '세로'}`;
        });
        refresh();
    }
    window.A4Pages = { parse, serialize, splitToFit, sync, render, modeChanged() {
        if (!pages) return;
        refresh();
        if (isEditMode) requestAnimationFrame(() => {
            if (!pages || !isEditMode || document.body.classList.contains('a4-source-mode')) return;
            reflowEditors(); navigate(0);
        });
    }, create(direction) {
        setNewFileMenuVisible(false); createNewFile();
        active = 0; document.body.classList.remove('a4-source-mode');
        updateContent(serialize([{ direction: orientation(direction), text: '' }]));
        performAutoSave();
        requestAnimationFrame(() => host.querySelector('textarea')?.focus());
    } };
})();

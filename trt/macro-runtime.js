(function (root) {
    'use strict';
    const scopes = new Map();
    let headingOwner = '';
    function notify(text) {
        if (typeof root.showToast === 'function') root.showToast(String(text));
        if (root.MacroJena) root.MacroJena.api.log(text);
        const status = document.getElementById('mj-runtime-status');
        if (status) status.textContent = String(text);
    }
    function stop(id) {
        const scope = scopes.get(id);
        if (!scope) return;
        scope.active = false;
        scopes.delete(id);
        if (headingOwner === id) headingOwner = '';
        scope.cleanups.forEach(fn => { try { fn(); } catch (error) { notify('매크로 해제 오류: ' + error.message); } });
    }
    function stopAll() { Array.from(scopes.keys()).forEach(stop); notify('매크로 기능키를 해제했습니다.'); }
    function isViewMode() { return document.body.classList.contains('viewer-view-mode'); }
    function headings() {
        const viewer = document.getElementById('viewer');
        return viewer ? Array.from(viewer.querySelectorAll('h1,h2,h3,h4,h5,h6')) : [];
    }
    function create(id, base) {
        stop(id);
        const scope = { active: true, cleanups: [] };
        scopes.set(id, scope);
        let lastHeading = null;
        function assertActive() { if (!scope.active) throw new Error('이 매크로 실행은 해제되었습니다.'); }
        function onKey(key, handler, options) {
            assertActive();
            const mode = options && options.mode || 'view';
            const listener = event => {
                if (!scope.active || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
                if (event.key !== key || (mode === 'view' && !isViewMode()) || (mode === 'edit' && isViewMode())) return;
                const target = event.target;
                if (target && target.closest) {
                    if (target.closest('#macro-jena, #macro-menu-panel, #ai-chat-panel, #ai-data-center-app, [role="dialog"], dialog, [aria-modal="true"]')) return;
                    if (target.id !== 'view-mode-text-input-sink' && target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
                }
                try {
                    const result = handler(event);
                    if (result !== false) { event.preventDefault(); event.stopImmediatePropagation(); }
                    if (result && typeof result.catch === 'function') result.catch(error => notify('매크로 오류: ' + error.message));
                } catch (error) { notify('매크로 오류: ' + error.message); }
            };
            root.addEventListener('keydown', listener, true);
            const remove = () => root.removeEventListener('keydown', listener, true);
            scope.cleanups.push(remove);
            return remove;
        }
        function goToHeading(index) {
            assertActive();
            const nodes = headings();
            if (!isViewMode() || !nodes[index]) return false;
            lastHeading = nodes[index];
            lastHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
            notify('목차 ' + (index + 1) + '/' + nodes.length + ' · ' + lastHeading.textContent.trim());
            return true;
        }
        function moveHeading(direction) {
            assertActive();
            if (!isViewMode()) return false;
            const nodes = headings();
            if (!nodes.length) { notify('이 문서에 이동할 목차가 없습니다.'); return true; }
            const container = document.getElementById('viewer-container');
            const top = container ? container.getBoundingClientRect().top : 0;
            let index = -1;
            // Recalculate from actual scroll position so manual scrolling and document changes work.
            nodes.forEach((node, i) => {
                const margin = parseFloat(root.getComputedStyle(node).scrollMarginTop) || 0;
                const padding = container ? parseFloat(root.getComputedStyle(container).scrollPaddingTop) || 0 : 0;
                if (node.getBoundingClientRect().top <= top + margin + padding + 2) index = i;
            });
            // At the bottom multiple headings may not reach the top; retain the last explicit jump.
            if (lastHeading && nodes.includes(lastHeading) && container && container.scrollTop + container.clientHeight >= container.scrollHeight - 2) index = nodes.indexOf(lastHeading);
            const next = direction > 0 ? index + 1 : index - 1;
            if (next < 0 && index <= 0) { goToHeading(0); notify('첫 번째 목차입니다.'); return true; }
            if (next >= nodes.length) { notify('마지막 목차입니다.'); return true; }
            return goToHeading(next);
        }
        return Object.freeze(Object.assign({}, base, {
            isViewMode,
            getHeadings: () => headings().map((node, index) => ({ index, title: node.textContent.trim(), level: Number(node.tagName.slice(1)) })),
            goToHeading,
            nextHeading: () => moveHeading(1), previousHeading: () => moveHeading(-1),
            onKey,
            onCleanup: fn => { assertActive(); if (typeof fn !== 'function') throw new Error('정리 함수를 전달하세요.'); scope.cleanups.push(fn); },
            notify,
            enableHeadingNavigation: () => {
                if (headingOwner && headingOwner !== id) stop(headingOwner);
                headingOwner = id;
                onKey('ArrowRight', () => moveHeading(1));
                onKey('ArrowLeft', () => moveHeading(-1));
                notify('기능키 활성화: 보기창에서 ← 이전 목차 / → 다음 목차');
            }
        }));
    }
    root.MacroRuntime = Object.freeze({ create, stop, stopAll, notify, isActive: id => scopes.has(id) && scopes.get(id).cleanups.length > 0 });
})(window);

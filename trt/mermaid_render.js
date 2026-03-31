(function (global) {
    'use strict';

    const MERMAID_SOURCES = [
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@11/dist/mermaid.min.js',
        'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
        'https://unpkg.com/mermaid@10/dist/mermaid.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js'
    ];
    const CODE_SELECTOR = 'pre > code.language-mermaid, pre > code.lang-mermaid, pre > code.mermaid';
    let mermaidLoadPromise = null;
    let mermaidReady = false;

    function loadMermaidFromSource(src) {
        return new Promise(function (resolve, reject) {
            var stale = document.querySelectorAll('script[data-trt-mermaid="1"]');
            for (var i = 0; i < stale.length; i++) {
                try { stale[i].parentNode && stale[i].parentNode.removeChild(stale[i]); } catch (e) {}
            }
            var script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.setAttribute('data-trt-mermaid', '1');
            script.onload = function () {
                if (!global.mermaid) {
                    reject(new Error('Mermaid global not found after load.'));
                    return;
                }
                resolve(global.mermaid);
            };
            script.onerror = function () {
                reject(new Error('Failed to load mermaid library from ' + src));
            };
            document.head.appendChild(script);
        });
    }

    function loadMermaid() {
        if (mermaidReady && global.mermaid) return Promise.resolve(global.mermaid);
        if (mermaidLoadPromise) return mermaidLoadPromise;
        mermaidLoadPromise = (async function () {
            var lastErr = null;
            for (var i = 0; i < MERMAID_SOURCES.length; i++) {
                try {
                    await loadMermaidFromSource(MERMAID_SOURCES[i]);
                    if (!global.mermaid) throw new Error('Mermaid global not found.');
                    try {
                        global.mermaid.initialize({
                            startOnLoad: false,
                            securityLevel: 'loose',
                            theme: 'default'
                        });
                    } catch (e) {}
                    mermaidReady = true;
                    return global.mermaid;
                } catch (err) {
                    lastErr = err;
                }
            }
            throw (lastErr || new Error('Failed to load mermaid library.'));
        })().catch(function (err) {
            mermaidLoadPromise = null;
            return Promise.reject(err);
        });
        return mermaidLoadPromise;
    }

    function buildMermaidNodeFromCode(codeEl) {
        if (!codeEl) return null;
        const pre = codeEl.parentElement;
        if (!pre || pre.tagName !== 'PRE') return null;
        const source = String(codeEl.textContent || '').trim();
        if (!source) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'trt-mermaid-wrapper my-3 overflow-x-auto';
        wrapper.setAttribute('data-mermaid-source', source);

        const block = document.createElement('div');
        block.className = 'mermaid';
        block.textContent = source;
        wrapper.appendChild(block);

        pre.replaceWith(wrapper);
        return block;
    }

    async function renderIn(root) {
        const target = root || document;
        const codeNodes = target.querySelectorAll ? target.querySelectorAll(CODE_SELECTOR) : [];
        const mermaidNodes = [];

        for (let i = 0; i < codeNodes.length; i++) {
            const node = buildMermaidNodeFromCode(codeNodes[i]);
            if (node) mermaidNodes.push(node);
        }

        if (!mermaidNodes.length) return { changed: false };
        await loadMermaid();
        try {
            await global.mermaid.run({ nodes: mermaidNodes });
        } catch (e) {
            for (let i = 0; i < mermaidNodes.length; i++) {
                const n = mermaidNodes[i];
                const parent = n && n.parentElement;
                if (!parent) continue;
                const src = String(parent.getAttribute('data-mermaid-source') || n.textContent || '');
                parent.innerHTML = '';
                const pre = document.createElement('pre');
                pre.className = 'trt-mermaid-error';
                pre.textContent = src;
                parent.appendChild(pre);
            }
            return { changed: false, error: e };
        }
        return { changed: true };
    }

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(fn, wait);
        };
    }


    function observeViewer() {
        const viewer = document.getElementById('viewer');
        if (!viewer || viewer.__trtMermaidObserved) return;
        viewer.__trtMermaidObserved = true;

        const run = debounce(function () {
            renderIn(viewer).catch(function () {});
        }, 80);

        const observer = new MutationObserver(function () {
            run();
        });
        observer.observe(viewer, { childList: true, subtree: true });
        run();
    }

    function init() {
        observeViewer();
        const retry = setInterval(function () {
            observeViewer();
            const viewer = document.getElementById('viewer');
            if (viewer && viewer.__trtMermaidObserved) clearInterval(retry);
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    global.MermaidTRT = {
        renderIn: renderIn,
        loadMermaid: loadMermaid
    };
})(window);

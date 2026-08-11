(function (root) {
    'use strict';

    const SIZES = [10000, 100000, 300000, 600000];

    function percentile(values, ratio) {
        const sorted = values.slice().sort(function (a, b) { return a - b; });
        return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
    }

    function nextPaint() {
        return new Promise(function (resolve) {
            root.requestAnimationFrame(function () { root.requestAnimationFrame(resolve); });
        });
    }

    async function run(options) {
        const opts = options || {};
        const textarea = document.getElementById('viewer-edit-ta');
        if (!textarea) throw new Error('Editor textarea is missing.');
        const iterations = Math.max(5, Number(opts.iterations) || 10);
        const longTasks = [];
        let observer = null;
        try {
            observer = new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) { longTasks.push(entry.duration); });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (_) {}

        const original = textarea.value;
        const results = [];
        root.__mdPerformanceBenchmarkActive = true;
        try {
            if (typeof root.toggleMode === 'function') root.toggleMode('edit');
            const fixtures = [
                { name: 'plain', unit: '본문 일반 텍스트 다음 줄\n' },
                { name: 'comments', unit: '본문 <!-- 주석 메모 --> 다음 줄\n' }
            ];
            for (const fixture of fixtures) {
                for (const size of SIZES) {
                    const base = fixture.unit.repeat(Math.ceil(size / fixture.unit.length)).slice(0, size);
                    textarea.value = base;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    await nextPaint();
                    const values = [];
                    const longTaskStart = longTasks.length;
                    for (let index = 0; index < iterations; index += 1) {
                        const end = textarea.value.length;
                        textarea.setSelectionRange(end, end);
                        const started = performance.now();
                        textarea.setRangeText(String(index % 10), end, end, 'end');
                        textarea.dispatchEvent(new InputEvent('input', {
                            bubbles: true,
                            inputType: 'insertText',
                            data: String(index % 10)
                        }));
                        await nextPaint();
                        values.push(performance.now() - started);
                    }
                    const debugState = root.MDComment && typeof root.MDComment.getEditorDebugState === 'function'
                        ? root.MDComment.getEditorDebugState()
                        : null;
                    results.push({
                        fixture: fixture.name,
                        chars: size,
                        iterations: iterations,
                        p50Ms: Number(percentile(values, 0.5).toFixed(2)),
                        p95Ms: Number(percentile(values, 0.95).toFixed(2)),
                        maxMs: Number(Math.max.apply(Math, values).toFixed(2)),
                        longTasks: longTasks.slice(longTaskStart).filter(function (duration) { return duration >= 50; }).length,
                        commentMode: debugState ? debugState.lastMode : null
                    });
                }
            }
        } finally {
            textarea.value = original;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            root.__mdPerformanceBenchmarkActive = false;
            if (observer) observer.disconnect();
        }
        return {
            generatedAt: new Date().toISOString(),
            scope: 'textarea input event to second animation frame',
            results: results,
            totalLongTasks: longTasks.filter(function (duration) { return duration >= 50; }).length
        };
    }

    function mount() {
        if (document.getElementById('md-perf-run')) return;
        const panel = document.createElement('div');
        panel.id = 'md-perf-panel';
        panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(560px,92vw);max-height:70vh;overflow:auto;padding:10px;border-radius:8px;background:#111827;color:#e5e7eb;font:12px/1.45 monospace;box-shadow:0 8px 30px rgba(0,0,0,.4)';
        const button = document.createElement('button');
        button.id = 'md-perf-run';
        button.type = 'button';
        button.textContent = 'Run input benchmark';
        button.style.cssText = 'padding:7px 10px;margin-bottom:8px;border:0;border-radius:5px;background:#4f46e5;color:white;cursor:pointer';
        const output = document.createElement('pre');
        output.id = 'md-perf-output';
        output.textContent = 'Ready';
        output.style.whiteSpace = 'pre-wrap';
        button.addEventListener('click', async function () {
            button.disabled = true;
            output.textContent = 'Running...';
            try {
                const result = await run();
                output.textContent = JSON.stringify(result, null, 2);
                root.dispatchEvent(new CustomEvent('md-performance-complete', { detail: result }));
            } catch (error) {
                output.textContent = JSON.stringify({ error: String(error && error.stack || error) });
            } finally {
                button.disabled = false;
            }
        });
        panel.appendChild(button);
        panel.appendChild(output);
        document.body.appendChild(panel);
    }

    root.MDInputPaintBenchmark = Object.freeze({ run: run, mount: mount });
})(window);

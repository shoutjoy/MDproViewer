import { EditorState, EditorSelection, StateField } from 'https://esm.sh/@codemirror/state@6';
import { EditorView, Decoration, keymap } from 'https://esm.sh/@codemirror/view@6';
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6';
import { searchKeymap, highlightSelectionMatches } from 'https://esm.sh/@codemirror/search@6';

const COMMENT_START = '<!--';
const COMMENT_END = '-->';

function buildCommentDecorations(state) {
    const source = state.doc.toString();
    const ranges = [];
    let cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf(COMMENT_START, cursor);
        if (start < 0) break;
        const close = source.indexOf(COMMENT_END, start + COMMENT_START.length);
        const end = close < 0 ? source.length : close + COMMENT_END.length;
        ranges.push(Decoration.mark({ class: 'cm-md-comment' }).range(start, end));
        if (close < 0) break;
        cursor = end;
    }
    return Decoration.set(ranges, true);
}

const commentDecorations = StateField.define({
    create: buildCommentDecorations,
    update(value, transaction) {
        return transaction.docChanged ? buildCommentDecorations(transaction.state) : value.map(transaction.changes);
    },
    provide: field => EditorView.decorations.from(field)
});

function toggleComment(view) {
    const selection = view.state.selection.main;
    let from = selection.from;
    let to = selection.to;
    if (from === to) {
        const line = view.state.doc.lineAt(from);
        from = line.from;
        to = line.to;
    }
    const selected = view.state.doc.sliceString(from, to);
    const trimmed = selected.trim();
    let insert;
    let anchor;
    let head;
    if (trimmed.startsWith(COMMENT_START) && trimmed.endsWith(COMMENT_END)) {
        const leading = selected.indexOf(COMMENT_START);
        const trailing = selected.length - (selected.lastIndexOf(COMMENT_END) + COMMENT_END.length);
        const body = selected.slice(leading + COMMENT_START.length, selected.length - trailing - COMMENT_END.length)
            .replace(/^\s/, '')
            .replace(/\s$/, '');
        insert = selected.slice(0, leading) + body + selected.slice(selected.length - trailing);
        anchor = from + leading;
        head = anchor + body.length;
    } else {
        insert = '<!-- ' + selected + ' -->';
        anchor = from + 4;
        head = anchor + selected.length;
    }
    view.dispatch({
        changes: { from, to, insert },
        selection: EditorSelection.range(anchor, head),
        userEvent: 'input.comment'
    });
    return true;
}

function ensureStyles() {
    if (document.getElementById('md-cm6-prototype-style')) return;
    const style = document.createElement('style');
    style.id = 'md-cm6-prototype-style';
    style.textContent = `
        .md-cm6-prototype{position:absolute;inset:0;min-width:0;background:#020617;color:#e5e7eb;overflow:hidden}
        .md-cm6-prototype .cm-editor{height:100%;font:inherit;background:transparent}
        .md-cm6-prototype .cm-scroller{overflow:auto;font-family:inherit;line-height:1.75;padding:20px 24px}
        .md-cm6-prototype .cm-content{min-height:100%;caret-color:#f8fafc}
        .md-cm6-prototype .cm-gutters{background:#0f172a;color:#64748b;border-right:1px solid #1e293b}
        .md-cm6-prototype .cm-activeLine,.md-cm6-prototype .cm-activeLineGutter{background:rgba(99,102,241,.08)}
        .md-cm6-prototype .cm-selectionBackground{background:rgba(99,102,241,.32)!important}
        .md-cm6-prototype .cm-md-comment{color:#7dd3fc;background:rgba(14,116,144,.16);border-radius:3px}
        .md-cm6-source-hidden{display:none!important}
        html:not(.dark) .md-cm6-prototype{background:#fff;color:#1f2937}
        html:not(.dark) .md-cm6-prototype .cm-content{caret-color:#111827}
        html:not(.dark) .md-cm6-prototype .cm-gutters{background:#f8fafc;color:#64748b;border-right-color:#e2e8f0}
    `;
    document.head.appendChild(style);
}

function nextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function percentile(values, ratio) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
}

async function runBenchmark(view, iterations = 10) {
    const fixtures = [
        { name: 'plain', unit: '본문 일반 텍스트 다음 줄\n' },
        { name: 'comments', unit: '본문 <!-- 주석 메모 --> 다음 줄\n' }
    ];
    const results = [];
    const original = view.state.doc.toString();
    window.__mdPerformanceBenchmarkActive = true;
    try {
        for (const fixture of fixtures) {
            for (const size of [10000, 100000, 300000, 600000]) {
                const base = fixture.unit.repeat(Math.ceil(size / fixture.unit.length)).slice(0, size);
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: base } });
                await nextPaint();
                const values = [];
                for (let index = 0; index < iterations; index += 1) {
                    const started = performance.now();
                    view.dispatch({ changes: { from: view.state.doc.length, insert: String(index % 10) } });
                    await nextPaint();
                    values.push(performance.now() - started);
                }
                results.push({
                    fixture: fixture.name,
                    chars: size,
                    p50Ms: Number(percentile(values, 0.5).toFixed(2)),
                    p95Ms: Number(percentile(values, 0.95).toFixed(2)),
                    maxMs: Number(Math.max(...values).toFixed(2))
                });
            }
        }
    } finally {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: original } });
        window.__mdPerformanceBenchmarkActive = false;
    }
    return { generatedAt: new Date().toISOString(), results };
}

function mountBenchmarkControls(view) {
    if (new URLSearchParams(location.search).get('cmBench') !== '1') return;
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(520px,90vw);max-height:65vh;overflow:auto;padding:10px;background:#111827;color:#e5e7eb;border-radius:8px;font:12px/1.45 monospace';
    const button = document.createElement('button');
    button.id = 'md-cm6-bench-run';
    button.textContent = 'Run CodeMirror benchmark';
    button.style.cssText = 'padding:7px 10px;background:#4f46e5;color:white;border:0;border-radius:5px';
    const output = document.createElement('pre');
    output.id = 'md-cm6-bench-output';
    output.textContent = 'Ready';
    output.style.whiteSpace = 'pre-wrap';
    button.addEventListener('click', async () => {
        button.disabled = true;
        output.textContent = 'Running...';
        try { output.textContent = JSON.stringify(await runBenchmark(view), null, 2); }
        catch (error) { output.textContent = JSON.stringify({ error: String(error && error.stack || error) }); }
        finally { button.disabled = false; }
    });
    panel.append(button, output);
    document.body.appendChild(panel);
}

function mount(textarea, options = {}) {
    if (!textarea || textarea.__mdCm6View) return textarea && textarea.__mdCm6View;
    ensureStyles();
    const host = document.createElement('div');
    host.className = 'md-cm6-prototype';
    host.id = 'md-cm6-editor';
    textarea.parentElement.appendChild(host);
    textarea.classList.add('md-cm6-source-hidden');
    let syncTimer = null;
    const flush = () => {
        if (!textarea.__mdCm6View) return;
        const value = textarea.__mdCm6View.state.doc.toString();
        if (textarea.value === value) return;
        textarea.value = value;
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    };
    const scheduleFlush = () => {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(flush, Number(options.syncDelayMs) || 120);
    };
    const view = new EditorView({
        state: EditorState.create({
            doc: textarea.value,
            extensions: [
                history(),
                highlightSelectionMatches(),
                commentDecorations,
                EditorView.lineWrapping,
                EditorView.updateListener.of(update => {
                    if (update.docChanged) scheduleFlush();
                }),
                keymap.of([
                    { key: 'Mod-/', run: toggleComment },
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...searchKeymap
                ])
            ]
        }),
        parent: host
    });
    textarea.__mdCm6View = view;
    view.focus();
    window.addEventListener('beforeunload', flush);
    mountBenchmarkControls(view);
    return view;
}

function destroy(textarea) {
    if (!textarea || !textarea.__mdCm6View) return false;
    const view = textarea.__mdCm6View;
    textarea.value = view.state.doc.toString();
    view.destroy();
    const host = document.getElementById('md-cm6-editor');
    if (host) host.remove();
    textarea.classList.remove('md-cm6-source-hidden');
    textarea.__mdCm6View = null;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

window.MDCm6Prototype = Object.freeze({ mount, destroy, toggleComment, runBenchmark });

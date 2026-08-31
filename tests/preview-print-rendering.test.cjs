const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const previewPath = path.join(root, 'js', 'UI_PV', 'editpv.js');
const previewSource = fs.readFileSync(previewPath, 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

function createPreviewDocumentHtml() {
    const stylesheetLinks = [
        { href: 'http://127.0.0.1:8765/css/tailwind-static.css?v=test' },
        { href: 'http://127.0.0.1:8765/css/style.css?v=test' },
        { href: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css' },
        { href: 'http://127.0.0.1:8765/sidebarAI/sidebar-ai.css?v=test' }
    ];
    const context = {
        URL,
        localStorage: { getItem() { return null; } },
        document: {
            baseURI: 'http://127.0.0.1:8765/',
            querySelectorAll(selector) {
                assert.equal(selector, 'link[rel~=\"stylesheet\"][href]');
                return stylesheetLinks;
            }
        },
        window: {
            location: { href: 'http://127.0.0.1:8765/' }
        }
    };
    context.globalThis = context;
    vm.runInNewContext(
        previewSource
            + '\n;globalThis.__getPreviewPopupDocumentHtml = getPreviewPopupDocumentHtml;'
            + '\n;globalThis.__isPreviewPopupDarkTheme = isPreviewPopupDarkTheme;',
        context
    );
    assert.equal(context.__isPreviewPopupDarkTheme(), false);
    return context.__getPreviewPopupDocumentHtml();
}

test('PV document uses application styles with correct light/dark paper canvases', () => {
    const html = createPreviewDocumentHtml();

    assert.match(html, /MDproViewer Print Preview/);
    assert.match(html, /tailwind-static\.css\?v=test/);
    assert.match(html, /css\/style\.css\?v=test/);
    assert.match(html, /katex\.min\.css/);
    assert.doesNotMatch(html, /sidebar-ai\.css/);
    assert.match(html, /id=\"pv-content\" class=\"markdown-body print-area\"/);
    assert.match(html, /\.pv-page\{[^}]*width:210mm;height:297mm/);
    assert.match(html, /body\.pv-editor-mode #pv-content\{[^}]*min-height:297mm;[^}]*background:#fff;color:#1e293b/);
    assert.match(html, /\.pv-page-content\{[^}]*background:#fff!important;color:#1e293b!important/);
    assert.match(html, /html\.dark body\.pv-editor-mode #pv-content\{background:#111827;color:#e2e8f0/);
    assert.match(html, /html\.dark \.pv-page-content\{background:#111827!important;color:#e2e8f0!important/);
    assert.match(html, /#pv-content>\.note-cover-page\{left:50%;max-width:none!important;[^}]+translateX\(-50%\)/);
    assert.match(html, /#pv-content>\.note-cover-size-a4\{width:210mm!important;\}/);
    assert.match(html, /#pv-content img,[^}]+max-width:100%/);
    assert.match(html, /#pv-content iframe,[^}]+max-width:100%/);
    assert.match(html, /id=\"pv-font-label\" class=\"label\">16px/);
    assert.match(html, /id="pv-theme-toggle"/);
    assert.match(html, />다크<\/button>/);
    assert.match(html, /html,html\.dark,body,html\.dark body\{background:#fff!important;color:#1e293b!important;color-scheme:light;/);
    assert.doesNotMatch(html, /max-width:56rem/);
});

test('PV defaults and post-render hooks stay aligned with print output', () => {
    assert.match(appSource, /let previewPopupFontSize = 16;/);
    assert.match(previewSource, /window\.NoteCoverRenderer\.hydrate\(target, \{\}\)/);
    assert.match(previewSource, /element\.setAttribute\('contenteditable', 'false'\)/);
    assert.match(appSource, /function applyMarkdownImageSizeHints\(rootElement\)/);
    assert.match(appSource, /applyMarkdownImageSizeHints\(viewer\)/);
    assert.match(previewSource, /applyMarkdownImageSizeHints\(target\)/);
    assert.match(previewSource, /content\.style\.setProperty\('--md-app-font-size', fs \+ 'px'\)/);
    assert.match(indexSource, /editpv\.js\?[^"\r\n]*pvPrint=20260811-1/);
    assert.match(indexSource, /app\.js\?[^"\r\n]*imageSizeHint=20260811-1/);
});

test('native print always uses the light viewer palette even when the app is dark', () => {
    assert.match(styleSource, /#print-root \.markdown-body \{[^}]*color-scheme: light;[^}]*print-color-adjust: exact;/s);
    assert.match(styleSource, /#print-root \.markdown-body pre \{[^}]*background-color: #e2e8f0 !important;[^}]*color: #1e293b !important;/s);
    assert.match(styleSource, /#print-root \.markdown-body h1 \{[^}]*color: #1e3a8a !important;/s);
    assert.match(styleSource, /#print-root \.markdown-body strong \{[^}]*color: #7c3aed !important;[^}]*text-shadow: none !important;/s);
    assert.match(indexSource, /style\.css\?[^"\r\n]*printLight=20260831-2/);
});

test('image height hints are applied and removed from rendered print text', () => {
    const start = appSource.indexOf('function applyMarkdownImageSizeHints(rootElement)');
    const end = appSource.indexOf('\nwindow.applyMarkdownImageSizeHints', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const context = {};
    context.globalThis = context;
    vm.runInNewContext(
        appSource.slice(start, end)
            + '\n;globalThis.__applyMarkdownImageSizeHints = applyMarkdownImageSizeHints;',
        context
    );

    const hintNode = {
        nodeType: 3,
        nodeValue: ' {h=280px} URL: https://example.test/',
        remove() { this.removed = true; }
    };
    const image = { nextSibling: hintNode, style: {} };
    const applied = context.__applyMarkdownImageSizeHints({
        querySelectorAll(selector) {
            assert.equal(selector, 'img');
            return [image];
        }
    });

    assert.equal(applied, 1);
    assert.equal(image.style.height, '280px');
    assert.equal(image.style.width, 'auto');
    assert.equal(image.style.maxWidth, '100%');
    assert.equal(hintNode.nodeValue, ' URL: https://example.test/');
    assert.equal(hintNode.removed, undefined);
});

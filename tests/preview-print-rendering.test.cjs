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

function createPreviewDocumentHtml() {
    const stylesheetLinks = [
        { href: 'http://127.0.0.1:8765/css/tailwind-static.css?v=test' },
        { href: 'http://127.0.0.1:8765/css/style.css?v=test' },
        { href: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css' },
        { href: 'http://127.0.0.1:8765/sidebarAI/sidebar-ai.css?v=test' }
    ];
    const context = {
        URL,
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

test('PV document uses the application print styles and an A4 white paper canvas', () => {
    const html = createPreviewDocumentHtml();

    assert.match(html, /MDproViewer Print Preview/);
    assert.match(html, /tailwind-static\.css\?v=test/);
    assert.match(html, /css\/style\.css\?v=test/);
    assert.match(html, /katex\.min\.css/);
    assert.doesNotMatch(html, /sidebar-ai\.css/);
    assert.match(html, /id=\"pv-content\" class=\"markdown-body print-area\"/);
    assert.match(html, /width:210mm;max-width:210mm;min-height:297mm/);
    assert.match(html, /background:#fff;color:#1e293b/);
    assert.match(html, /#pv-content>\.note-cover-page\{left:50%;max-width:none!important;[^}]+translateX\(-50%\)/);
    assert.match(html, /#pv-content>\.note-cover-size-a4\{width:210mm!important;\}/);
    assert.match(html, /#pv-content img,[^}]+max-width:100%/);
    assert.match(html, /#pv-content iframe,[^}]+max-width:100%/);
    assert.match(html, /id=\"pv-font-label\" class=\"label\">16px/);
    assert.doesNotMatch(html, /html\.dark/);
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

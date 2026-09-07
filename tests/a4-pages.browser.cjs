const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    console.log('Opening app');
    await page.goto('http://127.0.0.1:8877/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.A4Pages && typeof createNewFile === 'function');
    if (!await page.evaluate(() => typeof marked !== 'undefined')) {
        const markedPath = process.env.PLAYWRIGHT_MODULE
            ? path.join(path.dirname(process.env.PLAYWRIGHT_MODULE), 'marked/lib/marked.umd.js')
            : require.resolve('marked').replace('marked.esm.js', 'marked.umd.js');
        await page.addScriptTag({ path: markedPath });
    }
    await page.waitForTimeout(3000);
    await page.evaluate(() => A4Pages.create('portrait'));
    console.log('Created');
    await page.locator('#a4-page-editor textarea').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#a4-page-editor .a4-sheet').count(), 1);
    await page.locator('#a4-page-editor textarea').fill('# 항목 구성하기 먼저 문자를\n\n잘 보이는 본문과 **강조**입니다.');
    await page.evaluate(() => { document.documentElement.classList.add('dark'); toggleMode('view'); });
    await page.locator('#viewer .a4-sheet h1').waitFor({ state: 'visible' });
    for (const light of [true, false]) {
        if (await page.evaluate(() => document.getElementById('drop-zone').classList.contains('document-light-mode')) !== light) {
            await page.evaluate(() => toggleDocumentLightMode());
        }
        const colors = await page.evaluate(() => {
            const sheet = document.querySelector('#viewer .a4-sheet');
            return { paper: getComputedStyle(sheet).backgroundColor, ink: getComputedStyle(sheet).color,
                heading: getComputedStyle(sheet.querySelector('h1')).color,
                editor: getComputedStyle(document.querySelector('#a4-page-editor textarea')).backgroundColor,
                button: getComputedStyle(document.querySelector('#a4-page-toolbar button')).backgroundColor };
        });
        assert.equal(colors.paper, light ? 'rgb(255, 255, 255)' : 'rgb(15, 23, 42)');
        assert.equal(colors.ink, light ? 'rgb(23, 32, 51)' : 'rgb(226, 232, 240)');
        assert.equal(colors.heading, light ? 'rgb(30, 58, 138)' : 'rgb(191, 219, 254)');
        assert.equal(colors.editor, colors.paper); assert.equal(colors.button, colors.paper);
        await page.screenshot({ path: path.join(os.tmpdir(), `mdpro-a4-${light ? 'light' : 'dark'}.png`) });
    }
    await page.evaluate(() => toggleMode('edit'));
    const long = '한글 자동 페이지 넘김 😀 테스트입니다. '.repeat(900);
    await page.locator('#a4-page-editor textarea').first().fill(long);
    console.log('Filled');
    await page.screenshot({ path: path.join(os.tmpdir(), 'mdpro-a4-pages-edit.png') });
    const data = await page.evaluate(() => A4Pages.parse(editorTextarea.value));
    assert.ok(data.length > 1); assert.equal(data.map(p => p.text).join(''), long);
    await page.getByRole('button', { name: '현재 페이지 다음에 빈 페이지 추가', exact: true }).click();
    assert.equal(await page.locator('#a4-page-editor .a4-sheet').count(), data.length + 1);
    await page.getByLabel('전체 페이지', { exact: true }).selectOption('landscape');
    console.log('Rotated');
    assert.equal(await page.locator('#a4-page-editor .a4-portrait').count(), 0);
    await page.getByLabel('현재 페이지', { exact: true }).selectOption('portrait');
    assert.ok(await page.locator('#a4-page-editor .a4-portrait').count() >= 1);
    await page.evaluate(() => toggleMode('view'));
    console.log('View');
    await page.locator('#viewer .a4-sheet').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#viewer .a4-sheet').count() > 1);
    const rendered = await page.locator('#viewer .a4-page-content').allTextContents();
    assert.equal(rendered.join('').replace(/\s/g, ''), long.replace(/\s/g, ''));
    await page.getByRole('button', { name: '이전 페이지', exact: true }).click();
    await page.waitForTimeout(500);
    await page.locator('#viewer .a4-sheet').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'mdpro-a4-pages-view.png'), fullPage: false });
    const saved = await page.evaluate(() => editorTextarea.value);
    await page.evaluate(() => { toggleMode('edit'); createNewFile(); });
    await page.evaluate(saved => updateContent(saved), saved);
    assert.equal(await page.evaluate(() => editorTextarea.value), saved);
    await page.getByRole('button', { name: '현재 페이지 다음에 빈 페이지 추가', exact: true }).click();
    await page.evaluate(() => undoEditorDocumentHistory());
    assert.equal(await page.evaluate(() => editorTextarea.value), saved);
    await page.evaluate(long => {
        updateContent(A4Pages.serialize([{direction:'portrait', text:'# 제목\n\n' + long}]));
        toggleMode('view');
    }, long);
    await page.waitForFunction(() => document.querySelectorAll('#viewer .a4-sheet').length > 1);
    await page.waitForTimeout(200);
    assert.equal((await page.locator('#viewer .a4-page-content').allTextContents()).join('').replace(/\s/g, ''), ('제목' + long).replace(/\s/g, ''));
    await page.evaluate(() => createNewFile());
    assert.equal(await page.locator('body.a4-document').count(), 0);
    console.log(JSON.stringify({ pages: data.length, errors }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

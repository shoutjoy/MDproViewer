const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'MobileUI', 'mobile-ui.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'MobileUI', 'mobile-ui.js'), 'utf8');

test('MobileUI assets are loaded by the main application', () => {
    assert.match(html, /MobileUI\/mobile-ui\.css/);
    assert.match(html, /MobileUI\/mobile-ui\.js/);
});

test('mobile editing menu is collapsible and persisted', () => {
    assert.match(js, /md_viewer_mobile_edit_tools_open_v1/);
    assert.match(js, /mobile-edit-tools-collapsed/);
    assert.match(js, /aria-expanded/);
    assert.match(css, /mobile-edit-tools-collapsed #edit-tools/);
});

test('mobile navigation reuses existing mode switching', () => {
    assert.match(js, /window\.toggleMode\(mode\)/);
    assert.match(js, /window\.toggleMode\('view'\)/);
    assert.match(js, /window\.openPreviewPopupWindow/);
    assert.match(js, /window\.toggleTheme/);
    assert.match(js, /window\.openSettingsModal/);
    assert.match(js, /mobile-sidebar-open/);
    assert.match(css, /mobile-reading-focus/);
});

test('mobile dock follows the requested seven-item order', () => {
    assert.match(js, /dock\.append\(menu, edit, view, preview, focus, theme, settings\)/);
    for (const label of ['문서', '편집', '보기', 'PV', '집중보기', '다크\/라이트', '설정']) {
        assert.match(js, new RegExp("'" + label + "'"));
    }
});

test('header actions and document panel have dedicated mobile toggles', () => {
    assert.match(js, /md_viewer_mobile_header_file_menu_open_v1/);
    assert.match(js, /md_viewer_mobile_header_feature_menu_open_v1/);
    assert.match(js, /mobile-header-file-collapsed/);
    assert.match(js, /mobile-header-feature-collapsed/);
    assert.match(js, /mobile-header-file-group/);
    assert.match(js, /mobile-header-feature-group/);
    assert.match(js, /mobile-sidebar-close-button/);
    assert.match(js, /button\[onclick="clearUnusedCache\(\)"\]/);
    assert.match(css, /button\[onclick="toggleSidebarCollapse\(\)"\]/);
});

test('mobile layout includes safe areas and keyboard handling', () => {
    assert.match(css, /env\(safe-area-inset-bottom/);
    assert.match(js, /visualViewport/);
    assert.match(css, /mobile-keyboard-open/);
});

test('mobile zoom controls sit directly above the bottom dock', () => {
    assert.match(css, /--mobile-ui-zoom-height/);
    assert.match(css, /#footer-zoom-font/);
    assert.match(css, /bottom:\s*calc\(var\(--mobile-ui-dock-height\) \+ var\(--mobile-ui-safe-bottom\)\)/);
});

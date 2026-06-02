(function () {
    'use strict';

    function installSqliteInstallLink() {
        const sqliteCheckbox = document.getElementById('sqlite-enabled');
        if (!sqliteCheckbox) return;
        const wrap = sqliteCheckbox.closest('.pt-1');
        if (!wrap || wrap.querySelector('[data-setting-link="sqlite-install"]')) return;

        const linkWrap = document.createElement('div');
        linkWrap.className = 'mt-1 pl-6';
        linkWrap.dataset.settingLink = 'sqlite-install';
        linkWrap.innerHTML = [
            '<a href="https://www.sqlite.org/download.html" target="_blank" rel="noopener noreferrer"',
            ' class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">',
            'SQLite 프로그램 설치: https://www.sqlite.org/download.html',
            '</a>'
        ].join('');
        wrap.appendChild(linkWrap);
    }

    function installSettingUi() {
        installSqliteInstallLink();
    }

    document.addEventListener('DOMContentLoaded', installSettingUi);

    window.SettingUI = {
        install: installSettingUi,
        installSqliteInstallLink: installSqliteInstallLink
    };
})();

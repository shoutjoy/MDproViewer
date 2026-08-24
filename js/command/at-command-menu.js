(function () {
    'use strict';

    const state = {
        textarea: null,
        menu: null,
        list: null,
        title: null,
        count: null,
        search: null,
        open: false,
        triggerStart: -1,
        queryEnd: -1,
        query: '',
        items: [],
        selectedIndex: 0,
        suppressInput: false
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(message) {
        if (typeof window.showToast === 'function') window.showToast(message);
    }

    function callGlobal(name) {
        const args = Array.prototype.slice.call(arguments, 1);
        const fn = window[name];
        if (typeof fn !== 'function') {
            notify(name + ' 기능을 사용할 수 없습니다.');
            return false;
        }
        return fn.apply(window, args);
    }

    function openSettingsAt(elementId) {
        callGlobal('openSettingsModal');
        setTimeout(function () {
            const target = document.getElementById(elementId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
    }

    async function openShareMenu() {
        if (window.ShareModule && typeof window.ShareModule.ensureShareUiReady === 'function') {
            await window.ShareModule.ensureShareUiReady();
        }
        const visibilityCheck = document.getElementById('todocs-visible');
        if (visibilityCheck && !visibilityCheck.checked) {
            visibilityCheck.checked = true;
            if (typeof window.toggleToDocsSection === 'function') await window.toggleToDocsSection();
        }
        return callGlobal('toggleShareLinksMenu');
    }

    function openSite(site) {
        const url = String(site && site.url ? site.url : '').trim();
        if (!/^https?:\/\//i.test(url)) {
            notify('사이트 주소가 올바르지 않습니다.');
            return false;
        }
        const opened = window.open(url, '_blank');
        if (!opened) {
            notify('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
            return false;
        }
        try { opened.opener = null; } catch (_) {}
        return true;
    }

    function baseCommands() {
        return [
            { id: 'connect-sites', label: 'Sites 열기', detail: '등록된 사이트 목록과 관리 패널 열기', category: '연결', icon: 'panels-top-left', keywords: 'sites site web 사이트 통계', run: function () { return callGlobal('toggleSitesPanel'); } },
            { id: 'connect-share', label: 'Share 열기', detail: '문서를 복사하고 공유 대상 메뉴 열기', category: '연결', icon: 'share-2', keywords: 'share 공유 docs gemini colab story sheets slides gist', immediate: true, run: openShareMenu },
            { id: 'connect-scholar-ai', label: 'ScholarAI 열기', detail: '학술 AI 사이드바 열기', category: 'AI', icon: 'sparkles', keywords: 'scholar ai 논문 연구', run: function () { return callGlobal('openScholarAIFromHeader'); } },
            { id: 'connect-image-ai', label: 'sspimgAI 열기', detail: '이미지 AI 사이드바 열기', category: 'AI', icon: 'image-plus', keywords: 'sspimg sspai image ai 이미지', run: function () { return callGlobal('openSspimgAIFromHeader'); } },
            { id: 'tool-scholar-search', label: '학술검색', detail: '논문 검색 창 열기', category: '도구', icon: 'graduation-cap', keywords: 'scholar 논문 research 학술 검색', run: function () { return callGlobal('openScholarSearchModal'); } },
            { id: 'tool-genslide', label: 'GenSlide', detail: '프레젠테이션 도구 열기', category: '도구', icon: 'presentation', keywords: 'slide ppt 프레젠테이션', run: function () { return callGlobal('toggleHtml2pptPanel'); } },

            { id: 'template-library', label: '모든 양식 보기', detail: '양식 라이브러리 열기', category: '양식', icon: 'notebook-tabs', keywords: '템플릿 template 양식 불러오기', run: function () { return callGlobal('openTemplatePanel'); } },
            { id: 'template-current', label: '선택된 양식 삽입', detail: '양식 패널에서 선택한 양식 사용', category: '양식', icon: 'file-input', keywords: 'template insert 불러오기', run: function () { return callGlobal('insertSelectedTemplateToDocument'); } },
            { id: 'template-new', label: '양식으로 새 문서', detail: '선택된 양식으로 새 파일 시작', category: '양식', icon: 'file-plus-2', keywords: 'template new 새파일', run: function () { return callGlobal('insertSelectedTemplateAsNewFile'); } },

            { id: 'connect-calendar', label: 'Google 캘린더 열기', detail: '설정한 방식으로 Google Calendar 열기', category: '연결', icon: 'calendar-days', keywords: 'google calendar 일정 캘린더', immediate: true, run: function () { return callGlobal('openGoogleCalendarWindow'); } },
            { id: 'connect-calendar-settings', label: 'Google 캘린더 설정', detail: '캘린더 사용 설정으로 이동', category: '연결', icon: 'calendar-cog', keywords: 'google calendar 설정 연결', run: function () { return callGlobal('focusGoogleCalendarSettings'); } },
            { id: 'connect-google-docs', label: 'Google 문서로 보내기', detail: '현재 문서를 Google Docs로 내보내기', category: '연결', icon: 'file-up', keywords: 'google docs 문서 내보내기', immediate: true, run: function () { return callGlobal('exportCurrentToGoogleDocs'); } },
            { id: 'connect-google-docs-settings', label: 'Google Docs 연결 설정', detail: 'Google Docs 인증 및 동기화 설정', category: '연결', icon: 'plug-zap', keywords: 'google docs oauth plugin 설정', run: function () { openSettingsAt('gdocs-settings'); } },
            { id: 'connect-github-settings', label: 'GitHub 연결 설정', detail: '저장소 연결과 동기화 설정', category: '연결', icon: 'github', keywords: 'github repository plugin 설정', run: function () { openSettingsAt('github-settings-slot'); } },
            { id: 'connect-settings', label: '연결 및 앱 설정', detail: '환경 설정 열기', category: '연결', icon: 'settings', keywords: 'plugin integration 설정 플러그인', run: function () { return callGlobal('openSettingsModal'); } },

            { id: 'insert-user', label: '사용자 정보', detail: '저장된 userIn 정보 삽입', category: '삽입', icon: 'contact', keywords: '사용자 userin profile', run: function () { return callGlobal('insertUserInfoAtCursor'); } },
            { id: 'insert-link', label: '링크', detail: '링크 삽입 창 열기', category: '삽입', icon: 'link', keywords: 'url hyperlink 연결', run: function () { return callGlobal('openLinkModal', 'link'); } },
            { id: 'insert-image', label: '이미지', detail: '이미지 삽입 도구 열기', category: '삽입', icon: 'image', keywords: '사진 img upload', run: function () { return callGlobal('openImageInsertModal'); } },
            { id: 'insert-table', label: '표', detail: 'Markdown 표 삽입', category: '삽입', icon: 'table-2', keywords: '테이블 table grid', run: function () { return callGlobal('handleTableInsertion'); } },
            { id: 'insert-footnote', label: '각주', detail: '각주 번호와 정의 삽입', category: '삽입', icon: 'superscript', keywords: 'footnote 주석', run: function () { return callGlobal('insertFootnoteTemplate'); } },
            { id: 'insert-math-inline', label: '인라인 수식', detail: '$x$ 수식 삽입', category: '삽입', icon: 'sigma', keywords: 'math latex 수학', run: function () { return callGlobal('insertInlineMathTemplate'); } },
            { id: 'insert-math-block', label: '블록 수식', detail: '$$...$$ 수식 삽입', category: '삽입', icon: 'square-sigma', keywords: 'math latex display 수학', run: function () { return callGlobal('insertDisplayMathTemplate'); } },
            { id: 'insert-page-break', label: '페이지 구분', detail: '페이지 나누기 삽입', category: '삽입', icon: 'scissors-line-dashed', keywords: 'page break 쪽 나누기', run: function () { return callGlobal('insertLiteralAtCursor', '\n\n<div class="page-break"></div>\n\n'); } },
            { id: 'insert-rule', label: '가로 구분선', detail: 'Markdown 구분선 삽입', category: '삽입', icon: 'minus', keywords: 'separator horizontal rule hr', run: function () { return callGlobal('insertLiteralAtCursor', '\n\n---\n\n'); } },

            { id: 'format-bold', label: '굵게', detail: '선택 영역을 굵게 표시', category: '편집', icon: 'bold', keywords: 'bold 굵은 글씨', run: function () { return callGlobal('insertAtCursor', 'bold'); } },
            { id: 'format-italic', label: '기울임', detail: '선택 영역을 기울임 표시', category: '편집', icon: 'italic', keywords: 'italic 이탤릭', run: function () { return callGlobal('insertAtCursor', 'italic'); } },
            { id: 'format-h1', label: '제목 1', detail: 'H1 제목으로 적용', category: '편집', icon: 'heading-1', keywords: 'heading h1 제목', run: function () { return callGlobal('applyHeading', 1); } },
            { id: 'format-h2', label: '제목 2', detail: 'H2 제목으로 적용', category: '편집', icon: 'heading-2', keywords: 'heading h2 제목', run: function () { return callGlobal('applyHeading', 2); } },
            { id: 'format-h3', label: '제목 3', detail: 'H3 제목으로 적용', category: '편집', icon: 'heading-3', keywords: 'heading h3 제목', run: function () { return callGlobal('applyHeading', 3); } },
            { id: 'format-bullet', label: '글머리 목록', detail: '- 목록으로 적용', category: '편집', icon: 'list', keywords: 'bullet list 항목', run: function () { return callGlobal('insertListAtSelection', 'bullet'); } },
            { id: 'format-number', label: '번호 목록', detail: '1. 목록으로 적용', category: '편집', icon: 'list-ordered', keywords: 'number list 순서', run: function () { return callGlobal('insertListAtSelection', 'number'); } },
            { id: 'format-quote', label: '인용문', detail: 'Markdown 인용문 삽입', category: '편집', icon: 'quote', keywords: 'blockquote quote 인용', run: function () { return callGlobal('insertAtCursor', 'quote'); } },
            { id: 'format-code', label: '코드 블록', detail: '코드 블록 삽입', category: '편집', icon: 'code-2', keywords: 'code fence 코드', run: function () { return callGlobal('insertAtCursor', 'code'); } },
            { id: 'format-mermaid', label: 'Mermaid 다이어그램', detail: 'Mermaid 블록 삽입', category: '편집', icon: 'workflow', keywords: 'diagram flowchart mermaid', run: function () { return callGlobal('insertAtCursor', 'mermaid'); } },

            { id: 'tool-find', label: '찾기 및 바꾸기', detail: '문서 검색 도구 열기', category: '도구', icon: 'search', keywords: 'find replace 검색 치환', run: function () { return callGlobal('openFindReplace'); } },
            { id: 'tool-tidy', label: '문서 Tidy', detail: 'Markdown 간격과 구분선 정리', category: '도구', icon: 'wand-sparkles', keywords: 'tidy 정리 서식', run: function () { return callGlobal('tidySeparatorSpacingInEditor'); } },
            { id: 'tool-merge', label: '문서 합치기', detail: 'Merge 도구 열기', category: '도구', icon: 'combine', keywords: 'merge 병합 합치기', run: function () { return callGlobal('openMergeModal'); } },
            { id: 'tool-highlight', label: 'Highlight', detail: '하이라이트 도구 열기', category: '도구', icon: 'highlighter', keywords: 'highlight 형광펜', run: function () { return callGlobal('openHighlightPopup'); } },
            { id: 'tool-preview', label: '미니 미리보기', detail: '편집 미리보기 전환', category: '도구', icon: 'panel-right-open', keywords: 'preview minipv 미리보기', run: function () { return callGlobal('toggleMiniPreview'); } }
        ];
    }

    function templateCommands() {
        if (typeof window.getAtCommandTemplates !== 'function') return [];
        let templates = [];
        try { templates = window.getAtCommandTemplates() || []; } catch (_) {}
        return templates.map(function (item) {
            const name = String(item && item.name ? item.name : '양식');
            const desc = String(item && item.desc ? item.desc : '');
            const id = String(item && item.id ? item.id : '');
            return {
                id: 'template:' + id,
                label: name,
                detail: desc || (item && item.isCustom ? '사용자 양식 삽입' : '기본 양식 삽입'),
                category: '양식',
                icon: item && item.isCustom ? 'file-user' : 'file-text',
                keywords: '양식 템플릿 template ' + name + ' ' + desc,
                run: function () { return callGlobal('insertTemplateByCommandId', id); }
            };
        });
    }

    function siteCommands() {
        let sites = [];
        try {
            if (typeof window.getSitesList === 'function') sites = window.getSitesList() || [];
            if (!sites.length && typeof window.getDefaultSitesList === 'function') sites = window.getDefaultSitesList() || [];
        } catch (_) {}
        return sites.map(function (site, index) {
            const name = String(site && site.name ? site.name : site && site.url ? site.url : '사이트');
            const url = String(site && site.url ? site.url : '');
            return {
                id: 'site:' + index + ':' + url,
                label: name + ' 열기',
                detail: url,
                category: '사이트',
                icon: 'external-link',
                keywords: 'sites site 사이트 web ' + name + ' ' + url,
                immediate: true,
                run: function () { return openSite(site); }
            };
        });
    }

    function getCommands(includeDynamic) {
        return baseCommands().concat(includeDynamic ? templateCommands() : [], includeDynamic ? siteCommands() : []);
    }

    function normalizeSearch(value) {
        return String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    }

    function filterCommands(query) {
        const q = normalizeSearch(query);
        const commands = getCommands(!!q);
        if (!q) {
            const featuredIds = [
                'connect-sites', 'connect-share', 'connect-scholar-ai', 'connect-image-ai',
                'tool-scholar-search', 'template-library', 'connect-calendar', 'connect-google-docs',
                'tool-genslide', 'connect-settings', 'insert-user', 'format-bold',
                'format-h1', 'format-bullet', 'insert-link', 'insert-image', 'insert-table',
                'tool-find', 'tool-merge', 'tool-tidy'
            ];
            return featuredIds
                .map(function (id) { return commands.find(function (command) { return command.id === id; }); })
                .filter(Boolean);
        }
        const tokens = q.split(' ').filter(Boolean);
        return commands
            .map(function (command, index) {
                const label = normalizeSearch(command.label);
                const haystack = normalizeSearch(command.label + ' ' + command.detail + ' ' + command.category + ' ' + command.keywords);
                if (!tokens.every(function (token) { return haystack.indexOf(token) >= 0; })) return null;
                let score = index + 100;
                if (label === q) score = 0;
                else if (label.indexOf(q) === 0) score = 10 + label.length;
                else if (label.indexOf(q) >= 0) score = 30 + label.indexOf(q);
                else score = 60 + Math.max(0, haystack.indexOf(q));
                return { command: command, score: score };
            })
            .filter(Boolean)
            .sort(function (a, b) { return a.score - b.score; })
            .slice(0, 40)
            .map(function (entry) { return entry.command; });
    }

    function detectTrigger(text, caret) {
        const source = String(text || '');
        const pos = Math.max(0, Math.min(Number(caret) || 0, source.length));
        const before = source.slice(0, pos);
        const at = before.lastIndexOf('@');
        if (at < 0) return null;
        if (at > 0 && !/[\s([{"'>]/.test(before.charAt(at - 1))) return null;
        const query = before.slice(at + 1);
        if (/[\r\n]/.test(query) || query.length > 80) return null;
        return { start: at, end: pos, query: query };
    }

    function installStyles() {
        if (document.getElementById('at-command-menu-style')) return;
        const style = document.createElement('style');
        style.id = 'at-command-menu-style';
        style.textContent = [
            '#at-command-menu{position:fixed;z-index:2147483600;width:min(430px,calc(100vw - 20px));max-height:min(500px,72vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;border-radius:12px;background:rgba(255,255,255,.98);box-shadow:0 18px 48px rgba(15,23,42,.26);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}',
            '#at-command-menu[hidden]{display:none!important}',
            '#at-command-menu .at-head{padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;font-weight:700}',
            '#at-command-menu .at-headline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}',
            '#at-command-menu .at-count{font-size:10px;font-weight:600;color:#94a3b8}',
            '#at-command-menu .at-search-wrap{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#64748b}',
            '#at-command-menu .at-search{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#0f172a;font:500 13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}',
            '#at-command-menu .at-search::placeholder{color:#94a3b8}',
            '#at-command-menu .at-list{overflow-y:auto;padding:6px}',
            '#at-command-menu .at-empty{padding:22px 14px;text-align:center;color:#94a3b8;font-size:13px}',
            '#at-command-menu .at-item{width:100%;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border:0;border-radius:8px;background:transparent;text-align:left;color:#1e293b;cursor:pointer}',
            '#at-command-menu .at-item:hover,#at-command-menu .at-item.is-selected{background:#e0e7ff;color:#3730a3}',
            '#at-command-menu .at-icon{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:#f1f5f9;color:#475569}',
            '#at-command-menu .at-icon svg{width:15px;height:15px}',
            '#at-command-menu .at-copy{min-width:0}',
            '#at-command-menu .at-label{display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#at-command-menu .at-detail{display:block;margin-top:2px;font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#at-command-menu .at-category{font-size:10px;color:#64748b;background:#f1f5f9;border-radius:999px;padding:3px 7px;white-space:nowrap}',
            '#at-command-menu .at-foot{padding:7px 11px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px}',
            '.dark #at-command-menu{border-color:#475569;background:rgba(15,23,42,.98);box-shadow:0 18px 48px rgba(0,0,0,.55)}',
            '.dark #at-command-menu .at-head,.dark #at-command-menu .at-foot{border-color:#334155;color:#94a3b8}',
            '.dark #at-command-menu .at-search-wrap{border-color:#475569;background:#0f172a;color:#94a3b8}',
            '.dark #at-command-menu .at-search{color:#f8fafc}',
            '.dark #at-command-menu .at-item{color:#e2e8f0}',
            '.dark #at-command-menu .at-item:hover,.dark #at-command-menu .at-item.is-selected{background:#312e81;color:#eef2ff}',
            '.dark #at-command-menu .at-icon,.dark #at-command-menu .at-category{background:#1e293b;color:#cbd5e1}',
            '.dark #at-command-menu .at-detail{color:#94a3b8}'
        ].join('');
        document.head.appendChild(style);
    }

    function buildMenu() {
        if (state.menu) return;
        installStyles();
        const menu = document.createElement('div');
        menu.id = 'at-command-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', '@ 명령 메뉴');
        menu.innerHTML = [
            '<div class="at-head">',
            '  <div class="at-headline"><span class="at-title">@ 명령 메뉴</span><span class="at-count"></span></div>',
            '  <label class="at-search-wrap"><span aria-hidden="true">🔍</span><input type="search" class="at-search" aria-label="앱 기능 검색" placeholder="기능, 사이트, 양식 검색..." autocomplete="off" spellcheck="false"></label>',
            '</div>',
            '<div class="at-list"></div>',
            '<div class="at-foot">↑↓ 이동 · Enter 실행 · Esc 닫기</div>'
        ].join('');
        document.body.appendChild(menu);
        state.menu = menu;
        state.title = menu.querySelector('.at-title');
        state.count = menu.querySelector('.at-count');
        state.search = menu.querySelector('.at-search');
        state.list = menu.querySelector('.at-list');
        state.list.setAttribute('role', 'listbox');
        state.list.setAttribute('aria-label', '명령 검색 결과');
        state.search.addEventListener('input', function () {
            state.query = state.search.value;
            state.selectedIndex = 0;
            renderMenu();
        });
        state.search.addEventListener('keydown', onKeydown, true);
        menu.addEventListener('mousedown', function (event) {
            const button = event.target && event.target.closest ? event.target.closest('button[data-command-index]') : null;
            if (!button) return;
            event.preventDefault();
            const index = Number(button.dataset.commandIndex);
            if (Number.isFinite(index) && state.items[index]) executeCommand(state.items[index]);
        });
    }

    function getCaretPoint(textarea, caret) {
        const computed = window.getComputedStyle(textarea);
        const mirror = document.createElement('div');
        [
            'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth',
            'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily', 'lineHeight',
            'letterSpacing', 'textTransform', 'textIndent', 'textDecoration', 'tabSize', 'MozTabSize'
        ].forEach(function (property) { mirror.style[property] = computed[property]; });
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.left = '-10000px';
        mirror.style.top = '0';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.overflowWrap = 'break-word';
        mirror.textContent = textarea.value.substring(0, caret);
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const mirrorRect = mirror.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        const textareaRect = textarea.getBoundingClientRect();
        const point = {
            left: textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft,
            top: textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop,
            lineHeight: parseFloat(computed.lineHeight) || 24
        };
        mirror.remove();
        return point;
    }

    function positionMenu() {
        if (!state.open || !state.menu || !state.textarea) return;
        const point = getCaretPoint(state.textarea, state.queryEnd);
        const width = Math.min(430, Math.max(280, window.innerWidth - 20));
        const left = Math.max(10, Math.min(window.innerWidth - width - 10, point.left));
        let top = point.top + point.lineHeight + 8;
        state.menu.style.width = width + 'px';
        state.menu.style.left = Math.round(left) + 'px';
        state.menu.style.top = Math.round(top) + 'px';
        const rect = state.menu.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 10) {
            top = Math.max(10, point.top - rect.height - 8);
            state.menu.style.top = Math.round(top) + 'px';
        }
    }

    function renderMenu() {
        if (!state.menu) return;
        state.items = filterCommands(state.query);
        state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, Math.max(0, state.items.length - 1)));
        state.title.textContent = state.query ? '@ 명령 검색' : '@ 명령 메뉴';
        state.count.textContent = state.items.length + '개';
        if (state.search && state.search.value !== state.query) state.search.value = state.query;
        if (!state.items.length) {
            state.list.innerHTML = '<div class="at-empty">일치하는 기능이 없습니다.</div>';
        } else {
            state.list.innerHTML = state.items.map(function (command, index) {
                return '<button type="button" class="at-item' + (index === state.selectedIndex ? ' is-selected' : '') + '" data-command-index="' + index + '" role="option" aria-selected="' + (index === state.selectedIndex ? 'true' : 'false') + '">'
                    + '<span class="at-icon"><i data-lucide="' + escapeHtml(command.icon || 'command') + '"></i></span>'
                    + '<span class="at-copy"><span class="at-label">' + escapeHtml(command.label) + '</span><span class="at-detail">' + escapeHtml(command.detail || '') + '</span></span>'
                    + '<span class="at-category">' + escapeHtml(command.category || '기능') + '</span>'
                    + '</button>';
            }).join('');
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                try { window.lucide.createIcons({ nodes: [state.list] }); } catch (_) { try { window.lucide.createIcons(); } catch (_) {} }
            }
        }
        requestAnimationFrame(positionMenu);
    }

    function openFromTrigger(trigger) {
        buildMenu();
        state.triggerStart = trigger.start;
        state.queryEnd = trigger.end;
        state.query = trigger.query;
        state.selectedIndex = 0;
        state.open = true;
        state.menu.hidden = false;
        renderMenu();
        requestAnimationFrame(function () {
            if (!state.open || !state.search) return;
            try {
                state.search.focus({ preventScroll: true });
                const end = state.search.value.length;
                state.search.setSelectionRange(end, end);
            } catch (_) {}
        });
    }

    function closeMenu() {
        state.open = false;
        state.triggerStart = -1;
        state.queryEnd = -1;
        state.query = '';
        state.items = [];
        state.selectedIndex = 0;
        if (state.menu) state.menu.hidden = true;
    }

    function updateFromTextarea() {
        if (state.suppressInput || !state.textarea) return;
        if (state.textarea.selectionStart !== state.textarea.selectionEnd) {
            closeMenu();
            return;
        }
        const trigger = detectTrigger(state.textarea.value, state.textarea.selectionStart);
        if (!trigger) {
            closeMenu();
            return;
        }
        openFromTrigger(trigger);
    }

    function removeTriggerText() {
        const textarea = state.textarea;
        if (!textarea || state.triggerStart < 0 || state.queryEnd < state.triggerStart) return;
        const start = state.triggerStart;
        const end = state.queryEnd;
        state.suppressInput = true;
        try {
            if (typeof textarea.setRangeText === 'function') textarea.setRangeText('', start, end, 'end');
            else textarea.value = textarea.value.slice(0, start) + textarea.value.slice(end);
            textarea.setSelectionRange(start, start);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
            state.suppressInput = false;
        }
    }

    function executeCommand(command) {
        if (!command) return;
        removeTriggerText();
        closeMenu();
        const run = function () {
            try {
                const result = command.run();
                if (result && typeof result.catch === 'function') {
                    result.catch(function (error) {
                        console.error('@ command failed:', command.id, error);
                        notify('명령 실행 중 오류가 발생했습니다.');
                    });
                }
            } catch (error) {
                console.error('@ command failed:', command.id, error);
                notify('명령 실행 중 오류가 발생했습니다.');
            }
        };
        if (command.immediate) run();
        else setTimeout(run, 0);
    }

    function moveSelection(delta) {
        if (!state.items.length) return;
        state.selectedIndex = (state.selectedIndex + delta + state.items.length) % state.items.length;
        renderMenu();
        const selected = state.list.querySelector('.at-item.is-selected');
        if (selected && typeof selected.scrollIntoView === 'function') selected.scrollIntoView({ block: 'nearest' });
    }

    function onKeydown(event) {
        if (!state.open) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveSelection(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveSelection(-1);
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            if (!state.items.length) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            executeCommand(state.items[state.selectedIndex]);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMenu();
            if (state.textarea) state.textarea.focus();
        }
    }

    function init() {
        const textarea = document.getElementById('viewer-edit-ta');
        if (!textarea || textarea.__atCommandMenuBound) return;
        textarea.__atCommandMenuBound = true;
        state.textarea = textarea;
        buildMenu();
        textarea.addEventListener('input', function (event) {
            if (event && event.isComposing) return;
            updateFromTextarea();
        });
        textarea.addEventListener('compositionend', updateFromTextarea);
        textarea.addEventListener('keydown', onKeydown, true);
        textarea.addEventListener('click', function () {
            if (state.open) updateFromTextarea();
        });
        textarea.addEventListener('scroll', function () {
            if (state.open) positionMenu();
        }, { passive: true });
        window.addEventListener('resize', function () {
            if (state.open) positionMenu();
        });
        document.addEventListener('mousedown', function (event) {
            if (!state.open) return;
            if (event.target === textarea || (state.menu && state.menu.contains(event.target))) return;
            closeMenu();
        }, true);
    }

    window.AtCommandMenu = {
        init: init,
        detectTrigger: detectTrigger,
        getCommands: getCommands,
        filterCommands: filterCommands,
        close: closeMenu,
        isOpen: function () { return state.open; },
        executeById: function (commandId) {
            const command = getCommands(true).find(function (item) { return item.id === commandId; });
            if (!command) return false;
            command.run();
            return true;
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

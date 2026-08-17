(function (global) {
    'use strict';

    var RAW_BLOCK_TAGS = {
        address: true, article: true, aside: true, blockquote: true, details: true,
        dialog: true, div: true, dl: true, fieldset: true, figure: true, footer: true,
        form: true, header: true, main: true, nav: true, section: true, table: true
    };

    function escapeMarkdownText(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/[\t\r\n ]+/g, ' ')
            .replace(/([\\`*_[\]~])/g, '\\$1');
    }

    function escapeAttribute(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function createContext() {
        return {
            issues: [],
            issueMap: Object.create(null),
            convertedCount: 0
        };
    }

    function addIssue(context, tag, reason, detail) {
        var label = tag === '#document' ? '문서 구조' : '<' + tag + '>';
        var key = label + '|' + reason + '|' + String(detail || '');
        var existing = context.issueMap[key];
        if (existing) {
            existing.count += 1;
            return;
        }
        var issue = { tag: tag, label: label, reason: reason, detail: String(detail || ''), count: 1 };
        context.issueMap[key] = issue;
        context.issues.push(issue);
    }

    function attributeNames(node) {
        if (!node || !node.attributes) return [];
        return Array.prototype.map.call(node.attributes, function (attribute) {
            return String(attribute.name || '').toLowerCase();
        });
    }

    function unsupportedAttributes(node, allowed) {
        var allowedMap = Object.create(null);
        (allowed || []).forEach(function (name) { allowedMap[name] = true; });
        return attributeNames(node).filter(function (name) { return !allowedMap[name]; });
    }

    function preserveRaw(node, context, reason, detail) {
        var tag = String(node && node.tagName || 'html').toLowerCase();
        addIssue(context, tag, reason, detail);
        return String(node && node.outerHTML || '');
    }

    function inlineChildren(node, context) {
        return Array.prototype.map.call(node.childNodes || [], function (child) {
            return inlineNode(child, context);
        }).join('');
    }

    function inlineNode(node, context) {
        if (!node) return '';
        if (node.nodeType === 3) return escapeMarkdownText(node.nodeValue || '');
        if (node.nodeType === 8) return '<!--' + String(node.nodeValue || '') + '-->';
        if (node.nodeType !== 1) return '';

        var tag = String(node.tagName || '').toLowerCase();
        var supportedInline = /^(?:a|b|br|code|del|em|i|img|mark|s|span|strike|strong|sub|sup)$/;
        if (RAW_BLOCK_TAGS[tag]) return preserveRaw(node, context, '인라인 위치의 블록 HTML은 원본으로 보존');
        if (!supportedInline.test(tag) && !/^(?:kbd|q|small|time|u)$/.test(tag)) {
            return preserveRaw(node, context, '지원하지 않는 HTML 태그');
        }
        var allowed = [];
        if (tag === 'a') allowed = ['href', 'title'];
        else if (tag === 'img') allowed = ['src', 'alt', 'title'];
        else if (tag === 'br') allowed = [];
        var extra = unsupportedAttributes(node, allowed);
        if (extra.length) {
            return preserveRaw(node, context, 'Markdown으로 옮길 수 없는 속성', extra.join(', '));
        }

        if (tag === 'br') {
            context.convertedCount += 1;
            return '  \n';
        }
        if (tag === 'img') {
            var src = String(node.getAttribute('src') || '').trim();
            if (!src) return preserveRaw(node, context, '이미지 주소(src)가 없음');
            var alt = String(node.getAttribute('alt') || '').replace(/[\[\]]/g, '');
            var title = String(node.getAttribute('title') || '').trim();
            context.convertedCount += 1;
            return '![' + alt + '](' + src + (title ? ' "' + title.replace(/"/g, '\\"') + '"' : '') + ')';
        }

        var content = inlineChildren(node, context);
        if (tag === 'strong' || tag === 'b') {
            context.convertedCount += 1;
            return content.trim() ? '**' + content.trim() + '**' : '';
        }
        if (tag === 'em' || tag === 'i') {
            context.convertedCount += 1;
            return content.trim() ? '*' + content.trim() + '*' : '';
        }
        if (tag === 'del' || tag === 's' || tag === 'strike') {
            context.convertedCount += 1;
            return content.trim() ? '~~' + content.trim() + '~~' : '';
        }
        if (tag === 'code' && (!node.parentElement || String(node.parentElement.tagName || '').toLowerCase() !== 'pre')) {
            var codeText = String(node.textContent || '');
            var fence = codeText.indexOf('`') >= 0 ? '``' : '`';
            context.convertedCount += 1;
            return fence + codeText + fence;
        }
        if (tag === 'a') {
            var href = String(node.getAttribute('href') || '').trim();
            var linkTitle = String(node.getAttribute('title') || '').trim();
            if (!href) return content;
            context.convertedCount += 1;
            return '[' + (content.trim() || href) + '](' + href + (linkTitle ? ' "' + linkTitle.replace(/"/g, '\\"') + '"' : '') + ')';
        }
        if (tag === 'sup' || tag === 'sub' || tag === 'mark') {
            addIssue(context, tag, '표준 Markdown 표현이 없어 원본 HTML로 보존');
            return '<' + tag + '>' + content + '</' + tag + '>';
        }
        if (tag === 'span') {
            addIssue(context, tag, '인라인 컨테이너 태그는 제거하고 내부 내용만 변환');
            return content;
        }
        if (tag === 'small' || tag === 'u' || tag === 'kbd' || tag === 'q' || tag === 'time') {
            return preserveRaw(node, context, '표준 Markdown 표현이 없어 원본 HTML로 보존');
        }
        return preserveRaw(node, context, '지원하지 않는 HTML 태그');
    }

    function listNode(node, context, depth) {
        var ordered = String(node.tagName || '').toLowerCase() === 'ol';
        var allowed = ordered ? ['start'] : [];
        var extra = unsupportedAttributes(node, allowed);
        if (extra.length) return preserveRaw(node, context, '목록에서 옮길 수 없는 속성', extra.join(', '));
        var number = Number.parseInt(node.getAttribute('start'), 10) || 1;
        var lines = [];
        Array.prototype.forEach.call(node.children || [], function (item) {
            if (String(item.tagName || '').toLowerCase() !== 'li') return;
            var liExtra = unsupportedAttributes(item, []);
            if (liExtra.length) {
                lines.push(preserveRaw(item, context, '목록 항목에서 옮길 수 없는 속성', liExtra.join(', ')));
                return;
            }
            var nested = [];
            var body = Array.prototype.map.call(item.childNodes || [], function (child) {
                if (child.nodeType === 1 && /^(ul|ol)$/i.test(child.tagName || '')) {
                    nested.push(listNode(child, context, (depth || 0) + 1));
                    return '';
                }
                return inlineNode(child, context);
            }).join('').trim();
            lines.push('  '.repeat(Math.max(0, depth || 0)) + (ordered ? number++ + '. ' : '- ') + body);
            Array.prototype.push.apply(lines, nested.filter(Boolean));
            context.convertedCount += 1;
        });
        return lines.join('\n');
    }

    function tableNode(node, context) {
        var complex = node.querySelector && node.querySelector('[rowspan],[colspan],caption,colgroup');
        var tableExtra = unsupportedAttributes(node, []);
        if (complex || tableExtra.length) {
            return preserveRaw(node, context, complex ? '병합 셀·캡션 표는 Markdown 표로 표현할 수 없음' : '표에서 옮길 수 없는 속성', tableExtra.join(', '));
        }
        var rows = Array.prototype.map.call(node.querySelectorAll('tr'), function (row) {
            if (unsupportedAttributes(row, []).length) return null;
            return Array.prototype.map.call(row.querySelectorAll(':scope > th, :scope > td'), function (cell) {
                if (unsupportedAttributes(cell, []).length) return null;
                return inlineChildren(cell, context).trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');
            });
        });
        if (!rows.length || rows.some(function (row) { return !row || row.some(function (cell) { return cell === null; }); })) {
            return preserveRaw(node, context, '표 셀 또는 행의 속성을 Markdown으로 옮길 수 없음');
        }
        var width = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
        if (!width) return '';
        var normalized = rows.map(function (row) { return row.concat(Array(Math.max(0, width - row.length)).fill('')); });
        var output = ['| ' + normalized[0].join(' | ') + ' |'];
        output.push('| ' + normalized[0].map(function () { return '---'; }).join(' | ') + ' |');
        normalized.slice(1).forEach(function (row) { output.push('| ' + row.join(' | ') + ' |'); });
        if (!node.querySelector('th')) addIssue(context, 'table', '헤더가 없어 첫 행을 Markdown 표 헤더로 사용');
        context.convertedCount += 1;
        return output.join('\n');
    }

    function blockChildren(node, context, depth) {
        return Array.prototype.map.call(node.childNodes || [], function (child) {
            return blockNode(child, context, depth);
        }).filter(function (value) { return String(value || '').trim(); }).join('\n\n');
    }

    function blockNode(node, context, depth) {
        if (!node) return '';
        if (node.nodeType === 3) return escapeMarkdownText(node.nodeValue || '').trim();
        if (node.nodeType === 8) return '<!--' + String(node.nodeValue || '') + '-->';
        if (node.nodeType !== 1) return '';
        var tag = String(node.tagName || '').toLowerCase();
        var supportedBlock = /^(?:a|article|b|blockquote|br|code|del|div|em|figure|h[1-6]|hr|i|img|main|mark|ol|p|pre|s|section|span|strike|strong|sub|sup|table|ul)$/;
        if (!supportedBlock.test(tag)) return preserveRaw(node, context, '지원하지 않는 HTML 태그');
        var extra = unsupportedAttributes(node, tag === 'ol' ? ['start'] : []);
        if (extra.length && tag !== 'table') {
            return preserveRaw(node, context, 'Markdown으로 옮길 수 없는 속성', extra.join(', '));
        }
        if (/^h[1-6]$/.test(tag)) {
            context.convertedCount += 1;
            return '#'.repeat(Number(tag.slice(1))) + ' ' + inlineChildren(node, context).trim();
        }
        if (tag === 'p') {
            context.convertedCount += 1;
            return inlineChildren(node, context).trim();
        }
        if (tag === 'pre') {
            var code = node.querySelector && node.querySelector(':scope > code');
            var codeClass = code ? String(code.className || '') : '';
            var languageMatch = codeClass.match(/(?:language|lang)-([^\s]+)/i);
            if (code && unsupportedAttributes(code, languageMatch ? ['class'] : []).length) {
                return preserveRaw(node, context, '코드 블록의 속성을 Markdown으로 옮길 수 없음');
            }
            var codeText = String(code ? code.textContent : node.textContent || '').replace(/\s+$/, '');
            var fence = codeText.indexOf('```') >= 0 ? '````' : '```';
            context.convertedCount += 1;
            return fence + (languageMatch ? languageMatch[1] : '') + '\n' + codeText + '\n' + fence;
        }
        if (tag === 'blockquote') {
            var quoted = blockChildren(node, context, (depth || 0) + 1);
            context.convertedCount += 1;
            return quoted.split('\n').map(function (line) { return line ? '> ' + line : '>'; }).join('\n');
        }
        if (tag === 'hr') { context.convertedCount += 1; return '---'; }
        if (tag === 'ul' || tag === 'ol') return listNode(node, context, depth || 0);
        if (tag === 'table') return tableNode(node, context);
        if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'figure') {
            addIssue(context, tag, '컨테이너 태그는 제거하고 내부 내용만 변환');
            context.convertedCount += 1;
            return blockChildren(node, context, (depth || 0) + 1);
        }
        if (tag === 'br' || tag === 'img' || tag === 'a' || tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i' || tag === 'code' || tag === 'span' || tag === 'del' || tag === 's' || tag === 'strike' || tag === 'sup' || tag === 'sub' || tag === 'mark') {
            return inlineNode(node, context).trim();
        }
        return preserveRaw(node, context, '지원하지 않는 HTML 태그');
    }

    function convert(source) {
        var input = String(source == null ? '' : source);
        var context = createContext();
        if (!/<\/?[a-z][^>]*>/i.test(input)) {
            return { value: input, changed: false, foundHtml: false, issues: [], convertedCount: 0 };
        }
        if (typeof global.DOMParser !== 'function') {
            return { value: input, changed: false, foundHtml: true, issues: [{ label: 'HTML 파서', reason: '브라우저 HTML 파서를 사용할 수 없음', detail: '', count: 1 }], convertedCount: 0, error: true };
        }

        var fullDocument = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/i.test(input);
        var documentNode = new global.DOMParser().parseFromString(input, 'text/html');
        var pieces = [];
        if (fullDocument) {
            addIssue(context, '#document', 'HTML 문서 껍데기(html/body)는 제거하고 본문 내용을 변환');
            if (/^\s*<!doctype\s+html/i.test(input)) {
                pieces.push('<!doctype html>');
                addIssue(context, '#document', 'DOCTYPE은 Markdown 문법이 없어 원본으로 보존');
            }
            var headHtml = documentNode.head && String(documentNode.head.innerHTML || '').trim();
            if (headHtml) {
                pieces.push(String(documentNode.head.outerHTML || '<head>\n' + headHtml + '\n</head>'));
                addIssue(context, 'head', '문서 메타데이터는 Markdown으로 변환할 수 없어 원본으로 보존');
            }
        }
        pieces.push(blockChildren(documentNode.body, context, 0));
        var value = pieces.filter(Boolean).join('\n\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return {
            value: value,
            changed: value !== input,
            foundHtml: true,
            issues: context.issues,
            convertedCount: context.convertedCount
        };
    }

    function closeReport() {
        var report = document.getElementById('tidy-html2md-report');
        if (report && report.parentNode) report.parentNode.removeChild(report);
    }

    function showReport(result, scope) {
        closeReport();
        if (!result || !result.issues || !result.issues.length || !document.body) return false;
        var overlay = document.createElement('div');
        overlay.id = 'tidy-html2md-report';
        overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/50 p-4';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'tidy-html2md-report-title');

        var panel = document.createElement('div');
        panel.className = 'w-full max-w-xl max-h-[80vh] overflow-auto rounded-xl border border-amber-300 bg-white p-5 shadow-2xl dark:border-amber-700 dark:bg-slate-900';
        var title = document.createElement('h3');
        title.id = 'tidy-html2md-report-title';
        title.className = 'text-base font-bold text-slate-900 dark:text-slate-100';
        title.textContent = 'HTML2MD 변환 결과';
        var summary = document.createElement('p');
        summary.className = 'mt-2 text-sm text-slate-700 dark:text-slate-300';
        summary.textContent = scope + (scope === '문서 전체' ? '를' : '을') + ' 변환했지만 Markdown으로 100% 표현할 수 없는 항목이 있습니다. 변환 불가 태그·속성은 원본 HTML로 보존했고, 구조 컨테이너는 내부 내용만 변환했습니다.';
        var list = document.createElement('ul');
        list.className = 'mt-3 space-y-2 text-sm text-amber-800 dark:text-amber-200';
        result.issues.forEach(function (issue) {
            var item = document.createElement('li');
            item.className = 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30';
            item.textContent = issue.label + (issue.count > 1 ? ' ' + issue.count + '개' : '') + ': ' + issue.reason + (issue.detail ? ' (' + issue.detail + ')' : '');
            list.appendChild(item);
        });
        var actions = document.createElement('div');
        actions.className = 'mt-4 flex justify-end';
        var closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700';
        closeButton.textContent = '확인';
        closeButton.addEventListener('click', closeReport);
        actions.appendChild(closeButton);
        panel.appendChild(title);
        panel.appendChild(summary);
        panel.appendChild(list);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        overlay.addEventListener('click', function (event) { if (event.target === overlay) closeReport(); });
        document.body.appendChild(overlay);
        closeButton.focus();
        return true;
    }

    global.TidyHtmlToMarkdown = {
        convert: convert,
        showReport: showReport,
        closeReport: closeReport,
        escapeMarkdownText: escapeMarkdownText,
        escapeAttribute: escapeAttribute
    };
})(window);

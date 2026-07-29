(function (global) {
    'use strict';

    function isFlowchart(source) {
        var lines = String(source || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || /^%%/.test(line) || /^---$/.test(line)) continue;
            if (/^%%\{/.test(line)) continue;
            return /^(?:flowchart|graph)\b/i.test(line);
        }
        return false;
    }

    function isQuotedLabel(value) {
        var text = String(value || '').trim();
        return (text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'"));
    }

    function quoteLabel(value) {
        var text = String(value == null ? '' : value);
        if (isQuotedLabel(text)) return text;
        return '"' + text.replace(/"/g, '&quot;') + '"';
    }

    function quoteEdgeLabels(line) {
        // A -->|label| B 형태의 파이프 사이만 엣지 라벨이다.
        if (!/(?:-->|---|-\.-?>|==>|~~~|--[ox])/.test(line) || line.indexOf('|') < 0) {
            return line;
        }
        return line.replace(/\|([^|\r\n]*)\|/g, function (match, label) {
            return '|' + quoteLabel(label) + '|';
        });
    }

    function findClosingSquare(text, openingIndex) {
        var depth = 0;
        var quote = '';
        for (var i = openingIndex; i < text.length; i++) {
            var ch = text.charAt(i);
            if (quote) {
                if (ch === quote && text.charAt(i - 1) !== '\\') quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }
            if (ch === '[') depth++;
            if (ch === ']') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function quoteSquareNodeLabels(line) {
        var out = '';
        var cursor = 0;
        var idPattern = /[A-Za-z_][A-Za-z0-9_-]*\[/g;
        var match;

        while ((match = idPattern.exec(line)) !== null) {
            var start = match.index;
            var previous = start > 0 ? line.charAt(start - 1) : '';
            if (previous && /[A-Za-z0-9_-]/.test(previous)) continue;

            var opening = start + match[0].length - 1;
            var closing = findClosingSquare(line, opening);
            if (closing < 0) break;

            var inner = line.slice(opening + 1, closing);
            var trimmed = inner.trim();
            var isSubroutineShape = trimmed.startsWith('[') && trimmed.endsWith(']');
            var isCylinderShape = trimmed.startsWith('(') && trimmed.endsWith(')');
            var isSlantedShape = (/^[\/\\]/.test(trimmed) && /[\/\\]$/.test(trimmed));

            out += line.slice(cursor, opening + 1);
            if (!trimmed || isQuotedLabel(inner) || isSubroutineShape || isCylinderShape || isSlantedShape) {
                out += inner;
            } else {
                out += quoteLabel(inner);
            }
            out += ']';
            cursor = closing + 1;
            idPattern.lastIndex = cursor;
        }

        return cursor ? out + line.slice(cursor) : line;
    }

    function preprocess(source) {
        var src = String(source || '');
        if (!src || !isFlowchart(src)) return src;

        return src.split(/\r?\n/).map(function (line) {
            var trimmed = line.trim();
            // Mermaid 지시문/CSS 값의 괄호와 파이프는 문법이므로 건드리지 않는다.
            if (!trimmed || /^%%/.test(trimmed) ||
                /^(?:style|classDef|class|linkStyle|click|callback|accTitle|accDescr)\b/i.test(trimmed)) {
                return line;
            }
            return quoteSquareNodeLabels(quoteEdgeLabels(line));
        }).join('\n');
    }

    var api = { preprocess: preprocess };
    global.MermaidLabelSanitizer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

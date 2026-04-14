(function () {
    function escapeHtmlForMathSegment(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function normalizeMatrixRowBreaksInMath(inner) {
        const text = String(inner ?? '');
        const hasMatrixEnv = /\\begin\{(?:[pbvBV]?matrix|matrix|array|aligned|cases)\}/.test(text);
        if (!hasMatrixEnv) return text;
        return text.replace(/(^|[^\\])\\\\([ \t]*\n)/g, function (_, prefix, tail) {
            return String(prefix || '') + '\\\\\\\\' + String(tail || '\n');
        });
    }

    function preprocessMultilineInlineMathToDisplay(raw) {
        const src = String(raw ?? '');
        if (!src.includes('$')) return src;
        let out = '';
        let i = 0;
        while (i < src.length) {
            const ch = src[i];
            if (ch !== '$') {
                out += ch;
                i += 1;
                continue;
            }
            const prev = i > 0 ? src[i - 1] : '';
            const next = i + 1 < src.length ? src[i + 1] : '';
            if (prev === '\\' || next === '$') {
                out += ch;
                i += 1;
                continue;
            }
            let j = i + 1;
            let close = -1;
            while (j < src.length) {
                if (src[j] === '$' && src[j - 1] !== '\\' && src[j + 1] !== '$') {
                    close = j;
                    break;
                }
                j += 1;
            }
            if (close === -1) {
                out += ch;
                i += 1;
                continue;
            }
            const inner = normalizeMatrixRowBreaksInMath(src.slice(i + 1, close));
            out += inner.includes('\n') ? '$$' + inner + '$$' : '$' + inner + '$';
            i = close + 1;
        }
        return out;
    }

    function preprocessDisplayMathMatrixRowBreaks(raw) {
        let src = String(raw ?? '');
        src = src.replace(/\$\$([\s\S]*?)\$\$/g, function (_, inner) {
            return '$$' + normalizeMatrixRowBreaksInMath(inner) + '$$';
        });
        src = src.replace(/\\\[([\s\S]*?)\\\]/g, function (_, inner) {
            return '\\[' + normalizeMatrixRowBreaksInMath(inner) + '\\]';
        });
        return src;
    }

    function countUnescapedDollar(text) {
        const s = String(text || '');
        let count = 0;
        for (let i = 0; i < s.length; i += 1) {
            if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) count += 1;
        }
        return count;
    }

    function looksLikeMathText(text) {
        const s = String(text || '').trim();
        if (!s) return false;
        if (/[가-힣]{2,}/.test(s)) return false;
        return /\\[A-Za-z]+|[_^=]|[A-Za-z]\s*\(|\bN\s*\(|\bmax\s*\(|\bdiag\s*\(|\bsum\b|\bfrac\b/.test(s);
    }

    function canonicalizeLatexMathDelimiters(raw) {
        let src = String(raw ?? '');
        src = src.replace(/\\\s*\[([\s\S]*?)\\\s*\]/g, function (_, inner) {
            return '$$' + String(inner || '').trim() + '$$';
        });
        src = src.replace(/\\\s*\(([\s\S]*?)\\\s*\)/g, function (_, inner) {
            const body = String(inner || '').trim();
            return body.includes('\n') ? '$$' + body + '$$' : '$' + body + '$';
        });
        return src;
    }

    function repairDanglingDollarMathBlocks(raw) {
        const lines = String(raw ?? '').split('\n');
        const out = [];
        let i = 0;

        while (i < lines.length) {
            const line = String(lines[i] || '');
            const trimmed = line.trim();
            const dollarCount = countUnescapedDollar(line);

            if (trimmed === '$') {
                const mathLines = [];
                let j = i + 1;
                while (j < lines.length) {
                    const next = String(lines[j] || '');
                    const nextTrimmed = next.trim();
                    if (nextTrimmed === '$') {
                        break;
                    }
                    if (!nextTrimmed) {
                        if (mathLines.length === 0) {
                            out.push(line);
                            i += 1;
                            continue;
                        }
                        break;
                    }
                    mathLines.push(nextTrimmed);
                    j += 1;
                }
                if (mathLines.length > 0 && j < lines.length && String(lines[j] || '').trim() === '$') {
                    out.push('$$' + mathLines.join(' ') + '$$');
                    i = j + 1;
                    continue;
                }
            }

            if (!(trimmed.startsWith('$') && !trimmed.startsWith('$$') && dollarCount === 1 && looksLikeMathText(trimmed.slice(1)))) {
                out.push(line);
                i += 1;
                continue;
            }

            const mathLines = [trimmed.slice(1).trim()];
            let j = i + 1;
            while (j < lines.length) {
                const next = String(lines[j] || '');
                const nextTrimmed = next.trim();
                if (!nextTrimmed) break;
                if (/^[-*]\s+/.test(nextTrimmed)) break;
                if (/^#{1,6}\s/.test(nextTrimmed)) break;
                if (/^\|/.test(nextTrimmed)) break;
                if (countUnescapedDollar(nextTrimmed) > 0) {
                    mathLines.push(nextTrimmed.replace(/\$/g, '').trim());
                    j += 1;
                    break;
                }
                if (!looksLikeMathText(nextTrimmed)) break;
                mathLines.push(nextTrimmed);
                j += 1;
            }
            out.push('$$' + mathLines.join(' ') + '$$');
            i = j;
        }

        return out.join('\n');
    }

    function normalizeBareBracketDisplayMath(raw) {
        const chunks = String(raw ?? '').split(/(```[\s\S]*?```)/g);
        return chunks.map(function (chunk) {
            if (/^```[\s\S]*```$/.test(chunk)) return chunk;
            const lines = String(chunk || '').split('\n');
            for (let i = 0; i < lines.length; i += 1) {
                const m = lines[i].match(/^(\s*)\[(.+)\](\s*)$/);
                if (!m) continue;
                const inner = String(m[2] || '').trim();
                if (!looksLikeMathText(inner)) continue;
                lines[i] = (m[1] || '') + '$$' + inner + '$$' + (m[3] || '');
            }
            return lines.join('\n');
        }).join('');
    }

    function isLikelyInlineMathText(inner) {
        const text = String(inner || '').trim();
        if (!text || text.length > 80) return false;
        if (/[가-힣]/.test(text)) return false;
        if (/[,\s]/.test(text)) return false;
        if (/^[A-Za-z]{2,}$/.test(text)) return false;
        return /\\|[_^=]/.test(text) || /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9{}]+)+(?:\^[A-Za-z0-9{}]+)?$/.test(text);
    }

    function normalizeLooseParenthesizedInlineMath(raw) {
        const chunks = String(raw ?? '').split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g);
        return chunks.map(function (chunk) {
            if (/^(```[\s\S]*```|\$\$[\s\S]*\$\$)$/.test(chunk)) return chunk;
            return String(chunk || '').replace(/(^|[^\]\\\w}])\(([^()\n]{1,80})\)/g, function (match, prefix, inner) {
                return isLikelyInlineMathText(inner) ? prefix + '$' + inner.trim() + '$' : match;
            });
        }).join('');
    }

    function normalizeLooseMathDelimiters(raw) {
        let src = String(raw ?? '');
        src = canonicalizeLatexMathDelimiters(src);
        src = repairDanglingDollarMathBlocks(src);
        src = normalizeBareBracketDisplayMath(src);
        src = normalizeLooseParenthesizedInlineMath(src);
        return src;
    }

    function protectMathSegments(md) {
        const src = String(md || '');
        const chunks = src.split(/(```[\s\S]*?```)/g);
        const slots = [];

        function normalizeMathBody(body) {
            return String(body || '')
                .normalize('NFKD')
                .replace(/\u2212/g, '-')
                .replace(/\u2010|\u2011|\u2012|\u2013|\u2014|\u2015/g, '-')
                .replace(/\u00d7/g, '\\times ')
                .replace(/\u00f7/g, '\\div ')
                .replace(/\u00b1/g, '\\pm ')
                .replace(/\u2213/g, '\\mp ')
                .replace(/\u2026/g, '\\ldots ')
                .replace(/\u00a0/g, ' ');
        }

        function normalizeMathSegment(seg) {
            const raw = String(seg || '');
            const pairs = [
                ['$$', '$$'],
                ['$', '$']
            ];

            for (let i = 0; i < pairs.length; i += 1) {
                const left = pairs[i][0];
                const right = pairs[i][1];
                if (raw.startsWith(left) && raw.endsWith(right) && raw.length >= left.length + right.length) {
                    return left + normalizeMathBody(raw.slice(left.length, raw.length - right.length)) + right;
                }
            }

            const envMatch = raw.match(/^\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}$/);
            if (envMatch) {
                return '\\begin{' + envMatch[1] + '}' + normalizeMathBody(envMatch[2]) + '\\end{' + envMatch[1] + '}';
            }

            return normalizeMathBody(raw);
        }

        function pushSlot(out, seg) {
            const token = '@@MATHSEG_' + slots.length + '@@';
            slots.push(normalizeMathSegment(seg));
            out.push(token);
        }

        function protectChunk(text) {
            const s = String(text || '');
            const out = [];
            let i = 0;

            while (i < s.length) {
                if (s[i] === '$' && s[i + 1] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                    let k = i + 2;
                    let end = -1;
                    while (k < s.length - 1) {
                        if (s[k] === '$' && s[k + 1] === '$' && s[k - 1] !== '\\') {
                            end = k;
                            break;
                        }
                        k += 1;
                    }
                    if (end >= 0) {
                        pushSlot(out, s.slice(i, end + 2));
                        i = end + 2;
                        continue;
                    }
                }

                if (s[i] === '$' && (i === 0 || s[i - 1] !== '\\')) {
                    let k = i + 1;
                    let end = -1;
                    while (k < s.length) {
                        if (s[k] === '$' && s[k - 1] !== '\\') {
                            end = k;
                            break;
                        }
                        k += 1;
                    }
                    if (end >= 0) {
                        pushSlot(out, s.slice(i, end + 1));
                        i = end + 1;
                        continue;
                    }
                }

                out.push(s[i]);
                i += 1;
            }

            return out.join('');
        }

        const protectedText = chunks.map(function (chunk) {
            return /^```[\s\S]*```$/.test(chunk) ? chunk : protectChunk(chunk);
        }).join('');

        return {
            text: protectedText,
            restoreHtml: function (html) {
                let out = String(html || '');
                for (let i = 0; i < slots.length; i += 1) {
                    out = out.split('@@MATHSEG_' + i + '@@').join(escapeHtmlForMathSegment(slots[i]));
                }
                return out;
            }
        };
    }

    const api = {
        escapeHtmlForMathSegment: escapeHtmlForMathSegment,
        normalizeMatrixRowBreaksInMath: normalizeMatrixRowBreaksInMath,
        preprocessMultilineInlineMathToDisplay: preprocessMultilineInlineMathToDisplay,
        preprocessDisplayMathMatrixRowBreaks: preprocessDisplayMathMatrixRowBreaks,
        normalizeLooseMathDelimiters: normalizeLooseMathDelimiters,
        protectMathSegments: protectMathSegments
    };

    if (typeof window !== 'undefined') {
        window.MDViewerMath = Object.assign(window.MDViewerMath || {}, api);
        window._escapeHtmlForMathSegment = escapeHtmlForMathSegment;
        window.normalizeMatrixRowBreaksInMath = normalizeMatrixRowBreaksInMath;
        window.preprocessMultilineInlineMathToDisplay = preprocessMultilineInlineMathToDisplay;
        window.preprocessDisplayMathMatrixRowBreaks = preprocessDisplayMathMatrixRowBreaks;
        window.normalizeLooseMathDelimiters = normalizeLooseMathDelimiters;
        window._protectMathSegments = protectMathSegments;
    }
})();

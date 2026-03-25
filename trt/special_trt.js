/* TRT (Text Repair Treatment)
 * 마크다운 렌더링/정리 전처리를 한 곳에서 관리한다.
 */
(function (global) {
    'use strict';

    const POLICY = {
        // 렌더링 시: 문서 원본은 건드리지 않고 화면 표시만 보정
        render: {
            unescapeMarkdownSyntax: true,
            emphasizeNumericReferences: false,
            forceHardBreakEachLine: false
        },
        // Tidy 시: 문서 원본에 반영되는 정리
        tidy: {
            unescapeMarkdownSyntax: true,
            emphasizeNumericReferences: false,
            forceHardBreakEachLine: false
        }
    };

    // \* \_ \[ \] \( \) \# \- \. \! 등 불필요 escape 해제
    const ESCAPED_MD_TOKEN_RE = /\\([\\`*_{}\[\]()#+\-.!~>])/g;
    const NUMERIC_REFERENCE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    const FENCE_RE = /^```/;

    function processOutsideInlineCode(line, transformer) {
        if (!line || line.indexOf('`') === -1) return transformer(line);
        const parts = line.split(/(`+[^`]*`+)/g);
        for (let i = 0; i < parts.length; i++) {
            if (/^`+[^`]*`+$/.test(parts[i])) continue;
            parts[i] = transformer(parts[i]);
        }
        return parts.join('');
    }

    function transformOutsideFencedCode(text, transformer) {
        const lines = String(text ?? '').split('\n');
        const out = [];
        let inFence = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (FENCE_RE.test(line.trim())) {
                inFence = !inFence;
                out.push(line);
                continue;
            }
            if (inFence) {
                out.push(line);
                continue;
            }
            out.push(processOutsideInlineCode(line, transformer));
        }
        return out.join('\n');
    }

    function unescapeMarkdownSyntax(text) {
        return transformOutsideFencedCode(text, function (line) {
            return line.replace(ESCAPED_MD_TOKEN_RE, '$1');
        });
    }

    function emphasizeNumericReferences(text) {
        return transformOutsideFencedCode(text, function (line) {
            return line.replace(NUMERIC_REFERENCE_RE, '**[$1]**');
        });
    }

    function forceHardBreakEachLine(text) {
        const lines = String(text ?? '').split('\n');
        const out = [];
        let inFence = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (FENCE_RE.test(trimmed)) {
                inFence = !inFence;
                out.push(line);
                continue;
            }
            if (inFence || !trimmed) {
                out.push(line);
                continue;
            }
            out.push(line.replace(/\s+$/, '') + '  ');
        }
        return out.join('\n');
    }

    function prepareWithPolicy(text, policy) {
        let result = String(text ?? '');
        if (!result) return '';
        if (policy.unescapeMarkdownSyntax) result = unescapeMarkdownSyntax(result);
        if (policy.emphasizeNumericReferences) result = emphasizeNumericReferences(result);
        if (policy.forceHardBreakEachLine) result = forceHardBreakEachLine(result);
        return result.trimEnd();
    }

    function prepareForRender(text, overridePolicy) {
        const policy = Object.assign({}, POLICY.render, overridePolicy || {});
        return prepareWithPolicy(text, policy);
    }

    function prepareForTidy(text, overridePolicy) {
        const policy = Object.assign({}, POLICY.tidy, overridePolicy || {});
        return prepareWithPolicy(text, policy);
    }

    global.specialTRT = {
        policy: POLICY,
        unescapeMarkdownSyntax: unescapeMarkdownSyntax,
        emphasizeNumericReferences: emphasizeNumericReferences,
        forceHardBreakEachLine: forceHardBreakEachLine,
        prepareForRender: prepareForRender,
        prepareForTidy: prepareForTidy
    };
})(window);

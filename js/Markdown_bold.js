/* ═══════════════════════════════════════════════════════════
   MARKDOWN BOLD — **텍스트** 특수문자 포함 시 <b> 선변환
   marked가 파싱하지 못하는 경우를 방지. parser.js에서 mdRender 전 호출
═══════════════════════════════════════════════════════════ */

const MarkdownBold = (() => {
    /** Smart Bold: **텍스트** 안에 이 문자가 있으면 marked가 파싱하지 못하므로 <b>로 선변환. 설정에서 '추가' 문자만 넣으면 기본 목록에 더해짐. */
    const DEFAULT_BOLD_SPECIAL_CHARS = '()[]{}<>*_`"\'\\.:;#~^&@$%!?/,|=\\-+ \n\t';

    /** 정규식 문자클래스 내 특수문자 이스케이프 */
    function escapeForCharClass(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/-/g, '\\-').replace(/\^/g, '\\^');
    }

    /** localStorage 추가 문자 + 기본 목록 반환 (설정 패널용) */
    function getBoldSpecialChars() {
        const extra = typeof localStorage !== 'undefined' ? (localStorage.getItem('mdpro_bold_special_chars_extra') || '') : '';
        return DEFAULT_BOLD_SPECIAL_CHARS + (extra || '');
    }

    /** 인라인 코드가 아닌 일반 텍스트에서 굵게/굵은 기울임을 HTML로 선변환한다. */
    function preprocessBoldText(text) {
        if (!text) return text;

        // ***X***를 먼저 처리해야 **X** 정규식이 세 별표를 2+1로 잘못 나누지 않는다.
        let output = text.replace(/\*\*\*([^\n]+?)\*\*\*/g, (match, inner) => {
            if (!inner || !inner.trim()) return match;
            return '<b><i>' + inner + '</i></b>';
        });

        // 따옴표·괄호·콜론 등 모든 특수문자를 허용하며, 내부의 단일 *기울임*도 보존한다.
        output = output.replace(/\*\*((?:(?!\*\*).)+?)\*\*/g, (match, inner) => {
            if (!inner || !inner.trim()) return match;
            const formattedInner = inner.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
            return '<b>' + formattedInner + '</b>';
        });
        return output;
    }

    /** 인라인 코드(`...`)는 그대로 두고 나머지 텍스트만 변환한다. */
    function preprocessInlineCodeAware(line) {
        let output = '';
        let cursor = 0;
        const codeRe = /(`+)([\s\S]*?)\1/g;
        let match;
        while ((match = codeRe.exec(line)) !== null) {
            output += preprocessBoldText(line.slice(cursor, match.index));
            output += match[0];
            cursor = match.index + match[0].length;
        }
        output += preprocessBoldText(line.slice(cursor));
        return output;
    }

    /** marked.parse 전에 호출. fenced code block과 inline code는 변경하지 않는다. */
    function preprocessBold(md) {
        if (!md || typeof md !== 'string') return md;
        const lines = md.split('\n');
        let fence = '';
        return lines.map((line) => {
            const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
            if (fenceMatch) {
                const marker = fenceMatch[1][0];
                if (!fence) fence = marker;
                else if (fence === marker) fence = '';
                return line;
            }
            if (fence) return line;
            return preprocessInlineCodeAware(line);
        }).join('\n');
    }

    /* 전역 노출 (설정 패널·hotkey·app.js에서 참조) */
    if (typeof window !== 'undefined') {
        window.DEFAULT_BOLD_SPECIAL_CHARS = DEFAULT_BOLD_SPECIAL_CHARS;
        window.getBoldSpecialChars = getBoldSpecialChars;
        window.escapeForCharClass = escapeForCharClass;
    }

    const api = {
        preprocessBold,
        preprocessBoldText,
        getBoldSpecialChars,
        escapeForCharClass,
        DEFAULT_BOLD_SPECIAL_CHARS
    };
    if (typeof window !== 'undefined') window.MarkdownBold = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})();

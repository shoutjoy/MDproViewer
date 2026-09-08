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

    /** 인라인 코드를 보호하면서 일반 텍스트의 굵게/굵은 기울임을 HTML로 선변환한다. */
    function preprocessBoldText(text) {
        if (!text) return text;

        // 코드 안의 별표는 볼드 구분자로 해석하면 안 되지만, `code`가 볼드의
        // 시작과 끝 사이에 놓인 경우에는 바깥 **...** 범위를 계속 읽어야 한다.
        // 따라서 코드 구간만 충돌하지 않는 토큰으로 잠시 가린 뒤 복원한다.
        const inlineCodes = [];
        const masked = text.replace(/(`+)([\s\S]*?)\1/g, (code) => {
            const token = '\u0000MDPROCODE' + inlineCodes.length + '\u0000';
            inlineCodes.push(code);
            return token;
        });

        // ***X***를 먼저 처리해야 **X** 정규식이 세 별표를 2+1로 잘못 나누지 않는다.
        let output = masked.replace(/\*\*\*([^\n]+?)\*\*\*/g, (match, inner) => {
            if (!inner || !inner.trim()) return match;
            return '<b><i>' + inner + '</i></b>';
        });

        // 따옴표·괄호·콜론 등 모든 특수문자를 허용하며, 내부의 단일 *기울임*도 보존한다.
        output = output.replace(/\*\*((?:(?!\*\*).)+?)\*\*/g, (match, inner) => {
            if (!inner || !inner.trim()) return match;
            const formattedInner = inner.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
            return '<b>' + formattedInner + '</b>';
        });

        return output.replace(/\u0000MDPROCODE(\d+)\u0000/g, (token, index) => inlineCodes[Number(index)] || token);
    }

    /** 인라인 코드를 보존하면서 그 앞뒤에 걸친 볼드도 함께 변환한다. */
    function preprocessInlineCodeAware(line) {
        return preprocessBoldText(line);
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

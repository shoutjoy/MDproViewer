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

    /** **X** → <b>X</b> 선변환. X에 *·줄바꿈 없음. marked.parse 전에 호출 */
    function preprocessBold(md) {
        if (!md || typeof md !== 'string') return md;
        return md.replace(/\*\*([^\*\n]+?)\*\*/g, (m, inner) => '<b>' + inner + '</b>');
    }

    /* 전역 노출 (설정 패널·hotkey·app.js에서 참조) */
    if (typeof window !== 'undefined') {
        window.DEFAULT_BOLD_SPECIAL_CHARS = DEFAULT_BOLD_SPECIAL_CHARS;
        window.getBoldSpecialChars = getBoldSpecialChars;
        window.escapeForCharClass = escapeForCharClass;
    }

    const api = {
        preprocessBold,
        getBoldSpecialChars,
        escapeForCharClass,
        DEFAULT_BOLD_SPECIAL_CHARS
    };
    if (typeof window !== 'undefined') window.MarkdownBold = api;
    return api;
})();

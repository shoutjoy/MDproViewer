/**
 * NotebookLM(및 동일 확장 경로)에서 넘어온 문서 보기 전용:
 * 한 줄이 '='만 3개 이상이면 동일 개수의 '-'로 바꿔 GFM 수평선으로 렌더되게 함.
 * '= **【' 처럼 제목 앞에 붙은 '=' 잔여도 제거.
 */
(function () {
    var MIN_EQUALS = 3;

    function preprocessNotebookLmEqualsToHr(md) {
        if (!md || typeof md !== 'string') return md;
        return md.split('\n').map(function (line) {
            var only = line.match(/^(\s*)(=+)(\s*)$/);
            if (only && only[2].length >= MIN_EQUALS) {
                return only[1] + new Array(only[2].length + 1).join('-') + only[3];
            }
            var spaced = line.match(/^(\s*)(=+)(\s+)(.+)$/);
            if (spaced) {
                var rest = spaced[4];
                if (/^(?:\*\*\s*)?[【\[]/.test(rest)) {
                    return spaced[1] + rest;
                }
            }
            var tight = line.match(/^(\s*)(=+)((?:\*\*)[【\[][\s\S]*)$/);
            if (tight) {
                return tight[1] + tight[3];
            }
            return line;
        }).join('\n');
    }

    window.preprocessNotebookLmEqualsToHr = preprocessNotebookLmEqualsToHr;
})();

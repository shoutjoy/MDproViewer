/**
 * 긴 = 구분선 뒤에 본문이 한 줄에 붙은 경우(외부 자료 붙여넣기 등)
 * 보기 렌더 직전에만 줄바꿈을 넣어 분리합니다. 편집 원문은 변경하지 않습니다.
 */
(function () {
    var MIN_EQUALS_TAIL_BREAK = 20;

    function preprocessLongEqualsLineBreaks(md) {
        if (!md || typeof md !== 'string') return md;
        var re = new RegExp('^(\\s*)(={' + MIN_EQUALS_TAIL_BREAK + ',})(\\s*)(.+)$');
        return md.split('\n').map(function (line) {
            var m = line.match(re);
            if (!m) return line;
            return m[1] + m[2] + '\n' + m[1] + m[3] + m[4];
        }).join('\n');
    }

    window.preprocessLongEqualsLineBreaks = preprocessLongEqualsLineBreaks;
})();

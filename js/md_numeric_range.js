/**
 * 숫자 범위 표기: 1~11, 1 ~ 11, (Slide 1~11) 등
 * ASCII ~ 는 GFM에서 ~~ 취소선과 섞이면 잘못 해석될 수 있어 전각 물결 ～(U+FF5E)로 바꿉니다.
 * 편집 원문은 그대로 두고, 보기(렌더) 직전에만 적용합니다.
 */
(function () {
    function preprocessNumericRangeTilde(md) {
        if (!md || typeof md !== 'string') return md;
        var s = md;
        var prev;
        do {
            prev = s;
            // 왼쪽 숫자는 소수 일부(예: .14~2)로 잡히지 않도록 앞을 제한, 오른쪽은 더 긴 숫자(1~111) 허용
            s = s.replace(/(^|[^\d.])(\d+)(\s*)~(\s*)(\d+)(?!\d)/g, function (_, pre, n1, sp1, sp2, n2) {
                return pre + n1 + sp1 + '\uFF5E' + sp2 + n2;
            });
        } while (s !== prev);
        return s;
    }
    window.preprocessNumericRangeTilde = preprocessNumericRangeTilde;
})();

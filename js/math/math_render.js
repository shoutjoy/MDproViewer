/* KaTeX auto-render: marked 이후 viewer DOM에 수식 적용 */
(function () {
    function renderMathInMarkdownViewer(element) {
        if (!element || typeof renderMathInElement !== 'function') return;
        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                processEscapes: true,
                processEnvironments: true,
                throwOnError: false,
                trust: false,
                ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
            });
        } catch (e) {
            /* 수식 오류는 본문 렌더를 막지 않음 */
        }
    }

    if (typeof window !== 'undefined') {
        window.renderMathInMarkdownViewer = renderMathInMarkdownViewer;
    }
})();

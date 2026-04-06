/**
 * 메인 마크다운 렌더링 결과(미리보기)를 단일 HTML 파일로 내보내는 기능
 * - imageDB 내부 이미지(blob:) Base64 내장
 * - 현재 적용된 다크모드/커스텀 테마 CSS 완전 내장
 */
const HtmlExport = (() => {
    async function exportToHTML() {
        // 메인 에디터의 미리보기 컨테이너 찾기
        const previewEl = document.getElementById('preview-container') || document.getElementById('preview') || document.querySelector('.markdown-body');
        
        if (!previewEl) {
            if (typeof App !== 'undefined' && App._toast) App._toast('내보낼 HTML 내용을 찾을 수 없습니다.');
            else alert('내보낼 HTML 내용을 찾을 수 없습니다.');
            return;
        }

        try {
            if (typeof App !== 'undefined' && App._toast) App._toast('HTML 변환 중입니다... (이미지 내장 처리)');
            
            // 1. 문서 제목 가져오기
            let title = 'Exported_Document';
            if (typeof TM !== 'undefined' && TM.getActive) {
                const activeTab = TM.getActive();
                if (activeTab && activeTab.title) title = activeTab.title;
            } else {
                const titleEl = document.getElementById('doc-title');
                if (titleEl && titleEl.value) title = titleEl.value;
            }
            
            // 2. 원본 훼손 방지를 위한 DOM 복제
            const clonedContainer = previewEl.cloneNode(true);
            
            // 3. 내부 이미지(imageDB의 blob URL)를 Base64로 치환
            const images = clonedContainer.querySelectorAll('img');
            const imgPromises = Array.from(images).map(async (img) => {
                const src = img.getAttribute('src');
                if (src && src.startsWith('blob:')) {
                    try {
                        const response = await fetch(src);
                        const blob = await response.blob();
                        const base64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        img.setAttribute('src', base64);
                    } catch (e) {
                        console.warn('Blob 이미지 Base64 변환 실패:', src, e);
                    }
                }
            });
            await Promise.all(imgPromises);

            // 4. 현재 페이지의 스타일(CSS) 수집
            let pageStyles = '';
            document.querySelectorAll('style').forEach(s => pageStyles += s.outerHTML + '\n');
            
            const linkPromises = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(async (link) => {
                try {
                    if (link.href.startsWith('http') && !link.href.includes(window.location.host)) {
                        pageStyles += link.outerHTML + '\n';
                    } else {
                        const res = await fetch(link.href);
                        const css = await res.text();
                        pageStyles += `<style>\n/* Imported from ${link.href} */\n${css}\n</style>\n`;
                    }
                } catch (e) {
                    pageStyles += link.outerHTML + '\n';
                }
            });
            await Promise.all(linkPromises);

            // 다크모드 등 테마 클래스 유지
            const rootStyle = document.documentElement.getAttribute('style') || '';
            const bodyClass = document.body.className;
            const bodyStyle = document.body.getAttribute('style') || '';

            // 5. 단일 HTML 구조 완성
            const htmlContent = clonedContainer.outerHTML; 
            const fullHtml = `<!DOCTYPE html>
<html lang="ko" style="${rootStyle}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${pageStyles}
</head>
<body class="${bodyClass}" style="${bodyStyle}">
    <div style="max-width: 860px; margin: 0 auto; padding: 40px 20px; background: var(--bg, #fff);">
        ${htmlContent}
    </div>
</body>
</html>`;

            // 6. 다운로드 처리
            const outBlob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(outBlob);
            a.download = `${title}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            
            if (typeof App !== 'undefined' && App._toast) App._toast('✓ 단일 HTML 파일로 성공적으로 내보냈습니다.');
        } catch (error) {
            if (typeof App !== 'undefined' && App._toast) App._toast('HTML 생성 중 오류가 발생했습니다.');
        }
    }

    return { exportToHTML };
})();
window.HtmlExport = HtmlExport;
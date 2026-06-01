/**
 * 모든 슬라이드를 PPTX 파일로 내보내는 함수
 * (교수님의 기존 슬라이드 배열 'slides'를 루프 돌며 처리)
 */
async function exportToPPTX() {
    // 1. PptxGenJS 객체 생성
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 16:9 와이드 비율 설정

    const exportBtn = document.querySelector('.export-btn'); // 버튼 상태 표시용
    exportBtn.disabled = true;
    exportBtn.textContent = '내보내는 중...';

    try {
        // 2. 각 슬라이드를 순회하며 캡처
        for (let i = 0; i < slides.length; i++) {
            const slideData = slides[i];
            
            // 임시 렌더링용 컨테이너 생성 (사용자 화면에 보이지 않게 처리)
            const tempDiv = document.createElement('div');
            tempDiv.style.width = '1280px';
            tempDiv.style.height = '720px';
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.innerHTML = slideData.content;
            document.body.appendChild(tempDiv);

            // 3. html2canvas를 이용해 HTML을 이미지로 변환
            const canvas = await html2canvas(tempDiv, {
                width: 1280,
                height: 720,
                scale: 2, // 고해상도를 위해 스케일 업
                useCORS: true // 외부 이미지 로드 허용
            });
            const imgData = canvas.toDataURL('image/png');

            // 4. PPTX에 슬라이드 추가 및 이미지 삽입
            const slide = pptx.addSlide();
            slide.addImage({ data: imgData, x: 0, y: 0, w: '100%', h: '100%' });

            // 임시 컨테이너 제거
            document.body.removeChild(tempDiv);
        }

        // 5. 파일 저장
        const fileName = `강의자료_${new Date().getTime()}.pptx`;
        await pptx.writeFile({ fileName: fileName });
        
        alert('PPTX 파일이 성공적으로 생성되었습니다.');
    } catch (error) {
        console.error('PPTX 내보내기 오류:', error);
        alert('파일 생성 중 오류가 발생했습니다.');
    } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = 'PPTX로 내보내기';
    }
}
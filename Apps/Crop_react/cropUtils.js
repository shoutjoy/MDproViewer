/** 기본 크롭 선택 영역 (이미지 표시 영역의 80% 중앙) */
export const DEFAULT_CROP_SELECTION = { x: 10, y: 10, width: 80, height: 80 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** UI 선택(%) → 이미지 픽셀 사각형 */
export const selectionToImagePixels = (selection, imageWidth, imageHeight) => {
  const x = clamp(Math.round((imageWidth * selection.x) / 100), 0, Math.max(0, imageWidth - 1));
  const y = clamp(Math.round((imageHeight * selection.y) / 100), 0, Math.max(0, imageHeight - 1));
  const maxW = imageWidth - x;
  const maxH = imageHeight - y;
  const width = clamp(Math.round((imageWidth * selection.width) / 100), 1, maxW);
  const height = clamp(Math.round((imageHeight * selection.height) / 100), 1, maxH);
  return { x, y, width, height };
};

/**
 * object-contain으로 그려진 이미지의 실제 표시 영역 (컨테이너 기준 %)
 * 컨테이너와 표시 영역이 1:1이면 변환 불필요 — 레거시/안전용
 */
export const getObjectContainDisplayPercent = (containerWidth, containerHeight, imageWidth, imageHeight) => {
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;
  if (imageAspect > containerAspect) {
    const heightPct = (containerAspect / imageAspect) * 100;
    return { x: 0, y: (100 - heightPct) / 2, width: 100, height: heightPct };
  }
  const widthPct = (imageAspect / containerAspect) * 100;
  return { x: (100 - widthPct) / 2, y: 0, width: widthPct, height: 100 };
};

/** 컨테이너 기준 선택 → 원본 이미지 기준 선택(%) */
export const containerSelectionToImageSelection = (
  selection,
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
) => {
  const display = getObjectContainDisplayPercent(
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
  );
  if (display.width >= 99.9 && display.height >= 99.9) return selection;

  const left = display.x + (selection.x / 100) * display.width;
  const top = display.y + (selection.y / 100) * display.height;
  const width = (selection.width / 100) * display.width;
  const height = (selection.height / 100) * display.height;

  const imageX = ((left - display.x) / display.width) * 100;
  const imageY = ((top - display.y) / display.height) * 100;
  const imageW = (width / display.width) * 100;
  const imageH = (height / display.height) * 100;

  return {
    x: clamp(imageX, 0, 100),
    y: clamp(imageY, 0, 100),
    width: clamp(imageW, 1, 100 - clamp(imageX, 0, 100)),
    height: clamp(imageH, 1, 100 - clamp(imageY, 0, 100)),
  };
};

/**
 * @param {string} sourceUrl
 * @param {{ x: number, y: number, width: number, height: number }} selection - 이미지 기준 %
 */
export function applyCropToImageDataUrl(sourceUrl, selection) {
  return new Promise((resolve, reject) => {
    if (!sourceUrl || typeof selection !== 'object') {
      reject(new Error('Invalid crop input'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const { x, y, width, height } = selectionToImagePixels(
          selection,
          img.width,
          img.height,
        );
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = sourceUrl;
  });
}

/** data URL → Blob */
export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

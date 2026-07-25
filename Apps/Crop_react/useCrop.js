import { useState, useRef, useCallback } from 'react';
import {
  applyCropToImageDataUrl,
  containerSelectionToImageSelection,
  DEFAULT_CROP_SELECTION,
} from './cropUtils.js';

/**
 * @param {{
 *   getSource: () => string | null,
 *   onComplete: (dataUrl: string) => void | Promise<void>,
 * }} opts
 */
export function useCrop({ getSource, onComplete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [cropSelection, setCropSelection] = useState({ ...DEFAULT_CROP_SELECTION });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const open = useCallback(() => {
    setCropSelection({ ...DEFAULT_CROP_SELECTION });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    if (isSubmitting) return;
    setIsOpen(false);
  }, [isSubmitting]);

  const handleCropMouseDown = useCallback((event, handle) => {
    event.stopPropagation();
    if (event.type !== 'touchstart' && event.cancelable) event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const getCoords = (ev) => (
      ev.touches?.length
        ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
        : { x: ev.clientX, y: ev.clientY }
    );

    const start = getCoords(event);
    const initialSelection = { ...cropSelection };

    const onMove = (moveEv) => {
      const cur = getCoords(moveEv);
      const dx = ((cur.x - start.x) / container.clientWidth) * 100;
      const dy = ((cur.y - start.y) / container.clientHeight) * 100;

      setCropSelection(() => {
        let { x, y, width, height } = { ...initialSelection };
        if (handle === 'move') {
          x = Math.max(0, Math.min(100 - width, x + dx));
          y = Math.max(0, Math.min(100 - height, y + dy));
        } else {
          if (handle.includes('n')) {
            const ny = Math.max(0, y + dy);
            height = Math.max(5, height + (y - ny));
            y = ny;
          }
          if (handle.includes('s')) height = Math.max(5, Math.min(100 - y, height + dy));
          if (handle.includes('w')) {
            const nx = Math.max(0, x + dx);
            width = Math.max(5, width + (x - nx));
            x = nx;
          }
          if (handle.includes('e')) width = Math.max(5, Math.min(100 - x, width + dx));
        }
        return { x, y, width, height };
      });
    };

    const onTouchMove = (te) => {
      if (te.cancelable) te.preventDefault();
      onMove(te);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };

    if (event.type === 'touchstart') {
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onUp);
      window.addEventListener('touchcancel', onUp);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }, [cropSelection]);

  const resolveImageSelection = useCallback(() => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img?.naturalWidth || !img?.naturalHeight || !container) {
      return cropSelection;
    }

    const containerRect = container.getBoundingClientRect();
    const imageRect = img.getBoundingClientRect();
    const widthMatch = Math.abs(containerRect.width - imageRect.width) < 2;
    const heightMatch = Math.abs(containerRect.height - imageRect.height) < 2;

    if (widthMatch && heightMatch) {
      return cropSelection;
    }

    return containerSelectionToImageSelection(
      cropSelection,
      containerRect.width,
      containerRect.height,
      img.naturalWidth,
      img.naturalHeight,
    );
  }, [cropSelection]);

  const commit = useCallback(async () => {
    const source = getSource?.();
    if (!source || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const imageSelection = resolveImageSelection();
      const dataUrl = await applyCropToImageDataUrl(source, imageSelection);
      await onComplete?.(dataUrl);
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      window.alert('이미지 자르기에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [getSource, isSubmitting, onComplete, resolveImageSelection]);

  return {
    isOpen,
    cropSelection,
    containerRef,
    imageRef,
    isSubmitting,
    open,
    close,
    handleCropMouseDown,
    commit,
  };
}

import React, { useEffect, useRef } from 'react';
import CropModal from './CropModal.jsx';
import { useCrop } from './useCrop.js';

/** slide가 있을 때만 마운트하세요 (App에서 cropSlideTarget && …). */
export default function SlideCropModal({ slide, onClose, onCommit }) {
  const onCloseRef = useRef(onClose);
  const onCommitRef = useRef(onCommit);
  onCloseRef.current = onClose;
  onCommitRef.current = onCommit;

  const crop = useCrop({
    getSource: () => slide?.url ?? null,
    onComplete: async (dataUrl) => {
      await onCommitRef.current?.(dataUrl);
    },
  });

  useEffect(() => {
    crop.open();
  }, []);

  return (
    <CropModal
      isOpen={crop.isOpen}
      imageSrc={slide.url}
      cropSelection={crop.cropSelection}
      containerRef={crop.containerRef}
      imageRef={crop.imageRef}
      onCropMouseDown={crop.handleCropMouseDown}
      onCommit={crop.commit}
      onCancel={() => {
        crop.close();
        onCloseRef.current?.();
      }}
      isSubmitting={crop.isSubmitting}
      title={slide.name ? `이미지 자르기 · ${slide.name}` : '이미지 자르기'}
    />
  );
}

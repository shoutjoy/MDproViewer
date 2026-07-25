import React, { useEffect, useRef } from 'react';
import CropModal from './CropModal.jsx';
import { useCrop } from './useCrop.js';

/** layer가 있을 때만 마운트하세요. */
export default function SlideLayerCropModal({ layer, onClose, onCommit }) {
  const onCloseRef = useRef(onClose);
  const onCommitRef = useRef(onCommit);
  onCloseRef.current = onClose;
  onCommitRef.current = onCommit;

  const crop = useCrop({
    getSource: () => layer?.url ?? null,
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
      imageSrc={layer.url}
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
      title={layer.name ? `레이어 자르기 · ${layer.name}` : '레이어 자르기'}
    />
  );
}

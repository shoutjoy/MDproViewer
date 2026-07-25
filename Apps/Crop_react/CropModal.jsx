import React from 'react';
import { Crop, Check, X } from 'lucide-react';

export default function CropModal({
  isOpen,
  imageSrc,
  cropSelection,
  containerRef,
  imageRef,
  onCropMouseDown,
  onCommit,
  onCancel,
  isSubmitting = false,
  title = '이미지 자르기',
  hint = '영역을 드래그·조절한 뒤 적용을 누르면 슬라이드 이미지가 교체됩니다.',
}) {
  if (!isOpen) return null;

  const handleClass = 'absolute bg-indigo-500 rounded-full shadow-lg z-20 border-2 border-white/30 touch-manipulation';
  const edgeClass = 'absolute bg-indigo-400/60 rounded-full touch-manipulation';

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-xl">
      <div className="mb-6 text-center max-w-2xl">
        <h3 className="text-xl md:text-2xl font-black text-white flex items-center justify-center gap-3 tracking-wide">
          <Crop size={28} className="text-indigo-400 shrink-0" />
          {title}
        </h3>
        <p className="text-[11px] text-app-muted mt-2 font-medium">{hint}</p>
      </div>

      {/* 바깥: 중앙 정렬 · 안쪽(containerRef): 이미지 실제 표시 크기와 1:1 */}
      <div className="w-full max-w-5xl max-h-[58vh] flex items-center justify-center rounded-2xl border border-app-border/50 bg-app-deep shadow-2xl overflow-hidden">
        <div
          ref={containerRef}
          className="relative inline-block max-w-full max-h-[58vh] cursor-crosshair select-none touch-none"
        >
          <img
            ref={imageRef}
            src={imageSrc}
            className="block max-h-[58vh] max-w-full w-auto h-auto opacity-45 pointer-events-none"
            draggable="false"
            alt=""
          />
          <div
            className="absolute border-2 border-indigo-400 touch-none"
            style={{
              left: `${cropSelection.x}%`,
              top: `${cropSelection.y}%`,
              width: `${cropSelection.width}%`,
              height: `${cropSelection.height}%`,
            }}
          >
            <div
              className="absolute inset-0 cursor-move bg-indigo-500/10"
              onMouseDown={(e) => onCropMouseDown(e, 'move')}
              onTouchStart={(e) => onCropMouseDown(e, 'move')}
            />
            <div className={`${handleClass} -top-3 -left-3 w-6 h-6 cursor-nw-resize`} onMouseDown={(e) => onCropMouseDown(e, 'nw')} onTouchStart={(e) => onCropMouseDown(e, 'nw')} />
            <div className={`${handleClass} -top-3 -right-3 w-6 h-6 cursor-ne-resize`} onMouseDown={(e) => onCropMouseDown(e, 'ne')} onTouchStart={(e) => onCropMouseDown(e, 'ne')} />
            <div className={`${handleClass} -bottom-3 -left-3 w-6 h-6 cursor-sw-resize`} onMouseDown={(e) => onCropMouseDown(e, 'sw')} onTouchStart={(e) => onCropMouseDown(e, 'sw')} />
            <div className={`${handleClass} -bottom-3 -right-3 w-6 h-6 cursor-se-resize`} onMouseDown={(e) => onCropMouseDown(e, 'se')} onTouchStart={(e) => onCropMouseDown(e, 'se')} />
            <div className={`${edgeClass} top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-10 h-2 cursor-n-resize`} onMouseDown={(e) => onCropMouseDown(e, 'n')} onTouchStart={(e) => onCropMouseDown(e, 'n')} />
            <div className={`${edgeClass} bottom-0 left-1/2 -translate-x-1/2 translate-y-2 w-10 h-2 cursor-s-resize`} onMouseDown={(e) => onCropMouseDown(e, 's')} onTouchStart={(e) => onCropMouseDown(e, 's')} />
            <div className={`${edgeClass} left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-2 h-10 cursor-w-resize`} onMouseDown={(e) => onCropMouseDown(e, 'w')} onTouchStart={(e) => onCropMouseDown(e, 'w')} />
            <div className={`${edgeClass} right-0 top-1/2 -translate-y-1/2 translate-x-2 w-2 h-10 cursor-e-resize`} onMouseDown={(e) => onCropMouseDown(e, 'e')} onTouchStart={(e) => onCropMouseDown(e, 'e')} />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-8 py-3 rounded-2xl bg-app-elevated text-app-muted font-black text-sm uppercase hover:bg-app-surface border border-app-border disabled:opacity-50 flex items-center gap-2"
        >
          <X size={18} />
          취소
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={isSubmitting}
          className="px-10 py-3 rounded-2xl bg-indigo-600 text-white font-black text-sm uppercase flex items-center gap-2 hover:bg-indigo-500 disabled:opacity-50"
        >
          <Check size={20} />
          {isSubmitting ? '적용 중…' : '자르기 적용'}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { cropImage } from '../../utils/cropImage';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (blob: Blob) => void;
  title?: string;
  aspectRatio?: number;
  cropShape?: 'round' | 'rect';
  maxOutputDimension?: number;
  outputType?: string;
}

export function ImageCropModal({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  title,
  aspectRatio = 1,
  cropShape = 'round',
  maxOutputDimension,
  outputType,
}: ImageCropModalProps) {
  const { t } = useTranslation(['uploads', 'common']);
  const heading = title ?? t('uploads:crop.title');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await cropImage(imageSrc, croppedAreaPixels, outputType ?? 'image/webp', {
        maxDimension: maxOutputDimension,
        outputType,
      });
      onCropComplete(blob);
      onClose();
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset state when opened with a new image
  useEffect(() => {
    if (isOpen) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsProcessing(false);
    }
  }, [isOpen, imageSrc]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-confirm flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-surface-overlay" onClick={onClose} />
      <div className="relative max-w-md w-full mx-4 glass-modal rounded-2xl animate-slide-up">
        {/* Title bar */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-lg font-semibold text-txt-primary">{heading}</h2>
          <IconButton icon="x" size="sm" label={t('common:actions.close')} onClick={onClose} />
        </div>

        {/* Crop area */}
        {/* react-easy-crop mixes DOM rect/client coordinates with CSS pixels.
            Keep only its interactive canvas at effective 100%; dialog controls
            still use the selected interface scale. */}
        <div className="relative h-[350px] mx-5 mt-4 rounded-xl overflow-hidden bg-surface-base"
          style={{ zoom: 'calc(1 / var(--interface-scale, 1))' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 pt-4 flex items-center gap-3 text-txt-tertiary">
          <Icon name="zoom-in" size="sm" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 min-w-0 h-1.5 rounded-full appearance-none bg-surface-input accent-accent-tone cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-tone"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 p-5">
          <Button variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={isProcessing || !croppedAreaPixels}
          >
            {isProcessing ? t('uploads:crop.applying') : t('common:actions.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}

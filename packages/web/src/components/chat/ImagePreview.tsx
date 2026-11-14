import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { saveImage, copyImageToClipboard } from '../../utils/imageActions';
import { isElectron } from '../../platform/platform';
import { IconButton } from '../ui/IconButton';

export function ImagePreview() {
  const { t } = useTranslation(['chat', 'common']);
  const imageUrl = useUIStore((s) => s.imagePreviewUrl);
  const closeImagePreview = useUIStore((s) => s.closeImagePreview);
  const activeModal = useUIStore((s) => s.activeModal);

  if (activeModal !== 'imagePreview' || !imageUrl) return null;

  // Fixed positioning escapes App's 32px title bar and 1px divider. Keep the
  // preview below that native-control area without changing browser layout.
  const topInsetClass = isElectron() ? 'top-[var(--titlebar-inset)]' : 'top-0';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-modal flex items-center justify-center bg-surface-overlay animate-fade-in cursor-pointer ${topInsetClass}`}
      onClick={closeImagePreview}
    >
      {/* Toolbar: download, copy, close */}
      <div className="absolute top-4 right-4 flex items-center gap-1 z-raised">
        <IconButton
          icon="download"
          size="lg"
          label={t('chat:preview.save')}
          onClick={(e) => {
            e.stopPropagation();
            saveImage(imageUrl);
          }}
        />
        <IconButton
          icon="copy"
          size="lg"
          label={t('chat:preview.copy')}
          onClick={(e) => {
            e.stopPropagation();
            copyImageToClipboard(imageUrl);
          }}
        />
        <IconButton
          icon="x"
          size="lg"
          label={t('common:actions.close')}
          onClick={closeImagePreview}
        />
      </div>
      <img
        src={imageUrl}
        alt={t('chat:preview.alt')}
        className="max-w-[calc(90*var(--app-vw))] max-h-[calc(90*var(--app-vh))] object-contain rounded-xl shadow-elevation-high"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

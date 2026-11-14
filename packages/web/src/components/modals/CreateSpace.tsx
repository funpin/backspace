import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { ImageCropModal } from '../ui/ImageCropModal';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useSpaceStore } from '../../stores/spaceStore';
import { useUIStore } from '../../stores/uiStore';
import { useTransferStore } from '../../stores/transferStore';
import { useNavigate } from 'react-router-dom';
import { waitForTransferAttachment } from '../../utils/waitForTransfer';
import { AVATAR_COLORS } from '@backspace/shared';
import type { SpaceVisibility, AvatarColor } from '@backspace/shared';
import { SPACE_GRADIENT_MAP, getSpaceGradient } from '../../utils/gradients';
import { describeError } from '../../i18n/errors';
import { useAvatarColorNames, useVisibilityOptions } from './spaceSettingsPanels/spaceOptions';

const DESCRIPTION_MAX_LENGTH = 200;

export function CreateSpaceModal() {
  const { t } = useTranslation(['spaces', 'common']);
  const visibilityOptions = useVisibilityOptions();
  const colorNames = useAvatarColorNames();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>('private');
  const [description, setDescription] = useState('');
  const [iconFilename, setIconFilename] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState<AvatarColor>(
    AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? 'mint'
  );
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSpace = useSpaceStore((s) => s.createSpace);
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();

  const isOpen = activeModal === 'createSpace';

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);

    // Reset the input so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    // Show cropped preview
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    const previewUrl = URL.createObjectURL(blob);
    setIconPreview(previewUrl);
    setCropSrc(null);

    // Upload the cropped image
    const file = new File([blob], 'icon.png', { type: 'image/png' });
    setUploadingIcon(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setIconFilename(filename);
    } catch {
      setError(t('spaces:create.icon.uploadFailed'));
      setIconPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleRemoveIcon = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFilename(null);
    setIconPreview(null);
  };

  const handleClose = () => {
    closeModal();
    setName('');
    setVisibility('private');
    setDescription('');
    setIconFilename(null);
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(null);
    setCropSrc(null);
    setAvatarColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? 'mint');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('spaces:create.name.required'));
      return;
    }

    setIsLoading(true);
    try {
      const space = await createSpace({
        name: name.trim(),
        icon: iconFilename ?? undefined,
        avatarColor,
        visibility,
        description: description.trim() || undefined,
      });
      handleClose();
      navigate(`/channels/${space.id}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={handleClose} title={t('spaces:create.title')} mobileStyle="sheet">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
            {error}
          </div>
        )}

        {/* Icon Picker */}
        <div className="flex justify-center mb-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingIcon}
            className="relative w-20 h-20 rounded-full border-2 border-dashed border-border-soft hover:border-accent-tone transition-colors duration-fast flex items-center justify-center overflow-hidden group"
            style={!iconPreview ? { background: getSpaceGradient(undefined, name || 'S', avatarColor).gradient } : undefined}
          >
            {iconPreview ? (
              <>
                <img src={iconPreview} alt={t('spaces:create.icon.previewAlt')} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Icon name="camera" size="lg" className="text-white" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 text-white/90 group-hover:text-white transition-colors">
                {uploadingIcon ? (
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <>
                    <span className="text-2xl font-semibold">{(name || 'S').charAt(0).toUpperCase()}</span>
                    <span className="text-2xs font-medium opacity-60">{t('spaces:create.icon.upload')}</span>
                  </>
                )}
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleIconSelect}
            className="hidden"
          />
          {iconPreview && (
            <button
              type="button"
              onClick={handleRemoveIcon}
              className="ml-2 self-start mt-1 text-txt-tertiary hover:text-status-danger text-xs transition-colors duration-fast"
            >
              {t('common:actions.remove')}
            </button>
          )}
        </div>

        {/* Icon Color */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:create.icon.colorLabel')}
          </label>
          <div className="flex gap-2 justify-center">
            {AVATAR_COLORS.map((key) => {
              const entry = SPACE_GRADIENT_MAP[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAvatarColor(key)}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                  style={{
                    background: entry.gradient,
                    borderColor: avatarColor === key ? 'rgb(var(--text-primary))' : 'transparent',
                    boxShadow: avatarColor === key ? `0 0 0 2px ${entry.glow}40` : 'none',
                  }}
                  title={colorNames[key]}
                />
              );
            })}
          </div>
        </div>

        {/* Space Name */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:create.name.label')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-standard w-full"
            placeholder={t('spaces:create.name.placeholder')}
            autoFocus
          />
        </div>

        {/* Visibility */}
        <div className="mb-4">
          <div className="text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:create.visibilityLabel')}
          </div>
          <div className="space-y-1.5">
            {visibilityOptions.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors duration-fast ${
                  visibility === opt.value
                    ? 'bg-accent-tone/[0.16] shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]'
                    : 'shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-interactive-hover'
                }`}
              >
                <input
                  type="radio"
                  name="create-visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => setVisibility(opt.value)}
                  className="mt-0.5 accent-accent-tone"
                />
                <div>
                  <div className="text-sm font-medium text-txt-primary">{opt.label}</div>
                  <div className="text-xs text-txt-tertiary">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <div className="text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:create.description.label')}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
            placeholder={t('spaces:create.description.placeholder')}
            rows={3}
            className="input-standard w-full resize-none"
          />
          <div className="mt-1 text-2xs text-txt-tertiary text-right tabular-nums">
            {t('spaces:create.description.counter', { length: description.length, max: DESCRIPTION_MAX_LENGTH })}
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 z-raised pointer-events-none">
          <div className="flex justify-end pt-3 pb-1">
            <div className="glass-bubble rounded-xl p-1.5 flex items-center gap-1.5 pointer-events-auto">
              <Button variant="ghost" onClick={handleClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="primary" type="submit" disabled={isLoading || uploadingIcon}>
                {isLoading ? t('spaces:create.submitting') : t('spaces:create.submit')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>

    <ImageCropModal
      isOpen={cropSrc !== null}
      onClose={() => setCropSrc(null)}
      imageSrc={cropSrc ?? ''}
      onCropComplete={handleCropComplete}
      title={t('spaces:create.icon.cropTitle')}
      cropShape="round"
      aspectRatio={1}
      maxOutputDimension={256}
    />
  </>
  );
}

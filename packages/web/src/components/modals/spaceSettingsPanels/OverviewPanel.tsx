import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ImageCropModal } from '../../ui/ImageCropModal';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { getSpaceGradient, SPACE_GRADIENT_MAP } from '../../../utils/gradients';
import { AVATAR_COLORS } from '@backspace/shared';
import type { AvatarColor } from '@backspace/shared';
import { useSpaceStore } from '../../../stores/spaceStore';
import { useSelfIdentity } from '../../../stores/authStore';
import { useSpaceOrigin } from '../../../hooks/useSpaceOrigin';
import { useUIStore } from '../../../stores/uiStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useTransferStore } from '../../../stores/transferStore';
import { waitForTransferAttachment } from '../../../utils/waitForTransfer';
import { hasPermissionBit, PermissionBits } from '../../../utils/permissions';
import { describeError } from '../../../i18n/errors';
import { useAvatarColorNames } from './spaceOptions';

interface OverviewPanelProps {
  spaceId: string;
}

/** Shown over the icon or banner while its upload runs. */
function UploadSpinner() {
  return (
    <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function OverviewPanel({ spaceId }: OverviewPanelProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const colorNames = useAvatarColorNames();
  const spaces = useSpaceStore((s) => s.spaces);
  const updateSpace = useSpaceStore((s) => s.updateSpace);
  const deleteSpace = useSpaceStore((s) => s.deleteSpace);
  const closeModal = useUIStore((s) => s.closeModal);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const navigate = useNavigate();

  const space = spaces.find((s) => s.id === spaceId);
  // The user's row id on the space's instance, which issued its owner id and
  // member rows.
  const self = useSelfIdentity();
  const spaceOrigin = useSpaceOrigin(spaceId);
  const myIdHere = self?.rowIds.get(spaceOrigin);
  const isOwner = !!space && myIdHere !== undefined && space.ownerId === myIdHere;
  const myPerms = spacePermissions.get(spaceId);
  const canManageSpace = hasPermissionBit(myPerms, PermissionBits.MANAGE_SPACE);

  const [spaceName, setSpaceName] = useState(space?.name ?? '');
  // null = no change, '' = remove, 'filename.png' = new uploaded
  const [iconFilename, setIconFilename] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Banner state (same pattern as icon)
  const [bannerFilename, setBannerFilename] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const [avatarColorState, setAvatarColorState] = useState<AvatarColor | null>(space?.avatarColor ?? null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transfer ownership state
  const members = useSpaceStore((s) => s.members);
  const transferOwnership = useSpaceStore((s) => s.transferOwnership);
  const addToast = useUIStore((s) => s.addToast);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (space) {
      setSpaceName(space.name);
      setAvatarColorState(space.avatarColor ?? null);
      setIconFilename(null);
      if (iconPreview) {
        URL.revokeObjectURL(iconPreview);
        setIconPreview(null);
      }
      setBannerFilename(null);
      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview);
        setBannerPreview(null);
      }
    }
  }, [space?.name, space?.icon, space?.banner, space?.avatarColor]);

  // Kept above the `!space` guard. The guard is reachable while this panel
  // stays mounted: the WebSocket handler calls spaceStore.removeSpace on
  // `member_banned`, and removeInstanceSpaces drops every space of an
  // instance when its connection goes away. Neither closes the settings
  // modal, so this component re-renders with `space` undefined, and a hook
  // below the guard would stop being called on that render.
  // Not reachable this way: handleDelete below, which awaits deleteSpace and
  // then calls closeModal in the same continuation. React 18 batches those
  // two store writes into one render, and the panel is unmounted by it.
  const transferCandidates = useMemo(() => {
    const candidates = members.filter(m => m.userId !== myIdHere);
    if (!transferSearch.trim()) return candidates;
    const q = transferSearch.toLowerCase();
    return candidates.filter(m =>
      m.user.displayName?.toLowerCase().includes(q) ||
      m.user.username.toLowerCase().includes(q)
    );
  }, [members, myIdHere, transferSearch]);

  if (!space) return null;

  const hasNameChange = spaceName.trim() !== space.name;
  const hasIconChange = iconFilename !== null;
  const hasBannerChange = bannerFilename !== null;
  const hasAvatarColorChange = avatarColorState !== (space.avatarColor ?? null);
  const hasChanges = hasNameChange || hasIconChange || hasBannerChange || hasAvatarColorChange;

  const currentIconUrl = space.icon
    ? (space.icon.startsWith('http') ? space.icon : api.uploads.url(space.icon))
    : null;

  const currentBannerUrl = space.banner
    ? (space.banner.startsWith('http') ? space.banner : api.uploads.url(space.banner))
    : null;

  // ─── Icon handlers ────────────────────────────────────────────────────────

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    const previewUrl = URL.createObjectURL(blob);
    setIconPreview(previewUrl);
    setCropSrc(null);

    const file = new File([blob], 'icon.webp', { type: blob.type || 'image/webp' });
    setUploadingIcon(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, {
        tray: false,
        origin: space._instanceOrigin || undefined,
      });
      const { filename } = await waitForTransferAttachment(tid);
      setIconFilename(filename);
    } catch {
      setSaveError(t('spaces:settings.overview.iconUploadFailed'));
      setIconPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleRemoveIcon = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(null);
    setIconFilename('');
  };

  // ─── Banner handlers ──────────────────────────────────────────────────────

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBannerCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
  };

  const handleBannerCropComplete = async (blob: Blob) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    const previewUrl = URL.createObjectURL(blob);
    setBannerPreview(previewUrl);
    setBannerCropSrc(null);

    const file = new File([blob], 'banner.webp', { type: blob.type || 'image/webp' });
    setUploadingBanner(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, {
        tray: false,
        origin: space._instanceOrigin || undefined,
      });
      const { filename } = await waitForTransferAttachment(tid);
      setBannerFilename(filename);
    } catch {
      setSaveError(t('spaces:settings.overview.bannerUploadFailed'));
      setBannerPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveBanner = () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
    setBannerFilename('');
  };

  // ─── Save / Discard / Delete ──────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const updates: { name?: string; icon?: string; banner?: string; avatarColor?: string } = {};
      if (hasNameChange) updates.name = spaceName.trim();
      if (hasIconChange) {
        updates.icon = iconFilename === '' ? '' : iconFilename!;
      }
      if (hasBannerChange) {
        updates.banner = bannerFilename === '' ? '' : bannerFilename!;
      }
      if (hasAvatarColorChange) {
        updates.avatarColor = avatarColorState ?? '';
      }
      await updateSpace(spaceId, updates);
      setIconFilename(null);
      if (iconPreview) {
        URL.revokeObjectURL(iconPreview);
        setIconPreview(null);
      }
      setBannerFilename(null);
      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview);
        setBannerPreview(null);
      }
      addToast(t('common:states.settingsSaved'), 'success', 2000);
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setSpaceName(space.name);
    setAvatarColorState(space.avatarColor ?? null);
    setIconFilename(null);
    if (iconPreview) {
      URL.revokeObjectURL(iconPreview);
      setIconPreview(null);
    }
    setBannerFilename(null);
    if (bannerPreview) {
      URL.revokeObjectURL(bannerPreview);
      setBannerPreview(null);
    }
    setSaveError('');
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteSpace(spaceId);
      closeModal();
      navigate('/channels/@me');
    } catch (err) {
      setSaveError(describeError(err));
    }
  };

  // Transfer ownership logic
  const transferTarget = transferTargetId ? members.find(m => m.userId === transferTargetId) : null;

  const handleTransfer = async () => {
    if (!transferTargetId) return;
    setTransferring(true);
    try {
      await transferOwnership(spaceId, transferTargetId);
      addToast(
        t('spaces:settings.overview.transfer.success', { name: transferTarget?.user.displayName || transferTarget?.user.username }),
        'success',
        3000,
      );
      setShowTransfer(false);
      setTransferTargetId(null);
      setTransferSearch('');
    } catch (err) {
      addToast(describeError(err), 'warning', 3000);
    } finally {
      setTransferring(false);
    }
  };

  const displayIconSrc = iconPreview ?? (iconFilename === '' ? null : currentIconUrl);
  const displayBannerSrc = bannerPreview ?? (bannerFilename === '' ? null : currentBannerUrl);

  return (
    <>
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('spaces:settings.nav.tabs.overview')}</h2>
        {/* Space Identity */}
        <div>
          <div className="text-xs font-medium text-txt-secondary mb-1.5">{t('spaces:settings.overview.identity')}</div>
          <div className="rounded-xl bg-surface-elevated p-3.5 space-y-4">
        {/* Space Icon */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:settings.overview.iconLabel')}
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => canManageSpace && fileInputRef.current?.click()}
              disabled={!canManageSpace || uploadingIcon}
              className={`relative w-16 h-16 rounded-full bg-surface-input border-2 border-dashed border-border-soft flex items-center justify-center overflow-hidden group ${
                canManageSpace ? 'hover:border-accent-tone cursor-pointer' : 'cursor-default'
              } transition-colors duration-fast`}
            >
              {displayIconSrc ? (
                <>
                  <img src={displayIconSrc} alt={t('spaces:settings.overview.iconAlt')} className="w-full h-full object-cover" />
                  {canManageSpace && (
                    <div className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast flex items-center justify-center">
                      <Icon name="camera" size="lg" />
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center text-white text-xl font-semibold"
                  style={{ background: getSpaceGradient(space.id, space.name, avatarColorState).gradient }}
                >
                  {space.name.charAt(0).toUpperCase()}
                </div>
              )}
              {uploadingIcon && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <UploadSpinner />
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
            {canManageSpace && (displayIconSrc || space.icon) && iconFilename !== '' && (
              <button
                type="button"
                onClick={handleRemoveIcon}
                className="text-xs font-medium text-txt-tertiary hover:text-status-danger transition-colors duration-fast"
              >
                {t('common:actions.remove')}
              </button>
            )}
          </div>
        </div>

        {/* Space Avatar Color */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:settings.overview.colorLabel')}
          </label>
          <div className="flex gap-2">
            {AVATAR_COLORS.map((key) => {
              const entry = SPACE_GRADIENT_MAP[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => canManageSpace && setAvatarColorState(key)}
                  disabled={!canManageSpace}
                  className={`w-7 h-7 rounded-full transition-[transform,box-shadow] duration-fast ease-out hover:scale-110 disabled:cursor-default disabled:hover:scale-100 ${
                    avatarColorState === key ? 'shadow-[0_0_0_2px_rgb(var(--bg-elevated)),0_0_0_3.5px_rgb(var(--accent-tone))]' : ''
                  }`}
                  style={{ background: entry.gradient }}
                  title={colorNames[key]}
                />
              );
            })}
          </div>
        </div>

        {/* Space Banner */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:settings.overview.bannerLabel')}
          </label>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => canManageSpace && bannerFileInputRef.current?.click()}
              disabled={!canManageSpace || uploadingBanner}
              className={`relative w-full h-24 rounded-xl bg-surface-input border-2 border-dashed border-border-soft flex items-center justify-center overflow-hidden group ${
                canManageSpace ? 'hover:border-accent-tone cursor-pointer' : 'cursor-default'
              } transition-colors duration-fast`}
            >
              {displayBannerSrc ? (
                <>
                  <img src={displayBannerSrc} alt={t('spaces:settings.overview.bannerAlt')} className="w-full h-full object-cover" />
                  {canManageSpace && (
                    <div className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast flex items-center justify-center">
                      <Icon name="camera" size="lg" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-txt-tertiary">
                  <Icon name="image" size="lg" />
                  <span className="text-2xs">{t('spaces:settings.overview.uploadBanner')}</span>
                </div>
              )}
              {uploadingBanner && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <UploadSpinner />
                </div>
              )}
            </button>
            <input
              ref={bannerFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerSelect}
              className="hidden"
            />
            {canManageSpace && (displayBannerSrc || space.banner) && bannerFilename !== '' && (
              <button
                type="button"
                onClick={handleRemoveBanner}
                className="text-xs font-medium text-txt-tertiary hover:text-status-danger transition-colors duration-fast self-start"
              >
                {t('spaces:settings.overview.removeBanner')}
              </button>
            )}
          </div>
        </div>

        {/* Space Name */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:settings.overview.nameLabel')}
          </label>
          <input
            type="text"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            className="input-standard w-full"
            disabled={!canManageSpace}
          />
        </div>
          </div>
        </div>

        {/* Save / Discard */}
        {saveError && (
          <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{saveError}</div>
        )}
        {/* Danger Zone */}
        {isOwner && (
          <div>
            <div className="text-xs font-medium text-status-danger mb-1.5">{t('common:labels.dangerZone')}</div>
            <div className="rounded-xl bg-surface-elevated p-3.5 space-y-4">
              {/* Transfer Ownership */}
              <div>
                <p className="text-xs text-txt-tertiary mb-3">{t('spaces:settings.overview.transfer.description')}</p>
                {showTransfer ? (
                  transferTargetId && transferTarget ? (
                    /* Confirm step */
                    <div className="space-y-3">
                      <div className="p-2.5 rounded-lg bg-status-warn/10 border border-status-warn/20">
                        <p className="text-sm text-txt-secondary">
                          <Trans
                            t={t}
                            i18nKey="spaces:settings.overview.transfer.prompt"
                            values={{ name: transferTarget.user.displayName || transferTarget.user.username }}
                            components={{ strong: <span className="font-semibold text-txt-primary" /> }}
                          />
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setTransferTargetId(null)} disabled={transferring}>
                          {t('common:actions.back')}
                        </Button>
                        <Button variant="danger-solid" onClick={handleTransfer} disabled={transferring}>
                          {transferring ? t('spaces:settings.overview.transfer.transferring') : t('spaces:settings.overview.transfer.confirm')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Member picker */
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={transferSearch}
                        onChange={(e) => setTransferSearch(e.target.value)}
                        placeholder={t('common:labels.searchMembers')}
                        className="input-search w-full"
                        autoFocus
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {transferCandidates.length === 0 ? (
                          <p className="text-xs text-txt-tertiary text-center py-3">{t('common:labels.noMembersFound')}</p>
                        ) : (
                          transferCandidates.map((member) => {
                            const avatarUrl = member.user.avatar
                              ? (member.user.avatar.startsWith('http') || member.user.avatar.startsWith('/') ? member.user.avatar : `/api/uploads/${member.user.avatar}`)
                              : null;
                            return (
                              <button
                                key={member.userId}
                                onClick={() => setTransferTargetId(member.userId)}
                                className="w-full flex items-center gap-2.5 min-h-10 px-2 py-1.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast"
                              >
                                <div className="w-7 h-7 rounded-full bg-surface-input flex-shrink-0 overflow-hidden flex items-center justify-center">
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-2xs font-semibold text-txt-secondary">
                                      {(member.user.displayName || member.user.username).charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col items-start min-w-0">
                                  <span className="text-sm text-txt-primary truncate max-w-full">
                                    {member.user.displayName || member.user.username}
                                  </span>
                                  {member.user.displayName && (
                                    <span className="text-2xs text-txt-tertiary truncate max-w-full">
                                      {member.user.username}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setShowTransfer(false); setTransferSearch(''); }}>
                        {t('common:actions.cancel')}
                      </Button>
                    </div>
                  )
                ) : (
                  <Button variant="danger" onClick={() => setShowTransfer(true)}>
                    {t('spaces:settings.overview.transfer.button')}
                  </Button>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-border-soft" />

              {/* Delete Space */}
              <div>
                <p className="text-xs text-txt-tertiary mb-3">{t('spaces:settings.overview.delete.description')}</p>
                <Button variant={confirmDelete ? 'danger-solid' : 'danger'} onClick={handleDelete}>
                  {confirmDelete ? t('spaces:settings.overview.delete.confirmAgain') : t('spaces:settings.overview.delete.button')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {canManageSpace && hasChanges && (
          <div className="sticky bottom-0 z-raised pointer-events-none">
            <div className="flex justify-center pt-3 pb-1">
              <div className="glass-bubble rounded-xl p-1.5 flex items-center gap-1.5 animate-slide-up pointer-events-auto">
                <Button variant="ghost" size="sm" onClick={handleDiscard}>
                  {t('spaces:settings.discardChanges')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || uploadingIcon || uploadingBanner || !spaceName.trim()}
                >
                  {saving ? t('common:states.saving') : t('common:actions.save')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ImageCropModal
        isOpen={cropSrc !== null}
        onClose={() => setCropSrc(null)}
        imageSrc={cropSrc ?? ''}
        onCropComplete={handleCropComplete}
        title={t('spaces:settings.overview.cropIconTitle')}
        cropShape="round"
        aspectRatio={1}
        maxOutputDimension={256}
      />

      <ImageCropModal
        isOpen={bannerCropSrc !== null}
        onClose={() => setBannerCropSrc(null)}
        imageSrc={bannerCropSrc ?? ''}
        onCropComplete={handleBannerCropComplete}
        title={t('spaces:settings.overview.cropBannerTitle')}
        cropShape="rect"
        aspectRatio={16 / 9}
        maxOutputDimension={1280}
      />
    </>
  );
}

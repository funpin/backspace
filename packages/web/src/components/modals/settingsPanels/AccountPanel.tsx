import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { selectMyChosenStatus, useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/uiStore';
import { useInstanceStore } from '../../../stores/instanceStore';
import { useSpaceStore } from '../../../stores/spaceStore';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Icon } from '../../ui/Icon';
import { ImageCropModal } from '../../ui/ImageCropModal';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { api } from '../../../api/client';
import { useTransferStore } from '../../../stores/transferStore';
import { waitForTransferAttachment } from '../../../utils/waitForTransfer';
import { getAvatarGradient, adjustColor, mutedGradient, AVATAR_GRADIENT_MAP, BANNER_COLOR_PRESETS } from '../../../utils/gradients';
import { AVATAR_COLORS, detachedHomeOf } from '@backspace/shared';
import { PASSWORD_MIN_LENGTH } from '@backspace/shared/src/constants';
import type { User, ChosenUserStatus, AvatarColor } from '@backspace/shared';
import { describeError } from '../../../i18n/errors';

const BIO_MAX_LENGTH = 190;

/** A section heading above a raised group (AccentThemeSection is the model). */
const SECTION_LABEL = 'text-xs font-medium text-txt-secondary mb-1.5';
/** The label of one field inside a group. */
const FIELD_LABEL = 'block text-xs font-medium text-txt-secondary mb-1.5';
/** A quiet inline action under a picture (change, remove). */
const TEXT_ACTION = 'text-xs font-medium text-accent-tone hover:underline text-left disabled:opacity-40';
const TEXT_ACTION_DANGER = 'text-xs font-medium text-status-danger hover:underline text-left';

/**
 * A colour swatch. The chosen one carries the accent edge, separated from the
 * swatch by a ring of the group's own ground so it reads on any colour.
 */
function swatchClass(selected: boolean): string {
  return [
    'transition-[transform,box-shadow] duration-fast ease-out hover:scale-110',
    selected ? 'shadow-[0_0_0_2px_rgb(var(--bg-elevated)),0_0_0_3.5px_rgb(var(--accent-tone))]' : '',
  ].join(' ');
}

/** Shown over an avatar or banner while its upload runs. */
function UploadSpinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function AccountPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const user = useAuthStore((s) => s.user);
  // The chosen status lives on the account that owns it, which is not this
  // page's account when it is a replicated row (utils/selfStatus.ts).
  const savedStatus: ChosenUserStatus = useAuthStore(selectMyChosenStatus) ?? 'online';
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? '');
  const [status, setStatus] = useState<ChosenUserStatus>(savedStatus);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [accentColor, setAccentColor] = useState<string | null>(user?.accentColor ?? null);
  const [avatarColorState, setAvatarColorState] = useState<AvatarColor | null>(user?.avatarColor ?? null);
  const [customHex, setCustomHex] = useState(user?.accentColor ?? '');

  // Avatar upload state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFilename, setAvatarFilename] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Banner upload state
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerFilename, setBannerFilename] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const addToast = useUIStore((s) => s.addToast);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setCustomStatus(user.customStatus ?? '');
      setStatus(savedStatus);
      setBio(user.bio ?? '');
      setAccentColor(user.accentColor ?? null);
      setAvatarColorState(user.avatarColor ?? null);
      setCustomHex(user.accentColor ?? '');
      // Reset upload state
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setAvatarPreview(null);
      setAvatarFilename(null);
      setBannerPreview(null);
      setBannerFilename(null);
    }
  }, [user?.displayName, user?.customStatus, savedStatus, user?.bio, user?.accentColor, user?.avatarColor, user?.avatar, user?.banner]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const instances = useInstanceStore((s) => s.instances);
  const changePassword = useAuthStore((s) => s.changePassword);

  // ── Detached-account re-attach (fallback path, re-attach spec §3.4) ──
  // Explicit action shown only when this client also holds an active connection
  // to the account's home domain. Two-step armed confirm names both identities
  // before minting the proof. The primary/automatic path lives in instanceStore.
  const [reattachArmed, setReattachArmed] = useState(false);
  const [reattaching, setReattaching] = useState(false);
  const [reattachError, setReattachError] = useState<string | null>(null);

  // The home a detached account was federated from. A detached account is
  // homed on this instance, so `homeInstance` is null and only this names it.
  const formerHome = user ? detachedHomeOf(user) : null;

  const homeConnection = useMemo(() => {
    if (!formerHome) return null;
    const homeDomain = formerHome.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    return instances.find(
      (i) => i.status === 'connected'
        // Portless hostname — must agree with the server's extractDomain
        // (new URL(origin).hostname) so a ported home instance still matches.
        && new URL(i.origin).hostname.toLowerCase() === homeDomain,
    ) ?? null;
  }, [instances, formerHome]);

  const handleReattach = async () => {
    if (!homeConnection) return;
    if (!reattachArmed) {
      setReattachArmed(true);
      return;
    }
    setReattaching(true);
    setReattachError(null);
    try {
      // Target domain = THIS instance (where the detached account lives).
      // Portless hostname to match the server's extractDomain contract.
      const { token } = await homeConnection.api.auth.attachProof(window.location.hostname);
      const res = await api.users.reattach({ token });
      useAuthStore.getState().setUser(res.user);
      // Re-attach reconciled this (home) account's 1-on-1 DM federatedIds on the
      // server; refetch the home DM list so the split conversation collapses
      // without a reload.
      try { await useSpaceStore.getState().reloadDmsForOrigin(''); } catch { /* non-fatal */ }
      addToast(t('settings:account.detached.reattached', { username: homeConnection.username }), 'success', 3000);
    } catch (err) {
      setReattachError(err instanceof Error ? describeError(err) : t('settings:account.detached.reattachFailed'));
    } finally {
      setReattaching(false);
      setReattachArmed(false);
    }
  };

  if (!user) return null;

  const effectiveDisplayName = displayName.trim() || user.username;
  const effectiveAccent = accentColor;
  const effectiveAvatarColor = avatarColorState;

  // Change detection
  const hasChanges =
    displayName !== (user.displayName ?? '') ||
    customStatus !== (user.customStatus ?? '') ||
    status !== savedStatus ||
    bio !== (user.bio ?? '') ||
    accentColor !== (user.accentColor ?? null) ||
    avatarColorState !== (user.avatarColor ?? null) ||
    avatarFilename !== null ||
    bannerFilename !== null;

  // Compute banner display
  const currentBannerUrl = user.banner
    ? (user.banner.startsWith('http') ? user.banner : api.uploads.url(user.banner))
    : null;
  const displayBannerSrc = bannerPreview ?? (bannerFilename === '' ? null : currentBannerUrl);

  // Compute avatar display
  const currentAvatarSrc = user.avatar
    ? (user.avatar.startsWith('http') ? user.avatar : api.uploads.url(user.avatar))
    : null;
  const displayAvatarSrc = avatarPreview ?? (avatarFilename === '' ? null : currentAvatarSrc);

  // Banner fallback: accent gradient or avatar gradient (alpha baked into gradient colors)
  const bannerFallback = effectiveAccent
    ? mutedGradient(effectiveAccent, adjustColor(effectiveAccent, -40))
    : (() => {
        const g = getAvatarGradient(user.homeUserId ?? user.id, effectiveDisplayName, effectiveAvatarColor);
        return mutedGradient(g.from, g.to);
      })();

  // ── File selection handlers ──
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBannerCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  // ── Crop complete handlers ──
  const handleAvatarCropComplete = async (blob: Blob) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    const previewUrl = URL.createObjectURL(blob);
    setAvatarPreview(previewUrl);
    setAvatarCropSrc(null);
    const file = new File([blob], 'avatar.webp', { type: blob.type || 'image/webp' });
    setUploadingAvatar(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setAvatarFilename(filename);
    } catch {
      setError(t('settings:account.profile.avatar.uploadFailed'));
      setAvatarPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerCropComplete = async (blob: Blob) => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    const previewUrl = URL.createObjectURL(blob);
    setBannerPreview(previewUrl);
    setBannerCropSrc(null);
    const file = new File([blob], 'banner.webp', { type: blob.type || 'image/webp' });
    setUploadingBanner(true);
    try {
      const tid = await useTransferStore.getState().startUpload(file, { tray: false });
      const { filename } = await waitForTransferAttachment(tid);
      setBannerFilename(filename);
    } catch {
      setError(t('settings:account.profile.banner.uploadFailed'));
      setBannerPreview(null);
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarFilename('');
  };

  const handleRemoveBanner = () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
    setBannerFilename('');
  };

  const handleSave = async () => {
    setError('');
    setIsLoading(true);
    try {
      const updates: Record<string, string | undefined> = {};
      if (displayName !== (user.displayName ?? '')) updates.displayName = displayName.trim();
      if (customStatus !== (user.customStatus ?? '')) updates.customStatus = customStatus.trim();
      if (status !== savedStatus) updates.status = status;
      if (bio !== (user.bio ?? '')) updates.bio = bio.trim();
      if (accentColor !== (user.accentColor ?? null)) updates.accentColor = accentColor ?? '';
      if (avatarColorState !== (user.avatarColor ?? null)) updates.avatarColor = avatarColorState ?? '';
      if (avatarFilename !== null) updates.avatar = avatarFilename;
      if (bannerFilename !== null) updates.banner = bannerFilename;

      await updateProfile(updates as Parameters<typeof updateProfile>[0]);
      addToast(t('settings:account.save.updated'), 'success', 2000);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('settings:account.save.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(t('settings:account.password.tooShort', { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('settings:account.password.mismatch'));
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      addToast(t('settings:account.password.changed'), 'success', 2000);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? describeError(err) : t('settings:account.password.changeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleReset = () => {
    setDisplayName(user.displayName ?? '');
    setCustomStatus(user.customStatus ?? '');
    setStatus(savedStatus);
    setBio(user.bio ?? '');
    setAccentColor(user.accentColor ?? null);
    setAvatarColorState(user.avatarColor ?? null);
    setCustomHex(user.accentColor ?? '');
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setAvatarPreview(null);
    setAvatarFilename(null);
    setBannerPreview(null);
    setBannerFilename(null);
    setError('');
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('settings:account.title')}</h2>
      {formerHome && (
        <div className="rounded-xl bg-status-warn/10 border border-status-warn/20 px-3.5 py-3 text-xs text-txt-secondary leading-relaxed mb-4">
          <span className="font-medium text-txt-primary">{t('settings:account.detached.notice')}</span>{' '}
          {t('settings:account.detached.explanation', { homeInstance: formerHome })}
          {homeConnection && (
            <>
              {' '}{t('settings:account.detached.reattachHint', { username: homeConnection.username, homeInstance: formerHome })}
              <div className="mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReattach}
                  disabled={reattaching}
                >
                  {reattaching
                    ? t('settings:account.detached.reattaching')
                    : reattachArmed
                      ? t('settings:account.detached.reattachConfirm', { username: homeConnection.username })
                      : t('settings:account.detached.reattachButton', { homeInstance: formerHome })}
                </Button>
              </div>
              {reattachError && <div className="mt-1.5 text-status-danger">{reattachError}</div>}
            </>
          )}
        </div>
      )}
      {/* ── Profile Customization ── */}
      <div>
        <div className={SECTION_LABEL}>
          {t('settings:account.profile.sectionTitle')}
        </div>

        {/* Live Preview Card */}
        <div className="rounded-xl overflow-hidden shadow-[inset_0_0_0_1px_var(--glass-border)] mb-4 bg-surface-channel">
          {/* Banner area */}
          <div
            className="h-20"
            style={displayBannerSrc
              ? { backgroundImage: `url(${displayBannerSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { background: bannerFallback }
            }
          />
          {/* Avatar + info */}
          <div className="px-4 pb-3">
            <Avatar
              src={avatarPreview ?? (avatarFilename === '' ? null : user.avatar)}
              name={effectiveDisplayName}
              size={56}
              userId={user.homeUserId ?? user.id}
              user={{ ...user, avatarColor: effectiveAvatarColor } as User}
              ring={{ width: 4, color: 'rgb(var(--bg-channel))' }}
              className="-mt-8 mb-2"
            />
            <div className="font-semibold text-sm leading-tight text-txt-primary">
              {effectiveDisplayName}
            </div>
            <div className="text-xs text-txt-tertiary">@{user.username}</div>
            {bio.trim() && (
              <div className="text-xs text-txt-secondary mt-1.5 whitespace-pre-wrap break-words line-clamp-3">
                {bio.trim()}
              </div>
            )}
          </div>
        </div>

        {/* Upload controls */}
        <div className="rounded-xl bg-surface-elevated p-3.5 space-y-4">
          {/* Avatar upload */}
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.profile.avatar.label')}</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative group"
              >
                <div className="w-16 h-16 rounded-full overflow-hidden">
                  {displayAvatarSrc ? (
                    <img src={displayAvatarSrc} alt={t('settings:account.profile.avatar.alt')} className="w-full h-full object-cover" />
                  ) : (
                    <Avatar
                      src={null}
                      name={effectiveDisplayName}
                      size={64}
                      userId={user.homeUserId ?? user.id}
                      user={{ ...user, avatarColor: effectiveAvatarColor } as User}
                    />
                  )}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
                  <Icon name="camera" size="lg" />
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                    <UploadSpinner />
                  </div>
                )}
              </button>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className={TEXT_ACTION}
                >
                  {t('settings:account.profile.avatar.change')}
                </button>
                {(displayAvatarSrc || user.avatar) && avatarFilename !== '' && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className={TEXT_ACTION_DANGER}
                  >
                    {t('common:actions.remove')}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          {/* Banner upload */}
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.profile.banner.label')}</label>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              className="relative group w-full h-[72px] rounded-lg overflow-hidden border border-border-soft"
            >
              <div
                className="w-full h-full"
                style={displayBannerSrc
                  ? { backgroundImage: `url(${displayBannerSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: mutedGradient(
                      effectiveAccent ?? getAvatarGradient(user.homeUserId ?? user.id, effectiveDisplayName, effectiveAvatarColor).from,
                      effectiveAccent ? adjustColor(effectiveAccent, -40) : getAvatarGradient(user.homeUserId ?? user.id, effectiveDisplayName, effectiveAvatarColor).to,
                      0.5
                    ) }
                }
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
                <Icon name="camera" size="lg" />
              </div>
              {uploadingBanner && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <UploadSpinner />
                </div>
              )}
            </button>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className={TEXT_ACTION}
              >
                {t('settings:account.profile.banner.change')}
              </button>
              {(displayBannerSrc || user.banner) && bannerFilename !== '' && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className={TEXT_ACTION_DANGER}
                >
                  {t('common:actions.remove')}
                </button>
              )}
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerSelect}
              className="hidden"
            />
          </div>

          {/* Avatar Color */}
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.profile.avatarColor.label')}</label>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((key) => {
                const entry = AVATAR_GRADIENT_MAP[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvatarColorState(key)}
                    className={`w-7 h-7 rounded-full ${swatchClass(avatarColorState === key)}`}
                    style={{ background: entry.gradient }}
                    title={t(`common:colors.${key}`)}
                    aria-label={t(`common:colors.${key}`)}
                  />
                );
              })}
            </div>
          </div>

          {/* Banner Color */}
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.profile.bannerColor.label')}</label>
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {[0, 1, 2].map((row) =>
                BANNER_COLOR_PRESETS.map((family) => {
                  const color = family[row]!;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => { setAccentColor(color); setCustomHex(color); }}
                      className={`w-7 h-7 rounded-full ${swatchClass(accentColor === color)}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customHex}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomHex(val);
                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    setAccentColor(val);
                  }
                }}
                placeholder={t('settings:account.profile.bannerColor.hexPlaceholder')}
                className="input-standard w-24 px-2 py-1.5 text-xs font-mono"
                maxLength={7}
              />
              {accentColor && (
                <div
                  className="w-6 h-6 rounded-full shadow-[inset_0_0_0_1px_var(--glass-border)] flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
              )}
              {accentColor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAccentColor(null); setCustomHex(''); }}
                >
                  {t('common:actions.clear')}
                </Button>
              )}
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.profile.bio.label')}</label>
            <div className="relative">
              <textarea
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= BIO_MAX_LENGTH) setBio(e.target.value);
                }}
                rows={3}
                placeholder={t('settings:account.profile.bio.placeholder')}
                className="input-standard w-full resize-none"
                maxLength={BIO_MAX_LENGTH}
              />
              <span className="absolute bottom-2 right-2 text-2xs text-txt-tertiary tabular-nums">
                {t('settings:account.profile.bio.counter', { used: bio.length, max: BIO_MAX_LENGTH })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Account ── */}
      <div>
        <div className={SECTION_LABEL}>{t('settings:account.details.sectionTitle')}</div>
        <div className="rounded-xl bg-surface-elevated p-3.5 space-y-4">
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.details.status.label')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ChosenUserStatus)}
              className="input-standard w-full appearance-none"
            >
              <option value="online">{t('common:states.online')}</option>
              <option value="idle">{t('common:states.idle')}</option>
              <option value="dnd">{t('common:states.doNotDisturb')}</option>
            </select>
          </div>

          <div>
            <label className={FIELD_LABEL}>{t('common:labels.displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-standard w-full"
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>{t('settings:account.details.customStatus.label')}</label>
            <input
              type="text"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              className="input-standard w-full"
              placeholder={t('settings:account.details.customStatus.placeholder')}
            />
          </div>
        </div>
      </div>

      {/* ── Password ── */}
      <div>
        <div className={SECTION_LABEL}>{t('common:labels.password')}</div>
        <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="rounded-xl bg-surface-elevated p-3.5 space-y-3">
          <input type="text" autoComplete="username" value={user.username} readOnly tabIndex={-1} className="sr-only" />
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.password.current.label')}</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-standard w-full pr-10"
                placeholder={t('settings:account.password.current.placeholder')}
                autoComplete="current-password"
              />
              <IconButton
                icon={showCurrentPassword ? 'eye-off' : 'eye'}
                label={showCurrentPassword ? t('settings:account.password.hide') : t('settings:account.password.show')}
                size="sm"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              />
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.password.new.label')}</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-standard w-full pr-10"
                placeholder={t('settings:account.password.new.placeholder', { min: PASSWORD_MIN_LENGTH })}
                autoComplete="new-password"
              />
              <IconButton
                icon={showNewPassword ? 'eye-off' : 'eye'}
                label={showNewPassword ? t('settings:account.password.hide') : t('settings:account.password.show')}
                size="sm"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              />
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL}>{t('settings:account.password.confirm.label')}</label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="input-standard w-full"
              placeholder={t('settings:account.password.confirm.placeholder')}
              autoComplete="new-password"
            />
          </div>

          {passwordError && (
            <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{passwordError}</div>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={passwordLoading || !currentPassword || !newPassword || !confirmNewPassword}
          >
            {passwordLoading ? t('settings:account.password.submitting') : t('settings:account.password.submit')}
          </Button>
        </form>
      </div>

      {/* ── Danger Zone ── */}
      <div>
        <div className={SECTION_LABEL}>{t('common:labels.dangerZone')}</div>
        <div className="rounded-xl bg-status-danger/5 border border-status-danger/20 p-3.5">
          <p className="text-sm text-txt-secondary mb-3">
            {t('settings:account.danger.description')}
          </p>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            {t('settings:account.danger.deleteButton')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</div>
      )}

      {hasChanges && (
        <div className="sticky bottom-0 z-raised pointer-events-none">
          <div className="flex justify-center pt-3 pb-1">
            <div className="glass-bubble rounded-xl p-1.5 flex items-center gap-1.5 animate-slide-up pointer-events-auto">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                {t('common:actions.reset')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isLoading || uploadingAvatar || uploadingBanner}
              >
                {isLoading ? t('common:states.saving') : t('common:actions.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modals */}
      <ImageCropModal
        isOpen={avatarCropSrc !== null}
        onClose={() => setAvatarCropSrc(null)}
        imageSrc={avatarCropSrc ?? ''}
        onCropComplete={handleAvatarCropComplete}
        title={t('settings:account.profile.avatar.cropTitle')}
        cropShape="round"
        aspectRatio={1}
        maxOutputDimension={256}
      />
      <ImageCropModal
        isOpen={bannerCropSrc !== null}
        onClose={() => setBannerCropSrc(null)}
        imageSrc={bannerCropSrc ?? ''}
        onCropComplete={handleBannerCropComplete}
        title={t('settings:account.profile.banner.cropTitle')}
        cropShape="rect"
        aspectRatio={3}
        maxOutputDimension={1280}
      />

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@backspace/shared';
import { Modal } from '../ui/Modal';
import { ImageCropModal } from '../ui/ImageCropModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useSocialStore } from '../../stores/socialStore';
import { useTransferStore } from '../../stores/transferStore';
import { waitForTransferAttachment } from '../../utils/waitForTransfer';
import { api } from '../../api/client';
import { kickFromGroupDm, transferGroupDmOwnership, updateGroupDmMetadata } from '../../utils/groupDmOwnerActions';
import { isMine, parseFederatedUsername, userKey } from '../../utils/identity';
import { useDmViewer } from '../../hooks/useDmViewer';
import { AvatarStack } from '../ui/AvatarStack';
import { DmMemberRow, type DmMemberRowAction } from '../layout/DmMemberRow';
import { visualPixels } from '../../platform/interfaceScale';
import { pointAnchor } from '../../hooks/useFloatingPosition';

const MAX_NAME_LENGTH = 50;
const MAX_GROUP_MEMBERS = 10;

type Tab = 'overview' | 'members';

/**
 * Settings modal for a group DM. Mirrors `SpaceSettings` structurally:
 *   - desktop: left rail (channel card + tab list) + content area
 *   - mobile: tab list, then content with a back button
 *
 * Reads its target channel from `useUIStore.modalData.dmChannelId`. Optional
 * `initialTab` selects which tab opens first.
 *
 * Owner detection: `isMine` of the owner id on the DM copy's origin
 * (`useDmViewer`), the identity rule of client-federation.md section 5.
 * Non-owners see read-only fields (icon click is a no-op, name input disabled,
 * Save button absent). "Leave Group" is enabled for everyone.
 *
 * Save flow:
 *   1. If an icon blob is staged, upload it via transferStore.
 *   2. Build PATCH body with ONLY changed fields (name and/or icon).
 *      Cleared icon → `icon: null`.
 *   3. `updateGroupDmMetadata(channelId, body)` then close the modal.
 * Cancel discards the staged blob; no upload fires.
 */
export function GroupDmSettings() {
  const { t } = useTranslation(['dm', 'common']);
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const isMobile = useUIStore((s) => s.isMobile);
  const addToast = useUIStore((s) => s.addToast);

  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const friends = useSocialStore((s) => s.friends);

  const isOpen = activeModal === 'groupDmSettings';
  const dmChannelId = (modalData.dmChannelId as string | undefined) ?? null;
  const initialTab = (modalData.initialTab as Tab | undefined) ?? 'overview';

  const dmChannel = useMemo(
    () => dmChannels.find((dm) => dm.id === dmChannelId) ?? null,
    [dmChannels, dmChannelId],
  );
  const viewer = useDmViewer(dmChannel?.id);

  // ── Tab + mobile pane state ────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mobileView, setMobileView] = useState<'tabs' | 'content'>('tabs');

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setMobileView('tabs');
    }
  }, [isOpen, initialTab]);

  // ── Overview state ─────────────────────────────────────────────────────
  // `iconState`:
  //   'unchanged' — nothing staged; current dm.icon is in effect
  //   'cleared'   — owner clicked the X; will PATCH `icon: null`
  //   { blob, previewUrl } — owner cropped a fresh blob; deferred upload
  type IconState =
    | { kind: 'unchanged' }
    | { kind: 'cleared' }
    | { kind: 'staged'; blob: Blob; previewUrl: string };

  const [name, setName] = useState('');
  const [iconState, setIconState] = useState<IconState>({ kind: 'unchanged' });
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Member-action confirmation state lives at the same level as the rest of
  // the modal's hooks — declared up here so it stays before the early returns
  // below (React's rules-of-hooks forbid conditional hook calls).
  const [pendingKick, setPendingKick] = useState<User | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<User | null>(null);
  const [memberActionSubmitting, setMemberActionSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset overview state when the modal opens or the underlying channel changes.
  // Revoking previously-staged preview URLs prevents memory leaks across opens.
  useEffect(() => {
    if (!isOpen || !dmChannel) return;
    setName(dmChannel.name ?? '');
    setIconState((prev) => {
      if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
      return { kind: 'unchanged' };
    });
    setSaveError('');
    setConfirmLeave(false);
  }, [isOpen, dmChannel?.id, dmChannel?.name]);

  // Final cleanup: revoke any lingering preview URL on unmount.
  useEffect(() => {
    return () => {
      setIconState((prev) => {
        if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
        return prev;
      });
    };
  }, []);

  if (!isOpen || !dmChannel || !dmChannelId) return null;
  // Group DMs only: this modal is meaningless for 1-on-1 conversations.
  if (!dmChannel.ownerId) return null;

  const isOwner = isMine({ id: dmChannel.ownerId }, viewer.origin, viewer.self);

  const otherMembers: User[] = dmChannel.members.filter((m) => !isMine(m, viewer.origin, viewer.self));

  const fallbackName = otherMembers
    .map((m) => m.displayName ?? parseFederatedUsername(m.username).baseName)
    .join(', ');

  const currentName = dmChannel.name ?? '';
  const trimmedName = name.trim();
  const nameDirty = trimmedName !== currentName.trim();
  const iconDirty = iconState.kind !== 'unchanged';
  const isDirty = nameDirty || iconDirty;

  // What the AvatarStack should show: staged preview > cleared (=no icon) >
  // current dm.icon. Passing `null` falls through to the member-tile layout.
  const previewIconUrl: string | null | undefined =
    iconState.kind === 'staged'
      ? iconState.previewUrl
      : iconState.kind === 'cleared'
        ? null
        : (dmChannel.icon ?? null);

  // ── Icon handlers ──────────────────────────────────────────────────────
  const handleHeroClick = () => {
    if (!isOwner) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    // Reset so picking the same file again re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = (blob: Blob) => {
    setIconState((prev) => {
      if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
      const previewUrl = URL.createObjectURL(blob);
      return { kind: 'staged', blob, previewUrl };
    });
    setCropSrc(null);
  };

  const handleClearIcon = () => {
    if (!isOwner) return;
    setIconState((prev) => {
      if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
      return { kind: 'cleared' };
    });
  };

  // ── Save / Cancel / Leave ──────────────────────────────────────────────
  const handleCancel = () => {
    // Discard staged blob (no upload fired) and close.
    setIconState((prev) => {
      if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
      return { kind: 'unchanged' };
    });
    closeModal();
  };

  const handleSave = async () => {
    if (!isOwner || !isDirty || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const body: { name?: string | null; icon?: string | null } = {};

      if (nameDirty) {
        // Trimmed, enforced to MAX_NAME_LENGTH client-side; server re-validates.
        body.name = trimmedName.slice(0, MAX_NAME_LENGTH);
      }

      if (iconState.kind === 'cleared') {
        body.icon = null;
      } else if (iconState.kind === 'staged') {
        // Defer-to-save upload: only fires when the user commits the change.
        const file = new File([iconState.blob], 'dm-icon.webp', {
          type: iconState.blob.type || 'image/webp',
        });
        const tid = await useTransferStore.getState().startUpload(file, {
          tray: false,
        });
        const { filename } = await waitForTransferAttachment(tid);
        body.icon = filename;
      }

      await updateGroupDmMetadata(dmChannelId, body);
      // Mirror SpaceSettings save behavior: close the modal. The WS broadcast
      // (`dm_channel_updated`) updates the open channel in-place.
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('dm:groupSettings.saveFailed');
      setSaveError(msg);
      addToast(msg, 'warning', 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveClick = () => {
    setConfirmLeave(true);
  };

  const handleConfirmLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await api.dm.leave(dmChannelId);
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('dm:leave.failed');
      addToast(msg, 'warning', 4000);
    } finally {
      setLeaving(false);
      setConfirmLeave(false);
    }
  };

  // ── Members panel data ────────────────────────────────────────────────
  // Friend lookup by person (`userKey`), each row with its own origin.
  const isFriendOfCaller = (m: User): boolean => {
    const key = userKey(m, viewer.origin);
    return friends.some((f) => userKey(f, f._instanceOrigin) === key);
  };

  const memberCount = dmChannel.members.length;
  const remainingSlots = MAX_GROUP_MEMBERS - memberCount;
  const canAddMembers = remainingSlots > 0;

  // Per-member action handler. The kebab is hidden in this view, but right-click
  // (and `View Profile`) still works via the same context-menu wiring.
  // (State for the two confirmation dialogs is declared up with the other hooks.)
  const handleMemberAction = async (action: DmMemberRowAction, member: User) => {
    if (action === 'profile') {
      // Fallback path — DmMemberRow normally opens the profile itself via
      // its own bounding rect. If we reach this branch, just route to a
      // top-left anchor (matches DmRosterPanel's fallback).
      useUIStore.getState().openUserProfile(member, viewer.origin, pointAnchor(visualPixels(100), visualPixels(100)));
      return;
    }
    if (action === 'kick') {
      setPendingKick(member);
      return;
    }
    if (action === 'transfer') {
      setPendingTransfer(member);
      return;
    }
    if (action === 'remove-friend') {
      try {
        await useSocialStore.getState().removeFriend(member, viewer.origin);
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : t('dm:removeFriend.failed'),
          'warning',
          3000,
        );
      }
    }
  };

  const confirmKick = async () => {
    if (!pendingKick) return;
    setMemberActionSubmitting(true);
    try {
      await kickFromGroupDm(dmChannelId, pendingKick);
      addToast(
        t('dm:kick.success', { name: pendingKick.displayName ?? parseFederatedUsername(pendingKick.username).baseName }),
        'success',
        3000,
      );
      setPendingKick(null);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t('dm:kick.failed'),
        'warning',
        3000,
      );
    } finally {
      setMemberActionSubmitting(false);
    }
  };

  const confirmTransfer = async () => {
    if (!pendingTransfer) return;
    setMemberActionSubmitting(true);
    try {
      await transferGroupDmOwnership(dmChannelId, pendingTransfer);
      addToast(
        t('dm:transfer.success', { name: pendingTransfer.displayName ?? parseFederatedUsername(pendingTransfer.username).baseName }),
        'success',
        3000,
      );
      setPendingTransfer(null);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : t('dm:transfer.failed'),
        'warning',
        3000,
      );
    } finally {
      setMemberActionSubmitting(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const tabBtnClass = (t: Tab) =>
    `w-full text-left px-3 rounded-lg text-sm transition-colors duration-fast ${isMobile ? 'h-11' : 'h-[34px]'} ${
      tab === t
        ? 'bg-surface-elevated text-txt-primary font-medium'
        : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
    }`;

  const handleTabClick = (t: Tab) => {
    setTab(t);
    if (isMobile) setMobileView('content');
  };

  const headerName = dmChannel.name && dmChannel.name.length > 0 ? dmChannel.name : (fallbackName || t('dm:names.groupFallback'));

  // ── Overview panel ─────────────────────────────────────────────────────
  const overviewPanel = (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('dm:groupSettings.overview')}</h2>

      {/* Hero icon */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={handleHeroClick}
            disabled={!isOwner}
            data-group-dm-icon-hero
            aria-label={isOwner ? t('dm:groupSettings.changeIcon') : t('dm:groupSettings.icon')}
            className={`relative block rounded-full overflow-hidden group ${
              isOwner ? 'cursor-pointer' : 'cursor-default'
            }`}
            style={{ width: 80, height: 80 }}
          >
            <AvatarStack
              members={otherMembers}
              origin={viewer.origin}
              size={80}
              border="modal"
              iconUrl={previewIconUrl}
            />
            {isOwner && (
              <div
                data-group-dm-icon-overlay
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-2xs font-medium"
              >
                <Icon name="camera" size="lg" />
                <span className="mt-1">{t('dm:groupSettings.clickToUpload')}</span>
              </div>
            )}
          </button>

          {/* Clear (X) button — owner-only, only when we have a non-empty icon to clear */}
          {isOwner && previewIconUrl && (
            <button
              type="button"
              onClick={handleClearIcon}
              data-group-dm-icon-clear
              aria-label={t('dm:groupSettings.removeIcon')}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] flex items-center justify-center text-txt-tertiary hover:text-status-danger transition-colors duration-fast"
            >
              <Icon name="x" size="xs" />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* Group name */}
      <div>
        <label className="block text-xs font-medium text-txt-secondary mb-1.5">
          {t('dm:groupSettings.nameLabel')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
          placeholder={fallbackName || t('dm:names.groupFallback')}
          disabled={!isOwner}
          maxLength={MAX_NAME_LENGTH}
          className="input-standard w-full"
          data-group-dm-name-input
          aria-label={t('dm:groupSettings.nameAria')}
        />
        {isOwner && (
          <div className="text-2xs text-txt-tertiary text-right tabular-nums mt-1">
            {t('dm:groupSettings.nameCount', { current: trimmedName.length, max: MAX_NAME_LENGTH })}
          </div>
        )}
      </div>

      {saveError && (
        <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
          {saveError}
        </div>
      )}

      {/* Save / Cancel — owner only, only when dirty */}
      {isOwner && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleCancel} data-group-dm-cancel>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!isDirty || saving} data-group-dm-save>
            {saving ? t('common:states.saving') : t('common:actions.save')}
          </Button>
        </div>
      )}

      {/* For non-owners: a single Close button (no Save). */}
      {!isOwner && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={closeModal} data-group-dm-close>
            {t('common:actions.close')}
          </Button>
        </div>
      )}

      {/* Leave Group — destructive footer button, everyone */}
      <div className="pt-4 border-t border-border-hard">
        <div className="text-xs font-medium text-status-danger mb-1.5">
          {t('dm:leave.title')}
        </div>
        <p className="text-xs text-txt-tertiary mb-3">
          {t('dm:leave.explanation')}
        </p>
        <Button variant="danger" icon="log-out" onClick={handleLeaveClick} disabled={leaving} data-group-dm-leave>
          {leaving ? t('dm:leave.inProgress') : t('dm:leave.title')}
        </Button>
      </div>
    </div>
  );

  // ── Members panel ──────────────────────────────────────────────────────
  const ownerMember = dmChannel.members.find((m) => m.id === dmChannel.ownerId) ?? null;
  const sortByDisplayName = (a: User, b: User) => {
    const aName = (a.displayName ?? parseFederatedUsername(a.username).baseName).toLowerCase();
    const bName = (b.displayName ?? parseFederatedUsername(b.username).baseName).toLowerCase();
    return aName.localeCompare(bName);
  };
  const nonOwnerMembers = dmChannel.members
    .filter((m) => m.id !== dmChannel.ownerId)
    .sort(sortByDisplayName);

  const membersPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-txt-primary">{t('common:labels.members')}</h2>
        <span className="text-xs text-txt-tertiary tabular-nums">
          {t('dm:addMember.capacity', { current: memberCount, max: MAX_GROUP_MEMBERS })}
        </span>
      </div>

      <button
        type="button"
        onClick={() => useUIStore.getState().openModal('addDmMember', { dmChannelId })}
        disabled={!canAddMembers}
        data-group-dm-add-member
        className="w-full h-[34px] flex items-center gap-2.5 px-3 rounded-lg bg-accent-tone/[0.16] hover:bg-accent-tone/25 text-accent-tone text-sm font-medium transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="user-plus" size="sm" />
        {t('dm:groupSettings.addMember')}
        {!canAddMembers && (
          <span className="ml-auto text-2xs text-txt-tertiary">{t('dm:groupSettings.groupFull')}</span>
        )}
      </button>

      <div data-group-dm-member-list className="space-y-0.5">
        {ownerMember && (
          <DmMemberRow
            member={ownerMember}
            isOwner
            isSelf={isMine(ownerMember, viewer.origin, viewer.self)}
            origin={viewer.origin}
            callerIsOwner={isOwner}
            isFriend={isFriendOfCaller(ownerMember)}
            showKebab={false}
            onMenuAction={handleMemberAction}
          />
        )}
        {nonOwnerMembers.map((m) => (
          <DmMemberRow
            key={m.id}
            member={m}
            isOwner={false}
            isSelf={isMine(m, viewer.origin, viewer.self)}
            origin={viewer.origin}
            callerIsOwner={isOwner}
            isFriend={isFriendOfCaller(m)}
            showKebab={false}
            onMenuAction={handleMemberAction}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={closeModal} size="settings" mobileStyle="fullscreen">
      <div className="flex h-full">
        {/* Desktop sidebar */}
        <div className="hidden desktop:flex w-56 flex-shrink-0 flex-col p-4 gap-3 border-r border-border-hard">
          {/* Channel card */}
          <div className="rounded-xl bg-surface-elevated p-3 flex items-center gap-3">
            <AvatarStack
              members={otherMembers}
              origin={viewer.origin}
              size={36}
              border="modal"
              iconUrl={dmChannel.icon}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-txt-primary truncate">{headerName}</div>
            </div>
          </div>

          {/* Nav list */}
          <div className="flex-1 flex flex-col space-y-0.5">
            <div className="text-xs font-medium text-txt-tertiary px-3 py-1">
              {t('dm:groupSettings.general')}
            </div>
            <button type="button" onClick={() => handleTabClick('overview')} className={tabBtnClass('overview')}>
              {t('dm:groupSettings.overview')}
            </button>
            <button type="button" onClick={() => handleTabClick('members')} className={tabBtnClass('members')}>
              {t('common:labels.members')}
            </button>
          </div>
        </div>

        {/* Mobile: tab list */}
        {isMobile && mobileView === 'tabs' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="rounded-xl bg-surface-elevated p-3 flex items-center gap-3">
              <AvatarStack
                members={otherMembers}
                origin={viewer.origin}
                size={36}
                border="modal"
                iconUrl={dmChannel.icon}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-txt-primary truncate">{headerName}</div>
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-xs font-medium text-txt-tertiary px-3 py-1">
                {t('dm:groupSettings.general')}
              </div>
              <button type="button" onClick={() => handleTabClick('overview')} className={tabBtnClass('overview')}>
                {t('dm:groupSettings.overview')}
              </button>
              <button type="button" onClick={() => handleTabClick('members')} className={tabBtnClass('members')}>
                {t('common:labels.members')}
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        {(!isMobile || mobileView === 'content') && (
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin py-6">
            <div className="px-6 max-w-[640px] mx-auto">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setMobileView('tabs')}
                  className="flex items-center gap-1.5 min-h-11 text-txt-secondary hover:text-txt-primary mb-2 text-sm transition-colors duration-fast"
                  aria-label={t('dm:groupSettings.backToMenu')}
                >
                  <Icon name="arrow-left" size="sm" />
                  {t('dm:groupSettings.title')}
                </button>
              )}
              {tab === 'overview' && overviewPanel}
              {tab === 'members' && membersPanel}
            </div>
          </div>
        )}
      </div>

      {/* Image cropper for new icons (1:1 ratio, matches space-icon convention) */}
      <ImageCropModal
        isOpen={cropSrc !== null}
        onClose={() => setCropSrc(null)}
        imageSrc={cropSrc ?? ''}
        onCropComplete={handleCropComplete}
        title={t('dm:groupSettings.cropTitle')}
        cropShape="round"
        aspectRatio={1}
        maxOutputDimension={256}
      />

      {/* Confirmations for member-row actions and Leave Group */}
      <ConfirmDialog
        isOpen={confirmLeave}
        onClose={() => { if (!leaving) setConfirmLeave(false); }}
        onConfirm={handleConfirmLeave}
        title={t('dm:leave.title')}
        description={t('dm:leave.description', { name: headerName })}
        confirmLabel={t('common:actions.leave')}
        variant="danger"
        loading={leaving}
      />

      <ConfirmDialog
        isOpen={!!pendingKick}
        onClose={() => { if (!memberActionSubmitting) setPendingKick(null); }}
        onConfirm={confirmKick}
        title={t('dm:kick.title')}
        description={
          pendingKick
            ? t('dm:kick.description', { name: pendingKick.displayName ?? parseFederatedUsername(pendingKick.username).baseName })
            : ''
        }
        confirmLabel={t('common:actions.remove')}
        variant="danger"
        loading={memberActionSubmitting}
      />

      <ConfirmDialog
        isOpen={!!pendingTransfer}
        onClose={() => { if (!memberActionSubmitting) setPendingTransfer(null); }}
        onConfirm={confirmTransfer}
        title={t('dm:transfer.title')}
        description={
          pendingTransfer
            ? t('dm:transfer.description', { name: pendingTransfer.displayName ?? parseFederatedUsername(pendingTransfer.username).baseName })
            : ''
        }
        confirmLabel={t('dm:transfer.confirm')}
        variant="warning"
        loading={memberActionSubmitting}
      />
    </Modal>
  );
}

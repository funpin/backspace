import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DmChannel, User } from '@backspace/shared';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useSocialStore } from '../../stores/socialStore';
import { useTransferStore } from '../../stores/transferStore';
import { waitForTransferAttachment } from '../../utils/waitForTransfer';
import { api } from '../../api/client';
import { kickFromGroupDm, transferGroupDmOwnership, updateGroupDmMetadata } from '../../utils/groupDmOwnerActions';
import { isMine, parseFederatedUsername, isFederationGlobeApplicable, userKey } from '../../utils/identity';
import { useDmViewer } from '../../hooks/useDmViewer';
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset';
import { AvatarStack } from '../ui/AvatarStack';
import { ImageCropModal } from '../ui/ImageCropModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MobileScreenHeader } from './MobileScreenHeader';
import { DmMemberRow, type DmMemberRowAction } from './DmMemberRow';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';

const MAX_NAME_LENGTH = 50;
const MAX_GROUP_MEMBERS = 10;

/**
 * Iconography for the federation globe shown next to the group name on mobile.
 * No tooltip on mobile — the dedicated info screen surfaces federation
 * identity via the per-member rows, so the global indicator is intentionally
 * decorative here.
 */
function GroupGlobeIcon() {
  return <Icon name="globe" size="xs" className="text-txt-tertiary" />;
}

/** Sort helper — alphabetical by display-name fallback, lower-cased. */
function sortByDisplayName(a: User, b: User): number {
  const aName = (a.displayName ?? parseFederatedUsername(a.username).baseName).toLowerCase();
  const bName = (b.displayName ?? parseFederatedUsername(b.username).baseName).toLowerCase();
  return aName.localeCompare(bName);
}

interface MobileGroupDmInfoProps {
  params?: Record<string, string>;
}

/**
 * Pushed mobile screen for group DM info + management.
 *
 * Mirrors `MobileMembersScreen` geometry (header + scrollable body) and
 * surfaces the same surface area as the desktop `GroupDmSettings` modal +
 * `DmRosterPanel`, condensed into a single column. The Edit button toggles an
 * **in-place** edit mode inside the hero — this avoids pushing yet another
 * screen on top of the screen stack (an anti-pattern in MobileScreenStack).
 *
 * Reads its target channel from `params.channelId`, set by the caller (e.g.
 * `MobileChatScreen`'s members button).
 */
export function MobileGroupDmInfo({ params }: MobileGroupDmInfoProps) {
  const { t } = useTranslation(['dm', 'common']);
  const channelId = params?.channelId ?? null;

  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const friends = useSocialStore((s) => s.friends);
  const openModal = useUIStore((s) => s.openModal);
  const popMobileScreen = useUIStore((s) => s.popMobileScreen);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const addToast = useUIStore((s) => s.addToast);

  const dmChannel = useMemo(
    () => dmChannels.find((dm) => dm.id === channelId) ?? null,
    [dmChannels, channelId],
  );
  const viewer = useDmViewer(dmChannel?.id);

  // ── Inline edit state ──────────────────────────────────────────────────
  type IconState =
    | { kind: 'unchanged' }
    | { kind: 'cleared' }
    | { kind: 'staged'; blob: Blob; previewUrl: string };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [iconState, setIconState] = useState<IconState>({ kind: 'unchanged' });
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Destructive confirms (kick + transfer + leave) ─────────────────────
  const [pendingKick, setPendingKick] = useState<User | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<User | null>(null);
  const [submittingMemberAction, setSubmittingMemberAction] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // ── iOS keyboard-aware Save/Cancel bar ─────────────────────────────────
  // `useVisualViewportInset` returns a CSS value that resolves to
  // `var(--safe-bottom)` when no keyboard is open, or `<n>px` of
  // occlusion when one is. We paste that straight into the bar's `bottom`
  // style so it rides above the soft keyboard on iOS PWA.
  const { value: bottomInset, keyboardOpen } = useVisualViewportInset();

  // Reset edit state whenever the channel changes or edit mode opens.
  useEffect(() => {
    if (!dmChannel) return;
    if (editing) {
      setName(dmChannel.name ?? '');
      setIconState((prev) => {
        if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
        return { kind: 'unchanged' };
      });
      setSaveError('');
    }
  }, [editing, dmChannel?.id, dmChannel?.name]);

  // Final cleanup: revoke any lingering preview URL on unmount.
  useEffect(() => {
    return () => {
      setIconState((prev) => {
        if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
        return prev;
      });
    };
  }, []);

  // ── Empty / non-group safety ───────────────────────────────────────────
  if (!dmChannel) {
    return (
      <div className="flex flex-col h-full bg-surface-base">
        <MobileScreenHeader title={t('dm:groupInfo.title')} />
        <div className="flex-1 flex items-center justify-center text-txt-tertiary text-sm">
          {t('dm:groupInfo.notFound')}
        </div>
      </div>
    );
  }
  // This screen is meaningless for 1-on-1 DMs.
  if (!dmChannel.ownerId) {
    return (
      <div className="flex flex-col h-full bg-surface-base">
        <MobileScreenHeader title={t('dm:groupInfo.plainTitle')} />
        <div className="flex-1 flex items-center justify-center text-txt-tertiary text-sm">
          {t('dm:groupInfo.notGroup')}
        </div>
      </div>
    );
  }

  const isOwner = isMine({ id: dmChannel.ownerId }, viewer.origin, viewer.self);

  const otherMembers: User[] = dmChannel.members.filter((m) => !isMine(m, viewer.origin, viewer.self));

  const fallbackName = otherMembers
    .map((m) => m.displayName ?? parseFederatedUsername(m.username).baseName)
    .join(', ');

  const displayName = dmChannel.name && dmChannel.name.length > 0 ? dmChannel.name : fallbackName || t('dm:names.groupFallback');

  const currentName = dmChannel.name ?? '';
  const trimmedName = name.trim();
  const nameDirty = trimmedName !== currentName.trim();
  const iconDirty = iconState.kind !== 'unchanged';
  const isDirty = nameDirty || iconDirty;

  const previewIconUrl: string | null | undefined =
    iconState.kind === 'staged'
      ? iconState.previewUrl
      : iconState.kind === 'cleared'
        ? null
        : (dmChannel.icon ?? null);

  // Show the global federation globe next to the group name when any member
  // (besides self) is federated. Mobile intentionally omits the tooltip —
  // per-member rows below carry the federation identity explicitly.
  const hasFederatedMember = otherMembers.some((m) => isFederationGlobeApplicable(m));

  // Member buckets — owner first, then online/offline alphabetically.
  const ownerMember = dmChannel.members.find((m) => m.id === dmChannel.ownerId) ?? null;
  const nonOwnerMembers = dmChannel.members.filter((m) => m.id !== dmChannel.ownerId);
  const onlineMembers = nonOwnerMembers
    .filter((m) => m.status !== 'offline')
    .sort(sortByDisplayName);
  const offlineMembers = nonOwnerMembers
    .filter((m) => m.status === 'offline')
    .sort(sortByDisplayName);

  const memberCount = dmChannel.members.length;
  const canAddMembers = memberCount < MAX_GROUP_MEMBERS;

  // Friend lookup by person (`userKey`), each row with its own origin.
  const isFriendOfCaller = (m: User): boolean => {
    const key = userKey(m, viewer.origin);
    return friends.some((f) => userKey(f, f._instanceOrigin) === key);
  };

  // ── Icon handlers ──────────────────────────────────────────────────────
  const handleHeroClick = () => {
    if (!editing || !isOwner) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
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

  // ── Save / Cancel ─────────────────────────────────────────────────────
  const handleCancel = () => {
    setIconState((prev) => {
      if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
      return { kind: 'unchanged' };
    });
    setSaveError('');
    setEditing(false);
  };

  const handleSave = async () => {
    if (!channelId || !isOwner || !isDirty || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const body: { name?: string | null; icon?: string | null } = {};

      if (nameDirty) {
        body.name = trimmedName.slice(0, MAX_NAME_LENGTH);
      }

      if (iconState.kind === 'cleared') {
        body.icon = null;
      } else if (iconState.kind === 'staged') {
        const file = new File([iconState.blob], 'dm-icon.webp', {
          type: iconState.blob.type || 'image/webp',
        });
        const tid = await useTransferStore.getState().startUpload(file, {
          tray: false,
        });
        const { filename } = await waitForTransferAttachment(tid);
        body.icon = filename;
      }

      await updateGroupDmMetadata(channelId, body);
      // Reset state and exit edit mode. The WS `dm_channel_updated` event
      // will refresh `dmChannels` in-place.
      setIconState((prev) => {
        if (prev.kind === 'staged') URL.revokeObjectURL(prev.previewUrl);
        return { kind: 'unchanged' };
      });
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('dm:groupSettings.saveFailed');
      setSaveError(msg);
      addToast(msg, 'warning', 4000);
    } finally {
      setSaving(false);
    }
  };

  // ── Leave ──────────────────────────────────────────────────────────────
  const handleConfirmLeave = async () => {
    if (!channelId || leaving) return;
    setLeaving(true);
    try {
      await api.dm.leave(channelId);
      // Return to the previous screen (typically MobileDmsScreen via
      // MobileChatScreen). The user is no longer a member.
      popMobileScreen();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('dm:leave.failed');
      addToast(msg, 'warning', 4000);
    } finally {
      setLeaving(false);
      setConfirmLeave(false);
    }
  };

  // ── Per-member action handler ──────────────────────────────────────────
  const handleMemberAction = async (action: DmMemberRowAction, member: User) => {
    if (action === 'profile') {
      // DmMemberRow normally opens the profile itself. Fallback path —
      // push the mobile user-profile screen directly.
      pushMobileScreen('user-profile', { userId: member.id, origin: viewer.origin });
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
    if (!pendingKick || !channelId) return;
    setSubmittingMemberAction(true);
    try {
      await kickFromGroupDm(channelId, pendingKick);
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
      setSubmittingMemberAction(false);
    }
  };

  const confirmTransfer = async () => {
    if (!pendingTransfer || !channelId) return;
    setSubmittingMemberAction(true);
    try {
      await transferGroupDmOwnership(channelId, pendingTransfer);
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
      setSubmittingMemberAction(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const renderMemberRow = (member: User, ownerFlag: boolean) => (
    <DmMemberRow
      key={member.id}
      member={member}
      isOwner={ownerFlag}
      isSelf={isMine(member, viewer.origin, viewer.self)}
      origin={viewer.origin}
      callerIsOwner={isOwner}
      isFriend={isFriendOfCaller(member)}
      showKebab
      alwaysShowKebab
      onMenuAction={handleMemberAction}
    />
  );

  // The header acts as the back button. When in edit mode we add a `Cancel`
  // text action on the right — pairs with the Save/Cancel bar at the bottom
  // (intentional duplication so a tap-target is always reachable above the
  // keyboard).
  const headerRight = editing ? (
    <Button
      size="lg"
      variant="ghost"
      onClick={handleCancel}
      className="h-11"
      data-mobile-edit-cancel
      aria-label={t('dm:groupInfo.cancelEdit')}
    >
      {t('common:actions.cancel')}
    </Button>
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-surface-base">
      <MobileScreenHeader title={t('dm:groupInfo.title')} rightActions={headerRight} />

      <div
        className="flex-1 overflow-y-auto"
        // Reserve room for the Save/Cancel bar when it's pinned to the
        // bottom — otherwise the destructive footer can hide under it.
        style={editing ? { paddingBottom: keyboardOpen ? 72 : 96 } : undefined}
      >
        {/* HERO ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 px-4 pt-8 pb-6 border-b border-border-hard">
          <div className="relative">
            <button
              type="button"
              onClick={handleHeroClick}
              disabled={!editing || !isOwner}
              data-mobile-group-icon-hero
              aria-label={editing && isOwner ? t('dm:groupSettings.changeIcon') : t('dm:groupSettings.icon')}
              className={`relative block rounded-full overflow-hidden ${
                editing && isOwner ? 'cursor-pointer' : 'cursor-default'
              }`}
              style={{ width: 80, height: 80 }}
            >
              <AvatarStack
                members={otherMembers}
                origin={viewer.origin}
                size={80}
                border="chat"
                iconUrl={previewIconUrl}
              />
            </button>

            {/* Clear (X) — owner-only, edit mode only, only when there's an icon to clear. */}
            {editing && isOwner && previewIconUrl && (
              <button
                type="button"
                onClick={handleClearIcon}
                data-mobile-group-icon-clear
                aria-label={t('dm:groupSettings.removeIcon')}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] flex items-center justify-center text-txt-tertiary hover:text-status-danger transition-colors duration-fast"
              >
                <Icon name="x" size="xs" />
              </button>
            )}

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

          {/* Name — input in edit mode, header otherwise. */}
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder={fallbackName || t('dm:names.groupFallback')}
              maxLength={MAX_NAME_LENGTH}
              disabled={!isOwner}
              data-mobile-group-name-input
              aria-label={t('dm:groupSettings.nameAria')}
              className="input-standard w-full max-w-[280px] text-center text-base"
            />
          ) : (
            <div className="flex items-center justify-center gap-1.5 max-w-full">
              <h1
                data-mobile-group-name
                className="text-xl font-semibold text-txt-primary text-center truncate max-w-[260px]"
                title={displayName}
              >
                {displayName}
              </h1>
              {hasFederatedMember && (
                <span data-mobile-group-globe className="inline-flex" aria-label={t('dm:groupInfo.federated')}>
                  <GroupGlobeIcon />
                </span>
              )}
            </div>
          )}

          <p className="text-xs text-txt-tertiary">
            {t('dm:groupInfo.memberCount', { count: memberCount })}
          </p>

          {/* Edit toggle — owner-only, hidden during edit (Cancel header action takes its place). */}
          {isOwner && !editing && (
            <Button
              size="lg"
              variant="secondary"
              icon="pencil"
              onClick={() => setEditing(true)}
              data-mobile-group-edit
              className="mt-1 h-11"
            >
              {t('common:actions.edit')}
            </Button>
          )}

          {saveError && editing && (
            <div className="w-full max-w-[280px] mt-1 px-3 py-2 rounded-lg bg-status-danger/10 text-status-danger text-xs text-center">
              {saveError}
            </div>
          )}
        </div>

        {/* ACTIONS ROW ──────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-border-hard">
          <Button
            size="lg"
            variant="secondary"
            icon="user-plus"
            fullWidth
            onClick={() => channelId && openModal('addDmMember', { dmChannelId: channelId })}
            disabled={!canAddMembers}
            data-mobile-group-add-member
            className="h-11"
          >
            {t('dm:groupSettings.addMember')}
            {!canAddMembers && (
              <span className="ml-1.5 text-2xs text-txt-tertiary">{t('dm:groupSettings.groupFullSuffix')}</span>
            )}
          </Button>
        </div>

        {/* MEMBERS LIST ─────────────────────────────────────────────────── */}
        <div className="p-3">
          {ownerMember && (
            <div data-mobile-group-section="owner" className="mb-4">
              <h3 className="text-xs font-medium text-txt-tertiary px-2 mb-1">
                {t('dm:roster.owner')}
              </h3>
              {renderMemberRow(ownerMember, true)}
            </div>
          )}

          {onlineMembers.length > 0 && (
            <div data-mobile-group-section="online" className="mb-4">
              <h3 className="text-xs font-medium text-txt-tertiary px-2 mb-1">
                {t('dm:roster.sectionCount', { label: t('common:states.online'), total: onlineMembers.length })}
              </h3>
              {onlineMembers.map((m) => renderMemberRow(m, false))}
            </div>
          )}

          {offlineMembers.length > 0 && (
            <div data-mobile-group-section="offline" className="opacity-60">
              <h3 className="text-xs font-medium text-txt-tertiary px-2 mb-1">
                {t('dm:roster.sectionCount', { label: t('common:states.offline'), total: offlineMembers.length })}
              </h3>
              {offlineMembers.map((m) => renderMemberRow(m, false))}
            </div>
          )}
        </div>

        {/* DESTRUCTIVE FOOTER ────────────────────────────────────────────── */}
        <div className="px-4 py-4 border-t border-border-hard">
          <Button
            size="lg"
            variant="danger"
            icon="log-out"
            fullWidth
            onClick={() => setConfirmLeave(true)}
            disabled={leaving}
            data-mobile-group-leave
            className="h-11"
          >
            {leaving ? t('dm:leave.inProgress') : t('dm:leave.title')}
          </Button>
        </div>
      </div>

      {/* Save / Cancel bar — pinned to the visual viewport bottom so the
          iOS soft keyboard doesn't occlude it. Mounted only in edit mode. */}
      {editing && (
        <div
          data-mobile-group-edit-bar
          className="fixed left-0 right-0 z-float bg-surface-base border-t border-border-hard px-4 py-2 flex items-center justify-end gap-2"
          style={{ bottom: bottomInset }}
        >
          <Button
            size="lg"
            variant="ghost"
            onClick={handleCancel}
            disabled={saving}
            className="h-11"
            data-mobile-group-save-cancel
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty || saving || !isOwner}
            className="h-11"
            data-mobile-group-save
          >
            {saving ? t('common:states.saving') : t('common:actions.save')}
          </Button>
        </div>
      )}

      {/* Cropper for new icons — 1:1, 256px max, matches GroupDmSettings. */}
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

      {/* Destructive confirms — leave + kick + transfer */}
      <ConfirmDialog
        isOpen={confirmLeave}
        onClose={() => { if (!leaving) setConfirmLeave(false); }}
        onConfirm={handleConfirmLeave}
        title={t('dm:leave.title')}
        description={t('dm:leave.description', { name: displayName })}
        confirmLabel={t('common:actions.leave')}
        variant="danger"
        loading={leaving}
      />

      <ConfirmDialog
        isOpen={!!pendingKick}
        onClose={() => { if (!submittingMemberAction) setPendingKick(null); }}
        onConfirm={confirmKick}
        title={t('dm:kick.title')}
        description={
          pendingKick
            ? t('dm:kick.description', { name: pendingKick.displayName ?? parseFederatedUsername(pendingKick.username).baseName })
            : ''
        }
        confirmLabel={t('common:actions.remove')}
        variant="danger"
        loading={submittingMemberAction}
      />

      <ConfirmDialog
        isOpen={!!pendingTransfer}
        onClose={() => { if (!submittingMemberAction) setPendingTransfer(null); }}
        onConfirm={confirmTransfer}
        title={t('dm:transfer.title')}
        description={
          pendingTransfer
            ? t('dm:transfer.description', { name: pendingTransfer.displayName ?? parseFederatedUsername(pendingTransfer.username).baseName })
            : ''
        }
        confirmLabel={t('dm:transfer.confirm')}
        variant="warning"
        loading={submittingMemberAction}
      />
    </div>
  );
}

// Re-export the DmChannel shape for downstream test fixtures (kept tiny).
export type { DmChannel };

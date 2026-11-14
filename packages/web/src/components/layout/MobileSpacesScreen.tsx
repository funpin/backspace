import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore, getMyUserIdForOrigin, getChannelOrigin } from '../../stores/spaceStore';
import type { TaggedSpace } from '../../stores/spaceStore';
import { resolveSpaceLayout } from '../../utils/spaceLayout';
import { spaceInviteUrl } from '../../utils/inviteParser';
import { useChatStore } from '../../stores/chatStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { useNavigate } from 'react-router-dom';
import { getSpaceGradient } from '../../utils/gradients';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import type { Channel } from '@backspace/shared';
import { Mascot } from '../ui/Mascot';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TransferOwnershipModal } from '../modals/TransferOwnershipModal';
import { MobileFolderSheet } from './MobileFolderSheet';
import { useInstanceStore } from '../../stores/instanceStore';
import { VoiceUserRow } from '../voice/VoiceUserRow';
import { MobileVoiceJoinSheet } from '../voice/MobileVoiceJoinSheet';
import { buildVoiceModMenuItems, VolumeSliderItem } from '../voice/voiceMenuItems';
import { joinVoiceChannel } from '../../utils/voice';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { getSpaceChannelLocation } from '../../hooks/useNotificationSettings';
import { ChannelMutedIndicator } from '../notifications/ChannelMutedIndicator';
import { NotificationSettingsModal, type NotificationSettingsModalTarget } from '../notifications/NotificationSettingsModal';
import { describeCodedError } from '../../i18n/errors';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Tag';

export function MobileSpacesScreen() {
  const { t } = useTranslation(['spaces', 'common']);
  const spaces = useSpaceStore((s) => s.spaces);
  const channels = useSpaceStore((s) => s.channels);
  const categories = useSpaceStore((s) => s.categories);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const lastSelectedSpaceId = useSpaceStore((s) => s.lastSelectedSpaceId);
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const setCurrentSpace = useSpaceStore((s) => s.setCurrentSpace);
  const channelToSpaceMap = useSpaceStore((s) => s.channelToSpaceMap);
  const voiceChannelIds = useSpaceStore((s) => s.voiceChannelIds);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const channelPermissions = useSpaceStore((s) => s.channelPermissions);
  const folders = useSpaceStore((s) => s.folders);
  const spaceLayout = useSpaceStore((s) => s.spaceLayout);
  const updateSpaceLayout = useSpaceStore((s) => s.updateSpaceLayout);
  const loadingSpaceId = useSpaceStore((s) => s.loadingSpaceId);
  const loadedSpaceIds = useSpaceStore((s) => s.loadedSpaceIds);

  const unreadChannels = useChatStore((s) => s.unreadChannels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);

  const voiceUsers = useVoiceStore((s) => s.voiceUsers);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const voiceUserStates = useVoiceStore((s) => s.voiceUserStates);
  const spaceMutedUserIds = useVoiceStore((s) => s.spaceMutedUserIds);
  const spaceDeafenedUserIds = useVoiceStore((s) => s.spaceDeafenedUserIds);
  const permissionMutedUserIds = useVoiceStore((s) => s.permissionMutedUserIds);
  const participantMutes = useVoiceStore((s) => s.participantMutes);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);

  const members = useSpaceStore((s) => s.members);

  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const openModal = useUIStore((s) => s.openModal);
  const setLastChannel = useUIStore((s) => s.setLastChannel);
  const addToast = useUIStore((s) => s.addToast);

  const openContextMenu = useContextMenuStore((s) => s.open);

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Local state
  // Initial value: prefer `currentSpaceId` if set (the user is currently in a
  // space's URL), otherwise fall back to the sticky `lastSelectedSpaceId`.
  // This handles the remount-after-DM-detour case: AppLayout's URL effect has
  // cleared `currentSpaceId` to null on `/channels/@me`, but the user's
  // intent — the most-recently-selected space — is still recorded.
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    currentSpaceId ?? lastSelectedSpaceId,
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [leaveConfirmSpaceId, setLeaveConfirmSpaceId] = useState<string | null>(null);
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [transferModalSpaceId, setTransferModalSpaceId] = useState<string | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<NotificationSettingsModalTarget | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [voiceJoinChannelId, setVoiceJoinChannelId] = useState<string | null>(null);

  // Sync selected space with store's current space
  useEffect(() => {
    if (selectedSpaceId) {
      setCurrentSpace(selectedSpaceId);
      loadSpaceDetail(selectedSpaceId);
    }
  }, [selectedSpaceId, setCurrentSpace, loadSpaceDetail]);

  // Sync local selection from store when external code changes the current
  // space (e.g. SpaceInviteCard's join handler seeding currentSpaceId before
  // routing to the Spaces tab). Without this, useState(currentSpaceId) is only
  // captured on mount and the strip stays on the previously-selected space.
  //
  // selectedSpaceId is intentionally NOT in the dep array: including it caused
  // a render loop because handleSpaceSelect briefly leaves selectedSpaceId !==
  // currentSpaceId until the existing effect below propagates the local pick
  // to the store. Functional setState makes the update idempotent — if the
  // store already matches, React bails and skips the re-render.
  useEffect(() => {
    if (!currentSpaceId) return;
    setSelectedSpaceId((prev) => (currentSpaceId !== prev ? currentSpaceId : prev));
  }, [currentSpaceId]);

  // Auto-select first space if none selected
  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0 && spaces[0]) {
      setSelectedSpaceId(spaces[0].id);
    }
  }, [selectedSpaceId, spaces]);

  // Check if loaded channels belong to selected space
  const spaceChannels = useMemo(() => {
    if (!selectedSpaceId) return [];
    return channels.filter(c => channelToSpaceMap.get(c.id) === selectedSpaceId);
  }, [channels, channelToSpaceMap, selectedSpaceId]);

  // Group channels by category
  const channelsByCategory = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const ch of spaceChannels) {
      if (!ch.categoryId) continue;
      let arr = map.get(ch.categoryId);
      if (!arr) { arr = []; map.set(ch.categoryId, arr); }
      arr.push(ch);
    }
    for (const [key, arr] of map) {
      map.set(key, arr.sort((a, b) => a.position - b.position));
    }
    return map;
  }, [spaceChannels]);

  const uncategorizedChannels = useMemo(() =>
    spaceChannels
      .filter(c => !c.categoryId)
      .sort((a, b) => a.position - b.position),
    [spaceChannels]
  );

  const sortedCategories = useMemo(() =>
    [...categories].sort((a, b) => a.position - b.position),
    [categories]
  );

  // Check if space has unread text channels
  const spaceHasUnread = (spaceId: string): boolean => {
    for (const chId of unreadChannels) {
      if (channelToSpaceMap.get(chId) === spaceId && !voiceChannelIds.has(chId)) {
        return true;
      }
    }
    return false;
  };

  // ─── Folder-aware layout resolution ─────────────────────────────────

  const resolvedLayout = useMemo(
    () => resolveSpaceLayout(spaces, spaceLayout, folders),
    [spaces, spaceLayout, folders],
  );

  const handleSpaceSelect = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setCollapsedCategories(new Set());
  };

  const handleChannelTap = (channel: Channel) => {
    if (channel.type === 'voice') {
      setVoiceJoinChannelId(channel.id);
      return;
    }
    if (selectedSpaceId) {
      setLastChannel(selectedSpaceId, channel.id);
      navigate(`/channels/${selectedSpaceId}/${channel.id}`);
    }
    pushMobileScreen('channel-chat', {
      channelId: channel.id,
      spaceId: selectedSpaceId || '',
    });
  };

  const handleVoiceJoin = useCallback((chId: string, preMuted: boolean) => {
    if (preMuted) {
      useVoiceStore.getState().setMuted(true);
    }
    const connectFn = useVoiceStore.getState().connectFn;
    joinVoiceChannel(chId, connectFn ?? undefined);
    setVoiceJoinChannelId(null);
    // Push the canonical mobile voice screen key. Previously this passed
    // 'voice', which has no entry in MobileShell.screenMap — the renderer
    // returned null while the root screen sat under `visibility: hidden`,
    // exposing the desktop PictureInPicture popup as the only visible UI
    // (the "PiP-style grey view" bug). The screen key must match
    // MobileShell.tsx:91 ('voice-full').
    pushMobileScreen('voice-full');
  }, [pushMobileScreen]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  // ─── Folder handlers ──────────────────────────────────────────────────

  const handleCreateFolder = async (spaceId: string) => {
    const currentLayout = spaceLayout || spaces.map(s => ({ t: 's' as const, id: s.id }));
    // Remove the space from its current position
    const newLayout = currentLayout.filter(item => !(item.t === 's' && item.id === spaceId));
    // Create a new folder ID
    const folderId = `folder-${Date.now()}`;
    // Insert the folder where the space was
    const insertIdx = currentLayout.findIndex(item => item.t === 's' && item.id === spaceId);
    newLayout.splice(insertIdx >= 0 ? insertIdx : newLayout.length, 0, { t: 'f', id: folderId });

    const folderData: Record<string, { name: string | null; color: string | null; spaceIds: string[] }> = {};
    // Preserve existing folders
    for (const f of folders) {
      folderData[f.id] = { name: f.name, color: f.color, spaceIds: f.spaceIds };
    }
    // Add new folder
    folderData[folderId] = { name: null, color: null, spaceIds: [spaceId] };

    await updateSpaceLayout(newLayout, folderData);
    addToast(t('spaces:sidebar.folder.created'), 'success', 3000);
  };

  const handleMoveToFolder = async (spaceId: string, folderId: string) => {
    const currentLayout = spaceLayout || spaces.map(s => ({ t: 's' as const, id: s.id }));
    const newLayout = currentLayout.filter(item => !(item.t === 's' && item.id === spaceId));

    const folderData: Record<string, { name: string | null; color: string | null; spaceIds: string[] }> = {};
    for (const f of folders) {
      folderData[f.id] = {
        name: f.name,
        color: f.color,
        spaceIds: f.id === folderId ? [...f.spaceIds, spaceId] : f.spaceIds,
      };
    }

    await updateSpaceLayout(newLayout, folderData);
    addToast(t('spaces:sidebar.folder.moved'), 'success', 3000);
  };

  const handleRemoveFromFolder = async (spaceId: string) => {
    const currentLayout = spaceLayout || spaces.map(s => ({ t: 's' as const, id: s.id }));

    // Find which folder contains this space
    const containingFolder = folders.find(f => f.spaceIds.includes(spaceId));
    if (!containingFolder) return;

    // Find the folder's position in layout and insert the space after it
    const folderIdx = currentLayout.findIndex(item => item.t === 'f' && item.id === containingFolder.id);
    const newLayout = [...currentLayout];
    newLayout.splice(folderIdx + 1, 0, { t: 's', id: spaceId });

    const folderData: Record<string, { name: string | null; color: string | null; spaceIds: string[] }> = {};
    for (const f of folders) {
      folderData[f.id] = {
        name: f.name,
        color: f.color,
        spaceIds: f.id === containingFolder.id
          ? f.spaceIds.filter(sid => sid !== spaceId)
          : f.spaceIds,
      };
    }

    // If folder is now empty, remove it from layout
    if (folderData[containingFolder.id]!.spaceIds.length === 0) {
      const idx = newLayout.findIndex(item => item.t === 'f' && item.id === containingFolder.id);
      if (idx >= 0) newLayout.splice(idx, 1);
      delete folderData[containingFolder.id];
    }

    await updateSpaceLayout(newLayout, folderData);
    addToast(t('spaces:sidebar.folder.removed'), 'success', 3000);
  };

  const handleUngroup = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const currentLayout = spaceLayout || spaces.map(s => ({ t: 's' as const, id: s.id }));
    const folderIdx = currentLayout.findIndex(item => item.t === 'f' && item.id === folderId);

    // Replace folder with its spaces
    const newLayout = [...currentLayout];
    const spaceItems = folder.spaceIds.map(sid => ({ t: 's' as const, id: sid }));
    newLayout.splice(folderIdx, 1, ...spaceItems);

    const folderData: Record<string, { name: string | null; color: string | null; spaceIds: string[] }> = {};
    for (const f of folders) {
      if (f.id !== folderId) {
        folderData[f.id] = { name: f.name, color: f.color, spaceIds: f.spaceIds };
      }
    }

    await updateSpaceLayout(newLayout, folderData);
    setOpenFolderId(null);
    addToast(t('spaces:sidebar.folder.ungrouped'), 'success', 3000);
  };

  const handleUpdateFolder = async (folderId: string, updates: { name?: string | null; color?: string | null }) => {
    const folderData: Record<string, { name: string | null; color: string | null; spaceIds: string[] }> = {};
    for (const f of folders) {
      folderData[f.id] = {
        name: f.id === folderId && updates.name !== undefined ? updates.name : f.name,
        color: f.id === folderId && updates.color !== undefined ? updates.color : f.color,
        spaceIds: f.spaceIds,
      };
    }
    const currentLayout = spaceLayout || spaces.map(s => ({ t: 's' as const, id: s.id }));
    await updateSpaceLayout(currentLayout, folderData);
  };

  // ─── Context menu handlers ────────────────────────────────────────────

  const handleSpaceContextMenu = (e: React.MouseEvent, spaceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const space = spaces.find(s => s.id === spaceId);
    if (!space) return;
    const isOwner = space.ownerId === getMyUserIdForOrigin((space as TaggedSpace)._instanceOrigin ?? '');

    // Check if space is in a folder
    const inFolder = folders.some(f => f.spaceIds.includes(spaceId));
    const availableFolders = folders.filter(f => !f.spaceIds.includes(spaceId));

    const items: ContextMenuItem[] = [
      {
        key: 'invite',
        type: 'action',
        label: t('common:actions.invitePeople'),
        icon: <Icon name="user-plus" size="sm" />,
        onClick: async () => {
          try {
            const code = await useSpaceStore.getState().generateInvite(spaceId);
            await navigator.clipboard.writeText(spaceInviteUrl((space as TaggedSpace)._instanceOrigin, code));
            addToast(
              t(space.visibility === 'request' ? 'spaces:sidebar.space.inviteCopiedRequest' : 'spaces:sidebar.space.inviteCopied'),
              'success',
              3000,
            );
          } catch (err) {
            addToast(describeCodedError(err, t('spaces:sidebar.space.inviteFailed')), 'warning', 3000);
          }
        },
      },
      {
        key: 'create-folder',
        type: 'action',
        label: t('spaces:sidebar.folder.create'),
        hidden: inFolder,
        icon: <Icon name="folder-plus" size="sm" />,
        onClick: () => handleCreateFolder(spaceId),
      },
    ];

    // Move to Folder submenu (only for standalone spaces when folders exist)
    if (!inFolder && availableFolders.length > 0) {
      items.push({
        key: 'move-to-folder',
        type: 'submenu',
        label: t('spaces:sidebar.folder.moveTo'),
        icon: <Icon name="arrow-right" size="sm" />,
        children: availableFolders.map(f => ({
          key: f.id,
          type: 'action' as const,
          label: f.name || t('spaces:sidebar.folder.unnamed'),
          onClick: () => handleMoveToFolder(spaceId, f.id),
        })),
      });
    }

    // Remove from Folder (only for spaces in a folder)
    if (inFolder) {
      items.push({
        key: 'remove-from-folder',
        type: 'action',
        label: t('spaces:sidebar.folder.removeFrom'),
        icon: <Icon name="corner-up-left" size="sm" />,
        onClick: () => handleRemoveFromFolder(spaceId),
      });
    }

    items.push({
      key: 'notifications',
      type: 'action',
      label: t('spaces:notifications.open'),
      icon: <Icon name="bell" size="sm" />,
      onClick: () => setNotificationTarget({
        kind: 'space',
        origin: (space as TaggedSpace)._instanceOrigin ?? '',
        spaceId,
        spaceName: space.name,
      }),
    });

    items.push({ key: 'sep', type: 'separator' });

    items.push({
      key: 'transfer',
      type: 'action',
      label: t('spaces:sidebar.space.transferOwnership'),
      hidden: !isOwner,
      icon: <Icon name="crown" size="sm" />,
      onClick: () => setTransferModalSpaceId(spaceId),
    });

    items.push({
      key: 'leave',
      type: 'action',
      label: t('spaces:sidebar.space.leave'),
      hidden: isOwner,
      danger: true,
      icon: <Icon name="log-out" size="sm" />,
      onClick: () => setLeaveConfirmSpaceId(spaceId),
    });

    openContextMenu({ x: e.clientX, y: e.clientY }, items);
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const canManageChannels = hasPermissionBit(
      channelPermissions.get(channelId),
      PermissionBits.MANAGE_CHANNELS
    );
    const channel = channels.find((ch) => ch.id === channelId);
    // Mobile has no header bell, so the channel's notification settings are
    // reached from its menu. Voice channels have no notification popover on
    // desktop either; their alerts follow the space setting.
    const location = channel && channel.type !== 'voice' ? getSpaceChannelLocation(channelId) : undefined;
    if (!canManageChannels && !location) return;

    const items: ContextMenuItem[] = [
      {
        key: 'notifications',
        type: 'action',
        label: t('spaces:notifications.open'),
        hidden: !location || !channel,
        icon: <Icon name="bell" size="sm" />,
        onClick: () => {
          if (!location || !channel) return;
          setNotificationTarget({
            kind: 'channel',
            origin: location.origin,
            spaceId: location.spaceId,
            channelId,
            channelName: channel.name,
          });
        },
      },
      { key: 'notif-sep', type: 'separator', hidden: !canManageChannels },
      {
        key: 'channel-settings',
        type: 'action',
        hidden: !canManageChannels,
        label: t('spaces:channels.settings'),
        icon: <Icon name="settings" size="sm" />,
        onClick: () => openModal('channelSettings', { channelId }),
      },
      { key: 'ch-sep', type: 'separator', hidden: !canManageChannels },
      {
        key: 'delete-channel',
        type: 'action',
        hidden: !canManageChannels,
        label: t('spaces:channels.delete'),
        danger: true,
        icon: <Icon name="trash-2" size="sm" />,
        onClick: () => setDeleteChannelId(channelId),
      },
    ];

    openContextMenu({ x: e.clientX, y: e.clientY }, items);
  };

  const handleCategoryContextMenu = (e: React.MouseEvent, categoryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const canManageChannels = hasPermissionBit(myPerms, PermissionBits.MANAGE_CHANNELS);
    if (!canManageChannels) return;

    openContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        key: 'category-settings',
        type: 'action',
        label: t('spaces:channels.categorySettings'),
        icon: <Icon name="settings" size="sm" />,
        onClick: () => openModal('categorySettings', { categoryId }),
      },
      { key: 'cat-sep', type: 'separator' },
      {
        key: 'delete-category',
        type: 'action',
        label: t('spaces:channels.deleteCategory'),
        danger: true,
        icon: <Icon name="trash-2" size="sm" />,
        onClick: () => setDeleteCategoryId(categoryId),
      },
    ]);
  };

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);
  const myPerms = selectedSpaceId ? spacePermissions.get(selectedSpaceId) : undefined;
  const canInvite = hasPermissionBit(myPerms, PermissionBits.CREATE_INVITE);
  const canManageSpace = hasPermissionBit(myPerms, PermissionBits.MANAGE_SPACE);

  // Show skeleton while the selected space's channels/members are being fetched.
  // Mirrors desktop ChannelSidebar's `showChannelSkeleton` (gated by
  // useDelayedLoading to avoid flicker on cached/fast loads).
  const isLoadingSelectedSpace = !!loadingSpaceId && loadingSpaceId === selectedSpaceId;
  const showChannelSkeleton = useDelayedLoading(isLoadingSelectedSpace);
  // Render-branch gating for the channel-list area:
  //
  // Render order is: skeleton (loading) → mascot (loaded but empty) → real list.
  //
  // The mascot empty state must be gated on a SETTLED state: a load has
  // completed at least once for this space AND no load is currently in flight.
  // Without the settled gate, the mascot flashed for the pre-skeleton window
  // (< 200 ms threshold of `useDelayedLoading`) on every space switch — for
  // any space whose channels weren't already in `state.channels`, which is
  // every fresh space switch since `state.channels` only ever holds the most
  // recently loaded space's channels (`loadSpaceDetail` replaces them).
  //
  // Desktop `ChannelSidebar` has no empty-state branch, so this asymmetry
  // never affected it; mobile's "No channels yet." mascot is the differential
  // surface that needed the settle gate.
  //
  // `loadedSpaceIds` is added by `loadSpaceDetail` on success only, so a
  // failed load won't falsely trigger the empty state. When the gate is
  // false (loading or never loaded), we render nothing in the gap between
  // pre-skeleton and skeleton — preferable to flashing a misleading mascot.
  const isSpaceSettledEmpty =
    !isLoadingSelectedSpace &&
    !!selectedSpaceId &&
    loadedSpaceIds.has(selectedSpaceId) &&
    spaceChannels.length === 0;

  const handleVoiceUserContextMenu = useCallback(
    (e: React.MouseEvent, userId: string, channelId: string) => {
      if (userId === user?.id) return;
      e.preventDefault();
      e.stopPropagation();

      const modItems = buildVoiceModMenuItems(userId, channelId);
      const items: ContextMenuItem[] = [...modItems];

      if (modItems.length > 0) {
        items.push({ key: 'mod-end-sep', type: 'separator' });
      }

      items.push({
        key: 'mute-user',
        type: 'checkbox',
        label: t('spaces:mobile.muteUser'),
        subscribe: useVoiceStore.subscribe,
        getChecked: () => useVoiceStore.getState().participantMutes.get(userId) ?? false,
        onChange: (checked) => useVoiceStore.getState().setParticipantMute(userId, checked),
      });

      items.push({ key: 'vol-sep', type: 'separator' });

      items.push({
        key: 'volume',
        type: 'custom',
        render: () => React.createElement(VolumeSliderItem, { userId }),
      });

      openContextMenu({ x: e.clientX, y: e.clientY }, items);
    },
    [user?.id, openContextMenu, t],
  );

  const renderChannelItem = (channel: Channel) => {
    const isVoice = channel.type === 'voice';
    const isActive = !isVoice && currentChannelId === channel.id;
    const isUnread = unreadChannels.has(channel.id) && !isActive;
    const isInVoice = currentVoiceChannelId === channel.id;
    const vUsers = voiceUsers.get(channel.id) || [];
    const canView = hasPermissionBit(channelPermissions.get(channel.id), PermissionBits.VIEW_CHANNEL);
    if (canView === false) return null;

    const spaceId = channelToSpaceMap.get(channel.id);

    return (
      <div key={channel.id}>
        <button
          onClick={() => handleChannelTap(channel)}
          onContextMenu={(e) => handleChannelContextMenu(e, channel.id)}
          data-context-menu={`channel-${channel.id}`}
          className={`w-full min-h-11 flex items-center gap-2 px-2 rounded-lg text-left transition-colors duration-fast ${
            isActive ? 'bg-surface-elevated text-txt-primary font-medium' :
            isInVoice ? 'bg-status-ok/10 text-status-ok' :
            'text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary'
          }`}
        >
          <Icon name={isVoice ? 'volume-2' : 'hash'} size="md" className={isActive || isInVoice ? '' : 'text-txt-tertiary'} />
          <span className={`flex-1 text-sm truncate ${isUnread ? 'font-semibold text-txt-primary' : ''}`}>
            {channel.name}
          </span>
          {!isVoice && <ChannelMutedIndicator channelId={channel.id} className="text-txt-tertiary" />}
          {isUnread && <Badge className="shrink-0" />}
        </button>

        {/* Inline voice users */}
        {isVoice && vUsers.length > 0 && (
          <div className="ml-7 mt-0.5 space-y-0.5">
            {vUsers.map((userId) => {
              const member = members.find(m => m.userId === userId);
              const displayName = member?.user.displayName ?? member?.user.username ?? userId;
              const avatar = member?.user.avatar ?? null;
              const avatarColor = member?.user.avatarColor;
              const wsStatus = voiceUserStates.get(userId);
              const isMuted = wsStatus?.isMuted ?? false;
              const isDeafened = wsStatus?.isDeafened ?? false;
              const hasCamera = wsStatus?.isCameraOn ?? false;
              const isScreenSharing = wsStatus?.isScreenSharing ?? false;
              const isSpaceMuted = spaceMutedUserIds.has(`${spaceId}:${userId}`);
              const isSpaceDeafened = spaceDeafenedUserIds.has(`${spaceId}:${userId}`);
              const isPermissionMuted = permissionMutedUserIds.has(`${spaceId}:${userId}`);

              return (
                <div
                  key={userId}
                  data-context-menu={`voice-user-${userId}`}
                  className="px-3 py-1 rounded-lg hover:bg-interactive-hover transition-colors"
                  onClick={() => openModal('userProfile', { userId, user: member?.user, origin: getChannelOrigin(channel.id) })}
                  onContextMenu={(e) => handleVoiceUserContextMenu(e, userId, channel.id)}
                >
                  <VoiceUserRow
                    userId={member?.user.homeUserId ?? userId}
                    displayName={displayName}
                    avatar={avatar}
                    avatarColor={avatarColor ?? undefined}
                    isMuted={isMuted}
                    isDeafened={isDeafened}
                    isCameraOn={hasCamera}
                    isScreenSharing={isScreenSharing}
                    isServerMuted={isSpaceMuted}
                    isServerDeafened={isSpaceDeafened}
                    isPermissionMuted={isPermissionMuted}
                    isLocallyMuted={userId !== user?.id && (participantMutes.get(userId) ?? false)}
                    isSpeaking={speakingUserIds.has(userId)}
                    size="compact"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full">
      {/* Space strip */}
      <div className="w-[60px] shrink-0 bg-surface-channel flex flex-col items-center px-2.5 pt-2.5 pb-4 gap-2 overflow-y-auto no-scrollbar">
        {/* Home / DMs button */}
        <button
          onClick={() => {
            setMobileTab('dms');
            navigate('/channels/@me');
          }}
          className="w-10 h-10 shrink-0 rounded-xl bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] flex items-center justify-center text-accent-tone hover:bg-border-soft transition-colors duration-fast"
        >
          <Icon name="message-circle" size="lg" />
        </button>

        {/* Groups are separated by spacing, not by rules. */}
        <div className="h-1 shrink-0" aria-hidden="true" />

        {/* Space icons (folder-aware) */}
        {resolvedLayout.map((item) => {
          if (item.type === 'folder') {
            const folder = item.folder;
            const hasUnread = item.spaces.some(s => spaceHasUnread(s.id));
            const isSelected = item.spaces.some(s => s.id === selectedSpaceId);
            return (
              <div key={`folder-${folder.id}`} className="relative">
                <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1 flex items-center">
                  <div className={`bg-txt-primary rounded-r-full transition-all duration-base ease-out w-full ${
                    isSelected ? 'h-8' : hasUnread ? 'h-2' : 'h-0'
                  }`} />
                </div>
                <button
                  onClick={() => setOpenFolderId(folder.id)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-shadow duration-fast bg-surface-elevated text-txt-secondary ${
                    isSelected ? 'ring-2 ring-accent-tone' : ''
                  }`}
                >
                  {/* The folder's own colour is user content. */}
                  <span className="flex" style={folder.color ? { color: folder.color } : undefined}>
                    <Icon name="folder" size="lg" />
                  </span>
                </button>
              </div>
            );
          }

          // Standalone space — full space icon rendering with federation badge and context menu
          const space = item.space;
          const isSelected = space.id === selectedSpaceId;
          const hasUnread = spaceHasUnread(space.id);
          const iconUrl = space.icon
            ? (space.icon.startsWith('http') || space.icon.startsWith('/')
                ? space.icon
                : `/api/uploads/${space.icon}`)
            : null;
          const grad = getSpaceGradient(space.id, space.name, space.avatarColor);

          return (
            <div key={space.id} className="relative">
              {/* Unread / selected pill */}
              <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1 flex items-center">
                <div
                  className={`bg-txt-primary rounded-r-full transition-all duration-base ease-out w-full ${
                    isSelected ? 'h-8' : hasUnread ? 'h-2' : 'h-0'
                  }`}
                />
              </div>
              <button
                data-context-menu
                onClick={() => handleSpaceSelect(space.id)}
                onContextMenu={(e) => handleSpaceContextMenu(e, space.id)}
                className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center transition-shadow duration-fast ${
                  isSelected ? 'ring-2 ring-accent-tone' : ''
                }`}
                style={!iconUrl ? { background: grad.gradient } : undefined}
              >
                {iconUrl ? (
                  <img src={iconUrl} alt={space.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-white">
                    {space.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
              {(() => {
                const origin = (space as TaggedSpace)._instanceOrigin;
                if (!origin) return null;
                const instances = useInstanceStore.getState().instances;
                const inst = instances.find(i => i.origin === origin);
                const isDisconnected = inst ? inst.status !== 'connected' : false;
                return (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-channel flex items-center justify-center">
                    {isDisconnected ? (
                      <div className="w-2 h-2 rounded-full bg-status-warn" />
                    ) : (
                      <Icon name="globe" size="xs" className="w-2.5 h-2.5 text-txt-tertiary" />
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}

        <div className="h-1 shrink-0" aria-hidden="true" />

        {/* Add space button */}
        <button
          onClick={() => setShowAddSheet(true)}
          className="w-10 h-10 shrink-0 rounded-xl bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-border-soft transition-colors duration-fast"
        >
          <Icon name="plus" size="lg" />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-channel">
        {/* Space header */}
        {selectedSpace && (
          <header className="h-12 flex items-center gap-1 pl-4 pr-1 border-b border-border-hard shrink-0">
            <h1 className="flex-1 text-sm font-semibold text-txt-primary truncate">
              {selectedSpace.name}
            </h1>
            {canInvite && (
              <IconButton
                icon="user-plus"
                label={t('common:actions.invitePeople')}
                size="lg"
                className="h-11 w-11"
                onClick={() => openModal('invite', { spaceId: selectedSpaceId })}
              />
            )}
            {canManageSpace && (
              <IconButton
                icon="settings"
                label={t('common:labels.settings')}
                size="lg"
                className="h-11 w-11"
                onClick={() => openModal('spaceSettings', { spaceId: selectedSpaceId })}
              />
            )}
          </header>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {showChannelSkeleton ? (
            <div className="px-1 pt-1" role="status" aria-label={t('spaces:channels.loading')}>
              {/* Uncategorized group — 3 channel rows. Sized to match the real
                  channel rows (`px-3 py-2 rounded-lg` with `text-sm`/`w-4 h-4`
                  icon → ~36px height per row). */}
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={`u-${i}`}
                  className="flex items-center gap-2 px-3 py-2 mb-1"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div
                    className="skeleton w-4 h-4 rounded-sm flex-shrink-0"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                  <div
                    className="skeleton skeleton-bar flex-1"
                    style={{ width: `${50 + (i * 17) % 30}%`, animationDelay: `${i * 0.1}s` }}
                  />
                </div>
              ))}
              {/* Category group */}
              <div className="mt-4">
                <div
                  className="skeleton skeleton-bar h-2 w-[42%] ml-1 mb-2"
                  style={{ animationDelay: '0.3s' }}
                />
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={`c-${i}`}
                    className="flex items-center gap-2 px-3 py-2 mb-1"
                    style={{ animationDelay: `${(i + 3) * 0.1}s` }}
                  >
                    <div
                      className="skeleton w-4 h-4 rounded-sm flex-shrink-0"
                      style={{ animationDelay: `${(i + 3) * 0.1}s` }}
                    />
                    <div
                      className="skeleton skeleton-bar flex-1"
                      style={{ width: `${45 + (i * 13) % 35}%`, animationDelay: `${(i + 3) * 0.1}s` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Uncategorized channels */}
              {uncategorizedChannels.map(renderChannelItem)}

              {/* Categorized channels */}
              {sortedCategories.map(category => {
                const catChannels = channelsByCategory.get(category.id) || [];
                if (catChannels.length === 0) return null;
                const isCollapsed = collapsedCategories.has(category.id);

                return (
                  <div key={category.id} className="pt-2 space-y-0.5">
                    <button
                      data-context-menu
                      onClick={() => toggleCategory(category.id)}
                      onContextMenu={(e) => handleCategoryContextMenu(e, category.id)}
                      className="flex items-center gap-1 px-1 min-h-11 w-full text-left text-txt-tertiary hover:text-txt-secondary transition-colors duration-fast"
                    >
                      <span className={`flex transition-transform duration-base ease-out ${isCollapsed ? '' : 'rotate-90'}`}>
                        <Icon name="chevron-right" size="xs" />
                      </span>
                      <span className="text-xs font-medium truncate">
                        {category.name}
                      </span>
                    </button>
                    {!isCollapsed && catChannels.map(renderChannelItem)}
                  </div>
                );
              })}

              {/* Empty state — gated on settled (not loading) so the mascot
                  never flashes during the pre-skeleton load window. */}
              {isSpaceSettledEmpty && (
                <div className="flex flex-col items-center justify-center h-32 opacity-80">
                  <Mascot state="idle" className="w-20 h-20 mb-2" />
                  <p className="text-txt-tertiary text-sm">{t('spaces:channels.empty')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Space bottom sheet */}
      {showAddSheet && (
        <>
          <div className="fixed inset-0 z-modal bg-surface-overlay" onClick={() => setShowAddSheet(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-modal rounded-t-2xl glass-modal animate-slide-up-sheet"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="w-10 h-1 bg-txt-tertiary/30 rounded-full mx-auto mt-2 mb-1" />
            <div className="px-2 py-2">
              <button
                onClick={() => { setShowAddSheet(false); openModal('createSpace'); }}
                className="w-full min-h-12 flex items-center gap-3 px-3 rounded-lg text-left hover:bg-interactive-hover active:bg-interactive-active transition-colors duration-fast"
              >
                <Icon name="plus" size="lg" className="text-txt-secondary" />
                <span className="text-sm text-txt-primary">{t('spaces:mobile.addSheet.createSpace')}</span>
              </button>
              <button
                onClick={() => { setShowAddSheet(false); openModal('joinSpace'); }}
                className="w-full min-h-12 flex items-center gap-3 px-3 rounded-lg text-left hover:bg-interactive-hover active:bg-interactive-active transition-colors duration-fast"
              >
                <Icon name="external-link" size="lg" className="text-txt-secondary" />
                <span className="text-sm text-txt-primary">{t('spaces:mobile.addSheet.joinSpace')}</span>
              </button>
              <button
                onClick={() => { setShowAddSheet(false); pushMobileScreen('explore'); }}
                className="w-full min-h-12 flex items-center gap-3 px-3 rounded-lg text-left hover:bg-interactive-hover active:bg-interactive-active transition-colors duration-fast"
              >
                <Icon name="compass" size="lg" className="text-txt-secondary" />
                <span className="text-sm text-txt-primary">{t('spaces:mobile.addSheet.exploreSpaces')}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Confirmation dialogs */}
      {leaveConfirmSpaceId && (
        <ConfirmDialog
          isOpen={true}
          title={t('spaces:sidebar.space.leaveConfirm.title')}
          description={t('spaces:sidebar.space.leaveConfirm.description')}
          confirmLabel={t('common:actions.leave')}
          variant="danger"
          onConfirm={async () => {
            try {
              await useSpaceStore.getState().leaveSpace(leaveConfirmSpaceId);
              if (selectedSpaceId === leaveConfirmSpaceId) setSelectedSpaceId(null);
              addToast(t('spaces:sidebar.space.left'), 'success', 3000);
            } catch {
              addToast(t('spaces:sidebar.space.leaveFailed'), 'warning', 3000);
            }
            setLeaveConfirmSpaceId(null);
          }}
          onClose={() => setLeaveConfirmSpaceId(null)}
        />
      )}

      {deleteChannelId && (
        <ConfirmDialog
          isOpen={true}
          title={t('spaces:channels.deleteConfirm.title')}
          description={t('spaces:channels.deleteConfirm.description')}
          confirmLabel={t('common:actions.delete')}
          variant="danger"
          onConfirm={async () => {
            try {
              await useSpaceStore.getState().deleteChannel(deleteChannelId);
              addToast(t('spaces:channels.deleted'), 'success', 3000);
            } catch {
              addToast(t('spaces:channels.deleteFailed'), 'warning', 3000);
            }
            setDeleteChannelId(null);
          }}
          onClose={() => setDeleteChannelId(null)}
        />
      )}

      {deleteCategoryId && (
        <ConfirmDialog
          isOpen={true}
          title={t('spaces:channels.deleteCategoryConfirm.title')}
          description={t('spaces:channels.deleteCategoryConfirm.description')}
          confirmLabel={t('common:actions.delete')}
          variant="danger"
          onConfirm={async () => {
            try {
              await useSpaceStore.getState().deleteCategory(deleteCategoryId);
              addToast(t('spaces:channels.categoryDeleted'), 'success', 3000);
            } catch {
              addToast(t('spaces:channels.categoryDeleteFailed'), 'warning', 3000);
            }
            setDeleteCategoryId(null);
          }}
          onClose={() => setDeleteCategoryId(null)}
        />
      )}

      {transferModalSpaceId && (
        <TransferOwnershipModal
          spaceId={transferModalSpaceId}
          onClose={() => setTransferModalSpaceId(null)}
        />
      )}

      {notificationTarget && (
        <NotificationSettingsModal
          target={notificationTarget}
          onClose={() => setNotificationTarget(null)}
        />
      )}

      {openFolderId && (() => {
        const folder = folders.find(f => f.id === openFolderId);
        if (!folder) return null;
        return (
          <MobileFolderSheet
            folder={folder}
            onClose={() => setOpenFolderId(null)}
            onSelectSpace={(spaceId) => {
              handleSpaceSelect(spaceId);
            }}
            onUpdateFolder={handleUpdateFolder}
            onUngroup={handleUngroup}
          />
        );
      })()}

      {voiceJoinChannelId && selectedSpaceId && (
        <MobileVoiceJoinSheet
          channelId={voiceJoinChannelId}
          channelName={channels.find(c => c.id === voiceJoinChannelId)?.name || ''}
          spaceId={selectedSpaceId}
          onClose={() => setVoiceJoinChannelId(null)}
          onJoin={handleVoiceJoin}
        />
      )}
    </div>
  );
}

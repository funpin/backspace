import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Channel, User } from '@backspace/shared';
import { useSpaceStore, getChannelOrigin, getMyUserIdForOrigin } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useShownStatus } from '../../hooks/useShownStatus';
import { useInstanceStore } from '../../stores/instanceStore';
import { VoiceChannel } from '../voice/VoiceChannel';
import { VoiceControls } from '../voice/VoiceControls';
import { useVoiceStore } from '../../stores/voiceStore';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Mascot } from '../ui/Mascot';
import { wsSend } from '../../hooks/useWebSocket';
import { AudioManager } from '../../audio/AudioManager';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import { viewerCanActOn } from '../../utils/roleHierarchy';
import { joinVoiceChannel, broadcastVoiceStatus, broadcastDeafenViaLiveKit } from '../../utils/voice';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DmSearchBar } from './DmSearchBar';
import { DmListItem } from './DmListItem';
import { useDragManager, type DropTarget, type LayoutItem } from '../../hooks/useDragManager';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { useAudioDevices } from '../../hooks/useAudioDevices';
import { useInstanceUpdateBadge } from '../../hooks/useInstanceUpdateBadge';
import { useHubUpdateState } from '../../hooks/useHubUpdateState';
import { activeHomeNavItem } from '../../utils/homeNav';
import { BackspaceMark } from '../projectHub/BackspaceMark';
import { HubUpdateDot } from '../projectHub/HubUpdateDot';
import { DropdownItem } from '../modals/settingsPanels/_shared/SettingsPickerPrimitives';
import type { UserSettingsTab } from '../modals/UserSettings';
import { ChannelMutedIndicator } from '../notifications/ChannelMutedIndicator';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/Tag';

/** A row of the DM home list (Friends, Explore, Backspace): 34px, like a channel row. */
const HOME_ROW = 'flex items-center gap-2 px-2 h-[34px] rounded-lg cursor-pointer mb-0.5 text-sm transition-colors duration-fast';
const HOME_ROW_SELECTED = 'bg-interactive-selected text-txt-primary font-medium';
const HOME_ROW_IDLE = 'text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary';

export function ChannelSidebar() {
  const { t } = useTranslation(['spaces', 'common', 'project']);
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const loadingSpaceId = useSpaceStore((s) => s.loadingSpaceId);
  const channels = useSpaceStore((s) => s.channels);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);
  const unreadChannels = useChatStore((s) => s.unreadChannels);
  const openModal = useUIStore((s) => s.openModal);
  const user = useAuthStore((s) => s.user);
  const members = useSpaceStore((s) => s.members);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const activeDmCall = useVoiceStore((s) => s.activeDmCall);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const toggleMic = useVoiceStore((s) => s.toggleMic);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const spaceId = useSpaceStore((s) => currentVoiceChannelId ? s.channelToSpaceMap.get(currentVoiceChannelId) : null);
  const myOriginId = useSpaceStore((s) => currentVoiceChannelId ? getMyUserIdForOrigin(getChannelOrigin(currentVoiceChannelId)) : s.members.find(m => m.userId === user?.id)?.userId ?? user?.id);
  const spaceMutedUserIds = useVoiceStore((s) => s.spaceMutedUserIds);
  const spaceDeafenedUserIds = useVoiceStore((s) => s.spaceDeafenedUserIds);
  const permissionMutedUserIds = useVoiceStore((s) => s.permissionMutedUserIds);

  const isSpaceMuted = !!(myOriginId && spaceId && spaceMutedUserIds.has(`${spaceId}:${myOriginId}`));
  const isSpaceDeafened = !!(myOriginId && spaceId && spaceDeafenedUserIds.has(`${spaceId}:${myOriginId}`));
  const isPermissionMuted = !!(myOriginId && spaceId && permissionMutedUserIds.has(`${spaceId}:${myOriginId}`));
  const navigate = useNavigate();
  const location = useLocation();
  const activeHomeItem = activeHomeNavItem(location.pathname, currentChannelId);
  const hubUpdate = useHubUpdateState();

  const [floatingPanelEl, setFloatingPanelEl] = useState<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const floatingPanelHeight = useUIStore((s) => s.floatingPanelHeight);
  const setFloatingPanelHeight = useUIStore((s) => s.setFloatingPanelHeight);

  useEffect(() => {
    if (!floatingPanelEl) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setFloatingPanelHeight(entry.contentRect.height);
    });
    ro.observe(floatingPanelEl);
    return () => ro.disconnect();
  }, [floatingPanelEl, setFloatingPanelHeight]);

  const handleMicToggle = async () => {
    if (isSpaceMuted || isSpaceDeafened || isPermissionMuted) return;
    const wasDeafened = useVoiceStore.getState().isDeafened;
    toggleMic();
    broadcastVoiceStatus();
    // If unmuting while deafened cleared deafen, broadcast via LiveKit data channel
    if (wasDeafened && !useVoiceStore.getState().isDeafened) {
      broadcastDeafenViaLiveKit();
    }
  };

  const handleDeafenToggle = async () => {
    if (isSpaceDeafened) return;
    toggleDeafen();
    broadcastVoiceStatus();
    broadcastDeafenViaLiveKit();
  };

  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const space = spaces.find(s => s.id === currentSpaceId);
  const mySpacePerms = currentSpaceId ? spacePermissions.get(currentSpaceId) : undefined;
  const isLoadingSpace = !!loadingSpaceId && loadingSpaceId === currentSpaceId;
  const showChannelSkeleton = useDelayedLoading(isLoadingSpace);

  const federationInstances = useInstanceStore((s) => s.instances);
  const instanceLabel = useMemo(() => {
    const origin = space?._instanceOrigin;
    if (!origin) return null;
    const inst = federationInstances.find(i => i.origin === origin);
    if (inst) return inst.label;
    try { return new URL(origin).host; } catch { return origin; }
  }, [space, federationInstances]);
  const channelPermissions = useSpaceStore((s) => s.channelPermissions);
  const canManageChannels = hasPermissionBit(mySpacePerms, PermissionBits.MANAGE_CHANNELS);
  const canCreateInvite = hasPermissionBit(mySpacePerms, PermissionBits.CREATE_INVITE);
  const categories = useSpaceStore((s) => s.categories);

  // Delete category confirmation state
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deleteCategoryLoading, setDeleteCategoryLoading] = useState(false);
  const [leaveGroupDmId, setLeaveGroupDmId] = useState<string | null>(null);
  const [leaveGroupDmLoading, setLeaveGroupDmLoading] = useState(false);

  // Centralized context menu
  const openContextMenu = useContextMenuStore((s) => s.open);

  // Collapse state — persisted in localStorage
  const collapseKey = `backspace:collapsed-categories:${currentSpaceId}`;
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(collapseKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapse = useCallback((categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [collapseKey]);

  // Filter channels by VIEW_CHANNEL (defense-in-depth — server already filters,
  // but this catches transient races where channels and permissions are briefly out of sync)
  const visibleChannels = useMemo(() =>
    channels.filter(ch => hasPermissionBit(channelPermissions.get(ch.id), PermissionBits.VIEW_CHANNEL)),
    [channels, channelPermissions]);

  // Group channels by category
  const sortedCategories = useMemo(() =>
    [...categories].sort((a, b) => a.position - b.position), [categories]);
  const uncategorizedChannels = useMemo(() =>
    visibleChannels.filter(c => !c.categoryId).sort((a, b) => a.position - b.position), [visibleChannels]);
  const channelsByCategory = useMemo(() => {
    const map = new Map<string, typeof channels>();
    for (const ch of visibleChannels) {
      if (!ch.categoryId) continue;
      let arr = map.get(ch.categoryId);
      if (!arr) { arr = []; map.set(ch.categoryId, arr); }
      arr.push(ch);
    }
    for (const [key, arr] of map) {
      map.set(key, arr.sort((a, b) => a.position - b.position));
    }
    return map;
  }, [visibleChannels]);

  // Check if a collapsed category has unread channels
  const categoryHasUnread = useCallback((categoryId: string) => {
    const chs = channelsByCategory.get(categoryId) ?? [];
    return chs.some(ch => unreadChannels.has(ch.id));
  }, [channelsByCategory, unreadChannels]);

  // --- Centralized drag-and-drop ---

  // Flat ordered list matching visual sidebar order — used by useDragManager
  // to normalize 'before B' into 'after A' for a single drop indicator line
  const orderedItems = useMemo<LayoutItem[]>(() => {
    const items: LayoutItem[] = [];
    for (const ch of uncategorizedChannels) {
      items.push({ id: ch.id, type: 'channel' });
    }
    for (const cat of sortedCategories) {
      items.push({ id: cat.id, type: 'category' });
      const catChs = channelsByCategory.get(cat.id) ?? [];
      if (!collapsedCategories.has(cat.id)) {
        for (const ch of catChs) {
          items.push({ id: ch.id, type: 'channel' });
        }
      }
    }
    return items;
  }, [uncategorizedChannels, sortedCategories, channelsByCategory, collapsedCategories]);

  // MOVE_MEMBERS on the channel the user is leaving, and a user ranked below
  // the viewer (permissions.md, "Role hierarchy"); the server checks both.
  const canMoveMember = useCallback(
    (userId: string, channelId: string) => {
      if (!hasPermissionBit(channelPermissions.get(channelId), PermissionBits.MOVE_MEMBERS)) return false;
      const target = members.find((m) => m.userId === userId);
      return !space || !target || viewerCanActOn(space, members, target);
    },
    [channelPermissions, members, space],
  );

  const handleChannelDrop = useCallback((dragId: string, target: DropTarget) => {
    if (!currentSpaceId) return;

    const allChannelsCopy = channels.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));

    if (target.targetType === 'channel') {
      const targetCh = channels.find(c => c.id === target.targetId);
      if (targetCh) {
        const dragCh = allChannelsCopy.find(c => c.id === dragId);
        if (dragCh) dragCh.categoryId = targetCh.categoryId;
      }
    } else if (target.targetType === 'category') {
      const dragCh = allChannelsCopy.find(c => c.id === dragId);
      if (dragCh) dragCh.categoryId = target.targetId;
    }

    const grouped = new Map<string | null, typeof allChannelsCopy>();
    for (const ch of allChannelsCopy) {
      let arr = grouped.get(ch.categoryId);
      if (!arr) { arr = []; grouped.set(ch.categoryId, arr); }
      arr.push(ch);
    }

    for (const [, arr] of grouped) {
      arr.sort((a, b) => a.position - b.position);
      const dragIdx = arr.findIndex(c => c.id === dragId);
      if (dragIdx === -1) continue;
      const dragItem = arr[dragIdx]!;
      arr.splice(dragIdx, 1);

      if (target.targetType === 'channel') {
        const targetIdx = arr.findIndex(c => c.id === target.targetId);
        if (targetIdx !== -1) {
          const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1;
          arr.splice(insertIdx, 0, dragItem);
        } else {
          arr.push(dragItem);
        }
      } else {
        arr.unshift(dragItem);
      }
      arr.forEach((ch, i) => { ch.position = i; });
    }

    const channelUpdates = allChannelsCopy.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));
    const categoryUpdates = sortedCategories.map(c => ({
      id: c.id,
      position: c.position,
    }));

    useSpaceStore.getState().setChannels(
      channels.map(ch => {
        const update = channelUpdates.find(u => u.id === ch.id);
        if (update) return { ...ch, position: update.position, categoryId: update.categoryId };
        return ch;
      }).sort((a, b) => a.position - b.position)
    );
    useSpaceStore.getState().updateChannelLayout(currentSpaceId, { channels: channelUpdates, categories: categoryUpdates });
  }, [channels, sortedCategories, currentSpaceId]);

  const handleCategoryDrop = useCallback((dragId: string, target: DropTarget) => {
    if (!currentSpaceId) return;

    const catsCopy = sortedCategories.map(c => ({ id: c.id, position: c.position }));
    const dragIdx = catsCopy.findIndex(c => c.id === dragId);
    if (dragIdx === -1) return;

    const dragItem = catsCopy[dragIdx]!;
    catsCopy.splice(dragIdx, 1);
    const targetIdx = catsCopy.findIndex(c => c.id === target.targetId);
    if (targetIdx !== -1) {
      const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1;
      catsCopy.splice(insertIdx, 0, dragItem);
    } else {
      catsCopy.push(dragItem);
    }
    catsCopy.forEach((c, i) => { c.position = i; });

    const channelUpdates = channels.map(ch => ({
      id: ch.id,
      position: ch.position,
      categoryId: ch.categoryId,
    }));

    useSpaceStore.getState().setCategories(
      categories.map(cat => {
        const update = catsCopy.find(u => u.id === cat.id);
        if (update) return { ...cat, position: update.position };
        return cat;
      }).sort((a, b) => a.position - b.position)
    );
    useSpaceStore.getState().updateChannelLayout(currentSpaceId, { channels: channelUpdates, categories: catsCopy });
  }, [sortedCategories, categories, channels, currentSpaceId]);

  const handleVoiceUserDrop = useCallback((userId: string, fromChannelId: string, toChannelId: string) => {
    const voiceOrigin = getChannelOrigin(fromChannelId);
    wsSend({ type: 'voice_move', userId, targetChannelId: toChannelId }, voiceOrigin);
  }, []);

  const {
    activeDrag, dropTarget,
    channelHandlers, categoryHandlers,
    voiceUserHandlers, voiceChannelDropZone,
    containerHandlers,
  } = useDragManager({
    scrollContainerRef,
    canManage: canManageChannels,
    canMoveMember,
    orderedItems,
    onChannelDrop: handleChannelDrop,
    onCategoryDrop: handleCategoryDrop,
    onVoiceUserDrop: handleVoiceUserDrop,
  });

  const handleSidebarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [];
    if (canManageChannels) {
      items.push({
        key: 'create-channel',
        type: 'action',
        label: t('spaces:channels.create'),
        icon: <Icon name="hash" size="sm" />,
        onClick: () => openModal('createChannel'),
      });
      items.push({
        key: 'create-category',
        type: 'action',
        label: t('spaces:channels.createCategory'),
        icon: <Icon name="folder-plus" size="sm" />,
        onClick: () => openModal('createCategory'),
      });
    }
    if (canCreateInvite) {
      items.push({
        key: 'invite',
        type: 'action',
        label: t('common:actions.invitePeople'),
        icon: <Icon name="user-plus" size="sm" />,
        onClick: () => openModal('invite'),
      });
    }
    items.push({
      key: 'settings',
      type: 'action',
      label: t('spaces:sidebar.space.settings'),
      icon: <Icon name="settings" size="sm" />,
      onClick: () => openModal('spaceSettings'),
    });
    openContextMenu({ x: e.clientX, y: e.clientY }, items);
  }, [canManageChannels, canCreateInvite, openModal, openContextMenu, t]);

  const handleDmContextMenu = useCallback((e: React.MouseEvent, dmId: string) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        key: 'leave-group',
        type: 'action',
        label: t('spaces:sidebar.dmList.leaveGroup'),
        danger: true,
        icon: <Icon name="log-out" size="sm" />,
        onClick: () => {
          setLeaveGroupDmId(dmId);
        },
      },
    ]);
  }, [openContextMenu, t]);

  const handleChannelClick = (channelId: string) => {
    setCurrentChannel(channelId);
    navigate(`/channels/${currentSpaceId || '@me'}/${channelId}`);
  };

  const handleHomeClick = () => {
    setCurrentChannel(null);
    navigate('/channels/@me');
  };

  const handleVoiceJoin = (channelId: string) => {
    // Don't re-join the same channel — prevents duplicate LiveKit connections.
    // A dropped session is the exception: the channel ID is kept so the user
    // can resume, so this click has to reach joinVoiceChannel to reconnect.
    if (currentVoiceChannelId === channelId
        && useVoiceStore.getState().voiceConnectionStatus !== 'disconnected') {
      navigate(`/channels/${currentSpaceId}/${channelId}`);
      return;
    }
    const connectFn = useVoiceStore.getState().connectFn;
    joinVoiceChannel(channelId, connectFn ?? undefined);
    navigate(`/channels/${currentSpaceId}/${channelId}`);
  };

  // Floating bottom panel — shared between DM view and server view
  const floatingPanel = user ? (
    // One floating card at the bottom-left, 8px from the edges, spanning the
    // space strip and the channel list (60 + 244 - 2 x 8 = 288px). The voice
    // block is its top row while a call is up.
    <div ref={setFloatingPanelEl} data-pip-obstacle="bottom" className="fixed bottom-2 left-2 right-2 z-float desktop:right-auto desktop:w-[288px]">
      <div className="glass-bubble rounded-xl">
        {/* Voice controls (expands when connected) */}
        {(currentVoiceChannelId || activeDmCall) && <VoiceControls />}
        {/* Separator between voice and user area */}
        {(currentVoiceChannelId || activeDmCall) && <div className="border-t border-border-hard" />}
        {/* User area (always visible) */}
        <UserAreaPanel
          user={user}
          isMuted={isMuted}
          isDeafened={isDeafened}
          isSpaceMuted={isSpaceMuted}
          isSpaceDeafened={isSpaceDeafened}
          isPermissionMuted={isPermissionMuted}
          onMicToggle={handleMicToggle}
          onDeafenToggle={handleDeafenToggle}
          onSettingsClick={(tab) => openModal('userSettings', tab ? { tab } : {})}
        />
      </div>
    </div>
  ) : null;

  if (!space) {
    return (
      <>
      <div className="w-[244px] bg-surface-channel flex flex-col flex-shrink-0 min-w-0 select-none border-r border-border-hard">
        <div className="h-12 px-2.5 flex items-center border-b border-border-hard flex-shrink-0">
          <DmSearchBar />
        </div>
        <div className="flex-1 overflow-y-auto pt-2 px-2 no-scrollbar" style={{ paddingBottom: floatingPanelHeight + 16 }}>
          <div
            onClick={handleHomeClick}
            className={`${HOME_ROW} ${activeHomeItem === 'friends' ? HOME_ROW_SELECTED : HOME_ROW_IDLE}`}
          >
            <Icon name="users" />
            <span>{t('common:labels.friends')}</span>
          </div>

          <div
            onClick={() => navigate('/explore')}
            className={`${HOME_ROW} ${activeHomeItem === 'explore' ? HOME_ROW_SELECTED : HOME_ROW_IDLE}`}
          >
            <Icon name="compass" />
            <span>{t('spaces:sidebar.dmList.explore')}</span>
          </div>

          <div
            onClick={() => navigate('/backspace')}
            className={`${HOME_ROW} ${activeHomeItem === 'backspace' ? HOME_ROW_SELECTED : HOME_ROW_IDLE}`}
          >
            <BackspaceMark size={18} className={`flex-shrink-0 ${activeHomeItem === 'backspace' ? 'text-accent-tone' : ''}`} />
            <span>{t('project:nav.label')}</span>
            {hubUpdate.state === 'updated' && <HubUpdateDot className="ml-auto" />}
          </div>

          <div className="mt-3 pl-2 pr-1 pb-1 flex items-center justify-between group">
            <span className="text-xs font-medium text-txt-tertiary">{t('spaces:sidebar.directMessages')}</span>
            <button
              onClick={() => openModal('newDm')}
              className="w-6 h-6 rounded grid place-items-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast"
              title={t('spaces:sidebar.dmList.newDm')}
            >
              <Icon name="plus" size="sm" />
            </button>
          </div>

          <div className="space-y-0.5">
            {dmChannels.map((dm) => (
              <DmListItem
                key={dm.id}
                dm={dm}
                isActive={currentChannelId === dm.id}
                isUnread={unreadChannels.has(dm.id) && currentChannelId !== dm.id}
                user={user!}
                onSelect={handleChannelClick}
                onClose={(id) => {
                  if (currentChannelId === id) {
                    navigate('/channels/@me');
                    setCurrentChannel(null);
                  }
                  useSpaceStore.getState().closeDm(id);
                }}
                onLeave={(id) => setLeaveGroupDmId(id)}
                onContextMenu={handleDmContextMenu}
              />
            ))}
            {dmChannels.length === 0 && (
              <div className="flex flex-col items-center py-6 opacity-80">
                <Mascot state="sleeping" className="w-20 h-20 mb-2" />
                <p className="text-compact text-txt-tertiary">{t('spaces:sidebar.dmList.empty')}</p>
              </div>
            )}
          </div>
        </div>

      </div>
      {floatingPanel}
      <ConfirmDialog
        isOpen={leaveGroupDmId !== null}
        onClose={() => setLeaveGroupDmId(null)}
        onConfirm={async () => {
          if (!leaveGroupDmId) return;
          setLeaveGroupDmLoading(true);
          try {
            if (currentChannelId === leaveGroupDmId) {
              navigate('/channels/@me');
              setCurrentChannel(null);
            }
            await useSpaceStore.getState().leaveDm(leaveGroupDmId);
            setLeaveGroupDmId(null);
          } catch {
            // leaveDm already handles errors
          } finally {
            setLeaveGroupDmLoading(false);
          }
        }}
        title={t('spaces:sidebar.dmList.leaveGroupConfirm.title')}
        description={t('spaces:sidebar.dmList.leaveGroupConfirm.description')}
        confirmLabel={t('common:actions.leave')}
        variant="danger"
        loading={leaveGroupDmLoading}
      />
      </>
    );
  }

  return (
    <>
    <div className="w-[244px] bg-surface-channel flex flex-col flex-shrink-0 min-w-0 select-none border-r border-border-hard">
      {/* Space header */}
      <div className="h-12 flex items-stretch border-b border-border-hard flex-shrink-0 group/header">
        <button
          onClick={() => openModal('spaceSettings')}
          className="flex-1 h-full pl-3.5 pr-2 flex items-center justify-between gap-2 hover:bg-interactive-hover transition-colors duration-fast min-w-0"
        >
          <div className="min-w-0 text-left">
            <span className="font-semibold text-sm text-txt-primary truncate leading-tight block">{space.name}</span>
            {instanceLabel && (
              <span className="text-2xs text-txt-tertiary truncate block leading-tight">
                {instanceLabel}
              </span>
            )}
          </div>
          <Icon name="chevron-down" size="sm" className="text-txt-tertiary" />
        </button>
        {canCreateInvite && (
          <button
            onClick={() => openModal('invite')}
            className="w-10 h-full flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast flex-shrink-0"
            title={t('common:actions.invitePeople')}
          >
            <Icon name="user-plus" />
          </button>
        )}
      </div>

      {/* Channels — dynamic category layout */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-2 px-2 no-scrollbar" style={{ paddingBottom: floatingPanelHeight + 16 }} onDrop={containerHandlers.onDrop} onDragOver={containerHandlers.onDragOver} onContextMenu={handleSidebarContextMenu}>
        {showChannelSkeleton ? (
          <div className="px-2 pt-3" role="status" aria-label={t('spaces:channels.loading')}>
            {/* Category group 1 */}
            <div className="skeleton skeleton-bar h-2 w-[45%] ml-2 mb-3" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 h-[34px]" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="skeleton w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ animationDelay: `${i * 0.1}s` }} />
                <div className="skeleton skeleton-bar flex-1" style={{ width: `${55 + (i * 17) % 25}%`, animationDelay: `${i * 0.1}s` }} />
              </div>
            ))}
            {/* Category group 2 */}
            <div className="skeleton skeleton-bar h-2 w-[55%] ml-2 mb-3 mt-5" style={{ animationDelay: '0.3s' }} />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 h-[34px]" style={{ animationDelay: `${(i + 3) * 0.1}s` }}>
                <div className="skeleton w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ animationDelay: `${(i + 3) * 0.1}s` }} />
                <div className="skeleton skeleton-bar flex-1" style={{ width: `${50 + (i * 13) % 30}%`, animationDelay: `${(i + 3) * 0.1}s` }} />
              </div>
            ))}
          </div>
        ) : (<>
        {/* Uncategorized channels */}
        {uncategorizedChannels.length > 0 && (
          <div className="mb-3">
            {canManageChannels && sortedCategories.length === 0 && (
              <div className="flex items-center justify-end px-1 mb-1">
                <button
                  onClick={() => openModal('createChannel')}
                  className="w-6 h-6 rounded grid place-items-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast"
                  title={t('spaces:channels.create')}
                >
                  <Icon name="plus" size="sm" />
                </button>
              </div>
            )}
            <div className="space-y-0.5">
              {uncategorizedChannels.map((channel) => (
                <ChannelItem
                  key={channel.id}
                  channel={channel}
                  isActive={currentChannelId === channel.id}
                  isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                  isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                  dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                  onChannelClick={channel.type === 'voice' ? (() => {
                    const chPerms = channelPermissions.get(channel.id);
                    const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                    if (canConnect) handleVoiceJoin(channel.id);
                  }) : (() => handleChannelClick(channel.id))}
                  onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                  channelDragHandlers={channelHandlers(channel.id)}
                  voiceUserHandlers={voiceUserHandlers}
                  voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                  channelPermissions={channelPermissions}
                  handleVoiceJoin={handleVoiceJoin}
                />
              ))}
            </div>
          </div>
        )}

        {/* Categories with their channels */}
        {sortedCategories.map((category) => {
          const catChannels = channelsByCategory.get(category.id) ?? [];

          // Hide empty categories for users without MANAGE_CHANNELS permission
          if (!canManageChannels && catChannels.length === 0) return null;

          const isCollapsed = collapsedCategories.has(category.id);
          const hasUnread = isCollapsed && categoryHasUnread(category.id);

          const categoryHeader = (
                <div
                  className={`flex items-center justify-between pl-2 pr-1 pt-1 pb-1 group cursor-pointer ${
                    activeDrag?.type === 'category' && activeDrag.dragId === category.id ? 'opacity-50' : ''
                  } ${dropTarget?.targetId === category.id && dropTarget.targetType === 'category' ? 'ring-1 ring-accent-tone/40 rounded' : ''}`}
                  {...categoryHandlers(category.id)}
                  onClick={() => toggleCollapse(category.id)}
                >
                  <div className="flex items-center gap-1 text-txt-tertiary hover:text-txt-secondary transition-colors duration-fast min-w-0">
                    <Icon name="chevron-down" size="xs" className={`transition-transform duration-fast ${isCollapsed ? '-rotate-90' : ''}`} />
                    <span className="text-xs font-medium truncate">{category.name}</span>
                    {category.isPrivate && (
                      <Icon name="lock" size="xs" />
                    )}
                    {hasUnread && (
                      <Badge className="ml-1 flex-shrink-0" />
                    )}
                  </div>
                  {canManageChannels && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('createChannel', { categoryId: category.id });
                      }}
                      className="w-6 h-6 rounded grid place-items-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title={t('spaces:channels.create')}
                    >
                      <Icon name="plus" size="sm" />
                    </button>
                  )}
                </div>
          );

          return (
            <div key={category.id} className="mb-3">
              {/* Category header */}
              {canManageChannels ? (
                <div onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openContextMenu({ x: e.clientX, y: e.clientY }, [
                    {
                      key: 'category-settings',
                      type: 'action',
                      label: t('spaces:channels.categorySettings'),
                      icon: <Icon name="settings" size="sm" />,
                      onClick: () => openModal('categorySettings', { categoryId: category.id }),
                    },
                    {
                      key: 'delete-category',
                      type: 'action',
                      label: t('spaces:channels.deleteCategory'),
                      danger: true,
                      icon: <Icon name="trash-2" size="sm" />,
                      onClick: () => setDeleteCategoryId(category.id),
                    },
                  ]);
                }}>
                  {categoryHeader}
                </div>
              ) : categoryHeader}

              {/* Category channels (hidden when collapsed, unless active) */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {catChannels.map((channel) => (
                    <ChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={currentChannelId === channel.id}
                      isUnread={unreadChannels.has(channel.id) && currentChannelId !== channel.id}
                      isDragging={activeDrag?.type === 'channel' && activeDrag.dragId === channel.id}
                      dropIndicator={dropTarget?.targetId === channel.id ? dropTarget.position : null}
                      onChannelClick={channel.type === 'voice' ? (() => {
                        const chPerms = channelPermissions.get(channel.id);
                        const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
                        if (canConnect) handleVoiceJoin(channel.id);
                      }) : (() => handleChannelClick(channel.id))}
                      onSettingsClick={() => openModal('channelSettings', { channelId: channel.id })}
                      channelDragHandlers={channelHandlers(channel.id)}
                      voiceUserHandlers={voiceUserHandlers}
                      voiceChannelDropZone={voiceChannelDropZone(channel.id)}
                      channelPermissions={channelPermissions}
                      handleVoiceJoin={handleVoiceJoin}
                    />
                  ))}
                  {catChannels.length === 0 && (
                    <div className="px-2 py-2 text-xs text-txt-tertiary italic">{t('spaces:channels.emptyCategory')}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Create channel / category buttons */}
        {canManageChannels && (
          <div className="mt-4 pt-2 border-t border-border-hard space-y-0.5">
            {sortedCategories.length > 0 && (
              <button
                onClick={() => openModal('createChannel')}
                className="w-full flex items-center gap-2 px-2 h-7 rounded-lg text-xs text-txt-tertiary hover:text-txt-secondary hover:bg-interactive-hover transition-colors duration-fast"
              >
                <Icon name="plus" size="xs" />
                <span>{t('spaces:channels.create')}</span>
              </button>
            )}
            <button
              onClick={() => openModal('createCategory')}
              className="w-full flex items-center gap-2 px-2 h-7 rounded-lg text-xs text-txt-tertiary hover:text-txt-secondary hover:bg-interactive-hover transition-colors duration-fast"
            >
              <Icon name="plus" size="xs" />
              <span>{t('spaces:channels.createCategory')}</span>
            </button>
          </div>
        )}
        </>)}

      </div>

    </div>
    {floatingPanel}
    <ConfirmDialog
      isOpen={deleteCategoryId !== null}
      onClose={() => setDeleteCategoryId(null)}
      onConfirm={async () => {
        if (!deleteCategoryId) return;
        setDeleteCategoryLoading(true);
        try {
          await useSpaceStore.getState().deleteCategory(deleteCategoryId);
          setDeleteCategoryId(null);
        } catch {
          // deleteCategory already shows a toast on error
        } finally {
          setDeleteCategoryLoading(false);
        }
      }}
      title={t('spaces:channels.deleteCategoryConfirm.title')}
      description={t('spaces:channels.deleteCategoryConfirm.description')}
      confirmLabel={t('common:actions.delete')}
      variant="danger"
      loading={deleteCategoryLoading}
    />
    </>
  );
}

/* ─── User Area Panel ──────────────────────────────────────────────────────── */

const DEVICE_PANEL = 'absolute bottom-full left-0 right-0 mb-2 z-[1] rounded-xl bg-surface-elevated shadow-glass p-1 animate-slide-up';
const DEVICE_ROW = 'w-full px-2.5 py-2 rounded-lg flex items-center justify-between hover:bg-interactive-hover transition-colors duration-fast';
const VOLUME_SLIDER = 'w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-txt-primary';

/** The filled part of a 0–200 volume slider in the theme's tone. */
function volumeTrack(volume: number): string {
  const fill = volume / 2;
  return `linear-gradient(to right, rgb(var(--accent-tone)) 0%, rgb(var(--accent-tone)) ${fill}%, rgb(var(--interactive-muted)) ${fill}%, rgb(var(--interactive-muted)) 100%)`;
}

function UserAreaPanel({
  user,
  isMuted,
  isDeafened,
  isSpaceMuted,
  isSpaceDeafened,
  isPermissionMuted,
  onMicToggle,
  onDeafenToggle,
  onSettingsClick,
}: {
  user: User;
  isMuted: boolean;
  isDeafened: boolean;
  isSpaceMuted: boolean;
  isSpaceDeafened: boolean;
  isPermissionMuted: boolean;
  onMicToggle: () => void;
  onDeafenToggle: () => void;
  onSettingsClick: (tab?: UserSettingsTab) => void;
}) {
  const { t } = useTranslation(['spaces', 'common', 'admin']);
  const [openPanel, setOpenPanel] = useState<'input' | 'output' | null>(null);
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);
  const updateBadge = useInstanceUpdateBadge();
  const shownStatus = useShownStatus(user, '', user.status);

  // Shared hook drives lists, permission state, and live devicechange refresh.
  const { permState, inputs: inputDevices, outputs: outputDevices, inputLabels, outputLabels, requestPermission } = useAudioDevices();

  const systemDefaultLabel = t('spaces:sidebar.userArea.systemDefault');
  const selectedInputLabel = inputDeviceId === 'default'
    ? systemDefaultLabel
    : inputLabels.get(inputDeviceId) ?? systemDefaultLabel;
  const selectedOutputLabel = outputDeviceId === 'default'
    ? systemDefaultLabel
    : outputLabels.get(outputDeviceId) ?? systemDefaultLabel;

  const inputVolume = useVoiceStore((s) => s.inputVolume);
  const storeSetInputVolume = useVoiceStore((s) => s.setInputVolume);
  const outputVolume = useVoiceStore((s) => s.outputVolume);
  const storeSetOutputVolume = useVoiceStore((s) => s.setOutputVolume);
  const [showInputDeviceList, setShowInputDeviceList] = useState(false);
  const [showOutputDeviceList, setShowOutputDeviceList] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  // Start mic level monitoring when input panel opens
  useEffect(() => {
    if (openPanel !== 'input') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
      setMicLevel(0);
      return;
    }

    const start = async () => {
      try {
        await AudioManager.getInstance().resumeContext();
        const analyser = AudioManager.getInstance().getAnalyserNode();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicLevel(Math.min(avg / 128, 1));
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* no mic access */ }
    };
    start();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
    };
  }, [openPanel]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
        setShowInputDeviceList(false);
        setShowOutputDeviceList(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const togglePanel = (panel: 'input' | 'output') => {
    if (openPanel === panel) {
      setOpenPanel(null);
    } else {
      setOpenPanel(panel);
      setShowInputDeviceList(false);
      setShowOutputDeviceList(false);
      // Resume the AudioContext so the mic-level meter starts measuring on open.
      AudioManager.getInstance().resumeContext();
    }
  };

  const selectInput = (deviceId: string) => {
    setInputDevice(deviceId); // Pure state update → triggers syncMic if in voice call
    AudioManager.getInstance().setInputDevice(deviceId).catch(() => {});
    setShowInputDeviceList(false);
  };

  const selectOutput = (deviceId: string) => {
    setOutputDevice(deviceId);
    AudioManager.getInstance().setOutputDevice(deviceId).catch(() => {});
    setShowOutputDeviceList(false);
  };

  // Generate mic level bars (20 bars like Discord)
  const micBars = 20;
  const activeBars = Math.round(micLevel * micBars * (inputVolume / 100));

  const micBlocked = isSpaceMuted || isSpaceDeafened || isPermissionMuted;
  const micOff = isMuted || isDeafened || micBlocked;
  const deafOff = isDeafened || isSpaceDeafened;

  return (
    // Not positioned: the device panels anchor to the card's glass (its
    // backdrop-filter makes it their containing block), so they open above
    // the whole card, voice row included.
    <div ref={panelRef}>
      {/* Input settings panel. It sits inside the card's glass, where a nested
          backdrop blurs nothing (design-system.md, "Nested glass"), so it is
          drawn solid with the glass edge and shadow. */}
      {openPanel === 'input' && (
        <div className={DEVICE_PANEL}>
          {/* Input Device */}
          <div className="relative">
            <button
              onClick={() => setShowInputDeviceList(!showInputDeviceList)}
              className={DEVICE_ROW}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-txt-primary text-left">{t('spaces:sidebar.userArea.inputDevice')}</div>
                <div className="text-xs text-txt-tertiary truncate text-left">{selectedInputLabel}</div>
              </div>
              <Icon name="chevron-right" size="sm" className="text-txt-tertiary ml-2" />
            </button>
            {showInputDeviceList && (
              <div className="bg-surface-input rounded-lg mx-1 mb-1 py-1 shadow-[inset_0_0_0_1px_var(--glass-border)] max-h-64 overflow-y-auto">
                {permState !== 'granted' && (
                  <div className="px-3 py-2 text-xs text-txt-tertiary">
                    {t('spaces:sidebar.userArea.microphonePermission')}{' '}
                    <button
                      onClick={() => { requestPermission().catch(() => {}); }}
                      className="underline text-accent-tone"
                    >
                      {t('spaces:sidebar.userArea.enable')}
                    </button>
                  </div>
                )}
                {permState === 'granted' && (
                  <>
                    <DropdownItem
                      label={systemDefaultLabel}
                      active={inputDeviceId === 'default'}
                      onClick={() => selectInput('default')}
                    />
                    {inputDevices.filter(d => d.deviceId !== 'default').map(d => (
                      <DropdownItem
                        key={d.deviceId}
                        label={inputLabels.get(d.deviceId) ?? d.deviceId}
                        active={inputDeviceId === d.deviceId}
                        onClick={() => selectInput(d.deviceId)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mx-2 border-t border-border-soft" />

          {/* Input Volume */}
          <div className="px-3 py-2.5">
            <div className="text-sm font-medium text-txt-primary mb-2">{t('spaces:sidebar.userArea.inputVolume')}</div>
            <input
              type="range"
              min={0}
              max={200}
              value={inputVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                storeSetInputVolume(vol);
              }}
              className={VOLUME_SLIDER}
              style={{ background: volumeTrack(inputVolume) }}
            />
            {/* Mic level meter */}
            <div className="flex items-center gap-[3px] mt-2.5">
              {Array.from({ length: micBars }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-sm transition-colors duration-75 ${
                    i < activeBars ? 'bg-status-ok' : 'bg-interactive-muted'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mx-2 border-t border-border-soft" />

          {/* Voice Settings link */}
          <button
            onClick={() => onSettingsClick('voice')}
            className={DEVICE_ROW}
          >
            <span className="text-sm font-medium text-txt-primary">{t('spaces:sidebar.userArea.voiceSettings')}</span>
            <Icon name="settings" size="sm" className="text-txt-tertiary" />
          </button>
        </div>
      )}

      {/* Output settings panel */}
      {openPanel === 'output' && (
        <div className={DEVICE_PANEL}>
          {/* Output Device */}
          <div className="relative">
            <button
              onClick={() => setShowOutputDeviceList(!showOutputDeviceList)}
              className={DEVICE_ROW}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-txt-primary text-left">{t('spaces:sidebar.userArea.outputDevice')}</div>
                <div className="text-xs text-txt-tertiary truncate text-left">{selectedOutputLabel}</div>
              </div>
              <Icon name="chevron-right" size="sm" className="text-txt-tertiary ml-2" />
            </button>
            {showOutputDeviceList && (
              <div className="bg-surface-input rounded-lg mx-1 mb-1 py-1 shadow-[inset_0_0_0_1px_var(--glass-border)] max-h-64 overflow-y-auto">
                {permState !== 'granted' && (
                  <div className="px-3 py-2 text-xs text-txt-tertiary">
                    {t('spaces:sidebar.userArea.audioPermission')}{' '}
                    <button
                      onClick={() => { requestPermission().catch(() => {}); }}
                      className="underline text-accent-tone"
                    >
                      {t('spaces:sidebar.userArea.enable')}
                    </button>
                  </div>
                )}
                {permState === 'granted' && (
                  <>
                    <DropdownItem
                      label={systemDefaultLabel}
                      active={outputDeviceId === 'default'}
                      onClick={() => selectOutput('default')}
                    />
                    {outputDevices.filter(d => d.deviceId !== 'default').map(d => (
                      <DropdownItem
                        key={d.deviceId}
                        label={outputLabels.get(d.deviceId) ?? d.deviceId}
                        active={outputDeviceId === d.deviceId}
                        onClick={() => selectOutput(d.deviceId)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mx-2 border-t border-border-soft" />

          {/* Output Volume */}
          <div className="px-3 py-2.5">
            <div className="text-sm font-medium text-txt-primary mb-2">{t('spaces:sidebar.userArea.outputVolume')}</div>
            <input
              type="range"
              min={0}
              max={200}
              value={outputVolume}
              onChange={(e) => {
                const vol = Number(e.target.value);
                storeSetOutputVolume(vol);
              }}
              className={VOLUME_SLIDER}
              style={{ background: volumeTrack(outputVolume) }}
            />
          </div>
          <div className="mx-2 border-t border-border-soft" />

          {/* Voice Settings link */}
          <button
            onClick={() => onSettingsClick('voice')}
            className={DEVICE_ROW}
          >
            <span className="text-sm font-medium text-txt-primary">{t('spaces:sidebar.userArea.voiceSettings')}</span>
            <Icon name="settings" size="sm" className="text-txt-tertiary" />
          </button>
        </div>
      )}

      {/* User area bar */}
      <div className="py-2 pl-2 pr-2 flex items-center gap-1 select-none">
        {/* Avatar + name */}
        <div className="p-1 hover:bg-interactive-hover rounded-lg flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer transition-colors duration-fast group">
          <ProfileAvatar src={user.avatar} name={user.displayName ?? user.username} size={32} status={shownStatus} user={user} origin="" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-txt-primary truncate leading-tight">{user.displayName ?? user.username}</div>
            <div className="text-2xs text-txt-tertiary truncate group-hover:text-txt-secondary">@{user.username}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center">
          {/* Mic */}
          <button
            onClick={onMicToggle}
            className={`w-8 h-8 flex items-center justify-center rounded-l-lg transition-colors duration-fast ${
              micBlocked ? 'text-status-warn cursor-not-allowed hover:bg-interactive-hover'
                : micOff ? 'text-status-danger bg-status-danger/[0.14] hover:bg-status-danger/20'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
            }`}
            title={(isPermissionMuted) ? t('spaces:sidebar.userArea.permissionMuted') : (isSpaceMuted || isSpaceDeafened) ? t('spaces:sidebar.userArea.spaceMuted') : isMuted ? t('spaces:sidebar.userArea.unmute') : t('spaces:sidebar.userArea.mute')}
          >
            <Icon name={micOff ? 'mic-off' : 'mic'} />
          </button>
          {/* Input chevron */}
          <button
            onClick={() => togglePanel('input')}
            className={`w-5 h-8 flex items-center justify-center hover:bg-interactive-hover rounded-r-lg transition-colors duration-fast ${
              openPanel === 'input' ? 'text-txt-primary bg-interactive-hover' : 'text-txt-tertiary hover:text-txt-primary'
            }`}
            title={t('spaces:sidebar.userArea.inputDevices')}
          >
            <Icon name="chevron-down" size="xs" className={`transition-transform duration-fast ${openPanel === 'input' ? 'rotate-180' : ''}`} />
          </button>

          {/* Headphones */}
          <button
            onClick={onDeafenToggle}
            className={`w-8 h-8 flex items-center justify-center rounded-l-lg transition-colors duration-fast ${
              isSpaceDeafened ? 'text-status-warn cursor-not-allowed hover:bg-interactive-hover'
                : isDeafened ? 'text-status-danger bg-status-danger/[0.14] hover:bg-status-danger/20'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
            }`}
            title={isSpaceDeafened ? t('spaces:sidebar.userArea.spaceDeafened') : isDeafened ? t('spaces:sidebar.userArea.undeafen') : t('spaces:sidebar.userArea.deafen')}
          >
            <Icon name={deafOff ? 'headphone-off' : 'headphones'} />
          </button>
          {/* Output chevron */}
          <button
            onClick={() => togglePanel('output')}
            className={`w-5 h-8 flex items-center justify-center hover:bg-interactive-hover rounded-r-lg transition-colors duration-fast ${
              openPanel === 'output' ? 'text-txt-primary bg-interactive-hover' : 'text-txt-tertiary hover:text-txt-primary'
            }`}
            title={t('spaces:sidebar.userArea.outputDevices')}
          >
            <Icon name="chevron-down" size="xs" className={`transition-transform duration-fast ${openPanel === 'output' ? 'rotate-180' : ''}`} />
          </button>

          {/* Settings */}
          <button
            onClick={() => onSettingsClick()}
            className="w-8 h-8 flex items-center justify-center text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover rounded-lg transition-colors duration-fast relative"
            title={t('common:labels.settings')}
            aria-label={updateBadge ? t('admin:updates.badge.settingsAriaLabel') : t('common:labels.settings')}
          >
            <Icon name="settings" />
            {updateBadge && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-warn" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Channel Item (unified text + voice) ──────────────────────────────────── */

function ChannelItem({
  channel,
  isActive,
  isUnread,
  isDragging,
  dropIndicator,
  onChannelClick,
  onSettingsClick,
  channelDragHandlers,
  voiceUserHandlers,
  voiceChannelDropZone,
  channelPermissions,
  handleVoiceJoin,
}: {
  channel: Channel;
  isActive: boolean;
  isUnread: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onChannelClick: () => void;
  onSettingsClick: () => void;
  channelDragHandlers: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  voiceUserHandlers: (userId: string, channelId: string) => {
    draggable: boolean;
    isBeingDragged: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  voiceChannelDropZone: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    isDragOver: boolean;
    isValidTarget: boolean;
  };
  channelPermissions: ReadonlyMap<string, string>;
  handleVoiceJoin: (channelId: string) => void;
}) {
  const chPerms = channelPermissions.get(channel.id);
  // Editing and deleting a channel check MANAGE_CHANNELS with its overrides,
  // so the settings gear reads this channel's permissions, not the space's.
  const canManage = hasPermissionBit(chPerms, PermissionBits.MANAGE_CHANNELS);
  if (channel.type === 'voice') {
    const canConnect = hasPermissionBit(chPerms, PermissionBits.CONNECT);
    return (
      <div
        className={`relative ${isDragging ? 'opacity-50' : ''}`}
        {...channelDragHandlers}
      >
        {dropIndicator === 'before' && <div className="absolute -top-px left-2 right-2 h-0.5 bg-accent-tone rounded-full z-[1]" />}
        <VoiceChannel
          channelId={channel.id}
          channelName={channel.name}
          onClick={() => canConnect && handleVoiceJoin(channel.id)}
          locked={!canConnect}
          canManage={canManage}
          onSettingsClick={onSettingsClick}
          voiceUserHandlers={voiceUserHandlers}
          dropZone={voiceChannelDropZone}
        />
        {dropIndicator === 'after' && <div className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-tone rounded-full z-[1]" />}
      </div>
    );
  }

  return (
    <div
      className={`relative ${isDragging ? 'opacity-50' : ''}`}
      {...channelDragHandlers}
    >
      {dropIndicator === 'before' && <div className="absolute -top-px left-2 right-2 h-0.5 bg-accent-tone rounded-full z-[1]" />}
      <button
        onClick={onChannelClick}
        className={`relative w-full flex items-center gap-2 px-2 h-[34px] rounded-lg text-sm group transition-colors duration-fast ${
          isActive
            ? 'bg-surface-elevated text-txt-primary font-medium'
            : isUnread
              ? 'text-txt-primary font-semibold hover:bg-interactive-hover'
              : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
        }`}
      >
        <Icon name="hash" className="text-txt-tertiary" />
        <span className="truncate flex-1 text-left">{channel.name}</span>
        <ChannelMutedIndicator channelId={channel.id} className="text-txt-tertiary" />
        {canManage && (
          <span
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-txt-tertiary hover:text-txt-primary transition-opacity duration-fast"
            onClick={(e) => {
              e.stopPropagation();
              onSettingsClick();
            }}
          >
            <Icon name="settings" size="sm" />
          </span>
        )}
        {isUnread && <Badge className="flex-shrink-0" />}
      </button>
      {dropIndicator === 'after' && <div className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-tone rounded-full z-[1]" />}
    </div>
  );
}

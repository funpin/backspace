import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useSocialStore } from '../../stores/socialStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { Avatar } from '../ui/Avatar';
import { AvatarStack } from '../ui/AvatarStack';
import { Mascot } from '../ui/Mascot';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/Tag';
import { resolveAssetUrl } from '../../utils/assetUrls';
import { useNavigate } from 'react-router-dom';
import { parseFederatedUsername, isFederationGlobeApplicable, isMine, userDisplayName } from '../../utils/identity';
import { useDmViewer } from '../../hooks/useDmViewer';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { formatDmSidebarPreview, formatDmHeaderName } from '../../utils/dmFormatters';
import type { DmChannel, User } from '@backspace/shared';
import type { TaggedFriend } from '../../stores/socialStore';

const FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;

function MobileFriendBubble({
  friend,
  dmChannels,
  onTap,
}: {
  friend: TaggedFriend;
  dmChannels: DmChannel[];
  onTap: (dmId: string) => void;
}) {
  const canonical = useCanonicalUserView(friend as unknown as User, friend._instanceOrigin);
  // _instanceOrigin lives on TaggedFriend, not on the canonical User. Use the
  // canonical avatar value but source the origin from the original friend.
  const avatarUrl = canonical.avatar
    ? resolveAssetUrl(canonical.avatar, friend._instanceOrigin) ?? `/api/uploads/${canonical.avatar}`
    : null;
  const displayName = userDisplayName(canonical);

  return (
    <button
      onClick={() => {
        const existingDm = dmChannels.find(dm =>
          !dm.ownerId && dm.members.some(m => m.id === friend.id)
        );
        if (existingDm) {
          onTap(existingDm.id);
        }
      }}
      className="flex flex-col items-center gap-1 shrink-0 w-14"
    >
      <div className="relative">
        <Avatar
          src={avatarUrl}
          name={displayName}
          avatarColor={canonical.avatarColor}
          size={40}
        />
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-base ${
          friend.status === 'online' ? 'bg-status-online' :
          friend.status === 'idle' ? 'bg-status-idle' :
          'bg-status-dnd'
        }`} />
      </div>
      <span className="text-2xs text-txt-secondary truncate w-full text-center">
        {displayName}
      </span>
    </button>
  );
}

function MobileDmRow({
  dm,
  readStates,
  onTap,
  onContextMenu,
  formatTimestamp,
}: {
  dm: DmChannel;
  readStates: Map<string, string>;
  onTap: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string, isGroup: boolean) => void;
  formatTimestamp: (ts: number) => string;
}) {
  const { t } = useTranslation(['dm', 'common']);
  const viewer = useDmViewer(dm.id);
  const otherMembers = dm.members.filter(m => !isMine(m, viewer.origin, viewer.self));
  const isGroup = !!dm.ownerId;
  const rawMainUser = otherMembers[0] ?? null;
  const canonicalMainUser = useCanonicalUserView(rawMainUser ?? FALLBACK_USER, viewer.origin);
  const mainUser = rawMainUser ? canonicalMainUser : null;

  // Group DMs → `formatDmHeaderName` (single source of truth shared with
  // `MobileChatScreen`, `MainContent`, `DmListItem`, welcome hero). 1:1 DMs
  // keep the canonical view of the single other member.
  const name = isGroup
    ? formatDmHeaderName(dm, viewer)
    : (mainUser && userDisplayName(mainUser)) || t('common:states.unknown');

  // Show a single federation globe next to the group name when any non-self
  // member is federated. No tooltip on mobile — the new `group-dm-info` screen
  // surfaces federation identity per-member.
  const groupHasFederatedMember = isGroup && otherMembers.some((m) => isFederationGlobeApplicable(m));

  const lastMsgId = dm.lastMessage?.id;
  const readState = readStates.get(dm.id);
  const isUnread = lastMsgId && (!readState || readState < lastMsgId);

  const preview = formatDmSidebarPreview(dm, viewer);
  const previewTime = dm.lastMessage?.createdAt;

  const avatarUrl = mainUser?.avatar ? `/api/uploads/${mainUser.avatar}` : null;

  return (
    <button
      key={dm.id}
      data-context-menu
      onClick={() => onTap(dm.id)}
      onContextMenu={(e) => onContextMenu(e, dm.id, isGroup)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-interactive-hover active:bg-interactive-active text-left transition-colors duration-fast"
    >
      <div className="relative shrink-0">
        {isGroup ? (
          // Reuse the shared AvatarStack so group rows match the rest of the
          // group-DM surface (chat header, DmListItem, GroupDmSettings hero).
          // size 40 matches the 1:1 Avatar above it; border="chat" picks the
          // surface-chat border color used elsewhere on the messages list.
          <AvatarStack
            members={otherMembers}
            origin={viewer.origin}
            size={40}
            border="chat"
            iconUrl={dm.icon}
          />
        ) : (
          <Avatar
            src={avatarUrl}
            name={name}
            avatarColor={mainUser?.avatarColor}
            size={40}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            <span className={`text-sm truncate ${isUnread ? 'font-semibold text-txt-primary' : 'text-txt-primary'}`}>
              {name}
            </span>
            {groupHasFederatedMember && (
              <span data-dm-row-globe className="inline-flex text-txt-tertiary/80 flex-shrink-0">
                <Icon name="globe" size="xs" />
              </span>
            )}
          </span>
          {previewTime && (
            <span className="text-2xs text-txt-tertiary shrink-0">
              {formatTimestamp(previewTime)}
            </span>
          )}
        </div>
        {!isGroup && mainUser && isFederationGlobeApplicable(mainUser) && (
          <div className="text-2xs text-txt-tertiary truncate opacity-60">
            @{parseFederatedUsername(mainUser.username).domain}
          </div>
        )}
        {preview && (
          <p className={`text-xs truncate mt-0.5 ${isUnread ? 'text-txt-secondary font-medium' : 'text-txt-tertiary'}`}>
            {preview}
          </p>
        )}
      </div>
      {isUnread && <Badge className="shrink-0" />}
    </button>
  );
}

export function MobileDmsScreen() {
  const { t } = useTranslation(['dm', 'common']);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const openModal = useUIStore((s) => s.openModal);

  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const readStates = useChatStore((s) => s.readStates);
  const friends = useSocialStore((s) => s.friends);
  const navigate = useNavigate();
  const f = useFormatters();
  const openContextMenu = useContextMenuStore((s) => s.open);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);

  // Online friends for the activity row
  const onlineFriends = useMemo(() =>
    friends.filter(f => f.status === 'online' || f.status === 'idle' || f.status === 'dnd'),
    [friends]
  );

  // Sort DMs by last message time (newest first)
  const sortedDms = useMemo(() =>
    [...dmChannels].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.createdAt;
      const bTime = b.lastMessage?.createdAt ?? b.createdAt;
      return bTime - aTime;
    }),
    [dmChannels]
  );

  const handleDmTap = (dmId: string) => {
    navigate(`/channels/@me/${dmId}`);
    pushMobileScreen('channel-chat', { channelId: dmId, spaceId: '@me' });
  };

  const handleDmContextMenu = (e: React.MouseEvent, dmId: string, isGroup: boolean) => {
    if (!isGroup) return;
    e.preventDefault();
    e.stopPropagation();

    openContextMenu({ x: e.clientX, y: e.clientY }, [
      {
        key: 'leave-group',
        type: 'action',
        label: t('dm:list.leaveGroup'),
        danger: true,
        icon: <Icon name="log-out" size="sm" />,
        onClick: () => {
          const currentChId = useChatStore.getState().currentChannelId;
          if (currentChId === dmId) {
            navigate('/channels/@me');
            setCurrentChannel(null);
          }
          useSpaceStore.getState().leaveDm(dmId);
        },
      },
    ]);
  };

  const formatTimestamp = (ts: number): string => {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return t('dm:list.justNow');
    if (diff < 3600_000) return t('dm:list.minutesShort', { count: Math.floor(diff / 60_000) });
    if (diff < 86400_000) return t('dm:list.hoursShort', { count: Math.floor(diff / 3600_000) });
    if (diff < 604800_000) return t('dm:list.daysShort', { count: Math.floor(diff / 86400_000) });
    return f.formatShortDate(ts);
  };

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border-hard shrink-0">
        <h1 className="text-lg font-semibold text-txt-primary">{t('dm:list.title')}</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => pushMobileScreen('friends')}
            className="h-11 px-3 -mr-3 rounded-lg text-xs font-medium text-accent-tone hover:bg-interactive-hover transition-colors duration-fast"
          >
            {t('common:labels.friends')}
          </button>
        </div>
      </header>

      {/* Activity row — online friends */}
      {onlineFriends.length > 0 && (
        <div className="px-4 py-3 border-b border-border-hard">
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {onlineFriends.map(friend => (
              <MobileFriendBubble
                key={friend.id}
                friend={friend}
                dmChannels={dmChannels}
                onTap={handleDmTap}
              />
            ))}
          </div>
        </div>
      )}

      {/* DM list */}
      <div className="flex-1 overflow-y-auto">
        {sortedDms.map(dm => (
          <MobileDmRow
            key={dm.id}
            dm={dm}
            readStates={readStates}
            onTap={handleDmTap}
            onContextMenu={handleDmContextMenu}
            formatTimestamp={formatTimestamp}
          />
        ))}

        {sortedDms.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 opacity-80">
            <Mascot state="dnd" className="w-20 h-20 mb-2" />
            <p className="text-txt-tertiary text-sm">{t('dm:list.empty')}</p>
          </div>
        )}
      </div>

      {/* FAB — New DM */}
      <button
        onClick={() => openModal('newDm')}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-accent-primary text-on-accent shadow-elevation-high flex items-center justify-center z-float hover:bg-accent-primary-hover active:bg-accent-primary-active transition-colors duration-fast"
      >
        <Icon name="pencil" size="lg" />
      </button>
    </div>
  );
}

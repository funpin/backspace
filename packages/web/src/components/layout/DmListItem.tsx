import { useTranslation } from 'react-i18next';
import type { DmChannel, User } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { AvatarStack } from '../ui/AvatarStack';
import { Tooltip } from '../ui/Tooltip';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Tag';
import { isMine, isFederationGlobeApplicable, userDisplayName } from '../../utils/identity';
import { useDmViewer } from '../../hooks/useDmViewer';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { formatDmTimestamp, formatDmSidebarPreview, formatDmHeaderName } from '../../utils/dmFormatters';
import { getRejectedPeerOrigins, getAwaitingApprovalPeerOrigins } from '../../hooks/useWebSocket';

function isMemberUnreachable(homeInstance: string | null | undefined): boolean {
  if (!homeInstance) return false;
  const normalized = homeInstance.startsWith('http') ? homeInstance : `https://${homeInstance}`;
  return getRejectedPeerOrigins().has(normalized);
}

function isMemberAwaitingApproval(homeInstance: string | null | undefined): boolean {
  if (!homeInstance) return false;
  const normalized = homeInstance.startsWith('http') ? homeInstance : `https://${homeInstance}`;
  return getAwaitingApprovalPeerOrigins().has(normalized);
}

interface DmListItemProps {
  dm: DmChannel;
  isActive: boolean;
  isUnread: boolean;
  user: User;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onLeave: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
}

export function DmListItem({ dm, isActive, isUnread, user, onSelect, onClose, onLeave, onContextMenu }: DmListItemProps) {
  const { t } = useTranslation('dm');
  const viewer = useDmViewer(dm.id);
  const otherMembers = dm.members.filter(m => !isMine(m, viewer.origin, viewer.self));
  const isGroup = !!dm.ownerId;
  if (otherMembers.length === 0 && !isGroup) return null;

  // Route the 1-on-1 partner through the canonical view cache. Group member
  // avatars are handled per-slot in DmGroupAvatarSlot (hook-in-loop safety).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rawFirstOther = isGroup ? null : (otherMembers[0] ?? null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const firstOtherCanonical = useCanonicalUserView(rawFirstOther ?? user, viewer.origin);
  const firstOther = rawFirstOther ? firstOtherCanonical : null;

  // Groups → `formatDmHeaderName` (honors `dm.name`, falls back to joined
  // names — same path used by the chat header, welcome hero, and mobile).
  // 1-on-1 keeps the canonical-view name so replicated aliases stay correct.
  const displayName = isGroup
    ? formatDmHeaderName(dm, viewer)
    : firstOther ? userDisplayName(firstOther) : '';

  // Group globe: at least one member is federated → render once with comma-joined tooltip.
  const groupFederatedMembers = isGroup
    ? dm.members.filter(m => isFederationGlobeApplicable(m))
    : [];
  const showGroupGlobe = isGroup && groupFederatedMembers.length > 0;

  const handleClick = () => onSelect(dm.id);
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGroup) {
      onLeave(dm.id);
    } else {
      onClose(dm.id);
    }
  };
  const handleContextMenu = onContextMenu
    ? (e: React.MouseEvent) => onContextMenu(e, dm.id)
    : undefined;

  // ── State-driven classes ──────────────────────────────────────────────
  // Container: a two-line list row (name + preview), 44px
  const containerClass = `relative flex items-center gap-2.5 px-2 h-11 rounded-lg cursor-pointer transition-colors duration-fast group ${
    isActive
      ? 'bg-surface-elevated text-txt-primary'
      : 'hover:bg-interactive-hover'
  }`;

  // Name: font-semibold for unread
  const nameClass = `text-sm truncate leading-tight ${
    isActive ? 'text-txt-primary font-medium'
      : isUnread ? 'text-txt-primary font-semibold'
      : 'text-txt-secondary group-hover:text-txt-primary'
  }`;

  // Timestamp: brightens on hover and lifts for unread/selected
  const timestampClass = `text-2xs tabular-nums ml-auto flex-shrink-0 ${
    isActive || isUnread
      ? 'text-txt-secondary'
      : 'text-txt-tertiary group-hover:text-txt-secondary'
  }`;

  // Preview: brightens on hover and lifts for unread/selected
  const previewClass = `text-xs truncate mt-0.5 ${
    isActive || isUnread
      ? 'text-txt-secondary'
      : 'text-txt-tertiary group-hover:text-txt-secondary'
  }`;

  // Federation badge: brightens with parent
  const fedBadgeClass = `flex-shrink-0 ${
    isActive || isUnread
      ? 'text-txt-secondary'
      : 'text-txt-tertiary group-hover:text-txt-secondary'
  }`;

  // Close button: always visible when selected, hover-reveal otherwise
  const closeClass = `${
    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  } transition-opacity duration-fast`;

  // ── Preview text ──────────────────────────────────────────────────────
  // formatDmSidebarPreview handles user/system messages and applies the
  // sender prefix for group user-messages. We only need to provide the
  // empty-group fallback ourselves.
  const preview = formatDmSidebarPreview(dm, viewer);
  const previewText = preview ?? (isGroup ? `${dm.members.length} Members` : null);

  const itemJsx = (
    <div
      onClick={handleClick}
      className={containerClass}
    >
      {/* Avatar */}
      {isGroup ? (
        <AvatarStack members={otherMembers} origin={viewer.origin} size={32} border="channel" iconUrl={dm.icon} />
      ) : (
        <Avatar src={firstOther?.avatar} name={displayName} size={32} status={firstOther?.status} userId={firstOther?.homeUserId ?? firstOther?.id} user={firstOther ?? undefined} />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className={nameClass}>
            {displayName}
          </span>
          {showGroupGlobe && (
            <Tooltip content={groupFederatedMembers.map(m => m.username).join(', ')} position="top">
              <span className={fedBadgeClass}><Icon name="globe" size="xs" /></span>
            </Tooltip>
          )}
          {!isGroup && firstOther && isFederationGlobeApplicable(firstOther) && (
            <Tooltip content={firstOther.username} position="top">
              <span className={fedBadgeClass}><Icon name="globe" size="xs" /></span>
            </Tooltip>
          )}
          {firstOther && isMemberUnreachable(firstOther.homeInstance) && (
            <Tooltip content="Cannot relay messages — their server denied peering. Contact their admin." position="top">
              <span className="text-status-danger"><Icon name="triangle-alert" size="xs" /></span>
            </Tooltip>
          )}
          {firstOther && !isMemberUnreachable(firstOther.homeInstance) && isMemberAwaitingApproval(firstOther.homeInstance) && (
            <Tooltip content="Messages will be delivered once their admin approves the peering request." position="top">
              <span className="text-status-warn"><Icon name="circle-alert" size="xs" /></span>
            </Tooltip>
          )}
          {dm.lastMessage && (
            <span className={timestampClass}>
              {formatDmTimestamp(dm.lastMessage.createdAt)}
            </span>
          )}
          {isUnread && <Badge className={`flex-shrink-0 ${dm.lastMessage ? '' : 'ml-auto'}`} />}
        </div>
        {previewText && (
          <div className={previewClass}>
            {previewText}
          </div>
        )}
      </div>

      {/* Close / Leave button */}
      <IconButton
        icon="x"
        size="sm"
        onClick={handleClose}
        className={closeClass}
        label={isGroup ? t('list.leaveGroup') : t('list.close')}
      />
    </div>
  );

  // Group DMs get a context menu wrapper
  if (isGroup && handleContextMenu) {
    return <div onContextMenu={handleContextMenu}>{itemJsx}</div>;
  }

  return itemJsx;
}

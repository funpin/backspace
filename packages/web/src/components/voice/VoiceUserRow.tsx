import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';

export interface VoiceUserRowProps {
  userId: string;
  displayName: string;
  avatar: string | null;
  avatarColor?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  isCameraOn?: boolean;
  isUnwatchedCamera?: boolean;
  isScreenSharing?: boolean;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  isPermissionMuted?: boolean;
  isLocallyMuted?: boolean;
  isSpeaking?: boolean;
  connectionWarning?: string | null;
  size?: 'compact' | 'default';
  className?: string;
}

export function VoiceUserRow({
  userId,
  displayName,
  avatar,
  avatarColor,
  isMuted,
  isDeafened,
  isCameraOn,
  isUnwatchedCamera,
  isScreenSharing,
  isServerMuted,
  isServerDeafened,
  isPermissionMuted,
  isLocallyMuted,
  isSpeaking,
  connectionWarning,
  size = 'default',
  className = '',
}: VoiceUserRowProps) {
  const { t } = useTranslation(['voice', 'common']);
  const avatarSize = size === 'compact' ? 20 : 24;

  // Mic icon priority: server muted/deafened/permission muted (warning) > self-muted
  const showServerMicIcon = isServerMuted || isServerDeafened || isPermissionMuted;
  const showSelfMicIcon = !showServerMicIcon && isMuted;

  // Deafen icon priority: server deafened (warning) > self-deafened
  const showServerDeafIcon = isServerDeafened;
  const showSelfDeafIcon = !isServerDeafened && isDeafened;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Avatar
        src={avatar}
        name={displayName}
        size={avatarSize}
        userId={userId}
        avatarColor={avatarColor}
        className={isSpeaking ? 'rounded-full ring-2 ring-status-ok' : ''}
      />
      <span className="text-compact text-txt-secondary truncate flex-1 min-w-0">
        {displayName}
      </span>
      {/* Status marks: quiet tertiary for the person's own choices, the
          warning colour for a moderator's restriction. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {connectionWarning && (
          <span
            className="w-4 h-4 rounded-full bg-status-idle/15 text-status-idle flex items-center justify-center"
            title={connectionWarning}
            aria-label={connectionWarning}
          >
            <Icon name="triangle-alert" size="xs" />
          </span>
        )}
        {/* Server muted / space deafened / permission muted */}
        {showServerMicIcon && (
          <span
            className="flex text-status-warn"
            title={
              isPermissionMuted
                ? t('voice:badges.mutedNoPermission')
                : isServerMuted
                  ? t('voice:badges.spaceMuted')
                  : t('voice:badges.mutedSpaceDeafened')
            }
          >
            <Icon name="mic-off" size="xs" />
          </span>
        )}
        {/* Server deafened */}
        {showServerDeafIcon && (
          <span className="flex text-status-warn" title={t('voice:badges.spaceDeafened')}>
            <Icon name="headphone-off" size="xs" />
          </span>
        )}
        {/* Self-muted */}
        {showSelfMicIcon && (
          <Icon name="mic-off" size="xs" className="text-txt-tertiary" />
        )}
        {/* Self-deafened */}
        {showSelfDeafIcon && (
          <Icon name="headphone-off" size="xs" className="text-txt-tertiary" />
        )}
        {/* Camera active; crossed out when the viewer does not watch it */}
        {isCameraOn && (
          <Icon name={isUnwatchedCamera ? 'video-off' : 'video'} size="xs" className="text-txt-tertiary" />
        )}
        {/* Screen sharing LIVE badge */}
        {isScreenSharing && (
          <Tag tone="live">{t('voice:badges.live')}</Tag>
        )}
        {/* Locally muted */}
        {isLocallyMuted && (
          <span className="flex text-txt-tertiary" title={t('voice:badges.locallyMuted')}>
            <Icon name="volume-x" size="xs" />
          </span>
        )}
      </div>
    </div>
  );
}

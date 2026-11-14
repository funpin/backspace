import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useChannelUser } from '../../utils/channelUser';
import { spaceMemberName } from '../../utils/identity';

/** Resolved mention without a role colour (a DM, or a member with no role): the theme's secondary colour. */
const THEME_CLASS = 'text-accent-secondary bg-accent-secondary/15';
/** A mention this client cannot place in the channel. */
const UNRESOLVED_CLASS = 'text-txt-secondary bg-surface-elevated';

interface MentionBadgeProps {
  userId: string;
  /**
   * The channel the mention was written in. A `<@id>` token carries an id on
   * that channel's origin and names one of that channel's people, so it is
   * resolved there (`utils/channelUser`). Null outside a channel: the badge
   * cannot resolve and shows the unknown-user label.
   */
  channelId: string | null;
  /**
   * False inside another control (a reply preview is a jump button): the badge
   * keeps its look but is plain text, so it neither opens a profile nor nests
   * interactive content in that control.
   */
  interactive?: boolean;
}

export const MentionBadge = React.memo(function MentionBadge({ userId, channelId, interactive = true }: MentionBadgeProps) {
  const { t } = useTranslation('chat');
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const resolved = useChannelUser(channelId, userId);

  const displayName = resolved ? spaceMemberName(resolved.member, resolved.user) : t('message.mention.unknownUser');
  // Role colour and owner rose exist only in space channels (nameColor is null in a DM).
  const roleColor = resolved?.nameColor ?? null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!resolved) return;
    e.stopPropagation();
    const memberContext = resolved.member
      ? { spaceId: resolved.member.spaceId, userId: resolved.member.userId }
      : undefined;
    openUserProfile(resolved.user, resolved.origin, e.currentTarget.getBoundingClientRect(), undefined, memberContext);
  };

  // A role colour belongs to the space, so it is drawn as given on a tint of
  // itself; every other mention takes its colour from the theme.
  const toneClass = roleColor ? '' : resolved ? THEME_CLASS : UNRESOLVED_CLASS;
  const baseClass = `inline-flex items-center rounded px-0.5 font-medium ${toneClass}`.trimEnd();
  const style: React.CSSProperties | undefined = roleColor
    ? { color: roleColor, backgroundColor: `color-mix(in srgb, ${roleColor} 15%, transparent)` }
    : undefined;

  // Plain text inside another control, and when there is no profile to open.
  if (!interactive || !resolved) {
    return (
      <span className={baseClass} style={style}>
        @{displayName}
      </span>
    );
  }

  // A real button, so it is in the tab order and Enter and Space open the
  // profile, like the click does.
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClass} cursor-pointer transition-colors duration-fast hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone/60`}
      style={style}
    >
      @{displayName}
    </button>
  );
});

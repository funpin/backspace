import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MassMentionKeyword } from '@backspace/shared/src/mentions';
import { useSpaceStore } from '../../stores/spaceStore';

/** `@everyone` / `@here`, and a role with no colour of its own: the theme's secondary colour. */
const THEME_CLASS = 'text-accent-secondary bg-accent-secondary/15';
/** A role token this client cannot place in the channel's space. */
const UNRESOLVED_CLASS = 'text-txt-secondary bg-surface-elevated';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

type MassMentionBadgeProps =
  | { keyword: MassMentionKeyword; roleId?: undefined; channelId: string | null }
  | { roleId: string; keyword?: undefined; channelId: string | null };

/**
 * `@everyone`, `@here` or a role mention (`<@&id>`) as a label. These name a
 * group, not a person, so unlike `MentionBadge` there is no profile to open.
 * A role resolves among the roles of the channel's own space; a role this
 * client does not know there shows the unknown-role label.
 */
export const MassMentionBadge = React.memo(function MassMentionBadge({ keyword, roleId, channelId }: MassMentionBadgeProps) {
  const { t } = useTranslation('chat');
  const role = useSpaceStore((s) => {
    if (roleId === undefined || !channelId) return undefined;
    const spaceId = s.channelToSpaceMap.get(channelId);
    return spaceId === undefined ? undefined : s.roles.find((r) => r.id === roleId && r.spaceId === spaceId);
  });

  let label: string;
  let toneClass = THEME_CLASS;
  // A role's own colour belongs to the space and is drawn as given.
  let roleColor: string | null = null;
  if (keyword !== undefined) {
    label = keyword;
  } else if (role) {
    // The @everyone role is stored with its "@" in the name.
    label = role.name.replace(/^@/, '');
    if (HEX_COLOR.test(role.color)) roleColor = role.color;
  } else {
    label = t('message.mention.unknownRole');
    toneClass = UNRESOLVED_CLASS;
  }

  return (
    <span
      className={`inline-flex items-center rounded px-0.5 font-medium ${roleColor ? '' : toneClass}`.trimEnd()}
      style={roleColor ? { color: roleColor, backgroundColor: `color-mix(in srgb, ${roleColor} 15%, transparent)` } : undefined}
    >
      @{label}
    </span>
  );
});

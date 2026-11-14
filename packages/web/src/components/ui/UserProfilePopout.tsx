import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { useNavigate } from 'react-router-dom';
import type { User } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { Username } from '../ui/Username';
import { ProfileBio } from './ProfileBio';
import { useSpaceStore } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { useSelfIdentity } from '../../stores/authStore';
import { openDirectMessage } from '../../utils/openDirectMessage';
import { describeError } from '../../i18n/errors';
import { useUIStore, type ProfileMemberContext } from '../../stores/uiStore';
import { getAvatarGradient, adjustColor, mutedGradient } from '../../utils/gradients';
import { isMine, parseFederatedUsername } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { loadFederatedMutuals } from '../../utils/mutuals';
import { replaceEmojiShortcodes, useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { computeFloatingPosition, type AnchorRect, type Placement } from '../../hooks/useFloatingPosition';
import { useProfileMemberRoles } from '../../hooks/useProfileMember';
import { useShownStatus } from '../../hooks/useShownStatus';
import { viewerCanEditMemberRoles } from '../../utils/roleHierarchy';
import { ProfileRoles } from './ProfileRoles';
import { ProfileSpaceNickname } from './ProfileSpaceNickname';
import { Button } from './Button';

/** Gap between the card and the element it was opened from. */
const ANCHOR_OFFSET = 8;

interface UserProfilePopoutProps {
  user: User;
  /** The instance that issued `user` ('' = the page's own). */
  origin: string;
  onClose: () => void;
  /** Rect of the element the card was opened from. */
  anchor: AnchorRect;
  placement?: Placement;
  /** The space member the card was opened for; shows their roles in that space. */
  member?: ProfileMemberContext | null;
}

export function UserProfilePopout({ user: propUser, origin, onClose, anchor, placement = 'right', member = null }: UserProfilePopoutProps) {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['social', 'common']);
  const navigate = useNavigate();
  const f = useFormatters();
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);
  // How this person looks at best (the userViews cache). The prop can be a
  // copy from another instance; the cache surfaces their home's view. The
  // row's identity fields and `origin` stay what every request below uses.
  const user = useCanonicalUserView(propUser, origin);
  const { baseName, domain } = parseFederatedUsername(user.username);
  const displayName = user.displayName ?? baseName;
  const shownStatus = useShownStatus(user, origin, user.status);
  const self = useSelfIdentity();
  const isYou = isMine(user, origin, self);

  const roles = useProfileMemberRoles(member);
  const isMobile = useUIStore((s) => s.isMobile);
  // Edit Roles opens the member role editor, which is desktop-only. It is
  // offered by the rule the editor gates with (permissions.md, "Role
  // hierarchy"), read from the loaded space the card was opened in.
  const canEditRoles = useSpaceStore((s) => {
    if (!member || s.currentSpaceId !== member.spaceId) return false;
    const space = s.spaces.find((sp) => sp.id === member.spaceId);
    const target = s.members.find((m) => m.userId === member.userId);
    if (!space || !target) return false;
    return viewerCanEditMemberRoles(space, s.members, s.roles, s.spacePermissions.get(space.id), target);
  }) && !isMobile;

  const [mutualCounts, setMutualCounts] = useState<{ friends: number; spaces: number } | null>(null);

  useEffect(() => {
    loadFederatedMutuals(user.id, user.homeUserId)
      .then((data) => setMutualCounts({ friends: data.mutualFriends.length, spaces: data.mutualSpaces.length }))
      .catch(() => {});
  }, [user.id, user.homeUserId]);

  // Placed off the card's *measured* size rather than a guessed height: the card
  // grows with the bio, the custom status and the mutuals row, so any constant
  // here would cut tall cards off at the bottom of the viewport.
  const cardRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const place = () => {
      const { width, height } = card.getBoundingClientRect();
      // 'start': the card's top edge lines up with the row it came from, the
      // way it always has — centring a tall card on a 32px avatar would drag it
      // up over unrelated content.
      const next = computeFloatingPosition(anchor, width, height, placement, ANCHOR_OFFSET, 'start');
      setPlaced((prev) =>
        prev && prev.top === next.top && prev.left === next.left
          ? prev
          : { top: next.top, left: next.left },
      );
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(card);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, placement]);

  const handleSendMessage = async () => {
    try {
      const rowId = await openDirectMessage(user, origin);
      useUIStore.getState().setShowDms(true);
      onClose();
      navigate(`/channels/@me/${rowId}`);
    } catch (err) {
      addToast(t('social:sendMessage.failed', { reason: describeError(err) }), 'warning');
    }
  };

  const handleViewFullProfile = () => {
    onClose();
    openModal('userProfile', { userId: user.id, user, origin, member });
  };

  const handleEditRoles = () => {
    if (!member) return;
    onClose();
    openModal('memberRoles', { spaceId: member.spaceId, userId: member.userId });
  };

  const handleAvatarClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    handleViewFullProfile();
  };

  // Banner display. Another instance's assets arrive as absolute URLs
  // (`normalizeUserAssets`); a bare filename is the page's own instance's.
  const bannerSrc = user.banner
    ? (user.banner.startsWith('http') || user.banner.startsWith('/') ? user.banner : api.uploads.url(user.banner))
    : null;
  const bannerFallback = user.accentColor
    ? mutedGradient(user.accentColor, adjustColor(user.accentColor, -40))
    : (() => {
        const g = getAvatarGradient(user.homeUserId ?? user.id, displayName, user.avatarColor);
        return mutedGradient(g.from, g.to);
      })();

  // Parked off-screen for the one layout pass before the card knows how tall it
  // is; `useLayoutEffect` places it before the browser paints, so it never
  // renders visibly in the wrong spot.
  const cardStyle = placed ?? { top: -9999, left: -9999 };

  return (
    <div
      ref={cardRef}
      data-user-profile-popout
      className="fixed z-popover w-[340px] rounded-xl overflow-hidden animate-fade-in select-none glass-modal"
      style={cardStyle}
    >
      {/* Banner */}
      <div
        className="h-20"
        style={bannerSrc
          ? { backgroundImage: `url(${bannerSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: bannerFallback }
        }
      />

      {/* Body */}
      <div className="px-4 pb-4 relative">
        {/* Avatar */}
        {/* The picture escalates to the full profile — the card is a preview, and
            clicking the face is the obvious way to ask for the whole thing. It
            deliberately does NOT reopen the card (see issue #37). */}
        <Avatar
          src={user.avatar}
          name={displayName}
          size={80}
          status={shownStatus}
          userId={user.homeUserId ?? user.id}
          user={user}
          onClick={handleAvatarClick}
          ring={{ width: 4, color: 'rgb(var(--bg-elevated))' }}
          className="mt-[-44px] mb-3"
        />

        {/* Name & info */}
        <div>
          <ProfileSpaceNickname member={member} />
          <span className="text-lg font-semibold leading-tight text-txt-primary">{displayName}</span>
          <div className="text-compact text-txt-tertiary">
            <Username username={user.username} showAt className="text-compact text-txt-tertiary" />
          </div>
          {user.customStatus && (
            <div className="text-compact text-txt-secondary italic mt-1">
              {replaceEmojiShortcodes(user.customStatus)}
            </div>
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <>
            <div className="border-t border-border-soft my-3" />
            <div>
              <span className="text-xs font-medium text-txt-tertiary">
                {t('social:profile.aboutMe')}
              </span>
              <ProfileBio bio={user.bio} />
            </div>
          </>
        )}

        {roles.length > 0 && (
          <>
            <div className="border-t border-border-soft my-3" />
            <ProfileRoles roles={roles} />
          </>
        )}

        <div className="border-t border-border-soft my-3" />

        {/* Member since + Mutuals */}
        <div className="space-y-1.5">
          <div>
            <span className="text-xs font-medium text-txt-tertiary">
              {t('social:profile.memberSince')}
            </span>
            <span className="text-xs text-txt-secondary ml-2">
              {f.formatMediumDate(user.createdAt)}
            </span>
          </div>
          {mutualCounts && (mutualCounts.friends > 0 || mutualCounts.spaces > 0) && (
            <div className="text-xs text-txt-tertiary">
              {mutualCounts.friends > 0 && (
                <span>{t('social:mutuals.friends', { count: mutualCounts.friends })}</span>
              )}
              {mutualCounts.friends > 0 && mutualCounts.spaces > 0 && (
                <span className="mx-1">&middot;</span>
              )}
              {mutualCounts.spaces > 0 && (
                <span>{t('social:mutuals.spaces', { count: mutualCounts.spaces })}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions. Nobody sends themselves a message. */}
        {!isYou && (
          <Button variant="secondary" fullWidth onClick={handleSendMessage} className="mt-3">
            {t('social:profile.sendMessage')}
          </Button>
        )}
        {canEditRoles && (
          <Button variant="ghost" fullWidth onClick={handleEditRoles} className="mt-1.5">
            {t('social:profile.editRoles')}
          </Button>
        )}
        <Button variant="ghost" fullWidth onClick={handleViewFullProfile} className="mt-1.5">
          {t('social:profile.viewFull')}
        </Button>
      </div>
    </div>
  );
}

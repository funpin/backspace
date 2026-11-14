import { getFriendshipStatus, type FriendshipStatus } from '../../utils/friendshipStatus';
import { ProfileSpaceNickname } from '../ui/ProfileSpaceNickname';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { describeError } from '../../i18n/errors';
import { useNavigate } from 'react-router-dom';
import type { User } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Username } from '../ui/Username';
import { ProfileBio } from '../ui/ProfileBio';
import { useUIStore, type ProfileMemberContext } from '../../stores/uiStore';
import { useSpaceStore, getApiForOrigin } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { useSocialStore } from '../../stores/socialStore';
import { useSelfIdentity } from '../../stores/authStore';
import { getAvatarGradient, getSpaceGradient, adjustColor, mutedGradient } from '../../utils/gradients';
import { parseFederatedUsername } from '../../utils/identity';
import { openDirectMessage } from '../../utils/openDirectMessage';
import { normalizeUserAssets } from '../../utils/assetUrls';
import { loadFederatedMutuals, type TaggedMutualFriend, type MutualSpace } from '../../utils/mutuals';
import { friendRequestTarget } from '../../utils/friendRequestTarget';
import { presenceLabel } from '../../i18n/presence';
import { replaceEmojiShortcodes, useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { getProfileMember, useProfileMemberRoles } from '../../hooks/useProfileMember';
import { useShownStatus } from '../../hooks/useShownStatus';
import { ProfileRoles } from '../ui/ProfileRoles';

type Tab = 'about' | 'friends' | 'spaces';

export function UserProfileModal() {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['social', 'common']);
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();
  const f = useFormatters();
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const updateFriendRequest = useSocialStore((s) => s.updateFriendRequest);
  const cancelFriendRequest = useSocialStore((s) => s.cancelFriendRequest);
  const self = useSelfIdentity();

  const [user, setUser] = useState<User | null>(null);
  const [userOrigin, setUserOrigin] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [mutualFriends, setMutualFriends] = useState<TaggedMutualFriend[]>([]);
  const [mutualSpaces, setMutualSpaces] = useState<MutualSpace[]>([]);
  const [loadingMutuals, setLoadingMutuals] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const isOpen = activeModal === 'userProfile';
  const userId = modalData?.userId as string | undefined;
  const passedUser = modalData?.user as User | undefined;
  const passedOrigin = (modalData?.origin as string | undefined) ?? '';
  const memberContext = (modalData?.member as ProfileMemberContext | null | undefined) ?? null;
  const memberSpaceId = memberContext?.spaceId;
  const memberUserId = memberContext?.userId;
  const roles = useProfileMemberRoles(memberContext);

  // Determine friendship status (federation-safe canonical matching)
  const friendship: FriendshipStatus = user
    ? getFriendshipStatus({ viewedUser: user, origin: userOrigin, self, friends, requests })
    : { state: 'none' };

  const loadUser = useCallback(async (id: string, origin: string) => {
    try {
      const targetApi = getApiForOrigin(origin);
      const u = await targetApi.users.get(id);
      // Another instance's assets as absolute URLs, like every other row.
      if (origin) normalizeUserAssets(u, origin);
      setUser(u);
      useSpaceStore.getState().upsertUserView(u, origin);
    } catch {
      // User not found
    }
  }, []);

  const loadMutuals = useCallback(async (id: string, targetUser?: User) => {
    setLoadingMutuals(true);
    try {
      const data = await loadFederatedMutuals(id, targetUser?.homeUserId);
      setMutualFriends(data.mutualFriends);
      setMutualSpaces(data.mutualSpaces);
    } catch {
      setMutualFriends([]);
      setMutualSpaces([]);
    } finally {
      setLoadingMutuals(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && userId) {
      setActiveTab('about');
      // Opened with ids only (the mobile profile screen): a space member's
      // user comes from the space it was opened in, whose instance is the one
      // that id belongs to. Looking it up on the home instance would miss for
      // any member of a federated space.
      const fromSpace = !passedUser && memberSpaceId && memberUserId
        ? getProfileMember({ spaceId: memberSpaceId, userId: memberUserId })
        : undefined;
      const knownUser = passedUser ?? fromSpace?.row.user;
      // The instance that issued the row: every opener names it; a member
      // opened by ids alone is its space's.
      const origin = passedUser || !fromSpace ? passedOrigin : fromSpace.origin;
      setUserOrigin(origin);
      // Use a user already in hand (avoids 404 for federated users on local API)
      if (knownUser) {
        setUser(knownUser);
      } else {
        loadUser(userId, origin);
      }
      loadMutuals(userId, knownUser);
    }
  }, [isOpen, userId, passedUser, passedOrigin, memberSpaceId, memberUserId, loadUser, loadMutuals]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setUser(null);
      setUserOrigin('');
      setMutualFriends([]);
      setMutualSpaces([]);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closeModal]);

  const shownStatus = useShownStatus(user, userOrigin, user?.status);

  if (!isOpen || !user) return null;

  const { baseName, domain } = parseFederatedUsername(user.username);
  const displayName = user.displayName ?? baseName;

  // Banner. Another instance's assets are absolute URLs
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

  const handleSendMessage = async () => {
    try {
      const rowId = await openDirectMessage(user, userOrigin);
      useUIStore.getState().setShowDms(true);
      closeModal();
      navigate(`/channels/@me/${rowId}`);
    } catch (err) {
      addToast(t('social:sendMessage.failed', { reason: describeError(err) }), 'warning');
    }
  };

  const handleAddFriend = async () => {
    setFriendActionLoading(true);
    try {
      await sendFriendRequest(friendRequestTarget(user, userOrigin));
    } catch (err) {
      addToast(describeError(err), 'warning');
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (friendship.state !== 'friends') return;
    setFriendActionLoading(true);
    try { await removeFriend(friendship.friend, friendship.friend._instanceOrigin); }
    catch (err) { addToast(describeError(err), 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleCancelRequest = async () => {
    if (friendship.state !== 'outbound_pending') return;
    setFriendActionLoading(true);
    try { await cancelFriendRequest(friendship.request.id, friendship.request._instanceOrigin); }
    catch (err) { addToast(describeError(err), 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleAcceptRequest = async () => {
    if (friendship.state !== 'inbound_pending') return;
    setFriendActionLoading(true);
    try { await updateFriendRequest(friendship.request.id, friendship.request._instanceOrigin, 'accepted'); }
    catch (err) { addToast(describeError(err), 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleDeclineRequest = async () => {
    if (friendship.state !== 'inbound_pending') return;
    setFriendActionLoading(true);
    try { await updateFriendRequest(friendship.request.id, friendship.request._instanceOrigin, 'declined'); }
    catch (err) { addToast(describeError(err), 'warning'); }
    finally { setFriendActionLoading(false); }
  };

  const handleViewFriend = (friend: TaggedMutualFriend) => {
    const friendOrigin = friend._instanceOrigin;
    setUserOrigin(friendOrigin);
    setUser(friend);
    loadMutuals(friend.id, friend);
    setActiveTab('about');
    // Update modal data so re-opening preserves context
    useUIStore.getState().openModal('userProfile', { userId: friend.id, user: friend, origin: friendOrigin });
  };

  const handleGoToSpace = (spaceId: string) => {
    closeModal();
    navigate(`/channels/${spaceId}`);
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'about', label: t('social:profile.tabs.about') },
    { key: 'friends', label: t('social:profile.tabs.mutualFriends'), count: mutualFriends.length },
    { key: 'spaces', label: t('social:profile.tabs.mutualSpaces'), count: mutualSpaces.length },
  ];

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-surface-overlay" onClick={closeModal} />
      <div className="relative max-w-lg w-full mx-4 max-h-[calc(calc(100*var(--app-vh))-2rem)] flex flex-col glass-modal rounded-2xl animate-slide-up overflow-hidden">
        {/* Banner */}
        <div
          className="h-[100px] flex-shrink-0 relative"
          style={bannerSrc
            ? { backgroundImage: `url(${bannerSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: bannerFallback }
          }
        >
          {/* Close button */}
          <button
            onClick={closeModal}
            aria-label={t('common:actions.close')}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white grid place-items-center transition-colors duration-fast"
          >
            <Icon name="x" size="sm" />
          </button>
        </div>

        {/* Header (avatar + name) */}
        <div className="px-5 flex-shrink-0 relative">
          <Avatar
            src={user.avatar}
            name={displayName}
            size={96}
            status={shownStatus}
            userId={user.homeUserId ?? user.id}
            user={user}
            ring={{ width: 4, color: 'rgba(20,20,26,0.82)' }}
            className="mt-[-52px] mb-2"
          />

          <div className="mb-3">
            <ProfileSpaceNickname member={memberContext} />
            <span className="text-xl font-semibold leading-tight text-txt-primary">{displayName}</span>
            <div className="text-sm text-txt-tertiary mt-0.5">
              <Username username={user.username} showAt className="text-sm text-txt-tertiary" />
            </div>
            {user.customStatus && (
              <div className="text-compact text-txt-secondary italic mt-1">
                {replaceEmojiShortcodes(user.customStatus)}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-5 flex-shrink-0 border-b border-border-hard">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-compact font-medium transition-colors duration-fast relative ${
                  activeTab === tab.key
                    ? 'text-txt-primary'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && !loadingMutuals && (
                  <span className="ml-1.5 text-txt-tertiary tabular-nums">{tab.count}</span>
                )}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-tone rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 min-h-[200px]">
          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* Bio */}
              {user.bio && (
                <div>
                  <span className="text-xs font-medium text-txt-tertiary">
                    {t('social:profile.aboutMe')}
                  </span>
                  <ProfileBio bio={user.bio} />
                </div>
              )}

              <ProfileRoles roles={roles} />

              {/* Member Since */}
              <div>
                <span className="text-xs font-medium text-txt-tertiary">
                  {t('social:profile.memberSince')}
                </span>
                <div className="text-sm text-txt-secondary mt-1">
                  {f.formatLongDate(user.createdAt)}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'friends' && (
            <div>
              {loadingMutuals ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin w-5 h-5 text-txt-tertiary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : mutualFriends.length === 0 ? (
                <div className="text-center py-8 text-txt-tertiary text-compact">
                  {t('social:mutuals.noFriends')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {mutualFriends.map((friend) => {
                    const fname = friend.displayName ?? parseFederatedUsername(friend.username).baseName;
                    return (
                      <button
                        key={friend.id}
                        onClick={() => handleViewFriend(friend)}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-elevated hover:bg-interactive-hover transition-colors duration-fast text-left"
                      >
                        <Avatar
                          src={friend.avatar}
                          name={fname}
                          size={40}
                          status={friend.status as 'online' | 'idle' | 'dnd' | 'offline' | null}
                          userId={friend.homeUserId ?? friend.id}
                          avatarColor={friend.avatarColor}
                        />
                        <div className="min-w-0">
                          <div className="text-compact font-medium text-txt-primary truncate">
                            {fname}
                          </div>
                          <div className="text-2xs text-txt-tertiary">
                            {presenceLabel(t, friend.status)}
                          </div>
                          {friend._instanceOrigin && (
                            <div className="flex items-center gap-1 text-2xs text-txt-tertiary truncate">
                              <Icon name="globe" size="xs" />
                              <span className="truncate">{(() => { try { return new URL(friend._instanceOrigin).host; } catch { return '?'; } })()}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'spaces' && (
            <div>
              {loadingMutuals ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin w-5 h-5 text-txt-tertiary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : mutualSpaces.length === 0 ? (
                <div className="text-center py-8 text-txt-tertiary text-compact">
                  {t('social:mutuals.noSpaces')}
                </div>
              ) : (
                <div className="space-y-1">
                  {mutualSpaces.map((space) => {
                    const spaceApi = getApiForOrigin(space._instanceOrigin);
                    return (
                    <button
                      key={`${space.id}:${space._instanceOrigin}`}
                      onClick={() => handleGoToSpace(space.id)}
                      className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast text-left"
                    >
                      <div className="relative shrink-0">
                        {space.icon ? (
                          <img
                            src={space.icon.startsWith('http') ? space.icon : spaceApi.uploads.url(space.icon)}
                            alt={space.name}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-compact font-semibold text-white"
                            style={{ background: getSpaceGradient(space.id, space.name, space.avatarColor).gradient }}
                          >
                            {space.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {space._instanceOrigin && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-channel flex items-center justify-center">
                            <Icon name="globe" size="xs" className="text-txt-tertiary" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-compact font-medium text-txt-primary truncate">
                          {space.name}
                        </span>
                        {space._instanceOrigin && (
                          <span className="text-2xs text-txt-tertiary truncate flex items-center gap-1">
                            <Icon name="globe" size="xs" />
                            {(() => { try { return new URL(space._instanceOrigin).host; } catch { return '?'; } })()}
                          </span>
                        )}
                      </div>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons. Your own profile offers none: nobody messages or
            befriends themselves. */}
        {friendship.state !== 'self' && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-border-hard flex gap-2">
            {/* One primary per row: an inbound request's Accept takes it. */}
            <Button
              variant={friendship.state === 'inbound_pending' ? 'secondary' : 'primary'}
              icon="message-square"
              onClick={handleSendMessage}
              className="flex-1"
            >
              {t('social:profile.sendMessage')}
            </Button>

            {friendship.state === 'none' && (
              <Button variant="secondary" icon="user-plus" onClick={handleAddFriend} disabled={friendActionLoading} className="flex-1">
                {friendActionLoading ? '...' : t('social:profile.addFriend')}
              </Button>
            )}

            {friendship.state === 'outbound_pending' && (
              <Button variant="ghost" onClick={handleCancelRequest} disabled={friendActionLoading} className="flex-1">
                {friendActionLoading ? '...' : t('social:request.cancel')}
              </Button>
            )}

            {friendship.state === 'inbound_pending' && (
              <>
                <Button variant="ghost" onClick={handleDeclineRequest} disabled={friendActionLoading}>
                  {friendActionLoading ? '...' : t('social:request.ignore')}
                </Button>
                <Button variant="primary" onClick={handleAcceptRequest} disabled={friendActionLoading} className="flex-1">
                  {friendActionLoading ? '...' : t('common:actions.accept')}
                </Button>
              </>
            )}

            {friendship.state === 'friends' && (
              <Button variant="danger" icon="user-minus" onClick={handleRemoveFriend} disabled={friendActionLoading} className="flex-1">
                {friendActionLoading ? '...' : t('social:friend.remove')}
              </Button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

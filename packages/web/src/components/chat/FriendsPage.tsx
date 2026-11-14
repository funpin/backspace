import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@backspace/shared';
import { friendEntryOf, isIncomingRequest, isOutgoingRequest, pendingRequestWith, useSocialStore, type TaggedFriend, type TaggedFriendRequest, type TaggedUser } from '../../stores/socialStore';
import { useAuthStore } from '../../stores/authStore';
import { useDiscoverStore, type TaggedDiscoverUser } from '../../stores/discoverStore';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { describeError } from '../../i18n/errors';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useFederationStore } from '../../stores/federationStore';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Badge, Tag } from '../ui/Tag';
import { MemberListToggleButton } from '../layout/MemberListToggleButton';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { getAvatarGradient } from '../../utils/gradients';
import { Mascot } from '../ui/Mascot';
import { useActivityStore, activitiesFor } from '../../stores/activityStore';
import { ActivityCard, hasRichActivity, getActivityAccentClass } from '../ui/ActivityCard';
import { getPrimaryActivity } from '@backspace/shared/src/activities.js';
import { parseFederatedUsername, isFederationGlobeApplicable, userDisplayName, type IdentityFields } from '../../utils/identity';
import { openDirectMessage } from '../../utils/openDirectMessage';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { friendRequestTarget } from '../../utils/friendRequestTarget';
import { replaceEmojiShortcodes, useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { presenceLabel } from '../../i18n/presence';

type SocialT = TFunction<['social', 'common']>;

function ActivityFriendItem({
  friend,
  isOffline,
  activities,
  isRichActivity,
  accentClass,
  mobile,
  onMobileClick,
  onDmClick,
}: {
  friend: TaggedFriend;
  isOffline: boolean;
  activities: import('@backspace/shared').Activity[];
  isRichActivity: boolean;
  accentClass: string;
  mobile?: boolean;
  onMobileClick: (friend: TaggedFriend) => void;
  onDmClick: (person: IdentityFields, origin: string) => void;
}) {
  const canonical = useCanonicalUserView(friend as unknown as User, friend._instanceOrigin);
  const friendDisplayName = userDisplayName(canonical);

  const rowClass = isRichActivity
    ? `flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 cursor-pointer transition-colors duration-fast glass-pill border-l-2 ${accentClass}`
    : 'flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-interactive-hover cursor-pointer transition-colors duration-fast active:bg-interactive-active';

  return (
    <div
      onClick={() => {
        if (mobile) {
          onMobileClick(friend);
        } else {
          onDmClick(friend, friend._instanceOrigin);
        }
      }}
      className={rowClass}
    >
      <Avatar
        src={canonical.avatar}
        name={friendDisplayName}
        size={36}
        status={isOffline ? 'offline' : canonical.status}
        className={isOffline ? 'opacity-60' : undefined}
        userId={canonical.homeUserId ?? canonical.id}
        avatarColor={canonical.avatarColor}
      />
      <div className="flex-1 min-w-0">
        <span className={`text-sm leading-[1.2] font-medium truncate ${isOffline ? 'text-txt-tertiary' : 'text-txt-primary'}`}>{friendDisplayName}</span>
        {!isOffline && isFederationGlobeApplicable(canonical) && (
          <div className="text-2xs text-txt-tertiary truncate">@{parseFederatedUsername(canonical.username).domain}</div>
        )}
        {!isOffline && (
          <ActivityCard
            activities={activities}
            fallbackCustomStatus={canonical.customStatus}
          />
        )}
      </div>
    </div>
  );
}

type Tab = 'online' | 'all' | 'pending' | 'add' | 'activity';

function tabLabel(t: SocialT, tab: Tab): string {
  switch (tab) {
    case 'online': return t('common:states.online');
    case 'all': return t('social:tabs.all');
    case 'pending': return t('social:tabs.pending');
    case 'add': return t('social:tabs.add');
    case 'activity': return t('social:tabs.activity');
  }
}

interface FriendsPageProps {
  mobile?: boolean;
}

export function FriendsPage({ mobile }: FriendsPageProps) {
  const { t } = useTranslation(['social', 'common']);
  const [activeTab, setActiveTab] = useState<Tab>('online');
  const [pendingUnfriend, setPendingUnfriend] = useState<{ friend: TaggedFriend; name: string } | null>(null);
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  // If the user clicked "Retry your friend request" in the Connections panel
  // and we just navigated here, the federation store carries the original
  // target. Switching to the Add tab makes the AddFriendTab mount, which then
  // consumes the prefill into its query input. We only check on mount — the
  // store value is one-shot (cleared by AddFriendTab on consume).
  useEffect(() => {
    if (useFederationStore.getState().pendingFriendAddPrefill) {
      setActiveTab('add');
    }
  }, []);

  const {
    friends,
    requests,
    isLoading,
    loadFriends,
    loadRequests,
    updateFriendRequest,
    cancelFriendRequest,
    removeFriend
  } = useSocialStore();

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  const userActivities = useActivityStore((s) => s.userActivities);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);

  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const pendingIncoming = requests.filter(r => r.status === 'pending' && isIncomingRequest(r));
  const pendingOutgoing = requests.filter(r => r.status === 'pending' && isOutgoingRequest(r));

  const handleOpenDm = async (person: IdentityFields, origin: string) => {
    try {
      const rowId = await openDirectMessage(person, origin);
      useUIStore.getState().setShowDms(true);
      navigate(`/channels/@me/${rowId}`);
    } catch (err) {
      addToast(t('social:sendMessage.failed', { reason: describeError(err) }), 'warning');
    }
  };

  const renderTabContent = () => {
    if (isLoading && friends.length === 0 && requests.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      );
    }

    switch (activeTab) {
      case 'online':
        return (
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-xs font-medium text-txt-tertiary mb-3 px-2">
              {t('social:sections.online', { n: onlineFriends.length })}
            </h2>
            {onlineFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-80">
                <Mascot state="idle" className="w-32 h-32 mb-4" />
                <p className="text-txt-tertiary text-sm">{t('social:empty.online')}</p>
              </div>
            ) : (
              <>
                {onlineFriends.map(friend => (
                  <FriendItem key={`${friend.id}:${friend._instanceOrigin}`} friend={friend} onRemove={() => setPendingUnfriend({ friend, name: userDisplayName(friend) })} onDm={() => handleOpenDm(friend, friend._instanceOrigin)} />
                ))}
              </>
            )}
          </div>
        );
      case 'all':
        return (
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-xs font-medium text-txt-tertiary mb-3 px-2">
              {t('social:sections.all', { n: friends.length })}
            </h2>
            {friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-80">
                <Mascot state="lonely" className="w-32 h-32 mb-4" />
                <p className="text-txt-tertiary text-sm">{t('social:empty.all')}</p>
              </div>
            ) : (
              <>
                {friends.map(friend => (
                  <FriendItem key={`${friend.id}:${friend._instanceOrigin}`} friend={friend} onRemove={() => setPendingUnfriend({ friend, name: userDisplayName(friend) })} onDm={() => handleOpenDm(friend, friend._instanceOrigin)} />
                ))}
              </>
            )}
          </div>
        );
      case 'pending':
        return (
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-xs font-medium text-txt-tertiary mb-3 px-2">
              {t('social:sections.pending', { n: pendingIncoming.length + pendingOutgoing.length })}
            </h2>
            {[...pendingIncoming, ...pendingOutgoing].length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-80">
                <Mascot state="sleeping" className="w-32 h-32 mb-4" />
                <p className="text-txt-tertiary text-sm">{t('social:empty.pending')}</p>
              </div>
            ) : (
              <>
                {pendingIncoming.map(req => (
                  <RequestItem
                    key={`${req.id}:${req._instanceOrigin}`}
                    request={req}
                    type="incoming"
                    onAccept={() => updateFriendRequest(req.id, req._instanceOrigin, 'accepted')}
                    onDecline={() => updateFriendRequest(req.id, req._instanceOrigin, 'declined')}
                  />
                ))}
                {pendingOutgoing.map(req => (
                  <RequestItem
                    key={`${req.id}:${req._instanceOrigin}`}
                    request={req}
                    type="outgoing"
                    onCancel={() => cancelFriendRequest(req.id, req._instanceOrigin)}
                  />
                ))}
              </>
            )}
          </div>
        );
      case 'add':
        return (
          <AddFriendTab
            onOpenDm={handleOpenDm}
          />
        );
      case 'activity': {
        const activeFriends: TaggedFriend[] = [];
        const idleFriends: TaggedFriend[] = [];
        const offlineActivityFriends: TaggedFriend[] = [];
        for (const f of friends) {
          if (f.status === 'offline') {
            offlineActivityFriends.push(f);
            continue;
          }
          const acts = activitiesFor(userActivities, f, f._instanceOrigin);
          const primary = getPrimaryActivity(acts);
          if (primary && primary.type !== 'custom') {
            activeFriends.push(f);
          } else {
            idleFriends.push(f);
          }
        }

        const renderActivityFriend = (friend: TaggedFriend, isOffline = false) => {
          const activities = activitiesFor(userActivities, friend, friend._instanceOrigin);
          const isRichActivity = !isOffline && hasRichActivity(activities);
          const primary = getPrimaryActivity(activities);
          const accentClass = primary ? getActivityAccentClass(primary.type) : '';
          return (
            <ActivityFriendItem
              key={friend.id}
              friend={friend}
              isOffline={isOffline}
              activities={activities}
              isRichActivity={isRichActivity}
              accentClass={accentClass}
              mobile={mobile}
              onMobileClick={(person) => pushMobileScreen('user-profile', { userId: person.id, origin: person._instanceOrigin })}
              onDmClick={handleOpenDm}
            />
          );
        };

        return (
          <div className="flex-1 overflow-y-auto p-4">
            {activeFriends.length === 0 && idleFriends.length === 0 && offlineActivityFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mascot state="sleeping" className="w-[100px] h-[100px]" />
                <div className="text-sm text-txt-tertiary mt-4 max-w-[240px]">
                  {t('social:empty.activity')}
                </div>
              </div>
            ) : (
              <>
                {activeFriends.length > 0 && (
                  <div className="mb-4">
                    <h2 className="text-xs font-medium text-txt-tertiary mb-2 px-2">
                      {t('social:sections.active', { n: activeFriends.length })}
                    </h2>
                    {activeFriends.map(f => renderActivityFriend(f))}
                  </div>
                )}
                {idleFriends.length > 0 && (
                  <div className="mb-4">
                    <h2 className="text-xs font-medium text-txt-tertiary mb-2 px-2">
                      {t('social:sections.online', { n: idleFriends.length })}
                    </h2>
                    {idleFriends.map(f => renderActivityFriend(f))}
                  </div>
                )}
                {offlineActivityFriends.length > 0 && (
                  <div>
                    <h2 className="text-xs font-medium text-txt-tertiary mb-2 px-2">
                      {t('social:sections.offline', { n: offlineActivityFriends.length })}
                    </h2>
                    {offlineActivityFriends.map(f => renderActivityFriend(f, true))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }
    }
  };

  const popMobileScreen = useUIStore((s) => s.popMobileScreen);

  return (
    <div className="flex-1 flex flex-col bg-surface-chat h-full">
      {/* Header */}
      {mobile ? (
        <div className="h-12 px-3 flex items-center gap-2 border-b border-border-hard flex-shrink-0 z-raised bg-surface-base">
          <IconButton icon="chevron-left" label={t('common:actions.back')} onClick={popMobileScreen} />
          <span className="font-semibold text-sm text-txt-primary">{t('common:labels.friends')}</span>
        </div>
      ) : (
        <div className="h-12 px-4 flex items-center border-b border-border-hard flex-shrink-0 z-raised bg-surface-chat">
          <div className="flex items-center gap-2 mr-4">
            <Icon name="users" className="text-txt-tertiary" />
            <span className="text-lg font-semibold text-txt-primary">{t('common:labels.friends')}</span>
          </div>
          <div className="w-px h-6 bg-border-hard mx-2" />
          <div className="flex items-center gap-2.5 ml-2">
            {/* The switch covers the three lists; Add Friend is an action beside
                it, so with that tab open no segment is marked. */}
            <Tabs<Tab>
              label={t('common:labels.friends')}
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { value: 'online', label: t('common:states.online') },
                { value: 'all', label: t('social:tabs.all') },
                {
                  value: 'pending',
                  label: (
                    <>
                      {t('social:tabs.pending')}
                      {pendingIncoming.length > 0 && (
                        <Badge count={pendingIncoming.length} className="ml-1.5 align-middle" />
                      )}
                    </>
                  ),
                },
              ]}
            />
            <Button
              variant={activeTab === 'add' ? 'secondary' : 'primary'}
              size="sm"
              icon="user-plus"
              aria-pressed={activeTab === 'add'}
              onClick={() => setActiveTab('add')}
            >
              {t('social:tabs.add')}
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <MemberListToggleButton />
          </div>
        </div>
      )}

      {/* Mobile tab bar */}
      {mobile && (
        <div className="flex border-b border-border-hard">
          {(['online', 'all', 'pending', 'add', 'activity'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors duration-fast ${
                activeTab === tab
                  ? 'border-accent-tone text-txt-primary'
                  : 'border-transparent text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {tabLabel(t, tab)}
              {tab === 'pending' && pendingIncoming.length > 0 && (
                <Badge count={pendingIncoming.length} className="ml-1.5 align-middle" />
              )}
            </button>
          ))}
        </div>
      )}

      {renderTabContent()}

      <ConfirmDialog
        isOpen={pendingUnfriend !== null}
        onClose={() => setPendingUnfriend(null)}
        onConfirm={async () => {
          if (pendingUnfriend) {
            await removeFriend(pendingUnfriend.friend, pendingUnfriend.friend._instanceOrigin);
            setPendingUnfriend(null);
          }
        }}
        title={t('social:removeFriend.title')}
        description={t('social:removeFriend.description', { name: pendingUnfriend?.name ?? t('social:removeFriend.fallbackName') })}
        confirmLabel={t('common:actions.remove')}
        variant="danger"
      />
    </div>
  );
}

// ─── Add Friend Tab ─────────────────────────────────────────────────────────

function AddFriendTab({
  onOpenDm,
}: {
  onOpenDm: (person: IdentityFields, origin: string) => void;
}) {
  const { t } = useTranslation(['social', 'common']);
  const searchUsers = useSocialStore((s) => s.searchUsers);
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const friends = useSocialStore((s) => s.friends);
  const requests = useSocialStore((s) => s.requests);
  const currentUser = useAuthStore((s) => s.user);
  const instances = useInstanceStore((s) => s.instances);
  const addToast = useUIStore((s) => s.addToast);

  const discoverUsers = useDiscoverStore((s) => s.users);
  const discoverLoading = useDiscoverStore((s) => s.isLoading);
  const fetchDiscoverUsers = useDiscoverStore((s) => s.fetchUsers);
  const updateRelationship = useDiscoverStore((s) => s.updateRelationship);

  const [query, setQuery] = useState(() => {
    // Consume the federation store's pending friend-add prefill at mount so
    // a Retry click in the Connections panel lands here with the original
    // target already in the input. The consume call clears the store value
    // so subsequent mounts (e.g. tab switching) start empty.
    return useFederationStore.getState().consumePendingFriendAddPrefill() ?? '';
  });
  const [rawSearchResults, setRawSearchResults] = useState<TaggedUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [directAddLoading, setDirectAddLoading] = useState(false);

  // Fetch discover on mount
  useEffect(() => {
    fetchDiscoverUsers();
  }, [fetchDiscoverUsers]);

  // Debounced search with race condition guard
  useEffect(() => {
    if (!query.trim()) {
      setRawSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let isActive = true;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const results = await searchUsers(query.trim());
      if (isActive) {
        setRawSearchResults(results);
        setSearchLoading(false);
      }
    }, 300);
    return () => { isActive = false; clearTimeout(timer); };
  }, [query, searchUsers]);

  // Self-exclusion set
  const selfIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentUser?.id) ids.add(`${currentUser.id}:`);
    for (const inst of instances) {
      if (inst.user?.id) ids.add(`${inst.user.id}:${inst.origin}`);
    }
    return ids;
  }, [currentUser?.id, instances]);

  const isSearchMode = query.trim().length > 0;

  // Enrich search results with friend/request status at render time. A
  // result and a list entry are the same person when their `userKey`s match,
  // whichever instance's row each is shown by. A pending request's id is good
  // only on the instance that holds it, so a card with a request is shown by
  // that request's row of the person.
  const enrichedSearchResults: TaggedDiscoverUser[] = useMemo(() => {
    if (!isSearchMode) return [];
    return rawSearchResults
      .filter(u => !selfIds.has(`${u.id}:${u._instanceOrigin}`))
      .map(user => {
        if (friendEntryOf(friends, user, user._instanceOrigin)) {
          return { ...user, relationship: 'friends' as const, mutualFriendCount: 0, mutualSpaceCount: 0 };
        }
        const pending = pendingRequestWith(requests, user, user._instanceOrigin);
        if (pending?.user && (isOutgoingRequest(pending) || isIncomingRequest(pending))) {
          const shownBy = pending._instanceOrigin === user._instanceOrigin
            ? user
            : { ...pending.user, _instanceOrigin: pending._instanceOrigin };
          return {
            ...shownBy,
            relationship: isOutgoingRequest(pending) ? 'outbound_pending' as const : 'inbound_pending' as const,
            requestId: pending.id,
            mutualFriendCount: 0,
            mutualSpaceCount: 0,
          };
        }
        return { ...user, relationship: 'none' as const, mutualFriendCount: 0, mutualSpaceCount: 0 };
      });
  }, [rawSearchResults, friends, requests, selfIds, isSearchMode]);

  const trimmedQuery = query.trim();
  const directAt = trimmedQuery.lastIndexOf('@');
  // Allow bare handle (no @) or @ at non-edge position; hide @, @bob, bob@.
  const showDirectAdd = trimmedQuery.length > 0
    && (directAt === -1 || (directAt > 0 && directAt < trimmedQuery.length - 1));
  // Bare handle gets the home host appended for display only — submission
  // still uses the raw trimmed query.
  const directAddDisplay = directAt === -1
    ? `${trimmedQuery}@${window.location.host}`
    : trimmedQuery;

  // Direct Add handler
  const handleDirectAdd = async () => {
    setDirectAddLoading(true);
    try {
      await sendFriendRequest({ username: query.trim() });
      addToast(t('social:request.sent'), 'success');
      setQuery('');
    } catch (err) {
      addToast(describeError(err), 'warning');
    } finally {
      setDirectAddLoading(false);
    }
  };

  // No-op relationship change for search mode cards (useMemo re-derives from store)
  const noopRelationshipChange = useCallback(() => {}, []);

  // Determine which list to display
  const displayUsers = isSearchMode ? enrichedSearchResults : discoverUsers;
  const displayLoading = isSearchMode ? searchLoading : discoverLoading;
  const emptyLabel = isSearchMode
    ? t('social:add.noSearchResults')
    : t('social:add.noDiscoverable');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 pb-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Icon name="user-plus" className="text-txt-tertiary" />
          <h2 className="text-lg font-semibold text-txt-primary">{t('social:add.title')}</h2>
        </div>
        <p className="text-sm text-txt-tertiary mb-4">
          <Trans
            t={t}
            i18nKey="social:add.hint"
            components={{ handle: <span className="font-medium text-txt-secondary" /> }}
          />
        </p>

        {/* Unified search input */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder={t('social:add.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-search w-full px-4 py-3 pr-10 rounded-lg"
          />
          {query && (
            <IconButton
              icon="x"
              size="sm"
              label={t('common:actions.clear')}
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            />
          )}
        </div>

        {/* Direct Add action row */}
        {showDirectAdd && (
          <div className="bg-surface-elevated rounded-xl p-2.5 mb-4 flex items-center gap-2.5">
            <Icon name="user-plus" className="text-txt-tertiary" />
            <div className="flex-1 min-w-0 text-sm text-txt-secondary">
              <Trans
                t={t}
                i18nKey="social:add.direct"
                values={{ handle: directAddDisplay }}
                components={{ handle: <span className="font-semibold text-txt-primary" /> }}
              />
            </div>
            <Button variant="primary" size="sm" onClick={handleDirectAdd} disabled={directAddLoading} className="flex-shrink-0">
              {directAddLoading ? t('social:request.sending') : t('social:add.sendRequest')}
            </Button>
          </div>
        )}
      </div>

      {/* Results grid */}
      <div className="px-6 pb-6">
        {!isSearchMode && (
          <div className="flex items-center gap-2 mb-4">
            <Icon name="compass" size="sm" className="text-txt-tertiary" />
            <span className="text-xs font-medium text-txt-tertiary">{t('social:add.discover')}</span>
          </div>
        )}

        {displayLoading && displayUsers.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 opacity-60">
            <Icon name="users" size="lg" className="text-txt-tertiary mb-2" />
            <p className="text-txt-tertiary text-sm">{emptyLabel}</p>
          </div>
        ) : (
          <div className="card-grid">
            {isSearchMode
              ? enrichedSearchResults.map((user) => (
                  <UserDiscoverCard
                    key={`${user.id}:${user._instanceOrigin}`}
                    user={user}
                    onOpenDm={onOpenDm}
                    onRelationshipChange={noopRelationshipChange}
                  />
                ))
              : discoverUsers.map((user) => (
                  <UserDiscoverCard
                    key={`${user.id}:${user._instanceOrigin}`}
                    user={user}
                    onOpenDm={onOpenDm}
                    onRelationshipChange={updateRelationship}
                  />
                ))
            }
          </div>
        )}
      </div>

    </div>
  );
}

// ─── User Discover Card ─────────────────────────────────────────────────────

function UserDiscoverCard({
  user,
  onOpenDm,
  onRelationshipChange,
}: {
  user: TaggedDiscoverUser;
  onOpenDm: (person: IdentityFields, origin: string) => void;
  onRelationshipChange: (userId: string, origin: string, relationship: TaggedDiscoverUser['relationship'], requestId?: string) => void;
}) {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['social', 'common']);
  const sendFriendRequest = useSocialStore((s) => s.sendFriendRequest);
  const updateFriendRequest = useSocialStore((s) => s.updateFriendRequest);
  const cancelFriendRequest = useSocialStore((s) => s.cancelFriendRequest);
  const openModal = useUIStore((s) => s.openModal);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const displayName = userDisplayName(user);
  const gradient = getAvatarGradient(user.homeUserId ?? user.id, displayName, user.avatarColor);
  const originLabel = user._instanceOrigin
    ? (() => { try { return new URL(user._instanceOrigin).host; } catch { return user._instanceOrigin; } })()
    : null;

  const avatarUrl = user.avatar
    ? (user.avatar.startsWith('http') || user.avatar.startsWith('/') ? user.avatar : `/api/uploads/${user.avatar}`)
    : null;
  const bannerUrl = user.banner
    ? (user.banner.startsWith('http') || user.banner.startsWith('/') ? user.banner : `/api/uploads/${user.banner}`)
    : null;

  const handleSendRequest = async () => {
    setActionLoading(true);
    setError('');
    try {
      const requestId = await sendFriendRequest(friendRequestTarget(user, user._instanceOrigin));
      onRelationshipChange(user.id, user._instanceOrigin, 'outbound_pending', requestId);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      await updateFriendRequest(user.requestId, user._instanceOrigin, 'accepted', user);
      onRelationshipChange(user.id, user._instanceOrigin, 'friends');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      await updateFriendRequest(user.requestId, user._instanceOrigin, 'declined', user);
      onRelationshipChange(user.id, user._instanceOrigin, 'none');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!user.requestId) return;
    setActionLoading(true);
    setError('');
    try {
      await cancelFriendRequest(user.requestId, user._instanceOrigin, user);
      onRelationshipChange(user.id, user._instanceOrigin, 'none');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenProfile = () => {
    openModal('userProfile', { userId: user.id, user, origin: user._instanceOrigin });
  };

  const handleMessage = () => {
    onOpenDm(user, user._instanceOrigin);
  };

  return (
    <div className="bg-surface-elevated rounded-xl overflow-hidden flex flex-col">
      {/* Banner area */}
      <div className="h-24 relative overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradient.gradient }} />
        )}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-surface-elevated/90 to-transparent" />
        {originLabel && (
          <div className="absolute top-2 right-2 z-[2]">
            <Tag tone="onMedia">
              <Icon name="globe" size="xs" />
              {originLabel}
            </Tag>
          </div>
        )}
      </div>

      {/* Overlapping avatar */}
      <div className="relative px-3.5 -mt-6 z-raised">
        <button onClick={handleOpenProfile} className="block">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-11 h-11 rounded-full object-cover ring-[3px] ring-surface-elevated"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full ring-[3px] ring-surface-elevated flex items-center justify-center text-lg font-semibold text-white/90"
              style={{ background: gradient.gradient }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="px-3.5 pt-1.5 pb-3.5 flex flex-col flex-1">
        <button onClick={handleOpenProfile} className="text-left group">
          <h3 className="text-sm font-semibold text-txt-primary truncate group-hover:underline">{displayName}</h3>
          <p className="text-xs text-txt-tertiary truncate">@{user.username}</p>
        </button>

        {user.bio && (
          <p className="text-compact text-txt-secondary line-clamp-2 mt-1.5 flex-1">{replaceEmojiShortcodes(user.bio)}</p>
        )}
        {!user.bio && <div className="flex-1" />}

        {/* Mutuals */}
        {(user.mutualFriendCount > 0 || user.mutualSpaceCount > 0) && (
          <div className="flex items-center gap-2 text-xs text-txt-tertiary mt-2 mb-2.5">
            {user.mutualFriendCount > 0 && (
              <span>{t('social:mutuals.friends', { count: user.mutualFriendCount })}</span>
            )}
            {user.mutualFriendCount > 0 && user.mutualSpaceCount > 0 && (
              <span aria-hidden="true">·</span>
            )}
            {user.mutualSpaceCount > 0 && (
              <span>{t('social:mutuals.spaces', { count: user.mutualSpaceCount })}</span>
            )}
          </div>
        )}
        {user.mutualFriendCount === 0 && user.mutualSpaceCount === 0 && <div className="mt-2" />}

        {/* Error */}
        {error && (
          <div className="text-xs text-status-danger mb-1.5 truncate">{error}</div>
        )}

        {/* Action button */}
        {user.relationship === 'none' && (
          <Button variant="primary" fullWidth onClick={handleSendRequest} disabled={actionLoading}>
            {actionLoading ? t('social:request.sending') : t('social:request.send')}
          </Button>
        )}
        {user.relationship === 'outbound_pending' && (
          <Button variant="secondary" fullWidth onClick={handleCancelRequest} disabled={actionLoading || !user.requestId}>
            {actionLoading ? t('social:request.cancelling') : t('social:request.pending')}
          </Button>
        )}
        {user.relationship === 'inbound_pending' && (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={handleDecline} disabled={actionLoading}>
              {t('common:actions.decline')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleAccept} disabled={actionLoading}>
              {t('common:actions.accept')}
            </Button>
          </div>
        )}
        {user.relationship === 'friends' && (
          <Button variant="secondary" fullWidth icon="message-square" onClick={handleMessage}>
            {t('social:friend.message')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function FriendItem({ friend, onRemove, onDm }: { friend: TaggedFriend, onRemove: () => void, onDm: () => void }) {
  const { t } = useTranslation(['social', 'common']);
  const canonical = useCanonicalUserView(friend as unknown as User, friend._instanceOrigin);
  const instanceLabel = friend._instanceOrigin ? (() => { try { return new URL(friend._instanceOrigin).host; } catch { return friend._instanceOrigin; } })() : '';
  const friendDisplayName = userDisplayName(canonical);
  return (
    <div className="flex items-center justify-between gap-3 px-2 h-[54px] rounded-lg hover:bg-interactive-hover group transition-colors duration-fast border-t border-border-hard mx-2">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={canonical.avatar} name={friendDisplayName} size={32} status={canonical.status} userId={canonical.homeUserId ?? canonical.id} avatarColor={canonical.avatarColor} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-txt-primary font-semibold text-sm truncate">{friendDisplayName}</span>
            <span className="text-txt-tertiary text-xs truncate">@{friend.username}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-txt-tertiary">{presenceLabel(t, friend.status)}</span>
            {instanceLabel && (
              <span className="text-xs text-txt-tertiary truncate">{t('social:friend.viaInstance', { host: instanceLabel })}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <IconButton
          icon="message-square"
          label={t('social:friend.message')}
          className="bg-surface-elevated"
          onClick={(e) => { e.stopPropagation(); onDm(); }}
        />
        <IconButton
          icon="user-minus"
          label={t('social:friend.remove')}
          className="bg-surface-elevated"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        />
      </div>
    </div>
  );
}

function RequestItem({ request, type, onAccept, onDecline, onCancel }: {
  request: TaggedFriendRequest;
  type: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation(['social', 'common']);
  const rawUser = request.user;
  const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;
  const canonicalUser = useCanonicalUserView((rawUser as unknown as User | null) ?? _FALLBACK_USER, request._instanceOrigin);
  const user = rawUser ? canonicalUser : null;
  if (!user) return null;
  const instanceLabel = request._instanceOrigin ? (() => { try { return new URL(request._instanceOrigin).host; } catch { return request._instanceOrigin; } })() : '';
  const reqDisplayName = userDisplayName(user);

  return (
    <div className="flex items-center justify-between gap-3 px-2 h-[54px] rounded-lg hover:bg-interactive-hover group transition-colors duration-fast border-t border-border-hard mx-2">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={user.avatar} name={reqDisplayName} size={32} status={user.status as any} userId={user.homeUserId ?? user.id} avatarColor={user.avatarColor} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-txt-primary font-semibold text-sm truncate">{reqDisplayName}</span>
            <span className="text-txt-tertiary text-xs truncate">@{user.username}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-txt-tertiary">{type === 'incoming' ? t('social:request.incoming') : t('social:request.outgoing')}</span>
            {instanceLabel && (
              <span className="text-xs text-txt-tertiary truncate">{t('social:friend.viaInstance', { host: instanceLabel })}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {type === 'incoming' ? (
          <>
            <Button variant="ghost" size="sm" title={t('common:actions.decline')} onClick={() => onDecline?.()}>
              {t('common:actions.decline')}
            </Button>
            <Button variant="primary" size="sm" icon="check" title={t('common:actions.accept')} onClick={() => onAccept?.()}>
              {t('common:actions.accept')}
            </Button>
          </>
        ) : (
          <IconButton
            icon="x"
            label={t('social:request.cancel')}
            className="bg-surface-elevated"
            onClick={() => onCancel?.()}
          />
        )}
      </div>
    </div>
  );
}

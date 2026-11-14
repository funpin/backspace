import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useChatStore } from '../../stores/chatStore';
import { isIncomingRequest, useSocialStore } from '../../stores/socialStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useNavigate } from 'react-router-dom';
import { useInstanceUpdateBadge } from '../../hooks/useInstanceUpdateBadge';
import { useHubUpdateState } from '../../hooks/useHubUpdateState';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/Tag';

export function MobileBottomNav() {
  const { t } = useTranslation('mobile');
  const mobileScreen = useUIStore((s) => s.mobileScreen);
  const mobileStack = useUIStore((s) => s.mobileStack);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const navigate = useNavigate();

  // Badge data
  const unreadChannels = useChatStore((s) => s.unreadChannels);
  const voiceChannelIds = useSpaceStore((s) => s.voiceChannelIds);
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const readStates = useChatStore((s) => s.readStates);
  const requests = useSocialStore((s) => s.requests);
  const updateBadge = useInstanceUpdateBadge();
  // The Backspace row lives on the You screen, so its dot surfaces here.
  const hubUpdated = useHubUpdateState().state === 'updated';

  // Hide when any screen is pushed (chat, settings, friends, etc.)
  if (mobileStack.length > 0) return null;

  // Compute unread DM count
  const unreadDmCount = dmChannels.filter((dm) => {
    const lastMsgId = dm.lastMessage?.id;
    const readState = readStates.get(dm.id);
    return lastMsgId && (!readState || readState < lastMsgId);
  }).length;

  // Compute whether any space has unread text channels
  const hasUnreadSpaces = Array.from(unreadChannels).some(chId => !voiceChannelIds.has(chId));

  // Pending friend requests — filter for incoming only
  const pendingIncoming = requests.filter(r => r.status === 'pending' && isIncomingRequest(r));

  const handleTab = (tab: 'spaces' | 'dms' | 'you') => {
    setMobileTab(tab);
    if (tab === 'dms') navigate('/channels/@me');
    if (tab === 'spaces') {
      // Prefer `currentSpaceId` (the canonical "currently selected space" —
      // updated by URL routing, the space strip, SpaceInviteCard joins, etc.).
      // Fall back to `lastSelectedSpaceId`, the sticky memory that survives
      // navigating to `/channels/@me`. AppLayout's URL effect clears
      // `currentSpaceId` to null whenever the URL is `@me`; without the
      // sticky memory, returning to Spaces from a DM/Friends/Settings detour
      // would have nothing to anchor to and `MobileSpacesScreen`'s auto-select
      // would fall back to `spaces[0]`.
      const { currentSpaceId, lastSelectedSpaceId } = useSpaceStore.getState();
      const target = currentSpaceId ?? lastSelectedSpaceId;
      if (target) navigate(`/channels/${target}`);
      else navigate('/');
    }
  };

  const tabs = [
    {
      id: 'spaces' as const,
      label: t('nav.spaces'),
      icon: 'layout-grid' as const,
      badge: hasUnreadSpaces ? ('dot' as const) : null,
    },
    {
      id: 'dms' as const,
      label: t('nav.dms'),
      icon: 'message-circle' as const,
      badge: unreadDmCount > 0 ? unreadDmCount : null,
    },
    {
      id: 'you' as const,
      label: t('nav.you'),
      icon: 'user' as const,
      badge: (pendingIncoming.length > 0 || updateBadge || hubUpdated) ? ('dot' as const) : null,
    },
  ];

  return (
    <nav
      className="glass-bubble flex items-center justify-around shrink-0"
      style={{
        paddingBottom: 'var(--safe-bottom)',
        height: 'calc(56px + var(--safe-bottom))',
      }}
    >
      {tabs.map((tab) => {
        const active = mobileScreen === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 self-stretch py-2 relative transition-colors duration-fast ${
              active ? 'text-txt-primary' : 'text-txt-tertiary'
            }`}
          >
            {/* The 3px mark of the open tab, on the bar's top edge. */}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-6 rounded-full bg-accent-tone" aria-hidden="true" />
            )}
            <div className="relative">
              <Icon name={tab.icon} size="lg" />
              {tab.badge === 'dot' && (
                <Badge className="absolute -top-0.5 -right-0.5" />
              )}
              {typeof tab.badge === 'number' && (
                <Badge count={tab.badge} className="absolute -top-1 -right-2" />
              )}
            </div>
            <span className="text-2xs font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

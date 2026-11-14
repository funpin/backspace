import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../stores/voiceStore';
import { useActiveDmCall } from '../../hooks/useActiveDmCall';
import { useUIStore } from '../../stores/uiStore';
import { useChatStore } from '../../stores/chatStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { TransferIndicator } from './TransferIndicator';
import { isMine, userDisplayName } from '../../utils/identity';
import { formatDmHeaderName, formatDmInputLabel, isDeletedPartnerDm } from '../../utils/dmFormatters';
import { DmDeletedNotice } from '../chat/DmDeletedNotice';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { canStartDmCall, startDmCall, cancelOutgoingDmCall, isDmCallRunning, joinDmCall } from '../../utils/voiceActions';
import { useDmViewer } from '../../hooks/useDmViewer';
import type { User } from '@backspace/shared';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

const FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;

interface MobileChatScreenProps {
  params?: Record<string, string>;
}

export function MobileChatScreen({ params }: MobileChatScreenProps) {
  const { t } = useTranslation(['mobile', 'spaces', 'dm', 'common']);
  const outgoingCall = useVoiceStore((s) => s.outgoingCall);
  // The DM call's conversation as this client opens it (never the call's key).
  const { dmChannelId: dmCallChannel } = useActiveDmCall();
  const canStartCall = useVoiceStore(canStartDmCall);
  const dmCallRunning = useVoiceStore((s) => !!params?.channelId && isDmCallRunning(s, params.channelId));
  const popMobileScreen = useUIStore((s) => s.popMobileScreen);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);

  const channelId = params?.channelId;
  const spaceId = params?.spaceId;
  const isDm = spaceId === '@me';

  const loadMessages = useChatStore((s) => s.loadMessages);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);
  const channels = useSpaceStore((s) => s.channels);
  const dmChannels = useSpaceStore((s) => s.dmChannels);

  useEffect(() => {
    if (!channelId) return;
    setCurrentChannel(channelId);
    loadMessages(channelId);
  }, [channelId, setCurrentChannel, loadMessages]);

  // Resolve the "main other member" of a 1:1 DM up-front so we can route it
  // through useCanonicalUserView (hook, must run unconditionally). Group DMs
  // don't get the cache treatment in the header — the comma-joined title falls
  // back to per-member parseFederatedUsername normalization, matching the
  // pattern in MobileDmsScreen.
  const dm = isDm && channelId ? dmChannels.find(d => d.id === channelId) : undefined;
  const viewer = useDmViewer(dm?.id);
  const otherMembers = dm ? dm.members.filter(m => !isMine(m, viewer.origin, viewer.self)) : [];
  const isGroup = !!dm?.ownerId;
  const rawMainOther = !isGroup ? otherMembers[0] : undefined;
  const canonicalMainOther = useCanonicalUserView((rawMainOther as unknown as User) ?? FALLBACK_USER, viewer.origin);
  const dmPartnerDeleted = dm ? isDeletedPartnerDm(dm, viewer) : false;
  // The header call button has five states, in this order of precedence:
  // in a call with this DM (opens the call screen), ringing this DM (cancels),
  // busy (disabled: `canStartDmCall` refuses while any DM call rings or runs,
  // including one ringing in from this DM), join (this DM's call already has
  // people in it), and idle (starts a call).
  const callState: 'inCall' | 'ringing' | 'join' | 'idle' | 'busy' =
    !!channelId && dmCallChannel === channelId ? 'inCall'
      : !!channelId && outgoingCall?.dmChannelId === channelId ? 'ringing'
        : !canStartCall ? 'busy' : dmCallRunning ? 'join' : 'idle';
  const handleCall = () => {
    if (!channelId || !dm || dmPartnerDeleted) return;
    if (callState === 'inCall') pushMobileScreen('voice-full');
    else if (callState === 'ringing') cancelOutgoingDmCall(channelId);
    else if (callState === 'join') joinDmCall(channelId);
    else startDmCall(channelId);
  };
  const callLabel = callState === 'inCall'
    ? t('mobile:chat.openCall')
    : callState === 'ringing' ? t('mobile:chat.cancelCall')
      : callState === 'join' ? t('spaces:main.dm.joinCall') : t('spaces:main.dm.startVoiceCall');
  const callChipClass = callState === 'inCall'
    ? 'bg-status-ok/20 text-status-ok group-hover:bg-status-ok/30'
    : callState === 'ringing'
      ? 'bg-status-danger/[0.14] text-status-danger group-hover:bg-status-danger/20'
      : callState === 'join' ? 'text-status-ok group-hover:text-status-ok/80'
        : callState === 'idle' ? 'text-txt-secondary group-hover:text-txt-primary' : 'text-txt-tertiary/60';

  // Resolve channel/DM name. Group DMs route through `formatDmHeaderName` so
  // a renamed group shows `dm.name` (previously this surface silently dropped
  // it and always rendered the joined-names fallback). 1-on-1 DMs keep the
  // canonical-view lookup so replicated aliases still surface the home
  // account's displayName.
  let channelName: string;
  let inputPlaceholder: string | undefined;
  if (isDm) {
    channelName = t('spaces:main.dm.fallbackName');
    if (dm && isGroup) {
      channelName = formatDmHeaderName(dm, viewer);
      inputPlaceholder = t('spaces:main.dm.composerPlaceholder', { target: formatDmInputLabel(dm, viewer) });
    } else if (dm && rawMainOther) {
      channelName = userDisplayName(canonicalMainOther);
      // Use the canonical `channelName` directly so header + placeholder stay
      // aligned even when the raw partner and canonical view disagree.
      inputPlaceholder = t('spaces:main.dm.composerPlaceholder', { target: `@${channelName}` });
    }
  } else {
    const ch = channelId ? channels.find(c => c.id === channelId) : undefined;
    channelName = ch?.name || t('mobile:chat.unknownChannel');
  }

  return (
    <div className="flex flex-col h-full bg-surface-chat">
      {/* Header */}
      <header className="h-12 flex items-center gap-2 px-3 border-b border-border-hard bg-surface-base shrink-0">
        <IconButton icon="chevron-left" label={t('common:actions.back')} noTitle onClick={popMobileScreen} />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-txt-primary truncate">
            {isDm ? channelName : `# ${channelName}`}
          </h1>
        </div>
        <TransferIndicator />
        {/* DM call button. The 44px button is the tap target; what is drawn is
            the inner 32px chip, so the header keeps one icon rhythm (-mx-1.5
            gives the extra tap area back to the gaps). Idle, join and busy are
            bare icons like the other header actions, join tinted mint; ringing
            and in-call get the round tinted chip the voice mini bar uses for
            its call controls. Ringing draws the hang-up glyph: the tap cancels. */}
        {dm && !dmPartnerDeleted && (
          <button
            type="button"
            onClick={handleCall}
            disabled={callState === 'busy'}
            className="group w-11 h-11 -mx-1.5 shrink-0 flex items-center justify-center rounded-full disabled:cursor-not-allowed"
            aria-label={callLabel}
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-fast ${callChipClass}`}>
              <Icon name={callState === 'ringing' ? 'phone-off' : 'phone'} size="lg" />
            </span>
          </button>
        )}
        {/* Members button — shown for space channels AND group DMs. 1-on-1
            DMs have no roster, so it stays hidden there. Tapping a space-
            channel button pushes the regular `members` screen; tapping a
            group-DM button pushes the new `group-dm-info` screen so the user
            lands on the full info + management surface. */}
        {(!isDm || isGroup) && (
          <IconButton
            icon="users"
            label={isDm && isGroup ? t('dm:groupInfo.title') : t('common:labels.members')}
            noTitle
            onClick={() => {
              if (isDm && isGroup && channelId) {
                pushMobileScreen('group-dm-info', { channelId });
              } else {
                pushMobileScreen('members');
              }
            }}
          />
        )}
      </header>

      {/* Messages + floating composer.
          Mirrors the desktop pattern in `MainContent.tsx`: a single relative
          flex-1 region holds both `<MessageList>` (filling the area) and
          `<MessageInput>` (floating glass-bubble at the bottom). The bubble
          is `position: absolute` and is positioned from `MessageInput.tsx`
          via the `useVisualViewportInset` hook so it lifts above the iOS
          soft keyboard when one is open and rests above the home-indicator
          safe-area when not. MessageList content carries `pb-20` so the last
          message can scroll fully into view above the bubble.
          TypingIndicator is rendered inside MessageInput itself (anchored
          `absolute bottom-full` to the bubble), so we don't render it here. */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {channelId && <MessageList channelId={channelId} />}
        {channelId && (dmPartnerDeleted
          ? <DmDeletedNotice />
          : <MessageInput channelId={channelId} channelName={channelName} placeholder={inputPlaceholder} />)}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSpaceStore } from '../../stores/spaceStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { VoiceGrid } from '../voice/VoiceGrid';
import { VoiceControlBar } from '../voice/VoiceControlBar';
import { VoiceChatToasts } from '../voice/VoiceChatToasts';
import { VoiceChatPanel } from '../voice/VoiceChatPanel';
import { FriendsPage } from '../chat/FriendsPage';
import { ExplorePage } from '../chat/ExplorePage';
import { ProjectHubPage } from '../projectHub/ProjectHubPage';
import { Avatar } from '../ui/Avatar';
import { AvatarStack } from '../ui/AvatarStack';
import { useVoiceStore } from '../../stores/voiceStore';
import { canStartDmCall, startDmCall, cancelOutgoingDmCall, isDmCallRunning, joinDmCall } from '../../utils/voiceActions';
import { useActiveDmCall } from '../../hooks/useActiveDmCall';
import { MemberListToggleButton } from './MemberListToggleButton';
import { TransferIndicator } from './TransferIndicator';
import { isMine, isFederationGlobeApplicable, userDisplayName } from '../../utils/identity';
import { useDmViewer } from '../../hooks/useDmViewer';
import { formatDmHeaderName, formatDmInputLabel, isDeletedPartnerDm } from '../../utils/dmFormatters';
import { DmDeletedNotice } from '../chat/DmDeletedNotice';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import type { User } from '@backspace/shared';
import { Tooltip } from '../ui/Tooltip';
import { joinVoiceChannel } from '../../utils/voice';
import { SearchPopover } from '../chat/SearchPopover';
import { ChannelNotificationButton } from '../notifications/ChannelNotificationButton';
import { ChannelHeaderTopic } from './ChannelHeaderTopic';
import { isDmChannel } from '../../stores/spaceStore';
import { usePointerReveal, VOICE_CHROME_ATTR } from '../../hooks/usePointerReveal';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

/** A 34px icon button of the channel header; the pressed state is added by the caller. */
const HEADER_BUTTON = 'w-[34px] h-[34px] inline-grid place-items-center rounded-lg transition-colors duration-fast flex-shrink-0';
const HEADER_BUTTON_IDLE = 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover';
const HEADER_TITLE = 'font-semibold text-lg text-txt-primary';

/**
 * Voice channel header, in both of its shapes.
 *
 * Docked it is a real row that reserves its own height. In fullscreen it
 * becomes a band floating over the video, so it must not reserve height and
 * must not swallow clicks: the band is `pointer-events-none` and only the
 * action buttons inside it opt back in. Visibility is driven by `revealed`
 * rather than `group-hover`, because the group fills the viewport in
 * fullscreen and would hold hover forever. `:focus-visible` inside it keeps it
 * reachable by keyboard (not `focus-within`: a button keeps focus after a
 * mouse click, and the band would then never fade), and pointers that cannot hover keep it up permanently.
 */
function voiceHeaderClassName(fullscreen: boolean, revealed: boolean): string {
  const base = 'h-12 px-4 flex items-center justify-between bg-surface-base transition-opacity duration-slow';
  if (!fullscreen) {
    return `${base} border-b border-border-hard flex-shrink-0`;
  }
  const overlay =
    'pointer-events-none absolute inset-x-0 top-0 z-30 border-b border-white/5 bg-gradient-to-b from-black/90 via-black/70 to-transparent';
  const visibility = revealed
    ? 'opacity-100'
    : 'opacity-0 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100 [@media(any-pointer:coarse)]:opacity-100';
  return `${base} ${overlay} ${visibility}`;
}

export function MainContent() {
  // 1. ALL HOOKS AT THE TOP
  const { t } = useTranslation(['spaces', 'common']);
  const channels = useSpaceStore((s) => s.channels);
  const currentChannelId = useChatStore((s) => s.currentChannelId);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const voiceChatOpen = useUIStore((s) => s.voiceChatOpen);
  const voiceFullscreen = useUIStore((s) => s.voiceFullscreen);
  const setVoiceFullscreen = useUIStore((s) => s.setVoiceFullscreen);
  const participants = useVoiceStore((s) => s.participants);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isLiveKitConnected = useVoiceStore((s) => s.isLiveKitConnected);
  const connectionError = useVoiceStore((s) => s.connectionError);
  const showDms = useUIStore((s) => s.showDms);
  const location = useLocation();
  const isExplorePage = location.pathname === '/explore';
  const isProjectHubPage = location.pathname === '/backspace';
  // The DM call's conversation as this client opens it (never the call's key).
  const { dmChannelId: dmCallChannel } = useActiveDmCall();
  const outgoingCall = useVoiceStore((s) => s.outgoingCall);
  const canStartCall = useVoiceStore(canStartDmCall);
  const dmCallRunning = useVoiceStore((s) => !!currentChannelId && isDmCallRunning(s, currentChannelId));
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  const openModal = useUIStore((s) => s.openModal);

  const voiceContainerRef = useRef<HTMLDivElement>(null);
  // Fullscreen chrome is revealed by pointer movement and hidden once the
  // pointer goes still. It cannot be `group-hover`: fullscreen makes this
  // container the whole viewport, so hover is true wherever the pointer is
  // and the chrome would never leave. See usePointerReveal.
  const chromeRevealed = usePointerReveal(voiceContainerRef, voiceFullscreen);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null);
  const clearJumpRequest = useCallback(() => setJumpToMessageId(null), []);

  // Resolve the DM header's "first other" member through the canonical view
  // cache. The hook must be called unconditionally at the component top, so we
  // pass a fallback when there is no current DM channel or 1-on-1 partner.
  const _dmChannel = dmChannels.find(dm => dm.id === currentChannelId);
  const dmViewer = useDmViewer(_dmChannel?.id);
  const _rawFirstOther = _dmChannel?.members.filter(m => !isMine(m, dmViewer.origin, dmViewer.self))[0] ?? null;
  const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;
  const _canonicalFirstOther = useCanonicalUserView(_rawFirstOther ?? _FALLBACK_USER, dmViewer.origin);

  // Reset search when channel changes
  useEffect(() => {
    setSearchOpen(false);
  }, [currentChannelId]);

  // Handle actual browser fullscreen API.
  //
  // iOS Safari (and iPadOS pre-16.4) does NOT implement the standard
  // `Element.requestFullscreen()` on generic elements. Older WebKit exposes a
  // `webkitRequestFullscreen` variant; pure iPhone has neither for a `<div>`
  // (only `HTMLVideoElement.webkitEnterFullscreen()` works, which we cannot use
  // for the multi-tile voice container). On those platforms we still want the
  // toggle to work as an in-page maximize: the `voiceFullscreen` flag flips the
  // container to `h-screen` so the call view fills the viewport — that's the
  // graceful fallback. Calling a missing API directly threw
  // `TypeError: requestFullscreen is not a function` on iPhone, taking down
  // the whole voice UI; the guards below contain the platform difference.
  type FullscreenCapableElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  type FullscreenCapableDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };

  const getFullscreenElement = useCallback((): Element | null => {
    const d = document as FullscreenCapableDocument;
    return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setVoiceFullscreen(!!getFullscreenElement());
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [setVoiceFullscreen, getFullscreenElement]);

  useEffect(() => {
    const el = voiceContainerRef.current as FullscreenCapableElement | null;
    const d = document as FullscreenCapableDocument;
    const inFullscreen = !!getFullscreenElement();

    const enter = async () => {
      if (!el) return;
      try {
        if (typeof el.requestFullscreen === 'function') {
          await el.requestFullscreen();
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          await Promise.resolve(el.webkitRequestFullscreen());
        }
        // If neither API exists (iPhone Safari / PWA standalone for non-video
        // elements), fall through silently — the `voiceFullscreen` flag still
        // applies `h-screen` to give an in-page maximize, which is the
        // documented graceful fallback.
      } catch (err) {
        // Permission denied, user gesture missing, or platform refusal. Keep
        // the in-page fallback (h-screen) without surfacing a console error.
        console.warn('Native fullscreen unavailable, using in-page fallback:', err);
      }
    };

    const exit = async () => {
      try {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
        } else if (typeof d.webkitExitFullscreen === 'function') {
          await Promise.resolve(d.webkitExitFullscreen());
        }
      } catch {
        // best-effort
      }
    };

    if (voiceFullscreen && el && !inFullscreen) {
      void enter();
    } else if (!voiceFullscreen && inFullscreen) {
      void exit();
    }
  }, [voiceFullscreen, getFullscreenElement]);

  // 2. LOGIC AND EARLY RETURNS
  const channel = channels.find(c => c.id === currentChannelId);
  const isVoiceChannel = channel?.type === 'voice';

  if (showDms || isExplorePage || isProjectHubPage || !currentSpaceId) {
    if (!currentChannelId) {
      return isExplorePage ? (
        <ExplorePage />
      ) : isProjectHubPage ? (
        <ProjectHubPage />
      ) : (
        <FriendsPage />
      );
    }

    const dmChannel = dmChannels.find(dm => dm.id === currentChannelId);
    const otherMembers = dmChannel?.members.filter(m => !isMine(m, dmViewer.origin, dmViewer.self)) ?? [];
    const isGroupDm = !!dmChannel?.ownerId;
    // Use the canonicalized view of the 1-on-1 partner (resolved above the
    // conditional so the hook is called unconditionally).
    const firstOther = _rawFirstOther ? _canonicalFirstOther : (otherMembers[0] ?? null);
    // Group DMs route through `formatDmHeaderName` (honors `dm.name`, falls
    // back to joined member names); 1-on-1 DMs keep the canonical-view path
    // so replicated aliases still surface the home-instance display name.
    const dmName = isGroupDm && dmChannel
      ? formatDmHeaderName(dmChannel, dmViewer)
      : ((firstOther && userDisplayName(firstOther)) || t('spaces:main.dm.fallbackName'));
    // Message-input placeholder — groups use `formatDmInputLabel` which
    // collapses unnamed groups to "the group" so the textarea doesn't render
    // "Message #Alice, Bob, Charlie, Dave". 1-on-1 reuses the canonical
    // `dmName` so the placeholder stays aligned with the header (the utility
    // resolves the raw partner; on replicated aliases the canonical view
    // can disagree).
    const dmInputPlaceholder = isGroupDm && dmChannel
      ? t('spaces:main.dm.composerPlaceholder', { target: formatDmInputLabel(dmChannel, dmViewer) })
      : dmChannel
        ? t('spaces:main.dm.composerPlaceholder', { target: `@${dmName}` })
        : undefined;
    const dmPartnerDeleted = dmChannel ? isDeletedPartnerDm(dmChannel, dmViewer) : false;

    const isInDmCall = !!currentChannelId && dmCallChannel === currentChannelId;
    const isCallingThisDm = outgoingCall?.dmChannelId === currentChannelId;

    // A DM whose call already has people in it gets a join button; starting
    // a second call there is what the server would refuse.
    // The video button does the same with the camera on once connected.
    const handleStartCall = (withCamera: boolean) => {
      if (!currentChannelId) return;
      if (dmCallRunning) joinDmCall(currentChannelId, { withCamera });
      else startDmCall(currentChannelId, { withCamera });
    };

    const handleCancelCall = () => {
      if (currentChannelId) cancelOutgoingDmCall(currentChannelId);
    };

    if (isInDmCall) {
      return (
        <div
          ref={voiceContainerRef}
          className={`flex-1 flex flex-col bg-surface-base min-w-0 group/voice relative overflow-hidden ${voiceFullscreen ? 'h-screen' : ''}`}
        >
          <div
            data-testid="voice-header-overlay"
            className={voiceHeaderClassName(voiceFullscreen, chromeRevealed)}
            {...(voiceFullscreen ? { [VOICE_CHROME_ATTR]: '' } : {})}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name="phone" className="text-txt-tertiary" />
              <span className={`${HEADER_TITLE} truncate`}>{dmName}</span>
              {connectionError ? (
                <span className="text-xs text-status-danger font-medium ml-2">{t('spaces:main.voice.connectionFailed')}</span>
              ) : isLiveKitConnected ? (
                <>
                  <span className="text-xs text-status-ok font-medium ml-2">{t('spaces:main.voice.connected')}</span>
                  <span className="text-xs text-txt-tertiary ml-1">{t('spaces:main.voice.inCall', { count: participants.length })}</span>
                </>
              ) : (
                <span className="text-xs text-status-warn font-medium ml-2">{t('spaces:main.voice.connecting')}</span>
              )}
            </div>
            <div className={`flex items-center gap-1 flex-shrink-0 ${voiceFullscreen ? 'pointer-events-auto mr-24' : ''}`}>
              <TransferIndicator />
              <MemberListToggleButton />
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className={`flex-1 min-w-0 flex relative ${voiceFullscreen ? '' : 'pb-20'}`}>
              <VoiceGrid participants={participants} chromeRevealed={chromeRevealed} />
              <VoiceControlBar revealed={chromeRevealed} />
              <VoiceChatToasts channelId={currentChannelId} />
            </div>
            {voiceChatOpen && !voiceFullscreen && (
              <VoiceChatPanel channelId={currentChannelId} channelName={`@${dmName}`} />
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col bg-surface-chat min-w-0 relative">
        {isCallingThisDm && (
          <div className="bg-status-ok/10 border-b border-status-ok/20 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="phone" className="text-status-ok animate-pulse" />
              <span className="text-status-ok text-sm font-medium">{t('spaces:main.dm.calling', { name: dmName })}</span>
            </div>
            <Button variant="danger-solid" size="sm" onClick={handleCancelCall}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        )}
        <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-border-hard flex-shrink-0 z-raised bg-surface-chat">
          <div className="flex items-center gap-2.5 min-w-0">
            {isGroupDm ? (
              <div
                onClick={() => openModal('groupDmSettings', { dmChannelId: currentChannelId, initialTab: 'overview' })}
                className="flex-shrink-0 cursor-pointer"
                aria-label={t('spaces:main.dm.openGroupSettings')}
              >
                <AvatarStack members={otherMembers} origin={dmViewer.origin} size={32} border="chat" iconUrl={dmChannel?.icon} />
              </div>
            ) : (
              <Icon name="user" className="text-txt-tertiary" />
            )}
            {isGroupDm ? (
              <span
                onClick={() => openModal('groupDmSettings', { dmChannelId: currentChannelId, initialTab: 'overview' })}
                className={`${HEADER_TITLE} truncate cursor-pointer`}
              >
                {dmName}
              </span>
            ) : (
              <span className={`${HEADER_TITLE} truncate`}>{dmName}</span>
            )}
            {!isGroupDm && firstOther && isFederationGlobeApplicable(firstOther) && (
              <Tooltip content={firstOther.username} position="bottom">
                <span className="text-txt-tertiary"><Icon name="globe" size="sm" /></span>
              </Tooltip>
            )}
            {isGroupDm && (() => {
              const federatedMembers = (dmChannel?.members ?? []).filter(m => isFederationGlobeApplicable(m));
              if (federatedMembers.length === 0) return null;
              return (
                <Tooltip content={federatedMembers.map(m => m.username).join(', ')} position="bottom">
                  <span className="text-txt-tertiary"><Icon name="globe" size="sm" /></span>
                </Tooltip>
              );
            })()}
            {isGroupDm && (
              <span
                onClick={() => openModal('groupDmSettings', { dmChannelId: currentChannelId, initialTab: 'members' })}
                className="text-xs text-txt-tertiary flex-shrink-0 cursor-pointer"
              >
                {t('spaces:main.dm.memberCount', { count: dmChannel?.members.length ?? 0 })}
              </span>
            )}
            {isGroupDm && (
              <IconButton
                icon="settings"
                size="sm"
                label={t('spaces:main.dm.groupSettings')}
                onClick={() => openModal('groupDmSettings', { dmChannelId: currentChannelId, initialTab: 'overview' })}
              />
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <TransferIndicator />
            {/* A 1-on-1 whose partner was deleted has nobody to ring, as on mobile. */}
            {!dmPartnerDeleted && (
              <>
                <button
                  onClick={() => handleStartCall(false)}
                  disabled={!canStartCall}
                  className={`${HEADER_BUTTON} hover:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed ${dmCallRunning ? 'text-status-ok' : 'text-txt-secondary hover:text-txt-primary'}`}
                  title={dmCallRunning ? t('spaces:main.dm.joinCall') : t('spaces:main.dm.startVoiceCall')}
                >
                  <Icon name="phone" />
                </button>
                <button
                  onClick={() => handleStartCall(true)}
                  disabled={!canStartCall}
                  className={`${HEADER_BUTTON} hover:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed ${dmCallRunning ? 'text-status-ok' : 'text-txt-secondary hover:text-txt-primary'}`}
                  title={dmCallRunning ? t('spaces:main.dm.joinCall') : t('spaces:main.dm.startVideoCall')}
                >
                  <Icon name="video" />
                </button>
              </>
            )}
            <button
              onClick={() => openModal('addDmMember', { dmChannelId: currentChannelId })}
              className={`${HEADER_BUTTON} ${HEADER_BUTTON_IDLE}`}
              title={t('spaces:main.dm.addFriends')}
            >
              <Icon name="user-plus" />
            </button>
            <button
              ref={searchButtonRef}
              onClick={() => setSearchOpen(!searchOpen)}
              className={`${HEADER_BUTTON} ${searchOpen ? 'text-txt-primary bg-interactive-active' : HEADER_BUTTON_IDLE}`}
              title={t('common:actions.search')}
            >
              <Icon name="search" />
            </button>
            <div className="w-px h-5 bg-border-hard mx-1" />
            <MemberListToggleButton />
          </div>
        </div>
        <MessageList channelId={currentChannelId} jumpToMessageId={jumpToMessageId} onJumpHandled={clearJumpRequest} />
        {dmPartnerDeleted
          ? <DmDeletedNotice />
          : <MessageInput channelId={currentChannelId} channelName={`@${dmName}`} placeholder={dmInputPlaceholder} />}
        <SearchPopover
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          anchorRef={searchButtonRef}
          channelId={currentChannelId}
          isDm={true}
          onJumpToMessage={(id) => { setJumpToMessageId(id); setSearchOpen(false); }}
        />
      </div>
    );
  }

  if (!currentChannelId || !channel) {
    return (
      <div className="flex-1 flex flex-col bg-surface-chat relative">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border-hard flex-shrink-0">
          <span className="text-sm text-txt-tertiary">{t('spaces:main.selectChannel')}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <TransferIndicator />
            <MemberListToggleButton />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-txt-tertiary">
          <p>{t('spaces:main.selectChannelHint')}</p>
        </div>
      </div>
    );
  }

  if (isVoiceChannel) {
    const isInThisChannel = currentVoiceChannelId === currentChannelId;

    if (!isInThisChannel) {
      return (
        <div className="flex-1 flex flex-col bg-surface-base">
          <div className="h-12 px-4 flex items-center justify-between border-b border-border-hard flex-shrink-0 bg-surface-base">
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name="volume-2" className="text-txt-tertiary" />
              <span className={`${HEADER_TITLE} truncate`}>{channel.name}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <TransferIndicator />
              <MemberListToggleButton />
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-8 relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent-tone)/0.10)_0%,transparent_70%)] animate-gradient-pulse pointer-events-none" />
            <div className="text-center relative z-[1]">
              <h2 className="text-2xl font-semibold text-txt-primary mb-2">{channel.name}</h2>
              <p className="text-txt-tertiary text-sm">{t('spaces:main.voice.empty')}</p>
            </div>
            <Button
              variant="primary"
              size="lg"
              icon="volume-2"
              className="relative z-[1] px-6"
              onClick={() => joinVoiceChannel(currentChannelId, useVoiceStore.getState().connectFn ?? undefined)}
            >
              {t('spaces:main.voice.join')}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={voiceContainerRef}
        className={`flex-1 flex flex-col bg-surface-base min-w-0 group/voice relative overflow-hidden ${voiceFullscreen ? 'h-screen' : ''}`}
      >
        <div
          data-testid="voice-header-overlay"
          className={voiceHeaderClassName(voiceFullscreen, chromeRevealed)}
          {...(voiceFullscreen ? { [VOICE_CHROME_ATTR]: '' } : {})}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="volume-2" className="text-txt-tertiary" />
            <span className={`${HEADER_TITLE} truncate`}>{channel.name}</span>
            {connectionError ? (
              <span className="text-xs text-status-danger font-medium ml-2">{t('spaces:main.voice.connectionFailed')}</span>
            ) : isLiveKitConnected ? (
              <>
                <span className="text-xs text-status-ok font-medium ml-2">{t('spaces:main.voice.connected')}</span>
                <span className="text-xs text-txt-tertiary ml-1">{t('spaces:main.voice.participants', { count: participants.length })}</span>
              </>
            ) : (
              <span className="text-xs text-status-warn font-medium ml-2">{t('spaces:main.voice.connecting')}</span>
            )}
          </div>
          <div className={`flex items-center gap-1 flex-shrink-0 ${voiceFullscreen ? 'pointer-events-auto mr-24' : ''}`}>
            <TransferIndicator />
            <MemberListToggleButton />
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className={`flex-1 min-w-0 flex relative ${voiceFullscreen ? '' : 'pb-20'}`}>
            <VoiceGrid participants={participants} chromeRevealed={chromeRevealed} />
            <VoiceControlBar revealed={chromeRevealed} />
            <VoiceChatToasts channelId={currentChannelId} />
          </div>
          {voiceChatOpen && !voiceFullscreen && (
            <VoiceChatPanel channelId={currentChannelId} channelName={channel.name} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-surface-chat min-w-0 relative">
      <div className="h-12 px-4 flex items-center justify-between gap-2 border-b border-border-hard flex-shrink-0 z-raised bg-surface-chat">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon name="hash" className="text-txt-tertiary" />
          <span className={`${HEADER_TITLE} truncate`}>{channel.name}</span>
          {channel.topic && (
            <ChannelHeaderTopic key={channel.id} channelName={channel.name} topic={channel.topic} />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <TransferIndicator />
          <ChannelNotificationButton channelId={currentChannelId} channelName={channel.name} />
          <button
            ref={searchButtonRef}
            onClick={() => setSearchOpen(!searchOpen)}
            className={`${HEADER_BUTTON} ${searchOpen ? 'text-txt-primary bg-interactive-active' : HEADER_BUTTON_IDLE}`}
            title={t('common:actions.search')}
          >
            <Icon name="search" />
          </button>
          <div className="w-px h-5 bg-border-hard mx-1" />
          <MemberListToggleButton />
        </div>
      </div>
      <MessageList channelId={currentChannelId} jumpToMessageId={jumpToMessageId} onJumpHandled={clearJumpRequest} />
      <MessageInput channelId={currentChannelId} channelName={channel.name} />
      <SearchPopover
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        anchorRef={searchButtonRef}
        channelId={currentChannelId}
        isDm={false}
        onJumpToMessage={(id) => { setJumpToMessageId(id); setSearchOpen(false); }}
      />
    </div>
  );
}

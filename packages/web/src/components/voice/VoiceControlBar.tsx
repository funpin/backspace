import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useSpaceStore, getChannelOrigin, getMyUserIdForOrigin } from '../../stores/spaceStore';
import { ScreenShareSettingsPopover } from './ScreenShareSettingsPopover';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import { handleMuteAction, handleDeafenAction, handleCameraAction, handleScreenShareAction, handleDisconnectAction } from '../../utils/voiceActions';
import { VOICE_CHROME_ATTR } from '../../hooks/usePointerReveal';
import { IconButton } from '../ui/IconButton';

/** A moderator's restriction: the press does nothing, so the button says so in the warning colour. */
const RESTRICTED = '!bg-status-warn/[0.14] !text-status-warn cursor-not-allowed';
/** A panel this button opened is showing. */
const OPENED = '!bg-interactive-active !text-txt-primary';

/**
 * `revealed` is the fullscreen idle state, owned by MainContent because it
 * watches the voice container the pointer actually moves over. It is ignored
 * while docked, where plain hover on the voice panel is the right model.
 */
export function VoiceControlBar({ revealed = false }: { revealed?: boolean }) {
  const { t } = useTranslation(['voice', 'common']);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const voiceChatOpen = useUIStore((s) => s.voiceChatOpen);
  const toggleVoiceChat = useUIStore((s) => s.toggleVoiceChat);
  const voiceFullscreen = useUIStore((s) => s.voiceFullscreen);
  const toggleVoiceFullscreen = useUIStore((s) => s.toggleVoiceFullscreen);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const myUser = useAuthStore((s) => s.user);
  const spaceId = useSpaceStore((s) => currentVoiceChannelId ? s.channelToSpaceMap.get(currentVoiceChannelId) : null);
  const myOriginId = useSpaceStore((s) => currentVoiceChannelId ? getMyUserIdForOrigin(getChannelOrigin(currentVoiceChannelId)) : s.members.find(m => m.userId === myUser?.id)?.userId ?? myUser?.id);
  const spaceMutedUserIds = useVoiceStore((s) => s.spaceMutedUserIds);
  const spaceDeafenedUserIds = useVoiceStore((s) => s.spaceDeafenedUserIds);
  const isSpaceMuted = !!(myOriginId && spaceId && spaceMutedUserIds.has(`${spaceId}:${myOriginId}`));
  const isSpaceDeafened = !!(myOriginId && spaceId && spaceDeafenedUserIds.has(`${spaceId}:${myOriginId}`));
  const activeDmCall = useVoiceStore((s) => s.activeDmCall);
  const channelPerms = useSpaceStore((s) => currentVoiceChannelId ? s.channelPermissions.get(currentVoiceChannelId) : undefined);
  const isDmCall = !!activeDmCall;
  const canSpeak = isDmCall || hasPermissionBit(channelPerms, PermissionBits.SPEAK);
  const canStream = isDmCall || hasPermissionBit(channelPerms, PermissionBits.STREAM);
  // The screen-share button is the single entry point to stream settings:
  // idle → opens the OS/Electron source picker; live → opens the settings
  // popover (quality controls + the red stop action).
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);

  // An open share menu pins the bar: the popover hangs off it, so letting the
  // idle timer pull it away would take the menu with it.
  const fullscreenVisibility = revealed || shareMenuOpen
    ? 'opacity-100'
    : 'opacity-0 focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(any-pointer:coarse)]:opacity-100';
  const containerClassName = voiceFullscreen
    ? `pointer-events-none absolute inset-x-0 bottom-0 z-float h-24 flex items-end justify-center pb-6 transition-opacity duration-300 ease-out ${fullscreenVisibility}`
    : 'absolute bottom-6 left-1/2 -translate-x-1/2 z-float opacity-0 translate-y-4 group-hover/voice:opacity-100 group-hover/voice:translate-y-0 transition-all duration-300 ease-out';

  const handleMute = React.useCallback(() => {
    handleMuteAction(isSpaceMuted, isSpaceDeafened);
  }, [isSpaceMuted, isSpaceDeafened]);

  const handleDeafen = React.useCallback(() => {
    handleDeafenAction(isSpaceDeafened);
  }, [isSpaceDeafened]);

  const handleCamera = () => handleCameraAction();

  const handleScreenShare = () => {
    if (isScreenSharing) {
      setShareMenuOpen((open) => !open);
      return;
    }
    handleScreenShareAction();
  };

  const handleStopSharing = () => {
    setShareMenuOpen(false);
    handleScreenShareAction();
  };

  // A share that ends outside the menu (OS "Stop sharing" bar, track loss,
  // keybind) must not leave a stale settings popover anchored to the button.
  useEffect(() => {
    if (!isScreenSharing) setShareMenuOpen(false);
  }, [isScreenSharing]);

  const handleDisconnect = () => handleDisconnectAction();

  const micRestricted = isSpaceMuted || isSpaceDeafened;
  const micOff = isMuted || isDeafened || micRestricted;

  const handleFullscreen = () => {
    toggleVoiceFullscreen();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && voiceFullscreen) {
        useUIStore.getState().setVoiceFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voiceFullscreen]);

  return (
    <div
      data-testid="voice-control-overlay"
      className={containerClassName}
      {...(voiceFullscreen ? { [VOICE_CHROME_ATTR]: '' } : {})}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl p-2 glass-bubble">
        {/* Mute */}
        <IconButton
          size="lg"
          icon={micOff ? 'mic-off' : 'mic'}
          tone={micRestricted ? 'default' : micOff ? 'off' : 'default'}
          className={micRestricted ? RESTRICTED : undefined}
          onClick={handleMute}
          label={micRestricted
            ? (isMuted ? t('voice:controls.spaceMutedSelfMuted') : t('voice:badges.spaceMuted'))
            : isMuted ? t('voice:controls.unmuteShortcut') : t('voice:controls.muteShortcut')}
        />

        {/* Deafen */}
        <IconButton
          size="lg"
          icon={isDeafened || isSpaceDeafened ? 'headphone-off' : 'headphones'}
          tone={!isSpaceDeafened && isDeafened ? 'off' : 'default'}
          className={isSpaceDeafened ? RESTRICTED : undefined}
          onClick={handleDeafen}
          label={isSpaceDeafened ? t('voice:badges.spaceDeafened') : isDeafened ? t('voice:controls.undeafenShortcut') : t('voice:controls.deafenShortcut')}
        />

        {/* Camera */}
        {canSpeak && (
          <IconButton
            size="lg"
            icon={isCameraOn ? 'video' : 'video-off'}
            tone={isCameraOn ? 'default' : 'off'}
            onClick={handleCamera}
            label={isCameraOn ? t('voice:controls.cameraOff') : t('voice:controls.cameraOn')}
          />
        )}

        {/* Screen Share — picker when idle, settings + stop menu when live */}
        {canStream && (
          <>
            <IconButton
              ref={shareBtnRef}
              size="lg"
              icon="screen-share"
              tone={isScreenSharing ? 'on' : 'default'}
              onClick={handleScreenShare}
              // Idle the button starts a share; live it toggles a menu, so it
              // only claims a popup in the state where it actually opens one.
              aria-haspopup={isScreenSharing ? 'dialog' : undefined}
              aria-expanded={isScreenSharing ? shareMenuOpen : undefined}
              label={isScreenSharing ? t('voice:controls.shareOptions') : t('voice:controls.shareScreen')}
            />
            <ScreenShareSettingsPopover
              open={shareMenuOpen && isScreenSharing}
              onClose={() => setShareMenuOpen(false)}
              anchorRef={shareBtnRef}
              onStopSharing={handleStopSharing}
            />
          </>
        )}

        {/* Separator */}
        <div className="w-px h-6 bg-border-soft mx-0.5" />

        {/* Chat Toggle */}
        <IconButton
          size="lg"
          icon="message-square"
          className={voiceChatOpen ? OPENED : undefined}
          onClick={toggleVoiceChat}
          label={t('voice:controls.toggleChat')}
        />

        {/* Fullscreen Toggle */}
        <IconButton
          size="lg"
          icon={voiceFullscreen ? 'minimize' : 'maximize'}
          className={voiceFullscreen ? OPENED : undefined}
          onClick={handleFullscreen}
          label={voiceFullscreen ? t('voice:controls.exitFullscreen') : t('voice:controls.fullscreen')}
        />

        {/* Separator */}
        <div className="w-px h-6 bg-border-soft mx-0.5" />

        {/* Disconnect */}
        <IconButton
          size="lg"
          icon="phone-off"
          tone="danger-solid"
          onClick={handleDisconnect}
          label={t('voice:controls.disconnect')}
        />
      </div>
    </div>
  );
}

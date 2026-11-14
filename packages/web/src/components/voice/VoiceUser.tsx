import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Icon } from '../ui/Icon';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { useVoiceParticipantStatus } from '../../hooks/useVoiceParticipantStatus';
import { useVoiceUserContextMenu } from './useVoiceUserContextMenu';
import type { UserTile } from '../../hooks/useLiveKit';

interface VoiceUserProps {
  tile: UserTile;
  large?: boolean;
}

export function VoiceUser({ tile, large }: VoiceUserProps) {
  const { t } = useTranslation(['voice', 'common']);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { participant } = tile;
  const status = useVoiceParticipantStatus(participant);
  const { isSpeaking } = status;
  const unwatchedCameras = useVoiceStore((s) => s.unwatchedCameras);
  const participantMutes = useVoiceStore((s) => s.participantMutes);
  const [, forceUpdate] = useState(0);

  const isLocal = participant.isLocal;
  const avatarUserId = participant.homeUserId ?? participant.userId;
  const { displayName, avatar, user, origin: userOrigin } = useVoiceParticipantMeta(participant);

  // --- VIDEO & UI ---

  const activeVideoTrack = tile.videoTrack;
  const hasVideo = activeVideoTrack !== null;

  // Force re-render when tracks end/mute
  useEffect(() => {
    if (!tile.videoTrack) return;
    const onEnded = () => forceUpdate((n) => n + 1);
    tile.videoTrack.addEventListener('ended', onEnded);
    return () => tile.videoTrack?.removeEventListener('ended', onEnded);
  }, [tile.videoTrack]);

  // Attach Video — use LiveKit's track.attach() to register the element
  // with the adaptive stream observer (enables SFU layer switching by viewport size)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const lkTrack = tile.lkVideoTrack;
    if (lkTrack) {
      lkTrack.attach(videoEl);
      return () => { lkTrack.detach(videoEl); };
    } else {
      videoEl.srcObject = null;
    }
  }, [tile.lkVideoTrack]);

  const handleContextMenu = useVoiceUserContextMenu(participant);

  const { effectivelyMuted, effectivelyDeafened, restrictedMute, restrictedDeafen } = status;

  return (
    <div
      data-context-menu
      className={`relative h-full w-full bg-surface-base rounded-xl overflow-hidden flex items-center justify-center group transition-shadow duration-fast ${
        isSpeaking
          ? 'ring-2 ring-status-ok'
          : 'ring-1 ring-border-hard hover:ring-border-soft'
      }`}
      onContextMenu={handleContextMenu}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full ${large ? 'object-contain bg-black' : 'object-cover'}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-surface-channel">
          <div className="relative flex">
            <ProfileAvatar
              src={avatar}
              name={displayName}
              size={large ? 100 : 64}
              userId={avatarUserId}
              user={user ?? undefined}
              origin={userOrigin}
            />
            {isSpeaking && (
              <div className="absolute -inset-1.5 rounded-full ring-2 ring-status-ok animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* Caption: a compact chip in the bottom-left corner, so the rest of
          the picture's bottom edge stays undimmed. */}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] h-[26px] px-2 rounded-lg bg-black/60 backdrop-blur-md flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-white truncate text-compact">
          {displayName}
        </span>
        {isLocal && (
          <span className="text-2xs text-white/50 font-medium flex-shrink-0">
            {t('voice:badges.you')}
          </span>
        )}
        {effectivelyMuted && (
          <Icon name="mic-off" size="xs" className={restrictedMute ? 'text-status-warn' : 'text-status-danger'} />
        )}
        {effectivelyDeafened && (
          <Icon name="headphone-off" size="xs" className={restrictedDeafen ? 'text-status-warn' : 'text-status-danger'} />
        )}
        {!isLocal && participant.isCameraOn && (
          <Icon
            name={unwatchedCameras.has(participant.userId) ? 'video-off' : 'video'}
            size="xs"
            className="text-white/70"
          />
        )}
        {!isLocal && participantMutes.get(participant.userId) && (
          <span className="flex text-white/70" title={t('voice:badges.locallyMuted')}>
            <Icon name="volume-x" size="xs" />
          </span>
        )}
      </div>
    </div>
  );
}

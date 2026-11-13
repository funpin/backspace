import { useSpaceStore } from '../stores/spaceStore';
import { useVoiceStore } from '../stores/voiceStore';
import type { ParticipantInfo } from './useLiveKit';

export interface VoiceParticipantStatus {
  isSpeaking: boolean;
  /** Muted by their own switch or by a space restriction. */
  effectivelyMuted: boolean;
  /** Deafened by their own switch or by a space restriction. */
  effectivelyDeafened: boolean;
  /** The mute comes from the space (mute, deafen or a missing Speak permission), not from the person. */
  restrictedMute: boolean;
  /** The deafen comes from the space, not from the person. */
  restrictedDeafen: boolean;
}

/**
 * What a call surface shows about a participant's microphone and headphones.
 * One rule for the grid tile and the ribbon chip, so a person never reads as
 * muted in one place and live in the other.
 */
export function useVoiceParticipantStatus(participant: ParticipantInfo): VoiceParticipantStatus {
  const localDeafened = useVoiceStore((s) => s.isDeafened);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isSpeaking = useVoiceStore((s) => s.speakingParticipantIds.has(participant.identity));
  const spaceId = useSpaceStore((s) => (currentVoiceChannelId ? s.channelToSpaceMap.get(currentVoiceChannelId) : null));
  const restrictionKey = spaceId ? `${spaceId}:${participant.userId}` : null;
  const isSpaceMuted = useVoiceStore((s) => (restrictionKey ? s.spaceMutedUserIds.has(restrictionKey) : false));
  const isSpaceDeafened = useVoiceStore((s) => (restrictionKey ? s.spaceDeafenedUserIds.has(restrictionKey) : false));
  const isPermissionMuted = useVoiceStore((s) => (restrictionKey ? s.permissionMutedUserIds.has(restrictionKey) : false));

  const restrictedMute = isSpaceMuted || isSpaceDeafened || isPermissionMuted;
  return {
    isSpeaking,
    effectivelyMuted: participant.isMuted || restrictedMute,
    effectivelyDeafened: (participant.isLocal ? localDeafened : participant.isDeafened) || isSpaceDeafened,
    restrictedMute,
    restrictedDeafen: isSpaceDeafened,
  };
}

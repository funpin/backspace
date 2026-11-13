import { AudioManager } from '../audio/AudioManager';
import { getActiveRoom, setCameraSubscription, setStreamSubscription } from '../hooks/useLiveKit';
import type { ParticipantInfo } from '../hooks/useLiveKit';
import { useVoiceStore } from '../stores/voiceStore';
import { getSfxVolume } from './sfx';
import { encodeStreamWatch, streamWatchFor, type StreamWatchTarget } from './streamWatchProtocol';

/**
 * Handles a deliberate viewer watch / stop-watch action: plays the local
 * feedback cue on the viewer's OWN machine and notifies the streamer so their
 * streamer-side watcher set updates.
 *
 * Called only from explicit user-action sites (the "Watch Stream" button, the
 * watch/stop context-menu items, hiding and showing a tile) — never from
 * automatic teardown paths (streamer stops sharing, participant disconnect),
 * which must stay silent on the viewer side. The local cue is played directly
 * rather than derived from a `watchingStreams` diff precisely so those teardown
 * paths don't trigger it.
 *
 * The cue plays unconditionally (independent of the data-channel round-trip to
 * the streamer), so the viewer gets identical feedback on every platform —
 * Safari and the Electron desktop app alike.
 */
export function handleViewerWatchToggle(sharer: StreamWatchTarget, watching: boolean): void {
  AudioManager.getInstance().playSound(
    watching ? 'stream_user_joined' : 'stream_user_left',
    { volume: getSfxVolume() },
  );
  const room = getActiveRoom();
  if (!room) return;
  const payload = encodeStreamWatch(streamWatchFor(sharer, watching));
  // Reliable delivery; data channels are room-scoped and small (under 1KB).
  void room.localParticipant.publishData(payload, { reliable: true });
}

/**
 * Moves a participant's tile to the ribbon and stops receiving what it showed:
 * the share (picture and sound) and the camera. Their voice is untouched.
 */
export function hideParticipantTile(participant: ParticipantInfo): void {
  if (participant.isLocal) return;
  const store = useVoiceStore.getState();
  const room = getActiveRoom();
  const { userId, identity } = participant;

  store.hideTile(userId);
  if (store.watchingStreams.has(userId)) {
    store.unwatchStream(userId);
    setStreamSubscription(room, identity, false);
    handleViewerWatchToggle({ userId, identity }, false);
  }
  if (participant.isCameraOn && !store.unwatchedCameras.has(userId)) {
    store.unwatchCamera(userId);
    setCameraSubscription(room, identity, false);
  }
}

/**
 * Brings a hidden participant's tile back and resumes what hiding stopped.
 * Asking to see the tile again is asking to watch it, so a share comes back
 * playing rather than as a "Watch Stream" placeholder.
 */
export function showParticipantTile(participant: ParticipantInfo): void {
  const store = useVoiceStore.getState();
  const room = getActiveRoom();
  const { userId, identity } = participant;

  store.showTile(userId);
  if (participant.isScreenSharing && !store.watchingStreams.has(userId)) {
    store.watchStream(userId);
    setStreamSubscription(room, identity, true);
    handleViewerWatchToggle({ userId, identity }, true);
  }
  if (store.unwatchedCameras.has(userId)) {
    store.rewatchCamera(userId);
    setCameraSubscription(room, identity, true);
  }
}

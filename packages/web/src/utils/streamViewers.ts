import type { ParticipantInfo } from '../hooks/useLiveKit';

/**
 * Who is watching `sharer`'s screen share, as this client knows it.
 *
 * Two sources, because a client never receives its own data-channel messages:
 * `streamWatchers` holds what other participants announced (`stream_watch`
 * pings, keyed by the sharer's LiveKit identity), and `watchingStreams` holds
 * what this client itself watches. The sharer is never its own viewer, and a
 * watcher who is no longer in the call is not counted even if its last ping
 * said it was watching.
 */
export function streamViewers(
  sharer: ParticipantInfo,
  participants: readonly ParticipantInfo[],
  streamWatchers: ReadonlyMap<string, ReadonlySet<string>>,
  watchingStreams: ReadonlySet<string>,
): ParticipantInfo[] {
  const announced = streamWatchers.get(sharer.identity);
  return participants.filter((p) => {
    if (p.identity === sharer.identity) return false;
    if (p.isLocal) return watchingStreams.has(sharer.userId);
    return announced?.has(p.identity) ?? false;
  });
}

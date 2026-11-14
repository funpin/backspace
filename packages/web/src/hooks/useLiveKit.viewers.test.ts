import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from 'livekit-client';

// AudioManager loads an AudioWorklet module that jsdom cannot evaluate.
vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({}) },
}));

import { announceWatchesTo, endRemoteStream, type ParticipantInfo } from './useLiveKit';
import { useVoiceStore } from '../stores/voiceStore';

function participant(identity: string, extra: Partial<ParticipantInfo> = {}): ParticipantInfo {
  return {
    identity,
    userId: identity,
    username: identity,
    homeUserId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isLocal: false,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    lkVideoTrack: null,
    lkScreenTrack: null,
    cachedUser: null,
    ...extra,
  };
}

function fakeRoom() {
  const publishData = vi.fn<(payload: Uint8Array, options: { reliable?: boolean; destinationIdentities?: string[] }) => Promise<void>>(async () => undefined);
  return { room: { localParticipant: { publishData } } as unknown as Room, publishData };
}

const decode = (payload: Uint8Array) => JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;

beforeEach(() => {
  useVoiceStore.setState({
    participants: [
      participant('me', { isLocal: true, isScreenSharing: true }),
      participant('bob', { isScreenSharing: true }),
      participant('eve', { isScreenSharing: true }),
      participant('dan'),
    ],
    // The local share is listed as watched on its own client.
    watchingStreams: new Set(['me', 'bob', 'dan']),
    streamWatchers: new Map([['bob', new Set(['eve', 'dan'])], ['eve', new Set(['dan'])]]),
    streamVolumes: new Map(),
    streamMutes: new Map(),
  });
});

describe('announceWatchesTo', () => {
  it('tells the newcomer, and only the newcomer, about each remote share this client watches', () => {
    const { room, publishData } = fakeRoom();

    announceWatchesTo(room, 'newcomer');

    // bob: shared and watched. eve: shared, not watched. dan: watched id, no share. me: own share.
    expect(publishData).toHaveBeenCalledTimes(1);
    const [payload, options] = publishData.mock.calls[0]!;
    expect(decode(payload)).toEqual({ type: 'stream_watch', target: 'bob', targetIdentity: 'bob', watching: true });
    expect(options).toEqual({ reliable: true, destinationIdentities: ['newcomer'] });
  });
});

describe('endRemoteStream', () => {
  it("forgets everyone's watching of a share that ended, and leaves other shares alone", () => {
    endRemoteStream('bob');

    const state = useVoiceStore.getState();
    expect(state.streamWatchers.has('bob')).toBe(false);
    expect(state.streamWatchers.get('eve')).toEqual(new Set(['dan']));
    expect(state.watchingStreams.has('bob')).toBe(false);
  });
});

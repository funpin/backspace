import { describe, expect, it, vi } from 'vitest';
import type { ParticipantInfo } from '../hooks/useLiveKit';
import { streamViewers } from './streamViewers';

// The participant type lives beside the LiveKit hook, whose module graph
// reaches AudioManager; that loads an AudioWorklet module jsdom cannot evaluate.
vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({}) },
}));

function participant(identity: string, isLocal = false): ParticipantInfo {
  return {
    identity,
    // A different string on purpose: watcher sets are keyed by identity, the
    // viewer's own watches by user id.
    userId: `user-${identity}`,
    username: identity,
    homeUserId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: identity === 'bob',
    isLocal,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    lkVideoTrack: null,
    lkScreenTrack: null,
    cachedUser: null,
  };
}

const me = participant('me', true);
const bob = participant('bob');
const eve = participant('eve');
const dan = participant('dan');
const everyone = [me, bob, eve, dan];
const names = (list: ParticipantInfo[]) => list.map((p) => p.identity);

describe('streamViewers', () => {
  it('counts the participants who announced they are watching', () => {
    const watchers = new Map([['bob', new Set(['eve', 'dan'])]]);
    expect(names(streamViewers(bob, everyone, watchers, new Set()))).toEqual(['eve', 'dan']);
  });

  it('adds this client when it watches, which no ping ever tells it', () => {
    const watchers = new Map([['bob', new Set(['eve'])]]);
    expect(names(streamViewers(bob, everyone, watchers, new Set(['user-bob'])))).toEqual(['me', 'eve']);
  });

  it('never counts the sharer as its own viewer', () => {
    const watchers = new Map([['bob', new Set(['bob', 'eve'])]]);
    expect(names(streamViewers(bob, everyone, watchers, new Set()))).toEqual(['eve']);
    // The sharer's own client lists its own share as watched.
    const local = { ...bob, isLocal: true };
    expect(names(streamViewers(local, [local, eve], watchers, new Set(['user-bob'])))).toEqual(['eve']);
  });

  it('drops a watcher who has left the call', () => {
    const watchers = new Map([['bob', new Set(['eve', 'gone'])]]);
    expect(names(streamViewers(bob, everyone, watchers, new Set()))).toEqual(['eve']);
  });

  it('is empty for a share nobody announced watching', () => {
    expect(streamViewers(bob, everyone, new Map(), new Set())).toEqual([]);
  });
});

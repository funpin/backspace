import { describe, expect, it, vi } from 'vitest';
import type { ParticipantInfo } from '../hooks/useLiveKit';

// The tile types live beside the LiveKit hook, whose module graph reaches
// AudioManager; that loads an AudioWorklet module jsdom cannot evaluate.
vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({}) },
}));
import {
  deriveVoiceGridLayout,
  findFocusedCell,
  focusableCells,
  reorderCells,
  type VoiceGridPrefs,
} from './voiceGridLayout';

const liveTrack = { readyState: 'live' } as MediaStreamTrack;

function participant(
  identity: string,
  media: { camera?: boolean; cameraReceived?: boolean; screen?: boolean; local?: boolean } = {},
): ParticipantInfo {
  const cameraReceived = media.cameraReceived ?? media.camera ?? false;
  return {
    identity,
    userId: identity,
    username: identity,
    homeUserId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: media.camera ?? false,
    isScreenSharing: media.screen ?? false,
    isLocal: media.local ?? false,
    audioTrack: null,
    videoTrack: cameraReceived ? liveTrack : null,
    screenTrack: media.screen ? liveTrack : null,
    screenAudioTrack: null,
    lkVideoTrack: null,
    lkScreenTrack: null,
    cachedUser: null,
  };
}

function prefs(overrides: Partial<Record<keyof VoiceGridPrefs, string[]>> = {}): VoiceGridPrefs {
  return {
    hidden: new Set(overrides.hidden ?? []),
    swapped: new Set(overrides.swapped ?? []),
    split: new Set(overrides.split ?? []),
    order: overrides.order ?? [],
  };
}

describe('deriveVoiceGridLayout', () => {
  it('is the plain avatar grid while nobody shows anything', () => {
    const layout = deriveVoiceGridLayout([participant('me', { local: true }), participant('bob')], prefs());

    expect(layout.mediaMode).toBe(false);
    expect(layout.cells.map((c) => c.key)).toEqual(['me', 'bob']);
    expect(layout.ribbon).toEqual([]);
  });

  it('gives a sharer one cell and moves everyone without media to the ribbon', () => {
    const layout = deriveVoiceGridLayout(
      [participant('me', { local: true }), participant('bob', { screen: true }), participant('eve')],
      prefs(),
    );

    expect(layout.mediaMode).toBe(true);
    expect(layout.cells.map((c) => [c.key, c.main.kind, c.inset])).toEqual([['bob:stream', 'stream', null]]);
    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['idle', 'me'], ['idle', 'eve']]);
  });

  it('keeps a camera-only participant in a cell keyed by identity', () => {
    const layout = deriveVoiceGridLayout([participant('me', { local: true }), participant('bob', { camera: true })], prefs());

    expect(layout.cells.map((c) => [c.key, c.main.kind])).toEqual([['bob', 'user']]);
  });

  it('puts the camera in the corner of the screen for someone who shows both', () => {
    const layout = deriveVoiceGridLayout([participant('bob', { screen: true, camera: true })], prefs());

    expect(layout.cells).toHaveLength(1);
    expect(layout.cells[0].key).toBe('bob:stream');
    expect(layout.cells[0].main.kind).toBe('stream');
    expect(layout.cells[0].inset?.kind).toBe('user');
  });

  it('swaps the two sources without changing the cell key', () => {
    const layout = deriveVoiceGridLayout(
      [participant('bob', { screen: true, camera: true })],
      prefs({ swapped: ['bob'] }),
    );

    expect(layout.cells[0].key).toBe('bob:stream');
    expect(layout.cells[0].main.kind).toBe('user');
    expect(layout.cells[0].inset?.kind).toBe('stream');
  });

  it('splits the camera into its own cell when asked, and split wins over swapped', () => {
    const layout = deriveVoiceGridLayout(
      [participant('bob', { screen: true, camera: true })],
      prefs({ split: ['bob'], swapped: ['bob'] }),
    );

    expect(layout.cells.map((c) => [c.key, c.main.kind, c.inset])).toEqual([
      ['bob:stream', 'stream', null],
      ['bob', 'user', null],
    ]);
  });

  it('does not inset a camera the viewer is not receiving', () => {
    const layout = deriveVoiceGridLayout(
      [participant('bob', { screen: true, camera: true, cameraReceived: false })],
      prefs({ split: ['bob'] }),
    );

    expect(layout.cells.map((c) => [c.key, c.inset])).toEqual([['bob:stream', null]]);
  });

  it('moves a hidden participant to the ribbon, even once their camera stops arriving', () => {
    const layout = deriveVoiceGridLayout(
      [
        participant('bob', { camera: true, cameraReceived: false }),
        participant('eve', { screen: true }),
      ],
      prefs({ hidden: ['bob'] }),
    );

    expect(layout.cells.map((c) => c.key)).toEqual(['eve:stream']);
    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['hidden', 'bob']]);
  });

  it('treats a hidden participant with nothing left to show as idle', () => {
    const layout = deriveVoiceGridLayout(
      [participant('bob'), participant('eve', { screen: true })],
      prefs({ hidden: ['bob'] }),
    );

    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['idle', 'bob']]);
  });

  it('never hides the local participant', () => {
    const layout = deriveVoiceGridLayout([participant('me', { local: true, screen: true })], prefs({ hidden: ['me'] }));

    expect(layout.cells.map((c) => c.key)).toEqual(['me:stream']);
  });

  it('shows your own media in the grid while it is the only media', () => {
    const layout = deriveVoiceGridLayout([participant('me', { local: true, screen: true }), participant('bob')], prefs());

    expect(layout.cells.map((c) => c.key)).toEqual(['me:stream']);
    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['idle', 'bob']]);
  });

  it('moves your own media to the ribbon once someone else shows something', () => {
    const layout = deriveVoiceGridLayout(
      [participant('me', { local: true, screen: true }), participant('bob', { screen: true }), participant('eve')],
      prefs(),
    );

    expect(layout.cells.map((c) => c.key)).toEqual(['bob:stream']);
    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['self', 'me:stream'], ['idle', 'eve']]);
    expect(focusableCells(layout).map((c) => c.key)).toEqual(['bob:stream', 'me:stream']);
  });

  it('keeps your own media in the grid when every remote tile is hidden', () => {
    const layout = deriveVoiceGridLayout(
      [participant('me', { local: true, camera: true }), participant('bob', { screen: true })],
      prefs({ hidden: ['bob'] }),
    );

    expect(layout.cells.map((c) => c.key)).toEqual(['me']);
    expect(layout.ribbon.map((r) => [r.kind, r.key])).toEqual([['hidden', 'bob']]);
  });
});

describe('findFocusedCell', () => {
  const cells = focusableCells(
    deriveVoiceGridLayout(
      [participant('bob', { screen: true, camera: true }), participant('eve', { camera: true })],
      prefs(),
    ),
  );

  it('finds a cell by its own key', () => {
    expect(findFocusedCell(cells, 'eve')?.key).toBe('eve');
  });

  it('finds a merged cell by the key of the source in its corner', () => {
    expect(findFocusedCell(cells, 'bob')?.key).toBe('bob:stream');
  });

  it('returns null for no key and for a key nobody has', () => {
    expect(findFocusedCell(cells, null)).toBeNull();
    expect(findFocusedCell(cells, 'gone')).toBeNull();
  });
});

describe('the viewer\'s own order', () => {
  it('orders the avatar grid by the stored keys and leaves unnamed people after them', () => {
    const layout = deriveVoiceGridLayout(
      [participant('me', { local: true }), participant('bob'), participant('eve'), participant('dan')],
      prefs({ order: ['eve', 'me'] }),
    );

    expect(layout.cells.map((c) => c.key)).toEqual(['eve', 'me', 'bob', 'dan']);
  });

  it('orders media cells by the stored keys', () => {
    const layout = deriveVoiceGridLayout(
      [participant('bob', { screen: true }), participant('eve', { camera: true }), participant('dan', { screen: true })],
      prefs({ order: ['dan:stream', 'eve'] }),
    );

    expect(layout.cells.map((c) => c.key)).toEqual(['dan:stream', 'eve', 'bob:stream']);
  });

  it('moves a dragged cell to the place of the one it is dropped on', () => {
    expect(reorderCells(['a', 'b', 'c', 'd'], [], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderCells(['a', 'b', 'c', 'd'], [], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
  });

  it('keeps remembering keys that are not on screen right now', () => {
    expect(reorderCells(['a', 'b'], ['zed', 'b', 'a'], 'b', 'a')).toEqual(['b', 'a', 'zed']);
  });

  it('leaves the stored order alone for a drop on itself or on an unknown cell', () => {
    expect(reorderCells(['a', 'b'], ['b'], 'a', 'a')).toEqual(['b']);
    expect(reorderCells(['a', 'b'], ['b'], 'a', 'gone')).toEqual(['b']);
  });
});

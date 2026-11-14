// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

/**
 * One audible path per remote audio track.
 *
 * A viewer reported hearing a stream's sound twice. These tests pin the
 * viewer-side invariant that rules the renderer out as the cause: a watched
 * `screenAudioTrack` reaches the speakers through exactly one Web Audio source,
 * the keep-alive `<audio>` element (if any) is silent, and neither a re-render
 * nor a replaced track leaves a second source connected.
 */

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeSource extends FakeNode {
  track: MediaStreamTrack;
}

const graph = vi.hoisted(() => ({
  sources: [] as Array<{ track: MediaStreamTrack; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
  master: { connect: vi.fn(), disconnect: vi.fn() },
}));

vi.mock('../../audio/AudioManager', () => {
  const makeNode = (): FakeNode => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    currentTime: 0,
    createMediaStreamSource: (stream: { tracks: MediaStreamTrack[] }) => {
      const source: FakeSource = { ...makeNode(), track: stream.tracks[0]! };
      graph.sources.push(source);
      return source;
    },
    createGain: () => ({
      ...makeNode(),
      gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
    }),
  };
  return {
    AudioManager: {
      getInstance: () => ({
        ensureContext: () => ctx,
        getMasterOutput: () => graph.master,
      }),
    },
  };
});

import { GlobalAudioRenderer } from './GlobalAudioRenderer';
import { useVoiceStore } from '../../stores/voiceStore';
import type { ParticipantInfo } from '../../hooks/useLiveKit';

class FakeMediaStream {
  tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

function fakeTrack(id: string): MediaStreamTrack {
  return { id, kind: 'audio', readyState: 'live' } as unknown as MediaStreamTrack;
}

function participant(over: Partial<ParticipantInfo>): ParticipantInfo {
  return {
    identity: 'sharer',
    userId: 'sharer',
    isLocal: false,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    isScreenSharing: true,
    ...over,
  } as ParticipantInfo;
}

/** Sources still wired to the output: created and never disconnected. */
function audibleSources(): MediaStreamTrack[] {
  return graph.sources.filter((s) => s.disconnect.mock.calls.length === 0).map((s) => s.track);
}

function setParticipants(participants: ParticipantInfo[], watching: string[] = ['sharer']): void {
  useVoiceStore.setState({
    participants,
    watchingStreams: new Set(watching),
  });
}

const initialVoiceState = useVoiceStore.getState();

describe('GlobalAudioRenderer — one audible path per track', () => {
  beforeEach(() => {
    graph.sources.length = 0;
    vi.stubGlobal('MediaStream', FakeMediaStream);
    // jsdom has no media playback; the keep-alive element calls play().
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    useVoiceStore.setState(initialVoiceState, true);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays a watched stream audio track through exactly one source', () => {
    const streamAudio = fakeTrack('stream-audio');
    setParticipants([participant({ screenAudioTrack: streamAudio })]);

    const { container } = render(<GlobalAudioRenderer />);

    expect(audibleSources()).toEqual([streamAudio]);
    // Any <audio> element the renderer mounts must be unable to produce sound.
    for (const el of Array.from(container.querySelectorAll('audio'))) {
      expect(el.muted).toBe(true);
      expect(el.volume).toBe(0);
    }
  });

  it('keeps the microphone and the stream audio as two separate single paths', () => {
    const mic = fakeTrack('mic');
    const streamAudio = fakeTrack('stream-audio');
    setParticipants([participant({ audioTrack: mic, screenAudioTrack: streamAudio })]);

    render(<GlobalAudioRenderer />);

    expect(audibleSources()).toHaveLength(2);
    expect(audibleSources()).toEqual(expect.arrayContaining([mic, streamAudio]));
  });

  it('does not play stream audio the viewer is not watching', () => {
    setParticipants([participant({ screenAudioTrack: fakeTrack('stream-audio') })], []);

    render(<GlobalAudioRenderer />);

    expect(audibleSources()).toEqual([]);
  });

  it('never plays the local participant, so a sharer does not hear their own stream', () => {
    setParticipants([
      participant({ isLocal: true, audioTrack: fakeTrack('own-mic'), screenAudioTrack: fakeTrack('own-stream') }),
    ]);

    render(<GlobalAudioRenderer />);

    expect(audibleSources()).toEqual([]);
  });

  it('does not add a second source when volume, mute or the participant list re-render', () => {
    const streamAudio = fakeTrack('stream-audio');
    setParticipants([participant({ screenAudioTrack: streamAudio })]);
    render(<GlobalAudioRenderer />);

    act(() => {
      useVoiceStore.setState({
        outputVolume: 40,
        streamVolumes: new Map([['sharer', 150]]),
        streamMutes: new Map([['sharer', true]]),
      });
    });
    act(() => {
      // A fresh participant object carrying the same track (what every
      // updateParticipants() run produces).
      setParticipants([participant({ screenAudioTrack: streamAudio })]);
    });

    expect(graph.sources).toHaveLength(1);
    expect(audibleSources()).toEqual([streamAudio]);
  });

  it('disconnects the old source when the stream audio track is replaced', () => {
    const first = fakeTrack('stream-audio-1');
    const second = fakeTrack('stream-audio-2');
    setParticipants([participant({ screenAudioTrack: first })]);
    render(<GlobalAudioRenderer />);

    act(() => {
      setParticipants([participant({ screenAudioTrack: second })]);
    });

    expect(audibleSources()).toEqual([second]);
  });

  it('disconnects the source when the viewer stops watching or the track goes away', () => {
    setParticipants([participant({ screenAudioTrack: fakeTrack('stream-audio') })]);
    render(<GlobalAudioRenderer />);

    act(() => {
      setParticipants([participant({ screenAudioTrack: fakeTrack('stream-audio') })], []);
    });

    expect(audibleSources()).toEqual([]);
  });
});

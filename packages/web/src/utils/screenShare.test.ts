import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPresets, BackupCodecPolicy, Track } from 'livekit-client';
import { useVoiceStore } from '../stores/voiceStore';
import {
  buildScreenShareOptions,
  getPublishedScreenShareCodec,
  publishScreenShare,
  stageScreenCapture,
  stopScreenShare,
} from './screenShare';

const sdp = vi.hoisted(() => ({ activate: vi.fn(), deactivate: vi.fn() }));
vi.mock('./hwOverdrive', () => sdp);
vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ setInputVolume: vi.fn() }) },
}));
vi.mock('../stores/settingsStore', () => ({
  getStreamingLimits: () => ({
    minBitrateKbps: 500,
    maxBitrateKbps: 20_000,
    allowCustomBitrate: true,
    bitrateMatrixOverrides: null,
  }),
}));
vi.mock('./livekitInternals', () => ({ getPublisherPC: () => null, getMediaStreamTrack: () => null }));

type FakeTrack = {
  kind: 'video' | 'audio';
  readyState: 'live';
  contentHint: string;
  stop: ReturnType<typeof vi.fn>;
};

function makeTrack(kind: FakeTrack['kind']): FakeTrack {
  return { kind, readyState: 'live', contentHint: '', stop: vi.fn() };
}

function makeStream(video = makeTrack('video'), audio?: FakeTrack) {
  const tracks = [video, ...(audio ? [audio] : [])];
  return {
    getTracks: () => tracks,
    getVideoTracks: () => [video],
    getAudioTracks: () => audio ? [audio] : [],
  } as unknown as MediaStream;
}

function fakeRoom() {
  return {
    localParticipant: {
      publishTrack: vi.fn().mockResolvedValue({}),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      getTrackPublication: vi.fn(),
      getTrackPublications: vi.fn(() => []),
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useVoiceStore.setState({
    ...useVoiceStore.getInitialState(),
    screenShareConfig: {
      height: 1440,
      fps: 60,
      mode: 'gaming',
      customBitrateKbps: 18_000,
      shareAudio: true,
      codec: 'vp9',
    },
  });
});

describe('screen-share media options', () => {
  it('publishes VP9 directly without enabling the H.264 SDP hook', async () => {
    const room = fakeRoom();

    await publishScreenShare(room, makeStream());

    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: Track.Source.ScreenShare, videoCodec: 'vp9' }),
    );
    expect(getPublishedScreenShareCodec()).toBe('vp9');
    expect(sdp.activate).not.toHaveBeenCalled();
    expect(sdp.deactivate).not.toHaveBeenCalled();
  });

  it('uses the persisted codec on the first publication and keeps it after stop', async () => {
    const room = fakeRoom();
    useVoiceStore.getState().setScreenShareConfig({ codec: 'h264' });

    await publishScreenShare(room, makeStream());
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoCodec: 'h264' }),
    );
    expect(getPublishedScreenShareCodec()).toBe('h264');
    expect(sdp.activate).toHaveBeenCalledOnce();
    expect(sdp.deactivate).toHaveBeenCalledOnce();

    await stopScreenShare(room);
    expect(getPublishedScreenShareCodec()).toBeNull();
    expect(useVoiceStore.getState().screenShareConfig.codec).toBe('h264');
    const persisted = JSON.parse(localStorage.getItem('backspace-voice-settings') ?? '{}');
    expect(persisted.state.screenShareConfig.codec).toBe('h264');
  });

  it('requests unprocessed stereo capture and publishes stereo music audio', async () => {
    const video = makeTrack('video');
    const audio = makeTrack('audio');
    const stream = makeStream(video, audio);
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });

    await stageScreenCapture();
    expect(getDisplayMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({
        channelCount: 2,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        restrictOwnAudio: true,
      }),
    }));

    const room = fakeRoom();
    await publishScreenShare(room, stream);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(
      audio,
      expect.objectContaining({
        source: Track.Source.ScreenShareAudio,
        audioPreset: AudioPresets.musicHighQualityStereo,
        dtx: false,
        red: false,
        forceStereo: true,
      }),
    );
  });

  it('gives Gaming and Text distinct sender adaptation without a fake bitrate floor', () => {
    const base = useVoiceStore.getState().screenShareConfig;
    const gaming = buildScreenShareOptions({ ...base, mode: 'gaming' });
    const text = buildScreenShareOptions({ ...base, mode: 'text' });

    expect(gaming.contentHint).toBe('motion');
    expect(gaming.overdrive.degradationPreference).toBe('maintain-framerate');
    expect(text.contentHint).toBe('detail');
    expect(text.overdrive.degradationPreference).toBe('maintain-resolution');
    expect(gaming.publish.backupCodecPolicy).toBe(BackupCodecPolicy.PREFER_REGRESSION);
    expect(gaming.overdrive).not.toHaveProperty('minBitrate');
  });

  it('migrates older saved settings to VP9 once and persists subsequent choices', async () => {
    localStorage.setItem('backspace-voice-settings', JSON.stringify({
      version: 13,
      state: {
        screenShareConfig: {
          height: 1080,
          fps: 30,
          mode: 'text',
          customBitrateKbps: null,
          shareAudio: false,
        },
      },
    }));

    await useVoiceStore.persist.rehydrate();
    expect(useVoiceStore.getState().screenShareConfig.codec).toBe('vp9');

    useVoiceStore.getState().setScreenShareConfig({ codec: 'h264' });
    await useVoiceStore.persist.rehydrate();
    expect(useVoiceStore.getState().screenShareConfig.codec).toBe('h264');
  });
});

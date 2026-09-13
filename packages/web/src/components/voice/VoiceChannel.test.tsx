import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { VoiceChannel } from './VoiceChannel';
import { useAuthStore } from '../../stores/authStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useVoiceStore } from '../../stores/voiceStore';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({}) },
}));

function participant(userId: string, username: string, isLocal: boolean) {
  return {
    identity: `${userId}:${username}`,
    userId,
    username,
    homeUserId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isLocal,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    lkVideoTrack: null,
    lkScreenTrack: null,
    cachedUser: null,
  } as any;
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: '1', username: 'ada' } } as any);
  useSpaceStore.setState({
    members: [
      { userId: '1', user: { id: '1', username: 'ada', displayName: 'Ada', avatar: null }, roles: [] },
      { userId: '2', user: { id: '2', username: 'bob', displayName: 'Bob', avatar: null }, roles: [] },
    ],
    channelToSpaceMap: new Map([['voice-1', 'space-1']]),
  } as any);
  useVoiceStore.setState({
    currentVoiceChannelId: 'voice-1',
    isLiveKitConnected: true,
    voiceConnectionStatus: 'connected',
    participants: [participant('1', 'ada', true), participant('2', 'bob', false)],
    voiceUsers: new Map([['voice-1', ['1', '2']]]),
    voiceChannelStartedAt: new Map(),
    voiceUserStates: new Map(),
    connectionQuality: 'good',
    connectionQualities: new Map(),
    spaceMutedUserIds: new Set(),
    spaceDeafenedUserIds: new Set(),
    permissionMutedUserIds: new Set(),
    participantMutes: new Map(),
    unwatchedCameras: new Set(),
    speakingUserIds: new Set(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderChannel(canManage = false) {
  return render(
    <VoiceChannel
      channelId="voice-1"
      channelName="Voice"
      onClick={() => {}}
      canManage={canManage}
      onSettingsClick={() => {}}
    />,
  );
}

describe('VoiceChannel connection diagnostics', () => {
  it('attributes a poor remote connection to that participant', () => {
    useVoiceStore.setState({
      connectionQualities: new Map([['2:bob', 'poor']]),
    });

    renderChannel();

    expect(screen.getByLabelText('Bob has an unstable connection')).toBeInTheDocument();
  });

  it('shows a voice-server reconnect warning on the local participant', () => {
    useVoiceStore.setState({ voiceConnectionStatus: 'reconnecting' });

    renderChannel();

    expect(screen.getByLabelText('Connection to the voice server was interrupted — reconnecting…')).toBeInTheDocument();
  });
});

describe('VoiceChannel occupancy timer', () => {
  it('shows and updates the server-authoritative channel duration even when viewing another channel', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:01:05Z'));
    useVoiceStore.setState({
      currentVoiceChannelId: 'voice-2',
      voiceChannelStartedAt: new Map([['voice-1', Date.now() - 65_000]]),
    });

    renderChannel();

    expect(screen.getByTestId('voice-channel-timer')).toHaveTextContent('01:05');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('voice-channel-timer')).toHaveTextContent('01:06');

  });

  it('clears the server timestamp only when the channel becomes empty', () => {
    const startedAt = Date.now() - 65_000;
    useVoiceStore.setState({ voiceChannelStartedAt: new Map([['voice-1', startedAt]]) });

    useVoiceStore.getState().removeVoiceUser('voice-1', '2');
    expect(useVoiceStore.getState().voiceChannelStartedAt.get('voice-1')).toBe(startedAt);

    useVoiceStore.getState().removeVoiceUser('voice-1', '1');
    expect(useVoiceStore.getState().voiceChannelStartedAt.has('voice-1')).toBe(false);
  });

  it('overlays channel settings without reserving space beside the timer', () => {
    useVoiceStore.setState({ voiceChannelStartedAt: new Map([['voice-1', Date.now()]]) });

    renderChannel(true);

    expect(screen.getByTestId('voice-channel-timer')).toHaveClass('group-hover:opacity-0');
    expect(screen.getByTestId('voice-channel-settings')).toHaveClass('absolute', 'right-[10px]');
  });
});

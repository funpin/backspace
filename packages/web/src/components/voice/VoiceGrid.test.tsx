import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceGrid } from './VoiceGrid';
import { useVoiceStore } from '../../stores/voiceStore';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ playSound: vi.fn() }) },
}));

vi.mock('../../hooks/useLiveKit', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getActiveRoom: () => null,
    setCameraSubscription: vi.fn(),
    setStreamSubscription: vi.fn(),
  };
});

function participant(identity: string, isLocal: boolean) {
  return {
    identity,
    userId: identity,
    username: identity,
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
  useVoiceStore.setState({
    focusedParticipantId: 'ada',
    currentVoiceChannelId: 'voice-1',
    isDeafened: false,
    speakingParticipantIds: new Set(),
    spaceMutedUserIds: new Set(),
    spaceDeafenedUserIds: new Set(),
    permissionMutedUserIds: new Set(),
    unwatchedCameras: new Set(),
    watchingStreams: new Set(),
    hiddenTileUserIds: new Set(),
    swappedTileUserIds: new Set(),
    splitCameraUserIds: new Set(),
    tileInsetCorners: new Map(),
    participantMutes: new Map(),
  });
});

const liveTrack = { readyState: 'live', addEventListener: () => {}, removeEventListener: () => {}, getSettings: () => ({}) };

function sharing(identity: string, media: { screen?: boolean; camera?: boolean }, isLocal = false) {
  return {
    ...participant(identity, isLocal),
    isScreenSharing: media.screen ?? false,
    screenTrack: media.screen ? liveTrack : null,
    isCameraOn: media.camera ?? false,
    videoTrack: media.camera ? liveTrack : null,
  };
}

describe('VoiceGrid participant strip', () => {
  it('can show the participant strip again after hiding it', async () => {
    render(<VoiceGrid participants={[participant('ada', true), participant('bob', false)]} />);

    await userEvent.click(screen.getByText(/hide members/i));
    expect(screen.getByText(/show members/i)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/show members/i));
    expect(screen.getByText(/hide members/i)).toBeInTheDocument();
  });
});

describe('VoiceGrid one tile per participant', () => {
  beforeEach(() => {
    useVoiceStore.setState({ focusedParticipantId: null });
  });

  it('shows no return-to-grid tooltip on the focused tile', () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    const { container } = render(
      <VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true })]} />,
    );

    expect(container.querySelector('[title*="return to grid" i]')).toBeNull();
  });

  it('returns to the grid when the focused tile is clicked', async () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true })]} />);

    await userEvent.click(screen.getByTestId('stream-tile-placeholder'));

    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
  });

  it('returns to the grid on Escape', async () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true })]} />);

    await userEvent.keyboard('{Escape}');

    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
  });

  it('puts people without media in the ribbon instead of giving them tiles', () => {
    render(
      <VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true }), participant('eve', false)]} />,
    );

    expect(screen.getAllByTestId('stream-tile-placeholder')).toHaveLength(1);
    expect(screen.getAllByTestId('ribbon-chip')).toHaveLength(2);
  });

  it('keeps the avatar grid and no ribbon while nobody shows anything', () => {
    render(<VoiceGrid participants={[participant('ada', true), participant('bob', false)]} />);

    expect(screen.queryByTestId('voice-ribbon')).toBeNull();
    expect(screen.queryByTestId('ribbon-chip')).toBeNull();
  });

  it('hides a tile into the ribbon and brings it back from its chip', async () => {
    render(
      <VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true }), sharing('eve', { screen: true })]} />,
    );
    expect(screen.getAllByTestId('stream-tile-placeholder')).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: 'Hide' })[0]);

    expect(useVoiceStore.getState().hiddenTileUserIds.has('bob')).toBe(true);
    expect(screen.getAllByTestId('stream-tile-placeholder')).toHaveLength(1);

    await userEvent.click(screen.getByTestId('ribbon-chip-hidden'));

    expect(useVoiceStore.getState().hiddenTileUserIds.has('bob')).toBe(false);
    expect(useVoiceStore.getState().watchingStreams.has('bob')).toBe(true);
  });

  it('drops focus when the focused tile is hidden', async () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true })]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));

    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
  });

  it('shows one tile with a corner inset for a participant with a screen and a camera', async () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true, camera: true })]} />);

    expect(screen.getAllByTestId('tile-inset')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Swap Screen and Camera' }));
    expect(useVoiceStore.getState().swappedTileUserIds.has('bob')).toBe(true);
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');

    await userEvent.click(screen.getByRole('button', { name: 'Show Camera Separately' }));
    expect(useVoiceStore.getState().splitCameraUserIds.has('bob')).toBe(true);
    expect(screen.queryByTestId('tile-inset')).toBeNull();
  });
});

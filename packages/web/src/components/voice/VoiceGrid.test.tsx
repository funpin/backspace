import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceGrid } from './VoiceGrid';
import { pictureView } from './StageZoomControls';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUIStore } from '../../stores/uiStore';
import { useStreamPointerStore } from '../../stores/streamPointerStore';
import { useVoiceStripStore } from './voiceStripStore';

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
    tileOrder: [],
    participantMutes: new Map(),
    showStreamPointers: true,
  });
  useUIStore.setState({ voiceFullscreen: false });
  useStreamPointerStore.getState().reset();
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
  it('leaves the toggle to the control bar while one is mounted', async () => {
    const release = useVoiceStripStore.getState().claimToggle();
    try {
      render(<VoiceGrid participants={[participant('ada', true), participant('bob', false)]} />);

      expect(screen.queryByText(/hide members/i)).toBeNull();
      expect(useVoiceStripStore.getState().available).toBe(true);

      act(() => useVoiceStripStore.getState().setHidden(true));
      expect(screen.queryByTestId('voice-strip')).toBeNull();
    } finally {
      release();
    }
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

  it('moves the inset to another corner on drag without touching focus or swapping', () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true, camera: true })]} />);
    const inset = screen.getByTestId('tile-inset');
    inset.setPointerCapture = vi.fn();

    fireEvent.pointerDown(inset, { pointerId: 1, button: 0, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(inset, { pointerId: 1, clientX: -40, clientY: -40 });
    fireEvent.pointerUp(inset, { pointerId: 1, clientX: -40, clientY: -40 });
    // Pointer capture delivers the click that ends a drag to the inset itself.
    fireEvent.click(inset);

    const state = useVoiceStore.getState();
    expect(state.tileInsetCorners.get('bob')).toBe('top-left');
    expect(state.focusedParticipantId).toBe('bob:stream');
    expect(state.swappedTileUserIds.has('bob')).toBe(false);
  });

  it('reorders grid cells by dragging one onto another, without focusing either', () => {
    render(<VoiceGrid participants={[participant('ada', true), participant('bob', false), participant('eve', false)]} />);
    const cells = screen.getAllByTestId('voice-grid-cell');

    fireEvent.dragStart(cells[0]!);
    fireEvent.dragOver(cells[2]!);
    fireEvent.drop(cells[2]!);

    expect(useVoiceStore.getState().tileOrder).toEqual(['bob', 'eve', 'ada']);
    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
    // Each cell's text is the avatar's initial followed by the name.
    expect(
      screen.getAllByTestId('voice-grid-cell').map((cell) => cell.textContent?.replace('(you)', '').trim()),
    ).toEqual(['Bbob', 'Eeve', 'Aada']);
  });

  it('zooms the focused picture with the wheel, keeps the click for panning, and resets', async () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true })]} />);
    const stage = screen.getByTestId('stream-tile-placeholder').closest('[data-zoom-stage]') as HTMLElement;
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
    expect(screen.queryByTestId('zoom-reset')).toBeNull();

    fireEvent.wheel(stage, { deltaY: -400, clientX: 500, clientY: 250 });

    expect(stage).toHaveAttribute('data-zoomed', 'true');
    expect(Number(stage.style.getPropertyValue('--stage-zoom-scale'))).toBeGreaterThan(1);
    expect(screen.getByTestId('zoom-reset')).toBeInTheDocument();

    // While zoomed a click on the picture does not leave focus mode.
    await userEvent.click(screen.getByTestId('stream-tile-placeholder'));
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');

    // Escape undoes the zoom first, then focus.
    await userEvent.keyboard('{Escape}');
    expect(stage).not.toHaveAttribute('data-zoomed');
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');
    await userEvent.keyboard('{Escape}');
    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
  });

  it('opens a newly focused picture unzoomed', () => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream' });
    render(<VoiceGrid participants={[participant('ada', true), sharing('bob', { screen: true }), sharing('eve', { screen: true })]} />);
    const stage = () => document.querySelector('[data-zoom-stage]') as HTMLElement;
    stage().getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.wheel(stage(), { deltaY: -400, clientX: 500, clientY: 250 });
    expect(stage()).toHaveAttribute('data-zoomed', 'true');

    act(() => useVoiceStore.setState({ focusedParticipantId: 'eve:stream' }));

    expect(stage()).not.toHaveAttribute('data-zoomed');
  });

  it('shows how many people watch a stream, counting this client', async () => {
    useVoiceStore.setState({
      participants: [participant('ada', true), sharing('bob', { screen: true }), participant('eve', false)],
      watchingStreams: new Set(['bob']),
      streamWatchers: new Map([['bob', new Set(['eve'])]]),
    });
    render(<VoiceGrid participants={useVoiceStore.getState().participants} />);

    const faces = () => screen.getAllByTestId('stream-viewer-face').map((face) => face.getAttribute('data-viewer-identity'));
    expect(faces()).toEqual(['ada', 'eve']);
    expect(screen.getByTestId('stream-viewer-count')).toHaveAccessibleName(/2/);

    act(() => useVoiceStore.getState().recordStreamWatch('bob', 'eve', false));
    expect(faces()).toEqual(['ada']);
  });
});

describe('VoiceGrid viewer list', () => {
  beforeEach(() => {
    useVoiceStore.setState({
      focusedParticipantId: null,
      participants: [participant('ada', true), sharing('bob', { screen: true }), participant('eve', false)],
      watchingStreams: new Set(['bob']),
      streamWatchers: new Map([['bob', new Set(['eve'])]]),
    });
  });

  it('names the viewers when the count is pressed, without focusing the tile', async () => {
    render(<VoiceGrid participants={useVoiceStore.getState().participants} />);
    expect(screen.queryByTestId('stream-viewers-popover')).toBeNull();

    await userEvent.click(screen.getByTestId('stream-viewer-count'));

    const popover = screen.getByTestId('stream-viewers-popover');
    expect(popover).toHaveTextContent('eve');
    expect(popover).toHaveTextContent('ada');
    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('stream-viewers-popover')).toBeNull();
  });

  it('names a viewer when their face is hovered', () => {
    render(<VoiceGrid participants={useVoiceStore.getState().participants} />);
    const eve = screen.getAllByTestId('stream-viewer-face').find((face) => face.getAttribute('data-viewer-identity') === 'eve') as HTMLElement;

    fireEvent.mouseEnter(eve);
    expect(screen.getByRole('tooltip')).toHaveTextContent('eve');
    expect(screen.queryByTestId('stream-viewers-popover')).toBeNull();

    fireEvent.mouseLeave(eve);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('folds a crowd into a "+N" chip that opens the full list on hover', () => {
    const crowd = ['eve', 'dan', 'kim', 'lee', 'max', 'noa', 'oli', 'pat'];
    useVoiceStore.setState({
      participants: [participant('ada', true), sharing('bob', { screen: true }), ...crowd.map((name) => participant(name, false))],
      streamWatchers: new Map([['bob', new Set(crowd)]]),
    });
    vi.useFakeTimers();
    try {
      render(<VoiceGrid participants={useVoiceStore.getState().participants} />);

      // Nine viewers on a grid tile: three faces and the other six behind the chip.
      expect(screen.getAllByTestId('stream-viewer-face')).toHaveLength(3);
      expect(screen.getByTestId('stream-viewer-overflow')).toHaveTextContent('+6');

      fireEvent.mouseEnter(screen.getByTestId('stream-viewer-overflow'));
      const popover = screen.getByTestId('stream-viewers-popover');
      for (const name of ['ada', ...crowd]) expect(popover).toHaveTextContent(name);

      fireEvent.mouseLeave(screen.getByTestId('stream-viewer-overflow'));
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.queryByTestId('stream-viewers-popover')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows one viewer past the limit as a face rather than as "+1", and more faces on the focused tile', () => {
    useVoiceStore.setState({
      participants: [participant('ada', true), sharing('bob', { screen: true }), ...['eve', 'dan', 'kim'].map((name) => participant(name, false))],
      streamWatchers: new Map([['bob', new Set(['eve', 'dan', 'kim'])]]),
    });
    const { unmount } = render(<VoiceGrid participants={useVoiceStore.getState().participants} />);
    expect(screen.getAllByTestId('stream-viewer-face')).toHaveLength(4);
    expect(screen.queryByTestId('stream-viewer-overflow')).toBeNull();
    unmount();

    const crowd = ['eve', 'dan', 'kim', 'lee', 'max', 'noa', 'oli', 'pat'];
    useVoiceStore.setState({
      focusedParticipantId: 'bob:stream',
      participants: [participant('ada', true), sharing('bob', { screen: true }), ...crowd.map((name) => participant(name, false))],
      streamWatchers: new Map([['bob', new Set(crowd)]]),
    });
    render(<VoiceGrid participants={useVoiceStore.getState().participants} />);
    expect(screen.getAllByTestId('stream-viewer-face')).toHaveLength(6);
    expect(screen.getByTestId('stream-viewer-overflow')).toHaveTextContent('+3');
  });
});

describe('VoiceGrid own camera', () => {
  it('keeps the viewer\'s own camera a tile of its own next to their share', () => {
    useVoiceStore.setState({ focusedParticipantId: null, watchingStreams: new Set(['ada']) });
    const { container } = render(
      <VoiceGrid participants={[sharing('ada', { screen: true, camera: true }, true), participant('bob', false)]} />,
    );

    expect(screen.getAllByTestId('voice-grid-cell')).toHaveLength(2);
    expect(container.querySelector('[data-testid="tile-inset"]')).toBeNull();
    expect(screen.queryByLabelText(/camera/i, { selector: 'button' })).toBeNull();
  });
});

describe('VoiceGrid stream pointer', () => {
  const people = () => [participant('ada', true), sharing('bob', { screen: true }), participant('eve', false)];

  beforeEach(() => {
    useVoiceStore.setState({
      focusedParticipantId: 'bob:stream',
      participants: people(),
      watchingStreams: new Set(['bob']),
      streamWatchers: new Map(),
    });
    // jsdom lays nothing out: give the picture and its layer a size.
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1600 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
  });

  it('offers pointing only on someone else\'s focused share', () => {
    const { unmount } = render(<VoiceGrid participants={people()} />);
    expect(screen.getByTestId('pointer-toggle')).toHaveAttribute('aria-pressed', 'false');
    unmount();

    useVoiceStore.setState({ focusedParticipantId: 'ada:stream', watchingStreams: new Set(['ada']) });
    render(<VoiceGrid participants={[sharing('ada', { screen: true }, true), participant('bob', false)]} />);
    expect(screen.queryByTestId('pointer-toggle')).toBeNull();
  });

  it('turns a click on the picture into a ping instead of leaving focus while pointing', async () => {
    render(<VoiceGrid participants={people()} />);

    await userEvent.click(screen.getByTestId('pointer-toggle'));
    expect(useStreamPointerStore.getState().pointing).toBe(true);

    const video = document.querySelector('video') as HTMLVideoElement;
    video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    // 1600x900 in an 800x800 box: the picture is 800x450, 175px down.
    fireEvent.pointerMove(video, { clientX: 400, clientY: 400 });
    const own = screen.getByTestId('stream-pointer');
    expect(own).toHaveAttribute('data-pointer-identity', 'ada');
    expect(own.style.left).toBe('50%');
    expect(own.style.top).toBe('50%');

    fireEvent.pointerDown(video, { clientX: 400, clientY: 400, button: 0 });
    fireEvent.pointerUp(video, { clientX: 400, clientY: 400, button: 0 });
    fireEvent.click(video);
    expect(screen.getByTestId('stream-pointer-ping')).toBeInTheDocument();
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');

    // On a letterbox band there is nothing to point at.
    fireEvent.pointerMove(video, { clientX: 400, clientY: 50 });
    expect(screen.queryByTestId('stream-pointer')).toBeNull();
  });

  it('toggles pointing with the P key and switches it off when focus is left', async () => {
    render(<VoiceGrid participants={people()} />);

    fireEvent.keyDown(window, { code: 'KeyP', key: 'з' });
    expect(useStreamPointerStore.getState().pointing).toBe(true);

    act(() => useVoiceStore.setState({ focusedParticipantId: null }));
    expect(useStreamPointerStore.getState().pointing).toBe(false);
  });

  it('draws another viewer\'s pointer, fades it once idle, and hides it when the viewer turned pointers off', () => {
    vi.useFakeTimers();
    try {
      render(<VoiceGrid participants={people()} />);
      act(() => useStreamPointerStore.getState().record('bob', 'eve', { x: 0.25, y: 0.75 }, false));

      const mark = screen.getByTestId('stream-pointer');
      expect(mark).toHaveAttribute('data-pointer-identity', 'eve');
      expect(mark).toHaveTextContent('eve');
      expect(mark.style.left).toBe('25%');
      expect(mark.style.opacity).toBe('1');

      act(() => { vi.advanceTimersByTime(3500); });
      expect(screen.getByTestId('stream-pointer').style.opacity).toBe('0');

      act(() => useVoiceStore.setState({ showStreamPointers: false }));
      expect(screen.queryByTestId('stream-pointer')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('VoiceGrid in voice fullscreen', () => {
  const people = () => [participant('ada', true), sharing('bob', { screen: true }), participant('eve', false)];

  beforeEach(() => {
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream', watchingStreams: new Set(['bob']) });
    useUIStore.setState({ voiceFullscreen: true });
  });

  it('moves the focus buttons below the header band while it shows', () => {
    const { rerender } = render(<VoiceGrid participants={people()} chromeRevealed={false} />);
    expect(screen.getByTestId('focus-actions').className).toContain('top-4');

    rerender(<VoiceGrid participants={people()} chromeRevealed />);
    expect(screen.getByTestId('focus-actions').className).toContain('top-14');
    expect(screen.getByTestId('focus-actions').className).not.toContain('top-4 ');
  });

  it('keeps the strip clear of the control bar, and floats its toggle above the bar once hidden', async () => {
    render(<VoiceGrid participants={people()} chromeRevealed />);
    const root = screen.getByTestId('voice-strip').parentElement as HTMLElement;
    expect(root.className).toContain('pb-20');

    await userEvent.click(screen.getByText(/hide members/i));

    expect(root.className).not.toContain('pb-20');
    const toggle = screen.getByText(/show members/i).closest('[data-voice-chrome]') as HTMLElement;
    expect(toggle.className).toContain('bottom-24');
  });

  it('keeps the grid clear of both bands', () => {
    useVoiceStore.setState({ focusedParticipantId: null });
    render(<VoiceGrid participants={people()} />);

    expect((screen.getByTestId('voice-grid-cell').closest('.pt-12') as HTMLElement).className).toContain('pb-20');
  });
});

describe('VoiceGrid zoom controls', () => {
  const people = () => [participant('ada', true), sharing('bob', { screen: true })];
  const size = { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) };

  function renderFocused() {
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1600 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 900 });
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream', watchingStreams: new Set(['bob']) });
    // jsdom lays nothing out, and the stage is measured as it mounts.
    const measured = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(size as DOMRect);
    render(<VoiceGrid participants={people()} />);
    measured.mockRestore();
    const stage = document.querySelector('[data-zoom-stage]') as HTMLElement;
    stage.getBoundingClientRect = () => size;
    return stage;
  }

  it('always shows the zoom level, and opens into a slider once zoomed', async () => {
    const stage = renderFocused();
    expect(screen.getByTestId('zoom-chip')).toHaveTextContent('100');
    expect(screen.queryByTestId('zoom-slider')).toBeNull();
    expect(screen.queryByTestId('zoom-minimap')).toBeNull();

    await userEvent.click(screen.getByTestId('zoom-chip'));

    expect(stage).toHaveAttribute('data-zoomed', 'true');
    expect(screen.getByTestId('zoom-slider')).toHaveValue('200');
    expect(screen.getByTestId('zoom-reset')).toHaveTextContent('200');
    // Pressing a zoom control never leaves focus mode.
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');
  });

  it('zooms with the slider around the middle of the view, and back to 100 % from the percentage', async () => {
    const stage = renderFocused();
    await userEvent.click(screen.getByTestId('zoom-chip'));

    fireEvent.change(screen.getByTestId('zoom-slider'), { target: { value: '400' } });

    expect(stage.style.getPropertyValue('--stage-zoom-scale')).toBe('4');
    // The middle of the stage stays in the middle: 500 - 500 * 4, 250 - 250 * 4.
    expect(stage.style.getPropertyValue('--stage-zoom-x')).toBe('-1500px');
    expect(stage.style.getPropertyValue('--stage-zoom-y')).toBe('-750px');

    await userEvent.click(screen.getByTestId('zoom-reset'));
    expect(stage).not.toHaveAttribute('data-zoomed');
    expect(screen.getByTestId('zoom-chip')).toBeInTheDocument();
  });

  it('frames the visible part in the minimap and moves the view where the minimap is pressed', async () => {
    const stage = renderFocused();
    await userEvent.click(screen.getByTestId('zoom-chip'));
    fireEvent.wheel(stage, { deltaY: -1, clientX: 500, clientY: 250 });

    const minimap = screen.getByTestId('zoom-minimap');
    // The picture is 1600x900 on a 1000x500 stage: the map takes the picture's
    // 16:9 shape, not the stage's 2:1, so it has no letterbox bands of its own.
    expect(minimap.style.width).toBe('148px');
    expect(minimap.style.height).toBe('83px');
    minimap.getBoundingClientRect = () => ({ ...size, width: 148, height: 83, right: 148, bottom: 83 });
    fireEvent.pointerDown(minimap, { clientX: 148, clientY: 83, buttons: 1 });

    // Pressed in the bottom-right corner: the view goes as far there as it can.
    const scale = Number(stage.style.getPropertyValue('--stage-zoom-scale'));
    expect(parseFloat(stage.style.getPropertyValue('--stage-zoom-x'))).toBeCloseTo(1000 - 1000 * scale, 3);
    expect(parseFloat(stage.style.getPropertyValue('--stage-zoom-y'))).toBeCloseTo(500 - 500 * scale, 3);
    expect(useVoiceStore.getState().focusedParticipantId).toBe('bob:stream');
  });

  it('cuts the minimap frame to the picture when the view reaches into a letterbox band', () => {
    // The picture fills the middle 80 % of the stage's width.
    const picture = { left: 0.1, top: 0, width: 0.8, height: 1 };
    // A view over the left half of the stage sees the picture's first 40 % of stage width.
    expect(pictureView({ left: 0, top: 0, width: 0.5, height: 0.5 }, picture))
      .toEqual({ left: 0, top: 0, width: 0.5, height: 0.5 });
    const inside = pictureView({ left: 0.5, top: 0.25, width: 0.25, height: 0.5 }, picture);
    expect(inside.left).toBeCloseTo(0.5);
    expect(inside.width).toBeCloseTo(0.3125);
  });

  it('moves the quality row under the LIVE badge when the focus bar leaves no room beside it', () => {
    const narrow = { ...size, width: 420, right: 420 };
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 300 });
    useVoiceStore.setState({ focusedParticipantId: 'bob:stream', watchingStreams: new Set(['bob']) });
    const measured = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(narrow as DOMRect);
    const { unmount } = render(<VoiceGrid participants={people()} />);
    measured.mockRestore();

    const stage = () => document.querySelector('[data-zoom-stage]') as HTMLElement;
    expect(stage()).toHaveAttribute('data-focus-tight');
    expect(stage().style.getPropertyValue('--focus-quality-right')).toBe('0.5rem');
    unmount();

    // A wide stage keeps the row beside the bar, ending where the bar begins.
    const wide = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(size as DOMRect);
    render(<VoiceGrid participants={people()} />);
    wide.mockRestore();
    expect(stage()).not.toHaveAttribute('data-focus-tight');
    expect(stage().style.getPropertyValue('--focus-quality-right')).toBe('316px');
  });
});

describe('VoiceGrid strip thumbnails', () => {
  it('shows viewers as a number on a strip thumbnail, where faces would not fit beside the name', () => {
    useVoiceStore.setState({
      focusedParticipantId: 'bob:stream',
      participants: [participant('ada', true), sharing('bob', { screen: true }), sharing('eve', { screen: true }), participant('dan', false)],
      watchingStreams: new Set(['bob', 'eve']),
      streamWatchers: new Map([['eve', new Set(['dan'])], ['bob', new Set(['dan'])]]),
    });
    render(<VoiceGrid participants={useVoiceStore.getState().participants} />);

    const strip = screen.getByTestId('voice-strip');
    const thumbnailCount = strip.querySelector('[data-testid="stream-viewer-count"]') as HTMLElement;
    expect(thumbnailCount).toHaveTextContent('2');
    expect(strip.querySelector('[data-testid="stream-viewer-face"]')).toBeNull();
    // The focused tile above still shows faces.
    expect(screen.getAllByTestId('stream-viewer-face').length).toBeGreaterThan(0);
  });
});


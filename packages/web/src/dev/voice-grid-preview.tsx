// Dev-only workbench for the voice grid. Nothing in the app imports this file;
// `dev-voice-grid.html` is its only entry. It renders the real `VoiceGrid` with
// seeded participants, one scene per `?scene=`, so every arrangement (who gets a
// tile, who sits in the ribbon, the corner inset, focus mode) can be looked at
// and clicked through without a voice call. Pictures are painted canvases
// behind stand-in LiveKit tracks. `?lang=en|de|ru|zh` picks the language.
import { createRoot } from 'react-dom/client';
import type { Track } from 'livekit-client';
import { VoiceGrid } from '../components/voice/VoiceGrid';
import { ContextMenuRenderer } from '../components/ui/ContextMenuRenderer';
import { useVoiceStore } from '../stores/voiceStore';
import { PingGraph } from '../components/voice/PingGraph';
import { pushPing } from '../utils/pingHistory';
import { useUIStore } from '../stores/uiStore';
import { useStreamPointerStore } from '../stores/streamPointerStore';
import type { ParticipantInfo } from '../hooks/useLiveKit';
import { initI18n } from '../i18n';
import { initializeInterfaceScale } from '../platform/interfaceScale';
import '../styles/globals.css';

interface Person {
  name: string;
  local?: boolean;
  screen?: boolean;
  camera?: boolean;
  muted?: boolean;
  speaking?: boolean;
}

interface Scene {
  caption: string;
  people: Person[];
  focus?: string;
  hidden?: string[];
  /** Screens the viewer has not pressed "Watch" on. */
  unwatched?: string[];
  /** Sharer to the others who watch them, as their clients would have announced. */
  watchers?: Record<string, string[]>;
  /** Sharer to the viewers whose pointers circle over their share. */
  pointers?: Record<string, string[]>;
}

const SCENES: Record<string, Scene> = {
  idle: {
    caption: 'Nobody shows anything: the plain avatar grid, no ribbon',
    people: [{ name: 'funpin', local: true }, { name: 'akk0' }, { name: 'fox', speaking: true }, { name: 'marsel', muted: true }],
  },
  screens: {
    caption: 'Three people share a screen: three tiles, the viewer in the ribbon',
    people: [{ name: 'funpin', local: true, muted: true }, { name: 'akk0', screen: true }, { name: 'fox', screen: true, speaking: true }, { name: 'marsel', screen: true }],
  },
  mixed: {
    caption: 'Screen only, camera only, screen and camera, two people idle, one tile hidden, one screen not watched',
    people: [
      { name: 'funpin', local: true },
      { name: 'akk0', screen: true },
      { name: 'fox', camera: true, speaking: true },
      { name: 'marsel', screen: true, camera: true },
      { name: 'nika', muted: true },
      { name: 'leo', screen: true },
      { name: 'vera', screen: true },
    ],
    hidden: ['leo'],
    unwatched: ['vera'],
    watchers: { akk0: ['fox', 'marsel', 'nika'], marsel: ['nika'] },
  },
  focus: {
    caption: 'One tile in focus: the rest and the people without media share the strip',
    people: [
      { name: 'funpin', local: true, screen: true },
      { name: 'akk0', screen: true },
      { name: 'fox', camera: true, speaking: true },
      { name: 'marsel', screen: true, camera: true },
      { name: 'nika' },
    ],
    focus: 'marsel:stream',
    watchers: { marsel: ['akk0', 'fox'], funpin: ['akk0', 'fox', 'nika'] },
  },
  pointer: {
    caption: 'Two viewers point at the focused share; press P or the arrow button to point yourself',
    people: [
      { name: 'funpin', local: true, camera: true },
      { name: 'akk0', screen: true },
      { name: 'fox', speaking: true },
      { name: 'marsel' },
    ],
    focus: 'akk0:stream',
    watchers: { akk0: ['fox', 'marsel'] },
    pointers: { akk0: ['fox', 'marsel'] },
  },
  self: {
    caption: 'Your own share steps into the ribbon once someone else shares',
    people: [{ name: 'funpin', local: true, screen: true, camera: true }, { name: 'akk0', screen: true }, { name: 'nika' }],
  },
  alone: {
    caption: 'Your own share is the only media: it fills the grid',
    people: [{ name: 'funpin', local: true, screen: true }, { name: 'akk0' }],
  },
};

const HUES: Record<string, number> = { funpin: 200, akk0: 30, fox: 140, marsel: 280, nika: 340, leo: 60, vera: 180 };

/** A canvas painted as a stand-in picture, wrapped the way the tiles expect a LiveKit track. */
function fakeTrack(label: string, hue: number, kind: 'screen' | 'camera'): { track: MediaStreamTrack; lk: Track } {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  const paint = () => {
    ctx.fillStyle = kind === 'screen' ? `hsl(${hue} 25% 14%)` : `hsl(${hue} 45% 32%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (kind === 'screen') {
      ctx.fillStyle = `hsl(${hue} 30% 22%)`;
      for (let row = 0; row < 6; row++) ctx.fillRect(80, 90 + row * 95, 1120 - row * 120, 48);
    } else {
      ctx.fillStyle = `hsl(${hue} 50% 62%)`;
      ctx.beginPath();
      ctx.arc(640, 300, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(390, 480, 500, 240);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 44px sans-serif';
    ctx.fillText(`${label} · ${kind}`, 80, 660);
  };
  paint();
  // A captured canvas emits a frame only when it is drawn to.
  window.setInterval(paint, 1000);
  const stream = canvas.captureStream(5);
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('canvas produced no video track');
  const lk = {
    attach: (el: HTMLMediaElement) => { el.srcObject = stream; return el; },
    detach: (el: HTMLMediaElement) => { el.srcObject = null; return el; },
  };
  return { track, lk: lk as unknown as Track };
}

function buildParticipant(person: Person): ParticipantInfo {
  const hue = HUES[person.name] ?? 0;
  const screen = person.screen ? fakeTrack(person.name, hue, 'screen') : null;
  const camera = person.camera ? fakeTrack(person.name, hue, 'camera') : null;
  return {
    identity: person.name,
    userId: person.name,
    username: person.name,
    homeUserId: null,
    isMuted: person.muted ?? false,
    isDeafened: false,
    isCameraOn: camera !== null,
    isScreenSharing: screen !== null,
    isLocal: person.local ?? false,
    audioTrack: null,
    videoTrack: camera?.track ?? null,
    screenTrack: screen?.track ?? null,
    screenAudioTrack: null,
    lkVideoTrack: camera?.lk ?? null,
    lkScreenTrack: screen?.lk ?? null,
    cachedUser: null,
  };
}

/** Moves each seeded pointer along its own slow ellipse, with a click now and then. */
function animatePointers(pointers: Record<string, string[]>): void {
  const started = Date.now();
  window.setInterval(() => {
    const t = (Date.now() - started) / 1000;
    for (const [sharer, viewers] of Object.entries(pointers)) {
      viewers.forEach((viewer, index) => {
        // The second pointer rests half of the time, to show the idle fade.
        if (index === 1 && Math.floor(t / 5) % 2 === 1) return;
        const angle = t * (0.9 - index * 0.35) + index * 2;
        useStreamPointerStore.getState().record(
          sharer,
          viewer,
          { x: 0.5 + Math.cos(angle) * (0.22 + index * 0.1), y: 0.45 + Math.sin(angle) * (0.2 + index * 0.08) },
          index === 0 && Math.floor(t * 30) % 120 === 0,
        );
      });
    }
  }, 33);
}

function Workbench({ scene, participants }: { scene: Scene; participants: ParticipantInfo[] }) {
  // `?fullscreen=1` lays the grid out as voice fullscreen does; `&chrome=1`
  // as while its header band and control bar are showing.
  const params = new URLSearchParams(window.location.search);
  const chromeRevealed = params.get('chrome') === '1';
  return (
    <div style={{ height: 'calc(100 * var(--app-vh))', background: 'rgb(var(--bg-chat))', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 12, color: 'rgb(var(--text-tertiary))', padding: '8px 16px' }}>{scene.caption}</span>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <VoiceGrid participants={participants} chromeRevealed={chromeRevealed} />
      </div>
      {params.get('ping') === '1' && (
        // `?ping=1`: the connection popover's ping graph, on a link that spikes every few seconds.
        <div className="glass rounded-lg" style={{ position: 'fixed', left: 16, bottom: 16, width: 300, padding: '8px 12px' }}>
          <PingGraph />
        </div>
      )}
      <ContextMenuRenderer />
    </div>
  );
}

async function main(): Promise<void> {
  const host = document.getElementById('root');
  if (!host) throw new Error('missing #root');
  initializeInterfaceScale();
  const params = new URLSearchParams(window.location.search);
  const scene = SCENES[params.get('scene') ?? 'mixed'] ?? SCENES.mixed!;
  await initI18n(); // reads `?lang=` itself in dev
  const participants = scene.people.map(buildParticipant);
  const unwatched = new Set(scene.unwatched ?? []);
  useVoiceStore.setState({
    participants,
    currentVoiceChannelId: 'voice-1',
    focusedParticipantId: scene.focus ?? null,
    hiddenTileUserIds: new Set(scene.hidden ?? []),
    watchingStreams: new Set(scene.people.filter((p) => p.screen && !unwatched.has(p.name)).map((p) => p.name)),
    speakingParticipantIds: new Set(scene.people.filter((p) => p.speaking).map((p) => p.name)),
    streamWatchers: new Map(Object.entries(scene.watchers ?? {}).map(([sharer, viewers]) => [sharer, new Set(viewers)])),
  });
  useUIStore.setState({ voiceFullscreen: params.get('fullscreen') === '1' });
  if (scene.pointers) animatePointers(scene.pointers);
  if (params.get('ping') === '1') {
    const sample = (i: number) => (i % 37 === 20 ? null : i % 18 === 0 ? 87 : i % 18 === 5 ? 62 : 6 + (i * 7) % 9);
    for (let i = 0; i < 90; i++) pushPing(sample(i));
    let next = 90;
    window.setInterval(() => pushPing(sample(next++)), 1000);
  }
  createRoot(host).render(<Workbench scene={scene} participants={participants} />);
}

void main();

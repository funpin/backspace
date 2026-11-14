import React, { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useVoiceStore } from '../../stores/voiceStore';
import {
  STREAM_POINTER_IDLE_MS,
  STREAM_POINTER_PING_MS,
  useStreamPointerStore,
  type RemotePointer,
} from '../../stores/streamPointerStore';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { containedBox, pointInPicture, type Box, type PicturePoint } from '../../utils/streamPointerProtocol';
import { publishStreamPointer } from '../../utils/streamPointerActions';
import type { ParticipantInfo } from '../../hooks/useLiveKit';

/** At most one move every this many ms: about thirty a second. */
const SEND_INTERVAL_MS = 33;
/** Pointer travel, in px, past which a press is a drag (a pan) rather than a click. */
const CLICK_TRAVEL_PX = 4;
/** How often the layer re-checks which pointers went idle. */
const TICK_MS = 250;

const POINTER_COLORS = [
  'rgb(var(--accent-mint))',
  'rgb(var(--accent-sky))',
  'rgb(var(--accent-lavender))',
  'rgb(var(--accent-amber))',
  // No peach: next to rose it reads as the same person.
  'rgb(var(--accent-rose))',
  'rgb(var(--accent-coral))',
];

/** One colour per person, the same on every client: it is derived from the identity all of them share. */
export function pointerColor(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
  return POINTER_COLORS[hash % POINTER_COLORS.length] ?? POINTER_COLORS[0]!;
}

const EMPTY_POINTERS: ReadonlyMap<string, RemotePointer> = new Map();

interface PointerMarkProps {
  participant: ParticipantInfo;
  point: PicturePoint;
  /** Fully drawn, or faded because it has not moved for a while. */
  visible: boolean;
  /** Changes with every click, so the ring restarts. 0 draws none. */
  pingKey: number;
  /** The viewer's own pointer: follows the mouse exactly, and dims instead of vanishing. */
  own?: boolean;
}

function PointerMark({ participant, point, visible, pingKey, own }: PointerMarkProps) {
  const { displayName } = useVoiceParticipantMeta(participant);
  const color = pointerColor(participant.identity);
  return (
    <div
      data-testid="stream-pointer"
      data-pointer-identity={participant.identity}
      className={`absolute w-0 h-0 ${own ? '' : 'stream-pointer-glide'}`}
      style={{
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
        opacity: visible ? 1 : own ? 0.4 : 0,
        transitionProperty: own ? 'opacity' : 'left, top, opacity',
      }}
    >
      {/* The layer zooms with the picture so positions stay true; the mark
          itself is scaled back so it keeps its size at any zoom. */}
      <div className="stream-pointer-mark">
        {pingKey > 0 && (
          <span
            key={pingKey}
            data-testid="stream-pointer-ping"
            className="stream-pointer-ping"
            style={{ borderColor: color }}
          />
        )}
        <svg width="20" height="20" viewBox="0 0 20 20" className="absolute left-0 top-0 drop-shadow" aria-hidden="true">
          <path
            d="M2 1.5 16.5 8.2 10 10.2 7.6 16.8Z"
            fill={color}
            stroke="rgba(0,0,0,0.65)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="absolute left-[15px] top-[15px] px-1.5 py-px rounded rounded-tl-sm text-2xs font-semibold text-black/80 whitespace-nowrap"
          style={{ backgroundColor: color }}
        >
          {displayName}
        </span>
      </div>
    </div>
  );
}

interface StreamPointerLayerProps {
  /** The tile's root: the pointer is tracked over it. */
  rootRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  sharer: ParticipantInfo;
  /** This tile is where the viewer may point from: a focused share of someone else's. */
  canPoint: boolean;
}

/**
 * Everything pointer-related on one stream tile: draws the pointers other
 * viewers show on this share, and, while this viewer is pointing, tracks
 * their own mouse over the picture, sends it and draws it.
 *
 * The layer is a child of the tile root with the same box as the video and
 * takes the same zoom transform (`[data-zoom-follow]` in globals.css), so a
 * pointer placed as a percentage of the picture stays on the same pixel of it
 * through letterboxing, zoom and pan.
 */
export function StreamPointerLayer({ rootRef, videoRef, sharer, canPoint }: StreamPointerLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const pointing = useStreamPointerStore((s) => s.pointing);
  const remote = useStreamPointerStore((s) => s.pointers.get(sharer.identity)) ?? EMPTY_POINTERS;
  const showRemote = useVoiceStore((s) => s.showStreamPointers);
  const participants = useVoiceStore((s) => s.participants);
  const localParticipant = participants.find((p) => p.isLocal) ?? null;
  const sending = canPoint && pointing;

  const [picture, setPicture] = useState<Box | null>(null);
  const [own, setOwn] = useState<{ point: PicturePoint; movedAt: number; pingAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Where the picture sits inside the layer, before any zoom.
  useEffect(() => {
    const layer = layerRef.current;
    const video = videoRef.current;
    if (!layer || !video) return;
    const measure = () => {
      setPicture(containedBox(
        { left: 0, top: 0, width: layer.clientWidth, height: layer.clientHeight },
        video.videoWidth,
        video.videoHeight,
      ));
    };
    measure();
    // The picture's own size changes mid-share: a window resized, a simulcast layer switched.
    video.addEventListener('resize', measure);
    video.addEventListener('loadedmetadata', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(layer);
    return () => {
      video.removeEventListener('resize', measure);
      video.removeEventListener('loadedmetadata', measure);
      observer?.disconnect();
    };
  }, [videoRef]);

  // Track and send the viewer's own pointer.
  const sharerRef = useRef(sharer);
  sharerRef.current = sharer;
  useEffect(() => {
    if (!sending) return;
    const root = rootRef.current;
    if (!root) return;

    let shown = false;
    let lastSentAt = 0;
    let pending: PicturePoint | null = null;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    let press: { x: number; y: number } | null = null;

    const locate = (e: PointerEvent): PicturePoint | null => {
      const video = videoRef.current;
      // Only the picture counts: over the caption or a badge the mouse is
      // just a mouse again.
      if (!video || e.target !== video) return null;
      return pointInPicture(e.clientX, e.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
    };
    const cancelTrailing = () => {
      if (trailing !== null) {
        clearTimeout(trailing);
        trailing = null;
      }
    };
    const flush = () => {
      trailing = null;
      if (!pending) return;
      lastSentAt = Date.now();
      publishStreamPointer(sharerRef.current, pending);
      pending = null;
    };
    const leave = () => {
      cancelTrailing();
      pending = null;
      press = null;
      if (!shown) return;
      shown = false;
      setOwn(null);
      publishStreamPointer(sharerRef.current, null);
    };
    const handleMove = (e: PointerEvent) => {
      const point = locate(e);
      if (!point) {
        leave();
        return;
      }
      shown = true;
      const at = Date.now();
      setOwn((current) => ({ point, movedAt: at, pingAt: current?.pingAt ?? 0 }));
      pending = point;
      const wait = SEND_INTERVAL_MS - (at - lastSentAt);
      if (wait <= 0) {
        cancelTrailing();
        flush();
      } else if (trailing === null) {
        // The last position of a burst is the one that matters: send it too.
        trailing = setTimeout(flush, wait);
      }
    };
    const handleDown = (e: PointerEvent) => {
      press = e.button === 0 && locate(e) ? { x: e.clientX, y: e.clientY } : null;
    };
    const handleUp = (e: PointerEvent) => {
      const start = press;
      press = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TRAVEL_PX) return;
      const point = locate(e);
      if (!point) return;
      shown = true;
      cancelTrailing();
      pending = null;
      const at = Date.now();
      lastSentAt = at;
      setOwn({ point, movedAt: at, pingAt: at });
      publishStreamPointer(sharerRef.current, point, true);
    };

    root.addEventListener('pointermove', handleMove);
    root.addEventListener('pointerdown', handleDown);
    root.addEventListener('pointerup', handleUp);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('pointercancel', leave);
    return () => {
      root.removeEventListener('pointermove', handleMove);
      root.removeEventListener('pointerdown', handleDown);
      root.removeEventListener('pointerup', handleUp);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('pointercancel', leave);
      // Pointing switched off, or the tile went away: the others stop seeing it now.
      leave();
    };
  }, [sending, rootRef, videoRef]);

  // Idle pointers fade on a timer, not on an event: nothing arrives when a mouse stops.
  const hasPointers = own !== null || (showRemote && remote.size > 0);
  useEffect(() => {
    if (!hasPointers) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [hasPointers]);

  const isFresh = (movedAt: number) => now - movedAt < STREAM_POINTER_IDLE_MS;
  const pingKey = (pingAt: number) => (pingAt > 0 && now - pingAt < STREAM_POINTER_PING_MS + TICK_MS ? pingAt : 0);

  return (
    <div ref={layerRef} data-zoom-follow data-testid="stream-pointer-layer" className="absolute inset-0 pointer-events-none">
      {picture && (
        <div
          className="absolute"
          style={{ left: picture.left, top: picture.top, width: picture.width, height: picture.height }}
        >
          {showRemote && participants.map((p) => {
            const pointer = p.isLocal ? undefined : remote.get(p.identity);
            if (!pointer) return null;
            return (
              <PointerMark
                key={p.identity}
                participant={p}
                point={pointer.point}
                visible={isFresh(pointer.movedAt)}
                pingKey={pingKey(pointer.pingAt)}
              />
            );
          })}
          {own && localParticipant && (
            <PointerMark
              own
              participant={localParticipant}
              point={own.point}
              visible={isFresh(own.movedAt)}
              pingKey={pingKey(own.pingAt)}
            />
          )}
        </div>
      )}
    </div>
  );
}

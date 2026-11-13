import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore, type TileInsetCorner } from '../../stores/voiceStore';
import type { GridCell } from '../../utils/voiceGridLayout';

interface TileInsetProps {
  /** A cell with an inset: one participant's screen and camera sharing a tile. */
  cell: GridCell;
}

/** Pointer travel, in px, past which a press on the inset is a drag rather than a click. */
const DRAG_THRESHOLD = 6;

const DEFAULT_CORNER: TileInsetCorner = 'bottom-right';

// The offsets clear the tile's own chrome: the LIVE and quality badges along
// the top edge, the name caption along the bottom.
const CORNER_CLASSES: Record<TileInsetCorner, string> = {
  'top-left': 'top-10 left-2',
  'top-right': 'top-10 right-2',
  'bottom-left': 'bottom-10 left-2',
  'bottom-right': 'bottom-10 right-2',
};

function nearestCorner(x: number, y: number, bounds: DOMRect): TileInsetCorner {
  const vertical = y < bounds.top + bounds.height / 2 ? 'top' : 'bottom';
  const horizontal = x < bounds.left + bounds.width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

/**
 * The small second picture in the corner of a tile whose owner shows both a
 * screen and a camera. Click swaps it with the large one; the button on it
 * moves the camera out into a tile of its own; dragging parks it in whichever
 * corner is nearest, for when it sits on top of something worth seeing.
 */
export function TileInset({ cell }: TileInsetProps) {
  const { t } = useTranslation(['voice', 'common']);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  // Set when a press turned into a drag, so the click that ends it is not a swap.
  const draggedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const { participant, inset } = cell;
  const userId = participant.userId;
  const corner = useVoiceStore((s) => s.tileInsetCorners.get(userId) ?? DEFAULT_CORNER);
  const isWatchingStream = useVoiceStore((s) => s.watchingStreams.has(userId));

  const lkTrack = inset === null
    ? null
    : inset.kind === 'user'
      ? inset.lkVideoTrack
      : inset.screenTrack?.readyState === 'live' && isWatchingStream
        ? inset.lkScreenTrack
        : null;

  // track.attach() registers the element with LiveKit's adaptive-stream
  // observer, so the SFU sends the layer that fits this small box.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (lkTrack) {
      lkTrack.attach(videoEl);
      return () => { lkTrack.detach(videoEl); };
    }
    videoEl.srcObject = null;
  }, [lkTrack]);

  if (inset === null) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    pressRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!draggedRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      rootRef.current?.setPointerCapture(e.pointerId);
    }
    setDragOffset({ x: dx, y: dy });
  };

  const endPress = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    pressRef.current = null;
    setDragOffset(null);
    if (!draggedRef.current || !commit) return;
    const tile = rootRef.current?.parentElement;
    if (!tile) return;
    useVoiceStore.getState().setTileInsetCorner(
      userId,
      nearestCorner(e.clientX, e.clientY, tile.getBoundingClientRect()),
    );
  };

  const handleSwap = (e: React.MouseEvent) => {
    // The tile underneath focuses on click; the inset's click is its own.
    e.stopPropagation();
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    useVoiceStore.getState().toggleTileSwap(userId);
  };

  const handleSplit = (e: React.MouseEvent) => {
    e.stopPropagation();
    useVoiceStore.getState().setCameraSplit(userId, true);
  };

  return (
    <div
      ref={rootRef}
      data-testid="tile-inset"
      className={`absolute z-10 w-[22%] min-w-[96px] max-w-[280px] aspect-video rounded-lg overflow-hidden bg-surface-channel ring-1 ring-white/15 shadow-lg group/inset touch-none ${CORNER_CLASSES[corner]} ${dragOffset ? 'cursor-grabbing' : ''}`}
      style={dragOffset ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endPress(e, true)}
      onPointerCancel={(e) => endPress(e, false)}
    >
      <button
        type="button"
        onClick={handleSwap}
        aria-label={t('voice:grid.swapSources')}
        title={t('voice:grid.swapSources')}
        className="block w-full h-full"
      >
        {lkTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full pointer-events-none ${inset.kind === 'user' ? 'object-cover' : 'object-contain bg-black'}`}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-txt-tertiary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
            </svg>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={handleSplit}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={t('voice:grid.splitCamera')}
        title={t('voice:grid.splitCamera')}
        className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 text-white/70 hover:text-white flex items-center justify-center transition-opacity opacity-0 group-hover/inset:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M14 4l2.29 2.29-2.88 2.88 1.42 1.42 2.88-2.88L20 10V4zm-4 0H4v6l2.29-2.29 4.71 4.7V20h2v-8.41l-5.29-5.3z" />
        </svg>
      </button>
    </div>
  );
}

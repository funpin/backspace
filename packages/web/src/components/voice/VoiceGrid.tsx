import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceUser } from './VoiceUser';
import { StreamTile } from './StreamTile';
import { TileInset } from './TileInset';
import { VoiceRibbon } from './VoiceRibbon';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUIStore } from '../../stores/uiStore';
import { useGridLayout } from '../../hooks/useGridLayout';
import { useStageZoom } from '../../hooks/useStageZoom';
import type { ParticipantInfo, GridTile } from '../../hooks/useLiveKit';
import { useTrackStats } from '../../hooks/useTrackStats';
import {
  deriveVoiceGridLayout,
  findFocusedCell,
  focusableCells,
  reorderCells,
  type GridCell,
} from '../../utils/voiceGridLayout';
import { hideParticipantTile } from '../../utils/voiceTileActions';
import { StageZoomBar, StageZoomMinimap } from './StageZoomControls';
import { useStreamPointerStore } from '../../stores/streamPointerStore';
import { VOICE_CHROME_ATTR } from '../../hooks/usePointerReveal';

interface VoiceGridProps {
  participants: ParticipantInfo[];
  /**
   * Voice fullscreen only: the header band and the control bar are showing
   * over the grid right now (see usePointerReveal). The grid moves what they
   * would cover out from under them.
   */
  chromeRevealed?: boolean;
}

/** Fullscreen: on a pointer that cannot hover the chrome never hides, so its room is always kept. */
const WHEN_CHROME_IS_PERMANENT = '[@media(hover:none)]:top-14 [@media(any-pointer:coarse)]:top-14';

/** Where the focused tile's quality row starts: past the LIVE badge (`left-20` in StreamTile). */
const LIVE_BADGE_CLEARANCE = 80;
/** The least room the quality row needs beside the focus bar: the quality badge itself, with air. */
const MIN_QUALITY_ROW_WIDTH = 130;

/** Below this tile width a corner inset is a smudge; the cell shows a badge instead. */
const MIN_TILE_WIDTH_FOR_INSET = 280;

const OVERLAY_BUTTON =
  'h-7 bg-black/60 hover:bg-black/80 rounded-lg flex items-center justify-center text-white/70 hover:text-white transition-colors';

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
    </svg>
  );
}

function PointerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 2.5 17 9l-6.2 1.9L8.5 17.2Z" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
    </svg>
  );
}

export function VoiceGrid({ participants, chromeRevealed = false }: VoiceGridProps) {
  const { t } = useTranslation(['voice', 'common']);
  const focusedParticipantId = useVoiceStore((s) => s.focusedParticipantId);
  const setFocusedParticipant = useVoiceStore((s) => s.setFocusedParticipant);
  const watchingStreams = useVoiceStore((s) => s.watchingStreams);
  const hiddenTileUserIds = useVoiceStore((s) => s.hiddenTileUserIds);
  const swappedTileUserIds = useVoiceStore((s) => s.swappedTileUserIds);
  const splitCameraUserIds = useVoiceStore((s) => s.splitCameraUserIds);
  const setCameraSplit = useVoiceStore((s) => s.setCameraSplit);
  const tileOrder = useVoiceStore((s) => s.tileOrder);
  // Drag-to-reorder in grid mode: the cell being dragged and the one under it.
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [stripHidden, setStripHidden] = useState(false);
  const voiceFullscreen = useUIStore((s) => s.voiceFullscreen);
  // Wheel zoom and drag pan on the focused picture. Keyed by the focus target,
  // so every picture opens unzoomed.
  const stageZoom = useStageZoom(focusedParticipantId);
  const { isZoomed, reset: resetZoom } = stageZoom;
  // How wide the focus bar is right now. The focused tile's quality row ends
  // where the bar begins, so it follows the bar as buttons come and go.
  const [focusActions, setFocusActions] = useState<HTMLDivElement | null>(null);
  const [focusActionsWidth, setFocusActionsWidth] = useState(0);
  useEffect(() => {
    if (!focusActions) return;
    const measure = () => setFocusActionsWidth(focusActions.offsetWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(focusActions);
    return () => observer.disconnect();
  }, [focusActions]);
  // In a narrow window the bar leaves no room beside it: between the LIVE
  // badge and the bar the quality row would land on top of the badge. It then
  // drops to a line of its own under the badge.
  const focusBarCrowdsTop = stageZoom.stageSize.width > 0
    && stageZoom.stageSize.width - focusActionsWidth - 16 - LIVE_BADGE_CLEARANCE < MIN_QUALITY_ROW_WIDTH;
  const pointing = useStreamPointerStore((s) => s.pointing);
  const setPointing = useStreamPointerStore((s) => s.setPointing);

  const layout = useMemo(
    () => deriveVoiceGridLayout(participants, {
      hidden: hiddenTileUserIds,
      swapped: swappedTileUserIds,
      split: splitCameraUserIds,
      order: tileOrder,
    }),
    [participants, hiddenTileUserIds, swappedTileUserIds, splitCameraUserIds, tileOrder],
  );
  const focusable = useMemo(() => focusableCells(layout), [layout]);
  const selfRibbonCells = useMemo(
    () => layout.ribbon.flatMap((entry) => (entry.kind === 'self' ? [entry.cell] : [])),
    [layout],
  );

  // Pointing needs a picture to point at: someone else's share, large and arriving.
  const focusedForPointer = findFocusedCell(focusable, focusedParticipantId);
  const canPoint = focusedForPointer !== null
    && focusedForPointer.main.kind === 'stream'
    && !focusedForPointer.participant.isLocal
    && watchingStreams.has(focusedForPointer.participant.userId);

  // Pointing never outlives the picture it was switched on for: leaving focus,
  // or focusing something that cannot be pointed at, switches it off.
  useEffect(() => {
    if (!canPoint && useStreamPointerStore.getState().pointing) setPointing(false);
  }, [canPoint, setPointing]);

  // P toggles pointing. Read by physical key, so it works on any keyboard layout.
  useEffect(() => {
    if (!canPoint) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      const store = useStreamPointerStore.getState();
      store.setPointing(!store.pointing);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canPoint]);

  const shouldCollectStreamStats = focusable.some((cell) =>
    [cell.main, cell.inset].some((tile) =>
      tile?.kind === 'stream'
      && (tile.participant.isLocal || watchingStreams.has(tile.participant.userId)),
    ),
  );
  // One WebRTC poller feeds every stream tile. Running useTrackStats inside
  // each tile multiplied full PeerConnection scans by the number of streams.
  const streamStats = useTrackStats(shouldCollectStreamStats);

  const { cols, tileWidth, tileHeight, ref: gridRef } = useGridLayout(layout.cells.length);

  // Reset strip visibility when focus target changes
  useEffect(() => {
    setStripHidden(false);
  }, [focusedParticipantId]);

  // Unfocus when what was in focus is gone: the share ended, or its owner now
  // sits in the ribbon (nothing left to show, or the viewer hid the tile).
  useEffect(() => {
    if (!focusedParticipantId) return;
    const cell = findFocusedCell(focusable, focusedParticipantId);
    if (!cell) {
      setFocusedParticipant(null);
      return;
    }
    if (!focusedParticipantId.endsWith(':stream')) return;
    const stream = [cell.main, cell.inset].find(
      (tile): tile is GridTile & { kind: 'stream' } => tile?.kind === 'stream',
    );
    if (stream?.screenTrack?.readyState !== 'live') {
      setFocusedParticipant(null);
    }
  }, [focusable, focusedParticipantId, setFocusedParticipant]);

  // Escape undoes one thing at a time: a zoom first, then focus mode. In voice
  // fullscreen the same key leaves fullscreen (VoiceControlBar) instead.
  useEffect(() => {
    if (!focusedParticipantId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useUIStore.getState().voiceFullscreen) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (isZoomed) resetZoom();
      else setFocusedParticipant(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedParticipantId, setFocusedParticipant, isZoomed, resetZoom]);

  if (participants.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-txt-tertiary/40 mx-auto mb-3"
          >
            <path d="M11 5L6 9H2V15H6L11 19V5ZM15.54 8.46C16.48 9.4 17 10.67 17 12S16.48 14.6 15.54 15.54L14.12 14.12C14.69 13.55 15 12.79 15 12S14.69 10.45 14.12 9.88L15.54 8.46Z" />
          </svg>
          <p className="text-txt-tertiary text-sm">
            {t('voice:grid.waitingForOthers')}
          </p>
        </div>
      </div>
    );
  }

  // Render a single tile polymorphically
  const renderTile = (tile: GridTile, large?: boolean, compact?: boolean, dense?: boolean) =>
    tile.kind === 'user' ? (
      <VoiceUser tile={tile} large={large} />
    ) : (
      <StreamTile tile={tile} large={large} compact={compact} dense={dense} stats={streamStats} />
    );

  // A camera the viewer moved out of its owner's screen tile can go back.
  const canMerge = (cell: GridCell) =>
    cell.main.kind === 'user'
    && !cell.participant.isLocal
    && cell.inset === null
    && cell.participant.isScreenSharing
    && splitCameraUserIds.has(cell.participant.userId);

  const cellActions = (cell: GridCell) => {
    const actions: React.ReactNode[] = [];
    if (canMerge(cell)) {
      actions.push(
        <button
          key="merge"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCameraSplit(cell.participant.userId, false);
          }}
          className={`${OVERLAY_BUTTON} w-7`}
          aria-label={t('voice:grid.mergeCamera')}
          title={t('voice:grid.mergeCamera')}
        >
          <MergeIcon />
        </button>,
      );
    }
    if (layout.mediaMode && !cell.participant.isLocal) {
      actions.push(
        <button
          key="hide"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hideParticipantTile(cell.participant);
          }}
          className={`${OVERLAY_BUTTON} w-7`}
          aria-label={t('voice:grid.hideTile')}
          title={t('voice:grid.hideTile')}
        >
          <EyeOffIcon />
        </button>,
      );
    }
    return actions;
  };

  /**
   * `full` is a grid or focused cell: it carries its inset. A thumbnail is too
   * small for one and marks the second source with a badge instead.
   */
  const renderCell = (cell: GridCell, variant: 'grid' | 'focused' | 'thumbnail', compact?: boolean) => {
    const showInset = cell.inset !== null
      && (variant === 'focused' || (variant === 'grid' && tileWidth >= MIN_TILE_WIDTH_FOR_INSET));
    const actions = variant === 'grid' ? cellActions(cell) : [];
    return (
      <div
        className="relative h-full w-full group/cell"
        {...(variant === 'focused'
          ? {
            ...stageZoom.stageProps,
            style: {
              ...stageZoom.stageProps.style,
              '--focus-quality-right': focusBarCrowdsTop ? '0.5rem' : `${focusActionsWidth + 16}px`,
            } as React.CSSProperties,
            'data-focus-tight': focusBarCrowdsTop ? '' : undefined,
          }
          : {})}
      >
        {renderTile(cell.main, variant === 'focused', compact, variant === 'thumbnail')}
        {showInset && <TileInset cell={cell} />}
        {cell.inset !== null && !showInset && (
          <div
            data-testid="tile-inset-badge"
            className="absolute bottom-2 right-2 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white/80 pointer-events-none"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {cell.inset.kind === 'user'
                ? <path d="M17 10.5V7c0-.55-.45-1-1-1H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h14c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                : <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />}
            </svg>
          </div>
        )}
        {actions.length > 0 && (
          <div className="absolute top-10 right-2 z-10 flex items-center gap-1.5 transition-opacity opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            {actions}
          </div>
        )}
      </div>
    );
  };

  const renderThumbnail = (cell: GridCell, compact?: boolean) => (
    <div
      key={cell.key}
      onClick={() => setFocusedParticipant(cell.key)}
      className="h-full aspect-video flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
    >
      {renderCell(cell, 'thumbnail', compact)}
    </div>
  );

  const focusedCell = findFocusedCell(focusable, focusedParticipantId);

  // Focus mode: one large cell, and under it a single strip that holds every
  // other picture and every person without one.
  if (focusedCell) {
    const otherCells = focusable.filter((cell) => cell !== focusedCell);
    const hasStrip = otherCells.length > 0 || layout.ribbon.some((entry) => entry.kind !== 'self');
    const isPointing = canPoint && pointing;
    // Fullscreen floats the control bar over the bottom edge. The strip keeps
    // clear of it; with the strip hidden the picture takes the whole height
    // and the bar passes over it, as fullscreen means.
    const stripOpen = hasStrip && !stripHidden;
    const stripToggleFloats = voiceFullscreen && hasStrip && stripHidden;
    return (
      <div className={`flex-1 flex flex-col overflow-hidden relative ${voiceFullscreen && stripOpen ? 'pb-20' : ''}`}>
        {/* Main focused view. A click anywhere on it returns to the grid,
            unless the picture is zoomed: then the click belongs to the pan. */}
        <div
          className="flex-1 p-2 min-h-0 cursor-pointer relative"
          // While pointing, a click on the picture is a ping for the others,
          // and must not also throw the viewer back to the grid.
          onClick={() => { if (!isPointing) setFocusedParticipant(null); }}
        >
          {renderCell(focusedCell, 'focused')}
          {/* Tile actions and the Grid button — top-right. In fullscreen
              they step down while the header band is over the top edge. */}
          <div
            ref={setFocusActions}
            data-testid="focus-actions"
            className={`absolute right-4 z-10 flex items-center gap-2 transition-[top] duration-300 ease-out ${
              voiceFullscreen ? `${chromeRevealed ? 'top-14' : 'top-4'} ${WHEN_CHROME_IS_PERMANENT}` : 'top-4'
            }`}
          >
            {canPoint && (
              <button
                type="button"
                data-testid="pointer-toggle"
                aria-pressed={pointing}
                onClick={(e) => {
                  e.stopPropagation();
                  setPointing(!pointing);
                }}
                className={pointing
                  ? 'h-7 px-2.5 gap-1.5 bg-accent-primary hover:bg-accent-primary-hover rounded-lg flex items-center justify-center text-white transition-colors'
                  : `${OVERLAY_BUTTON} w-7`}
                aria-label={pointing ? t('voice:grid.pointerOff') : t('voice:grid.pointerOn')}
                title={pointing ? t('voice:grid.pointerOff') : t('voice:grid.pointerOn')}
              >
                <PointerIcon />
                {pointing && <span className="text-xs font-medium">{t('voice:grid.pointerActive')}</span>}
              </button>
            )}
            <StageZoomBar zoom={stageZoom} />
            {cellActions(focusedCell)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                useUIStore.getState().toggleVoiceFullscreen();
              }}
              className={`${OVERLAY_BUTTON} w-7`}
              aria-label={voiceFullscreen ? t('voice:controls.exitFullscreen') : t('voice:controls.fullscreen')}
              title={voiceFullscreen ? t('voice:controls.exitFullscreen') : t('voice:controls.fullscreen')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {voiceFullscreen
                  ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                  : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />}
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFocusedParticipant(null);
              }}
              className={`${OVERLAY_BUTTON} px-3 gap-2`}
              title={t('voice:grid.backToGrid')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
              </svg>
              <span className="text-xs font-medium">{t('voice:grid.gridButton')}</span>
            </button>
          </div>
          {/* The map of what is zoomed in on, under the bar it belongs to. */}
          <div
            className={`absolute right-4 z-10 transition-[top] duration-300 ease-out ${
              voiceFullscreen ? `${chromeRevealed ? 'top-24' : 'top-14'} [@media(hover:none)]:top-24 [@media(any-pointer:coarse)]:top-24` : 'top-14'
            }`}
          >
            <StageZoomMinimap zoom={stageZoom} />
          </div>
        </div>

        {/* Centered Hide/Show Members button — divider between focused tile and strip */}
        {hasStrip && (
          <div
            // With the strip hidden in fullscreen the toggle is chrome like
            // the bar: it floats just above it and comes and goes with it.
            className={stripToggleFloats
              ? `absolute inset-x-0 bottom-24 z-20 flex justify-center pointer-events-none transition-opacity duration-300 ease-out ${
                chromeRevealed ? 'opacity-100' : 'opacity-0 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100 [@media(any-pointer:coarse)]:opacity-100'
              }`
              : 'flex justify-center flex-shrink-0 py-1'}
            {...(stripToggleFloats ? { [VOICE_CHROME_ATTR]: '' } : {})}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStripHidden(!stripHidden);
              }}
              className="pointer-events-auto px-4 py-1 bg-black/50 hover:bg-black/70 rounded-full flex items-center gap-2 text-white/60 hover:text-white transition-colors text-xs"
              title={stripHidden ? t('voice:grid.showMembers') : t('voice:grid.hideMembers')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                {stripHidden
                  ? <path d="M7 14l5-5 5 5z" />
                  : <path d="M7 10l5 5 5-5z" />
                }
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006ZM20 20.006H22V19.006C22 16.451 20.178 14.471 17.532 13.471C19.461 14.601 20 16.561 20 19.006V20.006Z" />
              </svg>
              <span>{stripHidden ? t('voice:grid.showMembers') : t('voice:grid.hideMembers')}</span>
            </button>
          </div>
        )}

        {/* Bottom strip: the other pictures, then the people without one */}
        {stripOpen && (
          <div
            data-testid="voice-strip"
            className={`${otherCells.length > 0 ? 'h-[120px] max-h-[calc(20*var(--app-vh))] min-h-[80px]' : 'h-[76px]'} flex-shrink-0 flex items-center justify-center gap-2 p-2 bg-surface-base/50 overflow-x-auto no-scrollbar`}
          >
            {otherCells.map((cell) => renderThumbnail(cell))}
            <VoiceRibbon entries={layout.ribbon} />
          </div>
        )}
      </div>
    );
  }

  // Default grid mode — container-aware layout via ResizeObserver. The ribbon
  // row under it exists only while someone shows a camera or a screen.
  return (
    // In fullscreen the header band and the control bar float over the top and
    // bottom edges; a grid of tiles keeps clear of both rather than hide a row
    // of names and buttons under them.
    <div className={`flex-1 flex flex-col overflow-hidden min-h-0 ${voiceFullscreen ? 'pt-12 pb-20' : ''}`}>
      <div ref={gridRef} className="flex-1 overflow-hidden min-h-0">
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${tileWidth}px)`,
            gridAutoRows: `${tileHeight}px`,
            gap: '8px',
            justifyContent: 'center',
            alignContent: 'center',
          }}
        >
          {layout.cells.map((cell) => (
            <div
              key={cell.key}
              data-testid="voice-grid-cell"
              onClick={() => setFocusedParticipant(cell.key)}
              // Drag a cell onto another to take its place. The order is the
              // viewer's own and is remembered; a drag never counts as a click.
              draggable={layout.cells.length > 1}
              onDragStart={(e) => {
                setDraggedKey(cell.key);
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', cell.key);
                }
              }}
              onDragOver={(e) => {
                if (!draggedKey || draggedKey === cell.key) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                if (dropTargetKey !== cell.key) setDropTargetKey(cell.key);
              }}
              onDragLeave={() => {
                if (dropTargetKey === cell.key) setDropTargetKey(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedKey && draggedKey !== cell.key) {
                  useVoiceStore.getState().setTileOrder(
                    reorderCells(layout.cells.map((c) => c.key), tileOrder, draggedKey, cell.key),
                  );
                }
                setDraggedKey(null);
                setDropTargetKey(null);
              }}
              onDragEnd={() => {
                setDraggedKey(null);
                setDropTargetKey(null);
              }}
              className={`cursor-pointer rounded-xl transition-opacity ${
                draggedKey === cell.key ? 'opacity-40' : 'hover:opacity-90'
              } ${dropTargetKey === cell.key ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-surface-chat' : ''}`}
            >
              {renderCell(cell, 'grid')}
            </div>
          ))}
        </div>
      </div>
      {layout.ribbon.length > 0 && (
        <div
          data-testid="voice-ribbon"
          className="h-[76px] flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 overflow-x-auto no-scrollbar"
        >
          {selfRibbonCells.map((cell) => renderThumbnail(cell, true))}
          <VoiceRibbon entries={layout.ribbon} />
        </div>
      )}
    </div>
  );
}

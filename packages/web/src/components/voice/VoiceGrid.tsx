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
import { useVoiceStripStore } from './voiceStripStore';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';

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

// The focus bar and the tile actions sit on the picture: on-picture dark
// glass and white, not surface tokens.
const OVERLAY_BUTTON =
  'h-7 bg-black/60 backdrop-blur-md hover:bg-black/80 rounded-lg flex items-center justify-center text-white/70 hover:text-white transition-colors duration-fast';

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
  // Shared with the control bar, which carries the strip's toggle; while no
  // bar is mounted (the mobile voice screen) the grid draws its own.
  const stripHidden = useVoiceStripStore((s) => s.hidden);
  const setStripHidden = useVoiceStripStore((s) => s.setHidden);
  const setStripAvailable = useVoiceStripStore((s) => s.setAvailable);
  const toggleHostedByBar = useVoiceStripStore((s) => s.hosts > 0);
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
  }, [focusedParticipantId, setStripHidden]);

  // Whether a focused view with a strip is on screen: the control bar shows
  // its toggle only then.
  const stripAvailable = useMemo(() => {
    if (participants.length === 0) return false;
    const cell = findFocusedCell(focusable, focusedParticipantId);
    if (!cell) return false;
    return focusable.some((other) => other !== cell) || layout.ribbon.some((entry) => entry.kind !== 'self');
  }, [participants.length, focusable, focusedParticipantId, layout]);
  useEffect(() => {
    setStripAvailable(stripAvailable);
  }, [stripAvailable, setStripAvailable]);
  useEffect(() => () => setStripAvailable(false), [setStripAvailable]);

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
          <span className="w-12 h-12 mx-auto mb-3 rounded-full bg-surface-elevated text-txt-tertiary flex items-center justify-center">
            <Icon name="volume-2" size="lg" />
          </span>
          <p className="text-txt-tertiary text-sm">
            {t('voice:grid.waitingForOthers')}
          </p>
        </div>
      </div>
    );
  }

  // Render a single tile polymorphically
  const renderTile = (tile: GridTile, large?: boolean, compact?: boolean) =>
    tile.kind === 'user' ? (
      <VoiceUser tile={tile} large={large} />
    ) : (
      <StreamTile tile={tile} large={large} compact={compact} stats={streamStats} />
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
          <Icon name="picture-in-picture-2" size="sm" />
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
          <Icon name="eye-off" size="sm" />
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
        {renderTile(cell.main, variant === 'focused', compact)}
        {showInset && <TileInset cell={cell} />}
        {cell.inset !== null && !showInset && (
          <div
            data-testid="tile-inset-badge"
            className="absolute bottom-2 right-2 w-[26px] h-[26px] bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-white/80 pointer-events-none"
          >
            <Icon name={cell.inset.kind === 'user' ? 'video' : 'monitor'} size="xs" />
          </div>
        )}
        {actions.length > 0 && (
          <div className="absolute top-10 right-2 z-raised flex items-center gap-1.5 transition-opacity duration-fast opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
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
      className="h-full aspect-video flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity duration-fast"
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
            className={`absolute right-4 z-raised flex items-center gap-2 transition-[top] duration-slow ease-out ${
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
                  ? 'h-7 px-2.5 gap-1.5 bg-accent-primary hover:bg-accent-primary-hover rounded-lg flex items-center justify-center text-on-accent transition-colors duration-fast'
                  : `${OVERLAY_BUTTON} w-7`}
                aria-label={pointing ? t('voice:grid.pointerOff') : t('voice:grid.pointerOn')}
                title={pointing ? t('voice:grid.pointerOff') : t('voice:grid.pointerOn')}
              >
                <Icon name="mouse-pointer-2" size="sm" />
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
              <Icon name={voiceFullscreen ? 'minimize' : 'maximize'} size="sm" />
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
              <Icon name="layout-grid" size="sm" />
              <span className="text-xs font-medium">{t('voice:grid.gridButton')}</span>
            </button>
          </div>
          {/* The map of what is zoomed in on, under the bar it belongs to. */}
          <div
            className={`absolute right-4 z-raised transition-[top] duration-slow ease-out ${
              voiceFullscreen ? `${chromeRevealed ? 'top-24' : 'top-14'} [@media(hover:none)]:top-24 [@media(any-pointer:coarse)]:top-24` : 'top-14'
            }`}
          >
            <StageZoomMinimap zoom={stageZoom} />
          </div>
        </div>

        {/* Hide/Show Members, between the focused tile and the strip. The
            control bar carries this toggle next to chat; the grid draws its
            own only where no bar is mounted (the mobile voice screen). */}
        {hasStrip && !toggleHostedByBar && (
          <div
            // With the strip hidden in fullscreen the toggle is chrome like
            // the bar: it floats just above it and comes and goes with it.
            className={stripToggleFloats
              ? `absolute inset-x-0 bottom-24 z-float flex justify-center pointer-events-none transition-opacity duration-slow ease-out ${
                chromeRevealed ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(any-pointer:coarse)]:opacity-100'
              }`
              : 'flex justify-center flex-shrink-0 py-1'}
            {...(stripToggleFloats ? { [VOICE_CHROME_ATTR]: '' } : {})}
          >
            <Button
              variant="secondary"
              size="sm"
              icon={stripHidden ? 'chevron-up' : 'chevron-down'}
              onClick={(e) => {
                e.stopPropagation();
                setStripHidden(!stripHidden);
              }}
              className="pointer-events-auto"
              title={stripHidden ? t('voice:grid.showMembers') : t('voice:grid.hideMembers')}
            >
              {stripHidden ? t('voice:grid.showMembers') : t('voice:grid.hideMembers')}
            </Button>
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
              className={`cursor-pointer rounded-xl transition-opacity duration-fast ${
                draggedKey === cell.key ? 'opacity-40' : 'hover:opacity-90'
              } ${dropTargetKey === cell.key ? 'ring-2 ring-accent-tone ring-offset-2 ring-offset-surface-chat' : ''}`}
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

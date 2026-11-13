import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VoiceUser } from './VoiceUser';
import { StreamTile } from './StreamTile';
import { TileInset } from './TileInset';
import { VoiceRibbon } from './VoiceRibbon';
import { useVoiceStore } from '../../stores/voiceStore';
import { useUIStore } from '../../stores/uiStore';
import { useGridLayout } from '../../hooks/useGridLayout';
import type { ParticipantInfo, GridTile } from '../../hooks/useLiveKit';
import { useTrackStats } from '../../hooks/useTrackStats';
import {
  deriveVoiceGridLayout,
  findFocusedCell,
  focusableCells,
  type GridCell,
} from '../../utils/voiceGridLayout';
import { hideParticipantTile } from '../../utils/voiceTileActions';

interface VoiceGridProps {
  participants: ParticipantInfo[];
}

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

function MergeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
    </svg>
  );
}

export function VoiceGrid({ participants }: VoiceGridProps) {
  const { t } = useTranslation(['voice', 'common']);
  const focusedParticipantId = useVoiceStore((s) => s.focusedParticipantId);
  const setFocusedParticipant = useVoiceStore((s) => s.setFocusedParticipant);
  const watchingStreams = useVoiceStore((s) => s.watchingStreams);
  const hiddenTileUserIds = useVoiceStore((s) => s.hiddenTileUserIds);
  const swappedTileUserIds = useVoiceStore((s) => s.swappedTileUserIds);
  const splitCameraUserIds = useVoiceStore((s) => s.splitCameraUserIds);
  const setCameraSplit = useVoiceStore((s) => s.setCameraSplit);
  const [stripHidden, setStripHidden] = useState(false);

  const layout = useMemo(
    () => deriveVoiceGridLayout(participants, {
      hidden: hiddenTileUserIds,
      swapped: swappedTileUserIds,
      split: splitCameraUserIds,
    }),
    [participants, hiddenTileUserIds, swappedTileUserIds, splitCameraUserIds],
  );
  const focusable = useMemo(() => focusableCells(layout), [layout]);
  const selfRibbonCells = useMemo(
    () => layout.ribbon.flatMap((entry) => (entry.kind === 'self' ? [entry.cell] : [])),
    [layout],
  );

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

  // Escape leaves focus mode. In voice fullscreen the same key leaves
  // fullscreen (VoiceControlBar), and one press should do one thing.
  useEffect(() => {
    if (!focusedParticipantId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useUIStore.getState().voiceFullscreen) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      setFocusedParticipant(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedParticipantId, setFocusedParticipant]);

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
  const renderTile = (tile: GridTile, large?: boolean) =>
    tile.kind === 'user' ? (
      <VoiceUser tile={tile} large={large} />
    ) : (
      <StreamTile tile={tile} large={large} stats={streamStats} />
    );

  // A camera the viewer moved out of its owner's screen tile can go back.
  const canMerge = (cell: GridCell) =>
    cell.main.kind === 'user'
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
  const renderCell = (cell: GridCell, variant: 'grid' | 'focused' | 'thumbnail') => {
    const showInset = cell.inset !== null
      && (variant === 'focused' || (variant === 'grid' && tileWidth >= MIN_TILE_WIDTH_FOR_INSET));
    const actions = variant === 'grid' ? cellActions(cell) : [];
    return (
      <div className="relative h-full w-full group/cell">
        {renderTile(cell.main, variant === 'focused')}
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

  const renderThumbnail = (cell: GridCell) => (
    <div
      key={cell.key}
      onClick={() => setFocusedParticipant(cell.key)}
      className="h-full aspect-video flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
    >
      {renderCell(cell, 'thumbnail')}
    </div>
  );

  const focusedCell = findFocusedCell(focusable, focusedParticipantId);

  // Focus mode: one large cell, and under it a single strip that holds every
  // other picture and every person without one.
  if (focusedCell) {
    const otherCells = focusable.filter((cell) => cell !== focusedCell);
    const hasStrip = otherCells.length > 0 || layout.ribbon.some((entry) => entry.kind !== 'self');
    return (
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Main focused view. A click anywhere on it returns to the grid. */}
        <div
          className="flex-1 p-2 min-h-0 cursor-pointer relative"
          onClick={() => setFocusedParticipant(null)}
        >
          {renderCell(focusedCell, 'focused')}
          {/* Tile actions and the Grid button — top-right */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {cellActions(focusedCell)}
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
        </div>

        {/* Centered Hide/Show Members button — divider between focused tile and strip */}
        {hasStrip && (
          <div className="flex justify-center flex-shrink-0 py-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStripHidden(!stripHidden);
              }}
              className="px-4 py-1 bg-black/50 hover:bg-black/70 rounded-full flex items-center gap-2 text-white/60 hover:text-white transition-colors text-xs"
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
        {!stripHidden && hasStrip && (
          <div
            data-testid="voice-strip"
            className={`${otherCells.length > 0 ? 'h-[120px] max-h-[calc(20*var(--app-vh))] min-h-[80px]' : 'h-12'} flex-shrink-0 flex items-center justify-center gap-2 p-2 bg-surface-base/50 overflow-x-auto no-scrollbar`}
          >
            {otherCells.map(renderThumbnail)}
            <VoiceRibbon entries={layout.ribbon} />
          </div>
        )}
      </div>
    );
  }

  // Default grid mode — container-aware layout via ResizeObserver. The ribbon
  // row under it exists only while someone shows a camera or a screen.
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
              onClick={() => setFocusedParticipant(cell.key)}
              className="cursor-pointer hover:opacity-90 transition-opacity"
            >
              {renderCell(cell, 'grid')}
            </div>
          ))}
        </div>
      </div>
      {layout.ribbon.length > 0 && (
        <div
          data-testid="voice-ribbon"
          className={`${selfRibbonCells.length > 0 ? 'h-[72px]' : 'h-12'} flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 overflow-x-auto no-scrollbar`}
        >
          {selfRibbonCells.map(renderThumbnail)}
          <VoiceRibbon entries={layout.ribbon} />
        </div>
      )}
    </div>
  );
}

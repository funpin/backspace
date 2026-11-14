import { deriveGridTiles } from '../hooks/useLiveKit';
import type { GridTile, ParticipantInfo, StreamTile, UserTile } from '../hooks/useLiveKit';

/**
 * One slot of the voice grid: what a participant shows large (`main`) and what,
 * if anything, sits in its corner (`inset`). A participant who shares a screen
 * and a camera gets one cell with both, unless the viewer split them. The
 * viewer's own screen and camera are always two cells.
 */
export interface GridCell {
  /**
   * Focus key. A cell that carries a screen share is keyed by the share
   * (`${identity}:stream`) whichever source is large, so swapping the two does
   * not lose focus; any other cell is keyed by the participant's identity.
   */
  key: string;
  participant: ParticipantInfo;
  main: GridTile;
  inset: GridTile | null;
}

export type RibbonEntry =
  /** In the call with nothing to show. */
  | { kind: 'idle'; key: string; participant: ParticipantInfo }
  /** Has media the viewer chose to hide. */
  | { kind: 'hidden'; key: string; participant: ParticipantInfo }
  /** The viewer's own media, shown small while someone else's fills the grid. */
  | { kind: 'self'; key: string; participant: ParticipantInfo; cell: GridCell };

export interface VoiceGridPrefs {
  hidden: ReadonlySet<string>;
  swapped: ReadonlySet<string>;
  split: ReadonlySet<string>;
  /** The viewer's own cell order, as cell keys; cells it does not name keep the call's order after the ones it does. */
  order?: readonly string[];
}

export interface VoiceGridLayout {
  /** True once anyone publishes a camera or a screen; the ribbon exists only then. */
  mediaMode: boolean;
  cells: GridCell[];
  ribbon: RibbonEntry[];
}

function cellsFor(
  participant: ParticipantInfo,
  user: UserTile,
  stream: StreamTile | null,
  prefs: VoiceGridPrefs,
): GridCell[] {
  if (!stream) return [{ key: user.key, participant, main: user, inset: null }];
  // Only a camera that is actually arriving can share a tile with the screen:
  // an unwatched one has no picture to put in the corner.
  if (user.videoTrack === null) return [{ key: stream.key, participant, main: stream, inset: null }];
  // The viewer's own camera never hides in the corner of their own share: the
  // corner is where they would stop seeing what the others see of them.
  if (participant.isLocal || prefs.split.has(participant.userId)) {
    return [
      { key: stream.key, participant, main: stream, inset: null },
      { key: user.key, participant, main: user, inset: null },
    ];
  }
  return prefs.swapped.has(participant.userId)
    ? [{ key: stream.key, participant, main: user, inset: stream }]
    : [{ key: stream.key, participant, main: stream, inset: user }];
}

/** Sorts cells by the viewer's order. Stable: unnamed cells keep their relative order, after the named ones. */
function applyOrder(cells: GridCell[], order: readonly string[] | undefined): GridCell[] {
  if (!order || order.length === 0) return cells;
  const rank = new Map(order.map((key, index) => [key, index]));
  return cells
    .map((cell, index) => ({ cell, index, rank: rank.get(cell.key) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((entry) => entry.cell);
}

/**
 * The order to store after the viewer drops `draggedKey` onto `targetKey`: the
 * dragged cell takes the target's place and the cells between shift by one.
 * Keys the grid is not showing right now stay remembered behind the visible ones.
 */
export function reorderCells(
  visibleKeys: readonly string[],
  storedOrder: readonly string[],
  draggedKey: string,
  targetKey: string,
): string[] {
  const from = visibleKeys.indexOf(draggedKey);
  const to = visibleKeys.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return [...storedOrder];
  const next = [...visibleKeys];
  next.splice(from, 1);
  next.splice(to, 0, draggedKey);
  const visible = new Set(next);
  return [...next, ...storedOrder.filter((key) => !visible.has(key))];
}

/**
 * Decides where every participant appears. Each person has exactly one place:
 * a cell if they show something, a ribbon entry if they do not (or the viewer
 * hid them). While nobody shows anything the grid is the plain avatar grid.
 */
export function deriveVoiceGridLayout(
  participants: ParticipantInfo[],
  prefs: VoiceGridPrefs,
): VoiceGridLayout {
  const tiles = deriveGridTiles(participants);
  const streams = new Map<string, StreamTile>();
  const users = new Map<string, UserTile>();
  for (const tile of tiles) {
    if (tile.kind === 'stream') streams.set(tile.participant.identity, tile);
    else users.set(tile.participant.identity, tile);
  }

  // "Publishes" rather than "is being received": a camera or share the viewer
  // stopped watching still belongs to someone who has media.
  const hasMedia = (p: ParticipantInfo) => p.isScreenSharing || p.isCameraOn;
  const mediaMode = participants.some(hasMedia);

  if (!mediaMode) {
    const cells: GridCell[] = [];
    for (const p of participants) {
      const user = users.get(p.identity);
      if (user) cells.push({ key: user.key, participant: p, main: user, inset: null });
    }
    return { mediaMode, cells: applyOrder(cells, prefs.order), ribbon: [] };
  }

  const remoteCells: GridCell[] = [];
  const selfCells: GridCell[] = [];
  const idle: RibbonEntry[] = [];
  const hidden: RibbonEntry[] = [];

  for (const p of participants) {
    const user = users.get(p.identity);
    if (!user) continue;
    if (!hasMedia(p)) {
      idle.push({ kind: 'idle', key: p.identity, participant: p });
      continue;
    }
    if (!p.isLocal && prefs.hidden.has(p.userId)) {
      hidden.push({ kind: 'hidden', key: p.identity, participant: p });
      continue;
    }
    const cells = cellsFor(p, user, streams.get(p.identity) ?? null, prefs);
    (p.isLocal ? selfCells : remoteCells).push(...cells);
  }

  // Your own picture is for checking, not for watching: it steps aside as soon
  // as there is anyone else's to look at, and fills the grid when there is not.
  if (remoteCells.length === 0) {
    return { mediaMode, cells: applyOrder(selfCells, prefs.order), ribbon: [...idle, ...hidden] };
  }
  const self: RibbonEntry[] = selfCells.map((cell) => ({
    kind: 'self',
    key: cell.key,
    participant: cell.participant,
    cell,
  }));
  return { mediaMode, cells: applyOrder(remoteCells, prefs.order), ribbon: [...self, ...idle, ...hidden] };
}

/** Every cell the viewer can put in focus: the grid's and their own in the ribbon. */
export function focusableCells(layout: VoiceGridLayout): GridCell[] {
  const cells = [...layout.cells];
  for (const entry of layout.ribbon) {
    if (entry.kind === 'self') cells.push(entry.cell);
  }
  return cells;
}

/**
 * Finds the cell a focus key points at. The key may name the cell or either
 * of its sources: focus set on a camera survives the same person starting a
 * share, and focus set on a share survives the viewer swapping the two.
 */
export function findFocusedCell(cells: GridCell[], focusKey: string | null): GridCell | null {
  if (!focusKey) return null;
  return (
    cells.find((cell) => cell.key === focusKey)
    ?? cells.find((cell) => cell.main.key === focusKey || cell.inset?.key === focusKey)
    ?? null
  );
}

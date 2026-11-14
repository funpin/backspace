import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { streamViewers } from '../../utils/streamViewers';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { useDismissOnEscape } from '../../hooks/useDismissOnEscape';
import type { ParticipantInfo } from '../../hooks/useLiveKit';

/** The viewers of `sharer`'s share, re-read whenever a watch ping or the roster changes. */
export function useStreamViewers(sharer: ParticipantInfo): ParticipantInfo[] {
  const participants = useVoiceStore((s) => s.participants);
  const streamWatchers = useVoiceStore((s) => s.streamWatchers);
  const watchingStreams = useVoiceStore((s) => s.watchingStreams);
  return streamViewers(sharer, participants, streamWatchers, watchingStreams);
}

/** How long the pointer may be off the "+N" chip and the list before the list closes: enough to cross the gap between them. */
const VIEWERS_CLOSE_DELAY_MS = 150;
/** Faces shown before the rest fold into "+N": a grid tile's caption is short, the focused one's is not. */
const MAX_FACES = 3;
const MAX_FACES_LARGE = 6;

/**
 * One face of the group. Hovering it lifts it out of the row and names its
 * owner; `quiet` holds the name back while the full list is open over it.
 */
function ViewerFace({ participant, size, quiet }: { participant: ParticipantInfo; size: number; quiet: boolean }) {
  const { displayName, avatar, user } = useVoiceParticipantMeta(participant);
  const [hovered, setHovered] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();
  const named = hovered && !quiet;
  const { style } = useFloatingPosition(anchorRef, floatingRef, { placement: 'top', offset: 8, enabled: named });
  return (
    <span
      ref={anchorRef}
      data-testid="stream-viewer-face"
      data-viewer-identity={participant.identity}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="stream-viewer-face relative flex rounded-full ring-2 ring-black/70 transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-110 hover:z-raised"
    >
      <Avatar src={avatar} name={displayName} size={size} userId={participant.homeUserId ?? participant.userId} user={user ?? undefined} />
      {named && createPortal(
        <div
          ref={floatingRef}
          role="tooltip"
          style={style}
          className="stream-viewer-name px-2 py-1 text-xs font-medium text-txt-primary glass rounded-lg whitespace-nowrap pointer-events-none z-popover"
        >
          {displayName}
        </div>,
        portalContainer,
      )}
    </span>
  );
}

/**
 * Who watches a share, on its tile's caption: an eye and a row of overlapping
 * faces. Draws nothing while nobody watches.
 *
 * - Hovering a face names that viewer.
 * - Past `MAX_FACES` the rest fold into a "+N" chip; hovering the chip opens
 *   the full list, which scrolls, so the row never outgrows the caption
 *   however many people watch.
 * - A press anywhere on the group pins the list open until the next press,
 *   Escape or a press elsewhere, which is the only way to reach it without a
 *   hover. Keyboard focus opens it too.
 * - A `compact` thumbnail has no room for faces and keeps the plain number.
 */
export function StreamViewerCount({ sharer, compact, large }: { sharer: ParticipantInfo; compact?: boolean; large?: boolean }) {
  const { t } = useTranslation(['voice', 'common']);
  const viewers = useStreamViewers(sharer);
  const count = viewers.length;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portalContainer = usePortalContainer();
  const open = count > 0 && (hovered || pinned);

  const { style } = useFloatingPosition(anchorRef, floatingRef, { placement: 'top', offset: 8, enabled: open });

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const enter = () => {
    cancelClose();
    setHovered(true);
  };
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setHovered(false);
    }, VIEWERS_CLOSE_DELAY_MS);
  };
  const close = useCallback(() => {
    setHovered(false);
    setPinned(false);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  useDismissOnEscape(open, close);

  // A pinned list closes on a press anywhere outside it and its group.
  useEffect(() => {
    if (!pinned) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || floatingRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [pinned, close]);

  if (count === 0) return null;

  const maxFaces = large ? MAX_FACES_LARGE : MAX_FACES;
  // "+1" would take the room of the face it stands for, so one extra viewer is simply shown.
  const faces = count > maxFaces + 1 ? viewers.slice(0, maxFaces) : viewers;
  const overflow = count - faces.length;
  // The caption chip is 26px tall; a 20px face with its 2px ring fits inside it.
  const faceSize = 20;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="stream-viewer-count"
        aria-label={t('voice:stream.viewersLabel', { count })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          // The tile under the group has its own click (focus, back to grid).
          e.stopPropagation();
          setPinned((value) => !value);
        }}
        // Keyboard only: a mouse press focuses the button too, and must not
        // leave the list open behind the pin it just toggled.
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) enter(); }}
        onBlur={leave}
        className={`flex items-center flex-shrink-0 rounded-full text-white/80 hover:text-white transition-colors duration-fast ${compact ? 'gap-1 text-2xs font-semibold tabular-nums' : 'gap-1.5'}`}
      >
        <Icon name="eye" size="xs" />
        {compact ? count : (
          <span className="flex items-center pl-0.5">
            {faces.map((viewer, index) => (
              <span key={viewer.identity} className={index === 0 ? 'flex' : 'flex -ml-2'}>
                <ViewerFace participant={viewer} size={faceSize} quiet={open} />
              </span>
            ))}
            {overflow > 0 && (
              <span
                data-testid="stream-viewer-overflow"
                onMouseEnter={enter}
                onMouseLeave={leave}
                style={{ height: faceSize, minWidth: faceSize }}
                className="relative -ml-2 px-1.5 flex items-center justify-center rounded-full ring-2 ring-black/70 bg-surface-elevated text-2xs leading-none font-semibold tabular-nums text-txt-secondary"
              >
                {`+${overflow}`}
              </span>
            )}
          </span>
        )}
      </button>
      {open && createPortal(
        <div
          ref={floatingRef}
          role="dialog"
          aria-label={t('voice:stream.viewers')}
          data-testid="stream-viewers-popover"
          style={style}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-xl min-w-[180px] max-w-[260px] z-popover"
        >
          <StreamViewersList sharer={sharer} title={t('voice:stream.viewers')} empty={t('voice:stream.noViewers')} />
        </div>,
        portalContainer,
      )}
    </>
  );
}

function ViewerRow({ participant }: { participant: ParticipantInfo }) {
  const { t } = useTranslation(['voice', 'common']);
  const { displayName, avatar, user } = useVoiceParticipantMeta(participant);
  return (
    <li className="flex items-center gap-2 min-w-0">
      <Avatar src={avatar} name={displayName} size={20} userId={participant.homeUserId ?? participant.userId} user={user ?? undefined} />
      <span className="text-sm text-txt-secondary truncate">{displayName}</span>
      {participant.isLocal && (
        <span className="text-2xs text-txt-tertiary font-medium flex-shrink-0">{t('voice:badges.you')}</span>
      )}
    </li>
  );
}

/**
 * The viewer list inside a stream tile's context menu. Reads the participant
 * by identity on every render, so the list follows the call while the menu
 * stays open.
 */
export function StreamViewersItem({ sharerIdentity }: { sharerIdentity: string }) {
  const { t } = useTranslation(['voice', 'common']);
  const sharer = useVoiceStore((s) => s.participants.find((p) => p.identity === sharerIdentity) ?? null);
  if (!sharer) return null;
  return <StreamViewersList sharer={sharer} title={t('voice:stream.viewers')} empty={t('voice:stream.noViewers')} />;
}

function StreamViewersList({ sharer, title, empty }: { sharer: ParticipantInfo; title: string; empty: string }) {
  const viewers = useStreamViewers(sharer);
  return (
    <div className="p-3" data-testid="stream-viewers-list">
      <div className="text-xs text-txt-tertiary mb-2 font-medium">
        {title}
        {viewers.length > 0 && <span className="ml-1.5 tabular-nums">{viewers.length}</span>}
      </div>
      {viewers.length === 0 ? (
        <p className="text-sm text-txt-tertiary">{empty}</p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {viewers.map((viewer) => <ViewerRow key={viewer.identity} participant={viewer} />)}
        </ul>
      )}
    </div>
  );
}

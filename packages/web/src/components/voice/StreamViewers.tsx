import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
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

/** How long the pointer may be off the count and its list before the list closes: enough to cross the gap between them. */
const VIEWERS_CLOSE_DELAY_MS = 150;

/**
 * The eye and the number on a stream tile's caption. Draws nothing while
 * nobody watches. Hovering it, focusing it or pressing it opens the list of
 * who watches; a press pins the list open until the next press, Escape or a
 * press elsewhere, which is the only way to reach it without a hover.
 */
export function StreamViewerCount({ sharer, compact }: { sharer: ParticipantInfo; compact?: boolean }) {
  const { t } = useTranslation(['voice', 'common']);
  const count = useStreamViewers(sharer).length;
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

  // A pinned list closes on a press anywhere outside it and its count.
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
          // The tile under the count has its own click (focus, back to grid).
          e.stopPropagation();
          setPinned((value) => !value);
        }}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className={`flex items-center gap-1 flex-shrink-0 rounded px-1 -mx-1 text-white/80 hover:text-white hover:bg-white/10 font-semibold tabular-nums transition-colors ${compact ? 'text-[10px]' : 'text-xs'}`}
      >
        <svg width={compact ? 11 : 13} height={compact ? 11 : 13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
        </svg>
        {count}
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
          className="glass rounded-lg min-w-[180px] max-w-[260px] z-50"
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
        <span className="text-[10px] text-txt-tertiary font-medium flex-shrink-0">{t('voice:badges.you')}</span>
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
      <div className="text-xs text-txt-tertiary mb-2 font-medium uppercase tracking-wider">
        {title}
        {viewers.length > 0 && <span className="ml-1.5 tabular-nums">{viewers.length}</span>}
      </div>
      {viewers.length === 0 ? (
        <p className="text-sm text-txt-tertiary">{empty}</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {viewers.map((viewer) => <ViewerRow key={viewer.identity} participant={viewer} />)}
        </ul>
      )}
    </div>
  );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { streamViewers } from '../../utils/streamViewers';
import type { ParticipantInfo } from '../../hooks/useLiveKit';

/** The viewers of `sharer`'s share, re-read whenever a watch ping or the roster changes. */
export function useStreamViewers(sharer: ParticipantInfo): ParticipantInfo[] {
  const participants = useVoiceStore((s) => s.participants);
  const streamWatchers = useVoiceStore((s) => s.streamWatchers);
  const watchingStreams = useVoiceStore((s) => s.watchingStreams);
  return streamViewers(sharer, participants, streamWatchers, watchingStreams);
}

/** The eye and the number on a stream tile's caption. Draws nothing while nobody watches. */
export function StreamViewerCount({ sharer, compact }: { sharer: ParticipantInfo; compact?: boolean }) {
  const { t } = useTranslation(['voice', 'common']);
  const count = useStreamViewers(sharer).length;
  if (count === 0) return null;
  return (
    <span
      data-testid="stream-viewer-count"
      aria-label={t('voice:stream.viewersLabel', { count })}
      className={`flex items-center gap-1 flex-shrink-0 text-white/80 font-semibold tabular-nums ${compact ? 'text-[10px]' : 'text-xs'}`}
    >
      <svg width={compact ? 11 : 13} height={compact ? 11 : 13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
      </svg>
      {count}
    </span>
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

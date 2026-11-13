import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { useVoiceParticipantStatus } from '../../hooks/useVoiceParticipantStatus';
import { useVoiceUserContextMenu } from './useVoiceUserContextMenu';
import { showParticipantTile } from '../../utils/voiceTileActions';
import type { ParticipantInfo } from '../../hooks/useLiveKit';
import type { RibbonEntry } from '../../utils/voiceGridLayout';

type ChipEntry = Extract<RibbonEntry, { kind: 'idle' | 'hidden' }>;

interface VoiceRibbonProps {
  entries: RibbonEntry[];
}

function StatusIcons({ participant }: { participant: ParticipantInfo }) {
  const { effectivelyMuted, effectivelyDeafened, restrictedMute, restrictedDeafen } = useVoiceParticipantStatus(participant);
  if (!effectivelyMuted && !effectivelyDeafened) return null;
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {effectivelyMuted && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={restrictedMute ? 'text-accent-amber' : 'text-accent-rose'}>
          <path d="M12 2C10.9 2 10 2.9 10 4V12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12V4C14 2.9 13.1 2 12 2Z" />
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
      {effectivelyDeafened && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={restrictedDeafen ? 'text-accent-amber' : 'text-accent-rose'}>
          <path d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h2v-7H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v7h2c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9z" />
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

function RibbonChip({ entry }: { entry: ChipEntry }) {
  const { t } = useTranslation(['voice', 'common']);
  const { participant } = entry;
  const { displayName, avatar, user } = useVoiceParticipantMeta(participant);
  const { isSpeaking } = useVoiceParticipantStatus(participant);
  const handleContextMenu = useVoiceUserContextMenu(participant);
  const avatarUserId = participant.homeUserId ?? participant.userId;

  const className = `glass-pill h-8 pl-1 pr-2.5 rounded-full flex items-center gap-1.5 flex-shrink-0 max-w-[180px] transition-shadow ${
    isSpeaking ? 'ring-2 ring-status-online' : ''
  }`;
  const content = (
    <>
      <Avatar src={avatar} name={displayName} size={24} userId={avatarUserId} user={user ?? undefined} />
      <span className="text-xs font-medium text-txt-secondary truncate">{displayName}</span>
      {participant.isLocal && (
        <span className="text-[10px] text-txt-tertiary font-medium flex-shrink-0">{t('voice:badges.you')}</span>
      )}
      <StatusIcons participant={participant} />
    </>
  );

  if (entry.kind === 'hidden') {
    return (
      <button
        type="button"
        data-context-menu
        data-testid="ribbon-chip-hidden"
        onClick={() => showParticipantTile(participant)}
        onContextMenu={handleContextMenu}
        aria-label={t('voice:grid.showHiddenTile', { name: displayName })}
        title={t('voice:grid.showHiddenTile', { name: displayName })}
        className={`${className} cursor-pointer`}
      >
        {content}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-txt-tertiary flex-shrink-0">
          <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      data-context-menu
      data-testid="ribbon-chip"
      onContextMenu={handleContextMenu}
      className={className}
    >
      {content}
    </div>
  );
}

/**
 * The people of a call who have no tile: those with nothing to show, and those
 * whose tile the viewer hid (click brings it back). Rendered inline, so the
 * caller decides the row it sits in.
 */
export function VoiceRibbon({ entries }: VoiceRibbonProps) {
  return (
    <>
      {entries.map((entry) => (entry.kind === 'self' ? null : <RibbonChip key={entry.key} entry={entry} />))}
    </>
  );
}

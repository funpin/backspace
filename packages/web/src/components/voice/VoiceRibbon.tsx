import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
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

const BADGE = 'absolute -bottom-0.5 -right-1 w-[18px] h-[18px] rounded-full bg-surface-base ring-2 ring-surface-chat flex items-center justify-center';

/** The one mark a chip's avatar carries: hidden wins, then deafened, then muted. */
function AvatarBadge({ participant, hidden }: { participant: ParticipantInfo; hidden: boolean }) {
  const { effectivelyMuted, effectivelyDeafened, restrictedMute, restrictedDeafen } = useVoiceParticipantStatus(participant);
  if (hidden) {
    return (
      <span className={`${BADGE} text-txt-secondary`}>
        <Icon name="eye-off" size="xs" />
      </span>
    );
  }
  if (effectivelyDeafened) {
    return (
      <span className={`${BADGE} ${restrictedDeafen ? 'text-status-warn' : 'text-status-danger'}`}>
        <Icon name="headphone-off" size="xs" />
      </span>
    );
  }
  if (effectivelyMuted) {
    return (
      <span className={`${BADGE} ${restrictedMute ? 'text-status-warn' : 'text-status-danger'}`}>
        <Icon name="mic-off" size="xs" />
      </span>
    );
  }
  return null;
}

/**
 * A person without a tile: their avatar with the name under it. No frame of
 * its own, so a row of them reads as people standing beside the pictures
 * rather than as more controls.
 */
function RibbonChip({ entry }: { entry: ChipEntry }) {
  const { t } = useTranslation(['voice', 'common']);
  const { participant } = entry;
  const { displayName, avatar, user } = useVoiceParticipantMeta(participant);
  const { isSpeaking } = useVoiceParticipantStatus(participant);
  const handleContextMenu = useVoiceUserContextMenu(participant);
  const avatarUserId = participant.homeUserId ?? participant.userId;
  const hidden = entry.kind === 'hidden';

  const className = 'w-[68px] flex-shrink-0 flex flex-col items-center gap-1 rounded-lg';
  const content = (
    <>
      <span className="relative flex">
        <span className={`flex rounded-full transition-shadow ${isSpeaking ? 'ring-2 ring-status-ok ring-offset-2 ring-offset-surface-chat' : ''} ${hidden ? 'opacity-50' : ''}`}>
          <Avatar src={avatar} name={displayName} size={36} userId={avatarUserId} user={user ?? undefined} />
        </span>
        <AvatarBadge participant={participant} hidden={hidden} />
      </span>
      <span className={`w-full text-center text-2xs font-medium truncate ${participant.isLocal || hidden ? 'text-txt-tertiary' : 'text-txt-secondary'}`}>
        {participant.isLocal ? t('voice:badges.youShort') : displayName}
      </span>
    </>
  );

  if (hidden) {
    return (
      <button
        type="button"
        data-context-menu
        data-testid="ribbon-chip-hidden"
        onClick={() => showParticipantTile(participant)}
        onContextMenu={handleContextMenu}
        aria-label={t('voice:grid.showHiddenTile', { name: displayName })}
        className={`${className} cursor-pointer hover:opacity-80 transition-opacity duration-fast`}
      >
        {content}
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

import React, { useCallback, useMemo } from 'react';
import { useVoiceStore, type VoiceChannelElapsed } from '../../stores/voiceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useSelfIdInChannel } from '../../utils/channelUser';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { buildVoiceModMenuItems, VolumeSliderItem } from './voiceMenuItems';
import { VoiceUserRow } from './VoiceUserRow';
import { Icon } from '../ui/Icon';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { useSharedSecondBeat } from '../../hooks/useSharedSecondBeat';

const EMPTY_VOICE_USERS: string[] = [];

function VoiceChannelTimer({ observation }: { observation: VoiceChannelElapsed }) {
  const { t } = useTranslation('voice');
  const { formatDuration } = useFormatters();
  const now = useSharedSecondBeat();
  const elapsedSeconds = observation.elapsedSeconds
    + Math.floor(Math.max(0, now - observation.observedAt) / 1_000);
  const duration = formatDuration(elapsedSeconds);
  return (
    <span
      className="flex flex-shrink-0 items-center gap-1 text-2xs leading-none tabular-nums text-txt-tertiary"
      title={t('channelDuration', { duration })}
      // The row is a button, and a label on a child becomes part of that
      // button's accessible name. A duration that ticks every second would
      // rewrite the name of the channel row once a second, so the timer stays
      // out of the name and keeps only its hover title.
      aria-hidden="true"
      data-testid="voice-channel-timer"
    >
      <Icon name="clock" size="xs" />
      {duration}
    </span>
  );
}

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
  onClick: () => void;
  locked?: boolean;
  canManage?: boolean;
  onSettingsClick?: () => void;
  voiceUserHandlers?: (userId: string, channelId: string) => {
    draggable: boolean;
    isBeingDragged: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  dropZone?: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    isDragOver: boolean;
    isValidTarget: boolean;
  };
}

/** Wrapper component for the volume slider so it can use hooks (useState). */
export function VoiceChannel({ channelId, channelName, onClick, locked, canManage, onSettingsClick, voiceUserHandlers, dropZone }: VoiceChannelProps) {
  const { t } = useTranslation(['voice', 'common']);
  const serverVoiceUsers = useVoiceStore((s) => s.voiceUsers.get(channelId)) ?? EMPTY_VOICE_USERS;
  const currentVoiceChannel = useVoiceStore((s) => s.currentVoiceChannelId);
  const participants = useVoiceStore((s) => s.participants);
  const isLiveKitConnected = useVoiceStore((s) => s.isLiveKitConnected);
  const channelElapsedSeconds = useVoiceStore((s) => s.voiceChannelElapsedSeconds.get(channelId) ?? null);

  // For OUR channel: LiveKit participants are the single source of truth.
  // For other channels: use server-provided voiceUsers (only available source).
  const voiceUsers = useMemo(() => {
    if (currentVoiceChannel === channelId && isLiveKitConnected && participants.length > 0) {
      return [...new Set(participants.map(p => p.userId))];
    }
    return serverVoiceUsers;
  }, [currentVoiceChannel, channelId, isLiveKitConnected, participants, serverVoiceUsers]);
  const localIsDeafened = useVoiceStore((s) => s.isDeafened);
  const localIsMuted = useVoiceStore((s) => s.isMuted);
  const voiceUserStates = useVoiceStore((s) => s.voiceUserStates);
  const spaceMutedUserIds = useVoiceStore((s) => s.spaceMutedUserIds);
  const spaceDeafenedUserIds = useVoiceStore((s) => s.spaceDeafenedUserIds);
  const permissionMutedUserIds = useVoiceStore((s) => s.permissionMutedUserIds);
  const participantMutes = useVoiceStore((s) => s.participantMutes);
  const unwatchedCameras = useVoiceStore((s) => s.unwatchedCameras);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const localConnectionQuality = useVoiceStore((s) => s.connectionQuality);
  const connectionQualities = useVoiceStore((s) => s.connectionQualities);
  const voiceConnectionStatus = useVoiceStore((s) => s.voiceConnectionStatus);
  const currentUserId = useVoiceStore((s) => {
    const local = s.participants.find(p => p.isLocal);
    return local?.userId ?? null;
  });
  const members = useSpaceStore((s) => s.members);
  const channelToSpaceMap = useSpaceStore((s) => s.channelToSpaceMap);
  // The user's row id on the channel's instance: the ids in `voiceUsers` are
  // that instance's.
  const myIdHere = useSelfIdInChannel(channelId);
  const isActive = currentVoiceChannel === channelId;

  const openContextMenu = useContextMenuStore((s) => s.open);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, userId: string) => {
      if (userId === myIdHere) return;
      e.preventDefault();
      e.stopPropagation();

      // Build moderation items
      const modItems = buildVoiceModMenuItems(userId, channelId);

      const items: ContextMenuItem[] = [...modItems];

      // Separator after mod items
      if (modItems.length > 0) {
        items.push({ key: 'mod-end-sep', type: 'separator' });
      }

      // Mute User checkbox
      items.push({
        key: 'mute-user',
        type: 'checkbox',
        label: 'Mute User',
        subscribe: useVoiceStore.subscribe,
        getChecked: () => useVoiceStore.getState().participantMutes.get(userId) ?? false,
        onChange: (checked) => useVoiceStore.getState().setParticipantMute(userId, checked),
      });

      items.push({ key: 'vol-sep', type: 'separator' });

      // Volume slider
      items.push({
        key: 'volume',
        type: 'custom',
        render: () => React.createElement(VolumeSliderItem, { userId }),
      });

      openContextMenu({ x: e.clientX, y: e.clientY }, items);
    },
    [myIdHere, channelId, openContextMenu],
  );

  return (
    <div
      onDragOver={dropZone?.onDragOver}
      onDragEnter={dropZone?.onDragEnter}
      onDragLeave={dropZone?.onDragLeave}
      onDrop={dropZone?.onDrop}
      className={dropZone?.isDragOver && dropZone?.isValidTarget ? 'rounded-lg ring-1 ring-accent-tone/40' : ''}
    >
      <button
        onClick={onClick}
        className={`relative w-full flex items-center gap-2 px-2 h-[34px] rounded-lg group transition-colors duration-fast ${
          locked
            ? 'text-txt-tertiary/50 cursor-not-allowed'
            : isActive
              ? 'bg-surface-elevated text-txt-primary font-medium'
              : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
        }`}
        title={locked ? t('connectLocked') : undefined}
      >
        {isActive && !locked && (
          <div
            className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-[3px] bg-txt-primary rounded-r-full"
            style={{ height: '55%', opacity: 0.7 }}
          />
        )}
        {locked ? (
          <Icon name="lock" className="text-txt-tertiary/50" />
        ) : (
          <Icon name="volume-2" className="text-txt-tertiary" />
        )}
        <span className="truncate text-sm flex-1 text-left">{channelName}</span>
        <span className="relative flex flex-shrink-0 items-center">
          {canManage && (
            <span
              data-testid="voice-channel-settings"
              aria-hidden="true"
              className="pointer-events-none absolute right-full mr-1 flex opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 text-txt-tertiary hover:text-txt-primary transition-[opacity,color] duration-fast"
              onClick={(e) => {
                e.stopPropagation();
                onSettingsClick?.();
              }}
            >
              <Icon name="settings" size="sm" />
            </span>
          )}
          {voiceUsers.length > 0 && channelElapsedSeconds !== null && (
            <VoiceChannelTimer observation={channelElapsedSeconds} />
          )}
        </span>
      </button>

      {/* Connected users */}
      {voiceUsers.length > 0 && (
        <div className="mt-0.5">
          {voiceUsers.map((userId) => {
            const member = members.find(m => m.userId === userId);
            const participant = participants.find(p => p.userId === userId);
            const displayName = member?.user.displayName ?? member?.user.username ?? participant?.username ?? userId;
            const avatar = member?.user.avatar ?? null;
            const avatarColor = member?.user.avatarColor;
            const wsStatus = voiceUserStates.get(userId);
            const isParticipantDeafened = userId === currentUserId
              ? localIsDeafened
              : (participant?.isDeafened ?? wsStatus?.isDeafened ?? false);
            const isMuted = userId === currentUserId
              ? localIsMuted
              : (participant?.isMuted ?? wsStatus?.isMuted ?? false);
            const hasCamera = participant?.isCameraOn ?? wsStatus?.isCameraOn ?? false;
            const isScreenSharing = participant?.isScreenSharing ?? wsStatus?.isScreenSharing ?? false;
            const spaceId = channelToSpaceMap.get(channelId);
            const isSpaceMuted = spaceMutedUserIds.has(`${spaceId}:${userId}`);
            const isSpaceDeafened = spaceDeafenedUserIds.has(`${spaceId}:${userId}`);
            const isPermissionMuted = permissionMutedUserIds.has(`${spaceId}:${userId}`);
            const participantConnectionQuality = participant?.isLocal
              ? localConnectionQuality
              : participant
                ? connectionQualities.get(participant.identity) ?? 'unknown'
                : 'unknown';
            const connectionWarning = isActive && participant
              ? voiceConnectionStatus === 'reconnecting' && participant.isLocal
                ? t('voiceDiagnostics.reconnecting')
                : participantConnectionQuality === 'poor' || participantConnectionQuality === 'lost'
                  ? participant.isLocal
                    ? t('voiceDiagnostics.selfNetwork')
                    : t('voiceDiagnostics.participantNetwork', { name: displayName })
                  : null
              : null;

            const userDrag = voiceUserHandlers?.(userId, channelId);
            const isDraggable = !!(userDrag?.draggable && userId !== myIdHere);
            const isBeingDragged = userDrag?.isBeingDragged ?? false;

            return (
              <div
                key={userId}
                className={`h-[27px] flex items-center pl-8 pr-2 rounded-lg hover:bg-interactive-hover transition-colors duration-fast ${
                  isDraggable ? 'cursor-grab active:cursor-grabbing' : ''
                } ${isBeingDragged ? 'opacity-50' : ''}`}
                draggable={isDraggable}
                onDragStart={isDraggable ? userDrag!.onDragStart : undefined}
                onDragEnd={isDraggable ? userDrag!.onDragEnd : undefined}
                onContextMenu={(e) => handleContextMenu(e, userId)}
              >
                <VoiceUserRow
                  className="w-full"
                  size="compact"
                  userId={member?.user.homeUserId ?? userId}
                  displayName={displayName}
                  avatar={avatar}
                  avatarColor={avatarColor ?? undefined}
                  isMuted={isMuted}
                  isDeafened={isParticipantDeafened}
                  isCameraOn={hasCamera}
                  isUnwatchedCamera={userId !== myIdHere && unwatchedCameras.has(userId)}
                  isScreenSharing={isScreenSharing}
                  isServerMuted={isSpaceMuted}
                  isServerDeafened={isSpaceDeafened}
                  isPermissionMuted={isPermissionMuted}
                  isLocallyMuted={userId !== myIdHere && (participantMutes.get(userId) ?? false)}
                  isSpeaking={speakingUserIds.has(userId)}
                  connectionWarning={connectionWarning}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

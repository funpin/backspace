import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../stores/voiceStore';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { buildVoiceModMenuItems, VolumeSliderItem } from './voiceMenuItems';
import { getActiveRoom, setCameraSubscription } from '../../hooks/useLiveKit';
import type { ParticipantInfo } from '../../hooks/useLiveKit';

/**
 * The right-click menu of a remote participant: moderation, camera
 * watch/unwatch, local mute and volume. Shared by every surface that stands
 * for a person in a call (the grid tile, the ribbon chip) so they cannot drift.
 * Does nothing for the local participant or outside a voice channel.
 */
export function useVoiceUserContextMenu(participant: ParticipantInfo): (e: React.MouseEvent) => void {
  const { t } = useTranslation(['voice', 'common']);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const openContextMenu = useContextMenuStore((s) => s.open);
  const isLocal = participant.isLocal;

  return useCallback(
    (e: React.MouseEvent) => {
      if (isLocal || !currentVoiceChannelId) return;
      e.preventDefault();
      e.stopPropagation();

      const targetUserId = participant.userId;
      const channelId = currentVoiceChannelId;

      // Build moderation items
      const modItems = buildVoiceModMenuItems(targetUserId, channelId);

      const items: ContextMenuItem[] = [...modItems];

      // Separator after mod items
      if (modItems.length > 0) {
        items.push({ key: 'mod-end-sep', type: 'separator' });
      }

      // Camera watch/unwatch
      const targetParticipant = useVoiceStore.getState().participants.find((p) => p.userId === targetUserId);
      const targetHasCamera = targetParticipant?.isCameraOn ?? false;
      const isCameraUnwatched = useVoiceStore.getState().unwatchedCameras.has(targetUserId);

      if (targetHasCamera) {
        items.push({
          key: 'camera-toggle',
          type: 'action',
          label: isCameraUnwatched ? t('voice:participantMenu.watchCamera') : t('voice:participantMenu.stopWatchingCamera'),
          icon: React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor', className: 'flex-shrink-0' },
            ...(isCameraUnwatched
              ? [React.createElement('path', { key: 'cam', d: 'M17 10.5V7c0-.55-.45-1-1-1H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h14c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' })]
              : [
                  React.createElement('path', { key: 'cam', d: 'M17 10.5V7c0-.55-.45-1-1-1H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h14c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z' }),
                  React.createElement('line', { key: 'slash', x1: 1, y1: 1, x2: 23, y2: 23, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
                ]),
          ),
          onClick: () => {
            const room = getActiveRoom();
            const identity = targetParticipant?.identity;
            if (isCameraUnwatched) {
              useVoiceStore.getState().rewatchCamera(targetUserId);
              if (identity) setCameraSubscription(room, identity, true);
            } else {
              useVoiceStore.getState().unwatchCamera(targetUserId);
              if (identity) setCameraSubscription(room, identity, false);
            }
          },
        });
        items.push({ key: 'camera-sep', type: 'separator' });
      }

      // Mute User checkbox
      items.push({
        key: 'mute-user',
        type: 'checkbox',
        label: t('voice:participantMenu.muteUser'),
        subscribe: useVoiceStore.subscribe,
        getChecked: () => useVoiceStore.getState().participantMutes.get(targetUserId) ?? false,
        onChange: (checked) => useVoiceStore.getState().setParticipantMute(targetUserId, checked),
      });

      items.push({ key: 'vol-sep', type: 'separator' });

      // Volume slider (custom, needs store subscription via wrapper component)
      items.push({
        key: 'volume',
        type: 'custom',
        render: () => React.createElement(VolumeSliderItem, { userId: targetUserId }),
      });

      openContextMenu({ x: e.clientX, y: e.clientY }, items);
    },
    [isLocal, currentVoiceChannelId, participant.userId, openContextMenu, t],
  );
}

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';
import { useVoiceStore } from '../../stores/voiceStore';
import { useContextMenuStore, type ContextMenuItem } from '../../stores/contextMenuStore';
import { getActiveRoom, setStreamSubscription } from '../../hooks/useLiveKit';
import { stopScreenShare, changeScreenShare, effectiveScreenShareConfig } from '../../utils/screenShare';
import { useStreamHostLimits } from '../../utils/streamHostLimits';
import { DEFAULT_STREAMING_LIMITS } from '../../stores/settingsStore';
import { handleViewerWatchToggle } from '../../utils/voiceTileActions';
import { ScreenShareSettingsPopover } from './ScreenShareSettingsPopover';
import { useVoiceParticipantMeta } from '../../hooks/useVoiceParticipantMeta';
import { StreamViewerCount, StreamViewersItem } from './StreamViewers';
import { StreamPointerLayer } from './StreamPointers';
import { useStreamPointerStore } from '../../stores/streamPointerStore';
import type { StreamTile as StreamTileType } from '../../hooks/useLiveKit';
import type { TrackStatsSnapshot } from '../../hooks/useTrackStats';
import {
  classifyStreamHealth,
  useStreamHealthWarning,
} from '../../hooks/useStreamHealthWarning';

interface StreamTileProps {
  tile: StreamTileType;
  large?: boolean;
  /**
   * A thumbnail too small for the tile's chrome (the ribbon's own-share
   * preview): no LIVE badge, no quality or health row, a bare-name caption.
   */
  compact?: boolean;
  stats: TrackStatsSnapshot | null;
}

const STREAM_HEALTH_KEYS = {
  publisherNetwork: 'voice:streamDiagnostics.publisherNetwork',
  publisherCpu: 'voice:streamDiagnostics.publisherCpu',
  viewerNetwork: 'voice:streamDiagnostics.viewerNetwork',
  reconnecting: 'voice:streamDiagnostics.reconnecting',
  unknown: 'voice:streamDiagnostics.unknown',
} as const;

function finitePositiveRounded(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** Wrapper component for stream quality settings — needs its own state + close guard. */
function StreamQualityItem() {
  const { t } = useTranslation(['voice', 'common']);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const setCloseGuard = useContextMenuStore((s) => s.setCloseGuard);
  const savedConfig = useVoiceStore((s) => s.screenShareConfig);
  const { limits } = useStreamHostLimits();
  // The label names what the stream uses, not the saved choice a host may cap.
  const screenShareConfig = effectiveScreenShareConfig(savedConfig, limits ?? DEFAULT_STREAMING_LIMITS);

  return (
    <div className="p-3">
      <div className="text-xs text-txt-tertiary mb-2 font-medium">
        {t('voice:stream.quality')}
      </div>
      <div className="relative">
        <button
          ref={btnRef}
          onClick={() => {
            const n = !open;
            setOpen(n);
            setCloseGuard(n);
          }}
          className="w-full flex items-center justify-between px-2 h-[34px] text-sm text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary rounded-lg transition-colors duration-fast"
        >
          <span>{t('voice:stream.qualityValue', { height: screenShareConfig.height, fps: screenShareConfig.fps })}</span>
          <Icon name="chevron-down" size="xs" />
        </button>
        {open && (
          <ScreenShareSettingsPopover
            open={open}
            onClose={() => {
              setOpen(false);
              setCloseGuard(false);
            }}
            anchorRef={btnRef}
          />
        )}
      </div>
    </div>
  );
}

/** Wrapper component for stream volume slider — needs store subscription. */
function StreamVolumeItem({ userId }: { userId: string }) {
  const { t } = useTranslation(['voice', 'common']);
  const f = useFormatters();
  const streamVolume = useVoiceStore((s) => s.streamVolumes.get(userId) ?? 100);
  const setStreamVolume = useVoiceStore((s) => s.setStreamVolume);

  return (
    <div className="p-3">
      <div className="text-xs text-txt-tertiary mb-2 font-medium">
        {t('voice:stream.volume')}
      </div>
      <div className="flex items-center gap-2">
        <Icon name="volume-1" size="sm" className="text-txt-tertiary" />
        <input
          type="range"
          min="0"
          max="200"
          value={streamVolume}
          onChange={(e) => setStreamVolume(userId, parseInt(e.target.value))}
          className="flex-1 min-w-0 accent-accent-tone h-1"
        />
        <span className="text-xs text-txt-secondary min-w-8 flex-shrink-0 text-right tabular-nums">
          {f.formatPercent(streamVolume)}
        </span>
      </div>
    </div>
  );
}

/** Wrapper component for stream attenuation controls — needs store subscription. */
function StreamAttenuationItem() {
  const { t } = useTranslation(['voice', 'common']);
  const f = useFormatters();
  const streamAttenuationEnabled = useVoiceStore((s) => s.streamAttenuationEnabled);
  const streamAttenuationStrength = useVoiceStore((s) => s.streamAttenuationStrength);
  const setAttenuationEnabled = useVoiceStore((s) => s.setStreamAttenuationEnabled);
  const setAttenuationStrength = useVoiceStore((s) => s.setStreamAttenuationStrength);

  return (
    <div>
      <div className="py-1.5">
        <button
          onClick={() => setAttenuationEnabled(!streamAttenuationEnabled)}
          className="w-full text-left px-2 h-[34px] mx-1.5 text-sm rounded-lg flex items-center gap-2 text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary transition-colors duration-fast"
          style={{ width: 'calc(100% - 12px)' }}
        >
          <span className="flex-1">{t('voice:stream.attenuation')}</span>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors duration-fast ${
              streamAttenuationEnabled
                ? 'bg-accent-primary border-accent-primary'
                : 'border-txt-tertiary'
            }`}
          >
            {streamAttenuationEnabled && (
              <Icon name="check" size="xs" className="text-on-accent" />
            )}
          </div>
        </button>
      </div>
      {streamAttenuationEnabled && (
        <div className="p-3 pt-0">
          <div className="text-xs text-txt-tertiary mb-2 font-medium">
            {t('voice:stream.attenuationStrength')}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={streamAttenuationStrength}
              onChange={(e) => setAttenuationStrength(parseInt(e.target.value))}
              className="flex-1 min-w-0 accent-accent-tone h-1"
            />
            <span className="text-xs text-txt-secondary min-w-8 flex-shrink-0 text-right tabular-nums">
              {f.formatPercent(streamAttenuationStrength)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function StreamTile({ tile, large, compact, stats }: StreamTileProps) {
  const { t } = useTranslation(['voice', 'common']);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointing = useStreamPointerStore((s) => s.pointing);

  const watchingStreams = useVoiceStore((s) => s.watchingStreams);

  const { participant } = tile;
  const isLocal = participant.isLocal;
  const userId = participant.userId;
  const avatarUserId = participant.homeUserId ?? userId;
  const { displayName, avatar, user } = useVoiceParticipantMeta(participant);

  const isWatching = watchingStreams.has(userId);
  const voiceConnectionStatus = useVoiceStore((s) => s.voiceConnectionStatus);
  const localConnectionQuality = useVoiceStore((s) => s.connectionQuality);
  const publisherConnectionQuality = useVoiceStore((s) => s.connectionQualities.get(participant.identity) ?? 'unknown');

  const liveScreenTrack = tile.screenTrack?.readyState === 'live' ? tile.screenTrack : null;
  const liveLkScreenTrack = liveScreenTrack ? tile.lkScreenTrack : null;

  // Quality badge state: the raw dimensions, rendered through the catalog so a language switch relabels them.
  const [qualityBadge, setQualityBadge] = useState<{ height: number; fps: number | null } | null>(null);

  const openContextMenu = useContextMenuStore((s) => s.open);

  const screenStat = stats?.videoTracks.find((track) =>
    track.source === 'screen_share'
    && (isLocal
      ? track.direction === 'send'
      // Matched on LiveKit identity, never on username: a replicated federated
      // user can share a username with a local one, and matching by name would
      // attribute one participant's degradation to the other.
      : track.direction === 'recv' && track.participantIdentity === participant.identity),
  );
  const healthCandidate = classifyStreamHealth({
    reconnecting: voiceConnectionStatus === 'reconnecting',
    isLocal,
    publisherConnectionQuality,
    localConnectionQuality,
    outboundReason: isLocal ? screenStat?.qualityLimitation ?? null : null,
    packetLoss: screenStat?.packetLoss ?? null,
    jitter: screenStat?.jitter ?? null,
    freezeCountDelta: screenStat?.freezeCountDelta ?? null,
  });
  const healthWarning = useStreamHealthWarning(healthCandidate, stats);

  // --- VIDEO --- use LiveKit's track.attach() to register the element
  // with the adaptive stream observer (enables SFU layer switching by viewport size)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (liveLkScreenTrack) {
      liveLkScreenTrack.attach(videoEl);
      return () => { liveLkScreenTrack.detach(videoEl); };
    } else {
      videoEl.srcObject = null;
    }
  }, [liveLkScreenTrack]);

  // Quality badge (poll every 3s)
  useEffect(() => {
    if (!liveScreenTrack) {
      setQualityBadge(null);
      return;
    }
    const update = () => {
      const settings = liveScreenTrack.getSettings();
      const h = finitePositiveRounded(settings.height);
      const fps = finitePositiveRounded(settings.frameRate);
      if (h !== null && fps !== null) {
        setQualityBadge({ height: h, fps });
      } else if (h !== null) {
        setQualityBadge({ height: h, fps: null });
      } else {
        setQualityBadge(null);
      }
    };
    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, [liveScreenTrack]);

  // Force re-render on track end
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!tile.screenTrack) return;
    const onEnded = () => forceUpdate((n) => n + 1);
    tile.screenTrack.addEventListener('ended', onEnded);
    return () => tile.screenTrack?.removeEventListener('ended', onEnded);
  }, [tile.screenTrack]);

  // --- CONTEXT MENU ---
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items: ContextMenuItem[] = [];

      // Who is watching, first: for the sharer it is the point of the menu.
      items.push({
        key: 'stream-viewers',
        type: 'custom',
        render: () => React.createElement(StreamViewersItem, { sharerIdentity: participant.identity }),
      });
      items.push({ key: 'viewers-sep', type: 'separator' });
      items.push({
        key: 'show-pointers',
        type: 'checkbox',
        label: t('voice:stream.showPointers'),
        subscribe: useVoiceStore.subscribe,
        getChecked: () => useVoiceStore.getState().showStreamPointers,
        onChange: (checked) => useVoiceStore.getState().setShowStreamPointers(checked),
      });
      items.push({ key: 'pointers-sep', type: 'separator' });

      if (isLocal) {
        // Local stream: stop, change, quality
        items.push({
          key: 'stop-streaming',
          type: 'action',
          label: t('voice:stream.stop'),
          danger: true,
          icon: <Icon name="screen-share-off" size="sm" />,
          onClick: async () => {
            const room = getActiveRoom();
            if (room) {
              await stopScreenShare(room);
            }
          },
        });
        items.push({
          key: 'change-stream',
          type: 'action',
          label: t('voice:stream.change'),
          icon: <Icon name="refresh-cw" size="sm" />,
          onClick: async () => {
            const room = getActiveRoom();
            if (room) {
              await changeScreenShare(room);
            }
          },
        });
        items.push({ key: 'quality-sep', type: 'separator' });
        items.push({
          key: 'stream-quality',
          type: 'custom',
          render: () => React.createElement(StreamQualityItem),
        });
      } else {
        // Remote stream: watch/unwatch, mute, volume, attenuation
        const currentIsWatching = useVoiceStore.getState().watchingStreams.has(userId);
        const identity = participant.identity;

        if (currentIsWatching) {
          items.push({
            key: 'stop-watching',
            type: 'action',
            label: t('voice:stream.stopWatching'),
            icon: <Icon name="eye-off" size="sm" />,
            onClick: () => {
              useVoiceStore.getState().unwatchStream(userId);
              setStreamSubscription(getActiveRoom(), identity, false);
              handleViewerWatchToggle({ userId, identity }, false);
            },
          });
        } else {
          items.push({
            key: 'watch-stream',
            type: 'action',
            label: t('voice:stream.watch'),
            icon: <Icon name="eye" size="sm" />,
            onClick: () => {
              useVoiceStore.getState().watchStream(userId);
              setStreamSubscription(getActiveRoom(), identity, true);
              handleViewerWatchToggle({ userId, identity }, true);
            },
          });
        }

        items.push({ key: 'watch-sep', type: 'separator' });

        // Mute Stream checkbox
        items.push({
          key: 'mute-stream',
          type: 'checkbox',
          label: t('voice:stream.mute'),
          subscribe: useVoiceStore.subscribe,
          getChecked: () => useVoiceStore.getState().streamMutes.get(userId) ?? false,
          onChange: (checked) => useVoiceStore.getState().setStreamMute(userId, checked),
        });

        items.push({ key: 'vol-sep', type: 'separator' });

        // Stream volume slider
        items.push({
          key: 'stream-volume',
          type: 'custom',
          render: () => React.createElement(StreamVolumeItem, { userId }),
        });

        items.push({ key: 'attenuation-sep', type: 'separator' });

        // Stream attenuation controls
        items.push({
          key: 'stream-attenuation',
          type: 'custom',
          render: () => React.createElement(StreamAttenuationItem),
        });
      }

      openContextMenu({ x: e.clientX, y: e.clientY }, items);
    },
    [isLocal, userId, participant.identity, openContextMenu, t],
  );

  const handleWatch = useCallback(() => {
    useVoiceStore.getState().watchStream(userId);
    setStreamSubscription(getActiveRoom(), participant.identity, true);
    handleViewerWatchToggle({ userId, identity: participant.identity }, true);
  }, [userId, participant.identity]);

  const hasVideo = liveScreenTrack !== null;

  return (
    <div
      ref={rootRef}
      data-context-menu
      className="relative h-full w-full bg-surface-base rounded-xl overflow-hidden flex items-center justify-center group transition-shadow duration-fast ring-1 ring-border-hard hover:ring-border-soft"
      onContextMenu={handleContextMenu}
    >
      {hasVideo && isWatching ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // While pointing, the labelled pointer drawn over the picture is the cursor.
          className={`w-full h-full object-contain bg-black ${large && !isLocal && pointing ? 'cursor-none' : ''}`}
        />
      ) : (
        <div data-testid="stream-tile-placeholder" className={`w-full h-full min-h-0 flex items-center justify-center bg-surface-channel ${large ? 'px-4 py-6' : 'px-4 pt-9 pb-3'}`}>
          <div className={large ? 'flex flex-col items-center gap-3 min-w-0' : 'flex w-full max-w-[280px] min-w-0 items-center gap-3'}>
            <div className="relative flex-shrink-0">
              <Avatar src={avatar} name={displayName} size={large ? 80 : 44} userId={avatarUserId} user={user ?? undefined} />
            </div>
            <div className={`${large ? 'text-center' : 'text-left flex-1'} min-w-0`}>
              <p className={`text-txt-primary font-semibold ${large ? 'text-sm' : 'text-xs leading-tight line-clamp-2'}`}>
                {t('voice:stream.isStreaming', { name: displayName })}
              </p>
              {!isLocal && (
                <Button
                  variant="primary"
                  size={large ? 'md' : 'sm'}
                  fullWidth={!large}
                  onClick={handleWatch}
                  aria-label={t('voice:stream.watch')}
                  className="mt-2"
                >
                  {t(large ? 'voice:stream.watch' : 'voice:stream.watchShort')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {hasVideo && isWatching && !compact && (
        <StreamPointerLayer rootRef={rootRef} videoRef={videoRef} sharer={participant} canPoint={large === true && !isLocal} />
      )}

      {/* LIVE badge — top left */}
      {!compact && (
        <div className="absolute top-2 left-2 flex">
          <Tag tone="live">{t('voice:badges.live')}</Tag>
        </div>
      )}

      {/* Stream status — in focus mode this is the visual peer of the Grid
          action: same top edge, height, radius, and surface treatment. */}
      {!compact && (healthWarning || (qualityBadge && hasVideo)) && (
        <div
          data-testid="stream-status-row"
          // Focused: the row ends where the focus bar begins, and the bar's
          // width changes with what it offers, so the stage publishes where
          // that is (VoiceGrid). When the bar leaves no room beside it
          // (`data-focus-tight`), the row moves to its own line under the
          // LIVE badge instead of landing on it.
          className={`absolute flex gap-1.5 pointer-events-none ${
            large
              ? 'top-2 left-20 items-start justify-end [[data-focus-tight]_&]:top-10 [[data-focus-tight]_&]:left-2 [[data-focus-tight]_&]:justify-start'
              : 'top-2 left-20 right-2 items-start justify-end'
          }`}
          style={large ? { right: 'var(--focus-quality-right, 16rem)' } : undefined}
        >
          {healthWarning && (
            <div className={`${large ? 'h-7 rounded-lg' : 'h-5 rounded'} min-w-0 max-w-full px-2 bg-black/60 backdrop-blur-md border border-status-warn/40 flex items-center text-2xs text-white/90 truncate`}>
              {t(STREAM_HEALTH_KEYS[healthWarning])}
            </div>
          )}
          {qualityBadge && hasVideo && (
            // Pinned to the row's right edge: "1080p · 60 fps" and a bare
            // "1438p" grow leftward and move nothing else.
            <span data-testid="stream-quality-badge" className={`${large ? 'h-7' : 'h-5'} flex flex-shrink-0 items-center`}>
              <Tag tone="onMedia">
                {qualityBadge.fps !== null
                  ? t('voice:stream.qualityValue', { height: qualityBadge.height, fps: qualityBadge.fps })
                  // i18n-check: allow-literal "720p" is the format's name and reads the same in every language
                  : <>{qualityBadge.height}p</>}
              </Tag>
            </span>
          )}
        </div>
      )}

      {/* Caption: a compact chip in the bottom-left corner, so the rest of
          the picture's bottom edge stays undimmed. */}
      {hasVideo && isWatching && (
        <div
          data-testid="stream-tile-caption"
          className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] h-[26px] px-2 rounded-lg bg-black/60 backdrop-blur-md flex items-center gap-1.5 min-w-0"
        >
          <Icon name="monitor" size="xs" className="text-white/70" />
          <span className={`font-semibold text-white truncate ${compact ? 'text-2xs' : 'text-compact'}`}>
            {isLocal && compact ? t('voice:badges.youShort') : displayName}
          </span>
          {isLocal && !compact && (
            <span className="text-2xs text-white/50 font-medium flex-shrink-0">{t('voice:badges.you')}</span>
          )}
          {/* After the name rather than at the right edge: that corner
              belongs to the inset and its badge. */}
          <span className="ml-0.5 flex"><StreamViewerCount sharer={participant} compact={compact} large={large} /></span>
        </div>
      )}
    </div>
  );
}

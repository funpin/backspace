import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { ScreenShareSettingsPopover } from './ScreenShareSettingsPopover';
import { ConnectionInfoPopover } from './ConnectionInfoPopover';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import { usePingSampler } from '../../utils/pingHistory';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { handleCameraAction, handleDisconnectAction, handleScreenShareAction, reconnectVoice } from '../../utils/voiceActions';

/**
 * VoiceControls renders the voice status + button rows.
 * It has NO wrapper/card styling — the parent provides the container.
 */
export function VoiceControls() {
  const { t } = useTranslation(['voice', 'common']);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const rnnoiseEnabled = useVoiceStore((s) => s.rnnoiseEnabled);
  const setRnnoiseEnabled = useVoiceStore((s) => s.setRnnoiseEnabled);
  const connectionError = useVoiceStore((s) => s.connectionError);
  const isLiveKitConnected = useVoiceStore((s) => s.isLiveKitConnected);
  const voiceConnectionStatus = useVoiceStore((s) => s.voiceConnectionStatus);
  const connectionQuality = useVoiceStore((s) => s.connectionQuality);
  // The ping graph in the connection popover needs history from before it was opened.
  usePingSampler(isLiveKitConnected);
  const channels = useSpaceStore((s) => s.channels);
  // Screen-share button: idle → source picker; live → settings + stop menu.
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showConnectionInfo, setShowConnectionInfo] = useState(false);
  const connectionBtnRef = useRef<HTMLButtonElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);

  const activeDmCall = useVoiceStore((s) => s.activeDmCall);
  const channelPerms = useSpaceStore((s) => currentVoiceChannelId ? s.channelPermissions.get(currentVoiceChannelId) : undefined);

  // In DM calls, all permissions are granted; in space channels, check SPEAK and STREAM
  const isDmCall = !!activeDmCall;
  const canSpeak = isDmCall || hasPermissionBit(channelPerms, PermissionBits.SPEAK);
  const canStream = isDmCall || hasPermissionBit(channelPerms, PermissionBits.STREAM);

  // A share that ends outside the menu (OS "Stop sharing" bar, track loss,
  // keybind) must not leave a stale settings popover anchored to the button.
  useEffect(() => {
    if (!isScreenSharing) setShowShareMenu(false);
  }, [isScreenSharing]);

  if (!currentVoiceChannelId && !activeDmCall) return null;

  const channel = channels.find(c => c.id === currentVoiceChannelId);
  const channelName = channel?.name ?? (activeDmCall ? t('voice:status.dmCall') : t('voice:status.voiceChannel'));

  const handleScreenShare = () => {
    if (isScreenSharing) {
      const next = !showShareMenu;
      setShowShareMenu(next);
      if (next) setShowConnectionInfo(false);
      return;
    }
    handleScreenShareAction();
  };

  const handleStopSharing = () => {
    setShowShareMenu(false);
    handleScreenShareAction();
  };

  const handleDisconnect = handleDisconnectAction;
  const handleRetry = reconnectVoice;

  const connectionDetail = connectionError === 'network_disconnect'
    ? t('voice:status.connectionLost')
    : connectionError === 'connect_failed'
      ? t('voice:status.connectionFailed')
      : connectionError;

  const statusLabel = voiceConnectionStatus === 'reconnecting'
    ? t('voice:status.reconnecting')
    : connectionError === 'network_disconnect'
      ? t('voice:status.disconnected')
      : connectionError
        ? t('voice:status.connectionFailed')
        : isLiveKitConnected
          ? t('voice:status.connected')
          : t('voice:status.connecting');
  const detailLabel = connectionDetail ?? channelName;

  // Connection health is always the traffic light, never the theme accent.
  const statusColor = connectionError
    ? 'text-status-danger'
    : isLiveKitConnected
      ? 'text-status-ok'
      : 'text-status-warn';

  const qualityColor =
    connectionQuality === 'excellent' || connectionQuality === 'good'
      ? 'text-status-ok'
      : connectionQuality === 'poor'
        ? 'text-status-warn'
        : connectionQuality === 'lost'
          ? 'text-status-danger'
          : statusColor; // 'unknown' falls back to connection-state color

  const btnBase = 'flex-1 h-[34px] flex items-center justify-center rounded-lg transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.96]';
  const btnIdle = 'bg-surface-base text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary';
  const btnOn = 'bg-accent-primary text-on-accent hover:bg-accent-primary-hover';

  return (
    <>
      {/* Row 1: Signal icon + status text + disconnect */}
      <div className="relative flex items-center gap-2 px-3 pt-3 pb-1">
        <button
          ref={connectionBtnRef}
          type="button"
          onClick={() => {
            setShowConnectionInfo(!showConnectionInfo);
            if (!showConnectionInfo) setShowShareMenu(false);
          }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-interactive-hover transition-colors duration-fast ${qualityColor}`}
          title={t('voice:controls.connectionInfo')}
        >
          <Icon name="signal" size="lg" />
        </button>

        <div className="min-w-0 flex-1">
          <div title={statusLabel} className={`truncate text-compact font-semibold ${statusColor}`}>
            {statusLabel}
          </div>
          <div title={detailLabel} className="text-xs text-txt-tertiary truncate">
            {detailLabel}
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {voiceConnectionStatus === 'disconnected' && connectionError && (
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              {t('voice:status.retry')}
            </Button>
          )}
          <IconButton
            size="sm"
            icon="phone-off"
            tone="danger"
            onClick={handleDisconnect}
            label={t('voice:controls.disconnect')}
          />
        </div>

        {/* Connection Info Popover */}
        <ConnectionInfoPopover
          open={showConnectionInfo}
          onClose={() => setShowConnectionInfo(false)}
          anchorRef={connectionBtnRef}
        />
      </div>

      {/* Row 2: Camera, Screen Share, Noise Suppression */}
      <div className="relative flex items-center gap-1 px-3 pb-2 pt-1">
        {canSpeak && (
          <button
            type="button"
            onClick={handleCameraAction}
            className={`${btnBase} ${isCameraOn ? btnOn : btnIdle}`}
            title={isCameraOn ? t('voice:controls.cameraOff') : t('voice:controls.cameraOn')}
          >
            <Icon name={isCameraOn ? 'video' : 'video-off'} />
          </button>
        )}

        {canStream && (
          <button
            ref={shareBtnRef}
            type="button"
            onClick={handleScreenShare}
            // Idle the button starts a share; live it toggles a menu, so it
            // only claims a popup in the state where it actually opens one.
            aria-haspopup={isScreenSharing ? 'dialog' : undefined}
            aria-expanded={isScreenSharing ? showShareMenu : undefined}
            className={`${btnBase} ${isScreenSharing ? btnOn : btnIdle}`}
            title={isScreenSharing ? t('voice:controls.shareOptions') : t('voice:controls.shareScreen')}
          >
            <Icon name="screen-share" />
          </button>
        )}

        {/* AI Noise Suppression (RNNoise) */}
        <button
          type="button"
          onClick={() => setRnnoiseEnabled(!rnnoiseEnabled)}
          className={`${btnBase} ${rnnoiseEnabled ? btnOn : btnIdle}`}
          title={rnnoiseEnabled ? t('voice:controls.noiseSuppressionOff') : t('voice:controls.noiseSuppressionOn')}
        >
          {/* A microphone with sparks: no glyph in the icon set says "noise suppression". */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
            <rect x="9" y="5" width="6" height="10" rx="3" />
            <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 19v3" />
            <path d="M19 2v4" />
            <path d="M17 4h4" />
            <path d="M5 3v3" />
            <path d="M3.5 4.5h3" />
          </svg>
        </button>

        {/* Screen share menu — quality settings + stop, anchored to the share button */}
        <ScreenShareSettingsPopover
          open={showShareMenu && isScreenSharing}
          onClose={() => setShowShareMenu(false)}
          anchorRef={shareBtnRef}
          onStopSharing={handleStopSharing}
        />
      </div>
    </>
  );
}

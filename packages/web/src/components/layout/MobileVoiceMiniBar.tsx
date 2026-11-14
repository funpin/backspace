import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useActiveDmCall } from '../../hooks/useActiveDmCall';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { handleDisconnectAction, reconnectVoice, toggleDeafenFromControl, toggleMuteFromControl } from '../../utils/voiceActions';

/**
 * The bar above the bottom navigation while the user is in voice: a voice
 * channel or a DM call. Tapping it opens the call screen.
 */
export function MobileVoiceMiniBar() {
  const { t } = useTranslation(['voice', 'spaces']);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const mobileStack = useUIStore((s) => s.mobileStack);

  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const voiceUsers = useVoiceStore((s) => s.voiceUsers);
  const participants = useVoiceStore((s) => s.participants);
  const activeDmCall = useVoiceStore((s) => s.activeDmCall);
  const voiceConnectionStatus = useVoiceStore((s) => s.voiceConnectionStatus);
  const connectionError = useVoiceStore((s) => s.connectionError);

  const channels = useSpaceStore((s) => s.channels);
  const { title: dmCallTitle } = useActiveDmCall();

  if (!currentVoiceChannelId && !activeDmCall) return null;

  // Don't show mini-bar if voice full-screen is on top of the stack
  const topEntry = mobileStack.length > 0 ? mobileStack[mobileStack.length - 1] : undefined;
  const topScreen = topEntry?.screen ?? null;
  if (topScreen === 'voice-full') return null;

  // A DM call has no voice channel (the two are exclusive): it is named by
  // its conversation, and counted from the LiveKit room, since a call hosted
  // on another instance has no voice states here.
  const channel = currentVoiceChannelId ? channels.find(c => c.id === currentVoiceChannelId) : undefined;
  const channelName = currentVoiceChannelId
    ? channel?.name ?? t('voice:status.voiceCall')
    : dmCallTitle ?? t('voice:status.dmCall');
  const participantCount = currentVoiceChannelId
    ? voiceUsers.get(currentVoiceChannelId)?.length ?? 0
    : participants.length;

  // The desktop sidebar carries this state in VoiceControls, which is not
  // mounted on mobile. Without it a dropped session looks identical to a live
  // one here, down to the stale participant count.
  const isReconnecting = voiceConnectionStatus === 'reconnecting';
  const isDropped = voiceConnectionStatus === 'disconnected' && !!connectionError;
  // Connection health is a traffic light whatever the theme: ok, warn, danger.
  const healthText = isDropped
    ? 'text-status-danger'
    : isReconnecting ? 'text-status-warn' : 'text-status-ok';
  const healthGround = isDropped
    ? 'bg-status-danger/[0.14]'
    : isReconnecting ? 'bg-status-warn/[0.14]' : 'bg-status-ok/[0.14]';

  return (
    <div className="glass-bubble mx-2 mb-1 rounded-xl flex items-center gap-1 pl-2 pr-1 py-1 shrink-0">
      {/* Tap to expand */}
      <button
        onClick={() => pushMobileScreen('voice-full')}
        className="flex-1 flex items-center gap-2 min-w-0 min-h-11 text-left"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${healthGround} ${healthText}`}>
          <Icon name="volume-2" size="sm" />
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-medium truncate ${healthText}`}>{channelName}</p>
          {isReconnecting ? (
            <p className="text-2xs text-txt-tertiary">{t('voice:status.reconnecting')}</p>
          ) : isDropped ? (
            <p className="text-2xs text-txt-tertiary">{t('voice:status.disconnected')}</p>
          ) : participantCount > 0 ? (
            <p className="text-2xs text-txt-tertiary tabular-nums">{t('spaces:main.voice.participants', { count: participantCount })}</p>
          ) : null}
        </div>
      </button>

      {isDropped && (
        <button
          onClick={(e) => { e.stopPropagation(); reconnectVoice(); }}
          className="px-2.5 h-11 rounded-lg text-xs font-medium text-accent-tone hover:bg-interactive-hover transition-colors duration-fast shrink-0"
        >
          {t('voice:status.retry')}
        </button>
      )}

      {/* Quick controls. 44px squares: the phone's minimum touch target. */}
      <div className="flex items-center gap-0.5 shrink-0">
        <IconButton
          icon={isMuted ? 'mic-off' : 'mic'}
          label={isMuted ? t('voice:controls.unmute') : t('voice:controls.mute')}
          size="lg"
          tone={isMuted ? 'off' : 'default'}
          className="h-11 w-11"
          onClick={(e) => { e.stopPropagation(); toggleMuteFromControl(); }}
        />
        <IconButton
          icon={isDeafened ? 'headphone-off' : 'headphones'}
          label={isDeafened ? t('voice:controls.undeafen') : t('voice:controls.deafen')}
          size="lg"
          tone={isDeafened ? 'off' : 'default'}
          className="h-11 w-11"
          onClick={(e) => { e.stopPropagation(); toggleDeafenFromControl(); }}
        />
        <IconButton
          icon="phone-off"
          label={t('voice:mobileCall.disconnect')}
          size="lg"
          tone="danger"
          className="h-11 w-11"
          onClick={(e) => {
            e.stopPropagation();
            handleDisconnectAction();
          }}
        />
      </div>
    </div>
  );
}

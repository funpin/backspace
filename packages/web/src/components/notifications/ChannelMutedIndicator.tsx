import { useTranslation } from 'react-i18next';
import { useChannelNotificationPolicy } from '../../hooks/useNotificationSettings';
import { Icon } from '../ui/Icon';

/**
 * Shown on a channel list row while the channel is muted, by its own mute or
 * its space's. Renders nothing otherwise, and disappears by itself when a
 * timed mute ends (the policy hook re-renders on the store's clock).
 */
export function ChannelMutedIndicator({ channelId, className }: { channelId: string; className?: string }) {
  const { t } = useTranslation(['spaces']);
  const policy = useChannelNotificationPolicy(channelId);
  if (!policy?.muted) return null;
  const label = t('spaces:notifications.mutedIndicator');
  return (
    <span role="img" aria-label={label} title={label} className={`flex-shrink-0 inline-flex ${className ?? ''}`}>
      <Icon name="bell-off" size="xs" />
    </span>
  );
}

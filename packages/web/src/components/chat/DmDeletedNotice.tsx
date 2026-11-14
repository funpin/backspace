import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';

/**
 * Read-only composer replacement shown in a 1-on-1 DM whose partner's account
 * was deleted. Occupies the same bottom slot as the MessageInput glass bubble.
 */
export function DmDeletedNotice() {
  const { t } = useTranslation(['dm', 'common']);
  return (
    <div className="px-4 pb-4 pt-1">
      <div className="glass-bubble flex items-center gap-2 px-4 py-3 rounded-xl text-txt-tertiary text-sm justify-center select-none">
        <Icon name="circle-alert" size="sm" />
        <span>{t('dm:deletedNotice.accountDeleted')}</span>
      </div>
    </div>
  );
}

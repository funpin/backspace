import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { Icon } from '../ui/Icon';

export function MemberListToggleButton() {
  const { t } = useTranslation('common');
  const toggleMemberList = useUIStore((s) => s.toggleMemberList);
  const memberListOpen = useUIStore((s) => s.memberListOpen);

  return (
    <button
      onClick={toggleMemberList}
      className={`w-[34px] h-[34px] inline-grid place-items-center flex-shrink-0 rounded-lg transition-colors duration-fast ${
        memberListOpen ? 'text-txt-primary bg-interactive-active' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
      }`}
      title={t('chrome.toggleMemberList')}
      aria-label={t('chrome.toggleMemberList')}
      aria-pressed={memberListOpen}
    >
      <Icon name="users" />
    </button>
  );
}

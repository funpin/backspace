import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { parseFederatedUsername } from '../../utils/identity';
import { replaceEmojiShortcodes, useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { useInstanceUpdateBadge } from '../../hooks/useInstanceUpdateBadge';
import { useHubUpdateState } from '../../hooks/useHubUpdateState';
import { BackspaceMark } from '../projectHub/BackspaceMark';
import { HubUpdateDot } from '../projectHub/HubUpdateDot';
import { Icon } from '../ui/Icon';

/**
 * A row on the You screen. `badge` is drawn at the trailing edge, before the
 * chevron; a badge must name itself (the Backspace row passes `HubUpdateDot`,
 * which carries its own label).
 */
interface ActionRow {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  badge?: React.ReactNode;
}

export function MobileYouScreen() {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['mobile', 'settings', 'common', 'admin', 'project']);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const updateBadge = useInstanceUpdateBadge();
  const hubUpdate = useHubUpdateState();

  if (!user) return null;

  const avatarUrl = user.avatar ? `/api/uploads/${user.avatar}` : null;
  const bannerUrl = user.banner ? `/api/uploads/${user.banner}` : null;

  const actionRows: ActionRow[] = [
    {
      label: t('mobile:you.editProfile'),
      icon: <Icon name="pencil" size="lg" />,
      action: () => pushMobileScreen('settings-account'),
    },
    {
      label: t('common:labels.friends'),
      icon: <Icon name="users" size="lg" />,
      action: () => pushMobileScreen('friends'),
    },
    {
      label: t('settings:nav.tabs.connections'),
      icon: <Icon name="link" size="lg" />,
      action: () => pushMobileScreen('settings-connections'),
    },
    {
      label: t('settings:nav.tabs.voice'),
      icon: <Icon name="mic" size="lg" />,
      action: () => pushMobileScreen('settings-voice'),
    },
    {
      label: t('project:nav.label'),
      icon: <BackspaceMark size={20} className="w-5 h-5" />,
      action: () => pushMobileScreen('backspace'),
      badge: hubUpdate.state === 'updated' ? <HubUpdateDot /> : null,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-y-auto">
      {/* Header with settings gear */}
      <header className="h-12 flex items-center justify-end px-3 shrink-0">
        <button
          onClick={() => pushMobileScreen('settings')}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast relative"
          aria-label={updateBadge ? t('admin:updates.badge.settingsAriaLabel') : t('common:labels.settings')}
        >
          <Icon name="settings" size="lg" />
          {updateBadge && (
            <span className="absolute top-2.5 right-2.5 w-[7px] h-[7px] rounded-full bg-status-warn" />
          )}
        </button>
      </header>

      {/* Profile card */}
      <div className="mx-4 rounded-xl overflow-hidden bg-surface-channel">
        {/* Banner or accent background */}
        <div
          className="h-24 relative"
          style={{
            background: bannerUrl
              ? `url(/api/uploads/${user.banner}) center/cover`
              : user.accentColor || 'linear-gradient(135deg, rgb(var(--accent-primary)), rgb(var(--accent-lavender)))',
          }}
        />

        {/* Avatar overlay */}
        <div className="px-4 -mt-10 relative z-10">
          <div className="w-20 h-20 rounded-full border-4 border-surface-channel overflow-hidden">
            <Avatar
              src={avatarUrl}
              name={user.displayName ?? user.username}
              avatarColor={user.avatarColor}
              size={72}
            />
          </div>
        </div>

        {/* User info */}
        <div className="px-4 pb-4 pt-2">
          <h2 className="text-lg font-semibold text-txt-primary">
            {user.displayName ?? user.username}
          </h2>
          <p className="text-sm text-txt-secondary">@{user.username}</p>
          {(() => {
            const { domain } = parseFederatedUsername(user.username);
            if (!domain) return null;
            return <div className="text-2xs text-txt-tertiary">{t('mobile:you.homeInstance', { domain })}</div>;
          })()}
          {user.customStatus && (
            <p className="text-sm text-txt-secondary mt-1">{replaceEmojiShortcodes(user.customStatus)}</p>
          )}
          {user.bio && (
            <p className="text-sm text-txt-message mt-2 whitespace-pre-wrap">{replaceEmojiShortcodes(user.bio)}</p>
          )}
        </div>
      </div>

      {/* Action rows */}
      <div className="mt-4 mx-4 rounded-xl bg-surface-channel overflow-hidden">
        {actionRows.map((row, i) => (
          <button
            key={row.label}
            onClick={row.action}
            className={`w-full min-h-12 flex items-center gap-3 px-4 py-3 hover:bg-interactive-hover text-left transition-colors duration-fast ${
              i > 0 ? 'border-t border-border-soft' : ''
            }`}
          >
            <span className="flex text-txt-secondary">{row.icon}</span>
            <span className="text-sm text-txt-primary flex-1">{row.label}</span>
            {row.badge}
            <Icon name="chevron-right" size="sm" className="text-txt-tertiary" />
          </button>
        ))}
      </div>

      {/* Log out */}
      <div className="mt-4 mx-4 mb-8 rounded-xl bg-surface-channel overflow-hidden">
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full min-h-12 flex items-center gap-3 px-4 py-3 text-status-danger hover:bg-status-danger/10 text-left transition-colors duration-fast"
        >
          <Icon name="log-out" size="lg" />
          <span className="text-sm font-medium flex-1">{t('settings:nav.logOut')}</span>
        </button>
      </div>

      {showLogoutConfirm && (
        <ConfirmDialog
          isOpen={true}
          title={t('settings:nav.logOut')}
          description={t('mobile:you.logOutConfirm')}
          confirmLabel={t('settings:nav.logOut')}
          cancelLabel={t('common:actions.cancel')}
          onConfirm={() => { setShowLogoutConfirm(false); logout(); }}
          onClose={() => setShowLogoutConfirm(false)}
          variant="danger"
        />
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import {
  AccountPanel,
  AppearancePanel,
  VoicePanel,
  ConnectionsPanel,
  PrivacyPanel,
  KeybindsPanel,
  DesktopPanel,
  DesktopDownloadPanel,
  SettingsPanelSuspense,
} from '../modals/lazySettingsPanels';
import { MobileScreenHeader } from './MobileScreenHeader';
import { TransferIndicator } from './TransferIndicator';
import { isElectron } from '../../platform/platform';
import { useInstanceUpdateBadge } from '../../hooks/useInstanceUpdateBadge';
import { Icon, type IconName } from '../ui/Icon';

interface MobileSettingsScreenProps {
  initialPanel?: string;
}

type PanelTitleKey =
  | 'settings:nav.tabs.account'
  | 'settings:nav.tabs.appearance'
  | 'settings:nav.tabs.voice'
  | 'settings:nav.tabs.privacy'
  | 'settings:nav.tabs.connections'
  | 'settings:nav.tabs.keybinds'
  | 'settings:nav.tabs.desktop';

/**
 * Every panel this screen can open directly: its header title and its body. The
 * body is a function so Desktop can decide at render time, the one entry that
 * depends on where the client runs. Inside the app it is the app's own
 * settings, in a browser it is the download offer, which is the same wiring the
 * settings modal uses. `instanceVersion` is null until the instance info
 * request lands, and stays null if it failed.
 */
const panelConfig: Record<
  string,
  { titleKey: PanelTitleKey; body: (instanceVersion: string | null) => React.ReactNode }
> = {
  account: { titleKey: 'settings:nav.tabs.account', body: () => <AccountPanel /> },
  appearance: { titleKey: 'settings:nav.tabs.appearance', body: () => <AppearancePanel /> },
  voice: { titleKey: 'settings:nav.tabs.voice', body: () => <VoicePanel /> },
  privacy: { titleKey: 'settings:nav.tabs.privacy', body: () => <PrivacyPanel /> },
  connections: { titleKey: 'settings:nav.tabs.connections', body: () => <ConnectionsPanel /> },
  keybinds: { titleKey: 'settings:nav.tabs.keybinds', body: () => <KeybindsPanel /> },
  desktop: {
    titleKey: 'settings:nav.tabs.desktop',
    body: (instanceVersion) =>
      isElectron() ? <DesktopPanel /> : <DesktopDownloadPanel version={instanceVersion} />,
  },
};

const sectionIcons: Record<string, IconName> = {
  account: 'user',
  appearance: 'palette',
  voice: 'mic',
  privacy: 'shield-check',
  connections: 'link',
  instance: 'server',
  keybinds: 'keyboard',
  desktop: 'monitor',
};

export function MobileSettingsScreen({ initialPanel }: MobileSettingsScreenProps) {
  const { t } = useTranslation(['mobile', 'settings', 'common']);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  const updateBadge = useInstanceUpdateBadge();

  // The browser's Desktop panel builds its download links from the instance
  // version, the same source the settings modal reads them from. Nothing else
  // on this screen needs it, so no other panel starts the request.
  const needsInstanceVersion = initialPanel === 'desktop' && !isElectron();
  const [instanceVersion, setInstanceVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!needsInstanceVersion) return;
    let cancelled = false;
    api.instance.info()
      .then((info) => { if (!cancelled) setInstanceVersion(info.version); })
      .catch(() => { /* Non-critical: without a version every link falls back to the releases listing. */ });
    return () => { cancelled = true; };
  }, [needsInstanceVersion]);

  // If initialPanel is set, render that panel directly
  if (initialPanel) {
    const panel = panelConfig[initialPanel];
    if (!panel) return null;
    if (initialPanel === 'instance' && !isAdmin) return null;

    return (
      <div className="flex flex-col h-full bg-surface-base">
        <MobileScreenHeader title={t(panel.titleKey)} rightActions={<TransferIndicator />} />
        <div className="flex-1 overflow-y-auto p-4">
          <SettingsPanelSuspense key={initialPanel}>{panel.body(instanceVersion)}</SettingsPanelSuspense>
        </div>
      </div>
    );
  }

  // Settings section list. Desktop is listed everywhere, mirroring the settings
  // modal: inside the app it opens the app's own settings, in a browser it
  // opens the download offer, which is worth reaching from a phone because the
  // visitor may be downloading for another machine. Keybinds stays
  // Electron-only: its value comes from the desktop app's global keybind
  // manager, and the web fallback (only while the tab has focus, no recording
  // flow on touch keyboards) would mislead a mobile-web user into recording a
  // binding that can never fire.
  const sections = [
    { id: 'account', label: t('settings:nav.tabs.account') },
    { id: 'appearance', label: t('settings:nav.tabs.appearance') },
    { id: 'voice', label: t('settings:nav.tabs.voice') },
    { id: 'privacy', label: t('settings:nav.tabs.privacy') },
    { id: 'connections', label: t('settings:nav.tabs.connections') },
    ...(isElectron() ? [{ id: 'keybinds', label: t('settings:nav.tabs.keybinds') }] : []),
    { id: 'desktop', label: t('settings:nav.tabs.desktop') },
    ...(isAdmin ? [{ id: 'instance', label: t('settings:nav.tabs.instance'), dot: updateBadge }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <MobileScreenHeader title={t('common:labels.settings')} rightActions={<TransferIndicator />} />
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => pushMobileScreen(`settings-${section.id}`)}
            className="w-full min-h-12 flex items-center gap-3 px-4 py-3 hover:bg-interactive-hover text-left transition-colors duration-fast"
          >
            <Icon name={sectionIcons[section.id] ?? 'settings'} size="lg" className="text-txt-secondary" />
            <span className="text-sm text-txt-primary flex-1">{section.label}</span>
            {section.dot && <span className="w-[7px] h-[7px] rounded-full bg-status-warn" />}
            <Icon name="chevron-right" size="sm" className="text-txt-tertiary" />
          </button>
        ))}
      </div>
    </div>
  );
}

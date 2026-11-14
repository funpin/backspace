import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { MobileScreenHeader } from './MobileScreenHeader';
import { TransferIndicator } from './TransferIndicator';
import { api } from '../../api/client';
import { onFederationPeersChanged } from '../../hooks/useWebSocket';
import { useInstanceUpdateBadge } from '../../hooks/useInstanceUpdateBadge';
import { Icon, type IconName } from '../ui/Icon';
import { Badge } from '../ui/Tag';

type SectionId = 'general' | 'registration' | 'federation' | 'streaming' | 'storage' | 'users' | 'updates' | 'telemetry';

type SectionDef = {
  id: SectionId;
  icon: IconName;
};

const sections: SectionDef[] = [
  {
    id: 'general',
    icon: 'settings',
  },
  {
    id: 'registration',
    icon: 'user-plus',
  },
  {
    id: 'federation',
    icon: 'globe',
  },
  {
    id: 'streaming',
    icon: 'video',
  },
  {
    id: 'storage',
    icon: 'database',
  },
  {
    id: 'updates',
    icon: 'download',
  },
  {
    id: 'users',
    icon: 'users',
  },
  {
    id: 'telemetry',
    icon: 'send',
  },
];

/**
 * Federation approval-count badge source.
 *
 * Mirrors the desktop InstancePanel/FederationPanel contract: the count comes
 * from `api.federation.approvalRequests()` and is kept fresh by the
 * `onFederationPeersChanged` WebSocket signal that FederationPanel itself
 * subscribes to. We can't read FederationPanel's internal state from here, so
 * we fetch the same endpoint independently — and we wire MobileShell to forward
 * `onApprovalCountChange` callbacks from FederationPanel into a shared store
 * slot so the badge updates live while the admin is inside the panel.
 */
function useFederationApprovalCount(enabled: boolean) {
  const liveCount = useUIStore((s) => s.federationApprovalCount);
  const setLiveCount = useUIStore((s) => s.setFederationApprovalCount);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await api.federation.approvalRequests();
      setLiveCount(result.requests.length);
    } catch {
      // Silently ignore — badge simply won't update on transient failures
    }
  }, [enabled, setLiveCount]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Re-fetch when peer state changes (mirrors FederationPanel's own listener)
  useEffect(() => {
    if (!enabled) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsub = onFederationPeersChanged(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        refetch();
      }, 500);
    });
    return () => {
      unsub();
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled, refetch]);

  return liveCount;
}

export function MobileInstancePanel() {
  const { t } = useTranslation(['federation', 'admin', 'common']);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);
  const fetchInstanceSettings = useSettingsStore((s) => s.fetchInstanceSettings);

  // Pre-fetch instance data so sub-panels have it when they mount
  // (mirrors InstancePanel.tsx useEffect on desktop). Not the streaming
  // limits: `StreamingPanel` is their only reader here and loads them itself.
  useEffect(() => {
    fetchInstanceSettings();
  }, [fetchInstanceSettings]);

  const approvalCount = useFederationApprovalCount(true);
  const updateBadge = useInstanceUpdateBadge();

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <MobileScreenHeader title={t('admin:mobile.title')} rightActions={<TransferIndicator />} />
      <div className="flex-1 overflow-y-auto">
        {sections.map((section) => {
          const badge = section.id === 'federation' && approvalCount > 0 ? approvalCount : null;
          const dot = section.id === 'updates' && updateBadge;
          return (
            <button
              key={section.id}
              onClick={() => pushMobileScreen(`settings-instance-${section.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-interactive-hover active:bg-interactive-active text-left transition-colors duration-fast"
            >
              <Icon name={section.icon} size="lg" className="text-txt-secondary" />
              <span className="text-sm text-txt-primary flex-1">{t(`admin:mobile.sections.${section.id}`)}</span>
              {badge !== null && (
                <Badge count={badge} />
              )}
              {dot && <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />}
              <Icon name="chevron-right" size="sm" className="text-txt-tertiary" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

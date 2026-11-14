import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type {
  InstanceInfoResponse,
  FederationRegistryEntry,
  PeeringSubscription,
  PeeringNotification,
  PeeringTriggerReason,
} from '@backspace/shared';
import { useInstanceStore, connectToInstance, isSelfOrigin, type RemoteLoginReason } from '../../stores/instanceStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useFederationStore } from '../../stores/federationStore';
import { isElectron } from '../../platform/platform';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusDot } from '../ui/StatusDot';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tabs } from '../ui/Controls';
import { RemotePasswordStep, type RemotePasswordPhase } from './RemotePasswordStep';
import { ReauthForm } from './ReauthForm';
import { useFormatters, type Formatters } from '../../i18n/formatters';
import { describeError } from '../../i18n/errors';
import { describeRegistryError } from '../../i18n/registryErrors';

type FederationT = TFunction<['federation', 'common']>;

// ─── URL helpers ─────────────────────────────────────────────────────────────

function safeHost(origin: string): string {
  try { return new URL(origin).host; } catch { return origin; }
}

// ─── Registry status helpers ────────────────────────────────────────────────

/** An exclusive choice: the chosen one takes the tone's edge and tint, the rest a quiet edge. */
const CHOICE_ON = 'bg-accent-tone/[0.16] shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]';
const CHOICE_OFF = 'shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-interactive-hover';

function registryStatusColor(status: string): string {
  switch (status) {
    case 'connected': return 'bg-status-ok/15 text-status-ok';
    case 'disconnected': return 'bg-surface-input text-txt-tertiary';
    case 'unreachable': return 'bg-status-warn/15 text-status-warn';
    case 'auth_expired': return 'bg-status-danger/15 text-status-danger';
    default: return 'bg-surface-input text-txt-tertiary';
  }
}

function registryStatusDotColor(status: string): string {
  switch (status) {
    case 'connected': return 'bg-status-ok';
    case 'unreachable': return 'bg-status-warn';
    case 'auth_expired': return 'bg-status-danger';
    default: return 'bg-txt-tertiary';
  }
}

function registryStatusLabel(t: FederationT, status: string): string {
  switch (status) {
    case 'connected': return t('federation:connections.status.connected');
    case 'disconnected': return t('federation:connections.status.disconnected');
    case 'unreachable': return t('federation:connections.status.unreachable');
    case 'auth_expired': return t('federation:connections.status.authExpired');
    default: return status;
  }
}

/** "Never" for a missing timestamp, "Just now" under a minute, otherwise the elapsed time. */
function formatRelativeTime(t: FederationT, formatters: Formatters, timestamp: number | null): string {
  if (!timestamp) return t('common:time.never');
  if (Date.now() - timestamp < 60_000) return t('common:time.justNow');
  return formatters.formatRelativeTime(timestamp);
}

// ─── Add Instance flow ───────────────────────────────────────────────────────

type AddStep = 'url' | 'auth' | 'done';

function AddInstanceFlow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(['federation', 'common', 'errors']);
  const user = useAuthStore((s) => s.user);
  const loginToRemote = useInstanceStore((s) => s.loginToRemote);
  const probeInstance = useInstanceStore((s) => s.probeInstance);

  const [step, setStep] = useState<AddStep>('url');
  const [url, setUrl] = useState('');
  const [probeResult, setProbeResult] = useState<(InstanceInfoResponse & { origin: string }) | null>(null);
  const [authPhase, setAuthPhase] = useState<RemotePasswordPhase>('password');
  const [remoteUsername, setRemoteUsername] = useState('');
  const [fallbackReason, setFallbackReason] = useState<RemoteLoginReason>('credential-refused');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleProbe = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await probeInstance(url);
      setProbeResult(result);
      setAuthPhase('password');
      setStep('auth');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (password: string) => {
    if (!probeResult) return;
    setError('');
    setIsLoading(true);
    try {
      const outcome = await connectToInstance(
        probeResult.origin,
        password,
        user?.displayName || undefined,
      );
      if (outcome.kind === 'needs-remote-password') {
        setAuthPhase('fallback');
        setRemoteUsername(outcome.remoteUsername);
        setFallbackReason(outcome.reason);
        return;
      }
      if (outcome.kind === 'needs-password') {
        // Only an empty password reaches this, which the step's submit
        // blocks; handled rather than swallowed so a new outcome member can
        // never read as success here.
        setError(t('errors:password_required'));
        return;
      }
      setStep('done');
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFallbackLogin = async (username: string, remotePassword: string) => {
    if (!probeResult) return;
    setError('');
    setIsLoading(true);
    try {
      await loginToRemote(probeResult.origin, username, remotePassword);
      setStep('done');
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') return null;

  return (
    <div className="mt-1 p-3 rounded-xl bg-surface-elevated space-y-3">
      {/* Step 1: Enter URL */}
      {step === 'url' && (
        <>
          <div className="text-sm text-txt-primary font-medium">{t('federation:connections.add.title')}</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && url.trim() && handleProbe()}
              placeholder={t('federation:connections.add.urlPlaceholder')}
              className="input-standard flex-1"
              disabled={isLoading}
            />
            <Button variant="primary" onClick={handleProbe} disabled={isLoading || !url.trim()}>
              {isLoading ? t('federation:connections.add.probing') : t('federation:connections.add.connect')}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onDone}>
            {t('common:actions.cancel')}
          </Button>
        </>
      )}

      {/* Step 2: the password step, shared with the directory's connect-and-join modal */}
      {step === 'auth' && probeResult && (
        <>
          <RemotePasswordStep
            phase={authPhase}
            instance={probeResult}
            homeUsername={user?.username || ''}
            remoteUsername={remoteUsername}
            fallbackReason={fallbackReason}
            isLoading={isLoading}
            error={error}
            onConnect={handleConnect}
            onLogin={handleFallbackLogin}
          />
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon="chevron-left"
              onClick={() => {
                if (authPhase === 'fallback') {
                  setAuthPhase('password');
                } else {
                  setStep('url');
                  setProbeResult(null);
                }
                setError('');
              }}
            >
              {t('common:actions.back')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDone}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        </>
      )}

      {/* The URL step's own error; the password step renders its own */}
      {step === 'url' && error && (
        <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Filter / Sort types ────────────────────────────────────────────────────

type StatusFilter = 'all' | 'connected' | 'disconnected' | 'issues';
type SortBy = 'name' | 'dateAdded' | 'lastConnected';

// ─── RegistryFilterBar ──────────────────────────────────────────────────────

function RegistryFilterBar({
  filter,
  setFilter,
  sortBy,
  setSortBy,
  counts,
}: {
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  counts: { all: number; connected: number; disconnected: number; issues: number };
}) {
  const { t } = useTranslation(['federation', 'common']);
  const [sortOpen, setSortOpen] = useState(false);

  const tabs: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: t('federation:connections.filter.all'), count: counts.all },
    { key: 'connected', label: t('federation:connections.filter.connected'), count: counts.connected },
    { key: 'disconnected', label: t('federation:connections.filter.disconnected'), count: counts.disconnected },
    { key: 'issues', label: t('federation:connections.filter.issues'), count: counts.issues },
  ];

  const sortOptions: Array<{ key: SortBy; label: string }> = [
    { key: 'name', label: t('common:labels.nameAZ') },
    { key: 'dateAdded', label: t('federation:connections.sort.dateAdded') },
    { key: 'lastConnected', label: t('federation:connections.sort.lastConnected') },
  ];

  return (
    <div className="flex items-center justify-between gap-2 mb-1">
      <Tabs
        items={tabs.map((tab) => ({ value: tab.key, label: tab.label, count: tab.count }))}
        value={filter}
        onChange={setFilter}
        label={t('federation:connections.title')}
      />

      <div className="relative">
        <button
          type="button"
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center gap-1.5 h-7 px-2.5 text-compact font-medium text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover rounded-lg transition-colors duration-fast"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          {t('common:actions.sort')}
          <Icon name="chevron-down" size="xs" />
        </button>

        {sortOpen && (
          <>
            <div className="fixed inset-0 z-popover" onClick={() => setSortOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-popover glass rounded-xl p-1.5 w-44">
              <div className="text-xs font-medium text-txt-tertiary px-2 py-1">{t('common:actions.sortBy')}</div>
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                  className={`w-full h-[34px] text-left px-2.5 text-sm rounded-lg ${
                    sortBy === opt.key ? 'text-accent-tone bg-accent-tone/[0.16]' : 'text-txt-primary hover:bg-interactive-hover'
                  } transition-colors duration-fast`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DeleteIdentityDialog ───────────────────────────────────────────────────

type DeletionMode = 'leave' | 'soft' | 'full';
type DeletionScope = 'this' | 'select' | 'all';

function DeleteIdentityDialog({
  origin,
  label,
  onClose,
}: {
  origin: string;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['federation', 'common']);
  const deleteIdentity = useInstanceStore((s) => s.deleteIdentity);
  const registry = useInstanceStore((s) => s.registry);
  const [mode, setMode] = useState<DeletionMode>('leave');
  const [scope, setScope] = useState<DeletionScope>('this');
  const [selectedOrigins, setSelectedOrigins] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    // Resolve target origins based on scope
    let targetOrigins: string[];
    if (scope === 'all') {
      targetOrigins = Array.from(registry.keys());
    } else if (scope === 'select') {
      targetOrigins = Array.from(selectedOrigins);
    } else {
      targetOrigins = [origin];
    }

    if (targetOrigins.length === 0) {
      onClose();
      return;
    }

    if (mode !== 'leave') {
      setLoading(true);
    }

    const results = await deleteIdentity(targetOrigins, mode);

    // Check results
    const failed = Object.entries(results).filter(([, r]) => !r.success);
    if (failed.length === 0) {
      useUIStore.getState().addToast(
        mode === 'leave'
          ? t('federation:connections.deleteIdentity.toast.disconnected')
          : t('federation:connections.deleteIdentity.toast.deleted', { count: targetOrigins.length }),
        'success',
        3000,
      );
      onClose();
    } else {
      for (const [failOrigin, result] of failed) {
        let host: string;
        try { host = new URL(failOrigin).hostname; } catch { host = failOrigin; }
        if (result.error === 'owns_spaces') {
          useUIStore.getState().addToast(
            t('federation:connections.deleteIdentity.toast.ownsSpaces', { host }),
            'warning',
            5000,
          );
        } else {
          useUIStore.getState().addToast(
            t('federation:connections.deleteIdentity.toast.failed', {
              host,
              error: result.error || t('federation:connections.deleteIdentity.toast.failedGeneric'),
            }),
            'warning',
            5000,
          );
        }
      }
      // Close if some succeeded, keep open if all failed
      const succeeded = Object.values(results).filter(r => r.success).length;
      if (succeeded > 0) {
        onClose();
      } else {
        setLoading(false);
      }
    }
  };

  const scopeOptions: Array<{ key: DeletionScope; label: string }> = [
    { key: 'this', label: t('federation:connections.deleteIdentity.scope.this') },
    { key: 'select', label: t('federation:connections.deleteIdentity.scope.select') },
    { key: 'all', label: t('federation:connections.deleteIdentity.scope.all') },
  ];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-confirm flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-surface-overlay"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative max-w-md w-full mx-4 glass-modal rounded-2xl p-5 animate-slide-up">
        <h3 className="text-lg font-semibold text-txt-primary mb-1">{t('federation:connections.deleteIdentity.title')}</h3>
        <p className="text-sm text-txt-secondary mb-4">
          <Trans
            t={t}
            i18nKey="federation:connections.deleteIdentity.description"
            values={{ name: label }}
            components={{ name: <span className="text-txt-primary font-medium" /> }}
          />
        </p>

        {/* Deletion mode selection */}
        <div className="space-y-2 mb-4">
          {/* Leave quietly */}
          <button
            type="button"
            onClick={() => setMode('leave')}
            disabled={loading}
            className={`w-full text-left p-3 rounded-lg transition-colors duration-fast ${
              mode === 'leave' ? CHOICE_ON : CHOICE_OFF
            } disabled:opacity-50`}
          >
            <div className="text-sm font-medium text-txt-primary">{t('federation:connections.deleteIdentity.leave.title')}</div>
            <div className="text-xs text-txt-tertiary mt-0.5">
              {t('federation:connections.deleteIdentity.leave.description')}
            </div>
          </button>

          {/* Delete User (soft) */}
          <button
            type="button"
            onClick={() => setMode('soft')}
            disabled={loading}
            className={`w-full text-left p-3 rounded-lg transition-colors duration-fast ${
              mode === 'soft' ? CHOICE_ON : CHOICE_OFF
            } disabled:opacity-50`}
          >
            <div className="text-sm font-medium text-txt-primary">{t('federation:connections.deleteIdentity.soft.title')}</div>
            <div className="text-xs text-txt-tertiary mt-0.5">
              {t('federation:connections.deleteIdentity.soft.description')}
            </div>
          </button>

          {/* Nuke everything (full) */}
          <button
            type="button"
            onClick={() => setMode('full')}
            disabled={loading}
            className={`w-full text-left p-3 rounded-lg transition-colors duration-fast ${
              mode === 'full' ? CHOICE_ON : CHOICE_OFF
            } disabled:opacity-50`}
          >
            <div className={`text-sm font-medium ${mode === 'full' ? 'text-status-danger' : 'text-txt-primary'}`}>
              {t('federation:connections.deleteIdentity.full.title')}
            </div>
            <div className="text-xs text-txt-tertiary mt-0.5">
              {t('federation:connections.deleteIdentity.full.description')}
            </div>
          </button>
        </div>

        {/* Scope selector */}
        <div className="mb-4">
          <div className="text-xs font-medium text-txt-secondary mb-1.5">{t('federation:connections.deleteIdentity.scope.heading')}</div>
          <div className="flex gap-1.5">
            {scopeOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setScope(opt.key)}
                disabled={loading}
                className={`flex-1 h-8 px-2 text-compact font-medium rounded-lg transition-colors duration-fast disabled:opacity-50 ${
                  scope === opt.key ? `${CHOICE_ON} text-accent-tone` : `${CHOICE_OFF} text-txt-secondary hover:text-txt-primary`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Instance picker for 'select' scope */}
        {scope === 'select' && (
          <div className="mb-4 p-2 bg-surface-input rounded-lg max-h-40 overflow-y-auto scrollbar-thin space-y-0.5">
            {Array.from(registry.values()).map((entry) => {
              const checked = selectedOrigins.has(entry.origin);
              return (
                <label
                  key={entry.origin}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedOrigins((prev) => {
                        const next = new Set(prev);
                        if (checked) next.delete(entry.origin);
                        else next.add(entry.origin);
                        return next;
                      });
                    }}
                    disabled={loading}
                    className="accent-accent-tone w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-xs text-txt-secondary truncate">{safeHost(entry.origin)}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="danger-solid"
            onClick={handleConfirm}
            disabled={loading || (scope === 'select' && selectedOrigins.size === 0)}
          >
            {loading
              ? t('federation:connections.deleteIdentity.deleting')
              : mode === 'leave'
                ? t('federation:connections.deleteIdentity.disconnect')
                : t('federation:connections.deleteIdentity.confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── RegistryRow ────────────────────────────────────────────────────────────

function RegistryRow({
  entry,
  expanded,
  onToggleExpand,
}: {
  entry: FederationRegistryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { t } = useTranslation(['federation', 'common']);
  const formatters = useFormatters();
  const instances = useInstanceStore((s) => s.instances);
  const disconnectInstance = useInstanceStore((s) => s.disconnectInstance);
  const reconnectInstance = useInstanceStore((s) => s.reconnectInstance);
  const forceRemoveEntry = useInstanceStore((s) => s.forceRemoveEntry);

  const [showForceRemoveConfirm, setShowForceRemoveConfirm] = useState(false);
  const [showDeleteIdentity, setShowDeleteIdentity] = useState(false);
  const [showReauth, setShowReauth] = useState(false);

  const name = entry.label || safeHost(entry.origin);
  const isDisconnected = entry.status === 'disconnected';
  const isConnected = entry.status === 'connected';
  const hasIssue = entry.status === 'unreachable' || entry.status === 'auth_expired';

  // Check if there's a live ConnectedInstance for reconnect actions
  const liveInstance = instances.find((i) => i.origin === entry.origin);

  // Build context-dependent metadata line
  const metadataParts: string[] = [
    t('federation:connections.row.added', { date: formatters.formatMediumDate(entry.addedAt) }),
  ];
  if (isConnected) {
    if (entry.lastConnectedAt) {
      metadataParts.push(t('federation:connections.row.connectedAgo', { time: formatRelativeTime(t, formatters, entry.lastConnectedAt) }));
    }
  } else if (isDisconnected) {
    if (entry.disconnectedAt) {
      metadataParts.push(t('federation:connections.row.disconnectedAgo', { time: formatRelativeTime(t, formatters, entry.disconnectedAt) }));
    }
  } else if (entry.lastConnectedAt) {
    metadataParts.push(t('federation:connections.row.lastConnectedAgo', { time: formatRelativeTime(t, formatters, entry.lastConnectedAt) }));
  }
  const metadataText = metadataParts.join(' · ');

  const handleDisconnect = () => {
    disconnectInstance(entry.origin);
  };

  const handleReconnect = () => {
    if (liveInstance) {
      reconnectInstance(entry.origin);
    }
  };

  const handleForceRemove = () => {
    forceRemoveEntry(entry.origin);
    setShowForceRemoveConfirm(false);
  };

  return (
    <>
      <div className={`rounded-xl bg-surface-elevated transition-colors ${isDisconnected ? 'opacity-70' : ''}`}>
        {/* Compact row */}
        <div
          className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-interactive-hover rounded-xl transition-colors duration-fast"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${registryStatusDotColor(entry.status)}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-txt-primary truncate">{name}</span>
                <span className={`inline-flex items-center h-5 px-[7px] text-2xs font-semibold rounded ${registryStatusColor(entry.status)}`}>
                  {registryStatusLabel(t, entry.status)}
                </span>
              </div>
              <div className="text-xs text-txt-tertiary truncate">
                {safeHost(entry.origin)}
                {entry.username && (
                  <span className="ml-1">{t('federation:connections.row.asUser', { username: entry.username })}</span>
                )}
              </div>
              <div className="text-2xs text-txt-tertiary">{metadataText}</div>
            </div>
          </div>
          <span className="text-txt-tertiary shrink-0 ml-2"><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="sm" /></span>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="px-3 pb-3">
            <div className="border-t border-border-soft pt-3">
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-xs font-medium text-txt-tertiary mb-0.5">{t('federation:connections.row.remoteUserId')}</div>
                  <div className="text-xs text-txt-secondary truncate" title={entry.remoteUserId || t('common:states.unknown')}>
                    {entry.remoteUserId ? entry.remoteUserId.slice(0, 12) + '...' : t('common:states.unknown')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-txt-tertiary mb-0.5">{t('federation:connections.row.addedLabel')}</div>
                  <div className="text-xs text-txt-secondary">{formatters.formatMediumDate(entry.addedAt)}</div>
                </div>
                <div>
                  {isDisconnected && entry.disconnectedAt ? (
                    <>
                      <div className="text-xs font-medium text-txt-tertiary mb-0.5">{t('federation:connections.row.disconnectedLabel')}</div>
                      <div className="text-xs text-txt-secondary">{formatters.formatMediumDate(entry.disconnectedAt)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-txt-tertiary mb-0.5">{t('federation:connections.row.lastConnectedLabel')}</div>
                      <div className="text-xs text-txt-secondary">
                        {entry.lastConnectedAt ? formatters.formatMediumDate(entry.lastConnectedAt) : t('common:time.never')}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Error message */}
              {entry.errorMessage && (
                <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger mb-3">
                  {describeRegistryError(t, entry.errorMessage)}
                </div>
              )}

              {/* Re-auth inline form, shared with the Explore page's connection chips */}
              {showReauth && (
                <ReauthForm
                  origin={entry.origin}
                  username={entry.username ?? ''}
                  onDone={() => setShowReauth(false)}
                  onCancel={() => setShowReauth(false)}
                  className="mt-3 mb-3"
                />
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {isConnected && (
                  <>
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}>
                      {t('federation:connections.row.disconnect')}
                    </Button>
                    {/* A plain button, not Button: the disabled primitive drops
                        pointer events, and this title is the only place that
                        says why the action is unavailable. */}
                    <button
                      type="button"
                      disabled
                      className="h-7 px-2.5 text-compact font-medium text-status-danger rounded-lg opacity-40 cursor-not-allowed"
                      title={t('federation:connections.row.deleteIdentityDisabled')}
                    >
                      {t('federation:connections.row.deleteIdentity')}
                    </button>
                  </>
                )}

                {isDisconnected && (
                  <>
                    {liveInstance && (
                      <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); handleReconnect(); }}>
                        {t('federation:connections.row.reconnect')}
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowReauth((v) => !v); }}>
                      {t('federation:connections.row.reauthenticate')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setShowDeleteIdentity(true); }}>
                      {t('federation:connections.row.deleteIdentity')}
                    </Button>
                  </>
                )}

                {hasIssue && (
                  <>
                    {entry.status === 'unreachable' && liveInstance && (
                      <Button variant="primary" size="sm" onClick={(e) => { e.stopPropagation(); handleReconnect(); }}>
                        {t('federation:connections.row.reconnect')}
                      </Button>
                    )}
                    {entry.status === 'auth_expired' && (
                      <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowReauth((v) => !v); }}>
                        {t('federation:connections.row.reauthenticate')}
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setShowForceRemoveConfirm(true); }}>
                      {t('federation:connections.row.forceRemove')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setShowDeleteIdentity(true); }}>
                      {t('federation:connections.row.deleteIdentity')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Force Remove confirmation dialog */}
      <ConfirmDialog
        isOpen={showForceRemoveConfirm}
        onClose={() => setShowForceRemoveConfirm(false)}
        onConfirm={handleForceRemove}
        title={t('federation:connections.forceRemove.title')}
        description={t('federation:connections.forceRemove.description', { name })}
        confirmLabel={t('federation:connections.forceRemove.confirm')}
        variant="warning"
      />

      {/* Delete Identity dialog */}
      {showDeleteIdentity && (
        <DeleteIdentityDialog
          origin={entry.origin}
          label={name}
          onClose={() => setShowDeleteIdentity(false)}
        />
      )}
    </>
  );
}

// ─── Sorting ────────────────────────────────────────────────────────────────

function sortEntries(entries: FederationRegistryEntry[], sortBy: SortBy): FederationRegistryEntry[] {
  return [...entries].sort((a, b) => {
    switch (sortBy) {
      case 'name': {
        const nameA = (a.label || safeHost(a.origin)).toLowerCase();
        const nameB = (b.label || safeHost(b.origin)).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case 'dateAdded':
        return b.addedAt - a.addedAt;
      case 'lastConnected':
        return (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0);
      default:
        return 0;
    }
  });
}

// ─── Outbound peering gate helpers ──────────────────────────────────────────

function actionLabel(t: FederationT, reason: PeeringTriggerReason): string {
  switch (reason) {
    case 'friend_add': return t('federation:connections.action.friendRequest');
    case 'space_join': return t('federation:connections.action.spaceJoin');
    case 'direct_message': return t('federation:connections.action.directMessage');
    case 'instance_connect': return t('federation:connections.action.instanceConnect');
  }
}

function actionVerbPhrase(t: FederationT, reason: PeeringTriggerReason, target: string): string {
  switch (reason) {
    case 'friend_add': return t('federation:connections.action.friendRequestTo', { target });
    case 'space_join': return t('federation:connections.action.joinSpace', { target });
    case 'direct_message': return t('federation:connections.action.directMessageTo', { target });
    // The target is the remote's origin; the host is what the user typed.
    case 'instance_connect': return t('federation:connections.action.connectTo', { target: safeHost(target) });
  }
}

// ─── Pending peering subscriptions section ──────────────────────────────────

function PendingSubscriptionRow({ subscription }: { subscription: PeeringSubscription }) {
  const { t } = useTranslation(['federation', 'common']);
  const cancelPeeringSubscription = useFederationStore((s) => s.cancelPeeringSubscription);
  const addToast = useUIStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);

  const host = safeHost(subscription.peerOrigin);
  const peerLabel = subscription.peerInstanceName || host;

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelPeeringSubscription(subscription.id);
      addToast(t('federation:connections.pending.cancelled'), 'success', 3000);
    } catch (err) {
      addToast(
        t('federation:connections.pending.cancelFailed', { error: describeError(err) }),
        'warning',
        5000,
      );
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-surface-elevated px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-txt-primary truncate">
          {actionVerbPhrase(t, subscription.triggerReason, subscription.triggerTarget)}
        </div>
        <div className="text-xs text-txt-tertiary truncate">
          <Trans
            t={t}
            i18nKey="federation:connections.pending.onPeer"
            values={{ peer: peerLabel }}
            components={{ peer: <span className="text-txt-secondary" /> }}
          />
          {subscription.peerInstanceName && (
            <span className="ml-1 text-txt-tertiary">({host})</span>
          )}
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={handleCancel} disabled={busy} className="shrink-0">
        {busy ? t('federation:connections.pending.cancelling') : t('common:actions.cancel')}
      </Button>
    </div>
  );
}

function PendingPeeringSubscriptionsSection() {
  const { t } = useTranslation(['federation', 'common']);
  const subscriptions = useFederationStore((s) => s.peeringSubscriptions);

  if (subscriptions.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-txt-secondary mb-1.5">
        {t('federation:connections.pending.title')}
      </div>
      <p className="text-xs text-txt-tertiary mb-2">
        {t('federation:connections.pending.description')}
      </p>
      <div className="space-y-2">
        {subscriptions.map((s) => (
          <PendingSubscriptionRow key={s.id} subscription={s} />
        ))}
      </div>
    </div>
  );
}

// ─── Recent peering outcomes section ────────────────────────────────────────

function notificationAccentClasses(kind: PeeringNotification['kind']): {
  surface: string;
  iconBg: string;
  iconColor: string;
} {
  switch (kind) {
    case 'approved':
      return {
        surface: 'bg-status-ok/[0.06]',
        iconBg: 'bg-status-ok/15',
        iconColor: 'text-status-ok',
      };
    case 'denied':
      return {
        surface: 'bg-status-danger/[0.06]',
        iconBg: 'bg-status-danger/15',
        iconColor: 'text-status-danger',
      };
    case 'expired':
      return {
        surface: 'bg-status-warn/[0.06]',
        iconBg: 'bg-status-warn/15',
        iconColor: 'text-status-warn',
      };
  }
}

function NotificationIcon({ kind, className }: { kind: PeeringNotification['kind']; className: string }) {
  // approved: check, denied: cross, expired: clock
  const name = kind === 'approved' ? 'check' : kind === 'denied' ? 'x' : 'clock';
  return <Icon name={name} size="sm" className={className} />;
}

function PeeringNotificationCard({
  notification,
  onRetry,
}: {
  notification: PeeringNotification;
  onRetry: (notification: PeeringNotification) => void;
}) {
  const { t } = useTranslation(['federation', 'common']);
  const markPeeringNotificationRead = useFederationStore((s) => s.markPeeringNotificationRead);
  const addToast = useUIStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);

  const host = safeHost(notification.peerOrigin);
  const accent = notificationAccentClasses(notification.kind);

  const handleDismiss = async () => {
    setBusy(true);
    try {
      await markPeeringNotificationRead(notification.id);
    } catch (err) {
      addToast(
        t('federation:connections.outcomes.dismissFailed', { error: describeError(err) }),
        'warning',
        5000,
      );
      setBusy(false);
    }
  };

  // Retry is only meaningful on approved notifications, and the gate currently
  // only wires friend_add. space_join and direct_message reach the gate via
  // backend paths that aren't user-initiated end-to-end yet, so we hide Retry
  // for those rather than promise an action we cannot deliver.
  const showRetry =
    notification.kind === 'approved' && notification.triggerReason === 'friend_add';

  let primaryText: string;
  if (notification.kind === 'approved') {
    primaryText = t('federation:connections.outcomes.approved', { host });
  } else if (notification.kind === 'denied') {
    primaryText = t('federation:connections.outcomes.denied', { host });
  } else {
    primaryText = t('federation:connections.outcomes.expired', { host });
  }

  const contextText = t('federation:connections.outcomes.originalAction', {
    action: actionVerbPhrase(t, notification.triggerReason, notification.triggerTarget),
  });

  return (
    <div className={`rounded-xl px-3 py-2.5 ${accent.surface}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${accent.iconBg}`}>
          <NotificationIcon kind={notification.kind} className={accent.iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-txt-primary">{primaryText}</div>
          <div className="text-xs text-txt-tertiary mt-0.5">{contextText}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {showRetry && (
              <Button variant="primary" size="sm" onClick={() => onRetry(notification)}>
                {t('federation:connections.outcomes.retry', { action: actionLabel(t, notification.triggerReason) })}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={busy}>
              {busy ? t('federation:connections.outcomes.dismissing') : t('common:actions.dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentPeeringOutcomesSection() {
  const { t } = useTranslation(['federation', 'common']);
  const notifications = useFederationStore((s) => s.peeringNotifications);
  const markAllPeeringNotificationsRead = useFederationStore((s) => s.markAllPeeringNotificationsRead);
  const setPendingFriendAddPrefill = useFederationStore((s) => s.setPendingFriendAddPrefill);
  const closeModal = useUIStore((s) => s.closeModal);
  const setShowDms = useUIStore((s) => s.setShowDms);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const isMobile = useUIStore((s) => s.isMobile);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();
  const [bulkBusy, setBulkBusy] = useState(false);

  if (notifications.length === 0) return null;

  const handleRetry = (notification: PeeringNotification) => {
    if (notification.triggerReason !== 'friend_add') {
      // Defensive — Retry button is only rendered for friend_add. Bail
      // silently if a future change widens this without updating the handler.
      return;
    }
    // Set the prefill side-channel before navigating so AddFriendTab finds
    // it on its initial render.
    setPendingFriendAddPrefill(notification.triggerTarget);
    // Mark this notification read in the background — the user has acted on
    // it. Use the per-id endpoint so other unread notifications stay visible.
    void useFederationStore.getState().markPeeringNotificationRead(notification.id);
    // Close the settings modal that hosts this panel.
    closeModal();
    if (isMobile) {
      // Mobile: jump to the DMs/Friends tab so MobileShell renders FriendsPage.
      setMobileTab('dms');
    } else {
      // Desktop: route to /channels/@me — AppLayout's effect calls
      // setShowDms(true) for the @me path, and MainContent renders FriendsPage
      // when no DM channel is selected.
      setShowDms(true);
      navigate('/channels/@me');
    }
  };

  const handleDismissAll = async () => {
    setBulkBusy(true);
    try {
      await markAllPeeringNotificationsRead();
    } catch (err) {
      addToast(
        t('federation:connections.outcomes.dismissAllFailed', { error: describeError(err) }),
        'warning',
        5000,
      );
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-txt-secondary">
          {t('federation:connections.outcomes.title')}
        </div>
        {notifications.length > 1 && (
          <Button variant="ghost" size="sm" onClick={handleDismissAll} disabled={bulkBusy}>
            {bulkBusy ? t('federation:connections.outcomes.dismissing') : t('common:actions.dismissAll')}
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {notifications.map((n) => (
          <PeeringNotificationCard key={n.id} notification={n} onRetry={handleRetry} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ConnectedInstances() {
  const { t } = useTranslation(['federation', 'common']);
  const instances = useInstanceStore((s) => s.instances);
  const registry = useInstanceStore((s) => s.registry);
  const user = useAuthStore((s) => s.user);

  const refetchPeeringSubscriptions = useFederationStore((s) => s.refetchPeeringSubscriptions);
  const refetchPeeringNotifications = useFederationStore((s) => s.refetchPeeringNotifications);

  // Hydrate the outbound-peering-gate user surfaces on mount. WS events
  // (peering_subscription_changed / peering_notification_received) will keep
  // them fresh while the panel stays mounted.
  useEffect(() => {
    void refetchPeeringSubscriptions();
    void refetchPeeringNotifications();
  }, [refetchPeeringSubscriptions, refetchPeeringNotifications]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('dateAdded');
  const [expandedOrigins, setExpandedOrigins] = useState<Set<string>>(new Set());

  const toggleExpand = (origin: string) => {
    setExpandedOrigins((prev) => {
      const next = new Set(prev);
      if (next.has(origin)) {
        next.delete(origin);
      } else {
        next.add(origin);
      }
      return next;
    });
  };

  // Convert registry Map to array (hide self-referencing entry — shown as Home Instance above)
  const registryEntries = Array.from(registry.values())
    .filter(entry => !isSelfOrigin(entry.origin));

  // Compute filter counts
  const counts = {
    all: registryEntries.length,
    connected: registryEntries.filter((e) => e.status === 'connected').length,
    disconnected: registryEntries.filter((e) => e.status === 'disconnected').length,
    issues: registryEntries.filter((e) => e.status === 'unreachable' || e.status === 'auth_expired').length,
  };

  // Filter entries
  const filteredEntries = registryEntries.filter((entry) => {
    switch (filter) {
      case 'all': return true;
      case 'connected': return entry.status === 'connected';
      case 'disconnected': return entry.status === 'disconnected';
      case 'issues': return entry.status === 'unreachable' || entry.status === 'auth_expired';
      default: return true;
    }
  });

  // Sort entries
  const sortedEntries = sortEntries(filteredEntries, sortBy);

  // Empty state message
  const emptyMessage = registryEntries.length === 0
    ? null
    : filteredEntries.length === 0
      ? t('federation:connections.filter.noMatch')
      : null;

  return (
    <div className="space-y-5">
      {/* Terminal-state outcomes first — newly resolved requests warrant the
          user's attention (especially approvals they can now retry). */}
      <RecentPeeringOutcomesSection />

      {/* Active waiting state. */}
      <PendingPeeringSubscriptionsSection />

      <div>
      <div className="text-xs font-medium text-txt-secondary mb-1.5">
        {t('federation:connections.title')}
      </div>
      <p className="text-xs text-txt-tertiary mb-2">{t('federation:connections.description')}</p>

      <div className="space-y-2">
        {/* Home instance (always pinned, non-filterable) */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status="connected" />
            <div className="min-w-0">
              <div className="text-sm text-txt-primary font-medium truncate">
                {t('federation:connections.home.title')}
              </div>
              <div className="text-xs text-txt-tertiary truncate">
                {window.location.host}
                {user?.username && (
                  <span className="ml-1">{t('federation:connections.home.asUser', { username: user.username })}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-xs text-txt-tertiary">{t('federation:connections.home.local')}</span>
            {isElectron() && (
              <Button variant="ghost" size="sm" onClick={() => window.backspace?.clearInstanceUrl()}>
                {t('common:actions.change')}
              </Button>
            )}
          </div>
        </div>

        {/* Filter bar (only if registry has entries) */}
        {registryEntries.length > 0 && (
          <RegistryFilterBar
            filter={filter}
            setFilter={setFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            counts={counts}
          />
        )}

        {/* Registry rows */}
        {sortedEntries.length > 0 && (
          <div className="space-y-2">
            {sortedEntries.map((entry) => (
              <RegistryRow
                key={entry.origin}
                entry={entry}
                expanded={expandedOrigins.has(entry.origin)}
                onToggleExpand={() => toggleExpand(entry.origin)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {emptyMessage && (
          <div className="text-xs text-txt-tertiary py-2">{emptyMessage}</div>
        )}

        {registryEntries.length === 0 && !showAddForm && (
          <div className="text-xs text-txt-tertiary py-2">
            {t('federation:connections.empty')}
          </div>
        )}

        {/* Add instance button / flow */}
        {showAddForm ? (
          <AddInstanceFlow onDone={() => setShowAddForm(false)} />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full h-[34px] text-sm text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover rounded-lg border border-dashed border-border-soft transition-colors duration-fast"
          >
            {t('federation:connections.addButton')}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

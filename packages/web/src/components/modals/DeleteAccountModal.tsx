import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { api } from '../../api/client';
import { describeError } from '../../i18n/errors';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { deleteAccountOnRemotes, type FederationOpResult } from '../../utils/federationOps';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'warning' | 'confirm' | 'federation' | 'complete';

interface OwnedSpaceInfo {
  id: string;
  name: string;
  members: { userId: string; username: string; displayName: string | null }[];
  action: 'none' | 'transfer' | 'delete';
  transferTo: string;
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const { t } = useTranslation(['settings', 'common']);
  const user = useAuthStore((s) => s.user);
  const instances = useInstanceStore((s) => s.instances);
  const spaces = useSpaceStore((s) => s.spaces);

  const [step, setStep] = useState<Step>('warning');
  const [ownedSpaces, setOwnedSpaces] = useState<OwnedSpaceInfo[]>([]);
  const [confirmUsername, setConfirmUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [federationResults, setFederationResults] = useState<FederationOpResult[]>([]);
  const [deletionComplete, setDeletionComplete] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('warning');
      setConfirmUsername('');
      setConfirmPassword('');
      setError('');
      setIsLoading(false);
      setFederationResults([]);
      setDeletionComplete(false);

      // Build owned spaces list and fetch members for each
      if (user) {
        const owned = spaces.filter(s => s.ownerId === user.id);
        if (owned.length > 0) {
          Promise.all(
            owned.map(async (s) => {
              try {
                const members = await api.spaces.members(s.id);
                return {
                  id: s.id,
                  name: s.name,
                  members: members
                    .filter(m => m.userId !== user.id)
                    .map(m => ({
                      userId: m.userId,
                      username: m.user.username,
                      displayName: m.user.displayName,
                    })),
                  action: 'none' as const,
                  transferTo: '',
                };
              } catch {
                return {
                  id: s.id,
                  name: s.name,
                  members: [] as OwnedSpaceInfo['members'],
                  action: 'none' as const,
                  transferTo: '',
                };
              }
            })
          ).then(setOwnedSpaces);
        }
      }
    }
  }, [isOpen, user]);

  // Auto-redirect after deletion — must be before early return to maintain hooks order
  useEffect(() => {
    if (deletionComplete && step === 'complete') {
      const timer = setTimeout(() => {
        localStorage.removeItem('backspace_token');
        window.location.href = '/login';
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [deletionComplete, step]);

  if (!isOpen || !user) return null;

  const hasRemotes = instances.filter(i => i.status === 'connected').length > 0;
  const allOwnedHandled = ownedSpaces.every(s => s.action !== 'none');

  const handleSpaceAction = (spaceId: string, action: 'transfer' | 'delete') => {
    setOwnedSpaces(prev => prev.map(s =>
      s.id === spaceId ? { ...s, action, transferTo: action === 'transfer' ? s.transferTo : '' } : s
    ));
  };

  const handleTransferTo = (spaceId: string, userId: string) => {
    setOwnedSpaces(prev => prev.map(s =>
      s.id === spaceId ? { ...s, transferTo: userId } : s
    ));
  };

  const handleContinueFromWarning = async () => {
    setError('');
    setIsLoading(true);

    try {
      // Process owned spaces
      for (const space of ownedSpaces) {
        if (space.action === 'transfer' && space.transferTo) {
          await api.spaces.transferOwnership(space.id, space.transferTo);
        } else if (space.action === 'delete') {
          await api.spaces.delete(space.id);
        }
      }
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('settings:account.deletion.errors.spacesFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (confirmUsername !== user.username) {
      setError(t('settings:account.deletion.errors.usernameMismatch'));
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      if (hasRemotes) {
        setStep('federation');
        // Delete on remotes first
        const results = await deleteAccountOnRemotes();
        setFederationResults(results);
        // Then delete home account
        await api.users.deleteAccount({ password: confirmPassword, username: confirmUsername });
        setDeletionComplete(true);
        setStep('complete');
      } else {
        // No remotes — direct delete via API (don't clear auth state yet — let the modal show "complete")
        await api.users.deleteAccount({ password: confirmPassword, username: confirmUsername });
        setDeletionComplete(true);
        setStep('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('settings:account.deletion.errors.deleteFailed'));
      if (step === 'federation') {
        // Stay on federation step so user can see results
      } else {
        setStep('confirm');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAnyway = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.users.deleteAccount({ password: confirmPassword, username: confirmUsername });
      setDeletionComplete(true);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('settings:account.deletion.errors.deleteFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-surface-overlay" onClick={step !== 'complete' ? onClose : undefined} />
      <div className="relative max-w-lg w-full mx-4 max-h-[calc(calc(100*var(--app-vh))-2rem)] flex flex-col glass-modal rounded-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 flex-shrink-0">
          <h2 className="text-lg font-semibold text-txt-primary">{t('settings:account.deletion.title')}</h2>
          {step !== 'complete' && (
            <IconButton icon="x" size="sm" label={t('common:actions.close')} onClick={onClose} />
          )}
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Step 1: Warning & Space Handling */}
          {step === 'warning' && (
            <>
              <div className="bg-status-danger/10 rounded-lg p-3.5">
                <p className="text-sm text-txt-primary font-medium mb-2">{t('settings:account.deletion.warning.headline')}</p>
                <ul className="text-xs text-txt-secondary space-y-1">
                  <li>- {t('settings:account.deletion.warning.spaces')}</li>
                  <li>- {t('settings:account.deletion.warning.friends')}</li>
                  <li>- {t('settings:account.deletion.warning.dms')}</li>
                  <li>- {t('settings:account.deletion.warning.messages')}</li>
                </ul>
              </div>

              {ownedSpaces.length > 0 && (
                <div>
                  <p className="text-sm text-txt-primary font-medium mb-2">
                    {t('settings:account.deletion.ownedSpaces.prompt', { count: ownedSpaces.length })}
                  </p>
                  <div className="space-y-3">
                    {ownedSpaces.map(space => (
                      <div key={space.id} className="rounded-xl bg-surface-elevated p-3">
                        <div className="text-sm font-medium text-txt-primary mb-2">{space.name}</div>
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => handleSpaceAction(space.id, 'transfer')}
                            className={`h-7 px-2.5 text-compact font-medium rounded-lg transition-colors duration-fast ${
                              space.action === 'transfer'
                                ? 'bg-accent-tone/[0.16] text-accent-tone shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]'
                                : 'text-txt-secondary shadow-[inset_0_0_0_1px_var(--glass-border)] hover:text-txt-primary'
                            }`}
                          >
                            {t('settings:account.deletion.ownedSpaces.transfer')}
                          </button>
                          <button
                            onClick={() => handleSpaceAction(space.id, 'delete')}
                            className={`h-7 px-2.5 text-compact font-medium rounded-lg transition-colors duration-fast ${
                              space.action === 'delete'
                                ? 'bg-accent-tone/[0.16] text-accent-tone shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]'
                                : 'text-txt-secondary shadow-[inset_0_0_0_1px_var(--glass-border)] hover:text-txt-primary'
                            }`}
                          >
                            {t('settings:account.deletion.ownedSpaces.delete')}
                          </button>
                        </div>
                        {space.action === 'transfer' && (
                          <select
                            value={space.transferTo}
                            onChange={(e) => handleTransferTo(space.id, e.target.value)}
                            className="input-standard w-full"
                          >
                            <option value="">{t('settings:account.deletion.ownedSpaces.selectOwner')}</option>
                            {space.members.map(m => (
                              <option key={m.userId} value={m.userId}>
                                {m.displayName || m.username}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">{error}</div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="danger-solid"
                  onClick={ownedSpaces.length > 0 ? handleContinueFromWarning : () => setStep('confirm')}
                  disabled={
                    isLoading ||
                    (ownedSpaces.length > 0 && (!allOwnedHandled || ownedSpaces.some(s => s.action === 'transfer' && !s.transferTo)))
                  }
                >
                  {isLoading ? t('settings:account.deletion.processing') : t('common:actions.continue')}
                </Button>
              </div>
            </>
          )}

          {/* Step 2: Confirmation */}
          {step === 'confirm' && (
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmDelete(); }} className="space-y-4">
              <div className="bg-status-danger/10 rounded-lg p-3.5">
                <p className="text-sm text-status-danger font-medium">{t('settings:account.deletion.confirm.permanent')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">
                  <Trans
                    t={t}
                    i18nKey="settings:account.deletion.confirm.usernamePrompt"
                    values={{ username: user.username }}
                    components={{ username: <span className="font-mono text-txt-primary" /> }}
                  />
                </label>
                <input
                  type="text"
                  value={confirmUsername}
                  onChange={(e) => setConfirmUsername(e.target.value)}
                  className="input-danger w-full"
                  placeholder={user.username}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">{t('common:labels.password')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-danger w-full"
                  placeholder={t('settings:account.deletion.confirm.passwordPlaceholder')}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">{error}</div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setStep('warning'); setError(''); }}>
                  {t('common:actions.back')}
                </Button>
                <Button
                  variant="danger-solid"
                  type="submit"
                  disabled={isLoading || confirmUsername !== user.username || !confirmPassword}
                >
                  {isLoading ? t('settings:account.deletion.confirm.deleting') : t('settings:account.deletion.confirm.submit')}
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Federation Progress */}
          {step === 'federation' && (
            <>
              <p className="text-sm text-txt-secondary">{t('settings:account.deletion.federation.removing')}</p>
              <div className="space-y-2">
                {instances.filter(i => i.status === 'connected').map(inst => {
                  const result = federationResults.find(r => r.origin === inst.origin);
                  return (
                    <div key={inst.origin} className="flex items-center justify-between px-3 h-10 rounded-lg bg-surface-elevated">
                      <span className="text-sm text-txt-primary">{inst.label || new URL(inst.origin).host}</span>
                      {!result ? (
                        <svg className="animate-spin w-4 h-4 text-txt-tertiary" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : result.success ? (
                        <Icon name="check" size="sm" className="text-status-ok" />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Icon name="x" size="sm" className="text-status-danger" />
                          <span className="text-xs text-status-danger">{result.error}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">{error}</div>
              )}

              {federationResults.length > 0 && !deletionComplete && (
                <div className="flex justify-end">
                  <Button variant="danger-solid" onClick={handleDeleteAnyway} disabled={isLoading}>
                    {isLoading ? t('settings:account.deletion.confirm.deleting') : t('settings:account.deletion.federation.deleteAnyway')}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-elevated text-txt-tertiary">
                <Icon name="check" size="lg" />
              </div>
              <p className="text-lg font-semibold text-txt-primary mb-1">{t('settings:account.deletion.complete.title')}</p>
              <p className="text-sm text-txt-tertiary">{t('settings:account.deletion.complete.redirecting')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

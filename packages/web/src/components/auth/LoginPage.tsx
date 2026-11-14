import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { api, RateLimitError } from '../../api/client';
import type { InstanceInfoResponse } from '@backspace/shared';
import { SourceCodeLink } from '../ui/SourceCodeLink';
import { Button } from '../ui/Button';
import { Mascot } from '../ui/Mascot';
import { describeError } from '../../i18n/errors';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  // AGPL § 13: anonymous users must be able to reach the source of the running
  // version. Fetched from the unauthenticated public info endpoint.
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfoResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.instance.info()
      .then((info) => { if (!cancelled) setInstanceInfo(info); })
      .catch(() => { /* Non-critical — link is simply omitted if unreachable. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('auth:validation.usernameRequired'));
      return;
    }
    if (!password) {
      setError(t('auth:validation.passwordRequired'));
      return;
    }

    try {
      await login(username.trim(), password);
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        navigate(redirect);
      } else {
        navigate('/channels/@me');
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRetryAfter(err.retryAfter);
        setError('');
      } else {
        setError(err instanceof Error ? describeError(err) : t('auth:login.failed'));
      }
    }
  };

  const isDisabled = isLoading || retryAfter > 0;

  return (
    <div className="h-full overflow-y-auto flex flex-col items-center bg-surface-base relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent-primary)/0.06)_0%,transparent_50%)]" />
      <div className="my-auto flex-shrink-0 w-full max-w-[480px] bg-surface-channel border border-border-hard rounded-2xl p-8 relative z-raised">
        <div className="text-center mb-6">
          <Mascot state={isLoading ? 'look' : retryAfter > 0 ? 'dnd' : 'idle'} className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-txt-primary">{t('auth:login.title')}</h1>
          <p className="text-txt-tertiary mt-1">{t('auth:login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {retryAfter > 0 && (
            <div className="mb-4 px-3 py-2.5 bg-status-warn/10 rounded-lg text-sm">
              <p className="font-medium text-status-warn">{t('auth:login.rateLimited.title')}</p>
              <p className="text-txt-secondary mt-0.5">{t('auth:login.rateLimited.retryIn', { seconds: retryAfter })}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-status-danger/10 rounded-lg text-status-danger text-sm">
              {error}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              {t('common:labels.username')} <span className="text-status-danger">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-standard w-full py-2.5"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              {t('common:labels.password')} <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-standard w-full py-2.5"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={isDisabled}>
            {retryAfter > 0
              ? t('auth:login.rateLimited.retryIn', { seconds: retryAfter })
              : isLoading
                ? t('auth:login.submitting')
                : t('common:actions.logIn')}
          </Button>

          <p className="mt-3 text-sm text-txt-tertiary">
            <Trans
              t={t}
              i18nKey="auth:login.registerPrompt"
              components={{
                actionLink: <Link to={`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="text-txt-link hover:underline" />,
              }}
            />
          </p>
        </form>

        {instanceInfo && (
          <div className="mt-6 pt-4 border-t border-border-hard flex justify-center">
            <SourceCodeLink sourceCodeUrl={instanceInfo.sourceCodeUrl} version={instanceInfo.version} commit={instanceInfo.commit} />
          </div>
        )}
      </div>
    </div>
  );
}

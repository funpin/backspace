import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useSpaceStore, NotConnectedError } from '../stores/spaceStore';
import { useInstanceStore, RemoteLoginRequiredError, type RemoteLoginReason } from '../stores/instanceStore';
import { api, createApiClient } from '../api/client';
import { parseInviteInput, buildInstanceJoinUrl } from '../utils/inviteParser';
import { Avatar } from './ui/Avatar';
import type { InvitePreview } from '@backspace/shared';
import { describeError } from '../i18n/errors';
import { isAlreadyMemberError, isJoinRequestPendingError, isNotRequestableError, JoinRequestRequiredError } from '../utils/joinErrors';
import { sendInviteJoinRequest, type InviteRequestOutcome } from '../utils/inviteJoinRequest';
import { FallbackNotice } from './modals/RemotePasswordStep';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Mascot } from './ui/Mascot';

/**
 * A router link that looks like a `Button`: the primary and secondary
 * variants at the large size, full width. `Button` renders a `<button>`, and
 * these targets are routes, so the classes are spelt out here.
 */
const LINK_BUTTON_BASE =
  'flex w-full h-10 px-4 items-center justify-center rounded-lg text-sm transition-[background-color,color] duration-fast ease-out';
const LINK_BUTTON_PRIMARY =
  `${LINK_BUTTON_BASE} bg-accent-primary text-on-accent font-semibold hover:bg-accent-primary-hover active:bg-accent-primary-active`;
const LINK_BUTTON_SECONDARY =
  `${LINK_BUTTON_BASE} bg-surface-elevated text-txt-primary font-medium shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-border-soft`;

/** The centred panel every state of the page sits in. */
const PANEL = 'my-auto flex-shrink-0 w-full max-w-[480px] bg-surface-channel border border-border-hard rounded-2xl p-8 relative z-raised';

type JoinPhase = 'preview' | 'connect' | 'fallback' | 'other-instance' | 'already-member' | 'request-sent';

/**
 * What the page's action does. `request` sends a join request, for a space
 * joined by request: its link admits no one, a manager approves each
 * request. Read from the preview's visibility, and switched when the server
 * answers otherwise (an instance whose preview has no visibility, or a space
 * whose visibility changed after the page loaded).
 */
type JoinAction = 'join' | 'request';

export function JoinPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { inviteCode: rawInviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loadUser = useAuthStore((s) => s.loadUser);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);
  const joinByCode = useSpaceStore((s) => s.joinByCode);
  const connectToRemote = useInstanceStore((s) => s.connectToRemote);
  const loginToRemote = useInstanceStore((s) => s.loginToRemote);

  // Hydrate auth store when token exists — useAuth() can't be used here because
  // it hard-redirects to /login when there's no token, and JoinPage is a public route.
  useEffect(() => {
    if (token && !user && !isAuthLoading) {
      loadUser();
    }
  }, [token, user, isAuthLoading, loadUser]);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  const [phase, setPhase] = useState<JoinPhase>('preview');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Join request state, for a space joined by request
  const [action, setAction] = useState<JoinAction>('join');
  const [requestSpaceId, setRequestSpaceId] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestOutcome, setRequestOutcome] = useState<InviteRequestOutcome>('sent');

  // Federation connect state
  const [password, setPassword] = useState('');
  const [fallbackUsername, setFallbackUsername] = useState('');
  const [fallbackReason, setFallbackReason] = useState<RemoteLoginReason>('credential-refused');
  const [fallbackPassword, setFallbackPassword] = useState('');

  // Other instance state
  const [otherDomain, setOtherDomain] = useState('');

  // Parse the invite code from the URL
  const parsed = useMemo(() => {
    if (!rawInviteCode) return null;
    try {
      return parseInviteInput(rawInviteCode);
    } catch {
      return null;
    }
  }, [rawInviteCode]);

  // Fetch preview on mount
  useEffect(() => {
    if (!rawInviteCode) {
      setPreviewError(t('auth:join.errors.noCode'));
      setIsLoadingPreview(false);
      return;
    }

    if (!parsed) {
      setPreviewError(t('auth:join.errors.invalidCode'));
      setIsLoadingPreview(false);
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError('');

    const fetchPreview = async () => {
      try {
        let client;
        if (parsed.origin) {
          client = createApiClient(parsed.origin, () => null);
        } else {
          client = api;
        }
        const data = await client.spaces.invitePreview(parsed.code);
        setPreview(data);
        setAction(data.visibility === 'request' ? 'request' : 'join');
        setRequestSpaceId(data.spaceId);
      } catch (err) {
        setPreviewError(err instanceof Error ? describeError(err) : t('auth:join.errors.loadFailed'));
      } finally {
        setIsLoadingPreview(false);
      }
    };

    fetchPreview();
  }, [rawInviteCode, parsed]);

  /**
   * Run the page's action against the invite's instance: send the join
   * request, or join by the code. Throws what the caller handles
   * (`NotConnectedError`, `RemoteLoginRequiredError`, a refusal). A request
   * to a space that no longer takes requests joins by the code instead, a
   * join the server answers with `join_request_required` switches the page
   * to the request action for the user to send, and one it answers with
   * `join_request_pending` shows the request that is already waiting.
   */
  const proceed = async (): Promise<void> => {
    if (!parsed) return;
    if (action === 'request' && requestSpaceId) {
      try {
        const outcome = await sendInviteJoinRequest(requestSpaceId, parsed.origin ?? '', requestMessage.trim() || undefined);
        setRequestOutcome(outcome);
        setPhase('request-sent');
        return;
      } catch (err) {
        if (!isNotRequestableError(err)) throw err;
        setAction('join');
      }
    }
    try {
      const space = await joinByCode(parsed.code, parsed.origin || undefined);
      navigate(`/channels/${space.id}`);
    } catch (err) {
      if (isJoinRequestPendingError(err)) {
        setAction('request');
        setRequestOutcome('pending');
        setPhase('request-sent');
        return;
      }
      if (!(err instanceof JoinRequestRequiredError)) throw err;
      setAction('request');
      setRequestSpaceId(err.spaceId);
      setPhase('preview');
    }
  };

  // Join (or request) handler
  const handleJoin = async () => {
    if (!parsed) return;
    setError('');
    setIsJoining(true);
    try {
      await proceed();
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setPhase('connect');
        setError('');
      } else {
        if (isAlreadyMemberError(err)) {
          setPhase('already-member');
          setError('');
        } else {
          setError(err instanceof Error ? describeError(err) : t('auth:join.errors.joinFailed'));
        }
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Federation connect handler
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.origin) return;
    setError('');
    setIsJoining(true);
    try {
      await connectToRemote(parsed.origin, password, user?.displayName || undefined);
      await proceed();
    } catch (err) {
      if (err instanceof RemoteLoginRequiredError) {
        setPhase('fallback');
        setFallbackUsername(err.remoteUsername);
        setFallbackReason(err.reason);
        setFallbackPassword('');
        setError('');
      } else {
        if (isAlreadyMemberError(err)) {
          setPhase('already-member');
          setError('');
        } else {
          setError(err instanceof Error ? describeError(err) : t('auth:join.errors.connectFailed'));
        }
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Fallback login handler
  const handleFallbackLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.origin) return;
    setError('');
    setIsJoining(true);
    try {
      await loginToRemote(parsed.origin, fallbackUsername, fallbackPassword);
      await proceed();
    } catch (err) {
      if (isAlreadyMemberError(err)) {
        setPhase('already-member');
        setError('');
      } else {
        setError(err instanceof Error ? describeError(err) : t('auth:join.errors.loginFailed'));
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Other instance redirect
  const handleOtherInstanceRedirect = (e: React.FormEvent) => {
    e.preventDefault();
    const domain = otherDomain.trim();
    if (!domain) return;

    // Build the qualified invite code: code@originHost
    // If the invite is already qualified (arrived via redirect), preserve the original origin
    const originHost = parsed?.origin ? new URL(parsed.origin).host : window.location.host;
    const code = parsed?.code || rawInviteCode || '';
    const qualifiedCode = `${code}@${originHost}`;

    // The domain is typed here, so it is checked before it becomes a URL:
    // a path, a query, a fragment or a userinfo section in that field would
    // send the browser somewhere other than the instance the user named.
    const targetUrl = buildInstanceJoinUrl(domain, qualifiedCode);
    if (!targetUrl) {
      setError(t('auth:join.errors.domainOnly'));
      return;
    }
    window.location.href = targetUrl;
  };

  let hostDisplay = '';
  try {
    if (parsed?.origin) hostDisplay = new URL(parsed.origin).host;
  } catch { /* ignore */ }

  const redirectParam = rawInviteCode ? `?redirect=/join/${encodeURIComponent(rawInviteCode)}` : '';

  // Loading state
  if (isLoadingPreview) {
    return (
      <div className="h-full overflow-y-auto flex flex-col items-center bg-surface-base relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent-primary)/0.06)_0%,transparent_50%)]" />
        <div className="my-auto flex-shrink-0 text-center relative z-raised">
          <svg className="animate-spin w-10 h-10 text-accent-tone mx-auto mb-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-txt-tertiary">{t('auth:join.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state — invalid/expired invite
  if (previewError || !preview) {
    return (
      <div className="h-full overflow-y-auto flex flex-col items-center bg-surface-base relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent-primary)/0.06)_0%,transparent_50%)]" />
        <div className={`${PANEL} text-center`}>
          <Mascot state="offline" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-txt-primary mb-2">{t('auth:join.invalid.title')}</h1>
          <p className="text-txt-secondary text-sm mb-6">
            {previewError || t('auth:join.invalid.description')}
          </p>
          {token ? (
            <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/channels/@me')}>
              {t('auth:join.invalid.backToApp')}
            </Button>
          ) : (
            <Link to="/login" className={LINK_BUTTON_PRIMARY}>
              {t('common:actions.logIn')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Main invite page
  return (
    <div className="h-full overflow-y-auto flex flex-col items-center bg-surface-base relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent-primary)/0.06)_0%,transparent_50%)]" />
      <div className={PANEL}>
        {/* Space preview */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <Avatar
              src={preview.icon ? (parsed?.origin ? `${parsed.origin}/api/uploads/${preview.icon}` : preview.icon) : null}
              name={preview.spaceName}
              size={72}
              userId={preview.spaceId}
              avatarColor={preview.avatarColor}
              palette="space"
            />
          </div>
          <p className="text-xs font-medium text-txt-tertiary mb-1">{action === 'request' ? t('auth:join.invitedToRequest') : t('auth:join.invitedTo')}</p>
          <h1 className="text-2xl font-semibold text-txt-primary">{preview.spaceName}</h1>
          {preview.description && (
            <p className="text-txt-secondary text-sm mt-2">{preview.description}</p>
          )}
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-txt-tertiary">
            <span className="flex items-center gap-1 tabular-nums">
              <Icon name="users" size="xs" />
              {t('auth:join.memberCount', { count: preview.memberCount })}
            </span>
            <span>{preview.instanceName}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 bg-status-danger/10 rounded-lg text-status-danger text-sm">
            {error}
          </div>
        )}

        {/* Phase: preview — main join UI */}
        {phase === 'preview' && (
          <>
            {action === 'request' && (
              <p className="mb-3 text-center text-txt-secondary text-sm">{t('auth:join.request.notice')}</p>
            )}
            {token && user ? (
              /* Authenticated user — show identity card + join */
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-surface-elevated rounded-xl p-3">
                  <Avatar
                    src={user.avatar || null}
                    name={user.displayName || user.username}
                    size={40}
                    avatarColor={user.avatarColor}
                  />
                  <div className="min-w-0">
                    <p className="text-txt-primary font-medium text-sm truncate">{user.displayName || user.username}</p>
                    <p className="text-txt-tertiary text-xs truncate">@{user.username}</p>
                  </div>
                </div>
                {action === 'request' && (
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder={t('auth:join.request.messagePlaceholder')}
                    aria-label={t('auth:join.request.messageLabel')}
                    maxLength={JOIN_REQUEST_MESSAGE_MAX}
                    rows={2}
                    disabled={isJoining}
                    className="input-standard w-full py-2 text-sm resize-none"
                  />
                )}
                <Button variant="primary" size="lg" fullWidth onClick={handleJoin} disabled={isJoining}>
                  {action === 'request'
                    ? (isJoining ? t('auth:join.request.sending') : t('auth:join.request.askAs', { name: user.displayName || user.username }))
                    : (isJoining ? t('auth:join.joining') : t('auth:join.joinAs', { name: user.displayName || user.username }))}
                </Button>
                <p className="text-center text-xs text-txt-tertiary">
                  {t('auth:join.notYou')}{' '}
                  <button
                    type="button"
                    onClick={() => { logout(); navigate(`/login${redirectParam}`); }}
                    className="text-txt-link hover:underline"
                  >
                    {t('auth:join.switchAccount')}
                  </button>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => { setPhase('other-instance'); setError(''); }}
                    className="text-txt-link hover:underline"
                  >
                    {t('auth:join.otherInstance')}
                  </button>
                </p>
              </div>
            ) : token ? (
              /* Token exists but user still loading */
              <Button variant="primary" size="lg" fullWidth disabled>
                {t('common:states.loading')}
              </Button>
            ) : (
              /* Unauthenticated user */
              <div className="space-y-3">
                <Link to={`/login${redirectParam}`} className={LINK_BUTTON_PRIMARY}>
                  {action === 'request' ? t('auth:join.request.loginToAsk') : t('auth:join.loginToJoin')}
                </Link>
                <Link to={`/register${redirectParam}`} className={LINK_BUTTON_SECONDARY}>
                  {t('auth:join.createAccount')}
                </Link>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border-hard" />
                  <span className="text-xs text-txt-tertiary">{t('common:labels.or')}</span>
                  <div className="flex-1 h-px bg-border-hard" />
                </div>

                <Button variant="secondary" size="lg" fullWidth onClick={() => { setPhase('other-instance'); setError(''); }}>
                  {t('auth:join.otherInstance')}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Phase: other-instance — domain input for federation redirect */}
        {phase === 'other-instance' && (
          <form onSubmit={handleOtherInstanceRedirect}>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              {t('auth:join.domain.label')}
            </label>
            <div className="flex gap-2 mb-1.5">
              <input
                type="text"
                value={otherDomain}
                onChange={(e) => setOtherDomain(e.target.value)}
                placeholder={t('auth:join.domain.placeholder')}
                className="input-standard flex-1 py-2.5"
                autoFocus
              />
              <Button type="submit" variant="primary" size="lg" disabled={!otherDomain.trim()}>
                {t('auth:join.domain.go')}
              </Button>
            </div>
            <p className="text-xs text-txt-tertiary mb-4">
              {t('auth:join.domain.redirectNote')}
            </p>
            <Button variant="ghost" size="lg" onClick={() => { setPhase('preview'); setOtherDomain(''); setError(''); }}>
              {t('common:actions.back')}
            </Button>
          </form>
        )}

        {/* Phase: connect — password prompt for federation */}
        {phase === 'connect' && (
          <form onSubmit={handleConnect}>
            <input type="text" autoComplete="username" value={user?.username || ''} readOnly tabIndex={-1} className="sr-only" />
            {/* Identity card */}
            <div className="flex items-center gap-3 bg-surface-elevated rounded-xl p-3 mb-3">
              <Avatar
                src={user?.avatar || null}
                name={user?.displayName || user?.username || '?'}
                size={40}
                avatarColor={user?.avatarColor}
              />
              <div className="min-w-0">
                <p className="text-txt-primary font-medium text-sm truncate">{user?.displayName || user?.username}</p>
                <p className="text-txt-tertiary text-xs truncate">@{user?.username}</p>
              </div>
            </div>
            <p className="text-txt-tertiary text-xs mb-4">
              <Trans
                t={t}
                i18nKey="auth:join.connect.connectingTo"
                values={{ host: hostDisplay }}
                components={{ host: <span className="text-txt-secondary font-medium" /> }}
              />
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">
                {t('common:labels.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth:join.connect.passwordPlaceholder')}
                className="input-standard w-full py-2.5"
                disabled={isJoining}
                autoFocus
                autoComplete="current-password"
              />
              <p className="text-xs text-txt-tertiary mt-1">
                {t('auth:join.connect.passwordNote', { host: hostDisplay })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" onClick={() => { setPhase('preview'); setPassword(''); setError(''); }}>
                {t('common:actions.back')}
              </Button>
              <Button type="submit" variant="primary" size="lg" disabled={isJoining || !password} className="flex-1">
                {isJoining
                  ? t('auth:join.connect.submitting')
                  : action === 'request' ? t('auth:join.connect.submitRequest') : t('auth:join.connect.submit')}
              </Button>
            </div>
          </form>
        )}

        {/* Phase: already-member — green success with auto-redirect */}
        {phase === 'already-member' && preview && (
          <AlreadyMemberCard spaceName={preview.spaceName} spaceId={preview.spaceId} navigate={navigate} />
        )}

        {/* Phase: request-sent: the join request is with the space's managers */}
        {phase === 'request-sent' && preview && (
          <RequestSentCard
            spaceName={preview.spaceName}
            outcome={requestOutcome}
            onDone={() => navigate('/channels/@me')}
          />
        )}

        {/* Phase: fallback — the account's own credentials on the remote */}
        {phase === 'fallback' && (
          <form onSubmit={handleFallbackLogin}>
            <FallbackNotice reason={fallbackReason} host={hostDisplay} className="mb-3" />
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">{t('common:labels.username')}</label>
                <input
                  type="text"
                  value={fallbackUsername}
                  onChange={(e) => setFallbackUsername(e.target.value)}
                  placeholder={t('auth:join.fallback.usernamePlaceholder')}
                  className="input-standard w-full py-2.5"
                  disabled={isJoining}
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">{t('auth:join.fallback.passwordLabel')}</label>
                <input
                  type="password"
                  value={fallbackPassword}
                  onChange={(e) => setFallbackPassword(e.target.value)}
                  placeholder={t('auth:join.fallback.passwordPlaceholder')}
                  className="input-standard w-full py-2.5"
                  disabled={isJoining}
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" onClick={() => { setPhase('connect'); setFallbackPassword(''); setError(''); }}>
                {t('common:actions.back')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isJoining || !fallbackUsername || !fallbackPassword}
                className="flex-1"
              >
                {isJoining
                  ? t('auth:join.fallback.submitting')
                  : action === 'request' ? t('auth:join.fallback.submitRequest') : t('auth:join.fallback.submit')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** The longest note a join request keeps; the server cuts anything longer. */
const JOIN_REQUEST_MESSAGE_MAX = 500;

function RequestSentCard({ spaceName, outcome, onDone }: { spaceName: string; outcome: InviteRequestOutcome; onDone: () => void }) {
  const { t } = useTranslation(['auth']);
  return (
    <div className="text-center" role="status">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-status-ok/[0.14] text-status-ok flex items-center justify-center">
        <Icon name="check" size="lg" />
      </div>
      <p className="text-txt-primary font-medium mb-1">
        {outcome === 'sent'
          ? t('auth:join.requestSent.title', { space: spaceName })
          : t('auth:join.requestSent.pendingTitle', { space: spaceName })}
      </p>
      <p className="text-txt-tertiary text-xs mb-4">{t('auth:join.requestSent.body')}</p>
      <Button variant="primary" size="lg" fullWidth onClick={onDone}>
        {t('auth:join.invalid.backToApp')}
      </Button>
    </div>
  );
}

function AlreadyMemberCard({ spaceName, spaceId, navigate }: { spaceName: string; spaceId: string; navigate: (path: string) => void }) {
  const { t } = useTranslation(['auth']);
  useEffect(() => {
    const timer = setTimeout(() => navigate(`/channels/${spaceId}`), 2000);
    return () => clearTimeout(timer);
  }, [spaceId, navigate]);

  return (
    <div className="text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-status-ok/[0.14] text-status-ok flex items-center justify-center">
        <Icon name="check" size="lg" />
      </div>
      <p className="text-txt-primary font-medium mb-1">{t('auth:join.alreadyMember.title', { space: spaceName })}</p>
      <p className="text-txt-tertiary text-xs mb-4">{t('auth:join.alreadyMember.redirecting')}</p>
      <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/channels/${spaceId}`)}>
        {t('auth:join.alreadyMember.go', { space: spaceName })}
      </Button>
    </div>
  );
}

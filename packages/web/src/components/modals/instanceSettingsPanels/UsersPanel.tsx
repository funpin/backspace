import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useFormatters } from '../../../i18n/formatters';
import { describeError } from '../../../i18n/errors';
import { api } from '../../../api/client';
import { Avatar } from '../../ui/Avatar';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Tag } from '../../ui/Tag';
import { useAuthStore } from '../../../stores/authStore';
import type { AdminUser, AdminUserListResponse } from '@backspace/shared';

/**
 * A row action that cannot be used still explains itself on hover (its title
 * says why), so the disabled state keeps pointer events and only loses the
 * hover ground.
 */
const DISABLED_ROW_ACTION = 'disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:hover:!bg-transparent';

export function UsersPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const currentUser = useAuthStore((s) => s.user);
  const f = useFormatters();
  const [data, setData] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [instanceFilter, setInstanceFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [joinedAfter, setJoinedAfter] = useState('');
  const [joinedBefore, setJoinedBefore] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [instances, setInstances] = useState<string[]>([]);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: 'demote' | 'delete'; user: AdminUser } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Temp password display
  const [tempPassword, setTempPassword] = useState<{ userId: string; password: string } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.admin.listInstances().then(({ instances: inst }) => setInstances(inst)).catch(() => {});
  }, []);

  const filtersRef = useRef({ homeInstance: '', role: '', joinedAfter: '', joinedBefore: '', sort: 'newest' });
  filtersRef.current = { homeInstance: instanceFilter, role: roleFilter, joinedAfter, joinedBefore, sort: sortBy };

  const fetchUsers = useCallback(async (
    q: string, p: number, deleted: boolean,
    opts?: { homeInstance?: string; role?: string; joinedAfter?: string; joinedBefore?: string; sort?: string }
  ) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.listUsers({
        q: q || undefined, page: p, pageSize, showDeleted: deleted,
        homeInstance: opts?.homeInstance || undefined,
        role: opts?.role || undefined,
        joinedAfter: opts?.joinedAfter || undefined,
        joinedBefore: opts?.joinedBefore || undefined,
        sort: opts?.sort || undefined,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('admin:users.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers(query, page, showDeleted, filtersRef.current);
  }, [fetchUsers, page, showDeleted, instanceFilter, roleFilter, joinedAfter, joinedBefore, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchUsers(value, 1, showDeleted, filtersRef.current);
    }, 300);
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    if (user.isAdmin) {
      // Demoting — confirm first
      setConfirmAction({ type: 'demote', user });
      return;
    }
    // Promoting — no confirm needed
    setError('');
    try {
      await api.admin.setUserRole(user.id, true);
      fetchUsers(query, page, showDeleted, filtersRef.current);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('admin:users.roleFailed'));
    }
  };

  const [resetConfirmUser, setResetConfirmUser] = useState<AdminUser | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleResetPassword = (user: AdminUser) => {
    setResetConfirmUser(user);
  };

  const handleResetConfirm = async () => {
    if (!resetConfirmUser) return;
    setResetLoading(true);
    setError('');
    setTempPassword(null);
    try {
      const result = await api.admin.resetUserPassword(resetConfirmUser.id);
      setTempPassword({ userId: resetConfirmUser.id, password: result.temporaryPassword });
      setResetConfirmUser(null);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('admin:users.resetFailed'));
      setResetConfirmUser(null);
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteUser = (user: AdminUser) => {
    setConfirmAction({ type: 'delete', user });
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    setError('');
    try {
      if (confirmAction.type === 'demote') {
        await api.admin.setUserRole(confirmAction.user.id, false);
      } else {
        await api.admin.deleteUser(confirmAction.user.id);
      }
      setConfirmAction(null);
      fetchUsers(query, page, showDeleted, filtersRef.current);
    } catch (err) {
      setError(err instanceof Error ? describeError(err) : t('admin:users.actionFailed'));
      setConfirmAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const userCountLabel = t('admin:users.count', { count: data?.total ?? 0 });

  const formatDate = (ts: number) => f.formatMediumDate(ts);

  const adminButtonTitle = (user: AdminUser, isFederated: boolean): string => {
    if (user.isAdmin) return t('admin:users.actions.demote');
    if (isFederated) return t('admin:users.actions.federatedNoAdmin');
    return t('admin:users.actions.promote');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-txt-primary">{t('admin:users.title')}</h2>
      <div className="text-xs text-txt-tertiary">
        {t('admin:users.description')}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t('admin:users.searchPlaceholder')}
          className="input-search flex-1"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={instanceFilter}
          onChange={(e) => { setInstanceFilter(e.target.value); setPage(1); }}
          className="input-search text-xs py-1"
        >
          <option value="">{t('admin:users.filters.allInstances')}</option>
          <option value="local">{t('admin:users.filters.localOnly')}</option>
          {instances.map((inst) => (
            <option key={inst} value={inst}>{inst}</option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="input-search text-xs py-1"
        >
          <option value="">{t('admin:users.filters.allRoles')}</option>
          <option value="admin">{t('admin:users.filters.admin')}</option>
          <option value="non-admin">{t('admin:users.filters.nonAdmin')}</option>
        </select>

        <input
          type="date"
          value={joinedAfter}
          onChange={(e) => { setJoinedAfter(e.target.value); setPage(1); }}
          className="input-search text-xs py-1"
          title={t('admin:users.filters.joinedAfter')}
        />
        <input
          type="date"
          value={joinedBefore}
          onChange={(e) => { setJoinedBefore(e.target.value); setPage(1); }}
          className="input-search text-xs py-1"
          title={t('admin:users.filters.joinedBefore')}
        />

        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          className="input-search text-xs py-1"
        >
          <option value="newest">{t('admin:users.filters.newest')}</option>
          <option value="oldest">{t('admin:users.filters.oldest')}</option>
          <option value="az">{t('common:labels.nameAZ')}</option>
          <option value="za">{t('admin:users.filters.nameDesc')}</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-txt-secondary cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }}
            className="w-3 h-3 rounded border-border-soft accent-accent-primary"
          />
          {t('admin:users.filters.deleted')}
        </label>

        {(instanceFilter || roleFilter || joinedAfter || joinedBefore || sortBy !== 'newest' || showDeleted || query) && (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            onClick={() => {
              setQuery(''); setInstanceFilter(''); setRoleFilter('');
              setJoinedAfter(''); setJoinedBefore('');
              setSortBy('newest'); setShowDeleted(false); setPage(1);
              fetchUsers('', 1, false, { sort: 'newest' });
            }}
          >
            {t('admin:users.filters.clear')}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-2.5 bg-status-danger/10 border border-status-danger/30 rounded-lg text-status-danger text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="text-sm text-txt-tertiary py-4">{t('admin:users.loading')}</div>
      )}

      {/* User list */}
      {data && (
        <div className="rounded-xl bg-surface-elevated p-1.5 space-y-0.5">
          {data.users.length === 0 && (
            <div className="text-sm text-txt-tertiary py-4 text-center">{t('admin:users.empty')}</div>
          )}
          {data.users.map((user) => {
            const isSelf = user.id === currentUser?.id;
            const isFederated = !!user.homeInstance;
            const isDeleted = user.isDeleted;

            const hasTempPassword = tempPassword?.userId === user.id;

            return (
              <div key={user.id}>
                <div className={`flex items-center gap-3 min-h-[44px] rounded-lg px-2.5 py-2 hover:bg-interactive-hover transition-colors duration-fast ${hasTempPassword ? 'rounded-b-none' : ''}`}>
                  {/* Avatar */}
                  <div className={isDeleted ? 'opacity-50' : ''}>
                    <Avatar
                      src={user.avatar ? api.uploads.url(user.avatar) : null}
                      name={user.displayName || user.username}
                      size={32}
                      avatarColor={user.avatarColor as any}
                    />
                  </div>

                  {/* Info */}
                  <div className={`flex-1 min-w-0 ${isDeleted ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium text-txt-primary truncate ${isDeleted ? 'line-through' : ''}`}>
                        {user.username}
                      </span>
                      {user.displayName && !isDeleted && (
                        <span className="text-xs text-txt-tertiary truncate">{user.displayName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {user.isAdmin && (
                        <Tag tone="accent">{t('admin:users.badge.admin')}</Tag>
                      )}
                      {isFederated && (
                        <span className="inline-block h-5 px-[7px] rounded text-2xs leading-5 font-semibold bg-border-soft text-txt-secondary truncate max-w-[120px]">
                          {user.homeInstance}
                        </span>
                      )}
                      {isDeleted && (
                        <span className="inline-flex items-center h-5 px-[7px] rounded text-2xs font-semibold bg-status-danger/15 text-status-danger">
                          {t('admin:users.badge.deleted')}
                        </span>
                      )}
                      <span className="text-2xs text-txt-tertiary tabular-nums">
                        {formatDate(user.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {!isDeleted && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle admin */}
                      <IconButton
                        icon="shield-check"
                        size="sm"
                        label={adminButtonTitle(user, isFederated)}
                        onClick={() => handleToggleAdmin(user)}
                        disabled={isFederated && !user.isAdmin}
                        className={`${DISABLED_ROW_ACTION} ${user.isAdmin ? '!text-accent-tone' : ''}`}
                      />

                      {/* Reset password */}
                      <IconButton
                        icon="key"
                        size="sm"
                        label={isFederated ? t('admin:users.actions.federatedNoReset') : t('admin:users.actions.resetPassword')}
                        onClick={() => handleResetPassword(user)}
                        disabled={isFederated}
                        className={DISABLED_ROW_ACTION}
                      />

                      {/* Delete user */}
                      <IconButton
                        icon="trash-2"
                        size="sm"
                        tone="danger"
                        label={isSelf ? t('admin:users.actions.selfDelete') : t('admin:users.actions.delete')}
                        onClick={() => handleDeleteUser(user)}
                        disabled={isSelf}
                        className={DISABLED_ROW_ACTION}
                      />
                    </div>
                  )}
                </div>

                {/* Inline temp password display */}
                {hasTempPassword && (
                  <div className="p-3 mb-1 bg-status-ok/10 border border-status-ok/30 rounded-b-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-txt-secondary">{t('admin:users.tempPassword.label')}</div>
                      <Button variant="ghost" size="sm" onClick={() => setTempPassword(null)}>
                        {t('common:actions.dismiss')}
                      </Button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="px-2 py-1 bg-surface-input rounded text-sm font-mono text-status-ok select-all">
                        {tempPassword.password}
                      </code>
                      <Button
                        variant="secondary" size="sm" icon="copy"
                        onClick={() => navigator.clipboard.writeText(tempPassword.password)}
                      >
                        {t('common:actions.copy')}
                      </Button>
                    </div>
                    <div className="text-2xs text-txt-tertiary mt-1">
                      {t('admin:users.tempPassword.note')}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="secondary" size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            {t('common:actions.previous')}
          </Button>
          <span className="text-xs text-txt-tertiary tabular-nums">
            {t('admin:users.pagination', { page, total: totalPages, users: userCountLabel })}
          </span>
          <Button
            variant="secondary" size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            {t('common:actions.next')}
          </Button>
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={!!resetConfirmUser}
        onClose={() => setResetConfirmUser(null)}
        onConfirm={handleResetConfirm}
        title={t('admin:users.resetDialog.title')}
        description={
          <Trans
            t={t}
            i18nKey="admin:users.resetDialog.description"
            values={{ username: resetConfirmUser?.username ?? '' }}
            components={{ strong: <strong /> }}
          />
        }
        confirmLabel={t('admin:users.resetDialog.confirm')}
        variant="warning"
        loading={resetLoading}
      />
      <ConfirmDialog
        isOpen={confirmAction?.type === 'demote'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={t('admin:users.demoteDialog.title')}
        description={
          <Trans
            t={t}
            i18nKey="admin:users.demoteDialog.description"
            values={{ username: confirmAction?.user.username ?? '' }}
            components={{ strong: <strong /> }}
          />
        }
        confirmLabel={t('admin:users.demoteDialog.confirm')}
        variant="warning"
        loading={actionLoading}
      />
      <ConfirmDialog
        isOpen={confirmAction?.type === 'delete'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={t('admin:users.deleteDialog.title')}
        description={
          <Trans
            t={t}
            i18nKey="admin:users.deleteDialog.description"
            values={{ username: confirmAction?.user.username ?? '' }}
            components={{ strong: <strong /> }}
          />
        }
        confirmLabel={t('admin:users.deleteDialog.confirm')}
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}

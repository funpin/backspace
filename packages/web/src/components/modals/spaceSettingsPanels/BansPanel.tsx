import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../../i18n/formatters';
import { describeError } from '../../../i18n/errors';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { useSpaceStore, getApiForOrigin } from '../../../stores/spaceStore';

interface Ban {
  spaceId: string;
  userId: string;
  reason: string | null;
  bannedBy: string;
  createdAt: number;
  user: { id: string; username: string; displayName?: string | null; avatar?: string | null } | null;
  moderator: { id: string; username: string; displayName?: string | null } | null;
}

interface BansPanelProps {
  spaceId: string;
}

export function BansPanel({ spaceId }: BansPanelProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const spaces = useSpaceStore((s) => s.spaces);
  const f = useFormatters();
  const space = spaces.find((s) => s.id === spaceId);
  const spaceApi = getApiForOrigin(space?._instanceOrigin ?? '');

  const [bans, setBans] = useState<Ban[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBans = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await spaceApi.spaces.getBans(spaceId);
      setBans(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [spaceId, spaceApi]);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  const handleUnban = async (userId: string) => {
    try {
      await spaceApi.spaces.unban(spaceId, userId);
      setBans((prev) => prev.filter((b) => b.userId !== userId));
    } catch (err) {
      setError(describeError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-txt-tertiary text-sm">{t('spaces:bans.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('spaces:bans.title')}</h2>
      {error && (
        <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</div>
      )}

      <p className="text-xs text-txt-tertiary">{t('spaces:bans.description')}</p>

      {bans.length === 0 ? (
        <div className="text-center py-8 text-txt-tertiary text-sm">{t('spaces:bans.empty')}</div>
      ) : (
        <div>
          <div className="text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:bans.listHeading', { total: f.formatNumber(bans.length) })}
          </div>
          <div className="rounded-xl bg-surface-elevated p-1.5">
            <div className="space-y-0.5">
              {bans.map((ban) => {
                const displayName = ban.user?.displayName ?? ban.user?.username ?? ban.userId;
                const moderatorName = ban.moderator?.displayName ?? ban.moderator?.username ?? ban.bannedBy;
                const bannedDate = f.formatNumericDate(ban.createdAt);

                return (
                  <div key={ban.userId} className="flex items-center justify-between gap-3 min-h-11 px-2 py-1.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        src={ban.user?.avatar ?? null}
                        name={displayName}
                        size={32}
                        userId={ban.userId}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-txt-primary truncate">{displayName}</div>
                        <div className="text-2xs text-txt-tertiary truncate">
                          {ban.reason
                            ? t('spaces:bans.bannedByWithReason', { moderator: moderatorName, date: bannedDate, reason: ban.reason })
                            : t('spaces:bans.bannedBy', { moderator: moderatorName, date: bannedDate })}
                        </div>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => handleUnban(ban.userId)} className="flex-shrink-0">
                      {t('spaces:bans.unban')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

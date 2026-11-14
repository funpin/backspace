import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DirectoryEntry } from '@backspace/shared';
import type { TaggedExploreSpace } from '../../stores/exploreStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';
import { getSpaceGradient } from '../../utils/gradients';
import { extractDominantColors, colorsToGradient } from '../../utils/colorExtractor';
import { useSpaceJoin } from '../../hooks/useSpaceJoin';

/** Length cap of the optional message on a join request; the modal and the card share it. */
export const REQUEST_MESSAGE_MAX_LENGTH = 200;

/**
 * The Outer Space variant of the card. When set, the card belongs to an
 * instance the session has no connection to: the origin chip is always shown,
 * the closed-registration badge appears when the instance takes no new
 * accounts, and the single action hands the entry to the connect flow instead
 * of joining through `useSpaceJoin`.
 */
export interface OuterCardProps {
  entry: DirectoryEntry;
  onConnect: (entry: DirectoryEntry) => void;
}

export interface SpaceCardProps {
  space: TaggedExploreSpace;
  onJoinSuccess: (spaceId: string) => void;
  outer?: OuterCardProps;
}

/** The `TaggedExploreSpace` an Outer card renders for a directory entry. */
export function outerEntryToSpace(entry: DirectoryEntry): TaggedExploreSpace {
  return { ...entry, _instanceOrigin: entry.origin, joined: false };
}

export function SpaceCard({
  space,
  onJoinSuccess,
  outer,
}: SpaceCardProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const {
    isJoined,
    isPublic,
    isPending,
    joining,
    joinError,
    showRequestForm,
    requestMessage,
    setRequestMessage,
    openRequestForm,
    cancelRequestForm,
    join,
    sendRequest,
  } = useSpaceJoin(space);

  const [iconGradient, setIconGradient] = useState<string | null>(null);

  const fallbackGradient = getSpaceGradient(space.id, space.name, space.avatarColor).gradient;
  const originLabel = space._instanceOrigin
    ? (() => { try { return new URL(space._instanceOrigin).host; } catch { return space._instanceOrigin; } })()
    : null;

  const iconUrl = space.icon
    ? (space.icon.startsWith('http') || space.icon.startsWith('/') ? space.icon : `/api/uploads/${space.icon}`)
    : null;
  const bannerUrl = space.banner
    ? (space.banner.startsWith('http') || space.banner.startsWith('/') ? space.banner : `/api/uploads/${space.banner}`)
    : null;

  // Extract dominant colors from icon when no banner is set
  useEffect(() => {
    if (bannerUrl || !iconUrl) return;
    let cancelled = false;
    extractDominantColors(iconUrl)
      .then(colors => {
        if (!cancelled && colors.length > 0) setIconGradient(colorsToGradient(colors));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [iconUrl, bannerUrl]);

  const handlePublicJoin = async () => {
    const full = await join();
    if (full) onJoinSuccess(full.id);
  };

  const handleViewSpace = () => {
    onJoinSuccess(space.id);
  };

  const closedToNewAccounts = outer !== undefined && outer.entry.federatedRegistrationOpen === false;

  return (
    <Card className="overflow-hidden flex flex-col">
      {/* Banner area */}
      <div className="h-24 relative overflow-hidden">
        {/* Background layer */}
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: iconGradient ?? fallbackGradient }} />
        )}

        {/* Bottom fade into the card's own ground */}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-surface-elevated/90 to-transparent" />

        {/* Joined badge (top-left) */}
        {isJoined && (
          <div className="absolute top-2 left-2 z-[2]">
            <Tag tone="onMedia">
              <Icon name="check" size="xs" className="text-status-ok" />
              {t('spaces:explore.badges.joined')}
            </Tag>
          </div>
        )}

        {/* Closed-registration badge (top-left, Outer cards only; an Outer card is never joined) */}
        {closedToNewAccounts && (
          <div className="absolute top-2 left-2 z-[2]">
            <Tag tone="onMedia">
              <Icon name="lock" size="xs" className="text-status-danger" />
              {t('spaces:explore.outer.closedBadge')}
            </Tag>
          </div>
        )}

        {/* Visibility badge */}
        <div className="absolute top-2 right-2 z-[2]">
          <Tag tone="onMedia">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${isPublic ? 'bg-status-ok' : 'bg-status-warn'}`}
            />
            {isPublic ? t('spaces:explore.badges.public') : t('spaces:explore.badges.request')}
          </Tag>
        </div>

      </div>

      {/* Overlapping icon */}
      <div className="relative px-3.5 -mt-6 z-raised">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={space.name}
            className="w-11 h-11 rounded-lg object-cover ring-[3px] ring-surface-elevated"
          />
        ) : (
          <div
            className="w-11 h-11 rounded-lg ring-[3px] ring-surface-elevated flex items-center justify-center text-lg font-semibold text-white/90"
            style={{ background: fallbackGradient }}
          >
            {space.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3.5 pt-2 pb-3.5 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-txt-primary truncate mb-1">{space.name}</h3>

        {space.description ? (
          <p className="text-compact text-txt-secondary line-clamp-2 mb-3 flex-1">
            {space.description}
          </p>
        ) : (
          <p className="text-compact text-txt-tertiary mb-3 flex-1">{t('spaces:explore.noDescription')}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-txt-tertiary mb-3 min-w-0">
          <span className="flex items-center gap-1 flex-shrink-0 tabular-nums">
            <Icon name="users" size="xs" />
            {t('spaces:explore.memberCount', { count: space.memberCount })}
          </span>
          {originLabel && (
            <span className="flex items-center gap-1 min-w-0">
              <Icon name="globe" size="xs" />
              <span className="truncate">{originLabel}</span>
            </span>
          )}
        </div>

        {/* Action area */}
        {joinError && !outer && (
          <div className="text-xs text-status-danger mb-2">{joinError}</div>
        )}

        {outer ? (
          <Button variant="secondary" fullWidth onClick={() => outer.onConnect(outer.entry)}>
            {isPublic ? t('spaces:explore.outer.connectAndJoin') : t('spaces:explore.outer.connectAndRequest')}
          </Button>
        ) : isJoined ? (
          <Button variant="secondary" fullWidth onClick={handleViewSpace}>
            {t('spaces:explore.viewSpace')}
          </Button>
        ) : isPublic ? (
          <Button variant="primary" fullWidth onClick={handlePublicJoin} loading={joining}>
            {joining ? t('spaces:explore.joining') : t('spaces:explore.join')}
          </Button>
        ) : isPending ? (
          <Button variant="secondary" fullWidth disabled>
            {t('spaces:explore.requestPending')}
          </Button>
        ) : showRequestForm ? (
          <div className="space-y-2">
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value.slice(0, REQUEST_MESSAGE_MAX_LENGTH))}
              placeholder={t('spaces:explore.requestMessagePlaceholder')}
              rows={2}
              className="input-standard w-full resize-none"
            />
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={sendRequest} disabled={joining}>
                {joining ? t('spaces:explore.sendingRequest') : t('spaces:explore.sendRequest')}
              </Button>
              <Button variant="ghost" onClick={cancelRequestForm}>
                {t('common:actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" fullWidth onClick={openRequestForm}>
            {t('spaces:explore.requestToJoin')}
          </Button>
        )}
      </div>
    </Card>
  );
}

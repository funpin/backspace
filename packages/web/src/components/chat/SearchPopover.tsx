import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatters } from '../../i18n/formatters';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';
import { isDmChannel, getChannelOrigin, getApiForOrigin } from '../../stores/spaceStore';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { highlightMatch } from './searchHighlight';
import { messageTextForPreview } from '../../utils/stickerMessages';
import { useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import type { MessageWithUser, DmMessageWithUser, User } from '@backspace/shared';

type AnyMessage = MessageWithUser | DmMessageWithUser;

interface SearchPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  channelId: string;
  isDm: boolean;
  onJumpToMessage: (messageId: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = formatters.formatTime(timestamp);
  if (isToday) return i18n.t('common:time.today', { time });
  if (isYesterday) return i18n.t('common:time.yesterday', { time });
  return formatters.formatDateTime(timestamp);
}

const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;

function SearchResultRow({
  msg,
  origin,
  query,
  onJumpToMessage,
}: {
  msg: AnyMessage;
  /** The instance that issued the result (the searched channel's). */
  origin: string;
  query: string;
  onJumpToMessage: (id: string) => void;
}) {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['search']);
  const canonical = useCanonicalUserView(msg.user ?? _FALLBACK_USER, origin);
  const displayName = canonical.displayName ?? canonical.username ?? '?';
  const avatar = msg.user ? canonical.avatar : undefined;
  return (
    <button
      onClick={() => onJumpToMessage(msg.id)}
      className="w-full px-2.5 py-2 rounded-lg hover:bg-interactive-hover transition-colors duration-fast text-left flex items-start gap-2.5 group/result"
    >
      <div className="flex-shrink-0 mt-0.5">
        <Avatar
          src={avatar}
          name={displayName}
          size={28}
          user={msg.user ? canonical : undefined}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-compact font-semibold text-txt-primary truncate">
            {displayName}
          </span>
          <span className="text-2xs text-txt-tertiary flex-shrink-0 tabular-nums">
            {formatTime(msg.createdAt)}
          </span>
        </div>
        <div className="text-compact text-txt-secondary line-clamp-2 mt-0.5">
          {highlightMatch(messageTextForPreview(msg.content ?? ''), query)}
        </div>
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="flex items-center gap-1 mt-1 text-2xs text-txt-tertiary">
            <Icon name="paperclip" size="xs" />
            {t('search:results.attachments', { count: msg.attachments.length })}
          </div>
        )}
      </div>
    </button>
  );
}

export function SearchPopover({ open, onClose, anchorRef, channelId, isDm, onJumpToMessage }: SearchPopoverProps) {
  const { t } = useTranslation(['search', 'common']);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style } = useFloatingPosition(anchorRef, popoverRef, {
    placement: 'bottom',
    offset: 8,
    enabled: open,
  });

  const [query, setQuery] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [hasFilter, setHasFilter] = useState('');
  const [beforeFilter, setBeforeFilter] = useState('');
  const [afterFilter, setAfterFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<AnyMessage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when channel changes or popover opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setFromFilter('');
      setHasFilter('');
      setBeforeFilter('');
      setAfterFilter('');
      setResults([]);
      setTotalCount(0);
      setOffset(0);
      setShowFilters(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, channelId]);

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  // Escape handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const doSearch = useCallback(async (searchOffset = 0) => {
    const trimmed = query.trim();
    if (!trimmed && !fromFilter && !hasFilter && !beforeFilter && !afterFilter) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    setIsSearching(true);
    try {
      const origin = getChannelOrigin(channelId);
      const client = getApiForOrigin(origin);
      const params = {
        q: trimmed || undefined,
        from: fromFilter || undefined,
        has: hasFilter || undefined,
        before: beforeFilter || undefined,
        after: afterFilter || undefined,
        offset: searchOffset,
        limit: 25,
      };

      const data = isDm
        ? await client.search.dm(channelId, params)
        : await client.search.channel(channelId, params);

      if (searchOffset === 0) {
        setResults(data.results as AnyMessage[]);
      } else {
        setResults(prev => [...prev, ...(data.results as AnyMessage[])]);
      }
      setTotalCount(data.totalCount);
      setOffset(searchOffset + data.results.length);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, [query, fromFilter, hasFilter, beforeFilter, afterFilter, channelId, isDm]);

  // Debounced search on query/filter change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [doSearch]);

  const handleLoadMore = () => {
    doSearch(offset);
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={style}
      className="w-[420px] max-h-[500px] glass rounded-xl flex flex-col animate-fade-in"
    >
      {/* Search input */}
      <div className="p-3 border-b border-glass-border">
        <div className="flex items-center gap-2 bg-surface-input rounded-lg pl-3 pr-1 h-[38px]">
          <Icon name="search" size="sm" className="text-txt-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search:input.placeholder')}
            className="input-embedded flex-1 min-w-0 text-sm"
          />
          {query && (
            <IconButton
              icon="x"
              size="sm"
              label={t('common:actions.clear')}
              onClick={() => setQuery('')}
            />
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-2 text-xs font-medium text-txt-tertiary hover:text-txt-secondary transition-colors duration-fast flex items-center gap-1"
        >
          <Icon name="chevron-right" size="xs" className={`transition-transform duration-base ease-out ${showFilters ? 'rotate-90' : ''}`} />
          {t('search:filters.toggle')}
          {(fromFilter || hasFilter || beforeFilter || afterFilter) && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent-tone" />
          )}
        </button>

        {/* Filters row */}
        {showFilters && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs text-txt-tertiary font-medium mb-1 block">{t('search:filters.from.label')}</label>
              <input
                type="text"
                value={fromFilter}
                onChange={(e) => setFromFilter(e.target.value)}
                placeholder={t('search:filters.from.placeholder')}
                className="input-search w-full px-2 py-1 text-compact"
              />
            </div>
            <div>
              <label className="text-2xs text-txt-tertiary font-medium mb-1 block">{t('search:filters.has.label')}</label>
              <select
                value={hasFilter}
                onChange={(e) => setHasFilter(e.target.value)}
                className="input-search w-full px-2 py-1 text-compact appearance-none cursor-pointer"
              >
                <option value="">{t('search:filters.has.any')}</option>
                <option value="file">{t('search:filters.has.file')}</option>
                <option value="image">{t('search:filters.has.image')}</option>
                <option value="link">{t('search:filters.has.link')}</option>
              </select>
            </div>
            <div>
              <label className="text-2xs text-txt-tertiary font-medium mb-1 block">{t('search:filters.before.label')}</label>
              <input
                type="date"
                value={beforeFilter}
                onChange={(e) => setBeforeFilter(e.target.value)}
                className="input-search w-full px-2 py-1 text-compact"
              />
            </div>
            <div>
              <label className="text-2xs text-txt-tertiary font-medium mb-1 block">{t('search:filters.after.label')}</label>
              <input
                type="date"
                value={afterFilter}
                onChange={(e) => setAfterFilter(e.target.value)}
                className="input-search w-full px-2 py-1 text-compact"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {isSearching && results.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-txt-tertiary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isSearching && results.length === 0 && (query || fromFilter || hasFilter || beforeFilter || afterFilter) && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Icon name="search" size="lg" className="text-txt-tertiary mb-2" />
            <span className="text-txt-tertiary text-compact">{t('search:results.empty')}</span>
          </div>
        )}

        {!query && !fromFilter && !hasFilter && !beforeFilter && !afterFilter && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <span className="text-txt-tertiary text-compact">{t('search:results.hint')}</span>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs text-txt-tertiary font-medium tabular-nums">
              {t('search:results.count', { count: totalCount })}
            </div>
            <div className="px-1.5 pb-1.5">
              {results.map((msg) => (
                <SearchResultRow
                  key={msg.id}
                  msg={msg}
                  origin={getChannelOrigin(channelId)}
                  query={query}
                  onJumpToMessage={onJumpToMessage}
                />
              ))}
            </div>
            {results.length < totalCount && (
              <div className="px-3 py-2 border-t border-glass-border">
                <Button variant="ghost" size="sm" fullWidth onClick={handleLoadMore} disabled={isSearching}>
                  {isSearching ? t('common:states.loading') : t('search:results.loadMore', { remaining: totalCount - results.length })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

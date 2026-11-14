import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TransferState } from '../../stores/transferStore';
import { useFormatters } from '../../i18n/formatters';
import { Icon } from '../ui/Icon';

interface Props {
  loaded: number;
  total: number;
  state: TransferState;
  filename: string;
  /** Optional human-readable error, shown under the name in a tile and as the ring's tooltip when state==='failed'. */
  error?: string;
  onPause?: () => void;
  onResume?: () => void;
  onAbort?: () => void;
  size?: 'tile' | 'pill';
}

/** The small controls sit on a darkened picture, so they keep a black ground and white glyphs. */
const CONTROL_CLASS = 'grid place-items-center w-6 h-6 rounded bg-black/60 hover:bg-black/80 text-white transition-colors duration-fast';

export function AttachmentProgress({ loaded, total, state, filename, error, onPause, onResume, onAbort, size = 'tile' }: Props) {
  const { t } = useTranslation(['chat', 'common']);
  const { formatBytes, formatPercent } = useFormatters();
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const isFinal = state === 'completed' || state === 'aborted';
  // Desaturate the conic-gradient ring when paused so it can't be mistaken for
  // active progress. Active uses the theme's tone; paused uses a muted grey.
  const ringColor = state === 'paused' ? 'rgb(var(--text-tertiary))' : 'rgb(var(--accent-tone))';
  const ringTrack = 'rgb(var(--border-soft))';
  const ringTitle = state === 'failed'
    ? error
    : state === 'paused'
      ? t('chat:attachment.progress.pausedTitle', { percent: formatPercent(pct) })
      : undefined;
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] ${state === 'failed' ? 'bg-status-danger/20' : 'bg-black/50'} pointer-events-auto`}>
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center ${state === 'failed' ? 'bg-status-danger/30' : ''}`}
        style={state !== 'failed' ? { background: `conic-gradient(${ringColor} ${pct}%, ${ringTrack} ${pct}%)` } : undefined}
        title={ringTitle}
      >
        <div className={`w-7 h-7 rounded-full bg-surface-base text-2xs tabular-nums flex items-center justify-center font-medium ${state === 'failed' ? 'text-status-danger' : 'text-txt-primary'}`}>
          {state === 'paused' ? (
            <Icon name="pause" size="xs" />
          ) : state === 'failed' ? (
            '!'
          ) : (
            formatPercent(pct)
          )}
        </div>
      </div>
      {size === 'tile' && (
        <div className="text-2xs text-txt-primary text-center px-1">
          <div className="truncate max-w-[120px]">{filename}</div>
          {state === 'failed' && error ? (
            <div className="text-status-danger line-clamp-2 max-w-[120px]">{error}</div>
          ) : (
            <div className="text-txt-secondary tabular-nums">{formatBytes(loaded)} / {formatBytes(total)}</div>
          )}
        </div>
      )}
      {!isFinal && (
        <div className="absolute top-1 right-1 flex gap-1">
          {state === 'paused' && onResume && (
            <button type="button" onClick={onResume} className={CONTROL_CLASS} aria-label={t('common:actions.resume')}>
              <Icon name="play" size="xs" />
            </button>
          )}
          {state === 'active' && onPause && (
            <button type="button" onClick={onPause} className={CONTROL_CLASS} aria-label={t('common:actions.pause')}>
              <Icon name="pause" size="xs" />
            </button>
          )}
          {onAbort && (
            <button type="button" onClick={onAbort} className={CONTROL_CLASS} aria-label={t('common:actions.abort')}>
              <Icon name="x" size="xs" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

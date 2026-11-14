import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { PING_SAMPLE_MS, PING_WINDOW, summarizePings, usePingHistory } from '../../utils/pingHistory';
import { VOICE_HEALTH, healthBand, type HealthBand } from '../../utils/voiceHealth';

const WIDTH = 276;
const HEIGHT = 56;
/** The scale never zooms in past this, so a steady 8 ms line does not look like a storm. */
const MIN_SCALE_MS = 100;

const BAND_STROKE: Record<HealthBand, string> = {
  good: 'rgb(var(--status-online))',
  warn: 'rgb(var(--status-idle))',
  bad: 'rgb(var(--accent-rose))',
};
const BAND_TEXT: Record<HealthBand, string> = {
  good: 'text-status-online',
  warn: 'text-status-idle',
  bad: 'text-txt-danger',
};

function band(ms: number): HealthBand {
  return healthBand(ms, VOICE_HEALTH.pingWarnMs, VOICE_HEALTH.pingBadMs);
}

export interface PingGraphShape {
  /** Top of the scale, ms. */
  scale: number;
  /** One polyline per unbroken run of samples; a missing sample breaks the line. */
  runs: { x: number; y: number }[][];
}

/**
 * Lays the samples out right-aligned: the newest is at the right edge and a
 * call younger than the window leaves the left side empty, so a point keeps
 * its place on the time axis as the history fills.
 */
export function pingGraphShape(history: readonly (number | null)[], width: number, height: number): PingGraphShape {
  const highest = history.reduce<number>((max, value) => (value !== null && value > max ? value : max), 0);
  const scale = Math.max(MIN_SCALE_MS, Math.ceil((highest * 1.15) / 50) * 50);
  const step = width / (PING_WINDOW - 1);
  const offset = PING_WINDOW - history.length;
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  history.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push({
      x: Math.round((offset + index) * step * 10) / 10,
      y: Math.round((height - (Math.min(value, scale) / scale) * height) * 10) / 10,
    });
  });
  if (run.length > 0) runs.push(run);
  return { scale, runs };
}

/**
 * Round-trip time to the voice server over the last two minutes: the line,
 * the warn threshold as a dashed rule, and lowest / mean / highest under it.
 * The line takes the colour of the worst sample on screen, so a graph with a
 * spike in it does not read green just because the last second was calm.
 */
export function PingGraph() {
  const { t } = useTranslation(['voice', 'common']);
  const f = useFormatters();
  const history = usePingHistory();
  const summary = summarizePings(history);
  const { scale, runs } = pingGraphShape(history, WIDTH, HEIGHT);
  const ms = (value: number) => t('common:units.ms', { value: f.formatNumber(value) });
  const stroke = BAND_STROKE[summary ? band(summary.max) : 'good'];
  const warnY = HEIGHT - (VOICE_HEALTH.pingWarnMs / scale) * HEIGHT;
  const minutes = Math.round((PING_WINDOW * PING_SAMPLE_MS) / 60_000);

  return (
    <div data-testid="ping-graph" className="mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary">
          {t('voice:connectionInfo.pingGraph.title')}
        </span>
        <span className="text-[10px] text-txt-tertiary tabular-nums">
          {t('voice:connectionInfo.pingGraph.window', { minutes: f.formatNumber(minutes) })}
        </span>
      </div>
      <div className="relative rounded-md bg-surface-input overflow-hidden">
        <svg
          width="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary
            ? t('voice:connectionInfo.pingGraph.summaryLabel', { min: ms(summary.min), avg: ms(summary.avg), max: ms(summary.max) })
            : t('voice:connectionInfo.pingGraph.empty')}
          className="block h-14"
        >
          <line
            x1="0"
            x2={WIDTH}
            y1={warnY}
            y2={warnY}
            stroke="rgb(var(--status-idle))"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          {runs.map((run) => {
            const first = run[0]!;
            const last = run[run.length - 1]!;
            const line = run.map((point) => `${point.x},${point.y}`).join(' ');
            return (
              <g key={first.x}>
                <polygon points={`${first.x},${HEIGHT} ${line} ${last.x},${HEIGHT}`} fill={stroke} fillOpacity="0.14" />
                <polyline
                  points={line}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        <span className="absolute top-0.5 left-1 text-[9px] leading-none text-txt-tertiary tabular-nums pointer-events-none">
          {ms(scale)}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] tabular-nums">
        {summary ? (
          <>
            <span className="text-txt-tertiary">
              {t('voice:connectionInfo.pingGraph.min')} <span className={BAND_TEXT[band(summary.min)]}>{ms(summary.min)}</span>
            </span>
            <span className="text-txt-tertiary">
              {t('voice:connectionInfo.pingGraph.avg')} <span className={BAND_TEXT[band(summary.avg)]}>{ms(summary.avg)}</span>
            </span>
            <span className="text-txt-tertiary">
              {t('voice:connectionInfo.pingGraph.max')} <span className={BAND_TEXT[band(summary.max)]}>{ms(summary.max)}</span>
            </span>
          </>
        ) : (
          <span className="text-txt-tertiary">{t('voice:connectionInfo.pingGraph.empty')}</span>
        )}
      </div>
    </div>
  );
}

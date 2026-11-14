import type { CSSProperties, ReactNode } from 'react';

/**
 * A small label on or beside content.
 *
 * - `live`: the red on-air mark. The one label set in capitals.
 * - `neutral`: a quiet fact (stream quality, a count of lines).
 * - `onMedia`: the same fact on top of a picture, on a dark translucent ground.
 * - `accent`: tinted with the theme's tone.
 * - `color`: tinted with a colour that belongs to the content (a language in
 *   a code block, a role), passed as any CSS colour.
 */
export type TagTone = 'live' | 'neutral' | 'onMedia' | 'accent';

const TONE: Record<TagTone, string> = {
  live: 'bg-status-danger text-surface-base font-bold uppercase tracking-[0.04em]',
  neutral: 'bg-surface-elevated text-txt-secondary font-semibold',
  onMedia: 'bg-black/60 text-white/90 font-semibold',
  accent: 'bg-accent-tone/[0.16] text-accent-tone font-semibold',
};

interface TagProps {
  tone?: TagTone;
  /** A content colour; overrides `tone`. Draws a dot of the colour before the text. */
  color?: string;
  className?: string;
  children: ReactNode;
}

export function Tag({ tone = 'neutral', color, className, children }: TagProps) {
  const base = 'inline-flex items-center gap-1.5 h-5 px-[7px] rounded text-2xs whitespace-nowrap tabular-nums';
  if (color) {
    const style: CSSProperties = { color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` };
    return (
      <span className={`${base} font-semibold ${className ?? ''}`} style={style}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {children}
      </span>
    );
  }
  return <span className={`${base} ${TONE[tone]} ${className ?? ''}`}>{children}</span>;
}

interface BadgeProps {
  /** Omit for a bare dot. Counts above 99 read "99+". */
  count?: number;
  /** `attention` is the theme's secondary colour (unread, waiting on you); `muted` is for a muted source. */
  tone?: 'attention' | 'muted';
  className?: string;
  /** Accessible text, e.g. "3 unread messages". The number alone says too little. */
  label?: string;
}

/** The unread mark: a 7px dot, or a count. */
export function Badge({ count, tone = 'attention', className, label }: BadgeProps) {
  const ground = tone === 'attention' ? 'bg-accent-secondary text-surface-base' : 'bg-interactive-muted text-txt-secondary';
  if (count === undefined) {
    return <span className={`inline-block h-[7px] w-[7px] rounded-full ${ground} ${className ?? ''}`} role={label ? 'img' : undefined} aria-label={label} />;
  }
  return (
    <span
      className={`inline-grid place-items-center min-w-4 h-4 px-1 rounded-full text-[10px] leading-none font-bold tabular-nums ${ground} ${className ?? ''}`}
      aria-label={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

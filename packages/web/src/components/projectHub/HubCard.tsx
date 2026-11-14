import React, { useId, type JSX, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';

/** The design system's pastel accents (`--accent-*`, `tailwind.config.js`). */
export type HubAccent = 'lavender' | 'mint' | 'peach' | 'sky' | 'amber' | 'rose' | 'coral';

/**
 * Icon tile classes per accent. Written out in full because Tailwind only
 * generates classes it finds as literal strings in the source; a class built
 * from `accent-${accent}` would compile to nothing.
 */
const ACCENT_TILE: Record<HubAccent, string> = {
  lavender: 'bg-accent-lavender/15 text-accent-lavender',
  mint: 'bg-accent-mint/15 text-accent-mint',
  peach: 'bg-accent-peach/15 text-accent-peach',
  sky: 'bg-accent-sky/15 text-accent-sky',
  amber: 'bg-accent-amber/15 text-accent-amber',
  rose: 'bg-accent-rose/15 text-accent-rose',
  coral: 'bg-accent-coral/15 text-accent-coral',
};

/**
 * The one shape every card action takes, button or link: `flex-auto` in the
 * wrapping action row, so a single action spans the card like the Explore
 * space cards' buttons, and two actions share the row until their labels no
 * longer fit, then stack.
 */
const ACTION_SHAPE =
  'flex-auto inline-flex items-center justify-center gap-2 h-[34px] px-3.5 text-sm rounded-lg transition-colors duration-fast';

/**
 * Card action styles by role.
 *
 * - `primary`: the card's own in-app call to act (the community Join). At
 *   most one per card; the page stays calm because most cards have none.
 * - `quiet`: everything that navigates, outbound links and in-app openers.
 * - `waiting`: a disabled state the user is waiting on ("Request sent").
 */
export const HUB_ACTION = {
  primary: `${ACTION_SHAPE} font-semibold bg-accent-primary hover:bg-accent-primary-hover active:bg-accent-primary-active text-on-accent disabled:opacity-40 disabled:cursor-default`,
  quiet: `${ACTION_SHAPE} font-medium bg-surface-elevated hover:bg-border-soft text-txt-primary shadow-[inset_0_0_0_1px_var(--glass-border)]`,
  waiting: `${ACTION_SHAPE} font-medium bg-interactive-muted text-txt-tertiary cursor-default`,
} as const;

/**
 * An outbound action: a plain new-tab link, which the desktop app's window
 * open handler turns into the system browser. The arrow says it leaves the app.
 */
export function HubLinkAction(props: { href: string; children: ReactNode }): JSX.Element {
  return (
    <a href={props.href} target="_blank" rel="noopener noreferrer" className={HUB_ACTION.quiet}>
      {props.children}
      <Icon name="external-link" size="sm" className="text-txt-tertiary" />
    </a>
  );
}

/**
 * The shell every card on the Backspace page uses: an icon tile, a title, an
 * optional body and an optional action area pinned to the bottom, so cards of
 * different text lengths in one `.card-grid` row line their actions up.
 * Actions use `HUB_ACTION` or `HubLinkAction`, so every card's buttons have
 * one shape.
 *
 * Cards are content on the page, not floating controls, so the surface is
 * matte (`bg-surface-channel`, rounded and bordered like the Explore space
 * cards), never glass. The accent colours the icon tile and nothing else.
 * Presentational only: a card that needs data fetches it itself and passes
 * the result in.
 */
export function HubCard(props: {
  accent: HubAccent; icon: ReactNode; title: string; body?: ReactNode;
  children?: ReactNode; // action area
}): JSX.Element {
  const { accent, icon, title, body, children } = props;
  const titleId = useId();

  return (
    <article
      aria-labelledby={titleId}
      className="bg-surface-channel rounded-xl border border-border-soft p-4 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ACCENT_TILE[accent]}`}
        >
          {icon}
        </div>
        <h3 id={titleId} className="text-lg font-semibold text-txt-primary min-w-0">
          {title}
        </h3>
      </div>

      {body !== undefined && body !== null && (
        <div data-hub-card-body className="text-compact text-txt-secondary flex-1">
          {body}
        </div>
      )}

      {children !== undefined && children !== null && (
        <div data-hub-card-actions className="mt-auto flex flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </article>
  );
}

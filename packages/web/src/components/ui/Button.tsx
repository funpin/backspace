import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The button of the Kamen brandbook (docs/brand/brandbook.md §9).
 *
 * - `primary`: the accent fill. At most one per row of actions.
 * - `secondary`: a raised neutral with a 1px edge.
 * - `ghost`: no ground until hovered; for Cancel and other quiet actions.
 * - `danger`: red text, for an action that can be undone or confirmed later.
 * - `danger-solid`: red fill, for the confirming press of an irreversible action.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent-primary text-on-accent font-semibold hover:bg-accent-primary-hover active:bg-accent-primary-active',
  secondary: 'bg-surface-elevated text-txt-primary font-medium shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-border-soft',
  ghost: 'text-txt-secondary font-medium hover:bg-interactive-hover hover:text-txt-primary',
  danger: 'text-status-danger font-medium hover:bg-status-danger/10',
  'danger-solid': 'bg-status-danger text-surface-base font-semibold hover:brightness-110',
};

/** 28 / 34 / 40 px, the three control heights of the system. The keys are
 * quoted because platform/viewportTokens.test.ts reads a bare `sm:` in source
 * as a raw Tailwind breakpoint. */
const SIZE: Record<ButtonSize, string> = {
  'sm': 'h-7 px-2.5 gap-1.5 text-compact',
  'md': 'h-[34px] px-3.5 gap-2 text-sm',
  'lg': 'h-10 px-4 gap-2 text-sm',
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon before the label. */
  icon?: IconName;
  /** Shows a spinner in place of the icon and blocks presses; the label stays, so the width does not jump. */
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading = false, fullWidth = false, disabled, className, type, children, ...rest },
  ref,
) {
  const inactive = disabled || loading;
  return (
    <button
      ref={ref}
      // A button inside a form submits it unless told otherwise; that default
      // has surprised this codebase before, so the safe value is the default here.
      type={type ?? 'button'}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-lg whitespace-nowrap select-none',
        'transition-[background-color,color,transform,filter] duration-fast ease-out',
        'active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : icon ? (
        <Icon name={icon} size="sm" />
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  );
});

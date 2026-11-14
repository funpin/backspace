import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName, type IconSize } from './Icon';

/**
 * A button that is only an icon. `label` is required: it becomes the
 * accessible name and the hover title, because an icon alone names nothing.
 *
 * State is carried by colour and ground, never by a filled glyph:
 * - `off`: red icon on a red 14% ground (muted microphone, camera off).
 * - `on`: the icon on the accent fill (a live screen share).
 * - `danger-solid`: the red fill (disconnect).
 */
export type IconButtonTone = 'default' | 'off' | 'on' | 'danger' | 'danger-solid';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const TONE: Record<IconButtonTone, string> = {
  default: 'text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary',
  off: 'text-status-danger bg-status-danger/[0.14] hover:bg-status-danger/20',
  on: 'text-on-accent bg-accent-primary hover:bg-accent-primary-hover',
  danger: 'text-status-danger hover:bg-status-danger/10',
  'danger-solid': 'text-surface-base bg-status-danger hover:brightness-110',
};

const BOX: Record<IconButtonSize, { box: string; icon: IconSize }> = {
  'sm': { box: 'h-7 w-7', icon: 'sm' },
  'md': { box: 'h-[34px] w-[34px]', icon: 'md' },
  'lg': { box: 'h-10 w-10', icon: 'lg' },
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label' | 'title'> {
  icon: IconName;
  label: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  /** A raised neutral ground at rest, for a button that sits on a picture or on glass. */
  filled?: boolean;
  /** Suppress the native title when a `Tooltip` already wraps the button. */
  noTitle?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', tone = 'default', filled = false, noTitle = false, className, type, ...rest },
  ref,
) {
  const box = BOX[size];
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={noTitle ? undefined : label}
      className={[
        'inline-grid place-items-center rounded-lg flex-shrink-0',
        'transition-[background-color,color,transform,filter] duration-fast ease-out',
        'active:scale-[0.92] disabled:opacity-40 disabled:pointer-events-none',
        box.box,
        TONE[tone],
        filled && tone === 'default' ? 'bg-white/5' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} size={box.icon} />
    </button>
  );
});

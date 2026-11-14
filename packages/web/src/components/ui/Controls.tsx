import { useId, type ReactNode } from 'react';

/**
 * Small layout and choice primitives of the Kamen brandbook. They exist so a
 * screen states what a thing is (a card, a field, a set of options) and the
 * radius, edge and spacing come from one place.
 */

interface CardProps {
  /** `raised` sits on a sidebar or the chat ground; `sunken` groups rows inside a dialog. */
  tone?: 'raised' | 'sunken';
  /** Lifts 2px on hover; for a card that is itself a link or a button. */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ tone = 'raised', interactive = false, className, children }: CardProps) {
  return (
    <div
      className={[
        'rounded-xl',
        tone === 'raised' ? 'bg-surface-elevated' : 'bg-surface-input shadow-[inset_0_0_0_1px_var(--glass-border)]',
        interactive ? 'transition-transform duration-base ease-pop hover:-translate-y-0.5' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  /** Help under the label, before the control. */
  description?: string;
  /** Shown in red under the control; also marks the field invalid for assistive technology. */
  error?: string;
  /** Receives the ids to wire onto the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** A label, an optional description, a control and an optional error, wired together by id. */
export function Field({ label, description, error, children, className }: FieldProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={id} className="text-xs font-medium text-txt-secondary">{label}</label>
      {description && <p id={descriptionId} className="text-xs text-txt-tertiary">{description}</p>}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && <p id={errorId} role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

interface ChoiceItem<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Why a disabled choice cannot be picked; shown as its title. */
  disabledReason?: string;
}

interface OptionsProps<T extends string | number> {
  items: readonly ChoiceItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}

/**
 * A row of mutually exclusive chips (resolution, frame rate, codec). The
 * chosen chip takes the accent fill.
 */
export function Options<T extends string | number>({ items, value, onChange, label, className }: OptionsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {items.map(item => {
        const selected = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
            onClick={() => onChange(item.value)}
            className={[
              'h-8 px-3.5 rounded-lg text-compact font-medium',
              'transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.95]',
              'disabled:opacity-40 disabled:pointer-events-none',
              selected
                ? 'bg-accent-primary text-on-accent'
                : 'bg-surface-elevated text-txt-secondary shadow-[inset_0_0_0_1px_var(--glass-border)] hover:text-txt-primary',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabsProps<T extends string> {
  items: readonly { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** A segmented switch between views of one list (Online / All / Requests). */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`inline-flex gap-0.5 p-[3px] rounded-xl bg-surface-input shadow-[inset_0_0_0_1px_var(--glass-border)] ${className ?? ''}`}
    >
      {items.map(item => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={`h-7 px-3 rounded-lg text-compact font-medium transition-colors duration-fast ease-out ${
              selected ? 'bg-surface-elevated text-txt-primary' : 'text-txt-secondary hover:text-txt-primary'
            }`}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 text-txt-tertiary tabular-nums">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface ProgressProps {
  /** 0 to 1. Values outside the range are clamped. */
  value: number;
  /** `danger` for a transfer that failed part-way. */
  tone?: 'accent' | 'danger';
  label: string;
  className?: string;
}

/** The 3px bar of a file transfer. */
export function Progress({ value, tone = 'accent', label, className }: ProgressProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`h-[3px] rounded-full bg-border-soft overflow-hidden ${className ?? ''}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-base ease-out ${tone === 'accent' ? 'bg-accent-tone' : 'bg-status-danger'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

import { useRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /**
   * Told whether this field shows its text: when the toggle is pressed, and
   * again whenever the field gains focus, so a form with two password fields
   * always knows the state of the focused one.
   */
  onRevealChange?: (revealed: boolean) => void;
}

/**
 * A password field with a "Show password" toggle at its right edge. The
 * toggle keeps the caret in the field: pressing it does not move focus.
 */
export function PasswordInput({ onRevealChange, onFocus, className, ...rest }: PasswordInputProps) {
  const { t } = useTranslation('auth');
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    const next = !revealed;
    setRevealed(next);
    onRevealChange?.(next);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <input
        {...rest}
        ref={inputRef}
        type={revealed ? 'text' : 'password'}
        className={`${className ?? ''} pr-10`}
        onFocus={(e) => {
          onRevealChange?.(revealed);
          onFocus?.(e);
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        aria-label={revealed ? t('fields.hidePassword') : t('fields.showPassword')}
        aria-pressed={revealed}
        title={revealed ? t('fields.hidePassword') : t('fields.showPassword')}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors"
      >
        <Icon name={revealed ? 'eye-off' : 'eye'} size="sm" />
      </button>
    </div>
  );
}

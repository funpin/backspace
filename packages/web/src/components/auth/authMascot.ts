import { useCallback, useState, type SyntheticEvent } from 'react';
import type { MascotGaze, MascotState } from '../ui/Mascot';

/**
 * The character on the sign-in and sign-up forms watches what the user does:
 * it follows the caret while they type a name, closes its eyes while they type
 * a password, and peeks with one eye when they press "Show password".
 */

type FieldKind = 'text' | 'password';

interface Focus {
  kind: FieldKind;
  /** Caret position across the field, 0 (left edge) to 1 (right edge). */
  ratio: number;
}

/** How far the eyes travel, in the mark's grid units (the head is 37 wide). */
const GAZE_X = 4.5;
/** The fields sit below the character, so a watching glance is downward. */
const GAZE_DOWN = 3.5;

let measureCanvas: HTMLCanvasElement | null = null;

/**
 * Where the caret sits across the field, as a share of the text area's width.
 * Measures the text before the caret in the field's own font (password dots for
 * a password field); falls back to the character count where canvas text
 * measurement is unavailable.
 */
export function caretRatio(input: HTMLInputElement): number {
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const text = input.type === 'password' ? '•'.repeat(before.length) : before;
  const style = getComputedStyle(input);
  const inner = input.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
  let width: number | null = null;
  try {
    measureCanvas ??= document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = style.font || `${style.fontSize} ${style.fontFamily}`;
      width = ctx.measureText(text).width;
    }
  } catch {
    width = null;
  }
  const ratio = width !== null && inner > 0 ? width / inner : text.length / 32;
  return Math.min(1, Math.max(0, ratio));
}

export interface AuthMascotPose {
  state: MascotState;
  gaze?: MascotGaze;
}

/** The pose for the form's current focus. `base` wins while the form is busy (loading, rate-limited). */
export function authMascotPose(base: MascotState, focus: Focus | null, revealed: boolean): AuthMascotPose {
  if (base !== 'idle' || !focus) return { state: base };
  const gaze = { x: -GAZE_X + 2 * GAZE_X * focus.ratio, y: GAZE_DOWN };
  if (focus.kind === 'password') return revealed ? { state: 'peek', gaze } : { state: 'shy' };
  return { state: 'idle', gaze };
}

export interface TrackedFieldProps {
  onFocus: (e: SyntheticEvent<HTMLInputElement>) => void;
  onSelect: (e: SyntheticEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

export function useAuthMascot(base: MascotState) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [revealed, setRevealed] = useState(false);

  const track = useCallback((kind: FieldKind): TrackedFieldProps => {
    const update = (e: SyntheticEvent<HTMLInputElement>) => setFocus({ kind, ratio: caretRatio(e.currentTarget) });
    return { onFocus: update, onSelect: update, onBlur: () => setFocus(null) };
  }, []);

  return {
    pose: authMascotPose(base, focus, revealed),
    /** Props for a name or other plain text field. */
    textField: () => track('text'),
    /** Props for a password field; pass `onRevealChange` to PasswordInput. */
    passwordField: () => track('password'),
    onRevealChange: setRevealed,
  };
}

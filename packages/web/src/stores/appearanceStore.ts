import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The accent themes of the Kamen brandbook (docs/brand/brandbook.md §3.2).
 * The colour values live in `styles/globals.css` under `:root[data-accent]`;
 * `fill` and `secondary` here only paint the swatches of the picker and must
 * stay in step with that file.
 */
export const ACCENT_THEMES = [
  { id: 'lavender', fill: '#6e5bef', secondary: '#7fb0ff' },
  { id: 'emerald', fill: '#14805a', secondary: '#6fd3d9' },
  { id: 'amber', fill: '#e9a53c', secondary: '#f0906c' },
  { id: 'ice', fill: '#2f6fe6', secondary: '#7fdcf0' },
  { id: 'rose', fill: '#cf3f7c', secondary: '#c79bff' },
  { id: 'mono', fill: '#ececf0', secondary: '#b4b4bd' },
] as const;

export type AccentTheme = (typeof ACCENT_THEMES)[number]['id'];

export const DEFAULT_ACCENT_THEME: AccentTheme = 'lavender';

export function normalizeAccentTheme(value: unknown): AccentTheme {
  const match = ACCENT_THEMES.find(theme => theme.id === value);
  return match ? match.id : DEFAULT_ACCENT_THEME;
}

interface AppearanceState {
  accent: AccentTheme;
  /** False turns every transition and animation off, like the system setting. */
  motion: boolean;
  setAccent: (accent: AccentTheme) => void;
  setMotion: (motion: boolean) => void;
}

/**
 * Presentation preferences of this browser or app. Device-local like the
 * interface scale: they apply on the login screen, before there is an account.
 */
export const useAppearanceStore = create<AppearanceState>()(persist(
  set => ({
    accent: DEFAULT_ACCENT_THEME,
    motion: true,
    setAccent: accent => set({ accent: normalizeAccentTheme(accent) }),
    setMotion: motion => set({ motion }),
  }),
  {
    name: 'backspace-appearance',
    partialize: state => ({ accent: state.accent, motion: state.motion }),
    merge: (stored, current) => {
      const saved = stored as Partial<AppearanceState> | undefined;
      return {
        ...current,
        accent: normalizeAccentTheme(saved?.accent),
        motion: typeof saved?.motion === 'boolean' ? saved.motion : true,
      };
    },
  },
));

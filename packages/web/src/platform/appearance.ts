import { DEFAULT_ACCENT_THEME, useAppearanceStore } from '../stores/appearanceStore';

/**
 * Mirrors the appearance preferences onto `<html>` so the stylesheet can act
 * on them: `data-accent` selects a `:root[data-accent]` block in globals.css
 * (the default theme carries no attribute, its values sit on bare `:root`),
 * and `data-motion="off"` switches transitions and animations off.
 *
 * Called from main.tsx before React mounts, so the first paint already has
 * the chosen colours, auth pages and portals included. Returns the
 * unsubscribe for hot reload.
 */
export function initializeAppearance(): () => void {
  const apply = () => {
    const { accent, motion } = useAppearanceStore.getState();
    const root = document.documentElement;
    if (accent === DEFAULT_ACCENT_THEME) delete root.dataset.accent;
    else root.dataset.accent = accent;
    if (motion) delete root.dataset.motion;
    else root.dataset.motion = 'off';
  };
  apply();
  return useAppearanceStore.subscribe(apply);
}

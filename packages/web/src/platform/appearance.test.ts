import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeAppearance } from './appearance';
import { normalizeAccentTheme, useAppearanceStore } from '../stores/appearanceStore';

describe('appearance', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    useAppearanceStore.setState({ accent: 'lavender', motion: true });
    delete document.documentElement.dataset.accent;
    delete document.documentElement.dataset.motion;
  });

  afterEach(() => stop());

  it('leaves the default theme without an attribute', () => {
    stop = initializeAppearance();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('applies the stored theme before anything subscribes', () => {
    useAppearanceStore.setState({ accent: 'amber' });
    stop = initializeAppearance();
    expect(document.documentElement.dataset.accent).toBe('amber');
  });

  it('follows changes and clears the attribute on the way back to default', () => {
    stop = initializeAppearance();
    useAppearanceStore.getState().setAccent('ice');
    expect(document.documentElement.dataset.accent).toBe('ice');
    useAppearanceStore.getState().setAccent('lavender');
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it('marks motion off and removes the mark when it is turned back on', () => {
    stop = initializeAppearance();
    useAppearanceStore.getState().setMotion(false);
    expect(document.documentElement.dataset.motion).toBe('off');
    useAppearanceStore.getState().setMotion(true);
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('stops following after the returned unsubscribe runs', () => {
    stop = initializeAppearance();
    stop();
    useAppearanceStore.getState().setAccent('rose');
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it('falls back to the default for a value that is not a theme', () => {
    expect(normalizeAccentTheme('neon')).toBe('lavender');
    expect(normalizeAccentTheme(undefined)).toBe('lavender');
    expect(normalizeAccentTheme('mono')).toBe('mono');
    useAppearanceStore.getState().setAccent('neon' as never);
    expect(useAppearanceStore.getState().accent).toBe('lavender');
  });
});

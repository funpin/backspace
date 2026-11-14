import { useTranslation } from 'react-i18next';
import { ACCENT_THEMES, useAppearanceStore } from '../../../stores/appearanceStore';
import { Toggle } from '../../ui/Toggle';

/**
 * The colour theme picker and the motion switch. A theme is an accent with a
 * related secondary colour; neutrals and status colours do not change with it
 * (docs/brand/brandbook.md §3).
 */
export function AccentThemeSection() {
  const { t } = useTranslation('settings');
  const accent = useAppearanceStore(state => state.accent);
  const motion = useAppearanceStore(state => state.motion);
  const setAccent = useAppearanceStore(state => state.setAccent);
  const setMotion = useAppearanceStore(state => state.setMotion);

  return (
    <>
      <div>
        <div id="color-theme-label" className="block text-xs font-medium text-txt-secondary mb-1.5">
          {t('accentTheme.label')}
        </div>
        <p id="color-theme-description" className="text-xs text-txt-tertiary mb-2">{t('accentTheme.description')}</p>
        <div
          role="radiogroup"
          aria-labelledby="color-theme-label"
          aria-describedby="color-theme-description"
          className="grid grid-cols-2 desktop:grid-cols-3 gap-2"
        >
          {ACCENT_THEMES.map(theme => {
            const selected = theme.id === accent;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAccent(theme.id)}
                className={`flex items-center gap-2.5 rounded-lg bg-surface-elevated px-3 py-2.5 text-left text-sm transition-[box-shadow,color] duration-fast ease-out ${
                  selected
                    ? 'text-txt-primary shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]'
                    : 'text-txt-secondary hover:text-txt-primary shadow-[inset_0_0_0_1px_var(--glass-border)]'
                }`}
              >
                <span className="flex flex-shrink-0 gap-1" aria-hidden="true">
                  <span className="h-4 w-4 rounded-full" style={{ background: theme.fill }} />
                  <span className="h-4 w-4 rounded-full" style={{ background: theme.secondary }} />
                </span>
                <span className="truncate">{t(`accentTheme.themes.${theme.id}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border-hard pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-txt-primary">{t('motion.label')}</div>
          <p className="text-xs text-txt-tertiary mt-0.5">{t('motion.description')}</p>
        </div>
        <Toggle enabled={motion} onChange={setMotion} ariaLabel={t('motion.label')} />
      </div>
    </>
  );
}

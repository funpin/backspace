import { useTranslation } from 'react-i18next';
import { availableLanguages, setLanguage, supportedLanguages, type SupportedLanguage } from '../../../i18n';
import { getLanguage } from '../../../i18n';

/**
 * The language picker. Each option is shown in its own language, and the
 * list is deliberately not translated: a user who cannot read the current
 * language still has to be able to find their own.
 */
export function LanguageSection() {
  const { t } = useTranslation(['common']);
  const current = getLanguage();
  // A previewed unreleased language (dev `?lang=`) is shown as the current
  // option so the select does not silently display the wrong value.
  const options = availableLanguages.some((l) => l.code === current)
    ? availableLanguages
    : [...availableLanguages, ...supportedLanguages.filter((l) => l.code === current)];

  return (
    <div className="border-t border-border-hard pt-4">
      <div className="block text-xs font-medium text-txt-secondary mb-1.5">
        {t('common:language.label')}
      </div>
      <label htmlFor="language-select" className="block text-xs text-txt-tertiary mb-2">
        {t('common:language.description')}
      </label>
      <select
        id="language-select"
        value={current}
        onChange={(e) => { void setLanguage(e.target.value as SupportedLanguage); }}
        className="input-standard w-full appearance-none"
      >
        {options.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
}

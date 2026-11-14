import { useSettingsSectionsContext } from './SettingsSectionsContext';
import { HiButton } from '../telemetry/answers/HiButton';

/**
 * Reusable tab bar for settings panels in tab mode.
 * Reads sections and activeSection from SettingsSectionsContext.
 * Drop this into any panel that uses useSettingsSections with onNavigate.
 */
export function SettingsTabBar() {
  const ctx = useSettingsSectionsContext();
  if (!ctx || ctx.sections.length === 0) return null;

  return (
    <div className="flex gap-4 border-b border-border-hard -mt-2 mb-4">
      {ctx.sections.map((s) => (
        s.invite === true ? (
          // The invitation wears the answer button's material so it reads as
          // an offer rather than as one more tab, but it only navigates here.
          <div key={s.id} className="flex w-36 items-center pb-1.5 self-center">
            <HiButton onClick={() => ctx.scrollToSection(s.id)}>{s.label}</HiButton>
          </div>
        ) : (
        <button
          key={s.id}
          onClick={() => ctx.scrollToSection(s.id)}
          className={`pb-2.5 text-sm transition-colors duration-fast relative ${
            ctx.activeSection === s.id
              ? 'text-txt-primary font-medium'
              : 'text-txt-secondary hover:text-txt-primary'
          }`}
        >
          {s.label}
          {s.badgeCount !== undefined && s.badgeCount > 0 && (
            <span className="ml-1.5 text-2xs font-medium px-1.5 py-0.5 rounded-full bg-status-warn/15 text-status-warn tabular-nums">
              {s.badgeCount}
            </span>
          )}
          {s.badgeDot === true && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-status-warn align-middle" />
          )}
          {ctx.activeSection === s.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-tone rounded-full" />
          )}
        </button>
        )
      ))}
    </div>
  );
}

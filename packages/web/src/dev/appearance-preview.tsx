// Dev-only workbench for Settings → Appearance. Nothing in the app imports
// this file; `dev-appearance.html` is its only entry. It renders the real
// `AppearancePanel` next to a strip of themed controls, so a colour theme can
// be judged on a button, a switch, a field and a mention at once.
// `?lang=en|de|ru|pt|zh` picks the interface language (initI18n's dev preview).
import { createRoot } from 'react-dom/client';
import { AppearancePanel } from '../components/modals/settingsPanels/AppearancePanel';
import { Toggle } from '../components/ui/Toggle';
import { initI18n } from '../i18n';
import { initializeInterfaceScale } from '../platform/interfaceScale';
import { initializeAppearance } from '../platform/appearance';
import '../styles/globals.css';

initializeInterfaceScale();
initializeAppearance();

function Samples() {
  return (
    <div className="glass-modal rounded-2xl p-5 space-y-4 w-[320px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="h-[34px] px-3.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white text-sm font-semibold">Primary</button>
        <button type="button" className="h-[34px] px-3.5 rounded-lg bg-surface-elevated text-txt-primary text-sm font-medium">Secondary</button>
        <Toggle enabled onChange={() => {}} ariaLabel="Sample switch" />
      </div>
      <input className="input-standard w-full" defaultValue="release-plans" aria-label="Sample field" />
      <p className="text-sm text-txt-message">
        Yes. <span className="rounded px-1 font-medium text-accent-secondary bg-accent-secondary/15">@Timur</span>, join the lounge.{' '}
        <span className="text-txt-link">Release notes</span>
      </p>
      <div className="flex items-center gap-2 text-xs text-txt-secondary">
        <span className="glass-pill glass-pill-mine rounded-lg px-2 py-1">🔥 3</span>
        <span className="glass-pill rounded-lg px-2 py-1">👍 2</span>
        <span className="h-2 w-2 rounded-full bg-notification" /> unread
        <span className="h-2 w-2 rounded-full bg-status-online" /> online
        <span className="text-status-danger">error</span>
      </div>
    </div>
  );
}

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <div className="min-h-screen bg-surface-chat p-8 flex flex-wrap items-start gap-8">
      <div className="w-[520px] rounded-2xl bg-surface-channel p-6"><AppearancePanel /></div>
      <Samples />
    </div>,
  );
});

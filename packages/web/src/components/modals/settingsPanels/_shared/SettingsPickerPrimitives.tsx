import type { ReactNode } from 'react';
import { Icon } from '../../../ui/Icon';

/**
 * Section wrapper used by audio/video picker subsections (AudioInputSection,
 * AudioOutputSection, …). Provides the section label above a raised
 * block. Settings-panel-internal — kept under `_shared/` rather than
 * promoted to `ui/` because nothing outside settings panels needs this look.
 */
export function SectionShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-txt-secondary mb-1.5">{title}</div>
      <div className="rounded-xl bg-surface-elevated p-3.5">{children}</div>
    </div>
  );
}

export interface DropdownItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * Single row of a settings picker dropdown (input device, output device, etc.).
 * Renders a checkmark on the active row and indents inactive labels by the
 * checkmark's width so labels align across rows. Settings-panel-internal.
 */
export function DropdownItem({ label, active, onClick }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-compact hover:bg-interactive-hover transition-colors duration-fast flex items-center gap-2 ${
        active ? 'text-txt-primary' : 'text-txt-secondary'
      }`}
    >
      {active && (
        <Icon name="check" size="sm" className="text-accent-tone" />
      )}
      <span className={`truncate ${active ? '' : 'pl-[23px]'}`}>{label}</span>
    </button>
  );
}

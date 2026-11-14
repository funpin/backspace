import React from 'react';
import { Toggle } from '../ui/Toggle';
import { Icon } from '../ui/Icon';

interface PrivacySettingProps {
  label: string;
  description: string;
  /** Shown under the row while the entity is private. */
  note: string;
  /** Derived from the entity's overrides (`isHiddenFromEveryone`). */
  isPrivate: boolean;
  /** The overrides are still loading, or a switch is being saved. */
  busy: boolean;
  onToggle: () => void;
}

/**
 * The Private switch of channel and category settings. Privacy is @everyone's
 * View Channels deny; the switch shows what the loaded overrides say and
 * flips that one bit (`useEntityOverrides().setBits`).
 */
export function PrivacySetting({ label, description, note, isPrivate, busy, onToggle }: PrivacySettingProps) {
  return (
    <>
      <div className="pt-2 border-t border-border-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-txt-primary">{label}</div>
            <div className="text-xs text-txt-tertiary mt-0.5">{description}</div>
          </div>
          <div className={`flex-shrink-0 ml-4 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Toggle enabled={isPrivate} onChange={onToggle} />
          </div>
        </div>
      </div>

      {isPrivate && (
        <div className="flex items-start gap-2 px-3 py-2 bg-surface-input rounded-lg text-xs text-txt-secondary">
          <Icon name="lock" size="sm" className="mt-px text-txt-secondary" />
          <span>{note}</span>
        </div>
      )}
    </>
  );
}

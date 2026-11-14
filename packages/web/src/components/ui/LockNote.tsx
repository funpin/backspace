import React from 'react';
import { Icon } from './Icon';

/** The padlock the privacy notes use, shown on a control the viewer cannot switch. */
export const LOCK_ICON = 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z';

/** A note about a lock in a role editor, with the padlock in front. */
export function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-elevated text-compact text-txt-secondary">
      <Icon name="lock" size="sm" className="mt-0.5 text-txt-tertiary" />
      <div>{children}</div>
    </div>
  );
}

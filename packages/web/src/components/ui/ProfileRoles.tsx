import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@backspace/shared';

/**
 * A space member's roles on their profile card and full profile: a heading in
 * the profile's section style and one chip per role, a dot in the role colour
 * next to its name. Renders nothing for a member with no roles.
 */
export function ProfileRoles({ roles }: { roles: Role[] }) {
  const { t } = useTranslation(['social']);
  const headingId = useId();

  if (roles.length === 0) return null;

  return (
    <div>
      <span id={headingId} className="text-xs font-medium text-txt-tertiary">
        {t('social:profile.roles')}
      </span>
      <ul aria-labelledby={headingId} className="flex flex-wrap gap-1.5 mt-1.5">
        {roles.map((role) => (
          <li
            key={role.id}
            className="inline-flex items-center gap-1.5 max-w-full min-w-0 h-6 px-2.5 rounded-full bg-surface-elevated"
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: role.color || '#b9bbbe' }}
              aria-hidden="true"
            />
            <span className="text-xs text-txt-secondary truncate">{role.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

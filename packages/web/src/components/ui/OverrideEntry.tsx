import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriStateToggle, type TriState } from './TriStateToggle';
import { PermissionBits } from '../../utils/permissions';
import { Tooltip } from './Tooltip';
import { Button } from './Button';
import { Icon } from './Icon';


export type PermissionKey = keyof typeof PermissionBits;

export interface PermissionDef {
  key: PermissionKey;
  bit: bigint;
}

/**
 * The display name of every permission bit in the current language. One
 * place for the wording, so the role editor, the channel overrides and the
 * category overrides all call a permission the same thing.
 */
export function usePermissionNames(): Record<PermissionKey, string> {
  const { t } = useTranslation(['spaces']);
  return useMemo(() => ({
    ADMINISTRATOR: t('spaces:permissions.names.administrator'),
    VIEW_CHANNEL: t('spaces:permissions.names.viewChannel'),
    MANAGE_CHANNELS: t('spaces:permissions.names.manageChannels'),
    MANAGE_ROLES: t('spaces:permissions.names.manageRoles'),
    MANAGE_SPACE: t('spaces:permissions.names.manageSpace'),
    CREATE_INVITE: t('spaces:permissions.names.createInvite'),
    KICK_MEMBERS: t('spaces:permissions.names.kickMembers'),
    BAN_MEMBERS: t('spaces:permissions.names.banMembers'),
    SEND_MESSAGES: t('spaces:permissions.names.sendMessages'),
    MANAGE_MESSAGES: t('spaces:permissions.names.manageMessages'),
    ATTACH_FILES: t('spaces:permissions.names.attachFiles'),
    MENTION_EVERYONE: t('spaces:permissions.names.mentionEveryone'),
    READ_MESSAGE_HISTORY: t('spaces:permissions.names.readMessageHistory'),
    ADD_REACTIONS: t('spaces:permissions.names.addReactions'),
    CONNECT: t('spaces:permissions.names.connect'),
    SPEAK: t('spaces:permissions.names.speak'),
    MUTE_MEMBERS: t('spaces:permissions.names.muteMembers'),
    DEAFEN_MEMBERS: t('spaces:permissions.names.deafenMembers'),
    MOVE_MEMBERS: t('spaces:permissions.names.moveMembers'),
    STREAM: t('spaces:permissions.names.stream'),
    DISCONNECT_MEMBERS: t('spaces:permissions.names.disconnectMembers'),
  }), [t]);
}

export function OverrideEntry({
  label,
  color,
  permDefs,
  allow,
  deny,
  onChange,
  onRemove,
  lockedBits = 0n,
  removeLocked = false,
  readOnlyNote,
}: {
  label: string;
  color?: string;
  permDefs: PermissionDef[];
  allow: bigint;
  deny: bigint;
  onChange: (allow: bigint, deny: bigint) => void;
  onRemove?: () => void;
  /** Bits the viewer may not switch (held-bits rule): their toggles show their state, locked. */
  lockedBits?: bigint;
  /** The saved override sets a bit the viewer does not hold, so they may not remove it. */
  removeLocked?: boolean;
  /**
   * Set when the target ranks at or above the viewer (role hierarchy): the
   * whole entry is read-only and this note says why.
   */
  readOnlyNote?: string;
}) {
  const { t } = useTranslation(['spaces']);
  const permissionNames = usePermissionNames();
  const [expanded, setExpanded] = useState(false);

  const getState = (bit: bigint): TriState => {
    if ((allow & bit) !== 0n) return 'allow';
    if ((deny & bit) !== 0n) return 'deny';
    return 'neutral';
  };

  const readOnly = readOnlyNote !== undefined;
  const lockedFor = (bit: bigint) => readOnly || (lockedBits & bit) !== 0n;
  const removeDisabled = readOnly || removeLocked;

  const setState = (bit: bigint, state: TriState) => {
    if (lockedFor(bit)) return;
    let newAllow = allow & ~bit;
    let newDeny = deny & ~bit;
    if (state === 'allow') newAllow |= bit;
    if (state === 'deny') newDeny |= bit;
    onChange(newAllow, newDeny);
  };

  // Compact summary of non-neutral permissions
  const summary = permDefs.filter(p => getState(p.bit) !== 'neutral');
  const panelId = useId();
  const removable = !!onRemove;
  const hasLockedRow = !readOnly && permDefs.some((p) => (lockedBits & p.bit) !== 0n);

  return (
    <div className="rounded-lg bg-surface-elevated overflow-hidden">
      {/* The expand toggle and the remove action are siblings: a button inside
          a button is invalid HTML and reads as one control. */}
      <div className="flex items-center hover:bg-interactive-hover transition-colors duration-fast">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1.5 py-2 text-left"
        >
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color || '#b9bbbe' }}
          />
          <span className="text-sm font-medium text-txt-primary flex-1 truncate">{label}</span>
          {!expanded && summary.length > 0 && (
            <span className="text-2xs text-txt-tertiary flex-shrink-0 tabular-nums">
              {t('spaces:permissions.overrideCount', { count: summary.length })}
            </span>
          )}
          <Icon
            name="chevron-down"
            size="sm"
            className={`text-txt-tertiary transition-transform duration-base ease-out ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        {removable ? (
          <Tooltip
            content={t(readOnly
              ? 'spaces:permissions.aboveYouShort'
              : removeLocked ? 'spaces:permissions.removeUnheldShort' : 'spaces:permissions.removeOverride')}
            position="top"
          >
            <button
              type="button"
              onClick={removeDisabled ? undefined : onRemove}
              disabled={removeDisabled}
              aria-label={t('spaces:permissions.removeOverrideFor', { name: label })}
              className={`w-7 h-7 mr-1.5 flex items-center justify-center rounded-lg text-txt-tertiary transition-colors duration-fast ${
                removeDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-status-danger hover:bg-status-danger/10'
              }`}
            >
              <Icon name="trash-2" size="sm" />
            </button>
          </Tooltip>
        ) : (
          // Keeps every row's chevron in the same column as the removable rows.
          <span className="w-7 h-7 mr-1.5 flex-shrink-0" aria-hidden="true" />
        )}
      </div>
      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className="px-3 pb-3 space-y-1.5 border-t border-border-soft pt-2"
        >
          {(readOnly || hasLockedRow) && (
            <div className="flex items-start gap-2 pb-1 text-xs text-txt-tertiary">
              <Icon name="lock" size="xs" className="mt-px" />
              <span>{readOnly ? readOnlyNote : t('spaces:permissions.unheldLocked')}</span>
            </div>
          )}
          {permDefs.map((perm) => {
            const locked = lockedFor(perm.bit);
            const unheld = !readOnly && (lockedBits & perm.bit) !== 0n;
            const name = permissionNames[perm.key];
            return (
              <div key={perm.key} className="flex items-center justify-between gap-3">
                <span className={`text-compact text-txt-secondary${locked ? ' opacity-60' : ''}`}>{name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {unheld && (
                    <span className="text-txt-tertiary" title={t('spaces:permissions.unheldPermission')}>
                      <Icon name="lock" size="xs" label={t('spaces:permissions.unheldPermission')} />
                    </span>
                  )}
                  <TriStateToggle
                    value={getState(perm.bit)}
                    onChange={(v) => setState(perm.bit, v)}
                    disabled={locked}
                    label={name}
                  />
                </span>
              </div>
            );
          })}
          {removable && !readOnly && (
            <div className="flex items-center justify-between gap-3 pt-2.5 !mt-2.5 border-t border-border-soft">
              <span className="text-xs text-txt-tertiary">
                {t(removeLocked ? 'spaces:permissions.removeUnheld' : 'spaces:permissions.removeOverrideHint')}
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={removeLocked ? undefined : onRemove}
                disabled={removeLocked}
                className="flex-shrink-0"
              >
                {t('spaces:permissions.removeOverride')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

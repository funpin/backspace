import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpaceStore, getApiForOrigin } from '../../../stores/spaceStore';
import { useUIStore } from '../../../stores/uiStore';
import { HttpError, type RoleUpdateBody } from '../../../api/client';
import { PermissionBits, stringToPermissions, permissionsToString, rolePermissionsVersion } from '../../../utils/permissions';
import { PERMISSION_GROUPS, type PermDef, type PermissionGroupId } from '../../../utils/permissionGroups';
import { usePermissionNames } from '../../ui/OverrideEntry';
import { describeError } from '../../../i18n/errors';
import type { Role } from '@backspace/shared';
import {
  viewerCanManageRoleAt,
  useViewerHeldPermissions,
  viewerCanSwitchBit,
  viewerCanCreateRoleWith,
  viewerHoldsEveryBit,
} from '../../../utils/roleHierarchy';
import { RoleOrderList } from './RoleOrderList';
import { withSavedRole } from '../../../utils/roleOrder';
import { LockNote } from '../../ui/LockNote';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

/** A control floating on glass over the scrolling panel. */
const FLOATING_BUTTON = 'text-txt-primary hover:bg-interactive-hover transition-colors duration-fast pointer-events-auto disabled:opacity-40';

const ALL_PERMISSION_DEFS: PermDef[] = PERMISSION_GROUPS.flatMap((group) => group.perms);

const PRESET_COLORS = [
  '#b9bbbe', '#a5f3c4', '#ffc9a9', '#c4b5fd', '#93c5fd',
  '#fbbf24', '#fda4af', '#f87171', '#60a5fa', '#34d399',
];

/** Auto-increment a base name ("Foo" → "Foo 2" → "Foo 3") to avoid uniqueness conflicts. */
function getUniqueRoleName(baseName: string, existingRoles: Role[]): string {
  const existingNames = new Set(existingRoles.map((r) => r.name.toLowerCase()));
  let candidateName = baseName;
  let counter = 2;
  while (existingNames.has(candidateName.toLowerCase())) {
    candidateName = `${baseName} ${counter}`;
    counter++;
  }
  return candidateName;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface RolesPanelProps {
  spaceId: string;
}

export function RolesPanel({ spaceId }: RolesPanelProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const roles = useSpaceStore((s) => s.roles);
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const space = useSpaceStore((s) => s.spaces.find((sp) => sp.id === spaceId));
  const members = useSpaceStore((s) => s.members);
  // A new role starts at the bottom (position 1), so creating one needs a top
  // role above that (permissions.md, "Role hierarchy").
  const canCreateRole = !space || viewerCanManageRoleAt(space, members, 1);

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [isNewRole, setIsNewRole] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRole = async () => {
    setCreating(true);
    setError('');
    try {
      const uniqueName = getUniqueRoleName(t('spaces:roles.defaultName'), roles);
      // Roles live on the space's own instance (client-federation.md).
      const newRole = await getApiForOrigin(space?._instanceOrigin ?? '').roles.create(spaceId, { name: uniqueName });
      // The editor opens on the new role, so it has to be in the list now;
      // the space_access_changed refresh would arrive a moment later.
      await loadSpaceDetail(spaceId, { quiet: true });
      setIsNewRole(true);
      setEditingRoleId(newRole.id);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCreating(false);
    }
  };

  if (editingRoleId) {
    const role = roles.find((r) => r.id === editingRoleId);
    if (!role) {
      setEditingRoleId(null);
      return null;
    }
    return (
      <RoleEditView
        key={editingRoleId}
        role={role}
        spaceId={spaceId}
        isNew={isNewRole}
        onBack={() => { setIsNewRole(false); setEditingRoleId(null); }}
        onDeleted={() => { setIsNewRole(false); setEditingRoleId(null); }}
        onCopied={(newRoleId) => { setIsNewRole(true); setEditingRoleId(newRoleId); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('spaces:roles.title')}</h2>
      {error && (
        <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</div>
      )}

      <div className="sticky top-0 z-raised pointer-events-none pb-3">
        <button
          onClick={handleCreateRole}
          disabled={creating || !canCreateRole}
          className={`glass-bubble rounded-lg h-[34px] px-3 inline-flex items-center gap-1.5 text-sm font-medium ${FLOATING_BUTTON}`}
        >
          <Icon name="plus" size="sm" />
          {creating ? t('spaces:roles.creating') : t('spaces:roles.create')}
        </button>
      </div>

      <div>
        <div className="text-xs font-medium text-txt-secondary mb-1.5">{t('spaces:roles.listHeading')}</div>
        <p className="text-xs text-txt-tertiary">{t('spaces:roles.description')}</p>
        <p className="text-xs text-txt-tertiary mb-2">{t('spaces:roles.hierarchyHint')}</p>
        <div className="rounded-xl bg-surface-elevated p-1.5">
          <RoleOrderList
            spaceId={spaceId}
            onOpen={(roleId) => { setIsNewRole(false); setEditingRoleId(roleId); }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Role Edit View ─────────────────────────────────────────────────────────

interface RoleEditViewProps {
  role: Role;
  spaceId: string;
  isNew?: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onCopied: (newRoleId: string) => void;
}

function RoleEditView({ role, spaceId, isNew, onBack, onDeleted, onCopied }: RoleEditViewProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const permissionNames = usePermissionNames();
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const setRoles = useSpaceStore((s) => s.setRoles);
  const roles = useSpaceStore((s) => s.roles);
  const space = useSpaceStore((s) => s.spaces.find((sp) => sp.id === spaceId));
  const members = useSpaceStore((s) => s.members);
  const isEveryone = role.id === spaceId;
  // Roles at or above the viewer's top role can be looked at, not changed
  // (permissions.md, "Role hierarchy"); the server refuses the change anyway.
  const canEdit = !space || viewerCanManageRoleAt(space, members, role.position);
  // Held-bits rule (permissions.md): only bits the viewer holds can be
  // switched, and a copy can only carry bits they hold.
  const held = useViewerHeldPermissions(spaceId);
  const copyCarriesUnheld = !viewerCanCreateRoleWith(held, stringToPermissions(role.permissions));
  const canCopy = (!space || viewerCanManageRoleAt(space, members, 1)) && !copyCarriesUnheld;
  // Deleting switches the role's bits off for everyone holding it.
  const offersDelete = !isEveryone && canEdit;
  const deleteCarriesUnheld = offersDelete && !viewerHoldsEveryBit(held, stringToPermissions(role.permissions));
  const hasUnheldToggle = canEdit && ALL_PERMISSION_DEFS.some((perm) => !viewerCanSwitchBit(held, perm.bit));
  // Every role write goes to the space's own instance (client-federation.md).
  const roleApi = () => getApiForOrigin(space?._instanceOrigin ?? '').roles;

  const [draftName, setDraftName] = useState(role.name);
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEveryone && canEdit && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  const validateName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return t('spaces:roles.nameEmpty');
    const isDuplicate = roles.some(
      (r) => r.id !== role.id && r.name.toLowerCase() === trimmed.toLowerCase()
    );
    return isDuplicate ? t('spaces:roles.nameDuplicate') : '';
  };

  const [draftColor, setDraftColor] = useState(role.color);
  // The permissions this edit started from, and the draft made from them.
  // The save names the version of the base (permissions.md, "Concurrent
  // edits"), so a change someone else saved meanwhile is refused rather than
  // overwritten. While there is no local edit, the base follows the role, so
  // such a change shows here instead of reading as an edit of the viewer's.
  const storedPermissions = role.permissions ?? '0';
  const [basePermissions, setBasePermissions] = useState(storedPermissions);
  const [draftPermissions, setDraftPermissions] = useState<bigint>(
    stringToPermissions(storedPermissions)
  );
  const [syncedPermissions, setSyncedPermissions] = useState(storedPermissions);
  if (syncedPermissions !== storedPermissions) {
    setSyncedPermissions(storedPermissions);
    if (draftPermissions === stringToPermissions(basePermissions)) {
      setBasePermissions(storedPermissions);
      setDraftPermissions(stringToPermissions(storedPermissions));
    }
  }
  const addToast = useUIStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasNameChange = !isEveryone && draftName.trim() !== role.name;
  const hasColorChange = !isEveryone && draftColor !== role.color;
  const hasPermChange = draftPermissions !== stringToPermissions(basePermissions);
  const hasChanges = hasNameChange || hasColorChange || hasPermChange;

  const togglePermission = (bit: bigint) => {
    if (!canEdit || !viewerCanSwitchBit(held, bit)) return;
    setDraftPermissions((prev) => (prev & bit) !== 0n ? prev & ~bit : prev | bit);
  };

  const handleSave = async () => {
    setConfirmDelete(false);
    setSaving(true);
    setSaveError('');
    try {
      const data: RoleUpdateBody = {};
      if (hasNameChange) data.name = draftName.trim();
      if (hasColorChange) data.color = draftColor;
      if (hasPermChange) {
        data.permissions = permissionsToString(draftPermissions);
        data.permissionsVersion = rolePermissionsVersion(basePermissions);
      }
      const saved = await roleApi().update(spaceId, role.id, data);
      // What the server now holds is the base of the next edit.
      const savedPermissions = saved.permissions ?? data.permissions ?? basePermissions;
      setBasePermissions(savedPermissions);
      setDraftPermissions(stringToPermissions(savedPermissions));
      // Show what was saved at once; space_access_changed refreshes the rest.
      setRoles(withSavedRole(useSpaceStore.getState().roles, saved));
      addToast(t('spaces:roles.saved'), 'success', 2000);
    } catch (err) {
      // A duplicate name belongs on the name field, not in the save banner.
      if (err instanceof HttpError && err.code === 'role_name_taken') {
        setNameError(t('spaces:roles.nameDuplicate'));
      } else if (err instanceof HttpError && err.code === 'role_permissions_conflict') {
        // Someone else saved this role's permissions meanwhile: show theirs,
        // so the viewer reviews them and saves again.
        await loadSpaceDetail(spaceId, { quiet: true });
        const fresh = useSpaceStore.getState().roles.find((r) => r.id === role.id);
        const freshPermissions = fresh?.permissions ?? basePermissions;
        setBasePermissions(freshPermissions);
        setDraftPermissions(stringToPermissions(freshPermissions));
        setSaveError(describeError(err));
      } else {
        setSaveError(describeError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftName(role.name);
    setDraftColor(role.color);
    setBasePermissions(storedPermissions);
    setDraftPermissions(stringToPermissions(storedPermissions));
    setConfirmDelete(false);
    setSaveError('');
    setNameError('');
  };

  const handleDelete = async () => {
    if (deleteCarriesUnheld) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setSaveError('');
    try {
      await roleApi().delete(spaceId, role.id);
      // Gone from the list at once; space_access_changed brings the
      // renumbered positions.
      setRoles(useSpaceStore.getState().roles.filter((r) => r.id !== role.id));
      onDeleted();
    } catch (err) {
      setSaveError(describeError(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    setSaveError('');
    try {
      const uniqueName = getUniqueRoleName(t('spaces:roles.copyName', { name: role.name }), roles);
      const newRole = await roleApi().create(spaceId, {
        name: uniqueName,
        color: role.color,
        permissions: role.permissions ?? undefined,
      });
      // The editor moves to the copy, so it has to be in the list now.
      await loadSpaceDetail(spaceId, { quiet: true });
      onCopied(newRole.id);
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setCopying(false);
    }
  };

  const groupTitle = (id: PermissionGroupId): string => {
    switch (id) {
      case 'general': return t('spaces:roles.groups.general');
      case 'text': return t('spaces:roles.groups.text');
      case 'voice': return t('spaces:roles.groups.voice');
    }
  };

  return (
    <div className="space-y-5">
      {/* Back button */}
      <div className="sticky top-0 z-raised pointer-events-none pb-3">
        <button
          onClick={onBack}
          className={`glass-bubble rounded-lg h-[34px] pl-2 pr-3 inline-flex items-center gap-1 text-sm font-medium ${FLOATING_BUTTON}`}
        >
          <Icon name="chevron-left" size="sm" />
          {t('spaces:roles.backToList')}
        </button>
      </div>

      {isNew && !hasChanges && (
        <div className="rounded-lg bg-status-ok/10 px-3 py-2 text-sm text-status-ok">
          {t('spaces:roles.created')}
        </div>
      )}

      {!canEdit && <LockNote>{t('spaces:roles.aboveYou')}</LockNote>}

      {(hasUnheldToggle || copyCarriesUnheld) && (
        <LockNote>
          {hasUnheldToggle && t('spaces:roles.unheldLocked')}
          {hasUnheldToggle && copyCarriesUnheld && ' '}
          {copyCarriesUnheld && t(deleteCarriesUnheld ? 'spaces:roles.copyDeleteUnheld' : 'spaces:roles.copyUnheld')}
        </LockNote>
      )}

      {/* Identity card (Name + Color — not shown for @everyone) */}
      {!isEveryone && (
        <div>
          <div className="text-xs font-medium text-txt-secondary mb-1.5">{t('spaces:roles.identity')}</div>
          {/* A disabled fieldset disables every control inside it. */}
          <fieldset disabled={!canEdit} className={`rounded-xl bg-surface-elevated p-3.5 space-y-4 min-w-0 ${canEdit ? '' : 'opacity-60'}`}>
            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">
                {t('spaces:roles.nameLabel')}
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setNameError(validateName(e.target.value));
                }}
                onBlur={() => setNameError(validateName(draftName))}
                className={`input-standard w-full${nameError ? ' ring-2 ring-status-danger' : ''}`}
              />
              {nameError && (
                <p className="text-xs text-status-danger mt-1">{nameError}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">
                {t('spaces:roles.colorLabel')}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraftColor(c)}
                    className={`w-7 h-7 rounded-full transition-[transform,box-shadow] duration-fast ease-out ${
                      draftColor === c
                        ? 'scale-110 shadow-[0_0_0_2px_rgb(var(--bg-elevated)),0_0_0_3.5px_rgb(var(--accent-tone))]'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative w-7 h-7 rounded-full grid place-items-center bg-surface-input text-txt-secondary shadow-[inset_0_0_0_1px_var(--glass-border)] hover:text-accent-tone hover:shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))] transition-[color,box-shadow] duration-fast cursor-pointer overflow-hidden">
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Icon name="palette" size="sm" />
                </label>
                <input
                  type="text"
                  value={draftColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDraftColor(v);
                  }}
                  className="input-standard w-20 px-2 py-1 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </fieldset>
        </div>
      )}

      {/* Permission groups — each gets its own section card */}
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="text-xs font-medium text-txt-secondary mb-1.5">
            {groupTitle(group.id)}
          </div>
          <div className="rounded-xl bg-surface-elevated p-1.5">
            <div className="space-y-0.5">
              {group.perms.map((perm) => {
                const isAdminBit = perm.bit === PermissionBits.ADMINISTRATOR;
                const hasAdmin = (draftPermissions & PermissionBits.ADMINISTRATOR) !== 0n;
                const isOn = isAdminBit ? hasAdmin : hasAdmin || (draftPermissions & perm.bit) !== 0n;
                const isInherited = !isAdminBit && hasAdmin;
                const isUnheld = canEdit && !viewerCanSwitchBit(held, perm.bit);
                const isLocked = isInherited || !canEdit || isUnheld;
                const name = permissionNames[perm.key];
                return (
                  <label
                    key={perm.key}
                    className={`flex items-center justify-between gap-3 min-h-10 py-1.5 px-2 rounded-lg transition-colors duration-fast group/perm ${
                      isLocked ? 'cursor-default' : 'cursor-pointer hover:bg-interactive-hover'
                    }`}
                  >
                    <span className={`text-sm ${isLocked ? 'opacity-50 ' : ''}${isAdminBit ? 'text-status-danger font-medium' : 'text-txt-primary'}`}>
                      {name}
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {isUnheld && (
                        <span title={t('spaces:roles.unheldPermission')} className="inline-flex text-txt-tertiary">
                          <Icon name="lock" size="xs" label={t('spaces:roles.unheldPermission')} />
                        </span>
                      )}
                      <div
                        role="switch"
                        aria-checked={isOn}
                        aria-disabled={isLocked}
                        aria-label={name}
                        tabIndex={isLocked ? -1 : 0}
                        onClick={(e) => {
                          e.preventDefault();
                          if (!isLocked) togglePermission(perm.bit);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== ' ' && e.key !== 'Enter') return;
                          e.preventDefault();
                          if (!isLocked) togglePermission(perm.bit);
                        }}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone ${
                          isLocked ? 'cursor-default opacity-50' : 'cursor-pointer'
                        } ${isOn ? 'bg-accent-primary' : 'bg-interactive-muted'}`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-base ease-pop ${
                            isOn ? 'translate-x-4 bg-on-accent' : 'translate-x-0.5 bg-txt-secondary'
                          }`}
                        />
                      </div>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {saveError && (
        <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{saveError}</div>
      )}
      <div className="sticky bottom-0 z-raised pointer-events-none">
          <div className="flex justify-center pt-3 pb-1">
            <div className={`glass-bubble rounded-xl p-1.5 flex items-center gap-1.5 pointer-events-auto${
              isEveryone ? ' animate-slide-up' : ''
            }`}>
              {hasChanges && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleDiscard}>
                    {t('spaces:settings.discardChanges')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || (!isEveryone && !draftName.trim()) || !!nameError}
                  >
                    {saving ? t('common:states.saving') : t('common:actions.save')}
                  </Button>
                </>
              )}
              {hasChanges && (
                <div className="w-px h-5 bg-border-soft" />
              )}
              <Button variant="ghost" size="sm" onClick={handleCopy} disabled={copying || !canCopy}>
                {copying ? t('spaces:roles.copying') : t('spaces:roles.copy')}
              </Button>
              {offersDelete && (
                <>
                  <div className="w-px h-5 bg-border-soft" />
                  <Button
                    variant={confirmDelete ? 'danger-solid' : 'danger'}
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting || deleteCarriesUnheld}
                  >
                    {deleting ? t('spaces:roles.deleting') : confirmDelete ? t('spaces:roles.confirmDelete') : t('spaces:roles.delete')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

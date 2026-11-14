import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../ui/Avatar';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useSpaceStore, getApiForOrigin } from '../../../stores/spaceStore';
import { parseFederatedUsername, isFederationGlobeApplicable, userDisplayName } from '../../../utils/identity';
import { useSpaceOrigin } from '../../../hooks/useSpaceOrigin';
import { useCanonicalUserView } from '../../../utils/userViewLookup';
import { hasPermissionBit, PermissionBits, stringToPermissions } from '../../../utils/permissions';
import {
  myUserIdInSpace,
  viewerCanActOn,
  viewerCanEditMemberRoles,
  viewerCanManageRoleAt,
  viewerHoldsEveryBit,
  useViewerHeldPermissions,
} from '../../../utils/roleHierarchy';
import { useFormatters } from '../../../i18n/formatters';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Tag } from '../../ui/Tag';
import { describeError } from '../../../i18n/errors';
import type { MemberWithUser, Role } from '@backspace/shared';


/** Why a role checkbox is locked: the role ranks too high, or it carries bits the viewer lacks. */
type RoleLock = 'rank' | 'bits';

function MembersPanelRow({
  member,
  spaceId,
  ownerId,
  isExpanded,
  expandable,
  canKick,
  canBan,
  isSelf,
  assignableRoles,
  manageableRoleIds,
  memberRoleIds,
  savedRoleIds,
  heldPermissions,
  hasPendingChanges,
  onToggleExpand,
  onRoleToggle,
  onSaveRoles,
  onCancelRoleChange,
  onPendingAction,
}: {
  member: MemberWithUser;
  spaceId: string;
  ownerId: string | undefined;
  isExpanded: boolean;
  expandable: boolean;
  canKick: boolean;
  canBan: boolean;
  isSelf: boolean;
  assignableRoles: Role[];
  /** Roles the viewer may hand out or take back (below their own top role). */
  manageableRoleIds: Set<string>;
  memberRoleIds: Set<string>;
  /** The member's roles as the server has them; a role not among them is being given. */
  savedRoleIds: Set<string>;
  /** The viewer's bits in the space (held-bits rule); null when not loaded. */
  heldPermissions: bigint | null;
  hasPendingChanges: boolean;
  onToggleExpand: (userId: string) => void;
  onRoleToggle: (userId: string, roleId: string, currentRoleIds: Set<string>) => void;
  onSaveRoles: (userId: string) => void;
  onCancelRoleChange: (userId: string) => void;
  onPendingAction: (action: { type: 'kick' | 'ban'; userId: string; displayName: string }) => void;
}) {
  const { t } = useTranslation(['spaces', 'common']);
  const canonical = useCanonicalUserView(member.user, useSpaceOrigin(member.spaceId));
  const isOwner = member.userId === ownerId;
  const displayName = userDisplayName(canonical);

  // A role is locked when it ranks at or above the viewer (hierarchy), or when
  // giving it would hand out bits the viewer does not hold (held-bits rule).
  // Taking a role the member already has is governed by the hierarchy alone.
  const roleLocks = new Map<string, RoleLock>();
  for (const role of assignableRoles) {
    if (!manageableRoleIds.has(role.id)) roleLocks.set(role.id, 'rank');
    else if (!savedRoleIds.has(role.id) && !viewerHoldsEveryBit(heldPermissions, stringToPermissions(role.permissions))) {
      roleLocks.set(role.id, 'bits');
    }
  }
  const lockKinds = (['rank', 'bits'] as const).filter((kind) => [...roleLocks.values()].includes(kind));
  const lockReason: Record<RoleLock, string> = {
    rank: t('spaces:settings.members.rolesAboveYou'),
    bits: t('spaces:settings.members.rolesUnheld'),
  };

  return (
    <div>
      <div
        className={`flex items-center justify-between gap-3 min-h-11 px-2 py-1.5 rounded-lg transition-colors duration-fast ${
          expandable ? 'cursor-pointer hover:bg-interactive-hover' : ''
        } ${isExpanded ? 'bg-interactive-selected' : ''}`}
        onClick={() => {
          if (expandable) onToggleExpand(member.userId);
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar
            src={canonical.avatar}
            name={displayName}
            size={32}
            status={canonical.status}
            user={canonical}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-txt-primary truncate">
              {displayName}
              {isFederationGlobeApplicable(canonical) && (
                <span className="ml-1 text-2xs font-normal text-txt-tertiary">@{parseFederatedUsername(canonical.username).domain}</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {isOwner && (
                <Tag tone="accent">
                  <Icon name="crown" size="xs" />
                  {t('spaces:settings.members.owner')}
                </Tag>
              )}
              {member.roles?.filter((r) => r.id !== spaceId).map((r) => (
                <Tag key={r.id} color={r.color}>
                  {r.name}
                </Tag>
              ))}
              {!isOwner && (!member.roles || member.roles.filter((r) => r.id !== spaceId).length === 0) && (
                <span className="text-2xs text-txt-tertiary">{t('spaces:settings.members.noRoles')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {canBan && !isSelf && !isOwner && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onPendingAction({ type: 'ban', userId: member.userId, displayName }); }}
            >
              {t('spaces:settings.members.ban')}
            </Button>
          )}
          {canKick && !isSelf && !isOwner && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onPendingAction({ type: 'kick', userId: member.userId, displayName }); }}
            >
              {t('spaces:settings.members.kick')}
            </Button>
          )}
          {expandable && (
            <Icon
              name="chevron-right"
              size="sm"
              className={`text-txt-tertiary transition-transform duration-base ease-out ${isExpanded ? 'rotate-90' : ''}`}
            />
          )}
        </div>
      </div>

      {/* Role checkboxes — only shown when expanded */}
      {isExpanded && expandable && (
        <div className="mt-1 mb-2 ml-12 space-y-1.5">
          {assignableRoles.map((role) => {
            const lock = roleLocks.get(role.id);
            const manageable = lock === undefined;
            return (
              <label
                key={role.id}
                title={lock ? lockReason[lock] : undefined}
                className={`flex items-center gap-2 group/role ${manageable ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
              >
                <input
                  type="checkbox"
                  checked={memberRoleIds.has(role.id)}
                  disabled={!manageable}
                  onChange={() => onRoleToggle(member.userId, role.id, memberRoleIds)}
                  className="w-3.5 h-3.5 rounded accent-accent-tone"
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: role.color !== '#9ca3af' ? role.color : undefined }}
                >
                  {role.name}
                </span>
              </label>
            );
          })}
          {lockKinds.length > 0 && (
            <div className="flex items-start gap-2 pt-1 text-xs leading-snug text-txt-tertiary">
              <Icon name="lock" size="xs" className="mt-px" />
              <span>
                {lockKinds.map((kind) => <span key={kind} className="block">{lockReason[kind]}</span>)}
              </span>
            </div>
          )}
          {hasPendingChanges && (
            <div className="flex items-center gap-2 mt-1.5">
              <Button variant="ghost" size="sm" onClick={() => onCancelRoleChange(member.userId)}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => onSaveRoles(member.userId)}>
                {t('common:actions.save')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MembersPanelProps {
  spaceId: string;
}

export function MembersPanel({ spaceId }: MembersPanelProps) {
  const { t } = useTranslation(['spaces', 'common']);
  const f = useFormatters();
  const spaces = useSpaceStore((s) => s.spaces);
  const members = useSpaceStore((s) => s.members);
  const roles = useSpaceStore((s) => s.roles);
  const loadSpaceDetail = useSpaceStore((s) => s.loadSpaceDetail);
  const setMembers = useSpaceStore((s) => s.setMembers);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const heldPermissions = useViewerHeldPermissions(spaceId);

  const space = spaces.find((s) => s.id === spaceId);
  const spaceApi = getApiForOrigin(space?._instanceOrigin ?? '');
  const myPerms = spacePermissions.get(spaceId);
  const canKick = hasPermissionBit(myPerms, PermissionBits.KICK_MEMBERS);
  const canBan = hasPermissionBit(myPerms, PermissionBits.BAN_MEMBERS);

  const [pendingRoleChanges, setPendingRoleChanges] = useState<Map<string, Set<string>>>(new Map());
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'kick' | 'ban'; userId: string; displayName: string } | null>(null);

  // Assignable roles: exclude @everyone (where role.id === spaceId)
  const assignableRoles = roles.filter((r) => r.id !== spaceId);

  if (!space) return null;

  // Role hierarchy (permissions.md): the viewer moderates members ranked below
  // them and hands out roles below their own top role. Ids are the viewer's
  // and the members' ids on the space's instance.
  const myUserId = myUserIdInSpace(space);
  const manageableRoleIds = new Set(
    assignableRoles.filter((r) => viewerCanManageRoleAt(space, members, r.position)).map((r) => r.id),
  );

  const getMemberRoleIds = (member: MemberWithUser): Set<string> => {
    const pending = pendingRoleChanges.get(member.userId);
    if (pending) return pending;
    return new Set(member.roles?.map((r) => r.id) ?? []);
  };

  const handleRoleToggle = (userId: string, roleId: string, currentRoleIds: Set<string>) => {
    const updated = new Set(currentRoleIds);
    if (updated.has(roleId)) {
      updated.delete(roleId);
    } else {
      updated.add(roleId);
    }
    setPendingRoleChanges((prev) => new Map(prev).set(userId, updated));
  };

  const handleSaveRoles = async (userId: string) => {
    const roleIds = pendingRoleChanges.get(userId);
    if (!roleIds) return;
    try {
      const updated = await spaceApi.spaces.updateMember(spaceId, userId, { roleIds: Array.from(roleIds) });
      // The row shows the saved roles at once; space_access_changed
      // refreshes the rest of the space for every member.
      setMembers(useSpaceStore.getState().members.map((m) => (m.userId === userId ? { ...m, roles: updated.roles } : m)));
      setPendingRoleChanges((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      setExpandedMemberId(null);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const handleCancelRoleChange = (userId: string) => {
    setPendingRoleChanges((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  };

  const handleKick = async (userId: string) => {
    try {
      await spaceApi.spaces.removeMember(spaceId, userId);
      await loadSpaceDetail(spaceId);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const handleBan = async (userId: string) => {
    try {
      await spaceApi.spaces.ban(spaceId, userId);
      await loadSpaceDetail(spaceId);
    } catch (err) {
      setError(describeError(err));
    }
  };


  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('common:labels.members')}</h2>
      {error && (
        <div className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</div>
      )}
      <p className="text-xs text-txt-tertiary">{t('spaces:settings.members.description')}</p>

      <div>
        <div className="text-xs font-medium text-txt-secondary mb-1.5">
          {t('spaces:settings.members.listHeading', { total: f.formatNumber(members.length) })}
        </div>
        <div className="rounded-xl bg-surface-elevated p-1.5">
          <div className="space-y-0.5">
            {members.map((member) => (
              <MembersPanelRow
                key={member.userId}
                member={member}
                spaceId={spaceId}
                ownerId={space.ownerId}
                isExpanded={expandedMemberId === member.userId}
                expandable={viewerCanEditMemberRoles(space, members, roles, myPerms, member)}
                canKick={canKick && viewerCanActOn(space, members, member)}
                canBan={canBan && viewerCanActOn(space, members, member)}
                isSelf={member.userId === myUserId}
                assignableRoles={assignableRoles}
                manageableRoleIds={manageableRoleIds}
                memberRoleIds={getMemberRoleIds(member)}
                savedRoleIds={new Set(member.roles?.map((r) => r.id) ?? [])}
                heldPermissions={heldPermissions}
                hasPendingChanges={pendingRoleChanges.has(member.userId)}
                onToggleExpand={(uid) => setExpandedMemberId(expandedMemberId === uid ? null : uid)}
                onRoleToggle={handleRoleToggle}
                onSaveRoles={handleSaveRoles}
                onCancelRoleChange={handleCancelRoleChange}
                onPendingAction={setPendingAction}
              />
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          if (!pendingAction) return;
          if (pendingAction.type === 'kick') {
            await handleKick(pendingAction.userId);
          } else {
            await handleBan(pendingAction.userId);
          }
          setPendingAction(null);
        }}
        title={
          pendingAction?.type === 'ban'
            ? t('spaces:settings.members.confirm.banTitle', { name: pendingAction.displayName })
            : t('spaces:settings.members.confirm.kickTitle', { name: pendingAction?.displayName ?? '' })
        }
        description={
          pendingAction?.type === 'ban'
            ? t('spaces:settings.members.confirm.banDescription')
            : t('spaces:settings.members.confirm.kickDescription')
        }
        variant={pendingAction?.type === 'ban' ? 'danger' : 'warning'}
        confirmLabel={pendingAction?.type === 'ban' ? t('spaces:settings.members.ban') : t('spaces:settings.members.kick')}
      />
    </div>
  );
}

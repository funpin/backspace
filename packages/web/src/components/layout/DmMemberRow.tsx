import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@backspace/shared';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Tooltip } from '../ui/Tooltip';
import { Icon } from '../ui/Icon';
import { parseFederatedUsername, isFederationGlobeApplicable } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { replaceEmojiShortcodes, useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import {
  useContextMenuStore,
  type ContextMenuItem,
} from '../../stores/contextMenuStore';
import { useUIStore } from '../../stores/uiStore';

export type DmMemberRowAction = 'profile' | 'transfer' | 'kick' | 'remove-friend';

export interface DmMemberRowProps {
  member: User;
  /** The instance that issued `member` (the DM's pinned origin). */
  origin: string;
  /** True when this row represents the channel owner. */
  isOwner: boolean;
  /** True when this row is the viewer themselves. */
  isSelf: boolean;
  /** True when the viewer is the channel owner (controls transfer/kick visibility). */
  callerIsOwner: boolean;
  /** True when the viewer and this member are friends (controls Remove Friend visibility). */
  isFriend: boolean;
  /** Whether to render the kebab "⋮" trigger button (right side of the row). */
  showKebab?: boolean;
  /**
   * Force the kebab to be fully opaque regardless of hover state.
   *
   * Desktop hides the kebab until the row is hovered (`opacity-0 group-hover:opacity-100`),
   * which is invisible on touch devices that don't fire `:hover`. Mobile callers
   * (e.g. `MobileGroupDmInfo`) pass `alwaysShowKebab` to keep the trigger
   * permanently visible. Default `false` preserves the desktop hover-reveal.
   */
  alwaysShowKebab?: boolean;
  /** Fired when the viewer activates a menu entry. The component closes the menu itself. */
  onMenuAction: (action: DmMemberRowAction, member: User) => void;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function GlobeIcon() {
  return <span className="text-txt-tertiary inline-flex"><Icon name="globe" size="xs" /></span>;
}

function CrownIcon() {
  // The owner mark takes the theme's tone, like other accents on a dark ground.
  return <span className="text-accent-tone inline-flex"><Icon name="crown" size="xs" /></span>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DmMemberRow({
  member,
  origin,
  isOwner,
  isSelf,
  callerIsOwner,
  isFriend,
  showKebab = false,
  alwaysShowKebab = false,
  onMenuAction,
}: DmMemberRowProps) {
  useEmojiShortcodeNames();
  const { t } = useTranslation(['dm', 'common']);
  const canonical = useCanonicalUserView(member, origin);
  const openContextMenu = useContextMenuStore((s) => s.open);
  const rowRef = useRef<HTMLDivElement>(null);

  const { baseName, domain } = parseFederatedUsername(canonical.username);
  const displayName = canonical.displayName ?? baseName;
  const isOffline = canonical.status === 'offline';
  const showGlobe = isFederationGlobeApplicable(canonical);

  const buildMenuItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    items.push({
      key: 'profile',
      type: 'action',
      label: t('dm:memberRow.viewProfile'),
      onClick: () => {
        // Anchor the popout to this row's bounding rect — matches the
        // MemberSidebar pattern (see MemberSidebar.tsx). On mobile the anchor
        // is ignored by the store (full-screen push).
        const rect = rowRef.current?.getBoundingClientRect();
        if (rect) {
          useUIStore.getState().openUserProfile(canonical, origin, rect, 'left');
        } else {
          // Fallback: defer to the consumer if we can't compute a rect
          // (shouldn't happen in practice, but keeps the contract intact).
          onMenuAction('profile', canonical);
        }
      },
    });

    const showTransfer = callerIsOwner && !isSelf;
    const showKick = callerIsOwner && !isSelf;
    const showRemoveFriend = isFriend && !isSelf;

    if (showTransfer) {
      items.push({
        key: 'transfer',
        type: 'action',
        label: t('dm:memberRow.transferOwnership'),
        onClick: () => onMenuAction('transfer', canonical),
      });
    }

    if (showKick) {
      items.push({
        key: 'kick',
        type: 'action',
        label: t('dm:memberRow.removeFromGroup'),
        danger: true,
        onClick: () => onMenuAction('kick', canonical),
      });
    }

    if ((showTransfer || showKick) && showRemoveFriend) {
      items.push({ key: 'sep', type: 'separator' });
    }

    if (showRemoveFriend) {
      items.push({
        key: 'remove-friend',
        type: 'action',
        label: t('dm:memberRow.removeFriend'),
        danger: true,
        onClick: () => onMenuAction('remove-friend', canonical),
      });
    }

    return items;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu({ x: e.clientX, y: e.clientY }, buildMenuItems());
  };

  const handleKebabClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenu({ x: rect.right, y: rect.bottom + 4 }, buildMenuItems());
  };

  return (
    <div
      ref={rowRef}
      data-context-menu
      data-dm-member-row
      data-user-id={canonical.id}
      onContextMenu={handleContextMenu}
      className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast select-none"
    >
      <div className="flex-shrink-0">
        <ProfileAvatar
          src={canonical.avatar}
          name={displayName}
          size={32}
          status={isOffline ? null : canonical.status}
          user={canonical}
          origin={origin}
          placement="left"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-sm font-medium truncate ${
              isOffline ? 'text-txt-tertiary' : 'text-txt-primary'
            }`}
          >
            {displayName}
          </span>
          {showGlobe && (
            <Tooltip content={canonical.username} position="top">
              <span data-federation-globe className="inline-flex">
                <GlobeIcon />
              </span>
            </Tooltip>
          )}
          {isOwner && (
            <Tooltip content={t('dm:memberRow.ownerTooltip')} position="top">
              <span data-owner-crown className="inline-flex">
                <CrownIcon />
              </span>
            </Tooltip>
          )}
        </div>

        {showGlobe && domain && (
          <div className="text-2xs text-txt-tertiary truncate">
            @{domain}
          </div>
        )}

        {!isOffline && canonical.customStatus && (
          <div className="text-2xs text-txt-tertiary truncate">
            {replaceEmojiShortcodes(canonical.customStatus)}
          </div>
        )}
      </div>

      {showKebab && (
        <button
          type="button"
          aria-label={t('dm:memberRow.actions')}
          data-dm-member-kebab
          onClick={handleKebabClick}
          onContextMenu={(e) => {
            // Right-click on the kebab still opens the same menu at cursor.
            handleContextMenu(e);
          }}
          className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-opacity duration-fast ${
            alwaysShowKebab
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <Icon name="ellipsis-vertical" size="sm" />
        </button>
      )}
    </div>
  );
}

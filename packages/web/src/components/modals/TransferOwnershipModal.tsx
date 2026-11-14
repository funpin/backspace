import { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { MemberWithUser } from '@backspace/shared';
import { useSpaceStore, getApiForOrigin, type TaggedSpace } from '../../stores/spaceStore';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { normalizeUserAssets } from '../../utils/assetUrls';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

function TransferMemberRow({
  member,
  origin,
  onSelect,
}: {
  member: MemberWithUser;
  /** The space's instance, which issued the member rows. */
  origin: string;
  onSelect: (userId: string) => void;
}) {
  const canonical = useCanonicalUserView(member.user, origin);
  const displayName = canonical.displayName || canonical.username;
  return (
    <button
      onClick={() => onSelect(member.userId)}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-interactive-hover transition-colors duration-fast"
    >
      <Avatar
        src={canonical.avatar}
        name={displayName}
        size={32}
        user={canonical}
        userId={member.userId}
      />
      <div className="flex flex-col items-start min-w-0">
        <span className="text-sm text-txt-primary truncate max-w-full">
          {displayName}
        </span>
        {canonical.displayName && (
          <span className="text-2xs text-txt-tertiary truncate max-w-full">
            {canonical.username}
          </span>
        )}
      </div>
    </button>
  );
}

export function TransferOwnershipModal({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const { t } = useTranslation(['spaces', 'common']);
  const modalRef = useRef<HTMLDivElement>(null);
  const space = useSpaceStore((s) => s.spaces.find(sp => sp.id === spaceId));
  const currentUserId = useAuthStore((s) => s.user?.id);
  const transferOwnership = useSpaceStore((s) => s.transferOwnership);
  const addToast = useUIStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch members for the target space on mount (federation-aware)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const origin = (space as TaggedSpace)?._instanceOrigin ?? '';
        const client = getApiForOrigin(origin);
        const fetched = await client.spaces.members(spaceId);
        if (cancelled) return;
        for (const m of fetched) {
          if (origin) normalizeUserAssets(m.user, origin);
          useSpaceStore.getState().upsertUserView(m.user, origin);
        }
        setMembers(fetched);
      } catch {
        // Space may have been deleted or we lost access
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [spaceId, space]);

  // Filter members: exclude self, filter by search
  const filteredMembers = useMemo(() => {
    const spaceMembers = members.filter(m => m.userId !== currentUserId);
    if (!search.trim()) return spaceMembers;
    const q = search.toLowerCase();
    return spaceMembers.filter(m =>
      m.user.displayName?.toLowerCase().includes(q) ||
      m.user.username.toLowerCase().includes(q)
    );
  }, [members, currentUserId, search]);

  const selectedMember = selectedUserId ? members.find(m => m.userId === selectedUserId) : null;

  // Close on click-outside and escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedUserId) {
          setSelectedUserId(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, selectedUserId]);

  if (!space) return null;

  const handleTransfer = async () => {
    if (!selectedUserId) return;
    setTransferring(true);
    try {
      await transferOwnership(spaceId, selectedUserId);
      addToast(t('spaces:ownership.success', { name: selectedMember?.user.displayName || selectedMember?.user.username }), 'success', 3000);
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('spaces:ownership.failed'), 'warning', 3000);
    } finally {
      setTransferring(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-confirm flex items-center justify-center bg-surface-overlay">
      <div
        ref={modalRef}
        className="w-[380px] max-w-full max-h-[480px] glass-modal rounded-2xl flex flex-col animate-slide-up"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border-hard">
          <h3 className="text-lg font-semibold text-txt-primary">{t('spaces:ownership.title')}</h3>
          <p className="text-sm text-txt-secondary mt-1">
            <Trans
              t={t}
              i18nKey="spaces:ownership.description"
              values={{ name: space.name }}
              components={{ name: <span className="font-medium text-txt-primary" /> }}
            />
          </p>
        </div>

        {selectedUserId && selectedMember ? (
          /* Confirm step */
          <div className="p-5 flex flex-col gap-4">
            <div className="p-3 rounded-lg bg-status-warn/10">
              <p className="text-sm text-txt-secondary">
                <Trans
                  t={t}
                  i18nKey="spaces:ownership.confirmQuestion"
                  values={{ space: space.name, member: selectedMember.user.displayName || selectedMember.user.username }}
                  components={{ name: <span className="font-semibold text-txt-primary" /> }}
                />
              </p>
              <p className="text-xs text-txt-tertiary mt-1.5">{t('spaces:ownership.regularMember')}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelectedUserId(null)} disabled={transferring}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="danger-solid" onClick={handleTransfer} disabled={transferring}>
                {transferring ? t('spaces:ownership.transferring') : t('spaces:ownership.confirm')}
              </Button>
            </div>
          </div>
        ) : (
          /* Member list */
          <>
            <div className="px-5 pt-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common:labels.searchMembers')}
                className="input-search w-full"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
              {loading ? (
                <p className="text-xs text-txt-tertiary text-center py-4">{t('spaces:ownership.loading')}</p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-xs text-txt-tertiary text-center py-4">{t('common:labels.noMembersFound')}</p>
              ) : (
                filteredMembers.map((member) => (
                  <TransferMemberRow
                    key={member.userId}
                    member={member}
                    origin={(space as TaggedSpace)._instanceOrigin ?? ''}
                    onSelect={setSelectedUserId}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

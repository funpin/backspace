import { useTranslation } from 'react-i18next';
import { useSpaceJoin } from '../../hooks/useSpaceJoin';
import { getSpaceGradient } from '../../utils/gradients';
import type { TaggedExploreSpace } from '../../stores/exploreStore';
import { Button } from '../ui/Button';

export function ExploreSpacePreviewCard({
  space,
  onJoinSuccess,
}: {
  space: TaggedExploreSpace;
  onJoinSuccess: (spaceId: string) => void;
}) {
  const { t } = useTranslation(['spaces', 'common']);
  const {
    isPublic,
    isPending,
    joining,
    joinError,
    showRequestForm,
    requestMessage,
    setRequestMessage,
    openRequestForm,
    cancelRequestForm,
    join,
    sendRequest,
  } = useSpaceJoin(space);

  const fallbackGradient = getSpaceGradient(space.id, space.name, space.avatarColor).gradient;
  const iconUrl = space.icon
    ? (space.icon.startsWith('http') || space.icon.startsWith('/') ? space.icon : `/api/uploads/${space.icon}`)
    : null;
  const originLabel = space._instanceOrigin
    ? (() => { try { return new URL(space._instanceOrigin).host; } catch { return space._instanceOrigin; } })()
    : null;

  const handleJoin = async () => {
    const full = await join();
    if (full) onJoinSuccess(full.id);
  };

  return (
    <div className="rounded-xl bg-surface-elevated px-3 py-2.5">
      <div className="flex items-center gap-3">
        {/* Icon */}
        {iconUrl ? (
          <img src={iconUrl} alt={space.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white/90"
            style={{ background: fallbackGradient }}
          >
            {space.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt-primary truncate">{space.name}</div>
          <div className="flex items-center gap-2 text-xs text-txt-tertiary">
            <span>{t('spaces:explore.memberCount', { count: space.memberCount })}</span>
            {originLabel && <span className="truncate text-txt-tertiary/70">· {originLabel}</span>}
          </div>
        </div>

        {/* Action */}
        <div className="flex-shrink-0">
          {isPublic ? (
            <Button variant="primary" size="sm" onClick={handleJoin} disabled={joining}>
              {joining ? t('spaces:explore.preview.joining') : t('spaces:explore.preview.join')}
            </Button>
          ) : isPending ? (
            <span className="px-2.5 text-compact font-medium text-txt-tertiary">{t('spaces:explore.preview.pending')}</span>
          ) : (
            <Button variant="primary" size="sm" onClick={openRequestForm}>
              {t('spaces:explore.preview.request')}
            </Button>
          )}
        </div>
      </div>

      {/* Inline request form */}
      {showRequestForm && (
        <div className="mt-2.5 space-y-2">
          <textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value.slice(0, 200))}
            placeholder={t('spaces:explore.requestMessagePlaceholder')}
            rows={2}
            className="input-standard w-full resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={cancelRequestForm}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={sendRequest} disabled={joining}>
              {joining ? t('spaces:explore.preview.sending') : t('spaces:explore.sendRequest')}
            </Button>
          </div>
        </div>
      )}

      {joinError && <div className="mt-2 text-xs text-status-danger">{joinError}</div>}
    </div>
  );
}

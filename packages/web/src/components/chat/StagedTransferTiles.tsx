import { useTranslation } from 'react-i18next';
import { useTransferStore, type Transfer } from '../../stores/transferStore';
import { AttachmentProgress } from './AttachmentProgress';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

interface StagedTransferTilesProps {
  stagedTransfers: Transfer[];
  /** In-session image previews. MessageInput creates and revokes these URLs. */
  previewUrls: ReadonlyMap<string, string>;
  /** Unstages the transfer, cancelling its upload when it has not finished. */
  onRemove: (transferId: string) => void;
}

export function StagedTransferTiles({ stagedTransfers, previewUrls, onRemove }: StagedTransferTilesProps) {
  const { t } = useTranslation('chat');
  const pauseUpload = useTransferStore((s) => s.pauseUpload);
  const resumeUpload = useTransferStore((s) => s.resumeUpload);

  if (stagedTransfers.length === 0) return null;

  return (
    <div className="p-3 flex flex-wrap gap-3">
      {stagedTransfers.map((transfer) => {
        const isImage = transfer.file.mimetype.startsWith('image/');
        const isFinal = transfer.state === 'completed';
        const showOverlay = transfer.state !== 'completed';
        const previewUrl = previewUrls.get(transfer.id);
        return (
          <div
            key={transfer.id}
            className="relative group bg-surface-elevated rounded-xl p-2 max-w-[200px]"
          >
            {isImage ? (
              <div className="w-[150px] h-[150px] bg-surface-input rounded-lg flex items-center justify-center text-txt-tertiary overflow-hidden">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={transfer.file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon name="image" size="lg" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-txt-primary py-3 px-1.5">
                <span className="grid place-items-center w-[38px] h-[38px] rounded-lg bg-accent-tone/[0.16] text-accent-tone flex-shrink-0">
                  <Icon name="file-text" />
                </span>
                <span className="truncate max-w-[120px] font-medium">{transfer.file.name}</span>
              </div>
            )}

            {/* Clip the overlay, not the remove chip that extends beyond the tile. */}
            {showOverlay && (
              <div className="absolute inset-0 rounded-xl overflow-hidden">
                <AttachmentProgress
                  loaded={transfer.progress.loaded}
                  total={transfer.progress.total}
                  state={transfer.state}
                  filename={transfer.file.name}
                  size="tile"
                  onPause={transfer.state === 'active' ? () => pauseUpload(transfer.id) : undefined}
                  onResume={transfer.state === 'paused' ? () => void resumeUpload(transfer.id) : undefined}
                  onAbort={() => onRemove(transfer.id)}
                />
              </div>
            )}

            {/* Remove chip, shown once the upload has completed. */}
            {isFinal && (
              <IconButton
                icon="trash-2"
                size="sm"
                tone="danger-solid"
                label={t('composer.removeAttachment')}
                onClick={() => onRemove(transfer.id)}
                className="absolute -top-2 -right-2 z-raised shadow-elevation-high"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

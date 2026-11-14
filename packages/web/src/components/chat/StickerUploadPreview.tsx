import { useId, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { MAX_STICKER_NAME_LENGTH } from '@backspace/shared/src/stickers';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

/** The drop target for a sticker image: a dashed tile that takes the theme's tone while a file is over it. */
const DROPZONE = 'w-full min-h-48 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone disabled:cursor-wait';
const DROPZONE_REST = 'border-border-soft bg-surface-input hover:border-accent-tone/60';
const DROPZONE_ACTIVE = 'border-accent-tone bg-accent-tone/[0.16]';

export interface UploadItem {
  id: string;
  file: File;
  preview: string;
  name: string;
  ready: boolean;
  /** Why the server refused this image on the last submit, already in the reader's language. */
  error: string | null;
}


interface StickerUploadPreviewProps {
  items: UploadItem[];
  busy: boolean;
  dragging: boolean;
  chooseRef: RefObject<HTMLButtonElement>;
  openPicker: (mode: 'replace' | 'append') => void;
  choose: (files: File[], mode: 'replace' | 'append') => void;
  setDragging: (dragging: boolean) => void;
  markReady: (id: string, ready: boolean) => void;
  updateName: (id: string, name: string) => void;
  removeItem: (id: string) => void;
  setError: (error: string) => void;
}

/** Preview-only controls never upload bytes; confirmation belongs to the parent form. */
export function StickerUploadPreview({
  items, busy, dragging, chooseRef, openPicker, choose,
  setDragging, markReady, updateName, removeItem, setError,
}: StickerUploadPreviewProps) {
  const { t } = useTranslation('chat');
  const { formatBytes } = useFormatters();
  const nameId = useId();
  const singleItem = items.length === 1 ? items[0] : null;
  return <>
        {items.length === 0 && (
          <button
            ref={chooseRef}
            type="button"
            disabled={busy}
            onClick={() => openPicker('replace')}
            aria-label={t('stickers.chooseImage')}
            onDragOver={event => {
              event.preventDefault();
              event.stopPropagation();
              if (!busy) setDragging(true);
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={event => {
              event.preventDefault();
              event.stopPropagation();
              choose(Array.from(event.dataTransfer.files), 'replace');
            }}
            className={`${DROPZONE} ${dragging ? DROPZONE_ACTIVE : DROPZONE_REST}`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-tone/[0.16] text-accent-tone">
              <Icon name="image-plus" size="lg" />
            </span>
            <span className="text-sm font-medium">{t('stickers.dropImage')}</span>
            <span className="text-xs text-txt-tertiary">{t('stickers.pasteHint')}</span>
          </button>
        )}

        {singleItem && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => openPicker('replace')}
              aria-label={t('stickers.replace')}
              onDragOver={event => {
                event.preventDefault();
                event.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={event => {
                event.preventDefault();
                event.stopPropagation();
                choose(Array.from(event.dataTransfer.files), 'replace');
              }}
              className={`${DROPZONE} ${dragging ? DROPZONE_ACTIVE : DROPZONE_REST} sticker-checkerboard`}
            >
              <img
                key={singleItem.preview}
                src={singleItem.preview}
                alt={t('stickers.preview')}
                className="h-36 w-full object-contain"
                onLoad={() => markReady(singleItem.id, true)}
                onError={() => {
                  markReady(singleItem.id, false);
                  setError(t('stickers.invalidImage'));
                }}
              />
            </button>
            <div className="flex items-center justify-between gap-3 text-xs text-txt-tertiary">
              <span className="truncate" title={singleItem.file.name}>{singleItem.file.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="font-medium text-accent-tone hover:underline disabled:opacity-40"
                  onClick={() => openPicker('append')}
                >
                  + {t('stickers.addMore')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="font-medium text-accent-tone hover:underline disabled:opacity-40"
                  onClick={() => openPicker('replace')}
                >
                  {t('stickers.replace')}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor={nameId} className="mb-1.5 block text-xs font-medium text-txt-secondary">
                {t('stickers.name')}
              </label>
              <input
                id={nameId}
                value={singleItem.name}
                disabled={busy}
                maxLength={MAX_STICKER_NAME_LENGTH}
                onChange={event => updateName(singleItem.id, event.target.value)}
                className="input-search w-full"
                placeholder={t('stickers.name')}
              />
            </div>
          </>
        )}

        {items.length > 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-txt-secondary">
                {t('stickers.selectedCount', { count: items.length })}
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-xs font-medium text-accent-tone hover:underline disabled:opacity-40"
                onClick={() => openPicker('append')}
              >
                + {t('stickers.addMore')}
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {items.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2.5 rounded-lg bg-surface-elevated p-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-input sticker-checkerboard">
                    <img
                      src={item.preview}
                      alt={t('stickers.preview')}
                      className="h-full w-full object-contain"
                      onLoad={() => markReady(item.id, true)}
                      onError={() => {
                        markReady(item.id, false);
                        setError(t('stickers.invalidImage'));
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-1 text-2xs text-txt-secondary">
                      <span className="truncate" title={item.file.name}>{item.file.name}</span>
                      <span className="shrink-0 tabular-nums">{formatBytes(item.file.size)}</span>
                    </div>
                    <input
                      value={item.name}
                      disabled={busy}
                      maxLength={MAX_STICKER_NAME_LENGTH}
                      placeholder={t('stickers.name')}
                      aria-label={`${t('stickers.name')} #${index + 1}`}
                      onChange={event => updateName(item.id, event.target.value)}
                      className="input-search h-7 w-full text-xs px-2 py-1"
                    />
                    {item.error && <p className="mt-1 text-2xs text-status-danger">{item.error}</p>}
                  </div>
                  <IconButton
                    icon="x"
                    size="sm"
                    noTitle
                    label={t('stickers.removeNamed', { name: item.name || item.file.name })}
                    disabled={busy}
                    onClick={() => removeItem(item.id)}
                  />
                </div>
              ))}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => openPicker('append')}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openPicker('append');
                }
              }}
              onDragOver={event => {
                event.preventDefault();
                event.stopPropagation();
                if (!busy) setDragging(true);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={event => {
                event.preventDefault();
                event.stopPropagation();
                choose(Array.from(event.dataTransfer.files), 'append');
              }}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs transition-colors duration-fast ${
                dragging
                  ? 'border-accent-tone bg-accent-tone/[0.16] text-accent-tone'
                  : 'border-border-soft text-txt-tertiary hover:border-accent-tone/60 hover:text-txt-primary'
              }`}
            >
              <Icon name="plus" size="xs" />
              <span>{t('stickers.dropMore')}</span>
            </div>
          </div>
        )}


  </>;
}

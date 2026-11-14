import { useTranslation } from 'react-i18next';
import { stickerUrl, type PersonalSticker } from '@backspace/shared/src/stickers';
import { Icon } from '../ui/Icon';

/** The two round controls Manage mode puts on a tile's corners. */
const TILE_CONTROL = 'grid h-6 w-6 place-items-center rounded-full bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] transition-colors duration-fast disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone';

interface StickerGridProps {
  /** The entries the search leaves, in collection order. */
  items: PersonalSticker[];
  /** Whether the search is hiding every entry of a collection that has some. */
  noMatches: boolean;
  managing: boolean;
  removing: string | null;
  onSelect: (token: string) => void;
  onRename: (sticker: PersonalSticker) => void;
  onRemove: (id: string) => void;
}

/**
 * The collection as tiles. A click sends the sticker; Manage mode adds a
 * rename and a remove button to each tile and turns sending off, so a normal
 * pick never removes or renames an entry. There is no right-click menu on a
 * tile: the desktop context menu draws at z-index 200, under the z-index 300
 * popovers the picker opens in, so it would be hidden behind the picker.
 */
export function StickerGrid({ items, noMatches, managing, removing, onSelect, onRename, onRemove }: StickerGridProps) {
  const { t } = useTranslation('chat');

  if (noMatches) {
    return (
      <div className="flex-1 min-h-0 px-3 pb-3">
        <p role="status" className="flex h-40 items-center justify-center px-4 text-center text-xs text-txt-tertiary">
          {t('stickers.noResults')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pb-3">
      <div className="grid grid-cols-4 gap-1.5">
        {items.map(item => (
          <div key={item.id} className="group relative min-w-0 rounded-xl hover:bg-interactive-hover transition-colors duration-fast">
            <button
              type="button"
              data-sticker-id={item.id}
              disabled={managing || !!removing}
              onClick={() => onSelect(item.token)}
              title={item.name}
              aria-label={item.name}
              className="w-full p-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone"
            >
              <img
                src={stickerUrl(item.token) ?? undefined}
                alt={item.name}
                className="aspect-square w-full object-contain transition-transform duration-base ease-pop group-hover:scale-105"
                loading="lazy"
              />
              <span className="mt-1 block truncate text-2xs text-txt-tertiary">{item.name}</span>
            </button>
            {managing && (
              <>
                <button
                  type="button"
                  data-sticker-rename={item.id}
                  disabled={!!removing}
                  aria-label={t('stickers.renameNamed', { name: item.name })}
                  className={`absolute top-1 left-1 text-txt-secondary hover:text-txt-primary ${TILE_CONTROL}`}
                  onClick={() => onRename(item)}
                >
                  <Icon name="pencil" size="xs" />
                </button>
                <button
                  type="button"
                  disabled={!!removing}
                  aria-label={t('stickers.removeNamed', { name: item.name })}
                  className={`absolute top-1 right-1 text-status-danger hover:bg-status-danger/20 ${TILE_CONTROL}`}
                  onClick={() => onRemove(item.id)}
                >
                  {removing === item.id ? (
                    <span className="sticker-spinner" />
                  ) : (
                    <Icon name="x" size="xs" />
                  )}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

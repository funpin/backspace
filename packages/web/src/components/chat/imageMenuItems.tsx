import { stickerIdOf, stickerUrl } from '@backspace/shared/src/stickers';
import type { ContextMenuAction, ContextMenuItem } from '../../stores/contextMenuStore';
import { saveImage, copyImageToClipboard } from '../../utils/imageActions';
import { useUIStore } from '../../stores/uiStore';
import { api, HttpError } from '../../api/client';
import i18n from '../../i18n';
import { uploadSticker, readStickerImage } from './stickerUpload';
import { describeError } from '../../i18n/errors';
import { Icon } from '../ui/Icon';

interface ImageMenuParams {
  imageUrl?: string | null;
  sourceUrl?: string | null;
  stickerSource?: string | null;
  stickerName?: string;
}

/**
 * Reads another instance's sticker for a re-upload to the home collection.
 * `url` is the canonical asset URL `stickerUrl` returned for the token: the
 * address the message or reaction already draws the image from, so no new
 * host is contacted. No cookies are sent, the HTTP cache is skipped (an
 * earlier `<img>` load of the same URL was not a CORS request) and the
 * answer must be the WebP the asset route serves, at most 5 MiB.
 */
async function readRemoteSticker(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  } catch {
    // The instance is unreachable, or answered without CORS headers.
    throw new Error(i18n.t('chat:stickers.downloadFailed'));
  }
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (response.ok && type !== 'image/webp') throw new Error(i18n.t('chat:stickers.downloadFailed'));
  return readStickerImage(response);
}

/**
 * Adds a sticker token or a local original attachment to the home collection.
 * A token from this instance is collected by reference. The home instance
 * refuses one from another instance with `sticker_not_local`; that image is
 * then read from its own instance and uploaded like a picked file, so the
 * home server stores its own copy and never fetches a URL a client names.
 */
async function saveToCollection(source: string, name: string): Promise<void> {
  const sticker = stickerUrl(source);
  if (sticker) {
    try {
      await api.stickers.collect({ id: stickerIdOf(source)!, token: source, name });
      return;
    } catch (err) {
      if (!(err instanceof HttpError && err.code === 'sticker_not_local')) throw err;
    }
    await uploadSticker(await readRemoteSticker(sticker), name);
    return;
  }
  const response = await fetch(new URL(source, window.location.origin).href);
  await uploadSticker(await readStickerImage(response), name);
}

/** Only annotated sticker messages and local original attachments can be collected, never arbitrary embeds. */
function collectStickerItem(source: string, name: string): ContextMenuAction | null {
  const sticker = stickerUrl(source);
  let url: URL;
  try { url = new URL(sticker ?? source, window.location.origin); }
  catch { return null; }
  const localUpload = url.origin === window.location.origin
    && /^\/api\/uploads\/[^/]+$/.test(url.pathname) && !url.search && !url.hash;
  if (!sticker && !localUpload) return null;

  return {
    key: 'collect-sticker',
    type: 'action',
    label: i18n.t('chat:stickers.save'),
    icon: <Icon name="sticker" size="sm" />,
    onClick: async () => {
      const { addToast } = useUIStore.getState();
      addToast(i18n.t('chat:stickers.uploading'), 'info');
      try {
        await saveToCollection(source, name);
        addToast(i18n.t('chat:stickers.saved'), 'success');
      } catch (err) {
        addToast(describeError(err), 'warning');
      }
    },
  };
}

export function buildImageMenuItems({ imageUrl, sourceUrl, stickerSource, stickerName }: ImageMenuParams): ContextMenuItem[] {
  if (!imageUrl) return [];
  const items: ContextMenuItem[] = [];
  const collect = stickerSource ? collectStickerItem(stickerSource, stickerName || i18n.t('chat:stickers.sticker')) : null;
  if (collect) items.push(collect);
  items.push({
    key: 'save-image', type: 'action', label: i18n.t('chat:menu.saveImage'),
    icon: <Icon name="download" size="sm" />,
    onClick: () => saveImage(imageUrl),
  }, {
    key: 'copy-image', type: 'action', label: i18n.t('chat:menu.copyImage'),
    icon: <Icon name="copy" size="sm" />,
    onClick: () => { void copyImageToClipboard(imageUrl); },
  });
  if (!sourceUrl) items.push({
    key: 'open-original', type: 'action', label: i18n.t('chat:menu.openOriginal'),
    icon: <Icon name="external-link" size="sm" />,
    onClick: () => { window.open(imageUrl, '_blank', 'noopener'); },
  });
  items.push({ key: 'image-sep', type: 'separator' });
  return items;
}

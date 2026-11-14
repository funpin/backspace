import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '@backspace/shared';
import { useUIStore } from '../../stores/uiStore';
import { useTransferStore } from '../../stores/transferStore';
import { Tooltip } from '../ui/Tooltip';
import { useFormatters } from '../../i18n/formatters';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';
import { Button } from '../ui/Button';
import { CodeBlock } from './CodeBlock';
import { isPreviewableTextFile, languageOfFilename } from './codeLanguage';

/** A 1px edge drawn over a media box, so the box keeps the dimensions it reserved. */
const MEDIA_EDGE = 'after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-[inset_0_0_0_1px_var(--glass-border)]';

/** The 38px tile that carries a file card's icon. */
const ICON_TILE = 'grid place-items-center w-[38px] h-[38px] rounded-lg bg-accent-tone/[0.16] text-accent-tone flex-shrink-0';

/** The file type a card names next to the size: the extension, in capitals. */
function fileTypeOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  const extension = name.slice(dot + 1);
  return /^[a-z0-9]{1,8}$/i.test(extension) ? extension.toUpperCase() : null;
}

interface AttachmentRendererProps {
  attachment: Attachment;
}

/** Format a duration in seconds as `m:ss` (or `h:mm:ss` for long clips). */
function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Whether *this* browser can decode HEVC (H.265) in a <video> element.
 *
 * Web-playability of HEVC is browser-dependent, so the server's `playable`
 * flag (computed Chromium-first) can't be authoritative for every client:
 * WebKit (Safari on macOS/iOS) decodes HEVC via the OS, while Chromium,
 * Firefox and stock Electron cannot. HEVC is the codec that the server's
 * "unplayable" verdict effectively hinges on, so we probe for it here and let
 * capable browsers attempt playback rather than blindly showing the fallback.
 *
 * Computed once at module load. `canPlayType` returns '' when unsupported and
 * 'maybe'/'probably' otherwise; Safari reports support for the hvc1/hev1 tags.
 */
const BROWSER_SUPPORTS_HEVC: boolean = (() => {
  if (typeof document === 'undefined') return false;
  const v = document.createElement('video');
  return v.canPlayType('video/mp4; codecs="hvc1"') !== '' ||
    v.canPlayType('video/mp4; codecs="hev1"') !== '';
})();

/**
 * Resolves the displayable URL for an attachment. Same logic used by inline
 * `<img>`/`<video>`/`<audio>` rendering and the file-card download button —
 * exported so right-click menus can use it without duplicating the rule.
 */
export function attUrlOf(filename: string): string {
  if (filename.startsWith('http') || filename.startsWith('/')) return filename;
  return `/api/uploads/${filename}`;
}

interface VideoAttachmentProps {
  attachment: Attachment;
  attUrl: string;
  thumbUrl: string | null;
  federationInlineBadge: React.ReactNode;
}

/**
 * Video attachment with a graceful fallback for formats the browser can't
 * decode. The dominant case is a macOS screen recording (HEVC inside a .mov):
 * the upload succeeds and a server-side poster is generated, but inline
 * `<video>` playback silently fails (stuck at 0:00). We resolve this two ways:
 *
 *   1. Proactive — the server classifies web-playability from the probed codec
 *      (`attachment.playable === false`), so we render the download card
 *      directly with no flash of a dead player. This is honoured only when the
 *      current browser also can't decode the format: the server flag is
 *      Chromium-first, but WebKit (Safari/iOS) decodes HEVC, so a Safari user
 *      still gets inline playback (see `BROWSER_SUPPORTS_HEVC`).
 *   2. Reactive — for the optimistic/unknown cases, and for capable browsers
 *      attempting a flagged file, the `<video>` `onError` handler flips to the
 *      same card if playback actually fails at runtime.
 *
 * The fallback card surfaces the poster (still a useful preview), filename,
 * duration and size, and a one-tap download — never a silently broken player.
 */
function VideoAttachment({ attachment, attUrl, thumbUrl, federationInlineBadge }: VideoAttachmentProps) {
  const { t } = useTranslation(['chat']);
  const { formatBytes } = useFormatters();
  const startDownload = useTransferStore((s) => s.startDownload);
  // Pre-fail only when the server flagged it unplayable AND this browser can't
  // decode it anyway. Capable browsers (Safari/WebKit ⇒ HEVC) attempt playback
  // and fall back via onError if it genuinely fails.
  const [failed, setFailed] = useState(attachment.playable === false && !BROWSER_SUPPORTS_HEVC);

  const { width, height, originalName, mimetype, size, duration } = attachment;
  const hasDimensions = !!(width && height);
  const sizing = hasDimensions
    ? { aspectRatio: `${width}/${height}`, maxHeight: 300 }
    : undefined;

  if (failed) {
    const meta = [duration ? formatDuration(duration) : null, formatBytes(size)]
      .filter(Boolean)
      .join(' · ');
    return (
      <div className="mt-1 max-w-[400px]">
        <button
          type="button"
          onClick={() => {
            void startDownload(attUrl, { filename: originalName, size, mimetype, tray: true });
          }}
          className="block w-full text-left rounded-xl overflow-hidden bg-surface-elevated hover:bg-border-soft transition-colors duration-fast"
        >
          {thumbUrl && (
            <div className="relative w-full" style={sizing}>
              <img
                src={thumbUrl}
                alt={originalName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1.5 text-white">
                <Icon name="download" size="lg" />
                <span className="text-xs font-medium">{t('chat:attachment.video.cannotPlayDownload')}</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 p-2.5">
            {!thumbUrl && (
              <div className={ICON_TILE}>
                <Icon name="video" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-txt-primary text-sm font-medium truncate">{originalName}</p>
              <p className="text-xs text-txt-tertiary">
                {meta ? `${meta} · ` : ''}{t('chat:attachment.video.unsupportedFormat')}
              </p>
            </div>
            <span className="grid place-items-center w-[34px] h-[34px] flex-shrink-0 text-txt-secondary">
              <Icon name="download" />
            </span>
          </div>
        </button>
        {federationInlineBadge && <div className="mt-1">{federationInlineBadge}</div>}
      </div>
    );
  }

  return (
    <div className="mt-1 max-w-[400px]">
      <div
        className={`relative max-h-[300px] rounded-xl overflow-hidden ${MEDIA_EDGE}`}
        style={sizing}
      >
        <video
          controls
          preload={hasDimensions ? 'none' : 'metadata'}
          poster={thumbUrl ?? undefined}
          src={attUrl}
          onError={() => setFailed(true)}
          className="w-full h-full rounded-xl"
        >
          {t('chat:attachment.video.unsupportedBrowser')}
        </video>
      </div>
      {federationInlineBadge && <div className="mt-1">{federationInlineBadge}</div>}
    </div>
  );
}

export function AttachmentRenderer({ attachment }: AttachmentRendererProps) {
  const { t } = useTranslation(['chat']);
  const { formatBytes } = useFormatters();
  const openImagePreview = useUIStore((s) => s.openImagePreview);
  const startDownload = useTransferStore((s) => s.startDownload);

  const attUrl = attUrlOf(attachment.filename);

  const thumbUrl = attachment.thumbnailFilename
    ? attachment.thumbnailFilename.startsWith('http') || attachment.thumbnailFilename.startsWith('/')
      ? attachment.thumbnailFilename
      : `/api/uploads/${attachment.thumbnailFilename}`
    : null;

  const { mimetype, originalName, size } = attachment;

  // Federation status — build tooltip text
  const federationTooltip = (() => {
    if (!attachment.federationStatus) return null;

    if (attachment.federationStatus === 'remote') {
      let senderName: string | null = null;
      if (attachment.federationMeta) {
        try {
          const meta = JSON.parse(attachment.federationMeta);
          if (meta.sourceUsername) senderName = meta.sourceUsername;
        } catch { /* ignore */ }
      }
      const text = senderName
        ? t('chat:attachment.federation.remoteNamed', { sender: senderName })
        : t('chat:attachment.federation.remoteUnknown');
      return { text, type: 'remote' as const };
    }

    if (attachment.federationStatus === 'remote_partial') {
      let text = t('chat:attachment.federation.partialGeneric');
      if (attachment.federationMeta) {
        try {
          const meta: Array<{ username: string; limit: number }> = JSON.parse(attachment.federationMeta);
          if (meta.length > 0) {
            const parts = meta.map(u =>
              t('chat:attachment.federation.partialInstance', { username: u.username, limit: formatBytes(u.limit) }),
            );
            const instances = parts.reduce((first, second) =>
              t('chat:attachment.federation.listPair', { first, second }),
            );
            text = t('chat:attachment.federation.partialList', { instances });
          }
        } catch { /* ignore */ }
      }
      return { text, type: 'remote_partial' as const };
    }

    return null;
  })();

  // Inline badge — sits next to file size or below media, never absolute-positioned
  const federationInlineBadge = federationTooltip ? (
    <Tooltip content={federationTooltip.text} position="top">
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded glass-pill text-xs cursor-default ${federationTooltip.type === 'remote' ? 'text-txt-tertiary' : 'text-status-warn'}`}>
        <Icon name={federationTooltip.type === 'remote' ? 'cloud' : 'triangle-alert'} size="xs" />
      </div>
    </Tooltip>
  ) : null;

  if (mimetype.startsWith('image/')) {
    const { width, height } = attachment;
    return (
      <div className="mt-1 max-w-fit">
        <div
          className="relative rounded-xl overflow-hidden border border-glass-border"
          style={width && height ? { aspectRatio: `${width}/${height}`, maxWidth: Math.min(width, 400), maxHeight: 300 } : undefined}
        >
          <img
            src={thumbUrl ?? attUrl}
            data-sticker-source={attUrl}
            alt={originalName}
            className="w-full h-full max-w-[400px] max-h-[300px] object-contain cursor-pointer hover:brightness-95 transition-[filter] duration-fast"
            onClick={() => openImagePreview(attUrl)}
            loading="lazy"
          />
          {mimetype === 'image/gif' && (
            <Tag tone="onMedia" className="absolute left-2 top-2 pointer-events-none">{t('chat:composer.gif')}</Tag>
          )}
        </div>
        {federationInlineBadge && <div className="mt-1">{federationInlineBadge}</div>}
      </div>
    );
  }

  if (mimetype.startsWith('video/')) {
    return (
      <VideoAttachment
        attachment={attachment}
        attUrl={attUrl}
        thumbUrl={thumbUrl}
        federationInlineBadge={federationInlineBadge}
      />
    );
  }

  if (mimetype.startsWith('audio/')) {
    return (
      <div className="relative mt-1 flex flex-col p-2.5 bg-surface-elevated rounded-xl max-w-[420px]">
        <div className="flex items-center gap-2.5">
          <div className={ICON_TILE}>
            <Icon name="music" />
          </div>
          <div className="min-w-0">
            <p className="text-txt-primary text-sm font-medium truncate">{originalName}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-txt-tertiary tabular-nums">{formatBytes(size)}</p>
              {federationInlineBadge}
            </div>
          </div>
        </div>
        <audio controls preload="metadata" className="w-full mt-2 h-8">
          <source src={attUrl} type={mimetype} />
          {t('chat:attachment.audio.unsupportedBrowser')}
        </audio>
      </div>
    );
  }

  // Generic-file chip (PDF / .zip / .exe / unknown mimetypes).
  //
  // Width contract: the chip must fit inside the message column on every
  // viewport. We cap at 400 px on roomy layouts but `max-w-full` keeps it
  // inside narrow columns (mobile, narrow desktop window, threaded reply
  // contexts). `min-w-0` is the critical bit on the inner flex children — the
  // outer button is a flex container with a fixed-size icon and a flexible
  // text block; without `min-w-0` the long-filename child would refuse to
  // shrink (flex children's min-content size defaults to their intrinsic
  // content) and would push the entire chip past the parent's right edge.
  //
  // The whole card is the download control, as before; the glyph at its right
  // edge is the card's own affordance and not a second button inside it.
  const fileType = fileTypeOf(originalName);
  const previewable = isPreviewableTextFile(originalName, mimetype, size);
  return (
    <div className="mt-1 max-w-full min-w-0">
    <button
      type="button"
      onClick={() => {
        void startDownload(attUrl, {
          filename: originalName,
          size,
          mimetype,
          tray: true,
        });
      }}
      className="max-w-full desktop:max-w-[400px] flex items-center gap-2.5 p-2.5 bg-surface-elevated rounded-xl hover:bg-border-soft transition-colors duration-fast group/att text-left w-full min-w-0"
    >
      <div className={ICON_TILE}>
        <Icon name="file-text" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-txt-primary text-sm font-medium truncate">{originalName}</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-txt-tertiary">
          <p className="tabular-nums">{formatBytes(size)}</p>
          {fileType && <span>{fileType}</span>}
          {federationInlineBadge}
        </div>
      </div>
      <span className="grid place-items-center w-[34px] h-[34px] rounded-lg flex-shrink-0 text-txt-secondary group-hover/att:text-txt-primary transition-colors duration-fast">
        <Icon name="download" />
      </span>
    </button>
    {previewable && <TextFilePreview url={attUrl} name={originalName} />}
    </div>
  );
}

/** How much of a text file the preview reads; the rest stays in the download. */
const PREVIEW_MAX_CHARS = 64 * 1024;

type PreviewState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'open'; text: string; truncated: boolean };

/**
 * The "show contents" control under a text file's card. The file is fetched
 * only when the reader asks, so a message's height changes by their action
 * and never while the list is settling (docs/systems/message-list.md).
 */
function TextFilePreview({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation(['chat']);
  const [state, setState] = useState<PreviewState>({ status: 'closed' });
  const requestRef = useRef(0);

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  const toggle = (): void => {
    if (state.status !== 'closed' && state.status !== 'failed') {
      requestRef.current += 1;
      setState({ status: 'closed' });
      return;
    }
    const request = ++requestRef.current;
    setState({ status: 'loading' });
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (requestRef.current !== request) return;
        const truncated = text.length > PREVIEW_MAX_CHARS;
        setState({ status: 'open', text: truncated ? text.slice(0, PREVIEW_MAX_CHARS) : text, truncated });
      })
      .catch(() => {
        if (requestRef.current === request) setState({ status: 'failed' });
      });
  };

  const open = state.status === 'open' || state.status === 'loading';
  return (
    <div className="mt-1">
      <Button variant="ghost" size="sm" icon={open ? 'chevron-up' : 'chevron-down'} loading={state.status === 'loading'} aria-expanded={open} onClick={toggle}>
        {open ? t('chat:attachment.preview.hide') : t('chat:attachment.preview.show')}
      </Button>
      {state.status === 'failed' && <p role="alert" className="mt-1 text-xs text-status-danger">{t('chat:attachment.preview.failed')}</p>}
      {state.status === 'open' && (
        <>
          <CodeBlock language={languageOfFilename(name)} code={state.text} title={name} />
          {state.truncated && <p className="mt-1 text-xs text-txt-tertiary">{t('chat:attachment.preview.truncated')}</p>}
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Embed } from '@backspace/shared';
import { Icon } from '../../ui/Icon';

interface VideoEmbedProps {
  embed: Embed;
}

export function VideoEmbed({ embed }: VideoEmbedProps) {
  const { t } = useTranslation('chat');
  const [isPlaying, setIsPlaying] = useState(false);

  // Direct video URL — no provider, no embedUrl
  if (!embed.provider && !embed.embedUrl) {
    return (
      <div
        className="mt-2 max-w-[400px] rounded-xl overflow-hidden bg-surface-input"
        style={{ aspectRatio: '16/9' }}
      >
        <video
          src={embed.url}
          controls
          preload="none"
          className="w-full h-full rounded-xl"
        />
      </div>
    );
  }

  // Provider iframe (YouTube / Vimeo)
  const providerLabel = embed.provider
    ? embed.provider.charAt(0).toUpperCase() + embed.provider.slice(1)
    : null;

  return (
    <div className="mt-2 max-w-[400px] rounded-xl overflow-hidden bg-surface-elevated border border-border-soft">
      {/* 16:9 video area */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        {isPlaying && embed.embedUrl ? (
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`${embed.embedUrl}?autoplay=1&origin=${encodeURIComponent(window.location.origin)}`}
            title={embed.title ?? t('embed.videoTitle')}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            data-embed-thumbnail
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 w-full h-full flex items-center justify-center group focus:outline-none"
            aria-label={embed.title ? t('embed.playNamed', { title: embed.title }) : t('embed.playUnnamed')}
          >
            {embed.image ? (
              <img
                src={embed.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 bg-black/60" />
            )}
            {/* Play control: a round of dark glass over the poster */}
            <span className="glass-bubble relative z-raised flex items-center justify-center w-14 h-14 rounded-full text-white group-hover:scale-110 transition-transform duration-base ease-pop">
              <Icon name="play" size="lg" />
            </span>
          </button>
        )}
      </div>

      {/* Title / provider footer */}
      {(embed.title || providerLabel) && (
        <div className="px-3 py-2">
          {providerLabel && (
            <div className="text-xs text-txt-tertiary font-medium mb-0.5">
              {providerLabel}
            </div>
          )}
          {embed.title && (
            <a
              href={embed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-txt-link font-semibold hover:underline line-clamp-2"
            >
              {embed.title}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

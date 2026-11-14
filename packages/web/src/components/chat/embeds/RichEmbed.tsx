import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Embed } from '@backspace/shared';
import { Icon } from '../../ui/Icon';

interface RichEmbedProps {
  embed: Embed;
}

const PROVIDER_HEIGHTS: Record<string, number> = {
  spotify: 152,
};

function getIframeHeight(embed: Embed): number {
  if (embed.height != null) return embed.height;
  if (embed.provider != null) {
    const providerHeight = PROVIDER_HEIGHTS[embed.provider];
    if (providerHeight != null) return providerHeight;
  }
  return 200;
}

export function RichEmbed({ embed }: RichEmbedProps) {
  const { t } = useTranslation('chat');
  const [isLoaded, setIsLoaded] = useState(false);
  const iframeHeight = getIframeHeight(embed);

  const providerLabel = embed.provider
    ? embed.provider.charAt(0).toUpperCase() + embed.provider.slice(1)
    : null;

  if (!embed.embedUrl) return null;

  return (
    <div className="mt-2 max-w-[400px] rounded-xl overflow-hidden bg-surface-elevated border border-border-soft">
      {isLoaded ? (
        <iframe
          src={embed.embedUrl}
          title={embed.title ?? providerLabel ?? t('embed.frameTitle')}
          height={iframeHeight}
          className="w-full block"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsLoaded(true)}
          className="w-full text-left focus:outline-none group"
          aria-label={providerLabel ? t('embed.loadNamed', { name: providerLabel }) : t('embed.loadUnnamed')}
        >
          <div className="flex items-start gap-3 p-3">
            {embed.image && (
              <div data-embed-thumbnail className="w-[80px] h-[80px] flex-shrink-0">
                <img
                  src={embed.image}
                  alt=""
                  className="w-full h-full object-cover rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {providerLabel && (
                <div className="text-xs text-txt-tertiary font-medium mb-1">
                  {providerLabel}
                </div>
              )}
              {embed.title && (
                <div className="text-sm text-txt-link font-semibold group-hover:underline line-clamp-2">
                  {embed.title}
                </div>
              )}
              {embed.description && (
                <div className="text-compact text-txt-secondary mt-1 line-clamp-2">
                  {embed.description}
                </div>
              )}
              <div className="text-xs text-txt-secondary group-hover:text-txt-primary transition-colors duration-fast mt-2 flex items-center gap-1.5">
                <Icon name="play" size="xs" />
                {t('embed.loadAction')}
              </div>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}

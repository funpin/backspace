import React, { type CSSProperties } from 'react';
import type { Embed } from '@backspace/shared';

interface GenericEmbedProps {
  embed: Embed;
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * The left rail of an embed card, drawn only when the embed carries a colour
 * of its own (the site's theme colour). That colour is content; a card
 * without one has no rail. Anything that is not a plain hex colour is ignored
 * rather than passed into a style.
 */
export function embedRail(color: string | null): { className: string; style: CSSProperties | undefined } {
  if (color === null || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return { className: '', style: undefined };
  }
  return { className: 'border-l-[3px]', style: { borderLeftColor: color } };
}

export function GenericEmbed({ embed }: GenericEmbedProps) {
  if (!embed.title) return null;

  const providerName = embed.provider ?? hostnameFromUrl(embed.url);
  const rail = embedRail(embed.color);

  return (
    <div className={`mt-2 max-w-[400px] bg-surface-elevated rounded-xl flex overflow-hidden ${rail.className}`} style={rail.style}>
      <div className="flex-1 p-3 min-w-0">
        {providerName && (
          <div className="text-xs text-txt-tertiary font-medium mb-1 truncate">
            {providerName}
          </div>
        )}
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-base text-txt-link font-semibold hover:underline block mb-2 truncate"
        >
          {embed.title}
        </a>
        {embed.description && (
          <div className="text-compact text-txt-secondary line-clamp-3">
            {embed.description}
          </div>
        )}
      </div>
      {embed.image && (
        <div data-embed-thumbnail className="w-[80px] h-[80px] m-3 flex-shrink-0">
          <img
            src={embed.image}
            alt=""
            className="w-full h-full object-cover rounded-lg"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}

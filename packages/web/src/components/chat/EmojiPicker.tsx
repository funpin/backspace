import { useTranslation } from 'react-i18next';
import { StickerPicker } from './StickerPicker';
import React, { useRef, useEffect, useState } from 'react';
import Picker from '@emoji-mart/react';
import { loadEmojiData } from '../../utils/emojiData';
import { Icon } from '../ui/Icon';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: { native: string }) => void;
  /**
   * Mobile rendering: stretch the picker to fill its container width
   * (the parent bottom-sheet provides the viewport-wide bounds), use
   * larger touch targets, and let the picker's own scroll area expand
   * to consume the available height of the sheet.
   */
  mobile?: boolean;
  stickers?: boolean;
}

/** The two tabs above the picker: the chosen one is raised and takes the theme's tone. */
function tabClass(selected: boolean): string {
  return `inline-flex items-center justify-center h-7 rounded-lg text-compact font-medium transition-colors duration-fast ${
    selected
      ? 'bg-interactive-selected text-accent-tone'
      : 'text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary'
  }`;
}

export function EmojiPicker({ onEmojiSelect, mobile = false, stickers = true }: EmojiPickerProps) {
  const { t } = useTranslation('chat');
  const [showStickers, setShowStickers] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent keyboard events from bubbling out (e.g. Enter submitting the chat input)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    el.addEventListener('keydown', stop);
    return () => el.removeEventListener('keydown', stop);
  }, []);

  // emoji-mart's Picker computes its own internal width from
  // `perLine * emojiButtonSize` UNLESS `dynamicWidth` is set, in which case
  // it stretches to its parent's width. On mobile we want full-viewport.
  // The mobile sheet wraps this picker in `flex-1 min-h-0 flex flex-col`,
  // so we make the wrapper fill that space and tell the picker to expand.
  //
  // The `<em-emoji-picker>` custom element has no intrinsic stretch behavior:
  // even with `dynamicWidth: true` it ships with `display: flex` but no
  // `width: 100%`, so it shrinks to its perLine*emojiButtonSize content width
  // unless we force it to fill. The `emoji-picker-wrapper--mobile` modifier
  // applies that override (see globals.css) — desktop keeps the legacy
  // intrinsic-width sizing.
  const wrapperClass = mobile
    ? 'emoji-picker-wrapper emoji-picker-wrapper--mobile flex-1 min-h-0 w-full overflow-hidden'
    : 'emoji-picker-wrapper flex flex-col';

  return (
    <div ref={containerRef} className={wrapperClass}>
      {stickers && (
        <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1">
          <button
            type="button"
            aria-pressed={!showStickers}
            onClick={() => setShowStickers(false)}
            className={`${tabClass(!showStickers)} px-3`}
          >
            {t('composer.emoji')}
          </button>
          <button
            type="button"
            aria-pressed={showStickers}
            aria-label={t('stickers.title')}
            title={t('stickers.title')}
            onClick={() => setShowStickers(true)}
            className={`${tabClass(showStickers)} w-7`}
          >
            <Icon name="sticker" size="sm" />
          </button>
        </div>
      )}
      {stickers && showStickers ? <StickerPicker mobile={mobile} onSelect={token => onEmojiSelect({ native: token })} /> : <Picker
        data={loadEmojiData}
        onEmojiSelect={onEmojiSelect}
        theme="dark"
        set="native"
        skinTonePosition="search"
        previewPosition="none"
        navPosition="bottom"
        perLine={mobile ? 8 : 10}
        maxFrequentRows={2}
        emojiSize={mobile ? 28 : 24}
        emojiButtonSize={mobile ? 40 : 32}
        dynamicWidth={mobile ? true : false}
        categories={['frequent', 'people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags']}
      />}
    </div>
  );
}

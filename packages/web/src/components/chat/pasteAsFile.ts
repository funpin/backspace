import { MAX_MESSAGE_LENGTH } from '@backspace/shared';

/** The name a long paste gets when it is attached as a file. */
export const PASTED_FILE_NAME = 'pasted.txt';

/** A paste with more lines than this is attached as a file even when it would fit. */
export const PASTE_AS_FILE_LINES = 50;

/**
 * Whether pasted text should be attached as `pasted.txt` instead of entering
 * the composer: it would not fit in one message next to what is already
 * typed, or it is long enough to bury the conversation.
 */
export function shouldPasteAsFile(text: string, draftLength: number): boolean {
  if (text.length === 0) return false;
  if (draftLength + text.length > MAX_MESSAGE_LENGTH) return true;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 && ++lines > PASTE_AS_FILE_LINES) return true;
  }
  return false;
}

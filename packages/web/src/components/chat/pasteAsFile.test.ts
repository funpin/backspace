import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH } from '@backspace/shared';
import { PASTE_AS_FILE_LINES, shouldPasteAsFile } from './pasteAsFile';

describe('shouldPasteAsFile', () => {
  it('lets ordinary text into the composer', () => {
    expect(shouldPasteAsFile('', 0)).toBe(false);
    expect(shouldPasteAsFile('a short line', 0)).toBe(false);
    expect(shouldPasteAsFile('x'.repeat(MAX_MESSAGE_LENGTH), 0)).toBe(false);
  });

  it('attaches text that would not fit next to the draft', () => {
    expect(shouldPasteAsFile('x'.repeat(MAX_MESSAGE_LENGTH + 1), 0)).toBe(true);
    expect(shouldPasteAsFile('x'.repeat(100), MAX_MESSAGE_LENGTH - 50)).toBe(true);
  });

  it('attaches text with too many lines', () => {
    expect(shouldPasteAsFile('a\n'.repeat(PASTE_AS_FILE_LINES - 1) + 'a', 0)).toBe(false);
    expect(shouldPasteAsFile('a\n'.repeat(PASTE_AS_FILE_LINES) + 'a', 0)).toBe(true);
  });
});

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EYES_STANDARD, MARK_BODY, MARK_HEAD, eyePath } from './markGeometry';

// The logo files are drawn by scripts/b-space-kit.mjs. The app draws the
// mark inline from markGeometry.ts; both must stay the same drawing.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const kitMark = readFileSync(join(repoRoot, 'assets/brand/b-space/mark-mono-black.svg'), 'utf8');

describe('markGeometry', () => {
  it('matches the head and body of the logo files', () => {
    expect(kitMark).toContain(`d="${MARK_HEAD}`);
    expect(kitMark).toContain(`d="${MARK_BODY}`);
  });

  it('matches the eyes of the logo files', () => {
    for (const eye of EYES_STANDARD) expect(kitMark).toContain(eyePath(eye));
  });
});

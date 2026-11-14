/**
 * Geometry of the B:SPACE mark: the letter B made of two chat replies on a
 * 100-unit grid (the mark spans x 20..80, y 10..90). The head is the upper
 * reply, its tail at the lower left at 45°; the body is the lower reply,
 * its upper-left corner cut parallel to that tail 5 units away. The eyes
 * sit in the head.
 *
 * Source of truth: scripts/b-space-kit.mjs, which draws the logo files in
 * assets/brand/. markGeometry.test.ts checks these strings against them.
 */

export const MARK_HEAD = 'M26 10H57A18 18 0 0 1 57 46H36Q33 46 30.88 48.12L21.77 57.23Q20 59 20 56.5V16A6 6 0 0 1 26 10Z';

export const MARK_BODY = 'M32.95 53.12Q35.07 51 38.07 51H60.5A19.5 19.5 0 0 1 60.5 90H26A6 6 0 0 1 20 84V69.07Q20 66.07 22.12 63.95Z';

/** The screen cut out of the body while the user shares their screen. */
export const MARK_SCREEN = 'M43 60H65A3 3 0 0 1 68 63V77A3 3 0 0 1 65 80H43A3 3 0 0 1 40 77V63A3 3 0 0 1 43 60Z';

export interface Eye {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Eyes for 32 px and up. */
export const EYES_STANDARD: readonly [Eye, Eye] = [
  { cx: 41, cy: 26, rx: 3.6, ry: 5.6 },
  { cx: 56, cy: 26, rx: 3.6, ry: 5.6 },
];

/** Larger eyes, wider apart, so they survive at 24 px and below. */
export const EYES_SMALL: readonly [Eye, Eye] = [
  { cx: 39.5, cy: 27, rx: 5, ry: 7 },
  { cx: 57, cy: 27, rx: 5, ry: 7 },
];

export function eyePath({ cx, cy, rx, ry }: Eye): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
}

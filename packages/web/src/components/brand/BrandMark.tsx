import type { JSX } from 'react';
import { EYES_SMALL, EYES_STANDARD, MARK_BODY, MARK_HEAD, eyePath } from './markGeometry';

/**
 * The B:SPACE mark as an inline icon in one colour (it takes the text
 * colour), eyes cut out so the surface shows through. `size` is the box
 * edge in px; the mark's 80-unit height fills it and sits centred like the
 * square icons beside it. At 24 px and below it switches to the larger
 * eyes. Decorative: the label next to it names the destination.
 */
export function BrandMark(props: { size?: number; className?: string }): JSX.Element {
  const { size = 24, className } = props;
  const eyes = size <= 24 ? EYES_SMALL : EYES_STANDARD;
  return (
    <svg
      width={size}
      height={size}
      viewBox="10 10 80 80"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      data-brand-mark
    >
      <path d={MARK_BODY} />
      <path d={`${MARK_HEAD}${eyes.map(eyePath).join('')}`} fillRule="evenodd" />
    </svg>
  );
}

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Mascot, MASCOT_STATES } from '../Mascot';
import { MARK_BODY, MARK_HEAD, MARK_SCREEN } from '../../brand/markGeometry';

describe('Mascot', () => {
  it('is decorative: a presentation wrapper around a hidden SVG', () => {
    const { container } = render(<Mascot state="idle" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('role')).toBe('presentation');
    expect(wrapper.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the logo: the head and body of the mark', () => {
    const { container } = render(<Mascot state="idle" />);
    const paths = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d'));
    expect(paths).toContain(MARK_HEAD);
    expect(paths).toContain(MARK_BODY);
  });

  it('cuts the eyes out of the head through its own mask', () => {
    const { container } = render(
      <>
        <Mascot state="idle" />
        <Mascot state="idle" />
      </>,
    );
    const masks = Array.from(container.querySelectorAll('mask')).map((m) => m.id);
    expect(new Set(masks).size).toBe(2);
    const heads = Array.from(container.querySelectorAll('path')).filter((p) => p.getAttribute('d') === MARK_HEAD);
    expect(heads.map((h) => h.getAttribute('mask'))).toEqual(masks.map((id) => `url(#${id})`));
    expect(container.querySelectorAll('mask .mascot-eye')).toHaveLength(4);
  });

  it('names its state for the CSS motion of that state', () => {
    for (const state of MASCOT_STATES) {
      const { container, unmount } = render(<Mascot state={state} />);
      expect(container.querySelector('svg')!.getAttribute('class')).toBe(`mascot mascot--${state}`);
      expect(container.firstElementChild!.getAttribute('data-mascot-state')).toBe(state);
      unmount();
    }
  });

  it('shows the unread dot only when notifying', () => {
    expect(render(<Mascot state="notify" />).container.querySelector('circle.fill-status-danger')).not.toBeNull();
    expect(render(<Mascot state="idle" />).container.querySelector('circle.fill-status-danger')).toBeNull();
  });

  it('turns the body into a screen while sharing', () => {
    const { container } = render(<Mascot state="screen" />);
    expect(container.querySelector('.mascot-body')!.getAttribute('d')).toBe(`${MARK_BODY}${MARK_SCREEN}`);
    expect(container.querySelector('.mascot-live')).not.toBeNull();
  });

  it('greys out when offline', () => {
    const { container } = render(<Mascot state="offline" />);
    expect(container.querySelector('.mascot-body')!.getAttribute('class')).toContain('fill-status-offline');
  });

  it('applies the size classes it is given', () => {
    const { container } = render(<Mascot state="idle" className="w-20 h-20" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('w-20 h-20');
  });
});

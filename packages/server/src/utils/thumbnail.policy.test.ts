import { describe, it, expect, beforeEach, vi } from 'vitest';

let disabled = false;
const sharpCalls = vi.fn();

vi.mock('../config.js', async () => {
  const real = await import('../config.js');
  return {
    config: new Proxy(real.config, {
      get(target, prop: string) {
        if (prop === 'thumbnailsDisabled') return disabled;
        return (target as Record<string, unknown>)[prop];
      },
    }),
  };
});

// A stand-in image 2000 px wide, so the only reason not to write a thumbnail is the policy.
vi.mock('sharp', () => ({
  default: (input: string) => {
    sharpCalls(input);
    return {
      metadata: async () => ({ width: 2000, pages: 1 }),
      resize: () => ({ webp: () => ({ toFile: async () => undefined }) }),
    };
  },
}));

beforeEach(() => {
  disabled = false;
  sharpCalls.mockClear();
});

describe('THUMBNAILS_DISABLED', () => {
  it('writes a thumbnail for a wide image while the policy is off', async () => {
    const { generateThumbnail } = await import('./thumbnail.js');
    expect(await generateThumbnail('/uploads/abc.png', 'image/png', '/uploads')).toBe('abc_thumb.webp');
  });

  it('returns no thumbnail and never opens the image while the policy is on', async () => {
    const { generateThumbnail } = await import('./thumbnail.js');
    disabled = true;
    expect(await generateThumbnail('/uploads/abc.png', 'image/png', '/uploads')).toBeNull();
    expect(sharpCalls).not.toHaveBeenCalled();
  });
});

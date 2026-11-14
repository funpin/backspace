import { describe, expect, it } from 'vitest';
import { IDENTITY_ZOOM, MAX_ZOOM, centeredOn, clampZoom, viewportOf, zoomAt } from './useStageZoom';

const W = 1000;
const H = 500;

describe('zoomAt', () => {
  it('keeps the point under the pointer where it was', () => {
    const zoomed = zoomAt(IDENTITY_ZOOM, 2, 250, 100, W, H);

    expect(zoomed.scale).toBe(2);
    // Picture point (250, 100) is drawn at x + 250 * scale.
    expect(zoomed.x + 250 * zoomed.scale).toBeCloseTo(250);
    expect(zoomed.y + 100 * zoomed.scale).toBeCloseTo(100);
  });

  it('zooms a second time around a different point without jumping', () => {
    const first = zoomAt(IDENTITY_ZOOM, 2, 500, 250, W, H);
    // Stage point (800, 400) shows picture point ((800 - x) / scale, ...).
    const pictureX = (800 - first.x) / first.scale;
    const pictureY = (400 - first.y) / first.scale;

    const second = zoomAt(first, 1.5, 800, 400, W, H);

    expect(second.x + pictureX * second.scale).toBeCloseTo(800);
    expect(second.y + pictureY * second.scale).toBeCloseTo(400);
  });

  it('stops at the maximum and returns to identity at the minimum', () => {
    expect(zoomAt(IDENTITY_ZOOM, 100, 0, 0, W, H).scale).toBe(MAX_ZOOM);
    const zoomed = zoomAt(IDENTITY_ZOOM, 3, 900, 450, W, H);
    expect(zoomAt(zoomed, 0.01, 10, 10, W, H)).toEqual(IDENTITY_ZOOM);
  });

  it('never leaves an empty band when zooming near a corner', () => {
    const zoomed = zoomAt(IDENTITY_ZOOM, 2, W, H, W, H);

    expect(zoomed.x).toBe(W - W * 2);
    expect(zoomed.y).toBe(H - H * 2);
  });
});

describe('clampZoom', () => {
  it('stops a pan when an edge of the picture meets the edge of the stage', () => {
    expect(clampZoom({ scale: 2, x: 300, y: 300 }, W, H)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(clampZoom({ scale: 2, x: -5000, y: -5000 }, W, H)).toEqual({ scale: 2, x: -W, y: -H });
  });

  it('pulls the picture back when the stage grows', () => {
    const before = clampZoom({ scale: 2, x: -1000, y: -500 }, W, H);
    expect(clampZoom(before, 800, 400)).toEqual({ scale: 2, x: -800, y: -400 });
  });
});

describe('viewport geometry', () => {
  it('reports the visible part of the stage as fractions of it', () => {
    expect(viewportOf({ scale: 1, x: 0, y: 0 }, 1000, 500)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    // 2x, panned so the view starts a quarter in from the left and at the top.
    expect(viewportOf({ scale: 2, x: -500, y: 0 }, 1000, 500)).toMatchObject({ left: 0.25, width: 0.5, height: 0.5 });
    expect(viewportOf({ scale: 2, x: 0, y: 0 }, 0, 0)).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it('centres the view on a point of the stage, stopping at its edges', () => {
    const centred = centeredOn({ scale: 2, x: 0, y: 0 }, 0.5, 0.5, 1000, 500);
    expect(viewportOf(centred, 1000, 500)).toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 });

    // A corner cannot be centred: the view stops with its own corner there.
    const corner = centeredOn({ scale: 2, x: 0, y: 0 }, 1, 1, 1000, 500);
    expect(viewportOf(corner, 1000, 500)).toEqual({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 });
  });
});


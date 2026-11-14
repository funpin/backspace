import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ playSound: vi.fn() }) },
}));

import { PING_WINDOW, getPingHistory, pushPing, resetPingHistory, roundTripSince, summarizePings } from './pingHistory';
import { pingGraphShape } from '../components/voice/PingGraph';

beforeEach(() => resetPingHistory());

describe('ping history', () => {
  it('keeps the newest window of samples, gaps included', () => {
    for (let i = 0; i < PING_WINDOW + 5; i++) pushPing(i === PING_WINDOW ? null : i);

    const history = getPingHistory();
    expect(history).toHaveLength(PING_WINDOW);
    expect(history[0]).toBe(5);
    expect(history[PING_WINDOW - 5]).toBeNull();
    expect(history[PING_WINDOW - 1]).toBe(PING_WINDOW + 4);
  });

  it('summarises only the samples that were taken', () => {
    expect(summarizePings([null, null])).toBeNull();
    expect(summarizePings([10, null, 90, 20])).toEqual({ min: 10, avg: 40, max: 90 });
  });
});

describe('roundTripSince', () => {
  it('averages the checks answered since the previous sample, so an overwritten spike still counts', () => {
    // Two checks answered: 90 ms and 10 ms. The latest alone would read 10.
    expect(roundTripSince(
      { totalRoundTripTime: 1, responsesReceived: 10 },
      { totalRoundTripTime: 1.1, responsesReceived: 12 },
      0.01,
    )).toBe(50);
  });

  it('falls back to the latest value when no check was answered in the interval, or on the first sample', () => {
    const counters = { totalRoundTripTime: 1, responsesReceived: 10 };
    expect(roundTripSince(counters, counters, 0.042)).toBe(42);
    expect(roundTripSince(null, counters, 0.042)).toBe(42);
    expect(roundTripSince(null, null, null)).toBeNull();
  });
});

describe('pingGraphShape', () => {
  it('right-aligns a young history and breaks the line at a missing sample', () => {
    const { scale, runs } = pingGraphShape([50, 100, null, 0], 119, 100);

    expect(scale).toBe(150);
    expect(runs).toHaveLength(2);
    // The newest sample sits on the right edge, at the bottom for 0 ms.
    expect(runs[1]).toEqual([{ x: 119, y: 100 }]);
    expect(runs[0]).toEqual([{ x: 116, y: 66.7 }, { x: 117, y: 33.3 }]);
  });

  it('never zooms the scale in past 100 ms', () => {
    expect(pingGraphShape([4, 6, 5], 119, 100).scale).toBe(100);
  });
});

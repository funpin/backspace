import { describe, expect, it } from 'vitest';
import {
  containedBox,
  encodeStreamPointer,
  parseStreamPointer,
  pointInPicture,
  streamPointerFor,
} from './streamPointerProtocol';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('stream pointer wire format', () => {
  it('round-trips a move, a click and a leave', () => {
    expect(parseStreamPointer(encodeStreamPointer(streamPointerFor('bob', { x: 0.123456, y: 1 }))))
      .toEqual({ type: 'stream_pointer', target: 'bob', x: 0.1235, y: 1 });
    expect(parseStreamPointer(encodeStreamPointer(streamPointerFor('bob', { x: 0, y: 0.5 }, true))))
      .toEqual({ type: 'stream_pointer', target: 'bob', x: 0, y: 0.5, ping: true });
    expect(parseStreamPointer(encodeStreamPointer(streamPointerFor('bob', null))))
      .toEqual({ type: 'stream_pointer', target: 'bob', x: null, y: null });
  });

  it('rejects positions outside the picture and malformed messages', () => {
    expect(parseStreamPointer(encode({ type: 'stream_pointer', target: 'bob', x: 1.2, y: 0.5 }))).toBeNull();
    expect(parseStreamPointer(encode({ type: 'stream_pointer', target: 'bob', x: -0.1, y: 0.5 }))).toBeNull();
    expect(parseStreamPointer(encode({ type: 'stream_pointer', target: 'bob', x: null, y: 0.5 }))).toBeNull();
    expect(parseStreamPointer(encode({ type: 'stream_pointer', target: 'bob', x: '0.5', y: 0.5 }))).toBeNull();
    expect(parseStreamPointer(encode({ type: 'stream_pointer', x: 0.5, y: 0.5 }))).toBeNull();
    expect(parseStreamPointer(encode({ type: 'stream_watch', target: 'bob', watching: true }))).toBeNull();
    expect(parseStreamPointer(new TextEncoder().encode('not json'))).toBeNull();
  });
});

describe('stream pointer geometry', () => {
  it('finds a letterboxed picture inside its box', () => {
    expect(containedBox({ left: 0, top: 0, width: 800, height: 800 }, 1600, 900))
      .toEqual({ left: 0, top: 175, width: 800, height: 450 });
    expect(containedBox({ left: 10, top: 20, width: 1600, height: 450 }, 1600, 900))
      .toEqual({ left: 410, top: 20, width: 800, height: 450 });
    expect(containedBox({ left: 0, top: 0, width: 800, height: 800 }, 0, 0)).toBeNull();
  });

  it('maps a client position to the same point of the picture at any zoom', () => {
    const plain = { left: 100, top: 50, width: 800, height: 450 };
    expect(pointInPicture(300, 162.5, plain, 1600, 900)).toEqual({ x: 0.25, y: 0.25 });
    // The same picture zoomed 2x and panned: its box is twice the size and shifted.
    const zoomed = { left: -300, top: -175, width: 1600, height: 900 };
    expect(pointInPicture(100, 50, zoomed, 1600, 900)).toEqual({ x: 0.25, y: 0.25 });
  });

  it('gives no point on a letterbox band', () => {
    expect(pointInPicture(400, 100, { left: 0, top: 0, width: 800, height: 800 }, 1600, 900)).toBeNull();
    expect(pointInPicture(400, 400, { left: 0, top: 0, width: 800, height: 800 }, 1600, 900)).toEqual({ x: 0.5, y: 0.5 });
  });
});

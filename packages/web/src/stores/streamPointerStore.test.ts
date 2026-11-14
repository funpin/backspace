import { beforeEach, describe, expect, it } from 'vitest';
import { useStreamPointerStore } from './streamPointerStore';

const store = () => useStreamPointerStore.getState();

beforeEach(() => store().reset());

describe('streamPointerStore', () => {
  it('keeps one pointer per sender per share and remembers its last click', () => {
    store().record('bob', 'eve', { x: 0.1, y: 0.2 }, true);
    const pingAt = store().pointers.get('bob')?.get('eve')?.pingAt ?? 0;
    expect(pingAt).toBeGreaterThan(0);

    store().record('bob', 'eve', { x: 0.3, y: 0.4 }, false);

    expect(store().pointers.get('bob')?.size).toBe(1);
    expect(store().pointers.get('bob')?.get('eve')).toMatchObject({ point: { x: 0.3, y: 0.4 }, pingAt });
  });

  it('drops a pointer when its owner leaves the picture', () => {
    store().record('bob', 'eve', { x: 0.1, y: 0.2 }, false);
    store().record('bob', 'eve', null, false);

    expect(store().pointers.has('bob')).toBe(false);
  });

  it('drops a leaving participant from every share and an ended share entirely', () => {
    store().record('bob', 'eve', { x: 0.1, y: 0.2 }, false);
    store().record('bob', 'dan', { x: 0.1, y: 0.2 }, false);
    store().record('kim', 'eve', { x: 0.1, y: 0.2 }, false);

    store().clearSender('eve');
    expect([...store().pointers.get('bob')?.keys() ?? []]).toEqual(['dan']);
    expect(store().pointers.has('kim')).toBe(false);

    store().clearSharer('bob');
    expect(store().pointers.size).toBe(0);
  });

  it('forgets everything, pointing included, when the call ends', () => {
    store().setPointing(true);
    store().record('bob', 'eve', { x: 0.1, y: 0.2 }, false);

    store().reset();

    expect(store().pointing).toBe(false);
    expect(store().pointers.size).toBe(0);
  });
});

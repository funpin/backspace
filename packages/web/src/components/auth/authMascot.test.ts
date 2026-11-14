import { describe, expect, it } from 'vitest';
import { authMascotPose } from './authMascot';

describe('authMascotPose', () => {
  it('rests with no field focused', () => {
    expect(authMascotPose('idle', null, false)).toEqual({ state: 'idle' });
  });

  it('follows the caret across a name field, looking down at it', () => {
    expect(authMascotPose('idle', { kind: 'text', ratio: 0 }, false)).toEqual({ state: 'idle', gaze: { x: -4.5, y: 3.5 } });
    expect(authMascotPose('idle', { kind: 'text', ratio: 1 }, false)).toEqual({ state: 'idle', gaze: { x: 4.5, y: 3.5 } });
  });

  it('shuts its eyes while a hidden password is typed', () => {
    expect(authMascotPose('idle', { kind: 'password', ratio: 0.5 }, false)).toEqual({ state: 'shy' });
  });

  it('peeks with one eye at a shown password', () => {
    expect(authMascotPose('idle', { kind: 'password', ratio: 0.5 }, true)).toEqual({ state: 'peek', gaze: { x: 0, y: 3.5 } });
  });

  it('keeps the busy pose while the form is loading or rate-limited', () => {
    expect(authMascotPose('look', { kind: 'password', ratio: 0 }, false)).toEqual({ state: 'look' });
    expect(authMascotPose('dnd', { kind: 'text', ratio: 0 }, false)).toEqual({ state: 'dnd' });
  });
});

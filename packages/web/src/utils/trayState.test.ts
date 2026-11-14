import { describe, expect, it } from 'vitest';
import { pickTrayState, type TrayInputs } from './trayState';

const base: TrayInputs = { homeConnection: 'open', isScreenSharing: false, unreadCount: 0, chosenStatus: 'online' };

describe('pickTrayState', () => {
  it('is idle when nothing needs attention', () => {
    expect(pickTrayState(base)).toBe('idle');
    expect(pickTrayState({ ...base, homeConnection: 'unknown', chosenStatus: null })).toBe('idle');
  });

  it('shows unread messages', () => {
    expect(pickTrayState({ ...base, unreadCount: 3 })).toBe('notify');
  });

  it('shows the user\'s own Do Not Disturb and Idle as closed eyes', () => {
    expect(pickTrayState({ ...base, chosenStatus: 'dnd' })).toBe('dnd');
    expect(pickTrayState({ ...base, chosenStatus: 'idle' })).toBe('dnd');
  });

  it('puts screen sharing above unread messages and status', () => {
    expect(pickTrayState({ ...base, isScreenSharing: true, unreadCount: 5, chosenStatus: 'dnd' })).toBe('screen');
  });

  it('puts a lost connection above everything', () => {
    expect(pickTrayState({ ...base, homeConnection: 'closed', isScreenSharing: true, unreadCount: 5 })).toBe('offline');
  });
});

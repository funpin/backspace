import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRAY_STATES, isTrayState, trayIconFile } from './trayState';

const resources = join(__dirname, '..', 'resources');

describe('isTrayState', () => {
  it('accepts every tray state', () => {
    for (const state of TRAY_STATES) expect(isTrayState(state)).toBe(true);
  });

  it('rejects anything else the renderer might send', () => {
    for (const value of ['', 'Idle', 'unread', 'idle ', null, undefined, 1, {}, ['idle']]) {
      expect(isTrayState(value)).toBe(false);
    }
  });
});

describe('trayIconFile', () => {
  it('names the template on macOS, the .ico on Windows and the PNG on Linux', () => {
    expect(trayIconFile('notify', 'darwin')).toBe('tray-notifyTemplate.png');
    expect(trayIconFile('notify', 'win32')).toBe('tray-notify.ico');
    expect(trayIconFile('notify', 'linux')).toBe('tray-notify.png');
  });

  it('points at a generated file for every state and platform', () => {
    for (const state of TRAY_STATES) {
      for (const platform of ['darwin', 'win32', 'linux'] as const) {
        expect(existsSync(join(resources, trayIconFile(state, platform)))).toBe(true);
      }
      expect(existsSync(join(resources, `tray-${state}Template@2x.png`))).toBe(true);
    }
  });
});

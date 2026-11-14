import { describe, it, expect, vi } from 'vitest';
import { canDetectAudioRouters, findAudioRouters, runningAudioRouters } from './audioRouters';

/**
 * SoundSource replays every application's sound from its own process, and the
 * system-audio capture picks up both: viewers heard a stream's sound twice
 * until it was quit. The process lists below are `ps -axo comm=` output.
 */
describe('findAudioRouters', () => {
  it('finds SoundSource by its executable', () => {
    expect(findAudioRouters([
      '/usr/sbin/coreaudiod',
      '/Applications/SoundSource.app/Contents/MacOS/SoundSource',
      '/Applications/Backspace.app/Contents/MacOS/Backspace',
    ])).toEqual(['SoundSource']);
  });

  it('finds it wherever it is installed', () => {
    expect(findAudioRouters(['/Users/someone/Applications/SoundSource.app/Contents/MacOS/SoundSource']))
      .toEqual(['SoundSource']);
  });

  it('reports nothing when it is not running', () => {
    expect(findAudioRouters(['/usr/sbin/coreaudiod', '/Applications/Music.app/Contents/MacOS/Music'])).toEqual([]);
  });

  it('is not triggered by the driver or daemon SoundSource leaves loaded after it quits', () => {
    // Measured: with these still loaded and the app quit, the capture is clean.
    expect(findAudioRouters(['Core Audio Driver (ARK.driver)', 'Core Audio Driver (ACE.driver)', 'arkaudiod'])).toEqual([]);
  });

  it('matches the executable name exactly, not a substring of another path', () => {
    expect(findAudioRouters([
      '/Applications/SoundSourceHelper.app/Contents/MacOS/SoundSourceHelper',
      '/Users/someone/SoundSource/notes',
    ])).toEqual([]);
  });

  it('names a router once however many processes it has', () => {
    const path = '/Applications/SoundSource.app/Contents/MacOS/SoundSource';
    expect(findAudioRouters([path, path])).toEqual(['SoundSource']);
  });
});

describe('runningAudioRouters', () => {
  const soundSource = async () => ['/Applications/SoundSource.app/Contents/MacOS/SoundSource'];

  it('answers on macOS', async () => {
    expect(canDetectAudioRouters('darwin')).toBe(true);
    await expect(runningAudioRouters('darwin', soundSource)).resolves.toEqual(['SoundSource']);
  });

  it('does not list processes on other platforms', async () => {
    const list = vi.fn(soundSource);
    await expect(runningAudioRouters('win32', list)).resolves.toEqual([]);
    await expect(runningAudioRouters('linux', list)).resolves.toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('answers with nothing when the process list cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(runningAudioRouters('darwin', async () => { throw new Error('ps failed'); })).resolves.toEqual([]);
    warn.mockRestore();
  });
});

import { execFile } from 'child_process';

/**
 * Audio routers that make a System Audio share carry every sound twice.
 *
 * A router of this kind takes each application's playback and plays it again
 * from its own process. Chromium's system-audio capture on macOS (a CoreAudio
 * Tap of every process but Backspace's own audio service) then picks up both
 * the application and the router's replay: viewers get one track that already
 * holds the sound twice, a few tens of milliseconds apart. Backspace cannot
 * leave a third process out of that capture, so the stream settings warn the
 * sharer instead (docs/systems/voice.md, "External audio routing").
 *
 * Only routers measured to do this are listed. SoundSource: with it running,
 * the published track held a copy of the signal 49 ms behind the original at
 * nearly the same level; with it quit, the copy was gone.
 */
export interface AudioRouter {
  /** The name shown to the user. */
  name: string;
  /** Basename of the executable, as `ps -o comm` prints the end of its path. */
  executable: string;
}

export const KNOWN_AUDIO_ROUTERS: readonly AudioRouter[] = [
  { name: 'SoundSource', executable: 'SoundSource' },
];

/** The router process list is only meaningful where the capture is a CoreAudio Tap. */
export function canDetectAudioRouters(platform: NodeJS.Platform): boolean {
  return platform === 'darwin';
}

function basename(command: string): string {
  const trimmed = command.trim();
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Names of the known routers among running processes.
 *
 * @param commands one executable path per process (`ps -axo comm=` lines)
 */
export function findAudioRouters(
  commands: readonly string[],
  known: readonly AudioRouter[] = KNOWN_AUDIO_ROUTERS,
): string[] {
  const running = new Set(commands.map(basename));
  return known.filter((router) => running.has(router.executable)).map((router) => router.name);
}

export type ProcessLister = () => Promise<string[]>;

/**
 * Names of the known routers running now. Empty on platforms where the
 * question does not apply and whenever the process list cannot be read: a
 * missing warning is the behaviour before this existed, never an error.
 */
export async function runningAudioRouters(
  platform: NodeJS.Platform,
  listProcesses: ProcessLister,
): Promise<string[]> {
  if (!canDetectAudioRouters(platform)) return [];
  try {
    return findAudioRouters(await listProcesses());
  } catch (err) {
    console.warn('[AudioRouters] Could not list processes:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** One executable path per running process. macOS `ps`; the absolute path keeps `PATH` out of it. */
export const listProcessCommands: ProcessLister = () =>
  new Promise((resolve, reject) => {
    execFile('/bin/ps', ['-axo', 'comm='], { maxBuffer: 4 * 1024 * 1024, timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.split('\n').filter((line) => line.trim() !== ''));
    });
  });

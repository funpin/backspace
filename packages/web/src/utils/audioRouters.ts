import { useEffect, useState } from 'react';
import { getElectronAPI } from '../platform/platform';

/**
 * Audio routers running on the sharer's machine that replay other
 * applications' sound from their own process. A System Audio share then
 * carries every sound twice, and nothing in Backspace can leave the replay
 * out, so the stream settings warn before the share starts
 * (docs/systems/voice.md, "External audio routing"). Only the desktop app's
 * main process can see the process list (`getAudioRouters`,
 * packages/desktop/src/audioRouters.ts).
 */

const MAX_ROUTERS = 5;
const MAX_NAME_LENGTH = 64;

/** The bridge's answer, reduced to a short list of display names. */
export function asAudioRouterNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = item.trim().slice(0, MAX_NAME_LENGTH);
    if (name !== '' && !names.includes(name)) names.push(name);
    if (names.length === MAX_ROUTERS) break;
  }
  return names;
}

/**
 * The routers running now; empty in a browser, with a desktop app that cannot
 * tell, and until the answer arrives. Asked on every mount rather than once
 * per run: quitting the router is the fix, and the warning has to go with it.
 */
export function useRunningAudioRouters(): string[] {
  const [routers, setRouters] = useState<string[]>([]);
  useEffect(() => {
    const ask = getElectronAPI()?.getAudioRouters;
    if (typeof ask !== 'function') return;
    let active = true;
    ask().then(asAudioRouterNames, () => []).then((names) => {
      if (active) setRouters(names);
    });
    return () => { active = false; };
  }, []);
  return routers;
}

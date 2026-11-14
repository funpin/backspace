import { create } from 'zustand';

/**
 * The participant strip under a focused picture, shared between the grid that
 * draws it and the call's control bar that toggles it (brandbook §12: the
 * show / hide participants button sits in the bar next to chat, with no
 * floating button of its own).
 *
 * A surface without that bar (the mobile voice screen) still needs a way to
 * bring the strip back, so the grid keeps its own toggle until a control bar
 * claims the job by mounting.
 */
interface VoiceStripState {
  /** The viewer hid the strip. The grid clears it whenever the focus target changes. */
  hidden: boolean;
  /** A focused view with a strip is on screen, so a toggle has something to act on. */
  available: boolean;
  /** How many mounted control bars carry the toggle. */
  hosts: number;
  setHidden: (hidden: boolean) => void;
  setAvailable: (available: boolean) => void;
  /** Called by a control bar as it mounts; the returned function releases the claim as it unmounts. */
  claimToggle: () => () => void;
}

export const useVoiceStripStore = create<VoiceStripState>((set) => ({
  hidden: false,
  available: false,
  hosts: 0,
  setHidden: (hidden) => set({ hidden }),
  setAvailable: (available) => set({ available }),
  claimToggle: () => {
    set((state) => ({ hosts: state.hosts + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((state) => ({ hosts: Math.max(0, state.hosts - 1) }));
    };
  },
}));

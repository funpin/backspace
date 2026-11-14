import { create } from 'zustand';
import type { PicturePoint } from '../utils/streamPointerProtocol';

/** A pointer that has not moved for this long is no longer drawn. */
export const STREAM_POINTER_IDLE_MS = 3000;
/** How long the ring of a click stays on the picture. */
export const STREAM_POINTER_PING_MS = 700;

export interface RemotePointer {
  point: PicturePoint;
  /** When its last move arrived, `Date.now()`. */
  movedAt: number;
  /** When its last click arrived; 0 before the first. */
  pingAt: number;
}

interface StreamPointerState {
  /**
   * Whether this client is pointing: its mouse over a focused screen share is
   * shown to the others who watch it. Never persisted and off by default, so
   * a pointer is always something its owner switched on in this call.
   */
  pointing: boolean;
  setPointing: (pointing: boolean) => void;
  /**
   * Other participants' pointers: sharer identity → pointing participant's
   * identity → pointer. Kept apart from voiceStore because it changes thirty
   * times a second, and nothing but the pointer layer should re-render for it.
   */
  pointers: Map<string, Map<string, RemotePointer>>;
  record: (sharerIdentity: string, senderIdentity: string, point: PicturePoint | null, ping: boolean) => void;
  /** A participant left: their pointers go with them. */
  clearSender: (senderIdentity: string) => void;
  /** A share ended: nothing is left to point at. */
  clearSharer: (sharerIdentity: string) => void;
  /** The call ended. */
  reset: () => void;
}

export const useStreamPointerStore = create<StreamPointerState>((set) => ({
  pointing: false,
  setPointing: (pointing) => set({ pointing }),
  pointers: new Map(),
  record: (sharerIdentity, senderIdentity, point, ping) => {
    set((state) => {
      const current = state.pointers.get(sharerIdentity);
      if (point === null) {
        if (!current?.has(senderIdentity)) return state;
        const next = new Map(current);
        next.delete(senderIdentity);
        const pointers = new Map(state.pointers);
        if (next.size === 0) pointers.delete(sharerIdentity);
        else pointers.set(sharerIdentity, next);
        return { pointers };
      }
      const now = Date.now();
      const next = new Map(current);
      next.set(senderIdentity, {
        point,
        movedAt: now,
        pingAt: ping ? now : current?.get(senderIdentity)?.pingAt ?? 0,
      });
      const pointers = new Map(state.pointers);
      pointers.set(sharerIdentity, next);
      return { pointers };
    });
  },
  clearSender: (senderIdentity) => {
    set((state) => {
      let mutated = false;
      const pointers = new Map(state.pointers);
      for (const [sharerIdentity, senders] of pointers) {
        if (!senders.has(senderIdentity)) continue;
        const next = new Map(senders);
        next.delete(senderIdentity);
        if (next.size === 0) pointers.delete(sharerIdentity);
        else pointers.set(sharerIdentity, next);
        mutated = true;
      }
      return mutated ? { pointers } : state;
    });
  },
  clearSharer: (sharerIdentity) => {
    set((state) => {
      if (!state.pointers.has(sharerIdentity)) return state;
      const pointers = new Map(state.pointers);
      pointers.delete(sharerIdentity);
      return { pointers };
    });
  },
  reset: () => set({ pointing: false, pointers: new Map() }),
}));

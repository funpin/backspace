import { create } from 'zustand';

/**
 * Whether the realtime connection to the home instance is up. `unknown`
 * until the first socket either delivers its `ready` or closes, so a slow
 * start does not read as an outage. Written by hooks/useWebSocket.ts.
 */
export type HomeConnection = 'unknown' | 'open' | 'closed';

interface HomeConnectionState {
  status: HomeConnection;
  setStatus: (status: HomeConnection) => void;
}

export const useHomeConnectionStore = create<HomeConnectionState>((set) => ({
  status: 'unknown',
  setStatus: (status) => set({ status }),
}));

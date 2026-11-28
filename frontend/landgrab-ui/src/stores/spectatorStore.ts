import { create } from 'zustand';
import type { SignalRInvoke } from '../types/common';
import type { SpectatorInfo } from '../types/game';

interface SpectatorStore {
  /** Host only: the watch code and who is watching. Null until it is asked for. */
  info: SpectatorInfo | null;
  /** The live hub connection, so the spectators sheet works from any screen. */
  invoke: SignalRInvoke | null;
  setInfo: (info: SpectatorInfo | null) => void;
  setInvoke: (invoke: SignalRInvoke | null) => void;
}

export const useSpectatorStore = create<SpectatorStore>((set) => ({
  info: null,
  invoke: null,
  setInfo: (info) => set({ info }),
  setInvoke: (invoke) => set({ invoke }),
}));

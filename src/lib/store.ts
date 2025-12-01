import { create } from "zustand";

interface AppState {
  // Deprecated: State moved to React Query
}

export const useStore = create<AppState>((set) => ({
  // Deprecated
}));

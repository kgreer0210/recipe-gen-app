import { create } from "zustand";
import type { PantryItem } from "@/types";

interface PantryState {
  pantryItems: PantryItem[];
  loading: boolean;
  error: Error | null;
  setPantryItems: (items: PantryItem[]) => void;
  addItem: (item: PantryItem) => void;
  updateItem: (item: PantryItem) => void;
  removeItem: (itemId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const usePantryStore = create<PantryState>((set) => ({
  pantryItems: [],
  loading: false,
  error: null,
  setPantryItems: (pantryItems) => set({ pantryItems }),
  addItem: (item) =>
    set((state) => ({
      pantryItems: [item, ...state.pantryItems.filter((i) => i.id !== item.id)],
    })),
  updateItem: (item) =>
    set((state) => ({
      pantryItems: state.pantryItems.map((existing) =>
        existing.id === item.id ? item : existing
      ),
    })),
  removeItem: (itemId) =>
    set((state) => ({
      pantryItems: state.pantryItems.filter((item) => item.id !== itemId),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));

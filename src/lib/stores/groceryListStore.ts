import { create } from "zustand";
import { Ingredient } from "@/types";

interface GroceryListState {
  groceryList: Ingredient[];
  loading: boolean;
  error: Error | null;
  setGroceryList: (list: Ingredient[]) => void;
  addItem: (item: Ingredient) => void;
  updateItem: (item: Ingredient) => void;
  removeItem: (itemId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const useGroceryListStore = create<GroceryListState>((set) => ({
  groceryList: [],
  loading: false,
  error: null,
  setGroceryList: (list) => set({ groceryList: list }),
  addItem: (item) =>
    set((state) => ({
      groceryList: [item, ...state.groceryList],
    })),
  updateItem: (item) =>
    set((state) => ({
      groceryList: state.groceryList.map((i) =>
        i.id === item.id ? item : i
      ),
    })),
  removeItem: (itemId) =>
    set((state) => ({
      groceryList: state.groceryList.filter((i) => i.id !== itemId),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));


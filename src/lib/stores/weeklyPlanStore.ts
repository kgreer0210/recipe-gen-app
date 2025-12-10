import { create } from "zustand";
import { Recipe } from "@/types";

interface WeeklyPlanState {
  recipeIds: Set<string>;
  loading: boolean;
  error: Error | null;
  setRecipeIds: (ids: string[]) => void;
  addRecipeId: (recipeId: string) => void;
  removeRecipeId: (recipeId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const useWeeklyPlanStore = create<WeeklyPlanState>((set) => ({
  recipeIds: new Set<string>(),
  loading: false,
  error: null,
  setRecipeIds: (ids) => set({ recipeIds: new Set(ids) }),
  addRecipeId: (recipeId) =>
    set((state) => {
      const newIds = new Set(state.recipeIds);
      newIds.add(recipeId);
      return { recipeIds: newIds };
    }),
  removeRecipeId: (recipeId) =>
    set((state) => {
      const newIds = new Set(state.recipeIds);
      newIds.delete(recipeId);
      return { recipeIds: newIds };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));


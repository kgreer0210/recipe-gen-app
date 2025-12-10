import { create } from "zustand";
import { Recipe } from "@/types";

interface RecipesState {
  recipes: Recipe[];
  loading: boolean;
  error: Error | null;
  setRecipes: (recipes: Recipe[]) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (recipe: Recipe) => void;
  removeRecipe: (recipeId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

export const useRecipesStore = create<RecipesState>((set) => ({
  recipes: [],
  loading: false,
  error: null,
  setRecipes: (recipes) => set({ recipes }),
  addRecipe: (recipe) =>
    set((state) => ({
      recipes: [recipe, ...state.recipes],
    })),
  updateRecipe: (recipe) =>
    set((state) => ({
      recipes: state.recipes.map((r) => (r.id === recipe.id ? recipe : r)),
    })),
  removeRecipe: (recipeId) =>
    set((state) => ({
      recipes: state.recipes.filter((r) => r.id !== recipeId),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));


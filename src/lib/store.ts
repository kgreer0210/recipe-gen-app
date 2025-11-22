import { create } from "zustand";
import { Recipe, Ingredient } from "@/types";
import { createClient } from "@/lib/supabase/client";

interface AppState {
  savedRecipes: Recipe[];
  groceryList: Ingredient[];
  weeklyPlan: Recipe[];
  isLoading: boolean;
  fetchData: () => Promise<void>;
  saveRecipe: (recipe: Recipe) => Promise<Recipe | null>;
  removeRecipe: (recipeId: string) => Promise<void>;
  addToGroceryList: (recipeId: string, servings?: number) => Promise<void>;
  removeFromGroceryList: (itemId: string) => Promise<void>; // Changed to remove by Item ID
  toggleGroceryItem: (itemId: string, isChecked: boolean) => Promise<void>;
  selectAllGroceryItems: (isChecked: boolean) => Promise<void>;
  removeIngredientsForRecipe: (
    recipeId: string,
    servings?: number
  ) => Promise<void>;
  clearGathered: () => Promise<void>;
  addToWeeklyPlan: (recipe: Recipe) => Promise<void>;
  removeFromWeeklyPlan: (recipeId: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  savedRecipes: [],
  groceryList: [],
  weeklyPlan: [],
  isLoading: false,

  fetchData: async () => {
    set({ isLoading: true });
    const supabase = createClient();

    const { data: recipes } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: groceryList } = await supabase
      .from("grocery_list")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: weeklyPlanData } = await supabase
      .from("weekly_plan")
      .select("recipe_id")
      .order("created_at", { ascending: false });

    // Map DB shape to UI shape if needed, but for now assuming they match closely enough
    // or we adjust the types.
    // The DB 'ingredients' is JSONB, so it comes back as any.

    const processedRecipes =
      (recipes as any[])?.map((r) => ({
        ...r,
        prepTime: r.prep_time,
        cookTime: r.cook_time,
        ingredients: r.ingredients || [],
        instructions: r.instructions || [],
        tags: {
          cuisine: r.cuisine,
          meal: r.meal_type,
          protein: r.protein || "None",
        },
      })) || [];

    const weeklyPlanIds = new Set(
      (weeklyPlanData as any[])?.map((wp) => wp.recipe_id)
    );
    const processedWeeklyPlan = processedRecipes.filter((r) =>
      weeklyPlanIds.has(r.id)
    );

    set({
      savedRecipes: processedRecipes,
      weeklyPlan: processedWeeklyPlan,
      groceryList:
        (groceryList as any[])?.map((g) => ({
          name: g.name,
          amount: g.amount,
          unit: g.unit,
          category: g.category,
          id: g.id, // We need the DB ID for updates
          isChecked: g.is_checked,
        })) || [],
      isLoading: false,
    });
  },

  saveRecipe: async (recipe) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null; // Should handle auth redirect elsewhere or show error

    const { data, error } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        title: recipe.title,
        cuisine: recipe.tags?.cuisine,
        meal_type: recipe.tags?.meal,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        protein: recipe.tags?.protein,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      })
      .select()
      .single();

    if (data) {
      const newRecipe = {
        ...data,
        prepTime: data.prep_time,
        cookTime: data.cook_time,
        ingredients: data.ingredients || [],
        instructions: data.instructions || [],
        tags: {
          cuisine: data.cuisine,
          meal: data.meal_type,
          protein: data.protein,
        },
      };
      set((state) => ({ savedRecipes: [newRecipe, ...state.savedRecipes] }));
      return newRecipe;
    }
    return null;
  },

  removeRecipe: async (recipeId) => {
    const supabase = createClient();
    await supabase.from("recipes").delete().match({ id: recipeId });

    set((state) => ({
      savedRecipes: state.savedRecipes.filter((r) => r.id !== recipeId),
    }));
  },

  addToGroceryList: async (recipeId, servings = 1) => {
    const { savedRecipes, groceryList } = get();
    const recipe = savedRecipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let currentGroceryList = [...groceryList];

    for (const ing of recipe.ingredients) {
      const scaledAmount = ing.amount * servings;

      const existingItemIndex = currentGroceryList.findIndex(
        (item) =>
          item.name.toLowerCase() === ing.name.toLowerCase() &&
          item.unit === ing.unit
      );

      if (existingItemIndex !== -1) {
        // Update existing item
        const existingItem = currentGroceryList[existingItemIndex];
        const newAmount = existingItem.amount + scaledAmount;

        if (existingItem.id) {
          await supabase
            .from("grocery_list")
            .update({ amount: newAmount })
            .match({ id: existingItem.id });
        }

        // Update local tracking list
        const updatedItem = { ...existingItem, amount: newAmount };
        currentGroceryList[existingItemIndex] = updatedItem;

        // Update currentGroceryList is enough for the loop, we will set state at the end
      } else {
        // Insert new item
        const { data } = await supabase
          .from("grocery_list")
          .insert({
            user_id: user.id,
            name: ing.name,
            amount: scaledAmount,
            unit: ing.unit,
            category: ing.category || "Other",
          })
          .select()
          .single();

        if (data) {
          const newItem = {
            name: data.name,
            amount: data.amount,
            unit: data.unit,
            category: data.category,
            id: data.id,
            isChecked: data.is_checked,
          };
          currentGroceryList.push(newItem);
        }
      }
    }

    set({ groceryList: currentGroceryList });
  },

  removeFromGroceryList: async (itemId) => {
    const supabase = createClient();
    await supabase.from("grocery_list").delete().match({ id: itemId });

    set((state) => ({
      groceryList: state.groceryList.filter((i) => i.id !== itemId),
    }));
  },

  toggleGroceryItem: async (itemId, isChecked) => {
    const supabase = createClient();
    await supabase
      .from("grocery_list")
      .update({ is_checked: isChecked })
      .match({ id: itemId });

    set((state) => ({
      groceryList: state.groceryList.map((i) =>
        i.id === itemId ? { ...i, isChecked } : i
      ),
    }));
  },

  clearGathered: async () => {
    const { groceryList } = get();
    const gatheredIds = groceryList.filter((i) => i.isChecked).map((i) => i.id);

    if (gatheredIds.length === 0) return;

    const supabase = createClient();
    await supabase.from("grocery_list").delete().in("id", gatheredIds);

    set((state) => ({
      groceryList: state.groceryList.filter((i) => !i.isChecked),
    }));
  },

  selectAllGroceryItems: async (isChecked) => {
    const { groceryList } = get();
    const supabase = createClient();

    // Optimistic update
    set((state) => ({
      groceryList: state.groceryList.map((i) => ({ ...i, isChecked })),
    }));

    // Batch update in DB
    // Note: Supabase JS client doesn't support bulk update with different values easily,
    // but here we are setting all to the SAME value, so we can just update all.
    // However, we only want to update the items currently in the list.
    const ids = groceryList.map((i) => i.id).filter((id): id is string => !!id);

    if (ids.length > 0) {
      await supabase
        .from("grocery_list")
        .update({ is_checked: isChecked })
        .in("id", ids);
    }
  },

  removeIngredientsForRecipe: async (recipeId, servings = 1) => {
    const { savedRecipes, groceryList } = get();
    const recipe = savedRecipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    const supabase = createClient();
    const updates: PromiseLike<any>[] = [];
    const idsToRemove: string[] = [];
    const updatedList = [...groceryList];

    for (const ing of recipe.ingredients) {
      const existingItemIndex = updatedList.findIndex(
        (item) =>
          item.name.toLowerCase() === ing.name.toLowerCase() &&
          item.unit === ing.unit
      );

      if (existingItemIndex !== -1) {
        const existingItem = updatedList[existingItemIndex];
        const amountToRemove = ing.amount * servings;
        const newAmount = existingItem.amount - amountToRemove;

        if (newAmount <= 0.01) {
          // Float tolerance
          // Remove item
          if (existingItem.id) {
            idsToRemove.push(existingItem.id);
            updatedList.splice(existingItemIndex, 1);
          }
        } else {
          // Update amount
          if (existingItem.id) {
            updatedList[existingItemIndex] = {
              ...existingItem,
              amount: newAmount,
            };
            updates.push(
              supabase
                .from("grocery_list")
                .update({ amount: newAmount })
                .match({ id: existingItem.id })
            );
          }
        }
      }
    }

    // Execute DB updates
    if (idsToRemove.length > 0) {
      updates.push(
        supabase.from("grocery_list").delete().in("id", idsToRemove)
      );
    }

    await Promise.all(updates);

    set({ groceryList: updatedList });
  },

  addToWeeklyPlan: async (recipe) => {
    const { weeklyPlan } = get();
    if (weeklyPlan.some((r) => r.id === recipe.id)) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("weekly_plan").insert({
      user_id: user.id,
      recipe_id: recipe.id,
    });

    set((state) => ({
      weeklyPlan: [recipe, ...state.weeklyPlan],
    }));
  },

  removeFromWeeklyPlan: async (recipeId) => {
    const supabase = createClient();
    await supabase.from("weekly_plan").delete().match({ recipe_id: recipeId });

    set((state) => ({
      weeklyPlan: state.weeklyPlan.filter((r) => r.id !== recipeId),
    }));
  },
}));

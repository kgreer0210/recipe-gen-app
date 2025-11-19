import { create } from 'zustand';
import { Recipe, Ingredient } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface AppState {
    savedRecipes: Recipe[];
    groceryList: Ingredient[];
    isLoading: boolean;
    fetchData: () => Promise<void>;
    saveRecipe: (recipe: Recipe) => Promise<Recipe | null>;
    removeRecipe: (recipeId: string) => Promise<void>;
    addToGroceryList: (recipeId: string) => Promise<void>;
    removeFromGroceryList: (itemId: string) => Promise<void>; // Changed to remove by Item ID
    toggleGroceryItem: (itemId: string, isChecked: boolean) => Promise<void>;
    clearGathered: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
    savedRecipes: [],
    groceryList: [],
    isLoading: false,

    fetchData: async () => {
        set({ isLoading: true });
        const supabase = createClient();

        const { data: recipes } = await supabase
            .from('recipes')
            .select('*')
            .order('created_at', { ascending: false });

        const { data: groceryList } = await supabase
            .from('grocery_list')
            .select('*')
            .order('created_at', { ascending: false });

        // Map DB shape to UI shape if needed, but for now assuming they match closely enough
        // or we adjust the types.
        // The DB 'ingredients' is JSONB, so it comes back as any.

        set({
            savedRecipes: (recipes as any[])?.map(r => ({
                ...r,
                prepTime: r.prep_time,
                cookTime: r.cook_time,
                ingredients: r.ingredients || [],
                instructions: r.instructions || [],
                tags: {
                    cuisine: r.cuisine,
                    meal: r.meal_type,
                    protein: r.protein || 'None'
                }
            })) || [],
            groceryList: (groceryList as any[])?.map(g => ({
                name: g.name,
                amount: g.amount,
                unit: g.unit,
                category: g.category,
                id: g.id, // We need the DB ID for updates
                isChecked: g.is_checked
            })) || [],
            isLoading: false
        });
    },

    saveRecipe: async (recipe) => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return null; // Should handle auth redirect elsewhere or show error

        const { data, error } = await supabase
            .from('recipes')
            .insert({
                user_id: user.id,
                title: recipe.title,
                cuisine: recipe.tags?.cuisine,
                meal_type: recipe.tags?.meal,
                prep_time: recipe.prepTime,
                cook_time: recipe.cookTime,
                protein: recipe.tags?.protein,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions
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
                tags: { cuisine: data.cuisine, meal: data.meal_type, protein: data.protein }
            };
            set(state => ({ savedRecipes: [newRecipe, ...state.savedRecipes] }));
            return newRecipe;
        }
        return null;
    },

    removeRecipe: async (recipeId) => {
        const supabase = createClient();
        await supabase.from('recipes').delete().match({ id: recipeId });

        set(state => ({
            savedRecipes: state.savedRecipes.filter(r => r.id !== recipeId)
        }));
    },

    addToGroceryList: async (recipeId) => {
        const { savedRecipes } = get();
        const recipe = savedRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Naive implementation: just insert all. 
        // Ideal: check for duplicates and update amount.
        // For this iteration, let's do a check-and-update loop or just insert.
        // Let's try to be smart: fetch current list first (already in state)

        const { groceryList } = get();

        for (const ing of recipe.ingredients) {
            const existingItem = groceryList.find(
                item => item.name.toLowerCase() === ing.name.toLowerCase() && item.unit === ing.unit
            );

            if (existingItem && existingItem.id) {
                // Update
                const newAmount = existingItem.amount + ing.amount;
                await supabase
                    .from('grocery_list')
                    .update({ amount: newAmount })
                    .match({ id: existingItem.id });

                // Optimistic update
                set(state => ({
                    groceryList: state.groceryList.map(i =>
                        i.id === existingItem.id ? { ...i, amount: newAmount } : i
                    )
                }));
            } else {
                // Insert
                const { data } = await supabase
                    .from('grocery_list')
                    .insert({
                        user_id: user.id,
                        name: ing.name,
                        amount: ing.amount,
                        unit: ing.unit,
                        category: ing.category || 'Other'
                    })
                    .select()
                    .single();

                if (data) {
                    set(state => ({
                        groceryList: [...state.groceryList, {
                            name: data.name,
                            amount: data.amount,
                            unit: data.unit,
                            category: data.category,
                            id: data.id,
                            isChecked: data.is_checked
                        }]
                    }));
                }
            }
        }
    },

    removeFromGroceryList: async (itemId) => {
        const supabase = createClient();
        await supabase.from('grocery_list').delete().match({ id: itemId });

        set(state => ({
            groceryList: state.groceryList.filter(i => i.id !== itemId)
        }));
    },

    toggleGroceryItem: async (itemId, isChecked) => {
        const supabase = createClient();
        await supabase.from('grocery_list').update({ is_checked: isChecked }).match({ id: itemId });

        set(state => ({
            groceryList: state.groceryList.map(i =>
                i.id === itemId ? { ...i, isChecked } : i
            )
        }));
    },

    clearGathered: async () => {
        const { groceryList } = get();
        const gatheredIds = groceryList.filter(i => i.isChecked).map(i => i.id);

        if (gatheredIds.length === 0) return;

        const supabase = createClient();
        await supabase.from('grocery_list').delete().in('id', gatheredIds);

        set(state => ({
            groceryList: state.groceryList.filter(i => !i.isChecked)
        }));
    }
}));

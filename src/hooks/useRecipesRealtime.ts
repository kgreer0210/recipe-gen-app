import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { Recipe } from "@/types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

function transformRecipeRow(row: any): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    ingredients: row.ingredients || [],
    instructions: row.instructions || [],
    tags: {
      cuisine: row.cuisine,
      meal: row.meal_type,
      protein: row.protein || "None",
    },
  };
}

export function useRecipesRealtime() {
  const { supabase, user, loading: authLoading } = useAuth();
  const {
    recipes,
    loading,
    error,
    setRecipes,
    addRecipe,
    updateRecipe,
    removeRecipe,
    setLoading,
    setError,
  } = useRecipesStore();
  const subscriptionRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      setRecipes([]);
      setError(null);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const fetchInitialRecipes = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("recipes")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchError) {
          console.error("Error fetching recipes:", fetchError);
          throw fetchError;
        }

        if (isMounted) {
          const transformedRecipes = (data || []).map(transformRecipeRow);
          setRecipes(transformedRecipes);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch recipes"));
          setLoading(false);
        }
      }
    };

    fetchInitialRecipes();

    const channel = supabase
      .channel(`recipes:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recipes",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMounted) return;

          switch (payload.eventType) {
            case "INSERT":
              addRecipe(transformRecipeRow(payload.new));
              break;
            case "UPDATE":
              updateRecipe(transformRecipeRow(payload.new));
              break;
            case "DELETE":
              removeRecipe(payload.old.id);
              break;
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [supabase, user, authLoading, setRecipes, addRecipe, updateRecipe, removeRecipe, setLoading, setError]);

  return { recipes, loading, error };
}


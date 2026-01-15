import { useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { Recipe } from "@/types";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useWeeklyPlanRealtime() {
  const { supabase, user, loading: authLoading } = useAuth();
  const {
    recipeIds,
    loading,
    error,
    setRecipeIds,
    addRecipeId,
    removeRecipeId,
    setLoading,
    setError,
  } = useWeeklyPlanStore();
  const { recipes } = useRecipesStore();
  const subscriptionRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      setRecipeIds([]);
      setError(null);
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const fetchInitialWeeklyPlan = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("weekly_plan")
          .select("recipe_id")
          .order("created_at", { ascending: false });

        if (fetchError) {
          console.error("Error fetching weekly plan:", fetchError);
          throw fetchError;
        }

        if (isMounted) {
          const ids = (data || []).map((wp: any) => wp.recipe_id);
          setRecipeIds(ids);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch weekly plan"));
          setLoading(false);
        }
      }
    };

    fetchInitialWeeklyPlan();

    const channel = supabase
      .channel(`weekly_plan:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weekly_plan",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (!isMounted) return;

          switch (payload.eventType) {
            case "INSERT":
              if (payload.new?.recipe_id) {
                addRecipeId(payload.new.recipe_id);
              }
              break;
            case "DELETE":
              // Supabase DELETE events may not include the old record data by default
              // If available, remove the recipe ID; otherwise re-fetch the entire plan
              if (payload.old?.recipe_id) {
                removeRecipeId(payload.old.recipe_id);
              } else {
                // Re-fetch to ensure consistency if old data is not available
                fetchInitialWeeklyPlan();
              }
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
  }, [supabase, user, authLoading, setRecipeIds, addRecipeId, removeRecipeId, setLoading, setError]);

  const weeklyPlan = useMemo(() => {
    return recipes.filter((r: Recipe) => recipeIds.has(r.id));
  }, [recipes, recipeIds]);

  return { weeklyPlan, loading, error };
}


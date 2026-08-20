import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import type { MealSlot, Recipe, WeeklyPlanSlot } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type WeeklyPlanRow = {
  id: string;
  recipe_id: string;
  week_start: string;
  day_of_week: number | null;
  meal_slot: MealSlot | null;
  servings_override: number | null;
  cooked_at: string | null;
  created_at: string;
};

export function transformWeeklyPlanRow(row: WeeklyPlanRow): WeeklyPlanSlot {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    weekStart: row.week_start,
    dayOfWeek: row.day_of_week,
    mealSlot: row.meal_slot,
    servingsOverride: row.servings_override,
    cookedAt: row.cooked_at,
    createdAt: row.created_at,
  };
}

export function useWeeklyPlanRealtime() {
  const { supabase, user, loading: authLoading } = useAuth();
  const {
    slots,
    loading,
    error,
    setSlots,
    upsertSlot,
    removeSlot,
    setLoading,
    setError,
  } = useWeeklyPlanStore();
  const { recipes } = useRecipesStore();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      setSlots([]);
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
          .select(
            "id, recipe_id, week_start, day_of_week, meal_slot, servings_override, cooked_at, created_at"
          )
          .order("created_at", { ascending: false });

        if (fetchError) {
          console.error("Error fetching weekly plan:", fetchError);
          throw fetchError;
        }

        if (isMounted) {
          setSlots((data || []).map(transformWeeklyPlanRow));
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err
              : new Error("Failed to fetch weekly plan")
          );
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
        (payload: RealtimePostgresChangesPayload<WeeklyPlanRow>) => {
          if (!isMounted) return;

          switch (payload.eventType) {
            case "INSERT":
            case "UPDATE":
              if (payload.new?.id && payload.new.recipe_id) {
                upsertSlot(transformWeeklyPlanRow(payload.new as WeeklyPlanRow));
              }
              break;
            case "DELETE":
              if (payload.old?.id) {
                removeSlot(payload.old.id);
              } else {
                void fetchInitialWeeklyPlan();
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
  }, [
    supabase,
    user,
    authLoading,
    setSlots,
    upsertSlot,
    removeSlot,
    setLoading,
    setError,
  ]);

  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const recipe of recipes) {
      map.set(recipe.id, recipe);
    }
    return map;
  }, [recipes]);

  const weeklyPlan = useMemo(() => {
    const seen = new Set<string>();
    const result: Recipe[] = [];
    for (const slot of slots) {
      if (seen.has(slot.recipeId)) continue;
      const recipe = recipesById.get(slot.recipeId);
      if (recipe) {
        seen.add(slot.recipeId);
        result.push(recipe);
      }
    }
    return result;
  }, [slots, recipesById]);

  return { slots, recipesById, weeklyPlan, loading, error };
}

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  transformWeeklyPlanRow,
} from "@/hooks/useWeeklyPlanRealtime";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import type { MealSlot, Recipe, WeeklyPlanSlot } from "@/types";

type SlotTarget = {
  weekStart: string;
  dayOfWeek: number | null;
  mealSlot: MealSlot | null;
  servingsOverride?: number | null;
};

function findOccupant(
  slots: WeeklyPlanSlot[],
  weekStart: string,
  dayOfWeek: number | null,
  mealSlot: MealSlot | null,
  exceptId?: string
): WeeklyPlanSlot | undefined {
  if (dayOfWeek === null || mealSlot === null) return undefined;
  return slots.find(
    (slot) =>
      slot.id !== exceptId &&
      slot.weekStart === weekStart &&
      slot.dayOfWeek === dayOfWeek &&
      slot.mealSlot === mealSlot
  );
}

export function useAddToWeeklyPlanSlot() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (
    recipe: Recipe,
    target: SlotTarget
  ): Promise<WeeklyPlanSlot> => {
    if (!user) throw new Error("User not authenticated");

    setIsLoading(true);
    setError(null);

    try {
      const occupant = findOccupant(
        useWeeklyPlanStore.getState().slots,
        target.weekStart,
        target.dayOfWeek,
        target.mealSlot
      );
      if (occupant) {
        throw new Error("That meal slot is already filled");
      }

      const { data, error: insertError } = await supabase
        .from("weekly_plan")
        .insert({
          user_id: user.id,
          recipe_id: recipe.id,
          week_start: target.weekStart,
          day_of_week: target.dayOfWeek,
          meal_slot: target.mealSlot,
          servings_override: target.servingsOverride ?? recipe.servings ?? null,
        })
        .select(
          "id, recipe_id, week_start, day_of_week, meal_slot, servings_override, cooked_at, created_at"
        )
        .single();

      if (insertError) {
        console.error("Error adding to weekly plan:", insertError);
        throw insertError;
      }

      const slot = transformWeeklyPlanRow(data);
      useWeeklyPlanStore.getState().upsertSlot(slot);
      return slot;
    } catch (err) {
      const next =
        err instanceof Error ? err : new Error("Failed to add to weekly plan");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useMoveWeeklyPlanSlot() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (
    slotId: string,
    target: SlotTarget
  ): Promise<void> => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);

    const { upsertSlot } = useWeeklyPlanStore.getState();
    const current = useWeeklyPlanStore
      .getState()
      .slots.find((slot) => slot.id === slotId);
    if (!current) {
      setIsLoading(false);
      throw new Error("Plan slot not found");
    }

    const occupant = findOccupant(
      useWeeklyPlanStore.getState().slots,
      target.weekStart,
      target.dayOfWeek,
      target.mealSlot,
      slotId
    );

    const previousCurrent = { ...current };
    const previousOccupant = occupant ? { ...occupant } : null;

    upsertSlot({
      ...current,
      weekStart: target.weekStart,
      dayOfWeek: target.dayOfWeek,
      mealSlot: target.mealSlot,
    });
    if (occupant) {
      upsertSlot({
        ...occupant,
        weekStart: current.weekStart,
        dayOfWeek: current.dayOfWeek,
        mealSlot: current.mealSlot,
      });
    }

    try {
      // Park the occupant first so the unique (user, week, day, slot) index
      // is not violated while two rows briefly share the same coordinates.
      if (occupant) {
        const { error: parkError } = await supabase
          .from("weekly_plan")
          .update({
            day_of_week: null,
            meal_slot: null,
          })
          .eq("id", occupant.id);
        if (parkError) throw parkError;
      }

      const { error: moveError } = await supabase
        .from("weekly_plan")
        .update({
          week_start: target.weekStart,
          day_of_week: target.dayOfWeek,
          meal_slot: target.mealSlot,
        })
        .eq("id", slotId);

      if (moveError) throw moveError;

      if (occupant) {
        const { error: swapError } = await supabase
          .from("weekly_plan")
          .update({
            week_start: current.weekStart,
            day_of_week: current.dayOfWeek,
            meal_slot: current.mealSlot,
          })
          .eq("id", occupant.id);
        if (swapError) throw swapError;
      }
    } catch (err) {
      upsertSlot(previousCurrent);
      if (previousOccupant) {
        upsertSlot(previousOccupant);
        await supabase
          .from("weekly_plan")
          .update({
            week_start: previousOccupant.weekStart,
            day_of_week: previousOccupant.dayOfWeek,
            meal_slot: previousOccupant.mealSlot,
          })
          .eq("id", previousOccupant.id);
      }
      const next =
        err instanceof Error ? err : new Error("Failed to move weekly plan slot");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useRemoveWeeklyPlanSlot() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (slotId: string) => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);
    const removed = useWeeklyPlanStore
      .getState()
      .slots.find((slot) => slot.id === slotId);
    useWeeklyPlanStore.getState().removeSlot(slotId);

    try {
      const { error: deleteError } = await supabase
        .from("weekly_plan")
        .delete()
        .eq("id", slotId);

      if (deleteError) throw deleteError;
    } catch (err) {
      if (removed) useWeeklyPlanStore.getState().upsertSlot(removed);
      const next =
        err instanceof Error
          ? err
          : new Error("Failed to remove weekly plan slot");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useMarkWeeklyPlanSlotCooked() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (slotId: string, cooked: boolean) => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);
    const current = useWeeklyPlanStore
      .getState()
      .slots.find((slot) => slot.id === slotId);
    if (!current) {
      setIsLoading(false);
      throw new Error("Plan slot not found");
    }
    const cookedAt = cooked ? new Date().toISOString() : null;
    useWeeklyPlanStore.getState().upsertSlot({ ...current, cookedAt });

    try {
      const { error: updateError } = await supabase
        .from("weekly_plan")
        .update({ cooked_at: cookedAt })
        .eq("id", slotId);
      if (updateError) throw updateError;
    } catch (err) {
      useWeeklyPlanStore.getState().upsertSlot(current);
      const next =
        err instanceof Error ? err : new Error("Failed to update cooked status");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useUpdateWeeklyPlanServings() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (slotId: string, servingsOverride: number) => {
    if (!user) throw new Error("User not authenticated");
    const clamped = Math.min(12, Math.max(1, Math.round(servingsOverride)));
    const current = useWeeklyPlanStore
      .getState()
      .slots.find((slot) => slot.id === slotId);
    if (!current) throw new Error("Plan slot not found");
    useWeeklyPlanStore
      .getState()
      .upsertSlot({ ...current, servingsOverride: clamped });
    setIsLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("weekly_plan")
        .update({ servings_override: clamped })
        .eq("id", slotId);
      if (updateError) throw updateError;
    } catch (err) {
      useWeeklyPlanStore.getState().upsertSlot(current);
      const next =
        err instanceof Error ? err : new Error("Failed to update servings");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

/** @deprecated Prefer useAddToWeeklyPlanSlot. Adds to this week's unscheduled tray. */
export function useAddToWeeklyPlan() {
  const { mutateAsync } = useAddToWeeklyPlanSlot();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (recipe: Recipe, weekStart: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await mutateAsync(recipe, {
        weekStart,
        dayOfWeek: null,
        mealSlot: null,
      });
    } catch (err) {
      const next =
        err instanceof Error ? err : new Error("Failed to add to weekly plan");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

/** Removes every slot for a recipe in the given week. */
export function useRemoveFromWeeklyPlan() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (recipeId: string, weekStart?: string) => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);
    const previous = useWeeklyPlanStore.getState().slots;
    const nextSlots = previous.filter((slot) => {
      if (slot.recipeId !== recipeId) return true;
      if (weekStart && slot.weekStart !== weekStart) return true;
      return false;
    });
    useWeeklyPlanStore.getState().setSlots(nextSlots);

    try {
      let query = supabase
        .from("weekly_plan")
        .delete()
        .eq("user_id", user.id)
        .eq("recipe_id", recipeId);
      if (weekStart) {
        query = query.eq("week_start", weekStart);
      }
      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;
    } catch (err) {
      useWeeklyPlanStore.getState().setSlots(previous);
      const next =
        err instanceof Error
          ? err
          : new Error("Failed to remove from weekly plan");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate: mutateAsync, mutateAsync, isLoading, error };
}

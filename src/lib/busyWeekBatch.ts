import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModelForTier } from "@/lib/openrouter/models";
import {
  finalizeRecipe,
  requestRecipe,
  type RecipeGenerationInput,
} from "@/lib/recipe/generateRecipe";
import {
  getUsageErrorMessage,
  getUsageStatus,
  recordUsageTokens,
  releaseUsage,
  reserveUsage,
} from "@/lib/usage";
import { uniqueStrings } from "@/lib/kitchenProfile";
import {
  recipeRowToRecipe,
  recipeToRow,
  weeklyPlanRowToSlot,
  type RecipeRow,
  type WeeklyPlanRow,
} from "@/lib/rowMappers";
import type { ValidBusyWeekRequest } from "@/lib/busyWeek";
import type {
  BusyWeekErrorCode,
  BusyWeekPickStatus,
  BusyWeekResult,
  CuisineType,
  MealStyle,
  Recipe,
  WeeklyPlanSlot,
} from "@/types";

/** Per model call. A slow model fails its own pick; the rest of the batch keeps going. */
export const BUSY_WEEK_CALL_TIMEOUT_MS = 90_000;
/** Older than the route's maxDuration, so a live batch is never reconciled by mistake. */
export const BUSY_WEEK_STALE_MS = 6 * 60_000;

const REFUNDABLE_ERRORS: BusyWeekErrorCode[] = ["generation_failed", "save_failed", "interrupted"];
const PLACED_STATUSES: BusyWeekPickStatus[] = ["placed", "replaced", "unscheduled"];
const SLOT_COLUMNS =
  "id, recipe_id, week_start, day_of_week, meal_slot, servings_override, cooked_at, created_at";
const BLOCKED_AS_SERVER_ERROR = ["rpc_error", "exception", "plan_not_configured", "invalid_action", "invalid_count"];

/** One pick as stored in generation_batches.results. */
type StoredPick = {
  index: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  dayOfWeek: number;
  replaceSlotId?: string;
  status: BusyWeekPickStatus;
  recipeId: string | null;
  planSlotId: string | null;
  error?: BusyWeekErrorCode;
};

type BatchRow = {
  id: string;
  user_id: string;
  week_start: string;
  status: string;
  requested: number;
  succeeded: number;
  results: StoredPick[] | null;
  usage_window_start: string | null;
  created_at: string;
};

export type BusyWeekOutcome = { status: number; body: Record<string, unknown> };

type Kitchen = { dietary: string[]; disliked: string[]; servings: number };

type Placement = {
  status: "placed" | "replaced" | "unscheduled";
  error?: BusyWeekErrorCode;
  planSlot?: WeeklyPlanSlot;
};

/**
 * Runs one busy-week batch: reserve N up front, generate each pick, save and
 * place it, refund what failed, and record the outcome on the batch row.
 */
export async function runBusyWeek({
  user,
  supabase,
  request,
}: {
  user: User;
  supabase: SupabaseClient;
  request: ValidBusyWeekRequest;
}): Promise<BusyWeekOutcome> {
  const admin = createAdminClient();
  await finishStaleBatches(admin, supabase, user);

  const count = request.picks.length;
  const stored: StoredPick[] = request.picks.map((pick, index) => ({
    index,
    cuisine: pick.cuisine,
    mealStyle: pick.mealStyle,
    dayOfWeek: pick.dayOfWeek,
    ...(pick.replaceSlotId ? { replaceSlotId: pick.replaceSlotId } : {}),
    status: "pending",
    recipeId: null,
    planSlotId: null,
  }));

  // The primary key is the idempotency check: a double tap or retry with the same
  // batchId stops here, before anything is reserved.
  const inserted = await admin.from("generation_batches").insert({
    id: request.batchId,
    user_id: user.id,
    week_start: request.weekStart,
    status: "running",
    requested: count,
    succeeded: 0,
    results: stored,
  });
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return {
        status: 409,
        body: { error: "This busy week batch has already started.", batchId: request.batchId },
      };
    }
    console.error("Busy week batch insert failed:", inserted.error);
    return { status: 500, body: { error: "Failed to start busy week" } };
  }

  const reservation = await reserveUsage("generate", user, count);
  if (!reservation.allowed) {
    await updateBatch(admin, request.batchId, { status: "failed", succeeded: 0, results: [] });
    return {
      status: blockedStatus(reservation.reason),
      body: {
        error: getUsageErrorMessage(reservation.reason, reservation.planKey, reservation.remaining),
        reason: reservation.reason,
        remaining: reservation.remaining,
      },
    };
  }

  const kitchen = await loadKitchen(admin, user.id, request.dietaryPreferences ?? []);
  const model = getModelForTier(reservation.planKey);
  const recipes = await generateAll(request, { user, kitchen, model });

  const objects = new Map<number, { recipe?: Recipe; planSlot?: WeeklyPlanSlot }>();
  const finalStored = stored.map((pick) => ({ ...pick }));

  for (const pick of finalStored) {
    const recipe = recipes.get(pick.index);
    if (!recipe) {
      pick.status = "failed";
      pick.error = "generation_failed";
      await updateBatch(admin, request.batchId, { results: finalStored });
      continue;
    }

    const saved = await saveRecipe(supabase, user.id, recipe, kitchen.servings);
    if (!saved) {
      pick.status = "failed";
      pick.error = "save_failed";
      await updateBatch(admin, request.batchId, { results: finalStored });
      continue;
    }

    // Persist the saved recipe before placement, so a crash here is not refunded (Q5).
    pick.recipeId = saved.id;
    await updateBatch(admin, request.batchId, { results: finalStored });

    const placement = await placeDinner(supabase, {
      userId: user.id,
      weekStart: request.weekStart,
      dayOfWeek: pick.dayOfWeek,
      replaceSlotId: pick.replaceSlotId,
      recipe: saved,
      servings: kitchen.servings,
    });
    pick.status = placement.status;
    pick.error = placement.error;
    pick.planSlotId = placement.planSlot?.id ?? null;
    objects.set(pick.index, { recipe: saved, planSlot: placement.planSlot });
    await updateBatch(admin, request.batchId, { results: finalStored });
  }

  const refunded = finalStored.filter(
    (pick) => pick.status === "failed" && pick.error && REFUNDABLE_ERRORS.includes(pick.error)
  ).length;
  if (refunded > 0) {
    await releaseUsage("generate", user, refunded, reservation.windowStart);
  }

  const succeeded = finalStored.filter((pick) => PLACED_STATUSES.includes(pick.status as BusyWeekPickStatus)).length;
  const status = succeeded === count ? "completed" : succeeded === 0 ? "failed" : "partial";
  await updateBatch(admin, request.batchId, { status, succeeded, results: finalStored });

  return {
    status: 200,
    body: {
      batchId: request.batchId,
      status,
      usage: {
        reserved: count,
        refunded,
        remaining: reservation.remaining === null ? null : reservation.remaining + refunded,
      },
      results: finalStored.map((pick) => toResult(pick, objects.get(pick.index))),
    },
  };
}

/** Stored batch for the signed-in user, with recipes and plan slots filled in. */
export async function readBusyWeek({
  user,
  supabase,
  batchId,
}: {
  user: User;
  supabase: SupabaseClient;
  batchId: string;
}): Promise<BusyWeekOutcome> {
  const admin = createAdminClient();
  await finishStaleBatches(admin, supabase, user);

  const { data } = await supabase
    .from("generation_batches")
    .select("*")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) {
    return { status: 404, body: { error: "Batch not found" } };
  }
  const batch = data as BatchRow;
  const picks = batch.results ?? [];

  const recipeIds = picks.map((pick) => pick.recipeId).filter((id): id is string => Boolean(id));
  const slotIds = picks.map((pick) => pick.planSlotId).filter((id): id is string => Boolean(id));

  const recipesById = new Map<string, Recipe>();
  if (recipeIds.length > 0) {
    const { data: rows } = await supabase.from("recipes").select("*").in("id", recipeIds);
    for (const row of (rows ?? []) as RecipeRow[]) {
      recipesById.set(row.id, recipeRowToRecipe(row));
    }
  }

  const slotsById = new Map<string, WeeklyPlanSlot>();
  if (slotIds.length > 0) {
    const { data: rows } = await supabase.from("weekly_plan").select(SLOT_COLUMNS).in("id", slotIds);
    for (const row of (rows ?? []) as WeeklyPlanRow[]) {
      slotsById.set(row.id, weeklyPlanRowToSlot(row));
    }
  }

  const usage = await getUsageStatus(user);
  const refunded = picks.filter((pick) => pick.error && REFUNDABLE_ERRORS.includes(pick.error)).length;

  return {
    status: 200,
    body: {
      batchId: batch.id,
      status: batch.status,
      usage: {
        reserved: batch.requested,
        refunded,
        remaining: usage?.generate.remaining ?? null,
      },
      results: picks.map((pick) =>
        toResult(pick, {
          recipe: pick.recipeId ? recipesById.get(pick.recipeId) : undefined,
          planSlot: pick.planSlotId ? slotsById.get(pick.planSlotId) : undefined,
        })
      ),
    },
  };
}

function blockedStatus(reason: string | undefined): number {
  if (reason === "paid_plan_required") return 403;
  if (reason && BLOCKED_AS_SERVER_ERROR.includes(reason)) return 500;
  return 429;
}

function toResult(
  pick: StoredPick,
  object: { recipe?: Recipe; planSlot?: WeeklyPlanSlot } | undefined
): BusyWeekResult {
  return {
    index: pick.index,
    cuisine: pick.cuisine,
    mealStyle: pick.mealStyle,
    dayOfWeek: pick.dayOfWeek,
    status: pick.status,
    ...(object?.recipe ? { recipe: object.recipe } : {}),
    ...(object?.planSlot ? { planSlot: object.planSlot } : {}),
    ...(pick.error ? { error: pick.error } : {}),
  };
}

async function loadKitchen(
  admin: SupabaseClient,
  userId: string,
  requestDietary: string[]
): Promise<Kitchen> {
  const { data } = await admin
    .from("user_settings")
    .select("dietary_preferences, disliked_ingredients, default_servings")
    .eq("user_id", userId)
    .maybeSingle();

  const dietary = uniqueStrings([
    ...(Array.isArray(data?.dietary_preferences) ? data.dietary_preferences : []),
    ...requestDietary,
  ]).slice(0, 10);
  const disliked = uniqueStrings(
    Array.isArray(data?.disliked_ingredients) ? data.disliked_ingredients : []
  ).slice(0, 40);
  const servings =
    typeof data?.default_servings === "number" && Number.isFinite(data.default_servings)
      ? Math.min(12, Math.max(1, Math.round(data.default_servings)))
      : 2;

  return { dietary, disliked, servings };
}

/**
 * Different cuisines run in parallel. Repeats of one cuisine run in order, and
 * each later one is told to avoid the dishes already made for it in this batch.
 */
async function generateAll(
  request: ValidBusyWeekRequest,
  ctx: { user: User; kitchen: Kitchen; model: string }
): Promise<Map<number, Recipe | null>> {
  const groups = new Map<CuisineType, Array<{ index: number; cuisine: CuisineType; mealStyle: MealStyle }>>();
  request.picks.forEach((pick, index) => {
    const picks = groups.get(pick.cuisine) ?? [];
    picks.push({ index, cuisine: pick.cuisine, mealStyle: pick.mealStyle });
    groups.set(pick.cuisine, picks);
  });

  const results = new Map<number, Recipe | null>();
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const titles: string[] = [];
      for (const pick of group) {
        const recipe = await generateOne(pick, titles, ctx);
        results.set(pick.index, recipe);
        if (recipe) titles.push(recipe.title);
      }
    })
  );
  return results;
}

async function generateOne(
  pick: { cuisine: CuisineType; mealStyle: MealStyle },
  avoidTitles: string[],
  ctx: { user: User; kitchen: Kitchen; model: string }
): Promise<Recipe | null> {
  const input: RecipeGenerationInput = {
    mode: "classic",
    cuisine: pick.cuisine,
    meal: "Dinner",
    dietaryPreferences: ctx.kitchen.dietary,
    dislikedIngredients: ctx.kitchen.disliked,
    servings: ctx.kitchen.servings,
    mealStyle: pick.mealStyle,
    avoidTitles: [...avoidTitles],
  };

  try {
    const { data, totalTokens } = await withTimeout(
      requestRecipe(input, ctx.model),
      BUSY_WEEK_CALL_TIMEOUT_MS
    );
    // Tokens are recorded for every attempt, including ones that fail below.
    await recordUsageTokens("generate", ctx.user, totalTokens);

    if (typeof data.error === "string" || typeof data.title !== "string" || data.title.trim() === "") {
      return null;
    }
    return finalizeRecipe(data, ctx.kitchen.servings);
  } catch (err) {
    console.error("Busy week generation failed:", err instanceof Error ? err.message : err);
    // A thrown call has no token count to report.
    await recordUsageTokens("generate", ctx.user, undefined);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Model call timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function saveRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipe: Recipe,
  servings: number
): Promise<Recipe | null> {
  // User-scoped client: RLS and the save-limit trigger apply to this insert.
  const { data, error } = await supabase
    .from("recipes")
    .insert(recipeToRow(recipe, userId, servings))
    .select("*")
    .single();
  if (error || !data) {
    console.error("Busy week recipe save failed:", error?.message);
    return null;
  }
  return recipeRowToRecipe(data as RecipeRow);
}

async function placeDinner(
  supabase: SupabaseClient,
  target: {
    userId: string;
    weekStart: string;
    dayOfWeek: number;
    replaceSlotId?: string;
    recipe: Recipe;
    servings: number;
  }
): Promise<Placement> {
  const { data: rows } = await supabase
    .from("weekly_plan")
    .select(SLOT_COLUMNS)
    .eq("user_id", target.userId)
    .eq("week_start", target.weekStart);
  const occupant = ((rows ?? []) as WeeklyPlanRow[]).find(
    (row) => row.day_of_week === target.dayOfWeek && row.meal_slot === "dinner"
  );

  const insertSlot = (dayOfWeek: number | null, mealSlot: "dinner" | null) =>
    supabase
      .from("weekly_plan")
      .insert({
        user_id: target.userId,
        recipe_id: target.recipe.id,
        week_start: target.weekStart,
        day_of_week: dayOfWeek,
        meal_slot: mealSlot,
        servings_override: target.servings,
      })
      .select(SLOT_COLUMNS)
      .single();

  const toUnscheduled = async (error: BusyWeekErrorCode): Promise<Placement> => {
    const { data } = await insertSlot(null, null);
    return {
      status: "unscheduled",
      error,
      planSlot: data ? weeklyPlanRowToSlot(data as WeeklyPlanRow) : undefined,
    };
  };

  if (occupant && occupant.id === target.replaceSlotId) {
    const { error: deleteError } = await supabase
      .from("weekly_plan")
      .delete()
      .eq("id", occupant.id)
      .eq("user_id", target.userId);
    if (deleteError) return toUnscheduled("plan_insert_failed");

    const dated = await insertSlot(target.dayOfWeek, "dinner");
    if (dated.error || !dated.data) {
      // Put the original back so a failed replacement never empties the night.
      await supabase.from("weekly_plan").insert({
        id: occupant.id,
        user_id: target.userId,
        recipe_id: occupant.recipe_id,
        week_start: occupant.week_start,
        day_of_week: occupant.day_of_week,
        meal_slot: occupant.meal_slot,
        servings_override: occupant.servings_override,
        cooked_at: occupant.cooked_at,
      });
      return toUnscheduled("plan_insert_failed");
    }
    return { status: "replaced", planSlot: weeklyPlanRowToSlot(dated.data as WeeklyPlanRow) };
  }

  if (occupant) return toUnscheduled("slot_taken");

  const dated = await insertSlot(target.dayOfWeek, "dinner");
  if (dated.data) {
    return { status: "placed", planSlot: weeklyPlanRowToSlot(dated.data as WeeklyPlanRow) };
  }
  return toUnscheduled(dated.error?.code === "23505" ? "slot_taken" : "plan_insert_failed");
}

async function updateBatch(
  admin: SupabaseClient,
  batchId: string,
  patch: { status?: string; succeeded?: number; results: unknown }
): Promise<void> {
  const { error } = await admin
    .from("generation_batches")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", batchId);
  if (error) console.error("Busy week batch update failed:", error.message);
}

/**
 * Lazy reconciliation: a batch still "running" after the stale window means its
 * function died. Picks with no saved recipe are refunded. Picks that already
 * saved a recipe are kept and count as unscheduled, not refunded (Q5).
 */
async function finishStaleBatches(
  admin: SupabaseClient,
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const cutoff = new Date(Date.now() - BUSY_WEEK_STALE_MS).toISOString();
  const { data } = await supabase
    .from("generation_batches")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "running")
    .lt("created_at", cutoff);

  for (const row of (data ?? []) as BatchRow[]) {
    let refund = 0;
    const repaired = (row.results ?? []).map((pick): StoredPick => {
      if (pick.status !== "pending") return pick;
      if (pick.recipeId) return { ...pick, status: "unscheduled", error: "plan_insert_failed" };
      refund += 1;
      return { ...pick, status: "failed", error: "interrupted" };
    });
    const succeeded = repaired.filter((pick) => PLACED_STATUSES.includes(pick.status as BusyWeekPickStatus)).length;
    const status = succeeded === row.requested ? "completed" : succeeded === 0 ? "failed" : "partial";

    // Only the handler still holding the row can finish it. If it already did, the update matches nothing.
    const { data: changed } = await admin
      .from("generation_batches")
      .update({ status, succeeded, results: repaired, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "running")
      .select("id");

    if ((changed ?? []).length > 0 && refund > 0) {
      await releaseUsage("generate", user, refund, row.usage_window_start);
    }
  }
}

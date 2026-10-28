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
  beginBusyWeekBatch,
  getUsageErrorMessage,
  getUsageStatus,
  recordUsageTokens,
  settleBusyWeekBatch,
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
import { proteinConflict, proteinConflictMessage } from "@/lib/proteinChoice";
import type {
  BusyWeekErrorCode,
  BusyWeekPickStatus,
  BusyWeekResult,
  CuisineType,
  MealStyle,
  ProteinChoice,
  Recipe,
  WeeklyPlanSlot,
} from "@/types";

/** Per model call. Never longer than the time left before the batch deadline. */
export const BUSY_WEEK_CALL_TIMEOUT_MS = 90_000;
/**
 * The whole batch answers within this. A dinner that has not started by then fails
 * and is refunded, so the route never runs into maxDuration (300s). The rest is
 * headroom for saving, placing and settling.
 */
export const BUSY_WEEK_DEADLINE_MS = 240_000;
/** Dinners in flight at once. Repeats of one cuisine still run one after another. */
export const BUSY_WEEK_CONCURRENCY = 4;
/** Older than the route's maxDuration, so a live batch is never reconciled by mistake. */
export const BUSY_WEEK_STALE_MS = 6 * 60_000;

const SLOT_COLUMNS =
  "id, recipe_id, week_start, day_of_week, meal_slot, servings_override, cooked_at, created_at";
const BLOCKED_AS_SERVER_ERROR = ["rpc_error", "exception", "plan_not_configured", "invalid_action", "invalid_count"];

/** One pick as stored in generation_batches.results. */
type StoredPick = {
  index: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  /** Missing on batches stored before Protein existed. Read as "Any". */
  protein?: ProteinChoice;
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
  refunded: number | null;
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

type PickJob = {
  index: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  protein: ProteinChoice;
  dayOfWeek: number;
  replaceSlotId?: string;
};

type RunContext = {
  user: User;
  supabase: SupabaseClient;
  weekStart: string;
  kitchen: Kitchen;
  model: string;
  deadline: number;
  /** Called after every pick changes, so the batch row shows progress. */
  save: () => void;
};

/**
 * Runs one busy-week batch: record it and reserve N up front, generate and place
 * each pick (persisting each one as it finishes), then settle the batch, which
 * refunds the failed picks in the same database transaction.
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
  await settleOpenBatches(user, supabase);

  // Checked before anything is recorded or reserved, so a refused pick costs nothing.
  const kitchen = await loadKitchen(admin, user.id, request.dietaryPreferences ?? []);
  for (const pick of request.picks) {
    const diet = proteinConflict(pick.protein, kitchen.dietary);
    if (diet) {
      return { status: 400, body: { error: proteinConflictMessage(pick.protein, diet) } };
    }
  }

  const count = request.picks.length;
  const stored: StoredPick[] = request.picks.map((pick, index) => ({
    index,
    cuisine: pick.cuisine,
    mealStyle: pick.mealStyle,
    protein: pick.protein,
    dayOfWeek: pick.dayOfWeek,
    ...(pick.replaceSlotId ? { replaceSlotId: pick.replaceSlotId } : {}),
    status: "pending",
    recipeId: null,
    planSlotId: null,
  }));

  // One transaction: the batch row (its primary key is the idempotency check) and the reservation.
  const begun = await beginBusyWeekBatch({
    batchId: request.batchId,
    user,
    weekStart: request.weekStart,
    count,
    results: stored,
  });
  if (begun.outcome === "duplicate") {
    return {
      status: 409,
      body: { error: "This busy week batch has already started.", batchId: request.batchId },
    };
  }
  if (begun.outcome === "blocked") {
    return {
      status: blockedStatus(begun.reason),
      body: {
        error: getUsageErrorMessage(begun.reason, begun.planKey, begun.remaining),
        reason: begun.reason,
        remaining: begun.remaining,
      },
    };
  }
  if (begun.outcome === "error") {
    console.error("Busy week batch could not start:", begun.error);
    return { status: 500, body: { error: "Failed to start busy week" } };
  }

  const writer = createBatchWriter(admin, request.batchId);
  const finalStored = stored.map((pick) => ({ ...pick }));

  await runPicks(request, finalStored, {
    user,
    supabase,
    weekStart: request.weekStart,
    kitchen,
    model: getModelForTier(begun.planKey),
    deadline: Date.now() + BUSY_WEEK_DEADLINE_MS,
    save: () => writer.save(finalStored),
  });
  await writer.flush();

  const settled = await settleBusyWeekBatch(request.batchId, false);
  if (!settled.ok) {
    // Nothing was refunded or finished. The next read of this batch settles it.
    console.error("Busy week settle failed:", settled.error);
    return failedToFinish(request.batchId);
  }

  const outcome = await loadBatch({ user, supabase, batchId: request.batchId });
  if (outcome.status !== 200 || outcome.body.status === "running") {
    return failedToFinish(request.batchId);
  }
  return outcome;
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
  await settleOpenBatches(user, supabase);
  return loadBatch({ user, supabase, batchId });
}

function failedToFinish(batchId: string): BusyWeekOutcome {
  return {
    status: 500,
    body: { error: "Busy week could not be finished yet. It is checked again on the next read.", batchId },
  };
}

async function loadBatch({
  user,
  supabase,
  batchId,
}: {
  user: User;
  supabase: SupabaseClient;
  batchId: string;
}): Promise<BusyWeekOutcome> {
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

  return {
    status: 200,
    body: {
      batchId: batch.id,
      status: batch.status,
      usage: {
        reserved: batch.requested,
        refunded: batch.refunded ?? 0,
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
    protein: pick.protein ?? "Any",
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
 * Cuisines run as a queue of groups, with at most BUSY_WEEK_CONCURRENCY groups in
 * flight. Within a group (repeats of one cuisine) the dinners run in order, and each
 * later one is told to avoid the dishes already made for that cuisine in this batch.
 */
async function runPicks(request: ValidBusyWeekRequest, stored: StoredPick[], ctx: RunContext): Promise<void> {
  const groups = new Map<CuisineType, PickJob[]>();
  request.picks.forEach((pick, index) => {
    const jobs = groups.get(pick.cuisine) ?? [];
    jobs.push({ index, ...pick });
    groups.set(pick.cuisine, jobs);
  });

  const queue = [...groups.values()];
  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      const titles: string[] = [];
      for (const job of group) {
        await runPick(job, stored[job.index], titles, ctx);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BUSY_WEEK_CONCURRENCY, queue.length) }, worker));
}

async function runPick(job: PickJob, entry: StoredPick, titles: string[], ctx: RunContext): Promise<void> {
  const fail = (error: BusyWeekErrorCode) => {
    entry.status = "failed";
    entry.error = error;
    ctx.save();
  };

  const recipe = await generateOne(job, titles, ctx);
  if (!recipe) return fail("generation_failed");
  titles.push(recipe.title);

  const saved = await saveRecipe(ctx.supabase, ctx.user.id, recipe, ctx.kitchen.servings);
  if (!saved) return fail("save_failed");

  // The saved recipe is recorded before placement, so a crash here is not refunded (Q5).
  entry.recipeId = saved.id;
  ctx.save();

  const placement = await placeDinner(ctx.supabase, {
    weekStart: ctx.weekStart,
    dayOfWeek: job.dayOfWeek,
    replaceSlotId: job.replaceSlotId,
    recipe: saved,
    servings: ctx.kitchen.servings,
  });
  entry.status = placement.status;
  entry.error = placement.error;
  entry.planSlotId = placement.planSlot?.id ?? null;
  ctx.save();
}

async function generateOne(job: PickJob, avoidTitles: string[], ctx: RunContext): Promise<Recipe | null> {
  const remaining = ctx.deadline - Date.now();
  // Past the deadline the dinner is not started. It fails now, and the settle refunds it.
  if (remaining <= 0) return null;

  const input: RecipeGenerationInput = {
    mode: "classic",
    cuisine: job.cuisine,
    meal: "Dinner",
    // "Any" leaves the protein out, so the model chooses it as it did before.
    protein: job.protein === "Any" ? undefined : job.protein,
    dietaryPreferences: ctx.kitchen.dietary,
    dislikedIngredients: ctx.kitchen.disliked,
    servings: ctx.kitchen.servings,
    mealStyle: job.mealStyle,
    avoidTitles: [...avoidTitles],
  };

  try {
    const { data, totalTokens } = await withTimeout(
      requestRecipe(input, ctx.model),
      Math.min(BUSY_WEEK_CALL_TIMEOUT_MS, remaining)
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

/**
 * Places the dinner with one database call, as the signed-in user. The function
 * checks the day and swaps, or inserts, in one transaction. If the day is taken by
 * something else, the recipe goes to the unscheduled tray (slot_taken).
 */
async function placeDinner(
  supabase: SupabaseClient,
  target: {
    weekStart: string;
    dayOfWeek: number;
    replaceSlotId?: string;
    recipe: Recipe;
    servings: number;
  }
): Promise<Placement> {
  const { data, error } = await supabase.rpc("place_busy_week_dinner", {
    p_week_start: target.weekStart,
    p_day_of_week: target.dayOfWeek,
    p_recipe_id: target.recipe.id,
    p_replace_slot_id: target.replaceSlotId ?? null,
    p_servings: target.servings,
  });
  if (error || !data) {
    console.error("Busy week placement failed:", error?.message);
    return { status: "unscheduled", error: "plan_insert_failed" };
  }

  const result = data as { status: "placed" | "replaced" | "slot_taken"; slot: WeeklyPlanRow };
  const planSlot = weeklyPlanRowToSlot(result.slot);
  if (result.status === "slot_taken") {
    return { status: "unscheduled", error: "slot_taken", planSlot };
  }
  return { status: result.status, planSlot };
}

/**
 * Writes the batch's picks in the order they were produced. Each write carries a
 * snapshot taken when it was requested, so a late write cannot overwrite a newer one.
 */
function createBatchWriter(admin: SupabaseClient, batchId: string) {
  let queue: Promise<void> = Promise.resolve();
  return {
    save(results: StoredPick[]) {
      const snapshot = results.map((pick) => ({ ...pick }));
      queue = queue.then(() => writePicks(admin, batchId, snapshot));
    },
    flush(): Promise<void> {
      return queue;
    },
  };
}

async function writePicks(admin: SupabaseClient, batchId: string, results: StoredPick[]): Promise<void> {
  const { error } = await admin
    .from("generation_batches")
    .update({ results, updated_at: new Date().toISOString() })
    .eq("id", batchId);
  if (error) console.error("Busy week batch update failed:", error.message);
}

/**
 * Settles this user's running batches that need it. A batch with no pending picks is
 * finished and only its refund is outstanding, so it is settled now. A batch with
 * pending picks is settled only once it is stale (its function died), and then its
 * unfinished picks are interrupted. Settling is idempotent, so a repeat changes nothing.
 */
async function settleOpenBatches(user: User, supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase
    .from("generation_batches")
    .select("id, created_at, results")
    .eq("user_id", user.id)
    .eq("status", "running");

  const staleBefore = Date.now() - BUSY_WEEK_STALE_MS;
  for (const row of (data ?? []) as Array<Pick<BatchRow, "id" | "created_at" | "results">>) {
    const hasPending = (row.results ?? []).some((pick) => pick.status === "pending");
    const stale = Date.parse(row.created_at) < staleBefore;
    if (hasPending && !stale) continue;

    const result = await settleBusyWeekBatch(row.id, stale);
    if (!result.ok) console.error("Busy week reconciliation failed:", result.error);
  }
}

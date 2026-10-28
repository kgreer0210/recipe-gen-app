import {
  CUISINE_TYPES,
  MEAL_STYLES,
  type BusyWeekPick,
  type BusyWeekRequest,
  type CuisineType,
  type MealStyle,
  type WeeklyPlanSlot,
} from "@/types";
import { addDaysToYmd, formatYmd, parseYmd } from "@/lib/week";

export const BUSY_WEEK_MAX_PICKS = 7;
export const BUSY_WEEK_MAX_DIETARY = 10;
export const BUSY_WEEK_MAX_DIETARY_LENGTH = 100;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidBusyWeekRequest = Omit<BusyWeekRequest, "picks"> & {
  picks: Array<BusyWeekPick & { mealStyle: MealStyle }>;
};

export type BusyWeekValidation =
  | { ok: true; value: ValidBusyWeekRequest }
  | { ok: false; error: string };

function fail(error: string): BusyWeekValidation {
  return { ok: false, error };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** True when `weekStart` is a real calendar date that falls on a Monday. */
export function isMondayYmd(weekStart: unknown): weekStart is string {
  if (typeof weekStart !== "string" || !YMD_PATTERN.test(weekStart)) return false;
  try {
    const date = parseYmd(weekStart);
    return formatYmd(date) === weekStart && date.getUTCDay() === 1;
  } catch {
    return false;
  }
}

/**
 * Shared by the POST route and the client sheet. Returns a normalized request
 * (style defaulted to "Any") or the first problem it found.
 */
export function validateBusyWeekRequest(input: unknown): BusyWeekValidation {
  if (!input || typeof input !== "object") return fail("Request body must be an object.");
  const body = input as Record<string, unknown>;

  if (!isUuid(body.batchId)) {
    return fail("batchId must be a UUID.");
  }
  if (!isMondayYmd(body.weekStart)) {
    return fail("weekStart must be a Monday in YYYY-MM-DD form.");
  }
  if (!Array.isArray(body.picks)) {
    return fail("picks must be a list.");
  }
  if (body.picks.length < 1 || body.picks.length > BUSY_WEEK_MAX_PICKS) {
    return fail(`Choose 1 to ${BUSY_WEEK_MAX_PICKS} dinners.`);
  }

  const usedDays = new Set<number>();
  const picks: ValidBusyWeekRequest["picks"] = [];
  for (const raw of body.picks as unknown[]) {
    if (!raw || typeof raw !== "object") return fail("Each pick must be an object.");
    const pick = raw as Record<string, unknown>;

    if (!CUISINE_TYPES.includes(pick.cuisine as CuisineType)) {
      return fail("Unknown cuisine.");
    }

    const style = pick.mealStyle ?? "Any";
    if (!MEAL_STYLES.includes(style as MealStyle)) {
      return fail("Unknown meal style.");
    }

    const day = pick.dayOfWeek;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      return fail("dayOfWeek must be 0 (Monday) to 6 (Sunday).");
    }
    if (usedDays.has(day)) {
      return fail("Each dinner needs its own day.");
    }
    usedDays.add(day);

    if (pick.replaceSlotId !== undefined && typeof pick.replaceSlotId !== "string") {
      return fail("replaceSlotId must be a string.");
    }

    picks.push({
      cuisine: pick.cuisine as CuisineType,
      mealStyle: style as MealStyle,
      dayOfWeek: day,
      ...(typeof pick.replaceSlotId === "string" ? { replaceSlotId: pick.replaceSlotId } : {}),
    });
  }

  let dietaryPreferences: string[] | undefined;
  if (body.dietaryPreferences !== undefined) {
    if (
      !Array.isArray(body.dietaryPreferences) ||
      body.dietaryPreferences.some((item) => typeof item !== "string")
    ) {
      return fail("dietaryPreferences must be a list of strings.");
    }
    const list = body.dietaryPreferences as string[];
    if (list.length > BUSY_WEEK_MAX_DIETARY) {
      return fail(`Too many dietary preferences. Please limit to ${BUSY_WEEK_MAX_DIETARY}.`);
    }
    if (list.some((item) => item.length > BUSY_WEEK_MAX_DIETARY_LENGTH)) {
      return fail("Dietary preference names are too long.");
    }
    dietaryPreferences = list;
  }

  return {
    ok: true,
    value: {
      batchId: body.batchId,
      weekStart: body.weekStart,
      picks,
      ...(dietaryPreferences ? { dietaryPreferences } : {}),
    },
  };
}

/**
 * The existing dinner for each pick's day, or null. Only dinners in the given
 * week count; lunch, breakfast and other weeks are ignored.
 */
export function findDinnerConflicts(
  picks: BusyWeekPick[],
  slots: WeeklyPlanSlot[],
  weekStart: string
): Array<WeeklyPlanSlot | null> {
  return picks.map((pick) => {
    const occupant = slots.find(
      (slot) =>
        slot.weekStart === weekStart &&
        slot.dayOfWeek === pick.dayOfWeek &&
        slot.mealSlot === "dinner"
    );
    return occupant ?? null;
  });
}

/**
 * Client-side gate for the Busy week button. The server is the source of truth.
 * Mirrors resolve_user_plan_key: an active or trialing subscription that is not
 * on the free plan counts, and a missing plan key counts as Plus.
 */
export function hasBusyWeekAccess(
  subscription: { status: string; plan_key?: string | null } | null,
  userId: string | null | undefined,
  adminUserId: string | null | undefined
): boolean {
  if (userId && adminUserId && userId === adminUserId) return true;
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") return false;
  return subscription.plan_key !== "free";
}

/** A day is past when it is before the user's "today" in that week. */
export function dayIsPast(weekStart: string, dayOfWeek: number, todayYmd: string): boolean {
  return dayDate(weekStart, dayOfWeek) < todayYmd;
}

/** Calendar date (YYYY-MM-DD) for one day of the week. Never parsed with `new Date(ymd)`. */
export function dayDate(weekStart: string, dayOfWeek: number): string {
  return addDaysToYmd(weekStart, dayOfWeek);
}

/**
 * Default day for a new pick: the first free day from today's weekday onward,
 * then the first free day from Monday. Null when every day is taken.
 */
export function suggestDay(
  weekStart: string,
  todayYmd: string,
  unavailable: Set<number>
): number | null {
  const diff = Math.round(
    (parseYmd(todayYmd).getTime() - parseYmd(weekStart).getTime()) / 86_400_000
  );
  const startDay = Math.min(6, Math.max(0, diff));
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (startDay + offset) % 7;
    if (!unavailable.has(day)) return day;
  }
  return null;
}

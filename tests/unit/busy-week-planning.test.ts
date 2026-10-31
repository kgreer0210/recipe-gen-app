import { describe, expect, it } from "vitest";
import {
  dayDate,
  dayIsPast,
  defaultPickDay,
  findDinnerConflicts,
  hasBusyWeekAccess,
  suggestDay,
  validateBusyWeekRequest,
  weekHasOpenDay,
} from "@/lib/busyWeek";
import { getWeekStart, getZonedYmd } from "@/lib/week";
import { DIETARY_PREFERENCES_LIST, MAX_DIETARY_PREFERENCES, type WeeklyPlanSlot } from "@/types";

const BATCH_ID = "3f0c9c2e-6a1e-4c7e-9a55-1f2b3c4d5e6f";

function slot(overrides: Partial<WeeklyPlanSlot>): WeeklyPlanSlot {
  return {
    id: "slot-1",
    recipeId: "recipe-1",
    weekStart: "2026-10-26",
    dayOfWeek: 1,
    mealSlot: "dinner",
    servingsOverride: 2,
    cookedAt: null,
    createdAt: "2026-10-20T12:00:00Z",
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    batchId: BATCH_ID,
    weekStart: "2026-10-26",
    picks: [
      { cuisine: "Mexican", dayOfWeek: 0 },
      { cuisine: "Italian", mealStyle: "Pasta", dayOfWeek: 3 },
      { cuisine: "Mexican", mealStyle: "Taco", dayOfWeek: 4 },
    ],
    ...overrides,
  };
}

describe("validateBusyWeekRequest", () => {
  it("accepts 1 to 7 picks with repeated cuisines and defaults the style to Any", () => {
    const result = validateBusyWeekRequest(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.picks.map((pick) => pick.mealStyle)).toEqual([
      "Any",
      "Pasta",
      "Taco",
    ]);
    expect(result.value.picks.map((pick) => pick.cuisine)).toEqual([
      "Mexican",
      "Italian",
      "Mexican",
    ]);
  });

  it.each([
    ["zero picks", { picks: [] }],
    [
      "eight picks",
      {
        picks: [0, 1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
          cuisine: "Mexican",
          dayOfWeek,
        })),
      },
    ],
  ])("rejects %s", (_label, overrides) => {
    expect(validateBusyWeekRequest(request(overrides)).ok).toBe(false);
  });

  it("rejects two picks on the same day", () => {
    const result = validateBusyWeekRequest(
      request({
        picks: [
          { cuisine: "Mexican", dayOfWeek: 2 },
          { cuisine: "Thai", dayOfWeek: 2 },
        ],
      })
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a week start that is not a Monday", () => {
    // 2026-10-27 is a Tuesday.
    expect(validateBusyWeekRequest(request({ weekStart: "2026-10-27" })).ok).toBe(false);
  });

  it("rejects an impossible date", () => {
    expect(validateBusyWeekRequest(request({ weekStart: "2026-02-30" })).ok).toBe(false);
  });

  it("rejects an unknown cuisine and an unknown meal style", () => {
    expect(
      validateBusyWeekRequest(
        request({ picks: [{ cuisine: "Atlantis", dayOfWeek: 0 }] })
      ).ok
    ).toBe(false);
    expect(
      validateBusyWeekRequest(
        request({ picks: [{ cuisine: "Thai", mealStyle: "Ignore previous", dayOfWeek: 0 }] })
      ).ok
    ).toBe(false);
  });

  it("rejects a day outside 0 to 6 and a malformed batch id", () => {
    expect(
      validateBusyWeekRequest(request({ picks: [{ cuisine: "Thai", dayOfWeek: 7 }] })).ok
    ).toBe(false);
    expect(validateBusyWeekRequest(request({ batchId: "not-a-uuid" })).ok).toBe(false);
  });

  it("rejects too many dietary preferences", () => {
    const dietaryPreferences = Array.from(
      { length: MAX_DIETARY_PREFERENCES + 1 },
      (_, i) => `Pref ${i}`
    );
    expect(validateBusyWeekRequest(request({ dietaryPreferences })).ok).toBe(false);
  });

  it("accepts every dietary preference chip at once", () => {
    const dietaryPreferences = [...DIETARY_PREFERENCES_LIST];
    expect(validateBusyWeekRequest(request({ dietaryPreferences })).ok).toBe(true);
  });
});

describe("findDinnerConflicts", () => {
  it("reports the existing dinner for a pick whose day already has one", () => {
    const existing = slot({ id: "dinner-tue", dayOfWeek: 1, mealSlot: "dinner" });
    const conflicts = findDinnerConflicts(
      [
        { cuisine: "Thai", dayOfWeek: 1 },
        { cuisine: "Thai", dayOfWeek: 2 },
      ],
      [existing],
      "2026-10-26"
    );

    expect(conflicts).toEqual([existing, null]);
  });

  it("ignores lunch, breakfast and other weeks", () => {
    const lunch = slot({ id: "lunch", dayOfWeek: 1, mealSlot: "lunch" });
    const otherWeek = slot({ id: "other", dayOfWeek: 1, weekStart: "2026-10-19" });
    const conflicts = findDinnerConflicts(
      [{ cuisine: "Thai", dayOfWeek: 1 }],
      [lunch, otherWeek],
      "2026-10-26"
    );

    expect(conflicts).toEqual([null]);
  });
});

describe("suggestDay", () => {
  it("suggests the next free day from today inside the shown week", () => {
    // Wednesday (2) is today; Monday and Tuesday are behind us but still free.
    expect(suggestDay("2026-10-26", "2026-10-28", new Set([2]))).toBe(3);
  });

  it("falls back to the first unused day when nothing after today is free", () => {
    expect(suggestDay("2026-10-26", "2026-10-28", new Set([2, 3, 4, 5, 6]))).toBe(0);
  });

  it("returns null when every day is already used", () => {
    expect(suggestDay("2026-10-26", "2026-10-28", new Set([0, 1, 2, 3, 4, 5, 6]))).toBeNull();
  });
});

describe("defaultPickDay", () => {
  it("starts a current week at today, never at a past Monday or Tuesday", () => {
    // Wednesday 10-28 in the week of 10-26: Monday and Tuesday are past.
    expect(defaultPickDay("2026-10-26", "2026-10-28", new Set())).toBe(2);
  });

  it("moves past today when today's dinner is already taken", () => {
    expect(defaultPickDay("2026-10-26", "2026-10-28", new Set([2]))).toBe(3);
  });

  it("starts a future week on Monday, which is still open", () => {
    // The shown week starts 11-02 and today is 10-28, so every day is ahead of us.
    expect(defaultPickDay("2026-11-02", "2026-10-28", new Set())).toBe(0);
  });

  it("never defaults to a past day in a week that has already passed", () => {
    expect(defaultPickDay("2026-10-19", "2026-10-28", new Set())).toBeNull();
  });
});

describe("weekHasOpenDay", () => {
  it("is true for the current week, even late in it", () => {
    expect(weekHasOpenDay("2026-10-26", "2026-11-01")).toBe(true);
  });

  it("is false once every day of the week is behind us", () => {
    expect(weekHasOpenDay("2026-10-19", "2026-10-28")).toBe(false);
  });
});

describe("dayIsPast across timezones", () => {
  // 2026-10-26 06:30 UTC: already Monday 10-26 in New York, still Sunday 10-25 in Los Angeles.
  const instant = new Date("2026-10-26T06:30:00Z");

  it("uses the New York calendar day", () => {
    const today = getZonedYmd(instant, "America/New_York");
    expect(today).toBe("2026-10-26");
    // Week of 10-19 is shown; Sunday 10-25 is before New York's today.
    expect(dayIsPast("2026-10-19", 6, today)).toBe(true);
    expect(dayIsPast("2026-10-19", 5, today)).toBe(true);
  });

  it("uses the Los Angeles calendar day", () => {
    const today = getZonedYmd(instant, "America/Los_Angeles");
    expect(today).toBe("2026-10-25");
    // Sunday 10-25 is still today in Los Angeles, so it is selectable.
    expect(dayIsPast("2026-10-19", 6, today)).toBe(false);
    expect(dayIsPast("2026-10-19", 5, today)).toBe(true);
  });

  it("picks the Monday that the user's own timezone calls this week", () => {
    expect(getWeekStart(instant, "America/New_York")).toBe("2026-10-26");
    expect(getWeekStart(instant, "America/Los_Angeles")).toBe("2026-10-19");
  });
});

describe("hasBusyWeekAccess", () => {
  it("allows an active or trialing Plus or Pro subscription", () => {
    expect(hasBusyWeekAccess({ status: "active", plan_key: "plus" }, "u1", "admin")).toBe(true);
    expect(hasBusyWeekAccess({ status: "trialing", plan_key: "pro" }, "u1", "admin")).toBe(true);
  });

  it("treats a paid subscription with no plan key as Plus, as the server does", () => {
    expect(hasBusyWeekAccess({ status: "active" }, "u1", "admin")).toBe(true);
  });

  it("locks free users and lapsed subscriptions", () => {
    expect(hasBusyWeekAccess(null, "u1", "admin")).toBe(false);
    expect(hasBusyWeekAccess({ status: "active", plan_key: "free" }, "u1", "admin")).toBe(false);
    expect(hasBusyWeekAccess({ status: "past_due", plan_key: "plus" }, "u1", "admin")).toBe(false);
    expect(hasBusyWeekAccess({ status: "canceled", plan_key: "pro" }, "u1", "admin")).toBe(false);
  });

  it("lets the admin in regardless of subscription", () => {
    expect(hasBusyWeekAccess(null, "admin", "admin")).toBe(true);
  });
});

describe("dayDate", () => {
  it("returns the calendar date for a day of the shown week without new Date parsing", () => {
    expect(dayDate("2026-10-26", 0)).toBe("2026-10-26");
    expect(dayDate("2026-10-26", 6)).toBe("2026-11-01");
  });
});

import { test, expect, type Page, type Route } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { formatWeekRange, getWeekStart, shiftWeekStart } from "../../src/lib/week";

// Chromium only (no WebKit project). The Safari check is manual, on the Vercel preview.
// The AI and the busy-week API are stubbed in the browser (spec Q7 option a). The
// server logic is covered by the route unit tests and the Supabase integration tests.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(supabaseUrl && anonKey && serviceRoleKey);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Mise-Busy-${runId}!`;
const paidEmail = `mise-busy-paid-${runId}@example.com`;
const freeEmail = `mise-busy-free-${runId}@example.com`;
const generatorEmail = `mise-busy-gen-${runId}@example.com`;
const existingTitle = `Busy Week Existing ${runId}`;

/**
 * "Now" for every busy-week journey. A fixed Wednesday, so the current week always
 * has two past days and the next week is always entirely ahead. The real calendar
 * never changes what these tests see.
 */
const FIXED_NOW = new Date("2026-10-28T15:00:00.000Z");
const CURRENT_WEEK = getWeekStart(FIXED_NOW, "UTC");
const NEXT_WEEK = shiftWeekStart(CURRENT_WEEK, 1);
const NEXT_WEEK_LABEL = formatWeekRange(NEXT_WEEK);
const CURRENT_WEEK_LABEL = formatWeekRange(CURRENT_WEEK);

const admin = hasEnv
  ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const userIds: string[] = [];
let paidId = "";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The day that already has a dinner next week (the replace case), and two other free days. */
const CONFLICT_DAY = 0;
const SECOND_DAY = 4;
const THIRD_DAY = 6;
/** A free day next week for the single-dinner journeys, so no replacement is needed. */
const FREE_DAY = 2;

type BusyWeekPostBody = {
  batchId: string;
  weekStart: string;
  picks: Array<{ cuisine: string; mealStyle?: string; dayOfWeek: number; replaceSlotId?: string }>;
};

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/generator$/);
}

/** Opens the Weekly Plan at the fixed "now". The clock is set before the page loads. */
async function openWeeklyPlan(page: Page, email: string) {
  await page.clock.setFixedTime(FIXED_NOW);
  await signIn(page, email);
  await page.goto("/weekly-plan");
}

async function stubRateLimit(page: Page, remaining: number) {
  await page.route("**/api/rate-limit", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        isBlocked: false,
        remaining,
        limit: 100,
        generate: { remaining, limit: 100, count: 100 - remaining },
      }),
    })
  );
}

/** The busy-week response the server would give for these picks, with one placed dinner per pick. */
function busyWeekResponse(body: BusyWeekPostBody, title: string, idPrefix: string) {
  const results = body.picks.map((pick, index) => {
    const recipe = {
      id: `${idPrefix}-${runId}-${index}`,
      title: `${title} ${index + 1} ${runId}`,
      description: "Stubbed for the browser journey.",
      ingredients: [],
      instructions: ["Cook."],
      tags: { cuisine: pick.cuisine, meal: "Dinner", protein: "Chicken" },
      prepTime: "10 minutes",
      cookTime: "20 minutes",
      servings: 2,
    };
    return {
      index,
      cuisine: pick.cuisine,
      mealStyle: pick.mealStyle ?? "Any",
      dayOfWeek: pick.dayOfWeek,
      status: pick.replaceSlotId ? "replaced" : "placed",
      recipe,
      planSlot: {
        id: `${idPrefix}-slot-${runId}-${index}`,
        recipeId: recipe.id,
        weekStart: body.weekStart,
        dayOfWeek: pick.dayOfWeek,
        mealSlot: "dinner",
        servingsOverride: 2,
        cookedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  });
  return {
    batchId: body.batchId,
    status: "completed",
    usage: { reserved: results.length, refunded: 0, remaining: 34 },
    results,
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

/** Stub the busy-week POST: one result per pick, placed (or replaced when a replacement was confirmed). */
async function stubBusyWeek(page: Page) {
  const posted: Array<Record<string, unknown>> = [];
  await page.route("**/api/busy-week", async (route) => {
    const body = route.request().postDataJSON() as BusyWeekPostBody;
    posted.push(body as unknown as Record<string, unknown>);
    await fulfillJson(route, busyWeekResponse(body, "Busy Dinner", "busy"));
  });
  await page.route("**/api/busy-week/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Batch not found" }) })
  );
  return posted;
}

/** Pick a day for dinner N, by its chip. Chips for past days are disabled, so this also checks they are reachable. */
async function pickDay(page: Page, dinner: number, dayIndex: number) {
  await page
    .getByRole("radiogroup", { name: `Day for dinner ${dinner}` })
    .getByRole("radio", { name: new RegExp(`^${DAY_NAMES[dayIndex]}`) })
    .click();
}

/** Lets React apply a response that just arrived, so a stale write would be visible. */
async function flushReact(page: Page) {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
}

async function expectButtonIsTopmost(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport();
  const box = await button.boundingBox();
  expect(box).toBeTruthy();
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim() ?? null,
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  );
  expect(hit).toMatch(name);
}

test.describe.configure({ mode: "serial" });

test.describe("Busy week and meal style", () => {
  test.skip(!hasEnv, "Browser tests need the Supabase env vars (non-production target only).");

  test.beforeAll(async () => {
    if (!admin) return;
    for (const email of [paidEmail, freeEmail, generatorEmail]) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) {
        throw created.error ?? new Error(`Could not create ${email}`);
      }
      userIds.push(created.data.user.id);
    }
    [paidId] = userIds;

    const subscription = await admin.from("subscriptions").upsert(
      {
        user_id: paidId,
        status: "active",
        plan_key: "plus",
        price_id: "price_test_placeholder",
      },
      { onConflict: "user_id" }
    );
    if (subscription.error) throw subscription.error;

    // A dinner that is already on the plan next week, so the journey hits the replace warning.
    const recipe = await admin
      .from("recipes")
      .insert({
        user_id: paidId,
        title: existingTitle,
        cuisine: "Thai",
        meal_type: "Dinner",
        prep_time: "10 minutes",
        cook_time: "20 minutes",
        protein: "Chicken",
        ingredients: [],
        instructions: ["Cook."],
        servings: 2,
      })
      .select("id")
      .single();
    if (recipe.error) throw recipe.error;

    const slot = await admin.from("weekly_plan").insert({
      user_id: paidId,
      recipe_id: recipe.data!.id,
      week_start: NEXT_WEEK,
      day_of_week: CONFLICT_DAY,
      meal_slot: "dinner",
      servings_override: 2,
    });
    if (slot.error) throw slot.error;
  });

  test.afterAll(async () => {
    if (!admin || userIds.length === 0) return;
    await admin.from("weekly_plan").delete().in("user_id", userIds);
    await admin.from("recipes").delete().in("user_id", userIds);
    await admin.from("subscriptions").delete().in("user_id", userIds);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  test("a paid cook plans three dinners, confirms a replacement, and sees them in the plan", async ({ page }) => {
    await stubRateLimit(page, 37);
    const posted = await stubBusyWeek(page);
    await openWeeklyPlan(page, paidEmail);

    // Plan next week, the one with the seeded dinner.
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.getByText(NEXT_WEEK_LABEL)).toBeVisible();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await expect(page.getByRole("heading", { name: "Busy week" })).toBeVisible();

    // Pick 1: the day that already has a dinner, Thai, Taco.
    await pickDay(page, 1, CONFLICT_DAY);
    await page.getByLabel("Cuisine").first().selectOption("Thai");
    await page.getByRole("radiogroup", { name: "Meal style for dinner 1" }).getByRole("radio", { name: "Taco" }).click();

    await expect(page.getByText(existingTitle).first()).toBeVisible();
    await page.getByLabel(new RegExp(`Replace ${DAY_NAMES[CONFLICT_DAY]}`)).check();

    // Pick 2: a repeat cuisine on another day.
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(1).selectOption("Thai");
    await pickDay(page, 2, SECOND_DAY);

    // Pick 3, with no conflict.
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(2).selectOption("Mexican");
    await pickDay(page, 3, THIRD_DAY);

    await expect(page.getByText("This will use 3 of your 37 remaining recipes this week.")).toBeVisible();
    await page.getByRole("button", { name: /Generate 3 dinners/ }).click();

    await expect(page.getByText("All 3 dinners are in your plan.")).toBeVisible();
    expect(posted).toHaveLength(1);
    expect((posted[0] as { picks: Array<{ mealStyle?: string; replaceSlotId?: string }> }).picks[0]).toMatchObject({
      mealStyle: "Taco",
    });
    expect((posted[0] as { picks: Array<{ replaceSlotId?: string }> }).picks[0].replaceSlotId).toBeTruthy();

    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(`Busy Dinner 1 ${runId}`)).toBeVisible();
    await expect(page.getByText(existingTitle)).toHaveCount(0);
  });

  test("the week you navigated to stays on screen while the timezone is still loading", async ({ page }) => {
    await stubRateLimit(page, 37);
    // Hold the settings GET (it supplies the user's timezone) until the test has clicked "Next week".
    let releaseSettings!: () => void;
    const settingsHeld = new Promise<void>((resolve) => {
      releaseSettings = resolve;
    });
    await page.route("**/api/user/settings", async (route) => {
      if (route.request().method() === "GET") await settingsHeld;
      await route.continue();
    });

    await page.clock.setFixedTime(FIXED_NOW);
    await signIn(page, paidEmail);
    await page.goto("/weekly-plan");
    await page.getByRole("button", { name: "Next week" }).click();
    await expect(page.getByText(NEXT_WEEK_LABEL)).toBeVisible();

    const settled = page.waitForResponse((response) => response.url().includes("/api/user/settings"));
    releaseSettings();
    await settled;
    await flushReact(page);

    await expect(page.getByText(NEXT_WEEK_LABEL)).toBeVisible();
    await expect(page.getByText(CURRENT_WEEK_LABEL)).toHaveCount(0);
  });

  test("days behind today in the current week are disabled and never preselected", async ({ page }) => {
    await stubRateLimit(page, 37);
    await openWeeklyPlan(page, paidEmail);

    await page.getByRole("button", { name: /^Busy week/ }).click();
    const days = page.getByRole("radiogroup", { name: "Day for dinner 1" });
    await expect(days.getByRole("radio", { name: /^Monday/ })).toBeDisabled();
    await expect(days.getByRole("radio", { name: /^Tuesday/ })).toBeDisabled();
    await expect(days.getByRole("radio", { name: /^Wednesday/ })).toHaveAttribute("aria-checked", "true");
    await expect(days.getByRole("radio", { name: /^Wednesday/ })).toBeEnabled();
  });

  test("a free cook sees Busy week locked, with a link to plans", async ({ page }) => {
    await stubRateLimit(page, 5);
    await signIn(page, freeEmail);
    await page.goto("/weekly-plan");

    const lock = page.getByRole("link", { name: /Busy week is a Plus & Pro feature/ });
    await expect(lock).toBeVisible();
    await expect(lock).toHaveAttribute("href", "/pricing");
    await expect(page.getByRole("button", { name: /^Busy week/ })).toHaveCount(0);
  });

  test("on a phone, the Generate button stays topmost above the mobile nav", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await stubRateLimit(page, 37);
    await stubBusyWeek(page);
    await openWeeklyPlan(page, paidEmail);

    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await pickDay(page, 1, FREE_DAY);
    await expectButtonIsTopmost(page, /Generate 1 dinner/);
  });

  test("after Generate, a queued row shows per pick at once, and the sheet holds still while it waits", async ({ page }) => {
    test.setTimeout(90_000);
    await stubRateLimit(page, 37);
    // Hold the POST and the first poll, so the sheet stays in its waiting state.
    let releaseWaiting!: () => void;
    const waiting = new Promise<void>((resolve) => {
      releaseWaiting = resolve;
    });
    await page.route("**/api/busy-week", async (route) => {
      await waiting;
      const body = route.request().postDataJSON() as BusyWeekPostBody;
      await fulfillJson(route, busyWeekResponse(body, "Queued Dinner", "queued"));
    });
    await page.route("**/api/busy-week/**", async (route) => {
      await waiting;
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Batch not found" }) });
    });
    await openWeeklyPlan(page, paidEmail);

    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    const dialog = page.getByRole("dialog");
    await page.getByLabel("Cuisine").first().selectOption("Thai");
    await page.getByRole("radiogroup", { name: "Meal style for dinner 1" }).getByRole("radio", { name: "Taco" }).click();
    await pickDay(page, 1, FREE_DAY);
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(1).selectOption("Mexican");
    await pickDay(page, 2, SECOND_DAY);
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(2).selectOption("Thai");
    await pickDay(page, 3, THIRD_DAY);

    const panel = dialog.locator(":scope > div");
    const formHeight = (await panel.boundingBox())!.height;

    await page.getByRole("button", { name: /Generate 3 dinners/ }).click();

    // One row per pick, queued ("Making…"), in submit order, before the server has answered.
    const rows = dialog.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(dialog.getByText("Making…")).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Thai · Taco · Wed");
    await expect(rows.nth(1)).toContainText("Mexican · Any · Fri");
    await expect(rows.nth(2)).toContainText("Thai · Any · Sun");

    // The sheet keeps its height when the form gives way to the progress view.
    expect(Math.abs((await panel.boundingBox())!.height - formHeight)).toBeLessThanOrEqual(1);

    // The scroll area never overflows while it waits, across several animation frames.
    const overflow = await page.evaluate(async () => {
      const area = document.querySelector('[role="dialog"] [aria-live="polite"]') as HTMLElement;
      const seen: number[] = [];
      for (let frame = 0; frame < 60; frame++) {
        seen.push(area.scrollHeight - area.clientHeight);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
      return seen;
    });
    expect(Math.max(...overflow)).toBeLessThanOrEqual(0);

    // The same rows are filled in by the server's answer, not replaced.
    releaseWaiting();
    await expect(dialog.getByText("All 3 dinners are in your plan.")).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(dialog.getByText(`Queued Dinner 1 ${runId}`)).toBeVisible();
    // Still the same height once the dinners are placed, which also changes the conflicts the form sees.
    expect(Math.abs((await panel.boundingBox())!.height - formHeight)).toBeLessThanOrEqual(1);
  });

  test("a batch whose request never reached the server gives up with a retry that uses a new batch id", async ({ page }) => {
    test.setTimeout(90_000);
    await stubRateLimit(page, 37);
    const posted: string[] = [];
    await page.route("**/api/busy-week", async (route) => {
      const body = route.request().postDataJSON() as BusyWeekPostBody;
      posted.push(body.batchId);
      // The first request never arrives. The retry gets through.
      if (posted.length === 1) return route.abort("failed");
      await fulfillJson(route, busyWeekResponse(body, "Retry Dinner", "retry"));
    });
    await page.route("**/api/busy-week/**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Batch not found" }) })
    );
    await openWeeklyPlan(page, paidEmail);

    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await pickDay(page, 1, FREE_DAY);
    await page.getByRole("button", { name: /Generate 1 dinner/ }).click();
    // setFixedTime freezes Date.now, which the give-up timer reads, so move "now" past it.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 20_000));

    // The server has never heard of the batch, so the sheet stops waiting and says so.
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("didn't start", { timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Generate 1 dinner/ })).toBeEnabled();

    await page.getByRole("button", { name: /Generate 1 dinner/ }).click();
    await expect(page.getByText("All 1 dinners are in your plan.")).toBeVisible();
    expect(posted).toHaveLength(2);
    expect(posted[1]).not.toBe(posted[0]);
  });

  test("a delayed response from an earlier attempt does not replace the one the user retried", async ({ page }) => {
    test.setTimeout(90_000);
    await stubRateLimit(page, 37);
    const posted: string[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route("**/api/busy-week", async (route) => {
      const body = route.request().postDataJSON() as BusyWeekPostBody;
      posted.push(body.batchId);
      if (posted.length === 1) {
        // The first attempt stays open until the user has already retried.
        await firstHeld;
        return fulfillJson(route, busyWeekResponse(body, "Stale Dinner", "stale"));
      }
      await fulfillJson(route, busyWeekResponse(body, "Busy Dinner", "fresh"));
    });
    await page.route("**/api/busy-week/**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Batch not found" }) })
    );
    await openWeeklyPlan(page, paidEmail);

    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await pickDay(page, 1, FREE_DAY);
    await page.getByRole("button", { name: /Generate 1 dinner/ }).click();
    // setFixedTime freezes Date.now, which the give-up timer reads, so move "now" past it.
    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 20_000));

    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("didn't start", { timeout: 60_000 });
    await page.getByRole("button", { name: /Generate 1 dinner/ }).click();
    await expect(page.getByRole("dialog").getByText(`Busy Dinner 1 ${runId}`)).toBeVisible();

    releaseFirst();
    await flushReact(page);

    await expect(page.getByText(`Stale Dinner 1 ${runId}`)).toHaveCount(0);
    await expect(page.getByRole("dialog").getByText(`Busy Dinner 1 ${runId}`)).toBeVisible();
    expect(posted).toHaveLength(2);
  });

  test("the generator offers Meal style, shows it on review, and sends it", async ({ page }) => {
    await stubRateLimit(page, 5);
    await signIn(page, generatorEmail);

    const sent: Array<Record<string, unknown>> = [];
    await page.route("**/api/generate-recipe", async (route) => {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `style-${runId}`,
          title: `Taco Night ${runId}`,
          description: "Stubbed.",
          ingredients: [{ name: "Tortilla", amount: 4, unit: "count", category: "Bakery" }],
          instructions: ["Warm the tortillas."],
          tags: { cuisine: "Mexican", meal: "Dinner", protein: "None" },
          prepTime: "5 minutes",
          cookTime: "10 minutes",
          servings: 2,
        }),
      });
    });

    await page.getByRole("button", { name: "Pantry" }).click();
    await page.getByPlaceholder(/chicken breast, broccoli/i).fill("tortilla, black beans");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const styles = page.getByRole("radiogroup", { name: "Meal style" });
    await expect(styles.getByRole("radio", { name: "Any" })).toHaveAttribute("aria-checked", "true");
    await styles.getByRole("radio", { name: "Taco" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Meal style: Taco")).toBeVisible();
    await page.getByRole("button", { name: "Generate Recipe" }).click();
    await expect(page.getByRole("heading", { name: `Taco Night ${runId}` })).toBeVisible();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ mode: "pantry", mealStyle: "Taco" });
  });
});

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

const admin = hasEnv
  ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const userIds: string[] = [];
let paidId = "";

/** The UTC weekday index (Monday = 0) of today. */
function todayIndex(): number {
  return (new Date().getUTCDay() + 6) % 7;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The day that already has a dinner next week (the replace case), and two other free days. */
const CONFLICT_DAY = 0;
const SECOND_DAY = 4;
const THIRD_DAY = 6;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/generator$/);
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

/** Stub the busy-week POST: one result per pick, placed (or replaced when a replacement was confirmed). */
async function stubBusyWeek(page: Page) {
  const posted: Array<Record<string, unknown>> = [];
  await page.route("**/api/busy-week", async (route) => {
    const body = route.request().postDataJSON() as {
      batchId: string;
      weekStart: string;
      picks: Array<{ cuisine: string; mealStyle?: string; dayOfWeek: number; replaceSlotId?: string }>;
    };
    posted.push(body as unknown as Record<string, unknown>);
    const results = body.picks.map((pick, index) => {
      const recipe = {
        id: `busy-${runId}-${index}`,
        title: `Busy Dinner ${index + 1} ${runId}`,
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
          id: `busy-slot-${runId}-${index}`,
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        batchId: body.batchId,
        status: "completed",
        usage: { reserved: results.length, refunded: 0, remaining: 34 },
        results,
      }),
    });
  });
  await page.route("**/api/busy-week/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Batch not found" }) })
  );
  return posted;
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

    // A dinner that is already on the plan for today, so the journey hits the replace warning.
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

    // Next week has no past days, so the journey never depends on the weekday it runs on.
    const weekStartDate = new Date();
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - todayIndex() + 7);
    const weekStart = weekStartDate.toISOString().slice(0, 10);
    const slot = await admin.from("weekly_plan").insert({
      user_id: paidId,
      recipe_id: recipe.data!.id,
      week_start: weekStart,
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
    await signIn(page, paidEmail);
    await page.goto("/weekly-plan");

    // Plan next week, the one with the seeded dinner.
    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await expect(page.getByRole("heading", { name: "Busy week" })).toBeVisible();

    // Pick 1: the day that already has a dinner, Thai, Taco.
    const conflictName = DAY_NAMES[CONFLICT_DAY];
    await page.getByRole("radiogroup", { name: "Day for dinner 1" }).getByRole("radio", { name: new RegExp(`^${conflictName}`) }).click();
    await page.getByLabel("Cuisine").first().selectOption("Thai");
    await page.getByRole("radiogroup", { name: "Meal style for dinner 1" }).getByRole("radio", { name: "Taco" }).click();

    await expect(page.getByText(existingTitle).first()).toBeVisible();
    await page.getByLabel(new RegExp(`Replace ${conflictName}`)).check();

    // Pick 2: a repeat cuisine on another day.
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(1).selectOption("Thai");
    await page.getByRole("radiogroup", { name: "Day for dinner 2" }).getByRole("radio", { name: new RegExp(`^${DAY_NAMES[SECOND_DAY]}`) }).click();

    // Pick 3, with no conflict.
    await page.getByRole("button", { name: /Add another/ }).click();
    await page.getByLabel("Cuisine").nth(2).selectOption("Mexican");
    await page.getByRole("radiogroup", { name: "Day for dinner 3" }).getByRole("radio", { name: new RegExp(`^${DAY_NAMES[THIRD_DAY]}`) }).click();

    await expect(page.getByText("This will use 3 of your 37 remaining recipes this week.")).toBeVisible();
    await page.getByRole("button", { name: /Generate 3 dinners/ }).click();

    await expect(page.getByText("All 3 dinners are in your plan.")).toBeVisible();
    expect(posted).toHaveLength(1);
    expect((posted[0] as { picks: Array<{ mealStyle?: string; replaceSlotId?: string }> }).picks[0]).toMatchObject({
      mealStyle: "Taco",
    });
    expect((posted[0] as { picks: Array<{ replaceSlotId?: string }> }).picks[0].replaceSlotId).toBeTruthy();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(`Busy Dinner 1 ${runId}`)).toBeVisible();
    await expect(page.getByText(existingTitle)).toHaveCount(0);
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
    await signIn(page, paidEmail);
    await page.goto("/weekly-plan");

    await page.getByRole("button", { name: "Next week" }).click();
    await page.getByRole("button", { name: /^Busy week/ }).click();
    await expectButtonIsTopmost(page, /Generate 1 dinner/);
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

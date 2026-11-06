import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Browser tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `mise-browser-${runId}@example.com`;
const password = `Mise-Browser-${runId}!`;
const recipeTitle = `Playwright Pantry Pasta ${runId}`;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let userId = "";

async function allowRecipeRequests(page: Page) {
  // The browser journey should test our interface, not spend AI credits or
  // depend on a model's wording. These fixed replies make failures repeatable.
  await page.route("**/api/rate-limit", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ isBlocked: false, remaining: 5, limit: 5 }),
    })
  );
  await page.route("**/api/generate-recipe", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: `browser-${runId}`,
        title: recipeTitle,
        description: "A deterministic recipe used by the browser safety check.",
        ingredients: [
          { name: "Tomato", amount: 2, unit: "count", category: "Produce" },
          { name: "Pasta", amount: 200, unit: "g", category: "Pantry" },
        ],
        instructions: ["Cook the pasta.", "Add the tomato."],
        tags: { cuisine: "Italian", meal: "Dinner", protein: "None" },
        prepTime: "5 minutes",
        cookTime: "15 minutes",
        servings: 2,
      }),
    })
  );
}

async function signIn(page: Page) {
  await allowRecipeRequests(page);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/generator$/);
}

async function expectButtonIsTopmost(page: Page, name: string) {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport();
  const box = await button.boundingBox();
  expect(box).toBeTruthy();
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest("button")?.textContent?.trim() ?? null;
    },
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  );
  expect(hit).toMatch(new RegExp(name));
}

test.describe("Mise AI's three critical user journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Could not create the browser-test user");
    }
    userId = created.data.user.id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    await admin.from("weekly_plan").delete().eq("user_id", userId);
    await admin.from("pantry_items").delete().eq("user_id", userId);
    await admin.from("grocery_list").delete().eq("user_id", userId);
    await admin.from("recipes").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  test("a visitor sees the invite-only front door and is guided to sign in", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByText("Invite only").first()).toBeVisible();
    await expect(main.getByRole("link", { name: /sign up/i })).toHaveCount(0);
    await main.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("the sign-up page is an invite-only note with no form", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Mise AI is invite-only" })).toBeVisible();
    await expect(page.getByText(/check your email for the invite link/i)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.getByLabel("Email address")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign up/i })).toHaveCount(0);

    await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the login page explains invites and has no sign-up link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/invite-only/i)).toBeVisible();
    await expect(page.getByText("Sign up for free")).toHaveCount(0);
    await expect(page.locator('a[href="/signup"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeVisible();
  });

  test("the callback ignores an unsafe next and lands on a same-origin page", async ({ page }) => {
    // No valid credentials, so the callback sends the visitor to /login on this origin.
    await page.goto("/auth/callback?next=//evil.com");
    await expect(page).toHaveURL(/\/login\?error=confirmation_failed$/);
    await expect(page.getByText(/This link expired or was already used/)).toBeVisible();
  });

  test("the login page explains an expired invite or reset link, and never echoes the query", async ({ page }) => {
    await page.goto("/login?error=invite_expired");
    await expect(page.getByText("This invite link expired. Ask Kyle for a new one.")).toBeVisible();

    await page.goto("/login?error=reset_expired");
    await expect(page.getByText(/password reset link expired/)).toBeVisible();

    await page.goto("/login?error=%3Cb%3Ehello%3C%2Fb%3E");
    await expect(page.getByText("hello")).toHaveCount(0);
    await expect(page.getByText(/link expired/)).toHaveCount(0);
  });

  test("a returning cook can sign in and reach the recipe generator", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "What are you craving?" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });
  });

  test("a cook can generate a pantry recipe, save it, and find it in the collection", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Pantry" }).click();
    await page.getByPlaceholder(/chicken breast, broccoli/i).fill("tomato, pasta");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Generate Recipe" }).click();

    await expect(page.getByRole("heading", { name: recipeTitle })).toBeVisible();
    await page.getByRole("button", { name: "Save to Collection" }).click();
    await expect(page.getByText("Recipe Saved!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "No, Thanks" }).click();
    await page.goto("/collection");
    await expect(page.getByRole("heading", { name: recipeTitle })).toBeVisible();
  });

  test("a cook can schedule a meal, build a grocery list, and open cook mode", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/collection");
    await expect(page.getByRole("heading", { name: recipeTitle })).toBeVisible();
    await page.getByTitle("Add to this week").click();
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page.getByText("Added to your weekly plan")).toBeVisible();

    await page.goto("/weekly-plan");
    await expect(page.getByText(recipeTitle)).toBeVisible();
    await page.getByRole("button", { name: /Build grocery list from this week/i }).click();
    await expect(page.getByText(/grocery item/i)).toBeVisible();

    await page.goto("/grocery-list");
    await expect(page.getByText("Tomato")).toBeVisible();

    await page.goto("/weekly-plan");
    await page.getByRole("link", { name: "Cook" }).first().click();
    await expect(page.getByRole("heading", { name: recipeTitle })).toBeVisible();
    await page.getByRole("button", { name: "I'm done cooking" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page).toHaveURL(/\/weekly-plan/);
  });

  test("a cook can open pantry from the phone bottom menu", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/generator");

    const menu = page.getByRole("navigation", { name: "Primary" });
    await expect(menu.getByRole("link", { name: "Weekly" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Pantry" })).toBeVisible();

    await page.getByRole("button", { name: "Open site menu" }).click();
    await expect(
      page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "About" })
    ).toBeVisible();

    await menu.getByRole("link", { name: "Pantry" }).click();
    await expect(page).toHaveURL(/\/pantry/);
    await expect(menu.getByRole("link", { name: "Pantry" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("heading", { name: "Pantry", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/generator/);
    await expect(page.getByRole("button", { name: "Open site menu" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "About" })
    ).toBeHidden();
  });

  test("a visitor can open site pages from the phone hamburger menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Open site menu" }).click();
    const siteMenu = page.getByRole("navigation", { name: "Site" });
    await expect(siteMenu.getByRole("link", { name: "About" })).toBeVisible();
    await expect(siteMenu.getByRole("link", { name: "Pricing" })).toHaveCount(0);
    await expect(siteMenu.getByRole("link", { name: "Contact" })).toBeVisible();
    await expect(siteMenu.getByRole("link", { name: "Pantry" })).toHaveCount(0);
    await expect(siteMenu.getByRole("link", { name: "Weekly Plan" })).toHaveCount(0);

    await siteMenu.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about/);
    await expect(page.getByRole("heading", { name: /Cooking shouldn/i })).toBeVisible();

    await page.goto("/login");
    await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mise AI" })).toHaveCount(1);
  });

  test("a cook can open settings from the phone hamburger menu", async ({
    page,
  }) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/generator");

    await page.getByRole("button", { name: "Open site menu" }).click();
    const siteMenu = page.getByRole("navigation", { name: "Site" });
    await expect(siteMenu.getByRole("link", { name: "Settings" })).toBeVisible();
    await siteMenu.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("add-to-week actions stay tappable above the mobile nav", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent =
        "nextjs-portal, [data-next-badge-root] { display: none !important; }";
      document.documentElement.appendChild(style);
    });
    await signIn(page);
    await page.goto("/collection");
    await expect(page.getByRole("heading", { name: recipeTitle })).toBeVisible();
    await page.getByTitle(/Add (to this week|another slot this week)/).click();
    await expectButtonIsTopmost(page, "Add to plan");

    const artifactDir = process.env.PLAYWRIGHT_ARTIFACTS;
    if (artifactDir) {
      await page.screenshot({
        path: `${artifactDir}/add_to_week_modal_collection_mobile.png`,
      });
    }

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.goto("/weekly-plan");
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expectButtonIsTopmost(page, "Add to plan");
    if (artifactDir) {
      await page.screenshot({
        path: `${artifactDir}/add_to_week_modal_weekly_plan_mobile.png`,
      });
    }
  });
});

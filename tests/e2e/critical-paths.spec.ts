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

  test("a visitor is guided from the home page to sign in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Start Generating/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
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

    await menu.getByRole("link", { name: "Pantry" }).click();
    await expect(page).toHaveURL(/\/pantry/);
    await expect(menu.getByRole("link", { name: "Pantry" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("heading", { name: "Pantry", exact: true })).toBeVisible();
  });
});

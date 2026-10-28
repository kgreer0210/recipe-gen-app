import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getAuthenticatedUser, chatJson, checkAndIncrementUsage, recordUsageTokens, settings } =
  vi.hoisted(() => ({
    getAuthenticatedUser: vi.fn(),
    chatJson: vi.fn(),
    checkAndIncrementUsage: vi.fn(),
    recordUsageTokens: vi.fn(),
    settings: {
      current: {
        dietary_preferences: ["Gluten-Free"],
        disliked_ingredients: ["cilantro"],
        default_servings: 4,
      } as Record<string, unknown> | null,
    },
  }));

vi.mock("@/lib/supabase/auth-helper", () => ({ getAuthenticatedUser }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: settings.current, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage")>();
  return { ...actual, checkAndIncrementUsage, recordUsageTokens };
});

vi.mock("@/lib/openrouter/chatJson", () => ({ chatJson }));

import { POST } from "@/app/api/generate-recipe/route";

const recipeJson = {
  title: "Test Dish",
  description: "A dish.",
  ingredients: [{ name: "rice", amount: 1, unit: "cup", category: "Pantry" }],
  instructions: ["Cook the rice."],
  tags: { cuisine: "Mexican", meal: "Dinner", protein: "Chicken" },
  prepTime: "5 minutes",
  cookTime: "20 minutes",
};

function postGenerate(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/generate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** The system + user prompts the route sent to the model on the last call. */
function lastPrompt(): string {
  const call = chatJson.mock.calls.at(-1);
  if (!call) throw new Error("chatJson was not called");
  return call[1] as string;
}

describe("POST /api/generate-recipe prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: "user-1" } });
    checkAndIncrementUsage.mockResolvedValue({ allowed: true, planKey: "plus" });
    chatJson.mockResolvedValue({ data: recipeJson, modelUsed: "m", usage: undefined });
    settings.current = {
      dietary_preferences: ["Gluten-Free"],
      disliked_ingredients: ["cilantro"],
      default_servings: 4,
    };
  });

  const classic = {
    mode: "classic",
    cuisine: "Mexican",
    meal: "Dinner",
    protein: "Chicken",
    proteinCut: "Thighs",
    dietaryPreferences: ["Dairy-Free"],
    servings: 3,
  };

  const pantry = {
    mode: "pantry",
    ingredients: ["eggs", "spinach", "feta"],
    servings: 2,
  };

  it("keeps the classic prompt exactly as it is today", async () => {
    const response = await postGenerate(classic);

    expect(response.status).toBe(200);
    expect(lastPrompt()).toMatchSnapshot();
  });

  it("keeps the pantry prompt exactly as it is today", async () => {
    const response = await postGenerate(pantry);

    expect(response.status).toBe(200);
    expect(lastPrompt()).toMatchSnapshot();
  });

  it("sends the same prompt when the meal style is Any as when it is missing", async () => {
    await postGenerate(classic);
    const withoutStyle = lastPrompt();

    await postGenerate({ ...classic, mealStyle: "Any" });
    const withAny = lastPrompt();

    await postGenerate({ ...pantry });
    const pantryWithoutStyle = lastPrompt();

    await postGenerate({ ...pantry, mealStyle: "Any" });
    const pantryWithAny = lastPrompt();

    expect(withAny).toBe(withoutStyle);
    expect(pantryWithAny).toBe(pantryWithoutStyle);
  });
});

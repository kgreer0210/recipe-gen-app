import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "Database tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
  );
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const titlePrefix = `Automated test ${runId}`;
const password = `Mise-Test-${runId}!`;
const emails = [`mise-test-a-${runId}@example.com`, `mise-test-b-${runId}@example.com`];

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userA: SupabaseClient;
let userAId = "";
let userBId = "";

function recipeRow(userId: string, suffix: string) {
  return {
    user_id: userId,
    title: `${titlePrefix} ${suffix}`,
    cuisine: "Italian",
    meal_type: "Dinner",
    prep_time: "10 minutes",
    cook_time: "20 minutes",
    protein: "None",
    ingredients: [{ name: "Tomato", amount: 2, unit: "count", category: "Produce" }],
    instructions: ["Cook the tomatoes."],
    servings: 2,
  };
}

describe("Supabase recipe storage", () => {
  beforeAll(async () => {
    // Temporary confirmed users let us exercise the same Row Level Security
    // rules as the app. The final cleanup removes both users and their rows.
    const first = await admin.auth.admin.createUser({
      email: emails[0],
      password,
      email_confirm: true,
    });
    const second = await admin.auth.admin.createUser({
      email: emails[1],
      password,
      email_confirm: true,
    });

    if (first.error || !first.data.user) throw first.error ?? new Error("Could not create test user A");
    if (second.error || !second.data.user) throw second.error ?? new Error("Could not create test user B");
    userAId = first.data.user.id;
    userBId = second.data.user.id;

    userA = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signIn = await userA.auth.signInWithPassword({ email: emails[0], password });
    if (signIn.error) throw signIn.error;
  });

  afterEach(async () => {
    await admin.from("weekly_plan").delete().in("user_id", [userAId, userBId]);
    await admin.from("recipes").delete().in("user_id", [userAId, userBId]);
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("saves, reads, updates, and deletes a recipe", async () => {
    const inserted = await userA.from("recipes").insert(recipeRow(userAId, "lifecycle")).select().single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.title).toBe(`${titlePrefix} lifecycle`);

    const updated = await userA
      .from("recipes")
      .update({ servings: 4 })
      .eq("id", inserted.data!.id)
      .select("servings")
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data?.servings).toBe(4);

    const removed = await userA.from("recipes").delete().eq("id", inserted.data!.id);
    expect(removed.error).toBeNull();
    const remaining = await userA.from("recipes").select("id").eq("id", inserted.data!.id);
    expect(remaining.data).toEqual([]);
  });

  it("keeps one user's recipes private from another user", async () => {
    const otherRecipe = await admin
      .from("recipes")
      .insert(recipeRow(userBId, "private"))
      .select("id")
      .single();
    expect(otherRecipe.error).toBeNull();

    const attemptedRead = await userA.from("recipes").select("id").eq("id", otherRecipe.data!.id);
    expect(attemptedRead.error).toBeNull();
    expect(attemptedRead.data).toEqual([]);
  });

  it("removes a weekly-plan entry when its recipe is deleted", async () => {
    const recipe = await userA
      .from("recipes")
      .insert(recipeRow(userAId, "cascade"))
      .select("id")
      .single();
    expect(recipe.error).toBeNull();

    const planned = await userA.from("weekly_plan").insert({
      user_id: userAId,
      recipe_id: recipe.data!.id,
    });
    expect(planned.error).toBeNull();

    const removed = await userA.from("recipes").delete().eq("id", recipe.data!.id);
    expect(removed.error).toBeNull();
    const orphan = await admin.from("weekly_plan").select("id").eq("recipe_id", recipe.data!.id);
    expect(orphan.data).toEqual([]);
  });
});

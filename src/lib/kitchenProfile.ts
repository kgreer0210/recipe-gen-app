import type { UserKitchenProfile } from "@/types";

export async function fetchKitchenProfile(): Promise<UserKitchenProfile> {
  const response = await fetch("/api/user/settings", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    return {
      timezone: "UTC",
      defaultServings: 4,
      dietaryPreferences: [],
      dislikedIngredients: [],
    };
  }
  const data = (await response.json()) as Partial<UserKitchenProfile>;
  return {
    timezone: data.timezone || "UTC",
    defaultServings:
      typeof data.defaultServings === "number" &&
      Number.isFinite(data.defaultServings)
        ? data.defaultServings
        : 4,
    dietaryPreferences: Array.isArray(data.dietaryPreferences)
      ? data.dietaryPreferences
      : [],
    dislikedIngredients: Array.isArray(data.dislikedIngredients)
      ? data.dislikedIngredients
      : [],
  };
}

export async function saveKitchenProfile(
  profile: Partial<UserKitchenProfile>
): Promise<UserKitchenProfile> {
  const response = await fetch("/api/user/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    throw new Error("Failed to save kitchen profile");
  }
  return (await response.json()) as UserKitchenProfile;
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

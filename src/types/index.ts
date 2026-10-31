export type Unit =
  | "lb"
  | "oz"
  | "cup"
  | "tbsp"
  | "tsp"
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "count"
  | "slice"
  | "clove"
  | "pinch";

export interface Subscription {
  id: string;
  user_id: string;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused";
  price_id: string;
  plan_key?: "free" | "plus" | "pro";
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type GrocerySource = "manual" | "plan";
export type PantrySource = "manual" | "leftover";

export const MEAL_SLOTS: MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DIETARY_PREFERENCES_LIST = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Dairy-Free",
  "Nut-Free",
  "Low-Carb",
  "Keto",
  "Paleo",
  "Bariatric",
  "GLP-1",
  "Heart Healthy",
] as const;

/** Max dietary preferences per request or saved profile. Sized above the list so picking every chip fits. */
export const MAX_DIETARY_PREFERENCES = 20;

export interface Ingredient {
  id?: string;
  name: string;
  nameNormalized?: string;
  amount: number;
  unit: Unit;
  category?: string;
  isChecked?: boolean;
  source?: GrocerySource;
  planWeekStart?: string | null;
}

export interface WeeklyPlanSlot {
  id: string;
  recipeId: string;
  weekStart: string;
  dayOfWeek: number | null;
  mealSlot: MealSlot | null;
  servingsOverride: number | null;
  cookedAt: string | null;
  createdAt: string;
}

export interface PantryItem {
  id: string;
  name: string;
  nameNormalized: string;
  amount: number;
  unit: Unit;
  category?: string;
  source: PantrySource;
}

export interface UserKitchenProfile {
  timezone: string;
  defaultServings: number;
  dietaryPreferences: string[];
  dislikedIngredients: string[];
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  tags: {
    cuisine: string;
    meal: string;
    protein: string;
  };
  prepTime: string;
  cookTime: string;
  servings: number;
}

export const CUISINE_TYPES = [
  "Indian",
  "Italian",
  "Mexican",
  "American",
  "Chinese",
  "Japanese",
  "Thai",
  "Mediterranean",
  "French",
  "Korean",
  "Vietnamese",
  "Greek",
  "Spanish",
  "Middle Eastern",
  "Cajun",
  "German",
] as const;

export type CuisineType = (typeof CUISINE_TYPES)[number];

/** Optional shape for a dish. "Any" lets the AI choose. Prompt-only, never stored. */
export const MEAL_STYLES = [
  "Any",
  "Bowl",
  "Plate",
  "Taco",
  "Sandwich",
  "Wrap",
  "Pizza",
  "Pasta",
  "Soup",
  "Salad",
  "Skewers",
] as const;

export type MealStyle = (typeof MEAL_STYLES)[number];

/**
 * Optional protein for a Busy week pick or a pantry recipe. "Any" lets the AI choose.
 * Prompt-only, never stored. Names match ProteinType where they match.
 */
export const PROTEIN_CHOICES = [
  "Any",
  "Chicken",
  "Beef",
  "Pork",
  "Turkey",
  "Fish",
  "Shrimp/Seafood",
  "Tofu",
  "Beans/Legumes",
  "Eggs",
  "Vegetarian (no meat)",
] as const;

export type ProteinChoice = (typeof PROTEIN_CHOICES)[number];
export type MealType = "Breakfast" | "Lunch" | "Dinner" | "Snack";
export type ProteinType =
  | "Chicken"
  | "Beef"
  | "Pork"
  | "Lamb"
  | "Turkey"
  | "Fish"
  | "Tofu"
  | "Beans"
  | "Eggs"
  | "None";

// Mapping of proteins to their available cuts
export const proteinCuts: Partial<Record<ProteinType, string[]>> = {
  Chicken: ["Any cut", "Breast", "Thigh", "Wings", "Drumsticks", "Whole"],
  Beef: [
    "Any cut",
    "Ground",
    "Sirloin",
    "Ribeye",
    "New York Strip",
    "Roast",
    "Brisket",
    "Short Ribs",
  ],
  Pork: [
    "Any cut",
    "Chops",
    "Ribs",
    "Tenderloin",
    "Sausage",
    "Ground",
    "Bacon",
  ],
  Lamb: ["Any cut", "Chops", "Leg", "Ground", "Shoulder"],
  Turkey: ["Any cut", "Breast", "Ground", "Whole"],
  Fish: ["Any Fish", "Salmon", "Tuna", "Cod", "Shrimp", "Tilapia"],
  Tofu: ["Any Tofu", "Tofu", "Tempeh", "Seitan"],
  Beans: [
    "Any Beans",
    "Beans",
    "Lentils",
    "Chickpeas",
    "Black Beans",
    "Pinto Beans",
  ],
};

export interface GenerateRecipeRequest {
  mode: "classic" | "pantry";
  cuisine?: CuisineType;
  meal?: MealType;
  protein?: ProteinType | ProteinChoice;
  proteinCut?: string;
  ingredients?: string[];
  dietaryPreferences?: string[];
  servings?: number;
  mealStyle?: MealStyle;
  adminModelOverride?: string;
}

/** "pending" only appears while a batch is running. */
export type BusyWeekPickStatus = "pending" | "placed" | "replaced" | "unscheduled" | "failed";

export type BusyWeekErrorCode =
  | "generation_failed"
  | "save_failed"
  | "slot_taken"
  | "plan_insert_failed"
  | "interrupted";

export interface BusyWeekPick {
  cuisine: CuisineType;
  mealStyle?: MealStyle;
  protein?: ProteinChoice;
  dayOfWeek: number;
  replaceSlotId?: string;
}

export interface BusyWeekRequest {
  batchId: string;
  weekStart: string;
  picks: BusyWeekPick[];
  dietaryPreferences?: string[];
}

export interface BusyWeekResult {
  index: number;
  cuisine: CuisineType;
  mealStyle: MealStyle;
  protein: ProteinChoice;
  dayOfWeek: number;
  status: BusyWeekPickStatus;
  recipe?: Recipe;
  planSlot?: WeeklyPlanSlot;
  error?: BusyWeekErrorCode;
}

export interface BusyWeekResponse {
  batchId: string;
  status: "running" | "completed" | "partial" | "failed";
  usage: {
    reserved: number;
    refunded: number;
    remaining: number | null;
  };
  results: BusyWeekResult[];
}

export interface RefineRecipeRequest {
  currentRecipe: Recipe;
  instructions: string;
}

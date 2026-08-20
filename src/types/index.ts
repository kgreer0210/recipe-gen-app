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
  "Heart Healthy",
] as const;

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

export type CuisineType =
  | "Indian"
  | "Italian"
  | "Mexican"
  | "American"
  | "Chinese"
  | "Japanese"
  | "Thai"
  | "Mediterranean"
  | "French"
  | "Korean"
  | "Vietnamese"
  | "Greek"
  | "Spanish"
  | "Middle Eastern"
  | "Cajun"
  | "German";
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
  protein?: ProteinType;
  proteinCut?: string;
  ingredients?: string[];
  dietaryPreferences?: string[];
  servings?: number;
  adminModelOverride?: string;
}

export interface RefineRecipeRequest {
  currentRecipe: Recipe;
  instructions: string;
}

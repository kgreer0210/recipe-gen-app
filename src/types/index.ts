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
}

export interface Ingredient {
  id?: string;
  name: string;
  nameNormalized?: string;
  amount: number;
  unit: Unit;
  category?: string;
  isChecked?: boolean;
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
}

export interface RefineRecipeRequest {
  currentRecipe: Recipe;
  instructions: string;
}

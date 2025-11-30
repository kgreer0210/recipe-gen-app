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
  Fish: ["Any cut", "Salmon", "Tuna", "Cod", "Shrimp", "Tilapia"],
  Tofu: ["Any cut", "Tofu", "Tempeh", "Seitan"],
  Beans: [
    "Any cut",
    "Beans",
    "Lentils",
    "Chickpeas",
    "Black Beans",
    "Pinto Beans",
  ],
};

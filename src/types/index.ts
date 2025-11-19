export type Unit = 'lb' | 'oz' | 'cup' | 'tbsp' | 'tsp' | 'g' | 'kg' | 'ml' | 'l' | 'count' | 'slice' | 'clove' | 'pinch';

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

export type CuisineType = 'Indian' | 'Italian' | 'Mexican' | 'American' | 'Chinese' | 'Japanese' | 'Thai' | 'Mediterranean' | 'French' | 'Korean' | 'Vietnamese' | 'Greek' | 'Spanish' | 'Middle Eastern' | 'Cajun' | 'German';
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
export type ProteinType = 'Ground Beef' | 'Chicken' | 'Pork' | 'Tofu' | 'Fish' | 'Beans' | 'Lentils' | 'Beef' | 'Shrimp' | 'Lamb' | 'Turkey' | 'Eggs' | 'Salmon' | 'None';

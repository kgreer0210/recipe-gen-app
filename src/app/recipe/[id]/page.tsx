"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useAddToGroceryList } from "@/hooks/useGroceryListMutations";
import { useAddToWeeklyPlan, useRemoveFromWeeklyPlan } from "@/hooks/useWeeklyPlanMutations";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import {
  ArrowLeft,
  Clock,
  ChefHat,
  Utensils,
  ShoppingCart,
  CalendarPlus,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Recipe } from "@/types";
import { formatRecipeAmount } from "@/lib/grocery/format";

export default function RecipeDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { recipes: savedRecipes = [], loading: isLoading } =
    useRecipesRealtime();
  const { mutateAsync: addToGroceryList } = useAddToGroceryList();
  const { mutate: addToWeeklyPlan } = useAddToWeeklyPlan();
  const { mutateAsync: removeFromWeeklyPlan } = useRemoveFromWeeklyPlan();
  const { weeklyPlan } = useWeeklyPlanRealtime();
  const [isTogglingPlan, setIsTogglingPlan] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [servings, setServings] = useState(1);

  const id = params.id as string;

  useEffect(() => {
    if (savedRecipes.length > 0) {
      const found = savedRecipes.find((r) => r.id === id);
      if (found) {
        setRecipe(found);
        setServings(found.servings || 1);
      }
    }
  }, [savedRecipes, id]);

  const handleAddToGrocery = async () => {
    if (!recipe) return;
    setIsAdding(true);
    try {
      await addToGroceryList({
        recipe,
        servings,
        baseServings: recipe.servings,
      });
      toast.success(
        <div className="flex items-center justify-between gap-4 w-full">
          <span>
            Added ingredients for {servings}{" "}
            {servings === 1 ? "serving" : "servings"} to your grocery list
          </span>
          <Link
            href="/grocery-list"
            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-blue-100 hover:bg-blue-200 transition-colors font-medium text-blue-600 whitespace-nowrap"
          >
            View Grocery List
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      );
    } catch {
      toast.error("Failed to add to grocery list");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleWeeklyPlan = async () => {
    if (!recipe) return;

    setIsTogglingPlan(true);
    const isInPlan = weeklyPlan.some((r) => r.id === recipe.id);
    const { addRecipeId, removeRecipeId } = useWeeklyPlanStore.getState();

    if (isInPlan) {
      // Remove from weekly plan - optimistically update UI
      removeRecipeId(recipe.id);
      try {
        await removeFromWeeklyPlan(recipe.id);
        toast.success("Removed from weekly plan");
      } catch {
        // Revert optimistic update on failure
        addRecipeId(recipe.id);
        toast.error("Failed to remove recipe from weekly plan");
      }
    } else {
      // Add to weekly plan - optimistically update UI
      addRecipeId(recipe.id);
      try {
        addToWeeklyPlan(recipe);
        toast.success(
          <div className="flex items-center justify-between gap-4 w-full">
            <span>Added recipe to your weekly plan</span>
            <Link
              href="/weekly-plan"
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-green-100 hover:bg-green-200 transition-colors font-medium text-green-700 whitespace-nowrap"
            >
              View Weekly Meals
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        );
      } catch {
        // Revert optimistic update on failure
        removeRecipeId(recipe.id);
        toast.error("Failed to add recipe to weekly plan");
      }
    }
    setIsTogglingPlan(false);
  };

  // Calculate scale factor for ingredient amounts
  const scale = recipe?.servings ? servings / recipe.servings : 1;

  if (isLoading && !recipe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!recipe && !isLoading && savedRecipes.length > 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Recipe not found
        </h1>
        <Link
          href="/"
          className="text-blue-600 hover:underline flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
    );
  }

  if (!recipe) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/collection"
          className="inline-flex items-center text-gray-600 hover:text-blue-600 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Recipes
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h1 className="text-3xl font-bold text-gray-900">
                {recipe.title}
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={handleToggleWeeklyPlan}
                  disabled={isTogglingPlan}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    isTogglingPlan
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : weeklyPlan.some((r) => r.id === recipe?.id)
                      ? "bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow"
                      : "bg-green-600 text-white hover:bg-green-700 shadow-sm hover:shadow"
                  }`}
                >
                  <CalendarPlus className="w-4 h-4" />
                  {isTogglingPlan
                    ? "Updating..."
                    : weeklyPlan.some((r) => r.id === recipe?.id)
                    ? "Remove from Weekly Plan"
                    : "Add to Weekly Plan"}
                </button>
                <button
                  onClick={handleAddToGrocery}
                  disabled={isAdding}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    isAdding
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {isAdding ? "Adding..." : "Add to Grocery List"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {recipe.tags.cuisine}
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {recipe.tags.meal}
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                {recipe.tags.protein}
              </span>
              <div className="flex items-center gap-1 text-gray-500 text-sm ml-2">
                <Clock className="w-4 h-4" />
                <span>Prep: {recipe.prepTime}</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500 text-sm ml-2">
                <Utensils className="w-4 h-4" />
                <span>Cook: {recipe.cookTime}</span>
              </div>
            </div>

            <p className="text-gray-600 text-lg mb-8 leading-relaxed">
              {recipe.description}
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <ChefHat className="w-5 h-5 text-blue-600" />
                    Ingredients
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Servings:</span>
                    <button
                      onClick={() => setServings(Math.max(1, servings - 1))}
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={servings}
                      onChange={(e) =>
                        setServings(
                          Math.max(
                            1,
                            Math.min(20, parseInt(e.target.value) || 1)
                          )
                        )
                      }
                      className="w-12 text-center text-lg font-bold text-blue-600 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 no-spinner"
                    />
                    <button
                      onClick={() => setServings(Math.min(20, servings + 1))}
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                <ul className="space-y-3">
                  {recipe.ingredients.map((ingredient, index) => {
                    const scaledAmount = ingredient.amount * scale;
                    return (
                      <li
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg bg-gray-50"
                      >
                        <div className="w-2 h-2 mt-2 rounded-full bg-blue-400 flex-shrink-0" />
                        <span className="text-gray-700">
                          <span className="font-semibold">
                            {formatRecipeAmount(scaledAmount, ingredient.unit)}{" "}
                            {ingredient.unit}
                          </span>{" "}
                          {ingredient.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-blue-600" />
                  Instructions
                </h2>
                <div className="space-y-6">
                  {recipe.instructions && recipe.instructions.length > 0 ? (
                    recipe.instructions.map((step, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <p className="text-gray-700 mt-1 leading-relaxed">
                          {step}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 italic">
                      No instructions available for this recipe.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

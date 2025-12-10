"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useRemoveRecipe } from "@/hooks/useRecipesMutations";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { useAddToWeeklyPlan } from "@/hooks/useWeeklyPlanMutations";
import { Trash2, Clock, Calendar, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SavedRecipes() {
  const router = useRouter();
  const { user } = useAuth();
  const { recipes: savedRecipes = [] } = useRecipesRealtime();
  const { mutate: removeRecipe } = useRemoveRecipe();
  const { weeklyPlan = [] } = useWeeklyPlanRealtime();
  const { mutate: addToWeeklyPlan } = useAddToWeeklyPlan();

  // Auth check helper
  const requireAuth = (action: () => void) => {
    if (!user) {
      router.push("/login");
      return;
    }
    action();
  };

  if (savedRecipes.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <p className="text-gray-500">No saved recipes yet. Generate some!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Collection</h2>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {savedRecipes.map((recipe) => {
          return (
            <Link
              key={recipe.id}
              href={`/recipe/${recipe.id}`}
              className="block group"
            >
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all relative">
                <div className="absolute top-4 right-4 flex gap-2 z-10">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requireAuth(() => {
                        const isInPlan = weeklyPlan.some(
                          (r) => r.id === recipe.id
                        );
                        if (!isInPlan) {
                          addToWeeklyPlan(recipe);
                        }
                      });
                    }}
                    className={`p-2 rounded-full transition-all ${weeklyPlan.some((r) => r.id === recipe.id)
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      }`}
                    title={
                      weeklyPlan.some((r) => r.id === recipe.id)
                        ? "In Weekly Plan"
                        : "Add to Weekly Plan"
                    }
                  >
                    {weeklyPlan.some((r) => r.id === recipe.id) ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Calendar className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requireAuth(() => removeRecipe(recipe.id));
                    }}
                    className="p-2 rounded-full bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Remove recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-bold text-lg text-gray-800 mb-1 pr-24 group-hover:text-blue-600 transition-colors">
                  {recipe.title}
                </h3>
                <div className="flex gap-2 mb-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    {recipe.tags.cuisine}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                    {recipe.tags.meal}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{recipe.prepTime}</span>
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  <p className="font-medium mb-1">Key Ingredients:</p>
                  <p className="line-clamp-1">
                    {recipe.ingredients
                      .slice(0, 3)
                      .map((i: any) => i.name)
                      .join(", ")}
                    {recipe.ingredients.length > 3 && "..."}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}


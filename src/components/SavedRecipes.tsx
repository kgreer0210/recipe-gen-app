"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useRemoveRecipe } from "@/hooks/useRecipesMutations";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { useAddToWeeklyPlan, useRemoveFromWeeklyPlan } from "@/hooks/useWeeklyPlanMutations";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { Trash2, Clock, Calendar, Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SavedRecipes() {
  const router = useRouter();
  const { user } = useAuth();
  const { recipes: savedRecipes = [] } = useRecipesRealtime();
  const { mutate: removeRecipe } = useRemoveRecipe();
  const { weeklyPlan = [] } = useWeeklyPlanRealtime();
  const { mutate: addToWeeklyPlan } = useAddToWeeklyPlan();
  const { mutateAsync: removeFromWeeklyPlan } = useRemoveFromWeeklyPlan();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Auth check helper
  const requireAuth = (action: () => void) => {
    if (!user) {
      router.push("/login");
      return;
    }
    action();
  };

  const handleToggleWeeklyPlan = async (recipeId: string) => {
    const recipe = savedRecipes.find((r) => r.id === recipeId);
    if (!recipe) return;

    const isInPlan = weeklyPlan.some((r) => r.id === recipeId);
    const { addRecipeId, removeRecipeId } = useWeeklyPlanStore.getState();

    if (isInPlan) {
      // Remove from weekly plan - optimistically update UI
      removeRecipeId(recipeId);
      try {
        await removeFromWeeklyPlan(recipeId);
        toast.success('Removed from weekly plan');
      } catch {
        // Revert optimistic update on failure
        addRecipeId(recipeId);
        toast.error('Failed to remove from weekly plan');
      }
    } else {
      // Add to weekly plan - optimistically update UI
      addRecipeId(recipeId);
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
        removeRecipeId(recipeId);
        toast.error('Failed to add to weekly plan');
      }
    }
  };

  const handleDeleteRecipe = (recipeId: string) => {
    setDeleteConfirmId(recipeId);
  };

  const confirmDelete = (recipeId: string) => {
    removeRecipe(recipeId);
    setDeleteConfirmId(null);
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
                      requireAuth(() => handleToggleWeeklyPlan(recipe.id));
                    }}
                    className={`p-2 rounded-full transition-all ${weeklyPlan.some((r) => r.id === recipe.id)
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      }`}
                    title={
                      weeklyPlan.some((r) => r.id === recipe.id)
                        ? "Remove from Weekly Plan"
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
                      requireAuth(() => handleDeleteRecipe(recipe.id));
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

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Delete Recipe?
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this recipe? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import { useAuth } from "@/hooks/useAuth";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { useRemoveFromWeeklyPlan } from "@/hooks/useWeeklyPlanMutations";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { Check, Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WeeklyMeals() {
  const router = useRouter();
  const { user } = useAuth();
  const { weeklyPlan = [] } = useWeeklyPlanRealtime();
  const { mutateAsync: removeFromWeeklyPlan } = useRemoveFromWeeklyPlan();
  const [removingRecipeId, setRemovingRecipeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleMarkAsCooked = async (recipeId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }

    setRemovingRecipeId(recipeId);
    const { removeRecipeId } = useWeeklyPlanStore.getState();

    try {
      // Optimistically remove from UI immediately for instant feedback
      removeRecipeId(recipeId);

      // Delete from server in background
      await removeFromWeeklyPlan(recipeId);
      setToast('Recipe removed from weekly plan');
      setTimeout(() => setToast(null), 2000);
    } catch {
      // If deletion fails, restore the recipe to the list
      const { addRecipeId } = useWeeklyPlanStore.getState();
      addRecipeId(recipeId);
      setToast('Failed to remove recipe from weekly plan');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setRemovingRecipeId(null);
    }
  };

  if (weeklyPlan.length === 0) {
    return (
      <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-2xl">📅</span>
        </div>
        <h3 className="text-lg font-medium text-gray-900">No meals planned</h3>
        <p className="mt-1 text-gray-500">
          Add recipes from your collection to plan your week.
        </p>
        <Link
          href="/collection"
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Browse Collection
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {weeklyPlan.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <Link href={`/recipe/${recipe.id}`} className="block group">
                  <h3 className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
                    {recipe.title}
                  </h3>
                </Link>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {recipe.tags.cuisine}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {recipe.tags.meal}
                  </span>
                </div>

                <div className="flex items-center text-sm text-gray-500 space-x-4">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {recipe.prepTime}
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {recipe.cookTime}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center">
                <Link
                  href={`/recipe/${recipe.id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  View Recipe
                </Link>
                <button
                  onClick={() => handleMarkAsCooked(recipe.id)}
                  disabled={removingRecipeId === recipe.id}
                  className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                    removingRecipeId === recipe.id
                      ? 'text-green-600 bg-green-200 cursor-not-allowed opacity-75'
                      : 'text-green-700 bg-green-100 hover:bg-green-200'
                  }`}
                  title="Remove from weekly plan"
                >
                  <Check className={`w-3 h-3 mr-1.5 ${removingRecipeId === recipe.id ? 'animate-spin' : ''}`} />
                  {removingRecipeId === recipe.id ? 'Removing...' : 'Mark as Cooked'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toast}
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Clock, Calendar, Check, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useRemoveRecipe } from "@/hooks/useRecipesMutations";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import {
  useAddToWeeklyPlanSlot,
  useRemoveFromWeeklyPlan,
} from "@/hooks/useWeeklyPlanMutations";
import { buildRecipeShareText, shareRecipe } from "@/lib/share/recipeShareText";
import { fetchUserTimezone } from "@/lib/timezone";
import { getWeekStart, getZonedYmd, mealSlotLabel, nextEmptyDinner } from "@/lib/week";
import { DAY_LABELS, type Recipe } from "@/types";
import AddToWeekModal from "@/components/AddToWeekModal";

export default function SavedRecipes() {
  const router = useRouter();
  const { user } = useAuth();
  const { recipes: savedRecipes = [] } = useRecipesRealtime();
  const { mutate: removeRecipe } = useRemoveRecipe();
  const { slots } = useWeeklyPlanRealtime();
  const { mutateAsync: addToSlot } = useAddToWeeklyPlanSlot();
  const { mutateAsync: removeFromWeek } = useRemoveFromWeeklyPlan();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStart(new Date(), "UTC")
  );
  const [addingRecipe, setAddingRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    void fetchUserTimezone().then((tz) => {
      setTimezone(tz);
      setWeekStart(getWeekStart(new Date(), tz));
    });
  }, []);

  const requireAuth = (action: () => void) => {
    if (!user) {
      router.push("/login");
      return;
    }
    action();
  };

  const slotsThisWeek = useMemo(
    () => slots.filter((slot) => slot.weekStart === weekStart),
    [slots, weekStart]
  );

  const occupiedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const slot of slotsThisWeek) {
      if (slot.dayOfWeek !== null && slot.mealSlot) {
        keys.add(`${slot.dayOfWeek}:${slot.mealSlot}`);
      }
    }
    return keys;
  }, [slotsThisWeek]);

  const suggestion = nextEmptyDinner(
    weekStart,
    occupiedKeys,
    getZonedYmd(new Date(), timezone)
  );

  const scheduleLabel = (recipeId: string) => {
    const matches = slotsThisWeek.filter((slot) => slot.recipeId === recipeId);
    if (matches.length === 0) return null;
    const first = matches[0];
    if (first.dayOfWeek === null || !first.mealSlot) {
      return matches.length > 1
        ? `In this week · ${matches.length}`
        : "In this week";
    }
    const day = DAY_LABELS[first.dayOfWeek] ?? "Day";
    return `Scheduled · ${day.slice(0, 3)} ${mealSlotLabel(first.mealSlot)}`;
  };

  const handleShareRecipe = (recipe: Recipe) => {
    void shareRecipe(
      recipe.title,
      buildRecipeShareText(recipe, { includeInstructions: false })
    );
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
          const scheduled = Boolean(scheduleLabel(recipe.id));
          return (
            <div
              key={recipe.id}
              className="group relative bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all"
            >
              <Link
                href={`/recipe/${recipe.id}`}
                className="absolute inset-0 z-0"
                aria-label={`View recipe: ${recipe.title}`}
              />
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button
                  onClick={() => handleShareRecipe(recipe)}
                  className="p-2 rounded-full bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                  title="Share recipe"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    requireAuth(() => setAddingRecipe(recipe))
                  }
                  className={`p-2 rounded-full transition-all ${
                    scheduled
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  }`}
                  title={scheduled ? "Add another slot this week" : "Add to this week"}
                >
                  {scheduled ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() =>
                    requireAuth(() => setDeleteConfirmId(recipe.id))
                  }
                  className="p-2 rounded-full bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Remove recipe"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3
                className="font-bold text-lg text-gray-800 mb-1 pr-32 group-hover:text-blue-600 transition-colors line-clamp-2"
                title={recipe.title}
              >
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
              {scheduled && (
                <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
                  <p className="text-xs text-green-700">
                    {scheduleLabel(recipe.id)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      requireAuth(() => {
                        void removeFromWeek(recipe.id, weekStart).then(
                          () => toast.success("Removed from this week"),
                          () => toast.error("Could not remove from this week")
                        );
                      })
                    }
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}

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
                    .map((ingredient) => ingredient.name)
                    .join(", ")}
                  {recipe.ingredients.length > 3 && "..."}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Delete Recipe?
            </h3>
            <p className="text-gray-600 mb-6">
              This cannot be undone. The recipe will also leave your weekly
              plan.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeRecipe(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {addingRecipe && (
        <AddToWeekModal
          weekStart={weekStart}
          recipes={[addingRecipe]}
          initialRecipeId={addingRecipe.id}
          initialDayOfWeek={suggestion.dayOfWeek}
          initialMealSlot={suggestion.mealSlot}
          occupiedKeys={occupiedKeys}
          onClose={() => setAddingRecipe(null)}
          onConfirm={async ({ dayOfWeek, mealSlot }) => {
            await addToSlot(addingRecipe, {
              weekStart,
              dayOfWeek,
              mealSlot,
              servingsOverride: addingRecipe.servings,
            });
            toast.success("Added to your weekly plan");
          }}
        />
      )}
    </div>
  );
}

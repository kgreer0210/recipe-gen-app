"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useWeeklyPlanRealtime } from "@/hooks/useWeeklyPlanRealtime";
import { usePantryRealtime } from "@/hooks/usePantryRealtime";
import { useMarkWeeklyPlanSlotCooked } from "@/hooks/useWeeklyPlanMutations";
import { useUpsertPantryItem } from "@/hooks/usePantryMutations";
import { usePantryStore } from "@/lib/stores/pantryStore";
import { uniqueStrings } from "@/lib/kitchenProfile";
import { formatRecipeAmount } from "@/lib/grocery/format";
import LeftoversModal, {
  type LeftoverDraft,
} from "@/components/LeftoversModal";

export default function CookRecipePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      }
    >
      <CookRecipeClient />
    </Suspense>
  );
}

function CookRecipeClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const slotId = searchParams.get("slot");
  const { recipes, loading } = useRecipesRealtime();
  const { slots, recipesById } = useWeeklyPlanRealtime();
  usePantryRealtime();
  const { mutateAsync: markCooked } = useMarkWeeklyPlanSlotCooked();
  const { mutateAsync: upsertPantry } = useUpsertPantryItem();
  const recipe = recipes.find((item) => item.id === id) ?? recipesById.get(id);
  const slot = slotId ? slots.find((item) => item.id === slotId) : undefined;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showLeftovers, setShowLeftovers] = useState(false);
  const [editedServings, setEditedServings] = useState<number | null>(null);
  const servings =
    editedServings ?? slot?.servingsOverride ?? recipe?.servings ?? 1;

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock is optional.
      }
    };
    void request();
    return () => {
      void wakeLock?.release();
    };
  }, []);

  const scale = recipe?.servings ? servings / recipe.servings : 1;
  const stepsDone = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  );

  if (loading && !recipe) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center">
        <p className="text-gray-700 mb-4">Recipe not found.</p>
        <Link href="/collection" className="text-blue-600 hover:underline">
          Back to collection
        </Link>
      </div>
    );
  }

  const finishCooking = async () => {
    if (slot) {
      try {
        await markCooked(slot.id, true);
      } catch {
        toast.error("Could not mark this meal as cooked");
      }
    }
    setShowLeftovers(true);
  };

  const saveLeftovers = async (leftovers: LeftoverDraft[]) => {
    for (const leftover of leftovers) {
      await upsertPantry({ ...leftover, source: "leftover" });
    }
    if (leftovers.length > 0) {
      toast.success("Leftovers saved to your pantry");
    }
  };

  const generateFromLeftovers = (leftovers: LeftoverDraft[]) => {
    const pantryNames = usePantryStore
      .getState()
      .pantryItems.map((item) => item.name);
    const names = uniqueStrings([
      ...leftovers.map((item) => item.name),
      ...pantryNames,
    ]).join(",");
    router.push(
      `/generator?mode=pantry&meal=Lunch&ingredients=${encodeURIComponent(
        names
      )}`
    );
  };

  return (
    <div className="min-h-[100dvh] bg-white pb-[calc(var(--mobile-nav-clearance)+7rem)] md:pb-28">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          href={`/recipe/${recipe.id}`}
          className="inline-flex items-center text-gray-600 hover:text-blue-600 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Recipe
        </Link>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-sm font-semibold text-orange-600 mb-1 flex items-center gap-1">
              <ChefHat className="w-4 h-4" />
              Cook mode
            </p>
            <h1 className="text-3xl font-bold text-gray-900">{recipe.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Servings</span>
            <button
              type="button"
              onClick={() =>
                setEditedServings((value) =>
                  Math.max(1, (value ?? servings) - 1)
                )
              }
              className="w-8 h-8 rounded-full bg-gray-100"
            >
              -
            </button>
            <span className="w-6 text-center font-bold">{servings}</span>
            <button
              type="button"
              onClick={() =>
                setEditedServings((value) =>
                  Math.min(12, (value ?? servings) + 1)
                )
              }
              className="w-8 h-8 rounded-full bg-gray-100"
            >
              +
            </button>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Ingredients</h2>
          <ul className="space-y-2">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={`${ingredient.name}-${index}`} className="text-lg text-gray-800">
                <span className="font-semibold">
                  {formatRecipeAmount(ingredient.amount * scale, ingredient.unit)}{" "}
                  {ingredient.unit}
                </span>{" "}
                {ingredient.name}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            Steps ({stepsDone}/{recipe.instructions.length})
          </h2>
          <ol className="space-y-4">
            {recipe.instructions.map((step, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() =>
                    setChecked((current) => ({
                      ...current,
                      [index]: !current[index],
                    }))
                  }
                  className={`w-full text-left p-4 rounded-xl border flex gap-4 ${
                    checked[index]
                      ? "bg-green-50 border-green-200"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      checked[index]
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-700 border"
                    }`}
                  >
                    {checked[index] ? <Check className="w-4 h-4" /> : index + 1}
                  </span>
                  <p
                    className={`text-lg leading-relaxed ${
                      checked[index] ? "text-gray-500 line-through" : "text-gray-900"
                    }`}
                  >
                    {step}
                  </p>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-[var(--mobile-nav-clearance)] md:bottom-0 z-30 bg-white border-t border-gray-200 p-4 pb-safe md:pb-4">
        <button
          type="button"
          onClick={() => void finishCooking()}
          className="w-full max-w-3xl mx-auto block py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold rounded-xl"
        >
          I&apos;m done cooking
        </button>
      </div>

      {showLeftovers && (
        <LeftoversModal
          recipe={recipe}
          scale={scale}
          onClose={() => {
            setShowLeftovers(false);
            router.push(slot ? "/weekly-plan" : `/recipe/${recipe.id}`);
          }}
          onSave={saveLeftovers}
          onGenerate={generateFromLeftovers}
        />
      )}
    </div>
  );
}

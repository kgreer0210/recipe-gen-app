"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  DAY_LABELS,
  MEAL_SLOTS,
  type MealSlot,
  type Recipe,
} from "@/types";
import { addDaysToYmd, mealSlotLabel } from "@/lib/week";
import ModalShell from "@/components/ModalShell";

interface AddToWeekModalProps {
  title?: string;
  weekStart: string;
  recipes?: Recipe[];
  initialRecipeId?: string;
  initialDayOfWeek?: number;
  initialMealSlot?: MealSlot;
  occupiedKeys?: Set<string>;
  onClose: () => void;
  onConfirm: (selection: {
    recipeId: string;
    dayOfWeek: number;
    mealSlot: MealSlot;
  }) => Promise<void> | void;
}

function slotKey(dayOfWeek: number, mealSlot: MealSlot): string {
  return `${dayOfWeek}:${mealSlot}`;
}

export default function AddToWeekModal({
  title = "Add to this week",
  weekStart,
  recipes = [],
  initialRecipeId,
  initialDayOfWeek,
  initialMealSlot,
  occupiedKeys,
  onClose,
  onConfirm,
}: AddToWeekModalProps) {
  const [recipeId, setRecipeId] = useState(
    initialRecipeId || recipes[0]?.id || ""
  );
  const [dayOfWeek, setDayOfWeek] = useState(initialDayOfWeek ?? 0);
  const [mealSlot, setMealSlot] = useState<MealSlot>(
    initialMealSlot ?? "dinner"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = useMemo(() => {
    if (!occupiedKeys) return false;
    return occupiedKeys.has(slotKey(dayOfWeek, mealSlot));
  }, [occupiedKeys, dayOfWeek, mealSlot]);

  const handleConfirm = async () => {
    if (!recipeId) {
      setError("Choose a recipe");
      return;
    }
    if (taken) {
      setError("That meal slot is already filled");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm({ recipeId, dayOfWeek, mealSlot });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add this meal"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell labelledBy="add-to-week-title" onClose={onClose}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="add-to-week-title" className="text-lg font-bold text-gray-900">
              {title}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {DAY_LABELS[dayOfWeek] ?? "Day"} {mealSlotLabel(mealSlot)} ·{" "}
              {addDaysToYmd(weekStart, dayOfWeek)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!initialRecipeId && recipes.length > 0 && (
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Recipe</span>
            <select
              value={recipeId}
              onChange={(event) => setRecipeId(event.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Day</span>
            <select
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(Number(event.target.value))}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {DAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Meal</span>
            <select
              value={mealSlot}
              onChange={(event) =>
                setMealSlot(event.target.value as MealSlot)
              }
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {MEAL_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {mealSlotLabel(slot)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving || taken || !recipeId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Adding..." : "Add to plan"}
          </button>
        </div>
    </ModalShell>
  );
}

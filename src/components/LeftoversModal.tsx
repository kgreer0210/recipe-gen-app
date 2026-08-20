"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Recipe, Unit } from "@/types";
import { formatRecipeAmount } from "@/lib/grocery/format";
import ModalShell from "@/components/ModalShell";

export type LeftoverDraft = {
  name: string;
  amount: number;
  unit: Unit;
  category?: string;
};

interface LeftoversModalProps {
  recipe: Recipe;
  scale?: number;
  onClose: () => void;
  onSave: (leftovers: LeftoverDraft[]) => Promise<void> | void;
  onGenerate?: (leftovers: LeftoverDraft[]) => void;
}

export default function LeftoversModal({
  recipe,
  scale = 1,
  onClose,
  onSave,
  onGenerate,
}: LeftoversModalProps) {
  const ingredients = useMemo(
    () =>
      recipe.ingredients.map((ingredient, index) => ({
        key: `${ingredient.name}-${index}`,
        name: ingredient.name,
        amount: Number((ingredient.amount * scale).toFixed(2)),
        unit: ingredient.unit,
        category: ingredient.category,
      })),
    [recipe.ingredients, scale]
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ingredients.map((ingredient) => [
        ingredient.key,
        String(ingredient.amount),
      ])
    )
  );
  const [isSaving, setIsSaving] = useState(false);

  const collectLeftovers = (): LeftoverDraft[] =>
    ingredients
      .filter((ingredient) => selected[ingredient.key])
      .map((ingredient) => ({
        name: ingredient.name,
        amount: Math.max(0, Number.parseFloat(amounts[ingredient.key] || "0")),
        unit: ingredient.unit,
        category: ingredient.category,
      }))
      .filter((item) => item.amount > 0);

  const handleSave = async (thenGenerate: boolean) => {
    const leftovers = collectLeftovers();
    setIsSaving(true);
    try {
      await onSave(leftovers);
      if (thenGenerate) {
        onGenerate?.(leftovers);
        return;
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell labelledBy="leftovers-title" panelClassName="max-w-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="leftovers-title" className="text-lg font-bold text-gray-900">
              Save leftovers to pantry?
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Check anything you have left from {recipe.title}.
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

        <ul className="space-y-2 mb-6">
          {ingredients.map((ingredient) => (
            <li
              key={ingredient.key}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100"
            >
              <input
                type="checkbox"
                checked={Boolean(selected[ingredient.key])}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    [ingredient.key]: event.target.checked,
                  }))
                }
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="flex-1 text-sm text-gray-800">
                {ingredient.name}
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={amounts[ingredient.key] ?? ""}
                onChange={(event) =>
                  setAmounts((current) => ({
                    ...current,
                    [ingredient.key]: event.target.value,
                  }))
                }
                className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-xs text-gray-500 w-12">
                {ingredient.unit}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-400 mb-4">
          Recipe amounts shown at{" "}
          {formatRecipeAmount(recipe.servings * scale, "count")} serving
          {recipe.servings * scale === 1 ? "" : "s"}.
        </p>

        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save leftovers"}
          </button>
          {onGenerate && (
            <button
              type="button"
              onClick={() => void handleSave(true)}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Save & generate a meal
            </button>
          )}
        </div>
    </ModalShell>
  );
}

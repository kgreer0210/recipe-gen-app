"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Warehouse } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePantryRealtime } from "@/hooks/usePantryRealtime";
import {
  useRemovePantryItem,
  useUpdatePantryAmount,
  useUpsertPantryItem,
} from "@/hooks/usePantryMutations";
import type { Unit } from "@/types";
import { toast } from "sonner";

const UNITS: Unit[] = [
  "count",
  "lb",
  "oz",
  "cup",
  "tbsp",
  "tsp",
  "g",
  "kg",
  "ml",
  "l",
  "slice",
  "clove",
  "pinch",
];
const CATEGORIES = [
  "Produce",
  "Meat",
  "Dairy",
  "Bakery",
  "Frozen",
  "Pantry",
  "Spices",
  "Other",
];

export default function PantryManager() {
  const router = useRouter();
  const { user } = useAuth();
  const { pantryItems } = usePantryRealtime();
  const { mutateAsync: upsertItem, isLoading: isAdding } = useUpsertPantryItem();
  const { mutateAsync: updateAmount } = useUpdatePantryAmount();
  const { mutateAsync: removeItem } = useRemovePantryItem();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<Unit>("count");
  const [category, setCategory] = useState("Pantry");

  const grouped = pantryItems.reduce<Record<string, typeof pantryItems>>(
    (acc, item) => {
      const key = item.category || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {}
  );

  const handleAdd = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!name.trim()) return;
    try {
      await upsertItem({
        name: name.trim(),
        amount: Number.parseFloat(amount) || 1,
        unit,
        category,
        source: "manual",
      });
      setName("");
      setAmount("1");
      toast.success("Added to pantry");
    } catch {
      toast.error("Could not add that pantry item");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Warehouse className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Your pantry</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ingredient"
          className="sm:col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
        />
        <input
          type="number"
          min="0"
          step="0.1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        />
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as Unit)}
          className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
        >
          {UNITS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
        >
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => void handleAdd()}
        disabled={isAdding || !name.trim()}
        className="mb-8 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        Add to pantry
      </button>

      {pantryItems.length === 0 ? (
        <p className="text-gray-500">
          Your pantry is empty. Add staples, or save leftovers after cooking.
        </p>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter((item) => grouped[item]?.length).map((item) => (
            <div key={item}>
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">
                {item}
              </h3>
              <ul className="space-y-2">
                {grouped[item].map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{entry.name}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {entry.source}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        defaultValue={entry.amount}
                        onBlur={(event) => {
                          const next = Number.parseFloat(event.target.value);
                          if (!Number.isFinite(next) || next === entry.amount) {
                            return;
                          }
                          void updateAmount(entry.id, next);
                        }}
                        className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                      />
                      <span className="text-sm text-gray-500 w-12">
                        {entry.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void removeItem(entry.id).then(
                            () => toast.success("Removed"),
                            () => toast.error("Could not remove item")
                          )
                        }
                        className="p-1 text-gray-300 hover:text-red-500"
                        aria-label={`Remove ${entry.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

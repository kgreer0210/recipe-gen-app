"use client";

import { useStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { Unit } from "@/types";
import {
  ShoppingBasket,
  CheckSquare,
  Square,
  Trash2,
  ChefHat,
  ClipboardCopy,
  Check,
  Plus,
  X,
  MoreHorizontal,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import RecipeSelector from "./RecipeSelector";

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

export default function GroceryList() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    groceryList,
    toggleGroceryItem,
    removeFromGroceryList,
    clearGathered,
    selectAllGroceryItems,
    removeIngredientsForRecipe,
    addCustomGroceryItem,
  } = useStore();
  const [isRecipeSelectorOpen, setIsRecipeSelectorOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Auth check helper
  const requireAuth = (action: () => void) => {
    if (!user) {
      router.push("/login");
      return;
    }
    action();
  };

  // Form state for adding custom item
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState<Unit>("count");
  const [newItemCategory, setNewItemCategory] = useState("Other");

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddItem = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!newItemName.trim()) return;

    await addCustomGroceryItem({
      name: newItemName.trim(),
      amount: parseFloat(newItemAmount) || 1,
      unit: newItemUnit,
      category: newItemCategory,
    });

    // Reset form
    setNewItemName("");
    setNewItemAmount("1");
    setNewItemUnit("count");
    setNewItemCategory("Other");
    setIsAddItemOpen(false);
  };

  const copyToClipboard = async () => {
    const CATEGORY_ORDER = [
      "Produce",
      "Meat",
      "Dairy",
      "Bakery",
      "Frozen",
      "Pantry",
      "Spices",
      "Other",
    ];

    // Group all items by category
    const grouped = groceryList.reduce((acc, item) => {
      const category = item.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {} as Record<string, typeof groceryList>);

    // Build formatted text
    let text = "🛒 Grocery List\n";
    text += "═".repeat(20) + "\n\n";

    // First, output categories in order
    for (const category of CATEGORY_ORDER) {
      const items = grouped[category];
      if (items && items.length > 0) {
        text += `${category.toUpperCase()}\n`;
        for (const item of items) {
          const checkbox = item.isChecked ? "✓" : "☐";
          text += `${checkbox} ${item.name}: ${item.amount} ${item.unit}\n`;
        }
        text += "\n";
      }
    }

    // Then any remaining categories not in the order
    for (const category of Object.keys(grouped)) {
      if (!CATEGORY_ORDER.includes(category)) {
        const items = grouped[category];
        text += `${category.toUpperCase()}\n`;
        for (const item of items) {
          const checkbox = item.isChecked ? "✓" : "☐";
          text += `${checkbox} ${item.name}: ${item.amount} ${item.unit}\n`;
        }
        text += "\n";
      }
    }

    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const activeItems = groceryList.filter((item) => !item.isChecked);
  const gatheredItems = groceryList.filter((item) => item.isChecked);

  // Add Item Modal component
  const renderAddItemModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={() => setIsAddItemOpen(false)}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-600" />
          Add Item to Grocery List
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Name
            </label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="e.g., Milk, Bread, Apples..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(e.target.value)}
                min="0.1"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit
              </label>
              <select
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value as Unit)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setIsAddItemOpen(false)}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleAddItem}
            disabled={!newItemName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );

  // Empty state
  if (groceryList.length === 0) {
    return (
      <>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col items-center justify-center text-center min-h-[200px]">
          <ShoppingBasket className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">Your grocery list is empty.</p>
          <button
            onClick={() => setIsAddItemOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
        {isAddItemOpen && renderAddItemModal()}
      </>
    );
  }

  const CATEGORY_ORDER = [
    "Produce",
    "Meat",
    "Dairy",
    "Bakery",
    "Frozen",
    "Pantry",
    "Spices",
    "Other",
  ];

  // Group active items by category
  const groupedActiveItems = activeItems.reduce((acc, item) => {
    const category = item.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, typeof activeItems>);

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <ShoppingBasket className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800">Grocery List</h2>
        </div>

        {/* Toolbar: Add Item button + More actions dropdown */}
        <div className="flex items-center gap-2">
          {/* Primary action: Add Item */}
          <button
            onClick={() => setIsAddItemOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>

          {/* Copy to clipboard */}
          <button
            onClick={copyToClipboard}
            className={`p-2 rounded-lg transition-all ${
              copied
                ? "text-green-600 bg-green-50"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            title="Copy list to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <ClipboardCopy className="w-4 h-4" />
            )}
          </button>

          {/* More actions dropdown */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={() => {
                    requireAuth(() => {
                      const allSelected = groceryList.every((i) => i.isChecked);
                      selectAllGroceryItems(!allSelected);
                      setIsMoreMenuOpen(false);
                    });
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  {groceryList.every((i) => i.isChecked)
                    ? "Deselect All"
                    : "Select All"}
                </button>
                <button
                  onClick={() => {
                    setIsRecipeSelectorOpen(true);
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ChefHat className="w-4 h-4" />
                  Remove Recipe Items
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddItemOpen && renderAddItemModal()}

      <div className="space-y-8">
        {/* To Buy Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            To Buy ({activeItems.length})
          </h3>
          {activeItems.length === 0 && gatheredItems.length > 0 && (
            <p className="text-sm text-gray-400 italic">
              All items gathered! Great job.
            </p>
          )}

          <div className="space-y-6">
            {CATEGORY_ORDER.map((category) => {
              const items = groupedActiveItems[category];
              if (!items || items.length === 0) return null;

              return (
                <div key={category}>
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 pl-1">
                    {category}
                  </h4>
                  <ul className="space-y-2">
                    {items.map((item) => {
                      if (!item.id) return null;
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:bg-blue-50 hover:border-blue-100 transition-all group"
                        >
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1"
                            onClick={() =>
                              requireAuth(() =>
                                toggleGroceryItem(item.id!, true)
                              )
                            }
                          >
                            <Square className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium text-gray-700 group-hover:text-blue-700">
                              {item.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-100 shadow-sm">
                              {item.amount} {item.unit}
                            </span>
                            <button
                              onClick={() =>
                                requireAuth(() =>
                                  removeFromGroceryList(item.id!)
                                )
                              }
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            {/* Fallback for other categories */}
            {Object.keys(groupedActiveItems)
              .filter((cat) => !CATEGORY_ORDER.includes(cat))
              .map((category) => (
                <div key={category}>
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 pl-1">
                    {category}
                  </h4>
                  <ul className="space-y-2">
                    {groupedActiveItems[category].map((item) => {
                      if (!item.id) return null;
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:bg-blue-50 hover:border-blue-100 transition-all group"
                        >
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1"
                            onClick={() =>
                              requireAuth(() =>
                                toggleGroceryItem(item.id!, true)
                              )
                            }
                          >
                            <Square className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium text-gray-700 group-hover:text-blue-700">
                              {item.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-100 shadow-sm">
                              {item.amount} {item.unit}
                            </span>
                            <button
                              onClick={() =>
                                requireAuth(() =>
                                  removeFromGroceryList(item.id!)
                                )
                              }
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        </div>

        {/* Gathered Section */}
        {gatheredItems.length > 0 && (
          <div className="pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Gathered ({gatheredItems.length})
              </h3>
              <button
                onClick={() => requireAuth(() => clearGathered())}
                className="text-xs font-medium text-red-500 hover:text-red-700 hover:underline transition-colors cursor-pointer px-2 py-1 rounded hover:bg-red-50"
              >
                Clear Gathered
              </button>
            </div>
            <ul className="space-y-3 opacity-60">
              {gatheredItems.map((item) => {
                if (!item.id) return null;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() =>
                        requireAuth(() => toggleGroceryItem(item.id!, false))
                      }
                    >
                      <CheckSquare className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-gray-500 line-through">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-md border border-gray-200">
                        {item.amount} {item.unit}
                      </span>
                      <button
                        onClick={() =>
                          requireAuth(() => removeFromGroceryList(item.id!))
                        }
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-400">
          Items are aggregated by name and unit.
        </p>
      </div>

      <RecipeSelector
        isOpen={isRecipeSelectorOpen}
        onClose={() => setIsRecipeSelectorOpen(false)}
        onSelect={(recipeId, servings) =>
          requireAuth(() => removeIngredientsForRecipe(recipeId, servings))
        }
        title="Remove Ingredients from List"
      />
    </div>
  );
}

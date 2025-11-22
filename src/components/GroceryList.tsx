'use client';

import { useStore } from '@/lib/store';
import { ShoppingBasket, CheckSquare, Square, Trash2, MoreHorizontal, ChefHat } from 'lucide-react';
import { useState } from 'react';
import RecipeSelector from './RecipeSelector';

export default function GroceryList() {
    const { groceryList, toggleGroceryItem, removeFromGroceryList, clearGathered, selectAllGroceryItems, removeIngredientsForRecipe } = useStore();
    const [isRecipeSelectorOpen, setIsRecipeSelectorOpen] = useState(false);

    if (groceryList.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col items-center justify-center text-center min-h-[200px]">
                <ShoppingBasket className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500">Your grocery list is empty.</p>
            </div>
        );
    }

    const activeItems = groceryList.filter(item => !item.isChecked);
    const gatheredItems = groceryList.filter(item => item.isChecked);

    const CATEGORY_ORDER = ["Produce", "Meat", "Dairy", "Bakery", "Frozen", "Pantry", "Spices", "Other"];

    // Group active items by category
    const groupedActiveItems = activeItems.reduce((acc, item) => {
        const category = item.category || 'Other';
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
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <button
                        onClick={() => setIsRecipeSelectorOpen(true)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                        title="Remove ingredients for a specific recipe"
                    >
                        <ChefHat className="w-4 h-4" />
                        <span className="hidden sm:inline">Remove Recipe</span>
                    </button>
                    <button
                        onClick={() => {
                            const allSelected = groceryList.every(i => i.isChecked);
                            selectAllGroceryItems(!allSelected);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
                    >
                        {groceryList.every(i => i.isChecked) ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
            </div>

            <div className="space-y-8">
                {/* To Buy Section */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">To Buy ({activeItems.length})</h3>
                    {activeItems.length === 0 && gatheredItems.length > 0 && (
                        <p className="text-sm text-gray-400 italic">All items gathered! Great job.</p>
                    )}

                    <div className="space-y-6">
                        {CATEGORY_ORDER.map(category => {
                            const items = groupedActiveItems[category];
                            if (!items || items.length === 0) return null;

                            return (
                                <div key={category}>
                                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 pl-1">{category}</h4>
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
                                                        onClick={() => toggleGroceryItem(item.id!, true)}
                                                    >
                                                        <Square className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                                                        <span className="font-medium text-gray-700 group-hover:text-blue-700">{item.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-100 shadow-sm">
                                                            {item.amount} {item.unit}
                                                        </span>
                                                        <button
                                                            onClick={() => removeFromGroceryList(item.id!)}
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
                        {Object.keys(groupedActiveItems).filter(cat => !CATEGORY_ORDER.includes(cat)).map(category => (
                            <div key={category}>
                                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 pl-1">{category}</h4>
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
                                                    onClick={() => toggleGroceryItem(item.id!, true)}
                                                >
                                                    <Square className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                                                    <span className="font-medium text-gray-700 group-hover:text-blue-700">{item.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-100 shadow-sm">
                                                        {item.amount} {item.unit}
                                                    </span>
                                                    <button
                                                        onClick={() => removeFromGroceryList(item.id!)}
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
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Gathered ({gatheredItems.length})</h3>
                            <button
                                onClick={() => clearGathered()}
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
                                            onClick={() => toggleGroceryItem(item.id!, false)}
                                        >
                                            <CheckSquare className="w-5 h-5 text-green-600" />
                                            <span className="font-medium text-gray-500 line-through">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-md border border-gray-200">
                                                {item.amount} {item.unit}
                                            </span>
                                            <button
                                                onClick={() => removeFromGroceryList(item.id!)}
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
                <p className="text-xs text-gray-400">Items are aggregated by name and unit.</p>
            </div>

            <RecipeSelector
                isOpen={isRecipeSelectorOpen}
                onClose={() => setIsRecipeSelectorOpen(false)}
                onSelect={(recipeId, servings) => removeIngredientsForRecipe(recipeId, servings)}
                title="Remove Ingredients from List"
            />
        </div>
    );
}

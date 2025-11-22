import React, { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { X, ChefHat } from 'lucide-react';

interface RecipeSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (recipeId: string, servings: number) => void;
    title?: string;
}

export default function RecipeSelector({ isOpen, onClose, onSelect, title = "Select a Recipe" }: RecipeSelectorProps) {
    const { savedRecipes, groceryList } = useStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [servingsToRemove, setServingsToRemove] = useState<number>(1);

    if (!isOpen) return null;

    // Calculate max servings for each recipe based on grocery list
    const recipesWithStatus = useMemo(() => {
        return savedRecipes.map(recipe => {
            let maxServings = 0;
            let hasIngredients = false;

            // Check if any ingredients are in the list
            const ingredientsInList = recipe.ingredients.filter(ing =>
                groceryList.some(item => item.name.toLowerCase() === ing.name.toLowerCase() && item.unit === ing.unit)
            );

            if (ingredientsInList.length > 0) {
                hasIngredients = true;
                // Calculate theoretical max servings
                const possibleServings = recipe.ingredients.map(ing => {
                    const item = groceryList.find(i => i.name.toLowerCase() === ing.name.toLowerCase() && i.unit === ing.unit);
                    if (!item) return 0;
                    return Math.floor(item.amount / ing.amount);
                });
                maxServings = Math.min(...possibleServings);
            }

            return { ...recipe, maxServings, hasIngredients };
        });
    }, [savedRecipes, groceryList]);

    const filteredRecipes = recipesWithStatus
        .filter(recipe => recipe.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            // Sort by: has ingredients in list (desc), then title (asc)
            if (a.hasIngredients && !b.hasIngredients) return -1;
            if (!a.hasIngredients && b.hasIngredients) return 1;
            return a.title.localeCompare(b.title);
        });

    const handleRecipeClick = (recipe: typeof recipesWithStatus[0]) => {
        if (recipe.maxServings > 0) {
            setServingsToRemove(recipe.maxServings);
        } else {
            setServingsToRemove(1);
        }
        setSelectedRecipeId(recipe.id);
    };

    const handleConfirm = () => {
        if (selectedRecipeId) {
            onSelect(selectedRecipeId, servingsToRemove);
            onClose();
            setSelectedRecipeId(null);
            setServingsToRemove(1);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-lg text-gray-800">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100">
                    <input
                        type="text"
                        placeholder="Search recipes..."
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                {selectedRecipeId ? (
                    <div className="p-4 border-t border-gray-100 bg-gray-50">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Servings to remove
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    value={servingsToRemove}
                                    onChange={(e) => setServingsToRemove(Math.max(1, parseInt(e.target.value) || 0))}
                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-500">servings</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Based on ingredients in your list.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSelectedRecipeId(null)}
                                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 font-medium"
                            >
                                Remove Ingredients
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-y-auto flex-1 p-2">
                        {filteredRecipes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <p>No recipes found.</p>
                            </div>
                        ) : (
                            <ul className="space-y-1">
                                {filteredRecipes.map(recipe => (
                                    <li key={recipe.id}>
                                        <button
                                            onClick={() => handleRecipeClick(recipe)}
                                            className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 rounded-lg transition-colors text-left group"
                                        >
                                            <div className={`p-2 rounded-lg transition-colors ${recipe.hasIngredients ? 'bg-blue-100 text-blue-600 group-hover:bg-blue-200' : 'bg-gray-100 text-gray-400'}`}>
                                                <ChefHat className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className={`font-medium ${recipe.hasIngredients ? 'text-gray-800' : 'text-gray-500'}`}>{recipe.title}</p>
                                                    {recipe.maxServings > 0 && (
                                                        <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                            In List (~{recipe.maxServings})
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {recipe.ingredients.length} ingredients
                                                </p>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

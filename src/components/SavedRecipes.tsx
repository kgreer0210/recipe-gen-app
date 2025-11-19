'use client';

import { useStore } from '@/lib/store';
import { Trash2, Clock, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function SavedRecipes() {
    const { savedRecipes, removeRecipe, addToGroceryList } = useStore();
    const [addingId, setAddingId] = useState<string | null>(null);

    const handleAdd = async (id: string) => {
        setAddingId(id);
        await addToGroceryList(id);
        setAddingId(null);
        // Optional: Toast notification here
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {savedRecipes.map((recipe) => {
                    return (
                        <Link key={recipe.id} href={`/recipe/${recipe.id}`} className="block group">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all relative">
                                <div className="absolute top-4 right-4 flex gap-2 z-10">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleAdd(recipe.id);
                                        }}
                                        disabled={addingId === recipe.id}
                                        className={`p-2 rounded-full transition-all bg-gray-100 text-gray-400 hover:text-blue-600 hover:bg-gray-200 ${addingId === recipe.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title="Add ingredients to grocery list"
                                    >
                                        <ShoppingCart className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            removeRecipe(recipe.id);
                                        }}
                                        className="p-2 rounded-full bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                        title="Remove recipe"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <h3 className="font-bold text-lg text-gray-800 mb-1 pr-20 group-hover:text-blue-600 transition-colors">{recipe.title}</h3>
                                <div className="flex gap-2 mb-3">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{recipe.tags.cuisine}</span>
                                    <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">{recipe.tags.meal}</span>
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
                                        {recipe.ingredients.slice(0, 3).map(i => i.name).join(', ')}
                                        {recipe.ingredients.length > 3 && '...'}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

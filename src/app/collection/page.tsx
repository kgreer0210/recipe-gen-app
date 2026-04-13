import SavedRecipes from '@/components/SavedRecipes';

export default function CollectionPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 md:px-0 pt-4 md:pt-0">
            <div className="text-center mb-4 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Your Recipe Collection</h1>
                <p className="mt-2 text-gray-500 text-sm md:text-base">Manage your saved recipes.</p>
            </div>
            <SavedRecipes />
        </div>
    );
}

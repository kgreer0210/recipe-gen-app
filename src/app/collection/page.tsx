import SavedRecipes from '@/components/SavedRecipes';

export default function CollectionPage() {
    return (
        <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Your Recipe Collection</h1>
                <p className="mt-2 text-gray-500">Manage your saved recipes.</p>
            </div>
            <SavedRecipes />
        </div>
    );
}

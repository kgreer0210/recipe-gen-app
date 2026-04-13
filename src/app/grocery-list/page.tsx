import GroceryList from '@/components/GroceryList';

export default function GroceryListPage() {
    return (
        <div className="max-w-2xl mx-auto px-4 md:px-0 pt-4 md:pt-0 pb-4 md:pb-8">
            <div className="text-center mb-4 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Grocery List</h1>
                <p className="mt-2 text-gray-500 text-sm md:text-base">Aggregated ingredients from your selected recipes.</p>
            </div>
            <GroceryList />
        </div>
    );
}

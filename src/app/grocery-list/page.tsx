import GroceryList from '@/components/GroceryList';

export default function GroceryListPage() {
    return (
        <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Grocery List</h1>
                <p className="mt-2 text-gray-500">Aggregated ingredients from your selected recipes.</p>
            </div>
            <GroceryList />
        </div>
    );
}

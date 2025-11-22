import WeeklyMeals from '@/components/WeeklyMeals';

export default function WeeklyPlanPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Weekly Meal Plan</h1>
                <p className="mt-2 text-gray-500">Select meals from your collection to cook this week.</p>
            </div>
            <WeeklyMeals />
        </div>
    );
}


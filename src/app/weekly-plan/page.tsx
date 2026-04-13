import WeeklyMeals from '@/components/WeeklyMeals';

export default function WeeklyPlanPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
            <div className="text-center mb-4 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Weekly Meal Plan</h1>
                <p className="mt-2 text-gray-500 text-sm md:text-base">Select meals from your collection to cook this week.</p>
            </div>
            <WeeklyMeals />
        </div>
    );
}


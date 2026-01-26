import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, CalendarDays, ShoppingCart, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Recipe Generator & Meal Planner",
  description:
    "Generate custom recipes with AI, plan your weekly meals, and build smart grocery lists. Mise AI helps you answer “what’s for dinner?” in seconds.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center mb-12 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl mb-4">
          Your Personal <span className="text-blue-600">AI Chef</span>.
          <br />
          Zero Decision Fatigue.
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-xl text-gray-500 mb-8">
          Generate custom recipes, plan your week, and automate your grocery
          shopping in seconds.
        </p>

        <Link
          href="/generator"
          className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 transition-all"
        >
          Start Generating <ArrowRight className="w-5 h-5" />
        </Link>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Everything you need to master mealtime
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            From inspiration to ingredients, we&apos;ve got you covered.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          <Link
            href="/ai-recipe-generator"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Learn more about the AI Recipe Generator"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 text-blue-600">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Instant Inspiration
            </h3>
            <p className="text-gray-600">
              Never wonder &quot;what&apos;s for dinner&quot; again. Generate
              unique recipes based on your cravings, dietary needs, and
              what&apos;s in your fridge.
            </p>
            <p className="mt-4 text-sm font-semibold text-blue-700 group-hover:underline">
              Learn more →
            </p>
          </Link>

          <Link
            href="/meal-planner"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Learn more about the Weekly Meal Planner"
          >
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-6 text-green-600">
              <CalendarDays className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Seamless Planning
            </h3>
            <p className="text-gray-600">
              Add your generated recipes into a weekly Planner. Organize your
              meals effortlessly and stick to your weekly meal plan.
            </p>
            <p className="mt-4 text-sm font-semibold text-blue-700 group-hover:underline">
              Learn more →
            </p>
          </Link>

          <Link
            href="/grocery-list-maker"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Learn more about the Grocery List Maker"
          >
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-6 text-orange-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Smart Shopping
            </h3>
            <p className="text-gray-600">
              Turn your meal plan into an organized grocery list instantly.
              Combine ingredients and never forget a spice again.
            </p>
            <p className="mt-4 text-sm font-semibold text-blue-700 group-hover:underline">
              Learn more →
            </p>
          </Link>
        </div>

        <div className="bg-blue-900 rounded-3xl p-8 sm:p-16 text-center text-white mb-20 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">
              Start Cooking Smarter Today
            </h2>
            <p className="text-blue-100 text-lg mb-8">
              Join other home cooks that are saving time and eating better. No
              credit card required to start generating recipes.
            </p>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 text-sm font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Free Weekly Recipe Limit Included
            </div>
          </div>

          {/* Decorative background elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-10">
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-400 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-400 rounded-full blur-3xl"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

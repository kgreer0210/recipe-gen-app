import type { Metadata } from "next";
import Link from "next/link";
import { faqPageJsonLd, type FaqItem } from "@/lib/seo/jsonld";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.mise-ai.app";

const faqs: FaqItem[] = [
  {
    question: "Do I need an account to use the meal planner?",
    answer:
      "To save recipes and maintain a weekly plan, you'll want to be logged in so your data is stored securely.",
  },
  {
    question: "Can I generate recipes and add them to my week?",
    answer:
      "Yes—generate recipes first, then add your favorites to specific days in your weekly plan.",
  },
  {
    question: "Will this help with grocery shopping?",
    answer:
      "Yes. Once your week is planned, you can turn it into a consolidated grocery list.",
  },
];

export const metadata: Metadata = {
  title: "Weekly Meal Planner",
  description:
    "Plan your week in minutes. Save recipes, drag them into a weekly plan, and stay organized with Mise AI's meal planner.",
  alternates: {
    canonical: "/meal-planner",
  },
  keywords: [
    "meal planner",
    "weekly meal planner",
    "meal planning app",
    "weekly meal plan",
    "ai meal planner",
  ],
};

export default function MealPlannerLandingPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqPageJsonLd({
              pageUrl: `${siteUrl}/meal-planner`,
              faqs,
            }),
          ),
        }}
      />
      <header className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight mb-4">
          Weekly Meal Planner
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Build a weekly plan around the recipes you actually want to cook, then
          reuse it to make weeknights simple.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/generator"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-sm hover:bg-blue-700 transition-colors w-full sm:w-auto"
          >
            Generate recipes
          </Link>
          <Link
            href="/weekly-plan"
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 font-semibold rounded-full border border-gray-200 hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            Open the planner
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Plan faster</h2>
          <p className="text-gray-600">
            Turn inspiration into a schedule—without spreadsheets or sticky
            notes.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Reuse your favorites</h2>
          <p className="text-gray-600">
            Save recipes you love and rotate them into future weeks.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Stay consistent</h2>
          <p className="text-gray-600">
            When the week gets busy, your plan keeps you on track.
          </p>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Meal planning, connected to your recipes
        </h2>
        <p className="text-gray-700 mb-4">
          Mise AI is built around a simple loop: generate recipes, save what you
          like, and place them into your week. The result is less last-minute
          scrambling—and fewer takeout nights.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/weekly-plan" className="text-blue-700 font-semibold hover:underline">
            Go to weekly plan →
          </Link>
          <Link href="/pricing" className="text-blue-700 font-semibold hover:underline">
            Compare plans →
          </Link>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">FAQ</h2>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Do I need an account to use the meal planner?
            </h3>
            <p className="text-gray-700">
              To save recipes and maintain a weekly plan, you&apos;ll want to be
              logged in so your data is stored securely.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Can I generate recipes and add them to my week?
            </h3>
            <p className="text-gray-700">
              Yes—generate recipes first, then add your favorites to specific
              days in your weekly plan.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Will this help with grocery shopping?
            </h3>
            <p className="text-gray-700">
              Yes. Once your week is planned, you can turn it into a consolidated
              grocery list.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}


import type { Metadata } from "next";
import Link from "next/link";
import { faqPageJsonLd, type FaqItem } from "@/lib/seo/jsonld";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.mise-ai.app";

const faqs: FaqItem[] = [
  {
    question: "Does the grocery list update when my plan changes?",
    answer:
      "Yes—your grocery list is designed to reflect your current weekly plan so it stays accurate as you adjust meals.",
  },
  {
    question: "Can I use it without generating recipes?",
    answer:
      "You can build lists manually, but it shines when paired with saved recipes and meal planning.",
  },
  {
    question: "Is this private to my account?",
    answer:
      "Yes. Your saved recipes, plans, and grocery lists are tied to your authenticated user and protected in Supabase.",
  },
];

export const metadata: Metadata = {
  title: "Grocery List Maker",
  description:
    "Turn your meal plan into an organized grocery list. Mise AI helps you consolidate ingredients so shopping is faster and you never miss key items.",
  alternates: {
    canonical: "/grocery-list-maker",
  },
  keywords: [
    "grocery list maker",
    "grocery list app",
    "smart grocery list",
    "meal plan grocery list",
    "ingredient list",
  ],
};

export default function GroceryListMakerLandingPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqPageJsonLd({
              pageUrl: `${siteUrl}/grocery-list-maker`,
              faqs,
            })
          ),
        }}
      />
      <header className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight mb-4">
          Grocery List Maker
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Plan your meals, then generate a clean grocery list. Mise AI helps you
          stay organized from recipes to checkout.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/weekly-plan"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-sm hover:bg-blue-700 transition-colors w-full sm:w-auto"
          >
            Plan your week
          </Link>
          <Link
            href="/grocery-list"
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 font-semibold rounded-full border border-gray-200 hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            Open grocery list
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">
            Consolidate ingredients
          </h2>
          <p className="text-gray-600">
            Build a shopping list from multiple meals so you can buy everything
            in one trip.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Shop faster</h2>
          <p className="text-gray-600">
            Keep the list tidy and focused so you can move through the store
            with confidence.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Waste less</h2>
          <p className="text-gray-600">
            Plan around what you already have and buy only what you need.
          </p>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          From weekly plan to grocery list
        </h2>
        <p className="text-gray-700 mb-4">
          Mise AI links your weekly plan with your grocery list so shopping is a
          natural next step. Generate recipes, plan them across the week, then
          open your grocery list to start purchasing.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/grocery-list"
            className="text-blue-700 font-semibold hover:underline"
          >
            View grocery list →
          </Link>
          <Link
            href="/generator"
            className="text-blue-700 font-semibold hover:underline"
          >
            Generate recipes →
          </Link>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">FAQ</h2>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Does the grocery list update when my plan changes?
            </h3>
            <p className="text-gray-700">
              Yes—your grocery list is designed to reflect your current weekly
              plan so it stays accurate as you adjust meals.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Can I use it without generating recipes?
            </h3>
            <p className="text-gray-700">
              You can build lists manually, but it shines when paired with saved
              recipes and meal planning.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Is this private to my account?
            </h3>
            <p className="text-gray-700">
              Yes. Your saved recipes, plans, and grocery lists are tied to your
              authenticated user and protected in Supabase.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

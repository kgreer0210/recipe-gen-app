import type { Metadata } from "next";
import Link from "next/link";
import { faqPageJsonLd, type FaqItem } from "@/lib/seo/jsonld";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.mise-ai.app";

const faqs: FaqItem[] = [
  {
    question: "Is Mise AI free to use?",
    answer:
      "Yes. You can start generating recipes with a free daily limit. If you cook often, upgrading increases your daily generation limit.",
  },
  {
    question: "Can I generate recipes from ingredients I already have?",
    answer:
      "Yes. Start from what's in your fridge or pantry and generate a recipe that fits your available ingredients.",
  },
  {
    question: "Can I plan meals and make a grocery list?",
    answer:
      "Absolutely. Mise AI connects recipe generation with weekly meal planning and consolidated grocery lists.",
  },
];

export const metadata: Metadata = {
  title: "AI Recipe Generator",
  description:
    "Generate custom recipes in seconds with Mise AI. Pick a cuisine, meal type, and ingredients, then get step-by-step instructions, timing, and a clean ingredient list.",
  alternates: {
    canonical: "/ai-recipe-generator",
  },
  keywords: [
    "ai recipe generator",
    "recipe generator",
    "generate recipes with ai",
    "meal ideas",
    "dinner ideas",
  ],
};

export default function AiRecipeGeneratorPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            faqPageJsonLd({
              pageUrl: `${siteUrl}/ai-recipe-generator`,
              faqs,
            })
          ),
        }}
      />
      <header className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight mb-4">
          AI Recipe Generator
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Tell Mise AI what you&apos;re craving (or what&apos;s in your fridge)
          and get a complete recipe: ingredients, steps, and a plan to get
          dinner on the table.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/generator"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-sm hover:bg-blue-700 transition-colors w-full sm:w-auto"
          >
            Generate a recipe
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 font-semibold rounded-full border border-gray-200 hover:bg-gray-50 transition-colors w-full sm:w-auto"
          >
            View pricing
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Personalized recipes</h2>
          <p className="text-gray-600">
            Choose cuisine and meal type, then tailor the recipe to your
            preferences.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">Clear instructions</h2>
          <p className="text-gray-600">
            Get step-by-step cooking directions designed to be easy to follow.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">
            Less decision fatigue
          </h2>
          <p className="text-gray-600">
            Skip endless scrolling. Generate a strong option fast and start
            cooking.
          </p>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          How the AI recipe generator works
        </h2>
        <ol className="space-y-3 text-gray-700 list-decimal list-inside">
          <li>Pick a cuisine, meal type, and protein.</li>
          <li>Mise AI generates a recipe with ingredients and instructions.</li>
          <li>
            Save it, add it to your weekly plan, and build a grocery list when
            you&apos;re ready.
          </li>
        </ol>
        <div className="mt-6">
          <Link
            href="/generator"
            className="text-blue-700 font-semibold hover:underline"
          >
            Try it now →
          </Link>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">FAQ</h2>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Is Mise AI free to use?
            </h3>
            <p className="text-gray-700">
              Yes. You can start generating recipes with a free daily limit. If
              you cook often, upgrading increases your daily generation limit.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Can I generate recipes from ingredients I already have?
            </h3>
            <p className="text-gray-700">
              Yes. Start from what&apos;s in your fridge or pantry and generate
              a recipe that fits your available ingredients.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">
              Can I plan meals and make a grocery list?
            </h3>
            <p className="text-gray-700">
              Absolutely. Mise AI connects recipe generation with weekly meal
              planning and consolidated grocery lists.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

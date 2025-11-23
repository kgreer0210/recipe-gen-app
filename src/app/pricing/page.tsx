import React from "react";
import { Check } from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl mb-4">
          Pricing
        </h1>
        <p className="max-w-2xl mx-auto text-xl text-gray-500">
          Take the stress out of meal planning with simple, predictable pricing.
          Start for free, explore the features, and upgrade whenever you&apos;re
          ready for unlimited creativity in your kitchen.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 max-w-5xl mx-auto">
        {/* Free Plan */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:border-blue-300 transition-colors">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Free Plan</h2>
            <div className="mt-4 flex items-baseline">
              <span className="text-5xl font-extrabold text-gray-900">$0</span>
              <span className="ml-1 text-xl font-medium text-gray-500">
                / month
              </span>
            </div>
            <p className="mt-4 text-gray-500">
              Perfect for trying things out or planning a few meals each week.
            </p>
          </div>

          <ul className="space-y-4 mb-8">
            {[
              "7 AI-generated recipes per week",
              "Save recipes to your personal collection",
              "Smart grocery list with auto-sorting",
              "Ingredient aggregation",
              "Adjustable servings",
              "Access on all supported devices",
            ].map((feature) => (
              <li key={feature} className="flex items-start">
                <div className="shrink-0">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <p className="ml-3 text-base text-gray-700">{feature}</p>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="block w-full py-3 px-6 border border-blue-600 rounded-md text-center font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Start for Free
          </Link>
        </div>

        {/* Unlimited Plan */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-600 p-8 relative">
          <div className="absolute top-0 right-0 -mt-4 mr-4 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium uppercase tracking-wide">
            Most Popular
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Unlimited Plan</h2>
            <div className="mt-4 flex items-baseline">
              <span className="text-5xl font-extrabold text-gray-900">$5</span>
              <span className="ml-1 text-xl font-medium text-gray-500">
                / month
              </span>
            </div>
            <p className="mt-4 text-gray-500">
              For home cooks and busy families who want total freedom.
            </p>
          </div>

          <ul className="space-y-4 mb-8">
            <li className="flex items-start">
              <div className="shrink-0">
                <Check className="h-6 w-6 text-blue-600" />
              </div>
              <p className="ml-3 text-base font-medium text-gray-900">
                Everything in Free, plus:
              </p>
            </li>
            {[
              "Unlimited recipe generations",
              "Faster AI responses",
              "Priority feature access",
              "Support for more weekly meal planning",
              "No usage caps—create as many meal ideas as you want",
            ].map((feature) => (
              <li key={feature} className="flex items-start">
                <div className="shrink-0">
                  <Check className="h-6 w-6 text-blue-600" />
                </div>
                <p className="ml-3 text-base text-gray-700">{feature}</p>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="block w-full py-3 px-6 bg-blue-600 border border-transparent rounded-md text-center font-medium text-white hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Get Unlimited
          </Link>
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-gray-500">
          Upgrade anytime. Cancel anytime. No hidden fees, no surprises.
        </p>
      </div>
    </div>
  );
}

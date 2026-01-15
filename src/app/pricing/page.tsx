"use client";

import React from "react";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const { user, subscription, loading } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [billingCycle, setBillingCycle] = React.useState<"month" | "year">(
    "month"
  );
  const router = useRouter();

  const handleCheckout = async (plan: "plus" | "pro") => {
    if (!user) {
      router.push("/login?redirect=/pricing");
      return;
    }

    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interval: billingCycle,
          plan: plan,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Checkout failed");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to open portal");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL received");
      }
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open subscription management. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const isSubscribed =
    subscription?.status === "active" || subscription?.status === "trialing";

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl mb-4">
          Pricing
        </h1>
        <p className="max-w-2xl mx-auto text-xl text-gray-500">
          Take the stress out of meal planning with simple, predictable pricing.
          Start for free, explore the features, and upgrade whenever you&apos;re
          ready for more creativity in your kitchen.
        </p>
      </div>

      <div className="flex justify-center mb-12">
        <div className="relative bg-gray-100 p-1 rounded-lg flex items-center">
          <button
            onClick={() => setBillingCycle("month")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              billingCycle === "month"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("year")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all flex items-center ${
              billingCycle === "year"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Yearly
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3 lg:gap-8 max-w-6xl mx-auto">
        {/* Free Plan */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:border-blue-300 transition-colors flex flex-col">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Free</h2>
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

          <ul className="space-y-4 mb-8 flex-1">
            {[
              "5 AI-generated recipes per week",
              "10 recipe refinements per week",
              "Save up to 20 recipes",
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
            href={user ? "/generator" : "/login"}
            className="block w-full py-3 px-6 border border-blue-600 rounded-md text-center font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {user ? "Go to Generator" : "Start for Free"}
          </Link>
        </div>

        {/* Plus Plan */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-600 p-8 relative flex flex-col">
          <div className="absolute top-0 right-0 -mt-4 mr-4 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium uppercase tracking-wide">
            Most Popular
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Plus</h2>
            <div className="mt-4 flex items-baseline">
              <span className="text-5xl font-extrabold text-gray-900">
                {billingCycle === "month" ? "$5" : "$50"}
              </span>
              <span className="ml-1 text-xl font-medium text-gray-500">
                / {billingCycle === "month" ? "month" : "year"}
              </span>
            </div>
            <p className="mt-4 text-gray-500">
              For home cooks and busy families who want more flexibility.
            </p>
          </div>

          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start">
              <div className="shrink-0">
                <Check className="h-6 w-6 text-blue-600" />
              </div>
              <p className="ml-3 text-base font-medium text-gray-900">
                Everything in Free, plus:
              </p>
            </li>
            {[
              "100 recipes per week",
              "100 refinements per week",
              "Save up to 200 recipes",
              "Standard generation speed",
            ].map((feature) => (
              <li key={feature} className="flex items-start">
                <div className="shrink-0">
                  <Check className="h-6 w-6 text-blue-600" />
                </div>
                <p className="ml-3 text-base text-gray-700">{feature}</p>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout("plus")}
            disabled={
              checkoutLoading ||
              loading ||
              (isSubscribed && subscription?.plan_key !== "plus")
            }
            className="w-full py-3 px-6 bg-blue-600 border border-transparent rounded-md text-center font-medium text-white hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Processing...
              </>
            ) : isSubscribed && subscription?.plan_key === "plus" ? (
              "Current Plan"
            ) : isSubscribed ? (
              "Switch to Plus"
            ) : (
              "Get Plus"
            )}
          </button>
        </div>

        {/* Pro Plan */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:border-purple-300 transition-colors flex flex-col">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Pro</h2>
            <div className="mt-4 flex items-baseline">
              <span className="text-5xl font-extrabold text-gray-900">
                {billingCycle === "month" ? "$15" : "$150"}
              </span>
              <span className="ml-1 text-xl font-medium text-gray-500">
                / {billingCycle === "month" ? "month" : "year"}
              </span>
            </div>
            <p className="mt-4 text-gray-500">
              For power users who want maximum flexibility and priority support.
            </p>
          </div>

          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start">
              <div className="shrink-0">
                <Check className="h-6 w-6 text-purple-600" />
              </div>
              <p className="ml-3 text-base font-medium text-gray-900">
                Everything in Plus, plus:
              </p>
            </li>
            {[
              "500+ recipes per week (soft limit)",
              "500+ refinements per week",
              "Save up to 2,000 recipes",
              "Faster generation / priority queue",
            ].map((feature) => (
              <li key={feature} className="flex items-start">
                <div className="shrink-0">
                  <Check className="h-6 w-6 text-purple-600" />
                </div>
                <p className="ml-3 text-base text-gray-700">{feature}</p>
              </li>
            ))}
          </ul>

          <button
            onClick={() => handleCheckout("pro")}
            disabled={
              checkoutLoading ||
              loading ||
              (isSubscribed && subscription?.plan_key === "pro")
            }
            className="w-full py-3 px-6 bg-purple-600 border border-transparent rounded-md text-center font-medium text-white hover:bg-purple-700 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="animate-spin mr-2 h-5 w-5" />
                Processing...
              </>
            ) : isSubscribed && subscription?.plan_key === "pro" ? (
              "Current Plan"
            ) : isSubscribed ? (
              "Upgrade to Pro"
            ) : (
              "Get Pro"
            )}
          </button>
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

import React from "react";
import { ChefHat, ShoppingBasket, ListChecks, Heart } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-blue-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Cooking shouldn&apos;t feel like a chore.
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              We&apos;re here to fix the disconnect between finding a great
              recipe and actually getting the ingredients into your kitchen.
            </p>
          </div>
        </div>
      </div>

      {/* The Story Section */}
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-8">
            The "One Carrot" Problem
          </h2>
          <div className="prose prose-lg prose-blue text-gray-600 space-y-6">
            <p>
              This app started as a very real frustration in my own home. My
              wife and I tried several recipe apps over the years—some were too
              complicated, some were too limited, and all of them had one thing
              in common:{" "}
              <strong>
                they couldn&apos;t build a clean, accurate grocery list.
              </strong>
            </p>
            <p>
              If a recipe called for one carrot and another called for three,
              we&apos;d end up with two separate line items instead of one total
              we could actually use. Often times the second carrot would be far
              down our grocery list and we would forget about it or have to walk
              back to the other side of the store to grab it again. It sounds
              small, but when you&apos;re planning meals for the week, those
              little inconveniences add up fast.
            </p>
            <p className="text-xl font-medium text-blue-600 italic border-l-4 border-blue-600 pl-4">
              "We just wanted to cook good food without the administrative
              headache."
            </p>
            <p>
              So I built a solution. Not just another recipe app, but a tool
              that understands how home cooking actually works.
            </p>
          </div>
        </div>
      </div>

      {/* Origin Section */}
      <div className="mx-auto max-w-7xl px-6 pb-16 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="border-t border-gray-200 pt-16">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-8 text-center">
              Why &quot;Mise&quot;?
            </h2>
            <div className="bg-white rounded-2xl p-8 ring-1 ring-gray-200 shadow-sm">
              <div className="text-center space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Mise{" "}
                    <span className="text-gray-500 font-normal text-lg">
                      (pronounced “meez”)
                    </span>
                  </h3>
                  <p className="text-gray-600 text-lg">
                    Short for{" "}
                    <span className="italic font-medium text-gray-900">
                      mise en place
                    </span>{" "}
                    (French for “everything in its place”).
                  </p>
                </div>
                <div className="text-gray-600">
                  <p className="mb-4 text-lg">
                    Mise organizes ingredients, aggregates them, and makes meal
                    planning clean and structured.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              From &quot;What should we eat?&quot; to &quot;Let&apos;s eat&quot;
              in three steps.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-6">
                <ChefHat className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                AI-Powered Chef
              </h3>
              <p className="text-gray-600">
                Choose your cuisine, meal type, and protein. Our AI creates a
                tailored recipe just for you.
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-6">
                <ListChecks className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Smart Aggregation
              </h3>
              <p className="text-gray-600">
                No more duplicate items. Ingredients from all your recipes are
                combined into a single, accurate total.
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600 mb-6">
                <ShoppingBasket className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Shop with Ease
              </h3>
              <p className="text-gray-600">
                Items are sorted by aisle (Produce, Dairy, etc.) so you can get
                in and out of the store faster.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Statement */}
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Heart className="h-12 w-12 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl mb-6">
            Built for real life
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            What started as a way to make our own meal planning less stressful
            has grown into something designed to help families, busy
            professionals, and anyone who wants to cook more without the hassle
            of planning every detail themselves.
          </p>
          <p className="text-xl font-medium text-gray-900">
            If this app makes your week even a little easier, then it&apos;s
            doing exactly what it was built for.
          </p>
        </div>
      </div>
    </div>
  );
}

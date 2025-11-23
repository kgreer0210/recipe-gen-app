"use client";

import { useState, useEffect } from "react";
import { generateRecipe } from "@/lib/generator";
import { useStore } from "@/lib/store";
import { CuisineType, MealType, ProteinType, Recipe } from "@/types";
import { Loader2, ChefHat, ArrowRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const cuisines: CuisineType[] = [
  "Indian",
  "Italian",
  "Mexican",
  "American",
  "Chinese",
  "Japanese",
  "Thai",
  "Mediterranean",
  "French",
  "Korean",
  "Vietnamese",
  "Greek",
  "Spanish",
  "Middle Eastern",
  "Cajun",
  "German",
];
const meals: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const proteins: ProteinType[] = [
  "Ground Beef",
  "Chicken",
  "Pork",
  "Tofu",
  "Fish",
  "Beans",
  "Lentils",
  "Beef",
  "Shrimp",
  "Lamb",
  "Turkey",
  "Eggs",
  "Salmon",
  "None",
];

export default function RecipeGenerator() {
  const [step, setStep] = useState(0);
  const [cuisine, setCuisine] = useState<CuisineType>("Indian");
  const [meal, setMeal] = useState<MealType>("Breakfast");
  const [protein, setProtein] = useState<ProteinType>("Ground Beef");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<Recipe | null>(null);
  const [showGroceryPopup, setShowGroceryPopup] = useState(false);
  const [direction, setDirection] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [checkingLimit, setCheckingLimit] = useState(true);
  const [servings, setServings] = useState(1);

  const saveRecipe = useStore((state) => state.saveRecipe);
  const addToGroceryList = useStore((state) => state.addToGroceryList);

  useEffect(() => {
    const checkLimit = async () => {
      try {
        const res = await fetch("/api/rate-limit");
        if (res.ok) {
          const data = await res.json();
          if (data.isBlocked) {
            setIsBlocked(true);
          }
        }
      } catch (err) {
        console.error("Failed to check rate limit", err);
      } finally {
        setCheckingLimit(false);
      }
    };
    checkLimit();
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedRecipe(null);
    setShowGroceryPopup(false);
    try {
      const recipe = await generateRecipe(cuisine, meal, protein);
      setGeneratedRecipe(recipe);
      nextStep();
    } catch (error: any) {
      console.error("Failed to generate recipe", error);
      setError(error.message || "Failed to generate recipe. Please try again.");
      if (error.message?.includes("daily recipe limit")) {
        setIsBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (generatedRecipe) {
      const saved = await saveRecipe(generatedRecipe);
      if (saved) {
        setGeneratedRecipe(saved);
        setShowGroceryPopup(true);
      }
    }
  };

  const handleGroceryDecision = (addToGrocery: boolean) => {
    if (addToGrocery && generatedRecipe) {
      addToGroceryList(generatedRecipe.id, servings);
    }
    setStep(0);
    setGeneratedRecipe(null);
    setShowGroceryPopup(false);
    setServings(1); // Reset servings
  };

  const nextStep = () => {
    setDirection(1);
    setStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setDirection(-1);
    setStep((prev) => prev - 1);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  const StepCard = ({
    title,
    options,
    selected,
    onSelect,
    onNext,
  }: {
    title: string;
    options: string[];
    selected: string;
    onSelect: (val: any) => void;
    onNext: () => void;
  }) => (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-2
                            ${
                              selected === option
                                ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md scale-105"
                                : "border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50"
                            }`}
          >
            <span className="font-medium">{option}</span>
            {selected === option && <Check className="w-4 h-4" />}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-semibold shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
        >
          Next <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  if (checkingLimit) {
    return (
      <div className="w-full max-w-2xl mx-auto min-h-[600px] md:h-[700px] flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="w-full max-w-2xl mx-auto min-h-[600px] md:h-[700px] flex flex-col relative overflow-hidden bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20">
        <div className="flex items-center justify-center gap-2 py-6 bg-white/50 backdrop-blur-sm z-10 border-b border-white/20">
          <ChefHat className="w-8 h-8 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Mise AI</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6">
            <span className="text-4xl">👨‍🍳</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Chef's Nap Time
          </h2>
          <p className="text-gray-600 max-w-md mb-8">
            You've reached your daily recipe limit! Our chefs are taking a
            well-deserved break. Please come back tomorrow for more delicious
            ideas.
          </p>
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm text-blue-800 font-medium">
              Limit: 5 recipes per day
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto min-h-[600px] md:h-[700px] flex flex-col relative overflow-hidden bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20">
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 z-20">
        <motion.div
          className="h-full bg-blue-600"
          initial={{ width: "0%" }}
          animate={{ width: `${((step + 1) / 5) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex items-center justify-center gap-2 py-6 bg-white/50 backdrop-blur-sm z-10 border-b border-white/20">
        <ChefHat className="w-8 h-8 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-800">Mise AI</h1>
      </div>

      <div className="relative flex-1 w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div
              key="cuisine"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 overflow-y-auto px-8 py-4"
            >
              <StepCard
                title="What are you craving?"
                options={cuisines}
                selected={cuisine}
                onSelect={setCuisine}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="meal"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 overflow-y-auto px-8 py-4"
            >
              <StepCard
                title="Which meal is this for?"
                options={meals}
                selected={meal}
                onSelect={setMeal}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="protein"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 overflow-y-auto px-8 py-4"
            >
              <StepCard
                title="Choose your protein"
                options={proteins}
                selected={protein}
                onSelect={setProtein}
                onNext={nextStep}
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="review"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 overflow-y-auto px-8 py-4"
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-8 text-center">
                Review your choices
              </h2>
              <div className="space-y-4 mb-8">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                  <span className="text-gray-500">Cuisine</span>
                  <span className="font-semibold text-gray-800">{cuisine}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                  <span className="text-gray-500">Meal</span>
                  <span className="font-semibold text-gray-800">{meal}</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                  <span className="text-gray-500">Protein</span>
                  <span className="font-semibold text-gray-800">{protein}</span>
                </div>
              </div>

              {error && (
                <div
                  className={`p-4 mb-6 rounded-xl border flex gap-3 ${
                    error.includes("daily recipe limit")
                      ? "bg-orange-50 border-orange-100 text-orange-800"
                      : "bg-red-50 border-red-100 text-red-600"
                  }`}
                >
                  {error.includes("daily recipe limit") ? (
                    <>
                      <span className="text-2xl">👨‍🍳</span>
                      <div>
                        <p className="font-semibold">Chef's Nap Time</p>
                        <p className="text-sm opacity-90">{error}</p>
                      </div>
                    </>
                  ) : (
                    error
                  )}
                </div>
              )}

              <div className="flex gap-4 pb-4">
                <button
                  onClick={prevStep}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:scale-100"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Generate Recipe"
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && generatedRecipe && (
            <motion.div
              key="result"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 flex flex-col"
            >
              <div className="flex-1 overflow-y-auto px-8 pb-4">
                <div className="text-center mb-6 pt-4">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {generatedRecipe.title}
                  </h2>
                  <p className="text-gray-600 text-sm">
                    {generatedRecipe.description}
                  </p>
                </div>

                <div className="flex justify-center gap-6 text-sm text-gray-500 mb-6">
                  <span className="bg-blue-50 px-3 py-1 rounded-full text-blue-700 font-medium">
                    Prep: {generatedRecipe.prepTime}
                  </span>
                  <span className="bg-green-50 px-3 py-1 rounded-full text-green-700 font-medium">
                    Cook: {generatedRecipe.cookTime}
                  </span>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 shadow-sm">
                  <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                    Ingredients
                  </h4>
                  <ul className="space-y-2">
                    {generatedRecipe.ingredients.map((ing, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-gray-600 text-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                        {ing.amount} {ing.unit} {ing.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-6 bg-white/80 backdrop-blur-md border-t border-gray-100 space-y-3 z-10">
                {!showGroceryPopup ? (
                  <button
                    onClick={handleSave}
                    className="w-full py-3 px-4 bg-blue-800 hover:bg-blue-900 text-white font-medium rounded-xl transition-colors shadow-md"
                  >
                    Save to Collection
                  </button>
                ) : (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-blue-800 font-medium mb-3 text-center">
                      Recipe Saved!
                    </p>
                    <p className="text-sm text-blue-700 mb-4 text-center">
                      Add ingredients to your grocery list?
                    </p>

                    <div className="flex items-center justify-center gap-3 mb-4">
                      <span className="text-sm text-blue-700">For</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={servings}
                        onChange={(e) =>
                          setServings(
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        }
                        className="w-16 px-2 py-1 text-center border border-blue-200 rounded-lg text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 no-spinner"
                      />
                      <span className="text-sm text-blue-700">people</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGroceryDecision(true)}
                        className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Yes, Add
                      </button>
                      <button
                        onClick={() => handleGroceryDecision(false)}
                        className="flex-1 py-2 px-3 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium rounded-lg transition-colors"
                      >
                        No, Thanks
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setStep(0);
                    setGeneratedRecipe(null);
                  }}
                  className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  Start Over
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

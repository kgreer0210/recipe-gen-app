"use client";

import { useState, useEffect } from "react";
import { generateRecipe, refineRecipe } from "@/lib/generator";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRecipe } from "@/hooks/useRecipesMutations";
import { useRecipesRealtime } from "@/hooks/useRecipesRealtime";
import { useAddToGroceryList } from "@/hooks/useGroceryListMutations";
import {
  CuisineType,
  MealType,
  ProteinType,
  Recipe,
  proteinCuts,
} from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ChefHat, ArrowRight, ArrowLeft, Check, Lock } from "lucide-react";
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
  "Chicken",
  "Beef",
  "Pork",
  "Lamb",
  "Turkey",
  "Fish",
  "Tofu",
  "Beans",
  "Eggs",
  "None",
];

const dietaryPreferencesList = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Dairy-Free",
  "Nut-Free",
  "Low-Carb",
  "Keto",
  "Paleo",
];

export default function RecipeGenerator() {
  const [mode, setMode] = useState<"classic" | "pantry">("classic");
  const [ingredientsInput, setIngredientsInput] = useState("");
  const [step, setStep] = useState(0);
  const [cuisine, setCuisine] = useState<CuisineType>("Indian");
  const [meal, setMeal] = useState<MealType>("Breakfast");
  const [protein, setProtein] = useState<ProteinType>("Chicken");
  const [proteinCut, setProteinCut] = useState<string>("Any cut");
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<Recipe | null>(null);
  const [showGroceryPopup, setShowGroceryPopup] = useState(false);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [direction, setDirection] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [checkingLimit, setCheckingLimit] = useState(true);
  const [servingsInput, setServingsInput] = useState("1");
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refinementCount, setRefinementCount] = useState(0);
  const [refinementHistory, setRefinementHistory] = useState<string[]>([]);

  // Check if current protein has cuts available
  const hasCuts = protein in proteinCuts;
  const availableCuts = hasCuts ? proteinCuts[protein] : [];

  // Calculate total steps and review step index dynamically
  const totalSteps = mode === "classic" ? (hasCuts ? 6 : 5) : 3;
  const reviewStepIndex = mode === "classic" ? (hasCuts ? 5 : 4) : 2;
  const resultStepIndex = mode === "classic" ? (hasCuts ? 6 : 5) : 3;

  const router = useRouter();
  const { user, subscription } = useAuth();
  const { mutateAsync: saveRecipe } = useSaveRecipe();
  const { recipes: savedRecipes = [] } = useRecipesRealtime();
  const { mutateAsync: addToGroceryList } = useAddToGroceryList();

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
    setShowLimitPopup(false);
    try {
      if (mode === "classic") {
        // Pass the cut only if it's not "Any cut"
        const cutToSend =
          hasCuts && proteinCut !== "Any cut" ? proteinCut : undefined;
        const recipe = await generateRecipe({
          mode: "classic",
          cuisine,
          meal,
          protein,
          proteinCut: cutToSend,
          dietaryPreferences,
        });
        setGeneratedRecipe(recipe);
      } else {
        // Pantry Mode
        const ingredientsList = ingredientsInput
          .split(",")
          .map((i) => i.trim())
          .filter((i) => i.length > 0);

        const recipe = await generateRecipe({
          mode: "pantry",
          ingredients: ingredientsList,
          dietaryPreferences,
        });
        setGeneratedRecipe(recipe);
      }
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

  const handleRefine = async () => {
    if (!generatedRecipe || !refinementInput.trim()) return;

    // Check subscription status for refinement limit
    const isSubscriber =
      subscription?.status === "active" || subscription?.status === "trialing";

    if (!isSubscriber && refinementCount >= 2) {
      setShowLimitPopup(true);
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const refinedRecipe = await refineRecipe(
        generatedRecipe,
        refinementInput
      );
      setGeneratedRecipe(refinedRecipe);
      setRefinementHistory((prev) => [...prev, refinementInput]);
      setRefinementCount((prev) => prev + 1);
      setRefinementInput("");
    } catch (error: any) {
      console.error("Failed to refine recipe", error);
      setError(error.message || "Failed to refine recipe. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleSave = async () => {
    // Check if user is logged in
    if (!user) {
      router.push("/login");
      return;
    }

    // Check for subscription limit
    const isSubscriber =
      subscription?.status === "active" || subscription?.status === "trialing";

    if (!isSubscriber && savedRecipes.length >= 20) {
      setShowLimitPopup(true);
      return;
    }

    if (generatedRecipe) {
      const saved = await saveRecipe(generatedRecipe);
      if (saved) {
        setGeneratedRecipe(saved);
        setShowGroceryPopup(true);
      }
    }
  };

  const handleGroceryDecision = async (addToGrocery: boolean) => {
    if (addToGrocery && generatedRecipe) {
      await addToGroceryList({
        recipe: generatedRecipe,
        servings: parseInt(servingsInput) || 1,
      });
    }
    setStep(0);
    setGeneratedRecipe(null);
    setShowGroceryPopup(false);
    setServingsInput("1"); // Reset servings
    setProteinCut("Any cut"); // Reset protein cut
    setIngredientsInput(""); // Reset ingredients
    setDietaryPreferences([]); // Reset preferences
  };

  // Handle protein selection - reset cut when protein changes
  const handleProteinSelect = (newProtein: ProteinType) => {
    setProtein(newProtein);
    setProteinCut("Any cut"); // Reset to default when protein changes
  };

  // Handle next step from protein selection - skip cut step if no cuts available
  const handleProteinNext = () => {
    if (protein in proteinCuts) {
      nextStep(); // Go to cut selection step
    } else {
      // Skip cut step, go directly to review
      setDirection(1);
      setStep(reviewStepIndex);
    }
  };

  const nextStep = () => {
    setDirection(1);
    setStep((prev) => prev + 1);
  };

  const goToPreviousStep = () => {
    setDirection(-1);
    
    if (mode === "classic") {
      // Handle classic mode navigation
      if (step === reviewStepIndex) {
        // Going back from review step to preferences step
        setStep(hasCuts ? 4 : 3);
      } else if (step === (hasCuts ? 4 : 3)) {
        // Going back from preferences step
        // If protein has cuts, go to cut step (3), otherwise go to protein step (2)
        if (hasCuts) {
          setStep(3);
        } else {
          setStep(2);
        }
      } else if (step === 3 && hasCuts) {
        // Going back from protein cut step (step 3) to protein step (step 2)
        // Only handle this if hasCuts is true, otherwise step 3 is preferences
        setStep(2);
      } else if (step > 0) {
        // For all other steps, simple decrement
        setStep((prev) => prev - 1);
      }
    } else {
      // Handle pantry mode navigation
      if (step === reviewStepIndex) {
        // Going back from review step (step 2) to preferences step (step 1)
        setStep(1);
      } else if (step === 1) {
        // Going back from preferences step to ingredients step (step 0)
        setStep(0);
      } else if (step > 0) {
        // For all other steps, simple decrement
        setStep((prev) => prev - 1);
      }
    }
  };

  const prevStep = () => {
    goToPreviousStep();
  };

  const togglePreference = (pref: string) => {
    setDietaryPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
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
    onBack,
  }: {
    title: string;
    options: string[];
    selected: string;
    onSelect: (val: any) => void;
    onNext: () => void;
    onBack?: () => void;
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
                            ${selected === option
                ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md scale-105"
                : "border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50"
              }`}
          >
            <span className="font-medium">{option}</span>
            {selected === option && <Check className="w-4 h-4" />}
          </button>
        ))}
      </div>
      <div className={`flex ${onBack ? "justify-between" : "justify-end"} gap-4`}>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-full font-semibold hover:bg-gray-200 transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
        )}
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-semibold shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
        >
          Next <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const PreferencesStep = ({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) => (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        Any dietary preferences?
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {dietaryPreferencesList.map((pref) => (
          <button
            key={pref}
            onClick={() => togglePreference(pref)}
            className={`p-3 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm
                            ${dietaryPreferences.includes(pref)
                ? "border-blue-600 bg-blue-50 text-blue-700 shadow-md"
                : "border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50"
              }`}
          >
            {dietaryPreferences.includes(pref) && <Check className="w-3 h-3" />}
            <span className="font-medium">{pref}</span>
          </button>
        ))}
      </div>
      <div className={`flex ${onBack ? "justify-between" : "justify-end"} gap-4`}>
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-full font-semibold hover:bg-gray-200 transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
        )}
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
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-6">
            <p className="text-sm text-blue-800 font-medium">
              Limit: 5 recipes per day
            </p>
          </div>

          <Link
            href="/pricing"
            className="px-6 py-3 bg-blue-600 text-white rounded-full font-semibold shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 inline-block"
          >
            Unlock Unlimited Recipes
          </Link>
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
          animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-6 bg-white/50 backdrop-blur-sm z-10 border-b border-white/20 gap-4">
        <div className="flex items-center gap-2">
          <ChefHat className="w-8 h-8 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Mise AI</h1>
        </div>

        {step === 0 && (
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setMode("classic")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === "classic"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Classic
            </button>
            <button
              onClick={() => setMode("pantry")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === "pantry"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Pantry
            </button>
          </div>
        )}
      </div>

      <div className="relative flex-1 w-full overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && mode === "classic" && (
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

          {step === 0 && mode === "pantry" && (
            <motion.div
              key="pantry-input"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="absolute inset-0 overflow-y-auto px-8 py-4 flex flex-col"
            >
              <div className="w-full max-w-lg mx-auto flex-1 flex flex-col">
                <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
                  What's in your pantry?
                </h2>
                <p className="text-gray-500 text-center mb-6">
                  Enter ingredients you have on hand, separated by commas.
                </p>

                <textarea
                  value={ingredientsInput}
                  onChange={(e) => setIngredientsInput(e.target.value)}
                  placeholder="e.g. chicken breast, broccoli, rice, soy sauce, garlic..."
                  className="w-full h-40 p-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all resize-none text-lg"
                />

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={nextStep}
                    disabled={!ingredientsInput.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-semibold shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                  >
                    Next <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Preferences Step - Pantry Mode */}
          {step === 1 && mode === "pantry" && (
            <motion.div
              key="preferences-pantry"
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
              <PreferencesStep onNext={nextStep} onBack={goToPreviousStep} />
            </motion.div>
          )}

          {step === 1 && mode === "classic" && (
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
                onBack={goToPreviousStep}
              />
            </motion.div>
          )}

          {step === 2 && mode === "classic" && (
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
                onSelect={handleProteinSelect}
                onNext={handleProteinNext}
                onBack={goToPreviousStep}
              />
            </motion.div>
          )}

          {step === 3 && mode === "classic" && hasCuts && availableCuts && (
            <motion.div
              key="protein-cut"
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
                title={`What type of ${protein.toLowerCase()}?`}
                options={availableCuts}
                selected={proteinCut}
                onSelect={setProteinCut}
                onNext={nextStep}
                onBack={goToPreviousStep}
              />
            </motion.div>
          )}

          {/* Preferences Step - Classic Mode */}
          {step === (hasCuts ? 4 : 3) && mode === "classic" && (
            <motion.div
              key="preferences-classic"
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
              <PreferencesStep onNext={nextStep} onBack={goToPreviousStep} />
            </motion.div>
          )}

          {step === reviewStepIndex && (
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

              {mode === "classic" ? (
                <div className="space-y-4 mb-8">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                    <span className="text-gray-500">Cuisine</span>
                    <span className="font-semibold text-gray-800">
                      {cuisine}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                    <span className="text-gray-500">Meal</span>
                    <span className="font-semibold text-gray-800">{meal}</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                    <span className="text-gray-500">Protein</span>
                    <span className="font-semibold text-gray-800">
                      {protein}
                      {hasCuts && proteinCut !== "Any cut"
                        ? ` - ${proteinCut}`
                        : ""}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mb-8">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-gray-500 block mb-2">
                      Ingredients
                    </span>
                    <p className="font-semibold text-gray-800">
                      {ingredientsInput}
                    </p>
                  </div>
                </div>
              )}

              {dietaryPreferences.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-8">
                  <span className="text-gray-500 block mb-2">Preferences</span>
                  <div className="flex flex-wrap gap-2">
                    {dietaryPreferences.map((pref) => (
                      <span
                        key={pref}
                        className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium"
                      >
                        {pref}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div
                  className={`p-4 mb-6 rounded-xl border flex gap-3 ${error.includes("daily recipe limit")
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

          {step === resultStepIndex && generatedRecipe && (
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

                <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 shadow-sm">
                  <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                    Refine Recipe
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refinementInput}
                      onChange={(e) => setRefinementInput(e.target.value)}
                      placeholder="e.g. Make it spicy, swap chicken for tofu..."
                      className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-50 outline-none transition-all"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isRefining) {
                          handleRefine();
                        }
                      }}
                    />
                    <button
                      onClick={handleRefine}
                      disabled={isRefining || !refinementInput.trim()}
                      className="px-4 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isRefining ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Refine"
                      )}
                    </button>
                  </div>
                </div>

                {refinementHistory.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-700 mb-2 text-sm">
                      Refinement History
                    </h4>
                    <div className="space-y-2">
                      {refinementHistory.map((history, index) => (
                        <div
                          key={index}
                          className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-600 flex items-start gap-2"
                        >
                          <span className="mt-1 w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0"></span>
                          <span>{history}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-white/80 backdrop-blur-md border-t border-gray-100 space-y-3 z-10">
                {!showGroceryPopup && !showLimitPopup ? (
                  <button
                    onClick={handleSave}
                    className="w-full py-3 px-4 bg-blue-800 hover:bg-blue-900 text-white font-medium rounded-xl transition-colors shadow-md"
                  >
                    Save to Collection
                  </button>
                ) : showLimitPopup ? (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Lock className="w-5 h-5 text-orange-600" />
                      <p className="text-orange-800 font-bold">Limit Reached</p>
                    </div>
                    <p className="text-sm text-orange-700 mb-4 text-center">
                      Free users can only refine a recipe 2 times. Upgrade to
                      unlock unlimited refinements!
                    </p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowLimitPopup(false)}
                        className="flex-1 py-2 px-3 bg-white border border-orange-200 text-orange-700 hover:bg-orange-50 text-sm font-medium rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <Link
                        href="/pricing"
                        className="flex-1 py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                      >
                        Upgrade
                      </Link>
                    </div>
                  </div>
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
                      <button
                        onClick={() => {
                          const current = parseInt(servingsInput) || 1;
                          setServingsInput(String(Math.max(1, current - 1)));
                        }}
                        className="w-10 h-10 rounded-full border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={servingsInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty string or valid numbers 1-20
                          if (
                            value === "" ||
                            (/^\d+$/.test(value) && parseInt(value) <= 20)
                          ) {
                            setServingsInput(value);
                          }
                        }}
                        onBlur={() => {
                          const num = parseInt(servingsInput);
                          if (!servingsInput || isNaN(num) || num < 1) {
                            setServingsInput("1");
                          }
                        }}
                        className="w-16 text-center text-2xl font-bold text-blue-600 border-none focus:ring-0 p-0 no-spinner"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(servingsInput) || 1;
                          setServingsInput(String(Math.min(20, current + 1)));
                        }}
                        className="w-10 h-10 rounded-full border border-blue-200 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        +
                      </button>
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
                    setShowLimitPopup(false);
                    setProteinCut("Any cut");
                    setIngredientsInput("");
                    setDietaryPreferences([]);
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

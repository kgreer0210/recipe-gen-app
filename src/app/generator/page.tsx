import RecipeGenerator from "@/components/RecipeGenerator";

export default function GeneratorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
       <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
          Mise <span className="text-blue-600">AI</span>
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-xl text-gray-500">
          Generate delicious recipes with the power of AI.
        </p>
      </div>
      <RecipeGenerator />
    </div>
  );
}


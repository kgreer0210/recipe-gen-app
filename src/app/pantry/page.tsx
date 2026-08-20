import PantryManager from "@/components/PantryManager";

export const metadata = {
  title: "Pantry | Mise AI",
  description: "Track ingredients you already have at home.",
};

export default function PantryPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pantry</h1>
        <p className="mt-2 text-gray-500 text-sm md:text-base">
          What you already have. Grocery lists skip these, and leftover cooking
          can start from here.
        </p>
      </div>
      <PantryManager />
    </div>
  );
}

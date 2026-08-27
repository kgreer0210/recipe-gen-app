import type { Metadata } from "next";
import HomeDesignShowcase from "@/components/HomeDesignShowcase";

export const metadata: Metadata = {
  title: "AI Recipe Generator & Meal Planner",
  description:
    "Generate custom recipes with AI, plan your weekly meals, and build smart grocery lists. Mise AI helps you answer “what’s for dinner?” in seconds.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <HomeDesignShowcase />;
}

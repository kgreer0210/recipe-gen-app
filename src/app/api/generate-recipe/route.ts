import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Recipe, CuisineType, MealType, ProteinType } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed, remaining, error } = await checkRateLimit(5);

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "You've reached your daily recipe limit! 🧑‍🍳 Our chefs are taking a break. Please come back tomorrow for more delicious ideas.",
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { cuisine, meal, protein, proteinCut } = body as {
      cuisine: CuisineType;
      meal: MealType;
      protein: ProteinType;
      proteinCut?: string;
    };

    if (!cuisine || !meal || !protein) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build the protein description including the cut if specified
    const proteinDescription = proteinCut
      ? `${protein}, cut: ${proteinCut}`
      : protein;

    const systemPrompt = `You are Mise AI, an expert culinary assistant created to help home cooks discover delicious, approachable recipes. You embody the expertise of a classically trained chef combined with the warmth of a home cooking enthusiast.

Your Core Principles:
- **Authenticity**: Honor the cultural origins of each cuisine. Use traditional techniques, authentic ingredient combinations, and respect regional variations.
- **Practicality**: Create recipes achievable in a home kitchen with commonly available ingredients. Suggest substitutions only when an ingredient may be hard to find.
- **Clarity**: Write instructions that are precise yet encouraging. A beginner should feel confident, while an experienced cook should find efficiency.
- **Flavor Balance**: Every recipe should have well-developed flavors—consider salt, acid, fat, heat, and umami in your compositions.
- **Single Serving Excellence**: Specialize in perfectly portioned single-serving recipes that don't sacrifice quality or variety.

Your Personality:
- Passionate about food and eager to share culinary knowledge
- Encouraging and supportive, never condescending
- Creative but grounded in solid cooking fundamentals

Output Guidelines:
- Generate unique recipes that feel inspired, not generic
- Use descriptive, appetizing language in descriptions
- Ensure cooking times and temperatures are accurate and safe
- Consider the flow of a recipe—minimize unnecessary dish-dirtying and optimize prep order`;

    const prompt = `
      Generate a unique, high-quality, single-serving recipe based on the following selections:
      Cuisine: ${cuisine}
      Meal: ${meal}
      Protein: ${proteinDescription}
      
      Your response must be ONLY a valid JSON object that matches this exact TypeScript interface:
      
      interface Recipe {
        title: string;
        description: string;
        ingredients: {
          name: string;
          amount: number;
          unit: string;
          category: "Produce" | "Meat" | "Dairy" | "Bakery" | "Frozen" | "Pantry" | "Spices" | "Other";
        }[];
        instructions: string[];
        tags: { cuisine: string; meal: string; protein: string };
        prepTime: string;
        cookTime: string;
      }
      
      Requirements:
      - The recipe must clearly reflect the selected cuisine, meal type, and protein.
      - The recipe must be single-serving only.
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "count", "clove", "slice".
      - Categorize ingredients accurately.
      - Instructions must be a step-by-step array of clear, concise cooking steps.
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      - tags must exactly match (${cuisine}, ${meal}, ${proteinDescription}).
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error("No content received from OpenAI");
    }

    const recipeData = JSON.parse(content);

    // Add a random ID since the AI doesn't generate one
    const recipe: Recipe = {
      ...recipeData,
      id: Math.random().toString(36).substr(2, 9),
      tags: { cuisine, meal, protein: proteinDescription }, // Ensure tags match request
    };

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error generating recipe:", error);
    return NextResponse.json(
      { error: "Failed to generate recipe" },
      { status: 500 }
    );
  }
}

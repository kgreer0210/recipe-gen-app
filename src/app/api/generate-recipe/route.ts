import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Recipe, CuisineType, MealType, ProteinType } from '@/types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { cuisine, meal, protein } = body as {
            cuisine: CuisineType;
            meal: MealType;
            protein: ProteinType;
        };

        if (!cuisine || !meal || !protein) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const prompt = `
      Generate a unique and delicious ${cuisine} ${meal} recipe featuring ${protein}.
      
      Return ONLY a valid JSON object matching this TypeScript interface:
      
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

      Ensure ingredients use standard units (lb, oz, cup, tbsp, tsp, count, clove, slice).
      Do not include any markdown formatting or explanations, just the raw JSON.
    `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-4o-mini',
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;

        if (!content) {
            throw new Error('No content received from OpenAI');
        }

        const recipeData = JSON.parse(content);

        // Add a random ID since the AI doesn't generate one
        const recipe: Recipe = {
            ...recipeData,
            id: Math.random().toString(36).substr(2, 9),
            tags: { cuisine, meal, protein }, // Ensure tags match request
        };

        return NextResponse.json(recipe);
    } catch (error) {
        console.error('Error generating recipe:', error);
        return NextResponse.json(
            { error: 'Failed to generate recipe' },
            { status: 500 }
        );
    }
}

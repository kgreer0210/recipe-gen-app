import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/AuthProvider";
import { Subscription } from "@/types";
import QueryProvider from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mise AI - Your Personal AI Chef & Meal Planner",
  description:
    "Generate custom recipes, plan your weekly meals, and automate your grocery shopping in seconds. The smart way to answer 'What's for dinner?'",
  keywords: [
    "ai recipe generator",
    "meal planner",
    "grocery list maker",
    "artificial intelligence cooking",
    "weekly meal plan",
  ],
  openGraph: {
    title: "Mise AI - Your Personal AI Chef",
    description:
      "Stop wondering what to cook. Generate recipes and shopping lists instantly.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let subscription: Subscription | null = null;

  if (user) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      subscription = data as Subscription;
    }
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen flex flex-col`}
      >
        <QueryProvider>
          <AuthProvider initialUser={user} initialSubscription={subscription}>
            <Navigation />
            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex-1">
              {children}
            </main>
            <Footer />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

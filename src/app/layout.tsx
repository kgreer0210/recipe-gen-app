import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/AuthProvider";
import { Subscription } from "@/types";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.mise-ai.app";

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mise AI - Your Personal AI Chef & Meal Planner",
    template: "%s | Mise AI",
  },
  description:
    "Generate custom recipes, plan your weekly meals, and automate your grocery shopping in seconds. The smart way to answer 'What's for dinner?'",
  keywords: [
    "ai recipe generator",
    "meal planner",
    "grocery list maker",
    "artificial intelligence cooking",
    "weekly meal plan",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Mise AI - Your Personal AI Chef",
    description:
      "Stop wondering what to cook. Generate recipes and shopping lists instantly.",
    type: "website",
    url: siteUrl,
    siteName: "Mise AI",
    images: [
      {
        url: "/kitchen-background.jpg",
        alt: "Mise AI - Your Personal AI Chef",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mise AI - Your Personal AI Chef",
    description:
      "Stop wondering what to cook. Generate recipes and shopping lists instantly.",
    images: ["/kitchen-background.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  ...(googleSiteVerification || bingSiteVerification
    ? {
        verification: {
          ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
          ...(bingSiteVerification
            ? { other: { bing: bingSiteVerification } }
            : {}),
        },
      }
    : {}),
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
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              organizationJsonLd({ siteUrl }),
              websiteJsonLd({ siteUrl }),
            ]),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen flex flex-col`}
      >
        <AuthProvider initialUser={user} initialSubscription={subscription}>
          <Navigation />
          <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex-1">
            {children}
          </main>
          <Footer />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}

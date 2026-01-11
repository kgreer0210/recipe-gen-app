import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.mise-ai.app";

export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";

  if (!isProd) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: ["/"],
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/ai-recipe-generator",
          "/meal-planner",
          "/grocery-list-maker",
          "/generator",
          "/pricing",
          "/about",
          "/contact",
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/collection",
          "/weekly-plan",
          "/grocery-list",
          "/recipe/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}


import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.mise-ai.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes = [
    "/",
    "/ai-recipe-generator",
    "/meal-planner",
    "/grocery-list-maker",
    "/generator",
    "/pricing",
    "/about",
    "/contact",
  ];

  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
  }));
}


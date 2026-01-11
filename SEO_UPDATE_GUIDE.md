## Mise AI SEO Update Guide (and fixing `layout.tsx` verification build errors)

This repo uses **Next.js App Router metadata**, **`/sitemap.xml`**, and **`/robots.txt`** for SEO.

### 1) Required environment variables

Set these in **Vercel Project Settings → Environment Variables** (or in `.env.local` for local testing):

- `NEXT_PUBLIC_SITE_URL`
  - Example: `https://www.mise-ai.app`
  - Used for canonical URLs, JSON-LD `url`, and sitemap URLs.

### 2) Optional: Search engine site verification (common source of build errors)

The app supports verification tokens via env vars. These are **optional**.

- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
  - The value from Google Search Console “HTML tag” verification, e.g. `abc123...`
- `NEXT_PUBLIC_BING_SITE_VERIFICATION`
  - The value from Bing Webmaster Tools “HTML meta tag”, e.g. `xyz789...`

#### Why builds can fail here

Next’s `Metadata` types don’t allow `undefined` values inside `metadata.verification`. If you set the property with an undefined env var, TypeScript/build can fail.

#### How we fixed it

In [`src/app/layout.tsx`](src/app/layout.tsx) we only include `metadata.verification` keys **when the env vars exist**. So:

- If you don’t set the env vars, **no verification meta tags are emitted** and builds remain clean.
- If you do set them, the tags will be emitted.

### 3) Where SEO lives in this codebase

- **Global metadata + JSON-LD**: [`src/app/layout.tsx`](src/app/layout.tsx)
- **Public marketing/SEO pages**:
  - [`src/app/ai-recipe-generator/page.tsx`](src/app/ai-recipe-generator/page.tsx)
  - [`src/app/meal-planner/page.tsx`](src/app/meal-planner/page.tsx)
  - [`src/app/grocery-list-maker/page.tsx`](src/app/grocery-list-maker/page.tsx)
- **Sitemap**: [`src/app/sitemap.ts`](src/app/sitemap.ts)
- **Robots**: [`src/app/robots.ts`](src/app/robots.ts)
- **JSON-LD helper**: [`src/lib/seo/jsonld.ts`](src/lib/seo/jsonld.ts)

### 4) After deploying: what to do in Google/Bing

#### Google Search Console

1. Add a property for your domain.
2. Verify using the HTML meta tag:
   - Put the token in `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
3. Submit your sitemap:
   - `https://YOUR_DOMAIN/sitemap.xml`
4. Use “URL Inspection” on:
   - `/`
   - `/ai-recipe-generator`
   - `/meal-planner`
   - `/grocery-list-maker`

#### Bing Webmaster Tools

1. Add your site.
2. Verify using the HTML meta tag:
   - Put the token in `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
3. Submit your sitemap:
   - `https://YOUR_DOMAIN/sitemap.xml`

### 5) Quick local checks

With `npm run dev` running:

- Visit `/robots.txt` and confirm it exists.
- Visit `/sitemap.xml` and confirm it lists marketing routes.
- Visit each landing page and confirm it renders without login and has real content.

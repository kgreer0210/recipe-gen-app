# Mise AI - Your Personal AI Chef

**Mise AI** is a modern SaaS application that solves the eternal "What's for dinner?" problem. By leveraging Artificial Intelligence, it generates custom recipes based on user cravings, organizes them into a weekly meal plan, and automatically generates consolidated grocery lists.

This project is built as a highly scalable, production-ready Next.js application, featuring robust authentication, database management, and AI integration.

---

## 🚀 Key Features

- **AI Recipe Generation**: Generate unique, detailed recipes by selecting cuisine, meal type, and main ingredients. Powered by OpenAI.
- **Interactive Weekly Planner**: specialized drag-and-drop interface to schedule meals for the week.
- **Smart Grocery Lists**: Automatically aggregates ingredients from your weekly plan into a sorted shopping list.
- **User Collections**: Save and organize favorite generated recipes.
- **Rate Limiting System**: Custom Postgres-based rate limiting to manage AI costs for free users.
- **Responsive UI**: Beautiful, mobile-first interface built with Tailwind CSS and Motion.

---

## 🛠 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL)
- **AI Integration**: [OpenAI API](https://openai.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) (for client-side shopping cart/recipe state)
- **Animations**: [Motion](https://motion.dev/) (formerly Framer Motion)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🏗 Architecture & Development

### Frontend Architecture

The application uses the **Next.js 16 App Router**.

- **Server Components**: Used for initial data fetching (e.g., retrieving saved collections) and layout shell to ensure optimal SEO and performance.
- **Client Components**: Used for highly interactive elements like the `RecipeGenerator` (form state, animations), `WeeklyMeals` (drag-and-drop), and `GroceryList`.
- **State Management**: `Zustand` is used for global client state that needs to persist across navigation but doesn't necessarily need an immediate database write (like the current generated recipe being viewed or transient UI states).

### Backend Layer

The "backend" is implemented using **Next.js API Routes** (`src/app/api/`) which act as a secure proxy between the client and external services.

- `/api/generate-recipe`: Handles the prompt engineering and communication with OpenAI. This keeps API keys secure on the server.
- `/api/rate-limit`: Checks and updates user rate limits before allowing expensive AI operations.

### Database & Security (Supabase)

The project uses Supabase for PostgreSQL and Authentication.

**Schema Overview:**

- `recipes`: Stores generated recipe JSON data.
- `collections`: Links users to saved recipes.
- `weekly_plan`: Maps recipes to specific days/slots for a user.
- `user_rate_limits`: Tracks daily usage for AI generation.

**Security (RLS):**
Row Level Security (RLS) policies are strictly enforced. Users can only `SELECT`, `INSERT`, `UPDATE`, or `DELETE` rows where `user_id` matches their authenticated UUID.

**Rate Limiting Implementation:**
To prevent abuse and manage costs, a custom **PostgreSQL RPC (Remote Procedure Call)** function `check_and_increment_rate_limit` is used.

- **Logic**: It atomicallly checks if a user has exceeded their daily limit. If not, it increments the counter.
- **Reset**: The counter automatically resets if the `last_reset` timestamp is older than 24 hours.
- **Code**: See `src/lib/supabase/rate_limit.sql`.

---

## 💻 Local Development Setup

### 1. Prerequisites

- Node.js 18+ and npm/yarn/pnpm/bun.
- A Supabase project.
- An OpenAI API Key.

### 2. Clone & Install

```bash
git clone <repository-url>
cd recipe-gen-app
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_for_admin_tasks
OPENAI_API_KEY=your_openai_api_key
```

_Note: `SUPABASE_SERVICE_ROLE_KEY` is required for the rate-limit check API route which needs to bypass RLS to reliably increment counters via RPC._

### 4. Database Setup

Run the SQL scripts found in `src/lib/supabase/` in your Supabase SQL Editor to set up tables and functions:

1. `weekly_plan.sql` (Contains schema for plans and base tables if not already created)
2. `rate_limit.sql` (Sets up the rate limiting table and RPC function)

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## 📝 License

This project is proprietary software. All rights reserved.

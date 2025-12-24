# Mise AI - Design Theme Guide

This document defines the visual identity and design system for Mise AI. These standards should be maintained across all platforms (Web, Mobile, etc.) to ensure a consistent brand experience.

## Brand Identity

- **Name:** Mise AI
- **Tagline:** Your Personal AI Chef. Zero Decision Fatigue.
- **Core Value:** Efficiency, Inspiration, and Simplicity in cooking.

## Color Palette

### Primary Colors (Brand & Actions)

- **Primary (Blue-600):** `#2563eb` - Used for primary buttons, brand logos, and main active states.
- **Primary Hover (Blue-700):** `#1d4ed8`
- **Primary Dark (Blue-800/900):** `#1e40af` / `#1e3a8a` - Used for strong call-to-action backgrounds and dark mode elements.
- **Primary Light (Blue-50):** `#eff6ff` - Used for button backgrounds and highlighted card sections.

### Functional Colors

- **Success/Planning (Green-600):** `#16a34a` - Used for "Weekly Plan" icons, success indicators, and positive dietary tags.
- **Warning/Shopping (Orange-600):** `#ea580c` - Used for "Grocery List" icons, rate limits, and warning messages.
- **Error (Red-600):** `#dc2626` - Used for destructive actions and error states.

### Neutral Colors

- **Background (White):** `#ffffff`
- **Surface (Gray-50):** `#f9fafb` - Secondary backgrounds and hover states.
- **Border (Gray-100/200):** `#f3f4f6` / `#e5e7eb`
- **Text Primary (Gray-900):** `#111827` - Main headings and important text.
- **Text Secondary (Gray-600/500):** `#4b5563` / `#6b7280` - Body text, descriptions, and metadata.

## Typography

- **Primary Font:** Sans-serif (Geist Sans or Inter preferred; fallbacks: Arial, Helvetica, sans-serif).
- **Heading Styles:**
  - **H1:** Extrabold (`font-extrabold`), large tracking tight (`tracking-tight`).
  - **H2/H3:** Bold (`font-bold`).
- **Button Text:** Semibold (`font-semibold`) or Medium (`font-medium`).
- **Body Text:** Regular weight, size `14px` (sm) or `16px` (base).

## UI Elements & Styling

### Shapes (Border Radius)

- **Extra Large (rounded-3xl):** `24px` - Main containers, hero sections.
- **Large (rounded-2xl):** `16px` - Feature cards, primary sections.
- **Medium (rounded-xl):** `12px` - Inputs, buttons, secondary cards.
- **Small (rounded-lg):** `8px` - Toggle switches, small UI components.
- **Full (rounded-full):** Pill shapes for primary buttons and status tags.

### Shadows

- **Shadow-sm:** Subtle elevation for cards.
- **Shadow-md/lg:** Used on hover or for interactive elements (buttons).
- **Shadow-xl:** Used for main app containers or modals.

### Glassmorphism & Effects

- **Backdrop Blur:** `backdrop-blur-sm` (4px blur) used on white overlays (`bg-white/50` or `bg-white/80`).
- **Borders:** Thin, light borders (`border-white/20` or `border-gray-100`) on surfaces to define shape without weight.

## Iconography

- **Icon Set:** [Lucide React](https://lucide.dev/)
- **Stroke Width:** Default (2px).
- **Key Icon Associations:**
  - `ChefHat`: Brand / Mise AI Logo.
  - `Sparkles`: AI Generation / Recipe Inspiration.
  - `CalendarDays`: Weekly Planning.
  - `ShoppingCart` / `ShoppingBasket`: Grocery Lists.

## Animations & Motion

- **Entrance:** Elements should fade and slide in from the bottom (`duration-700`).
- **Hover States:**
  - Scale: `scale-105` for buttons and interactive cards.
  - Transitions: `transition-all` with `duration-200`.
- **Active States:** Subtle scale down (`scale-95`) for buttons when clicked/tapped.
- **Spring Physics:** Use spring-based animations for step transitions (Stiffness: 300, Damping: 30).

## Layout Principles

- **Container Width:** Max width of `1280px` (7xl) for marketing pages, `672px` (2xl) for focused app tools (Generator).
- **Spacing:** Generous use of white space; typical padding/margins are `16px` (p-4), `24px` (p-6), or `32px` (p-8).
- **Mobile First:** All layouts must be responsive, collapsing from multi-column grids (3 cols) to single stacks on smaller screens.

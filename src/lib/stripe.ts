import Stripe from "stripe";

// Do not pin `apiVersion` here. The stripe SDK always sends the API version it
// was built against, and its types only accept that exact string, so a pinned
// value breaks `next build` type-checking on every Dependabot minor bump.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

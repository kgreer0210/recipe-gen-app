# To-Do List

## User Setup for Development
- [x] Add ADMIN_USER_ID bypass to `checkAndIncrementUsage()` in `src/lib/usage.ts:63-76`
  - Added early return that bypasses RPC call and returns unlimited usage when user ID matches ADMIN_USER_ID
- [x] Add ADMIN_USER_ID bypass to `getUsageStatus()` in `src/lib/usage.ts:168-205`
  - Returns unlimited status for admin users without calling RPC

## Usage Limit UX Improvements
- [x] Re-check rate limit in `handleGenerate()` before API call
  - Added rate limit check at start of `handleGenerate()` in `src/components/RecipeGenerator.tsx:174-190`
  - If blocked, shows "Chef's Nap Time" UI instead of making API call that will fail

## Tier-Based Model Selection
- [x] Implement tier-based model selection system
  - Added `TIER_MODELS` config and `getModelForTier()` helper in `src/lib/openrouter/models.ts`
  - Updated `generate-recipe` and `refine-recipe` routes to use tier-appropriate models
- [x] Configure free tier to use slower model
  - Default: `google/gemini-2.5-flash-lite` (or env `OPENROUTER_FREE_TIER_MODEL`)
- [x] Configure plus tier to use faster model
  - Default: `google/gemini-2.5-flash` (or env `OPENROUTER_PLUS_TIER_MODEL`)
- [x] Configure pro tier to use fastest model
  - Default: `anthropic/claude-sonnet-4` (or env `OPENROUTER_PRO_TIER_MODEL`)
  - Admin users also get pro-tier model
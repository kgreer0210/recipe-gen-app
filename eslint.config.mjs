import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `npm run lint` preloads scripts/eslint-typescript-6.cjs so typescript-eslint
// resolves the `typescript-6` alias instead of TypeScript 7. Remove that preload
// once typescript-eslint supports TypeScript 7:
// https://github.com/typescript-eslint/typescript-eslint/issues/10940

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

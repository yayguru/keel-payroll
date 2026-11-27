import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Generated bundles and vendored code.
    "**/.build/**",
    "**/dist/**",
    "desk-worker/assets.generated.js",
    "cache/**",
    "lib/forge-std/**",
  ]),
  // Operator scripts cast a few third-party SDK shapes; keep them visible as warnings, not build blockers.
  { files: ["scripts/**"], rules: { "@typescript-eslint/no-explicit-any": "warn" } },
]);

export default eslintConfig;

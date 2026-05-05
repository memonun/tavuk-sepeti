import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Layered architecture per SPEC.md §5:
 *   ui → application → domain      (one-way)
 *   infrastructure ──implements──▶ domain
 *
 * Cross-feature: another feature is reachable ONLY via its application/ layer.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Project-wide rules.
  {
    rules: {
      // CLAUDE.md §6: console.log banned. Use shared/logger.ts (pino).
      "no-console": "error",

      // Allow underscore-prefixed args/vars as the explicit "unused on purpose"
      // convention (callbacks, pattern-match branches, etc.). Real unused
      // identifiers without the prefix still warn.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  // Architectural boundaries.
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["**/*.{ts,tsx,mts}"],
      "boundaries/elements": [
        // Inside features/<feature>/<layer>
        { type: "domain",         pattern: "features/*/domain/**",         capture: ["feature"] },
        { type: "application",    pattern: "features/*/application/**",    capture: ["feature"] },
        { type: "infrastructure", pattern: "features/*/infrastructure/**", capture: ["feature"] },
        { type: "feature-ui",     pattern: "features/*/ui/**",             capture: ["feature"] },

        // Cross-cutting layers (no feature scope).
        { type: "app-route",      pattern: "app/**" },
        { type: "shared",         pattern: "shared/**" },
        { type: "ui-primitive",   pattern: "components/**" },
        { type: "lib",            pattern: "lib/**" },
      ],
    },
    rules: {
      // 1. The unknown-element rule: every TS file in scope must match one of
      //    the elements above. Tests sit outside `features/` so they don't
      //    trigger; configs are excluded by the include glob.
      "boundaries/no-unknown": "off",
      "boundaries/no-unknown-files": "off",

      // 2. Layered rules — what each element type may import.
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // domain/: pure. Only shared utilities + own folder.
            {
              from: "domain",
              allow: [
                "shared",
                ["domain", { feature: "${from.feature}" }],
              ],
            },

            // application/: orchestrates domain + infrastructure of its own
            // feature. May call other features' application/ as a public
            // API. Cannot reach into another feature's infrastructure.
            {
              from: "application",
              allow: [
                "shared",
                ["domain", { feature: "${from.feature}" }],
                ["application", { feature: "${from.feature}" }],
                ["infrastructure", { feature: "${from.feature}" }],
                "application", // other features' application — public API
              ],
            },

            // infrastructure/: implements domain ports. Only own domain + shared.
            {
              from: "infrastructure",
              allow: [
                "shared",
                ["domain", { feature: "${from.feature}" }],
              ],
            },

            // feature-ui/: own application + own domain types + cross-cutting UI.
            // Per SPEC.md §2 "cross-feature import only via application/" —
            // a feature's UI may call another feature's application as a
            // public API surface (e.g., customer form invoking geocoding
            // server action).
            {
              from: "feature-ui",
              allow: [
                "shared",
                "ui-primitive",
                "lib",
                ["application", { feature: "${from.feature}" }],
                ["domain", { feature: "${from.feature}" }],
                "application", // other features' application — public API
              ],
            },

            // app/: route shells. Compose feature-ui or call application
            // directly. Domain access is for type-only imports — page props,
            // form default values mapped from domain entities.
            {
              from: "app-route",
              allow: [
                "shared",
                "ui-primitive",
                "lib",
                "feature-ui",
                "application",
                "domain",
              ],
            },

            // shared/: cross-cutting. Cannot reach into features.
            {
              from: "shared",
              allow: ["shared", "lib"],
            },

            // components/ (shadcn primitives) and lib/ (cn helper) stay self-contained.
            { from: "ui-primitive", allow: ["ui-primitive", "lib", "shared"] },
            { from: "lib", allow: ["lib", "shared"] },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;

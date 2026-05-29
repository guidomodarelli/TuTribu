import { fixupConfigRules } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import * as noEslintDisable from "eslint-plugin-no-eslint-disable";
import noMagic, { recommendedMagicNumberOptions } from "eslint-plugin-no-magic";

const deprecatedFeatureImportPatterns = ["@/src/features/*", "src/features/*"];
const moduleSetupImportPatterns = [
  "@/src/modules/setup",
  "@/src/modules/setup.*",
  "@/src/modules/*/setup",
  "@/src/modules/*/setup.*",
  "src/modules/setup",
  "src/modules/setup.*",
  "src/modules/*/setup",
  "src/modules/*/setup.*",
];
const relativeModuleSetupImportPatterns = [
  {
    regex: String.raw`^(?:\.\./)+(?:[^/]+/)?setup(?:\.[^/]+)?$`,
  },
];

const eslintConfig = defineConfig([
  ...fixupConfigRules(nextVitals),
  ...fixupConfigRules(nextTs),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: deprecatedFeatureImportPatterns,
        },
      ],
    },
  },
  {
    files: ["src/modules/*/{application,domain,infrastructure,presentation}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...deprecatedFeatureImportPatterns,
                ...moduleSetupImportPatterns,
              ],
            },
            ...relativeModuleSetupImportPatterns,
          ],
        },
      ],
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "src/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    ignores: [
      "components/ui/**/*.{ts,tsx}",
      "src/modules/**/infrastructure/**/*.{ts,tsx}"
    ],
    plugins: {
      "no-eslint-disable": noEslintDisable,
      "no-magic": noMagic,
    },
    rules: {
      "@typescript-eslint/no-magic-numbers": ["error", recommendedMagicNumberOptions],
      "no-eslint-disable/no-eslint-disable": "error",
      "no-magic/no-magic-strings": "error",
    },
  },
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

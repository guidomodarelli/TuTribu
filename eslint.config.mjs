import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

import noMagicNumbers from "./eslint/rules/no-magic-numbers.mjs";
import noMagicStrings from "./eslint/rules/no-magic-strings.mjs";

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
  ...nextVitals,
  ...nextTs,
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
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "src/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    ignores: [
      "components/ui/**/*.{ts,tsx}",
      "src/modules/auth/infrastructure/better-auth/auth.ts",
      "src/modules/communities/infrastructure/repositories/postgres-community-read-repository.ts",
      "src/modules/communities/infrastructure/repositories/postgres-community-creator-whitelist-repository.ts",
      "src/modules/communities/infrastructure/repositories/postgres-community-creation-repository.ts",
      "src/modules/shared/infrastructure/database/schema.ts",
      "src/modules/shared/infrastructure/database/server-database-client.ts",
    ],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      local: {
        rules: {
          "no-magic-numbers": noMagicNumbers,
          "no-magic-strings": noMagicStrings,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "local/no-magic-numbers": "error",
      "local/no-magic-strings": "error",
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

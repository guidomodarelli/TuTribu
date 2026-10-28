import { createEslintConfig } from "@golfo/lint/eslint";

/**
 * Imports only TuTribu forbids: `@golfo/ui` components outside the UI provider and the modules (they may use its hooks
 * and Next.js helpers), and the Siteping widget inside its own module, which renders it through the provider.
 */
const GOLFO_UI_COMPONENTS = ["@golfo/ui/*", "!@golfo/ui/hooks", "!@golfo/ui/next"];

/** Generated output, build adapters and agent files, which nobody edits by hand. */
const IGNORED_PATHS = [".next/**", "out/**", "build/**", "next-env.d.ts", ".open-next/**", "cloudflare/**", ".claude/**"];

export default [
  // `pnpm run lint` runs `golfo-lint lint`, which runs this config with `bun lint`.
  ...createEslintConfig({ tsconfigRootDir: import.meta.dirname, linter: "bun", react: true, next: true, vitest: true }),
  { ignores: IGNORED_PATHS },
  {
    files: [
      "components/providers/app-providers/app-ui-provider.tsx",
      "src/modules/*/{application,domain,infrastructure,presentation}/**/*.{ts,tsx}",
    ],
    rules: { "no-restricted-imports": ["error", { patterns: GOLFO_UI_COMPONENTS }] },
  },
  {
    files: ["src/modules/siteping/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [...GOLFO_UI_COMPONENTS, "@siteping/widget"] }] },
  },
];

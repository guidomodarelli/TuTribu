import { createEslintConfig } from "@golfo/lint/eslint";

/**
 * Imports TuTribu forbids everywhere: the deprecated `src/features` layer, the old local UI kit and `@golfo/ui`
 * subpaths other than its hooks (components come from the `@golfo/ui` entry point).
 */
const FORBIDDEN_IMPORTS = ["@/src/features/*", "src/features/*", "@/components/ui/*", "@golfo/ui/*", "!@golfo/ui/hooks"];

/** Composition roots (`setup`), which only the app wiring may import, never the modules' own layers. */
const MODULE_SETUP_IMPORTS = [
  "@/src/modules/setup",
  "@/src/modules/setup.*",
  "@/src/modules/*/setup",
  "@/src/modules/*/setup.*",
  "src/modules/setup",
  "src/modules/setup.*",
  "src/modules/*/setup",
  "src/modules/*/setup.*",
];

/** Relative imports of a `setup` file from inside a module. */
const RELATIVE_SETUP_IMPORT = { regex: String.raw`^(?:\.\./)+(?:[^/]+/)?setup(?:\.[^/]+)?$` };

/** Each override repeats the shared patterns because flat config replaces rule options instead of merging them. */
const restrictImports = (patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

/** Generated output, build adapters and agent files, which nobody edits by hand. */
const IGNORED_PATHS = [".next/**", "out/**", "build/**", "next-env.d.ts", ".open-next/**", "cloudflare/**", ".claude/**"];

export default [
  // `pnpm run lint` runs `golfo-lint lint`, which runs this config with `bun lint`.
  ...createEslintConfig({ tsconfigRootDir: import.meta.dirname, linter: "bun", react: true, next: true, vitest: true }),
  { ignores: IGNORED_PATHS },
  { files: ["**/*.{ts,tsx}"], rules: restrictImports(FORBIDDEN_IMPORTS) },
  {
    files: ["components/providers/app-providers/app-ui-provider.tsx"],
    rules: restrictImports([...FORBIDDEN_IMPORTS, "!@golfo/ui/next"]),
  },
  {
    files: ["src/modules/*/{application,domain,infrastructure,presentation}/**/*.{ts,tsx}"],
    rules: restrictImports([{ group: [...FORBIDDEN_IMPORTS, ...MODULE_SETUP_IMPORTS] }, RELATIVE_SETUP_IMPORT]),
  },
  {
    files: ["src/modules/siteping/**/*.{ts,tsx}"],
    rules: restrictImports([
      { group: [...FORBIDDEN_IMPORTS, ...MODULE_SETUP_IMPORTS, "@siteping/widget"] },
      RELATIVE_SETUP_IMPORT,
    ]),
  },
];

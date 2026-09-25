/**
 * Pre-commit checks run by Husky (`.husky/pre-commit`) through lint-staged.
 *
 * The hook stays focused on what the commit touches so it remains fast enough
 * for every commit. The full repository gate (`pnpm run ci`, which also runs
 * the whole Vitest suite and `next build`) runs in the Husky `pre-push` hook.
 *
 * lint-staged ignores deleted files, so deletion-only migration commits are
 * covered by `scripts/pre-commit-migration-guardrails.mjs`, which shares the
 * guardrail filters below.
 */

import { MIGRATION_GUARDRAIL_TEST_FILTERS } from "./scripts/pre-commit-migration-guardrails.mjs";

const SCRIPT_FILE_PATTERN = "*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}";
const TYPED_FILE_PATTERN = "*.{ts,tsx,mts,cts}";
const MIGRATION_FILE_PATTERN = "database/migrations/**";

export default {
  // lint-staged appends the staged file paths to string commands.
  [SCRIPT_FILE_PATTERN]: [
    "eslint --no-warn-ignored",
    "vitest related --run --passWithNoTests",
  ],
  // Type checks are project-wide, so they run once without file arguments.
  [TYPED_FILE_PATTERN]: () => [
    "pnpm run typecheck",
    "pnpm run typecheck:tests",
  ],
  [MIGRATION_FILE_PATTERN]: () =>
    `vitest run ${MIGRATION_GUARDRAIL_TEST_FILTERS.join(" ")}`,
};

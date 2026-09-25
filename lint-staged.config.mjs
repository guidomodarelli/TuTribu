/**
 * Pre-commit checks run by Husky (`.husky/pre-commit`) through lint-staged.
 *
 * The hook stays focused on what the commit touches so it remains fast enough
 * for every commit. The full repository gate (`pnpm run ci`, which also runs
 * the whole Vitest suite and `next build`) runs in the Husky `pre-push` hook.
 *
 * SQL migrations have no task here: lint-staged ignores deleted files and runs
 * in the live checkout, so `scripts/pre-commit-migration-guardrails.mjs` (run
 * by the same hook) validates every staged migration change once, against a
 * snapshot of the staged index.
 *
 * The TypeScript task below never matches a commit that only deletes
 * TypeScript files, for the same reason: lint-staged ignores deleted files.
 * `scripts/pre-commit-typescript-deletions.mjs` (run by the same hook) runs the
 * same type-check scripts for those commits against the staged snapshot, and
 * skips them when this task already ran for other staged TypeScript changes.
 */

import { TYPE_CHECK_SCRIPT_NAMES } from "./scripts/pre-commit-typescript-deletions.mjs";

const SCRIPT_FILE_PATTERN = "*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}";
const TYPED_FILE_PATTERN = "*.{ts,tsx,mts,cts}";

export default {
  // lint-staged appends the staged file paths to string commands.
  [SCRIPT_FILE_PATTERN]: [
    "eslint --no-warn-ignored",
    "vitest related --run --passWithNoTests",
  ],
  // Type checks are project-wide, so they run once without file arguments.
  [TYPED_FILE_PATTERN]: () =>
    TYPE_CHECK_SCRIPT_NAMES.map((scriptName) => `pnpm run ${scriptName}`),
};

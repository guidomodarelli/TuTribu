#!/usr/bin/env node
/**
 * Runs the SQL migration guardrail suites from the Husky `pre-commit` hook
 * whenever a commit adds, modifies or deletes files under `database/migrations`.
 *
 * This script is the only owner of the migration guardrails in `pre-commit`;
 * lint-staged has no `database/migrations/**` task. lint-staged discovers
 * staged files with `--diff-filter=ACMR`, so it never sees a deleted migration,
 * and it runs its tasks in the live checkout, where an untracked file that
 * recreates a deleted migration would still be visible. This script reads the
 * same index Git is committing (it keeps `GIT_INDEX_FILE`, which Git sets for
 * partial commits) and runs the guardrails once for any staged migration change.
 *
 * The suites run against a temporary export of that index (`git checkout-index`)
 * instead of the live checkout, so an untracked file recreating a deleted
 * migration or an unstaged edit cannot make the check pass for content that is
 * not being committed. The snapshot reuses `node_modules` through a link and is
 * always removed, including on failure or interruption. The staged-diff and
 * snapshot helpers live in `scripts/staged-index.mjs`, shared with
 * `scripts/pre-commit-typescript-deletions.mjs`.
 *
 * Usage (from `.husky/pre-commit`, after lint-staged):
 *   node scripts/pre-commit-migration-guardrails.mjs
 *
 * @module pre-commit-migration-guardrails
 */

import { spawn } from "node:child_process";
import path from "node:path";

import { buildRepositoryIndependentEnvironment } from "./pre-push-gate.mjs";
import {
  DIFF_FILTER,
  NODE_MODULES_DIRECTORY,
  createStagedSnapshot,
  listStagedPaths,
  removeStagedSnapshot,
  runInStagedSnapshot,
} from "./staged-index.mjs";

export { createStagedSnapshot, removeStagedSnapshot };

/** Directory that holds the versioned SQL migrations. */
export const MIGRATION_DIRECTORY = "database/migrations";

/** Vitest file-name filters for the suites that guard SQL migrations. */
export const MIGRATION_GUARDRAIL_TEST_FILTERS = [
  "sql-guardrails",
  "migration-guardrails",
  "migration-rls",
  "push-migrations-script",
  "dropped-column-references",
];

/** Log prefix that identifies the script output inside the commit transcript. */
const LOG_PREFIX = "[pre-commit-migration-guardrails]";

/** Vitest CLI entry point inside the linked `node_modules`. */
const VITEST_ENTRY_SEGMENTS = [NODE_MODULES_DIRECTORY, "vitest", "vitest.mjs"];

/**
 * Splits the staged migration changes into deletions and other changes.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for Git; defaults to
 *   the hook environment so `GIT_INDEX_FILE` still selects the commit index.
 * @returns {{ deletedPaths: string[], nonDeletedPaths: string[] }}
 */
export function listStagedMigrationChanges(
  repositoryRoot,
  environment = process.env
) {
  return {
    deletedPaths: listStagedPaths(
      repositoryRoot,
      DIFF_FILTER.deleted,
      [MIGRATION_DIRECTORY],
      environment
    ),
    nonDeletedPaths: listStagedPaths(
      repositoryRoot,
      DIFF_FILTER.nonDeleted,
      [MIGRATION_DIRECTORY],
      environment
    ),
  };
}

/**
 * Decides whether this script must run the guardrails: any staged migration
 * change, including mixed commits that delete one migration and add or modify
 * another, is validated from the staged snapshot.
 *
 * @param {{ deletedPaths: string[], nonDeletedPaths: string[] }} changes
 * @returns {boolean} `true` when the commit touches the migrations.
 */
export function shouldRunMigrationGuardrails({ deletedPaths, nonDeletedPaths }) {
  return deletedPaths.length > 0 || nonDeletedPaths.length > 0;
}

/**
 * Runs the migration guardrail suites with inherited stdio.
 *
 * @param {string} snapshotPath - Staged snapshot the suites run against.
 * @returns {Promise<number>} Vitest exit code (non-zero when killed).
 */
function runGuardrailSuites(snapshotPath) {
  return new Promise((resolve, reject) => {
    // Vitest runs through Node directly: `pnpm exec` inside the snapshot sees a
    // different project path and reinstalls into the linked `node_modules`.
    const child = spawn(
      process.execPath,
      [
        path.join(snapshotPath, ...VITEST_ENTRY_SEGMENTS),
        "run",
        ...MIGRATION_GUARDRAIL_TEST_FILTERS,
      ],
      {
        cwd: snapshotPath,
        // Fixture repositories inside the suites must not inherit the hook's Git vars.
        env: buildRepositoryIndependentEnvironment(),
        stdio: ["ignore", "inherit", "inherit"],
      }
    );

    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
}

/**
 * Entry point: runs the guardrails for commits that touch the migrations.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const repositoryRoot = process.cwd();
  const changes = listStagedMigrationChanges(repositoryRoot);

  if (!shouldRunMigrationGuardrails(changes)) {
    return;
  }

  console.log(
    `${LOG_PREFIX} ${changes.deletedPaths.length} staged migration deletion(s) and ${changes.nonDeletedPaths.length} other staged migration change(s); running the migration guardrail suites against the staged snapshot`
  );
  const exitCode = await runInStagedSnapshot(repositoryRoot, runGuardrailSuites);

  if (exitCode !== 0) {
    console.error(
      `${LOG_PREFIX} the migration guardrail suites failed with exit code ${exitCode}; the commit was not created`
    );
    process.exitCode = 1;
  }
}

if ((process.argv[1] ?? "").endsWith("pre-commit-migration-guardrails.mjs")) {
  main().catch((guardrailsError) => {
    console.error(`${LOG_PREFIX} failed unexpectedly`, guardrailsError);
    process.exitCode = 1;
  });
}

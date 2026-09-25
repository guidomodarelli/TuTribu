#!/usr/bin/env node
/**
 * Runs the SQL migration guardrail suites from the Husky `pre-commit` hook when
 * a commit only deletes files under `database/migrations`.
 *
 * lint-staged discovers staged files with `--diff-filter=ACMR`, so a deleted
 * migration never matches its `database/migrations/**` task. This script reads
 * the same index Git is committing (it keeps `GIT_INDEX_FILE`, which Git sets
 * for partial commits) and runs the guardrails when deletions are staged and
 * no added or modified migration already made lint-staged run them.
 *
 * Usage (from `.husky/pre-commit`, after lint-staged):
 *   node scripts/pre-commit-migration-guardrails.mjs
 *
 * @module pre-commit-migration-guardrails
 */

import { spawn, spawnSync } from "node:child_process";

import { buildRepositoryIndependentEnvironment } from "./pre-push-gate.mjs";

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

/** Git diff filters for staged deletions and for every other staged change. */
const DIFF_FILTER = {
  deleted: "D",
  nonDeleted: "ACMRT",
};

/** Log prefix that identifies the script output inside the commit transcript. */
const LOG_PREFIX = "[pre-commit-migration-guardrails]";

/**
 * Lists staged paths under the migration directory for one diff filter.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {string} diffFilter - Value for `git diff --diff-filter`.
 * @param {NodeJS.ProcessEnv} environment - Environment for Git.
 * @returns {string[]} Repository-relative paths.
 * @throws {Error} When Git exits with a non-zero status.
 */
function listStagedPaths(repositoryRoot, diffFilter, environment) {
  const diffArguments = [
    "diff",
    "--cached",
    "--name-only",
    "--no-renames",
    `--diff-filter=${diffFilter}`,
    "--",
    MIGRATION_DIRECTORY,
  ];
  const result = spawnSync("git", diffArguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });

  if (result.status !== 0) {
    throw new Error(
      `pre-commit-migration-guardrails:listStagedPaths failed for "git ${diffArguments.join(" ")}" with status ${result.status}: ${(result.stderr ?? "").trim()}`,
      { cause: result.error }
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .map((stagedPath) => stagedPath.trim())
    .filter((stagedPath) => stagedPath.length > 0);
}

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
    deletedPaths: listStagedPaths(repositoryRoot, DIFF_FILTER.deleted, environment),
    nonDeletedPaths: listStagedPaths(
      repositoryRoot,
      DIFF_FILTER.nonDeleted,
      environment
    ),
  };
}

/**
 * Decides whether this script must run the guardrails. Mixed changes are left
 * to lint-staged, which already runs them for the non-deleted paths.
 *
 * @param {{ deletedPaths: string[], nonDeletedPaths: string[] }} changes
 * @returns {boolean} `true` when only deletions touch the migrations.
 */
export function shouldRunGuardrailsForDeletions({ deletedPaths, nonDeletedPaths }) {
  return deletedPaths.length > 0 && nonDeletedPaths.length === 0;
}

/**
 * Runs the migration guardrail suites with inherited stdio.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {Promise<number>} Vitest exit code (non-zero when killed).
 */
function runGuardrailSuites(repositoryRoot) {
  return new Promise((resolve, reject) => {
    // pnpm is a `.cmd` shim on Windows; the arguments are fixed constants.
    const child = spawn(
      "pnpm",
      ["exec", "vitest", "run", ...MIGRATION_GUARDRAIL_TEST_FILTERS],
      {
        cwd: repositoryRoot,
        // Fixture repositories inside the suites must not inherit the hook's Git vars.
        env: buildRepositoryIndependentEnvironment(),
        stdio: ["ignore", "inherit", "inherit"],
        shell: process.platform === "win32",
      }
    );

    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
}

/**
 * Entry point: runs the guardrails for deletion-only migration commits.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const repositoryRoot = process.cwd();
  const changes = listStagedMigrationChanges(repositoryRoot);

  if (!shouldRunGuardrailsForDeletions(changes)) {
    return;
  }

  console.log(
    `${LOG_PREFIX} ${changes.deletedPaths.length} staged migration deletion(s); running the migration guardrail suites`
  );
  const exitCode = await runGuardrailSuites(repositoryRoot);

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

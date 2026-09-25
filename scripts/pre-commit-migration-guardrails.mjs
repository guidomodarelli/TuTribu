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
 * The suites run against a temporary export of that index (`git checkout-index`)
 * instead of the live checkout, so an untracked file recreating a deleted
 * migration or an unstaged edit cannot make the check pass for content that is
 * not being committed. The snapshot reuses `node_modules` through a link and is
 * always removed, including on failure or interruption.
 *
 * Usage (from `.husky/pre-commit`, after lint-staged):
 *   node scripts/pre-commit-migration-guardrails.mjs
 *
 * @module pre-commit-migration-guardrails
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

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

/** Prefix of the temporary directories that hold the staged snapshot. */
const SNAPSHOT_DIRECTORY_PREFIX = "tutribu-pre-commit-";

/** Dependency directory reused by the snapshot through a link. */
const NODE_MODULES_DIRECTORY = "node_modules";

/** Vitest CLI entry point inside the linked `node_modules`. */
const VITEST_ENTRY_SEGMENTS = [NODE_MODULES_DIRECTORY, "vitest", "vitest.mjs"];

/** Junctions need no elevated privileges on Windows; `dir` is ignored elsewhere. */
const DIRECTORY_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

/** Exit code reported when the hook is interrupted by a signal. */
const INTERRUPTED_EXIT_CODE = 130;

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
 * Exports the index Git is committing into a new temporary directory, so the
 * guardrails see exactly the committed tree: untracked files that recreate a
 * deleted path and unstaged edits stay out of the snapshot. The installed
 * `node_modules` is linked (a junction on Windows) instead of reinstalled.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for Git; defaults to
 *   the hook environment so `GIT_INDEX_FILE` still selects the commit index.
 * @returns {string} Absolute path of the snapshot directory.
 * @throws {Error} When Git cannot export the index; the partial snapshot is removed.
 */
export function createStagedSnapshot(repositoryRoot, environment = process.env) {
  const snapshotPath = mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_DIRECTORY_PREFIX));

  try {
    const exportArguments = [
      "checkout-index",
      "--all",
      "--force",
      `--prefix=${snapshotPath}${path.sep}`,
    ];
    const exportResult = spawnSync("git", exportArguments, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
    });

    if (exportResult.status !== 0) {
      throw new Error(
        `pre-commit-migration-guardrails:createStagedSnapshot failed for "git ${exportArguments.join(" ")}" with status ${exportResult.status}: ${(exportResult.stderr ?? "").trim()}`,
        { cause: exportResult.error }
      );
    }

    const installedModulesPath = path.join(repositoryRoot, NODE_MODULES_DIRECTORY);

    if (existsSync(installedModulesPath)) {
      symlinkSync(
        installedModulesPath,
        path.join(snapshotPath, NODE_MODULES_DIRECTORY),
        DIRECTORY_LINK_TYPE
      );
    }
  } catch (snapshotError) {
    removeStagedSnapshot(snapshotPath);
    throw snapshotError;
  }

  return snapshotPath;
}

/**
 * Removes a snapshot created by {@link createStagedSnapshot}. The
 * `node_modules` link is unlinked first so the recursive removal never walks
 * into the real installation it points to.
 *
 * @param {string} snapshotPath - Snapshot directory to delete.
 * @returns {void}
 */
export function removeStagedSnapshot(snapshotPath) {
  const linkedModulesPath = path.join(snapshotPath, NODE_MODULES_DIRECTORY);

  if (lstatSync(linkedModulesPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    unlinkSync(linkedModulesPath);
  }

  rmSync(snapshotPath, { recursive: true, force: true });
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
    `${LOG_PREFIX} ${changes.deletedPaths.length} staged migration deletion(s); running the migration guardrail suites against the staged snapshot`
  );
  const snapshotPath = createStagedSnapshot(repositoryRoot);
  const handleInterruption = () => {
    removeStagedSnapshot(snapshotPath);
    process.exit(INTERRUPTED_EXIT_CODE);
  };
  process.on("SIGINT", handleInterruption);
  process.on("SIGTERM", handleInterruption);

  let exitCode;

  try {
    exitCode = await runGuardrailSuites(snapshotPath);
  } finally {
    removeStagedSnapshot(snapshotPath);
    process.off("SIGINT", handleInterruption);
    process.off("SIGTERM", handleInterruption);
  }

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

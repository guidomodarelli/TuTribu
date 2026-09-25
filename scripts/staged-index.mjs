/**
 * Shared helpers for the Husky `pre-commit` scripts that must validate the
 * index Git is committing instead of the live checkout.
 *
 * lint-staged discovers staged files with `--diff-filter=ACMR`, so it never
 * sees a deleted file, and it runs its tasks in the live checkout, where an
 * untracked file that recreates a deleted path is still visible. These helpers
 * list staged paths with `git diff --cached` (keeping `GIT_INDEX_FILE`, which
 * Git sets for partial commits) and export that index to a temporary snapshot
 * (`git checkout-index`) that reuses `node_modules` through a link.
 *
 * @module staged-index
 */

import { spawnSync } from "node:child_process";
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

/** Git diff filters for staged deletions and for every other staged change. */
export const DIFF_FILTER = {
  deleted: "D",
  nonDeleted: "ACMRT",
};

/** Prefix of the temporary directories that hold the staged snapshot. */
const SNAPSHOT_DIRECTORY_PREFIX = "tutribu-pre-commit-";

/** Dependency directory reused by the snapshot through a link. */
export const NODE_MODULES_DIRECTORY = "node_modules";

/** Junctions need no elevated privileges on Windows; `dir` is ignored elsewhere. */
const DIRECTORY_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

/** Exit code reported when the hook is interrupted by a signal. */
const INTERRUPTED_EXIT_CODE = 130;

/**
 * Lists staged paths for one diff filter, optionally limited to pathspecs.
 * Renames are reported as a deletion plus an addition.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {string} diffFilter - Value for `git diff --diff-filter`.
 * @param {string[]} pathspecs - Pathspecs that limit the diff; empty for all.
 * @param {NodeJS.ProcessEnv} environment - Environment for Git.
 * @returns {string[]} Repository-relative paths.
 * @throws {Error} When Git exits with a non-zero status.
 */
export function listStagedPaths(repositoryRoot, diffFilter, pathspecs, environment) {
  const diffArguments = [
    "diff",
    "--cached",
    "--name-only",
    "--no-renames",
    `--diff-filter=${diffFilter}`,
    "--",
    ...pathspecs,
  ];
  const result = spawnSync("git", diffArguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });

  if (result.status !== 0) {
    throw new Error(
      `staged-index:listStagedPaths failed for "git ${diffArguments.join(" ")}" with status ${result.status}: ${(result.stderr ?? "").trim()}`,
      { cause: result.error }
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .map((stagedPath) => stagedPath.trim())
    .filter((stagedPath) => stagedPath.length > 0);
}

/**
 * Exports the index Git is committing into a new temporary directory, so a
 * check sees exactly the committed tree: untracked files that recreate a
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
        `staged-index:createStagedSnapshot failed for "git ${exportArguments.join(" ")}" with status ${exportResult.status}: ${(exportResult.stderr ?? "").trim()}`,
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
 * Creates a staged snapshot, runs `check` against it and always removes the
 * snapshot, including on failure or on `SIGINT`/`SIGTERM`.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {(snapshotPath: string) => Promise<number>} check - Check to run;
 *   resolves with its exit code.
 * @returns {Promise<number>} Exit code returned by `check`.
 */
export async function runInStagedSnapshot(repositoryRoot, check) {
  const snapshotPath = createStagedSnapshot(repositoryRoot);
  const handleInterruption = () => {
    removeStagedSnapshot(snapshotPath);
    process.exit(INTERRUPTED_EXIT_CODE);
  };
  process.on("SIGINT", handleInterruption);
  process.on("SIGTERM", handleInterruption);

  try {
    return await check(snapshotPath);
  } finally {
    removeStagedSnapshot(snapshotPath);
    process.off("SIGINT", handleInterruption);
    process.off("SIGTERM", handleInterruption);
  }
}

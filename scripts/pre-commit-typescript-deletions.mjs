#!/usr/bin/env node
/**
 * Runs the project-wide type checks from the Husky `pre-commit` hook when a
 * commit deletes TypeScript files (`.ts`, `.tsx`, `.mts`, `.cts`) and stages no
 * other TypeScript change.
 *
 * lint-staged discovers staged files with `--diff-filter=ACMR`, so a commit that
 * only deletes a TypeScript file never matches its TypeScript task and neither
 * `typecheck` nor `typecheck:tests` runs, even when another file still imports
 * the deleted module. This script reads the index Git is committing with
 * `git diff --cached` (keeping `GIT_INDEX_FILE`) and, for those commits, runs
 * both scripts against a temporary export of that index, so an untracked file
 * that recreates the deleted path cannot make the check pass.
 *
 * When the commit also adds, modifies or renames a TypeScript file, lint-staged
 * already ran both type checks and this script skips them to avoid running them
 * twice. Those lint-staged runs use the live checkout (with unstaged edits
 * hidden, but untracked files visible); the `pre-push` gate, which requires a
 * working tree without untracked files, covers that remaining case.
 *
 * Usage (from `.husky/pre-commit`, after lint-staged):
 *   node scripts/pre-commit-typescript-deletions.mjs
 *
 * @module pre-commit-typescript-deletions
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildRepositoryIndependentEnvironment } from "./pre-push-gate.mjs";
import {
  DIFF_FILTER,
  NODE_MODULES_DIRECTORY,
  listStagedPaths,
  runInStagedSnapshot,
} from "./staged-index.mjs";

/** Package scripts that type-check the whole project, in execution order. */
export const TYPE_CHECK_SCRIPT_NAMES = ["typecheck", "typecheck:tests"];

/** File extensions that the type checks compile. */
const TYPESCRIPT_FILE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

/** Log prefix that identifies the script output inside the commit transcript. */
const LOG_PREFIX = "[pre-commit-typescript-deletions]";

/** Name of the environment variable that lists executable directories. */
const PATH_VARIABLE_NAME = "PATH";

/**
 * Tells whether a repository-relative path is a TypeScript source file.
 *
 * @param {string} filePath - Repository-relative path.
 * @returns {boolean} `true` for `.ts`, `.tsx`, `.mts` and `.cts` files.
 */
function isTypeScriptPath(filePath) {
  return TYPESCRIPT_FILE_EXTENSIONS.includes(path.extname(filePath));
}

/**
 * Splits the staged TypeScript changes into deletions and other changes.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for Git; defaults to
 *   the hook environment so `GIT_INDEX_FILE` still selects the commit index.
 * @returns {{ deletedPaths: string[], nonDeletedPaths: string[] }}
 */
export function listStagedTypeScriptChanges(repositoryRoot, environment = process.env) {
  return {
    deletedPaths: listStagedPaths(
      repositoryRoot,
      DIFF_FILTER.deleted,
      [],
      environment
    ).filter(isTypeScriptPath),
    nonDeletedPaths: listStagedPaths(
      repositoryRoot,
      DIFF_FILTER.nonDeleted,
      [],
      environment
    ).filter(isTypeScriptPath),
  };
}

/**
 * Decides whether this script must run the type checks: only when the commit
 * deletes TypeScript files and lint-staged did not already run them for other
 * staged TypeScript changes.
 *
 * @param {{ deletedPaths: string[], nonDeletedPaths: string[] }} changes
 * @returns {boolean} `true` when the deletions would otherwise go unchecked.
 */
export function shouldRunTypeChecksForDeletions({ deletedPaths, nonDeletedPaths }) {
  return deletedPaths.length > 0 && nonDeletedPaths.length === 0;
}

/**
 * Builds the environment for a package script inside the snapshot: no Git
 * repository variables, and the linked `node_modules/.bin` first in `PATH`.
 *
 * @param {string} snapshotPath - Staged snapshot directory.
 * @returns {NodeJS.ProcessEnv} Environment for the script.
 */
function buildSnapshotScriptEnvironment(snapshotPath) {
  const environment = buildRepositoryIndependentEnvironment();
  // Windows exposes the variable as `Path`; keep whichever spelling exists.
  const pathVariableName =
    Object.keys(environment).find(
      (variableName) => variableName.toUpperCase() === PATH_VARIABLE_NAME
    ) ?? PATH_VARIABLE_NAME;
  const binariesPath = path.join(snapshotPath, NODE_MODULES_DIRECTORY, ".bin");
  environment[pathVariableName] = [binariesPath, environment[pathVariableName]]
    .filter(Boolean)
    .join(path.delimiter);

  return environment;
}

/**
 * Runs one `package.json` script of the snapshot with inherited stdio. The
 * command is read from the staged `package.json` and run through the shell
 * directly: `pnpm run` inside the snapshot sees a different project path and
 * would reinstall into the linked `node_modules`.
 *
 * @param {string} snapshotPath - Staged snapshot directory.
 * @param {string} scriptName - Script to run.
 * @returns {Promise<number>} Script exit code (non-zero when killed).
 * @throws {Error} When the staged `package.json` does not define the script.
 */
function runSnapshotPackageScript(snapshotPath, scriptName) {
  const packageManifest = JSON.parse(
    readFileSync(path.join(snapshotPath, "package.json"), "utf8")
  );
  const command = packageManifest.scripts?.[scriptName];

  if (typeof command !== "string" || command.length === 0) {
    return Promise.reject(
      new Error(
        `pre-commit-typescript-deletions:runSnapshotPackageScript found no "${scriptName}" script in the staged package.json`
      )
    );
  }

  console.log(`${LOG_PREFIX} $ ${command}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: snapshotPath,
      env: buildSnapshotScriptEnvironment(snapshotPath),
      shell: true,
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
}

/**
 * Runs every type-check script against the snapshot, stopping at the first
 * failure.
 *
 * @param {string} snapshotPath - Staged snapshot directory.
 * @returns {Promise<number>} First non-zero exit code, or `0`.
 */
async function runTypeChecks(snapshotPath) {
  for (const scriptName of TYPE_CHECK_SCRIPT_NAMES) {
    const exitCode = await runSnapshotPackageScript(snapshotPath, scriptName);

    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

/**
 * Entry point: type-checks commits whose only TypeScript changes are deletions.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const repositoryRoot = process.cwd();
  const changes = listStagedTypeScriptChanges(repositoryRoot);

  if (!shouldRunTypeChecksForDeletions(changes)) {
    return;
  }

  console.log(
    `${LOG_PREFIX} ${changes.deletedPaths.length} staged TypeScript deletion(s) and no other staged TypeScript change; running ${TYPE_CHECK_SCRIPT_NAMES.join(" and ")} against the staged snapshot`
  );
  const exitCode = await runInStagedSnapshot(repositoryRoot, runTypeChecks);

  if (exitCode !== 0) {
    console.error(
      `${LOG_PREFIX} the type checks failed with exit code ${exitCode} for the staged deletion(s) ${changes.deletedPaths.join(", ")}; the commit was not created`
    );
    process.exitCode = 1;
  }
}

if ((process.argv[1] ?? "").endsWith("pre-commit-typescript-deletions.mjs")) {
  main().catch((typeChecksError) => {
    console.error(`${LOG_PREFIX} failed unexpectedly`, typeChecksError);
    process.exitCode = 1;
  });
}

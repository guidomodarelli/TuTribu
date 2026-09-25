#!/usr/bin/env node
/**
 * Pre-push quality gate invoked by the Husky `pre-push` hook.
 *
 * Git passes one line per pushed ref on stdin:
 * `<local ref> <local oid> <remote ref> <remote oid>`. The gate validates the
 * exact commits being uploaded instead of the current working tree:
 *
 * - ref deletions (local oid made of zeros) are skipped;
 * - every distinct local oid runs `pnpm run ci` once;
 * - when the oid is `HEAD` and the working tree has no tracked, staged or
 *   untracked changes, the gate runs in place (the checkout already matches
 *   the commit);
 * - otherwise the oid is checked out in a detached temporary worktree, the
 *   local `.env*` files are copied into it, dependencies are installed from
 *   the frozen lockfile reusing the pnpm store, and `pnpm run ci` runs there.
 *   The worktree is always removed, including on failure or interruption.
 *
 * Usage (from `.husky/pre-push`):
 *   node scripts/pre-push-gate.mjs < <git pre-push stdin>
 *
 * @module pre-push-gate
 */

import { spawn, spawnSync } from "node:child_process";
import {
  constants as fsConstants,
  copyFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/** Git's all-zero object id, used for deleted or missing refs. */
const ZERO_OID_PATTERN = /^0+$/;

/** Number of whitespace-separated fields in a pre-push stdin line. */
const PUSH_LINE_FIELD_COUNT = 4;

/** Local environment files copied into the temporary worktree. */
const ENVIRONMENT_FILE_PATTERN = /^\.env(\..+)?$/;

/** Prefix of the temporary worktree directories created by the gate. */
const WORKTREE_DIRECTORY_PREFIX = "tutribu-pre-push-";

/** Log prefix that identifies the gate output inside the push transcript. */
const LOG_PREFIX = "[pre-push-gate]";

/** Exit code reported when the gate is interrupted by a signal. */
const INTERRUPTED_EXIT_CODE = 130;

/** Validation strategies for a pushed commit. */
export const VALIDATION_STRATEGY = {
  inPlace: "in-place",
  worktree: "worktree",
};

/** Commands run for each validated commit. */
export const GATE_COMMANDS = {
  install: ["install", "--frozen-lockfile", "--prefer-offline"],
  ci: ["run", "ci"],
};

/**
 * Parses the pre-push stdin payload into pushed ref updates.
 *
 * @param {string} stdinText - Raw stdin text supplied by Git.
 * @returns {{ localRef: string, localOid: string, remoteRef: string, remoteOid: string }[]}
 *   One entry per well-formed line.
 * @throws {Error} When a non-empty line does not have the four expected fields.
 */
export function parsePushedRefs(stdinText) {
  return stdinText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields = line.split(/\s+/);

      if (fields.length !== PUSH_LINE_FIELD_COUNT) {
        throw new Error(
          `pre-push-gate:parsePushedRefs received a malformed line with ${fields.length} fields (expected ${PUSH_LINE_FIELD_COUNT})`
        );
      }

      const [localRef, localOid, remoteRef, remoteOid] = fields;

      return { localRef, localOid, remoteRef, remoteOid };
    });
}

/**
 * Returns whether an object id is Git's all-zero id.
 *
 * @param {string} oid - Object id to inspect.
 * @returns {boolean} `true` for deleted or missing refs.
 */
export function isZeroOid(oid) {
  return ZERO_OID_PATTERN.test(oid);
}

/**
 * Selects the distinct commits that must be validated, skipping deletions.
 *
 * @param {ReturnType<typeof parsePushedRefs>} pushedRefs - Parsed ref updates.
 * @returns {{ oid: string, refs: string[] }[]} Commits in first-seen order with
 *   the local refs that point to each one.
 */
export function selectCommitsToValidate(pushedRefs) {
  const commitsByOid = new Map();

  for (const pushedRef of pushedRefs) {
    if (isZeroOid(pushedRef.localOid)) {
      continue;
    }

    const existingCommit = commitsByOid.get(pushedRef.localOid);

    if (existingCommit) {
      existingCommit.refs.push(pushedRef.localRef);
    } else {
      commitsByOid.set(pushedRef.localOid, {
        oid: pushedRef.localOid,
        refs: [pushedRef.localRef],
      });
    }
  }

  return [...commitsByOid.values()];
}

/**
 * Decides whether a commit can be validated in the current checkout.
 *
 * @param {{ oid: string, headOid: string, isWorkingTreeClean: boolean }} options
 * @returns {string} One of {@link VALIDATION_STRATEGY}.
 */
export function resolveValidationStrategy({ oid, headOid, isWorkingTreeClean }) {
  return oid === headOid && isWorkingTreeClean
    ? VALIDATION_STRATEGY.inPlace
    : VALIDATION_STRATEGY.worktree;
}

/**
 * Returns a copy of the environment without Git's repository-local variables
 * (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`, ...). Git exports them to
 * hooks; leaking them into `git -C <worktree>` calls or into `pnpm run ci`
 * would make nested Git commands (including test fixtures) operate on the
 * pushing repository instead of their own working directory.
 *
 * @param {NodeJS.ProcessEnv} [environment] - Source environment.
 * @returns {NodeJS.ProcessEnv} Environment safe for child processes.
 */
export function buildRepositoryIndependentEnvironment(environment = process.env) {
  const localVariables = spawnSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  });

  if (localVariables.status !== 0) {
    throw new Error(
      `pre-push-gate:buildRepositoryIndependentEnvironment could not list Git local env vars (status ${localVariables.status})`,
      { cause: localVariables.error }
    );
  }

  const sanitizedEnvironment = { ...environment };

  for (const variableName of localVariables.stdout.split(/\r?\n/)) {
    if (variableName.length > 0) {
      delete sanitizedEnvironment[variableName];
    }
  }

  return sanitizedEnvironment;
}

/**
 * Runs a Git command synchronously and returns its trimmed stdout.
 *
 * @param {string[]} gitArguments - Arguments passed to `git`.
 * @param {string} workingDirectory - Directory the command runs in.
 * @returns {string} Trimmed stdout.
 * @throws {Error} When Git exits with a non-zero status.
 */
function runGit(gitArguments, workingDirectory) {
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: buildRepositoryIndependentEnvironment(),
  });

  if (result.status !== 0) {
    throw new Error(
      `pre-push-gate:runGit failed for "git ${gitArguments.join(" ")}" with status ${result.status}: ${(result.stderr ?? "").trim()}`,
      { cause: result.error }
    );
  }

  return result.stdout.trim();
}

/**
 * Resolves the commit currently checked out.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {string} Full `HEAD` object id.
 */
export function resolveHeadOid(repositoryRoot) {
  return runGit(["rev-parse", "HEAD"], repositoryRoot);
}

/**
 * Returns whether the checkout has no staged, unstaged or untracked changes
 * (ignored files such as `.env*`, `node_modules` and `.next` do not count).
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {boolean} `true` when the working tree matches `HEAD`.
 */
export function isWorkingTreeClean(repositoryRoot) {
  return runGit(["status", "--porcelain"], repositoryRoot).length === 0;
}

/**
 * Creates a detached temporary worktree checked out at the given commit.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {string} oid - Commit to check out.
 * @returns {string} Absolute path of the new worktree.
 */
export function createValidationWorktree(repositoryRoot, oid) {
  const worktreePath = mkdtempSync(
    path.join(os.tmpdir(), WORKTREE_DIRECTORY_PREFIX)
  );

  try {
    runGit(["worktree", "add", "--detach", worktreePath, oid], repositoryRoot);
  } catch (worktreeError) {
    rmSync(worktreePath, { recursive: true, force: true });
    throw worktreeError;
  }

  return worktreePath;
}

/**
 * Removes a temporary worktree and its administrative metadata.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {string} worktreePath - Worktree created by {@link createValidationWorktree}.
 * @returns {void}
 */
export function removeValidationWorktree(repositoryRoot, worktreePath) {
  const removal = spawnSync(
    "git",
    ["worktree", "remove", "--force", worktreePath],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: buildRepositoryIndependentEnvironment(),
    }
  );

  if (removal.status !== 0) {
    // `git worktree remove` can fail on long Windows paths; delete the
    // directory directly and let `prune` drop the stale metadata.
    rmSync(worktreePath, { recursive: true, force: true });
  }

  spawnSync("git", ["worktree", "prune"], {
    cwd: repositoryRoot,
    env: buildRepositoryIndependentEnvironment(),
  });
}

/**
 * Copies the local `.env*` files into the worktree without overwriting.
 *
 * @param {string} repositoryRoot - Source directory holding the env files.
 * @param {string} worktreePath - Destination worktree.
 * @returns {string[]} Names of the copied files.
 */
export function copyEnvironmentFiles(repositoryRoot, worktreePath) {
  const copiedFileNames = [];

  for (const directoryEntry of readdirSync(repositoryRoot, {
    withFileTypes: true,
  })) {
    if (
      !directoryEntry.isFile() ||
      !ENVIRONMENT_FILE_PATTERN.test(directoryEntry.name)
    ) {
      continue;
    }

    try {
      copyFileSync(
        path.join(repositoryRoot, directoryEntry.name),
        path.join(worktreePath, directoryEntry.name),
        fsConstants.COPYFILE_EXCL
      );
      copiedFileNames.push(directoryEntry.name);
    } catch (copyError) {
      if (copyError?.code !== "EEXIST") {
        throw copyError;
      }
    }
  }

  return copiedFileNames;
}

/**
 * Runs a pnpm command with inherited stdio.
 *
 * @param {string[]} pnpmArguments - Arguments passed to `pnpm`.
 * @param {string} workingDirectory - Directory the command runs in.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for the child.
 * @returns {Promise<number>} Exit code (non-zero when killed by a signal).
 */
function runPnpm(pnpmArguments, workingDirectory, environment = process.env) {
  return new Promise((resolve, reject) => {
    // pnpm is a `.cmd` shim on Windows; the arguments are fixed constants.
    const child = spawn("pnpm", pnpmArguments, {
      cwd: workingDirectory,
      env: buildRepositoryIndependentEnvironment(environment),
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
}

/**
 * Validates one pushed commit and always cleans up its worktree.
 *
 * @param {{ oid: string, refs: string[] }} commit - Commit to validate.
 * @param {{ repositoryRoot: string, headOid: string, workingTreeClean: boolean, registerWorktree: (worktreePath: string | null) => void }} context
 * @returns {Promise<boolean>} `true` when `pnpm run ci` passed.
 */
async function validateCommit(commit, context) {
  const strategy = resolveValidationStrategy({
    oid: commit.oid,
    headOid: context.headOid,
    isWorkingTreeClean: context.workingTreeClean,
  });
  const refsLabel = commit.refs.join(", ");

  if (strategy === VALIDATION_STRATEGY.inPlace) {
    console.log(
      `${LOG_PREFIX} ${commit.oid} (${refsLabel}) is the clean HEAD; running pnpm run ci in place`
    );
    return (await runPnpm(GATE_COMMANDS.ci, context.repositoryRoot)) === 0;
  }

  console.log(
    `${LOG_PREFIX} ${commit.oid} (${refsLabel}) differs from the checkout; validating it in a temporary worktree`
  );
  const worktreePath = createValidationWorktree(
    context.repositoryRoot,
    commit.oid
  );
  context.registerWorktree(worktreePath);

  try {
    copyEnvironmentFiles(context.repositoryRoot, worktreePath);
    // HUSKY=0 keeps the worktree install from rewriting the shared hooks config.
    const installExitCode = await runPnpm(GATE_COMMANDS.install, worktreePath, {
      ...process.env,
      HUSKY: "0",
    });

    if (installExitCode !== 0) {
      console.error(
        `${LOG_PREFIX} pnpm install failed for ${commit.oid} with exit code ${installExitCode}`
      );
      return false;
    }

    return (await runPnpm(GATE_COMMANDS.ci, worktreePath)) === 0;
  } finally {
    removeValidationWorktree(context.repositoryRoot, worktreePath);
    context.registerWorktree(null);
  }
}

/**
 * Reads the whole stdin stream.
 *
 * @returns {Promise<string>} Stdin contents.
 */
async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Entry point: validates every pushed commit and exits non-zero on failure.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const repositoryRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());
  const commitsToValidate = selectCommitsToValidate(
    parsePushedRefs(await readStdin())
  );

  if (commitsToValidate.length === 0) {
    console.log(`${LOG_PREFIX} no pushed commits to validate`);
    return;
  }

  let activeWorktreePath = null;
  const handleInterruption = () => {
    if (activeWorktreePath) {
      removeValidationWorktree(repositoryRoot, activeWorktreePath);
    }
    process.exit(INTERRUPTED_EXIT_CODE);
  };
  process.on("SIGINT", handleInterruption);
  process.on("SIGTERM", handleInterruption);

  const context = {
    repositoryRoot,
    headOid: resolveHeadOid(repositoryRoot),
    workingTreeClean: isWorkingTreeClean(repositoryRoot),
    registerWorktree: (worktreePath) => {
      activeWorktreePath = worktreePath;
    },
  };

  for (const commit of commitsToValidate) {
    if (!(await validateCommit(commit, context))) {
      console.error(
        `${LOG_PREFIX} pnpm run ci failed for ${commit.oid} (${commit.refs.join(", ")}); the push was not sent`
      );
      process.exitCode = 1;
      return;
    }
  }
}

if ((process.argv[1] ?? "").endsWith("pre-push-gate.mjs")) {
  main().catch((gateError) => {
    console.error(`${LOG_PREFIX} failed unexpectedly`, gateError);
    process.exitCode = 1;
  });
}

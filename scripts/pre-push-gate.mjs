#!/usr/bin/env node
/**
 * Pre-push quality gate invoked by the Husky `pre-push` hook.
 *
 * Git passes one line per pushed ref on stdin:
 * `<local ref> <local oid> <remote ref> <remote oid>`. The gate validates the
 * exact commits being uploaded instead of the current working tree:
 *
 * - ref deletions (local oid made of zeros) are skipped;
 * - every distinct local oid runs `pnpm install --frozen-lockfile` and then
 *   `pnpm run ci` once; the frozen install rejects a `package.json` that
 *   drifted from `pnpm-lock.yaml` even when `node_modules` already exists;
 * - when the oid is `HEAD` and the working tree has no tracked, staged or
 *   untracked changes, the gate runs in place (the checkout already matches
 *   the commit);
 * - otherwise the oid is checked out in a detached temporary worktree and the
 *   same steps run there reusing the pnpm store. That commit may come from an
 *   untrusted ref, so no local `.env*` file is copied and both steps run with
 *   an allowlisted environment plus non-secret placeholders. The worktree is
 *   always removed, including on failure or interruption.
 *
 * Before any ref is validated the running Node.js is checked against
 * `engines.node` (blocking) and `.nvmrc` (warning only).
 *
 * Usage (from `.husky/pre-push`):
 *   node scripts/pre-push-gate.mjs < <git pre-push stdin>
 *
 * @module pre-push-gate
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/** Git's all-zero object id, used for deleted or missing refs. */
const ZERO_OID_PATTERN = /^0+$/;

/** Number of whitespace-separated fields in a pre-push stdin line. */
const PUSH_LINE_FIELD_COUNT = 4;

/**
 * Non-secret values for the application variables `next build` and the test
 * suite read, used when validating a commit in a temporary worktree. They
 * match the placeholders the former GitHub Actions gate used.
 */
export const WORKTREE_ENVIRONMENT_PLACEHOLDERS = Object.freeze({
  BETTER_AUTH_SECRET: "pre-push-gate-build-secret-with-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://ci:ci@localhost:5432/tutribu",
  GOOGLE_CLIENT_ID: "pre-push-gate-google-client-id",
  GOOGLE_CLIENT_SECRET: "pre-push-gate-google-client-secret",
});

/**
 * Operating-system, locale and tooling variables (upper-cased, because
 * Windows names are case-insensitive) that the worktree gate may inherit.
 * Anything else, including credentials exported in the shell, is dropped.
 */
const INHERITED_ENVIRONMENT_VARIABLES = new Set([
  "PATH",
  "PATHEXT",
  "HOME",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "TZ",
  "TERM",
  "COLORTERM",
  "FORCE_COLOR",
  "NO_COLOR",
  "CI",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "OS",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)",
  "COMMONPROGRAMW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PNPM_HOME",
  "COREPACK_HOME",
  "NODE_EXTRA_CA_CERTS",
]);

/** Variable families inherited by the worktree gate (locale and XDG dirs). */
const INHERITED_ENVIRONMENT_PREFIXES = ["LC_", "XDG_"];

/** Prefix of the temporary worktree directories created by the gate. */
const WORKTREE_DIRECTORY_PREFIX = "tutribu-pre-push-";

/** Log prefix that identifies the gate output inside the push transcript. */
const LOG_PREFIX = "[pre-push-gate]";

/** Manifest that declares the supported Node.js range in `engines.node`. */
const PACKAGE_MANIFEST_FILE = "package.json";

/** File that pins the exact Node.js version used locally. */
const PINNED_NODE_VERSION_FILE = ".nvmrc";

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

/** Outcomes of comparing the running Node.js with the repository pins. */
export const NODE_RUNTIME_STATUS = {
  match: "match",
  pinnedVersionDrift: "pinned-version-drift",
  unsupported: "unsupported",
};

/** One `engines.node` comparator such as `>=24`, `<25` or `24.21.0`. */
const VERSION_COMPARATOR_PATTERN =
  /^(>=|<=|>|<|=)?v?([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?$/;

/** Leading `v` accepted in `.nvmrc` and `process.version`. */
const VERSION_PREFIX_PATTERN = /^v/;

/**
 * Parses a `major.minor.patch` version into numbers, padding missing parts.
 *
 * @param {string} version - Version such as `24.21.0` or `v24`.
 * @returns {number[]} `[major, minor, patch]`.
 */
function parseVersionParts(version) {
  const [major = 0, minor = 0, patch = 0] = version
    .trim()
    .replace(VERSION_PREFIX_PATTERN, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  return [major, minor, patch];
}

/**
 * Compares two parsed versions.
 *
 * @param {number[]} leftParts - First version.
 * @param {number[]} rightParts - Second version.
 * @returns {number} Negative, zero or positive like `Array#sort` comparators.
 */
function compareVersionParts(leftParts, rightParts) {
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

/**
 * Evaluates an `engines.node` range made of space-separated comparators
 * (`>=24 <25`). Other semver syntaxes (`^`, `~`, `||`, `x`) are rejected so an
 * unsupported range fails loudly instead of silently allowing any runtime.
 *
 * @param {string} version - Running Node.js version.
 * @param {string} supportedRange - `engines.node` value.
 * @returns {boolean} `true` when every comparator accepts the version.
 * @throws {Error} When the range uses syntax this evaluator does not support.
 */
function satisfiesVersionRange(version, supportedRange) {
  const versionParts = parseVersionParts(version);

  return supportedRange
    .trim()
    .split(/[ ]+/)
    .every((comparator) => {
      const comparatorMatch = VERSION_COMPARATOR_PATTERN.exec(comparator);

      if (!comparatorMatch) {
        throw new Error(
          `pre-push-gate:satisfiesVersionRange cannot evaluate engines.node "${supportedRange}"; use space-separated comparators such as ">=24 <25"`
        );
      }

      const [, operator = "=", major, minor, patch] = comparatorMatch;
      const difference = compareVersionParts(versionParts, [
        Number(major),
        Number(minor ?? 0),
        Number(patch ?? 0),
      ]);

      switch (operator) {
        case ">=":
          return difference >= 0;
        case "<=":
          return difference <= 0;
        case ">":
          return difference > 0;
        case "<":
          return difference < 0;
        default: {
          // A bare partial version (`24`, `24.21`) matches every release under it.
          const comparedPartCount = [major, minor, patch].filter(
            (part) => part !== undefined
          ).length;

          return compareVersionParts(
            versionParts.slice(0, comparedPartCount),
            [major, minor, patch].slice(0, comparedPartCount).map(Number)
          ) === 0;
        }
      }
    });
}

/**
 * Compares the running Node.js with `engines.node` and `.nvmrc`. A runtime
 * outside `engines.node` is unsupported and blocks the push; a runtime inside
 * the range that differs from the exact `.nvmrc` pin only warns, so a patch or
 * minor drift inside the supported major does not block every push.
 *
 * @param {{ runningVersion: string, supportedRange: string, pinnedVersion: string | null }} options
 * @returns {{ status: string, message: string | null }} One of
 *   {@link NODE_RUNTIME_STATUS} and the Spanish message to show, if any.
 * @throws {Error} When `engines.node` uses an unsupported range syntax.
 */
export function evaluateNodeRuntime({ runningVersion, supportedRange, pinnedVersion }) {
  const normalizedRunningVersion = runningVersion.replace(VERSION_PREFIX_PATTERN, "");
  const normalizedPinnedVersion = pinnedVersion
    ? pinnedVersion.trim().replace(VERSION_PREFIX_PATTERN, "")
    : null;
  const suggestedVersion = normalizedPinnedVersion ?? supportedRange;

  if (!satisfiesVersionRange(normalizedRunningVersion, supportedRange)) {
    return {
      status: NODE_RUNTIME_STATUS.unsupported,
      message: `Node ${normalizedRunningVersion} no cumple engines.node "${supportedRange}". Cambiá a Node ${suggestedVersion} (.nvmrc), por ejemplo con "nvm use", y volvé a pushear.`,
    };
  }

  if (
    normalizedPinnedVersion &&
    compareVersionParts(
      parseVersionParts(normalizedRunningVersion),
      parseVersionParts(normalizedPinnedVersion)
    ) !== 0
  ) {
    return {
      status: NODE_RUNTIME_STATUS.pinnedVersionDrift,
      message: `Node ${normalizedRunningVersion} cumple engines.node "${supportedRange}" pero difiere de ${normalizedPinnedVersion} fijado en .nvmrc; el gate continúa, conviene cambiar a esa versión.`,
    };
  }

  return { status: NODE_RUNTIME_STATUS.match, message: null };
}

/**
 * Reads `engines.node` and `.nvmrc` from the checkout and evaluates the
 * running Node.js against them.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {{ status: string, message: string | null }}
 * @throws {Error} When `package.json` has no `engines.node`.
 */
function checkNodeRuntime(repositoryRoot) {
  const packageManifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, PACKAGE_MANIFEST_FILE), "utf8")
  );
  const supportedRange = packageManifest.engines?.node;

  if (typeof supportedRange !== "string") {
    throw new Error(
      `pre-push-gate:checkNodeRuntime found no engines.node in ${PACKAGE_MANIFEST_FILE} at ${repositoryRoot}`
    );
  }

  const pinnedVersionPath = path.join(repositoryRoot, PINNED_NODE_VERSION_FILE);
  const pinnedVersion = existsSync(pinnedVersionPath)
    ? readFileSync(pinnedVersionPath, "utf8")
    : null;

  return evaluateNodeRuntime({
    runningVersion: process.versions.node,
    supportedRange,
    pinnedVersion,
  });
}

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
 * Builds the environment for validating a commit in a temporary worktree.
 * That commit may come from a fetched, untrusted ref and its install lifecycle
 * scripts and tests run with this environment, so only the operating-system,
 * locale and tooling variables in {@link INHERITED_ENVIRONMENT_VARIABLES}
 * (plus the `LC_*`/`XDG_*` families) are kept, and the application variables
 * that `next build` and the tests need are replaced with the non-secret
 * {@link WORKTREE_ENVIRONMENT_PLACEHOLDERS}. Local `.env*` files are never
 * copied into the worktree.
 *
 * @param {NodeJS.ProcessEnv} [environment] - Source environment.
 * @returns {NodeJS.ProcessEnv} Allowlisted environment with placeholders.
 */
export function buildWorktreeValidationEnvironment(environment = process.env) {
  const allowlistedEntries = Object.entries(environment).filter(
    ([variableName, value]) => {
      const normalizedName = variableName.toUpperCase();

      return (
        value !== undefined &&
        (INHERITED_ENVIRONMENT_VARIABLES.has(normalizedName) ||
          INHERITED_ENVIRONMENT_PREFIXES.some((prefix) =>
            normalizedName.startsWith(prefix)
          ))
      );
    }
  );

  return {
    ...Object.fromEntries(allowlistedEntries),
    ...WORKTREE_ENVIRONMENT_PLACEHOLDERS,
  };
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
 * Installs dependencies strictly from the committed lockfile. pnpm exits
 * non-zero when `package.json` no longer matches `pnpm-lock.yaml`, which
 * `pnpm run ci` alone would not detect against an existing `node_modules`.
 * `HUSKY=0` keeps the `prepare` script from rewriting the hooks config.
 *
 * @param {string} workingDirectory - Checkout or worktree to install in.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for pnpm.
 * @returns {Promise<number>} pnpm exit code.
 */
export function installFrozenDependencies(
  workingDirectory,
  environment = process.env
) {
  return runPnpm(GATE_COMMANDS.install, workingDirectory, {
    ...environment,
    HUSKY: "0",
  });
}

/**
 * Runs the frozen install and, when it succeeds, the full `pnpm run ci`.
 *
 * @param {string} oid - Commit being validated, used in the failure log.
 * @param {string} workingDirectory - Checkout or worktree at that commit.
 * @param {NodeJS.ProcessEnv} [environment] - Environment for both steps.
 * @returns {Promise<boolean>} `true` when both steps passed.
 */
async function runGateSteps(oid, workingDirectory, environment = process.env) {
  const installExitCode = await installFrozenDependencies(
    workingDirectory,
    environment
  );

  if (installExitCode !== 0) {
    console.error(
      `${LOG_PREFIX} pnpm install --frozen-lockfile failed for ${oid} with exit code ${installExitCode}; package.json and pnpm-lock.yaml may be out of sync`
    );
    return false;
  }

  return (await runPnpm(GATE_COMMANDS.ci, workingDirectory, environment)) === 0;
}

/**
 * Validates one pushed commit and always cleans up its worktree.
 *
 * @param {{ oid: string, refs: string[] }} commit - Commit to validate.
 * @param {{ repositoryRoot: string, headOid: string, workingTreeClean: boolean, registerWorktree: (worktreePath: string | null) => void }} context
 * @returns {Promise<boolean>} `true` when the frozen install and `pnpm run ci` passed.
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
      `${LOG_PREFIX} ${commit.oid} (${refsLabel}) is the clean HEAD; running the gate in place`
    );
    return runGateSteps(commit.oid, context.repositoryRoot);
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
    return await runGateSteps(
      commit.oid,
      worktreePath,
      buildWorktreeValidationEnvironment()
    );
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
  // `.nvmrc` and `engines.node` do not switch the `node` already running this
  // hook, so reject an unsupported runtime before validating any ref.
  const nodeRuntime = checkNodeRuntime(repositoryRoot);

  if (nodeRuntime.status === NODE_RUNTIME_STATUS.unsupported) {
    console.error(`${LOG_PREFIX} ${nodeRuntime.message}`);
    process.exitCode = 1;
    return;
  }

  if (nodeRuntime.message) {
    console.warn(`${LOG_PREFIX} ${nodeRuntime.message}`);
  }

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
        `${LOG_PREFIX} the gate failed for ${commit.oid} (${commit.refs.join(", ")}); the push was not sent`
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

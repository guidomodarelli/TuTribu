#!/usr/bin/env node
/**
 * Pre-push quality gate invoked by the Husky `pre-push` hook.
 *
 * Git passes one line per pushed ref on stdin:
 * `<local ref> <local oid> <remote ref> <remote oid>`. The gate validates the
 * exact commits being uploaded instead of the current working tree:
 *
 * - ref deletions (local oid made of zeros) are allowed and skipped;
 * - the gate only validates the commit that is checked out: every pushed oid
 *   must be `HEAD` and the working tree must have no tracked, staged or
 *   untracked changes. Then `pnpm install --frozen-lockfile` and
 *   `pnpm run ci` run once in place; the frozen install rejects a
 *   `package.json` that drifted from `pnpm-lock.yaml` even when
 *   `node_modules` already exists;
 * - any other pushed oid (another branch, a fetched ref, or `HEAD` with local
 *   changes) fails the push with a Spanish message asking to check out that
 *   branch or commit with a clean working tree and push again. The gate never
 *   checks out or executes code from a commit other than the checkout, so a
 *   ref fetched from elsewhere cannot run its scripts under the developer
 *   account, and the Node.js pins read from the checkout always belong to the
 *   pushed commit.
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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Git's all-zero object id, used for deleted or missing refs. */
const ZERO_OID_PATTERN = /^0+$/;

/** Number of whitespace-separated fields in a pre-push stdin line. */
const PUSH_LINE_FIELD_COUNT = 4;

/** Log prefix that identifies the gate output inside the push transcript. */
const LOG_PREFIX = "[pre-push-gate]";

/** Manifest that declares the supported Node.js range in `engines.node`. */
const PACKAGE_MANIFEST_FILE = "package.json";

/** File that pins the exact Node.js version used locally. */
const PINNED_NODE_VERSION_FILE = ".nvmrc";

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
 * Returns the pushed commits the gate refuses to validate: every commit that
 * is not the checked-out `HEAD`, or all of them when the working tree has
 * local changes. Validating them would require checking out and executing
 * code that is not the developer's clean checkout.
 *
 * @param {{ oid: string, refs: string[] }[]} commits - Commits being pushed.
 * @param {{ headOid: string, isWorkingTreeClean: boolean }} checkout - State of
 *   the current checkout.
 * @returns {{ oid: string, refs: string[] }[]} Commits that block the push.
 */
export function findCommitsOutsideCleanCheckout(commits, { headOid, isWorkingTreeClean }) {
  return commits.filter((commit) => !isWorkingTreeClean || commit.oid !== headOid);
}

/**
 * Builds the Spanish message shown when a pushed commit cannot be validated
 * because it is not the clean checkout.
 *
 * @param {{ oid: string, refs: string[] }} commit - Rejected commit.
 * @param {{ headOid: string, isWorkingTreeClean: boolean }} checkout - State of
 *   the current checkout.
 * @returns {string} Actionable message for the push transcript.
 */
function buildCheckoutRequiredMessage(commit, { headOid, isWorkingTreeClean }) {
  const reason =
    commit.oid === headOid && !isWorkingTreeClean
      ? "es el HEAD actual pero el working tree tiene cambios sin commitear o archivos sin trackear"
      : `no es el commit del checkout actual (HEAD ${headOid})`;

  return `No se puede validar ${commit.oid} (${commit.refs.join(", ")}): ${reason}. El pre-push solo valida el HEAD actual con el working tree limpio. Hacé checkout de esa rama o commit, dejá el working tree limpio (commiteá, stasheá o descartá los cambios, incluidos los archivos sin trackear) y volvé a pushear.`;
}

/**
 * Returns a copy of the environment without Git's repository-local variables
 * (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`, ...). Git exports them to
 * hooks; leaking them into nested `git` calls or into `pnpm run ci`
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
 * @param {string} workingDirectory - Checkout to install in.
 * @returns {Promise<number>} pnpm exit code.
 */
export function installFrozenDependencies(workingDirectory) {
  return runPnpm(GATE_COMMANDS.install, workingDirectory, {
    ...process.env,
    HUSKY: "0",
  });
}

/**
 * Runs the frozen install and, when it succeeds, the full `pnpm run ci` in the
 * current checkout.
 *
 * @param {{ oid: string, refs: string[] }} commit - Clean `HEAD` being pushed.
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {Promise<boolean>} `true` when both steps passed.
 */
async function runGateSteps(commit, repositoryRoot) {
  console.log(
    `${LOG_PREFIX} ${commit.oid} (${commit.refs.join(", ")}) is the clean HEAD; running the gate in place`
  );
  const installExitCode = await installFrozenDependencies(repositoryRoot);

  if (installExitCode !== 0) {
    console.error(
      `${LOG_PREFIX} pnpm install --frozen-lockfile failed for ${commit.oid} with exit code ${installExitCode}; package.json and pnpm-lock.yaml may be out of sync`
    );
    return false;
  }

  return (await runPnpm(GATE_COMMANDS.ci, repositoryRoot)) === 0;
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

  const checkout = {
    headOid: resolveHeadOid(repositoryRoot),
    isWorkingTreeClean: isWorkingTreeClean(repositoryRoot),
  };
  const rejectedCommits = findCommitsOutsideCleanCheckout(commitsToValidate, checkout);

  if (rejectedCommits.length > 0) {
    for (const rejectedCommit of rejectedCommits) {
      console.error(`${LOG_PREFIX} ${buildCheckoutRequiredMessage(rejectedCommit, checkout)}`);
    }
    console.error(`${LOG_PREFIX} the push was not sent`);
    process.exitCode = 1;
    return;
  }

  // Every pushed ref points to the clean HEAD, so there is one commit to validate.
  const [headCommit] = commitsToValidate;

  if (!(await runGateSteps(headCommit, repositoryRoot))) {
    console.error(
      `${LOG_PREFIX} the gate failed for ${headCommit.oid} (${headCommit.refs.join(", ")}); the push was not sent`
    );
    process.exitCode = 1;
  }
}

if ((process.argv[1] ?? "").endsWith("pre-push-gate.mjs")) {
  main().catch((gateError) => {
    console.error(`${LOG_PREFIX} failed unexpectedly`, gateError);
    process.exitCode = 1;
  });
}

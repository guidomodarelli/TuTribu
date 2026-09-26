#!/usr/bin/env node
/**
 * Pre-push quality gate invoked by the Husky `pre-push` hook.
 *
 * Git passes one line per pushed ref on stdin:
 * `<local ref> <local oid> <remote ref> <remote oid>`. The gate validates the
 * exact commits being uploaded instead of the current working tree:
 *
 * - ref deletions (local oid made of zeros) are allowed and skipped;
 * - only branches other than `main` are gated: pushes to `refs/heads/main`
 *   (such as `pnpm release`) and to tags are skipped, because the gate
 *   already ran when the branch that reaches `main` through a pull request
 *   was pushed;
 * - the gate only validates the commit that is checked out: every gated oid
 *   must be `HEAD` and the working tree must have no tracked, staged or
 *   untracked changes and no tracked file flagged `skip-worktree` or
 *   `assume-unchanged` (`git status` hides whether those differ from `HEAD`,
 *   so the gate could validate a local edit Git never uploads). Then `pnpm install --frozen-lockfile` and
 *   `pnpm run ci` run once in place; the frozen install rejects a
 *   `package.json` that drifted from `pnpm-lock.yaml` even when
 *   `node_modules` already exists;
 * - `HEAD` and the working tree are checked again after the install and
 *   after `pnpm run ci`: Git uploads the oids it captured on stdin, so a
 *   commit or edit made in another terminal during the run would otherwise
 *   let a passing gate vouch for a different pushed commit. Any change fails
 *   the push asking to retry without touching the checkout;
 * - any other gated oid (another branch, a fetched ref, or `HEAD` with local
 *   changes) fails the push with a Spanish message asking to check out that
 *   branch or commit with a clean working tree and push again. The gate never
 *   checks out or executes code from a commit other than the checkout, so a
 *   ref fetched from elsewhere cannot run its scripts under the developer
 *   account, and the Node.js pins read from the checkout always belong to the
 *   pushed commit.
 *
 * When at least one ref is gated, the running Node.js is checked against
 * `engines.node` (blocking) and `.nvmrc` (warning only). A prerelease runtime
 * (`24.21.0-rc.1`) never satisfies `engines.node` and never matches `.nvmrc`,
 * following semver range semantics that exclude prereleases.
 *
 * Usage (from `.husky/pre-push`):
 *   node scripts/pre-push-gate.mjs < <git pre-push stdin>
 *
 * @module pre-push-gate
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { MAIN_BRANCH } from "./release/release-plan.mjs";

/** Git's all-zero object id, used for deleted or missing refs. */
const ZERO_OID_PATTERN = /^0+$/;

/** Prefix of the remote refs that name branches; tags and other refs are not gated. */
const BRANCH_REF_PREFIX = "refs/heads/";

/** Remote ref of `main`, which the gate skips. */
const MAIN_BRANCH_REF = `${BRANCH_REF_PREFIX}${MAIN_BRANCH}`;

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

/** Semver build metadata suffix (`+build.1`), ignored for precedence. */
const VERSION_BUILD_METADATA_PATTERN = /[+].*$/;

/** Separator between the `major.minor.patch` core and a prerelease tag. */
const PRERELEASE_SEPARATOR = "-";

/** `git ls-files -v` tag of a tracked file flagged `skip-worktree`. */
const SKIP_WORKTREE_TAG = "S";

/** Lowercase `git ls-files -v` tags mark files flagged `assume-unchanged`. */
const ASSUME_UNCHANGED_TAG_PATTERN = /^[a-z]$/;

/** Maximum number of flagged files listed in a rejection message. */
const MAX_REPORTED_FLAGGED_FILES = 5;

/**
 * Parses a version into its numeric `major.minor.patch` core (padding missing
 * parts) and its prerelease tag, dropping build metadata.
 *
 * @param {string} version - Version such as `24.21.0`, `v24` or `24.21.0-rc.1`.
 * @returns {{ parts: number[], prerelease: string | null }} `[major, minor, patch]`
 *   and the prerelease tag (`rc.1`), or `null` for a release.
 */
function parseVersion(version) {
  const normalizedVersion = version
    .trim()
    .replace(VERSION_PREFIX_PATTERN, "")
    .replace(VERSION_BUILD_METADATA_PATTERN, "");
  const separatorIndex = normalizedVersion.indexOf(PRERELEASE_SEPARATOR);
  const hasPrerelease = separatorIndex !== -1;
  const core = hasPrerelease ? normalizedVersion.slice(0, separatorIndex) : normalizedVersion;
  const [major = 0, minor = 0, patch = 0] = core
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  return {
    parts: [major, minor, patch],
    prerelease: hasPrerelease ? normalizedVersion.slice(separatorIndex + 1) : null,
  };
}

/**
 * Returns whether two versions are the same release, including the
 * prerelease tag, so `24.21.0-rc.1` never equals `24.21.0`.
 *
 * @param {string} leftVersion - First version.
 * @param {string} rightVersion - Second version.
 * @returns {boolean} `true` when core and prerelease tag are identical.
 */
function isSameVersion(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);

  return compareVersionParts(left.parts, right.parts) === 0 && left.prerelease === right.prerelease;
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
 * A prerelease version never satisfies the range: the comparators name only
 * releases, and semver excludes prereleases unless a comparator admits them.
 *
 * @param {string} version - Running Node.js version.
 * @param {string} supportedRange - `engines.node` value.
 * @returns {boolean} `true` when every comparator accepts the version.
 * @throws {Error} When the range uses syntax this evaluator does not support.
 */
function satisfiesVersionRange(version, supportedRange) {
  const { parts: versionParts, prerelease } = parseVersion(version);

  const satisfiesEveryComparator = supportedRange
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

  return satisfiesEveryComparator && prerelease === null;
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
    const prereleaseNote = parseVersion(normalizedRunningVersion).prerelease
      ? " (es una versión prerelease y engines.node solo admite releases)"
      : "";

    return {
      status: NODE_RUNTIME_STATUS.unsupported,
      message: `Node ${normalizedRunningVersion}${prereleaseNote} no cumple engines.node "${supportedRange}". Cambiá a Node ${suggestedVersion} (.nvmrc), por ejemplo con "nvm use", y volvé a pushear.`,
    };
  }

  if (
    normalizedPinnedVersion &&
    !isSameVersion(normalizedRunningVersion, normalizedPinnedVersion)
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
 * Returns whether a push to a remote ref runs the gate: only branches other
 * than `main` do. `main` receives code through reviewed pull requests whose
 * branches were already gated, and tags point at commits of `main`.
 *
 * @param {string} remoteRef - Remote ref being updated, such as `refs/heads/feature`.
 * @returns {boolean} `true` for a branch other than `main`.
 */
export function isGatedRemoteRef(remoteRef) {
  return remoteRef.startsWith(BRANCH_REF_PREFIX) && remoteRef !== MAIN_BRANCH_REF;
}

/**
 * Selects the distinct commits that must be validated, skipping deletions and
 * refs the gate does not cover (see {@link isGatedRemoteRef}).
 *
 * @param {ReturnType<typeof parsePushedRefs>} pushedRefs - Parsed ref updates.
 * @returns {{ oid: string, refs: string[] }[]} Commits in first-seen order with
 *   the local refs that point to each one.
 */
export function selectCommitsToValidate(pushedRefs) {
  const commitsByOid = new Map();

  for (const pushedRef of pushedRefs) {
    if (isZeroOid(pushedRef.localOid) || !isGatedRemoteRef(pushedRef.remoteRef)) {
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
 * @param {{ headOid: string, isWorkingTreeClean: boolean, flaggedFiles: string[] }} checkout -
 *   State of the current checkout.
 * @returns {string} Actionable message for the push transcript.
 */
function buildCheckoutRequiredMessage(commit, { headOid, isWorkingTreeClean, flaggedFiles }) {
  const reason =
    commit.oid === headOid && !isWorkingTreeClean
      ? `es el HEAD actual pero ${describeDirtyWorkingTree(flaggedFiles)}`
      : `no es el commit del checkout actual (HEAD ${headOid})`;

  return `No se puede validar ${commit.oid} (${commit.refs.join(", ")}): ${reason}. El pre-push solo valida el HEAD actual con el working tree limpio. Hacé checkout de esa rama o commit, dejá el working tree limpio (commiteá, stasheá o descartá los cambios, incluidos los archivos sin trackear) y volvé a pushear.`;
}

/**
 * Describes, in Spanish, why the working tree does not count as clean.
 *
 * @param {string[]} flaggedFiles - Tracked files flagged `skip-worktree` or
 *   `assume-unchanged`.
 * @returns {string} Reason fragment for the rejection messages.
 */
function describeDirtyWorkingTree(flaggedFiles) {
  if (flaggedFiles.length === 0) {
    return "el working tree tiene cambios sin commitear o archivos sin trackear";
  }

  const listedFiles = flaggedFiles.slice(0, MAX_REPORTED_FLAGGED_FILES).join(", ");
  const remainingCount = flaggedFiles.length - MAX_REPORTED_FLAGGED_FILES;
  const remainingNote = remainingCount > 0 ? ` y ${remainingCount} más` : "";

  return `hay archivos trackeados marcados con skip-worktree o assume-unchanged (${listedFiles}${remainingNote}) y git status no muestra si difieren de HEAD; quitá las marcas con "git update-index --no-skip-worktree --no-assume-unchanged <archivo>"`;
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
 * Lists the tracked files flagged `skip-worktree` or `assume-unchanged`.
 * `git status` does not compare those files with `HEAD`, so a local edit to
 * one of them is invisible to the clean-tree check while Git still uploads the
 * committed version.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {string[]} Flagged paths relative to the repository root.
 */
export function listStatusHiddenFiles(repositoryRoot) {
  return runGit(["ls-files", "-v", "-z"], repositoryRoot)
    .split("\0")
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const [tag] = entry;

      return tag === SKIP_WORKTREE_TAG || ASSUME_UNCHANGED_TAG_PATTERN.test(tag);
    })
    .map((entry) => entry.slice(entry.indexOf(" ") + 1));
}

/**
 * Returns whether the checkout has no staged, unstaged or untracked changes
 * (ignored files such as `.env*`, `node_modules` and `.next` do not count).
 * `git status` alone cannot prove it for tracked files flagged
 * `skip-worktree` or `assume-unchanged`, so any flagged file also makes the
 * tree count as not clean.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {boolean} `true` when the working tree provably matches `HEAD`.
 */
export function isWorkingTreeClean(repositoryRoot) {
  return readWorkingTreeState(repositoryRoot).isWorkingTreeClean;
}

/**
 * Reads whether the working tree is clean together with the flagged files
 * that `git status` would hide.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {{ isWorkingTreeClean: boolean, flaggedFiles: string[] }}
 */
function readWorkingTreeState(repositoryRoot) {
  const flaggedFiles = listStatusHiddenFiles(repositoryRoot);

  return {
    isWorkingTreeClean:
      flaggedFiles.length === 0 &&
      runGit(["status", "--porcelain"], repositoryRoot).length === 0,
    flaggedFiles,
  };
}

/**
 * Reads the current checkout state.
 *
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {{ headOid: string, isWorkingTreeClean: boolean, flaggedFiles: string[] }}
 */
function readCheckoutState(repositoryRoot) {
  return {
    headOid: resolveHeadOid(repositoryRoot),
    ...readWorkingTreeState(repositoryRoot),
  };
}

/**
 * Checks that the checkout is still the clean pushed commit after a gate step.
 * Git uploads the oid captured on stdin, so a commit or an edit made while the
 * gate runs would otherwise let the gate pass for code that is not pushed.
 *
 * @param {{ oid: string, refs: string[] }} commit - Clean `HEAD` being pushed.
 * @param {string} repositoryRoot - Repository top-level directory.
 * @param {string} completedStep - Gate step that just finished, for the log.
 * @returns {boolean} `true` when `HEAD` is unchanged and the tree is clean.
 */
function isCheckoutStillPushedCommit(commit, repositoryRoot, completedStep) {
  const checkout = readCheckoutState(repositoryRoot);

  if (checkout.headOid === commit.oid && checkout.isWorkingTreeClean) {
    return true;
  }

  const change =
    checkout.headOid === commit.oid
      ? describeDirtyWorkingTree(checkout.flaggedFiles)
      : `HEAD pasó a ${checkout.headOid}`;

  console.error(
    `${LOG_PREFIX} El checkout cambió mientras corría el gate (después de ${completedStep}): se valida ${commit.oid} (${commit.refs.join(", ")}) pero ${change}. Git subiría ${commit.oid}, no el código validado. Volvé a pushear sin modificar el checkout (sin commits, ediciones ni checkouts en otra terminal) mientras corre el pre-push.`
  );
  return false;
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
    const spawnOptions = {
      cwd: workingDirectory,
      env: buildRepositoryIndependentEnvironment(environment),
      stdio: /** @type {const} */ (["ignore", "inherit", "inherit"]),
    };
    // pnpm is a `.cmd` shim on Windows, which needs a shell. The arguments are
    // fixed constants, so they go inside the command: Node deprecates passing
    // an argument list together with `shell` (DEP0190).
    const child =
      process.platform === "win32"
        ? spawn(["pnpm", ...pnpmArguments].join(" "), { ...spawnOptions, shell: true })
        : spawn("pnpm", pnpmArguments, spawnOptions);

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
 * current checkout, rechecking after each step that the checkout is still the
 * clean pushed commit.
 *
 * @param {{ oid: string, refs: string[] }} commit - Clean `HEAD` being pushed.
 * @param {string} repositoryRoot - Repository top-level directory.
 * @returns {Promise<boolean>} `true` when both steps passed and the checkout
 *   did not change while they ran.
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

  if (!isCheckoutStillPushedCommit(commit, repositoryRoot, "pnpm install")) {
    return false;
  }

  if ((await runPnpm(GATE_COMMANDS.ci, repositoryRoot)) !== 0) {
    return false;
  }

  return isCheckoutStillPushedCommit(commit, repositoryRoot, "pnpm run ci");
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
  const commitsToValidate = selectCommitsToValidate(parsePushedRefs(await readStdin()));

  if (commitsToValidate.length === 0) {
    console.log(
      `${LOG_PREFIX} no pushed commits to validate (the gate only runs on branches other than ${MAIN_BRANCH})`
    );
    return;
  }

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

  const checkout = readCheckoutState(repositoryRoot);
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

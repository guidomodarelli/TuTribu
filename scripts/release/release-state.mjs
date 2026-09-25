/**
 * Gathers the repository snapshot consumed by `release-plan.mjs`: current
 * branch, uncommitted changes, `main` compared with `origin/main`, the last
 * release tag, the commits waiting to be released, a release left half
 * pushed, the pull request of a feature branch and the pending migrations.
 *
 * Every reader is read-only; the only network writes are `git fetch`.
 *
 * @module release-state
 */

import { spawn } from "node:child_process";

import { MAIN_BRANCH, findUnpushedRelease } from "./release-plan.mjs";
import {
  MIGRATION_JOURNAL_PATH,
  checkPendingMigrations,
  mergeMigrationJournals,
  parseMigrationJournal,
} from "./pending-migrations.mjs";

/** Remote that receives releases. */
export const RELEASE_REMOTE = "origin";

/** Remote-tracking ref of the release branch. */
export const REMOTE_MAIN_REF = `${RELEASE_REMOTE}/${MAIN_BRANCH}`;

/** Separates fields inside one `git log --format` record. */
const FIELD_SEPARATOR = "\x1f";

/** Separates records in `git log --format` output. */
const RECORD_SEPARATOR = "\x1e";

/** `git log --grep` pattern of release commit subjects (`0.93.0`). */
const RELEASE_COMMIT_SUBJECT_GREP = String.raw`^[0-9]+\.[0-9]+\.[0-9]+$`;

/** Message `gh pr view` prints when the branch has no pull request. */
const NO_PULL_REQUEST_MESSAGE_PATTERN = /no pull requests found/i;

/** Fields requested from `gh pr view`. */
const PULL_REQUEST_JSON_FIELDS = "number,url,title,state,isDraft,headRefOid";

/**
 * Runs a command and captures its output.
 *
 * @param {string} command - Executable name.
 * @param {string[]} commandArguments - Arguments.
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options] - Spawn options.
 * @returns {Promise<{ status: number, stdout: string, stderr: string }>} Result; never rejects.
 */
export function runCaptured(command, commandArguments, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ status: 1, stdout, stderr: error.message }));
    child.on("close", (status) => resolve({ status: status ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

/**
 * Runs a command with inherited stdio so its progress stays visible.
 *
 * @param {string} command - Executable name.
 * @param {string[]} commandArguments - Arguments.
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options] - Spawn options.
 * @returns {Promise<number>} Exit code; never rejects.
 */
export function runInherited(command, commandArguments, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });

    child.on("error", () => resolve(1));
    child.on("close", (status) => resolve(status ?? 1));
  });
}

/**
 * Creates a Git reader bound to a repository.
 *
 * @param {string} repositoryRoot - Repository root.
 * @returns {{ git: (gitArguments: string[]) => Promise<string>, tryGit: (gitArguments: string[]) => Promise<string | null> }} Readers.
 */
export function createGitReader(repositoryRoot) {
  const tryGit = async (gitArguments) => {
    const result = await runCaptured("git", gitArguments, { cwd: repositoryRoot });
    return result.status === 0 ? result.stdout : null;
  };

  const git = async (gitArguments) => {
    const result = await runCaptured("git", gitArguments, { cwd: repositoryRoot });

    if (result.status !== 0) {
      throw new Error(`release-state: git ${gitArguments.join(" ")} failed: ${result.stderr}`);
    }

    return result.stdout;
  };

  return { git, tryGit };
}

/**
 * Parses `git log` records produced with {@link FIELD_SEPARATOR} and
 * {@link RECORD_SEPARATOR}.
 *
 * @param {string} output - Raw `git log` output.
 * @returns {{ sha: string, subject: string, body: string }[]} Commits, newest first.
 */
export function parseCommitLog(output) {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", subject = "", body = ""] = record.split(FIELD_SEPARATOR);
      return { sha, subject, body: body.trim() };
    });
}

/**
 * Lists the commits of a revision range.
 *
 * @param {ReturnType<typeof createGitReader>} reader - Git reader.
 * @param {string} range - Revision range such as `v0.93.0..origin/main`.
 * @returns {Promise<{ sha: string, subject: string, body: string }[]>} Commits, newest first.
 */
export async function listCommits(reader, range) {
  const format = `%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`;
  const output = await reader.tryGit(["log", `--format=${format}`, range]);

  return output ? parseCommitLog(output) : [];
}

/**
 * Finds the newest release commit (subject `X.Y.Z`) reachable from a revision.
 *
 * @param {ReturnType<typeof createGitReader>} reader - Git reader.
 * @param {string} revision - Revision such as `origin/main` or `HEAD`.
 * @returns {Promise<{ sha: string, version: string } | null>} Last release, or `null` when none exists.
 */
export async function findLastReleaseCommit(reader, revision) {
  const output = await reader.tryGit([
    "log",
    "-1",
    "--extended-regexp",
    `--grep=${RELEASE_COMMIT_SUBJECT_GREP}`,
    `--format=%H${FIELD_SEPARATOR}%s`,
    revision,
  ]);

  if (!output) {
    return null;
  }

  const [sha, version] = output.split(FIELD_SEPARATOR);
  return { sha, version: version.trim() };
}

/**
 * Reads the `version` field of `package.json` at a revision.
 *
 * @param {ReturnType<typeof createGitReader>} reader - Git reader.
 * @param {string} revision - Revision such as `HEAD` or `origin/main`.
 * @returns {Promise<string | null>} Version, or `null` when unreadable.
 */
export async function readPackageVersionAt(reader, revision) {
  const manifest = await reader.tryGit(["show", `${revision}:package.json`]);

  try {
    return manifest ? JSON.parse(manifest).version ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Reads the migration journal at several revisions and merges them.
 *
 * @param {ReturnType<typeof createGitReader>} reader - Git reader.
 * @param {string[]} revisions - Revisions to read.
 * @returns {Promise<{ tag: string, when: number }[]>} Merged journal entries.
 */
export async function readMigrationJournalAt(reader, revisions) {
  const journals = [];

  for (const revision of revisions) {
    const journalText = await reader.tryGit(["show", `${revision}:${MIGRATION_JOURNAL_PATH}`]);

    if (journalText) {
      journals.push(parseMigrationJournal(journalText));
    }
  }

  return mergeMigrationJournals(journals);
}

/**
 * Looks up the pull request of a branch with the GitHub CLI.
 *
 * @param {string} repositoryRoot - Repository root.
 * @param {string} branchName - Head branch.
 * @returns {Promise<{ pullRequest: import("./release-plan.mjs").PullRequestSnapshot | null, githubError: string | null }>} Pull request or error.
 */
async function lookupPullRequest(repositoryRoot, branchName) {
  const result = await runCaptured("gh", ["pr", "view", branchName, "--json", PULL_REQUEST_JSON_FIELDS], {
    cwd: repositoryRoot,
  });

  if (result.status === 0) {
    return { pullRequest: JSON.parse(result.stdout), githubError: null };
  }

  if (NO_PULL_REQUEST_MESSAGE_PATTERN.test(result.stderr)) {
    return { pullRequest: null, githubError: null };
  }

  return { pullRequest: null, githubError: result.stderr.split("\n")[0] || "gh no respondió" };
}

/**
 * Reads the feature branch snapshot (upstream, unpushed and unmerged commits).
 *
 * @param {ReturnType<typeof createGitReader>} reader - Git reader.
 * @param {string} branchName - Current branch.
 * @returns {Promise<{ name: string, headSha: string, hasUpstream: boolean, unpushedCount: number, aheadOfMainCount: number }>} Snapshot.
 */
async function readFeatureBranch(reader, branchName) {
  const headSha = await reader.git(["rev-parse", "HEAD"]);
  const aheadOfMainCount = Number(await reader.tryGit(["rev-list", "--count", `${REMOTE_MAIN_REF}..HEAD`]) ?? 0);
  const upstreamUnpushed = await reader.tryGit(["rev-list", "--count", "@{upstream}..HEAD"]);

  return {
    name: branchName,
    headSha,
    hasUpstream: upstreamUnpushed !== null,
    unpushedCount: upstreamUnpushed === null ? aheadOfMainCount : Number(upstreamUnpushed),
    aheadOfMainCount,
  };
}

/**
 * Gathers the complete release snapshot.
 *
 * @param {{
 *   repositoryRoot: string,
 *   onProgress?: (label: string) => void,
 *   checkMigrations?: typeof checkPendingMigrations,
 * }} options - Inputs; `checkMigrations` selects the database adapter.
 * @returns {Promise<import("./release-plan.mjs").ReleaseState>} Snapshot accepted by `buildReleasePlan`.
 */
export async function collectReleaseState({
  repositoryRoot,
  onProgress = () => {},
  checkMigrations = checkPendingMigrations,
}) {
  const reader = createGitReader(repositoryRoot);

  onProgress("Sincronizando con origin (fetch)");
  await reader.git(["fetch", RELEASE_REMOTE, "--prune", "--tags", "--quiet"]);

  onProgress("Leyendo el estado de Git");
  const currentBranch = await reader.tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const statusOutput = await reader.git(["status", "--porcelain"]);
  const workingTreeChanges = statusOutput.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  const localMainExists = (await reader.tryGit(["rev-parse", "--verify", "--quiet", MAIN_BRANCH])) !== null;
  const aheadCommits = localMainExists ? await listCommits(reader, `${REMOTE_MAIN_REF}..${MAIN_BRANCH}`) : [];
  const behindCount = localMainExists
    ? Number(await reader.tryGit(["rev-list", "--count", `${MAIN_BRANCH}..${REMOTE_MAIN_REF}`]) ?? 0)
    : 0;

  // Release tags live only in local clones, so the last release is the last
  // version commit (`0.93.0`) that reached origin/main.
  const lastRelease = await findLastReleaseCommit(reader, REMOTE_MAIN_REF);
  const releasedVersion = await readPackageVersionAt(reader, REMOTE_MAIN_REF);
  const localMainVersion = localMainExists ? await readPackageVersionAt(reader, MAIN_BRANCH) : null;
  const unreleasedCommits = await listCommits(reader, lastRelease ? `${lastRelease.sha}..${REMOTE_MAIN_REF}` : REMOTE_MAIN_REF);
  const unpushedRelease = findUnpushedRelease({ localMainAheadCommits: aheadCommits, localMainVersion });

  let branch = null;
  let pullRequest = null;
  let githubError = null;

  if (currentBranch && currentBranch !== MAIN_BRANCH) {
    onProgress(`Revisando la rama ${currentBranch} y su PR`);
    branch = await readFeatureBranch(reader, currentBranch);
    ({ pullRequest, githubError } = await lookupPullRequest(repositoryRoot, currentBranch));
  }

  onProgress("Consultando migraciones pendientes en la base de datos");
  const journalEntries = await readMigrationJournalAt(reader, ["HEAD", REMOTE_MAIN_REF]);
  const migrations = await checkMigrations({ repositoryRoot, journalEntries });

  return {
    currentBranch,
    workingTreeChanges,
    branch,
    pullRequest,
    githubError,
    main: { aheadCommits, behindCount },
    lastRelease,
    releasedVersion,
    localMainVersion,
    unpushedRelease,
    unreleasedCommits,
    migrations,
  };
}

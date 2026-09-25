/** @vitest-environment node */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

type PushedRef = {
  localRef: string;
  localOid: string;
  remoteRef: string;
  remoteOid: string;
};

type PrePushGateScript = {
  VALIDATION_STRATEGY: { inPlace: string; worktree: string };
  parsePushedRefs: (stdinText: string) => PushedRef[];
  isZeroOid: (oid: string) => boolean;
  selectCommitsToValidate: (
    pushedRefs: PushedRef[]
  ) => { oid: string; refs: string[] }[];
  resolveValidationStrategy: (options: {
    oid: string;
    headOid: string;
    isWorkingTreeClean: boolean;
  }) => string;
  resolveHeadOid: (repositoryRoot: string) => string;
  isWorkingTreeClean: (repositoryRoot: string) => boolean;
  createValidationWorktree: (repositoryRoot: string, oid: string) => string;
  removeValidationWorktree: (repositoryRoot: string, worktreePath: string) => void;
  copyEnvironmentFiles: (repositoryRoot: string, worktreePath: string) => string[];
  buildRepositoryIndependentEnvironment: (
    environment?: Record<string, string | undefined>
  ) => NodeJS.ProcessEnv;
  installFrozenDependencies: (workingDirectory: string) => Promise<number>;
};

const ZERO_OID = "0".repeat(40);
const FIRST_OID = "a".repeat(40);
const SECOND_OID = "b".repeat(40);
/** Real pnpm installs in fixtures can exceed the default Vitest timeout. */
const PNPM_INSTALL_TEST_TIMEOUT_MS = 60_000;

let prePushGateScript: PrePushGateScript;
const temporaryDirectories: string[] = [];

function runGit(gitArguments: string[], workingDirectory: string): string {
  // Hooks export GIT_DIR/GIT_INDEX_FILE; fixtures must target their own repository.
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: prePushGateScript.buildRepositoryIndependentEnvironment(),
  });

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function writeFixtureManifest(
  directory: string,
  dependencies: Record<string, string>
): void {
  writeFileSync(
    path.join(directory, "package.json"),
    `${JSON.stringify({ name: "gate-fixture", version: "1.0.0", private: true, dependencies })}
`
  );
}

function createInstalledDependencyFixture(): string {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "pre-push-gate-install-"));
  temporaryDirectories.push(fixtureRoot);
  writeFixtureManifest(fixtureRoot, {});

  const initialInstall = spawnSync("pnpm", ["install", "--offline"], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...prePushGateScript.buildRepositoryIndependentEnvironment(), HUSKY: "0" },
    shell: process.platform === "win32",
  });

  if (initialInstall.status !== 0) {
    throw new Error(`fixture pnpm install failed: ${initialInstall.stderr}`);
  }

  return fixtureRoot;
}

function createRepositoryWithTwoCommits() {
  const repositoryRoot = mkdtempSync(path.join(os.tmpdir(), "pre-push-gate-test-"));
  temporaryDirectories.push(repositoryRoot);

  runGit(["init", "--quiet"], repositoryRoot);
  runGit(["config", "user.email", "gate@example.test"], repositoryRoot);
  runGit(["config", "user.name", "Gate Test"], repositoryRoot);
  runGit(["config", "commit.gpgsign", "false"], repositoryRoot);
  runGit(["config", "core.autocrlf", "false"], repositoryRoot);
  runGit(["config", "core.hooksPath", "no-hooks"], repositoryRoot);
  writeFileSync(path.join(repositoryRoot, ".gitignore"), ".env*\n");
  writeFileSync(path.join(repositoryRoot, "state.txt"), "broken\n");
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "-m", "first"], repositoryRoot);
  const firstOid = runGit(["rev-parse", "HEAD"], repositoryRoot);
  writeFileSync(path.join(repositoryRoot, "state.txt"), "fixed\n");
  runGit(["commit", "--quiet", "-am", "second"], repositoryRoot);
  const secondOid = runGit(["rev-parse", "HEAD"], repositoryRoot);

  return { repositoryRoot, firstOid, secondOid };
}

describe("pre-push gate script", () => {
  beforeAll(async () => {
    const importedModule = await import("../../../scripts/pre-push-gate.mjs");

    prePushGateScript = importedModule as unknown as PrePushGateScript;
  });

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("should parse every ref update Git supplies on stdin", () => {
    const stdinText = [
      `refs/heads/feature ${FIRST_OID} refs/heads/feature ${ZERO_OID}`,
      "",
      `refs/heads/other ${SECOND_OID} refs/heads/main ${FIRST_OID}\r`,
    ].join("\n");

    expect(prePushGateScript.parsePushedRefs(stdinText)).toEqual([
      {
        localRef: "refs/heads/feature",
        localOid: FIRST_OID,
        remoteRef: "refs/heads/feature",
        remoteOid: ZERO_OID,
      },
      {
        localRef: "refs/heads/other",
        localOid: SECOND_OID,
        remoteRef: "refs/heads/main",
        remoteOid: FIRST_OID,
      },
    ]);
  });

  it("should reject a malformed stdin line instead of skipping validation", () => {
    expect(() => prePushGateScript.parsePushedRefs("refs/heads/main abc")).toThrow(
      /malformed line/
    );
  });

  it("should skip deletions and validate each distinct pushed commit once", () => {
    const commits = prePushGateScript.selectCommitsToValidate([
      { localRef: "(delete)", localOid: ZERO_OID, remoteRef: "refs/heads/gone", remoteOid: FIRST_OID },
      { localRef: "refs/heads/one", localOid: FIRST_OID, remoteRef: "refs/heads/one", remoteOid: ZERO_OID },
      { localRef: "refs/heads/two", localOid: SECOND_OID, remoteRef: "refs/heads/two", remoteOid: ZERO_OID },
      { localRef: "refs/heads/alias", localOid: FIRST_OID, remoteRef: "refs/heads/alias", remoteOid: ZERO_OID },
    ]);

    expect(commits).toEqual([
      { oid: FIRST_OID, refs: ["refs/heads/one", "refs/heads/alias"] },
      { oid: SECOND_OID, refs: ["refs/heads/two"] },
    ]);
    expect(prePushGateScript.isZeroOid(ZERO_OID)).toBe(true);
    expect(prePushGateScript.isZeroOid(FIRST_OID)).toBe(false);
  });

  it("should drop Git's repository-local variables exported to hooks", () => {
    const environment = prePushGateScript.buildRepositoryIndependentEnvironment({
      PATH: "/usr/bin",
      GIT_DIR: "/elsewhere/.git",
      GIT_INDEX_FILE: "/elsewhere/.git/index",
      GIT_WORK_TREE: "/elsewhere",
      HUSKY: "0",
    });

    expect(environment).toEqual({ PATH: "/usr/bin", HUSKY: "0" });
  });

  it("should run in place only for a clean HEAD and use a worktree otherwise", () => {
    const { inPlace, worktree } = prePushGateScript.VALIDATION_STRATEGY;
    const resolve = prePushGateScript.resolveValidationStrategy;

    expect(resolve({ oid: FIRST_OID, headOid: FIRST_OID, isWorkingTreeClean: true })).toBe(inPlace);
    expect(resolve({ oid: FIRST_OID, headOid: FIRST_OID, isWorkingTreeClean: false })).toBe(worktree);
    expect(resolve({ oid: SECOND_OID, headOid: FIRST_OID, isWorkingTreeClean: true })).toBe(worktree);
  });

  it("should treat uncommitted and untracked changes as a dirty working tree", () => {
    const { repositoryRoot, secondOid } = createRepositoryWithTwoCommits();

    expect(prePushGateScript.resolveHeadOid(repositoryRoot)).toBe(secondOid);
    expect(prePushGateScript.isWorkingTreeClean(repositoryRoot)).toBe(true);

    writeFileSync(path.join(repositoryRoot, ".env.local"), "IGNORED=1\n");
    expect(prePushGateScript.isWorkingTreeClean(repositoryRoot)).toBe(true);

    writeFileSync(path.join(repositoryRoot, "untracked.txt"), "new\n");
    expect(prePushGateScript.isWorkingTreeClean(repositoryRoot)).toBe(false);

    rmSync(path.join(repositoryRoot, "untracked.txt"));
    writeFileSync(path.join(repositoryRoot, "state.txt"), "edited\n");
    expect(prePushGateScript.isWorkingTreeClean(repositoryRoot)).toBe(false);
  });

  it("should check out the pushed commit, not the working tree, and always remove the worktree", () => {
    const { repositoryRoot, firstOid } = createRepositoryWithTwoCommits();
    writeFileSync(path.join(repositoryRoot, "state.txt"), "uncommitted fix\n");
    writeFileSync(path.join(repositoryRoot, ".env.local"), "LOCAL=1\n");

    const worktreePath = prePushGateScript.createValidationWorktree(repositoryRoot, firstOid);

    try {
      expect(readFileSync(path.join(worktreePath, "state.txt"), "utf8")).toBe("broken\n");
      expect(prePushGateScript.copyEnvironmentFiles(repositoryRoot, worktreePath)).toEqual([
        ".env.local",
      ]);
      expect(readFileSync(path.join(worktreePath, ".env.local"), "utf8")).toBe("LOCAL=1\n");
      expect(prePushGateScript.copyEnvironmentFiles(repositoryRoot, worktreePath)).toEqual([]);
    } finally {
      prePushGateScript.removeValidationWorktree(repositoryRoot, worktreePath);
    }

    expect(existsSync(worktreePath)).toBe(false);
    expect(runGit(["worktree", "list", "--porcelain"], repositoryRoot)).not.toContain(
      path.basename(worktreePath)
    );
  });

  it(
    "should accept a lockfile that matches package.json with node_modules installed",
    async () => {
      const fixtureRoot = createInstalledDependencyFixture();

      expect(existsSync(path.join(fixtureRoot, "node_modules"))).toBe(true);
      await expect(prePushGateScript.installFrozenDependencies(fixtureRoot)).resolves.toBe(0);
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );

  it(
    "should fail when package.json drifted from the lockfile even with node_modules installed",
    async () => {
      const fixtureRoot = createInstalledDependencyFixture();
      writeFixtureManifest(fixtureRoot, { "left-pad": "^1.3.0" });

      await expect(prePushGateScript.installFrozenDependencies(fixtureRoot)).resolves.not.toBe(0);
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );
});

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
import { fileURLToPath } from "node:url";

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
  WORKTREE_ENVIRONMENT_PLACEHOLDERS: Record<string, string>;
  buildWorktreeValidationEnvironment: (
    environment?: Record<string, string | undefined>
  ) => NodeJS.ProcessEnv;
  buildRepositoryIndependentEnvironment: (
    environment?: Record<string, string | undefined>
  ) => NodeJS.ProcessEnv;
  installFrozenDependencies: (workingDirectory: string) => Promise<number>;
  NODE_RUNTIME_STATUS: { match: string; pinnedVersionDrift: string; unsupported: string };
  evaluateNodeRuntime: (options: {
    runningVersion: string;
    supportedRange: string;
    pinnedVersion: string | null;
  }) => { status: string; message: string | null };
};

const ZERO_OID = "0".repeat(40);
const FIRST_OID = "a".repeat(40);
const SECOND_OID = "b".repeat(40);
/** Real pnpm installs in fixtures can exceed the default Vitest timeout. */
const PNPM_INSTALL_TEST_TIMEOUT_MS = 60_000;
const PRE_PUSH_GATE_SCRIPT_PATH = fileURLToPath(
  new URL("../../../scripts/pre-push-gate.mjs", import.meta.url)
);
const RUNNING_NODE_VERSION = process.versions.node;
const RUNNING_NODE_MAJOR = Number(RUNNING_NODE_VERSION.split(".")[0]);

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

function createRepositoryWithRuntimePins(supportedRange: string, pinnedVersion: string): string {
  const { repositoryRoot } = createRepositoryWithTwoCommits();
  writeFileSync(
    path.join(repositoryRoot, "package.json"),
    `${JSON.stringify({ name: "gate-fixture", private: true, engines: { node: supportedRange } })}
`
  );
  writeFileSync(path.join(repositoryRoot, ".nvmrc"), `${pinnedVersion}
`);
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "-m", "pins"], repositoryRoot);

  return repositoryRoot;
}

function runPrePushGate(repositoryRoot: string, stdinText: string) {
  return spawnSync(process.execPath, [PRE_PUSH_GATE_SCRIPT_PATH], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: stdinText,
    env: prePushGateScript.buildRepositoryIndependentEnvironment(),
  });
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
      expect(existsSync(path.join(worktreePath, ".env.local"))).toBe(false);
    } finally {
      prePushGateScript.removeValidationWorktree(repositoryRoot, worktreePath);
    }

    expect(existsSync(worktreePath)).toBe(false);
    expect(runGit(["worktree", "list", "--porcelain"], repositoryRoot)).not.toContain(
      path.basename(worktreePath)
    );
  });

  it("should reject a Node runtime outside engines.node and accept only the pinned major", () => {
    const { match, pinnedVersionDrift, unsupported } = prePushGateScript.NODE_RUNTIME_STATUS;
    const evaluate = prePushGateScript.evaluateNodeRuntime;

    expect(
      evaluate({ runningVersion: "24.21.0", supportedRange: ">=24 <25", pinnedVersion: "24.21.0" })
    ).toEqual({ status: match, message: null });
    expect(
      evaluate({ runningVersion: "22.12.0", supportedRange: ">=24 <25", pinnedVersion: "24.21.0" }).status
    ).toBe(unsupported);
    expect(
      evaluate({ runningVersion: "25.0.0", supportedRange: ">=24 <25", pinnedVersion: "24.21.0" }).status
    ).toBe(unsupported);

    const drift = evaluate({
      runningVersion: "24.14.1",
      supportedRange: ">=24 <25",
      pinnedVersion: "v24.21.0",
    });
    expect(drift.status).toBe(pinnedVersionDrift);
    expect(drift.message).toContain("24.21.0");
  });

  it("should refuse to parse an engines.node range it cannot evaluate", () => {
    expect(() =>
      prePushGateScript.evaluateNodeRuntime({
        runningVersion: "24.21.0",
        supportedRange: "^24 || ^26",
        pinnedVersion: null,
      })
    ).toThrow(/engines.node/);
  });

  it("should block the push before validating refs when Node is outside engines.node", () => {
    const repositoryRoot = createRepositoryWithRuntimePins(
      `>=${RUNNING_NODE_MAJOR + 1}`,
      `${RUNNING_NODE_MAJOR + 1}.0.0`
    );
    const headOid = runGit(["rev-parse", "HEAD"], repositoryRoot);

    const gateRun = runPrePushGate(
      repositoryRoot,
      `refs/heads/main ${headOid} refs/heads/main ${ZERO_OID}
`
    );

    expect(gateRun.status).toBe(1);
    expect(gateRun.stderr).toContain(`Node ${RUNNING_NODE_VERSION}`);
    expect(gateRun.stdout).not.toContain("running the gate");
    expect(runGit(["worktree", "list", "--porcelain"], repositoryRoot).split("worktree ").length).toBe(2);
  });

  it("should warn and continue when Node matches engines.node but not the pinned .nvmrc", () => {
    const repositoryRoot = createRepositoryWithRuntimePins(
      `>=${RUNNING_NODE_MAJOR} <${RUNNING_NODE_MAJOR + 1}`,
      `${RUNNING_NODE_MAJOR}.999.0`
    );

    const gateRun = runPrePushGate(repositoryRoot, "");

    expect(gateRun.status).toBe(0);
    expect(gateRun.stderr).toContain(`${RUNNING_NODE_MAJOR}.999.0`);
    expect(gateRun.stdout).toContain("no pushed commits to validate");
  });

  it("should give the worktree gate only allowlisted variables plus non-secret placeholders", () => {
    const environment = prePushGateScript.buildWorktreeValidationEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      LC_ALL: "C.UTF-8",
      GIT_DIR: "/elsewhere/.git",
      DATABASE_URL: "postgresql://owner:real-password@db.example/tutribu",
      GITHUB_TOKEN: "ghp_real",
      MERCADO_PAGO_CLIENT_SECRET: "real-secret",
      npm_config__authToken: "npm-real",
    });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      LC_ALL: "C.UTF-8",
      ...prePushGateScript.WORKTREE_ENVIRONMENT_PLACEHOLDERS,
    });
    expect(Object.keys(prePushGateScript.WORKTREE_ENVIRONMENT_PLACEHOLDERS)).toEqual(
      expect.arrayContaining(["DATABASE_URL", "BETTER_AUTH_SECRET"])
    );
  });

  it(
    "should run the worktree gate without local .env files or inherited secrets",
    () => {
      const { repositoryRoot } = createRepositoryWithTwoCommits();
      const reportPath = path.join(repositoryRoot, "gate-report.json");
      writeFileSync(
        path.join(repositoryRoot, "package.json"),
        `${JSON.stringify({
          name: "gate-fixture",
          private: true,
          engines: { node: RUNNING_NODE_VERSION },
          scripts: { ci: "node report.cjs" },
        })}\n`
      );
      writeFileSync(
        path.join(repositoryRoot, "report.cjs"),
        [
          'const { readdirSync, writeFileSync } = require("node:fs");',
          `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({`,
          '  environmentFiles: readdirSync(".").filter((name) => name.startsWith(".env")),',
          "  databaseUrl: process.env.DATABASE_URL,",
          "  providerToken: process.env.FIXTURE_PROVIDER_TOKEN ?? null,",
          "}));",
        ].join("\n")
      );
      const lockfileInstall = spawnSync("pnpm", ["install", "--offline"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...prePushGateScript.buildRepositoryIndependentEnvironment(), HUSKY: "0" },
        shell: process.platform === "win32",
      });
      expect(lockfileInstall.status).toBe(0);
      writeFileSync(path.join(repositoryRoot, ".gitignore"), ".env*\nnode_modules\ngate-report.json\n");
      runGit(["add", "."], repositoryRoot);
      runGit(["commit", "--quiet", "-m", "gate fixture"], repositoryRoot);
      const pushedOid = runGit(["rev-parse", "HEAD"], repositoryRoot);
      writeFileSync(path.join(repositoryRoot, ".env.local"), "DATABASE_URL=postgresql://local-secret\n");
      // An uncommitted edit forces the worktree strategy for the pushed HEAD.
      writeFileSync(path.join(repositoryRoot, "state.txt"), "uncommitted\n");

      const gateRun = spawnSync(process.execPath, [PRE_PUSH_GATE_SCRIPT_PATH], {
        cwd: repositoryRoot,
        encoding: "utf8",
        input: `refs/heads/main ${pushedOid} refs/heads/main ${ZERO_OID}\n`,
        env: {
          ...prePushGateScript.buildRepositoryIndependentEnvironment(),
          DATABASE_URL: "postgresql://inherited-secret",
          FIXTURE_PROVIDER_TOKEN: "inherited-token",
        },
      });

      expect(gateRun.status, gateRun.stderr).toBe(0);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toEqual({
        environmentFiles: [],
        databaseUrl: prePushGateScript.WORKTREE_ENVIRONMENT_PLACEHOLDERS.DATABASE_URL,
        providerToken: null,
      });
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );

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

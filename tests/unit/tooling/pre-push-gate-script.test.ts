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

type CommitToValidate = { oid: string; refs: string[] };

type PrePushGateScript = {
  parsePushedRefs: (stdinText: string) => PushedRef[];
  isZeroOid: (oid: string) => boolean;
  selectCommitsToValidate: (
    pushedRefs: PushedRef[]
  ) => CommitToValidate[];
  findCommitsOutsideCleanCheckout: (
    commits: CommitToValidate[],
    checkout: { headOid: string; isWorkingTreeClean: boolean }
  ) => CommitToValidate[];
  resolveHeadOid: (repositoryRoot: string) => string;
  isWorkingTreeClean: (repositoryRoot: string) => boolean;
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
    `${JSON.stringify({ name: "gate-fixture", version: "1.0.0", private: true, dependencies })}\n`
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
    `${JSON.stringify({ name: "gate-fixture", private: true, engines: { node: supportedRange } })}\n`
  );
  writeFileSync(path.join(repositoryRoot, ".nvmrc"), `${pinnedVersion}
`);
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "-m", "pins"], repositoryRoot);

  return repositoryRoot;
}

/**
 * Builds a clean repository whose `ci` script writes a report inside the checkout it ran in,
 * so a test can tell whether the gate executed code from the pushed commit.
 */
function createGateFixtureRepository() {
  const { repositoryRoot, firstOid } = createRepositoryWithTwoCommits();
  const reportPath = path.join(repositoryRoot, "gate-report.txt");
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
    'require("node:fs").writeFileSync("gate-report.txt", "ran");\n'
  );
  const lockfileInstall = spawnSync("pnpm", ["install", "--offline"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...prePushGateScript.buildRepositoryIndependentEnvironment(), HUSKY: "0" },
    shell: process.platform === "win32",
  });

  if (lockfileInstall.status !== 0) {
    throw new Error(`fixture pnpm install failed: ${lockfileInstall.stderr}`);
  }

  writeFileSync(path.join(repositoryRoot, ".gitignore"), ".env*\nnode_modules\ngate-report.txt\n");
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "-m", "gate fixture"], repositoryRoot);

  return {
    repositoryRoot,
    firstOid,
    headOid: runGit(["rev-parse", "HEAD"], repositoryRoot),
    reportPath,
  };
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

  it("should accept only the clean HEAD and report every other pushed commit", () => {
    const headCommit = { oid: FIRST_OID, refs: ["refs/heads/current"] };
    const otherCommit = { oid: SECOND_OID, refs: ["refs/heads/other"] };
    const findOutside = prePushGateScript.findCommitsOutsideCleanCheckout;

    expect(findOutside([headCommit], { headOid: FIRST_OID, isWorkingTreeClean: true })).toEqual([]);
    expect(
      findOutside([headCommit, otherCommit], { headOid: FIRST_OID, isWorkingTreeClean: true })
    ).toEqual([otherCommit]);
    expect(findOutside([headCommit], { headOid: FIRST_OID, isWorkingTreeClean: false })).toEqual([
      headCommit,
    ]);
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
      `refs/heads/main ${headOid} refs/heads/main ${ZERO_OID}\n`
    );

    expect(gateRun.status).toBe(1);
    expect(gateRun.stderr).toContain(`Node ${RUNNING_NODE_VERSION}`);
    expect(gateRun.stdout).not.toContain("running the gate");
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

  it(
    "should refuse to run code from a pushed commit that is not the checkout",
    () => {
      const { repositoryRoot, firstOid, reportPath } = createGateFixtureRepository();

      const gateRun = runPrePushGate(
        repositoryRoot,
        `refs/heads/other ${firstOid} refs/heads/other ${ZERO_OID}\n`
      );

      expect(gateRun.status).toBe(1);
      expect(gateRun.stderr).toContain(firstOid);
      expect(gateRun.stderr).toContain("refs/heads/other");
      expect(gateRun.stderr).toContain("checkout");
      expect(existsSync(reportPath)).toBe(false);
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );

  it(
    "should refuse the HEAD while the working tree has uncommitted or untracked changes",
    () => {
      const { repositoryRoot, headOid, reportPath } = createGateFixtureRepository();
      writeFileSync(path.join(repositoryRoot, "untracked.txt"), "not committed\n");

      const gateRun = runPrePushGate(
        repositoryRoot,
        `refs/heads/main ${headOid} refs/heads/main ${ZERO_OID}\n`
      );

      expect(gateRun.status).toBe(1);
      expect(gateRun.stderr).toContain("working tree");
      expect(existsSync(reportPath)).toBe(false);
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );

  it(
    "should run the frozen install and ci in place for the clean HEAD and allow deletions",
    () => {
      const { repositoryRoot, headOid, reportPath } = createGateFixtureRepository();

      const gateRun = runPrePushGate(
        repositoryRoot,
        [
          `(delete) ${ZERO_OID} refs/heads/gone ${FIRST_OID}`,
          `refs/heads/main ${headOid} refs/heads/main ${ZERO_OID}`,
          "",
        ].join("\n")
      );

      expect(gateRun.status, gateRun.stderr).toBe(0);
      expect(readFileSync(reportPath, "utf8")).toBe("ran");
    },
    PNPM_INSTALL_TEST_TIMEOUT_MS
  );

  it("should allow a push that only deletes refs without running the gate", () => {
    const repositoryRoot = createRepositoryWithRuntimePins(
      `>=${RUNNING_NODE_MAJOR} <${RUNNING_NODE_MAJOR + 1}`,
      RUNNING_NODE_VERSION
    );
    writeFileSync(path.join(repositoryRoot, "untracked.txt"), "not committed\n");

    const gateRun = runPrePushGate(
      repositoryRoot,
      `(delete) ${ZERO_OID} refs/heads/gone ${FIRST_OID}\n`
    );

    expect(gateRun.status).toBe(0);
    expect(gateRun.stdout).toContain("no pushed commits to validate");
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

/** @vitest-environment node */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

type StagedMigrationChanges = {
  deletedPaths: string[];
  nonDeletedPaths: string[];
};

type PreCommitMigrationGuardrailsScript = {
  MIGRATION_GUARDRAIL_TEST_FILTERS: string[];
  listStagedMigrationChanges: (
    repositoryRoot: string,
    environment?: NodeJS.ProcessEnv
  ) => StagedMigrationChanges;
  shouldRunGuardrailsForDeletions: (changes: StagedMigrationChanges) => boolean;
  createStagedSnapshot: (
    repositoryRoot: string,
    environment?: NodeJS.ProcessEnv
  ) => string;
  removeStagedSnapshot: (snapshotPath: string) => void;
};

type PrePushGateScript = {
  buildRepositoryIndependentEnvironment: (
    environment?: Record<string, string | undefined>
  ) => NodeJS.ProcessEnv;
};

const FIRST_MIGRATION_PATH = "database/migrations/20260101000000_first.sql";
const SECOND_MIGRATION_PATH = "database/migrations/20260102000000_second.sql";

let guardrailsScript: PreCommitMigrationGuardrailsScript;
let repositoryIndependentEnvironment: NodeJS.ProcessEnv;
const temporaryDirectories: string[] = [];

function runGit(gitArguments: string[], workingDirectory: string): string {
  // Hooks export GIT_DIR/GIT_INDEX_FILE; fixtures must target their own repository.
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: repositoryIndependentEnvironment,
  });

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function createRepositoryWithMigrations(): string {
  const repositoryRoot = mkdtempSync(
    path.join(os.tmpdir(), "pre-commit-migrations-test-")
  );
  temporaryDirectories.push(repositoryRoot);

  runGit(["init", "--quiet"], repositoryRoot);
  runGit(["config", "user.email", "gate@example.test"], repositoryRoot);
  runGit(["config", "user.name", "Gate Test"], repositoryRoot);
  runGit(["config", "commit.gpgsign", "false"], repositoryRoot);
  runGit(["config", "core.autocrlf", "false"], repositoryRoot);
  runGit(["config", "core.hooksPath", "no-hooks"], repositoryRoot);
  mkdirSync(path.join(repositoryRoot, "database", "migrations"), {
    recursive: true,
  });
  writeFileSync(path.join(repositoryRoot, FIRST_MIGRATION_PATH), "SELECT 1;\n");
  writeFileSync(path.join(repositoryRoot, SECOND_MIGRATION_PATH), "SELECT 2;\n");
  writeFileSync(path.join(repositoryRoot, "README.md"), "fixture\n");
  runGit(["add", "."], repositoryRoot);
  runGit(["commit", "--quiet", "-m", "initial"], repositoryRoot);

  return repositoryRoot;
}

describe("pre-commit migration guardrails script", () => {
  beforeAll(async () => {
    const prePushGateScript = (await import(
      "../../../scripts/pre-push-gate.mjs"
    )) as unknown as PrePushGateScript;
    repositoryIndependentEnvironment =
      prePushGateScript.buildRepositoryIndependentEnvironment();
    guardrailsScript = (await import(
      "../../../scripts/pre-commit-migration-guardrails.mjs"
    )) as unknown as PreCommitMigrationGuardrailsScript;
  });

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("should report a staged migration deletion that lint-staged cannot see", () => {
    const repositoryRoot = createRepositoryWithMigrations();
    runGit(["rm", "--quiet", FIRST_MIGRATION_PATH], repositoryRoot);

    const changes = guardrailsScript.listStagedMigrationChanges(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    expect(changes).toEqual({
      deletedPaths: [FIRST_MIGRATION_PATH],
      nonDeletedPaths: [],
    });
    expect(guardrailsScript.shouldRunGuardrailsForDeletions(changes)).toBe(true);
  });

  it("should leave mixed migration changes to lint-staged to avoid a duplicate run", () => {
    const repositoryRoot = createRepositoryWithMigrations();
    runGit(["rm", "--quiet", FIRST_MIGRATION_PATH], repositoryRoot);
    writeFileSync(path.join(repositoryRoot, SECOND_MIGRATION_PATH), "SELECT 3;\n");
    runGit(["add", SECOND_MIGRATION_PATH], repositoryRoot);

    const changes = guardrailsScript.listStagedMigrationChanges(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    expect(changes).toEqual({
      deletedPaths: [FIRST_MIGRATION_PATH],
      nonDeletedPaths: [SECOND_MIGRATION_PATH],
    });
    expect(guardrailsScript.shouldRunGuardrailsForDeletions(changes)).toBe(false);
  });

  it("should skip the guardrails when no migration is staged", () => {
    const repositoryRoot = createRepositoryWithMigrations();
    writeFileSync(path.join(repositoryRoot, "README.md"), "changed\n");
    runGit(["add", "README.md"], repositoryRoot);
    // Unstaged deletions are not part of the commit and must not trigger the suites.
    rmSync(path.join(repositoryRoot, FIRST_MIGRATION_PATH));

    const changes = guardrailsScript.listStagedMigrationChanges(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    expect(changes).toEqual({ deletedPaths: [], nonDeletedPaths: [] });
    expect(guardrailsScript.shouldRunGuardrailsForDeletions(changes)).toBe(false);
  });

  it("should snapshot the staged index instead of the live working tree", () => {
    const repositoryRoot = createRepositoryWithMigrations();
    runGit(["rm", "--quiet", FIRST_MIGRATION_PATH], repositoryRoot);
    // The deleted migration comes back as an untracked file and README gets an
    // unstaged edit; neither is part of the commit being validated.
    writeFileSync(path.join(repositoryRoot, FIRST_MIGRATION_PATH), "SELECT 1;\n");
    writeFileSync(path.join(repositoryRoot, "README.md"), "unstaged edit\n");

    const snapshotPath = guardrailsScript.createStagedSnapshot(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    try {
      expect(existsSync(path.join(snapshotPath, FIRST_MIGRATION_PATH))).toBe(false);
      expect(
        readFileSync(path.join(snapshotPath, SECOND_MIGRATION_PATH), "utf8")
      ).toBe("SELECT 2;\n");
      expect(readFileSync(path.join(snapshotPath, "README.md"), "utf8")).toBe(
        "fixture\n"
      );
    } finally {
      guardrailsScript.removeStagedSnapshot(snapshotPath);
    }

    expect(existsSync(snapshotPath)).toBe(false);
  });

  it("should reuse the installed node_modules without deleting them on cleanup", () => {
    const repositoryRoot = createRepositoryWithMigrations();
    const installedPackageFile = path.join(
      repositoryRoot,
      "node_modules",
      "fixture-package",
      "index.js"
    );
    mkdirSync(path.dirname(installedPackageFile), { recursive: true });
    writeFileSync(installedPackageFile, "module.exports = 1;\n");
    runGit(["rm", "--quiet", FIRST_MIGRATION_PATH], repositoryRoot);

    const snapshotPath = guardrailsScript.createStagedSnapshot(
      repositoryRoot,
      repositoryIndependentEnvironment
    );

    try {
      expect(
        readFileSync(
          path.join(snapshotPath, "node_modules", "fixture-package", "index.js"),
          "utf8"
        )
      ).toBe("module.exports = 1;\n");
    } finally {
      guardrailsScript.removeStagedSnapshot(snapshotPath);
    }

    expect(existsSync(snapshotPath)).toBe(false);
    expect(readFileSync(installedPackageFile, "utf8")).toBe("module.exports = 1;\n");
  });

  it("should expose guardrail filters that match existing test suites", () => {
    // This suite also runs inside the staged snapshot, where `pnpm exec` would
    // reinstall into the linked node_modules; call the Vitest CLI directly.
    const listedTests = spawnSync(
      process.execPath,
      [
        path.join("node_modules", "vitest", "vitest.mjs"),
        "list",
        "--filesOnly",
        ...guardrailsScript.MIGRATION_GUARDRAIL_TEST_FILTERS,
      ],
      {
        encoding: "utf8",
        env: repositoryIndependentEnvironment,
      }
    );

    expect(listedTests.status).toBe(0);
    for (const filter of guardrailsScript.MIGRATION_GUARDRAIL_TEST_FILTERS) {
      expect(listedTests.stdout).toContain(filter);
    }
  });
});

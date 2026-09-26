/** @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import createVersionConfig from "../../../beez-rp.config.mjs";
import {
  MIGRATION_STATUS,
  describeDatabaseHost,
  findPendingMigrations,
  mergeMigrationJournals,
  parseMigrationJournal,
  readMigrationJournalAt,
} from "../../../scripts/release/pending-migrations.mjs";

/** Real Git fixtures with a bare remote can exceed the default timeout on Windows. */
const GIT_FIXTURE_TEST_TIMEOUT_MS = 60_000;

/** Git variables exported by hooks that would redirect fixture commands. */
const GIT_HOOK_ENVIRONMENT_VARIABLES = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"];

/** Loopback port nothing listens on, so the database query fails fast without leaving the machine. */
const UNREACHABLE_DATABASE_URL = "postgresql://release:secret@127.0.0.1:1/tutribu";

type JournalEntry = { tag: string; when: number };

type HookContext = {
  repositoryRoot: string;
  version: string | null;
  git: { git: (gitArguments: string[]) => Promise<string>; tryGit: (gitArguments: string[]) => Promise<string | null> };
  run: (commandLine: string) => Promise<number>;
  print: (text?: string) => void;
  fail: (message: string, hint: string) => never;
};

type MigrationsAdapter = {
  check: (context: HookContext) => Promise<{ status: string; pending: string[]; target: string | null; reason: string | null }>;
  apply: (context: HookContext) => Promise<void>;
  targetHint?: string;
};

const temporaryDirectories: string[] = [];

function createFixtureEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, HUSKY: "0" };

  for (const variableName of GIT_HOOK_ENVIRONMENT_VARIABLES) {
    delete environment[variableName];
  }

  return environment;
}

function runGit(gitArguments: string[], workingDirectory: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: createFixtureEnvironment(),
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runGitOrThrow(gitArguments: string[], workingDirectory: string): string {
  const result = runGit(gitArguments, workingDirectory);

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed in ${workingDirectory}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

/** Git reader with the contract `beez-rp create-version` passes to hooks. */
function createGitReader(repositoryRoot: string): HookContext["git"] {
  return {
    git: async (gitArguments) => runGitOrThrow(gitArguments, repositoryRoot),
    tryGit: async (gitArguments) => {
      const result = runGit(gitArguments, repositoryRoot);
      return result.status === 0 ? result.stdout : null;
    },
  };
}

function writeJournal(repositoryRoot: string, entries: JournalEntry[]): void {
  const journalDirectory = path.join(repositoryRoot, "database", "migrations", "meta");
  mkdirSync(journalDirectory, { recursive: true });
  writeFileSync(path.join(journalDirectory, "_journal.json"), JSON.stringify({ entries }));
}

function commitAll(repositoryRoot: string, message: string): void {
  runGitOrThrow(["add", "-A"], repositoryRoot);
  runGitOrThrow(["commit", "--quiet", "-m", message], repositoryRoot);
}

/**
 * Creates a bare `origin` whose `main` has a baseline migration and a clone on
 * a feature branch that adds a second migration not yet on `origin/main`.
 */
function createRepositoryWithFeatureMigration(): string {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "pending-migrations-"));
  temporaryDirectories.push(fixtureRoot);
  const remoteRoot = path.join(fixtureRoot, "origin.git");
  const repositoryRoot = path.join(fixtureRoot, "work");

  runGitOrThrow(["init", "--quiet", "--bare", "--initial-branch=main", remoteRoot], fixtureRoot);
  runGitOrThrow(["clone", "--quiet", remoteRoot, repositoryRoot], fixtureRoot);
  runGitOrThrow(["config", "user.email", "release@example.test"], repositoryRoot);
  runGitOrThrow(["config", "user.name", "Release Fixture"], repositoryRoot);
  runGitOrThrow(["symbolic-ref", "HEAD", "refs/heads/main"], repositoryRoot);

  writeJournal(repositoryRoot, [{ tag: "0000_baseline", when: 1 }]);
  commitAll(repositoryRoot, "feat: add baseline");
  runGitOrThrow(["push", "--quiet", "origin", "main"], repositoryRoot);

  runGitOrThrow(["switch", "--quiet", "-c", "feature/waitlist"], repositoryRoot);
  writeJournal(repositoryRoot, [
    { tag: "0000_baseline", when: 1 },
    { tag: "0001_add_waitlist", when: 2 },
  ]);
  commitAll(repositoryRoot, "feat: add waitlist table");

  return repositoryRoot;
}

function createHookContext(repositoryRoot: string, run: HookContext["run"] = async () => 0): HookContext {
  return {
    repositoryRoot,
    version: null,
    git: createGitReader(repositoryRoot),
    run,
    print: () => {},
    fail: (message, hint) => {
      throw new Error(`${message} ${hint}`);
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("pending migrations", () => {
  it("should list journal entries newer than the last applied migration", () => {
    const journal = parseMigrationJournal(
      JSON.stringify({ entries: [{ tag: "b", when: 20 }, { tag: "a", when: 10 }, { tag: "c", when: 30 }] })
    );

    expect(findPendingMigrations(journal, 20)).toEqual(["c"]);
    expect(findPendingMigrations(journal, null)).toEqual(["a", "b", "c"]);
  });

  it("should merge journals from several revisions without duplicates", () => {
    expect(
      mergeMigrationJournals([
        [{ tag: "a", when: 1 }],
        [
          { tag: "a", when: 1 },
          { tag: "b", when: 2 },
        ],
      ]).map((entry) => entry.tag)
    ).toEqual(["a", "b"]);
  });

  it("should expose only the database host, never the credentials", () => {
    expect(describeDatabaseHost("postgresql://user:secret@ep-demo.neon.tech/db?sslmode=require")).toBe(
      "ep-demo.neon.tech"
    );
    expect(describeDatabaseHost("not a url")).toBe("host desconocido");
  });

  it(
    "should merge the journal of the branch with the one about to land on origin/main",
    async () => {
      const repositoryRoot = createRepositoryWithFeatureMigration();

      const entries = await readMigrationJournalAt(createGitReader(repositoryRoot), ["HEAD", "origin/main", "missing-revision"]);

      expect(entries.map((entry: JournalEntry) => entry.tag)).toEqual(["0000_baseline", "0001_add_waitlist"]);
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );
});

describe("beez-rp create-version config", () => {
  const migrations = createVersionConfig.migrations as unknown as MigrationsAdapter;

  it(
    "should report the database host as target and never throw when the database is unreachable",
    async () => {
      const repositoryRoot = createRepositoryWithFeatureMigration();
      writeFileSync(path.join(repositoryRoot, ".env"), `DATABASE_MIGRATION_URL=${UNREACHABLE_DATABASE_URL}\n`);

      const result = await migrations.check(createHookContext(repositoryRoot));

      expect(result).toEqual({
        status: MIGRATION_STATUS.unknown,
        pending: [],
        target: "127.0.0.1",
        reason: expect.stringContaining("falló la consulta a 127.0.0.1"),
      });
      expect(JSON.stringify(result)).not.toContain("secret");
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it("should run the migration script and stop the step when it fails", async () => {
    const executedCommands: string[] = [];
    const failingContext = createHookContext(process.cwd(), async (commandLine) => {
      executedCommands.push(commandLine);
      return 1;
    });

    await expect(migrations.apply(failingContext)).rejects.toThrow("drizzle-kit migrate falló con código 1.");
    expect(executedCommands).toEqual([`"${process.execPath}" scripts/push-migrations.js`]);
    await expect(migrations.apply(createHookContext(process.cwd()))).resolves.toBeUndefined();
  });
});

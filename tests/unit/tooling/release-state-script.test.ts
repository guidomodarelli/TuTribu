/** @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  describeDatabaseHost,
  findPendingMigrations,
  mergeMigrationJournals,
  parseMigrationJournal,
} from "../../../scripts/release/pending-migrations.mjs";
import { MIGRATION_STATUS } from "../../../scripts/release/release-plan.mjs";
import { collectReleaseState } from "../../../scripts/release/release-state.mjs";

/** Real Git fixtures with a bare remote can exceed the default timeout on Windows. */
const GIT_FIXTURE_TEST_TIMEOUT_MS = 60_000;

/** Git variables exported by hooks that would redirect fixture commands. */
const GIT_HOOK_ENVIRONMENT_VARIABLES = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"];

const temporaryDirectories: string[] = [];

function createFixtureEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, HUSKY: "0" };

  for (const variableName of GIT_HOOK_ENVIRONMENT_VARIABLES) {
    delete environment[variableName];
  }

  return environment;
}

function runGit(gitArguments: string[], workingDirectory: string): string {
  const result = spawnSync("git", gitArguments, {
    cwd: workingDirectory,
    encoding: "utf8",
    env: createFixtureEnvironment(),
  });

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function writeManifest(repositoryRoot: string, version: string): void {
  writeFileSync(path.join(repositoryRoot, "package.json"), `${JSON.stringify({ name: "fixture", version }, null, 2)}\n`);
}

function commitAll(repositoryRoot: string, message: string): void {
  runGit(["add", "-A"], repositoryRoot);
  runGit(["commit", "--quiet", "-m", message], repositoryRoot);
}

function writeJournal(repositoryRoot: string, entries: { tag: string; when: number }[]): void {
  const journalDirectory = path.join(repositoryRoot, "database", "migrations", "meta");
  mkdirSync(journalDirectory, { recursive: true });
  writeFileSync(path.join(journalDirectory, "_journal.json"), JSON.stringify({ entries }));
}

/** Creates a bare `origin` and a clone whose `main` holds a `0.1.0` release plus one feature commit. */
function createReleasedRepository(): { repositoryRoot: string; remoteRoot: string } {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "release-state-"));
  temporaryDirectories.push(fixtureRoot);
  const remoteRoot = path.join(fixtureRoot, "origin.git");
  const repositoryRoot = path.join(fixtureRoot, "work");

  runGit(["init", "--quiet", "--bare", "--initial-branch=main", remoteRoot], fixtureRoot);
  runGit(["clone", "--quiet", remoteRoot, repositoryRoot], fixtureRoot);
  runGit(["config", "user.email", "release@example.test"], repositoryRoot);
  runGit(["config", "user.name", "Release Fixture"], repositoryRoot);
  runGit(["symbolic-ref", "HEAD", "refs/heads/main"], repositoryRoot);

  writeManifest(repositoryRoot, "0.1.0");
  writeJournal(repositoryRoot, [{ tag: "0000_baseline", when: 1 }]);
  commitAll(repositoryRoot, "0.1.0");
  writeFileSync(path.join(repositoryRoot, "feature.txt"), "waitlist\n");
  commitAll(repositoryRoot, "feat: add waitlist");
  runGit(["push", "--quiet", "origin", "main"], repositoryRoot);

  return { repositoryRoot, remoteRoot };
}

async function collect(repositoryRoot: string) {
  return collectReleaseState({
    repositoryRoot,
    checkMigrations: async ({ journalEntries }) => ({
      status: MIGRATION_STATUS.pending,
      pending: findPendingMigrations(journalEntries, 1),
      databaseHost: "db.example.test",
      reason: null,
    }),
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release state", () => {
  it(
    "should report the last release commit and the commits published after it",
    async () => {
      const { repositoryRoot } = createReleasedRepository();

      const state = await collect(repositoryRoot);

      expect(state.currentBranch).toBe("main");
      expect(state.workingTreeChanges).toEqual([]);
      expect(state.lastRelease).toEqual({ sha: expect.any(String), version: "0.1.0" });
      expect(state.releasedVersion).toBe("0.1.0");
      expect(state.unreleasedCommits.map((commit) => commit.subject)).toEqual(["feat: add waitlist"]);
      expect(state.main).toEqual({ aheadCommits: [], behindCount: 0 });
      expect(state.unpushedRelease).toBeNull();
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it(
    "should detect a local release commit that never reached origin",
    async () => {
      const { repositoryRoot } = createReleasedRepository();
      writeManifest(repositoryRoot, "0.2.0");
      commitAll(repositoryRoot, "0.2.0");

      const state = await collect(repositoryRoot);

      expect(state.unpushedRelease).toEqual({ version: "0.2.0", tag: "v0.2.0" });
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it(
    "should see commits other clones pushed and migrations that are about to land",
    async () => {
      const { repositoryRoot, remoteRoot } = createReleasedRepository();
      const otherClone = path.join(path.dirname(remoteRoot), "other");
      runGit(["clone", "--quiet", remoteRoot, otherClone], path.dirname(remoteRoot));
      runGit(["config", "user.email", "other@example.test"], otherClone);
      runGit(["config", "user.name", "Other"], otherClone);
      writeJournal(otherClone, [
        { tag: "0000_baseline", when: 1 },
        { tag: "0001_add_waitlist", when: 2 },
      ]);
      commitAll(otherClone, "feat: add waitlist table");
      runGit(["push", "--quiet", "origin", "main"], otherClone);
      writeFileSync(path.join(repositoryRoot, "draft.txt"), "wip\n");

      const state = await collect(repositoryRoot);

      expect(state.main.behindCount).toBe(1);
      expect(state.unreleasedCommits).toHaveLength(2);
      expect(state.workingTreeChanges).toEqual(["?? draft.txt"]);
      expect(state.migrations.pending).toEqual(["0001_add_waitlist"]);
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );
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
});

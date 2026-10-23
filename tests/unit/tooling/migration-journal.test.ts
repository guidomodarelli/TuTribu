/** @vitest-environment node */
/** Keeps every versioned SQL migration reachable by `drizzle-kit migrate`, which only applies journal entries newer than the last applied one. @module migration-journal-tests */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATION_JOURNAL_PATH, parseMigrationJournal, findPendingMigrations } from "@/scripts/release/pending-migrations.mjs";

const MIGRATIONS_DIRECTORY = "database/migrations";
const SQL_EXTENSION = ".sql";

/** @returns The repository journal entries and the migration tags present as SQL files. */
function readRepositoryMigrations() {
  const journal = parseMigrationJournal(readFileSync(path.resolve(MIGRATION_JOURNAL_PATH), "utf8"));
  const files = readdirSync(path.resolve(MIGRATIONS_DIRECTORY)).filter((name) => name.endsWith(SQL_EXTENSION)).map((name) => name.slice(0, -SQL_EXTENSION.length));
  return { journal, files };
}

describe("versioned migration journal", () => {
  it("should register every SQL migration so drizzle-kit applies it", () => {
    const { journal, files } = readRepositoryMigrations();
    expect(journal.map((entry) => entry.tag).toSorted()).toEqual(files.toSorted());
  });

  it("should give each migration a newer timestamp so none is skipped after the previous one is applied", () => {
    const { journal } = readRepositoryMigrations();
    for (const [index, entry] of journal.entries()) {
      if (index === 0) continue;
      const previous = journal[index - 1];
      expect(findPendingMigrations(journal, previous.when), `${entry.tag} must be pending once ${previous.tag} is applied`).toContain(entry.tag);
    }
  });
});

/** Applies a genuine migration prefix so historical private material predates its insert-time guard. @module admission-retention-migration-prefix */
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { sql } from "drizzle-orm";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { executeAdmissionMigrationCommand } from "./admission-migration-command";
import { ADMISSION_RETENTION_COMPOSITION_FIXTURE } from "./constants/admission-retention-composition";

/** Models only the repository-owned journal fields consumed to retain original order and migration times. */
type MigrationJournal = { version: string; dialect: string; entries: { tag: string; when: number; idx: number; version: string; breakpoints: boolean }[] };

/**
 * The owned branch clones the default branch, which already registers the current journal: a prefix migration would then be a no-op
 * and every later guard would already reject the historical rows. When the cutoff is registered, this drops only the owned branch's
 * application schemas so the prefix really installs the schema as it was before the cutoff.
 * @param database - Verified owned branch; never the default branch.
 * @param cutoffWhen - Original journal time of the first artifact the fixture leaves pending.
 * @returns Nothing after the branch has no registered migration at or after the cutoff.
 */
async function resetRegisteredCutoff(database: AcademyAdmissionTestDatabase, cutoffWhen: number): Promise<void> {
  await database.withContext({ userId: null, email: null }, async (transaction) => {
    const historyExists = (await transaction.execute<{ ready: boolean }>(sql`select to_regclass('drizzle.__drizzle_migrations') is not null as ready`)).rows[0].ready;
    if (!historyExists) return;
    const registered = (await transaction.execute(sql`select 1 from drizzle.__drizzle_migrations where created_at>=${cutoffWhen} limit 1`)).rows.length > 0;
    if (!registered) return;
    await transaction.execute(sql.raw("drop schema drizzle cascade"));
    await transaction.execute(sql.raw("drop schema public cascade"));
    await transaction.execute(sql.raw("create schema public"));
    await transaction.execute(sql.raw("grant usage on schema public to public"));
    await transaction.execute(sql.raw(`grant usage on schema public to "${database.nonBypassRole.name}"`));
  });
}

/**
 * Prepares the real schema before a historical row's guard, without disabling a trigger or rewriting timestamps.
 * @param database - Verified owned branch; the migration URL stays only in the child environment.
 * @param cutoffMigrationTag - First artifact deliberately left pending; defaults to the temporary-import retention guard.
 * @returns After the actual Drizzle CLI has committed the unchanged journal prefix.
 * @throws When the cutoff is absent, migration fails or cleanup cannot prove its own temporary directory.
 */
export async function applyAdmissionRetentionHistoricalPrefix(database: AcademyAdmissionTestDatabase, cutoffMigrationTag: string = ADMISSION_RETENTION_COMPOSITION_FIXTURE.importRetentionMigrationTag): Promise<void> {
  const settings = ADMISSION_RETENTION_COMPOSITION_FIXTURE;
  const sourceDirectory = resolve(settings.migrationDirectory);
  const journal = JSON.parse(await readFile(join(sourceDirectory, settings.journalRelativePath), "utf8")) as MigrationJournal;
  const cutoff = journal.entries.findIndex((entry) => entry.tag === cutoffMigrationTag);
  if (cutoff < 1) throw new Error("AdmissionRetentionFixture.prepare failed: migration_cutoff_missing");
  const entries = journal.entries.slice(0, cutoff);
  await resetRegisteredCutoff(database, journal.entries[cutoff].when);
  const directory = await mkdtemp(join(tmpdir(), settings.prefixDirectoryName));
  let migrationFailed = false, migrationError: unknown;
  try {
    await mkdir(join(directory, "meta"));
    await writeFile(join(directory, settings.journalRelativePath), JSON.stringify({ ...journal, entries }), "utf8");
    for (const entry of entries) await copyFile(join(sourceDirectory, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    const configPath = join(directory, settings.prefixConfigName);
    const sourceConfig = resolve(settings.defaultConfigPath).replaceAll("\\", "/");
    await writeFile(configPath, `import baseConfig from ${JSON.stringify(sourceConfig)};\nexport default { ...baseConfig, out: ${JSON.stringify(directory)} };\n`, "utf8");
    await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }, [resolve(settings.drizzleCliPath), "migrate", "--config", configPath]));
  } catch (error) {
    migrationFailed = true;
    migrationError = error;
  }
  // Cleanup always runs and its own failure takes precedence over the migration failure.
  const resolvedDirectory = resolve(directory), temporaryRoot = resolve(tmpdir());
  if (!resolvedDirectory.toLowerCase().startsWith(`${temporaryRoot.toLowerCase()}${sep}`) || !basename(resolvedDirectory).startsWith(settings.prefixDirectoryName)) throw new Error("AdmissionRetentionFixture.cleanup failed: unowned_directory");
  await rm(resolvedDirectory, { recursive: true, force: true });
  if (migrationFailed) throw migrationError;
}

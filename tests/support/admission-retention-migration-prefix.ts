/** Applies a genuine migration prefix so historical CSV material predates the insert-time expiry guard. @module admission-retention-migration-prefix */
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { executeAdmissionMigrationCommand } from "./admission-migration-command";
import { ADMISSION_RETENTION_COMPOSITION_FIXTURE } from "./constants/admission-retention-composition";

/** Models only the repository-owned journal fields consumed to retain original order and migration times. */
type MigrationJournal = { version: string; dialect: string; entries: { tag: string; when: number; idx: number; version: string; breakpoints: boolean }[] };

/**
 * Creates old rows before their real guard migration, without disabling a trigger or changing an original timestamp.
 * @param database - Verified owned branch; the migration URL stays only in the child environment.
 * @returns After the actual Drizzle CLI has committed the unchanged journal prefix.
 * @throws When the cutoff is absent, migration fails or cleanup cannot prove its own temporary directory.
 */
export async function applyAdmissionRetentionHistoricalPrefix(database: AcademyAdmissionTestDatabase): Promise<void> {
  const settings = ADMISSION_RETENTION_COMPOSITION_FIXTURE;
  const sourceDirectory = resolve(settings.migrationDirectory);
  const journal = JSON.parse(await readFile(join(sourceDirectory, settings.journalRelativePath), "utf8")) as MigrationJournal;
  const cutoff = journal.entries.findIndex((entry) => entry.tag === settings.importRetentionMigrationTag);
  if (cutoff < 1) throw new Error("AdmissionRetentionFixture.prepare failed: migration_cutoff_missing");
  const entries = journal.entries.slice(0, cutoff);
  const directory = await mkdtemp(join(tmpdir(), settings.prefixDirectoryName));
  try {
    await mkdir(join(directory, "meta"));
    await writeFile(join(directory, settings.journalRelativePath), JSON.stringify({ ...journal, entries }), "utf8");
    for (const entry of entries) await copyFile(join(sourceDirectory, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    const configPath = join(directory, settings.prefixConfigName);
    const sourceConfig = resolve(settings.defaultConfigPath).replaceAll("\\", "/");
    await writeFile(configPath, `import baseConfig from ${JSON.stringify(sourceConfig)};\nexport default { ...baseConfig, out: ${JSON.stringify(directory)} };\n`, "utf8");
    await database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }, [resolve(settings.drizzleCliPath), "migrate", "--config", configPath]));
  } finally {
    const resolvedDirectory = resolve(directory), temporaryRoot = resolve(tmpdir());
    if (!resolvedDirectory.toLowerCase().startsWith(`${temporaryRoot.toLowerCase()}${sep}`) || !basename(resolvedDirectory).startsWith(settings.prefixDirectoryName)) throw new Error("AdmissionRetentionFixture.cleanup failed: unowned_directory");
    await rm(resolvedDirectory, { recursive: true, force: true });
  }
}

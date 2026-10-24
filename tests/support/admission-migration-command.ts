/** Runs an owned migration fixture without propagating private child-process output. @module admission-migration-command */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";

/**
 * Runs the exact migration command with explicit owned environment and bounded observation.
 * @param environment - URLs supplied by the verified disposable branch; retained in memory only.
 * @param commandArguments - Trusted test script arguments; defaults to the actual migration entrypoint.
 * @returns Nothing after a successful child process; output remains private.
 * @throws An observation-safe error with only exit metadata, never stdout/stderr or the original cause.
 */
export async function executeAdmissionMigrationCommand(environment: Readonly<Record<string, string | undefined>>, commandArguments: readonly string[] = ["scripts/push-migrations.js"]): Promise<void> {
  try {
    await promisify(execFile)(process.execPath, [...commandArguments], { cwd: process.cwd(), env: { ...process.env, ...environment }, timeout: 120_000, maxBuffer: 1_000_000, windowsHide: true });
  } catch (error) {
    const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const processCode = typeof rawCode === "number" && Number.isSafeInteger(rawCode) ? rawCode : typeof rawCode === "string" && /^[A-Z_]+$/u.test(rawCode) ? rawCode : "unavailable";
    const safeCause = new Error(`Owned migration process failed: exit=${String(processCode)}`);
    throw new Error(`Owned feature migration command failed: exit=${String(processCode)}`, { cause: safeCause });
  }
}

/**
 * Applies the real pending migration journal to an owned branch, so native suites read every current SQL function instead of a frozen subset.
 * @param database - Verified owned branch; its private connection is reused as the migration URL and stays in memory.
 * @returns Nothing after the actual migration entrypoint registered every journal entry on that branch.
 * @throws The observation-safe migration failure from {@link executeAdmissionMigrationCommand}.
 */
export function applyAdmissionMigrationJournal(database: Pick<AcademyAdmissionTestDatabase, "withServerEnvironment">): Promise<void> {
  return database.withServerEnvironment((environment) => executeAdmissionMigrationCommand({ ...environment, DATABASE_MIGRATION_URL: environment.DATABASE_URL }));
}

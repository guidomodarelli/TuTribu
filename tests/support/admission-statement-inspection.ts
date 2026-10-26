/** Runs the official read-only inspector on exactly the disposable workload branch. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AcademyAdmissionTestDatabase } from "./academy-admission-database";
import { ADMISSION_NEON_PROJECT_ID } from "./constants/academy-admission-database";
import { ADMISSION_NODE_HOST } from "./constants/admission-node-host";
import { ADMISSION_STATEMENT_PROFILE } from "./constants/admission-statement-profile";
import { projectAdmissionStatementProfile } from "./admission-statement-profile";
import { readPostgresTestDiagnostics } from "./postgres-test-diagnostics";
import { resolveNeonCliEntrypoint } from "./neon-cli-entrypoint";

const execute = promisify(execFile);
/**
 * Captures numeric outliers without putting a DSN in CLI arguments or retaining upstream SQL.
 * @param database - Live capability supplied by the owned disposable-branch harness.
 * @returns An explicit available/unavailable result; the caller must persist and assert its status.
 */
export async function inspectAdmissionDatabaseStatements(database: AcademyAdmissionTestDatabase) {
  try {
    const cli = await resolveNeonCliEntrypoint();
    if (database.branch.isDefault !== false) throw new Error("Native inspector owned scope unavailable");
    return await database.withServerEnvironment(async (environment) => {
      const selected = new URL(environment.DATABASE_URL);
      const result = await execute(process.execPath, [cli, "inspect", "db", "outliers", "--project-id", ADMISSION_NEON_PROJECT_ID, "--branch", database.branch.id, "--database-name", decodeURIComponent(selected.pathname.slice(1)), "--role-name", decodeURIComponent(selected.username), "--profile", "DEFAULT", "--output", "json"], { windowsHide: true, timeout: ADMISSION_NODE_HOST.deploymentTimeoutMs, maxBuffer: ADMISSION_STATEMENT_PROFILE.maximumOutputBytes });
      return { status: ADMISSION_STATEMENT_PROFILE.availableStatus, ...projectAdmissionStatementProfile(JSON.parse(result.stdout)) };
    });
  } catch (error) {
    // CLI errors may retain stdout with SQL literals; never propagate that object to Vitest reports.
    return { status: ADMISSION_STATEMENT_PROFILE.unavailableStatus, operation: ADMISSION_STATEMENT_PROFILE.source, code: ADMISSION_STATEMENT_PROFILE.unavailable, ...readPostgresTestDiagnostics(error) };
  }
}

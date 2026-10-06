/**
 * Provides guarded SQL tests exclusively on a disposable branch owned by this run.
 *
 * @module academy-admission-database
 */
import { randomUUID } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";

import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import {
  runWithGuardedTransaction,
  type RequestDatabase,
  type RequestDatabaseContext,
} from "@/src/modules/shared/infrastructure/database/server-database-client";
import { getServerDatabaseEnvironment } from "@/src/modules/shared/infrastructure/database/server-environment";
import { NEON_AUTHORIZATION_EXPIRY_MARGIN_MS, resolveNeonAuthorization, type NeonCliValidationCredentials } from "./neon-authorization";

/** Fixes the project allowed by the repository's standing validation authorization. */
const ADMISSION_NEON_PROJECT_ID = "cold-firefly-92947172";
/** Bounds administrative HTTP requests without retrying uncertain mutations. */
const NEON_ADMIN_TIMEOUT_MS = 15_000;
const runExecutable = promisify(execFile);

/** Describes consumed branch metadata; no provider schema validation is performed. */
type NeonBranch = { id: string; name: string; parent_id: string; default: boolean };
/** Records actual role flags rather than assuming that RLS protects runtime writes. */
type DatabaseRole = { name: string; bypassesRls: boolean; isSuperuser: boolean };

/** Supplies an explicit administrative boundary for controlled recovery tests. */
export type AcademyAdmissionDatabaseOptions = {
  authorization?: string;
  databaseSelection?: { databaseName: string; roleName: string };
  fetch?: typeof globalThis.fetch;
};

/** Exposes only branch-scoped SQL execution and safe resource metadata. */
export type AcademyAdmissionTestDatabase = {
  branch: { id: string; name: string; parentId: string; isDefault: false };
  runtimeRole: DatabaseRole;
  nonBypassRole: DatabaseRole;
  withContext: <Result>(
    context: RequestDatabaseContext,
    run: (database: RequestDatabase) => Promise<Result>,
    role?: "runtime" | "non_bypass",
  ) => Promise<Result>;
  applyMigration: (fileName: string) => Promise<void>;
  grantTablesToNonBypass: (tableNames: readonly string[]) => Promise<void>;
};

/**
 * Resolves local authorization through the native CLI's profile manager.
 *
 * The CLI owns locked rotating-token renewal and persistence. This harness
 * neither refreshes tokens itself nor logs credentials or command output.
 *
 * @returns The configured API key or current Neon CLI access token.
 * @throws When local authentication is absent or unusable.
 */
async function readNeonAuthorization(): Promise<string> {
  if (process.env.NEON_API_KEY?.trim()) return process.env.NEON_API_KEY.trim();
  const credentialPath = join(homedir(), ".config", "neonctl", "credentials.json");
  const readCredentials = async () => JSON.parse(await readFile(credentialPath, "utf8")) as NeonCliValidationCredentials;
  const credentials = await readCredentials();
  const remainingMs = typeof credentials.expires_at === "number" ? credentials.expires_at - Date.now() : 0;
  // The official manager renews only expired tokens. Wait for the short remaining
  // lifetime instead of forcing a grant or changing the CLI. No SQL transaction
  // is held here; each administrative request, including cleanup, resolves anew.
  if (remainingMs > 0 && remainingMs <= NEON_AUTHORIZATION_EXPIRY_MARGIN_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
  }
  return resolveNeonAuthorization(await readCredentials(), async () => {
    const entrypoint = await findNeonCliEntrypoint();
    // Native CLI owns its refresh lock and rotating-token persistence. Do not
    // issue a manual OAuth refresh and discard the returned replacement token.
    await runExecutable(process.execPath, [entrypoint, "projects", "get", ADMISSION_NEON_PROJECT_ID, "--profile", "DEFAULT", "--output", "json"], {
      windowsHide: true,
      timeout: NEON_ADMIN_TIMEOUT_MS,
    });
    return readCredentials();
  });
}

/**
 * Finds the installed native CLI without a repository dependency or user-specific path.
 *
 * @returns A verified JavaScript entrypoint for the installed Neon CLI.
 * @throws When no CLI is available and an explicit NEON_CLI_PATH is needed.
 */
async function findNeonCliEntrypoint(): Promise<string> {
  if (process.env.NEON_CLI_PATH) {
    await access(process.env.NEON_CLI_PATH);
    return process.env.NEON_CLI_PATH;
  }
  for (const directory of (process.env.PATH ?? process.env.Path ?? "").split(delimiter)) {
    const entrypoint = join(directory, "node_modules", "neon", "dist", "cli.js");
    try { await access(entrypoint); return entrypoint; } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    if (process.platform !== "win32") {
      try { return await realpath(join(directory, "neon")); } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      }
    }
  }
  throw new Error("AcademyAdmissionDatabase.authenticate failed: neon_cli_unavailable; set NEON_CLI_PATH or NEON_API_KEY");
}

/**
 * Rejects a branch that is not the uniquely named child created by this run.
 *
 * @param branch - Metadata returned for the candidate branch.
 * @param name - Unpredictable name generated before the create request.
 * @param parentId - Explicit default branch used only as a clone source.
 * @returns Nothing after confirming ownership.
 * @throws When the candidate could be default, unrelated, or ambiguous.
 */
function assertOwnedBranch(branch: NeonBranch, name: string, parentId: string): void {
  if (!branch?.id || branch.id === parentId || branch.name !== name || branch.parent_id !== parentId || branch.default !== false) {
    throw new Error("AcademyAdmissionDatabase.authorize failed: branch_ownership_unproven");
  }
}

/**
 * Runs SQL work on its own Neon branch and deletes that branch on every exit.
 *
 * The existing DATABASE_URL selects database and runtime role names only; its
 * host and credentials are never used for SQL. Every connection URI is fetched
 * explicitly for the new branch. No POST is retried after an uncertain response.
 *
 * @typeParam Result - Value returned by the test workflow.
 * @param run - Workflow receiving only branch-scoped guarded SQL capabilities.
 * @param options - Optional explicit HTTP authorization, transport, and role selection.
 * @returns The workflow's result after confirmed deletion of the owned branch.
 * @throws When authorization, setup, SQL, or cleanup fails; causes remain private.
 */
export async function withAcademyAdmissionDatabase<Result>(
  run: (database: AcademyAdmissionTestDatabase) => Promise<Result>,
  options: AcademyAdmissionDatabaseOptions = {},
): Promise<Result> {
  let selection = options.databaseSelection;
  if (!selection) {
    loadEnvConfig(process.cwd());
    const runtimeConfiguration = new URL(getServerDatabaseEnvironment().connectionString);
    selection = {
      roleName: decodeURIComponent(runtimeConfiguration.username),
      databaseName: decodeURIComponent(runtimeConfiguration.pathname.slice(1)),
    };
  }
  const { roleName, databaseName } = selection;
  const adminFetch = options.fetch ?? globalThis.fetch;
  const projectPath = `/projects/${ADMISSION_NEON_PROJECT_ID}`;

  /**
   * Calls the official Admin API with a bounded request and no raw diagnostics.
   *
   * @typeParam Data - Consumed provider response type, without schema revalidation.
   * @param path - Project-scoped API path constructed by this harness.
   * @param init - Method and body for the explicit administrative operation.
   * @returns The consumed response payload kept within this private boundary.
   * @throws A safe HTTP status or the real transport cause, never a provider body.
   */
  async function adminRequest<Data>(path: string, init?: RequestInit): Promise<Data> {
    const authorization = options.authorization ?? await readNeonAuthorization();
    const response = await adminFetch(`https://console.neon.tech/api/v2${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${authorization}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(NEON_ADMIN_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`AcademyAdmissionDatabase.admin failed: HTTP ${response.status}`);
    return response.json() as Promise<Data>;
  }

  const project = await adminRequest<{ project: { id: string; name: string } }>(projectPath);
  if (project.project.id !== ADMISSION_NEON_PROJECT_ID || project.project.name !== "TuTribu") {
    throw new Error("AcademyAdmissionDatabase.authorize failed: project_mismatch");
  }
  const existing = await adminRequest<{ branches: NeonBranch[] }>(`${projectPath}/branches`);
  const parent = existing.branches.find((branch) => branch.default);
  if (!parent) throw new Error("AcademyAdmissionDatabase.create failed: default_branch_unknown");
  const name = `codex-academy-admissions-${randomUUID()}`;
  let ownedBranch: NeonBranch | undefined;
  let pool: ReturnType<typeof createPostgresPool> | undefined;
  let workError: unknown;
  let didWorkFail = false;
  let result: Result | undefined;

  try {
    try {
      const created = await adminRequest<{ branch: NeonBranch }>(`${projectPath}/branches`, {
        method: "POST",
        body: JSON.stringify({ branch: { name, parent_id: parent.id, init_source: "parent-data" }, endpoints: [{ type: "read_write" }] }),
      });
      assertOwnedBranch(created.branch, name, parent.id);
      ownedBranch = created.branch;
    } catch (error) {
      // Reconcile by the exact unique name before cleanup; never retry the POST.
      let afterCreate: { branches: NeonBranch[] };
      try {
        afterCreate = await adminRequest<{ branches: NeonBranch[] }>(`${projectPath}/branches`);
      } catch (reconciliationError) {
        throw Object.assign(new AggregateError(
          [error, reconciliationError],
          `AcademyAdmissionDatabase.create failed: uncertain_branch_creation branchName=${name}`,
          { cause: error },
        ), {
          code: "neon_branch_creation_unknown",
          branchName: name,
          parentId: parent.id,
        });
      }
      const candidates = afterCreate.branches.filter((branch) => branch.name === name);
      if (candidates.length === 1) {
        assertOwnedBranch(candidates[0], name, parent.id);
        ownedBranch = candidates[0];
      }
      throw error;
    }

    const query = new URLSearchParams({ branch_id: ownedBranch.id, database_name: databaseName, role_name: roleName, pooled: "true" });
    const connection = await adminRequest<{ uri: string }>(`${projectPath}/connection_uri?${query}`);
    const branchConnection = new URL(connection.uri);
    branchConnection.searchParams.set("sslmode", "verify-full");
    pool = createPostgresPool({ connectionString: branchConnection.toString(), operation: "academy_admission_validation" });
    const runtimeMetadata = await pool.query<{ name: string; bypassesRls: boolean; isSuperuser: boolean }>(
      'select rolname as name, rolbypassrls as "bypassesRls", rolsuper as "isSuperuser" from pg_roles where rolname = current_user',
    );
    const runtimeRole = runtimeMetadata.rows[0];
    const nonBypassName = `admission_test_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`create role "${nonBypassName}" nologin nosuperuser nobypassrls`);
    await pool.query(`grant "${nonBypassName}" to current_user`);
    await pool.query(`grant usage on schema public to "${nonBypassName}"`);
    const nonBypassMetadata = await pool.query<{ name: string; bypassesRls: boolean; isSuperuser: boolean }>(
      'select rolname as name, rolbypassrls as "bypassesRls", rolsuper as "isSuperuser" from pg_roles where rolname = $1', [nonBypassName],
    );
    const nonBypassRole = nonBypassMetadata.rows[0];
    if (!runtimeRole || !nonBypassRole || nonBypassRole.bypassesRls || nonBypassRole.isSuperuser) {
      throw new Error("AcademyAdmissionDatabase.prepare failed: role_metadata_unproven");
    }
    const branchPool = pool;

    const database: AcademyAdmissionTestDatabase = {
      branch: { id: ownedBranch.id, name, parentId: parent.id, isDefault: false },
      runtimeRole,
      nonBypassRole,
      /**
       * Runs a request using the existing guarded checkout and local role/context.
       *
       * @param context - Synthetic account context for this transaction only.
       * @param statements - Database-only work; external RPCs belong outside it.
       * @param role - Runtime or the temporary role without RLS bypass.
       * @returns The transaction's committed result, or its original failure.
       */
      withContext(context, statements, role = "runtime") {
        return runWithGuardedTransaction(branchPool, statements, async (transaction) => {
          if (role === "non_bypass") await transaction.execute(sql.raw(`set local role "${nonBypassName}"`));
          await transaction.execute(sql`select set_config('app.current_user_id', ${context.userId ?? ""}, true)`);
          await transaction.execute(sql`select set_config('app.current_user_email', ${context.email ?? ""}, true)`);
        });
      },
      /**
       * Executes the real versioned artifact exclusively on the owned branch.
       *
       * @param fileName - Basename of a SQL artifact under database/migrations.
       * @returns Nothing after committing the artifact's database effects.
       * @throws When the name, SQL, or guarded transaction fails.
       */
      async applyMigration(fileName) {
        if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(fileName)) throw new Error("AcademyAdmissionDatabase.migrate failed: invalid_artifact_name");
        const artifact = await readFile(join(process.cwd(), "database", "migrations", fileName), "utf8");
        await runWithGuardedTransaction(branchPool, async (transaction) => { await transaction.execute(sql.raw(artifact)); });
      },
      /**
       * Grants only explicitly selected tables to the branch's non-bypass role.
       *
       * @param tableNames - Trusted test table names in the public schema.
       * @returns Nothing after applying the minimum table privileges.
       * @throws When an identifier or the branch-local grant fails.
       */
      async grantTablesToNonBypass(tableNames) {
        for (const tableName of tableNames) {
          if (!/^[a-z_]+$/.test(tableName)) throw new Error("AcademyAdmissionDatabase.grant failed: invalid_table_name");
          await branchPool.query(`grant select, insert, update, delete on table public."${tableName}" to "${nonBypassName}"`);
        }
      },
    };
    result = await run(database);
  } catch (error) {
    didWorkFail = true;
    workError = error;
  }

  const cleanupErrors: unknown[] = [];
  try { await pool?.end(); } catch (error) { cleanupErrors.push(error); }
  if (ownedBranch) {
    try {
      assertOwnedBranch(ownedBranch, name, parent.id);
      await adminRequest(`${projectPath}/branches/${ownedBranch.id}`, { method: "DELETE" });
      const remaining = await adminRequest<{ branches: NeonBranch[] }>(`${projectPath}/branches`);
      if (remaining.branches.some((branch) => branch.id === ownedBranch.id)) throw new Error("AcademyAdmissionDatabase.cleanup failed: branch_still_present");
    } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw new AggregateError([...(didWorkFail ? [workError] : []), ...cleanupErrors], `AcademyAdmissionDatabase.cleanup failed: owned_resource_cleanup_incomplete branchId=${ownedBranch?.id ?? "unknown"}`);
  if (didWorkFail) throw workError;
  return result as Result;
}

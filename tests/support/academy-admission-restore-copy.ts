/** Restores only a uniquely owned leaf copy from its owned fixture parent, with real guarded PostgreSQL access. @module academy-admission-restore-copy */
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { runWithGuardedTransaction, type RequestDatabase, type RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { confirmOwnedBranchRemoval } from "./confirm-owned-branch-removal";
import {
  ADMISSION_RESTORE_COPY_NAME_PREFIX, ADMISSION_RESTORE_COPY_TTL_MS, ADMISSION_RESTORE_OPERATION_TIMEOUT_MS,
  ADMISSION_RESTORE_OPERATION_POLL_MS, ADMISSION_RESTORE_OPERATION_STATUS, ADMISSION_RESTORE_ERROR_CODE,
  ADMISSION_RESTORE_DATABASE_OPERATION, ADMISSION_RESTORE_COPY_RECEIPT_PHASE, ADMISSION_RESTORE_COPY_WORKFLOW_ID,
  type AdmissionRestoreErrorCode,
} from "./constants/academy-admission-restore-copy";

/** Consumes only metadata required to fence an already owned branch. */
type Branch = { id: string; name: string; parent_id: string; default?: boolean };
/** Consumes only the asynchronous operation identity and terminal discriminator. */
type Operation = { id: string; status: string };
/** Uses the existing private administrative transport, including its authentication and request deadline. */
export type AdmissionRestoreAdminRequest = <Data>(path: string, init?: RequestInit) => Promise<Data>;
/** Exposes branch facts and guarded SQL, never a connection string or administrative capability. */
export type AcademyAdmissionRestoreCopy = {
  branch: { id: string; name: string; parentId: string; isDefault: false };
  withContext: <Result>(context: RequestDatabaseContext, run: (database: RequestDatabase) => Promise<Result>, role?: "runtime" | "non_bypass") => Promise<Result>;
  restoreFromParent: () => Promise<void>;
};

/** Carries safe fixture context while preserving the private original failure as cause. */
export class AcademyAdmissionRestoreError extends Error {
  readonly branchName?: string;
  readonly parentId?: string;
  /** @param code - Stable safe failure code. @param operation - Owned fixture action. @param branchId - Safe resource identity when known. @param cause - Private original error, never a public DTO. @param scope - Exact generated identity retained for uncertain creation reconciliation. */
  constructor(readonly code: AdmissionRestoreErrorCode, readonly operation: string, readonly branchId?: string, cause?: unknown, scope?: { branchName: string; parentId: string }) {
    super(`AcademyAdmissionRestoreCopy.${operation} failed: ${code}`, { cause });
    this.name = "AcademyAdmissionRestoreError";
    this.branchName = scope?.branchName; this.parentId = scope?.parentId;
  }
}

/**
 * Runs one restore-capable child under the live parent's private capability.
 * The caller must keep the parent checkpoint unchanged until this callback returns.
 * No migration/seed API is exposed: both schema and synthetic rows are already copied.
 * @typeParam Result - Workflow result after confirmed child cleanup.
 * @param input - Exact owned source, private administrative transport and database/role selection.
 * @param run - Bounded database-only workflow whose drivers must stop before restore.
 * @returns The workflow result after the exact child is removed.
 * @throws AcademyAdmissionRestoreError when scope, operation, SQL or cleanup cannot be confirmed.
 */
export async function withAcademyAdmissionRestoreCopy<Result>(input: {
  projectId: string; source: Branch; databaseName: string; roleName: string; nonBypassRoleName: string;
  requestAdmin: AdmissionRestoreAdminRequest;
}, run: (copy: AcademyAdmissionRestoreCopy) => Promise<Result>): Promise<Result> {
  const { source, requestAdmin } = input;
  const projectPath = `/projects/${encodeURIComponent(input.projectId)}`;
  const name = `${ADMISSION_RESTORE_COPY_NAME_PREFIX}${randomUUID()}`;
  let owned: Branch | undefined;
  let pool: ReturnType<typeof createPostgresPool> | undefined;
  let activeSql = 0, restoring = false, closed = false;
  let result: Result | undefined, workError: unknown, failed = false;

  /** @param branch - Current provider facts. @param expected - Independently known own identity. @returns Nothing after exact ownership is proven. */
  const assertOwned = (branch: Branch | null | undefined, expected: Branch): void => {
    if (!branch?.id || !expected.id || branch.id !== expected.id || branch.name !== expected.name || branch.parent_id !== expected.parent_id || branch.default !== false || branch.id === branch.parent_id) {
      throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.ownershipUnproven, "authorize", expected.id);
    }
  };
  /** @param branch - Independently known own identity. @returns Its current exact metadata before administrative work. */
  const readOwned = async (branch: Branch): Promise<Branch> => {
    const current = await requestAdmin<{ branch: Branch }>(`${projectPath}/branches/${encodeURIComponent(branch.id)}`);
    assertOwned(current.branch, branch);
    return current.branch;
  };
  /** @param operations - Actual operation references returned by a single mutation. @returns Nothing after every operation is terminal without failure. */
  const waitForOperations = async (operations: Operation[]): Promise<void> => {
    const deadline = Date.now() + ADMISSION_RESTORE_OPERATION_TIMEOUT_MS;
    for (const original of operations) {
      let current = original;
      while (current.status !== ADMISSION_RESTORE_OPERATION_STATUS.finished && current.status !== ADMISSION_RESTORE_OPERATION_STATUS.skipped) {
        if (current.status === ADMISSION_RESTORE_OPERATION_STATUS.failed || current.status === ADMISSION_RESTORE_OPERATION_STATUS.error || current.status === ADMISSION_RESTORE_OPERATION_STATUS.cancelled) {
          throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.operationFailed, "wait", owned?.id);
        }
        if (Date.now() >= deadline) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.timeout, "wait", owned?.id);
        await delay(ADMISSION_RESTORE_OPERATION_POLL_MS);
        current = (await requestAdmin<{ operation: Operation }>(`${projectPath}/operations/${encodeURIComponent(current.id)}`)).operation;
        if (Date.now() >= deadline) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.timeout, "wait", owned?.id);
      }
    }
  };
  /** @returns A fresh pool exclusively for the current owned child, after its copied role is checked. */
  const connect = async (): Promise<ReturnType<typeof createPostgresPool>> => {
    if (!owned) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.closed, "connect");
    await readOwned(owned);
    const query = new URLSearchParams({ branch_id: owned.id, database_name: input.databaseName, role_name: input.roleName, pooled: "true" });
    const connection = await requestAdmin<{ uri: string }>(`${projectPath}/connection_uri?${query}`);
    const uri = new URL(connection.uri); uri.searchParams.set("sslmode", "verify-full");
    const candidate = createPostgresPool({ connectionString: uri.toString(), operation: ADMISSION_RESTORE_DATABASE_OPERATION });
    try {
      const role = (await candidate.query<{ bypass: boolean; superuser: boolean }>("select rolbypassrls as bypass,rolsuper as superuser from pg_roles where rolname=$1", [input.nonBypassRoleName])).rows[0];
      if (!role || role.bypass || role.superuser) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.ownershipUnproven, "copied_role", owned.id);
      return candidate;
    } catch (error) { await candidate.end(); throw error; }
  };

  try {
    assertOwned(source, source);
    await readOwned(source);
    try {
      const created = await requestAdmin<{ branch: Branch; operations: Operation[] }>(`${projectPath}/branches`, {
        method: "POST", body: JSON.stringify({ branch: { name, parent_id: source.id, init_source: "parent-data", expires_at: new Date(Date.now() + ADMISSION_RESTORE_COPY_TTL_MS).toISOString() }, endpoints: [{ type: "read_write" }] }),
      });
      const expected = { id: created.branch.id, name, parent_id: source.id, default: false };
      assertOwned(created.branch, expected); owned = created.branch;
      const receipt = { phase: ADMISSION_RESTORE_COPY_RECEIPT_PHASE, workflow: ADMISSION_RESTORE_COPY_WORKFLOW_ID, projectId: input.projectId, branch: { id: owned.id, name, parentId: source.id, isDefault: false } };
      await appendFile(join(process.cwd(), "tests", "support", ".academy-admission-branches.log"), `${JSON.stringify(receipt)}\n`, "utf8");
      console.info(JSON.stringify(receipt));
      await waitForOperations(created.operations);
    } catch (error) {
      if (!owned) {
        let branches: { branches: Branch[] };
        try { branches = await requestAdmin(`${projectPath}/branches`); }
        catch (reconciliationError) {
          throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.creationUnknown, "create", undefined,
            new AggregateError([error, reconciliationError], "Owned restore-copy creation and reconciliation could not be confirmed", { cause: error }), { branchName: name, parentId: source.id });
        }
        const matches = branches.branches.filter((branch) => branch.name === name);
        if (matches.length === 1) {
          const candidate = matches[0]; assertOwned(candidate, { ...candidate, name, parent_id: source.id, default: false }); owned = candidate;
        }
      }
      throw error;
    }
    pool = await connect();
    const copy: AcademyAdmissionRestoreCopy = {
      branch: { id: owned.id, name, parentId: source.id, isDefault: false },
      /** @param context - Current synthetic actor. @param statements - Database-only work. @param role - Runtime or copied role without RLS bypass. @returns Its confirmed transaction result. */
      async withContext(context, statements, role = "runtime") {
        if (closed || restoring || !pool) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.closed, "query", owned?.id);
        activeSql += 1;
        try {
          return await runWithGuardedTransaction(pool, statements, async (transaction) => {
            if (role === "non_bypass") await transaction.execute(sql.raw(`set local role "${input.nonBypassRoleName.replaceAll('"', '""')}"`));
            await transaction.execute(sql`select set_config('app.current_user_id',${context.userId ?? ""},true)`);
            await transaction.execute(sql`select set_config('app.current_user_email',${context.email ?? ""},true)`);
          });
        } finally { activeSql -= 1; }
      },
      /** @returns Nothing after one reset to the unchanged own parent and a fresh checked connection. @throws When SQL is active, ownership changed, or the mutation is uncertain/failed. */
      async restoreFromParent() {
        if (closed || !pool) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.closed, "restore", owned?.id);
        if (restoring || activeSql) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.busy, "restore", owned?.id);
        restoring = true;
        try {
          await readOwned(source); await readOwned(owned!);
          const branches = await requestAdmin<{ branches: Branch[] }>(`${projectPath}/branches`);
          if (branches.branches.some((branch) => branch.parent_id === owned!.id)) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.ownershipUnproven, "restore_children", owned!.id);
          await pool.end(); pool = undefined;
          const restored = await requestAdmin<{ branch: Branch; operations: Operation[] }>(`${projectPath}/branches/${encodeURIComponent(owned!.id)}/restore`, { method: "POST", body: JSON.stringify({ source_branch_id: source.id }) });
          assertOwned(restored.branch, owned!);
          await waitForOperations(restored.operations);
          pool = await connect();
        } catch (error) { closed = true; throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.operationFailed, "restore", owned?.id, error); }
        finally { restoring = false; }
      },
    };
    result = await run(copy);
  } catch (error) { failed = true; workError = error; }
  closed = true;
  const cleanupErrors: unknown[] = [];
  try { await pool?.end(); } catch (error) { cleanupErrors.push(error); }
  if (owned) {
    try {
      await readOwned(owned);
      const branchId = owned.id;
      await confirmOwnedBranchRemoval(() => requestAdmin(`${projectPath}/branches/${encodeURIComponent(branchId)}`, { method: "DELETE" }), async () => {
        const remaining = await requestAdmin<{ branches: Branch[] }>(`${projectPath}/branches`);
        return remaining.branches.some((branch) => branch.id === branchId);
      });
    } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.cleanupIncomplete, "cleanup", owned?.id, new AggregateError([...(failed ? [workError] : []), ...cleanupErrors], "AcademyAdmissionRestore.cleanup failed: cleanup_incomplete"), { branchName: name, parentId: source.id });
  if (failed) throw new AcademyAdmissionRestoreError(ADMISSION_RESTORE_ERROR_CODE.setupFailed, "run", owned?.id, workError, { branchName: name, parentId: source.id });
  return result as Result;
}

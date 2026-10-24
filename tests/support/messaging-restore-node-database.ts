/** Adapts only the exact injected host pool; no connection, migration or branch API crosses this port. */
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { prepareRequestDatabaseContext, runWithGuardedTransaction, type RequestDatabase, type RequestDatabaseContext } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MESSAGING_RESTORE_NODE_HOST } from "./constants/messaging-restore-node-host";

/** Keeps the ordinary copied role explicit for the real recovery permission checks. */
export type MessagingRestoreNodeDatabase = {
  withContext: <Result>(context: RequestDatabaseContext, run: (database: RequestDatabase) => Promise<Result>, role?: "runtime" | "non_bypass") => Promise<Result>;
};

/** @param pool - Real exact-branch pool, selected after capability and branch checks. @param nonBypassRoleName - Copied synthetic role, never a role supplied by an HTTP caller. @returns Guarded native transactions with shared request-context cleanup. */
export function createMessagingRestoreNodeDatabase(pool: Pool, nonBypassRoleName: string): MessagingRestoreNodeDatabase {
  if (!MESSAGING_RESTORE_NODE_HOST.nonBypassRolePattern.test(nonBypassRoleName)) throw new Error("MessagingRestoreNodeDatabase.prepare failed: synthetic_role_required");
  return {
    withContext(context, run, role = "runtime") {
      return runWithGuardedTransaction(pool, run, async (transaction) => {
        if (role === "non_bypass") await transaction.execute(sql.raw(`set local role "${nonBypassRoleName}"`));
        await prepareRequestDatabaseContext(transaction, context);
      });
    },
  };
}

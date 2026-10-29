import type { SQL } from "drizzle-orm";

import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";

/** Runs a callback with the request-scoped database, so RLS stays the authorization boundary. */
export type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type BooleanResultRow = {
  result: boolean | null;
};

/**
 * Runs a query that selects a single boolean column named `result`.
 *
 * @param executeWithDatabase - Request-scoped database executor.
 * @param query - Query selecting `... as result`.
 * @returns The selected value, or false when no row or a null value is returned.
 */
export async function selectBooleanResult(
  executeWithDatabase: DatabaseExecutor,
  query: SQL
): Promise<boolean> {
  return executeWithDatabase(async (database) => {
    const result = await database.execute(query);

    return Boolean(
      ((result.rows[0] ?? null) as BooleanResultRow | null)?.result
    );
  });
}

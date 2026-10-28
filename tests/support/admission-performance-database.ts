/** Adapts an actual runtime pool to the portable workload without replacing database or auth SDKs. */
import type { Pool } from "pg";
import { createPostgresDatabaseClient } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionPerformanceDatabase } from "./run-admission-performance-workload";
import { readPostgresTestDiagnostics, type PostgresTestDiagnostics } from "./postgres-test-diagnostics";

/** @param pool - Real target-owned pool. @returns Native execution and observed pool events; no network is opened by this adapter. */
export function createAdmissionPerformanceDatabase(pool: Pool): AdmissionPerformanceDatabase {
  const client = createPostgresDatabaseClient(pool);
  const observed = { acquisitions: 0, releases: 0, errorReleases: 0, removals: 0, lastErrorRelease: null as PostgresTestDiagnostics | null };
  pool.on("acquire", () => { observed.acquisitions += 1; });
  pool.on("release", (error: Error | undefined) => { observed.releases += 1; if (error) { observed.errorReleases += 1; observed.lastErrorRelease = readPostgresTestDiagnostics(error); } });
  pool.on("remove", () => { observed.removals += 1; });
  return {
    withContext: (context, run) => client.withRequestContext(context, run),
    readPoolMetrics: () => ({ maximum: pool.options.max, totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount, ...observed }),
  };
}

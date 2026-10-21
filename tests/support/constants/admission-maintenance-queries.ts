/** Bounds the native admission maintenance query measurement and its regression budget. @module admission-maintenance-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const ADMISSION_MAINTENANCE_QUERY_VALIDATION = {
  maintenancePath: "/api/maintenance/admission-messaging",
  /** A completed run answers 200 and an incomplete one 503; busy (202) never happens in this single-process scenario and fails the suite. */
  maintenanceStatuses: [200, 503],
  /** Run outcomes that measured every phase; busy, unresolved and error DTOs are rejected. */
  measuredRunStatuses: ["completed", "incomplete"],
  timeoutMs: 1_200_000,
  reportEnvironmentVariable: "ADMISSION_MAINTENANCE_QUERY_REPORT",
} as const;

/** Per-invocation maxima from the baseline on 1acd4ead: the largest sample of each label, plus two statements and two round trips of headroom. A change that adds transactions, statements or sequential round trips fails here. */
export const ADMISSION_MAINTENANCE_QUERY_BUDGET = {
  maintenance_with_new_request: { transactions: 22, queries: 180, sequentialRoundTrips: 180 },
  maintenance_idle: { transactions: 23, queries: 187, sequentialRoundTrips: 187 },
} as const satisfies Record<string, AdmissionRequestBudget>;

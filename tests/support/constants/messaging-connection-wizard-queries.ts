/** Bounds the native messaging connection wizard query measurement and its regression budget. @module messaging-connection-wizard-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const MESSAGING_CONNECTION_WIZARD_QUERY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  timeoutMs: 1_200_000,
  reportEnvironmentVariable: "MESSAGING_CONNECTION_WIZARD_QUERY_REPORT",
} as const;

/** Per-request maxima from the measurement of the reused human and worker messaging authority (specs/001-academy-admissions/validation/messaging-wizard-authority-queries.md): the measured transactions, and the largest sample of statements and sequential round trips plus two of headroom for pool warm-up. A change that adds transactions, statements or sequential round trips fails here. */
export const MESSAGING_CONNECTION_WIZARD_QUERY_BUDGET = {
  initialize_usage_policy: { transactions: 5, queries: 57, sequentialRoundTrips: 57 },
  create_connection: { transactions: 5, queries: 62, sequentialRoundTrips: 62 },
  configure_connection: { transactions: 10, queries: 318, sequentialRoundTrips: 318 },
  validate_connection: { transactions: 12, queries: 381, sequentialRoundTrips: 381 },
  issue_diagnostic: { transactions: 15, queries: 370, sequentialRoundTrips: 365 },
  verify_diagnostic: { transactions: 4, queries: 197, sequentialRoundTrips: 197 },
  activate_connection: { transactions: 4, queries: 282, sequentialRoundTrips: 282 },
} as const satisfies Record<string, AdmissionRequestBudget>;

/** Bounds the native messaging connection wizard query measurement and its regression budget. @module messaging-connection-wizard-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const MESSAGING_CONNECTION_WIZARD_QUERY_VALIDATION = {
  sessionLifetimeMs: 3_600_000,
  timeoutMs: 1_200_000,
  reportEnvironmentVariable: "MESSAGING_CONNECTION_WIZARD_QUERY_REPORT",
} as const;

/** Per-request maxima from the baseline on 1acd4ead: the largest sample of each label, plus two statements and two round trips of headroom for pool warm-up. A change that adds transactions, statements or sequential round trips fails here. */
export const MESSAGING_CONNECTION_WIZARD_QUERY_BUDGET = {
  initialize_usage_policy: { transactions: 12, queries: 136, sequentialRoundTrips: 136 },
  create_connection: { transactions: 12, queries: 166, sequentialRoundTrips: 166 },
  configure_connection: { transactions: 19, queries: 436, sequentialRoundTrips: 436 },
  validate_connection: { transactions: 23, queries: 449, sequentialRoundTrips: 449 },
  issue_diagnostic: { transactions: 18, queries: 408, sequentialRoundTrips: 403 },
  verify_diagnostic: { transactions: 7, queries: 218, sequentialRoundTrips: 218 },
  activate_connection: { transactions: 7, queries: 356, sequentialRoundTrips: 356 },
} as const satisfies Record<string, AdmissionRequestBudget>;

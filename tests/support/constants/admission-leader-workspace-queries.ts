/** Bounds the native leader workspace query measurement and its regression budget. @module admission-leader-workspace-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const ADMISSION_LEADER_WORKSPACE_QUERY_VALIDATION = {
  timeoutMs: 1_800_000,
  /** Outlives the whole run so no sample measures a signed-out page. */
  sessionExtension: "2 hours",
  reportEnvironmentVariable: "ADMISSION_LEADER_WORKSPACE_QUERY_REPORT",
} as const;

/** Per-request maxima from the baseline on 1acd4ead: the largest sample of each label, plus two statements and two round trips of headroom for pool warm-up. A change that adds transactions, statements or sequential round trips fails here. */
export const ADMISSION_LEADER_WORKSPACE_QUERY_BUDGET = {
  decide_request: { transactions: 5, queries: 78, sequentialRoundTrips: 78 },
  decide_batch: { transactions: 5, queries: 82, sequentialRoundTrips: 82 },
  page_activity: { transactions: 26, queries: 166, sequentialRoundTrips: 156 },
  page_allowlist: { transactions: 17, queries: 198, sequentialRoundTrips: 192 },
  page_allowlist_imports: { transactions: 13, queries: 150, sequentialRoundTrips: 144 },
  page_invitations: { transactions: 24, queries: 242, sequentialRoundTrips: 232 },
  page_request_history: { transactions: 11, queries: 69, sequentialRoundTrips: 59 },
  create_allowlist_entry: { transactions: 7, queries: 110, sequentialRoundTrips: 110 },
  update_allowlist_entry: { transactions: 7, queries: 115, sequentialRoundTrips: 115 },
  preview_allowlist_import: { transactions: 7, queries: 111, sequentialRoundTrips: 111 },
  confirm_allowlist_import: { transactions: 11, queries: 244, sequentialRoundTrips: 244 },
  create_invitation: { transactions: 7, queries: 112, sequentialRoundTrips: 112 },
  rename_invitation: { transactions: 7, queries: 113, sequentialRoundTrips: 113 },
  revoke_invitation: { transactions: 7, queries: 114, sequentialRoundTrips: 114 },
  save_email_settings: { transactions: 7, queries: 136, sequentialRoundTrips: 136 },
  save_notification_preference: { transactions: 5, queries: 39, sequentialRoundTrips: 39 },
  initialize_usage_policy: { transactions: 12, queries: 137, sequentialRoundTrips: 137 },
  save_usage_policy: { transactions: 12, queries: 147, sequentialRoundTrips: 147 },
  pause_policy: { transactions: 7, queries: 81, sequentialRoundTrips: 81 },
} as const satisfies Record<string, AdmissionRequestBudget>;

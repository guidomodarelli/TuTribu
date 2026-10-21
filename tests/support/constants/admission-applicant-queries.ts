/** Bounds the native applicant query measurement and its regression budget. @module admission-applicant-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const ADMISSION_APPLICANT_QUERY_VALIDATION = {
  codePolls: 80,
  codePollMs: 250,
  timeoutMs: 1_800_000,
  reportEnvironmentVariable: "ADMISSION_APPLICANT_QUERY_REPORT",
} as const;

/** Per-request maxima from the baseline on 1acd4ead: the largest sample of each label, plus two statements and two round trips of headroom for pool warm-up. A change that adds transactions, statements or sequential round trips fails here. */
export const ADMISSION_APPLICANT_QUERY_BUDGET = {
  page_public_entry: { transactions: 6, queries: 37, sequentialRoundTrips: 37 },
  page_invitation_entry: { transactions: 6, queries: 56, sequentialRoundTrips: 56 },
  read_invitation_overview: { transactions: 6, queries: 56, sequentialRoundTrips: 56 },
  issue_verification_code: { transactions: 23, queries: 454, sequentialRoundTrips: 449 },
  verify_verification_code: { transactions: 10, queries: 192, sequentialRoundTrips: 192 },
  submit_request: { transactions: 4, queries: 82, sequentialRoundTrips: 82 },
  redeem_invitation: { transactions: 4, queries: 91, sequentialRoundTrips: 91 },
  read_own_request: { transactions: 5, queries: 30, sequentialRoundTrips: 30 },
  page_own_request: { transactions: 0, queries: 4, sequentialRoundTrips: 4 },
} as const satisfies Record<string, AdmissionRequestBudget>;

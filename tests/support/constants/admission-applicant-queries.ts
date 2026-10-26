/** Bounds the native applicant query measurement and its regression budget. @module admission-applicant-queries-constants */
import type { AdmissionRequestBudget } from "../admission-request-measurement";

export const ADMISSION_APPLICANT_QUERY_VALIDATION = {
  codePolls: 80,
  codePollMs: 250,
  timeoutMs: 1_800_000,
  reportEnvironmentVariable: "ADMISSION_APPLICANT_QUERY_REPORT",
} as const;

/** Per-request maxima after the applicant authority reuse and the worker messaging authority reuse (see `specs/001-academy-admissions/validation/admission-applicant-flow-queries.md` and `messaging-delivery-authority-queries.md`): the largest sample of each label, plus two statements and two round trips of headroom for pool warm-up. A change that adds transactions, statements or sequential round trips fails here. */
export const ADMISSION_APPLICANT_QUERY_BUDGET = {
  page_public_entry: { transactions: 1, queries: 22, sequentialRoundTrips: 22 },
  page_invitation_entry: { transactions: 1, queries: 40, sequentialRoundTrips: 40 },
  read_invitation_overview: { transactions: 1, queries: 39, sequentialRoundTrips: 39 },
  issue_verification_code: { transactions: 17, queries: 260, sequentialRoundTrips: 255 },
  verify_verification_code: { transactions: 5, queries: 102, sequentialRoundTrips: 102 },
  submit_request: { transactions: 3, queries: 79, sequentialRoundTrips: 79 },
  redeem_invitation: { transactions: 3, queries: 89, sequentialRoundTrips: 89 },
  read_own_request: { transactions: 2, queries: 21, sequentialRoundTrips: 21 },
  page_own_request: { transactions: 0, queries: 4, sequentialRoundTrips: 4 },
} as const satisfies Record<string, AdmissionRequestBudget>;

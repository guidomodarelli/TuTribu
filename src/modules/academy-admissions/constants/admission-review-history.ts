/** Owns the closed request-history vocabulary separately from general audit authority. @module admission-review-history-constants */
import type { AdmissionReviewHistoryActorKind, AdmissionReviewHistoryEventKind } from "../domain/entities/admission-review-history-event";
import { ADMISSION_REQUEST_EVENT } from "./admission-request";
import { ADMISSION_PROOF_AUDIT_EVENT } from "./admission-proof";
import { ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT } from "./admission-activity";

/** Only request-owned producer facts become named timeline events. */
export const ADMISSION_REVIEW_HISTORY_EVENT = {
  pendingCreated: ADMISSION_REQUEST_EVENT.pendingCreated, proofAttached: ADMISSION_PROOF_AUDIT_EVENT,
  approved: ADMISSION_REQUEST_EVENT.approved, rejected: ADMISSION_REQUEST_EVENT.rejected,
  cancelled: ADMISSION_REQUEST_EVENT.cancelled, expired: ADMISSION_REQUEST_EVENT.expired,
  retryAllowed: "retry_allowed", unclassified: ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT,
} as const satisfies Readonly<Record<string, AdmissionReviewHistoryEventKind>>;
/** Labels never reveal the historical actor's internal account identifier. */
export const ADMISSION_REVIEW_HISTORY_ACTOR = { account: "account", unattributed: "unattributed" } as const satisfies Readonly<Record<string, AdmissionReviewHistoryActorKind>>;

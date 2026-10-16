/** Describes retained request facts without contact, private notes, provider payload or identity credentials. @module admission-review-history-event */
import type { AdmissionRequest } from "./admission-request";

/** Unknown retained producer labels are represented by a safe recorded event. */
export type AdmissionReviewHistoryEventKind = "pending_created" | "proof_attached" | "approved" | "rejected" | "cancelled" | "expired" | "retry_allowed" | "unclassified";
/** An absent reference can reflect erasure or a process; it never proves an automated action. */
export type AdmissionReviewHistoryActorKind = "account" | "unattributed";
/** Every retained item remains bound to one request and tribe until application projection. */
export type AdmissionReviewHistoryEvent = {
  id: string; tribeId: string; admissionRequestId: string; eventType: AdmissionReviewHistoryEventKind;
  fromStatus: AdmissionRequest["status"] | null; toStatus: AdmissionRequest["status"] | null;
  resourceVersion: number | null; actorKind: AdmissionReviewHistoryActorKind; createdAt: Date;
};

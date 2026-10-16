/** Owns bounded history reads independently of SQL, HTTP and general administrative audit. @module admission-review-history-reader */
import type { AdmissionCommandScope } from "./admission-repositories";
import type { AdmissionReviewHistoryEvent } from "../entities/admission-review-history-event";

/** The exact SQL tuple is retained separately from the rounded display timestamp. */
export type AdmissionReviewHistoryFilters = { limit: number; cursor?: { at: string; id: string } };
/** This port cannot decide, grant membership, dispatch or read the tribe's complete audit. */
export interface AdmissionReviewHistoryReader {
  /** @param scope - Actual native account/session and selected tribe. @param admissionRequestId - One explicit scoped request. @param filters - Bounded selection and original tuple. @returns Retained facts and continuation, after current authority and its access fact. */
  readHistory(scope: AdmissionCommandScope, admissionRequestId: string, filters: AdmissionReviewHistoryFilters): Promise<{ records: readonly AdmissionReviewHistoryEvent[]; nextCursor: string | null }>;
}

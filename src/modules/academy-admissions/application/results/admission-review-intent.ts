/** Keeps the reviewer's immutable original selection separate from current resource snapshots. @module admission-review-intent */
import type { AdmissionBrowserDecision, AdmissionBrowserDecisionConfirmation } from "../ports/admission-review-browser-client";
import { ADMISSION_BATCH_DECISION_OPERATION } from "../../constants/admission-batch-decision";

/** Preserves the existing single-request browser record. */
export type AdmissionReviewIntent = { requestId: string; input: AdmissionBrowserDecision };
/** Names the explicit original rows without making their labels a source of authority. */
export type AdmissionBatchReviewSelection = { requestId: string; expectedVersion: number; applicantName: string };
/** A local original does not assert that the server registered or completed its operation. */
export type AdmissionBatchReviewIntent = { kind: "decide_admission_requests_batch"; selection: AdmissionBatchReviewSelection[]; input: AdmissionBrowserDecisionConfirmation };
/** One account/tribe slot prevents concurrent individual and batch recovery workflows. */
export type AdmissionStoredReviewIntent = AdmissionReviewIntent | AdmissionBatchReviewIntent;

/** @param intent - A validated original browser record. @returns Whether this original belongs to the batch namespace. */
export function isAdmissionBatchReviewIntent(intent: AdmissionStoredReviewIntent): intent is AdmissionBatchReviewIntent { return "kind" in intent && intent.kind === ADMISSION_BATCH_DECISION_OPERATION; }

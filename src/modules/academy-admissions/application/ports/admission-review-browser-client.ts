/** Owns reviewer transport contracts without native role/session or infrastructure DTOs. @module admission-review-browser-client */
import type { AdmissionBrowserClient, AdmissionBrowserResult, AdmissionStartedResponse } from "./admission-browser-client";
import type { AdmissionBatchResultDto, AdmissionReviewDto } from "../results/admission-flow-result-schemas";
import type { z } from "zod";
import type { admissionReviewPageSchema } from "../results/admission-review-page-result";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";
import type { AdmissionReviewSelection } from "../results/admission-review-selection";

/** Explicit confirmation and original version/key survive transport uncertainty unchanged. */
export type AdmissionBrowserDecisionConfirmation = { operationId: string; confirmed: true; decision: "approve" | "reject"; internalReason: string; externalMessage?: string };
/** Individual and batch commands share confirmation metadata, never an implicit row selection. */
export type AdmissionBrowserDecision = AdmissionBrowserDecisionConfirmation & { expectedVersion: number };
/** Each explicit row retains the version the reviewer actually selected. */
export type AdmissionBrowserBatchDecision = AdmissionBrowserDecisionConfirmation & { items: { requestId: string; expectedVersion: number }[] };
/** The route container owns current-account checks, reads and mutation recovery. */
export interface AdmissionReviewBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "operation"> {
  reviewList(slug: string, cursor: string | null, signal: AbortSignal, filters?: AdmissionReviewSelection): Promise<AdmissionBrowserResult<z.infer<typeof admissionReviewPageSchema>>>;
  reviewDetail(slug: string, requestId: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionReviewDto>>;
  decide(slug: string, requestId: string, input: AdmissionBrowserDecision, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionTransitionResult | AdmissionStartedResponse>>;
  /** Executes only the immutable explicit selection; started work has no confirmed row effect yet. */
  decideBatch(slug: string, input: AdmissionBrowserBatchDecision, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionBatchResultDto>>;
}

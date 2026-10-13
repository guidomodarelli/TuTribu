/** Owns reviewer transport contracts without native role/session or infrastructure DTOs. @module admission-review-browser-client */
import type { AdmissionBrowserClient, AdmissionBrowserResult, AdmissionStartedResponse } from "./admission-browser-client";
import type { AdmissionReviewDto } from "../results/admission-flow-result-schemas";
import type { z } from "zod";
import type { admissionReviewPageSchema } from "../results/admission-review-page-result";
import type { AdmissionTransitionResult } from "@/src/modules/academy-admissions/domain/repositories/admission-repositories";

/** Explicit confirmation and original version/key survive transport uncertainty unchanged. */
export type AdmissionBrowserDecision = { operationId: string; confirmed: true; expectedVersion: number; decision: "approve" | "reject"; internalReason: string; externalMessage?: string };
/** The route container owns current-account checks, reads and mutation recovery. */
export interface AdmissionReviewBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "operation"> {
  reviewList(slug: string, cursor: string | null, signal: AbortSignal): Promise<AdmissionBrowserResult<z.infer<typeof admissionReviewPageSchema>>>;
  reviewDetail(slug: string, requestId: string, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionReviewDto>>;
  decide(slug: string, requestId: string, input: AdmissionBrowserDecision, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionTransitionResult | AdmissionStartedResponse>>;
}

/** Owns the browser reads and decisions of the commercial membership review without provider DTOs or client authority. @module commercial-membership-review-browser-client */
import type { AdmissionBrowserClient, AdmissionBrowserResult } from "./admission-browser-client";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { CommercialMembershipExpectedState, CommercialMembershipResolutionResult, CommercialMembershipReviewList } from "../../domain/entities/commercial-membership-review";
import type { CommercialMembershipDecision } from "../../constants/commercial-membership-review";

/** One confirmed decision sent with the original operation id and the facts the leader saw. */
export type CommercialMembershipResolutionBrowserInput = { operationId: string; confirmed: true; decision: CommercialMembershipDecision; expected: CommercialMembershipExpectedState; reason: string | null };

export interface CommercialMembershipReviewBrowserClient extends Pick<AdmissionBrowserClient, "viewer" | "operation"> {
  readCommercialReviews(slug: string, signal: AbortSignal): Promise<AdmissionBrowserResult<CommercialMembershipReviewList>>;
  resolveCommercialReview(slug: string, memberId: string, input: CommercialMembershipResolutionBrowserInput, signal: AbortSignal): Promise<AdmissionBrowserResult<AdmissionOperationResult<CommercialMembershipResolutionResult>>>;
}

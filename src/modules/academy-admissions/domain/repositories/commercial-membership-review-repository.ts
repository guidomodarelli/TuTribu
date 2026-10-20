/** Declares the tribes-owned reader and writer of the leader's audited commercial membership review. @module commercial-membership-review-repository */
import type { AuthorizedAdmissionContext } from "./admission-authorization-reader";
import type { AdmissionOperationResult } from "../entities/admission-operation";
import type { CommercialMembershipExpectedState, CommercialMembershipResolutionResult, CommercialMembershipReviewList } from "../entities/commercial-membership-review";
import type { CommercialMembershipDecision } from "../../constants/commercial-membership-review";

/** One confirmed decision bound to its original operation and the membership state the leader saw. */
export type CommercialMembershipResolutionCommand = {
  operationId: string; confirmed: true; memberId: string; decision: CommercialMembershipDecision;
  expected: CommercialMembershipExpectedState; reason: string | null;
};

export interface CommercialMembershipReviewRepository {
  /** @param context - Current leader read scope. @returns Pending cases and the count of recorded decisions, without contact data. */
  read(context: AuthorizedAdmissionContext): Promise<CommercialMembershipReviewList>;
  /** @param context - Current leader with this action's sensitive purpose. @param command - Confirmed decision. @returns The original confirmed result or registered progress. */
  resolve(context: AuthorizedAdmissionContext, command: CommercialMembershipResolutionCommand): Promise<AdmissionOperationResult<CommercialMembershipResolutionResult>>;
}

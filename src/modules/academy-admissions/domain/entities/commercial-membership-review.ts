/** Models the leader's review of memberships blocked by payment whose recovery cannot be decided automatically. @module commercial-membership-review */
import {
  COMMERCIAL_MEMBERSHIP_DECISION, COMMERCIAL_MEMBERSHIP_REVIEW_KIND,
  type CommercialMembershipDecision, type CommercialMembershipRecoveryStatus, type CommercialMembershipRejection, type CommercialMembershipReviewKind,
  type CommercialMembershipReviewRole, type CommercialMembershipReviewStatus, type CommercialMembershipReviewStatusReason,
} from "../../constants/commercial-membership-review";
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";

/** One listed membership with the minimum facts the leader needs to decide; no contact data is included. */
export type CommercialMembershipReviewCase = {
  memberId: string;
  /** Visible account name, or null when the account has none. */
  displayName: string | null;
  role: CommercialMembershipReviewRole;
  status: CommercialMembershipReviewStatus;
  statusReason: CommercialMembershipReviewStatusReason;
  /** Known recovery snapshot; null is unknown history and is never treated as active. */
  recoveryStatus: CommercialMembershipRecoveryStatus | null;
  joinedAt: string;
};

/** Pending cases plus how many decisions this tribe already recorded. */
export type CommercialMembershipReviewList = { cases: CommercialMembershipReviewCase[]; pendingCount: number; resolvedCount: number };

/** The observed membership facts that the decision compares under lock (CAS). */
export type CommercialMembershipExpectedState = Pick<CommercialMembershipReviewCase, "role" | "status" | "statusReason" | "recoveryStatus">;

/** A confirmed prospective decision, as committed by the owner function. */
export type CommercialMembershipResolution = {
  status: "resolved"; memberId: string; decision: CommercialMembershipDecision;
  resultingRole: "tribemate"; resultingStatus: CommercialMembershipReviewStatus | "removed"; resultingRecoveryStatus: CommercialMembershipRecoveryStatus | null; decidedAt: string;
};
/** An expected business rejection, kept as the original result so retries never repeat a different decision. */
export type CommercialMembershipResolutionRejection = { status: "rejected"; memberId: string; reason: CommercialMembershipRejection };
export type CommercialMembershipResolutionResult = CommercialMembershipResolution | CommercialMembershipResolutionRejection;

/**
 * @param item - Listed membership.
 * @returns Why it needs a decision: a guardian role always counts as privileged, otherwise the recovery state is unknown.
 */
export function classifyCommercialMembershipReview(item: Pick<CommercialMembershipReviewCase, "role">): CommercialMembershipReviewKind {
  return item.role === TRIBE_MEMBER_ROLE.guardian ? COMMERCIAL_MEMBERSHIP_REVIEW_KIND.privileged : COMMERCIAL_MEMBERSHIP_REVIEW_KIND.unknownHistory;
}

/**
 * @param item - Listed membership.
 * @returns The decisions the owner accepts for it: a tribemate returns active or muted; a guardian may also be retired.
 */
export function allowedCommercialMembershipDecisions(item: Pick<CommercialMembershipReviewCase, "role">): CommercialMembershipDecision[] {
  const recover: CommercialMembershipDecision[] = [COMMERCIAL_MEMBERSHIP_DECISION.recoverActive, COMMERCIAL_MEMBERSHIP_DECISION.recoverMuted];
  return classifyCommercialMembershipReview(item) === COMMERCIAL_MEMBERSHIP_REVIEW_KIND.privileged ? [...recover, COMMERCIAL_MEMBERSHIP_DECISION.retire] : recover;
}

/** @param item - Listed membership. @returns The CAS facts sent with the decision. */
export function commercialMembershipExpectedState(item: CommercialMembershipReviewCase): CommercialMembershipExpectedState {
  return { role: item.role, status: item.status, statusReason: item.statusReason, recoveryStatus: item.recoveryStatus };
}

/**
 * Derives the member-facing academy status (level, eligibility, renewal and
 * next action) from the authoritative access evaluation. The status never
 * grants anything by itself: consumers still go through the access policy.
 *
 * @module academy-access-status
 */

import {
  ACADEMY_ACCESS_LEVEL,
  ACADEMY_ELIGIBILITY,
  ACADEMY_NEXT_ACTION,
  ACADEMY_RENEWAL_STATUS,
  type AcademyAccessLevel,
  type AcademyEligibility,
  type AcademyNextAction,
  type AcademyRenewalStatus,
} from "@/src/modules/product-access/constants/product-access";
import {
  evaluateAcademyAccess,
  isReadableMembership,
  type AccessGrantInterval,
  type AccessMembershipSnapshot,
} from "@/src/modules/product-access/domain/services/academy-access-policy";

/** Verification states persisted per provider relation. */
export type MemberVerificationState = "pending" | "rejected" | "revoked" | "verified";

export type AcademyAccessSnapshot = {
  firstActivatedAt: Date | null;
  grants: readonly AccessGrantInterval[];
  membership: AccessMembershipSnapshot;
  /** Whether the tribe sells the academy right now (sales + current academy price). */
  offerPurchasable: boolean;
  renewalStatus: AcademyRenewalStatus;
  verificationStates: readonly MemberVerificationState[];
};

export type AcademyAccessStatus = {
  accessEndsAt: Date | null;
  canStartCheckout: boolean;
  eligibility: AcademyEligibility;
  firstActivatedAt: Date | null;
  hasBonusCoverage: boolean;
  hasPaidCoverage: boolean;
  isLeaderPreview: boolean;
  level: AcademyAccessLevel;
  nextAction: AcademyNextAction;
  renewalStatus: AcademyRenewalStatus;
};

const CHECKOUT_BLOCKING_RENEWAL_STATUSES = new Set<AcademyRenewalStatus>([
  ACADEMY_RENEWAL_STATUS.active,
  ACADEMY_RENEWAL_STATUS.canceling,
  ACADEMY_RENEWAL_STATUS.pending,
]);

/**
 * Collapses the verification relations into one eligibility value. One
 * verified relation is enough, even when other relations were revoked.
 *
 * @param states - Verification states of the member in the tribe.
 * @returns Eligibility.
 */
export function resolveAcademyEligibility(
  states: readonly MemberVerificationState[]
): AcademyEligibility {
  if (states.includes("verified")) {
    return ACADEMY_ELIGIBILITY.verified;
  }

  if (states.includes("pending")) {
    return ACADEMY_ELIGIBILITY.pending;
  }

  return states.length > 0 ? ACADEMY_ELIGIBILITY.notVerified : ACADEMY_ELIGIBILITY.notRequested;
}

/**
 * Builds the member-facing academy status.
 *
 * Checkout is only offered to an eligible, readable member without coverage
 * and without a renewal in progress; a bonus still in force hides it.
 *
 * @param snapshot - Access snapshot read by the repository.
 * @param now - Server instant.
 * @returns Member-facing status.
 */
export function buildAcademyAccessStatus(
  snapshot: AcademyAccessSnapshot,
  now: Date
): AcademyAccessStatus {
  const access = evaluateAcademyAccess({
    grants: snapshot.grants,
    membership: snapshot.membership,
    now,
  });
  const hasCoverage = access.hasBonusCoverage || access.hasPaidCoverage;
  const eligibility = resolveAcademyEligibility(snapshot.verificationStates);
  const canStartCheckout =
    isReadableMembership(snapshot.membership) &&
    eligibility === ACADEMY_ELIGIBILITY.verified &&
    snapshot.offerPurchasable &&
    !hasCoverage &&
    !CHECKOUT_BLOCKING_RENEWAL_STATUSES.has(snapshot.renewalStatus);

  return {
    accessEndsAt: hasCoverage ? access.coverageEndsAt : null,
    canStartCheckout,
    eligibility,
    firstActivatedAt: snapshot.firstActivatedAt,
    hasBonusCoverage: access.hasBonusCoverage,
    hasPaidCoverage: access.hasPaidCoverage,
    isLeaderPreview: access.isLeaderPreview,
    level: hasCoverage ? ACADEMY_ACCESS_LEVEL.academy : ACADEMY_ACCESS_LEVEL.basic,
    nextAction: resolveNextAction({
      eligibility,
      hasCoverage,
      isReadable: isReadableMembership(snapshot.membership),
      renewalStatus: snapshot.renewalStatus,
    }),
    renewalStatus: snapshot.renewalStatus,
  };
}

function resolveNextAction({
  eligibility,
  hasCoverage,
  isReadable,
  renewalStatus,
}: {
  eligibility: AcademyEligibility;
  hasCoverage: boolean;
  isReadable: boolean;
  renewalStatus: AcademyRenewalStatus;
}): AcademyNextAction {
  if (!isReadable) {
    return ACADEMY_NEXT_ACTION.contactSupport;
  }

  if (hasCoverage) {
    return ACADEMY_NEXT_ACTION.continueLearning;
  }

  if (renewalStatus === ACADEMY_RENEWAL_STATUS.pending) {
    return ACADEMY_NEXT_ACTION.completeCheckout;
  }

  if (eligibility === ACADEMY_ELIGIBILITY.pending) {
    return ACADEMY_NEXT_ACTION.waitForVerification;
  }

  if (eligibility !== ACADEMY_ELIGIBILITY.verified) {
    return ACADEMY_NEXT_ACTION.requestVerification;
  }

  return ACADEMY_NEXT_ACTION.viewOffer;
}

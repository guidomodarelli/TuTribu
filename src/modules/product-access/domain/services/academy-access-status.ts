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
  ACADEMY_MEMBERSHIP_RECOVERY,
  ACADEMY_NEXT_ACTION,
  ACADEMY_RECOVERABLE_MEMBERSHIP,
  ACADEMY_RENEWAL_STATUS,
  type AcademyAccessLevel,
  type AcademyEligibility,
  type AcademyMembershipRecovery,
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

/** Facts that decide whether an inactive membership can enter the academy again. */
export type AcademyMembershipRecoveryFacts = {
  /** The tribe activated admission control: entries go through an admission request. */
  admissionControlActive: boolean;
  admissionEnabled: boolean;
  /** Readable state captured when the membership became commercial; `null` when unknown. */
  commercialRecoveryStatus: "active" | "muted" | null;
  statusReason: string;
};

export type AcademyAccessSnapshot = {
  firstActivatedAt: Date | null;
  grants: readonly AccessGrantInterval[];
  /** The last recorded invoice of the latest subscription was rejected by the provider. */
  lastPaymentRejected: boolean;
  membership: AccessMembershipSnapshot;
  /** Absent when there is no membership. */
  membershipRecoveryFacts: AcademyMembershipRecoveryFacts | null;
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
  /** The provider rejected the last payment while the member has no coverage. */
  lastPaymentRejected: boolean;
  level: AcademyAccessLevel;
  /** How an inactive membership can enter again, or `null` when it cannot by itself. */
  membershipRecovery: AcademyMembershipRecovery | null;
  nextAction: AcademyNextAction;
  renewalStatus: AcademyRenewalStatus;
};

/** A live renewal (in progress, charging, paused or being canceled) already covers the purchase. */
const CHECKOUT_BLOCKING_RENEWAL_STATUSES = new Set<AcademyRenewalStatus>([
  ACADEMY_RENEWAL_STATUS.active,
  ACADEMY_RENEWAL_STATUS.canceling,
  ACADEMY_RENEWAL_STATUS.paused,
  ACADEMY_RENEWAL_STATUS.pending,
]);

const FREE_JOIN_RECOVERABLE_ROLES: ReadonlySet<string> = new Set(ACADEMY_RECOVERABLE_MEMBERSHIP.freeJoinRoles);

/**
 * Decides how an inactive membership can enter the academy again. Only a
 * membership left inactive by a subscription (blocked for payment, or removed
 * when the subscription ended) is recoverable, and only while admissions are
 * open: before admission control the free join recovers it; afterwards an
 * admission request recovers a tribemate whose state before the block is known
 * (the same rule the admission writer applies).
 *
 * @param membership - Own membership snapshot.
 * @param facts - Reason, recovery state and admission settings.
 * @returns The available entry, or `null`.
 */
export function resolveAcademyMembershipRecovery(
  membership: AccessMembershipSnapshot,
  facts: AcademyMembershipRecoveryFacts | null
): AcademyMembershipRecovery | null {
  if (!membership || !facts || !facts.admissionEnabled || isReadableMembership(membership)) {
    return null;
  }

  const isCommercial = ACADEMY_RECOVERABLE_MEMBERSHIP.commercialStates.some(
    (state) => state.status === membership.status && state.statusReason === facts.statusReason
  );

  if (!isCommercial) {
    return null;
  }

  if (facts.admissionControlActive) {
    return membership.role === ACADEMY_RECOVERABLE_MEMBERSHIP.admissionRequestRole &&
      facts.commercialRecoveryStatus !== null
      ? ACADEMY_MEMBERSHIP_RECOVERY.admissionRequest
      : null;
  }

  return FREE_JOIN_RECOVERABLE_ROLES.has(membership.role) ? ACADEMY_MEMBERSHIP_RECOVERY.freeJoin : null;
}

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
    // A rejection followed by covered access is history: only an uncovered member must act on it.
    lastPaymentRejected: snapshot.lastPaymentRejected && !hasCoverage,
    level: hasCoverage ? ACADEMY_ACCESS_LEVEL.academy : ACADEMY_ACCESS_LEVEL.basic,
    membershipRecovery: resolveAcademyMembershipRecovery(
      snapshot.membership,
      snapshot.membershipRecoveryFacts
    ),
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

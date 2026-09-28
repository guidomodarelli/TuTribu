/**
 * State machine of a member verification relation `(tribe, user, provider)`.
 *
 * ```text
 * none -> pending
 * pending -> verified | rejected
 * verified -> revoked
 * rejected | revoked -> pending (new attempt on the same relation)
 * verified + changed declared data -> pending
 * ```
 *
 * Selecting a provider or opening its link never verifies anything: only a
 * reviewer decision moves a relation to `verified`.
 *
 * @module member-verification-transitions
 */

import {
  MEMBER_VERIFICATION_DECISION,
  MEMBER_VERIFICATION_STATUS,
  type MemberVerificationDecision,
  type MemberVerificationStatus,
} from "@/src/modules/member-verifications/constants/member-verifications";

export type MemberVerificationRequestTransition =
  | { kind: "create" }
  | { kind: "reopen" }
  | { kind: "unchanged" };

export type MemberVerificationReviewTransition =
  | { kind: "apply"; nextStatus: MemberVerificationStatus }
  | { kind: "invalid_transition" }
  | { kind: "reason_required" };

/**
 * Decides what a member request does to the current relation.
 *
 * @param current - Current status, or null when the relation does not exist.
 * @param declaredDataChanged - Whether the member changed the declared data.
 * @returns The transition to persist.
 */
export function resolveVerificationRequestTransition(
  current: MemberVerificationStatus | null,
  declaredDataChanged: boolean
): MemberVerificationRequestTransition {
  if (current === null) {
    return { kind: "create" };
  }

  if (current === MEMBER_VERIFICATION_STATUS.pending) {
    // Resending a pending request is idempotent; edited data stays pending.
    return declaredDataChanged ? { kind: "reopen" } : { kind: "unchanged" };
  }

  if (current === MEMBER_VERIFICATION_STATUS.verified) {
    // Replacing the declared identity drops the verification (AC-06).
    return declaredDataChanged ? { kind: "reopen" } : { kind: "unchanged" };
  }

  return { kind: "reopen" };
}

const REVIEW_TRANSITIONS: Record<
  MemberVerificationDecision,
  { from: MemberVerificationStatus; requiresReason: boolean }
> = {
  [MEMBER_VERIFICATION_DECISION.rejected]: {
    from: MEMBER_VERIFICATION_STATUS.pending,
    requiresReason: true,
  },
  [MEMBER_VERIFICATION_DECISION.revoked]: {
    from: MEMBER_VERIFICATION_STATUS.verified,
    requiresReason: true,
  },
  [MEMBER_VERIFICATION_DECISION.verified]: {
    from: MEMBER_VERIFICATION_STATUS.pending,
    requiresReason: false,
  },
};

/**
 * Validates a reviewer decision against the current status.
 *
 * @param current - Current status of the relation.
 * @param decision - Reviewer decision.
 * @param reason - Normalized reason, or null.
 * @returns The status to persist or why the decision is invalid.
 */
export function resolveVerificationReviewTransition(
  current: MemberVerificationStatus,
  decision: MemberVerificationDecision,
  reason: string | null
): MemberVerificationReviewTransition {
  const rule = REVIEW_TRANSITIONS[decision];

  if (current !== rule.from) {
    return { kind: "invalid_transition" };
  }

  if (rule.requiresReason && !reason) {
    return { kind: "reason_required" };
  }

  return { kind: "apply", nextStatus: decision };
}

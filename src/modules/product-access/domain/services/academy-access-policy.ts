/**
 * Pure academy access policy. It decides whether a member can consume the
 * academy from a minimal snapshot (membership + grants) and an injected clock.
 * Repositories repeat the same rule in SQL (`has_active_product_grant`), so the
 * authoritative decision never depends on React or on cookies.
 *
 * Intervals are half-open `[startsAt, endsAt)`: the start is included and the
 * end is excluded. `endsAt = null` is only produced by preserved legacy grants.
 *
 * @module academy-access-policy
 */

import {
  ACCESS_GRANT_SOURCE_TYPE,
  type AccessGrantSourceType,
} from "@/src/modules/product-access/constants/product-access";

/** Minimal grant data needed to evaluate coverage. */
export type AccessGrantInterval = {
  endsAt: Date | null;
  revokedAt: Date | null;
  sourceType: AccessGrantSourceType;
  startsAt: Date;
};

/** Minimal membership data needed to evaluate access. */
export type AccessMembershipSnapshot = {
  role: string;
  status: string;
} | null;

/** Continuous coverage that contains the evaluated instant. */
export type ContinuousCoverage = {
  covered: boolean;
  /** Exclusive end of the continuous union; `null` when unbounded or uncovered. */
  endsAt: Date | null;
};

export type AcademyAccessEvaluation = {
  canConsume: boolean;
  coverageEndsAt: Date | null;
  hasBonusCoverage: boolean;
  hasPaidCoverage: boolean;
  isLeaderPreview: boolean;
};

const READABLE_MEMBERSHIP_STATUSES = new Set(["active", "muted"]);
const LEADER_ROLE = "leader";
const ACTIVE_STATUS = "active";

/**
 * Whether a single grant covers the instant.
 *
 * @param grant - Grant interval.
 * @param now - Server instant.
 * @returns True when the grant is not revoked and `startsAt <= now < endsAt`.
 */
export function isGrantActiveAt(grant: AccessGrantInterval, now: Date): boolean {
  if (grant.revokedAt !== null) {
    return false;
  }

  const instant = now.getTime();

  return (
    grant.startsAt.getTime() <= instant &&
    (grant.endsAt === null || instant < grant.endsAt.getTime())
  );
}

/**
 * Resolves the continuous union of intervals that covers `now`. Overlapping or
 * adjacent intervals chain; a gap stops the chain, so a later period never
 * bridges an uncovered window (never `MAX(ends_at)`).
 *
 * @param grants - Candidate grants.
 * @param now - Server instant.
 * @returns Whether `now` is covered and the exclusive end of that coverage.
 */
export function resolveContinuousCoverage(
  grants: readonly AccessGrantInterval[],
  now: Date
): ContinuousCoverage {
  const liveGrants = grants.filter((grant) => grant.revokedAt === null);

  if (!liveGrants.some((grant) => isGrantActiveAt(grant, now))) {
    return { covered: false, endsAt: null };
  }

  let coverageEnd = now.getTime();
  let extended = true;

  while (extended) {
    extended = false;

    for (const liveGrant of liveGrants) {
      if (liveGrant.startsAt.getTime() > coverageEnd) {
        continue;
      }

      if (liveGrant.endsAt === null) {
        return { covered: true, endsAt: null };
      }

      if (liveGrant.endsAt.getTime() > coverageEnd) {
        coverageEnd = liveGrant.endsAt.getTime();
        extended = true;
      }
    }
  }

  return { covered: true, endsAt: new Date(coverageEnd) };
}

/**
 * Whether the membership still allows reading tribe content. Blocked, removed,
 * or missing memberships never read, whatever the grants say.
 *
 * @param membership - Membership snapshot.
 * @returns True for `active` and `muted` memberships.
 */
export function isReadableMembership(membership: AccessMembershipSnapshot): boolean {
  return membership !== null && READABLE_MEMBERSHIP_STATUSES.has(membership.status);
}

/**
 * Whether the membership is an active leader, the only role with an
 * administrative preview of the academy.
 *
 * @param membership - Membership snapshot.
 * @returns True for an active leader.
 */
export function isActiveLeader(membership: AccessMembershipSnapshot): boolean {
  return membership?.role === LEADER_ROLE && membership.status === ACTIVE_STATUS;
}

/**
 * Evaluates academy access: readable membership AND at least one grant active
 * now. The active leader preview is reported separately and is not a grant.
 *
 * @param input - Membership, grants and server clock.
 * @returns Access evaluation.
 */
export function evaluateAcademyAccess({
  grants,
  membership,
  now,
}: {
  grants: readonly AccessGrantInterval[];
  membership: AccessMembershipSnapshot;
  now: Date;
}): AcademyAccessEvaluation {
  if (!isReadableMembership(membership)) {
    return {
      canConsume: false,
      coverageEndsAt: null,
      hasBonusCoverage: false,
      hasPaidCoverage: false,
      isLeaderPreview: false,
    };
  }

  const activeGrants = grants.filter((grant) => isGrantActiveAt(grant, now));
  const coverage = resolveContinuousCoverage(grants, now);
  const isLeaderPreview = !coverage.covered && isActiveLeader(membership);

  return {
    canConsume: coverage.covered || isLeaderPreview,
    coverageEndsAt: coverage.endsAt,
    hasBonusCoverage: activeGrants.some(
      (grant) => grant.sourceType === ACCESS_GRANT_SOURCE_TYPE.manualBonus
    ),
    hasPaidCoverage: activeGrants.some(
      (grant) => grant.sourceType !== ACCESS_GRANT_SOURCE_TYPE.manualBonus
    ),
    isLeaderPreview,
  };
}

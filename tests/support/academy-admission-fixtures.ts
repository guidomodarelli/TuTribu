/**
 * Builds deterministic, synthetic admission facts without global clocks or secrets.
 *
 * @module academy-admission-fixtures
 */
import { createHash } from "node:crypto";

import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
} from "@/src/modules/tribes/constants/tribe-page-access";

/** Keeps a synthetic readable state separate from historical unknown recovery. */
type RecoveryStatus = "active" | "muted" | null;
type MemberRole = (typeof TRIBE_MEMBER_ROLE)[keyof typeof TRIBE_MEMBER_ROLE];
type MembershipStatus = (typeof TRIBE_MEMBERSHIP_STATUS)[keyof typeof TRIBE_MEMBERSHIP_STATUS];
type MembershipReason = (typeof TRIBE_MEMBERSHIP_STATUS_REASON)[keyof typeof TRIBE_MEMBERSHIP_STATUS_REASON];

/**
 * Builds isolated actors, policy snapshots, resources, and an authoritative clock.
 *
 * Identifiers are stable within the supplied seed. Contacts use reserved test
 * domains; no credential, invitation URL, session token, or JWT is stored here.
 * These are inputs to behavior tests, never evidence of product capabilities.
 *
 * @param seed - Unique scenario namespace, reusable for deterministic identifiers.
 * @param initialTime - Starting time whose value is copied, never retained by reference.
 * @returns Fresh synthetic facts and a clock independent of every other scenario.
 */
export function createAcademyAdmissionFixtures(
  seed: string,
  initialTime = new Date("2026-10-05T12:00:00.000Z"),
) {
  let clockTime = initialTime.getTime();

  /**
   * Derives a UUID-shaped fixture identifier from its scenario namespace.
   *
   * @param resource - Resource label scoped by the supplied scenario seed.
   * @returns A stable synthetic identifier accepted by UUID database columns.
   */
  function identifier(resource: string): string {
    const digest = createHash("sha256").update(`${seed}:${resource}`).digest("hex");
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  }

  /**
   * Builds one account with a reserved synthetic email and no provider credential.
   *
   * @param label - Human-readable synthetic actor within the scenario.
   * @returns Detached account facts with no tokens or secrets.
   */
  function account(label: string) {
    const userId = identifier(`user:${label}`);
    return { userId, accountId: identifier(`account:${label}`), providerSubject: `synthetic-${userId}`, email: `${label}-${userId}@example.invalid` };
  }

  const accounts = {
    applicantA: account("applicant-a"),
    applicantB: account("applicant-b"),
    leaderA: account("leader-a"),
    leaderB: account("leader-b"),
    guardian: account("guardian"),
    active: account("member-active"),
    muted: account("member-muted"),
    commercialActive: account("commercial-active"),
    commercialMuted: account("commercial-muted"),
    commercialUnknown: account("commercial-unknown"),
    conductBlocked: account("conduct-blocked"),
    removedGuardian: account("removed-guardian"),
    removedLeader: account("removed-leader"),
    removedMember: account("removed-member"),
  };
  const tribes = {
    academyA: { id: identifier("tribe:a"), slug: `admission-a-${identifier("tribe:a")}`, leaderUserId: accounts.leaderA.userId },
    academyB: { id: identifier("tribe:b"), slug: `admission-b-${identifier("tribe:b")}`, leaderUserId: accounts.leaderB.userId },
    legacy: { id: identifier("tribe:legacy"), slug: `admission-legacy-${identifier("tribe:legacy")}`, leaderUserId: accounts.leaderA.userId },
  };

  /**
   * Builds an alternative membership case without deriving historical recovery.
   *
   * @param owner - Synthetic account owning this alternative membership.
   * @param role - Role to preserve while evaluating the scenario.
   * @param status - Current readable, commercial, or moderation state.
   * @param statusReason - Existing reason discriminating commercial restrictions.
   * @param commercialRecoveryStatus - Known readable snapshot, or explicit unknown.
   * @returns One alternative scenario; privileged historical rows are not a seed batch.
   */
  function membership(
    owner: { userId: string }, role: MemberRole, status: MembershipStatus,
    statusReason: MembershipReason = TRIBE_MEMBERSHIP_STATUS_REASON.none,
    commercialRecoveryStatus: RecoveryStatus = null,
  ) {
    return { id: identifier(`membership:${owner.userId}`), tribeId: tribes.academyA.id, userId: owner.userId, role, status, statusReason, commercialRecoveryStatus, createdAt: new Date(initialTime.getTime()) };
  }

  const memberships = {
    leader: membership(accounts.leaderA, TRIBE_MEMBER_ROLE.leader, TRIBE_MEMBERSHIP_STATUS.active),
    guardian: membership(accounts.guardian, TRIBE_MEMBER_ROLE.guardian, TRIBE_MEMBERSHIP_STATUS.active),
    active: membership(accounts.active, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.active),
    muted: membership(accounts.muted, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.muted),
    commercialActive: membership(accounts.commercialActive, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.removed, TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive, TRIBE_MEMBERSHIP_STATUS.active),
    commercialMuted: membership(accounts.commercialMuted, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.blocked, TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked, TRIBE_MEMBERSHIP_STATUS.muted),
    commercialUnknown: membership(accounts.commercialUnknown, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.removed, TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive),
    conductBlocked: membership(accounts.conductBlocked, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.blocked, TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked),
    removedGuardian: membership(accounts.removedGuardian, TRIBE_MEMBER_ROLE.guardian, TRIBE_MEMBERSHIP_STATUS.removed, TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive, TRIBE_MEMBERSHIP_STATUS.active),
    removedLeader: membership(accounts.removedLeader, TRIBE_MEMBER_ROLE.leader, TRIBE_MEMBERSHIP_STATUS.removed, TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive, TRIBE_MEMBERSHIP_STATUS.active),
    removedMember: membership(accounts.removedMember, TRIBE_MEMBER_ROLE.tribemate, TRIBE_MEMBERSHIP_STATUS.removed),
  };
  const policy = {
    id: identifier("policy:a"), tribeId: tribes.academyA.id,
    mode: "manual_review" as "manual_review" | "allowlist",
    contactType: "email" as "email" | "phone",
    isOpen: false, allowCommonExceptions: false,
    requiresAdditionalVerification: false, verificationEpoch: 1, version: 1,
  };

  return {
    accounts, tribes, memberships,
    policies: {
      manualEmailOff: { ...policy },
      manualPhoneOff: { ...policy, contactType: "phone" as const },
      allowlistEmailOff: { ...policy, mode: "allowlist" as const },
      invalidAllowlistPhoneOff: { ...policy, mode: "allowlist" as const, contactType: "phone" as const },
    },
    usagePolicy: { id: identifier("usage:a"), tribeId: tribes.academyA.id, allowedCountries: [] as string[], version: 1 },
    allowlistEntry: { id: identifier("allowlist:a"), tribeId: tribes.academyA.id, contactType: "email" as const, normalizedContact: accounts.applicantA.email, status: "enabled" as const, version: 1 },
    invitation: { id: identifier("invitation:a"), tribeId: tribes.academyA.id, contactType: "email" as const, normalizedContact: accounts.applicantA.email, requiresAllowlist: true, status: "active" as const, expiresAt: null as Date | null, version: 1 },
    clock: {
      /**
       * Returns a detached authoritative time for the current scenario.
       *
       * @returns A fresh Date that cannot mutate the stored scenario time.
       */
      now() { return new Date(clockTime); },
      /**
       * Advances only this scenario's time by the requested milliseconds.
       *
       * @param milliseconds - Time delta without touching global timers.
       * @returns Nothing after updating the scenario's private clock.
       */
      advance(milliseconds: number) { clockTime += milliseconds; },
    },
  };
}

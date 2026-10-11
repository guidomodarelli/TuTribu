/** Owns protected membership regressions across the real paid entrypoints. @module academy-membership-lifecycle-test-constants */
import { TRIBE_MEMBER_ROLE } from "@/src/modules/tribes/constants/tribe-member-role";
import { SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT, type SubscriptionReconciliationEntrypoint } from "./subscription-membership-reconciliation";

/** Keeps roles and nullable commercial history explicit in the regression contract. */
export type ProtectedMembershipLifecycleCase = { entrypoint: SubscriptionReconciliationEntrypoint; role: "leader" | "guardian" | "tribemate"; historyKnown: boolean };

/** Exercises both privileged roles and unknown basic history through every actual entrypoint. */
export const PROTECTED_MEMBERSHIP_LIFECYCLE_CASES = [
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, role: TRIBE_MEMBER_ROLE.leader, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, role: TRIBE_MEMBER_ROLE.leader, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member, role: TRIBE_MEMBER_ROLE.leader, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, role: TRIBE_MEMBER_ROLE.guardian, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, role: TRIBE_MEMBER_ROLE.guardian, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member, role: TRIBE_MEMBER_ROLE.guardian, historyKnown: true },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.price, role: TRIBE_MEMBER_ROLE.tribemate, historyKnown: false },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.diagnostics, role: TRIBE_MEMBER_ROLE.tribemate, historyKnown: false },
  { entrypoint: SUBSCRIPTION_MEMBERSHIP_ENTRYPOINT.member, role: TRIBE_MEMBER_ROLE.tribemate, historyKnown: false },
] as const satisfies readonly ProtectedMembershipLifecycleCase[];

/** Connects actual membership-owner events to request closure within the same transaction. @module admission-membership-lifecycle-writer */

/** These private facts originate in the locked membership row and its confirmed owner action. */
export type AdmissionMembershipLifecycleEvent = { tribeId: string; userId: string; memberId: string; kind: "left" | "removed" | "conduct_blocked" };

/** Rechecks the actual stored membership and stages a safe system terminal decision when required. */
export interface AdmissionMembershipLifecycleWriter {
  /** @param event - Actual owner mutation in its original transaction. @returns After any live pending closure and its decision/audit/notice have been staged. */
  reconcile(event: AdmissionMembershipLifecycleEvent): Promise<void>;
}

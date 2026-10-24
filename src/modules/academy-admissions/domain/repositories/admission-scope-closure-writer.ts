/** Defines admission retirement inside the owning tribe lifecycle transaction. @module admission-scope-closure-writer */

/** The event comes from an authorized owner mutation, never from a browser permission or reason. */
export type AdmissionScopeClosureEvent = { tribeId: string; reason: "academy_unavailable" | "tribe_deleted" };
/** Preserves membership and consumed provenance while retiring pending admission authority. */
export interface AdmissionScopeClosureWriter {
  /** @param event - Exact locked owner scope and committed lifecycle intent. @returns After pending/invitation/proof/send retirement is staged without provider calls. */
  close(event: AdmissionScopeClosureEvent): Promise<void>;
}

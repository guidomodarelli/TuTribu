/** Defines a receipt-scoped collaborator for an owner's original membership transaction. @module admission-external-resolution-writer */

/** Stored paid provenance fixes the tenant/account; these fields are never browser authority. */
export type PaidAdmissionResolutionScope = { membershipEffectId: string; tribeId: string; userId: string };

/** Resolves a pending request without adding a membership, grant or outbound message. */
export interface AdmissionExternalResolutionWriter {
  resolvePaidMembership(scope: PaidAdmissionResolutionScope): Promise<void>;
}

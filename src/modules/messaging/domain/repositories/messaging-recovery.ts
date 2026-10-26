/** Describes an explicit private recovery scope without hosting material or restored authority. @module messaging-recovery-port */

/** Binds the operator's original and replacement external epochs to one affected tribe. */
export type MessagingRecoveryCommand = {
  tribeId: string;
  environment: string;
  securityEpoch: string;
  sourceSecurityEpoch: string;
  limit: number;
};

/** Reports only confirmed effects; remaining work never authorizes reopening or another batch. */
export type MessagingRecoveryResult = {
  policyClosed: boolean;
  connectionsSuspended: number;
  candidateSlotsReleased: number;
  versionsRetired: number;
  secretsRetired: number;
  proofsInvalidated: number;
  challengesInvalidated: number;
  queuedDeliveriesCancelled: number;
  remaining: boolean;
};

/** Leaves backend authority, live recovery control, storage and commit uncertainty with the private owner. */
export interface MessagingRecovery {
  /** @param command - Explicit current external scope and bounded effects per resource family. @returns Only committed counts; never releases the external recovery lock. */
  reconcile(command: MessagingRecoveryCommand): Promise<MessagingRecoveryResult>;
  /** @param command - Same operator-owned scope. @returns Current remaining work without replaying a mutation or claiming its historical counts. */
  inspect(command: MessagingRecoveryCommand): Promise<{ remaining: boolean }>;
}

/** Keeps admission-owned effects in the original recovery transaction without exposing SQL to the domain. */
export interface MessagingRecoveryAdmissionEffects {
  /** @param command - Current exact private recovery scope. @returns Confirmed staging counts; the caller owns commit and post-await recovery checks. */
  reconcile(command: MessagingRecoveryCommand): Promise<Pick<MessagingRecoveryResult, "policyClosed" | "proofsInvalidated" | "challengesInvalidated">>;
  /** @param command - Same current scope. @returns Whether admission-owned invalidation or closure remains. */
  hasWork(command: MessagingRecoveryCommand): Promise<boolean>;
}

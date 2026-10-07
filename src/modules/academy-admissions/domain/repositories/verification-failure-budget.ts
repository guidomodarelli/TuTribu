/**
 * Defines the admission-owned port for account-wide failure accounting in the caller's transaction.
 * @module verification-failure-budget-port
 */
import type { VerificationChallengeScope } from "@/src/modules/academy-admissions/domain/entities/contact-verification-challenge";

/** Records a failed validation without a code, MAC, contact, credential or provider payload. */
export type VerificationFailureIdentity = Pick<VerificationChallengeScope, "userId" | "tribeId" | "purpose" | "channel"> & {
  challengeId: string;
  operationId: string;
};

/** The caller owns its operation ledger and must bind operationId to the exact original intent. */
export interface VerificationFailureBudget {
  /** Retains the shared account lock through the caller's commit or rollback. */
  lockAccount(userId: string): Promise<void>;
  /** Recovers only an authorized original failure, without exposing its private event data. */
  readRecordedFailure(identity: VerificationFailureIdentity): Promise<"absent" | "recorded" | "conflict">;
  /** Evaluates both windows against a database clock sampled after preceding waits. */
  hasCapacity(userId: string, now: Date): Promise<boolean>;
  /** Inserts consumption once, atomically with the challenge's counted failure. */
  recordFailure(identity: VerificationFailureIdentity, now: Date): Promise<boolean>;
}

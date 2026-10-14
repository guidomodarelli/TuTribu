/** Defines one atomic private batch for abandoned candidates, retired credentials and recoverable OTP bytes. @module messaging-secret-retention */
import type { MessagingCandidateExpirationResult } from "./messaging-candidate-expiration";

/** Bounds independent owners without exposing connection filters or private key material. */
export type MessagingSecretRetentionCommand = { candidateLimit: number; retiredSecretLimit: number; verificationLimit: number };
/** Contains confirmed effects only; a zero count does not certify that all other maintenance is complete. */
export type MessagingSecretRetentionResult = { candidates: MessagingCandidateExpirationResult; retiredSecretsPurged: number; verificationMaterialPurged: number };

/** Preserves lifecycle references, code validity and charged history when bytes are destroyed. */
export interface MessagingSecretRetention {
  /** @param command - Fixed backend ceilings for the three owners. @returns Counts after the entire batch commits. */
  purge(command: MessagingSecretRetentionCommand): Promise<MessagingSecretRetentionResult>;
}

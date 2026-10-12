/** Orchestrates one bounded candidate-retirement batch through its private domain port. @module expire-messaging-candidates-use-case */
import type { MessagingCandidateExpiration, MessagingCandidateExpirationResult } from "../../domain/repositories/messaging-candidate-expiration";
import { MessagingCandidateExpirationError } from "../../domain/errors/messaging-candidate-expiration-error";
import { MESSAGING_CANDIDATE_MAINTENANCE } from "../../constants/messaging-candidate-expiration";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";

/** Leaves SQL time, authority, recovery and atomic effects to the owning port. */
export class ExpireMessagingCandidatesUseCase {
  /** @param expiration - Explicit backend owner; no provider or credential fallback is created. */
  constructor(private readonly expiration: MessagingCandidateExpiration) {}

  /** @param input - Optional bounded backend batch size. @returns Counts after a confirmed commit only. @throws MessagingCandidateExpirationError for invalid input or an unconfirmed owner operation. */
  async execute(input: { limit?: number } = {}): Promise<MessagingCandidateExpirationResult> {
    const limit = input.limit ?? MESSAGING_CANDIDATE_MAINTENANCE.defaultBatchSize;
    if (!Number.isInteger(limit) || limit < 1 || limit > MESSAGING_CANDIDATE_MAINTENANCE.maximumBatchSize) throw new MessagingCandidateExpirationError(MESSAGING_ERROR_CODE.invalidInput);
    return this.expiration.expire({ limit });
  }
}
